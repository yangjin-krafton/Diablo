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
import { planetPalette } from './world/planet-palette.js';
import { createPlanetMaterial, loadPlanetSurfaceTextures } from './world/planet-material.js';

/** Resolve the active planet's palette, or null when no planet entry is
 *  configured (legacy CONFIG.world colors stay in charge). Single source of
 *  truth for per-session environment tone — see docs/drop-resource-design.md
 *  §3-5. */
function activePalette() {
    const id = CONFIG.activePlanet;
    const planet = CONFIG.planets?.[id];
    return planet ? planetPalette(planet) : null;
}

export function createScene(surface) {
    const palette = activePalette();
    const skyboxPath = selectSkyboxPath();
    const scene = new THREE.Scene();
    const skyScene = new THREE.Scene();
    scene.background = skyboxPath ? null : new THREE.Color(palette?.bg ?? CONFIG.world.bgColor);
    if (palette?.fog != null) {
        scene.fog = new THREE.Fog(palette.fog, surface.radius * 1.6, surface.radius * 4.2);
    }

    addLighting(scene, palette);

    // rotating world — everything that should spin when the player walks
    // (planet, landmarks, player, enemies, sword arc, sun, directional light)
    // goes under this group.
    const worldRotator = new THREE.Group();
    scene.add(worldRotator);

    const skybox = addSkyboxEnvironment(scene, skyScene, skyboxPath);
    addSun(worldRotator, palette);

    // Procedural-only planet material first so the scene renders immediately.
    // PBR material slots (ambientcg) load asynchronously; the upgrade
    // callback below pre-compiles the new shader off-thread and only swaps
    // the material once the GPU program is ready, avoiding any first-frame
    // stall when the upgrade lands.
    const planetMat = createPlanetMaterial({
        tint: 0xffb0a0,         // bright warm red — uniform multiplier over texture
        tintStrength: 1.0,
        noiseScale: 0.16,
        patchContrast: 0.45,
        flatShading: true,
    });
    const planet = new THREE.Mesh(
        buildPaintedPlanetGeometry(
            surface.radius,
            CONFIG.world.terrainDetail,
            CONFIG.world.terrainSeeds,
        ),
        planetMat,
    );
    planet.receiveShadow = true;
    worldRotator.add(planet);

    scatterLandmarks(worldRotator, surface);

    if (!skyboxPath) scene.add(buildStars());

    // Caller drives the timing — typically game.js calls this after the
    // camera is set up. It's async (texture loading + shader precompile)
    // but the returned Promise can be ignored; the upgrade runs in the
    // background and the procedural material renders meanwhile.
    const upgradePlanetMaterial = (renderer, camera) =>
        upgradePlanetMaterialAsync(scene, planet, palette, renderer, camera);

    return { scene, worldRotator, skyScene, skybox, upgradePlanetMaterial };
}

/** Async PBR material upgrade. Loads textures, builds the upgraded
 *  material, and pre-compiles its shader program against a *dummy scene*
 *  using `renderer.compileAsync` BEFORE swapping it onto the real planet
 *  mesh. That way the swap doesn't trigger a multi-hundred-millisecond
 *  shader-compile stall on the next render frame.
 *
 *  Returns a Promise that resolves to the upgraded material (or null if
 *  the planet has no `surface` block / texture loading failed). The
 *  procedural material stays bound until the upgrade lands.
 */
async function upgradePlanetMaterialAsync(scene, planetMesh, palette, renderer, camera) {
    const id = CONFIG.activePlanet;
    const planetCfg = CONFIG.planets?.[id];
    if (!planetCfg?.surface) return null;

    let tex;
    try {
        tex = await loadPlanetSurfaceTextures(planetCfg);
    } catch (err) {
        console.warn('[scene-setup] planet texture load failed:', err);
        return null;
    }
    if (!tex.albedoMaps.length && !tex.noiseMap) return null;

    const upgraded = createPlanetMaterial({
        tint: 0xffb0a0,         // bright warm red — uniform multiplier over texture
        tintStrength: 1.0,
        noiseScale: 0.05,
        materialScale: 0.42,
        aoStrength: 0.55,
        // CPU baked terrain (terrain.js#displaceTerrain) handles macro
        // relief, so PBR displacement maps aren't loaded — keeps us under
        // the 16-sampler WebGL cap. flatShading=true is per-face
        // derivative, which correctly shades the baked terrain.
        flatShading: true,
        ...tex,
    });

    // Pre-compile the upgraded shader on a background thread (when
    // KHR_parallel_shader_compile is available). The upgraded material is
    // attached to a hidden dummy mesh in a stand-in scene, then
    // compileAsync walks both scenes and warms up every program in
    // parallel. When this resolves the GPU program is ready.
    if (renderer?.compileAsync && camera) {
        try {
            const dummyScene = new THREE.Scene();
            const dummyMesh = new THREE.Mesh(planetMesh.geometry, upgraded);
            dummyScene.add(dummyMesh);
            await renderer.compileAsync(scene, camera, dummyScene);
            dummyScene.remove(dummyMesh);
        } catch (err) {
            console.warn('[scene-setup] planet material precompile failed:', err);
        }
    }

    const old = planetMesh.material;
    planetMesh.material = upgraded;
    if (old?.dispose) old.dispose();
    return upgraded;
}

function addSkyboxEnvironment(scene, skyScene, skyboxPath) {
    if (!skyboxPath) return null;

    const sky = new THREE.Mesh(
        new THREE.SphereGeometry(1, 64, 32),
        new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            toneMapped: false,
        }),
    );
    sky.name = 'skybox';
    sky.userData.yawOffset = selectSkyboxYaw();
    skyScene.add(sky);

    const loader = new THREE.TextureLoader();
    loader.load(
        skyboxPath,
        (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            const envTexture = texture.clone();
            envTexture.mapping = THREE.EquirectangularReflectionMapping;
            envTexture.colorSpace = THREE.SRGBColorSpace;
            envTexture.needsUpdate = true;
            scene.environment = envTexture;

            sky.material.map = texture;
            sky.material.needsUpdate = true;
        },
        undefined,
        (err) => {
            console.warn('[Diablo] skybox environment failed to load:', skyboxPath, err);
        },
    );
    return sky;
}

function selectSkyboxPath() {
    const paths = CONFIG.world.skyboxPaths ?? [];
    if (paths.length === 0) return CONFIG.world.skyboxPath ?? null;
    if (!CONFIG.world._selectedSkyboxPath) {
        CONFIG.world._selectedSkyboxPath = paths[Math.floor(Math.random() * paths.length)];
    }
    return CONFIG.world._selectedSkyboxPath;
}

function selectSkyboxYaw() {
    if (CONFIG.world._selectedSkyboxYaw === undefined) {
        const randomYaw = CONFIG.world.skyboxRandomYaw ? Math.random() * Math.PI * 2 : 0;
        CONFIG.world._selectedSkyboxYaw = (CONFIG.world.skyboxYawOffset ?? 0) + randomYaw;
    }
    return CONFIG.world._selectedSkyboxYaw;
}

function addLighting(scene, palette) {
    const { ambientIntensity } = CONFIG.world.sun;
    const sky    = palette?.ambientSky    ?? CONFIG.world.sun.ambientSky;
    const ground = palette?.ambientGround ?? CONFIG.world.sun.ambientGround;
    scene.add(new THREE.HemisphereLight(sky, ground, ambientIntensity));
}

// The sun + its directional light live INSIDE the worldRotator group so that
// when the planet rotates under the player, the light direction rotates with
// it — the same biome on the planet keeps the same lighting angle.
function addSun(worldRotator, palette) {
    const cfg = CONFIG.world.sun;
    const sunPos = new THREE.Vector3(cfg.position.x, cfg.position.y, cfg.position.z);
    const sunDist = sunPos.length();

    const sunColor  = palette?.sun     ?? cfg.color;
    const haloColor = palette?.sunHalo ?? cfg.haloColor;

    // --- visible sun sphere (unshaded, always bright) ---
    const sun = new THREE.Mesh(
        new THREE.SphereGeometry(cfg.size, 32, 32),
        new THREE.MeshBasicMaterial({ color: sunColor, toneMapped: false }),
    );
    sun.position.copy(sunPos);
    worldRotator.add(sun);

    // --- soft halo shell (back-faced, additive-ish via low opacity) ---
    const halo = new THREE.Mesh(
        new THREE.SphereGeometry(cfg.size * cfg.haloScale, 32, 32),
        new THREE.MeshBasicMaterial({
            color: haloColor,
            transparent: true,
            opacity: 0.18,
            side: THREE.BackSide,
            depthWrite: false,
            toneMapped: false,
        }),
    );
    halo.position.copy(sunPos);
    worldRotator.add(halo);

    // --- directional light originating at the sun, targeted at planet center ---
    const light = new THREE.DirectionalLight(cfg.lightColor, cfg.lightIntensity);
    light.position.copy(sunPos);
    // target at worldRotator-local origin (= planet center); stays at (0,0,0)
    // even after rotation since rotation preserves the origin
    light.target.position.set(0, 0, 0);
    worldRotator.add(light.target);

    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.near = Math.max(1, sunDist - 40);
    light.shadow.camera.far  = sunDist + 40;
    light.shadow.camera.left   = -40;
    light.shadow.camera.right  =  40;
    light.shadow.camera.top    =  40;
    light.shadow.camera.bottom = -40;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 2;

    worldRotator.add(light);
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
