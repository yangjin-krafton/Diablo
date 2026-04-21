// Game orchestrator. Owns renderer, scene, camera, surface, and systems.
//
// Visual model: camera is STATIC. A `worldRotator` group wraps the planet,
// landmarks, and all entity meshes. Each frame we rotate the worldRotator so
// that the player's planet-local position maps to world (0, R, 0) — anchoring
// the player at the visible top of the sphere while the world rolls underneath.
//
// Extension path: instantiate new systems in the constructor, step them in _tick().

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { InputState } from './input.js';
import { StaticCamera } from './camera.js';
import { createScene } from './scene-setup.js';
import { SphereSurface } from './world/surface.js';
import { Player } from './entities/player.js';
import { Spawner } from './systems/spawner.js';
import { Hud } from './hud.js';
import { preload } from './assets.js';

const UP_WORLD = new THREE.Vector3(0, 1, 0);

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

        this._last = 0;
        this._posNorm = new THREE.Vector3();

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    async start() {
        await preload([CONFIG.player.modelPath, CONFIG.enemy.modelPath]);
        await this.player.init(this.worldRotator);
        this._alignWorld();

        const loading = document.getElementById('loading');
        if (loading) loading.classList.add('hidden');

        this._last = performance.now();
        requestAnimationFrame(this._tick);
    }

    _tick = (now) => {
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;

        this.player.update(dt, this.input, this.worldRotator, this.spawner.enemies);
        this.spawner.update(dt, this.worldRotator, this.player);
        this._alignWorld();
        this.hud.update(this.player, this.spawner);

        this.renderer.render(this.scene, this.camera.camera);
        requestAnimationFrame(this._tick);
    };

    /** Rotate the world so player.position maps to world (0, R, 0). */
    _alignWorld() {
        this._posNorm.copy(this.player.position).normalize();
        this.worldRotator.quaternion.setFromUnitVectors(this._posNorm, UP_WORLD);
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
