// Close-range semicircle sword swing.
// - Visual: flat arc mesh on the ground in front of the player, fades out over swingDuration.
// - Hit detection: instantaneous on trigger; enemies within radius AND within arcAngle of
//   the facing direction take damage.
//
// To extend: swap geometry in _buildArcMesh (e.g. ring, cone), or split trigger() into
// visual-only and damage-only methods for separate timing.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class SwordSwing {
    constructor() {
        this.mesh = this._buildArcMesh();
        this.mesh.visible = false;
        this._timer = 0;
        this._active = false;
    }

    attach(scene) {
        scene.add(this.mesh);
    }

    trigger(position, facing, enemies) {
        this._active = true;
        this._timer = CONFIG.sword.swingDuration;
        this.mesh.visible = true;
        this.mesh.position.set(position.x, 0.04, position.z);
        // facing = (worldX, worldZ). Convert to yaw around +Y so arc opens toward facing.
        this.mesh.rotation.y = Math.atan2(-facing.y, facing.x);
        this.mesh.material.opacity = CONFIG.sword.opacity;

        // instant damage sweep
        const halfArc = CONFIG.sword.arcAngle / 2;
        const rangeSq = CONFIG.sword.range * CONFIG.sword.range;
        for (const e of enemies) {
            if (!e.alive) continue;
            const dx = e.position.x - position.x;
            const dz = e.position.z - position.z;
            const distSq = dx * dx + dz * dz;
            if (distSq > rangeSq) continue;
            const dist = Math.sqrt(distSq);
            if (dist < 1e-4) { e.damage(CONFIG.sword.damage); continue; }
            // dot(facing, toEnemyNormalized)
            const dot = (facing.x * dx + facing.y * dz) / dist;
            const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
            if (ang <= halfArc) e.damage(CONFIG.sword.damage);
        }
    }

    update(dt) {
        if (!this._active) return;
        this._timer -= dt;
        const t = 1 - this._timer / CONFIG.sword.swingDuration;
        this.mesh.material.opacity = CONFIG.sword.opacity * Math.max(0, 1 - t);
        if (this._timer <= 0) {
            this._active = false;
            this.mesh.visible = false;
        }
    }

    _buildArcMesh() {
        const segments = 36;
        const half = CONFIG.sword.arcAngle / 2;
        // CircleGeometry arc centered on +x (thetaStart=-half, thetaLength=arcAngle).
        const geo = new THREE.CircleGeometry(CONFIG.sword.range, segments, -half, CONFIG.sword.arcAngle);
        geo.rotateX(-Math.PI / 2); // bake flat on XZ plane
        const mat = new THREE.MeshBasicMaterial({
            color: CONFIG.sword.color,
            transparent: true,
            opacity: CONFIG.sword.opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        return new THREE.Mesh(geo, mat);
    }
}
