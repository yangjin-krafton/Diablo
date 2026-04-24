// Pixi-based UI overlay. One transparent canvas is pinned above the 3D canvas
// and split into z-ordered layers for HUD, modal panels, and the skill bar.

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
            pointerEvents: 'none',
        });
        canvas.dataset.uiLayer = 'ui';
        document.body.appendChild(canvas);

        this.stage = this.app.stage;
        this.stage.eventMode = 'static';

        this.hudLayer = this.stage.addChild(new Container());
        this.barLayer = this.stage.addChild(new Container());
        this.panelLayer = this.stage.addChild(new Container());

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

    update(dt) {
        void dt;
    }

    setSkillBarVisible(visible) {
        this.barLayer.visible = !!visible;
    }

    get width() { return this.app.screen.width; }
    get height() { return this.app.screen.height; }
}
