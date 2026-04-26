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
import { SkillTrainerNpc } from './npc/skill-trainer-npc.js';
import { StatTrainerNpc } from './npc/stat-trainer-npc.js';
import { Spawner } from './systems/spawner.js';
import { DropSystem } from './systems/drop-system.js';
import { HomeController } from './systems/home-controller.js';
import { NpcBuildingPlacement } from './systems/npc-building-placement.js';
import { PlayerStatsProgression } from './systems/player-stats-progression.js';
import { HostileBuildingSystem } from './systems/hostile-building-system.js';
import { HitSparkSystem } from './systems/hit-spark-system.js';
import { SkillSystem } from './skills/skill-system.js';
import { UIRoot } from './ui/ui-root.js';
import { Hud } from './hud.js';
import { SkillBar } from './ui/skill-bar.js';
import { PlayerHpBar } from './ui/player-hp-bar.js';
import { ScreenDamageEffect } from './ui/screen-damage-effect.js';
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

        // Pick the planet tier (소/중/대) and sample a radius from its band.
        // This drives every downstream multiplier: building counts, enemy
        // difficulty, drop rewards, and the actual sphere geometry.
        this.tier = pickPlanetTier();
        const radius = pickPlanetRadius(this.tier);
        console.log(`[Diablo] planet tier=${this.tier?.label ?? '—'} (${this.tier?.key}) radius=${radius.toFixed(1)}`);

        this.surface = new SphereSurface(radius);
        const { scene, worldRotator, skyScene, skybox, upgradePlanetMaterial } = createScene(this.surface);
        this.scene = scene;
        this.worldRotator = worldRotator;
        this.skyScene = skyScene;
        this.skybox = skybox;

        const aspect = this._sizePixels().w / this._sizePixels().h;
        this.camera = new StaticCamera(aspect, this.surface);

        // Camera now exists — kick off the async PBR planet material
        // upgrade. Texture loading + shader pre-compile run in the
        // background; the procedural material renders meanwhile, and the
        // swap happens once the GPU program is hot. Avoids the ~1s
        // shader-compile stall that would otherwise hit the first frame
        // after the new material is bound.
        upgradePlanetMaterial(this.renderer, this.camera.camera).then((mat) => {
            if (mat) console.log('[Diablo] planet material upgraded (precompiled)');
        }).catch(() => {});
        this.input = new InputState();
        this.player = new Player(this.surface);
        this.home = new HomeNpc(this.surface);
        this.spawner = new Spawner(this.surface);
        this.spawner.tier = this.tier;
        this.hitSparks = new HitSparkSystem(this.surface, this.worldRotator);
        this.spawner.hitSparks = this.hitSparks;
        this.player.hitSparks = this.hitSparks;
        this.homeController = new HomeController(this.home, this.spawner);
        this.statsProgression = new PlayerStatsProgression(this.player);

        this.skillSystem = new SkillSystem(this.player, this);
        this.drops = new DropSystem(this.surface, this.worldRotator, this.skillSystem, this.homeController);
        this.drops.statsProgression = this.statsProgression;
        this.drops.tier = this.tier;
        this.hostiles = new HostileBuildingSystem(
            this.surface, this.worldRotator, this.spawner, this.drops, this.player, this.camera.camera,
        );
        this.hostiles.tier = this.tier;
        this.spawner.onDeath = (pos, entity) => {
            // Standard ore-shard roll for everything that dies (incl. hostile
            // buildings — bonus drops layer on top via hostiles.onDeath).
            this.drops.rollDrop(pos);
            this.hostiles.onDeath(pos, entity);
        };

        // UI is mounted after Pixi finishes initializing (async, see start()).
        this.ui = new UIRoot();
        this.hud = null;
        this.skillBar = null;
        this.homePanel = null;
        this.screenDamage = new ScreenDamageEffect();
        this._lastPlayerHp = this.player.hp;

        // npcBuildings — populated by start() from CONFIG.npcBuildings.
        // Each entry: { id, def, npc, panel, _wasInRange }.
        this.npcBuildings = [];

        this.paused = false;
        this._wasInHome = false;

        this._last = 0;

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    async start() {
        const registry = CONFIG.npcBuildings ?? {};
        const hostiles = CONFIG.hostileBuildings ?? {};
        const registryModelPaths = Object.values(registry).map((def) => def.modelPath).filter(Boolean);
        const hostileModelPaths = Object.values(hostiles).map((def) => def.modelPath).filter(Boolean);
        const enemyModelPaths = collectEnemyModelPaths();

        await Promise.all([
            preload([
                CONFIG.player.modelPath,
                CONFIG.home.modelPath,
                ...registryModelPaths,
                ...hostileModelPaths,
                ...enemyModelPaths,
            ]),
            this.ui.ready,
        ]);
        await this.player.init(this.worldRotator);

        // 3D HP bar floats over the player's head. Lives in the scene root
        // (NOT worldRotator) so it stays at the static visual player slot
        // while the planet rotates beneath.
        this.playerHpBar = new PlayerHpBar(this.scene, this.camera.camera, this.surface, this.player);

        // Home is anchored at the start area (fixed by HomeNpc.place()).
        // Other NPC buildings flow through the placement system, which respects
        // rarity-based distance bands and minimum spacing.
        // See docs/npc-building-distribution-balancing.md.
        await this.home.init(this.worldRotator);

        const playerSpawn = new THREE.Vector3(0, this.surface.radius, 0);
        const placement = new NpcBuildingPlacement(this.surface, playerSpawn);
        placement.register('home', this.home.position, 'home');

        // Walk the registry, instantiate each NPC by `kind`, place it through
        // the placement system, and register stat trainers with the
        // progression controller. `count: { min, max }` lets a single entry
        // produce multiple instances per planet (§6-3 of the design doc).
        const npcMul = this.tier?.npcCountMul ?? 1;
        const hostileMul = this.tier?.hostileCountMul ?? 1;

        for (const [id, def] of Object.entries(registry)) {
            if (def.kind === 'statTrainer') this.statsProgression.register(def.statId, def);

            const instanceCount = scaleCount(pickInstanceCount(def.count), npcMul);
            for (let i = 0; i < instanceCount; i++) {
                const npc = this._buildNpcFromDef(def);
                if (!npc) {
                    console.warn(`[Diablo] unknown npcBuilding kind: ${def.kind} (id=${id})`);
                    break;
                }
                const instId = instanceCount > 1 ? `${id}#${i + 1}` : id;
                const pos = placement.placeBuilding(instId, def);
                await npc.init(this.worldRotator, pos);
                this.npcBuildings.push({ id: instId, def, npc, panel: null, _wasInRange: false });
            }
        }

        // Hostile buildings (요새 / 차원문). Placed in their own bands; the
        // dropship event has no permanent structure and is driven by the
        // HostileBuildingSystem's internal timer.
        for (const [hostileId, def] of Object.entries(hostiles)) {
            if (def.kind !== 'fortress' && def.kind !== 'portal') continue;
            const cnt = scaleCount(pickInstanceCount(def.count), hostileMul);
            for (let i = 0; i < cnt; i++) {
                const instId = cnt > 1 ? `${hostileId}#${i + 1}` : hostileId;
                const pos = placement.placeBuilding(instId, def);
                await this.hostiles.addBuilding(def, pos);
            }
        }

        this.placement = placement;

        // Pixi is ready. The home panel is opened by NPC/building
        // interactions; the bottom skill bar only activates equipped skills.
        this.hud = new Hud(this.ui);
        this.homePanel = this.home.createPanel(this.ui, this.homeController, {
            onClose: () => { this.paused = false; },
        });

        const npcCtx = {
            skillSystem: this.skillSystem,
            homeController: this.homeController,
            statsProgression: this.statsProgression,
            onClose: () => { this.paused = false; },
        };
        for (const entry of this.npcBuildings) {
            entry.panel = entry.npc.createPanel(this.ui, npcCtx);
        }

        this.skillBar = new SkillBar(this.ui, this.skillSystem);

        const loading = document.getElementById('loading');
        if (loading) loading.classList.add('hidden');

        this._last = performance.now();
        requestAnimationFrame(this._tick);
    }

    _buildNpcFromDef(def) {
        if (def.kind === 'skillTrainer') return new SkillTrainerNpc(this.surface, def);
        if (def.kind === 'statTrainer')  return new StatTrainerNpc(this.surface, def);
        return null;
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
            for (const entry of this.npcBuildings) entry.npc.update(dt, this.player);
            this.hostiles.update(dt);
            this.homeController.update(dt, this.player);
            if (this.homeController.success) this.paused = true;
            this._checkHomeProximity();
            this._checkNpcBuildingProximity();
        } else {
            this.player.updateMotion(dt);
        }
        this.hitSparks.update(dt);
        this._updateScreenDamage(dt);

        this.hud.update(this.player, this.spawner, this.homeController);
        this.skillBar.update(dt);
        this.playerHpBar?.update();

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
        this._lastPlayerHp = this.player.hp;
        this.screenDamage.reset(this.player.hp, this.player.maxHp);
        if (this.player.mesh) this.player.mesh.visible = true;
        this.player.position.set(0, this.surface.radius, 0);
        this.player.forward.set(0, 0, -1);

        // World rotation back to identity so player renders at (0, R, 0)
        // and the sun/landmarks return to their original angles.
        this.worldRotator.quaternion.identity();

        // Despawn enemies but keep hostile-building entities so the world
        // structure persists across player respawns. Mark wiped enemies as
        // not-alive so any holders (e.g. Fortress.guards) drop their refs.
        const survivors = [];
        for (const e of this.spawner.enemies) {
            if (e.isHostileBuilding) {
                survivors.push(e);
                continue;
            }
            e.alive = false;
            if (e.mesh?.parent) e.mesh.parent.remove(e.mesh);
        }
        this.spawner.enemies = survivors;
        // Drop stale guard refs so fortresses immediately start reinforcing.
        for (const b of survivors) {
            if (Array.isArray(b.guards)) b.guards.length = 0;
        }
        this.spawner.kills = 0;
        this.spawner._timer = 0;
        this.spawner._bossTimer = CONFIG.spawner.bossInterval ?? 60;
        this.spawner._patternTimer = CONFIG.spawner.patternInitialDelay ?? 5;
        this.spawner._patternCursor = 0;
        this.spawner._waveTimer = 0;
        this.spawner._waveIndex = 0;
        this.spawner._waveModelPath = null;
        this.spawner._sourceWaveModelPaths?.clear?.();

        // Clear every shard (including ones mid-collect).
        for (const s of this.drops.shards) s.detach();
        this.drops.shards.length = 0;
        this.drops._time = 0;
        this.hitSparks.clear();

        // Reset transient skill state (cooldowns, active swing meshes).
        for (const s of this.skillSystem.skills) s.resetRuntime();

        this.homeController.resetRuntime();
        this.hostiles?.resetForRespawn();
        if (this.homePanel?.isOpen()) this.homePanel.close();
        for (const entry of this.npcBuildings) {
            if (entry.panel?.isOpen?.()) entry.panel.close();
            entry._wasInRange = false;
        }
        this.paused = false;
        this._wasInHome = false;
    }

    _checkHomeProximity() {
        if (this.homeController.departureState === 'countdown') return;
        const inRange = this.home.isPlayerInRange(this.player);
        if (inRange && !this._wasInHome) {
            this._wasInHome = true;
            this.player.motion?.bounce(0.9);
            this.paused = true;
            this.homePanel.open();
        } else if (!inRange) {
            this._wasInHome = false;
        }
    }

    _checkNpcBuildingProximity() {
        for (const entry of this.npcBuildings) {
            const inRange = entry.npc.isPlayerInRange(this.player);
            if (inRange && !entry._wasInRange) {
                entry._wasInRange = true;
                this.player.motion?.bounce(0.9);
                this.paused = true;
                entry.panel?.open?.({ sourceId: entry.id, skillId: entry.def.targetSkillId });
                return; // only one panel at a time
            } else if (!inRange) {
                entry._wasInRange = false;
            }
        }
    }

    _updateScreenDamage(dt) {
        if (this.player.hp < this._lastPlayerHp) {
            this.screenDamage.hit();
        }
        this._lastPlayerHp = this.player.hp;
        this.screenDamage.update(dt, this.player.hp, this.player.maxHp);
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
        const speed = CONFIG.player.moveSpeed * (this.statsProgression?.moveSpeedMul() ?? 1);
        const angle = (mag * speed * dt) / this.surface.radius;
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

function pickInstanceCount(range) {
    if (!range) return 1;
    const min = Math.max(0, range.min ?? 1);
    const max = Math.max(min, range.max ?? min);
    return min + Math.floor(Math.random() * (max - min + 1));
}

/** Multiply an integer count by a tier multiplier and round, but never drop
 *  below 1 if the original count was at least 1 (so smaller planets still
 *  see at least one of each registered building type). */
function scaleCount(baseCount, mul) {
    if (baseCount <= 0) return 0;
    return Math.max(1, Math.round(baseCount * (mul ?? 1)));
}

/** Pick a planet size tier from CONFIG.planetSize.tiers using `weight`. */
function pickPlanetTier() {
    const tiers = CONFIG.planetSize?.tiers;
    if (!tiers) return null;
    const entries = Object.values(tiers);
    if (entries.length === 0) return null;
    let total = 0;
    for (const t of entries) total += Math.max(0, t.weight ?? 1);
    let r = Math.random() * total;
    for (const t of entries) {
        r -= Math.max(0, t.weight ?? 1);
        if (r <= 0) return t;
    }
    return entries[entries.length - 1];
}

function pickPlanetRadius(tier) {
    if (!tier?.radius) return CONFIG.world.planetRadius;
    const { min, max } = tier.radius;
    return min + Math.random() * Math.max(0, max - min);
}

function collectEnemyModelPaths() {
    const set = new Set([
        CONFIG.enemy.modelPath,
        ...(CONFIG.enemy.modelPaths ?? []),
        ...(CONFIG.enemy.eliteModelPaths ?? []),
    ].filter(Boolean));

    const walk = (value) => {
        if (!value) return;
        if (typeof value === 'string') {
            set.add(value);
            return;
        }
        if (Array.isArray(value)) {
            for (const item of value) walk(item);
            return;
        }
        if (typeof value === 'object') {
            for (const item of Object.values(value)) walk(item);
        }
    };
    walk(CONFIG.enemy.modelGroups);
    return Array.from(set);
}
