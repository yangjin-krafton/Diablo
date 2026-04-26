import * as THREE from 'three';

const DEFAULTS = {
    bounceDuration: 0.22,
    bounceHeight: 0.42,
    bounceScale: 0.12,
    shakeDuration: 0.16,
    shakeDistance: 0.18,
    shakeRot: 0.12,
    dropDuration: 0.55,
    dropAngle: Math.PI * 0.56,
    dropTravel: 3.00,
    dropHop: 0.5,
    dropSink: 0.18,
    dropScale: 0.08,
};

export class TransformMotion {
    constructor(options = {}) {
        this.options = { ...DEFAULTS, ...options };
        this._bounceT = 0;
        this._shakeT = 0;
        this._dropT = 0;
        this._dropActive = false;
        this._lastHitDir = new THREE.Vector3(0, 0, 1);
        this._dropDir = new THREE.Vector3(0, 0, 1);
        this._tmp = new THREE.Vector3();
        this._axis = new THREE.Vector3(1, 0, 0);
    }

    bounce(strength = 1) {
        this._bounceT = this.options.bounceDuration * Math.max(0.25, strength);
    }

    shake(direction = null, strength = 1) {
        if (direction && direction.lengthSq() > 1e-8) this._lastHitDir.copy(direction).normalize();
        this._shakeT = this.options.shakeDuration * Math.max(0.25, strength);
    }

    drop(direction = null) {
        if (direction && direction.lengthSq() > 1e-8) {
            this._dropDir.copy(direction).normalize();
        } else {
            this._dropDir.copy(this._lastHitDir);
        }
        this._dropT = 0;
        this._dropActive = true;
    }

    update(dt) {
        this._bounceT = Math.max(0, this._bounceT - dt);
        this._shakeT = Math.max(0, this._shakeT - dt);
        if (this._dropActive) {
            this._dropT = Math.min(this.options.dropDuration, this._dropT + dt);
        }
    }

    get isDropping() {
        return this._dropActive && this._dropT < this.options.dropDuration;
    }

    get isDropDone() {
        return this._dropActive && this._dropT >= this.options.dropDuration;
    }

    reset() {
        this._bounceT = 0;
        this._shakeT = 0;
        this._dropT = 0;
        this._dropActive = false;
    }

    apply(mesh, { up, baseScale = 1 }) {
        if (!mesh) return;

        let scale = baseScale;
        if (this._bounceT > 0) {
            const t = 1 - this._bounceT / this.options.bounceDuration;
            const pulse = Math.sin(Math.min(1, t) * Math.PI);
            mesh.position.addScaledVector(up, pulse * this.options.bounceHeight);
            scale *= 1 + pulse * this.options.bounceScale;
        }

        if (this._shakeT > 0) {
            const t = 1 - this._shakeT / this.options.shakeDuration;
            const fade = 1 - t;
            const wave = Math.sin(t * Math.PI * 7);
            mesh.position.addScaledVector(this._lastHitDir, wave * fade * this.options.shakeDistance);
            mesh.rotateOnWorldAxis(up, wave * fade * this.options.shakeRot);
        }

        if (this._dropActive) {
            const t = this._easeOutCubic(this._dropT / this.options.dropDuration);
            const hop = Math.sin(Math.min(1, this._dropT / this.options.dropDuration) * Math.PI);
            this._axis.crossVectors(up, this._dropDir);
            if (this._axis.lengthSq() < 1e-8) {
                this._axis.crossVectors(up, this._tmp.set(1, 0, 0));
            }
            this._axis.normalize();
            mesh.rotateOnWorldAxis(this._axis, t * this.options.dropAngle);
            mesh.position.addScaledVector(this._dropDir, t * this.options.dropTravel);
            mesh.position.addScaledVector(up, hop * this.options.dropHop - t * this.options.dropSink);
            scale *= 1 - t * this.options.dropScale;
        }

        mesh.scale.setScalar(Math.max(0.001, scale));
    }

    _easeOutCubic(t) {
        const x = Math.max(0, Math.min(1, t));
        return 1 - Math.pow(1 - x, 3);
    }
}
