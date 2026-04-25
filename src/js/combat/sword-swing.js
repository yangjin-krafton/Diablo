// Close-range sword swing on a spherical surface.
// Visual: only the moving slash arc is drawn. Optional trail meshes render the
// previous slash positions with lower opacity so the swing leaves an afterimage.
// Hit detection: instantaneous swept blade band in the tangent plane.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

export class SwordSwing {
    constructor(surface) {
        this.surface = surface;
        this._currentArc = CONFIG.sword.arcAngle;
        this._currentRange = CONFIG.sword.range;
        this.mesh = this._buildArcEffect(this._currentRange);
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
        const damage = opts.damage ?? CONFIG.sword.damage;
        const range = opts.range ?? CONFIG.sword.range;
        const arcAngle = opts.arcAngle ?? CONFIG.sword.arcAngle;
        const critChance = opts.critChance ?? 0;

        if (range !== this._currentRange || arcAngle !== this._currentArc) {
            this._currentRange = range;
            this._currentArc = arcAngle;
            this._setArcGeometry(range);
        }
        this._syncTrailMeshes();

        this._active = true;
        this._timer = CONFIG.sword.swingDuration;
        this.mesh.visible = true;
        this.mesh.scale.set(1, 1, 1);
        this.mesh.rotation.y = 0;
        this._applySlashState(0);

        this._up.copy(position).normalize();
        this._pos.copy(position).addScaledVector(this._up, CONFIG.sword.lift);
        this.surface.orient(this.mesh, this._pos, forward);

        if (!enemies || enemies.length === 0) return;

        const halfArc = arcAngle / 2;
        const inner = range * CONFIG.sword.hitInnerRatio;
        const outer = range * CONFIG.sword.hitOuterRatio;

        for (const e of enemies) {
            if (!e.alive) continue;
            this._dv.subVectors(e.position, position);
            this._tdv.copy(this._dv).addScaledVector(this._up, -this._dv.dot(this._up));
            const distSq = this._tdv.lengthSq();
            const bodyRadius = e.radius ?? CONFIG.enemy.radius ?? 0;
            if (distSq > (outer + bodyRadius) * (outer + bodyRadius)) continue;

            const hit = this._rollDamage(damage, critChance);
            const dist = Math.sqrt(distSq);
            if (dist + bodyRadius < inner) continue;
            if (dist < 1e-4) continue;
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
        this._applySlashState(t, fade);
        const pulse = 1 + snap * CONFIG.sword.effect.pulseScale;
        this.mesh.scale.set(pulse, 1, pulse);
        if (this._timer <= 0) {
            this._active = false;
            this.mesh.visible = false;
        }
    }

    _buildSlashGeometry(range) {
        const inner = range * CONFIG.sword.hitInnerRatio;
        const outer = range * CONFIG.sword.hitOuterRatio;
        const width = Math.min(
            CONFIG.sword.effect.slashMaxWidth,
            Math.max(CONFIG.sword.effect.slashMinWidth, this._currentArc * CONFIG.sword.effect.slashWidthRatio),
        );
        const geo = new THREE.RingGeometry(
            inner, outer, 18, 1,
            -Math.PI / 2 - width / 2, width,
        );
        geo.rotateX(-Math.PI / 2);
        return geo;
    }

    _setArcGeometry(range) {
        for (const mesh of this._slashMeshes) {
            mesh.geometry.dispose();
            mesh.geometry = this._buildSlashGeometry(range);
        }
    }

    _buildArcEffect(range) {
        const group = new THREE.Group();
        this._slashMeshes = [];
        this._slashMesh = this._createSlashMesh(range, 0);
        this._slashMeshes.push(this._slashMesh);
        group.add(this._slashMesh);
        this._syncTrailMeshes(group);
        return group;
    }

    _syncTrailMeshes(group = this.mesh) {
        const targetCount = 1 + Math.max(0, Math.floor(CONFIG.sword.effect.trailCount));
        while (this._slashMeshes.length < targetCount) {
            const mesh = this._createSlashMesh(this._currentRange, this._slashMeshes.length);
            this._slashMeshes.push(mesh);
            group.add(mesh);
        }
        while (this._slashMeshes.length > targetCount) {
            const mesh = this._slashMeshes.pop();
            group.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
    }

    _createSlashMesh(range, index) {
        const mat = new THREE.MeshBasicMaterial({
            color: index === 0 ? 0xffffff : CONFIG.sword.color,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const mesh = new THREE.Mesh(this._buildSlashGeometry(range), mat);
        mesh.position.y = 0.024 + index * CONFIG.sword.effect.trailLiftStep;
        return mesh;
    }

    _applySlashState(t, fade = 1) {
        const sweep = this._currentArc * CONFIG.sword.effect.slashSweepRatio;
        const baseOpacity = CONFIG.sword.opacity * CONFIG.sword.effect.slashOpacityScale;
        const decay = CONFIG.sword.effect.trailOpacityDecay;
        const spacing = CONFIG.sword.effect.trailSpacing;

        for (let i = 0; i < this._slashMeshes.length; i++) {
            const mesh = this._slashMeshes[i];
            const trailT = Math.max(0, t - spacing * i);
            const localFade = Math.max(0, 1 - trailT * 1.35) * fade;
            mesh.rotation.y = THREE.MathUtils.lerp(sweep, -sweep, Math.min(1, trailT * 1.12));
            mesh.material.opacity = baseOpacity * Math.pow(decay, i) * localFade;
            mesh.position.y = 0.024 + i * CONFIG.sword.effect.trailLiftStep;
        }
    }
}
