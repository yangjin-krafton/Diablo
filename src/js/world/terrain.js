// Voronoi-biome painted planet + CPU-side terrain displacement.
//
// Pipeline (build time, one-shot, baked into the geometry):
//   1. Build an IcosahedronGeometry and convert to non-indexed so each
//      triangle has its own three vertices (required for per-face solid
//      colors with flat shading).
//   2. *Displace every vertex along the radial outward direction* using
//      multi-octave fbm noise (see displaceTerrain). This is the same
//      approach as three.js's webgl_geometry_terrain_raycast example
//      adapted to a sphere — real geometry, not a shader trick, so the
//      planet has actual mountains/valleys (raycast-able, depth-correct).
//   3. Scatter `seedCount` random unit-vector "seeds" on the sphere, each
//      assigned a biome by weighted random. Color faces by nearest seed.
//   4. Recompute vertex normals so the displaced terrain shades correctly.
//
// Extending:
//   - Add/remove biomes in the BIOMES array; adjust weights to change
//     coverage.
//   - Tune terrain shape via the `displaceTerrain` opts (octaves /
//     baseFrequency / amplitude / persistence / lacunarity).
//   - Vary detail/seedCount via CONFIG.world for finer/coarser tiles.

import * as THREE from 'three';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';

export const BIOMES = [
    { name: 'deepwater', color: new THREE.Color(0x162c5c), weight: 3 },
    { name: 'water',     color: new THREE.Color(0x2a5eb8), weight: 5 },
    { name: 'sand',      color: new THREE.Color(0xd4b872), weight: 2 },
    { name: 'grass',     color: new THREE.Color(0x4a8f3a), weight: 4 },
    { name: 'forest',    color: new THREE.Color(0x2e5f24), weight: 2 },
    { name: 'rock',      color: new THREE.Color(0x6a6a70), weight: 3 },
    { name: 'dirt',      color: new THREE.Color(0x5a3e24), weight: 2 },
    { name: 'snow',      color: new THREE.Color(0xe8eeff), weight: 1 },
    { name: 'lava',      color: new THREE.Color(0xb82d1a), weight: 1 },
];

export function buildPaintedPlanetGeometry(radius, detail, seedCount, opts = {}) {
    const base = new THREE.IcosahedronGeometry(radius, detail);
    // IcosahedronGeometry in newer three is already non-indexed — skip the
    // conversion and the warning it produces.
    const geo = base.index ? base.toNonIndexed() : base;
    if (geo !== base) base.dispose();

    // Bake terrain BEFORE biome painting so the painting reads the
    // displaced (real) face centroids — biomes flow over hills/valleys
    // just like Voronoi seeds were on the displaced surface.
    displaceTerrain(geo, radius, opts.terrain);

    const seeds = scatterSeeds(seedCount);

    const pos = geo.attributes.position;
    const vertexCount = pos.count; // = 3 * faceCount on non-indexed geometry
    const colors = new Float32Array(vertexCount * 3);
    const centroid = new THREE.Vector3();

    for (let i = 0; i < vertexCount; i += 3) {
        const ax = pos.getX(i),     ay = pos.getY(i),     az = pos.getZ(i);
        const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1);
        const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2);
        centroid.set(
            (ax + bx + cx) / 3,
            (ay + by + cy) / 3,
            (az + bz + cz) / 3,
        ).normalize();

        const biome = nearestBiome(centroid, seeds);
        const { r, g, b } = biome.color;
        for (let j = 0; j < 3; j++) {
            const idx = (i + j) * 3;
            colors[idx]     = r;
            colors[idx + 1] = g;
            colors[idx + 2] = b;
        }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Recompute normals so the displaced terrain shades with proper face
    // normals (lighting respects mountains/valleys).
    geo.computeVertexNormals();
    return geo;
}

/** CPU-side terrain displacement on a sphere, mirroring three.js's
 *  webgl_geometry_terrain_raycast example. Each vertex is pushed outward
 *  along the radial direction by a multi-octave fbm noise sampled at the
 *  vertex's normalized direction.
 *
 *  Because this runs once at geometry build time, the planet has real
 *  geometry (not a shader trick) — raycast-able, depth-correct, and free
 *  per frame. */
export function displaceTerrain(geometry, radius, opts = {}) {
    const {
        octaves       = 5,      // detail layers; more = finer microstructure
        baseFrequency = 1.4,    // first octave frequency on unit sphere
        amplitude     = radius * 0.08,  // ±8% of radius — visible mountains
        persistence   = 0.5,    // amplitude falloff per octave
        lacunarity    = 2.05,   // frequency growth per octave
        seed          = Math.random() * 100,
    } = opts;

    const noise = new ImprovedNoise();
    const pos = geometry.attributes.position;
    const v = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
        const r0 = v.length();
        if (r0 < 1e-6) continue;
        v.divideScalar(r0); // unit direction

        // Multi-octave fbm in [-1, 1].
        let h = 0;
        let freq = baseFrequency;
        let amp = 1;
        let totalAmp = 0;
        for (let o = 0; o < octaves; o++) {
            h += noise.noise(v.x * freq + seed, v.y * freq, v.z * freq) * amp;
            totalAmp += amp;
            freq *= lacunarity;
            amp *= persistence;
        }
        h /= totalAmp; // normalize so result stays in roughly [-1, 1]

        const newR = r0 + h * amplitude;
        pos.setXYZ(i, v.x * newR, v.y * newR, v.z * newR);
    }

    pos.needsUpdate = true;
}

// uniformly random points on the unit sphere, each tagged with a biome
function scatterSeeds(n) {
    const totalWeight = BIOMES.reduce((s, b) => s + b.weight, 0);
    const seeds = new Array(n);
    for (let i = 0; i < n; i++) {
        const u = Math.random() * 2 - 1;
        const phi = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        seeds[i] = {
            dir: new THREE.Vector3(s * Math.cos(phi), u, s * Math.sin(phi)),
            biome: pickBiome(totalWeight),
        };
    }
    return seeds;
}

function pickBiome(totalWeight) {
    let r = Math.random() * totalWeight;
    for (const b of BIOMES) {
        r -= b.weight;
        if (r <= 0) return b;
    }
    return BIOMES[BIOMES.length - 1];
}

function nearestBiome(centroid, seeds) {
    let bestDot = -Infinity;
    let best = seeds[0].biome;
    for (const s of seeds) {
        const d = centroid.dot(s.dir);
        if (d > bestDot) { bestDot = d; best = s.biome; }
    }
    return best;
}
