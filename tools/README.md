# Diablo Asset Pipeline

ComfyUI 기반 에셋 생성 파이프라인. 텍스트 프롬프트에서 이미지를 만들고, 그 이미지를 다시 3D GLB 로 변환해 게임 리소스(`src/asset/models/{player,enemy,npc}/`)에 자동 배치합니다.

## 컨셉

이 게임은 **우주의 작은 행성 표면에서 진행되는 디아블로 × 뱀파이어 서바이벌**. 그래서 프롬프트는 아래 방향으로 통일:

- **Player** — SF 영웅 계열 (우주 레인저, 우주 마법사 등)
- **Enemy** — 외계 생명체 / 감염 개체 / 해적 로봇 / 코스믹 언데드
- **NPC** — 행성 기지, 부유 드론, 신호 토템 같은 SF 허브 구조물

TRELLIS 가 깨끗한 메쉬를 뽑도록 모든 프롬프트는 다음 구문을 포함함:
`isolated on pure white background`, `no environment`, `no floor shadow`, `full body visible`, `centered composition`.

## 요구 사항

- ComfyUI 서버 (기본값: `http://100.66.10.225:8188`)
- TRELLIS.2 커스텀 노드 (`Trellis2LoadModel`, `Trellis2MeshWithVoxelAdvancedGenerator`, `Trellis2ExportMesh`)
- `z_image_turbo_bf16` 모델 (text2img)
- Node.js 20+

## 프롬프트 테스트 절차 (권장)

바로 전체를 돌리지 말고, **1항목 스모크 테스트** 로 톤/품질을 먼저 확인하는 걸 추천.

```bash
cd tools

# 1) 대표 한 개만 Phase 1 (이미지만) 생성해서 톤 확인
node asset-pipeline.mjs --phase 1 --ids fig_space_ranger_stylized
# → tools/generated-img/fig_space_ranger_stylized.png 열어보고 OK 판단

# 2) 같은 항목 Phase 2 (GLB) 돌려서 메쉬 품질 확인
node asset-pipeline.mjs --phase 2 --ids fig_space_ranger_stylized
# → tools/generated-glb/fig_space_ranger_stylized.glb 확인 (root glb-preview.html 나 기타 뷰어)

# 3) 톤이 맞으면 카테고리 단위로 확장
node asset-pipeline.mjs --category enemy

# 4) 전부 OK면 일괄
npm run pipeline
```

품질이 기대에 못 미치면 해당 항목 `prompt` 를 수정하고:
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

# 카테고리 필터 (player | enemy | npc)
node asset-pipeline.mjs --category enemy

# ComfyUI URL 오버라이드
node asset-pipeline.mjs --comfy-url http://localhost:8188
```

## 프롬프트 추가하기

`product-prompts.json` 을 편집. 각 항목:

```json
{
  "id": "fig_my_new_enemy",
  "category": "enemy",
  "name": "새로운 몬스터",
  "prompt": "..."
}
```

- `id` — 파일명(`{id}.glb`)과 체크포인트 키. 고유해야 하며 `[a-z0-9_]` 사용.
- `category` — `player` | `enemy` | `npc`. 최종 GLB 가 복사될 서브폴더를 결정.
- `prompt` — ComfyUI 에 전달되는 영문 프롬프트. "isolated on pure white background", "no floor shadow" 같은 구문을 반드시 포함해야 TRELLIS 가 깨끗한 메쉬를 뽑음.

항목을 추가한 뒤 `npm run pipeline` 으로 실행. 기존 완료 항목은 체크포인트 덕분에 건너뜁니다.

## 동작 흐름

1. **Phase 1 (text2img)** — `text2img.json` 워크플로우로 각 프롬프트를 실행, `tools/generated-img/{id}.png` 에 저장.
2. **Phase 2 (img2glb)** — 완료된 이미지를 ComfyUI 에 업로드 → `Better_Texture_Trellis2.json` 워크플로우 실행 → `tools/generated-glb/{id}.glb` 로 내려받음 → `category` 에 따라 `src/asset/models/{category}/{id}.glb` 로 복사.
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
├── asset-pipeline.mjs              # 메인 파이프라인
├── text2img.json                   # ComfyUI text2img 워크플로우
├── Better_Texture_Trellis2.json    # ComfyUI img2glb (TRELLIS.2) 워크플로우
├── product-prompts.json            # 생성할 에셋 프롬프트 목록
├── package.json                    # npm scripts
├── pipeline-checkpoint.json        # (자동 생성) 진행 체크포인트
├── generated-img/                  # (자동 생성) 중간 이미지
└── generated-glb/                  # (자동 생성) 중간 GLB
```
