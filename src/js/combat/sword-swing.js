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
        this.mesh = this._buildArcEffect(this._currentRange, this._currentArc);
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
            this._setArcGeometry(range, arcAngle);
        }

        this._active = true;
        this._timer = CONFIG.sword.swingDuration;
        this.mesh.visible = true;
        this.mesh.scale.set(1, 1, 1);
        this.mesh.rotation.y = 0;
        this._fillMesh.material.opacity = CONFIG.sword.opacity * 0.55;
        this._edgeMesh.material.opacity = CONFIG.sword.opacity * 1.45;
        this._slashMesh.material.opacity = CONFIG.sword.opacity * 1.8;
        this._slashMesh.rotation.y = arcAngle * 0.35;

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
        const fade = Math.max(0, 1 - t);
        const snap = Math.sin(Math.min(1, t) * Math.PI);
        this._fillMesh.material.opacity = CONFIG.sword.opacity * 0.55 * fade;
        this._edgeMesh.material.opacity = CONFIG.sword.opacity * (1.1 + snap * 0.55) * fade;
        this._slashMesh.material.opacity = CONFIG.sword.opacity * 1.8 * Math.max(0, 1 - t * 1.35);
        this._slashMesh.rotation.y = THREE.MathUtils.lerp(this._currentArc * 0.35, -this._currentArc * 0.35, Math.min(1, t * 1.12));
        const pulse = 1 + snap * 0.05;
        this.mesh.scale.set(pulse, 1, pulse);
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

    _buildBladeGeometry(range, arcAngle) {
        const inner = range * 0.62;
        const outer = range * 1.02;
        const seg = Math.max(16, Math.ceil(arcAngle / Math.PI * 64));
        const half = arcAngle / 2;
        const geo = new THREE.RingGeometry(
            inner, outer, seg, 1,
            -Math.PI / 2 - half, arcAngle,
        );
        geo.rotateX(-Math.PI / 2);
        return geo;
    }

    _buildSlashGeometry(range) {
        const inner = range * 0.08;
        const outer = range * 1.08;
        const width = Math.min(Math.PI / 4, Math.max(Math.PI / 7, this._currentArc * 0.14));
        const geo = new THREE.RingGeometry(
            inner, outer, 18, 1,
            -Math.PI / 2 - width / 2, width,
        );
        geo.rotateX(-Math.PI / 2);
        return geo;
    }

    _setArcGeometry(range, arcAngle) {
        this._fillMesh.geometry.dispose();
        this._edgeMesh.geometry.dispose();
        this._slashMesh.geometry.dispose();
        this._fillMesh.geometry = this._buildArcGeometry(range, arcAngle);
        this._edgeMesh.geometry = this._buildBladeGeometry(range, arcAngle);
        this._slashMesh.geometry = this._buildSlashGeometry(range);
    }

    _buildArcEffect(range, arcAngle) {
        const group = new THREE.Group();

        const fillMat = new THREE.MeshBasicMaterial({
            color: CONFIG.sword.color,
            transparent: true,
            opacity: CONFIG.sword.opacity * 0.55,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this._fillMesh = new THREE.Mesh(this._buildArcGeometry(range, arcAngle), fillMat);

        const edgeMat = new THREE.MeshBasicMaterial({
            color: 0xfff0a8,
            transparent: true,
            opacity: CONFIG.sword.opacity * 1.45,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this._edgeMesh = new THREE.Mesh(this._buildBladeGeometry(range, arcAngle), edgeMat);
        this._edgeMesh.position.y = 0.012;

        const slashMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: CONFIG.sword.opacity * 1.8,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this._slashMesh = new THREE.Mesh(this._buildSlashGeometry(range), slashMat);
        this._slashMesh.position.y = 0.024;

        group.add(this._fillMesh, this._edgeMesh, this._slashMesh);
        return group;
    }
}
