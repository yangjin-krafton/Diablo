// Pixi skill bar. Neon bottom control strip for equipped skills.

import { Container, Graphics } from 'pixi.js';
import { NEON, neonPanel } from './neon-theme.js';
import { SkillSlot } from './skill-slot.js';

const SLOT_SIZE = 66;
const SLOT_GAP = 10;
const BOTTOM_INSET = 18;

export class SkillBar {
    constructor(uiRoot, skillSystem) {
        this.skillSystem = skillSystem;

        this.root = new Container();
        uiRoot.barLayer.addChild(this.root);

        this._catcher = new Graphics();
        this._catcher.eventMode = 'static';
        this._catcher.on('pointerdown', (e) => e.stopPropagation());
        this.root.addChild(this._catcher);

        this._frame = this.root.addChild(new Graphics());

        // Bind activate to the slot index, not to the skill instance: the
        // skill at a given index can be replaced (EmptySkill → real skill)
        // when a trainer NPC teaches the player a new skill, and clicking the
        // slot must activate whatever lives there *now*.
        this.slots = skillSystem.skills.map((skill, i) => {
            const slot = new SkillSlot({
                id: skill.id,
                size: SLOT_SIZE,
                onActivate: () => this._handleActivate(i),
            });
            slot.setIcon(skill.iconPath);
            this.root.addChild(slot);
            return slot;
        });

        this._unsubscribeResize = uiRoot.onResize((w, h) => this._layout(w, h));
    }

    _handleActivate(i) {
        const skill = this.skillSystem.skills[i];
        if (!skill || skill.isEmpty) return;
        skill.activate();
    }

    _layout(w, h) {
        const n = this.slots.length;
        const total = n * SLOT_SIZE + (n - 1) * SLOT_GAP;
        const framePad = 12;
        const scale = Math.min(1, Math.max(0.72, (w - framePad * 2 - 12) / total));
        const scaledTotal = total * scale;
        const scaledSlot = SLOT_SIZE * scale;
        const scaledGap = SLOT_GAP * scale;
        const frameW = scaledTotal + framePad * 2;
        const frameH = scaledSlot + framePad * 2;
        const startX = Math.round((w - scaledTotal) / 2);
        const y = Math.round(h - scaledSlot - BOTTOM_INSET);
        const frameX = startX - framePad;
        const frameY = y - framePad;

        this._catcher
            .clear()
            .rect(frameX, frameY, frameW, frameH)
            .fill({ color: 0x000000, alpha: 0.001 });

        this._frame.clear();
        neonPanel(this._frame, frameX, frameY, frameW, frameH, {
            fill: NEON.PANEL,
            stroke: NEON.CYAN,
            alpha: 0.58,
            strokeAlpha: 0.30,
            cut: 18,
        });

        for (let i = 0; i < n; i++) {
            this.slots[i].scale.set(scale);
            this.slots[i].position.set(startX + i * (scaledSlot + scaledGap), y);
        }
    }

    update(dt) {
        const skills = this.skillSystem.skills;
        for (let i = 0; i < skills.length; i++) {
            const skill = skills[i];
            const slot = this.slots[i];
            // setIcon short-circuits when the URL hasn't changed, so calling
            // it every tick is cheap and lets newly-learned skills show up.
            slot.setIcon(skill.iconPath);
            slot.setLocked(skill.isEmpty);
            slot.setEmphasis(skill.isEmphasis());
            slot.setEnabled(!skill.isEmpty);
            slot.setCooldown(skill.getCooldownRemaining(), skill.getCooldownDuration());
            slot.setLevelUp(skill.hasUnspentPoints());
            slot.update(dt);
        }
    }
}
