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
        this._currentArc = CONFIG.sword.arcAngle;
        this._currentRange = CONFIG.sword.range;
        this.mesh = this._buildArcMesh(this._currentRange, this._currentArc);
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

    /** Trigger the swing. If `enemies` is non-empty, SwordSwing applies damage
     *  itself (simple per-enemy base+crit). Pass an empty array when the caller
     *  (e.g. SwordSkill) handles combo-aware damage externally and just wants
     *  the visual. */
    trigger(position, forward, enemies, opts = {}) {
        const damage     = opts.damage     ?? CONFIG.sword.damage;
        const range      = opts.range      ?? CONFIG.sword.range;
        const arcAngle   = opts.arcAngle   ?? CONFIG.sword.arcAngle;
        const critChance = opts.critChance ?? 0;

        // Rebuild the arc mesh if the tree has changed the shape since last time.
        if (range !== this._currentRange || arcAngle !== this._currentArc) {
            this._currentRange = range;
            this._currentArc = arcAngle;
            this.mesh.geometry.dispose();
            this.mesh.geometry = this._buildArcGeometry(range, arcAngle);
        }

        this._active = true;
        this._timer = CONFIG.sword.swingDuration;
        this.mesh.visible = true;
        this.mesh.material.opacity = CONFIG.sword.opacity;

        this._up.copy(position).normalize();
        this._pos.copy(position).addScaledVector(this._up, CONFIG.sword.lift);
        this.surface.orient(this.mesh, this._pos, forward);

        if (!enemies || enemies.length === 0) return;

        // instant damage sweep in the tangent plane
        const halfArc = arcAngle / 2;
        const rangeSq = range * range;

        for (const e of enemies) {
            if (!e.alive) continue;
            this._dv.subVectors(e.position, position);
            this._tdv.copy(this._dv).addScaledVector(this._up, -this._dv.dot(this._up));
            const distSq = this._tdv.lengthSq();
            if (distSq > rangeSq) continue;

            const hit = this._rollDamage(damage, critChance);
            const dist = Math.sqrt(distSq);
            if (dist < 1e-4) { e.damage(hit); continue; }
            const cos = forward.dot(this._tdv) / dist;
            const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
            if (ang <= halfArc) e.damage(hit);
        }
    }

    _rollDamage(base, critChance) {
        return Math.random() < critChance ? base * 2 : base;
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

    // Flat arc lying in the mesh's local XZ plane, opening toward local +z.
    _buildArcGeometry(range, arcAngle) {
        const seg = 48;
        const half = arcAngle / 2;
        // CircleGeometry is in XY. thetaStart=-PI/2-half places the arc symmetric
        // around -y. After rotateX(-PI/2), (x, y, 0) → (x, 0, -y), so vertices
        // move to z ≥ 0 half-space — arc opens toward local +z.
        const geo = new THREE.CircleGeometry(
            range, seg,
            -Math.PI / 2 - half, arcAngle,
        );
        geo.rotateX(-Math.PI / 2);
        return geo;
    }

    _buildArcMesh(range, arcAngle) {
        const mat = new THREE.MeshBasicMaterial({
            color: CONFIG.sword.color,
            transparent: true,
            opacity: CONFIG.sword.opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        return new THREE.Mesh(this._buildArcGeometry(range, arcAngle), mat);
    }
}
