// Tracks per-stat ranks earned at NPC stat trainers (see §6 of
// docs/npc-building-distribution-balancing.md).
//
// Each registered stat has:
//   - maxRank, amountPerRank, baseCost, costGrowth, costElements (cycled)
//   - kind: 'absolute' (raises a base value, e.g. maxHp) or 'multiplier'
//     (returned via *Mul() getters that read sites apply on top of CONFIG)
//
// Runtime application:
//   maxHp        — applied immediately to player.maxHp on rank-up
//   moveSpeed    — getter; game.js reads progression.moveSpeedMul()
//   pickupRange  — getter; drop-system reads progression.pickupRangeMul()
//
// Costs are spent through a wallet that exposes canSpendOre / spendOre
// (typically HomeController). Cost element rotates per rank so a long stat
// track demands a mix of resources.

import { CONFIG } from '../config.js';
import { ELEMENT_KEYS } from '../data/elements.js';

export class PlayerStatsProgression {
    constructor(player) {
        this.player = player;
        this.ranks = {};
        this.defs = {};
    }

    /** Register a stat from an `npcBuildings` entry. Idempotent. */
    register(statId, def) {
        if (!statId || !def) return;
        this.defs[statId] = def;
        if (!(statId in this.ranks)) this.ranks[statId] = 0;
        this._applyAbsolute(statId);
    }

    rank(statId) {
        return this.ranks[statId] ?? 0;
    }

    maxRank(statId) {
        return this.defs[statId]?.maxRank ?? 0;
    }

    isMaxed(statId) {
        return this.rank(statId) >= this.maxRank(statId);
    }

    amountPerRank(statId) {
        return this.defs[statId]?.amountPerRank ?? 0;
    }

    /** Return next-rank cost as { key: elementKey, amount }, or null when
     *  the stat is unknown / already maxed. */
    nextCost(statId) {
        const def = this.defs[statId];
        if (!def) return null;
        if (this.isMaxed(statId)) return null;
        const r = this.rank(statId);
        const base = def.baseCost ?? 2;
        const growth = def.costGrowth ?? 1.4;
        const amount = Math.max(1, Math.ceil(base * Math.pow(growth, r)));
        const elements = (def.costElements ?? ELEMENT_KEYS).filter((k) => ELEMENT_KEYS.includes(k));
        const key = elements[r % elements.length] ?? ELEMENT_KEYS[0];
        return { key, amount };
    }

    canUpgrade(statId, wallet) {
        if (this.isMaxed(statId)) return false;
        const cost = this.nextCost(statId);
        if (!cost) return false;
        return wallet?.canSpendOre?.(cost.key, cost.amount) ?? false;
    }

    upgrade(statId, wallet) {
        if (!wallet?.spendOre) return false;
        if (this.isMaxed(statId)) return false;
        const cost = this.nextCost(statId);
        if (!cost) return false;
        if (!wallet.canSpendOre(cost.key, cost.amount)) return false;
        if (!wallet.spendOre(cost.key, cost.amount)) return false;
        this.ranks[statId] = (this.ranks[statId] ?? 0) + 1;
        this._applyAbsolute(statId);
        return true;
    }

    /** Current effect summary string for UI: "+24 HP", "+12% 이속" 등. */
    effectText(statId) {
        const def = this.defs[statId];
        if (!def) return '';
        const r = this.rank(statId);
        const total = r * (def.amountPerRank ?? 0);
        return formatEffect(statId, total, def);
    }

    nextEffectText(statId) {
        const def = this.defs[statId];
        if (!def || this.isMaxed(statId)) return '';
        const r = this.rank(statId) + 1;
        const total = r * (def.amountPerRank ?? 0);
        return formatEffect(statId, total, def);
    }

    // -- multiplier getters -------------------------------------------------

    moveSpeedMul()   { return 1 + this.rank('moveSpeed')   * (this.defs.moveSpeed?.amountPerRank   ?? 0); }
    pickupRangeMul() { return 1 + this.rank('pickupRange') * (this.defs.pickupRange?.amountPerRank ?? 0); }
    damageMul()      { return 1 + this.rank('damage')      * (this.defs.damage?.amountPerRank      ?? 0); }
    attackSpeedMul() { return 1 + this.rank('attackSpeed') * (this.defs.attackSpeed?.amountPerRank ?? 0); }

    // -- internal -----------------------------------------------------------

    _applyAbsolute(statId) {
        if (statId === 'maxHp') {
            const def = this.defs.maxHp;
            const base = CONFIG.player.maxHp;
            const newMax = base + this.rank('maxHp') * (def?.amountPerRank ?? 0);
            const oldMax = this.player.maxHp || base;
            const ratio = oldMax > 0 ? this.player.hp / oldMax : 1;
            this.player.maxHp = newMax;
            // Heal proportionally so a rank-up doesn't chip current HP and
            // doesn't fully heal either.
            this.player.hp = Math.min(newMax, Math.max(0, ratio * newMax));
        }
    }
}

function formatEffect(statId, total, def) {
    if (statId === 'maxHp')        return `최대 HP +${total}`;
    if (statId === 'moveSpeed')    return `이동 속도 +${Math.round(total * 100)}%`;
    if (statId === 'pickupRange')  return `픽업 반경 +${Math.round(total * 100)}%`;
    if (statId === 'damage')       return `피해 +${Math.round(total * 100)}%`;
    if (statId === 'attackSpeed')  return `쿨타임 -${Math.round(total * 100)}%`;
    if (statId === 'critChance')   return `치명 +${Math.round(total * 100)}%`;
    if (statId === 'armor')        return `피해 감소 ${Math.round(total * 100)}%`;
    if (statId === 'hpRegen')      return `초당 회복 +${total.toFixed(1)}`;
    return def?.label ? `${def.label} +${total}` : `+${total}`;
}
