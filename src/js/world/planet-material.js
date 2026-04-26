// PBR planet surface material with noise-driven blending and palette tint.
//
// Design:
//   - Up to 3 PBR material slots (albedo/normal/roughness/AO) sampled via
//     world-position triplanar mapping so there are no UV seams or pole
//     pinching on the icosahedron sphere.
//   - One noise texture (or procedural fbm fallback) drives the per-pixel
//     blend weights between the slots, so the planet surface looks varied
//     instead of a single tiled material everywhere.
//   - A planet `tint` color is multiplied into the diffuse output so each
//     planet's environment palette flows onto its terrain — vintage rose
//     for ember, dusky cyan for glacier, etc.
//   - Existing per-vertex biome colors (terrain.js Voronoi paint) are kept
//     as a base modulation so the silhouette of biome regions still reads.
//
// Asset integration (Phase 2):
//   - Drop ambientcg PBR sets into `asset/textures/materials/<set-name>/`.
//   - Drop joshbrew noise textures into `asset/textures/noise/`.
//   - Reference them per planet via `CONFIG.planets[id].surface`.
//   - The factory loads them via THREE.TextureLoader. If any are missing,
//     the procedural fallback kicks in so the game still runs.
//
// See docs/planet-material-system.md.

import * as THREE from 'three';
import { pickRandomMaterials, pickRandomNoise } from './material-catalog.js';

const TEX_LOADER = new THREE.TextureLoader();

/** Build the planet surface material.
 *
 *  @param {object} opts
 *  @param {number} [opts.tint=0xffffff]          Hex tint multiplied into diffuse.
 *  @param {THREE.Texture[]} [opts.albedoMaps]    Up to 3 PBR base color textures.
 *  @param {THREE.Texture[]} [opts.normalMaps]    Optional normal maps (1-to-1 with albedoMaps).
 *  @param {THREE.Texture[]} [opts.roughnessMaps] Optional roughness maps.
 *  @param {THREE.Texture}   [opts.noiseMap]      Drives slot blending (R channel).
 *  @param {number}          [opts.noiseScale=0.05]    Mesh-local noise frequency.
 *  @param {number}          [opts.materialScale=0.4]  PBR map tiling frequency.
 *  @param {number}          [opts.tintStrength=0.55]  How much tint to mix in.
 *  @param {boolean}         [opts.flatShading=false]  Match the legacy low-poly look.
 */
export function createPlanetMaterial(opts = {}) {
    const {
        tint = 0xffb0a0,        // default to a bright warm red — uniformly multiplied into albedo
        albedoMaps = [],
        normalMaps = [],
        roughnessMaps = [],
        aoMaps = [],
        displacementMaps = [],
        noiseMap = null,
        noiseScale = 0.16,
        materialScale = 0.4,
        tintStrength = 1.0,     // 1.0 = full multiplication of tint over texture
        patchContrast = 0.45,   // ± lightness modulation from noise (procedural fallback only)
        aoStrength = 0.55,      // 0 = AO ignored, 1 = full multiplicative AO
        displacementScale = 0.45,
        flatShading = true,
    } = opts;

    const slotCount = Math.max(1, Math.min(3, albedoMaps.length || 0));
    const usePbrTextures = slotCount > 0;
    const aoSlotCount = countNonNull(aoMaps);
    const dispSlotCount = countNonNull(displacementMaps);
    const normSlotCount = countNonNull(normalMaps);
    const useAo   = aoSlotCount > 0;
    const useDisp = dispSlotCount > 0;
    const useNormal = normSlotCount > 0;

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        color: 0xffffff,
        roughness: 0.95,
        metalness: 0.02,
        flatShading,
    });

    const tintColor = new THREE.Color(tint);
    const seed = Math.random() * 1000;

    // Configure texture wrap so triplanar tiling looks continuous.
    for (const t of [...albedoMaps, ...normalMaps, ...roughnessMaps, ...aoMaps, ...displacementMaps]) {
        if (!t) continue;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
    }
    if (noiseMap) {
        noiseMap.wrapS = THREE.RepeatWrapping;
        noiseMap.wrapT = THREE.RepeatWrapping;
    }

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTint              = { value: tintColor };
        shader.uniforms.uTintStrength      = { value: tintStrength };
        shader.uniforms.uNoiseScale        = { value: noiseScale };
        shader.uniforms.uMaterialScale     = { value: materialScale };
        shader.uniforms.uNoiseSeed         = { value: seed };
        shader.uniforms.uHasNoiseMap       = { value: noiseMap ? 1.0 : 0.0 };
        shader.uniforms.uNoiseMap          = { value: noiseMap };
        shader.uniforms.uSlotCount         = { value: slotCount };
        shader.uniforms.uPatchContrast     = { value: patchContrast };
        shader.uniforms.uAoStrength        = { value: aoStrength };
        shader.uniforms.uDisplacementScale = { value: displacementScale };
        shader.uniforms.uNormalStrength    = { value: 1.0 };
        for (let i = 0; i < 3; i++) {
            shader.uniforms[`uAlbedo${i}`]       = { value: albedoMaps[i]       ?? null };
            shader.uniforms[`uRoughness${i}`]    = { value: roughnessMaps[i]    ?? null };
            shader.uniforms[`uAo${i}`]           = { value: aoMaps[i]           ?? null };
            shader.uniforms[`uDisplacement${i}`] = { value: displacementMaps[i] ?? null };
            shader.uniforms[`uNormal${i}`]       = { value: normalMaps[i]       ?? null };
            shader.uniforms[`uHasAo${i}`]        = { value: aoMaps[i]           ? 1.0 : 0.0 };
            shader.uniforms[`uHasDisp${i}`]      = { value: displacementMaps[i] ? 1.0 : 0.0 };
            shader.uniforms[`uHasNormal${i}`]    = { value: normalMaps[i]       ? 1.0 : 0.0 };
        }
        console.log(
            `[planet-material] compiled — slots=${slotCount} ao=${aoSlotCount} disp=${dispSlotCount} norm=${normSlotCount}`
            + ` noise=${noiseMap ? 'tex' : 'fbm'} tint=#${tintColor.getHexString()}`,
        );

        // ---------------- vertex shader ----------------
        // Use OBJECT-space (mesh-local) position + normal for the texture
        // and noise sampling. This way the noise/PBR pattern is *glued to
        // the planet mesh* — when worldRotator spins the planet under the
        // player, the surface pattern rotates with it instead of staying
        // fixed in world space (which would make the terrain look like it
        // was "swimming" through a static noise field).
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `
#include <common>
uniform float uMaterialScale;
uniform float uNoiseScale;
uniform float uDisplacementScale;
uniform float uSlotCount;
uniform float uHasDisp0;
uniform float uHasDisp1;
uniform float uHasDisp2;
uniform sampler2D uDisplacement0;
uniform sampler2D uDisplacement1;
uniform sampler2D uDisplacement2;
varying vec3 vPlanetLocalPos;
varying vec3 vPlanetLocalNormal;
// Pass the object→view normal transform to the fragment shader so the
// triplanar normal mapping can rotate its object-space perturbation
// into view space (where MSM expects the lighting normal). normalMatrix
// is constant per-draw-call so this varying is effectively uniform.
varying mat3 vPlanetNormalMatrix;

vec3 vmTriBlend(vec3 n) {
    vec3 b = pow(abs(n), vec3(4.0));
    return b / max(dot(b, vec3(1.0)), 1e-4);
}
float vmSampleTriR(sampler2D t, vec3 lp, vec3 b, float s) {
    return texture2D(t, lp.yz * s).r * b.x
         + texture2D(t, lp.xz * s).r * b.y
         + texture2D(t, lp.xy * s).r * b.z;
}`)
            .replace('#include <begin_vertex>', `
#include <begin_vertex>
${useDisp ? `
{
    // Triplanar-sample the per-slot displacement maps, blend equally
    // (a coarse blend is fine for vertex offsets — the fragment shader
    // does the proper noise-driven blend), and push the vertex outward
    // along the surface normal. The (-0.5) re-centers the displacement
    // value around the original surface so we both raise and lower.
    vec3 dnrm = normalize(objectNormal);
    vec3 dblend = vmTriBlend(dnrm);
    float d = 0.0;
    float w = 0.0;
    if (uHasDisp0 > 0.5) { d += vmSampleTriR(uDisplacement0, position, dblend, uMaterialScale); w += 1.0; }
    if (uHasDisp1 > 0.5) { d += vmSampleTriR(uDisplacement1, position, dblend, uMaterialScale); w += 1.0; }
    if (uHasDisp2 > 0.5) { d += vmSampleTriR(uDisplacement2, position, dblend, uMaterialScale); w += 1.0; }
    if (w > 0.0) {
        d /= w;
        transformed += dnrm * (d - 0.5) * uDisplacementScale;
    }
}
` : ''}`)
            .replace('#include <fog_vertex>', `
#include <fog_vertex>
// Use the ORIGINAL (undisplaced) position for fragment-side sampling so
// texture coordinates don't shift around bumps.
vPlanetLocalPos = position;
vPlanetLocalNormal = normalize(objectNormal);
vPlanetNormalMatrix = normalMatrix;`);

        // ---------------- fragment shader ----------------
        const declarations = `
#include <common>
uniform vec3 uTint;
uniform float uTintStrength;
uniform float uNoiseScale;
uniform float uMaterialScale;
uniform float uNoiseSeed;
uniform float uHasNoiseMap;
uniform sampler2D uNoiseMap;
uniform float uSlotCount;
uniform float uPatchContrast;
uniform sampler2D uAlbedo0;
uniform sampler2D uAlbedo1;
uniform sampler2D uAlbedo2;
uniform sampler2D uRoughness0;
uniform sampler2D uRoughness1;
uniform sampler2D uRoughness2;
uniform sampler2D uAo0;
uniform sampler2D uAo1;
uniform sampler2D uAo2;
uniform sampler2D uNormal0;
uniform sampler2D uNormal1;
uniform sampler2D uNormal2;
uniform float uAoStrength;
uniform float uNormalStrength;
uniform float uHasAo0;
uniform float uHasAo1;
uniform float uHasAo2;
uniform float uHasNormal0;
uniform float uHasNormal1;
uniform float uHasNormal2;
varying vec3 vPlanetLocalPos;
varying vec3 vPlanetLocalNormal;
varying mat3 vPlanetNormalMatrix;

float pmHash(vec3 p) {
    p = fract(p * 0.3183099 + uNoiseSeed * 0.13);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float pmValueNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(pmHash(i + vec3(0.0,0.0,0.0)), pmHash(i + vec3(1.0,0.0,0.0)), f.x),
            mix(pmHash(i + vec3(0.0,1.0,0.0)), pmHash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
        mix(mix(pmHash(i + vec3(0.0,0.0,1.0)), pmHash(i + vec3(1.0,0.0,1.0)), f.x),
            mix(pmHash(i + vec3(0.0,1.0,1.0)), pmHash(i + vec3(1.0,1.0,1.0)), f.x), f.y),
        f.z);
}
float pmFbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * pmValueNoise(p);
        p *= 2.03;
        a *= 0.5;
    }
    return v;
}

// Mesh-local position based noise sample. The position is in OBJECT space
// (pre-modelMatrix) so the noise pattern stays glued to the planet surface
// even as worldRotator spins the planet under the player. Prefer the
// supplied noise texture when provided (planar projection on YZ to feel
// like a global noise field over the sphere), otherwise fall back to
// procedural fbm.
//
// Single-return form (init + if/else + return) so the HLSL cross-compiler
// (ANGLE on Windows) doesn't emit "potentially uninitialized variable"
// warnings. Branches are mutually exclusive — one fbm OR one texture
// fetch per fragment, never both.
float pmNoiseSample(vec3 localPos) {
    float n = 0.0;
    if (uHasNoiseMap > 0.5) {
        vec2 uv = localPos.yz * uNoiseScale;
        n = texture2D(uNoiseMap, uv).r;
    } else {
        n = pmFbm(localPos * uNoiseScale);
    }
    return n;
}

// Triplanar blend weights from a normal direction. pow(.,4) makes one
// axis dominate near the cardinal directions so seams at 45° stay smooth.
vec3 pmTriBlend(vec3 n) {
    vec3 b = pow(abs(n), vec3(4.0));
    return b / max(dot(b, vec3(1.0)), 1e-4);
}

// Sample the texture three times — projected on YZ / XZ / XY planes —
// using the mesh-local position, then blend by the (object-space) normal.
// Object-space sampling keeps the pattern stuck to the mesh.
vec3 pmSampleTriplanar(sampler2D tex, vec3 localPos, vec3 blend, float scale) {
    vec3 sx = texture2D(tex, localPos.yz * scale).rgb;
    vec3 sy = texture2D(tex, localPos.xz * scale).rgb;
    vec3 sz = texture2D(tex, localPos.xy * scale).rgb;
    return sx * blend.x + sy * blend.y + sz * blend.z;
}`;

        // Inject declarations once.
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>', declarations,
        );

        // Diffuse blend: PBR slots blended by noise, layered with vertex
        // biome color, then tinted by the planet palette.
        const diffuseInjection = `
#include <color_fragment>
{
    float n = pmNoiseSample(vPlanetLocalPos);

    vec3 baseAlbedo = diffuseColor.rgb;
${usePbrTextures ? `
    vec3 nrm = normalize(vPlanetLocalNormal);
    vec3 blend = pmTriBlend(nrm);
    vec3 a0 = pmSampleTriplanar(uAlbedo0, vPlanetLocalPos, blend, uMaterialScale);
    vec3 albedo = a0;
    if (uSlotCount > 1.5) {
        vec3 a1 = pmSampleTriplanar(uAlbedo1, vPlanetLocalPos, blend, uMaterialScale);
        float w = smoothstep(0.35, 0.65, n);
        albedo = mix(a0, a1, w);
    }
    if (uSlotCount > 2.5) {
        vec3 a2 = pmSampleTriplanar(uAlbedo2, vPlanetLocalPos, blend, uMaterialScale);
        float n2 = pmFbm((vPlanetLocalPos + vec3(31.7, 5.1, 9.2)) * uNoiseScale * 0.45);
        float w2 = smoothstep(0.55, 0.85, n2);
        albedo = mix(albedo, a2, w2);
    }
    // Use the PBR texture color directly — no biome/vertex-color tinting.
    baseAlbedo = albedo;
` : `
    // Procedural-only path: bigger lightness modulation so the surface
    // visibly looks textured instead of a flat painted polygon.
    float mod_ = mix(1.0 - uPatchContrast, 1.0 + uPatchContrast, n);
    baseAlbedo = baseAlbedo * mod_;
`}
    // Uniform palette tint multiplied across the whole surface (no patches).
    vec3 tinted = mix(baseAlbedo, baseAlbedo * uTint, uTintStrength);

${useAo ? `
    // Ambient-occlusion: triplanar-sample whichever slots provide AO,
    // average them, then darken proportionally to uAoStrength so cracks
    // and crevices in the rock textures read as deeper shadow pockets.
    vec3 aoNrm = normalize(vPlanetLocalNormal);
    vec3 aoBlend = pmTriBlend(aoNrm);
    float ao = 0.0;
    float aoW = 0.0;
    if (uHasAo0 > 0.5) { ao += pmSampleTriplanar(uAo0, vPlanetLocalPos, aoBlend, uMaterialScale).r; aoW += 1.0; }
    if (uHasAo1 > 0.5) { ao += pmSampleTriplanar(uAo1, vPlanetLocalPos, aoBlend, uMaterialScale).r; aoW += 1.0; }
    if (uHasAo2 > 0.5) { ao += pmSampleTriplanar(uAo2, vPlanetLocalPos, aoBlend, uMaterialScale).r; aoW += 1.0; }
    if (aoW > 0.0) {
        ao /= aoW;
        tinted *= mix(1.0, ao, uAoStrength);
    }
` : ''}

    diffuseColor.rgb = tinted;
}`;

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>', diffuseInjection,
        );

        // Roughness blend (only when PBR roughness maps are provided).
        if (usePbrTextures) {
            const roughnessInjection = `
#include <roughnessmap_fragment>
{
    vec3 nrm2 = normalize(vPlanetLocalNormal);
    vec3 blend2 = pmTriBlend(nrm2);
    float r0 = pmSampleTriplanar(uRoughness0, vPlanetLocalPos, blend2, uMaterialScale).r;
    float r = r0;
    if (uSlotCount > 1.5) {
        float r1 = pmSampleTriplanar(uRoughness1, vPlanetLocalPos, blend2, uMaterialScale).r;
        float w = smoothstep(0.35, 0.65, pmNoiseSample(vPlanetLocalPos));
        r = mix(r0, r1, w);
    }
    if (uSlotCount > 2.5) {
        float r2 = pmSampleTriplanar(uRoughness2, vPlanetLocalPos, blend2, uMaterialScale).r;
        float n2 = pmFbm((vPlanetLocalPos + vec3(13.7, 5.1, 9.2)) * uNoiseScale * 0.7);
        float w2 = smoothstep(0.55, 0.85, n2);
        r = mix(r, r2, w2);
    }
    roughnessFactor = clamp(r, 0.05, 1.0);
}`;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <roughnessmap_fragment>', roughnessInjection,
            );
        }

        // Triplanar normal mapping — perturbs the per-fragment normal so
        // even where the geometry is flat, the surface looks like it has
        // micro-detail. Uses the UDN (Unity-style) swizzle method: each
        // axis-projected normal sample is reoriented to its world axis,
        // then weighted-summed with the base normal.
        if (useNormal) {
            const normalInjection = `
#include <normal_fragment_maps>
{
    vec3 baseN = normalize(vPlanetLocalNormal);
    vec3 nblend = pmTriBlend(baseN);

    // Sample slot 0 normal map, decode (rgb 0..1 → -1..1).
    vec3 nx0 = texture2D(uNormal0, vPlanetLocalPos.yz * uMaterialScale).xyz * 2.0 - 1.0;
    vec3 ny0 = texture2D(uNormal0, vPlanetLocalPos.xz * uMaterialScale).xyz * 2.0 - 1.0;
    vec3 nz0 = texture2D(uNormal0, vPlanetLocalPos.xy * uMaterialScale).xyz * 2.0 - 1.0;
    // UDN swizzle — push tangent-space normal into the right world axis.
    vec3 nWorldX = vec3(0.0, nx0.y, nx0.x);
    vec3 nWorldY = vec3(ny0.x, 0.0, ny0.y);
    vec3 nWorldZ = vec3(nz0.x, nz0.y, 0.0);
    nWorldX.x *= sign(baseN.x);
    nWorldY.y *= sign(baseN.y);
    nWorldZ.z *= sign(baseN.z);
    vec3 nPert = nWorldX * nblend.x + nWorldY * nblend.y + nWorldZ * nblend.z;

    // Slot 1/2 — sample, swizzle, blend with same noise weights as albedo.
    if (uSlotCount > 1.5 && uHasNormal1 > 0.5) {
        vec3 nx = texture2D(uNormal1, vPlanetLocalPos.yz * uMaterialScale).xyz * 2.0 - 1.0;
        vec3 ny = texture2D(uNormal1, vPlanetLocalPos.xz * uMaterialScale).xyz * 2.0 - 1.0;
        vec3 nz = texture2D(uNormal1, vPlanetLocalPos.xy * uMaterialScale).xyz * 2.0 - 1.0;
        vec3 wx = vec3(0.0, nx.y, nx.x); wx.x *= sign(baseN.x);
        vec3 wy = vec3(ny.x, 0.0, ny.y); wy.y *= sign(baseN.y);
        vec3 wz = vec3(nz.x, nz.y, 0.0); wz.z *= sign(baseN.z);
        vec3 nPert1 = wx * nblend.x + wy * nblend.y + wz * nblend.z;
        float w = smoothstep(0.35, 0.65, pmNoiseSample(vPlanetLocalPos));
        nPert = mix(nPert, nPert1, w);
    }
    if (uSlotCount > 2.5 && uHasNormal2 > 0.5) {
        vec3 nx = texture2D(uNormal2, vPlanetLocalPos.yz * uMaterialScale).xyz * 2.0 - 1.0;
        vec3 ny = texture2D(uNormal2, vPlanetLocalPos.xz * uMaterialScale).xyz * 2.0 - 1.0;
        vec3 nz = texture2D(uNormal2, vPlanetLocalPos.xy * uMaterialScale).xyz * 2.0 - 1.0;
        vec3 wx = vec3(0.0, nx.y, nx.x); wx.x *= sign(baseN.x);
        vec3 wy = vec3(ny.x, 0.0, ny.y); wy.y *= sign(baseN.y);
        vec3 wz = vec3(nz.x, nz.y, 0.0); wz.z *= sign(baseN.z);
        vec3 nPert2 = wx * nblend.x + wy * nblend.y + wz * nblend.z;
        float n2 = pmFbm((vPlanetLocalPos + vec3(13.7, 5.1, 9.2)) * uNoiseScale * 0.7);
        float w2 = smoothstep(0.55, 0.85, n2);
        nPert = mix(nPert, nPert2, w2);
    }

    // Combine: object-space perturbed normal = base + perturbation,
    // scaled by uNormalStrength. Then transform to view space using the
    // normalMatrix passed in via vertex varying (modelMatrix/normalMatrix
    // aren't auto-declared in fragment shaders).
    vec3 perturbedLocal = normalize(baseN + nPert * uNormalStrength);
    normal = normalize(vPlanetNormalMatrix * perturbedLocal);
}`;
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <normal_fragment_maps>', normalInjection,
            );
        }
    };

    material.userData.tint = tintColor;
    material.userData.albedoMaps = albedoMaps;
    material.userData.noiseMap = noiseMap;

    return material;
}

/** Resolve a planet's surface texture set from CONFIG and load every
 *  referenced texture asynchronously. Returns a Promise resolving to the
 *  set ready to feed into createPlanetMaterial({ ...result }).
 *
 *  CONFIG shape (per planet, all keys optional once `surface` exists):
 *    surface: {
 *        // Explicit list — pin specific materials to this planet:
 *        materials: [{ albedo: 'url', roughness: 'url', normal: 'url' }, ...],
 *        noise: 'url',
 *
 *        // OR random — pull a different combo each session from the
 *        // shared pool in `material-catalog.js`:
 *        materialCount: 3,        // optional, default 3 (capped at 3)
 *    }
 *
 *  When `materials` is omitted/empty, `materialCount` random sets are
 *  drawn from MATERIAL_POOL. When `noise` is omitted, one is drawn from
 *  NOISE_POOL. So `surface: {}` is enough to opt the planet into the
 *  randomized PBR pipeline.
 */
export async function loadPlanetSurfaceTextures(planetCfg) {
    const surface = planetCfg?.surface;
    if (!surface) {
        return {
            albedoMaps: [], roughnessMaps: [], normalMaps: [],
            aoMaps: [], displacementMaps: [], noiseMap: null,
        };
    }

    let slots = surface.materials;
    if (!slots || slots.length === 0) {
        const desiredCount = surface.materialCount ?? 3;
        slots = pickRandomMaterials(desiredCount);
    }
    slots = slots.slice(0, 3);

    const noiseUrl = surface.noise ?? pickRandomNoise();
    // Macro terrain is baked at geometry build time (terrain.js
    // displaceTerrain), so we don't need PBR displacement maps in the
    // shader — skipping them saves 3 texture units per planet, which
    // matters because WebGL caps at 16 fragment samplers and we already
    // burn ~13 on color/roughness/normal/ao/noise/shadow.
    const loadDisplacement = surface.loadDisplacement === true;

    // sRGB for color, linear for everything else (data textures).
    const [albedoMaps, roughnessMaps, normalMaps, aoMaps, displacementMaps] = await Promise.all([
        Promise.all(slots.map((s) => loadOptional(s?.albedo, true))),
        Promise.all(slots.map((s) => loadOptional(s?.roughness, false))),
        Promise.all(slots.map((s) => loadOptional(s?.normal, false))),
        Promise.all(slots.map((s) => loadOptional(s?.ao, false))),
        loadDisplacement
            ? Promise.all(slots.map((s) => loadOptional(s?.displacement, false)))
            : Promise.resolve(slots.map(() => null)),
    ]);

    const noiseMap = await loadOptional(noiseUrl, false);

    const tally = (arr) => arr.filter(Boolean).length;
    console.log(
        `[planet-material] surface picked — materials=[${slots.map((s) => s?.id ?? '?').join(', ')}]`
        + ` ao=${tally(aoMaps)}/${slots.length}`
        + ` norm=${tally(normalMaps)}/${slots.length}`
        + ` disp=${tally(displacementMaps)}/${slots.length}`
        + ` noise=${noiseUrl ? 'yes' : 'no'}`,
    );

    // Keep arrays slot-aligned with null placeholders so the shader knows
    // which slots actually have AO / displacement / normal.
    return {
        albedoMaps: albedoMaps.filter(Boolean),
        roughnessMaps,
        normalMaps,
        aoMaps,
        displacementMaps,
        noiseMap,
    };
}

function loadOptional(url, sRGB = false) {
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
        TEX_LOADER.load(
            url,
            (tex) => {
                tex.colorSpace = sRGB ? THREE.SRGBColorSpace : THREE.NoColorSpace;
                resolve(tex);
            },
            undefined,
            () => {
                console.warn(`[planet-material] missing texture: ${url}`);
                resolve(null);
            },
        );
    });
}

function countNonNull(arr) {
    if (!Array.isArray(arr)) return 0;
    let n = 0;
    for (const x of arr) if (x) n++;
    return n;
}
