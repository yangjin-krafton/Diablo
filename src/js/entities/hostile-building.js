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
        if (this.regenPerSecond > 0 && this.hp < this.maxHp) {
            this.hp = Math.min(this.maxHp, this.hp + this.regenPerSecond * dt);
        }
    }

    damage(amount) {
        if (!this.alive) return;
        this.hp -= amount;
        if (this.hp <= 0) this.kill();
    }

    kill() {
        this.alive = false;
        if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
    }

    _orientMesh() {
        if (!this.mesh) return;
        this.surface.orient(this.mesh, this.position, this.forward, this.modelYawOffset);
        if (this.modelLift) {
            _up.copy(this.position).normalize();
            this.mesh.position.addScaledVector(_up, this.modelLift);
        }
    }
}

const _up = new THREE.Vector3();
