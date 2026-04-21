// Enemy spawner. Periodically creates enemies around the player up to maxEnemies.
// Also drives per-frame enemy updates and cleans up dead enemies.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Enemy } from '../entities/enemy.js';

export class Spawner {
    constructor() {
        this.enemies = [];
        this.kills = 0;
        this._timer = 0;
    }

    update(dt, scene, player) {
        // cull dead
        let culled = 0;
        this.enemies = this.enemies.filter((e) => {
            if (e.alive) return true;
            culled++;
            return false;
        });
        this.kills += culled;

        // spawn
        this._timer -= dt;
        if (this._timer <= 0 && this.enemies.length < CONFIG.spawner.maxEnemies) {
            this._timer = CONFIG.spawner.interval;
            this._spawn(scene, player);
        }

        // drive enemies
        for (const e of this.enemies) e.update(dt, player);
    }

    _spawn(scene, player) {
        const angle = Math.random() * Math.PI * 2;
        const r =
            CONFIG.spawner.spawnRadiusMin +
            Math.random() * (CONFIG.spawner.spawnRadiusMax - CONFIG.spawner.spawnRadiusMin);
        const pos = new THREE.Vector3(
            player.position.x + Math.cos(angle) * r,
            0,
            player.position.z + Math.sin(angle) * r,
        );
        const e = new Enemy(pos);
        this.enemies.push(e);
        e.init(scene); // fire-and-forget; mesh appears when loaded
    }
}
