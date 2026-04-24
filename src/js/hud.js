// Pixi HUD. Edge-aligned neon tactical overlay.
// Visual language mirrors sandbox/home-panel-style-neon-mobile.html
// — beveled panel with a cyan accent strip, mono tracked chip tags,
// angled parallelogram progress bar, ore chips with glowing dots.

import { Container, Graphics } from 'pixi.js';
import { FONT_MONO, FONT_UI, NEON, bevel, makeText } from './ui/neon-theme.js';

const EDGE_PAD = 14;
const EDGE_PAD_COMPACT = 10;

const PANEL_W = 256;
const PANEL_H = 70;
const PANEL_CUT = 10;
const ACCENT_W = 3;
const ACCENT_H = 26;

const QUEST_BAR_X = 14;
const QUEST_BAR_Y = 40;
const QUEST_BAR_W = PANEL_W - 28;
const QUEST_BAR_H = 5;
const QUEST_BAR_CUT = 3;

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

export class Hud {
    constructor(uiRoot) {
        this.root = new Container();
        uiRoot.hudLayer.addChild(this.root);

        this._left = this.root.addChild(new Container());
        this._right = this.root.addChild(new Container());

        this._buildLeft();
        this._buildRight();

        this._lastQuestPct = -1;
        this._lastQuestColor = null;
        this._lastTag = null;
        this._lastTagColor = null;

        uiRoot.onResize((w, h) => this._layout(w, h));
    }

    _buildLeft() {
        this._leftBg = this._left.addChild(new Graphics());
        this._leftAccent = this._left.addChild(new Graphics());
        this._tagBg = this._left.addChild(new Graphics());
        this._questBarBg = this._left.addChild(new Graphics());
        this._questBarFg = this._left.addChild(new Graphics());

        this._drawLeftBackdrop();

        this._missionLabel = this._addText(this._left, 'MISSION', 14, 8, {
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: '900',
            letterSpacing: 3,
            fill: NEON.CYAN_LT,
        });
        this._tagText = this._addText(this._left, '', 0, 0, {
            fontFamily: FONT_MONO,
            fontSize: 9,
            fontWeight: '900',
            letterSpacing: 2,
            fill: NEON.CYAN_LT,
        });
        this._questSummary = this._addText(this._left, '대기 중', 14, 22, {
            fontFamily: FONT_UI,
            fontSize: 13,
            fontWeight: '900',
            fill: NEON.WHITE,
            stroke: { color: NEON.BG_DK, width: 3 },
        });
        this._combatLine = this._addText(this._left, '', 14, 52, {
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: '800',
            letterSpacing: 1,
            fill: NEON.TEXT_DM,
            stroke: { color: NEON.BG_DK, width: 2 },
        });

        this._setTag('STANDBY', NEON.CYAN);
    }

    _drawLeftBackdrop() {
        this._leftBg.clear();
        bevel(this._leftBg, 0, 0, PANEL_W, PANEL_H, PANEL_CUT)
            .fill({ color: NEON.BG_DK, alpha: 0.72 });
        bevel(this._leftBg, 0, 0, PANEL_W, PANEL_H, PANEL_CUT)
            .stroke({ color: NEON.CYAN, alpha: 0.32, width: 1 });
        bevel(this._leftBg, 3, 3, PANEL_W - 6, PANEL_H - 6, Math.max(3, PANEL_CUT - 4))
            .stroke({ color: NEON.CYAN, alpha: 0.08, width: 1 });

        this._leftAccent.clear();
        this._leftAccent
            .rect(0, 5, ACCENT_W, ACCENT_H)
            .fill({ color: NEON.CYAN, alpha: 0.95 });

        this._questBarBg.clear();
        this._traceParallelogram(this._questBarBg, QUEST_BAR_X, QUEST_BAR_Y, QUEST_BAR_W, QUEST_BAR_H, QUEST_BAR_CUT)
            .fill({ color: NEON.BG_DK, alpha: 0.7 });
        this._traceParallelogram(this._questBarBg, QUEST_BAR_X, QUEST_BAR_Y, QUEST_BAR_W, QUEST_BAR_H, QUEST_BAR_CUT)
            .stroke({ color: NEON.CYAN, alpha: 0.36, width: 1 });
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

    _setTag(text, color) {
        if (text === this._lastTag && color === this._lastTagColor) return;
        this._lastTag = text;
        this._lastTagColor = color;

        this._tagText.text = text;
        this._tagText.style.fill = color;

        const padX = 7;
        const padY = 3;
        const w = Math.ceil(this._tagText.width) + padX * 2;
        const h = Math.ceil(this._tagText.height) + padY * 2;
        const x = PANEL_W - 14 - w;
        const y = 6;

        this._tagBg.clear();
        this._tagBg
            .rect(x, y, w, h)
            .fill({ color, alpha: 0.08 })
            .rect(x, y, w, h)
            .stroke({ color, alpha: 0.55, width: 1 });

        this._tagText.position.set(x + padX, y + padY);
    }

    _buildRight() {
        this._oreBg = this._right.addChild(new Graphics());
        this._oreDots = this._right.addChild(new Graphics());

        const count = ORES.length;
        this._oreRowWidth = CHIP_W * count + CHIP_GAP * (count - 1);

        this._oreLabels = [];
        this._oreTexts = ORES.map((ore) => {
            const label = this._addText(this._right, ore.label, 0, 0, {
                fontFamily: FONT_UI,
                fontSize: 9,
                fontWeight: '900',
                fill: ore.color,
                stroke: { color: NEON.BG_DK, width: 2 },
            });
            this._oreLabels.push(label);
            return this._addText(this._right, '0', 0, 0, {
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
        this._left.position.set(pad / scale, pad / scale);
        const rightX = (w - pad) / scale - this._oreRowWidth;
        this._right.position.set(rightX, pad / scale);
    }

    update(player, spawner, homeController = null) {
        this._combatLine.text = `HP ${Math.ceil(player.hp)}/${player.maxHp}  ·  KILL ${spawner.kills}  ·  FOE ${spawner.enemies.length}`;
        this._updateMission(homeController);
    }

    _updateMission(homeController) {
        if (!homeController) {
            this._questSummary.text = '오프라인';
            this._setTag('OFFLINE', NEON.TEXT_FT);
            this._setQuestProgress(0, NEON.CYAN);
            this._setOres({});
            return;
        }

        const state = homeController.getPanelState();
        if (state.success) {
            this._questSummary.text = '출발 성공';
            this._setTag('SUCCESS', NEON.GREEN);
            this._setQuestProgress(1, NEON.GREEN);
        } else if (state.departureState === 'failed') {
            this._questSummary.text = '출발 실패';
            this._setTag('FAILED', NEON.RED);
            this._setQuestProgress(1, NEON.RED);
        } else if (state.departureState === 'countdown') {
            this._questSummary.text = `거점 사수 · ${state.departureRemaining.toFixed(1)}s`;
            this._setTag(`T-${state.departureRemaining.toFixed(1)}`, NEON.MAGENTA);
            this._setQuestProgress(1 - Math.max(0, state.departureRemaining / 10), NEON.MAGENTA);
        } else if (state.questState === 'active') {
            this._questSummary.text = `적 처치 ${state.questProgress} / ${state.questTarget}`;
            this._setTag('ACTIVE', NEON.CYAN);
            this._setQuestProgress(state.questTarget > 0 ? state.questProgress / state.questTarget : 0, NEON.CYAN);
        } else if (state.questState === 'complete') {
            this._questSummary.text = '의뢰 완료 · 보상 수령';
            this._setTag('COMPLETE', NEON.GREEN);
            this._setQuestProgress(1, NEON.GREEN);
        } else {
            this._questSummary.text = `대기 중 · 연료 ${state.loadedFuel}/${state.fuelCapacity}`;
            this._setTag('STANDBY', NEON.CYAN);
            this._setQuestProgress(0, NEON.CYAN);
        }

        this._setOres(state.ores);
    }

    _setQuestProgress(pct, color) {
        pct = Math.max(0, Math.min(1, pct));
        if (Math.abs(pct - this._lastQuestPct) < 1e-3 && this._lastQuestColor === color) return;
        this._lastQuestPct = pct;
        this._lastQuestColor = color;
        this._questBarFg.clear();
        if (pct > 0) {
            const minW = QUEST_BAR_CUT * 2 + 2;
            const fillW = Math.max(minW, (QUEST_BAR_W - 2) * pct);
            this._traceParallelogram(
                this._questBarFg,
                QUEST_BAR_X + 1,
                QUEST_BAR_Y + 1,
                fillW,
                QUEST_BAR_H - 2,
                Math.min(QUEST_BAR_CUT - 1, 2),
            ).fill({ color, alpha: 0.95 });
        }
    }

    _setOres(ores = {}) {
        for (let i = 0; i < ORES.length; i++) {
            const ore = ORES[i];
            this._oreTexts[i].text = String(ores[ore.key] ?? 0);
        }
    }
}
