// Enemy spawner on spherical surface. Periodically spawns enemies at a random
// great-circle direction from the player, between spawnArcMin and spawnArcMax
// (arc distance along the surface).

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Enemy } from '../entities/enemy.js';

export class Spawner {
    constructor(surface) {
        this.surface = surface;
        this.enemies = [];
        this.kills = 0;
        this._timer = 0;
        this._spawnPos = new THREE.Vector3();
        this._bossWave = false;
        this._bossFocus = null;
        this._bossSpawnCount = 0;
        this._bossTimer = CONFIG.spawner.bossInterval ?? 60;
        this._patternTimer = CONFIG.spawner.patternInitialDelay ?? 5;
        this._patternCursor = 0;
        this._waveTimer = 0;
        this._waveIndex = 0;
        this._waveModelPath = null;
        this._sourceWaveModelPaths = new Map();
        this.hitSparks = null;
    }

    update(dt, parent, player) {
        this._parent = parent;
        this._updateWaveProgression(dt);
        // cull dead, accumulate kill count, fire onDeath callback
        let culled = 0;
        this.enemies = this.enemies.filter((e) => {
            if (e.alive) return true;
            if (e.updateDeath && !e.updateDeath(dt)) return true;
            this.onDeath?.(e.position, e);
            culled++;
            return false;
        });
        this.kills += culled;

        // spawn
        const maxEnemies = this._bossWave ? CONFIG.spawner.bossWaveMaxEnemies : CONFIG.spawner.maxEnemies;
        const interval = this._bossWave ? CONFIG.spawner.bossWaveInterval : CONFIG.spawner.interval;
        this._timer -= dt;
        if (this._timer <= 0 && this.enemies.length < maxEnemies) {
            this._timer = interval;
            this._spawn(parent, player);
        }

        if (!this._bossWave) {
            this._patternTimer -= dt;
            if (this._patternTimer <= 0) {
                this._patternTimer = CONFIG.spawner.patternInterval ?? 12;
                this._spawnPattern(parent, player);
            }
        }

        this._bossTimer -= dt;
        if (this._bossTimer <= 0) {
            this._bossTimer = CONFIG.spawner.bossInterval ?? 60;
            this._spawnBoss(parent, player);
        }

        for (const e of this.enemies) e.update(dt, player);
    }

    _spawn(parent, player) {
        const center = this._bossWave && this._bossFocus ? this._bossFocus.position : player.position;
        const minArc = this._bossWave ? CONFIG.spawner.bossWaveSpawnArcMin : CONFIG.spawner.spawnArcMin;
        const maxArc = this._bossWave ? CONFIG.spawner.bossWaveSpawnArcMax : CONFIG.spawner.spawnArcMax;
        const arc = minArc + Math.random() * (maxArc - minArc);
        this.surface.randomPointAtArc(center, arc, this._spawnPos);

        const options = this._prepareEnemyOptions(this._bossWave ? this._bossEnemyOptions() : {});
        this._spawnEnemyAt(parent, this._spawnPos, options);
    }

    _spawnBoss(parent, player) {
        const minArc = CONFIG.spawner.bossSpawnArcMin ?? CONFIG.spawner.spawnArcMin;
        const maxArc = CONFIG.spawner.bossSpawnArcMax ?? CONFIG.spawner.spawnArcMax;
        const arc = minArc + Math.random() * (maxArc - minArc);
        this.surface.randomPointAtArc(player.position, arc, this._spawnPos);

        this._spawnEnemyAt(parent, this._spawnPos, this._prepareEnemyOptions({
            modelTier: 'elite',
            modelScale: 2,
            hpScale: 5,
            damageScale: 2,
            moveSpeedScale: 0.82,
            spawnSource: 'boss',
        }));
    }

    _spawnPattern(parent, player) {
        const patterns = ['ring', 'pincer', 'line', 'spiral'];
        const kind = patterns[this._patternCursor % patterns.length];
        this._patternCursor++;

        const max = CONFIG.spawner.patternMaxEnemies ?? CONFIG.spawner.maxEnemies;
        const available = Math.max(0, max - this._activeEnemyCount());
        if (available <= 0) return;

        const baseBearing = Math.random() * Math.PI * 2;
        if (kind === 'ring') {
            this._spawnRingPattern(parent, player, Math.min(available, 12), baseBearing);
        } else if (kind === 'pincer') {
            this._spawnPincerPattern(parent, player, Math.min(available, 10), baseBearing);
        } else if (kind === 'line') {
            this._spawnLinePattern(parent, player, Math.min(available, 9), baseBearing);
        } else {
            this._spawnSpiralPattern(parent, player, Math.min(available, 12), baseBearing);
        }
    }

    _spawnRingPattern(parent, player, count, baseBearing) {
        const arc = this._patternArc(0.74);
        for (let i = 0; i < count; i++) {
            const bearing = baseBearing + i / count * Math.PI * 2;
            this.surface.pointAtArcAndBearing(player.position, arc, bearing, this._spawnPos);
            this._spawnEnemyAt(parent, this._spawnPos, this._prepareEnemyOptions({
                spawnPattern: 'ring',
                difficultyProfile: 'swarm',
                moveSpeedScale: 0.96,
            }));
        }
    }

    _spawnPincerPattern(parent, player, count, baseBearing) {
        const half = Math.ceil(count / 2);
        const arc = this._patternArc(0.58);
        for (let i = 0; i < count; i++) {
            const side = i < half ? 0 : Math.PI;
            const local = (i % half) - (half - 1) * 0.5;
            const bearing = baseBearing + side + local * 0.18;
            this.surface.pointAtArcAndBearing(player.position, arc, bearing, this._spawnPos);
            this._spawnEnemyAt(parent, this._spawnPos, this._prepareEnemyOptions({
                spawnPattern: 'pincer',
                difficultyProfile: 'assault',
                moveSpeedScale: 1.08,
            }));
        }
    }

    _spawnLinePattern(parent, player, count, baseBearing) {
        for (let i = 0; i < count; i++) {
            const offset = i - (count - 1) * 0.5;
            const arc = this._patternArc(0.45 + Math.abs(offset) * 0.035);
            const bearing = baseBearing + offset * 0.14;
            this.surface.pointAtArcAndBearing(player.position, arc, bearing, this._spawnPos);
            this._spawnEnemyAt(parent, this._spawnPos, this._prepareEnemyOptions({
                spawnPattern: 'line',
                difficultyProfile: 'runner',
                moveSpeedScale: 1.18,
                hpScale: 0.9,
            }));
        }
    }

    _spawnSpiralPattern(parent, player, count, baseBearing) {
        for (let i = 0; i < count; i++) {
            const t = count <= 1 ? 0 : i / (count - 1);
            const arc = this._patternArc(0.32 + t * 0.68);
            const bearing = baseBearing + i * 0.62;
            this.surface.pointAtArcAndBearing(player.position, arc, bearing, this._spawnPos);
            this._spawnEnemyAt(parent, this._spawnPos, this._prepareEnemyOptions({
                spawnPattern: 'spiral',
                difficultyProfile: 'mixed',
                moveSpeedScale: 1.12,
                hpScale: 0.85,
            }));
        }
    }

    _spawnEnemyAt(parent, position, options) {
        const e = new Enemy(this.surface, position, options);
        e.hitSparks = this.hitSparks;
        this.enemies.push(e);
        e.init(parent);
        return e;
    }

    _patternArc(t) {
        const min = CONFIG.spawner.patternSpawnArcMin ?? CONFIG.spawner.spawnArcMin;
        const max = CONFIG.spawner.patternSpawnArcMax ?? CONFIG.spawner.spawnArcMax;
        return min + Math.max(0, Math.min(1, t)) * (max - min);
    }

    _activeEnemyCount() {
        let count = 0;
        for (const e of this.enemies) {
            if (e.alive && !e.isHostileBuilding) count++;
        }
        return count;
    }

    /** Multiply the per-spawn HP/damage scales by the active planet tier so
     *  large planets ship harder enemies. Other scales (move/model) pass
     *  through untouched. */
    _prepareEnemyOptions(opts = {}) {
        const scaled = this._applyTier(opts);
        const modelPath = scaled.modelPath ?? this._pickModelPath(scaled);
        return this._applyModelStats({
            ...scaled,
            modelPath,
        });
    }

    _applyTier(opts) {
        const hpMul  = this.tier?.enemyHpMul     ?? 1;
        const dmgMul = this.tier?.enemyDamageMul ?? 1;
        if (hpMul === 1 && dmgMul === 1) return opts;
        return {
            ...opts,
            hpScale: (opts.hpScale ?? 1) * hpMul,
            damageScale: (opts.damageScale ?? 1) * dmgMul,
        };
    }

    startBossWave(focus) {
        this._bossWave = true;
        this._bossFocus = focus;
        this._bossSpawnCount = 0;
        this._timer = 0;
    }

    stopBossWave() {
        this._bossWave = false;
        this._bossFocus = null;
        this._bossSpawnCount = 0;
        this._timer = Math.min(this._timer, CONFIG.spawner.interval);
    }

    isBossWave() {
        return this._bossWave;
    }

    /** Spawn a regular enemy at a random arc-distance point from `centerPos`.
     *  Returns the created Enemy (not yet rendered, init() runs async). Used
     *  by hostile buildings (fortress guards / portal emissions) to inject
     *  enemies into the live world without going through the player-anchored
     *  scheduler. */
    spawnAt(centerPos, arcRadius, options = {}) {
        const parent = this._parent;
        if (!parent) return null;
        this.surface.randomPointAtArc(centerPos, Math.max(0.5, arcRadius), this._spawnPos);
        const e = new Enemy(this.surface, this._spawnPos, this._prepareEnemyOptions(options));
        e.hitSparks = this.hitSparks;
        this.enemies.push(e);
        e.init(parent);
        return e;
    }

    /** Push an already-constructed entity (e.g. a HostileBuilding) into the
     *  enemies array so the existing damage path applies. */
    addExternalTarget(entity) {
        if (entity) entity.hitSparks = this.hitSparks;
        this.enemies.push(entity);
    }

    _bossEnemyOptions() {
        this._bossSpawnCount++;
        const elite = this._bossSpawnCount % 6 === 0;
        return elite
            ? {
                hpScale: 4,
                damageScale: 1.9,
                moveSpeedScale: 0.85,
                modelScale: 2,
                modelTier: 'elite',
            }
            : { hpScale: 1.7, damageScale: 1.35, moveSpeedScale: 1.12, modelScale: 1.15 };
    }

    _pickModelPath(options = {}) {
        const groups = CONFIG.enemy.modelGroups ?? {};
        const planetId = CONFIG.activePlanet;
        const source = options.spawnSource;
        const profile = this._difficultyProfileFor(options);

        if (options.modelTier === 'elite') {
            return weightedModelFrom(groups.elite?.[planetId], profile)
                ?? weightedModelFrom(CONFIG.enemy.eliteModelPaths, profile)
                ?? CONFIG.enemy.modelPath;
        }

        if (source && groups.source?.[source]) {
            return this._currentSourceWaveModelPath(source, profile) ?? CONFIG.enemy.modelPath;
        }

        return this._currentWaveModelPath(profile);
    }

    _updateWaveProgression(dt) {
        const duration = CONFIG.spawner.waveDuration ?? 35;
        if (duration <= 0) return;

        this._waveTimer += dt;
        if (!this._waveModelPath || this._waveTimer >= duration) {
            if (this._waveModelPath) {
                this._waveIndex++;
                this._clearWaveEnemies();
            }
            this._waveTimer %= duration;
            this._waveModelPath = null;
            this._sourceWaveModelPaths.clear();
        }
    }

    _clearWaveEnemies() {
        this.enemies = this.enemies.filter((e) => {
            if (e.isHostileBuilding || e.spawnSource === 'boss') return true;
            e.alive = false;
            if (e.mesh?.parent) e.mesh.parent.remove(e.mesh);
            return false;
        });
    }

    _currentWaveModelPath(profile) {
        if (!this._waveModelPath) {
            this._waveModelPath = this._pickWaveModelPath(profile);
        }
        return this._waveModelPath;
    }

    _currentSourceWaveModelPath(source, profile) {
        if (!this._sourceWaveModelPaths.has(source)) {
            const groups = CONFIG.enemy.modelGroups ?? {};
            this._sourceWaveModelPaths.set(
                source,
                this._pickWaveModelPath(profile, groups.source?.[source]),
            );
        }
        return this._sourceWaveModelPaths.get(source);
    }

    _pickWaveModelPath(profile, sourceCandidates = null) {
        const groups = CONFIG.enemy.modelGroups ?? {};
        const planetId = CONFIG.activePlanet;
        const candidates = uniquePaths(sourceCandidates ?? [
            ...(groups.planet?.[planetId] ?? []),
            ...(groups.common ?? []),
            ...(CONFIG.enemy.modelPaths ?? []),
            CONFIG.enemy.modelPath,
        ]);

        const allowed = WAVE_TIER_SEQUENCE[Math.min(this._waveIndex, WAVE_TIER_SEQUENCE.length - 1)];
        return weightedModelFrom(candidates.filter((path) => allowed.includes(enemyDifficultyTier(path))), profile)
            ?? weightedModelFrom(candidates, profile)
            ?? CONFIG.enemy.modelPath;
    }

    _difficultyProfileFor(options = {}) {
        if (options.difficultyProfile) return options.difficultyProfile;
        if (this._bossWave) return 'bossWave';
        if (options.spawnSource === 'boss') return 'boss';
        if (options.spawnSource === 'fortress') return 'assault';
        if (options.spawnSource === 'portal') return 'mixed';
        if (options.spawnSource === 'dropShip') return 'heavy';
        return 'ambient';
    }

    _applyModelStats(options) {
        const stats = CONFIG.enemy.modelStats?.[options.modelPath];
        if (!stats) return options;
        return {
            ...options,
            difficultyTier: enemyDifficultyTier(options.modelPath),
            hpScale: multiplyOption(options.hpScale, stats.hpScale),
            damageScale: multiplyOption(options.damageScale, stats.damageScale),
            moveSpeedScale: multiplyOption(options.moveSpeedScale, stats.moveSpeedScale),
            radiusScale: multiplyOption(options.radiusScale ?? options.modelScale, stats.radiusScale),
        };
    }
}

function randomFrom(list) {
    if (!Array.isArray(list) || list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
}

function multiplyOption(value, mul) {
    return (value ?? 1) * (mul ?? 1);
}

const DIFFICULTY_PROFILES = {
    ambient:  { fodder: 5.0, standard: 4.0, tough: 1.0, elite: 0.0 },
    swarm:    { fodder: 8.0, standard: 3.0, tough: 0.6, elite: 0.0 },
    runner:   { fodder: 5.5, standard: 4.0, tough: 0.4, elite: 0.0 },
    assault:  { fodder: 2.5, standard: 5.0, tough: 2.2, elite: 0.0 },
    mixed:    { fodder: 3.0, standard: 4.5, tough: 2.0, elite: 0.0 },
    heavy:    { fodder: 1.0, standard: 3.0, tough: 5.0, elite: 0.0 },
    bossWave: { fodder: 1.0, standard: 3.2, tough: 4.2, elite: 0.6 },
    boss:     { fodder: 0.0, standard: 0.0, tough: 0.0, elite: 1.0 },
};

const WAVE_TIER_SEQUENCE = [
    ['fodder'],
    ['fodder'],
    ['standard'],
    ['standard'],
    ['tough'],
    ['tough'],
];

function weightedModelFrom(list, profileName = 'ambient') {
    if (!Array.isArray(list) || list.length === 0) return null;

    const profile = DIFFICULTY_PROFILES[profileName] ?? DIFFICULTY_PROFILES.ambient;
    let total = 0;
    const weighted = [];
    for (const path of list) {
        const tier = enemyDifficultyTier(path);
        const weight = profile[tier] ?? 1;
        if (weight <= 0) continue;
        total += weight;
        weighted.push({ path, weight });
    }

    if (total <= 0) return randomFrom(list);

    let roll = Math.random() * total;
    for (const item of weighted) {
        roll -= item.weight;
        if (roll <= 0) return item.path;
    }
    return weighted[weighted.length - 1]?.path ?? randomFrom(list);
}

function uniquePaths(paths) {
    const seen = new Set();
    const out = [];
    for (const path of paths) {
        if (!path || seen.has(path)) continue;
        seen.add(path);
        out.push(path);
    }
    return out;
}

function enemyDifficultyTier(path) {
    if (path?.includes('/boss/')) return 'elite';

    const stats = CONFIG.enemy.modelStats?.[path];
    if (!stats) return 'standard';

    const hp = stats.hpScale ?? 1;
    const damage = stats.damageScale ?? 1;
    const speed = stats.moveSpeedScale ?? 1;
    const radius = stats.radiusScale ?? 1;
    const score = hp * 0.4 + damage * 0.35 + speed * 0.15 + radius * 0.1;

    if (score < 0.95) return 'fodder';
    if (score < 1.28) return 'standard';
    return 'tough';
}
