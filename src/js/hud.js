// Pixi HUD. Fixed top-left: HP bar + label, KILLS / ENEMIES counters.
// Pure display; no input — rendered into uiRoot.hudLayer.

import { Container, Graphics, Text } from 'pixi.js';

const LABEL_STYLE = {
    fontFamily: 'Georgia, serif',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    fill: 0x8a7858,
};
const VALUE_STYLE = {
    fontFamily: 'Georgia, serif',
    fontSize: 14,
    fontWeight: '700',
    fill: 0xe6e6e6,
    stroke: { color: 0x000000, width: 2 },
};
const HP_VALUE_STYLE = { ...VALUE_STYLE, fill: 0xffd84f };

const BAR_W = 180;
const BAR_H = 10;

export class Hud {
    constructor(uiRoot) {
        this.root = new Container();
        this.root.position.set(14, 14);
        uiRoot.hudLayer.addChild(this.root);

        // HP row: "HP  120 / 200"  +  bar underneath
        this._hpLabel = this._addText('HP', LABEL_STYLE, 0, 0);
        this._hpValue = this._addText('- / -', HP_VALUE_STYLE, 28, -2);
        this._hpBarBg = this.root.addChild(new Graphics());
        this._hpBarFg = this.root.addChild(new Graphics());
        this._drawHpBarBg();

        // KILLS row
        this._killsLabel = this._addText('KILLS', LABEL_STYLE, 0, 36);
        this._killsValue = this._addText('0', VALUE_STYLE, 46, 34);

        // ENEMIES row
        this._enemiesLabel = this._addText('ENEMIES', LABEL_STYLE, 0, 54);
        this._enemiesValue = this._addText('0', VALUE_STYLE, 62, 52);

        this._lastHpPct = -1;
    }

    _addText(text, style, x, y) {
        const t = new Text({ text, style });
        t.position.set(x, y);
        this.root.addChild(t);
        return t;
    }

    _drawHpBarBg() {
        this._hpBarBg
            .clear()
            .roundRect(0, 18, BAR_W, BAR_H, 3)
            .fill({ color: 0x0a0604 })
            .roundRect(0, 18, BAR_W, BAR_H, 3)
            .stroke({ color: 0x3a2a18, width: 1 });
    }

    update(player, spawner) {
        const hp = Math.ceil(player.hp);
        const max = player.maxHp;
        const pct = max > 0 ? Math.max(0, hp / max) : 0;
        this._hpValue.text = `${hp} / ${max}`;
        this._hpValue.style.fill = pct > 0.3 ? 0xffd84f : 0xff6464;

        if (Math.abs(pct - this._lastHpPct) > 1e-3) {
            this._lastHpPct = pct;
            this._hpBarFg.clear();
            if (pct > 0) {
                const w = Math.max(2, BAR_W * pct);
                const color = pct > 0.3 ? 0xffd84f : 0xff4040;
                this._hpBarFg
                    .roundRect(0, 18, w, BAR_H, 3)
                    .fill({ color });
            }
        }

        this._killsValue.text = String(spawner.kills);
        this._enemiesValue.text = String(spawner.enemies.length);
    }
}
