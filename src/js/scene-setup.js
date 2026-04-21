// Builds the scene for a static-camera spherical world.
//
// Layout:
//   scene
//   ├── ambient + directional lights     (fixed in world space)
//   ├── starfield                        (fixed)
//   └── worldRotator (Group)             (rotates every frame so the player is
//       ├── planet mesh                   visually anchored at world (0, R, 0))
//       ├── landmark props
//       ├── player mesh                  (added later by Player.init)
//       ├── sword-swing arc              (added later by Player.init)
//       └── enemy meshes                 (added later by Spawner)
//
// createScene returns { scene, worldRotator } so the orchestrator can parent
// gameplay meshes into the rotator.

import * as THREE from 'three';
import { CONFIG } from './config.js';

export function createScene(surface) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.world.bgColor);

    // --- fixed lighting ---
    scene.add(new THREE.HemisphereLight(0xddddff, 0x222233, 0.55));
    const dir = new THREE.DirectionalLight(0xffe0b0, 1.1);
    dir.position.set(40, 80, 30);
    scene.add(dir);

    // --- rotating world ---
    const worldRotator = new THREE.Group();
    scene.add(worldRotator);

    const planet = new THREE.Mesh(
        new THREE.IcosahedronGeometry(surface.radius, 4),
        new THREE.MeshStandardMaterial({
            color: CONFIG.world.planetColor,
            emissive: CONFIG.world.planetEmissive,
            roughness: 1.0,
            metalness: 0.0,
            flatShading: true,
        }),
    );
    worldRotator.add(planet);

    scatterLandmarks(worldRotator, surface);

    // --- fixed starfield ---
    scene.add(buildStars());

    return { scene, worldRotator };
}

function scatterLandmarks(parent, surface) {
    const { count, minHeight, maxHeight, color } = CONFIG.world.landmarks;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 1.0 });
    const seedPole = new THREE.Vector3(0, surface.radius, 0);
    const tmp = new THREE.Vector3();
    const up = new THREE.Vector3();
    const right = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const helperF = new THREE.Vector3();
    const m = new THREE.Matrix4();

    for (let i = 0; i < count; i++) {
        const h = minHeight + Math.random() * (maxHeight - minHeight);
        const w = 0.3 + Math.random() * 0.5;
        const geo = new THREE.BoxGeometry(w, h, w);
        geo.translate(0, h / 2, 0);
        const mesh = new THREE.Mesh(geo, mat);

        surface.randomPointAtArc(seedPole, Math.random() * Math.PI * surface.radius, tmp);
        mesh.position.copy(tmp);

        up.copy(tmp).normalize();
        helperF.set(1, 0, 0).addScaledVector(up, -up.x);
        if (helperF.lengthSq() < 1e-6) helperF.set(0, 0, 1);
        helperF.normalize();
        right.crossVectors(up, helperF).normalize();
        fwd.crossVectors(right, up).normalize();
        m.makeBasis(right, up, fwd);
        mesh.quaternion.setFromRotationMatrix(m);

        parent.add(mesh);
    }
}

function buildStars() {
    const { starCount, starDistance } = CONFIG.world;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
        const u = Math.random() * 2 - 1;
        const phi = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        positions[i * 3]     = starDistance * s * Math.cos(phi);
        positions[i * 3 + 1] = starDistance * u;
        positions[i * 3 + 2] = starDistance * s * Math.sin(phi);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
        color: 0xffffff, size: 1.4, sizeAttenuation: false,
    });
    return new THREE.Points(geo, mat);
}
