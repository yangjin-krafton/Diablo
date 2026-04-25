// Game orchestrator. Owns renderer, scene, camera, surface, and systems.
//
// Visual model: camera is STATIC. A `worldRotator` group wraps the planet,
// landmarks, sun, directional light, and all entity meshes. Each frame we
// ROLL the worldRotator by a small delta determined by input — accumulating
// over time rather than recomputing from scratch.
//
// Pause: when the player enters the home's interact range, the game pauses
// and opens the home interaction panel.
// Closing the panel resumes. A hysteresis flag prevents re-opening while the
// player stands inside the range after closing — they must leave and return.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import { InputState } from './input.js';
import { StaticCamera } from './camera.js';
import { createScene } from './scene-setup.js';
import { SphereSurface } from './world/surface.js';
import { Player } from './entities/player.js';
import { HomeNpc } from './npc/home-npc.js';
import { Spawner } from './systems/spawner.js';
import { DropSystem } from './systems/drop-system.js';
import { HomeController } from './systems/home-controller.js';
import { SkillSystem } from './skills/skill-system.js';
import { UIRoot } from './ui/ui-root.js';
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
        const { scene, worldRotator, skyScene, skybox } = createScene(this.surface);
        this.scene = scene;
        this.worldRotator = worldRotator;
        this.skyScene = skyScene;
        this.skybox = skybox;

        const aspect = this._sizePixels().w / this._sizePixels().h;
        this.camera = new StaticCamera(aspect, this.surface);
        this.input = new InputState();
        this.player = new Player(this.surface);
        this.home = new HomeNpc(this.surface);
        this.spawner = new Spawner(this.surface);
        this.homeController = new HomeController(this.home, this.spawner);

        this.skillSystem = new SkillSystem(this.player, this);
        this.drops = new DropSystem(this.surface, this.worldRotator, this.skillSystem, this.homeController);
        this.spawner.onDeath = (pos) => this.drops.rollDrop(pos);

        // UI is mounted after Pixi finishes initializing (async, see start()).
        this.ui = new UIRoot();
        this.hud = null;
        this.skillBar = null;
        this.homePanel = null;

        this.paused = false;
        this._wasInHome = false;

        this._last = 0;

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    async start() {
        await Promise.all([
            preload([
                CONFIG.player.modelPath,
                CONFIG.home.modelPath,
                CONFIG.enemy.modelPath,
                ...(CONFIG.enemy.modelPaths ?? []),
                ...(CONFIG.enemy.eliteModelPaths ?? []),
            ]),
            this.ui.ready,
        ]);
        await this.player.init(this.worldRotator);
        await this.home.init(this.worldRotator);

        // Pixi is ready. The home panel is opened by NPC/building
        // interactions; the bottom skill bar only activates equipped skills.
        this.hud = new Hud(this.ui);
        this.homePanel = this.home.createPanel(this.ui, this.homeController, {
            onClose: () => { this.paused = false; },
        });
        this.skillBar = new SkillBar(this.ui, this.skillSystem);

        const loading = document.getElementById('loading');
        if (loading) loading.classList.add('hidden');

        this._last = performance.now();
        requestAnimationFrame(this._tick);
    }

    _tick = (now) => {
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;

        // Player died → restart before updating anything else this frame.
        if (!this.player.alive) this._restart();

        if (!this.paused) {
            const worldForward = this._applyInputRotation(dt);
            this.player.update(dt, this.worldRotator, this.spawner.enemies, worldForward);
            this.spawner.update(dt, this.worldRotator, this.player);
            this.skillSystem.update(dt, this.spawner.enemies);
            this.drops.update(dt, this.player);
            this.home.update(dt, this.player);
            this.homeController.update(dt, this.player);
            if (this.homeController.success) this.paused = true;
            this._checkHomeProximity();
        }

        this.hud.update(this.player, this.spawner, this.homeController);
        this.skillBar.update(dt);

        this._render();
        requestAnimationFrame(this._tick);
    };

    _render() {
        if (this.skybox) {
            this.skybox.quaternion.copy(this.worldRotator.quaternion);
            this.skybox.rotateY(this.skybox.userData.yawOffset ?? 0);
            this.camera.skyCamera.quaternion.copy(this.camera.camera.quaternion);

            this.renderer.autoClear = true;
            this.renderer.render(this.skyScene, this.camera.skyCamera);
            this.renderer.autoClear = false;
            this.renderer.clearDepth();
            this.renderer.render(this.scene, this.camera.camera);
            this.renderer.autoClear = true;
            return;
        }

        this.renderer.render(this.scene, this.camera.camera);
    }

    /** Respawn the player and clear the transient world state. Skill progression
     *  (level, exp, points, allocated ranks) is preserved across deaths so the
     *  player keeps their build. */
    _restart() {
        // Player: heal, reset facing, bring mesh back, snap to north pole.
        this.player.hp = this.player.maxHp;
        this.player.alive = true;
        if (this.player.mesh) this.player.mesh.visible = true;
        this.player.position.set(0, this.surface.radius, 0);
        this.player.forward.set(0, 0, -1);

        // World rotation back to identity so player renders at (0, R, 0)
        // and the sun/landmarks return to their original angles.
        this.worldRotator.quaternion.identity();

        // Despawn every enemy.
        for (const e of this.spawner.enemies) {
            if (e.mesh?.parent) e.mesh.parent.remove(e.mesh);
        }
        this.spawner.enemies.length = 0;
        this.spawner.kills = 0;
        this.spawner._timer = 0;

        // Clear every shard (including ones mid-collect).
        for (const s of this.drops.shards) s.detach();
        this.drops.shards.length = 0;
        this.drops._time = 0;

        // Reset transient skill state (cooldowns, active swing meshes).
        for (const s of this.skillSystem.skills) s.resetRuntime();

        this.homeController.resetRuntime();
        if (this.homePanel?.isOpen()) this.homePanel.close();
        this.paused = false;
        this._wasInHome = false;
    }

    _checkHomeProximity() {
        if (this.homeController.departureState === 'countdown') return;
        const inRange = this.home.isPlayerInRange(this.player);
        if (inRange && !this._wasInHome) {
            this._wasInHome = true;
            this.paused = true;
            this.homePanel.open();
        } else if (!inRange) {
            this._wasInHome = false;
        }
    }

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
