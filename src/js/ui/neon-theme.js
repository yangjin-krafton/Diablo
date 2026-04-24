import { Text } from 'pixi.js';

export const NEON = {
    BG: 0x060414,
    BG_DK: 0x03040c,
    PANEL: 0x080616,
    PANEL_2: 0x0c0a20,
    CYAN: 0x00e5ff,
    CYAN_LT: 0x8be9ff,
    MAGENTA: 0xff00a2,
    MAGENTA_LT: 0xff9fd8,
    WHITE: 0xffffff,
    TEXT: 0xe6f0ff,
    TEXT_DM: 0x9cb4d0,
    TEXT_FT: 0x52677d,
    GREEN: 0x62f59a,
    RED: 0xff5f86,
};

export const FONT_UI = '"Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';
export const FONT_MONO = '"Consolas", "Malgun Gothic", "Noto Sans KR", monospace';

export function bevel(g, x, y, w, h, cut = 14) {
    const c = Math.min(cut, w / 3, h / 3);
    return g
        .moveTo(x, y)
        .lineTo(x + w - c, y)
        .lineTo(x + w, y + c)
        .lineTo(x + w, y + h)
        .lineTo(x + c, y + h)
        .lineTo(x, y + h - c)
        .lineTo(x, y);
}

export function neonPanel(g, x, y, w, h, {
    fill = NEON.PANEL,
    stroke = NEON.CYAN,
    alpha = 0.82,
    strokeAlpha = 0.42,
    cut = 16,
    glow = false,
} = {}) {
    bevel(g, x, y, w, h, cut).fill({ color: fill, alpha });
    bevel(g, x, y, w, h, cut).stroke({ color: stroke, alpha: strokeAlpha, width: glow ? 2 : 1 });
    bevel(g, x + 4, y + 4, w - 8, h - 8, Math.max(4, cut - 5))
        .stroke({ color: stroke, alpha: glow ? 0.18 : 0.08, width: 1 });
}

export function neonButton(g, x, y, w, h, {
    primary = true,
    enabled = true,
    cut = 10,
} = {}) {
    const fill = !enabled ? NEON.PANEL_2 : (primary ? NEON.MAGENTA : NEON.PANEL);
    const stroke = !enabled ? NEON.TEXT_FT : (primary ? NEON.MAGENTA_LT : NEON.CYAN);
    const alpha = !enabled ? 0.62 : (primary ? 0.98 : 0.76);
    neonPanel(g, x, y, w, h, {
        fill,
        stroke,
        alpha,
        strokeAlpha: enabled ? 0.72 : 0.35,
        cut,
        glow: enabled && primary,
    });
}

export function makeText(text, style = {}) {
    return new Text({
        text,
        style: {
            fontFamily: FONT_UI,
            fill: NEON.TEXT,
            letterSpacing: 0,
            ...style,
        },
    });
}

export function fitText({ text, style, maxW, maxH = null, breakWords = true }) {
    const s = {
        fontFamily: FONT_UI,
        fill: NEON.TEXT,
        letterSpacing: 0,
        ...style,
    };
    if (maxH != null) {
        s.wordWrap = true;
        s.wordWrapWidth = maxW;
        s.breakWords = breakWords;
    }
    const t = new Text({ text, style: s });
    const sw = t.width > maxW ? maxW / t.width : 1;
    const sh = maxH && t.height > maxH ? maxH / t.height : 1;
    const scale = Math.min(sw, sh);
    if (scale < 1) t.scale.set(scale);
    return t;
}
