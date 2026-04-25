import { CONFIG } from '../config.js';

const FIELDS = [
    { path: 'range', label: 'Range', min: 0.8, max: 6, step: 0.05 },
    { path: 'hitInnerRatio', label: 'Hit Inner', min: 0, max: 0.9, step: 0.01 },
    { path: 'hitOuterRatio', label: 'Hit Outer', min: 0.4, max: 1.5, step: 0.01 },
    { path: 'opacity', label: 'Opacity', min: 0.05, max: 1, step: 0.01 },
    { path: 'lift', label: 'Lift', min: 0, max: 0.35, step: 0.005 },
    { path: 'effect.slashOpacityScale', label: 'Slash Alpha', min: 0, max: 4, step: 0.01 },
    { path: 'effect.slashWidthRatio', label: 'Slash Width', min: 0.02, max: 0.5, step: 0.01 },
    { path: 'effect.slashSweepRatio', label: 'Slash Sweep', min: 0, max: 0.75, step: 0.01 },
    { path: 'effect.trailCount', label: 'Trail Count', min: 0, max: 8, step: 1 },
    { path: 'effect.trailSpacing', label: 'Trail Delay', min: 0, max: 0.35, step: 0.01 },
    { path: 'effect.trailOpacityDecay', label: 'Trail Fade', min: 0.1, max: 0.95, step: 0.01 },
    { path: 'effect.trailLiftStep', label: 'Trail Lift', min: 0, max: 0.03, step: 0.001 },
    { path: 'effect.pulseScale', label: 'Pulse', min: 0, max: 0.25, step: 0.005 },
];

export function installSwordEffectEditor(game) {
    const editor = new SwordEffectEditor(game);
    window.diablo = {
        ...(window.diablo ?? {}),
        game,
        swordEditor: editor,
        openSwordEditor: () => editor.open(),
        closeSwordEditor: () => editor.close(),
        previewSword: () => editor.preview(),
        swordParams: () => editor.snapshot(),
    };
    window.openSwordEditor = () => editor.open();
    window.closeSwordEditor = () => editor.close();
    return editor;
}

class SwordEffectEditor {
    constructor(game) {
        this.game = game;
        this.el = null;
        this._previewTimer = 0;
    }

    open() {
        if (!this.el) this._build();
        this.el.hidden = false;
        this.preview();
        return this;
    }

    close() {
        if (this.el) this.el.hidden = true;
    }

    preview() {
        const skill = this._swordSkill();
        if (!skill) return;
        skill.onNodeChanged();
        skill.swing._currentRange = skill.range;
        skill.swing._currentArc = skill.arc;
        skill.swing._syncTrailMeshes();
        skill.swing._setArcGeometry(skill.range);
        skill.swing.trigger(this.game.player.position, this.game.player.forward, [], {
            damage: 0,
            range: skill.range,
            arcAngle: skill.arc,
            critChance: 0,
        });
    }

    snapshot() {
        const out = {};
        for (const field of FIELDS) out[field.path] = getValue(CONFIG.sword, field.path);
        return out;
    }

    _build() {
        this.el = document.createElement('div');
        this.el.id = 'sword-effect-editor';
        this.el.dataset.uiLayer = 'debug';
        this.el.innerHTML = `
            <div class="sword-editor-head">
                <strong>Sword Effect Editor</strong>
                <button type="button" data-action="close">x</button>
            </div>
            <div class="sword-editor-body"></div>
            <div class="sword-editor-actions">
                <button type="button" data-action="preview">Preview</button>
                <button type="button" data-action="copy">Copy JSON</button>
            </div>
        `;
        this._style();

        const body = this.el.querySelector('.sword-editor-body');
        for (const field of FIELDS) body.appendChild(this._row(field));

        this.el.addEventListener('click', (e) => {
            const action = e.target?.dataset?.action;
            if (action === 'close') this.close();
            if (action === 'preview') this.preview();
            if (action === 'copy') this._copyJson();
        });
        this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
        this.el.addEventListener('keydown', (e) => e.stopPropagation());

        document.body.appendChild(this.el);
    }

    _row(field) {
        const row = document.createElement('label');
        row.className = 'sword-editor-row';

        const name = document.createElement('span');
        name.textContent = field.label;

        const range = document.createElement('input');
        range.type = 'range';
        range.min = field.min;
        range.max = field.max;
        range.step = field.step;
        range.value = getValue(CONFIG.sword, field.path);

        const number = document.createElement('input');
        number.type = 'number';
        number.min = field.min;
        number.max = field.max;
        number.step = field.step;
        number.value = range.value;

        const apply = (raw) => {
            const value = clamp(Number(raw), field.min, field.max);
            setValue(CONFIG.sword, field.path, value);
            range.value = value;
            number.value = formatNumber(value);
            this._schedulePreview();
        };
        range.addEventListener('input', () => apply(range.value));
        number.addEventListener('input', () => apply(number.value));

        row.append(name, range, number);
        return row;
    }

    _schedulePreview() {
        window.clearTimeout(this._previewTimer);
        this._previewTimer = window.setTimeout(() => this.preview(), 30);
    }

    async _copyJson() {
        const text = JSON.stringify(this.snapshot(), null, 2);
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            console.log('[SwordEffectEditor]', text);
        }
    }

    _swordSkill() {
        return this.game.skillSystem.getSkillById('sword');
    }

    _style() {
        if (document.getElementById('sword-effect-editor-style')) return;
        const style = document.createElement('style');
        style.id = 'sword-effect-editor-style';
        style.textContent = `
            #sword-effect-editor {
                position: fixed;
                top: 16px;
                right: 16px;
                z-index: 10000;
                width: min(360px, calc(100vw - 32px));
                color: #eaf6ff;
                background: rgba(7, 12, 20, 0.92);
                border: 1px solid rgba(111, 221, 255, 0.45);
                border-radius: 8px;
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
                font: 12px/1.35 system-ui, -apple-system, Segoe UI, sans-serif;
                pointer-events: auto;
            }
            #sword-effect-editor[hidden] { display: none; }
            .sword-editor-head,
            .sword-editor-actions {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 10px 12px;
                border-bottom: 1px solid rgba(111, 221, 255, 0.18);
            }
            .sword-editor-actions {
                border-top: 1px solid rgba(111, 221, 255, 0.18);
                border-bottom: 0;
            }
            .sword-editor-body {
                display: grid;
                gap: 8px;
                padding: 10px 12px;
                max-height: min(70vh, 560px);
                overflow: auto;
            }
            .sword-editor-row {
                display: grid;
                grid-template-columns: 92px 1fr 72px;
                align-items: center;
                gap: 8px;
            }
            #sword-effect-editor input[type="range"] {
                width: 100%;
            }
            #sword-effect-editor input[type="number"] {
                width: 72px;
                color: #eaf6ff;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                padding: 4px 5px;
            }
            #sword-effect-editor button {
                color: #eaf6ff;
                background: rgba(111, 221, 255, 0.14);
                border: 1px solid rgba(111, 221, 255, 0.45);
                border-radius: 4px;
                padding: 5px 8px;
                cursor: pointer;
            }
        `;
        document.head.appendChild(style);
    }
}

function getValue(root, path) {
    return path.split('.').reduce((obj, key) => obj[key], root);
}

function setValue(root, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((obj, key) => obj[key], root);
    target[last] = value;
}

function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function formatNumber(value) {
    return Number(value.toFixed(3));
}
