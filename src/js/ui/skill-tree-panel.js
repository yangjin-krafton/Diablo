// Pixi 스킬 트리 패널 — 2단 구조, 하단 스킬 바가 탭 역할.
//
//   상반부  스킬 설명 + 현재 등급 (큰 타이포)
//   하반부  트리 노드 그리드 + 좌상단 리셋
//
// 패널은 인게임 스킬 바 바로 위에 앵커된다. 스킬 바의 4개 슬롯이 그대로
// 탭 역할을 하고 (SkillBar._handleActivate 참조), 활성 슬롯은 상단에 골드
// 바가 붙어 패널과 이어 붙어 보인다. 패널 자체에는 탭 row 가 없다.
//
// SkillSystem / Skill.getNodes() 만 바라봄.

import { Container, Graphics, Text } from 'pixi.js';

const COL = {
    BLACK:     0x000000,
    PANEL:     0x0a0a0a,
    PANEL_2:   0x120e08,
    GOLD:      0xffd84f,
    GOLD_DK:   0xc9a455,
    GOLD_DM:   0x8a6a28,
    GOLD_FT:   0x3a2e14,
    TEXT:      0xe6e6e6,
    TEXT_DM:   0xa89878,
    TEXT_FT:   0x5a4a32,
};

const F_HEAD = 'Georgia, "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", serif';
const F_MONO = '"Lucida Console", "Consolas", "Malgun Gothic", "Noto Sans KR", monospace';

const COLS = 3;
const ROWS = 5;

const PAD = 22;
const GAP = 14;

// Matches SkillBar layout: slot size 68 + bottom inset 22 ≈ 90. A couple of
// extra pixels so the panel's bottom border sits cleanly against the slot's
// gold selection bar at the top of the active slot.
const BAR_RESERVE = 92;
// Minimum headroom above the panel top to the screen top.
const TOP_MARGIN = 24;

// ---- drawing helpers ------------------------------------------------
function hairline(g, x, y, w, h, color = COL.GOLD_DK) {
    g.rect(x, y, w, h).stroke({ color, width: 1, alignment: 0 });
}
function ledBar(g, x, y, w, h, pct, on = COL.GOLD, off = COL.GOLD_FT) {
    g.rect(x, y, w, h).fill(off);
    const fw = Math.max(0, Math.min(w, w * pct));
    if (fw > 0) g.rect(x, y, fw, h).fill(on);
}

/** maxW / maxH 안에 들어오도록 자동 축소되는 Text. maxH 있으면 wordWrap 적용.
 *  한글처럼 공백이 드문 문장에서 wordWrapWidth 까지 꽉 채우려면 breakWords:
 *  true 가 필요하다 (Pixi 기본은 공백에서만 개행). */
function fitText({ text, style, maxW, maxH = null, breakWords = true }) {
    const s = { ...style };
    if (maxH != null) {
        s.wordWrap = true;
        s.wordWrapWidth = maxW;
        s.breakWords = breakWords;
    }
    const t = new Text({ text, style: s });
    const sw = t.width  > maxW ? maxW / t.width : 1;
    const sh = maxH && t.height > maxH ? maxH / t.height : 1;
    const scale = Math.min(sw, sh);
    if (scale < 1) t.scale.set(scale);
    return t;
}

class Button extends Container {
    constructor({ width, height, onClick, cursor = 'pointer' }) {
        super();
        this._w = width; this._h = height;
        this.eventMode = 'static';
        this.cursor = cursor;
        this.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x < this._w && y < this._h };
        this.on('pointerdown', (e) => { e.stopPropagation(); onClick?.(this); });
    }
}

// ---- main panel -----------------------------------------------------
export class SkillTreePanel {
    constructor(uiRoot, skillSystem, { onClose } = {}) {
        this.uiRoot = uiRoot;
        this.skillSystem = skillSystem;
        this._onClose = onClose ?? (() => {});
        this._open = false;
        this._hoverNode = null;
        this._selectedNode = null;   // 클릭으로 고정 선택된 노드 (hover 보다 우선)

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

    isOpen() { return this._open; }

    open() {
        this._open = true;
        // 현재 선택이 빈 슬롯이면 첫 번째 실제 스킬로 이동
        const cur = this.skillSystem.skills[this.skillSystem.selectedIndex];
        if (!cur || cur.isEmpty) {
            const first = this.skillSystem.skills.findIndex((s) => !s.isEmpty);
            if (first >= 0) this.skillSystem.selectedIndex = first;
        }
        this._hoverNode = null;
        this._selectedNode = null;
        this.root.visible = true;
        this._render();
    }

    close() {
        this._open = false;
        this._selectedNode = null;
        this.root.visible = false;
        this._onClose();
    }

    /** 외부(SkillBar)에서 탭 전환 후 호출해 패널을 다시 그리게 한다. */
    refresh() {
        if (this._open) this._render();
    }

    /** SkillBar 에서 탭 전환 — 선택된 스킬 변경 + 상세 선택 초기화. */
    selectSkill(i) {
        if (this.skillSystem.selectedIndex !== i) {
            this.skillSystem.selectedIndex = i;
            this._selectedNode = null;
            this._hoverNode = null;
        }
        if (this._open) this._render();
    }

    _layout(w, h) {
        this.backdrop
            .clear()
            .rect(0, 0, w, h)
            .fill({ color: 0x000000, alpha: 0.82 });

        // Width capped at 780; height capped by screen minus bar reserve & top margin.
        this._modalW = Math.min(780, w - 40);
        const maxH = h - BAR_RESERVE - TOP_MARGIN;
        this._modalH = Math.min(640, maxH);
        const yBottom = h - BAR_RESERVE;
        this.modal.position.set(
            Math.round((w - this._modalW) / 2),
            Math.round(yBottom - this._modalH),
        );
        this.modal.hitArea = {
            contains: (x, y) => x >= 0 && y >= 0 && x < this._modalW && y < this._modalH,
        };
        if (this._open) this._render();
    }

    _render() {
        this.modal.removeChildren();

        const w = this._modalW, h = this._modalH;
        this._drawChassis();
        this._drawCloseButton();

        // 2-band body
        const bodyY = PAD;
        const bodyH = h - PAD * 2;
        const upperH = Math.round(bodyH * 0.42);
        const upperY = bodyY;
        const lowerY = upperY + upperH + GAP;
        const lowerH = bodyH - upperH - GAP;

        this._renderUpperPanel(PAD, upperY, w - PAD * 2, upperH);
        this._renderLowerPanel(PAD, lowerY, w - PAD * 2, lowerH);
    }

    // ---------- chassis --------------------------------------------------
    _drawChassis() {
        const w = this._modalW, h = this._modalH;
        const g = new Graphics();
        g.rect(0, 0, w, h).fill(COL.BLACK);
        hairline(g, 0, 0, w, h, COL.GOLD_DK);
        hairline(g, 6, 6, w - 12, h - 12, COL.GOLD_FT);
        this.modal.addChild(g);
    }

    _drawCloseButton() {
        const w = this._modalW;
        const BTN = 24;
        const btn = new Button({ width: BTN, height: BTN, onClick: () => this.close() });
        btn.position.set(w - BTN - 14, 14);
        const box = new Graphics();
        hairline(box, 0, 0, BTN, BTN, COL.GOLD_DM);
        btn.addChild(box);
        const x = new Text({
            text: '×',
            style: { fontFamily: F_HEAD, fontSize: 22, fontWeight: '700', fill: COL.GOLD_DK },
        });
        x.anchor.set(0.5);
        x.position.set(BTN / 2, BTN / 2 - 2);
        btn.addChild(x);
        btn.on('pointerover', () => { box.clear(); hairline(box, 0, 0, BTN, BTN, COL.GOLD); x.tint = 0xffffff; });
        btn.on('pointerout',  () => { box.clear(); hairline(box, 0, 0, BTN, BTN, COL.GOLD_DM); x.tint = 0xeeeeee; });
        this.modal.addChild(btn);
    }

    // ---------- 상반부: 스킬/노드 설명 (주인공) --------------------------
    _renderUpperPanel(x, y, W, H) {
        const frame = new Graphics();
        frame.rect(x, y, W, H).fill(COL.PANEL);
        hairline(frame, x, y, W, H, COL.GOLD_DM);
        this.modal.addChild(frame);

        // 패널 내부 여백 — 한글 설명이 한 줄에 충분히 들어갈 수 있도록 좌우
        // 패딩을 최소화한다.
        const padX = 20;
        const padY = 22;
        const px = x + padX;
        const py = y + padY;
        const pw = W - padX * 2;
        const ph = H - padY * 2;

        const skill = this.skillSystem.skills[this.skillSystem.selectedIndex];
        // 클릭 선택 우선, 그 다음 hover, 아무것도 없으면 스킬 개요.
        const focus = this._selectedNode || this._hoverNode;
        const hover = focus;  // 기존 로직 재사용을 위한 alias

        if (skill.isEmpty) {
            const t = fitText({
                text: '스킬 미장착',
                style: {
                    fontFamily: F_HEAD, fontSize: 24, fontWeight: '700',
                    letterSpacing: 6, fill: COL.TEXT_FT,
                },
                maxW: pw,
            });
            t.anchor.set(0.5);
            t.position.set(x + W / 2, y + H / 2);
            this.modal.addChild(t);
            return;
        }

        // 상단 행: 이름 (좌) + 랭크/Lv (우)
        const titleText = hover ? hover.name : skill.displayName;
        const name = fitText({
            text: titleText,
            style: {
                fontFamily: F_HEAD, fontSize: 32, fontWeight: '700',
                letterSpacing: 3, fill: COL.GOLD,
            },
            maxW: pw - 150,
        });
        name.position.set(px, py);
        this.modal.addChild(name);

        const metaTxt = hover
            ? `${skill.rankOf(hover.id)} / ${hover.maxRank}`
            : `Lv ${skill.level}`;
        const meta = new Text({
            text: metaTxt,
            style: {
                fontFamily: F_MONO, fontSize: 20, fontWeight: '700',
                letterSpacing: 3, fill: COL.GOLD_DK,
            },
        });
        meta.anchor.set(1, 0);
        meta.position.set(x + W - 28, py + 6);
        this.modal.addChild(meta);

        const rule = new Graphics();
        rule.rect(px, py + 48, pw, 1).fill(COL.GOLD_FT);
        this.modal.addChild(rule);

        // 설명 — 상단(제목/구분선) · 하단(액션 행) 을 뺀 실제 설명 공간에
        // 맞춰 자동 스케일. breakWords 로 한글 문장이 폭까지 꽉 차게 랩됨.
        const descTop = py + 62;
        const actionRowH = 30;
        const actionRowGap = 12;
        const descAvailH = (y + H) - descTop - actionRowH - actionRowGap;
        const descText = hover ? hover.desc : skill.description;
        const desc = fitText({
            text: descText || ' ',
            style: {
                fontFamily: F_HEAD, fontSize: 18, fill: COL.TEXT,
                lineHeight: 26,
            },
            maxW: pw,
            maxH: descAvailH,
        });
        desc.position.set(px, descTop);
        this.modal.addChild(desc);

        // 하단 액션 행: 상태 텍스트 (좌) + 활성화 버튼 (우, 노드 선택 시)
        const rowY = y + H - actionRowH - 10;
        let btnW = 0;

        if (this._selectedNode) {
            const node = this._selectedNode;
            const rank = skill.rankOf(node.id);
            const full = rank >= node.maxRank;
            const reqMet = skill._requirementsMet(node);
            const canBuy = skill.canAllocate(node.id);
            const enabled = canBuy && !full;
            btnW = 140;
            const btnH = actionRowH;

            const btn = new Button({
                width: btnW, height: btnH,
                onClick: () => {
                    if (!enabled) return;
                    if (skill.allocate(node.id)) this._render();
                },
                cursor: enabled ? 'pointer' : 'default',
            });
            btn.position.set(x + W - padX - btnW, rowY);

            const btnBg = new Graphics();
            if (enabled) {
                btnBg.rect(0, 0, btnW, btnH).fill(COL.GOLD);
                hairline(btnBg, 0, 0, btnW, btnH, COL.GOLD);
            } else {
                btnBg.rect(0, 0, btnW, btnH).fill(COL.PANEL_2);
                hairline(btnBg, 0, 0, btnW, btnH, full ? COL.GOLD_DM : COL.GOLD_FT);
            }
            btn.addChild(btnBg);

            const label = full ? '완료'
                : (reqMet ? `활성화 ${skill.getNextNodeCost()}p` : '해금 필요');
            const labelColor = full ? COL.GOLD_DM
                : (enabled ? COL.BLACK : COL.TEXT_FT);
            const btnTxt = new Text({
                text: label,
                style: {
                    fontFamily: F_HEAD, fontSize: 13, fontWeight: '700',
                    letterSpacing: 2, fill: labelColor,
                },
            });
            btnTxt.anchor.set(0.5);
            btnTxt.position.set(btnW / 2, btnH / 2);
            btn.addChild(btnTxt);

            if (enabled) {
                btn.on('pointerover', () => { btnBg.tint = 0xffeb8a; });
                btn.on('pointerout',  () => { btnBg.tint = 0xffffff; });
            }
            this.modal.addChild(btn);
        }

        // 상태 텍스트 — 버튼이 있을 때는 좌측에 버튼 폭만큼 줄여서 배치.
        let statusStr;
        let statusColor = COL.GOLD_DM;
        if (hover) {
            const reqMet = skill._requirementsMet(hover);
            const canBuy = skill.canAllocate(hover.id);
            const rank = skill.rankOf(hover.id);
            if (!reqMet) {
                statusStr = `${rank}/${hover.maxRank}  ·  잠김 — 선행 노드 필요`;
                statusColor = COL.TEXT_FT;
            } else if (canBuy) {
                statusStr = `${rank}/${hover.maxRank}  ·  활성화 가능`;
                statusColor = COL.GOLD;
            } else {
                statusStr = `${rank}/${hover.maxRank}  ·  포인트 부족`;
                statusColor = COL.GOLD_DM;
            }
        } else {
            statusStr = `포인트 ${skill.points}  ·  다음 ${skill.getNextNodeCost()}p  ·  EXP ${Math.floor(skill.exp)}/${skill.getExpForLevel(skill.level)}`;
        }
        const statusMaxW = btnW > 0 ? pw - btnW - 16 : pw;
        const status = fitText({
            text: statusStr,
            style: {
                fontFamily: F_MONO, fontSize: 12, letterSpacing: 1, fill: statusColor,
            },
            maxW: statusMaxW,
        });
        status.position.set(px, rowY + (actionRowH - status.height) / 2);
        this.modal.addChild(status);
    }

    // ---------- 하반부: 트리 + 리셋 --------------------------------------
    _renderLowerPanel(x, y, W, H) {
        const frame = new Graphics();
        hairline(frame, x, y, W, H, COL.GOLD_FT);
        this.modal.addChild(frame);

        // 트리 빈 공간 클릭 시 선택 해제 (노드 Button 은 stopPropagation 하므로
        // 노드 위 클릭은 여기로 안 옴).
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

        // 좌상단 리셋 버튼
        const BTN_W = 82, BTN_H = 28;
        const btn = new Button({
            width: BTN_W, height: BTN_H,
            onClick: () => {
                for (const s of this.skillSystem.skills) s.resetPoints();
                this._hoverNode = null;
                this._selectedNode = null;
                this._render();
            },
        });
        btn.position.set(x + 12, y + 12);
        const bg = new Graphics();
        bg.rect(0, 0, BTN_W, BTN_H).fill(COL.BLACK);
        hairline(bg, 0, 0, BTN_W, BTN_H, COL.GOLD_DM);
        btn.addChild(bg);
        const rtxt = new Text({
            text: '리셋',
            style: {
                fontFamily: F_HEAD, fontSize: 14, fontWeight: '700',
                letterSpacing: 4, fill: COL.GOLD_DK,
            },
        });
        rtxt.anchor.set(0.5);
        rtxt.position.set(BTN_W / 2, BTN_H / 2);
        btn.addChild(rtxt);
        btn.on('pointerover', () => { bg.clear(); bg.rect(0, 0, BTN_W, BTN_H).fill(COL.PANEL_2); hairline(bg, 0, 0, BTN_W, BTN_H, COL.GOLD); rtxt.tint = 0xffffff; });
        btn.on('pointerout',  () => { bg.clear(); bg.rect(0, 0, BTN_W, BTN_H).fill(COL.BLACK);   hairline(bg, 0, 0, BTN_W, BTN_H, COL.GOLD_DM); rtxt.tint = 0xeeeeee; });
        this.modal.addChild(btn);

        const skill = this.skillSystem.skills[this.skillSystem.selectedIndex];
        if (skill.isEmpty) {
            const msg = new Text({
                text: '— 빈 슬롯 —',
                style: { fontFamily: F_HEAD, fontSize: 14, letterSpacing: 6, fill: COL.TEXT_FT },
            });
            msg.anchor.set(0.5);
            msg.position.set(x + W / 2, y + H / 2);
            this.modal.addChild(msg);
            return;
        }

        const PAD_TOP = BTN_H + 22;
        const PAD_SIDE = 14;
        const areaX = x + PAD_SIDE, areaY = y + PAD_TOP;
        const areaW = W - PAD_SIDE * 2, areaH = H - PAD_TOP - PAD_SIDE;

        // 3:5 aspect 로 강제하면 portrait 모달에서 트리가 너무 좁아진다.
        // 가용 영역 전체를 쓰고, 노드 크기만 최소 cell 치수로 맞춘다.
        const cellW = areaW / COLS;
        const cellH = areaH / ROWS;
        const nodeSize = Math.max(36, Math.floor(Math.min(cellW, cellH)) - 8);
        const offX = areaX;
        const offY = areaY;
        const center = (col, row) => ({
            cx: Math.round(offX + cellW * (col + 0.5)),
            cy: Math.round(offY + cellH * (row + 0.5)),
        });

        const lines = new Graphics();
        const nodes = skill.getNodes();
        const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
        for (const node of nodes) {
            if (!node.requires) continue;
            for (const reqId of node.requires) {
                const p = byId[reqId];
                if (!p) continue;
                const a = center(p.col, p.row);
                const b = center(node.col, node.row);
                const on = skill._requirementsMet(node);
                lines.moveTo(a.cx, a.cy).lineTo(b.cx, b.cy)
                    .stroke({ color: on ? COL.GOLD_DK : COL.GOLD_FT, width: 1 });
            }
        }
        this.modal.addChild(lines);

        for (const node of nodes) {
            const { cx, cy } = center(node.col, node.row);
            const nb = this._buildNode(skill, node, nodeSize, nodeSize);
            nb.position.set(cx - Math.floor(nodeSize / 2), cy - Math.floor(nodeSize / 2));
            this.modal.addChild(nb);
        }
    }

    _buildNode(skill, node, w, h) {
        const rank = skill.rankOf(node.id);
        const max = node.maxRank;
        const full = rank >= max;
        const unlocked = skill._requirementsMet(node);
        const canAllocate = skill.canAllocate(node.id);
        const isSelected = this._selectedNode?.id === node.id;

        // 클릭 → 선택 토글 (같은 노드 다시 누르면 해제). 실제 투자는 상단
        // 패널의 "활성화" 버튼에서 처리.
        const btn = new Button({
            width: w, height: h,
            onClick: () => {
                this._selectedNode = isSelected ? null : node;
                this._render();
            },
            cursor: 'pointer',
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

        let bgColor, borderColor, textColor, rankBg, rankTxtColor, rankBorder;
        if (full) {
            bgColor = COL.GOLD;       borderColor = COL.GOLD;    textColor = COL.BLACK;
            rankBg  = COL.GOLD_DK;    rankTxtColor = COL.BLACK;  rankBorder = COL.GOLD;
        } else if (rank > 0) {
            bgColor = COL.PANEL_2;    borderColor = COL.GOLD;    textColor = COL.GOLD;
            rankBg  = COL.GOLD;       rankTxtColor = COL.BLACK;  rankBorder = COL.GOLD_DK;
        } else if (unlocked) {
            bgColor = COL.PANEL;      borderColor = COL.GOLD_DM; textColor = COL.TEXT_DM;
            rankBg  = COL.PANEL;      rankTxtColor = COL.GOLD_DM;rankBorder = COL.GOLD_FT;
        } else {
            bgColor = COL.BLACK;      borderColor = COL.GOLD_FT; textColor = COL.TEXT_FT;
            rankBg  = COL.BLACK;      rankTxtColor = COL.TEXT_FT;rankBorder = COL.GOLD_FT;
        }

        const g = new Graphics();
        g.rect(0, 0, w, h).fill(bgColor);
        hairline(g, 0, 0, w, h, borderColor);
        btn.addChild(g);

        // Pill / name 공간을 노드 크기에 맞춰 동적으로 계산해서 서로 침범하지
        // 않게 한다. 작은 노드에서도 양쪽이 깨끗이 들어앉도록.
        const pillH = Math.max(11, Math.min(14, Math.round(h * 0.26)));
        const pillW = Math.min(w - 6, Math.max(26, Math.round(w * 0.72)));
        const pillBottomMargin = Math.max(3, Math.round(h * 0.08));
        const pillX = (w - pillW) / 2;
        const pillY = h - pillH - pillBottomMargin;

        // 이름 영역: 상단 여백부터 pill 위까지
        const nameTop = Math.max(4, Math.round(h * 0.12));
        const nameBottom = pillY - 3;
        const nameMaxH = Math.max(12, nameBottom - nameTop);

        const nameFontSize = Math.max(9, Math.min(12, Math.round(h * 0.22)));
        const name = fitText({
            text: node.name,
            style: {
                fontFamily: F_HEAD, fontSize: nameFontSize, fontWeight: '700',
                letterSpacing: 0.5, fill: textColor,
                align: 'center',
            },
            maxW: w - 6,
            maxH: nameMaxH,
        });
        // 이름을 사용 가능 영역 세로 중앙에 배치 (pill 과 확실히 분리)
        name.anchor.set(0.5, 0.5);
        name.position.set(w / 2, nameTop + nameMaxH / 2);
        btn.addChild(name);

        const pill = new Graphics();
        pill.rect(pillX, pillY, pillW, pillH).fill(rankBg);
        hairline(pill, pillX, pillY, pillW, pillH, rankBorder);
        btn.addChild(pill);

        const rankFontSize = Math.max(8, pillH - 4);
        const rankTxt = new Text({
            text: `${rank}/${max}`,
            style: {
                fontFamily: F_MONO, fontSize: rankFontSize, fontWeight: '700',
                letterSpacing: 1, fill: rankTxtColor,
            },
        });
        rankTxt.anchor.set(0.5);
        rankTxt.position.set(w / 2, pillY + pillH / 2);
        btn.addChild(rankTxt);

        if (canAllocate) {
            const hint = new Graphics();
            hint.circle(w - 6, 6, 2).fill(COL.GOLD);
            btn.addChild(hint);
        }

        // 선택된 노드: 외곽에 두꺼운 골드 프레임 추가
        if (isSelected) {
            const sel = new Graphics();
            sel.rect(-2, -2, w + 4, h + 4).stroke({ color: COL.GOLD, width: 2, alignment: 0 });
            btn.addChild(sel);
        }
        return btn;
    }
}
