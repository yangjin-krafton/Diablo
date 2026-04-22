// Tracks skill-shard drops: spawned on enemy death, picked up when the player
// walks within CONFIG.drops.pickupRange. Pickup routes exp into SkillSystem
// and kicks off the shard's collect animation (fly to player + fade).

import { CONFIG } from '../config.js';
import { SkillShard } from '../entities/skill-shard.js';

export class DropSystem {
    constructor(surface, parent, skillSystem) {
        this.surface = surface;
        this.parent = parent;
        this.skillSystem = skillSystem;
        this.shards = [];
        this._time = 0;
    }

    /** Roll the drop chance and (maybe) spawn a shard at position. */
    rollDrop(position) {
        if (Math.random() > CONFIG.drops.shardChance) return;
        const s = new SkillShard(this.surface, position);
        s.attach(this.parent);
        this.shards.push(s);
    }

    update(dt, player) {
        this._time += dt;
        for (let i = this.shards.length - 1; i >= 0; i--) {
            const s = this.shards[i];
            s.update(dt, this._time);

            // Finished collecting → remove from scene
            if (!s.alive) {
                s.detach();
                this.shards.splice(i, 1);
                continue;
            }

            // Don't retry pickup while collecting (the exp was already granted
            // when the collect animation started).
            if (s.isCollecting()) continue;

            const d = this.surface.arcDistance(s.position, player.position);
            if (d < CONFIG.drops.pickupRange) {
                this.skillSystem.grantShardExp(CONFIG.drops.shardExp);
                s.startCollect(player.position);
            }
        }
    }
}
