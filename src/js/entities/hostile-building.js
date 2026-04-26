// Base class for hostile buildings (요새, 차원문) — see §7 of
// docs/npc-building-distribution-balancing.md.
//
// Hostile buildings are pushed onto `spawner.enemies` so the existing sword /
// beam damage code hits them automatically. They override Enemy's chase
// behavior with `update()` that handles:
//   - HP regen
//   - Periodic enemy production (subclass-specific)
//   - State transitions (e.g. portal close → reopen)
//
// On destruction (`alive` flips false), Spawner.update() prunes them and
// fires `onDeath(pos, entity)` which lets the host system grant bonus
// drops via the entity's `dropBonus` field.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadGLB } from '../assets.js';
import { applyMaterialPreset } from '../material-controls.js';
import { TransformMotion } from '../animation/transform-motion.js';

export class HostileBuilding {
    constructor(surface, position, def) {
        this.surface = surface;
        this.position = new THREE.Vector3().copy(position);
        this.surface.snapToSurface(this.position);
        this.forward = new THREE.Vector3(0, 0, 1);
        this.surface.projectToTangent(this.position, this.forward, this.forward);

        this.def = def;
        this.alive = true;
        this.maxHp = def.hp ?? 200;
        this.hp = this.maxHp;
        this.regenPerSecond = def.regenPerSecond ?? 0;
        this.radius = def.bodyRadius ?? 1.0;
        // 0 — buildings don't punch the player on contact; subclasses can
        // override (e.g. fortress aura).
        this.contactDamage = 0;
        this.modelScale = def.modelScale ?? 1;
        this.modelLift = def.modelLift ?? 0;
        this.modelYawOffset = def.modelYawOffset ?? 0;

        this.isHostileBuilding = true;
        // Flat number of bonus ore rolls awarded by the host system on death
        // (in addition to the standard rollDrop). Tuned per subclass / def.
        this.dropBonus = def.rewardDrops ?? 0;
        this.mesh = null;
        this.motion = new TransformMotion({
            bounceHeight: 0.18,
            shakeDistance: 0.08,
            dropAngle: Math.PI * 0.22,
            dropTravel: 0.12,
            dropHop: 0.04,
            dropSink: 0.08,
            dropScale: 0.03,
        });
        this._deathStarted = false;
        this._hitDir = new THREE.Vector3();
        this.hitSparks = null;
        this.hpBar = null;
    }

    async init(parent) {
        this.mesh = await loadGLB(this.def.modelPath);
        applyMaterialPreset(this.mesh, CONFIG.materials.enemy);
        this.mesh.scale.setScalar(this.modelScale);
        parent.add(this.mesh);
        this._orientMesh();
    }

    update(dt /* , player */) {
        if (!this.alive) return;
        this.motion.update(dt);
        if (this.regenPerSecond > 0 && this.hp < this.maxHp) {
            this.hp = Math.min(this.maxHp, this.hp + this.regenPerSecond * dt);
        }
        if (this.mesh) this._orientMesh();
        this.hpBar?.update();
    }

    damage(amount, sourcePosition = null) {
        if (!this.alive) return;
        this._setHitDirection(sourcePosition);
        this.motion.shake(this._hitDir, Math.min(1.5, 0.5 + amount / this.maxHp));
        this.hitSparks?.emit(this.position, this._hitDir, {
            count: 70,
            lift: Math.max(0.9, this.modelLift * 0.6),
            speedMin: 5.8,
            speedMax: 11.0,
            sizeMin: 0.055,
            sizeMax: 0.13,
        });
        this.hp -= amount;
        if (this.hp <= 0) this.kill();
    }

    kill() {
        if (this._deathStarted) return;
        this.alive = false;
        this._deathStarted = true;
        this.motion.drop(this._hitDir);
    }

    updateDeath(dt) {
        if (!this._deathStarted) return true;
        this.motion.update(dt);
        if (this.mesh) this._orientMesh();
        this.hpBar?.update();
        if (!this.motion.isDropDone) return false;
        if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
        this.hpBar?.detach();
        return true;
    }

    _orientMesh() {
        if (!this.mesh) return;
        this.surface.orient(this.mesh, this.position, this.forward, this.modelYawOffset);
        _up.copy(this.position).normalize();
        if (this.modelLift) {
            this.mesh.position.addScaledVector(_up, this.modelLift);
        }
        this.mesh.scale.setScalar(this.modelScale);
        this.motion.apply(this.mesh, { up: _up, baseScale: this.modelScale });
    }

    _setHitDirection(sourcePosition) {
        if (sourcePosition) {
            this._hitDir.subVectors(this.position, sourcePosition);
        } else {
            this._hitDir.copy(this.forward).multiplyScalar(-1);
        }
        this.surface.projectToTangent(this.position, this._hitDir, this._hitDir);
        if (this._hitDir.lengthSq() < 1e-8) this._hitDir.copy(this.forward).multiplyScalar(-1);
        this._hitDir.normalize();
    }
}

const _up = new THREE.Vector3();
