// 3D HP bar floating above the player's head.
//
// The player visually lives at world (0, R, 0) thanks to the worldRotator
// inverse-rotation trick (see Player + Game), and the camera is static. So
// we attach the bar straight to the scene root at (0, R + lift, 0) and
// orient it once toward the camera — no per-frame billboard math needed.
//
// Layout: dark frame → mid-grey track → coloured fill. Fill geometry is
// pivoted at its left edge so `fill.scale.x = hp / maxHp` shrinks toward
// the right exactly like a regular game HP bar.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const BAR_W = 1.7;
const BAR_H = 0.18;
const BORDER = 0.045;

const COLOR_GREEN  = 0x62f59a;
const COLOR_YELLOW = 0xffd84f;
const COLOR_RED    = 0xff5f86;

export class PlayerHpBar {
    constructor(scene, camera, surface, player) {
        this.player = player;
        this.surface = surface;

        this.group = new THREE.Group();
        this.group.name = 'player_hp_bar';
        scene.add(this.group);

        this.bg = mesh(BAR_W + BORDER * 2, BAR_H + BORDER * 2, 0x040614, 0.78);
        this.bg.renderOrder = 1100;
        this.group.add(this.bg);

        this.track = mesh(BAR_W, BAR_H, 0x1a2236, 0.85);
        this.track.renderOrder = 1101;
        this.track.position.z = 0.001;
        this.group.add(this.track);

        // Fill — geometry pivoted at left edge so scale.x = ratio works.
        const fillGeo = new THREE.PlaneGeometry(BAR_W, BAR_H);
        fillGeo.translate(BAR_W / 2, 0, 0);
        const fillMat = unlitMat(COLOR_GREEN, 0.96);
        this.fill = new THREE.Mesh(fillGeo, fillMat);
        this.fill.renderOrder = 1102;
        this.fill.position.set(-BAR_W / 2, 0, 0.002);
        this.group.add(this.fill);

        // Place the bar above where the player visually lands. The lift
        // accounts for the model's scale + its modelLift offset, plus a bit
        // of headroom so the bar doesn't intersect the model.
        const lift = (CONFIG.player.modelLift ?? 0)
                   + (CONFIG.player.modelScale ?? 1) * 1.05
                   + 1.55;
        this.group.position.set(0, surface.radius + lift, 0);

        // Static camera → static orientation. lookAt makes the plane's
        // front face (+Z local) point AWAY from the camera, so we render
        // both sides via DoubleSide on the materials and use a fixed flip.
        this.group.lookAt(camera.position);

        this._lastRatio = -1;
    }

    update() {
        const alive = this.player.alive && this.player.maxHp > 0;
        this.group.visible = alive;
        if (!alive) return;

        const ratio = clamp01(this.player.hp / this.player.maxHp);
        if (Math.abs(ratio - this._lastRatio) < 1e-3) return;
        this._lastRatio = ratio;

        this.fill.scale.x = Math.max(0, ratio);
        const color = ratio > 0.5 ? COLOR_GREEN
                    : ratio > 0.25 ? COLOR_YELLOW
                    : COLOR_RED;
        this.fill.material.color.setHex(color);
    }
}

function unlitMat(color, opacity) {
    return new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
    });
}

function mesh(w, h, color, opacity) {
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), unlitMat(color, opacity));
}

function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}
