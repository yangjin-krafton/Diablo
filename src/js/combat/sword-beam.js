// Short-range sword-energy projectile. Unlocked by the Path C "검기 발사"
// node. Travels forward along the tangent plane at a fixed speed, pierces
// through `pierce` enemies (damaging each once), and expires when it runs
// out of pierce or range.
//
// Each beam owns its own mesh (thin emissive box) and despawns itself when
// alive becomes false — SwordSkill drives the update loop and removes it.

import * as THREE from 'three';

const SPEED       = 26;     // world-units / sec along the surface
const HIT_RADIUS  = 0.7;    // arc distance for enemy collision
const LIFT        = 0.38;   // raise off surface so it visually floats
const LENGTH      = 1.6;
const WIDTH       = 0.22;
const HEIGHT      = 0.12;

export class SwordBeam {
    constructor({ surface, position, forward, damage, critChance, range, pierce }) {
        this.surface = surface;
        this.position = new THREE.Vector3().copy(position);
        this.surface.snapToSurface(this.position);
        this.forward = new THREE.Vector3().copy(forward);
        this.surface.projectToTangent(this.position, this.forward, this.forward);

        this.damage = damage;
        this.critChance = critChance;
        this.pierce = pierce;       // remaining enemies to pass through
        this._remaining = range;    // remaining travel distance
        this._hitSet = new Set();
        this.alive = true;

        const geo = new THREE.BoxGeometry(WIDTH, HEIGHT, LENGTH);
        const mat = new THREE.MeshStandardMaterial({
            color: 0xffe7b0,
            emissive: 0xff7a1f,
            emissiveIntensity: 1.6,
            transparent: true,
            opacity: 0.92,
            metalness: 0.2,
            roughness: 0.3,
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this._refreshMesh();
    }

    attach(parent) { parent.add(this.mesh); }
    detach() {
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }

    update(dt, enemies) {
        if (!this.alive) return;
        const step = Math.min(SPEED * dt, this._remaining);
        this.surface.moveAlong(this.position, this.forward, step);
        this._remaining -= step;
        // re-tangent forward after moving along the great circle
        this.surface.projectToTangent(this.position, this.forward, this.forward);

        for (const e of enemies) {
            if (!e.alive) continue;
            if (this._hitSet.has(e)) continue;
            const d = this.surface.arcDistance(e.position, this.position);
            if (d < HIT_RADIUS) {
                this._hitSet.add(e);
                const isCrit = Math.random() < this.critChance;
                e.damage(isCrit ? this.damage * 2 : this.damage);
                this.pierce--;
                if (this.pierce <= 0) { this.alive = false; break; }
            }
        }
        if (this._remaining <= 0.0001) this.alive = false;

        // fade toward end of life
        if (this._remaining < 1.2) {
            this.mesh.material.opacity = Math.max(0, this._remaining / 1.2) * 0.92;
        }
        this._refreshMesh();
    }

    _refreshMesh() {
        this.surface.orient(this.mesh, this.position, this.forward);
        const up = _tmpUp.copy(this.position).normalize();
        this.mesh.position.copy(this.position).addScaledVector(up, LIFT);
    }
}

const _tmpUp = new THREE.Vector3();
