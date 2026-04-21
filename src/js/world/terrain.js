// Voronoi-biome painted planet.
//
// Approach:
//   1. Build an IcosahedronGeometry and convert to non-indexed so each triangle
//      has its own three vertices (required for per-face solid colors with
//      flat shading).
//   2. Scatter `seedCount` random unit-vector "seeds" on the sphere, each
//      assigned a biome by weighted random.
//   3. For each face, color all three of its vertices with the biome of the
//      nearest seed (nearest = maximum dot product on the unit sphere).
//   4. Material uses vertexColors:true + flatShading:true → each tile renders
//      as a single solid color.
//
// Extending:
//   - Add/remove biomes in the BIOMES array; adjust weights to change coverage.
//   - Swap the "nearest seed" rule for noise-based biomes, or bias by latitude
//     (e.g. snow at poles) by modifying assignBiomeForCentroid().
//   - Vary detail/seedCount via CONFIG.world for finer/coarser tiles.

import * as THREE from 'three';

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

export function buildPaintedPlanetGeometry(radius, detail, seedCount) {
    const base = new THREE.IcosahedronGeometry(radius, detail);
    const geo = base.toNonIndexed();
    base.dispose();

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
    return geo;
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
