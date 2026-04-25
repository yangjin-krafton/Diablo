// Generic skill trainer building. Configured via an entry from
// CONFIG.npcBuildings (kind: 'skillTrainer'). Replaces the earlier
// per-skill SwordUpgradeNpc.
//
// def shape (see config.js):
//   {
//     kind: 'skillTrainer',
//     targetSkillId: 'sword',
//     sourceTitle: '검술 대장간',
//     modelPath, modelScale, modelLift, modelYawOffset, interactRange,
//     rarity, role, element, band,
//   }

import { NpcBase } from './npc-base.js';
import { SkillTreePanel } from './skill-tree-panel.js';

export class SkillTrainerNpc extends NpcBase {
    constructor(surface, def) {
        super(surface, def);
        this.def = def;
    }

    place() {
        // Skill trainers always come from the placement system. If a session
        // ever ends up calling place() directly, fall back to the home anchor
        // so the NPC is reachable instead of stuck at the origin.
        this.position.set(0, this.surface.radius, 0);
        this.surface.snapToSurface(this.position);
        this.forward.set(0, 0, -1);
        this.orientSelf();
    }

    createPanel(uiRoot, ctx = {}) {
        return new SkillTreePanel(uiRoot, ctx.skillSystem, {
            paymentMode: 'ores',
            wallet: ctx.homeController,
            skillId: this.def.targetSkillId,
            sourceTitle: this.def.sourceTitle ?? '스킬 트레이너',
            onClose: ctx.onClose,
        });
    }
}
