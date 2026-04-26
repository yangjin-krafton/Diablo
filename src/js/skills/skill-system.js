// Owns the equipped skills. The game loop ticks this; UI modules read from it.
//
// Slot model: a fixed-size array of `MAX_SLOTS` entries. The player starts
// with SwordSkill in slot 0 and EmptySkill placeholders in the rest. Trainer
// NPC buildings call `learnSkill(id)` to swap a learnable class into the
// first empty slot. Once every slot is filled, no further skills can be
// learned. NPC/building panels still request skills by id without coupling
// to which slot they live in.

import { SwordSkill } from './sword-skill.js';
import { FirebombSkill } from './firebomb-skill.js';
import { LightningRingSkill } from './lightning-ring-skill.js';
import { BlackHoleSkill } from './black-hole-skill.js';
import { EnergyLaserSkill } from './energy-laser-skill.js';
import { DecoySkill } from './decoy-skill.js';
import { EmptySkill } from './empty-skill.js';

const MAX_SLOTS = 4;

const LEARNABLE_SKILLS = {
    [SwordSkill.id]:        SwordSkill,
    [FirebombSkill.id]:     FirebombSkill,
    [LightningRingSkill.id]: LightningRingSkill,
    [BlackHoleSkill.id]:    BlackHoleSkill,
    [EnergyLaserSkill.id]:  EnergyLaserSkill,
    [DecoySkill.id]:        DecoySkill,
};

export class SkillSystem {
    constructor(player, game) {
        this.player = player;
        this.game = game;
        this.maxSlots = MAX_SLOTS;
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

    aggroTargets() {
        return this.skills.flatMap((skill) => skill.aggroTargets?.() ?? []);
    }

    /** True if the player has already learned the skill with this id. */
    hasSkill(id) {
        const s = this.getSkillById(id);
        return !!(s && !s.isEmpty);
    }

    /** True if at least one slot is still an EmptySkill. */
    hasEmptySlot() {
        return this.skills.some((skill) => skill.isEmpty);
    }

    /** Static metadata of a learnable skill class — used by trainer panels
     *  when the skill is not yet learned and there is no instance to read
     *  displayName/description/iconPath from. */
    getLearnableInfo(id) {
        const cls = LEARNABLE_SKILLS[id];
        if (!cls) return null;
        return {
            id: cls.id,
            displayName: cls.displayName,
            description: cls.description,
            iconPath: cls.iconPath,
        };
    }

    /** True if the skill exists in the registry, isn't already equipped, and
     *  there is room for it. */
    canLearn(id) {
        if (!LEARNABLE_SKILLS[id]) return false;
        if (this.hasSkill(id)) return false;
        return this.hasEmptySlot();
    }

    /** Replace the first EmptySkill with a fresh instance of the requested
     *  learnable skill. Returns the new instance, or null if the request
     *  cannot be satisfied (already learned, all slots full, unknown id). */
    learnSkill(id) {
        if (!this.canLearn(id)) return null;
        const cls = LEARNABLE_SKILLS[id];
        const idx = this.skills.findIndex((skill) => skill.isEmpty);
        if (idx === -1) return null;
        const skill = new cls(this.player, this.game);
        this.skills[idx] = skill;
        return skill;
    }
}
