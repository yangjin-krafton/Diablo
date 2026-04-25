// Single source of truth for the 5 drop-resource elements.
// Documented in docs/drop-resource-design.md.
//
// Keys (`red/yellow/green/blue/purple`) match `home-controller.ores` and the
// HUD chip row, so existing UI stays compatible. Code/label/hex are exposed
// for systems that need richer presentation.

export const ELEMENT_KEYS = ['red', 'yellow', 'green', 'blue', 'purple'];

export const ELEMENT_HEX = {
    red:    0xff3f5f,
    yellow: 0xffd84f,
    green:  0x62f59a,
    blue:   0x33c9ff,
    purple: 0xb469ff,
};

export const ELEMENTS = {
    red:    { key: 'red',    code: 'IGNIS',  label: '적', emissive: 0xff7a1f, theme: 'fire' },
    yellow: { key: 'yellow', code: 'ARC',    label: '황', emissive: 0xffae22, theme: 'electric' },
    green:  { key: 'green',  code: 'BIOS',   label: '녹', emissive: 0x2bdc7c, theme: 'nature' },
    blue:   { key: 'blue',   code: 'GLACIA', label: '청', emissive: 0x1e8fcf, theme: 'water' },
    purple: { key: 'purple', code: 'TOXIN',  label: '자', emissive: 0x8a3dff, theme: 'toxin' },
};

export function emptyOreMap() {
    return { red: 0, yellow: 0, green: 0, blue: 0, purple: 0 };
}

/** Pick an element key using a `bias` map as multiplicative weights against a
 *  uniform base. Returns one of ELEMENT_KEYS. */
export function rollElementByBias(bias) {
    let total = 0;
    const weights = ELEMENT_KEYS.map((k) => {
        const w = Math.max(0, bias?.[k] ?? 1);
        total += w;
        return w;
    });
    if (total <= 0) return ELEMENT_KEYS[Math.floor(Math.random() * ELEMENT_KEYS.length)];
    let r = Math.random() * total;
    for (let i = 0; i < ELEMENT_KEYS.length; i++) {
        r -= weights[i];
        if (r <= 0) return ELEMENT_KEYS[i];
    }
    return ELEMENT_KEYS[ELEMENT_KEYS.length - 1];
}
