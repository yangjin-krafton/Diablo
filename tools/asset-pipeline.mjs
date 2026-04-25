#!/usr/bin/env node
/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║  Diablo Asset Generation Pipeline                            ║
 * ║  ComfyUI: Text → Image → GLB → Game Resource                 ║
 * ╚═══════════════════════════════════════════════════════════════╝
 *
 * RTX 5080 16GB 안전 운영:
 *   - Phase 분리 (text2img 모두 완료 → img2glb)
 *   - 배치 간 /free API 호출로 VRAM 정리
 *   - checkpoint 저장으로 중단/재시작 지원
 *
 * Diablo 프로젝트는 src/asset/models/{player,enemy,npc}/ 로 모델을
 * 분리 보관하므로, 프롬프트 엔트리의 category 필드를 보고 최종 GLB를
 * 해당 서브폴더로 복사한다.
 *
 * 사용법:
 *   node tools/asset-pipeline.mjs                    # 전체 실행
 *   node tools/asset-pipeline.mjs --phase 1          # 이미지만
 *   node tools/asset-pipeline.mjs --phase 2          # GLB만
 *   node tools/asset-pipeline.mjs --ids id1,id2      # 특정 항목만
 *   node tools/asset-pipeline.mjs --category enemy   # 카테고리 필터
 *   node tools/asset-pipeline.mjs --retry-failed     # 실패 재시도
 *   node tools/asset-pipeline.mjs --reset            # checkpoint 전체 초기화
 *   node tools/asset-pipeline.mjs --reset-phase2     # GLB만 재생성 (이미지 보존)
 */

import { readFile, writeFile, mkdir, copyFile, rm, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const execFileAsync = promisify(execFile);

// ─── 설정 ───────────────────────────────────────────────────
const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? fallback);
}

const CONFIG = {
  comfyUrl:       flag('comfy-url', 'http://100.66.10.225:8188'),
  phase:          flag('phase', 'all'),           // '1', '2', 'all'
  ids:            flag('ids', ''),                 // 'id1,id2,...' or ''
  categoryFilter: flag('category', ''),            // 'player' | 'enemy' | 'npc' | ''
  retryFailed:    args.includes('--retry-failed'),
  reset:          args.includes('--reset'),
  resetPhase2:    args.includes('--reset-phase2'),
  imgBatchSize:   Number(flag('img-batch', '10')),
  glbBatchSize:   Number(flag('glb-batch', '3')),
  killWorkerCmd:  flag('kill-cmd', 'wsl docker restart comfyui'),
  pollInterval:   2000,
  pollTimeout:    600000,                          // 10분 (TRELLIS.2 GLB 소요)
  cooldownMs:     3000,
  maxRetries:     3,
  vramThreshold:  0.80,
  optimizeGlb:    !args.includes('--no-glb-optimize'),
  glbCompress:    flag('glb-compress', 'meshopt'),
  glbTextureFormat: flag('glb-texture-format', 'webp'),
  glbTextureSize: Number(flag('glb-texture-size', '1024')),
  glbSimplify:    args.includes('--glb-simplify'),
};

const PROMPTS_PATH    = resolve(__dirname, 'product-prompts.json');
const CHECKPOINT_PATH = resolve(__dirname, 'pipeline-checkpoint.json');
const IMG_DIR         = resolve(__dirname, 'generated-img');
const GLB_DIR         = resolve(__dirname, 'generated-glb');
const MODELS_ROOT     = resolve(__dirname, '../src/asset/models');
const TEXT2IMG_PATH   = resolve(__dirname, 'text2img.json');
const IMG2GLB_PATH    = resolve(__dirname, 'MeshWithTexturing_LowPoly.json');

const VALID_CATEGORIES = new Set(['player', 'enemy', 'boss', 'npc', 'building', 'planet', 'pickup', 'item']);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function categoryDir(category) {
  if (!VALID_CATEGORIES.has(category)) {
    throw new Error(`알 수 없는 category: "${category}" (player/enemy/npc 중 하나)`);
  }
  return resolve(MODELS_ROOT, category);
}

// ─── ComfyUI API ────────────────────────────────────────────

async function comfyFetch(path, options = {}) {
  const url = `${CONFIG.comfyUrl}${path}`;
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`ComfyUI ${res.status}: ${path}`);
  return res;
}

async function queuePrompt(workflow) {
  const res = await comfyFetch('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: 'diablo-asset-pipeline' }),
  });
  const data = await res.json();
  return data.prompt_id;
}

async function waitForCompletion(promptId) {
  const start = Date.now();
  while (Date.now() - start < CONFIG.pollTimeout) {
    await sleep(CONFIG.pollInterval);
    try {
      const res = await comfyFetch(`/history/${promptId}`);
      const data = await res.json();
      const entry = data[promptId];
      if (!entry) continue;

      if (entry.status?.status_str === 'error') {
        const msgs = entry.status?.messages || [];
        const errMsg = msgs.find(m => m[0] === 'execution_error');
        const detail = errMsg ? errMsg[1].exception_message?.split('\n')[0] : 'unknown';
        throw new Error(`ComfyUI 오류 [${errMsg?.[1]?.node_type || '?'}]: ${detail}`);
      }

      if (entry.status?.completed && entry.outputs) return entry.outputs;
      if (entry.outputs && Object.keys(entry.outputs).length > 0 && entry.status?.status_str === 'success') {
        return entry.outputs;
      }
    } catch (e) {
      if (e.message.includes('ComfyUI 오류')) throw e;
    }
  }
  throw new Error(`타임아웃: ${promptId} (${CONFIG.pollTimeout / 1000}초)`);
}

async function downloadOutput(filename, subfolder, type, destPath) {
  const params = new URLSearchParams({ filename, subfolder: subfolder || '', type: type || 'output' });
  const res = await comfyFetch(`/view?${params}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buffer);
  return destPath;
}

async function optimizeGLB(sourcePath, targetPath) {
  if (!CONFIG.optimizeGlb) {
    await copyFile(sourcePath, targetPath);
    return false;
  }

  const tmpPath = `${targetPath}.tmp`;
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const optimizeArgs = [
    '--yes',
    '@gltf-transform/cli@4.3.0',
    'optimize',
    sourcePath,
    tmpPath,
    '--compress',
    CONFIG.glbCompress,
    '--texture-compress',
    CONFIG.glbTextureFormat,
    '--texture-size',
    String(CONFIG.glbTextureSize),
    '--simplify',
    CONFIG.glbSimplify ? 'true' : 'false',
  ];

  try {
    await execFileAsync(npx, optimizeArgs, {
      cwd: __dirname,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    await copyFile(tmpPath, targetPath);
    await rm(tmpPath, { force: true });
    return true;
  } catch (e) {
    await rm(tmpPath, { force: true });
    console.warn(`   [WARN] GLB optimize failed, keeping original: ${e.message.split('\n')[0]}`);
    await copyFile(sourcePath, targetPath);
    return false;
  }
}

async function freeVRAM() {
  try {
    await comfyFetch('/free', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
    console.log('   🧹 VRAM 정리 완료');
    await sleep(CONFIG.cooldownMs);
  } catch (e) {
    console.warn(`   ⚠️  VRAM 정리 실패: ${e.message}`);
  }
}

async function getVRAMUsage() {
  try {
    const res = await comfyFetch('/system_stats');
    const data = await res.json();
    const device = data.devices?.[0];
    if (!device) return 0;
    const used = device.vram_total - device.vram_free;
    return used / device.vram_total;
  } catch {
    return 0;
  }
}

async function ensureVRAM() {
  const usage = await getVRAMUsage();
  if (usage > CONFIG.vramThreshold) {
    console.log(`   ⚠️  VRAM ${(usage * 100).toFixed(0)}% 사용 중 → 정리`);
    await freeVRAM();
  }
}

// eslint-disable-next-line no-unused-vars
async function restartComfyUI() {
  console.log('   🔄 ComfyUI 재시작 중...');
  try {
    execSync(CONFIG.killWorkerCmd, { timeout: 30000, stdio: 'pipe' });
  } catch (e) {
    console.warn(`   ⚠️  재시작 명령 실패: ${e.message.slice(0, 60)}`);
    return;
  }
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    try {
      const res = await comfyFetch('/system_stats');
      const stats = await res.json();
      const dev = stats.devices?.[0];
      if (dev) {
        console.log(`   🔄 ComfyUI 재시작 완료 (VRAM: ${(dev.vram_free / 1024**3).toFixed(1)}GB 여유)`);
        return;
      }
    } catch { /* 부팅 대기 */ }
  }
  console.warn('   ⚠️  ComfyUI 재시작 타임아웃 (90초)');
}

// ─── Checkpoint 관리 ────────────────────────────────────────

async function loadCheckpoint() {
  try {
    return JSON.parse(await readFile(CHECKPOINT_PATH, 'utf-8'));
  } catch {
    return { phase1: {}, phase2: {}, completed: [] };
  }
}

async function saveCheckpoint(cp) {
  await writeFile(CHECKPOINT_PATH, JSON.stringify(cp, null, 2), 'utf-8');
}

// ─── Phase 1: Text → Image ─────────────────────────────────

async function runPhase1(products, checkpoint) {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  Phase 1: Text → Image                ║');
  console.log('╚═══════════════════════════════════════╝');

  const workflow = JSON.parse(await readFile(TEXT2IMG_PATH, 'utf-8'));
  await mkdir(IMG_DIR, { recursive: true });

  let count = 0;
  let success = 0;
  let sinceLastFree = 0;

  for (const product of products) {
    count++;
    const { id, prompt } = product;

    if (checkpoint.phase1[id] === 'done') {
      console.log(`   [${count}/${products.length}] ${id} — 이미 완료, 건너뜀`);
      continue;
    }

    const failures = checkpoint.phase1[id]?.startsWith?.('fail:')
      ? parseInt(checkpoint.phase1[id].split(':')[1]) : 0;
    if (failures >= CONFIG.maxRetries && !CONFIG.retryFailed) {
      console.log(`   [${count}/${products.length}] ${id} — ${failures}회 실패, 건너뜀`);
      continue;
    }

    process.stdout.write(`   [${count}/${products.length}] ${id} ... `);

    try {
      const wf = JSON.parse(JSON.stringify(workflow));
      wf['50'].inputs.text = prompt;
      wf['49'].inputs.seed = Math.floor(Math.random() * 2 ** 53);
      wf['49'].inputs.denoise = 1.0;
      wf['49'].inputs.steps = 10;
      wf['9'].inputs.filename_prefix = id;

      const promptId = await queuePrompt(wf);
      const outputs = await waitForCompletion(promptId);

      const saveNode = outputs?.['9'];
      const images = saveNode?.images;
      if (!images || images.length === 0) throw new Error('출력 이미지 없음');

      const img = images[0];
      const destPath = resolve(IMG_DIR, `${id}.png`);
      await downloadOutput(img.filename, img.subfolder, img.type, destPath);

      checkpoint.phase1[id] = 'done';
      await saveCheckpoint(checkpoint);
      success++;
      console.log('✅');
    } catch (e) {
      const newFails = failures + 1;
      checkpoint.phase1[id] = `fail:${newFails}`;
      await saveCheckpoint(checkpoint);
      console.log(`❌ (${newFails}/${CONFIG.maxRetries}) ${e.message.slice(0, 60)}`);
    }

    sinceLastFree++;
    if (sinceLastFree >= CONFIG.imgBatchSize) {
      await ensureVRAM();
      sinceLastFree = 0;
    }
  }

  console.log(`\n   Phase 1 완료: ${success}/${products.length} 성공`);
  return success;
}

// ─── Phase 2: Image → GLB (TRELLIS.2) ──────────────────────

async function runPhase2(products, checkpoint) {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║  Phase 2: Image → GLB                 ║');
  console.log('╚═══════════════════════════════════════╝');

  console.log('   Phase 전환: 전체 VRAM 정리...');
  await freeVRAM();

  const workflow = JSON.parse(await readFile(IMG2GLB_PATH, 'utf-8'));
  await mkdir(GLB_DIR, { recursive: true });

  // 1차 검수: phase1 완료된 항목 중 generated-img/{id}.png 가 실제로 존재하는 것만.
  // 사용자가 png 를 삭제한 항목은 "검수 탈락" 으로 보고 GLB 에서 제외한다.
  const phase1Done = products.filter(p => checkpoint.phase1[p.id] === 'done');
  const eligible = [];
  let removedByReview = 0;
  for (const p of phase1Done) {
    if (await exists(resolve(IMG_DIR, `${p.id}.png`))) {
      eligible.push(p);
    } else {
      removedByReview++;
    }
  }
  console.log(`   Phase 1 완료: ${phase1Done.length}개`);
  if (removedByReview > 0) {
    console.log(`   검수 삭제 (png 없음): ${removedByReview}개 → GLB 단계 제외`);
  }
  console.log(`   GLB 대상: ${eligible.length}개\n`);

  let count = 0;
  let success = 0;
  let sinceLastFree = 0;

  for (const product of eligible) {
    count++;
    const { id, category, target_face_count } = product;

    if (checkpoint.phase2[id] === 'done') {
      console.log(`   [${count}/${eligible.length}] ${id} — 이미 완료, 건너뜀`);
      continue;
    }

    const failures = checkpoint.phase2[id]?.startsWith?.('fail:')
      ? parseInt(checkpoint.phase2[id].split(':')[1]) : 0;
    if (failures >= CONFIG.maxRetries && !CONFIG.retryFailed) {
      console.log(`   [${count}/${eligible.length}] ${id} — ${failures}회 실패, 건너뜀`);
      continue;
    }

    process.stdout.write(`   [${count}/${eligible.length}] ${id} ... `);

    try {
      const imgPath = resolve(IMG_DIR, `${id}.png`);
      const imgData = await readFile(imgPath);

      const formData = new FormData();
      formData.append('image', new Blob([imgData], { type: 'image/png' }), `${id}.png`);
      formData.append('subfolder', 'pipeline');
      formData.append('overwrite', 'true');

      await comfyFetch('/upload/image', {
        method: 'POST',
        body: formData,
      });

      const wf = JSON.parse(JSON.stringify(workflow));
      wf['6'].inputs.image = `pipeline/${id}.png`;
      wf['219'].inputs.value = id;

      // 행성처럼 게임 terrain 용도면 product 가 target_face_count 를 명시 →
      // 워크플로우의 "Low Poly Face Number" (PrimitiveInt 노드 258) 를 오버라이드
      if (Number.isFinite(target_face_count) && wf['258']?.inputs) {
        wf['258'].inputs.value = target_face_count;
      }

      const promptId = await queuePrompt(wf);
      const outputs = await waitForCompletion(promptId);

      const glbDest = resolve(GLB_DIR, `${id}.glb`);
      let glbFound = false;

      // 최종 텍스처드 저폴리 GLB (node 265 = Trellis2ExportMesh "_LowPoly_Textured")
      const exportNode = outputs?.['265'];
      if (exportNode) {
        const meshFiles = exportNode.gltf || exportNode.files || exportNode.mesh;
        if (meshFiles?.length > 0) {
          await downloadOutput(meshFiles[0].filename, meshFiles[0].subfolder, meshFiles[0].type, glbDest);
          glbFound = true;
        }
      }

      if (!glbFound) {
        const previewNode = outputs?.['232'];
        const resultPath = previewNode?.result?.[0];
        if (resultPath && typeof resultPath === 'string' && resultPath.endsWith('.glb')) {
          const filename = resultPath.split('/').pop();
          await downloadOutput(filename, '', 'output', glbDest);
          glbFound = true;
        }
      }

      if (!glbFound) {
        console.log('\n   [DEBUG] outputs:', JSON.stringify(outputs, null, 2).slice(0, 500));
        throw new Error('GLB 출력 없음');
      }

      // category 별 서브폴더로 최종 복사
      const targetDir = categoryDir(category);
      await mkdir(targetDir, { recursive: true });
      const glbFinal = resolve(targetDir, `${id}.glb`);
      const optimized = await optimizeGLB(glbDest, glbFinal);

      checkpoint.phase2[id] = 'done';
      if (!checkpoint.completed.includes(id)) checkpoint.completed.push(id);
      await saveCheckpoint(checkpoint);
      success++;
      console.log(`✅ → ${category}/${optimized ? ' (optimized)' : ''}`);
    } catch (e) {
      const newFails = failures + 1;
      checkpoint.phase2[id] = `fail:${newFails}`;
      await saveCheckpoint(checkpoint);
      console.log(`❌ (${newFails}/${CONFIG.maxRetries}) ${e.message.slice(0, 80)}`);
    }

    sinceLastFree++;
    if (sinceLastFree >= CONFIG.glbBatchSize) {
      console.log('   ⏸️  배치 정리...');
      await freeVRAM();
      sinceLastFree = 0;
    }
  }

  console.log(`\n   Phase 2 완료: ${success}/${eligible.length} 성공`);
  return success;
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║  Diablo Asset Generation Pipeline                ║');
  console.log('║  Text → Image → GLB → Game Resource              ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log(`   ComfyUI: ${CONFIG.comfyUrl}`);
  console.log(`   Phase: ${CONFIG.phase}`);

  try {
    const res = await comfyFetch('/system_stats');
    const stats = await res.json();
    const device = stats.devices?.[0];
    if (device) {
      const totalGB = (device.vram_total / 1024 ** 3).toFixed(1);
      const freeGB = (device.vram_free / 1024 ** 3).toFixed(1);
      console.log(`   GPU: ${device.name} (${totalGB}GB 전체, ${freeGB}GB 여유)`);
    }
  } catch (e) {
    console.error(`\n❌ ComfyUI 연결 실패: ${CONFIG.comfyUrl}`);
    console.error(`   ${e.message}`);
    process.exit(1);
  }

  let products;
  try {
    products = JSON.parse(await readFile(PROMPTS_PATH, 'utf-8'));
  } catch (e) {
    console.error(`\n❌ 프롬프트 파일 로드 실패: ${PROMPTS_PATH}`);
    console.error(`   ${e.message}`);
    console.error('   tools/product-prompts.json 파일을 먼저 작성하세요.');
    process.exit(1);
  }

  // category 검증
  for (const p of products) {
    if (!VALID_CATEGORIES.has(p.category)) {
      console.error(`\n❌ product-prompts.json: id="${p.id}" 의 category="${p.category}" 가 유효하지 않음`);
      console.error(`   허용 값: ${[...VALID_CATEGORIES].join(', ')}`);
      process.exit(1);
    }
  }

  if (CONFIG.categoryFilter) {
    products = products.filter(p => p.category === CONFIG.categoryFilter);
    console.log(`   카테고리 필터(${CONFIG.categoryFilter}): ${products.length}개 선택`);
  }

  if (CONFIG.ids) {
    const idSet = new Set(CONFIG.ids.split(','));
    products = products.filter(p => idSet.has(p.id));
    console.log(`   ID 필터: ${products.length}개 선택`);
  }

  console.log(`   대상: ${products.length}개 항목\n`);

  let checkpoint = CONFIG.reset
    ? { phase1: {}, phase2: {}, completed: [] }
    : await loadCheckpoint();

  if (CONFIG.reset) {
    await saveCheckpoint(checkpoint);
    console.log('   checkpoint 초기화 완료');
  }

  if (CONFIG.resetPhase2 && !CONFIG.reset) {
    const idSet = CONFIG.ids ? new Set(CONFIG.ids.split(',')) : null;
    const catFilter = CONFIG.categoryFilter || null;
    const productIndex = new Map(products.map(p => [p.id, p]));

    const before = Object.keys(checkpoint.phase2).length;
    for (const id of Object.keys(checkpoint.phase2)) {
      const prod = productIndex.get(id);
      if (idSet && !idSet.has(id)) continue;
      if (catFilter && prod?.category !== catFilter) continue;
      delete checkpoint.phase2[id];
      checkpoint.completed = checkpoint.completed.filter(x => x !== id);
    }
    const removed = before - Object.keys(checkpoint.phase2).length;
    await saveCheckpoint(checkpoint);
    console.log(`   phase2 체크포인트 초기화: ${removed}개 항목 (phase1 및 이미지는 보존)`);
  }

  await mkdir(IMG_DIR, { recursive: true });
  await mkdir(GLB_DIR, { recursive: true });
  for (const cat of VALID_CATEGORIES) {
    await mkdir(resolve(MODELS_ROOT, cat), { recursive: true });
  }

  if (CONFIG.phase === '1' || CONFIG.phase === 'all') {
    await runPhase1(products, checkpoint);
  }

  if (CONFIG.phase === '2' || CONFIG.phase === 'all') {
    await runPhase2(products, checkpoint);
  }

  const p1Done = Object.values(checkpoint.phase1).filter(v => v === 'done').length;
  const p1Fail = Object.values(checkpoint.phase1).filter(v => v?.startsWith?.('fail:')).length;
  const p2Done = Object.values(checkpoint.phase2).filter(v => v === 'done').length;
  const p2Fail = Object.values(checkpoint.phase2).filter(v => v?.startsWith?.('fail:')).length;

  console.log('\n╔═══════════════════════════════════════════════════╗');
  console.log(`║  결과 요약                                        ║`);
  console.log(`║  Phase 1 (이미지): ${p1Done} 성공 / ${p1Fail} 실패`.padEnd(52) + '║');
  console.log(`║  Phase 2 (GLB):    ${p2Done} 성공 / ${p2Fail} 실패`.padEnd(52) + '║');
  console.log(`║  게임 리소스:      ${checkpoint.completed.length}개 완료`.padEnd(52) + '║');
  console.log('╚═══════════════════════════════════════════════════╝');

  if (p1Fail > 0 || p2Fail > 0) {
    console.log('\n   실패한 항목은 --retry-failed 옵션으로 재시도할 수 있습니다.');
  }
}

main().catch(e => { console.error('치명적 오류:', e); process.exit(1); });
