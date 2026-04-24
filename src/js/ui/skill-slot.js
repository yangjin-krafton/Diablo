// One Pixi skill slot, rendered in the neon HUD style.

import { Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { FONT_MONO, NEON, bevel, neonPanel } from './neon-theme.js';

let _conicTexture = null;
function conicTexture() {
    if (_conicTexture) return _conicTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createConicGradient(0, 128, 128);
    g.addColorStop(0.00, 'rgba(0, 229, 255, 0)');
    g.addColorStop(0.14, 'rgba(0, 229, 255, 1)');
    g.addColorStop(0.30, 'rgba(255, 0, 162, 1)');
    g.addColorStop(0.46, 'rgba(0, 229, 255, 0)');
    g.addColorStop(1.00, 'rgba(0, 229, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    _conicTexture = Texture.from(c);
    return _conicTexture;
}

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
        };

        this._body = this.addChild(new Graphics());
        this._drawBody();

        this._ring = this.addChild(new Graphics());
        this._ring.visible = false;

        this._ringInnerCover = this.addChild(new Graphics());
        this._drawRingInnerCover();

        this._icon = this.addChild(new Sprite(Texture.EMPTY));
        this._icon.width = this._icon.height = size - 14;
        this._icon.position.set(7, 7);

        this._cooldownFill = this.addChild(new Graphics());
        this._cooldownText = this.addChild(new Text({
            text: '',
            style: {
                fontFamily: FONT_MONO,
                fontSize: Math.round(size * 0.32),
                fontWeight: '900',
                fill: NEON.WHITE,
                stroke: { color: NEON.BG_DK, width: 3 },
            },
        }));
        this._cooldownText.anchor.set(0.5);
        this._cooldownText.position.set(size / 2, size / 2);

        this._lock = this.addChild(this._buildLock());
        this._lock.visible = false;

        this._levelBadge = this.addChild(this._buildLevelBadge());
        this._levelBadge.visible = false;

        this.on('pointerdown', this._handleDown);
    }

    _handleDown = (e) => {
        e.stopPropagation();
        this._onActivate?.(this);
    };

    _drawBody() {
        const s = this.size;
        this._body.clear();
        neonPanel(this._body, 0, 0, s, s, {
            fill: NEON.PANEL,
            stroke: this._state?.emphasis ? NEON.MAGENTA : NEON.CYAN,
            alpha: 0.84,
            strokeAlpha: this._state?.emphasis ? 0.78 : 0.42,
            cut: 12,
            glow: this._state?.emphasis,
        });
        this._body.rect(7, 7, s - 14, s - 14).stroke({ color: NEON.WHITE, alpha: 0.05, width: 1 });
    }

    _drawRingInnerCover() {
        const s = this.size;
        this._ringInnerCover.clear();
        bevel(this._ringInnerCover, 7, 7, s - 14, s - 14, 8)
            .fill({ color: NEON.PANEL, alpha: 0.96 });
        bevel(this._ringInnerCover, 7, 7, s - 14, s - 14, 8)
            .stroke({ color: NEON.WHITE, alpha: 0.05, width: 1 });
    }

    _buildLock() {
        const s = this.size;
        const g = new Graphics();
        neonPanel(g, 4, 4, s - 8, s - 8, {
            fill: NEON.BG_DK,
            stroke: NEON.RED,
            alpha: 0.78,
            strokeAlpha: 0.58,
            cut: 10,
        });
        const m = s * 0.25;
        g.moveTo(m, m).lineTo(s - m, s - m)
            .moveTo(s - m, m).lineTo(m, s - m)
            .stroke({ color: NEON.RED, width: 3, cap: 'round' });
        return g;
    }

    _buildLevelBadge() {
        const c = new Container();
        const bg = new Graphics();
        bg.circle(0, 0, 11).fill(NEON.MAGENTA);
        bg.circle(0, 0, 11).stroke({ color: NEON.MAGENTA_LT, width: 1.5 });
        const txt = new Text({
            text: '!',
            style: {
                fontFamily: FONT_MONO,
                fontSize: 14,
                fontWeight: '900',
                fill: NEON.WHITE,
            },
        });
        txt.anchor.set(0.5);
        c.addChild(bg);
        c.addChild(txt);
        c.position.set(this.size - 5, 5);
        return c;
    }

    async setIcon(url) {
        if (this._state.icon === url) return;
        this._state.icon = url;
        if (!url) {
            this._icon.texture = Texture.EMPTY;
            return;
        }
        try {
            const tex = await Assets.load(url);
            if (this._state.icon !== url) return;
            this._icon.texture = tex;
            this._icon.width = this.size - 14;
            this._icon.height = this.size - 14;
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
            const pct = Math.min(1, remaining / duration);
            const h = (s - 8) * pct;
            this._cooldownFill
                .rect(4, s - 4 - h, s - 8, h)
                .fill({ color: NEON.BG_DK, alpha: 0.78 });
            this._cooldownText.text = remaining >= 1
                ? Math.ceil(remaining).toString()
                : remaining.toFixed(1);
            this._cooldownText.visible = true;
        } else {
            this._cooldownText.visible = false;
        }
    }

    setEmphasis(on) {
        on = !!on;
        if (this._state.emphasis === on) return;
        this._state.emphasis = on;
        this._ring.visible = on;
        if (on) this._drawRotatingRing(0);
        this._drawBody();
    }

    setEnabled(on) {
        if (this._state.enabled === on) return;
        this._state.enabled = !!on;
        this._icon.alpha = on ? 1 : 0.38;
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
        this._icon.alpha = on ? 0.22 : (this._state.enabled ? 1 : 0.38);
    }

    update(dt) {
        if (this._state.emphasis) {
            this._ringPhase = (this._ringPhase ?? 0) + dt * 1.2;
            this._drawRotatingRing(this._ringPhase);
            this._levelBadge.rotation = this._state.levelUp ? Math.sin(performance.now() / 120) * 0.08 : 0;
        }
    }

    _drawRotatingRing(phase) {
        const s = this.size;
        const cut = 13;
        const pts = [
            [cut, 0],
            [s - cut, 0],
            [s, cut],
            [s, s],
            [cut, s],
            [0, s - cut],
            [0, 0],
            [cut, 0],
        ];
        const edges = [];
        let perimeter = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            edges.push({ a, b, start: perimeter, len });
            perimeter += len;
        }

        const pointAt = (dist) => {
            dist = ((dist % perimeter) + perimeter) % perimeter;
            const edge = edges.find((e) => dist >= e.start && dist <= e.start + e.len) ?? edges[edges.length - 1];
            const t = edge.len > 0 ? (dist - edge.start) / edge.len : 0;
            return [
                edge.a[0] + (edge.b[0] - edge.a[0]) * t,
                edge.a[1] + (edge.b[1] - edge.a[1]) * t,
            ];
        };

        const drawSegment = (g, start, length, color, width, alpha) => {
            const steps = 18;
            const first = pointAt(start);
            g.moveTo(first[0], first[1]);
            for (let i = 1; i <= steps; i++) {
                const p = pointAt(start + length * (i / steps));
                g.lineTo(p[0], p[1]);
            }
            g.stroke({ color, width, alpha, cap: 'round', join: 'round' });
        };

        this._ring.clear();
        bevel(this._ring, 0, 0, s, s, cut)
            .stroke({ color: NEON.CYAN, width: 1, alpha: 0.28 });

        const head = (phase % 1) * perimeter;
        drawSegment(this._ring, head, perimeter * 0.28, NEON.MAGENTA, 4, 0.95);
        drawSegment(this._ring, head - perimeter * 0.10, perimeter * 0.12, NEON.MAGENTA_LT, 2, 0.9);
        drawSegment(this._ring, head + perimeter * 0.50, perimeter * 0.18, NEON.CYAN, 3, 0.78);
    }
}
