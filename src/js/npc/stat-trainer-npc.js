// Generic stat trainer building. Configured via an entry from
// CONFIG.npcBuildings (kind: 'statTrainer'). Each instance trains a single
// stat (def.statId). See §6 of docs/npc-building-distribution-balancing.md.

import { NpcBase } from './npc-base.js';
import { StatTrainerPanel } from './stat-trainer-panel.js';

export class StatTrainerNpc extends NpcBase {
    constructor(surface, def) {
        super(surface, def);
        this.def = def;
    }

    place() {
        // Stat trainers always come from the placement system. Defensive
        // fallback if place() is ever called directly.
        this.position.set(0, this.surface.radius, 0);
        this.surface.snapToSurface(this.position);
        this.forward.set(0, 0, -1);
        this.orientSelf();
    }

    createPanel(uiRoot, ctx = {}) {
        return new StatTrainerPanel(uiRoot, this.def, ctx.statsProgression, ctx.homeController, {
            onClose: ctx.onClose,
        });
    }
}
