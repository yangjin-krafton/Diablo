// Owns the four equipped skills. The game loop ticks this; the skill bar and
// the tree panel both read from it.
//
// Add a new equipped skill: instantiate its class into `skills` and it plugs
// into both the bar and the tree panel automatically — no UI wiring needed.

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
        // Which slot is shown in the skill-tree panel. The skill bar slots
        // double as the panel's tabs — tapping a slot while the panel is
        // open updates this index and triggers the panel to re-render.
        this.selectedIndex = 0;
    }

    update(dt, enemies) {
        const ctx = { enemies };
        for (const s of this.skills) s.update(dt, ctx);
    }

    /** Distribute shard exp to a random non-empty equipped skill. */
    grantShardExp(amount) {
        const real = this.skills.filter((s) => !s.isEmpty);
        if (real.length === 0) return null;
        const picked = real[Math.floor(Math.random() * real.length)];
        picked.addExp(amount);
        return picked;
    }
}
