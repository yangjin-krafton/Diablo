// Procedural planet palette — derived from the same `bias` map that drives
// drop rates, so a planet's environment tone reflects what drops there.
// See docs/drop-resource-design.md (3-5).
//
// Pipeline:
//   blendByBias(bias)              → vibrant weighted blend (gamma-boosted)
//   adjustHsl(base, satMul, lightMul) → desaturated "구안 톤" environment base
//   planetPalette(planetCfg)       → {sky, terrain, fog, accent, sun, ambientSky, ambientGround}
//
// Accents (glow/particle/HUD) keep their pure element color so they pop on
// the muted environment.

import { ELEMENT_HEX, ELEMENT_KEYS } from '../data/elements.js';

/** Weighted blend of the 5 element colors using `bias` values raised to
 *  `gamma`. Higher gamma → dominant color is more pronounced. */
export function blendByBias(bias, gamma = 1.5) {
    let r = 0, g = 0, b = 0, total = 0;
    for (const k of ELEMENT_KEYS) {
        const w = Math.pow(Math.max(0, bias?.[k] ?? 0), gamma);
        if (w <= 0) continue;
        const c = ELEMENT_HEX[k];
        r += ((c >> 16) & 0xff) * w;
        g += ((c >> 8)  & 0xff) * w;
        b += ( c        & 0xff) * w;
        total += w;
    }
    if (total <= 0) return 0x000000;
    return rgbToHex(r / total, g / total, b / total);
}

/** HSL adjust — multiply saturation and lightness. Used to dial down the
 *  blended color into a "vintage / aged" environment tone. */
export function adjustHsl(hex, { satMul = 1, lightMul = 1 } = {}) {
    const { h, s, l } = hexToHsl(hex);
    return hslToHex(h, clamp01(s * satMul), clamp01(l * lightMul));
}

/** Multiply the RGB channels of `hex` by a scalar. Useful for darkening or
 *  lightening derived environment slots without changing hue. */
export function mulColor(hex, k) {
    const r = Math.round(clamp(((hex >> 16) & 0xff) * k, 0, 255));
    const g = Math.round(clamp(((hex >> 8)  & 0xff) * k, 0, 255));
    const b = Math.round(clamp(( hex        & 0xff) * k, 0, 255));
    return (r << 16) | (g << 8) | b;
}

/** Compute the full per-planet palette from a planet config. Environment
 *  slots use the desaturated base; accent/sun stay on the pure dominant. */
export function planetPalette(planetCfg, opts = {}) {
    const {
        gamma = 1.5,
        satMul = 0.5,
        lightMul = 0.92,
    } = opts;

    const blended = blendByBias(planetCfg.bias, gamma);
    const base = adjustHsl(blended, { satMul, lightMul });
    const accent = ELEMENT_HEX[planetCfg.dominant] ?? blended;

    return {
        base,
        accent,
        sky:           mulColor(base, 0.55),         // dim distant sky
        bg:            mulColor(base, 0.20),         // very dim, fills the void
        fog:           mulColor(base, 0.85),
        terrain:       mulColor(base, 0.45),
        terrainHigh:   mulColor(base, 0.65),
        terrainLow:    mulColor(base, 0.30),
        sun:           mulColor(accent, 0.92),
        sunHalo:       accent,
        ambientSky:    mulColor(base, 0.65),
        ambientGround: mulColor(base, 0.18),
    };
}

// ---- color conversion helpers ---------------------------------------------

function rgbToHex(r, g, b) {
    return (Math.round(clamp(r, 0, 255)) << 16)
         | (Math.round(clamp(g, 0, 255)) << 8)
         |  Math.round(clamp(b, 0, 255));
}

function hexToHsl(hex) {
    const r = ((hex >> 16) & 0xff) / 255;
    const g = ((hex >> 8)  & 0xff) / 255;
    const b = ( hex        & 0xff) / 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    let h = 0, s = 0;
    if (mx !== mn) {
        const d = mx - mn;
        s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        if      (mx === r) h = ((g - b) / d) + (g < b ? 6 : 0);
        else if (mx === g) h = ((b - r) / d) + 2;
        else                h = ((r - g) / d) + 4;
        h /= 6;
    }
    return { h, s, l };
}

function hslToHex(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hueToRgb(p, q, h + 1 / 3);
        g = hueToRgb(p, q, h);
        b = hueToRgb(p, q, h - 1 / 3);
    }
    return rgbToHex(r * 255, g * 255, b * 255);
}

function hueToRgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function clamp01(v) { return clamp(v, 0, 1); }
