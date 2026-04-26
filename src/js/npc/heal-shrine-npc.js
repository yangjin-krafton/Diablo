// HP recovery shrine. Configured via an entry from CONFIG.npcBuildings
// (kind: 'healShrine'). Each instance heals a percentage of the player's
// max HP and then enters a cooldown. The cooldown is tracked in wall-clock
// time (performance.now()) so it keeps elapsing while the panel is open
// and even while the game is paused — useful when the player parks at a
// shrine waiting for it to refresh.
//
// Tier mapping is data-driven via the def fields:
//   healPercent  — fraction of max HP healed per use (0..1)
//   cooldown     — seconds until usable again after a use
//   resetCost    — { key, amount } ore cost to instantly clear cooldown
//
// Higher tiers heal more but cost more time / resources to reset.

import { NpcBase } from './npc-base.js';
import { HealShrinePanel } from './heal-shrine-panel.js';

export class HealShrineNpc extends NpcBase {
    constructor(surface, def) {
        super(surface, def);
        this.def = def;
        this.cooldownEndsAt = 0;          // performance.now() value at cooldown end
        this.cooldownDurationMs = (def.cooldown ?? 0) * 1000;
    }

    place() {
        // Heal shrines come through the placement system. Defensive fallback
        // if place() is ever called directly.
        this.position.set(0, this.surface.radius, 0);
        this.surface.snapToSurface(this.position);
        this.forward.set(0, 0, -1);
        this.orientSelf();
    }

    isReady() {
        return performance.now() >= this.cooldownEndsAt;
    }

    cooldownRemainingSec() {
        return Math.max(0, this.cooldownEndsAt - performance.now()) / 1000;
    }

    cooldownProgress() {
        if (this.cooldownDurationMs <= 0) return 1;
        const remaining = Math.max(0, this.cooldownEndsAt - performance.now());
        return 1 - Math.min(1, remaining / this.cooldownDurationMs);
    }

    /** Heal the player and start the cooldown. Returns true on success. */
    use(player) {
        if (!player?.alive) return false;
        if (!this.isReady()) return false;
        if (player.hp >= player.maxHp) return false;
        const heal = (player.maxHp ?? 100) * (this.def.healPercent ?? 0.5);
        player.hp = Math.min(player.maxHp, player.hp + heal);
        this.cooldownEndsAt = performance.now() + this.cooldownDurationMs;
        return true;
    }

    /** Pay the configured ore cost to immediately clear the cooldown. */
    resetCooldown(wallet) {
        if (this.isReady()) return false;
        const cost = this.def.resetCost;
        if (cost) {
            if (!wallet?.canSpendOre?.(cost.key, cost.amount)) return false;
            if (!wallet.spendOre(cost.key, cost.amount)) return false;
        }
        this.cooldownEndsAt = 0;
        return true;
    }

    createPanel(uiRoot, ctx = {}) {
        return new HealShrinePanel(uiRoot, this, ctx.player, ctx.homeController, {
            onClose: ctx.onClose,
        });
    }
}
