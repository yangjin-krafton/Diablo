// Compact neon modal for an HP recovery shrine. Two CTAs: heal once (free,
// triggers cooldown), and instant-refresh (pays ores to clear cooldown so
// the player can heal again right away). Cooldown ticks in real time, so a
// short timer re-renders the panel while it's open to keep the countdown
// fresh.

import { Container, Graphics } from 'pixi.js';
import { ELEMENT_HEX, ELEMENTS } from '../data/elements.js';
import { FONT_MONO, FONT_UI, NEON, makeText, neonButton, neonPanel } from '../ui/neon-theme.js';

const SCREEN_MARGIN = 12;
const PAD = 18;
const REFRESH_INTERVAL_MS = 250;

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

export class HealShrinePanel {
    constructor(uiRoot, npc, player, wallet, { onClose } = {}) {
        this.uiRoot = uiRoot;
        this.npc = npc;
        this.player = player;
        this.wallet = wallet;
        this._onClose = onClose ?? (() => {});

        this._open = false;
        this._sourceId = null;
        this._refreshHandle = null;

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

    open({ sourceId = 'healShrine' } = {}) {
        this.uiRoot.setSkillBarVisible(false);
        this._open = true;
        this._sourceId = sourceId;
        this.root.visible = true;
        this._render();
        this._scheduleRefresh();
    }

    close() {
        this._open = false;
        this._sourceId = null;
        this.root.visible = false;
        if (this._refreshHandle != null) {
            clearTimeout(this._refreshHandle);
            this._refreshHandle = null;
        }
        this.uiRoot.setSkillBarVisible(true);
        this._onClose();
    }

    _scheduleRefresh() {
        if (this._refreshHandle != null) clearTimeout(this._refreshHandle);
        if (!this._open) return;
        this._refreshHandle = setTimeout(() => {
            if (!this._open) return;
            this._render();
            this._scheduleRefresh();
        }, REFRESH_INTERVAL_MS);
    }

    _layout(w, h) {
        this.backdrop
            .clear()
            .rect(0, 0, w, h)
            .fill({ color: NEON.BG_DK, alpha: 0.84 });

        this._modalW = Math.min(440, w - SCREEN_MARGIN * 2);
        this._modalH = Math.min(360, h - SCREEN_MARGIN * 2);
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
        const def = this.npc.def;
        const w = this._modalW;
        const h = this._modalH;

        const g = this.modal.addChild(new Graphics());
        neonPanel(g, 0, 0, w, h, {
            fill: NEON.PANEL,
            stroke: NEON.GREEN ?? NEON.CYAN,
            alpha: 0.78,
            strokeAlpha: 0.46,
            cut: 18,
        });

        this._addText('회복 제단', PAD, PAD - 2, {
            fontFamily: FONT_MONO,
            fontSize: 11,
            fontWeight: '900',
            letterSpacing: 3,
            fill: NEON.CYAN_LT,
        });
        this._addText(def.sourceTitle ?? '회복 제단', PAD, PAD + 14, {
            fontFamily: FONT_UI,
            fontSize: 22,
            fontWeight: '900',
            fill: NEON.WHITE,
            stroke: { color: NEON.BG_DK, width: 3 },
        });

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

        const bodyY = 76;
        const bodyH = h - bodyY - 124;
        const body = this.modal.addChild(new Graphics());
        neonPanel(body, PAD, bodyY, w - PAD * 2, bodyH, {
            fill: NEON.PANEL_2,
            stroke: NEON.CYAN,
            alpha: 0.82,
            strokeAlpha: 0.30,
            cut: 14,
        });

        const cx = PAD + 18;
        const right = w - PAD - 18;
        let cy = bodyY + 16;

        // Heal amount
        this._addText('회복 효과', cx, cy, this._labelStyle());
        const healPct = Math.round((def.healPercent ?? 0.5) * 100);
        const healAmount = Math.round((this.player?.maxHp ?? 100) * (def.healPercent ?? 0.5));
        const healText = this._addText(`최대 HP의 ${healPct}%  (+${healAmount} HP)`, right, cy, {
            fontFamily: FONT_UI,
            fontSize: 14,
            fontWeight: '900',
            fill: NEON.GREEN ?? NEON.CYAN_LT,
        });
        healText.anchor.set(1, 0);
        cy += 24;

        // Current HP
        this._addText('현재 HP', cx, cy, this._labelStyle());
        const hpVal = Math.max(0, Math.round(this.player?.hp ?? 0));
        const maxHp = Math.round(this.player?.maxHp ?? 0);
        const hpRatio = maxHp > 0 ? hpVal / maxHp : 0;
        const hpColor = hpRatio < 0.35 ? NEON.RED : (hpRatio < 0.7 ? NEON.MAGENTA_LT : NEON.GREEN ?? NEON.CYAN_LT);
        const hpText = this._addText(`${hpVal} / ${maxHp}`, right, cy, {
            fontFamily: FONT_MONO,
            fontSize: 14,
            fontWeight: '900',
            fill: hpColor,
        });
        hpText.anchor.set(1, 0);
        cy += 22;

        // HP bar
        this._renderHpBar(cx, cy, w - PAD * 2 - 36, 8, hpRatio, hpColor);
        cy += 18;

        // Status
        this._addText('상태', cx, cy, this._labelStyle());
        const isReady = this.npc.isReady();
        const isFull = (this.player?.hp ?? 0) >= (this.player?.maxHp ?? 0);
        let statusText, statusColor;
        if (isFull) {
            statusText = '체력 가득 참';
            statusColor = NEON.GREEN ?? NEON.CYAN_LT;
        } else if (isReady) {
            statusText = '사용 가능';
            statusColor = NEON.GREEN ?? NEON.CYAN_LT;
        } else {
            const remaining = Math.ceil(this.npc.cooldownRemainingSec());
            statusText = `재사용까지 ${remaining}s`;
            statusColor = NEON.MAGENTA_LT;
        }
        const status = this._addText(statusText, right, cy, {
            fontFamily: FONT_MONO,
            fontSize: 14,
            fontWeight: '900',
            fill: statusColor,
        });
        status.anchor.set(1, 0);
        cy += 22;

        // Cooldown bar (only when on cooldown)
        if (!isReady) {
            this._renderCooldownBar(cx, cy, w - PAD * 2 - 36, 6, this.npc.cooldownProgress());
        }

        // CTA buttons
        const btnY = h - 110;
        const btnH = 44;
        const btnW = w - PAD * 2;
        this._renderHealButton(PAD, btnY, btnW, btnH, isReady, isFull);
        this._renderResetButton(PAD, btnY + btnH + 8, btnW, 38, isReady);
    }

    _renderHpBar(x, y, w, h, ratio, color) {
        const g = this.modal.addChild(new Graphics());
        g.rect(x, y, w, h).fill({ color: NEON.BG_DK, alpha: 0.6 });
        g.rect(x, y, w, h).stroke({ color: NEON.CYAN, alpha: 0.18, width: 1 });
        if (ratio > 0) {
            g.rect(x + 1, y + 1, Math.max(0, (w - 2) * ratio), h - 2)
             .fill({ color, alpha: 0.92 });
        }
    }

    _renderCooldownBar(x, y, w, h, progress) {
        const g = this.modal.addChild(new Graphics());
        g.rect(x, y, w, h).fill({ color: NEON.BG_DK, alpha: 0.6 });
        g.rect(x, y, w, h).stroke({ color: NEON.MAGENTA, alpha: 0.32, width: 1 });
        if (progress > 0) {
            g.rect(x + 1, y + 1, Math.max(0, (w - 2) * progress), h - 2)
             .fill({ color: NEON.MAGENTA_LT, alpha: 0.85 });
        }
    }

    _renderHealButton(x, y, w, h, isReady, isFull) {
        const enabled = isReady && !isFull;
        const btn = new Button({
            width: w,
            height: h,
            cursor: enabled ? 'pointer' : 'default',
            onClick: () => {
                if (!enabled) return;
                if (this.npc.use(this.player)) this._render();
            },
        });
        btn.position.set(x, y);
        const bg = new Graphics();
        neonButton(bg, 0, 0, w, h, { primary: enabled, enabled, cut: 12 });
        btn.addChild(bg);
        let label;
        if (isFull) label = '체력 가득 참';
        else if (!isReady) label = '재사용 대기 중';
        else label = '회복';
        const text = makeText(label, {
            fontFamily: FONT_UI,
            fontSize: 16,
            fontWeight: '900',
            letterSpacing: 4,
            fill: enabled ? NEON.BG_DK : NEON.TEXT_FT,
        });
        text.anchor.set(0.5);
        text.position.set(w / 2, h / 2);
        btn.addChild(text);
        this.modal.addChild(btn);
    }

    _renderResetButton(x, y, w, h, isReady) {
        const cost = this.npc.def.resetCost;
        const onCooldown = !isReady;
        const have = (this.wallet?.ores?.[cost?.key] ?? 0);
        const canAfford = cost ? (this.wallet?.canSpendOre?.(cost.key, cost.amount) ?? false) : true;
        const enabled = onCooldown && canAfford;

        const btn = new Button({
            width: w,
            height: h,
            cursor: enabled ? 'pointer' : 'default',
            onClick: () => {
                if (!enabled) return;
                if (this.npc.resetCooldown(this.wallet)) this._render();
            },
        });
        btn.position.set(x, y);
        const bg = new Graphics();
        neonButton(bg, 0, 0, w, h, { primary: false, enabled, cut: 10 });
        btn.addChild(bg);

        const elem = cost ? ELEMENTS[cost.key] : null;
        const elemColor = cost ? ELEMENT_HEX[cost.key] : NEON.CYAN;
        const labelText = !onCooldown
            ? '즉시 재사용 (대기시간 없음)'
            : (cost ? `즉시 재사용  ${elem?.label ?? cost.key} ${cost.amount}` : '즉시 재사용');
        const text = makeText(labelText, {
            fontFamily: FONT_UI,
            fontSize: 13,
            fontWeight: '900',
            letterSpacing: 2,
            fill: enabled ? elemColor : NEON.TEXT_FT,
        });
        text.anchor.set(0.5);
        text.position.set(w / 2, h / 2);
        btn.addChild(text);

        if (cost && onCooldown) {
            const haveText = makeText(`보유 ${have}`, {
                fontFamily: FONT_MONO,
                fontSize: 10,
                fontWeight: '900',
                fill: canAfford ? NEON.TEXT_DM : NEON.RED,
            });
            haveText.anchor.set(1, 0.5);
            haveText.position.set(w - 10, h / 2);
            btn.addChild(haveText);
        }

        this.modal.addChild(btn);
    }

    _labelStyle() {
        return {
            fontFamily: FONT_MONO,
            fontSize: 10,
            fontWeight: '900',
            letterSpacing: 2,
            fill: NEON.TEXT_DM,
        };
    }

    _addText(text, x, y, style) {
        const t = makeText(text, style);
        t.position.set(x, y);
        this.modal.addChild(t);
        return t;
    }
}
