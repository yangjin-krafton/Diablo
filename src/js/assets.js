// GLB loader with cache. Returns a fresh skeleton-aware clone each call
// so multiple entities can share the same source model safely.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath(`${THREE_CDN}libs/draco/`);
dracoLoader.setDecoderConfig({ type: 'js' });

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);
loader.setMeshoptDecoder(MeshoptDecoder);

const cache = new Map(); // path -> gltf.scene (original, never mutated)
const warnedFallbacks = new Set();
const temporaryBoxModelPaths = new Set([
    './asset/models/player/fig_ninja_kunoichi_stylized.glb',
    './asset/models/enemy/fig_abomination_chibi.glb',
    './asset/models/npc/home.glb',
]);

export async function loadGLB(path) {
    let source = cache.get(path);
    if (!source) {
        source = await loadSourceOrFallback(path);
        cache.set(path, source);
    }
    const clone = skeletonClone(source);
    clone.traverse((o) => {
        if (o.isMesh) {
            // GLTFLoader already wired normalMap/roughnessMap/metalnessMap/aoMap/
            // emissiveMap onto the material; we only need to opt each mesh into
            // the shadow pipeline.
            o.castShadow = true;
            o.receiveShadow = true;
        }
    });
    return clone;
}

export async function preload(paths) {
    await Promise.all(paths.map(async (p) => {
        if (!cache.has(p)) {
            cache.set(p, await loadSourceOrFallback(p));
        }
    }));
}

async function loadSourceOrFallback(path) {
    if (temporaryBoxModelPaths.has(path)) {
        return createFallbackModel(path);
    }

    try {
        const gltf = await new Promise((resolve, reject) => {
            loader.load(path, resolve, undefined, reject);
        });
        return gltf.scene;
    } catch (err) {
        if (!warnedFallbacks.has(path)) {
            warnedFallbacks.add(path);
            console.warn(`[Diablo] using temporary 1:2:1 box model for missing asset: ${path}`, err);
        }
        return createFallbackModel(path);
    }
}

function createFallbackModel(path) {
    const group = new THREE.Group();
    group.name = `fallback:${path}`;

    const geometry = new THREE.BoxGeometry(1, 2, 1);
    geometry.translate(0, 1, 0);

    const material = new THREE.MeshStandardMaterial({
        color: fallbackColor(path),
        roughness: 0.72,
        metalness: 0.03,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'temporary_1_2_1_box';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    return group;
}

function fallbackColor(path) {
    if (path.includes('/enemy/')) return 0xb84a4a;
    if (path.includes('/npc/')) return 0xd6b45f;
    return 0x4d8fd6;
}
