// Tracks element-shard drops: spawned on enemy death, picked up when the
// player walks within CONFIG.drops.pickupRange. On pickup:
//   - increments the ore counter on the homeController (per-color)
//   - grants exp into the SkillSystem (preserves the skill-shard loop)
//   - kicks off the shard's collect animation (fly to player + fade).
//
// The dropped color is rolled from the active planet's `bias` (see
// docs/drop-resource-design.md §3-4) so the planet you are on dictates
// what mostly drops there.

import { CONFIG } from '../config.js';
import { SkillShard } from '../entities/skill-shard.js';
import { rollElementByBias } from '../data/elements.js';

export class DropSystem {
    constructor(surface, parent, skillSystem, homeController = null) {
        this.surface = surface;
        this.parent = parent;
        this.skillSystem = skillSystem;
        this.homeController = homeController;
        this.shards = [];
        this._time = 0;
    }

    /** Active planet definition from CONFIG. Falls back to a uniform bias if
     *  the configured id is missing. */
    _activePlanet() {
        const id = CONFIG.activePlanet;
        return CONFIG.planets?.[id] ?? { bias: { red: 1, yellow: 1, green: 1, blue: 1, purple: 1 } };
    }

    /** Roll the drop chance and (maybe) spawn a shard at position. */
    rollDrop(position) {
        if (Math.random() > CONFIG.drops.shardChance) return;
        const element = rollElementByBias(this._activePlanet().bias);
        const s = new SkillShard(this.surface, position, element);
        s.attach(this.parent);
        this.shards.push(s);
    }

    /** Force-spawn N shards at `position`, using planet bias for color. Used
     *  by hostile-building destruction to grant a guaranteed reward bundle. */
    spawnBundle(position, count = 1) {
        const bias = this._activePlanet().bias;
        for (let i = 0; i < count; i++) {
            const element = rollElementByBias(bias);
            const s = new SkillShard(this.surface, position, element);
            s.attach(this.parent);
            this.shards.push(s);
        }
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

            // Don't retry pickup while collecting (rewards were already granted
            // when the collect animation started).
            if (s.isCollecting()) continue;

            const d = this.surface.arcDistance(s.position, player.position);
            const range = CONFIG.drops.pickupRange * (this.statsProgression?.pickupRangeMul() ?? 1);
            if (d < range) {
                const rewardMul = this.tier?.rewardMul ?? 1;
                this.skillSystem.grantShardExp(CONFIG.drops.shardExp * rewardMul);
                if (this.homeController) this.homeController.gainOre(s.element, 1);
                s.startCollect(player.position);
            }
        }
    }
}
