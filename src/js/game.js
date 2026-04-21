// Game orchestrator. Owns renderer, scene, camera, systems. Runs the update loop.
// Add new systems by instantiating them here and calling their update() in _tick().

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { InputState } from './input.js';
import { FollowCamera } from './camera.js';
import { createScene } from './scene-setup.js';
import { Player } from './entities/player.js';
import { Spawner } from './systems/spawner.js';
import { Hud } from './hud.js';
import { preload } from './assets.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.scene = createScene();
        const aspect = this._sizePixels().w / this._sizePixels().h;
        this.camera = new FollowCamera(aspect);
        this.input = new InputState();
        this.player = new Player();
        this.spawner = new Spawner();
        this.hud = new Hud();

        this._last = 0;
        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    async start() {
        // warm the GLB cache so the first spawn isn't a frame-hitch
        await preload([CONFIG.player.modelPath, CONFIG.enemy.modelPath]);
        await this.player.init(this.scene);

        const loading = document.getElementById('loading');
        if (loading) loading.classList.add('hidden');

        this._last = performance.now();
        requestAnimationFrame(this._tick);
    }

    _tick = (now) => {
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;

        this.player.update(dt, this.input, this.spawner.enemies);
        this.spawner.update(dt, this.scene, this.player);
        this.camera.update(dt, this.player.position);
        this.hud.update(this.player, this.spawner);

        this.renderer.render(this.scene, this.camera.camera);
        requestAnimationFrame(this._tick);
    };

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
