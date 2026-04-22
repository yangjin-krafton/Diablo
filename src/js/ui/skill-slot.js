// One Pixi skill slot. Self-contained container with diffing setter API, same
// surface as the old DOM version so SkillBar doesn't care about the backend.
//
// Visual layers (bottom to top):
//   body       → dark tile background with brass border stroke
//   iconSprite → texture loaded via Assets.load
//   cooldownFill → bottom-up dark wipe, redrawn on setCooldown()
//   cooldownText
//   ringMask + ringSprite → rotating conic gradient clipped to the outline
//   lockCover  → red X + tint when locked
//   levelBadge → corner "!" badge when there are unspent points

import { Container, Graphics, Sprite, Text, Texture, Assets } from 'pixi.js';

// Shared assets — built lazily the first time any slot needs them.
let _conicTexture = null;
function conicTexture() {
    if (_conicTexture) return _conicTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createConicGradient(0, 128, 128);
    g.addColorStop(0.00, 'rgba(255, 216, 79, 0)');
    g.addColorStop(0.18, 'rgba(255, 216, 79, 1)');
    g.addColorStop(0.30, 'rgba(255, 157, 42, 1)');
    g.addColorStop(0.45, 'rgba(255, 216, 79, 0)');
    g.addColorStop(1.00, 'rgba(255, 216, 79, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    _conicTexture = Texture.from(c);
    return _conicTexture;
}

const RADIUS = 10;

export class SkillSlot extends Container {
    constructor({ id, size = 68, onActivate = null } = {}) {
        super();
        this.id = id;
        this.size = size;
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x < size && y < size };
        this._onActivate = onActivate;

        this._state = {
            icon: null,
            cooldownRemaining: 0,
            cooldownDuration: 0,
            emphasis: false,
            enabled: true,
            levelUp: false,
            locked: false,
            selected: false,
        };

        // background tile
        this._body = this.addChild(new Graphics());
        this._drawBody();

        // gold bar on the top edge, shown when this slot is the panel's
        // active tab. Sits above the body border so it reads as a joining
        // tab-indicator between slot and panel.
        this._selectedBar = this.addChild(new Graphics());
        this._selectedBar
            .rect(0, 0, size, 3).fill(0xffd84f)
            .rect(0, 0, size, 1).fill(0xffffff);
        this._selectedBar.visible = false;

        // icon sprite (empty until setIcon)
        this._icon = this.addChild(new Sprite(Texture.EMPTY));
        this._icon.width = this._icon.height = size - 8;
        this._icon.position.set(4, 4);

        // cooldown dark wipe + numeric text
        this._cooldownFill = this.addChild(new Graphics());
        this._cooldownText = this.addChild(new Text({
            text: '',
            style: {
                fontFamily: 'Georgia, serif',
                fontSize: Math.round(size * 0.36),
                fontWeight: '700',
                fill: 0xffffff,
                stroke: { color: 0x000000, width: 3 },
            },
        }));
        this._cooldownText.anchor.set(0.5);
        this._cooldownText.position.set(size / 2, size / 2);

        // emphasis ring (rotating conic gradient clipped to the border stroke)
        this._ringMask = new Graphics();
        this._ringMask
            .roundRect(-1, -1, size + 2, size + 2, RADIUS + 1)
            .stroke({ color: 0xffffff, width: 3, alignment: 0.5 });
        this._ring = this.addChild(new Sprite(conicTexture()));
        this._ring.anchor.set(0.5);
        this._ring.position.set(size / 2, size / 2);
        const ringSize = Math.hypot(size, size) * 1.4;
        this._ring.width = this._ring.height = ringSize;
        this.addChild(this._ringMask);
        this._ring.mask = this._ringMask;
        this._ring.visible = false;
        this._ringMask.visible = false;

        // lock cover
        this._lock = this.addChild(this._buildLock());
        this._lock.visible = false;

        // level-up badge
        this._levelBadge = this.addChild(this._buildLevelBadge());
        this._levelBadge.visible = false;

        this.on('pointerdown', this._handleDown);
    }

    _handleDown = (e) => {
        e.stopPropagation();
        // Fire unconditionally; SkillBar decides what to do based on the
        // panel-open state (tab switch vs. skill activation vs. ignored).
        this._onActivate?.(this);
    };

    _drawBody() {
        const s = this.size;
        this._body
            .clear()
            .roundRect(0, 0, s, s, RADIUS)
            .fill({ color: 0x141414 })
            .roundRect(1, 1, s - 2, s - 2, RADIUS - 1)
            .stroke({ color: 0xc9a455, width: 1.2, alpha: 0.55 });
    }

    _buildLock() {
        const s = this.size;
        const g = new Graphics();
        // red tint over the tile
        g.roundRect(3, 3, s - 6, s - 6, RADIUS - 3).fill({ color: 0x3c0000, alpha: 0.55 });
        // X strokes
        const m = s * 0.1;
        g.moveTo(m, m).lineTo(s - m, s - m)
         .moveTo(s - m, m).lineTo(m, s - m)
         .stroke({ color: 0xe23636, width: 4, cap: 'round' });
        return g;
    }

    _buildLevelBadge() {
        const c = new Container();
        const circle = new Graphics()
            .circle(0, 0, 11)
            .fill({ color: 0xffbf2e })
            .circle(0, 0, 11)
            .stroke({ color: 0x2a1a00, width: 1.5 });
        const txt = new Text({
            text: '!',
            style: {
                fontFamily: 'Georgia, serif',
                fontSize: 14,
                fontWeight: '900',
                fill: 0x2a1a00,
            },
        });
        txt.anchor.set(0.5);
        c.addChild(circle);
        c.addChild(txt);
        c.position.set(this.size - 6, 6);
        return c;
    }

    // ---------- public API (setter surface identical to the DOM version) ----------

    async setIcon(url) {
        if (this._state.icon === url) return;
        this._state.icon = url;
        if (!url) { this._icon.texture = Texture.EMPTY; return; }
        try {
            const tex = await Assets.load(url);
            // guard against rapid swaps
            if (this._state.icon !== url) return;
            this._icon.texture = tex;
            // Sprite.width internally uses scale * texture.width; re-applying
            // after the texture swap keeps the displayed size consistent.
            this._icon.width = this.size - 8;
            this._icon.height = this.size - 8;
        } catch (e) {
            console.warn('[skill-slot] icon load failed', url, e);
        }
    }

    setCooldown(remaining, duration) {
        remaining = Math.max(0, remaining);
        duration = Math.max(0, duration);
        if (
            this._state.cooldownRemaining === remaining &&
            this._state.cooldownDuration === duration
        ) return;
        this._state.cooldownRemaining = remaining;
        this._state.cooldownDuration = duration;

        this._cooldownFill.clear();
        if (remaining > 0 && duration > 0) {
            const s = this.size;
            const pad = 3;
            const inner = s - pad * 2;
            const pct = Math.min(1, remaining / duration);
            const h = inner * pct;
            this._cooldownFill
                .roundRect(pad, s - pad - h, inner, h, Math.min(RADIUS - 1, h / 2))
                .fill({ color: 0x000000, alpha: 0.65 });
            this._cooldownText.text = remaining >= 1
                ? Math.ceil(remaining).toString()
                : remaining.toFixed(1);
            this._cooldownText.visible = true;
        } else {
            this._cooldownText.visible = false;
        }
    }

    setEmphasis(on) {
        if (this._state.emphasis === on) return;
        this._state.emphasis = !!on;
        this._ring.visible = !!on;
        this._ringMask.visible = !!on;
    }

    setEnabled(on) {
        if (this._state.enabled === on) return;
        this._state.enabled = !!on;
        this._icon.alpha = on ? 1 : 0.4;
    }

    setLevelUp(on) {
        if (this._state.levelUp === on) return;
        this._state.levelUp = !!on;
        this._levelBadge.visible = !!on;
    }

    setLocked(on) {
        if (this._state.locked === on) return;
        this._state.locked = !!on;
        this._lock.visible = !!on;
        this._icon.alpha = on ? 0.25 : (this._state.enabled ? 1 : 0.4);
    }

    setSelected(on) {
        if (this._state.selected === on) return;
        this._state.selected = !!on;
        this._selectedBar.visible = !!on;
    }

    /** Called each frame by SkillBar to animate the rotating emphasis ring. */
    update(dt) {
        if (this._state.emphasis) {
            this._ring.rotation += dt * (Math.PI * 2 / 1.6); // full turn every 1.6s
        }
    }
}
