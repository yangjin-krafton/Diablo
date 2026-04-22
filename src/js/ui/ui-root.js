// Pixi-based UI overlay. One transparent canvas pinned above the 3D canvas;
// three z-ordered layers: hud → skill bar → modal panel.
//
// Pointer pass-through: the UI canvas starts with `pointer-events: none` so
// world input (joystick, camera drag) reaches the game canvas normally. On
// every pointermove we hit-test the Pixi scene — if any interactive element
// is under the cursor, we flip to `pointer-events: auto` so Pixi receives the
// event. The canvas is tagged [data-ui-layer] so the joystick binding ignores
// it even while auto. Result: world drags work outside UI regions, UI taps
// work inside, no duplicate input.

import { Application, Container } from 'pixi.js';

export class UIRoot {
    constructor() {
        this.app = new Application();
        this.ready = this._init();
    }

    async _init() {
        await this.app.init({
            resizeTo: window,
            backgroundAlpha: 0,
            antialias: true,
            resolution: Math.min(window.devicePixelRatio, 2),
            autoDensity: true,
        });

        const canvas = this.app.canvas;
        canvas.id = 'ui-canvas';
        Object.assign(canvas.style, {
            position: 'fixed',
            inset: '0',
            width: '100%',
            height: '100%',
            zIndex: '50',
            pointerEvents: 'none',  // default: let world input pass through
        });
        canvas.dataset.uiLayer = 'ui';  // joystick opts out of this layer
        document.body.appendChild(canvas);

        this.stage = this.app.stage;
        this.stage.eventMode = 'static';

        // Layer order (bottom → top):
        //   hud      — status readouts, non-interactive
        //   panel    — modal skill tree; covers everything when open
        //   bar      — skill bar; stays on top so its slots keep working as
        //              tabs while the panel is open (clicks hit slots, not
        //              the panel's backdrop)
        this.hudLayer      = this.stage.addChild(new Container());
        this.panelLayer    = this.stage.addChild(new Container());
        this.barLayer      = this.stage.addChild(new Container());

        this._setupHitToggle();
        this._resizeListeners = [];
        window.addEventListener('resize', () => this._emitResize());
    }

    /** Register a callback to run on Pixi resize. Returns an unsubscribe fn. */
    onResize(fn) {
        this._resizeListeners.push(fn);
        fn(this.app.screen.width, this.app.screen.height);
        return () => {
            const i = this._resizeListeners.indexOf(fn);
            if (i >= 0) this._resizeListeners.splice(i, 1);
        };
    }

    _emitResize() {
        const { width, height } = this.app.screen;
        for (const fn of this._resizeListeners) fn(width, height);
    }

    _setupHitToggle() {
        const canvas = this.app.canvas;
        const boundary = this.app.renderer.events.rootBoundary;

        // Listen at the window level so we see moves even while the canvas is
        // pointer-events:none. `hitTest` returns a display object when any
        // interactive node is under the cursor.
        //
        // Guard: hitTest can throw in v8 when it races with display-tree edits
        // (e.g. a container is being removed/re-added). If it throws, leave
        // pointer-events on its current setting — the next move will retry.
        const check = (e) => {
            let hit = null;
            try {
                hit = boundary.hitTest(e.clientX, e.clientY);
            } catch {
                return;
            }
            const wantAuto = !!hit && hit !== this.stage;
            canvas.style.pointerEvents = wantAuto ? 'auto' : 'none';
        };
        window.addEventListener('pointermove', check, true);
        window.addEventListener('pointerdown', check, true);
    }

    /** Tick any animations Pixi doesn't drive itself. */
    update(dt) {
        // individual UI modules subscribe by overriding their own update()
        // and the Game orchestrator calls it — kept empty here for now.
        void dt;
    }

    get width()  { return this.app.screen.width; }
    get height() { return this.app.screen.height; }
}
