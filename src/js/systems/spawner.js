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
        this._timer -= dt;
        if (this._timer <= 0 && this.enemies.length < CONFIG.spawner.maxEnemies) {
            this._timer = CONFIG.spawner.interval;
            this._spawn(parent, player);
        }

        for (const e of this.enemies) e.update(dt, player);
    }

    _spawn(parent, player) {
        const arc =
            CONFIG.spawner.spawnArcMin +
            Math.random() * (CONFIG.spawner.spawnArcMax - CONFIG.spawner.spawnArcMin);
        this.surface.randomPointAtArc(player.position, arc, this._spawnPos);
        const e = new Enemy(this.surface, this._spawnPos);
        this.enemies.push(e);
        e.init(parent); // fire-and-forget; mesh appears when loaded
    }
}
