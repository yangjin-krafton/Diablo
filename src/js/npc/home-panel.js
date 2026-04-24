import { Container, Graphics, Text } from 'pixi.js';

const COL = {
    BLACK: 0x000000,
    PANEL: 0x0b0d10,
    PANEL_2: 0x141820,
    GOLD: 0xffd84f,
    GOLD_DK: 0xc9a455,
    GOLD_FT: 0x3a2e14,
    TEXT: 0xe8e8e8,
    TEXT_DM: 0xa8a8a8,
    GREEN: 0x62d27f,
    RED: 0xff6464,
};

const F_HEAD = 'Georgia, "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", serif';
const F_UI = '"Consolas", "Malgun Gothic", "Noto Sans KR", monospace';
const SCREEN_MARGIN = 24;

function hairline(g, x, y, w, h, color = COL.GOLD_DK) {
    g.rect(x, y, w, h).stroke({ color, width: 1, alignment: 0 });
}

class Button extends Container {
    constructor({ width, height, label, enabled = true, onClick }) {
        super();
        this._w = width;
        this._h = height;
        this._label = label;
        this._enabled = enabled;
        this._onClick = onClick;
        this.eventMode = 'static';
        this.cursor = enabled ? 'pointer' : 'default';
        this.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x < this._w && y < this._h };
        this._bg = this.addChild(new Graphics());
        this._txt = this.addChild(new Text({
            text: label,
            style: {
                fontFamily: F_HEAD,
                fontSize: 14,
                fontWeight: '700',
                letterSpacing: 1,
                fill: enabled ? COL.BLACK : COL.TEXT_DM,
            },
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

    _draw(hover) {
        this._bg.clear();
        if (this._enabled) {
            this._bg.rect(0, 0, this._w, this._h).fill(hover ? 0xffeb8a : COL.GOLD);
            hairline(this._bg, 0, 0, this._w, this._h, COL.GOLD);
        } else {
            this._bg.rect(0, 0, this._w, this._h).fill(COL.PANEL_2);
            hairline(this._bg, 0, 0, this._w, this._h, COL.GOLD_FT);
        }
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
        this.backdrop.clear().rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.78 });
        this._modalW = Math.min(620, w - SCREEN_MARGIN * 2);
        this._modalH = Math.min(440, h - SCREEN_MARGIN * 2);
        this.modal.position.set(
            Math.round((w - this._modalW) / 2),
            Math.round((h - this._modalH) / 2),
        );
        if (this._open) this._render();
    }

    _render() {
        this.modal.removeChildren();
        const state = this.controller.getPanelState();

        const bg = new Graphics();
        bg.rect(0, 0, this._modalW, this._modalH).fill(COL.BLACK);
        hairline(bg, 0, 0, this._modalW, this._modalH, COL.GOLD_DK);
        hairline(bg, 6, 6, this._modalW - 12, this._modalH - 12, COL.GOLD_FT);
        this.modal.addChild(bg);

        this._text('HOME', 24, 22, {
            fontFamily: F_HEAD,
            fontSize: 30,
            fontWeight: '700',
            letterSpacing: 3,
            fill: COL.GOLD,
        });
        this._closeButton();

        const leftX = 24;
        const rightX = Math.round(this._modalW * 0.52);
        const topY = 82;
        const cardW = this._modalW - rightX - 24;

        this._questBlock(leftX, topY, rightX - leftX - 18, state);
        this._fuelBlock(rightX, topY, cardW, state);
        this._departureBlock(24, this._modalH - 108, this._modalW - 48, state);
    }

    _questBlock(x, y, w, state) {
        this._panel(x, y, w, 180);
        this._text('QUEST', x + 16, y + 14, this._labelStyle());

        const status = this._questStatus(state);
        this._text(status.title, x + 16, y + 46, this._valueStyle(status.color));
        this._text(status.detail, x + 16, y + 74, {
            fontFamily: F_UI,
            fontSize: 13,
            fill: COL.TEXT_DM,
            wordWrap: true,
            wordWrapWidth: w - 32,
        });

        const btn = state.canClaimReward
            ? new Button({ width: 150, height: 34, label: 'CLAIM REWARD', onClick: () => this._act('claimReward') })
            : new Button({ width: 150, height: 34, label: 'ACCEPT QUEST', enabled: state.canAcceptQuest, onClick: () => this._act('acceptQuest') });
        btn.position.set(x + 16, y + 128);
        this.modal.addChild(btn);
    }

    _fuelBlock(x, y, w, state) {
        this._panel(x, y, w, 180);
        this._text('FUEL', x + 16, y + 14, this._labelStyle());
        this._text(`${state.loadedFuel} / ${state.fuelCapacity}`, x + 16, y + 46, this._valueStyle(state.canDepart ? COL.GREEN : COL.GOLD));
        this._text(`CARRIED ${state.carriedFuel}`, x + 16, y + 76, {
            fontFamily: F_UI,
            fontSize: 13,
            fill: COL.TEXT_DM,
        });

        const bar = new Graphics();
        const bx = x + 16;
        const by = y + 102;
        const bw = w - 32;
        const pct = state.fuelCapacity > 0 ? state.loadedFuel / state.fuelCapacity : 0;
        bar.rect(bx, by, bw, 12).fill(0x050505);
        bar.rect(bx, by, Math.max(0, bw * pct), 12).fill(state.canDepart ? COL.GREEN : COL.GOLD);
        hairline(bar, bx, by, bw, 12, COL.GOLD_FT);
        this.modal.addChild(bar);

        const btn = new Button({
            width: 120,
            height: 34,
            label: 'LOAD FUEL',
            enabled: state.canLoadFuel,
            onClick: () => this._act('loadFuel'),
        });
        btn.position.set(x + 16, y + 128);
        this.modal.addChild(btn);
    }

    _departureBlock(x, y, w, state) {
        this._panel(x, y, w, 76);
        const label = this._departureText(state);
        this._text(label, x + 16, y + 14, {
            fontFamily: F_UI,
            fontSize: 14,
            fill: state.success ? COL.GREEN : (state.departureState === 'failed' ? COL.RED : COL.TEXT),
            wordWrap: true,
            wordWrapWidth: w - 190,
        });

        const btn = new Button({
            width: 140,
            height: 40,
            label: 'DEPART',
            enabled: state.canDepart,
            onClick: () => {
                if (this.controller.startDeparture()) this.close();
            },
        });
        btn.position.set(x + w - 156, y + 18);
        this.modal.addChild(btn);
    }

    _act(method) {
        this.controller[method]();
        this._render();
    }

    _questStatus(state) {
        if (state.questState === 'active') {
            return {
                title: `${state.questProgress} / ${state.questTarget} KILLS`,
                detail: 'Clear enemies, then return to claim fuel.',
                color: COL.GOLD,
            };
        }
        if (state.questState === 'complete') {
            return {
                title: 'COMPLETE',
                detail: `Reward: ${state.questRewardFuel} fuel canister.`,
                color: COL.GREEN,
            };
        }
        return {
            title: 'READY',
            detail: `Eliminate ${state.questTarget} enemies for fuel.`,
            color: COL.TEXT,
        };
    }

    _departureText(state) {
        if (state.success) return 'Departure complete. You survived the final wave near home.';
        if (state.departureState === 'failed') return state.failureReason || 'Departure failed.';
        if (state.departureState === 'countdown') return `Departure in ${state.departureRemaining.toFixed(1)}s. Stay inside the home ring.`;
        if (state.canDepart) return 'Fuel is full. Depart to start the final 10 second holdout.';
        return 'Fill all fuel cells to enable departure.';
    }

    _panel(x, y, w, h) {
        const g = new Graphics();
        g.rect(x, y, w, h).fill(COL.PANEL);
        hairline(g, x, y, w, h, COL.GOLD_FT);
        this.modal.addChild(g);
    }

    _closeButton() {
        const btn = new Button({ width: 28, height: 28, label: 'X', onClick: () => this.close() });
        btn.position.set(this._modalW - 44, 22);
        this.modal.addChild(btn);
    }

    _text(text, x, y, style) {
        const t = new Text({ text, style });
        t.position.set(x, y);
        this.modal.addChild(t);
        return t;
    }

    _labelStyle() {
        return {
            fontFamily: F_HEAD,
            fontSize: 16,
            fontWeight: '700',
            letterSpacing: 2,
            fill: COL.GOLD_DK,
        };
    }

    _valueStyle(fill) {
        return {
            fontFamily: F_HEAD,
            fontSize: 24,
            fontWeight: '700',
            letterSpacing: 1,
            fill,
        };
    }
}
