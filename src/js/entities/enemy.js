// Enemy entity on spherical surface. Chases the player along great-circle paths,
// deals contact damage while touching.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadGLB } from '../assets.js';

export class Enemy {
    constructor(surface, position) {
        this.surface = surface;
        this.position = new THREE.Vector3().copy(position);
        this.surface.snapToSurface(this.position);
        this.forward = new THREE.Vector3(0, 0, 1);
        // derive a valid initial tangent forward at our position
        this.surface.projectToTangent(this.position, this.forward, this.forward);

        this.hp = CONFIG.enemy.maxHp;
        this.alive = true;
        this.mesh = null;

        this._tangent = new THREE.Vector3();
    }

    async init(parent) {
        this.mesh = await loadGLB(CONFIG.enemy.modelPath);
        this.mesh.scale.setScalar(CONFIG.enemy.modelScale);
        parent.add(this.mesh);
        this._orientMesh();
    }

    update(dt, player) {
        if (!this.alive) return;

        const arcDist = this.surface.arcDistance(this.position, player.position);

        if (arcDist > CONFIG.enemy.contactRange) {
            // chase — tangent toward player
            this.surface.tangentTo(this.position, player.position, this._tangent);
            if (this._tangent.lengthSq() > 1e-8) {
                this.surface.moveAlong(this.position, this._tangent, CONFIG.enemy.moveSpeed * dt);
                this.forward.copy(this._tangent);
            }
        } else {
            // touching player
            player.takeDamage(CONFIG.enemy.contactDamage * dt);
            // still face player
            this.surface.tangentTo(this.position, player.position, this.forward);
        }

        if (this.mesh) this._orientMesh();
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
        this.surface.orient(this.mesh, this.position, this.forward, CONFIG.enemy.modelYawOffset);
    }
}
