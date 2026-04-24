import { Container, Graphics } from 'pixi.js';
import { FONT_MONO, FONT_UI, NEON, makeText, neonButton, neonPanel } from '../ui/neon-theme.js';

const SCREEN_MARGIN = 12;
const PHONE_MAX_W = 440;
const PHONE_MAX_H = 760;

class Button extends Container {
    constructor({ width, height, label, enabled = true, primary = true, onClick }) {
        super();
        this._w = width;
        this._h = height;
        this._label = label;
        this._enabled = enabled;
        this._primary = primary;
        this._onClick = onClick;
        this.eventMode = 'static';
        this.cursor = enabled ? 'pointer' : 'default';
        this.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x < this._w && y < this._h };

        this._bg = this.addChild(new Graphics());
        this._txt = this.addChild(makeText(label, {
            fontFamily: FONT_UI,
            fontSize: 14,
            fontWeight: '900',
            fill: this._textColor(),
        }));
        this._txt.anchor.set(0.5);
        this._txt.position.set(width / 2, height / 2);
        this._draw(false);

        this.on('pointerdown', (e) => {
            e.stopPropagation();
            if (this._enabled) this._onClick?.();
        });
        this.on('pointerover', () => this._draw(true));
        this.on('pointerout', () => this._draw(false));
    }

    _textColor() {
        if (!this._enabled) return NEON.TEXT_FT;
        return this._primary ? 0x140016 : NEON.CYAN_LT;
    }

    _draw(hover) {
        this._bg.clear();
        neonButton(this._bg, 0, 0, this._w, this._h, {
            primary: this._primary,
            enabled: this._enabled,
            cut: 11,
        });
        if (hover && this._enabled) {
            this._bg.rect(3, 3, this._w - 6, this._h - 6).stroke({
                color: NEON.WHITE,
                alpha: 0.18,
                width: 1,
            });
        }
        this._txt.style.fill = this._textColor();
    }
}

export class HomePanel {
    constructor(uiRoot, controller, { onClose } = {}) {
        this.controller = controller;
        this._onClose = onClose ?? (() => {});
        this._open = false;

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

    open() {
        this._open = true;
        this.root.visible = true;
        this._render();
    }

    close() {
        this._open = false;
        this.root.visible = false;
        this._onClose();
    }

    _layout(w, h) {
        this.backdrop
            .clear()
            .rect(0, 0, w, h)
            .fill({ color: NEON.BG_DK, alpha: 0.82 })
            .circle(w * 0.18, h * 0.10, Math.max(w, h) * 0.24)
            .fill({ color: NEON.MAGENTA, alpha: 0.16 })
            .circle(w * 0.88, h * 0.92, Math.max(w, h) * 0.24)
            .fill({ color: NEON.CYAN, alpha: 0.13 });

        this._modalW = Math.min(PHONE_MAX_W, w - SCREEN_MARGIN * 2);
        this._modalH = Math.min(PHONE_MAX_H, h - SCREEN_MARGIN * 2);
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
        const state = this.controller.getPanelState();
        const w = this._modalW;
        const h = this._modalH;
        const g = this.modal.addChild(new Graphics());

        neonPanel(g, 0, 0, w, h, {
            fill: NEON.PANEL,
            stroke: NEON.CYAN,
            alpha: 0.74,
            strokeAlpha: 0.46,
            cut: 24,
        });
        this._drawCornerMarks(g, w, h);

        this._text('HOMEBASE // NODE_17.A', 22, 18, {
            fontFamily: FONT_MONO,
            fontSize: 11,
            fontWeight: '700',
            fill: NEON.CYAN_LT,
        });
        this._text('거점', 22, 40, {
            fontFamily: FONT_UI,
            fontSize: 42,
            fontWeight: '900',
            fill: NEON.WHITE,
            stroke: { color: NEON.CYAN, width: 1 },
        });
        this._statusChips(state, 22, 91);
        this._closeButton(w - 54, 20);

        const pad = 18;
        const cardW = w - pad * 2;
        const gap = 12;
        const available = h - 132 - pad;
        const tight = h < 620;
        const questH = tight ? 112 : Math.max(128, Math.min(158, available * 0.27));
        const fuelH = tight ? 164 : Math.max(178, Math.min(230, available * 0.39));
        const departureH = Math.max(tight ? 104 : 128, available - questH - fuelH - gap * 2);
        let y = 132;

        this._questBlock(pad, y, cardW, questH, state);
        y += questH + gap;
        this._fuelBlock(pad, y, cardW, fuelH, state);
        y += fuelH + gap;
        this._departureBlock(pad, y, cardW, departureH, state);
    }

    _drawCornerMarks(g, w, h) {
        const len = 70;
        g.moveTo(10, 82).lineTo(10, 10).lineTo(82, 10)
            .stroke({ color: NEON.CYAN, alpha: 0.55, width: 2 });
        g.moveTo(w - 10, h - 82).lineTo(w - 10, h - 10).lineTo(w - 82, h - 10)
            .stroke({ color: NEON.MAGENTA, alpha: 0.55, width: 2 });
        g.moveTo(22, 108).lineTo(Math.min(w - 22, len + 80), 108)
            .stroke({ color: NEON.CYAN, alpha: 0.22, width: 1 });
    }

    _statusChips(state, x, y) {
        const chips = [
            { text: state.canDepart ? 'READY' : 'LINK STABLE', hot: false },
            { text: state.departureState === 'countdown' ? `T-${state.departureRemaining.toFixed(1)}s` : `FUEL ${state.loadedFuel}/${state.fuelCapacity}`, hot: true },
        ];
        let ox = x;
        for (const chip of chips) {
            const tw = Math.max(86, chip.text.length * 8 + 22);
            const g = this.modal.addChild(new Graphics());
            neonPanel(g, ox, y, tw, 25, {
                fill: chip.hot ? 0x18051a : NEON.PANEL_2,
                stroke: chip.hot ? NEON.MAGENTA : NEON.CYAN,
                alpha: 0.8,
                strokeAlpha: 0.38,
                cut: 7,
            });
            this._text(chip.text, ox + 11, y + 6, {
                fontFamily: FONT_MONO,
                fontSize: 11,
                fontWeight: '800',
                fill: chip.hot ? NEON.MAGENTA_LT : NEON.CYAN_LT,
            });
            ox += tw + 8;
        }
    }

    _questBlock(x, y, w, h, state) {
        const g = this.modal.addChild(new Graphics());
        neonPanel(g, x, y, w, h, {
            fill: NEON.PANEL_2,
            stroke: NEON.CYAN,
            alpha: 0.82,
            strokeAlpha: 0.28,
        });
        const status = this._questStatus(state);
        this._sectionLabel('의뢰', x + 16, y + 13, false);
        this._bigValue(status.title, x + 16, y + 38, status.color);
        this._text(status.detail, x + 16, y + 83, {
            fontFamily: FONT_UI,
            fontSize: 13,
            fill: NEON.TEXT_DM,
            wordWrap: true,
            wordWrapWidth: w - 150,
            lineHeight: 18,
        });

        const btn = state.canClaimReward
            ? new Button({ width: 116, height: 36, label: '보상 받기', onClick: () => this._act('claimReward') })
            : new Button({
                width: 116,
                height: 36,
                label: state.questState === 'active' ? '진행 중' : '의뢰 수락',
                enabled: state.canAcceptQuest,
                primary: false,
                onClick: () => this._act('acceptQuest'),
            });
        btn.position.set(x + w - 132, y + h - 50);
        this.modal.addChild(btn);
    }

    _fuelBlock(x, y, w, h, state) {
        const isPrimary = state.canLoadFuel;
        const g = this.modal.addChild(new Graphics());
        neonPanel(g, x, y, w, h, {
            fill: isPrimary ? 0x13041c : NEON.PANEL_2,
            stroke: isPrimary ? NEON.MAGENTA : NEON.CYAN,
            alpha: 0.86,
            strokeAlpha: isPrimary ? 0.72 : 0.32,
            glow: isPrimary,
        });
        this._sectionLabel('연료', x + 16, y + 14, isPrimary);
        this._text(`보유 ${state.carriedFuel} / 필요 ${Math.max(0, state.fuelCapacity - state.loadedFuel)}`, x + w - 150, y + 18, {
            fontFamily: FONT_MONO,
            fontSize: 11,
            fill: isPrimary ? NEON.MAGENTA_LT : NEON.CYAN_LT,
        });

        this._bigFuelValue(state.loadedFuel, state.fuelCapacity, x + 16, y + 44, isPrimary);
        this._fuelSlots(x + 16, y + 120, w - 32, state, isPrimary);

        const btn = new Button({
            width: w - 32,
            height: 48,
            label: state.canLoadFuel ? '연료 적재  >' : (state.loadedFuel >= state.fuelCapacity ? '연료 완료' : '연료 필요'),
            enabled: state.canLoadFuel,
            primary: true,
            onClick: () => this._act('loadFuel'),
        });
        btn.position.set(x + 16, y + h - 62);
        this.modal.addChild(btn);
    }

    _departureBlock(x, y, w, h, state) {
        const canDepart = state.canDepart || state.departureState === 'countdown';
        const g = this.modal.addChild(new Graphics());
        neonPanel(g, x, y, w, h, {
            fill: NEON.PANEL_2,
            stroke: canDepart ? NEON.MAGENTA : NEON.CYAN,
            alpha: 0.82,
            strokeAlpha: canDepart ? 0.56 : 0.26,
        });
        this._sectionLabel('출발 준비', x + 16, y + 14, canDepart);
        this._text(this._departureText(state), x + 16, y + 44, {
            fontFamily: FONT_UI,
            fontSize: 13,
            fill: state.success ? NEON.GREEN : (state.departureState === 'failed' ? NEON.RED : NEON.TEXT),
            wordWrap: true,
            wordWrapWidth: w - 134,
            lineHeight: 18,
        });

        const ringX = x + w - 86;
        const ringY = y + 18;
        this._timerRing(ringX, ringY, state);

        const btn = new Button({
            width: w - 32,
            height: 42,
            label: state.canDepart ? '출발 시작  >' : '출발 잠금',
            enabled: state.canDepart,
            primary: state.canDepart,
            onClick: () => {
                if (this.controller.startDeparture()) this.close();
            },
        });
        btn.position.set(x + 16, y + h - 54);
        this.modal.addChild(btn);
    }

    _fuelSlots(x, y, w, state, hot) {
        const gap = 8;
        const count = Math.max(1, state.fuelCapacity);
        const slotW = (w - gap * (count - 1)) / count;
        for (let i = 0; i < count; i++) {
            const on = i < state.loadedFuel;
            const target = hot && i === state.loadedFuel;
            const g = this.modal.addChild(new Graphics());
            neonPanel(g, x + i * (slotW + gap), y, slotW, 48, {
                fill: on ? NEON.CYAN : (target ? 0x210320 : NEON.BG_DK),
                stroke: target ? NEON.MAGENTA : NEON.CYAN,
                alpha: on ? 0.95 : 0.74,
                strokeAlpha: target ? 0.84 : 0.38,
                cut: 12,
                glow: target,
            });
            const label = on ? 'FUEL' : (target ? 'LOAD' : 'EMPTY');
            const t = this._text(label, x + i * (slotW + gap) + slotW / 2, y + 16, {
                fontFamily: FONT_MONO,
                fontSize: 12,
                fontWeight: '900',
                fill: on ? NEON.BG_DK : (target ? NEON.MAGENTA_LT : NEON.TEXT_FT),
            });
            t.anchor.set(0.5, 0);
        }
    }

    _timerRing(x, y, state) {
        const remaining = state.departureState === 'countdown'
            ? Math.ceil(state.departureRemaining)
            : 10;
        const g = this.modal.addChild(new Graphics());
        g.circle(x + 34, y + 34, 34).fill({ color: NEON.BG_DK, alpha: 0.88 });
        g.circle(x + 34, y + 34, 34).stroke({
            color: state.canDepart || state.departureState === 'countdown' ? NEON.MAGENTA : NEON.CYAN,
            alpha: 0.7,
            width: 2,
        });
        const n = this._text(String(remaining), x + 34, y + 14, {
            fontFamily: FONT_MONO,
            fontSize: 26,
            fontWeight: '900',
            fill: state.departureState === 'countdown' ? NEON.MAGENTA_LT : NEON.CYAN_LT,
        });
        n.anchor.set(0.5, 0);
        const unit = this._text('SEC', x + 34, y + 45, {
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: '700',
            fill: NEON.TEXT_DM,
        });
        unit.anchor.set(0.5, 0);
    }

    _sectionLabel(label, x, y, hot) {
        this._text(label, x, y, {
            fontFamily: FONT_UI,
            fontSize: 14,
            fontWeight: '900',
            fill: hot ? NEON.MAGENTA_LT : NEON.CYAN_LT,
        });
    }

    _bigValue(text, x, y, fill) {
        this._text(text, x, y, {
            fontFamily: FONT_MONO,
            fontSize: 27,
            fontWeight: '900',
            fill,
        });
    }

    _bigFuelValue(current, total, x, y, hot) {
        this._text(String(current), x, y, {
            fontFamily: FONT_MONO,
            fontSize: 62,
            fontWeight: '900',
            fill: NEON.WHITE,
            stroke: { color: hot ? NEON.MAGENTA : NEON.CYAN, width: 1 },
        });
        this._text('/', x + 68, y + 13, {
            fontFamily: FONT_MONO,
            fontSize: 38,
            fill: hot ? NEON.MAGENTA_LT : NEON.CYAN_LT,
        });
        this._text(String(total), x + 98, y + 20, {
            fontFamily: FONT_MONO,
            fontSize: 30,
            fontWeight: '900',
            fill: NEON.TEXT_DM,
        });
        this._text('LOAD', x + 142, y + 34, {
            fontFamily: FONT_MONO,
            fontSize: 14,
            fontWeight: '900',
            fill: hot ? NEON.MAGENTA_LT : NEON.CYAN_LT,
        });
    }

    _act(method) {
        this.controller[method]();
        this._render();
    }

    _questStatus(state) {
        if (state.questState === 'active') {
            return {
                title: `${state.questProgress} / ${state.questTarget} 처치`,
                detail: '적을 처치한 뒤 돌아와 연료 보상을 받으세요.',
                color: NEON.CYAN_LT,
            };
        }
        if (state.questState === 'complete') {
            return {
                title: '완료',
                detail: `보상: 연료 ${state.questRewardFuel}개`,
                color: NEON.GREEN,
            };
        }
        return {
            title: '대기 중',
            detail: `연료를 얻으려면 적 ${state.questTarget}마리를 처치하세요.`,
            color: NEON.TEXT,
        };
    }

    _departureText(state) {
        if (state.success) return '출발 완료. 마지막 공세를 버텼습니다.';
        if (state.departureState === 'failed') return state.failureReason || '출발에 실패했습니다.';
        if (state.departureState === 'countdown') return `${state.departureRemaining.toFixed(1)}초 후 출발합니다. 거점 범위 안에 머무르세요.`;
        if (state.canDepart) return '연료가 가득 찼습니다. 출발하면 10초간 마지막 공세가 시작됩니다.';
        return '모든 연료 칸을 채우면 출발할 수 있습니다.';
    }

    _closeButton(x, y) {
        const btn = new Button({ width: 34, height: 34, label: '×', primary: false, onClick: () => this.close() });
        btn.position.set(x, y);
        this.modal.addChild(btn);
    }

    _text(text, x, y, style) {
        const t = makeText(text, style);
        t.position.set(x, y);
        this.modal.addChild(t);
        return t;
    }
}
