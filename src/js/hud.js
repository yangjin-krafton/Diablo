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
    { key: 'red',    color: 0xff3f5f },
    { key: 'yellow', color: 0xffd84f },
    { key: 'green',  color: 0x62f59a },
    { key: 'blue',   color: 0x33c9ff },
    { key: 'purple', color: 0xb469ff },
];

// Ore row: each slot is a thin neon-tinted frame around its colored number.
// No dots, no labels. Frame style mirrors the `.tag` chip in
// sandbox/home-panel-style-neon-mobile.html (1px border + low-alpha fill,
// tinted to the ore color).
// Each slot fits the worst-case compact format like "999.9k" (6 chars).
const ORE_SLOT_W = 56;
const ORE_SLOT_H = 22;
const ORE_GAP = 6;
const ORE_FRAME_CUT = 4;            // bevel cut on top-right / bottom-left
const ORE_ROW_H = ORE_SLOT_H;
const ORE_ROW_W = ORE_SLOT_W * ORES.length + ORE_GAP * (ORES.length - 1);

// Mission rows: each row is its own bevel-tag frame (same `.tag` style as
// the ore slots), no big chassis behind them. Color of the frame matches
// the row's kind/state so the player reads the type at a glance.
const MROW_W = ORE_ROW_W;           // align right edge with ore row
const MROW_H = 22;
const MROW_GAP = 3;
const MROW_CUT = 4;
const MROW_BADGE_W = 32;
const MROW_BADGE_PAD_X = 8;
const MROW_TITLE_PAD_L = 4;
const MROW_COUNT_PAD_R = 8;
const MROW_INDENT = 8;
const MAX_ROWS = 4;

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

        this._rows = [];
        for (let i = 0; i < MAX_ROWS; i++) {
            this._rows.push(this._buildRow(i));
        }

        this._buildOres();

        uiRoot.onResize((w) => this._layout(w));
    }

    _buildRow(idx) {
        const c = this._mission.addChild(new Container());
        c.visible = false;
        void idx;

        // Single Graphics for the entire row's tag frame (sandbox `.tag` tone).
        const frame = c.addChild(new Graphics());

        const badge = makeText('', {
            fontFamily: FONT_MONO,
            fontSize: 9,
            fontWeight: '900',
            letterSpacing: 2,
            fill: NEON.CYAN_LT,
            stroke: { color: NEON.BG_DK, width: 2 },
        });
        badge.anchor.set(0, 0.5);
        c.addChild(badge);

        const title = makeText('', {
            fontFamily: FONT_UI,
            fontSize: 11,
            fontWeight: '900',
            fill: NEON.WHITE,
            stroke: { color: NEON.BG_DK, width: 3 },
        });
        title.anchor.set(0, 0.5);
        c.addChild(title);

        const count = makeText('', {
            fontFamily: FONT_MONO,
            fontSize: 11,
            fontWeight: '900',
            letterSpacing: 1,
            fill: NEON.TEXT_DM,
            stroke: { color: NEON.BG_DK, width: 2 },
        });
        count.anchor.set(1, 0.5);
        c.addChild(count);

        return {
            c,
            frame,
            badge,
            title,
            count,
            lastBadge: null,
            lastColor: null,
            lastTitle: null,
            lastTitleColor: null,
            lastCount: null,
            lastIndent: null,
        };
    }

    _buildOres() {
        // 5색 자원 슬롯 — 각 슬롯은 같은 색조의 얇은 네온 프레임 안에
        // 컬러 숫자만 들어간다 (sandbox .tag 스타일).
        this._oreFrame = this._ores.addChild(new Graphics());
        this._drawOreFrames();

        this._oreTexts = ORES.map((ore, i) => {
            const t = this._addText(this._ores, '0', 0, 0, {
                fontFamily: FONT_MONO,
                fontSize: 13,
                fontWeight: '900',
                letterSpacing: 0.5,
                fill: ore.color,
                stroke: { color: NEON.BG_DK, width: 3 },
            });
            t.anchor.set(1, 0.5);
            const slotRight = i * (ORE_SLOT_W + ORE_GAP) + ORE_SLOT_W - 6;
            t.position.set(slotRight, ORE_SLOT_H / 2);
            return t;
        });
    }

    _drawOreFrames() {
        this._oreFrame.clear();
        for (let i = 0; i < ORES.length; i++) {
            const ore = ORES[i];
            const x = i * (ORE_SLOT_W + ORE_GAP);
            const y = 0;
            // tinted fill (very low alpha) + 1px border in ore color
            bevel(this._oreFrame, x, y, ORE_SLOT_W, ORE_SLOT_H, ORE_FRAME_CUT)
                .fill({ color: ore.color, alpha: 0.07 });
            bevel(this._oreFrame, x, y, ORE_SLOT_W, ORE_SLOT_H, ORE_FRAME_CUT)
                .stroke({ color: ore.color, alpha: 0.42, width: 1 });
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
        this._mission.position.set(rightX, topY + ORE_ROW_H + STACK_GAP);
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
        for (let i = 0; i < MAX_ROWS; i++) {
            const row = this._rows[i];
            const item = items[i];
            if (!item) {
                row.c.visible = false;
                continue;
            }
            row.c.visible = true;
            row.c.position.set(0, i * (MROW_H + MROW_GAP));
            this._configureRow(row, item);
        }
    }

    _configureRow(row, item) {
        const color = item.color;
        const indent = item.indent ? MROW_INDENT : 0;
        const titleColor = (item.kind === 'main')
            ? NEON.WHITE
            : (color === KIND_COLORS.fail ? NEON.RED
                : color === KIND_COLORS.done ? NEON.GREEN
                    : NEON.TEXT);

        if (row.lastColor !== color || row.lastIndent !== indent) {
            row.lastColor = color;
            row.lastIndent = indent;
            // Tag frame in the row's color (same alpha tones as ore frames).
            row.frame.clear();
            const fx = indent;
            const fw = MROW_W - indent;
            bevel(row.frame, fx, 0, fw, MROW_H, MROW_CUT)
                .fill({ color, alpha: 0.07 });
            bevel(row.frame, fx, 0, fw, MROW_H, MROW_CUT)
                .stroke({ color, alpha: 0.42, width: 1 });
        }

        if (row.lastBadge !== item.badge || row.lastBadgeColor !== color) {
            row.lastBadge = item.badge;
            row.lastBadgeColor = color;
            row.badge.text = item.badge || '';
            row.badge.style.fill = color;
            row.badge.position.set(indent + MROW_BADGE_PAD_X, MROW_H / 2);
        }

        if (row.lastTitle !== item.title || row.lastTitleColor !== titleColor || row.lastIndent !== indent) {
            row.lastTitle = item.title;
            row.lastTitleColor = titleColor;
            row.title.text = item.title;
            row.title.style.fill = titleColor;
            row.title.position.set(
                indent + MROW_BADGE_PAD_X + MROW_BADGE_W + MROW_TITLE_PAD_L,
                MROW_H / 2,
            );
        }

        if (row.lastCount !== item.count) {
            row.lastCount = item.count;
            row.count.text = item.count || '';
            row.count.position.set(MROW_W - MROW_COUNT_PAD_R, MROW_H / 2);
        }
        row.count.style.fill = color;
    }

    _setOres(ores = {}) {
        for (let i = 0; i < ORES.length; i++) {
            const ore = ORES[i];
            this._oreTexts[i].text = formatCount(ores[ore.key] ?? 0);
        }
    }
}

/** Compact integer formatting for HUD counters.
 *  Up to 9999 → raw number. Beyond that, switch to k/M/B/T with three
 *  significant digits so the slot width never blows up:
 *      10000   → "10.0k"
 *      99999   → "99.9k"
 *      999999  → "999k"
 *      1234567 → "1.23M"
 *      1.5e9   → "1.50B"
 *      9.9e12  → "9.90T"
 */
export function formatCount(n) {
    n = Math.max(0, Math.floor(n || 0));
    if (n < 10000) return String(n);
    const units = [
        { v: 1e12, s: 'T' },
        { v: 1e9,  s: 'B' },
        { v: 1e6,  s: 'M' },
        { v: 1e3,  s: 'k' },
    ];
    for (const u of units) {
        if (n >= u.v) {
            const x = n / u.v;
            if (x >= 100) return Math.floor(x) + u.s;
            if (x >= 10)  return x.toFixed(1) + u.s;
            return x.toFixed(2) + u.s;
        }
    }
    return String(n);
}
