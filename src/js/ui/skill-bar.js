// Bottom skill bar. Mounts into #skill-bar, builds SkillSlots from a config
// list, and pushes per-frame state into them via update(player).
//
// Each entry in the skills array binds one logical skill to its UI slot.
// Add a new skill by appending an entry and implementing its probes + activate.

import { CONFIG } from '../config.js';
import { SkillSlot } from './skill-slot.js';

export class SkillBar {
    constructor(player) {
        this.root = document.getElementById('skill-bar');
        if (!this.root) throw new Error('SkillBar: #skill-bar not found');
        this._player = player;

        this.slots = [];
        this._skills = [
            {
                id: 'sword',
                icon: './asset/icon.svg',
                cooldownDuration: CONFIG.sword.swingCooldown,
                // per-frame probes
                getCooldownRemaining: (p) => Math.max(0, p._attackTimer ?? 0),
                isEmphasis: (p) => !!p.autoAttack,   // ring spins while auto-cast is on
                isEnabled:  () => true,
                isLocked:   () => false,
                hasLevelUp: () => false,
                // tap to toggle auto-cast
                onActivate: (p) => { p.autoAttack = !p.autoAttack; },
            },
            { id: 'slot-2', icon: null, locked: true },
            { id: 'slot-3', icon: null, locked: true },
            { id: 'slot-4', icon: null, locked: true },
        ];

        for (const s of this._skills) {
            const slot = new SkillSlot({
                id: s.id,
                icon: s.icon,
                onActivate: () => s.onActivate?.(this._player),
            });
            if (s.locked) slot.setLocked(true);
            this.slots.push(slot);
            this.root.appendChild(slot.el);
        }
    }

    update(player) {
        for (let i = 0; i < this._skills.length; i++) {
            const s = this._skills[i];
            const slot = this.slots[i];
            if (s.getCooldownRemaining) {
                slot.setCooldown(s.getCooldownRemaining(player), s.cooldownDuration);
            }
            if (s.isEmphasis) slot.setEmphasis(s.isEmphasis(player));
            if (s.isEnabled)  slot.setEnabled(s.isEnabled(player));
            if (s.isLocked)   slot.setLocked(s.isLocked(player));
            if (s.hasLevelUp) slot.setLevelUp(s.hasLevelUp(player));
        }
    }
}
