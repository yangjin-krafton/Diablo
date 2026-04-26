// Player-anchored expanding electric ring. Single ring instance: it grows
// from a small starter radius out to its target radius along the planet's
// tangent plane, optionally holds at max radius (zone-control flavor for
// the "정적 패턴" upgrade), then fades. Each enemy can be hit once (or
// twice with the "두 번 적중" upgrade); on hit, an optional onHit callback
// fires so SkillBranch logic can spawn chain rings, etc.
//
// Visual is two stacked thin rings with additive blending. The ring is a
// flat RingGeometry oriented onto the tangent plane at `center` and scaled
// by the current radius — the slight curvature mismatch on a sphere is
// invisible at typical radii (≤ ~6 units on a 30+ radius planet).

import * as THREE from 'three';

const SEGMENTS = 56;
const LIFT = 0.07;
const RING_INNER_R = 0.86;
const RING_OUTER_R = 1.0;
const FRONT_INNER_R = 0.94;
const FRONT_OUTER_R = 1.04;

export class LightningRing {
    constructor({
        surface,
        center,
        followTarget = null,
        radiusStart = 0.3,
        radiusEnd = 4.5,
        expandTime = 0.5,
        holdTime = 0,
        fadeTime = 0.18,
        thickness = 0.55,
        damage = 18,
        critChance = 0,
        color = 0x9ad7ff,
        edgeColor = 0xffffff,
        bodyOpacity = 0.55,
        edgeOpacity = 0.95,
        onHit = null,
        canHitTwice = false,
        rehitInterval = 0.18,
    }) {
        this.surface = surface;
        this.center = new THREE.Vector3().copy(center);
        this.surface.snapToSurface(this.center);
        this.followTarget = followTarget;
        this.radiusStart = radiusStart;
        this.radiusEnd = radiusEnd;
        this.expandTime = Math.max(0.05, expandTime);
        this.holdTime = Math.max(0, holdTime);
        this.fadeTime = Math.max(0.05, fadeTime);
        this.thickness = thickness;
        this.damage = damage;
        this.critChance = critChance;
        this.onHit = onHit;
        this.canHitTwice = canHitTwice;
        this.rehitInterval = rehitInterval;

        this._t = 0;
        this._holdT = 0;
        this._fadeT = 0;
        this._stage = 'expand';
        this._radius = radiusStart;
        this.alive = true;
        this._hitCount = new Map();

        this.group = new THREE.Group();
        this._body = this._buildRing(RING_INNER_R, RING_OUTER_R, color, bodyOpacity);
        this._edge = this._buildRing(FRONT_INNER_R, FRONT_OUTER_R, edgeColor, edgeOpacity);
        this.group.add(this._body);
        this.group.add(this._edge);

        this._bodyOpacity = bodyOpacity;
        this._edgeOpacity = edgeOpacity;
        this._applyTransform();
    }

    attach(parent) { parent.add(this.group); }

    detach() {
        if (this.group.parent) this.group.parent.remove(this.group);
        for (const m of [this._body, this._edge]) {
            m.geometry.dispose();
            m.material.dispose();
        }
    }

    update(dt, enemies) {
        if (!this.alive) return;
        this._t += dt;

        if (this.followTarget) {
            this.center.copy(this.followTarget.position);
            this.surface.snapToSurface(this.center);
        }

        if (this._stage === 'expand') {
            const u = Math.min(1, this._t / this.expandTime);
            this._radius = THREE.MathUtils.lerp(this.radiusStart, this.radiusEnd, easeOutQuad(u));
            if (u >= 1) {
                this._stage = this.holdTime > 0 ? 'hold' : 'fade';
                this._holdT = 0;
                this._fadeT = 0;
            }
        } else if (this._stage === 'hold') {
            this._holdT += dt;
            this._radius = this.radiusEnd;
            // gentle pulse on the edge during hold
            const pulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(this._t * 14));
            this._edge.material.opacity = this._edgeOpacity * pulse;
            if (this._holdT >= this.holdTime) {
                this._stage = 'fade';
                this._fadeT = 0;
            }
        } else {
            this._fadeT += dt;
            this._radius = this.radiusEnd;
            const f = Math.min(1, this._fadeT / this.fadeTime);
            this._body.material.opacity = (1 - f) * this._bodyOpacity;
            this._edge.material.opacity = (1 - f) * this._edgeOpacity;
            if (f >= 1) { this.alive = false; return; }
        }

        this._applyTransform();
        this._checkHits(enemies);
    }

    _buildRing(inner, outer, color, opacity) {
        const geo = new THREE.RingGeometry(inner, outer, SEGMENTS, 1);
        geo.rotateX(-Math.PI / 2); // RingGeometry sits in XY → rotate to XZ (tangent plane)
        const mat = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        return new THREE.Mesh(geo, mat);
    }

    _applyTransform() {
        const up = _up.copy(this.center).normalize();
        // Stable bearing tangent so the ring's seam is visually consistent.
        _fwd.set(0, 1, 0).addScaledVector(up, -up.y);
        if (_fwd.lengthSq() < 1e-4) _fwd.set(1, 0, 0).addScaledVector(up, -up.x);
        _fwd.normalize();
        this.surface.orient(this.group, this.center, _fwd);
        this.group.position.addScaledVector(up, LIFT);
        this.group.scale.set(this._radius, 1, this._radius);
    }

    _checkHits(enemies) {
        const half = this.thickness / 2;
        const r = this._radius;
        const minR = r - half;
        const maxR = r + half;
        for (const e of enemies) {
            if (!e.alive) continue;
            const d = this.surface.arcDistance(e.position, this.center);
            const bodyR = e.radius ?? 0;
            if (d + bodyR < minR) continue;
            if (d - bodyR > maxR) continue;

            const entry = this._hitCount.get(e);
            const count = entry?.count ?? 0;
            const maxHits = this.canHitTwice ? 2 : 1;
            if (count >= maxHits) continue;
            if (count > 0 && (this._t - entry.lastT) < this.rehitInterval) continue;

            const isCrit = Math.random() < this.critChance;
            const dmg = isCrit ? this.damage * 2 : this.damage;
            e.damage(dmg, this.center);
            this._hitCount.set(e, { count: count + 1, lastT: this._t });
            this.onHit?.(e, this);
        }
    }
}

function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }

const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();
