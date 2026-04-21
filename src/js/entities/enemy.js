// Enemy entity. Chases the player; deals contact damage while touching.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadGLB } from '../assets.js';

export class Enemy {
    constructor(position) {
        this.position = new THREE.Vector3().copy(position);
        this.hp = CONFIG.enemy.maxHp;
        this.alive = true;
        this.mesh = null;
    }

    async init(scene) {
        this.mesh = await loadGLB(CONFIG.enemy.modelPath);
        this.mesh.scale.setScalar(CONFIG.enemy.modelScale);
        this.mesh.position.copy(this.position);
        scene.add(this.mesh);
    }

    update(dt, player) {
        if (!this.alive) return;

        const dx = player.position.x - this.position.x;
        const dz = player.position.z - this.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist > CONFIG.enemy.contactRange) {
            const nx = dx / dist;
            const nz = dz / dist;
            this.position.x += nx * CONFIG.enemy.moveSpeed * dt;
            this.position.z += nz * CONFIG.enemy.moveSpeed * dt;
            if (this.mesh) this.mesh.rotation.y = Math.atan2(nx, nz) + CONFIG.enemy.modelYawOffset;
        } else {
            // touching player — deal contact damage
            player.takeDamage(CONFIG.enemy.contactDamage * dt);
        }

        if (this.mesh) this.mesh.position.copy(this.position);
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
}
