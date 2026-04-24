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
    }

    update(dt, parent, player) {
        // cull dead, accumulate kill count, fire onDeath callback
        let culled = 0;
        this.enemies = this.enemies.filter((e) => {
            if (e.alive) return true;
            this.onDeath?.(e.position);
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

        for (const e of this.enemies) e.update(dt, player);
    }

    _spawn(parent, player) {
        const center = this._bossWave && this._bossFocus ? this._bossFocus.position : player.position;
        const minArc = this._bossWave ? CONFIG.spawner.bossWaveSpawnArcMin : CONFIG.spawner.spawnArcMin;
        const maxArc = this._bossWave ? CONFIG.spawner.bossWaveSpawnArcMax : CONFIG.spawner.spawnArcMax;
        const arc = minArc + Math.random() * (maxArc - minArc);
        this.surface.randomPointAtArc(center, arc, this._spawnPos);

        const options = this._bossWave ? this._bossEnemyOptions() : {};
        const e = new Enemy(this.surface, this._spawnPos, options);
        this.enemies.push(e);
        e.init(parent); // fire-and-forget; mesh appears when loaded
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

    _bossEnemyOptions() {
        this._bossSpawnCount++;
        const elite = this._bossSpawnCount % 6 === 0;
        return elite
            ? { hpScale: 4, damageScale: 1.9, moveSpeedScale: 0.85, modelScale: 1.7 }
            : { hpScale: 1.7, damageScale: 1.35, moveSpeedScale: 1.12, modelScale: 1.15 };
    }
}
