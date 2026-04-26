const STYLE_ID = 'screen-damage-effect-style';

export class ScreenDamageEffect {
    constructor(parent = document.body) {
        installStyle();
        this.el = document.createElement('div');
        this.el.className = 'screen-damage-effect';
        parent.appendChild(this.el);

        this._flash = 0;
        this._hitCooldown = 0;
        this._lastHpRatio = 1;
        this.update(0, 1, 1);
    }

    hit(strength = 1) {
        void strength;
        if (this._hitCooldown > 0) return;
        this._flash = 1;
        this._hitCooldown = 0.13;
    }

    update(dt, hp, maxHp) {
        const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
        this._lastHpRatio = ratio;
        this._hitCooldown = Math.max(0, this._hitCooldown - dt);
        this._flash = Math.max(0, this._flash - dt * 9.5);

        const low = ratio < 0.25 ? (0.25 - ratio) / 0.25 : 0;
        const pulse = low > 0 ? 0.72 + Math.sin(performance.now() * 0.014) * 0.28 : 0;
        const lowAlpha = low * (0.26 + 0.18 * pulse);
        const flashAlpha = Math.pow(this._flash, 1.35) * 0.88;
        const edgeAlpha = Math.max(lowAlpha, flashAlpha);
        const washAlpha = Math.max(low * 0.08, flashAlpha * 0.48);
        const blur = 24 + edgeAlpha * 86;

        this.el.style.opacity = edgeAlpha > 0.001 || washAlpha > 0.001 ? '1' : '0';
        this.el.style.setProperty('--damage-edge-alpha', edgeAlpha.toFixed(3));
        this.el.style.setProperty('--damage-edge-soft-alpha', (edgeAlpha * 0.42).toFixed(3));
        this.el.style.setProperty('--damage-edge-dark-alpha', (edgeAlpha * 0.72).toFixed(3));
        this.el.style.setProperty('--damage-wash-alpha', washAlpha.toFixed(3));
        this.el.style.setProperty('--damage-edge-blur', `${blur.toFixed(1)}px`);
    }

    reset(hp = 1, maxHp = 1) {
        this._flash = 0;
        this._hitCooldown = 0;
        this.update(0, hp, maxHp);
    }
}

function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.screen-damage-effect {
    position: fixed;
    inset: 0;
    z-index: 9;
    pointer-events: none;
    opacity: 0;
    transition: opacity 36ms linear;
    background:
        radial-gradient(ellipse at center,
            rgba(255, 0, 0, var(--damage-wash-alpha, 0)) 0%,
            rgba(255, 0, 0, 0) 34%),
        radial-gradient(ellipse at center,
            rgba(255, 0, 0, 0) 22%,
            rgba(255, 0, 0, var(--damage-edge-soft-alpha, 0)) 58%,
            rgba(190, 0, 0, var(--damage-edge-alpha, 0)) 100%);
    box-shadow:
        inset 0 0 var(--damage-edge-blur, 18px) rgba(255, 0, 0, var(--damage-edge-alpha, 0)),
        inset 0 0 180px rgba(120, 0, 0, var(--damage-edge-dark-alpha, 0));
}`;
    document.head.appendChild(style);
}
