// Builds the scene for a static-camera spherical world in space.
//
// Layout:
//   scene
//   ├── hemisphere light                 (dim fill, starlight)
//   ├── directional light  ←  sun pos    (primary light, casts shadows)
//   ├── sun mesh + halo                  (visible at light's world position)
//   ├── starfield                        (fixed background)
//   └── worldRotator (Group)             (rotates so the player is anchored at
//       ├── painted planet mesh           world (0, R, 0))
//       ├── landmark props
//       ├── player + sword arc           (added later by Player.init)
//       └── enemy meshes                 (added later by Spawner)

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildPaintedPlanetGeometry } from './world/terrain.js';

export function createScene(surface) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.world.bgColor);

    addLighting(scene);
    addSun(scene);

    // rotating world
    const worldRotator = new THREE.Group();
    scene.add(worldRotator);

    const planet = new THREE.Mesh(
        buildPaintedPlanetGeometry(
            surface.radius,
            CONFIG.world.terrainDetail,
            CONFIG.world.terrainSeeds,
        ),
        new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 1.0,
            metalness: 0.0,
            flatShading: true,
        }),
    );
    planet.receiveShadow = true;
    worldRotator.add(planet);

    scatterLandmarks(worldRotator, surface);

    scene.add(buildStars());

    return { scene, worldRotator };
}

function addLighting(scene) {
    const { ambientSky, ambientGround, ambientIntensity } = CONFIG.world.sun;
    scene.add(new THREE.HemisphereLight(ambientSky, ambientGround, ambientIntensity));
}

function addSun(scene) {
    const cfg = CONFIG.world.sun;
    const sunPos = new THREE.Vector3(cfg.position.x, cfg.position.y, cfg.position.z);
    const sunDist = sunPos.length();

    // --- visible sun sphere (unshaded, always bright) ---
    const sun = new THREE.Mesh(
        new THREE.SphereGeometry(cfg.size, 32, 32),
        new THREE.MeshBasicMaterial({ color: cfg.color, toneMapped: false }),
    );
    sun.position.copy(sunPos);
    scene.add(sun);

    // --- soft halo shell (back-faced, additive-ish via low opacity) ---
    const halo = new THREE.Mesh(
        new THREE.SphereGeometry(cfg.size * cfg.haloScale, 32, 32),
        new THREE.MeshBasicMaterial({
            color: cfg.haloColor,
            transparent: true,
            opacity: 0.18,
            side: THREE.BackSide,
            depthWrite: false,
            toneMapped: false,
        }),
    );
    halo.position.copy(sunPos);
    scene.add(halo);

    // --- directional light originating at the sun, targeted at planet center ---
    const light = new THREE.DirectionalLight(cfg.lightColor, cfg.lightIntensity);
    light.position.copy(sunPos);
    light.target.position.set(0, 0, 0);
    scene.add(light.target);

    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    // Shadow camera frustum (orthographic) along the sun→planet axis.
    // Tight bounds around the planet to maximize shadow resolution.
    light.shadow.camera.near = Math.max(1, sunDist - 40);
    light.shadow.camera.far  = sunDist + 40;
    light.shadow.camera.left   = -40;
    light.shadow.camera.right  =  40;
    light.shadow.camera.top    =  40;
    light.shadow.camera.bottom = -40;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 2;

    scene.add(light);
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
        mesh.castShadow = true;
        mesh.receiveShadow = true;

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
        color: 0xffffff, size: 1.5, sizeAttenuation: false,
    });
    return new THREE.Points(geo, mat);
}
