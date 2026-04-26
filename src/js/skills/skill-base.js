// Base class for all skills. Subclasses own runtime effects and tree nodes;
// this class owns shared exp, point allocation, and reset behavior.

export class Skill {
    constructor(player, game) {
        this.player = player;
        this.game = game;

        this.id = this.constructor.id ?? 'skill';
        this.displayName = this.constructor.displayName ?? '스킬';
        this.iconPath = this.constructor.iconPath ?? null;
        this.description = this.constructor.description ?? '';
        this.attackDirectionMode = this.constructor.attackDirectionMode ?? 'moveDirection';

        this.level = 1;
        this.exp = 0;
        this.points = 0;
        this.spent = Object.create(null);
        this.isEmpty = false;
    }

    getNodes() { return []; }

    getExpForLevel(level) {
        return Math.floor(40 * Math.pow(1.3, level - 1));
    }

    costForRankIndex(rankIndexZeroBased) {
        return Math.floor(1 + Math.pow(rankIndexZeroBased, 1.25));
    }

    update(/* dt, ctx */) {}

    getCooldownRemaining() { return 0; }
    getCooldownDuration() { return 1; }
    isEmphasis() { return false; }
    activate() {}
    onNodeChanged() {}
    resetRuntime() {}

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

    expProgress() {
        const need = this.getExpForLevel(this.level);
        return need > 0 ? Math.min(1, this.exp / need) : 0;
    }

    totalRanks() {
        let t = 0;
        for (const k in this.spent) t += this.spent[k];
        return t;
    }

    getNextNodeCost() {
        return this.costForRankIndex(this.totalRanks());
    }

    rankOf(nodeId) { return this.spent[nodeId] ?? 0; }

    nodeById(nodeId) {
        return this.getNodes().find((n) => n.id === nodeId) ?? null;
    }

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

    resetPoints() {
        const total = this.totalRanks();
        let refund = 0;
        for (let i = 0; i < total; i++) refund += this.costForRankIndex(i);
        this.points += refund;
        this.spent = Object.create(null);
        this.onNodeChanged();
    }
}
