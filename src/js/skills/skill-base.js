// Base class for all skills. Subclasses override the hooks marked "override"
// below — everything else (exp, points, allocation, reset) is shared.
//
// Contract:
//   - A Skill owns its own runtime stats, visual effects, cooldown, auto-cast
//     toggle, and tree nodes. The game loop calls update(dt, ctx).
//   - Leveling is driven by addExp(); level-up grants one skill point.
//   - There is no max level. Each allocated rank costs getNextNodeCost() points,
//     which grows super-linearly — the player trades breadth vs depth.
//   - Tree nodes are defined by getNodes(). Each node can be ranked multiple
//     times up to maxRank ("2/5" style). onNodeChanged() rebuilds runtime stats
//     from this.spent so no state is ever manually mutated elsewhere.
//
// Extension recipe:
//   class MySkill extends Skill {
//     static id = 'my-skill';
//     static displayName = '내 스킬';
//     static iconPath = './asset/icons/my-skill.svg';
//     getNodes() { return [...]; }
//     update(dt, ctx) { ... }
//     activate() { ... }            // called when user taps the slot
//     onNodeChanged() { ... }       // rebuild stats from this.spent
//   }

export class Skill {
    constructor(player, game) {
        this.player = player;
        this.game = game;

        this.id = this.constructor.id ?? 'skill';
        this.displayName = this.constructor.displayName ?? 'Skill';
        this.iconPath = this.constructor.iconPath ?? null;
        this.description = this.constructor.description ?? '';

        this.level = 1;
        this.exp = 0;
        this.points = 0;
        this.spent = Object.create(null);    // nodeId -> rank (>=1)
        this.isEmpty = false;                // EmptySkill sets true
    }

    // ==========================================================
    // OVERRIDE: define the skill
    // ==========================================================

    /** Array of node defs. Each:
     *    { id, col, row, maxRank, requires: [ids], name, desc }
     *  col ∈ [0, gridCols), row ∈ [0, gridRows). */
    getNodes() { return []; }

    /** Exp required to level up from `level` to `level+1`. */
    getExpForLevel(level) {
        return Math.floor(40 * Math.pow(1.3, level - 1));
    }

    /** Cost of the next rank allocation, given the running total of ranks
     *  already taken. Default curve: 1, 2, 3, 4, 6, 8, 10, 13, 17, 21, …
     *  Override for a different pacing per skill. */
    costForRankIndex(rankIndexZeroBased) {
        return Math.floor(1 + Math.pow(rankIndexZeroBased, 1.25));
    }

    /** Per-frame update. Override. `ctx = { enemies, dt }`. */
    update(/* dt, ctx */) {}

    /** Current remaining cooldown in seconds (for UI ring/overlay). Override. */
    getCooldownRemaining() { return 0; }
    getCooldownDuration() { return 1; }

    /** Whether the spinning emphasis ring should be on (e.g. auto-cast on). */
    isEmphasis() { return false; }

    /** User tapped the slot. Override for active skills / toggles. */
    activate() {}

    /** Subclass rebuilds runtime stats from this.spent after any tree change. */
    onNodeChanged() {}

    /** Called when the game is restarted (e.g. player death): clear transient
     *  runtime state like cooldown timers, active swing meshes, etc. Allocated
     *  tree nodes, exp, level, and points are preserved. Override per skill. */
    resetRuntime() {}

    // ==========================================================
    // SHARED: leveling, points, allocation, reset
    // ==========================================================

    addExp(amount) {
        if (amount <= 0 || this.isEmpty) return false;
        this.exp += amount;
        let leveledUp = false;
        while (this.exp >= this.getExpForLevel(this.level)) {
            this.exp -= this.getExpForLevel(this.level);
            this.level++;
            this.points++;
            leveledUp = true;
        }
        return leveledUp;
    }

    hasUnspentPoints() { return this.points > 0; }

    /** Normalized exp progress toward next level, 0..1. */
    expProgress() {
        const need = this.getExpForLevel(this.level);
        return need > 0 ? Math.min(1, this.exp / need) : 0;
    }

    /** Total ranks the user has already spent across the tree. */
    totalRanks() {
        let t = 0;
        for (const k in this.spent) t += this.spent[k];
        return t;
    }

    /** Cost, in points, of the next rank purchase. */
    getNextNodeCost() {
        return this.costForRankIndex(this.totalRanks());
    }

    rankOf(nodeId) { return this.spent[nodeId] ?? 0; }

    nodeById(nodeId) {
        return this.getNodes().find((n) => n.id === nodeId) ?? null;
    }

    /** Prerequisites met iff every required node has at least rank 1. */
    _requirementsMet(node) {
        if (!node.requires || node.requires.length === 0) return true;
        return node.requires.every((req) => (this.spent[req] ?? 0) > 0);
    }

    canAllocate(nodeId) {
        const node = this.nodeById(nodeId);
        if (!node) return false;
        if ((this.spent[nodeId] ?? 0) >= node.maxRank) return false;
        if (!this._requirementsMet(node)) return false;
        return this.points >= this.getNextNodeCost();
    }

    allocate(nodeId) {
        if (!this.canAllocate(nodeId)) return false;
        const cost = this.getNextNodeCost();
        this.spent[nodeId] = (this.spent[nodeId] ?? 0) + 1;
        this.points -= cost;
        this.onNodeChanged();
        return true;
    }

    /** Refund every allocated rank at its original cost and wipe the tree. */
    resetPoints() {
        const total = this.totalRanks();
        let refund = 0;
        for (let i = 0; i < total; i++) refund += this.costForRankIndex(i);
        this.points += refund;
        this.spent = Object.create(null);
        this.onNodeChanged();
    }
}
