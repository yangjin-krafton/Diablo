// Close-range semicircle sword swing on a spherical surface.
// - Visual: flat arc mesh lying on the tangent plane at the player, opening
//   toward the player's forward direction. Fades out over swingDuration.
// - Hit detection: instantaneous. Enemy is hit iff
//     (a) tangent-plane distance ≤ sword.range, AND
//     (b) angle between player forward and (enemy − player) projected to tangent
//         plane is ≤ arcAngle / 2.
//
// For short melee ranges (range ≪ planetRadius) tangent-plane distance differs
// from true arc distance by < 0.1% so we use it directly.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class SwordSwing {
    constructor(surface) {
        this.surface = surface;
        this.mesh = this._buildArcMesh();
        this.mesh.visible = false;
        this._timer = 0;
        this._active = false;

        this._up = new THREE.Vector3();
        this._dv = new THREE.Vector3();
        this._tdv = new THREE.Vector3();
        this._pos = new THREE.Vector3();
    }

    attach(parent) {
        parent.add(this.mesh);
    }

    trigger(position, forward, enemies) {
        this._active = true;
        this._timer = CONFIG.sword.swingDuration;
        this.mesh.visible = true;
        this.mesh.material.opacity = CONFIG.sword.opacity;

        // lift the arc slightly off the surface to avoid z-fighting
        this._up.copy(position).normalize();
        this._pos.copy(position).addScaledVector(this._up, CONFIG.sword.lift);
        this.surface.orient(this.mesh, this._pos, forward);

        // instant damage sweep in the tangent plane
        const halfArc = CONFIG.sword.arcAngle / 2;
        const rangeSq = CONFIG.sword.range * CONFIG.sword.range;

        for (const e of enemies) {
            if (!e.alive) continue;
            // relative vector projected onto player's tangent plane
            this._dv.subVectors(e.position, position);
            this._tdv.copy(this._dv).addScaledVector(this._up, -this._dv.dot(this._up));
            const distSq = this._tdv.lengthSq();
            if (distSq > rangeSq) continue;
            const dist = Math.sqrt(distSq);
            if (dist < 1e-4) { e.damage(CONFIG.sword.damage); continue; }
            const cos = forward.dot(this._tdv) / dist;
            const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
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

    // Flat semicircle lying in the mesh's local XZ plane, opening toward local +z.
    _buildArcMesh() {
        const seg = 40;
        const half = CONFIG.sword.arcAngle / 2;
        // CircleGeometry is in XY. thetaStart=-PI/2-half places the arc symmetric
        // around -y. After rotateX(-PI/2), (x, y, 0) → (x, 0, -y), so vertices
        // move to z ≥ 0 half-space — arc opens toward local +z.
        const geo = new THREE.CircleGeometry(
            CONFIG.sword.range, seg,
            -Math.PI / 2 - half, CONFIG.sword.arcAngle,
        );
        geo.rotateX(-Math.PI / 2);
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
