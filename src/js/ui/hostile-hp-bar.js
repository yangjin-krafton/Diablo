import * as THREE from 'three';

const BAR_W = 2.35;
const BAR_H = 0.18;
const BORDER = 0.045;

const COLOR_GREEN = 0x62f59a;
const COLOR_YELLOW = 0xffd84f;
const COLOR_RED = 0xff5f86;

export class HostileHpBar {
    constructor(parent, camera, surface, target) {
        this.parent = parent;
        this.camera = camera;
        this.surface = surface;
        this.target = target;
        this._lastRatio = -1;
        this._cameraLocal = new THREE.Vector3();
        this._forward = new THREE.Vector3();
        this._up = new THREE.Vector3();

        this.group = new THREE.Group();
        this.group.name = 'hostile_hp_bar';
        parent.add(this.group);

        this.bg = mesh(BAR_W + BORDER * 2, BAR_H + BORDER * 2, 0x08040a, 0.78);
        this.bg.renderOrder = 1090;
        this.group.add(this.bg);

        this.track = mesh(BAR_W, BAR_H, 0x2a1518, 0.86);
        this.track.renderOrder = 1091;
        this.track.position.z = 0.001;
        this.group.add(this.track);

        const fillGeo = new THREE.PlaneGeometry(BAR_W, BAR_H);
        fillGeo.translate(BAR_W / 2, 0, 0);
        this.fill = new THREE.Mesh(fillGeo, unlitMat(COLOR_GREEN, 0.96));
        this.fill.renderOrder = 1092;
        this.fill.position.set(-BAR_W / 2, 0, 0.002);
        this.group.add(this.fill);
    }

    update() {
        const visible = this.target.alive
            && !this.target.closed
            && this.target.maxHp > 0
            && this.target.mesh?.visible !== false;
        this.group.visible = !!visible;
        if (!visible) return;

        this._place();

        const ratio = clamp01(this.target.hp / this.target.maxHp);
        if (Math.abs(ratio - this._lastRatio) < 1e-3) return;
        this._lastRatio = ratio;
        this.fill.scale.x = Math.max(0, ratio);
        this.fill.material.color.setHex(ratio > 0.5 ? COLOR_GREEN : ratio > 0.25 ? COLOR_YELLOW : COLOR_RED);
    }

    detach() {
        if (this.group.parent) this.group.parent.remove(this.group);
    }

    _place() {
        this._cameraLocal.copy(this.camera.position);
        this.parent.worldToLocal(this._cameraLocal);
        this.surface.tangentTo(this.target.position, this._cameraLocal, this._forward);
        if (this._forward.lengthSq() < 1e-8) this._forward.copy(this.target.forward);

        this.surface.orient(this.group, this.target.position, this._forward);
        this._up.copy(this.target.position).normalize();
        const lift = (this.target.modelLift ?? 0) + (this.target.modelScale ?? 1) * 1.35 + 1.2;
        this.group.position.copy(this.target.position).addScaledVector(this._up, lift);
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
