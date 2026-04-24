// Owns the equipped skills. The game loop ticks this; UI modules read from it.
//
// Add a new equipped skill by instantiating it in `skills`. NPC/building panels
// can then request that skill by id without coupling to the bottom skill bar.

import { SwordSkill } from './sword-skill.js';
import { EmptySkill } from './empty-skill.js';

export class SkillSystem {
    constructor(player, game) {
        this.player = player;
        this.game = game;
        this.skills = [
            new SwordSkill(player, game),
            new EmptySkill(player, game, 'slot-2'),
            new EmptySkill(player, game, 'slot-3'),
            new EmptySkill(player, game, 'slot-4'),
        ];
    }

    update(dt, enemies) {
        const ctx = { enemies };
        for (const skill of this.skills) skill.update(dt, ctx);
    }

    /** Distribute shard exp to a random non-empty equipped skill. */
    grantShardExp(amount) {
        const trainable = this.skills.filter((skill) => !skill.isEmpty);
        if (trainable.length === 0) return null;
        const picked = trainable[Math.floor(Math.random() * trainable.length)];
        picked.addExp(amount);
        return picked;
    }

    getSkillById(id) {
        return this.skills.find((skill) => skill.id === id) ?? null;
    }

    firstTrainableSkill() {
        return this.skills.find((skill) => !skill.isEmpty) ?? null;
    }
}
