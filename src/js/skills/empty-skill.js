// Placeholder for an unassigned skill slot. Renders locked in the bar and as
// an empty column in the tree panel.

import { Skill } from './skill-base.js';

export class EmptySkill extends Skill {
    constructor(player, game, id, label = '빈 슬롯') {
        super(player, game);
        this.id = id;
        this.displayName = label;
        this.isEmpty = true;
    }
    getNodes() { return []; }
}
