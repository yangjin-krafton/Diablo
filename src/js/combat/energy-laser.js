// Hit-scan energy laser. The full path (start → optional bounce points → end)
// is computed at fire time using the great-circle arc on the planet surface;
// damage is applied immediately and the geometry is rendered as a brief
// emissive flash that fades over FLASH_TIME.
//
// Three behaviour modes, picked at construction:
//   - basic   (default): hit the first enemy along the arc, stop there.
//   - pierce  (pierceCount > 0): straight beam, hits up to pierceCount+1
//     enemies in order; each subsequent hit takes damage * (1 - falloff).
//   - bounce  (bounceCount > 0, no pierce): hit first enemy, then redirect
//     toward the nearest unvisited enemy in a forward cone, repeat. Damage
//     scales by (1 - bounceFalloff) per bounce.
//
// pierceCount and bounceCount can both come from the skill, but only one
// active mode is honoured per cast — pierce wins if both are unlocked.

import * as THREE from 'three';

const LIFT = 0.32;
const FLASH_TIME = 0.22;
const SUB_SEG_LEN = 0.85;     // resample a great-circle segment every ~0.85 units for visual

export class EnergyLaser {
    constructor({
        surface,
        origin,
        direction,
        range,
        thickness = 0.45,
        damage,
        critChance = 0,
        pierceCount = 0,
        pierceFalloff = 0.25,
        bounceCount = 0,
        bounceRange = 6.5,
        bounceFalloff = 0.0,
        onHit = null,
        color = 0xc8d4ff,
        coreColor = 0xffffff,
        enemies = [],
    }) {
        this.surface = surface;
        this.thickness = thickness;
        this.alive = true;
        this._t = 0;

        this._segments = this._compute({
            origin, direction, range, thickness,
            damage, critChance,
            pierceCount, pierceFalloff,
            bounceCount, bounceRange, bounceFalloff,
            onHit, enemies,
        });

        this.group = new THREE.Group();
        this._meshes = [];
        this._buildVisual(color, coreColor);
    }

    attach(parent) { parent.add(this.group); }

    detach() {
        if (this.group.parent) this.group.parent.remove(this.group);
        this.group.traverse((child) => {
            if (!child.isMesh) return;
            child.geometry?.dispose?.();
            child.material?.dispose?.();
        });
    }

    update(dt) {
        if (!this.alive) return;
        this._t += dt;
        const fade = Math.max(0, 1 - this._t / FLASH_TIME);
        for (const m of this._meshes) {
            m.material.opacity = m.userData.baseOpacity * fade;
        }
        if (this._t >= FLASH_TIME) this.alive = false;
    }

    _compute({
        origin, direction, range, thickness, damage, critChance,
        pierceCount, pierceFalloff, bounceCount, bounceRange, bounceFalloff,
        onHit, enemies,
    }) {
        const surface = this.surface;
        const segments = [];
        const visited = new Set();
        const usePierce = pierceCount > 0;
        const useBounce = bounceCount > 0 && !usePierce;

        const curOrig = origin.clone();
        surface.snapToSurface(curOrig);
        const curDir = direction.clone();
        surface.projectToTangent(curOrig, curDir, curDir);
        if (curDir.lengthSq() < 1e-8) return segments;

        if (usePierce) {
            const along = collectAlongArc(surface, curOrig, curDir, range, thickness, enemies, null);
            const maxHits = pierceCount + 1;
            const hitN = Math.min(along.length, maxHits);
            for (let i = 0; i < hitN; i++) {
                const damageScale = Math.max(0.05, 1 - pierceFalloff * i);
                const isCrit = Math.random() < critChance;
                const dmg = damage * damageScale * (isCrit ? 2 : 1);
                along[i].enemy.damage(dmg, curOrig);
                visited.add(along[i].enemy);
                onHit?.(along[i].enemy);
            }
            const endpoint = endPointAlongArc(surface, curOrig, curDir, range);
            segments.push({ start: curOrig.clone(), end: endpoint });
            return segments;
        }

        if (useBounce) {
            let bouncesLeft = bounceCount;
            let curRange = range;
            let curDamage = damage;
            let segOrig = curOrig.clone();
            let segDir = curDir.clone();

            while (curRange > 0.01) {
                const along = collectAlongArc(surface, segOrig, segDir, curRange, thickness, enemies, visited);
                if (along.length === 0) {
                    const endpoint = endPointAlongArc(surface, segOrig, segDir, curRange);
                    segments.push({ start: segOrig.clone(), end: endpoint });
                    break;
                }
                const hit = along[0];
                const isCrit = Math.random() < critChance;
                const dmg = curDamage * (isCrit ? 2 : 1);
                hit.enemy.damage(dmg, segOrig);
                visited.add(hit.enemy);
                onHit?.(hit.enemy);

                const hitPos = hit.enemy.position.clone();
                surface.snapToSurface(hitPos);
                segments.push({ start: segOrig.clone(), end: hitPos });

                if (bouncesLeft <= 0) break;
                bouncesLeft--;
                curRange -= hit.t;
                if (curRange <= 0.01) break;

                const next = pickBounceTarget(surface, hitPos, segDir, bounceRange, enemies, visited);
                if (!next) break;

                surface.tangentTo(hitPos, next.position, _newDir);
                if (_newDir.lengthSq() < 1e-8) break;
                segDir = _newDir.clone();
                segOrig = hitPos;
                curDamage *= (1 - bounceFalloff);
            }
            return segments;
        }

        const along = collectAlongArc(surface, curOrig, curDir, range, thickness, enemies, null);
        if (along.length > 0) {
            const hit = along[0];
            const isCrit = Math.random() < critChance;
            const dmg = damage * (isCrit ? 2 : 1);
            hit.enemy.damage(dmg, curOrig);
            onHit?.(hit.enemy);
            const hitPos = hit.enemy.position.clone();
            surface.snapToSurface(hitPos);
            segments.push({ start: curOrig.clone(), end: hitPos });
        } else {
            const endpoint = endPointAlongArc(surface, curOrig, curDir, range);
            segments.push({ start: curOrig.clone(), end: endpoint });
        }
        return segments;
    }

    _buildVisual(color, coreColor) {
        for (const seg of this._segments) {
            const arc = this.surface.arcDistance(seg.start, seg.end);
            if (arc < 0.05) continue;
            const subN = Math.max(2, Math.ceil(arc / SUB_SEG_LEN));
            const points = samplePointsAlongArc(this.surface, seg.start, seg.end, subN);
            for (let i = 0; i < points.length - 1; i++) {
                this._addBeamSegment(points[i], points[i + 1], color, coreColor);
            }
        }
    }

    _addBeamSegment(a, b, color, coreColor) {
        const len = a.distanceTo(b);
        if (len < 1e-3) return;

        const upA = _ua.copy(a).normalize();
        const upB = _ub.copy(b).normalize();
        const midUp = _um.copy(upA).add(upB).normalize();
        const midPos = _mp.copy(a).add(b).multiplyScalar(0.5).addScaledVector(midUp, LIFT);

        const segZ = _vd.subVectors(b, a).normalize();
        const segX = _vx.crossVectors(midUp, segZ);
        if (segX.lengthSq() < 1e-8) return;
        segX.normalize();
        const segY = _vy.crossVectors(segZ, segX).normalize();
        _basis.makeBasis(segX, segY, segZ);

        const outer = new THREE.Mesh(
            new THREE.BoxGeometry(0.40, 0.16, len),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.55,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }),
        );
        outer.position.copy(midPos);
        outer.quaternion.setFromRotationMatrix(_basis);
        outer.userData.baseOpacity = 0.55;
        this.group.add(outer);
        this._meshes.push(outer);

        const core = new THREE.Mesh(
            new THREE.BoxGeometry(0.16, 0.07, len),
            new THREE.MeshBasicMaterial({
                color: coreColor,
                transparent: true,
                opacity: 0.95,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }),
        );
        core.position.copy(midPos);
        core.quaternion.setFromRotationMatrix(_basis);
        core.userData.baseOpacity = 0.95;
        this.group.add(core);
        this._meshes.push(core);
    }
}

function collectAlongArc(surface, origin, direction, range, thickness, enemies, visited) {
    const R = surface.radius;
    _axis.crossVectors(origin, direction);
    if (_axis.lengthSq() < 1e-10) return [];
    _axis.normalize();
    const along = [];
    for (const e of enemies) {
        if (!e.alive) continue;
        if (visited?.has(e)) continue;
        const dotAx = e.position.dot(_axis);
        _proj.copy(e.position).addScaledVector(_axis, -dotAx);
        if (_proj.lengthSq() < 1e-8) continue;
        const a_ = _proj.dot(origin) / R;     // ∝ cos(θ)
        const b_ = _proj.dot(direction);      // ∝ sin(θ)
        const theta = Math.atan2(b_, a_);
        const t = theta * R;
        if (t < -thickness) continue;
        if (t > range + thickness) continue;
        const tClamped = Math.max(0, Math.min(range, t));
        _closest.copy(origin);
        if (tClamped > 1e-6) surface.moveAlong(_closest, direction, tClamped);
        const arcDist = surface.arcDistance(_closest, e.position);
        const bodyR = e.radius ?? 0;
        if (arcDist > thickness + bodyR) continue;
        along.push({ enemy: e, t: tClamped });
    }
    along.sort((a, b) => a.t - b.t);
    return along;
}

function endPointAlongArc(surface, origin, direction, range) {
    const p = origin.clone();
    surface.moveAlong(p, direction, range);
    return p;
}

function pickBounceTarget(surface, origin, forwardDir, bounceRange, enemies, visited) {
    let best = null;
    let bestD = bounceRange;
    for (const e of enemies) {
        if (!e.alive || visited.has(e)) continue;
        const d = surface.arcDistance(e.position, origin);
        if (d > bounceRange) continue;
        surface.tangentTo(origin, e.position, _td);
        if (_td.lengthSq() < 1e-8) continue;
        // forward semi-circle (~95° cone): exclude enemies more than 95° behind
        if (forwardDir.dot(_td) < -0.1) continue;
        if (d < bestD) {
            bestD = d;
            best = e;
        }
    }
    return best;
}

function samplePointsAlongArc(surface, start, end, n) {
    const points = [start.clone()];
    const total = surface.arcDistance(start, end);
    if (total < 1e-6) {
        points.push(end.clone());
        return points;
    }
    let cur = start.clone();
    const step = total / n;
    for (let i = 1; i < n; i++) {
        const dir = surface.tangentTo(cur, end, _td);
        if (dir.lengthSq() < 1e-8) break;
        cur = cur.clone();
        surface.moveAlong(cur, dir, step);
        points.push(cur);
    }
    points.push(end.clone());
    return points;
}

const _axis = new THREE.Vector3();
const _proj = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _td = new THREE.Vector3();
const _newDir = new THREE.Vector3();
const _ua = new THREE.Vector3();
const _ub = new THREE.Vector3();
const _um = new THREE.Vector3();
const _mp = new THREE.Vector3();
const _vd = new THREE.Vector3();
const _vx = new THREE.Vector3();
const _vy = new THREE.Vector3();
const _basis = new THREE.Matrix4();
