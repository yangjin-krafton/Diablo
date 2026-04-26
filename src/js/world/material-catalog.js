// Catalog of available planet-surface textures. Pulled by
// `loadPlanetSurfaceTextures` when a planet's `surface` block does NOT
// list its own `materials` / `noise` — i.e. when you want the system to
// roll a random combo each session.
//
// Each MATERIAL_POOL entry can declare any of:
//     albedo        — base color (required for the slot to do anything)
//     roughness     — surface roughness map
//     ao            — ambient occlusion map (multiplied into diffuse)
//     displacement  — height map (vertex-displaces along the surface normal)
//
// All but `albedo` are optional per entry. The shader auto-skips channels
// that aren't supplied, so mixed pools (some sets with displacement, some
// without) work out of the box.
//
// Browsers can't list directories at runtime, so this manifest is the
// single source of truth. Add new ambientcg sets here after dropping
// their WebP files into asset/textures/materials/<set-id>/.

export const MATERIAL_POOL = [
    {
        id: 'Ground103',
        albedo:       './asset/textures/materials/Ground103_1K-PNG/Ground103_1K-PNG_Color.webp',
        roughness:    './asset/textures/materials/Ground103_1K-PNG/Ground103_1K-PNG_Roughness.webp',
        normal:       './asset/textures/materials/Ground103_1K-PNG/Ground103_1K-PNG_NormalGL.webp',
        ao:           './asset/textures/materials/Ground103_1K-PNG/Ground103_1K-PNG_AmbientOcclusion.webp',
        displacement: './asset/textures/materials/Ground103_1K-PNG/Ground103_1K-PNG_Displacement.webp',
    },
    {
        id: 'Rock058',
        albedo:       './asset/textures/materials/Rock058_1K-PNG/Rock058_1K-PNG_Color.webp',
        roughness:    './asset/textures/materials/Rock058_1K-PNG/Rock058_1K-PNG_Roughness.webp',
        normal:       './asset/textures/materials/Rock058_1K-PNG/Rock058_1K-PNG_NormalGL.webp',
        ao:           './asset/textures/materials/Rock058_1K-PNG/Rock058_1K-PNG_AmbientOcclusion.webp',
        displacement: './asset/textures/materials/Rock058_1K-PNG/Rock058_1K-PNG_Displacement.webp',
    },
    {
        id: 'Rock063',
        albedo:       './asset/textures/materials/Rock063_1K-PNG/Rock063_1K-PNG_Color.webp',
        roughness:    './asset/textures/materials/Rock063_1K-PNG/Rock063_1K-PNG_Roughness.webp',
        normal:       './asset/textures/materials/Rock063_1K-PNG/Rock063_1K-PNG_NormalGL.webp',
        ao:           './asset/textures/materials/Rock063_1K-PNG/Rock063_1K-PNG_AmbientOcclusion.webp',
        displacement: './asset/textures/materials/Rock063_1K-PNG/Rock063_1K-PNG_Displacement.webp',
    },
];

export const NOISE_POOL = [
    './asset/textures/noise/terrain_blend_01.webp',
    './asset/textures/noise/terrain_blend_02.webp',
    './asset/textures/noise/terrain_blend_03.webp',
];

/** Shuffle and take `count` random material entries from the pool.
 *  Returns up to `min(count, pool.length)` items. Each session yields a
 *  different combination so the planet surface looks fresh on replay. */
export function pickRandomMaterials(count = 3, pool = MATERIAL_POOL) {
    if (!pool || pool.length === 0) return [];
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, Math.min(count, arr.length));
}

/** Pick one random noise texture URL. Returns null when the pool is empty. */
export function pickRandomNoise(pool = NOISE_POOL) {
    if (!pool || pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
}
