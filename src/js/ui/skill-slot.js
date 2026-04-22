// One square skill slot — DOM-based, self-contained, diffing setter API.
// Features (see README of UI): icon, cooldown sweep + text, emphasis ring,
// enabled/disabled, level-up mark, locked X-cover, activation callback.
//
// Extension points:
//   - Add new visual layers by adding a child div in _build() and a setter that
//     toggles a modifier class on the root. Keep setters idempotent so update()
//     from the game loop is cheap.
//   - State lives on the instance; DOM is re-written only when state changes.

export class SkillSlot {
    constructor(opts = {}) {
        this.id = opts.id ?? 'slot';
        this.el = this._build();
        this._onActivate = opts.onActivate ?? null;

        this._state = {
            icon: null,
            cooldownRemaining: 0,
            cooldownDuration: 0,
            emphasis: false,
            enabled: true,
            levelUp: false,
            locked: false,
        };

        if (opts.icon) this.setIcon(opts.icon);
        this._bindActivate();
    }

    _build() {
        const root = document.createElement('button');
        root.type = 'button';
        root.className = 'skill-slot';
        root.dataset.skillId = this.id;
        // Ring: SVG stroked rounded rect with pathLength=100 so dasharray works
        // in percent units regardless of size. Animate dashoffset 0 → -100 to
        // send a short visible segment traveling once around the outline.
        root.innerHTML = `
            <svg class="skill-slot__ring" viewBox="0 0 64 64" aria-hidden="true">
                <rect x="1" y="1" width="62" height="62" rx="9" ry="9"
                      pathLength="100" fill="none"
                      stroke-width="2.5" stroke-linecap="round"
                      stroke-dasharray="22 78" />
            </svg>
            <div class="skill-slot__icon"></div>
            <div class="skill-slot__cooldown-fill"></div>
            <div class="skill-slot__cooldown-text"></div>
            <div class="skill-slot__level-up">!</div>
            <div class="skill-slot__locked"></div>
        `;
        this._icon = root.querySelector('.skill-slot__icon');
        this._cdFill = root.querySelector('.skill-slot__cooldown-fill');
        this._cdText = root.querySelector('.skill-slot__cooldown-text');
        return root;
    }

    _bindActivate() {
        // pointerdown (not click) for low-latency mobile feel.
        this.el.addEventListener('pointerdown', (e) => {
            e.stopPropagation(); // keep joystick from triggering behind the slot
            if (!this._state.enabled || this._state.locked) return;
            if (this._state.cooldownRemaining > 0) return;
            this._onActivate?.(this);
        });
    }

    setIcon(url) {
        if (this._state.icon === url) return;
        this._state.icon = url;
        this._icon.style.backgroundImage = url ? `url("${url}")` : 'none';
    }

    /** Set cooldown progress. remaining and duration in seconds. */
    setCooldown(remaining, duration) {
        remaining = Math.max(0, remaining);
        duration = Math.max(0, duration);
        if (
            this._state.cooldownRemaining === remaining &&
            this._state.cooldownDuration === duration
        ) return;
        this._state.cooldownRemaining = remaining;
        this._state.cooldownDuration = duration;

        const active = remaining > 0 && duration > 0;
        this.el.classList.toggle('skill-slot--cooling', active);
        if (active) {
            const pct = Math.min(1, remaining / duration) * 100;
            // bottom-up wipe via linear-gradient; keeps DOM minimal.
            this._cdFill.style.background =
                `linear-gradient(to top, rgba(0,0,0,0.65) ${pct}%, transparent ${pct}%)`;
            this._cdText.textContent = remaining >= 1
                ? Math.ceil(remaining).toString()
                : remaining.toFixed(1);
        } else {
            this._cdFill.style.background = '';
            this._cdText.textContent = '';
        }
    }

    setEmphasis(on) {
        if (this._state.emphasis === on) return;
        this._state.emphasis = !!on;
        this.el.classList.toggle('skill-slot--emphasis', !!on);
    }

    setEnabled(on) {
        if (this._state.enabled === on) return;
        this._state.enabled = !!on;
        this.el.classList.toggle('skill-slot--disabled', !on);
    }

    setLevelUp(on) {
        if (this._state.levelUp === on) return;
        this._state.levelUp = !!on;
        this.el.classList.toggle('skill-slot--level-up', !!on);
    }

    setLocked(on) {
        if (this._state.locked === on) return;
        this._state.locked = !!on;
        this.el.classList.toggle('skill-slot--locked', !!on);
    }
}
