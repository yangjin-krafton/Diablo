// GLB loader with cache. Returns a fresh skeleton-aware clone each call
// so multiple entities can share the same source model safely.

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

export async function loadGLB(path) {
    let source = cache.get(path);
    if (!source) {
        const gltf = await new Promise((resolve, reject) => {
            loader.load(path, resolve, undefined, reject);
        });
        source = gltf.scene;
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
            const gltf = await new Promise((resolve, reject) => {
                loader.load(p, resolve, undefined, reject);
            });
            cache.set(p, gltf.scene);
        }
    }));
}
