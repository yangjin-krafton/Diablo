// Pixi HUD. Mission tracker overlay anchored to the top-right corner.
// Visual language mirrors sandbox/home-panel-style-neon-mobile.html
// — beveled panel with a cyan accent strip, mono tracked chip badges,
// angled parallelogram progress bars, ore chips with glowing dots.
//
// Layout: ore (재화) chip row pinned to the top-right edge,
//         mission list panel stacked directly below it.
// Each mission row: [BADGE] title  [▰▰▱▱]  count
//   - 메인 (main) quest line
//   - 단계 (current stage of the main quest, indented)
//   - 의뢰 (side missions; can stack multiple concurrently)

import { Container, Graphics } from 'pixi.js';
import { FONT_MONO, FONT_UI, NEON, bevel, makeText } from './ui/neon-theme.js';

const EDGE_PAD = 14;
const EDGE_PAD_COMPACT = 10;

const ORES = [
    { key: 'red', label: '적', color: 0xff3f5f },
    { key: 'yellow', label: '황', color: 0xffd84f },
    { key: 'green', label: '녹', color: 0x62f59a },
    { key: 'blue', label: '청', color: 0x33c9ff },
    { key: 'purple', label: '자', color: 0xb469ff },
];

const CHIP_W = 50;
const CHIP_H = 26;
const CHIP_GAP = 4;
const CHIP_CUT = 6;
const ORE_ROW_W = CHIP_W * ORES.length + CHIP_GAP * (ORES.length - 1);

const PANEL_W = ORE_ROW_W;
const PAD_X = 12;
const PAD_Y = 10;
const PANEL_CUT = 8;
const ACCENT_W = 3;

const MAX_ROWS = 4;
const ROW_H = 20;
const ROW_GAP = 3;

const BADGE_W = 36;
const BADGE_H = 14;
const BAR_W = 56;
const BAR_H = 4;
const BAR_CUT = 2;
const COUNT_W = 42;
const COUNT_BAR_GAP = 4;
const STEP_INDENT = 6;

const STACK_GAP = 6;

const KIND_COLORS = {
    main: NEON.MAGENTA,
    step: NEON.CYAN,
    side: NEON.CYAN_LT,
    done: NEON.GREEN,
    fail: NEON.RED,
    idle: NEON.TEXT_FT,
};

export class Hud {
    constructor(uiRoot) {
        this.root = new Container();
        uiRoot.hudLayer.addChild(this.root);

        this._mission = this.root.addChild(new Container());
        this._ores = this.root.addChild(new Container());

        this._missionBg = this._mission.addChild(new Graphics());
        this._missionAccent = this._mission.addChild(new Graphics());

        this._rows = [];
        for (let i = 0; i < MAX_ROWS; i++) {
            this._rows.push(this._buildRow(i));
        }

        this._buildOres();
        this._panelRowCount = -1;

        uiRoot.onResize((w) => this._layout(w));
    }

    _buildRow(idx) {
        const c = this._mission.addChild(new Container());
        c.visible = false;
        void idx;

        const badgeBg = c.addChild(new Graphics());
        const barBg = c.addChild(new Graphics());
        const barFg = c.addChild(new Graphics());

        const badge = makeText('', {
            fontFamily: FONT_MONO,
            fontSize: 9,
            fontWeight: '900',
            letterSpacing: 2,
            fill: NEON.CYAN_LT,
            stroke: { color: NEON.BG_DK, width: 2 },
        });
        badge.anchor.set(0.5, 0.5);
        c.addChild(badge);

        const title = makeText('', {
            fontFamily: FONT_UI,
            fontSize: 12,
            fontWeight: '900',
            fill: NEON.WHITE,
            stroke: { color: NEON.BG_DK, width: 3 },
        });
        title.anchor.set(0, 0.5);
        c.addChild(title);

        const count = makeText('', {
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: '900',
            letterSpacing: 1,
            fill: NEON.TEXT_DM,
            stroke: { color: NEON.BG_DK, width: 2 },
        });
        count.anchor.set(1, 0.5);
        c.addChild(count);

        return {
            c,
            badgeBg,
            badge,
            title,
            barBg,
            barFg,
            count,
            lastBadge: null,
            lastColor: null,
            lastTitle: null,
            lastTitleColor: null,
            lastCount: null,
            lastPct: -1,
        };
    }

    _buildOres() {
        this._oreBg = this._ores.addChild(new Graphics());
        this._oreDots = this._ores.addChild(new Graphics());

        this._oreLabels = [];
        this._oreTexts = ORES.map((ore) => {
            const label = this._addText(this._ores, ore.label, 0, 0, {
                fontFamily: FONT_UI,
                fontSize: 9,
                fontWeight: '900',
                fill: ore.color,
                stroke: { color: NEON.BG_DK, width: 2 },
            });
            this._oreLabels.push(label);
            return this._addText(this._ores, '0', 0, 0, {
                fontFamily: FONT_MONO,
                fontSize: 13,
                fontWeight: '900',
                fill: NEON.WHITE,
                stroke: { color: NEON.BG_DK, width: 2 },
            });
        });

        this._drawOreChips();
    }

    _drawOreChips() {
        this._oreBg.clear();
        this._oreDots.clear();

        for (let i = 0; i < ORES.length; i++) {
            const ore = ORES[i];
            const x = i * (CHIP_W + CHIP_GAP);
            const y = 0;

            bevel(this._oreBg, x, y, CHIP_W, CHIP_H, CHIP_CUT)
                .fill({ color: NEON.BG_DK, alpha: 0.72 });
            bevel(this._oreBg, x, y, CHIP_W, CHIP_H, CHIP_CUT)
                .stroke({ color: ore.color, alpha: 0.55, width: 1 });

            const dotX = x + 9;
            const dotY = y + CHIP_H / 2;
            this._oreDots
                .circle(dotX, dotY, 4)
                .fill({ color: ore.color, alpha: 0.98 })
                .circle(dotX, dotY, 6.5)
                .stroke({ color: ore.color, alpha: 0.5, width: 1 });

            this._oreLabels[i].anchor.set(0, 0.5);
            this._oreLabels[i].position.set(x + 16, dotY);

            this._oreTexts[i].anchor.set(1, 0.5);
            this._oreTexts[i].position.set(x + CHIP_W - 7, dotY);
        }
    }

    _addText(parent, text, x, y, style) {
        const t = makeText(text, style);
        t.position.set(x, y);
        parent.addChild(t);
        return t;
    }

    _layout(w) {
        const compact = w < 560;
        const pad = compact ? EDGE_PAD_COMPACT : EDGE_PAD;
        const scale = compact ? 0.88 : 1;
        this.root.scale.set(scale);

        const rightX = (w - pad) / scale - ORE_ROW_W;
        const topY = pad / scale;

        this._ores.position.set(rightX, topY);
        this._mission.position.set(rightX, topY + CHIP_H + STACK_GAP);
    }

    _drawPanelBackdrop(rowCount) {
        if (rowCount === this._panelRowCount) return;
        this._panelRowCount = rowCount;
        const h = PAD_Y * 2 + rowCount * ROW_H + Math.max(0, rowCount - 1) * ROW_GAP;
        this._panelH = h;

        this._missionBg.clear();
        bevel(this._missionBg, 0, 0, PANEL_W, h, PANEL_CUT)
            .fill({ color: NEON.BG_DK, alpha: 0.72 });
        bevel(this._missionBg, 0, 0, PANEL_W, h, PANEL_CUT)
            .stroke({ color: NEON.CYAN, alpha: 0.32, width: 1 });
        bevel(this._missionBg, 3, 3, PANEL_W - 6, h - 6, Math.max(3, PANEL_CUT - 4))
            .stroke({ color: NEON.CYAN, alpha: 0.08, width: 1 });

        this._missionAccent.clear();
        const accentH = Math.min(h - 8, 22);
        this._missionAccent
            .rect(0, 4, ACCENT_W, accentH)
            .fill({ color: NEON.CYAN, alpha: 0.95 });
    }

    update(player, spawner, homeController = null) {
        void player;
        void spawner;
        const items = this._composeMissions(homeController);
        this._renderMissions(items);
        this._setOres(homeController ? homeController.getPanelState().ores : {});
    }

    _composeMissions(homeController) {
        if (!homeController) {
            return [{ kind: 'main', badge: '오프', title: '연결 끊김', pct: 0, color: KIND_COLORS.idle, count: '—' }];
        }

        const state = homeController.getPanelState();
        const cap = state.fuelCapacity;
        const fuelOwned = state.loadedFuel + state.carriedFuel;

        // Main mission stages:
        //   1. 연료 확보 → fuelOwned >= cap
        //   2. 연료 적재 → loadedFuel >= cap
        //   3. 거점 사수 → countdown 종료
        //   4. 출발 완료 → success
        let mainStep = 1;
        if (state.success) mainStep = 4;
        else if (state.departureState === 'countdown') mainStep = 3;
        else if (state.loadedFuel >= cap) mainStep = 3;
        else if (fuelOwned >= cap) mainStep = 2;

        const mainColor = state.success ? KIND_COLORS.done
            : state.departureState === 'failed' ? KIND_COLORS.fail
                : KIND_COLORS.main;

        const items = [];

        items.push({
            kind: 'main',
            badge: '메인',
            title: '거점 출발',
            pct: state.success ? 1 : Math.min(1, (mainStep - 1) / 3),
            color: mainColor,
            count: state.success ? '★' : `${mainStep}/4`,
        });

        items.push(this._stepItem(state, cap));

        if (state.questState === 'active') {
            items.push({
                kind: 'side',
                badge: '의뢰',
                title: '사냥 의뢰',
                pct: state.questTarget > 0 ? state.questProgress / state.questTarget : 0,
                color: KIND_COLORS.side,
                count: `${state.questProgress}/${state.questTarget}`,
            });
        } else if (state.questState === 'complete') {
            items.push({
                kind: 'side',
                badge: '의뢰',
                title: '사냥 의뢰 완료',
                pct: 1,
                color: KIND_COLORS.done,
                count: '★',
            });
        }

        return items.slice(0, MAX_ROWS);
    }

    _stepItem(state, cap) {
        if (state.success) {
            return { kind: 'step', badge: '단계', title: '출발 완료', pct: 1, color: KIND_COLORS.done, count: '★', indent: true };
        }
        if (state.departureState === 'failed') {
            return { kind: 'step', badge: '단계', title: '출발 실패', pct: 1, color: KIND_COLORS.fail, count: 'X', indent: true };
        }
        if (state.departureState === 'countdown') {
            return {
                kind: 'step',
                badge: '단계',
                title: '거점 사수',
                pct: 1 - Math.max(0, state.departureRemaining / 10),
                color: KIND_COLORS.main,
                count: `${state.departureRemaining.toFixed(1)}s`,
                indent: true,
            };
        }
        if (state.loadedFuel >= cap) {
            return { kind: 'step', badge: '단계', title: '출발 준비', pct: 1, color: KIND_COLORS.done, count: 'READY', indent: true };
        }
        if (state.carriedFuel > 0) {
            return {
                kind: 'step',
                badge: '단계',
                title: '연료 적재',
                pct: state.loadedFuel / cap,
                color: KIND_COLORS.step,
                count: `${state.loadedFuel}/${cap}`,
                indent: true,
            };
        }
        if (state.questState === 'complete') {
            return { kind: 'step', badge: '단계', title: '보상 수령', pct: 1, color: KIND_COLORS.done, count: '+1', indent: true };
        }
        return {
            kind: 'step',
            badge: '단계',
            title: '연료 적재',
            pct: state.loadedFuel / cap,
            color: KIND_COLORS.step,
            count: `${state.loadedFuel}/${cap}`,
            indent: true,
        };
    }

    _renderMissions(items) {
        this._drawPanelBackdrop(items.length);

        for (let i = 0; i < MAX_ROWS; i++) {
            const row = this._rows[i];
            const item = items[i];
            if (!item) {
                row.c.visible = false;
                continue;
            }
            row.c.visible = true;
            row.c.position.set(PAD_X, PAD_Y + i * (ROW_H + ROW_GAP));
            this._configureRow(row, item);
        }
    }

    _configureRow(row, item) {
        const color = item.color;
        const innerW = PANEL_W - PAD_X * 2;
        const barX = innerW - COUNT_W - COUNT_BAR_GAP - BAR_W;
        const barY = (ROW_H - BAR_H) / 2;
        const titleColor = (item.kind === 'main')
            ? NEON.WHITE
            : (color === KIND_COLORS.fail ? NEON.RED
                : color === KIND_COLORS.done ? NEON.GREEN
                    : NEON.TEXT);

        if (row.lastBadge !== item.badge || row.lastColor !== color) {
            row.lastBadge = item.badge;
            row.lastColor = color;

            row.badge.text = item.badge || '';
            row.badge.style.fill = color;

            row.badgeBg.clear();
            if (item.badge) {
                const bx = 0;
                const by = (ROW_H - BADGE_H) / 2;
                row.badgeBg
                    .rect(bx, by, BADGE_W, BADGE_H)
                    .fill({ color, alpha: 0.08 })
                    .rect(bx, by, BADGE_W, BADGE_H)
                    .stroke({ color, alpha: 0.55, width: 1 });
            }
            row.badge.position.set(BADGE_W / 2, ROW_H / 2);

            row.barBg.clear();
            this._traceParallelogram(row.barBg, barX, barY, BAR_W, BAR_H, BAR_CUT)
                .fill({ color: NEON.BG_DK, alpha: 0.7 });
            this._traceParallelogram(row.barBg, barX, barY, BAR_W, BAR_H, BAR_CUT)
                .stroke({ color, alpha: 0.36, width: 1 });
            row.lastPct = -1;
        }

        if (row.lastTitle !== item.title || row.lastTitleColor !== titleColor || row.lastIndent !== item.indent) {
            row.lastTitle = item.title;
            row.lastTitleColor = titleColor;
            row.lastIndent = item.indent;
            row.title.text = item.title;
            row.title.style.fill = titleColor;
            row.title.position.set(BADGE_W + 8 + (item.indent ? STEP_INDENT : 0), ROW_H / 2);
        }

        if (row.lastCount !== item.count) {
            row.lastCount = item.count;
            row.count.text = item.count || '';
            row.count.position.set(innerW, ROW_H / 2);
        }
        row.count.style.fill = color;

        const pct = Math.max(0, Math.min(1, item.pct ?? 0));
        if (Math.abs(pct - row.lastPct) > 1e-3) {
            row.lastPct = pct;
            row.barFg.clear();
            if (pct > 0) {
                const minW = BAR_CUT * 2 + 1;
                const fillW = Math.max(minW, (BAR_W - 2) * pct);
                this._traceParallelogram(row.barFg, barX + 1, barY + 1, fillW, BAR_H - 2, Math.max(1, BAR_CUT - 1))
                    .fill({ color, alpha: 0.95 });
            }
        }
    }

    // Rightward-slanting parallelogram (top-right and bottom-left cut).
    // Mirrors CSS clip-path: polygon(0 0, 100%-c 0, 100% 100%, c 100%).
    _traceParallelogram(g, x, y, w, h, cut) {
        return g
            .moveTo(x, y)
            .lineTo(x + w - cut, y)
            .lineTo(x + w, y + h)
            .lineTo(x + cut, y + h)
            .lineTo(x, y);
    }

    _setOres(ores = {}) {
        for (let i = 0; i < ORES.length; i++) {
            const ore = ORES[i];
            this._oreTexts[i].text = String(ores[ore.key] ?? 0);
        }
    }
}
