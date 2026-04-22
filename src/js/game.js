// Game orchestrator. Owns renderer, scene, camera, surface, and systems.
//
// Visual model: camera is STATIC. A `worldRotator` group wraps the planet,
// landmarks, sun, directional light, and all entity meshes. Each frame we
// ROLL the worldRotator by a small delta determined by input — accumulating
// over time rather than recomputing from scratch. This keeps "up on screen"
// mapped to a consistent world axis as you walk in any combination of
// directions (no shortest-arc twist), and because the sun/light live inside
// the rotator, the lighting rotates with the planet too.
//
// Player's planet-local position and forward are DERIVED each frame as
// invQ * (0, R, 0) and invQ * worldForward respectively — the rotator is the
// single source of truth.
//
// Input to delta axis mapping (axis = cross(moveDirWorld, worldUp)):
//   W (input.z = -1, moveDir = (0,0,-1)) → axis = ( 1, 0, 0)
//   S (input.z = +1)                     → axis = (-1, 0, 0)
//   D (input.x = +1)                     → axis = ( 0, 0, 1)
//   A (input.x = -1)                     → axis = ( 0, 0,-1)
// Angle per frame = mag * speed * dt / R.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { InputState } from './input.js';
import { StaticCamera } from './camera.js';
import { createScene } from './scene-setup.js';
import { SphereSurface } from './world/surface.js';
import { Player } from './entities/player.js';
import { Spawner } from './systems/spawner.js';
import { Hud } from './hud.js';
import { SkillBar } from './ui/skill-bar.js';
import { preload } from './assets.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.surface = new SphereSurface(CONFIG.world.planetRadius);
        const { scene, worldRotator } = createScene(this.surface);
        this.scene = scene;
        this.worldRotator = worldRotator;

        const aspect = this._sizePixels().w / this._sizePixels().h;
        this.camera = new StaticCamera(aspect, this.surface);
        this.input = new InputState();
        this.player = new Player(this.surface);
        this.spawner = new Spawner(this.surface);
        this.hud = new Hud();
        this.skillBar = new SkillBar(this.player);

        this._last = 0;

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    async start() {
        await preload([CONFIG.player.modelPath, CONFIG.enemy.modelPath]);
        await this.player.init(this.worldRotator);

        const loading = document.getElementById('loading');
        if (loading) loading.classList.add('hidden');

        this._last = performance.now();
        requestAnimationFrame(this._tick);
    }

    _tick = (now) => {
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;

        const worldForward = this._applyInputRotation(dt);
        this.player.update(dt, this.worldRotator, this.spawner.enemies, worldForward);
        this.spawner.update(dt, this.worldRotator, this.player);
        this.hud.update(this.player, this.spawner);
        this.skillBar.update(this.player);

        this.renderer.render(this.scene, this.camera.camera);
        requestAnimationFrame(this._tick);
    };

    /** Apply a small delta rotation to worldRotator based on input.
     *  Returns the world-space forward direction (unit vector) the player is
     *  moving in, or null if idle.
     */
    _applyInputRotation(dt) {
        const m = this.input.moveVector();
        const mag = Math.hypot(m.x, m.z);
        if (mag < 1e-6) return null;

        const ux = m.x / mag;
        const uz = m.z / mag;
        // axis = cross((ux, 0, uz), (0, 1, 0)) = (-uz, 0, ux)
        _axis.set(-uz, 0, ux);
        const angle = (mag * CONFIG.player.moveSpeed * dt) / this.surface.radius;
        _deltaQ.setFromAxisAngle(_axis, angle);
        this.worldRotator.quaternion.premultiply(_deltaQ);
        this.worldRotator.quaternion.normalize(); // guard against drift

        _worldForward.set(ux, 0, uz);
        return _worldForward;
    }

    _sizePixels() {
        const parent = this.canvas.parentElement;
        return { w: parent.clientWidth, h: parent.clientHeight };
    }

    _resize() {
        const { w, h } = this._sizePixels();
        this.renderer.setSize(w, h, false);
        this.camera.setAspect(w / h);
    }
}

const _axis = new THREE.Vector3();
const _deltaQ = new THREE.Quaternion();
const _worldForward = new THREE.Vector3();
