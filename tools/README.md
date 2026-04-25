# Diablo Asset Pipeline

ComfyUI 기반 에셋 생성 파이프라인. 텍스트 프롬프트에서 이미지를 만들고, 그 이미지를 다시 3D GLB 로 변환해 게임 리소스(`src/asset/models/{category}/`)에 자동 배치합니다.

## 조립형 프롬프트 (Prompt Builder) — 베리에이션 모드

프롬프트를 직접 쓰는 대신 **(색상 팔레트) × (재질) × (게임요소 컨셉)** 으로 자동 조립합니다 (`prompt-builder.mjs`).

1. **색상 팔레트** (16가지 2-tone) — `obsidian_crimson`, `cobalt_silver`, `emerald_gold`, …
2. **재질/피니시** (12가지) — `glossy_toy`, `brushed_metal`, `cel_painted`, `crystal`, …
3. **게임 요소** (카테고리별 컨셉 리스트)

각 컨셉마다 `(palette × material)` 조합 풀(192개) 중 N개를 결정적 셔플로 뽑아서 베리에이션 풀을 만듭니다. 같은 N 이면 결과가 항상 동일하고, N 을 늘리면 기존 베리에이션은 유지된 채 뒤에 추가됩니다.

ID 형식: `fig_p_knight__obsidian_crimson__brushed_metal` — 파일명만 봐도 어떤 색·재질인지 한눈에 보임.

```bash
# 컨셉당 4 베리에이션 (기본) — 약 480개
npm run prompts:build

# 컨셉당 8 베리에이션 — 약 944개
node prompt-builder.mjs --variations 8

# 모든 16×12 조합 (≈ 22K, 검수 부담 큼)
node prompt-builder.mjs --full-combo

# 카테고리별 첫 1개 샘플 출력 (--variations 1 권장)
node prompt-builder.mjs --variations 1 --sample

# 파일 안 쓰고 통계만 확인
npm run prompts:dry
```

> 행성(`planet`) 카테고리는 컨셉이 색·표면을 의미적으로 함의하므로 베리에이션이 아닌 **명시적 1:1 매칭**으로 항상 16개만 만듭니다.

## 권장 워크플로우 — 1차 이미지 검수 → 2차 GLB

베리에이션 풀이 크면 모두 GLB로 변환하는 건 낭비입니다. 다음 흐름을 권장:

```bash
# 1) 베리에이션 풀 빌드
npm run prompts:build

# 2) Phase 1만 (이미지 풀 일괄 생성)
npm run pipeline:img

# 3) 사람이 검수: tools/generated-img/ 폴더를 열어서
#    안 좋은 결과의 PNG 파일을 그냥 삭제한다.
#    (예: fig_p_knight__obsidian_crimson__ceramic.png 가 별로면 그냥 지움)

# 4) Phase 2 (살아남은 PNG 만 GLB 로 변환)
npm run pipeline:glb
```

Phase 2 는 시작할 때 `generated-img/{id}.png` 가 존재하는 항목만 처리합니다. 사용자가 삭제한 항목은 자동으로 GLB 단계에서 제외되며, 콘솔에 "검수 삭제 N개 → GLB 단계 제외" 로 표시됩니다. 마음이 바뀌어 다시 만들고 싶으면 `pipeline-checkpoint.json` 의 `phase1[id]` 항목을 지우거나 `--reset` 후 재실행.

## 현재 컨셉 리스트 (베이스 132종, 베리에이션 적용 시 480개@N=4)

| 카테고리 | 개수 | 내용 | ID prefix |
|---------|------|------|-----------|
| `player`   | 16 | knight/berserker/paladin/monk/ranger/gunner/sniper/grenadier/mage/necromancer/druid/warlock/assassin/ninja/bard/engineer | `fig_p_` |
| `enemy`    | 20 | 티어1 8 · 티어2 8 · 티어3 4 | `fig_m_` |
| `boss`     | 10 | dragon/lich_king/demon_lord/chimera/cyclops/hydra/minotaur/titan_golem/kraken/fallen_angel | `fig_b_` |
| `npc`      | 20 | merchant/blacksmith/alchemist/priest/innkeeper/… | `fig_n_` |
| `building` | 20 | village_house/inn/church_chapel/castle_keep/… | `fig_s_` |
| `item`     | 30 | 무기 10 · 방어구/장신구 10 · 소비/유물 10 | `fig_i_` |
| `planet`   | 16 | mars_dust/frozen_world/molten_forge/blue_ocean/verdant_garden/gas_giant/shattered_remnant/crystal_world/swamp_bog/lunar_grey/ringed_pastel/toxic_haze/iron_industrial/savanna_dunes/cloud_veil/void_anomaly | `fig_w_` |

TRELLIS 가 깨끗한 메쉬를 뽑도록 모든 프롬프트는 다음 구문을 포함:
`isolated on pure white background`, `no environment`, `no floor shadow`, `centered composition`.
(캐릭터류는 `full body visible`, 건물/아이템/행성류는 `entire object fully visible` 로 분리)

### 행성 (planet) 특수 처리

행성은 **실제 게임 terrain 으로 사용**되므로 다른 카테고리와 다르게 취급됩니다:

- **3-톤 전용 팔레트** (`PLANET_PALETTES`, 16개) — `mars_dust` (rust red / ochre tan / dark crimson) 같은 의미 있는 3색 조합
- **표면 재질 셋** (`PLANET_SURFACES`, 16개) — `cratered`, `icy_glaciers`, `lava_seams`, `gas_bands`, …
- **명시적 1:1 매칭** — 해시 자동 선택이 아니라 컨셉별로 어울리는 팔레트·표면을 직접 지정
- **Low-poly face count = 100,000** — `product-prompts.json` 의 `target_face_count` 필드. 파이프라인은 이 값을 보고 `MeshWithTexturing_LowPoly.json` 워크플로우의 노드 258 ("Low Poly Face Number") 을 동적으로 오버라이드. 다른 카테고리는 워크플로우 기본값 (10,000) 을 그대로 사용.

## 요구 사항

- ComfyUI 서버 (기본값: `http://100.66.10.225:8188`)
- TRELLIS.2 커스텀 노드 최신 버전 (`Trellis2LoadModel`, `Trellis2ImageCondGenerator`, `Trellis2SparseGenerator`, `Trellis2ShapeGenerator`, `Trellis2DecodeLatents`, `Trellis2ReconstructMeshWithQuad`, `Trellis2SimplifyMesh`, `Trellis2MeshTexturing`, `Trellis2ExportMesh`)
- `z_image_turbo_bf16` 모델 (text2img)
- Node.js 20+

## 프롬프트 테스트 절차 (권장)

바로 전체를 돌리지 말고, **1항목 스모크 테스트** 로 톤/품질을 먼저 확인하는 걸 추천.

```bash
cd tools

# 0) 베리에이션 풀 한 번만 작게 (--variations 1) 생성해서 톤 미리 확인
node prompt-builder.mjs --variations 1
node asset-pipeline.mjs --phase 1 --category planet --ids fig_w_mars_dust

# 1) 본 빌드: 컨셉당 4 베리에이션
npm run prompts:build

# 2) Phase 1 일괄 (이미지 풀)
npm run pipeline:img

# 3) tools/generated-img/ 검수 → 안 좋은 png 삭제

# 4) Phase 2 (살아남은 png 만 GLB)
npm run pipeline:glb
```

품질이 기대에 못 미치면 `prompt-builder.mjs` 의 **팔레트/재질/컨셉** 리스트를 수정하고 `npm run prompts:build` 재실행 → 필요한 id 만 재시도:
```bash
node asset-pipeline.mjs --ids <id> --retry-failed
```
(수정 전에 `pipeline-checkpoint.json` 에서 해당 id 를 지우거나 `--reset` 후 재실행해도 됨)

## 사용법

```bash
cd tools

# 전체 (이미지 + GLB)
npm run pipeline

# 이미지만
npm run pipeline:img

# GLB 만 (이미 Phase1 완료된 항목 대상)
npm run pipeline:glb

# 실패했던 항목 재시도
npm run pipeline:retry

# checkpoint 초기화 후 처음부터
npm run pipeline:reset
```

### 옵션

```bash
# 특정 항목만
node asset-pipeline.mjs --ids fig_skeleton_warrior_chibi,fig_goblin_scout_chibi

# 카테고리 필터 (player | enemy | boss | npc | building | planet | item | pickup)
node asset-pipeline.mjs --category enemy

# 행성만 (terrain 용 100k face GLB)
node asset-pipeline.mjs --category planet

# ComfyUI URL 오버라이드
node asset-pipeline.mjs --comfy-url http://localhost:8188

# GLB 워크플로우(MeshWithTexturing_LowPoly.json)를 수정하고 모델만 다시 뽑고 싶을 때
# → phase2 체크포인트만 비우고 phase1(이미지) 는 보존
node asset-pipeline.mjs --reset-phase2 --phase 2                     # 전체 29개 재생성
node asset-pipeline.mjs --reset-phase2 --phase 2 --category player   # 플레이어 5개만
node asset-pipeline.mjs --reset-phase2 --phase 2 --ids fig_space_ranger_stylized
```

## 프롬프트 추가하기

기본 흐름은 `prompt-builder.mjs` 의 컨셉 리스트에 한 줄만 추가하는 것.

```js
// tools/prompt-builder.mjs  (PLAYERS 예시)
const PLAYERS = [
  // [slug, role, concept]
  ['knight', 'melee_tank', 'noble knight warrior holding a longsword and heater shield in full plate armor'],
  // ↓ 새 직종 추가
  ['paladin2', 'tank_support', 'shining paladin champion with a two-handed holy warhammer and cape'],
];
```

- `slug` — `fig_p_{slug}.glb` 로 저장됨. 고유해야 하며 `[a-z0-9_]`.
- `role` — 게임 로직에서 참조할 역할 태그 (`melee_tank`, `caster`, `tier1`, `boss`, `weapon`, …).
- `concept` — 템플릿에 삽입될 영문 명사구. 색상·재질은 빌더가 자동으로 붙이므로 **컨셉에는 색상 언급을 넣지 말 것**.

새 카테고리를 더하려면 `TEMPLATES` 에 템플릿 함수를, `GROUPS` 에 엔트리를 추가하고 `asset-pipeline.mjs` 의 `VALID_CATEGORIES` 에 이름을 더하면 됩니다.

직접 JSON 을 편집하는 것도 가능하지만 (`product-prompts.json`), 다음 빌드 시 덮어쓰므로 일회성으로만 권장.

항목을 추가한 뒤:
```bash
npm run prompts:build    # JSON 갱신
npm run pipeline         # 새 항목만 생성 (체크포인트가 기존 완료분은 건너뜀)
```

## 동작 흐름

1. **Phase 1 (text2img)** — `text2img.json` 워크플로우로 각 프롬프트를 실행, `tools/generated-img/{id}.png` 에 저장.
2. **Phase 2 (img2glb)** — 완료된 이미지를 ComfyUI 에 업로드 → `MeshWithTexturing_LowPoly.json` 워크플로우 실행 (HighPoly 재구성 → 저폴리 단순화 → 텍스처 베이킹) → 최종 텍스처드 저폴리 GLB 를 `tools/generated-glb/{id}.glb` 로 내려받음 → `category` 에 따라 `src/asset/models/{category}/{id}.glb` 로 복사.
3. **Checkpoint** — `pipeline-checkpoint.json` 이 단계별 진행 상황을 기록. 중단 후 재실행해도 이미 완료된 항목은 건너뜀.

## 게임에 적용

생성된 GLB 를 게임에서 쓰려면 `src/js/config.js` 의 `modelPath` 를 업데이트하세요:

```js
enemy: {
    modelPath: './asset/models/enemy/fig_skeleton_warrior_chibi.glb',
    ...
}
```

## 파일 구조

```
tools/
├── prompt-builder.mjs              # 팔레트+재질+컨셉 조립 → product-prompts.json
├── asset-pipeline.mjs              # 메인 파이프라인
├── text2img.json                   # ComfyUI text2img 워크플로우
├── MeshWithTexturing_LowPoly.json  # ComfyUI img2lowpoly (TRELLIS.2 최신) 워크플로우
├── product-prompts.json            # (빌더 출력) 에셋 프롬프트 목록
├── package.json                    # npm scripts
├── pipeline-checkpoint.json        # (자동 생성) 진행 체크포인트
├── generated-img/                  # (자동 생성) 중간 이미지
└── generated-glb/                  # (자동 생성) 중간 GLB
```
