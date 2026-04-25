// NPC/building-owned skill tree panel, rendered in the neon UI style.

import { Container, Graphics } from 'pixi.js';
import { ELEMENT_KEYS, ELEMENTS, ELEMENT_HEX } from '../data/elements.js';
import { FONT_MONO, FONT_UI, NEON, fitText, makeText, neonButton, neonPanel } from '../ui/neon-theme.js';

const DEFAULT_SKILL_ID = 'sword';
const SCREEN_MARGIN = 12;
const PAD = 16;
const GAP = 12;
const TREE_COLS = 3;
const TREE_ROWS = 5;

class Button extends Container {
    constructor({ width, height, onClick, cursor = 'pointer' }) {
        super();
        this._w = width;
        this._h = height;
        this.eventMode = 'static';
        this.cursor = cursor;
        this.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x < this._w && y < this._h };
        this.on('pointerdown', (e) => {
            e.stopPropagation();
            onClick?.(this);
        });
    }
}

export class SkillTreePanel {
    constructor(uiRoot, skillSystem, {
        onClose,
        paymentMode = 'points',
        wallet = null,
        skillId = DEFAULT_SKILL_ID,
        sourceTitle = '',
    } = {}) {
        this.uiRoot = uiRoot;
        this.skillSystem = skillSystem;
        this._onClose = onClose ?? (() => {});
        this._paymentMode = paymentMode;
        this._wallet = wallet;
        this._defaultSkillId = skillId;
        this._sourceTitle = sourceTitle;

        this._open = false;
        this._sourceId = null;
        this._currentSkill = null;
        this._hoverNode = null;
        this._selectedNode = null;

        this.root = new Container();
        this.root.visible = false;
        uiRoot.panelLayer.addChild(this.root);

        this.backdrop = new Graphics();
        this.backdrop.eventMode = 'static';
        this.backdrop.hitArea = { contains: () => true };
        this.backdrop.on('pointerdown', () => this.close());
        this.root.addChild(this.backdrop);

        this.modal = new Container();
        this.modal.eventMode = 'static';
        this.modal.on('pointerdown', (e) => e.stopPropagation());
        this.root.addChild(this.modal);

        this._unsub = uiRoot.onResize((w, h) => this._layout(w, h));
    }

    isOpen() {
        return this._open;
    }

    open({ sourceId = 'home', skillId = this._defaultSkillId } = {}) {
        const skill = this.skillSystem.getSkillById(skillId) ?? this.skillSystem.firstTrainableSkill();
        if (!skill || skill.isEmpty) return;

        this.uiRoot.setSkillBarVisible(false);
        this._open = true;
        this._sourceId = sourceId;
        this._currentSkill = skill;
        this._hoverNode = null;
        this._selectedNode = null;
        this.root.visible = true;
        this._render();
    }

    close() {
        this._open = false;
        this._sourceId = null;
        this._selectedNode = null;
        this.root.visible = false;
        this.uiRoot.setSkillBarVisible(true);
        this._onClose();
    }

    _layout(w, h) {
        this.backdrop
            .clear()
            .rect(0, 0, w, h)
            .fill({ color: NEON.BG_DK, alpha: 0.86 })
            .circle(w * 0.18, h * 0.12, Math.max(w, h) * 0.24)
            .fill({ color: NEON.CYAN, alpha: 0.13 })
            .circle(w * 0.88, h * 0.88, Math.max(w, h) * 0.26)
            .fill({ color: NEON.MAGENTA, alpha: 0.14 });

        this._modalW = Math.min(820, w - SCREEN_MARGIN * 2);
        this._modalH = Math.min(700, h - SCREEN_MARGIN * 2);
        this.modal.position.set(
            Math.round((w - this._modalW) / 2),
            Math.round((h - this._modalH) / 2),
        );
        this.modal.hitArea = {
            contains: (x, y) => x >= 0 && y >= 0 && x < this._modalW && y < this._modalH,
        };
        if (this._open) this._render();
    }

    _render() {
        this.modal.removeChildren();
        if (!this._currentSkill) return;

        const w = this._modalW;
        const h = this._modalH;
        this._drawChassis();
        this._drawCloseButton();

        const bodyY = PAD;
        const bodyH = h - PAD * 2;
        const upperH = Math.round(Math.min(245, Math.max(190, bodyH * 0.38)));
        const lowerY = bodyY + upperH + GAP;
        const lowerH = bodyH - upperH - GAP;

        this._renderDetails(PAD, bodyY, w - PAD * 2, upperH);
        this._renderTree(PAD, lowerY, w - PAD * 2, lowerH);
    }

    _drawChassis() {
        const g = this.modal.addChild(new Graphics());
        neonPanel(g, 0, 0, this._modalW, this._modalH, {
            fill: NEON.PANEL,
            stroke: NEON.CYAN,
            alpha: 0.76,
            strokeAlpha: 0.44,
            cut: 24,
        });
        g.moveTo(10, 72).lineTo(10, 10).lineTo(72, 10)
            .stroke({ color: NEON.CYAN, alpha: 0.55, width: 2 });
        g.moveTo(this._modalW - 10, this._modalH - 72).lineTo(this._modalW - 10, this._modalH - 10).lineTo(this._modalW - 72, this._modalH - 10)
            .stroke({ color: NEON.MAGENTA, alpha: 0.55, width: 2 });
    }

    _drawCloseButton() {
        const size = 34;
        const btn = new Button({ width: size, height: size, onClick: () => this.close() });
        btn.position.set(this._modalW - size - 18, 18);
        const bg = new Graphics();
        neonButton(bg, 0, 0, size, size, { primary: false, enabled: true, cut: 9 });
        btn.addChild(bg);
        const x = makeText('×', {
            fontFamily: FONT_UI,
            fontSize: 22,
            fontWeight: '900',
            fill: NEON.CYAN_LT,
        });
        x.anchor.set(0.5);
        x.position.set(size / 2, size / 2);
        btn.addChild(x);
        this.modal.addChild(btn);
    }

    _renderDetails(x, y, W, H) {
        const skill = this._currentSkill;
        const focus = this._selectedNode || this._hoverNode;
        const frame = this.modal.addChild(new Graphics());
        neonPanel(frame, x, y, W, H, {
            fill: NEON.PANEL_2,
            stroke: focus ? NEON.MAGENTA : NEON.CYAN,
            alpha: 0.82,
            strokeAlpha: focus ? 0.56 : 0.30,
            cut: 18,
        });

        const px = x + 18;
        const py = y + 18;
        const pw = W - 36;
        const title = fitText({
            text: focus ? focus.name : skill.displayName,
            style: {
                fontFamily: FONT_UI,
                fontSize: 32,
                fontWeight: '900',
                fill: focus ? NEON.MAGENTA_LT : NEON.CYAN_LT,
            },
            maxW: pw - 146,
        });
        title.position.set(px, py);
        this.modal.addChild(title);

        const meta = makeText(focus ? `${skill.rankOf(focus.id)} / ${focus.maxRank}` : `레벨 ${skill.level}`, {
            fontFamily: FONT_MONO,
            fontSize: 18,
            fontWeight: '900',
            fill: NEON.TEXT,
        });
        meta.anchor.set(1, 0);
        meta.position.set(x + W - 22, py + 7);
        this.modal.addChild(meta);

        const desc = fitText({
            text: (focus ? focus.desc : skill.description) || ' ',
            style: {
                fontFamily: FONT_UI,
                fontSize: 15,
                fill: NEON.TEXT,
                lineHeight: 22,
            },
            maxW: pw,
            maxH: Math.max(52, H - 104),
        });
        desc.position.set(px, py + 52);
        this.modal.addChild(desc);

        const rowY = y + H - 42;
        const allocateW = this._selectedNode ? (this._paymentMode === 'ores' ? 158 : 128) : 0;
        if (this._selectedNode) {
            this._renderAllocateButton(x + W - 18 - allocateW, rowY, allocateW, 30);
        }

        const status = fitText({
            text: this._statusText(focus),
            style: {
                fontFamily: FONT_MONO,
                fontSize: 12,
                fontWeight: '800',
                fill: this._statusColor(focus),
            },
            maxW: allocateW > 0 ? pw - allocateW - 14 : pw,
        });
        status.position.set(px, rowY + 7);
        this.modal.addChild(status);
    }

    _renderAllocateButton(x, y, w, h) {
        const skill = this._currentSkill;
        const node = this._selectedNode;
        const rank = skill.rankOf(node.id);
        const full = rank >= node.maxRank;
        const reqMet = skill._requirementsMet(node);
        const canBuy = this._canAllocate(node.id);
        const enabled = canBuy && !full;

        const btn = new Button({
            width: w,
            height: h,
            cursor: enabled ? 'pointer' : 'default',
            onClick: () => {
                if (enabled && this._allocate(node.id)) this._render();
            },
        });
        btn.position.set(x, y);

        const bg = new Graphics();
        neonButton(bg, 0, 0, w, h, { primary: true, enabled, cut: 9 });
        btn.addChild(bg);

        const label = full ? '최대' : (reqMet ? this._buyLabel(node) : '잠김');
        const txt = makeText(label, {
            fontFamily: FONT_UI,
            fontSize: 12,
            fontWeight: '900',
            fill: enabled ? 0x160014 : NEON.TEXT_FT,
        });
        txt.anchor.set(0.5);
        txt.position.set(w / 2, h / 2);
        btn.addChild(txt);
        this.modal.addChild(btn);
    }

    _renderTree(x, y, W, H) {
        const skill = this._currentSkill;
        const frame = this.modal.addChild(new Graphics());
        neonPanel(frame, x, y, W, H, {
            fill: NEON.BG_DK,
            stroke: NEON.CYAN,
            alpha: 0.58,
            strokeAlpha: 0.24,
            cut: 18,
        });

        const catcher = new Graphics();
        catcher.rect(x, y, W, H).fill({ color: 0x000000, alpha: 0.001 });
        catcher.eventMode = 'static';
        catcher.on('pointerdown', (e) => {
            e.stopPropagation();
            if (this._selectedNode) {
                this._selectedNode = null;
                this._render();
            }
        });
        this.modal.addChild(catcher);

        if (this._paymentMode === 'points') {
            this._renderResetButton(x + 12, y + 12);
        } else {
            this._renderOreWallet(x + 12, y + 12);
        }

        const nodes = skill.getNodes();
        if (nodes.length === 0) {
            this._renderEmptyTreeMessage(x, y, W, H);
            return;
        }

        const topPad = 48;
        const sidePad = 10;
        const areaX = x + sidePad;
        const areaY = y + topPad;
        const areaW = W - sidePad * 2;
        const areaH = H - topPad - sidePad;
        const cellW = areaW / TREE_COLS;
        const cellH = areaH / TREE_ROWS;
        const nodeW = Math.max(44, Math.min(104, Math.floor(cellW) - 8));
        const nodeH = Math.max(42, Math.min(58, Math.floor(cellH) - 8));
        const center = (node) => ({
            cx: Math.round(areaX + cellW * (node.col + 0.5)),
            cy: Math.round(areaY + cellH * (node.row + 0.5)),
        });

        this._renderLinks(skill, nodes, center);

        for (const node of nodes) {
            const { cx, cy } = center(node);
            const button = this._buildNodeButton(skill, node, nodeW, nodeH);
            button.position.set(cx - Math.floor(nodeW / 2), cy - Math.floor(nodeH / 2));
            this.modal.addChild(button);
        }
    }

    _renderResetButton(x, y) {
        const w = 84;
        const h = 28;
        const btn = new Button({
            width: w,
            height: h,
            onClick: () => {
                this._currentSkill.resetPoints();
                this._hoverNode = null;
                this._selectedNode = null;
                this._render();
            },
        });
        btn.position.set(x, y);
        const bg = new Graphics();
        neonButton(bg, 0, 0, w, h, { primary: false, enabled: true, cut: 8 });
        btn.addChild(bg);
        const label = makeText('초기화', {
            fontFamily: FONT_UI,
            fontSize: 12,
            fontWeight: '900',
            fill: NEON.CYAN_LT,
        });
        label.anchor.set(0.5);
        label.position.set(w / 2, h / 2);
        btn.addChild(label);
        this.modal.addChild(btn);
    }

    _renderLinks(skill, nodes, center) {
        const lines = this.modal.addChild(new Graphics());
        const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
        for (const node of nodes) {
            if (!node.requires) continue;
            for (const reqId of node.requires) {
                const parent = byId[reqId];
                if (!parent) continue;
                const a = center(parent);
                const b = center(node);
                lines.moveTo(a.cx, a.cy).lineTo(b.cx, b.cy)
                    .stroke({ color: skill._requirementsMet(node) ? NEON.CYAN : NEON.TEXT_FT, alpha: 0.45, width: 1 });
            }
        }
    }

    _buildNodeButton(skill, node, w, h) {
        const rank = skill.rankOf(node.id);
        const full = rank >= node.maxRank;
        const unlocked = skill._requirementsMet(node);
        const canAllocate = this._canAllocate(node.id);
        const selected = this._selectedNode?.id === node.id;

        const btn = new Button({
            width: w,
            height: h,
            onClick: () => {
                this._selectedNode = selected ? null : node;
                this._render();
            },
        });
        btn.on('pointerover', () => {
            if (this._hoverNode?.id !== node.id) {
                this._hoverNode = node;
                this._render();
            }
        });
        btn.on('pointerout', () => {
            if (this._hoverNode?.id === node.id) {
                this._hoverNode = null;
                this._render();
            }
        });

        const colors = this._nodeColors({ full, rank, unlocked, canAllocate, selected });
        const bg = new Graphics();
        neonPanel(bg, 0, 0, w, h, {
            fill: colors.bg,
            stroke: colors.border,
            alpha: colors.alpha,
            strokeAlpha: colors.strokeAlpha,
            cut: 9,
            glow: selected || canAllocate,
        });
        btn.addChild(bg);

        const name = fitText({
            text: node.name,
            style: {
                fontFamily: FONT_UI,
                fontSize: Math.max(9, Math.min(12, Math.round(h * 0.23))),
                fontWeight: '900',
                fill: colors.text,
                align: 'center',
            },
            maxW: w - 8,
            maxH: h - 20,
        });
        name.anchor.set(0.5);
        name.position.set(w / 2, h * 0.38);
        btn.addChild(name);

        const rankText = makeText(`${rank}/${node.maxRank}`, {
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: '900',
            fill: colors.rankText,
        });
        rankText.anchor.set(0.5);
        rankText.position.set(w / 2, h - 12);
        btn.addChild(rankText);

        if (canAllocate) {
            const hint = new Graphics();
            hint.circle(w - 7, 7, 3).fill(NEON.MAGENTA);
            btn.addChild(hint);
        }
        return btn;
    }

    _renderEmptyTreeMessage(x, y, W, H) {
        const msg = makeText('스킬 트리 없음', {
            fontFamily: FONT_UI,
            fontSize: 14,
            fontWeight: '900',
            fill: NEON.TEXT_FT,
        });
        msg.anchor.set(0.5);
        msg.position.set(x + W / 2, y + H / 2);
        this.modal.addChild(msg);
    }

    _statusText(node) {
        const skill = this._currentSkill;
        if (!node) {
            if (this._paymentMode === 'ores') {
                return `${this._sourceTitle || skill.displayName}  |  보유 재료 ${this._oreSummary()}`;
            }
            return `포인트 ${skill.points}  |  다음 ${skill.getNextNodeCost()}p  |  경험치 ${Math.floor(skill.exp)}/${skill.getExpForLevel(skill.level)}`;
        }

        const rank = skill.rankOf(node.id);
        if (!skill._requirementsMet(node)) {
            return `${rank}/${node.maxRank}  |  선행 노드가 필요합니다`;
        }
        if (this._canAllocate(node.id)) {
            return `${rank}/${node.maxRank}  |  강화 가능  |  비용 ${this._costText(node)}`;
        }
        return `${rank}/${node.maxRank}  |  ${this._paymentMode === 'ores' ? `재료 부족  |  비용 ${this._costText(node)}` : '포인트 부족'}`;
    }

    _statusColor(node) {
        if (!node) return NEON.CYAN_LT;
        if (!this._currentSkill._requirementsMet(node)) return NEON.TEXT_FT;
        return this._canAllocate(node.id) ? NEON.MAGENTA_LT : NEON.TEXT_DM;
    }

    _renderOreWallet(x, y) {
        let ox = x;
        for (const key of ELEMENT_KEYS) {
            const amount = this._wallet?.ores?.[key] ?? 0;
            const w = 58;
            const g = this.modal.addChild(new Graphics());
            neonPanel(g, ox, y, w, 28, {
                fill: NEON.PANEL_2,
                stroke: ELEMENT_HEX[key],
                alpha: 0.82,
                strokeAlpha: 0.42,
                cut: 8,
            });
            const dot = this.modal.addChild(new Graphics());
            dot.circle(ox + 11, y + 14, 4).fill({ color: ELEMENT_HEX[key], alpha: 0.96 });
            const label = makeText(`${ELEMENTS[key].label} ${amount}`, {
                fontFamily: FONT_MONO,
                fontSize: 11,
                fontWeight: '900',
                fill: NEON.TEXT,
            });
            label.position.set(ox + 19, y + 7);
            this.modal.addChild(label);
            ox += w + 6;
        }
    }

    _oreCostFor(node) {
        const rank = this._currentSkill.rankOf(node.id);
        const totalRanks = this._currentSkill.totalRanks();
        const key = ELEMENT_KEYS[(node.col + node.row + rank) % ELEMENT_KEYS.length];
        return {
            key,
            amount: this._currentSkill.costForRankIndex(totalRanks),
        };
    }

    _costText(node) {
        if (this._paymentMode !== 'ores') return `${this._currentSkill.getNextNodeCost()}p`;
        const cost = this._oreCostFor(node);
        return `${ELEMENTS[cost.key].label} ${cost.amount}`;
    }

    _buyLabel(node) {
        return this._paymentMode === 'ores' ? `강화 ${this._costText(node)}` : `배분 ${this._currentSkill.getNextNodeCost()}p`;
    }

    _oreSummary() {
        return ELEMENT_KEYS.map((key) => `${ELEMENTS[key].label}${this._wallet?.ores?.[key] ?? 0}`).join(' ');
    }

    _canAllocate(nodeId) {
        const skill = this._currentSkill;
        if (this._paymentMode !== 'ores') return skill.canAllocate(nodeId);
        const node = skill.nodeById(nodeId);
        if (!node) return false;
        if (skill.rankOf(nodeId) >= node.maxRank) return false;
        if (!skill._requirementsMet(node)) return false;
        const cost = this._oreCostFor(node);
        return this._wallet?.canSpendOre?.(cost.key, cost.amount) ?? false;
    }

    _allocate(nodeId) {
        const skill = this._currentSkill;
        if (this._paymentMode !== 'ores') return skill.allocate(nodeId);
        if (!this._canAllocate(nodeId)) return false;
        const node = skill.nodeById(nodeId);
        const cost = this._oreCostFor(node);
        if (!this._wallet.spendOre(cost.key, cost.amount)) return false;
        skill.spent[nodeId] = skill.rankOf(nodeId) + 1;
        skill.onNodeChanged();
        return true;
    }

    _nodeColors({ full, rank, unlocked, canAllocate, selected }) {
        if (selected) {
            return {
                bg: 0x210320,
                border: NEON.MAGENTA,
                text: NEON.MAGENTA_LT,
                rankText: NEON.WHITE,
                alpha: 0.95,
                strokeAlpha: 0.9,
            };
        }
        if (full) {
            return {
                bg: NEON.CYAN,
                border: NEON.CYAN_LT,
                text: NEON.BG_DK,
                rankText: NEON.BG_DK,
                alpha: 0.95,
                strokeAlpha: 0.82,
            };
        }
        if (rank > 0) {
            return {
                bg: NEON.PANEL_2,
                border: NEON.CYAN,
                text: NEON.CYAN_LT,
                rankText: NEON.TEXT,
                alpha: 0.86,
                strokeAlpha: 0.58,
            };
        }
        if (canAllocate) {
            return {
                bg: 0x15051a,
                border: NEON.MAGENTA,
                text: NEON.MAGENTA_LT,
                rankText: NEON.TEXT,
                alpha: 0.9,
                strokeAlpha: 0.76,
            };
        }
        if (unlocked) {
            return {
                bg: NEON.PANEL,
                border: NEON.CYAN,
                text: NEON.TEXT_DM,
                rankText: NEON.TEXT_DM,
                alpha: 0.72,
                strokeAlpha: 0.26,
            };
        }
        return {
            bg: NEON.BG_DK,
            border: NEON.TEXT_FT,
            text: NEON.TEXT_FT,
            rankText: NEON.TEXT_FT,
            alpha: 0.58,
            strokeAlpha: 0.30,
        };
    }
}
