// Compact neon modal for a single stat trainer (see §6 of
// docs/npc-building-distribution-balancing.md).
//
// Each panel handles ONE stat (e.g. maxHp). The progression controller
// (PlayerStatsProgression) tracks ranks; the home controller acts as the
// resource wallet (canSpendOre / spendOre).

import { Container, Graphics } from 'pixi.js';
import { ELEMENT_HEX, ELEMENTS } from '../data/elements.js';
import { FONT_MONO, FONT_UI, NEON, makeText, neonButton, neonPanel } from '../ui/neon-theme.js';

const SCREEN_MARGIN = 12;
const PAD = 18;

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

export class StatTrainerPanel {
    constructor(uiRoot, def, progression, wallet, { onClose } = {}) {
        this.uiRoot = uiRoot;
        this.def = def;
        this.progression = progression;
        this.wallet = wallet;
        this._onClose = onClose ?? (() => {});

        this._open = false;
        this._sourceId = null;

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

    open({ sourceId = 'statTrainer' } = {}) {
        this.uiRoot.setSkillBarVisible(false);
        this._open = true;
        this._sourceId = sourceId;
        this.root.visible = true;
        this._render();
    }

    close() {
        this._open = false;
        this._sourceId = null;
        this.root.visible = false;
        this.uiRoot.setSkillBarVisible(true);
        this._onClose();
    }

    _layout(w, h) {
        this.backdrop
            .clear()
            .rect(0, 0, w, h)
            .fill({ color: NEON.BG_DK, alpha: 0.84 });

        this._modalW = Math.min(440, w - SCREEN_MARGIN * 2);
        this._modalH = Math.min(320, h - SCREEN_MARGIN * 2);
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
        const def = this.def;
        const w = this._modalW;
        const h = this._modalH;

        // chassis
        const g = this.modal.addChild(new Graphics());
        neonPanel(g, 0, 0, w, h, {
            fill: NEON.PANEL,
            stroke: NEON.CYAN,
            alpha: 0.78,
            strokeAlpha: 0.46,
            cut: 18,
        });

        // title bar
        this._addText(def.sourceTitle ?? '단련소', PAD, PAD - 2, {
            fontFamily: FONT_MONO,
            fontSize: 11,
            fontWeight: '900',
            letterSpacing: 3,
            fill: NEON.CYAN_LT,
        });
        this._addText(this._statHeading(), PAD, PAD + 14, {
            fontFamily: FONT_UI,
            fontSize: 22,
            fontWeight: '900',
            fill: NEON.WHITE,
            stroke: { color: NEON.BG_DK, width: 3 },
        });

        // close button
        const closeSize = 30;
        const close = new Button({ width: closeSize, height: closeSize, onClick: () => this.close() });
        close.position.set(w - closeSize - 14, 14);
        const cbg = new Graphics();
        neonButton(cbg, 0, 0, closeSize, closeSize, { primary: false, enabled: true, cut: 8 });
        close.addChild(cbg);
        const x = makeText('×', {
            fontFamily: FONT_UI,
            fontSize: 20,
            fontWeight: '900',
            fill: NEON.CYAN_LT,
        });
        x.anchor.set(0.5);
        x.position.set(closeSize / 2, closeSize / 2);
        close.addChild(x);
        this.modal.addChild(close);

        // body
        const bodyY = 76;
        const bodyH = h - bodyY - 80;
        const body = this.modal.addChild(new Graphics());
        neonPanel(body, PAD, bodyY, w - PAD * 2, bodyH, {
            fill: NEON.PANEL_2,
            stroke: NEON.CYAN,
            alpha: 0.82,
            strokeAlpha: 0.30,
            cut: 14,
        });

        const cx = PAD + 18;
        let cy = bodyY + 16;

        // current rank line
        const rank = this.progression.rank(def.statId);
        const max = this.progression.maxRank(def.statId);
        const rankColor = rank >= max ? NEON.GREEN : NEON.CYAN_LT;

        this._addText(`현재 랭크`, cx, cy, {
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: '900',
            letterSpacing: 2,
            fill: NEON.TEXT_DM,
        });
        const rankText = this._addText(`${rank} / ${max}`, w - PAD - 18, cy, {
            fontFamily: FONT_MONO,
            fontSize: 16,
            fontWeight: '900',
            fill: rankColor,
        });
        rankText.anchor.set(1, 0);
        cy += 22;

        // rank pip strip
        this._renderRankPips(PAD + 16, cy, w - PAD * 2 - 32, rank, max, rankColor);
        cy += 14;

        // current effect
        this._addText(`현재 효과`, cx, cy, {
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: '900',
            letterSpacing: 2,
            fill: NEON.TEXT_DM,
        });
        const effText = rank > 0 ? this.progression.effectText(def.statId) : '효과 없음';
        const eff = this._addText(effText, w - PAD - 18, cy, {
            fontFamily: FONT_UI,
            fontSize: 13,
            fontWeight: '900',
            fill: NEON.TEXT,
        });
        eff.anchor.set(1, 0);
        cy += 24;

        // next effect
        this._addText(`다음 랭크`, cx, cy, {
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: '900',
            letterSpacing: 2,
            fill: NEON.TEXT_DM,
        });
        const nextText = rank >= max ? '최대치 도달' : this.progression.nextEffectText(def.statId);
        const nextColor = rank >= max ? NEON.GREEN : NEON.MAGENTA_LT;
        const next = this._addText(nextText, w - PAD - 18, cy, {
            fontFamily: FONT_UI,
            fontSize: 13,
            fontWeight: '900',
            fill: nextColor,
        });
        next.anchor.set(1, 0);
        cy += 30;

        // cost row
        const cost = this.progression.nextCost(def.statId);
        if (cost) {
            this._renderCostRow(cx, cy, w - PAD * 2 - 36, cost);
        } else {
            this._addText('보상 모두 수령 완료', cx, cy + 4, {
                fontFamily: FONT_UI,
                fontSize: 12,
                fontWeight: '900',
                fill: NEON.GREEN,
            });
        }

        // CTA
        this._renderCta(PAD, h - 64, w - PAD * 2, 50, cost);
    }

    _statHeading() {
        const def = this.def;
        const labels = {
            maxHp: '최대 HP 강화',
            moveSpeed: '이동 속도 강화',
            pickupRange: '재화 흡수 반경',
            damage: '기본 공격력',
            attackSpeed: '공격 속도',
            critChance: '치명 확률',
            armor: '받는 피해 감소',
            hpRegen: 'HP 자연 회복',
            oreBonus: '재화 획득량',
            visionRange: '감지 반경',
        };
        return def.label ?? labels[def.statId] ?? def.statId;
    }

    _renderRankPips(x, y, w, rank, max, color) {
        if (max <= 0) return;
        const g = this.modal.addChild(new Graphics());
        const gap = 3;
        const pipW = (w - gap * (max - 1)) / max;
        const h = 6;
        for (let i = 0; i < max; i++) {
            const px = x + i * (pipW + gap);
            g.rect(px, y, pipW, h)
             .fill({ color: NEON.BG_DK, alpha: 0.6 })
             .rect(px, y, pipW, h)
             .stroke({ color: i < rank ? color : NEON.CYAN, alpha: i < rank ? 0.8 : 0.18, width: 1 });
            if (i < rank) {
                g.rect(px + 1, y + 1, pipW - 2, h - 2).fill({ color, alpha: 0.92 });
            }
        }
    }

    _renderCostRow(x, y, w, cost) {
        this._addText(`다음 비용`, x, y, {
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: '900',
            letterSpacing: 2,
            fill: NEON.TEXT_DM,
        });

        const elem = ELEMENTS[cost.key];
        const elemColor = ELEMENT_HEX[cost.key];

        const dotX = x + w - 86;
        const dotY = y + 7;
        const dot = this.modal.addChild(new Graphics());
        dot.circle(dotX, dotY, 5).fill({ color: elemColor, alpha: 0.95 })
           .circle(dotX, dotY, 8).stroke({ color: elemColor, alpha: 0.5, width: 1 });

        const label = this._addText(elem?.label ?? cost.key, dotX + 12, y + 1, {
            fontFamily: FONT_UI,
            fontSize: 12,
            fontWeight: '900',
            fill: elemColor,
            stroke: { color: NEON.BG_DK, width: 2 },
        });
        label.anchor.set(0, 0);

        const have = this.wallet?.ores?.[cost.key] ?? 0;
        const ok = have >= cost.amount;
        const amt = this._addText(`${cost.amount}`, x + w + 18, y + 1, {
            fontFamily: FONT_MONO,
            fontSize: 16,
            fontWeight: '900',
            fill: ok ? NEON.WHITE : NEON.RED,
            stroke: { color: NEON.BG_DK, width: 2 },
        });
        amt.anchor.set(1, 0);

        const haveTxt = this._addText(`보유 ${have}`, x + w + 18, y + 22, {
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: '900',
            letterSpacing: 1,
            fill: ok ? NEON.TEXT_DM : NEON.RED,
        });
        haveTxt.anchor.set(1, 0);
    }

    _renderCta(x, y, w, h, cost) {
        const def = this.def;
        const rank = this.progression.rank(def.statId);
        const max = this.progression.maxRank(def.statId);
        const maxed = rank >= max;
        const canAfford = !maxed && cost && this.wallet?.canSpendOre?.(cost.key, cost.amount);
        const enabled = !maxed && canAfford;

        const btn = new Button({
            width: w,
            height: h,
            onClick: () => {
                if (!enabled) return;
                if (this.progression.upgrade(def.statId, this.wallet)) this._render();
            },
            cursor: enabled ? 'pointer' : 'default',
        });
        btn.position.set(x, y);

        const bg = new Graphics();
        neonButton(bg, 0, 0, w, h, { primary: enabled, enabled, cut: 12 });
        btn.addChild(bg);

        const label = makeText(maxed ? '최대치 도달' : (canAfford ? '강화 +1' : '재화 부족'), {
            fontFamily: FONT_UI,
            fontSize: 16,
            fontWeight: '900',
            letterSpacing: 4,
            fill: enabled ? NEON.BG_DK : NEON.TEXT_FT,
        });
        label.anchor.set(0.5);
        label.position.set(w / 2, h / 2);
        btn.addChild(label);

        this.modal.addChild(btn);
    }

    _addText(text, x, y, style) {
        const t = makeText(text, style);
        t.position.set(x, y);
        this.modal.addChild(t);
        return t;
    }
}
