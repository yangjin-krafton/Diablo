import { CONFIG } from '../config.js';
import { applyMaterialPreset } from '../material-controls.js';

const TARGETS = ['player', 'enemy', 'home'];
const NUMBER_FIELDS = [
    { path: 'roughness', label: 'Roughness', min: 0, max: 1, step: 0.01 },
    { path: 'metalness', label: 'Metalness', min: 0, max: 1, step: 0.01 },
    { path: 'emissiveIntensity', label: 'Emissive', min: 0, max: 5, step: 0.01 },
    { path: 'envMapIntensity', label: 'Env Intensity', min: 0, max: 5, step: 0.01 },
    { path: 'opacity', label: 'Opacity', min: 0.05, max: 1, step: 0.01 },
];
const COLOR_FIELDS = [
    { path: 'tint', label: 'Tint' },
    { path: 'emissive', label: 'Glow Color' },
];
const BOOL_FIELDS = [
    { path: 'wireframe', label: 'Wireframe' },
    { path: 'toneMapped', label: 'Tone Mapped' },
];

export function installMaterialEditor(game) {
    const editor = new MaterialEditor(game);
    window.diablo = {
        ...(window.diablo ?? {}),
        materialEditor: editor,
        openMaterialEditor: () => editor.open(),
        closeMaterialEditor: () => editor.close(),
        applyMaterials: () => editor.apply(),
        materialParams: () => editor.snapshot(),
    };
    window.openMaterialEditor = () => editor.open();
    window.closeMaterialEditor = () => editor.close();
    return editor;
}

class MaterialEditor {
    constructor(game) {
        this.game = game;
        this.target = 'player';
        this.el = null;
        this.body = null;
    }

    open() {
        if (!this.el) this._build();
        this.el.hidden = false;
        this._renderFields();
        this.apply();
        return this;
    }

    close() {
        if (this.el) this.el.hidden = true;
    }

    apply(target = this.target) {
        const preset = CONFIG.materials[target];
        for (const mesh of this._meshesFor(target)) applyMaterialPreset(mesh, preset);
    }

    applyAll() {
        for (const target of TARGETS) this.apply(target);
    }

    snapshot() {
        return JSON.parse(JSON.stringify(CONFIG.materials));
    }

    _build() {
        this.el = document.createElement('div');
        this.el.id = 'material-editor';
        this.el.dataset.uiLayer = 'debug';
        this.el.innerHTML = `
            <div class="material-editor-head">
                <strong>Material Editor</strong>
                <button type="button" data-action="close">x</button>
            </div>
            <div class="material-editor-targets"></div>
            <div class="material-editor-body"></div>
            <div class="material-editor-actions">
                <button type="button" data-action="apply">Apply</button>
                <button type="button" data-action="copy">Copy JSON</button>
            </div>
        `;
        this.body = this.el.querySelector('.material-editor-body');
        this._style();
        this._renderTargets();

        this.el.addEventListener('click', (e) => {
            const action = e.target?.dataset?.action;
            const target = e.target?.dataset?.target;
            if (target) {
                this.target = target;
                this._renderTargets();
                this._renderFields();
                this.apply();
            }
            if (action === 'close') this.close();
            if (action === 'apply') this.applyAll();
            if (action === 'copy') this._copyJson();
        });
        this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
        this.el.addEventListener('keydown', (e) => e.stopPropagation());

        document.body.appendChild(this.el);
    }

    _renderTargets() {
        const wrap = this.el.querySelector('.material-editor-targets');
        wrap.replaceChildren();
        for (const target of TARGETS) {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.target = target;
            button.textContent = target;
            button.className = target === this.target ? 'active' : '';
            wrap.appendChild(button);
        }
    }

    _renderFields() {
        if (!this.body) return;
        this.body.replaceChildren();
        const preset = CONFIG.materials[this.target];
        for (const field of COLOR_FIELDS) this.body.appendChild(this._colorRow(field, preset));
        for (const field of NUMBER_FIELDS) this.body.appendChild(this._numberRow(field, preset));
        for (const field of BOOL_FIELDS) this.body.appendChild(this._boolRow(field, preset));
    }

    _numberRow(field, preset) {
        const row = document.createElement('label');
        row.className = 'material-editor-row';
        const name = document.createElement('span');
        name.textContent = field.label;
        const range = document.createElement('input');
        range.type = 'range';
        range.min = field.min;
        range.max = field.max;
        range.step = field.step;
        range.value = preset[field.path];
        const number = document.createElement('input');
        number.type = 'number';
        number.min = field.min;
        number.max = field.max;
        number.step = field.step;
        number.value = range.value;
        const apply = (raw) => {
            const value = clamp(Number(raw), field.min, field.max);
            preset[field.path] = value;
            range.value = value;
            number.value = formatNumber(value);
            this.apply();
        };
        range.addEventListener('input', () => apply(range.value));
        number.addEventListener('input', () => apply(number.value));
        row.append(name, range, number);
        return row;
    }

    _colorRow(field, preset) {
        const row = document.createElement('label');
        row.className = 'material-editor-row compact';
        const name = document.createElement('span');
        name.textContent = field.label;
        const color = document.createElement('input');
        color.type = 'color';
        color.value = preset[field.path];
        const value = document.createElement('input');
        value.type = 'text';
        value.value = preset[field.path];
        const apply = (raw) => {
            preset[field.path] = normalizeColor(raw);
            color.value = preset[field.path];
            value.value = preset[field.path];
            this.apply();
        };
        color.addEventListener('input', () => apply(color.value));
        value.addEventListener('change', () => apply(value.value));
        row.append(name, color, value);
        return row;
    }

    _boolRow(field, preset) {
        const row = document.createElement('label');
        row.className = 'material-editor-row toggle';
        const name = document.createElement('span');
        name.textContent = field.label;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(preset[field.path]);
        checkbox.addEventListener('change', () => {
            preset[field.path] = checkbox.checked;
            this.apply();
        });
        row.append(name, checkbox);
        return row;
    }

    _meshesFor(target) {
        if (target === 'player') return [this.game.player.mesh].filter(Boolean);
        if (target === 'home') return [this.game.home.mesh].filter(Boolean);
        if (target === 'enemy') return this.game.spawner.enemies.map((e) => e.mesh).filter(Boolean);
        return [];
    }

    async _copyJson() {
        const text = JSON.stringify(this.snapshot(), null, 2);
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            console.log('[MaterialEditor]', text);
        }
    }

    _style() {
        if (document.getElementById('material-editor-style')) return;
        const style = document.createElement('style');
        style.id = 'material-editor-style';
        style.textContent = `
            #material-editor {
                position: fixed;
                top: 16px;
                left: 16px;
                z-index: 10000;
                width: min(360px, calc(100vw - 32px));
                color: #eaf6ff;
                background: rgba(8, 11, 18, 0.94);
                border: 1px solid rgba(255, 207, 111, 0.45);
                border-radius: 8px;
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
                font: 12px/1.35 system-ui, -apple-system, Segoe UI, sans-serif;
                pointer-events: auto;
            }
            #material-editor[hidden] { display: none; }
            .material-editor-head,
            .material-editor-actions,
            .material-editor-targets {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding: 10px 12px;
                border-bottom: 1px solid rgba(255, 207, 111, 0.18);
            }
            .material-editor-targets {
                justify-content: flex-start;
            }
            .material-editor-actions {
                border-top: 1px solid rgba(255, 207, 111, 0.18);
                border-bottom: 0;
            }
            .material-editor-body {
                display: grid;
                gap: 8px;
                padding: 10px 12px;
            }
            .material-editor-row {
                display: grid;
                grid-template-columns: 98px 1fr 72px;
                align-items: center;
                gap: 8px;
            }
            .material-editor-row.compact {
                grid-template-columns: 98px 48px 1fr;
            }
            .material-editor-row.toggle {
                grid-template-columns: 98px auto;
                justify-content: start;
            }
            #material-editor input[type="range"] {
                width: 100%;
            }
            #material-editor input[type="number"],
            #material-editor input[type="text"] {
                color: #eaf6ff;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                padding: 4px 5px;
            }
            #material-editor input[type="number"] {
                width: 72px;
            }
            #material-editor button {
                color: #eaf6ff;
                background: rgba(255, 207, 111, 0.13);
                border: 1px solid rgba(255, 207, 111, 0.45);
                border-radius: 4px;
                padding: 5px 8px;
                cursor: pointer;
            }
            #material-editor button.active {
                color: #10141b;
                background: #ffd36d;
            }
        `;
        document.head.appendChild(style);
    }
}

function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function formatNumber(value) {
    return Number(value.toFixed(3));
}

function normalizeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
}
