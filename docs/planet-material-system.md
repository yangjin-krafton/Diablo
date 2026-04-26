# Planet Surface Material System

행성 표면을 *PBR 재질 + 노이즈 블렌딩 + 행성 컬러 틴트*로 렌더링한다.
손으로 칠한 바이옴 색만 쓰던 단순한 표면을 *실제 재질감*이 있는 행성으로
업그레이드한다.

소스: `src/js/world/planet-material.js`
씬 통합: `src/js/scene-setup.js` `createScene()` 안의 `createPlanetMaterial()`
행성 등록: `CONFIG.planets[id].surface`

---

## 1. 렌더링 파이프라인

```
[per-vertex 바이옴 색]
         │
         ▼  (× 보조 modulate)
[PBR 재질 슬롯 1~3개] ── 트라이플라나(world-pos 기반) UV 샘플링
         │
         ▼  (mix by noise)
[노이즈 텍스처 또는 절차적 fbm]
         │
         ▼
[행성 tint (palette.accent) × tintStrength]
         │
         ▼
   diffuseColor.rgb
```

핵심 사항:
- **트라이플라나 매핑** — Icosahedron 구체에는 깔끔한 UV가 없다. 대신
  월드 좌표를 XY/YZ/ZX 평면에 투영해 3번 샘플링하고 표면 노멀의 절댓값
  비율로 블렌딩 → 솔기/극점 핀치 없음.
- **노이즈로 슬롯 블렌딩** — 슬롯 0과 1 사이는 `smoothstep(0.35, 0.65, n)`,
  슬롯 2는 두 번째 옥타브 노이즈를 써서 *2단계 마블링*. 한 슬롯은
  베이스, 두 번째는 변주, 세 번째는 희소한 액센트로 사용하면 좋다.
- **틴트 곱연산** — `palette.accent` (행성 지배 원소의 순수 네온 색)
  값을 mix(1) 시 100% 곱연산. `tintStrength` 기본 0.55 → 표면이 행성
  컬러로 약간 물든다.
- **바이옴 보존** — 기존 Voronoi 페인트(per-vertex color)는 PBR 알베도에
  곱해져서 *지역적 색 변주*를 그대로 남긴다.
- **절차적 폴백** — `albedoMaps`이 비면 PBR 코드 경로 자체가 컴파일에서
  배제되고, fbm 노이즈로 바이옴 컬러를 modulate만 한다. 자산 없이도
  동작.

---

## 2. 자산 통합

### 2-1. ambientcg PBR 세트

1. https://ambientcg.com/list?type=material%2Cdecal%2Catlas&sort=popular 에서
   행성 컨셉에 맞는 1K/2K 세트 다운로드
2. `asset/textures/materials/<set-name>/` 으로 풀어 넣기 (set-name은 ambientcg
   의 ID 그대로 — `Lava005`, `Rock039`, `Ash002` 등)
3. 각 세트는 `Color` / `Roughness` / `Normal` / `AmbientOcclusion` /
   `Displacement`를 포함한다. 현재 셰이더는 `Color`(albedo) + `Roughness`만
   사용. 나머지는 미래 확장(노멀 매핑, AO)을 위해 같이 넣어두는 게 좋다.

### 2-2. joshbrew Noise_Textures

1. https://github.com/joshbrew/Noise_Textures 에서 시밀리스 노이즈 PNG
   하나 선택 (perlin / simplex / worley / blue noise)
2. `asset/textures/noise/` 으로 복사
3. R 채널만 샘플링되므로 컬러 노이즈 PNG도 그대로 사용 가능

### 2-3. 행성 등록

`src/js/config.js`의 `planets` entry에 `surface` 블록 추가:

```js
ember: {
    id: 'ember',
    name: '화염 행성',
    dominant: 'red',
    bias: { red: 3.0, yellow: 0.8, green: 0.6, blue: 0.5, purple: 0.7 },
    surface: {
        materials: [
            {
                albedo:    './asset/textures/materials/Lava005/Color.jpg',
                roughness: './asset/textures/materials/Lava005/Roughness.jpg',
            },
            {
                albedo:    './asset/textures/materials/Rock039/Color.jpg',
                roughness: './asset/textures/materials/Rock039/Roughness.jpg',
            },
            {
                albedo:    './asset/textures/materials/Ash002/Color.jpg',
                roughness: './asset/textures/materials/Ash002/Roughness.jpg',
            },
        ],
        noise: './asset/textures/noise/perlin_001.png',
    },
},
```

`materials`는 1~3개. 적게 두면 단순한 표면, 많이 두면 풍부한 마블링.

### 2-4. 비동기 업그레이드

행성 메시는 *우선 절차적 머티리얼로 즉시 렌더*되고, 텍스처가 로드되면
`upgradePlanetMaterialAsync()`이 같은 메시의 머티리얼을 PBR 버전으로
교체한다 (`scene-setup.js`).

→ 로딩 지연이 게임 시작을 막지 않음. 텍스처 누락 시 절차적 표면으로
   계속 진행 (콘솔에 경고).

---

## 3. 셰이더 인젝션 포인트

`createPlanetMaterial()`은 `MeshStandardMaterial`의 `onBeforeCompile`
훅을 사용해 표준 셰이더 패스에 GLSL 스니펫을 끼워 넣는다.

| 인젝션 포인트 | 역할 |
| ------------- | ---- |
| `#include <common>` (vertex) | 월드 좌표 / 월드 노멀을 varying으로 |
| `#include <fog_vertex>` | 위 varying 채움 |
| `#include <common>` (fragment) | uniform / 헬퍼 함수 (해시, fbm, 트라이플라나) |
| `#include <color_fragment>` | 알베도 블렌딩 + 틴트 |
| `#include <roughnessmap_fragment>` | 거칠기 블렌딩 (PBR 슬롯 있을 때만) |

다른 표준 PBR 단계(노멀, AO, 그림자, 이미시브)는 그대로 통과 → MSM의
모든 라이팅 파이프라인을 그대로 활용.

---

## 4. 튜닝 가이드

| 파라미터 | 기본 | 효과 |
| -------- | ---- | ---- |
| `tint` | `palette.accent` | 행성 표면 색의 큰 방향 |
| `tintStrength` | 0.55 (PBR), 0.50 (절차적) | 0이면 틴트 무, 1이면 완전 틴트 |
| `noiseScale` | 0.05 (PBR) / 0.06 (절차적) | 노이즈 패턴의 큰 규모. 작을수록 큰 얼룩, 클수록 자글자글 |
| `materialScale` | 0.42 | PBR 텍스처 타일링 빈도. 작을수록 늘어진 텍스처 |
| `flatShading` | true (절차적) / false (PBR) | 저폴리 블록 vs 부드러운 셰이딩 |

행성마다 다른 tone을 원하면 `surface`에 `tint` / `noiseScale` /
`tintStrength` 오버라이드를 직접 박을 수도 있다 (factory가 그대로 받음).

---

## 5. 다음 단계 (선택)

- **노멀 매핑**: 슬롯별 `Normal.jpg`를 트라이플라나 샘플링 후
  `#include <normal_fragment_maps>`에 인젝션
- **AO**: `AmbientOcclusion.jpg`를 같은 방식으로 `#include <aomap_fragment>`
- **디스플레이스먼트**: `Displacement.jpg`를 *지오메트리 단계*에서
  적용 (vertex shader에서 position offset). 메시에 미세 굴곡을 더함
- **바이옴별 슬롯**: `nearestBiome` 결과를 vertex attribute로 보내서,
  바이옴마다 다른 PBR 세트를 강제할 수 있음

---

## 6. 코드 진입점 요약

| 파일 | 역할 |
| ---- | ---- |
| `src/js/world/planet-material.js` | 머티리얼 팩토리 + 텍스처 로더 |
| `src/js/scene-setup.js` | 씬 초기화 시 머티리얼 부착, 비동기 PBR 업그레이드 |
| `src/js/config.js` `planets.<id>.surface` | 행성별 자산 URL 정의 |
| `asset/textures/materials/` | ambientcg PBR 세트 |
| `asset/textures/noise/` | joshbrew 노이즈 텍스처 |
| `src/js/world/planet-palette.js` | tint 색 산출 (행성 bias → 액센트) |
