// NPC/building-owned skill tree panel.
//
// The bottom skill bar is intentionally not a tab row. Buildings open this
// panel with a target skill id, so future NPCs can present different trees and
// layouts without coupling to equipped slot order.

import { Container, Graphics, Text } from 'pixi.js';

const COL = {
    BLACK: 0x000000,
    PANEL: 0x0a0a0a,
    PANEL_2: 0x120e08,
    GOLD: 0xffd84f,
    GOLD_DK: 0xc9a455,
    GOLD_DM: 0x8a6a28,
    GOLD_FT: 0x3a2e14,
    TEXT: 0xe6e6e6,
    TEXT_DM: 0xa89878,
    TEXT_FT: 0x5a4a32,
};

const F_HEAD = 'Georgia, "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", serif';
const F_MONO = '"Lucida Console", "Consolas", "Malgun Gothic", "Noto Sans KR", monospace';

const DEFAULT_SKILL_ID = 'sword';
const SCREEN_MARGIN = 24;
const PAD = 22;
const GAP = 14;
const TREE_COLS = 3;
const TREE_ROWS = 5;

function hairline(g, x, y, w, h, color = COL.GOLD_DK) {
    g.rect(x, y, w, h).stroke({ color, width: 1, alignment: 0 });
}

function fitText({ text, style, maxW, maxH = null, breakWords = true }) {
    const s = { ...style };
    if (maxH != null) {
        s.wordWrap = true;
        s.wordWrapWidth = maxW;
        s.breakWords = breakWords;
    }
    const t = new Text({ text, style: s });
    const sw = t.width > maxW ? maxW / t.width : 1;
    const sh = maxH && t.height > maxH ? maxH / t.height : 1;
    const scale = Math.min(sw, sh);
    if (scale < 1) t.scale.set(scale);
    return t;
}

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
    constructor(uiRoot, skillSystem, { onClose } = {}) {
        this.uiRoot = uiRoot;
        this.skillSystem = skillSystem;
        this._onClose = onClose ?? (() => {});

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

    open({ sourceId = 'home', skillId = DEFAULT_SKILL_ID } = {}) {
        const skill = this.skillSystem.getSkillById(skillId) ?? this.skillSystem.firstTrainableSkill();
        if (!skill || skill.isEmpty) return;

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
        this._onClose();
    }

    _layout(w, h) {
        this.backdrop
            .clear()
            .rect(0, 0, w, h)
            .fill({ color: 0x000000, alpha: 0.82 });

        this._modalW = Math.min(780, w - SCREEN_MARGIN * 2);
        this._modalH = Math.min(640, h - SCREEN_MARGIN * 2);
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
        const upperH = Math.round(bodyH * 0.42);
        const lowerY = bodyY + upperH + GAP;
        const lowerH = bodyH - upperH - GAP;

        this._renderDetails(PAD, bodyY, w - PAD * 2, upperH);
        this._renderTree(PAD, lowerY, w - PAD * 2, lowerH);
    }

    _drawChassis() {
        const w = this._modalW;
        const h = this._modalH;
        const g = new Graphics();
        g.rect(0, 0, w, h).fill(COL.BLACK);
        hairline(g, 0, 0, w, h, COL.GOLD_DK);
        hairline(g, 6, 6, w - 12, h - 12, COL.GOLD_FT);
        this.modal.addChild(g);
    }

    _drawCloseButton() {
        const size = 24;
        const btn = new Button({ width: size, height: size, onClick: () => this.close() });
        btn.position.set(this._modalW - size - 14, 14);

        const box = new Graphics();
        hairline(box, 0, 0, size, size, COL.GOLD_DM);
        btn.addChild(box);

        const x = new Text({
            text: 'X',
            style: { fontFamily: F_HEAD, fontSize: 18, fontWeight: '700', fill: COL.GOLD_DK },
        });
        x.anchor.set(0.5);
        x.position.set(size / 2, size / 2);
        btn.addChild(x);

        btn.on('pointerover', () => {
            box.clear();
            hairline(box, 0, 0, size, size, COL.GOLD);
            x.tint = 0xffffff;
        });
        btn.on('pointerout', () => {
            box.clear();
            hairline(box, 0, 0, size, size, COL.GOLD_DM);
            x.tint = 0xeeeeee;
        });
        this.modal.addChild(btn);
    }

    _renderDetails(x, y, W, H) {
        const skill = this._currentSkill;
        const focus = this._selectedNode || this._hoverNode;

        const frame = new Graphics();
        frame.rect(x, y, W, H).fill(COL.PANEL);
        hairline(frame, x, y, W, H, COL.GOLD_DM);
        this.modal.addChild(frame);

        const padX = 20;
        const padY = 22;
        const px = x + padX;
        const py = y + padY;
        const pw = W - padX * 2;

        const title = fitText({
            text: focus ? focus.name : skill.displayName,
            style: {
                fontFamily: F_HEAD,
                fontSize: 32,
                fontWeight: '700',
                letterSpacing: 3,
                fill: COL.GOLD,
            },
            maxW: pw - 150,
        });
        title.position.set(px, py);
        this.modal.addChild(title);

        const meta = new Text({
            text: focus ? `${skill.rankOf(focus.id)} / ${focus.maxRank}` : `Lv ${skill.level}`,
            style: {
                fontFamily: F_MONO,
                fontSize: 20,
                fontWeight: '700',
                letterSpacing: 3,
                fill: COL.GOLD_DK,
            },
        });
        meta.anchor.set(1, 0);
        meta.position.set(x + W - 28, py + 6);
        this.modal.addChild(meta);

        const rule = new Graphics();
        rule.rect(px, py + 48, pw, 1).fill(COL.GOLD_FT);
        this.modal.addChild(rule);

        const rowH = 30;
        const descTop = py + 62;
        const descMaxH = y + H - descTop - rowH - 22;
        const desc = fitText({
            text: (focus ? focus.desc : skill.description) || ' ',
            style: {
                fontFamily: F_HEAD,
                fontSize: 18,
                fill: COL.TEXT,
                lineHeight: 26,
            },
            maxW: pw,
            maxH: descMaxH,
        });
        desc.position.set(px, descTop);
        this.modal.addChild(desc);

        const rowY = y + H - rowH - 10;
        const allocateW = this._selectedNode ? 140 : 0;
        if (this._selectedNode) {
            this._renderAllocateButton(x + W - padX - allocateW, rowY, allocateW, rowH);
        }

        const status = fitText({
            text: this._statusText(focus),
            style: {
                fontFamily: F_MONO,
                fontSize: 12,
                letterSpacing: 1,
                fill: this._statusColor(focus),
            },
            maxW: allocateW > 0 ? pw - allocateW - 16 : pw,
        });
        status.position.set(px, rowY + (rowH - status.height) / 2);
        this.modal.addChild(status);
    }

    _renderAllocateButton(x, y, w, h) {
        const skill = this._currentSkill;
        const node = this._selectedNode;
        const rank = skill.rankOf(node.id);
        const full = rank >= node.maxRank;
        const reqMet = skill._requirementsMet(node);
        const canBuy = skill.canAllocate(node.id);
        const enabled = canBuy && !full;

        const btn = new Button({
            width: w,
            height: h,
            cursor: enabled ? 'pointer' : 'default',
            onClick: () => {
                if (enabled && skill.allocate(node.id)) this._render();
            },
        });
        btn.position.set(x, y);

        const bg = new Graphics();
        if (enabled) {
            bg.rect(0, 0, w, h).fill(COL.GOLD);
            hairline(bg, 0, 0, w, h, COL.GOLD);
        } else {
            bg.rect(0, 0, w, h).fill(COL.PANEL_2);
            hairline(bg, 0, 0, w, h, full ? COL.GOLD_DM : COL.GOLD_FT);
        }
        btn.addChild(bg);

        const label = full ? 'MAX' : (reqMet ? `ALLOCATE ${skill.getNextNodeCost()}p` : 'LOCKED');
        const txt = new Text({
            text: label,
            style: {
                fontFamily: F_HEAD,
                fontSize: 13,
                fontWeight: '700',
                letterSpacing: 1,
                fill: enabled ? COL.BLACK : COL.TEXT_FT,
            },
        });
        txt.anchor.set(0.5);
        txt.position.set(w / 2, h / 2);
        btn.addChild(txt);

        if (enabled) {
            btn.on('pointerover', () => { bg.tint = 0xffeb8a; });
            btn.on('pointerout', () => { bg.tint = 0xffffff; });
        }
        this.modal.addChild(btn);
    }

    _renderTree(x, y, W, H) {
        const skill = this._currentSkill;
        const frame = new Graphics();
        hairline(frame, x, y, W, H, COL.GOLD_FT);
        this.modal.addChild(frame);

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

        this._renderResetButton(x + 12, y + 12);

        const nodes = skill.getNodes();
        if (nodes.length === 0) {
            this._renderEmptyTreeMessage(x, y, W, H);
            return;
        }

        const topPad = 50;
        const sidePad = 14;
        const areaX = x + sidePad;
        const areaY = y + topPad;
        const areaW = W - sidePad * 2;
        const areaH = H - topPad - sidePad;
        const cellW = areaW / TREE_COLS;
        const cellH = areaH / TREE_ROWS;
        const nodeSize = Math.max(36, Math.floor(Math.min(cellW, cellH)) - 8);
        const center = (node) => ({
            cx: Math.round(areaX + cellW * (node.col + 0.5)),
            cy: Math.round(areaY + cellH * (node.row + 0.5)),
        });

        this._renderLinks(skill, nodes, center);

        for (const node of nodes) {
            const { cx, cy } = center(node);
            const button = this._buildNodeButton(skill, node, nodeSize, nodeSize);
            button.position.set(cx - Math.floor(nodeSize / 2), cy - Math.floor(nodeSize / 2));
            this.modal.addChild(button);
        }
    }

    _renderResetButton(x, y) {
        const w = 82;
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
        bg.rect(0, 0, w, h).fill(COL.BLACK);
        hairline(bg, 0, 0, w, h, COL.GOLD_DM);
        btn.addChild(bg);

        const label = new Text({
            text: 'RESET',
            style: {
                fontFamily: F_HEAD,
                fontSize: 13,
                fontWeight: '700',
                letterSpacing: 2,
                fill: COL.GOLD_DK,
            },
        });
        label.anchor.set(0.5);
        label.position.set(w / 2, h / 2);
        btn.addChild(label);

        btn.on('pointerover', () => {
            bg.clear();
            bg.rect(0, 0, w, h).fill(COL.PANEL_2);
            hairline(bg, 0, 0, w, h, COL.GOLD);
            label.tint = 0xffffff;
        });
        btn.on('pointerout', () => {
            bg.clear();
            bg.rect(0, 0, w, h).fill(COL.BLACK);
            hairline(bg, 0, 0, w, h, COL.GOLD_DM);
            label.tint = 0xeeeeee;
        });
        this.modal.addChild(btn);
    }

    _renderLinks(skill, nodes, center) {
        const lines = new Graphics();
        const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
        for (const node of nodes) {
            if (!node.requires) continue;
            for (const reqId of node.requires) {
                const parent = byId[reqId];
                if (!parent) continue;
                const a = center(parent);
                const b = center(node);
                lines.moveTo(a.cx, a.cy).lineTo(b.cx, b.cy)
                    .stroke({ color: skill._requirementsMet(node) ? COL.GOLD_DK : COL.GOLD_FT, width: 1 });
            }
        }
        this.modal.addChild(lines);
    }

    _buildNodeButton(skill, node, w, h) {
        const rank = skill.rankOf(node.id);
        const full = rank >= node.maxRank;
        const unlocked = skill._requirementsMet(node);
        const canAllocate = skill.canAllocate(node.id);
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

        const colors = this._nodeColors({ full, rank, unlocked });
        const bg = new Graphics();
        bg.rect(0, 0, w, h).fill(colors.bg);
        hairline(bg, 0, 0, w, h, colors.border);
        btn.addChild(bg);

        const pillH = Math.max(11, Math.min(14, Math.round(h * 0.26)));
        const pillW = Math.min(w - 6, Math.max(26, Math.round(w * 0.72)));
        const pillY = h - pillH - Math.max(3, Math.round(h * 0.08));
        const nameTop = Math.max(4, Math.round(h * 0.12));
        const nameMaxH = Math.max(12, pillY - 3 - nameTop);

        const name = fitText({
            text: node.name,
            style: {
                fontFamily: F_HEAD,
                fontSize: Math.max(9, Math.min(12, Math.round(h * 0.22))),
                fontWeight: '700',
                letterSpacing: 0.5,
                fill: colors.text,
                align: 'center',
            },
            maxW: w - 6,
            maxH: nameMaxH,
        });
        name.anchor.set(0.5);
        name.position.set(w / 2, nameTop + nameMaxH / 2);
        btn.addChild(name);

        const pillX = (w - pillW) / 2;
        const pill = new Graphics();
        pill.rect(pillX, pillY, pillW, pillH).fill(colors.rankBg);
        hairline(pill, pillX, pillY, pillW, pillH, colors.rankBorder);
        btn.addChild(pill);

        const rankText = new Text({
            text: `${rank}/${node.maxRank}`,
            style: {
                fontFamily: F_MONO,
                fontSize: Math.max(8, pillH - 4),
                fontWeight: '700',
                letterSpacing: 1,
                fill: colors.rankText,
            },
        });
        rankText.anchor.set(0.5);
        rankText.position.set(w / 2, pillY + pillH / 2);
        btn.addChild(rankText);

        if (canAllocate) {
            const hint = new Graphics();
            hint.circle(w - 6, 6, 2).fill(COL.GOLD);
            btn.addChild(hint);
        }

        if (selected) {
            const outline = new Graphics();
            outline.rect(-2, -2, w + 4, h + 4)
                .stroke({ color: COL.GOLD, width: 2, alignment: 0 });
            btn.addChild(outline);
        }
        return btn;
    }

    _renderEmptyTreeMessage(x, y, W, H) {
        const msg = new Text({
            text: 'NO TREE',
            style: { fontFamily: F_HEAD, fontSize: 14, letterSpacing: 4, fill: COL.TEXT_FT },
        });
        msg.anchor.set(0.5);
        msg.position.set(x + W / 2, y + H / 2);
        this.modal.addChild(msg);
    }

    _statusText(node) {
        const skill = this._currentSkill;
        if (!node) {
            return `POINTS ${skill.points}  |  NEXT ${skill.getNextNodeCost()}p  |  EXP ${Math.floor(skill.exp)}/${skill.getExpForLevel(skill.level)}`;
        }

        const rank = skill.rankOf(node.id);
        if (!skill._requirementsMet(node)) {
            return `${rank}/${node.maxRank}  |  prerequisite node required`;
        }
        if (skill.canAllocate(node.id)) {
            return `${rank}/${node.maxRank}  |  ready to allocate`;
        }
        return `${rank}/${node.maxRank}  |  not enough points`;
    }

    _statusColor(node) {
        if (!node) return COL.GOLD_DM;
        if (!this._currentSkill._requirementsMet(node)) return COL.TEXT_FT;
        return this._currentSkill.canAllocate(node.id) ? COL.GOLD : COL.GOLD_DM;
    }

    _nodeColors({ full, rank, unlocked }) {
        if (full) {
            return {
                bg: COL.GOLD,
                border: COL.GOLD,
                text: COL.BLACK,
                rankBg: COL.GOLD_DK,
                rankText: COL.BLACK,
                rankBorder: COL.GOLD,
            };
        }
        if (rank > 0) {
            return {
                bg: COL.PANEL_2,
                border: COL.GOLD,
                text: COL.GOLD,
                rankBg: COL.GOLD,
                rankText: COL.BLACK,
                rankBorder: COL.GOLD_DK,
            };
        }
        if (unlocked) {
            return {
                bg: COL.PANEL,
                border: COL.GOLD_DM,
                text: COL.TEXT_DM,
                rankBg: COL.PANEL,
                rankText: COL.GOLD_DM,
                rankBorder: COL.GOLD_FT,
            };
        }
        return {
            bg: COL.BLACK,
            border: COL.GOLD_FT,
            text: COL.TEXT_FT,
            rankBg: COL.BLACK,
            rankText: COL.TEXT_FT,
            rankBorder: COL.GOLD_FT,
        };
    }
}
