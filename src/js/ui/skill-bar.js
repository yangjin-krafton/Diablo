// Pixi skill bar. Lays out one SkillSlot per equipped skill at the bottom
// center of the screen, and pushes SkillSystem state into them each frame.
//
// The bar doubles as the skill tree panel's tab row: when the panel is open,
// tapping a slot switches which skill the panel is viewing instead of firing
// the skill's activate(). A thin transparent hit-catcher around the slots
// swallows stray pointerdowns so the panel's backdrop doesn't close the
// panel when the user misses a slot.

import { Container, Graphics } from 'pixi.js';
import { SkillSlot } from './skill-slot.js';

const SLOT_SIZE = 68;
const SLOT_GAP = 10;
const BOTTOM_INSET = 22;

export class SkillBar {
    constructor(uiRoot, skillSystem, skillPanel = null) {
        this.skillSystem = skillSystem;
        this.skillPanel = skillPanel;

        this.root = new Container();
        uiRoot.barLayer.addChild(this.root);

        // transparent rect covering the bar region — swallows pointerdowns
        // in the gaps between slots so they don't fall through to the
        // panel's backdrop and close the panel.
        this._catcher = new Graphics();
        this._catcher.eventMode = 'static';
        this._catcher.on('pointerdown', (e) => e.stopPropagation());
        this.root.addChild(this._catcher);

        this.slots = skillSystem.skills.map((skill, i) => {
            const slot = new SkillSlot({
                id: skill.id,
                size: SLOT_SIZE,
                onActivate: () => this._handleActivate(i, skill),
            });
            slot.setIcon(skill.iconPath);
            this.root.addChild(slot);
            return slot;
        });

        this._unsubscribeResize = uiRoot.onResize((w, h) => this._layout(w, h));
    }

    /** Slot tapped. If the panel is open the tap behaves as a tab switch
     *  (panel also clears its current node selection). Otherwise it triggers
     *  the skill itself (e.g. toggle auto-cast). */
    _handleActivate(i, skill) {
        if (this.skillPanel?.isOpen()) {
            this.skillPanel.selectSkill(i);
            return;
        }
        if (skill.isEmpty) return;
        skill.activate();
    }

    _layout(w, h) {
        const n = this.slots.length;
        const total = n * SLOT_SIZE + (n - 1) * SLOT_GAP;
        const startX = Math.round((w - total) / 2);
        const y = Math.round(h - SLOT_SIZE - BOTTOM_INSET);

        this._catcher
            .clear()
            .rect(startX - 10, y - 10, total + 20, SLOT_SIZE + 20)
            .fill({ color: 0x000000, alpha: 0.001 });

        for (let i = 0; i < n; i++) {
            this.slots[i].position.set(startX + i * (SLOT_SIZE + SLOT_GAP), y);
        }
    }

    update(dt) {
        const skills = this.skillSystem.skills;
        const panelOpen = this.skillPanel?.isOpen() ?? false;
        const selected = this.skillSystem.selectedIndex;
        for (let i = 0; i < skills.length; i++) {
            const skill = skills[i];
            const slot = this.slots[i];
            slot.setLocked(skill.isEmpty);
            slot.setEmphasis(skill.isEmphasis());
            slot.setEnabled(!skill.isEmpty);
            slot.setCooldown(skill.getCooldownRemaining(), skill.getCooldownDuration());
            slot.setLevelUp(skill.hasUnspentPoints());
            slot.setSelected(panelOpen && i === selected);
            slot.update(dt);
        }
    }
}
