// Unified input: keyboard (WASD/arrows) + virtual joystick (pointer/touch).
// Exposes moveVector() returning { x, z } — normalized direction in world XZ plane.
// Joystick, when active, takes priority over keyboard so analog tilt is preserved.
//
// Extension points:
//   - Add buttons: bind more pointer handlers, expose booleans (e.g. this.dash).
//   - Change joystick feel: tweak JOY_RADIUS / JOY_DEADZONE below.

const JOY_RADIUS = 60;    // px — max stick distance from base center
const JOY_DEADZONE = 0.14; // 0..1 — input magnitude below this reads as zero

export class InputState {
    constructor() {
        this.keys = new Set();
        // joystick output in [-1, 1]; dy is mapped to world +z (down on screen = +z)
        this.joy = { active: false, dx: 0, dy: 0 };

        this._bindKeyboard();
        this._bindJoystick();
    }

    moveVector() {
        if (this.joy.active) {
            return { x: this.joy.dx, z: this.joy.dy };
        }
        let x = 0, z = 0;
        if (this.keys.has('KeyW') || this.keys.has('ArrowUp'))    z -= 1;
        if (this.keys.has('KeyS') || this.keys.has('ArrowDown'))  z += 1;
        if (this.keys.has('KeyA') || this.keys.has('ArrowLeft'))  x -= 1;
        if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
        const len = Math.hypot(x, z);
        if (len > 0) { x /= len; z /= len; }
        return { x, z };
    }

    _bindKeyboard() {
        window.addEventListener('keydown', (e) => {
            this.keys.add(e.code);
            // prevent page scroll with arrow keys / space
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                e.preventDefault();
            }
        }, { passive: false });
        window.addEventListener('keyup', (e) => this.keys.delete(e.code));
        window.addEventListener('blur', () => this.keys.clear());
    }

    _bindJoystick() {
        const base = document.getElementById('joy-base');
        const stick = document.getElementById('joy-stick');
        const root = document.getElementById('game-root');
        if (!base || !stick || !root) return;

        let activeId = null;
        let cx = 0, cy = 0;

        const show = (x, y) => {
            cx = x; cy = y;
            base.style.left = `${x - 60}px`;
            base.style.top  = `${y - 60}px`;
            stick.style.left = `${x - 30}px`;
            stick.style.top  = `${y - 30}px`;
            base.style.display = 'block';
            stick.style.display = 'block';
        };

        const hide = () => {
            base.style.display = 'none';
            stick.style.display = 'none';
            this.joy.active = false;
            this.joy.dx = 0;
            this.joy.dy = 0;
        };

        const move = (x, y) => {
            let dx = x - cx;
            let dy = y - cy;
            const d = Math.hypot(dx, dy);
            if (d > JOY_RADIUS) {
                dx *= JOY_RADIUS / d;
                dy *= JOY_RADIUS / d;
            }
            stick.style.left = `${cx + dx - 30}px`;
            stick.style.top  = `${cy + dy - 30}px`;

            const nx = dx / JOY_RADIUS;
            const ny = dy / JOY_RADIUS;
            const mag = Math.hypot(nx, ny);
            if (mag < JOY_DEADZONE) {
                this.joy.active = false;
                this.joy.dx = 0;
                this.joy.dy = 0;
            } else {
                // rescale past the dead zone so the response starts at 0 and ends at 1
                const scaled = (mag - JOY_DEADZONE) / (1 - JOY_DEADZONE);
                const k = scaled / mag;
                this.joy.active = true;
                this.joy.dx = nx * k;
                this.joy.dy = ny * k;
            }
        };

        root.addEventListener('pointerdown', (e) => {
            if (activeId !== null) return;
            // UI elements (skill bar, buttons, etc.) opt out of joystick by
            // tagging themselves with [data-ui-layer]. Lets a skill tap stay
            // a skill tap instead of also dragging the movement stick.
            if (e.target.closest?.('[data-ui-layer]')) return;
            activeId = e.pointerId;
            try { root.setPointerCapture(e.pointerId); } catch {}
            show(e.clientX, e.clientY);
            // start as active in case pointerdown happens without subsequent move
            this.joy.active = true;
            e.preventDefault();
        }, { passive: false });

        root.addEventListener('pointermove', (e) => {
            if (e.pointerId !== activeId) return;
            move(e.clientX, e.clientY);
        });

        const end = (e) => {
            if (e.pointerId !== activeId) return;
            try { root.releasePointerCapture(e.pointerId); } catch {}
            activeId = null;
            hide();
        };
        root.addEventListener('pointerup', end);
        root.addEventListener('pointercancel', end);
        root.addEventListener('lostpointercapture', end);

        // reset if the tab goes hidden mid-drag
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && activeId !== null) {
                activeId = null;
                hide();
            }
        });

        // suppress browser gestures (pinch/context menu) on the canvas area
        root.addEventListener('contextmenu', (e) => e.preventDefault());
        root.addEventListener('gesturestart', (e) => e.preventDefault());
    }
}
