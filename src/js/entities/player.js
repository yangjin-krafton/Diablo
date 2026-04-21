// Player entity. Owns movement, facing, HP, and triggers its own sword swing.
// Direct control: movement only. Attack is auto-fired on cooldown when an enemy
// is within sword range.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadGLB } from '../assets.js';
import { SwordSwing } from '../combat/sword-swing.js';

export class Player {
    constructor() {
        this.position = new THREE.Vector3(0, 0, 0);
        // facing.x = world +x direction, facing.y = world +z direction
        this.facing = new THREE.Vector2(0, 1);
        this.hp = CONFIG.player.maxHp;
        this.maxHp = CONFIG.player.maxHp;
        this.alive = true;
        this.mesh = null;
        this.swing = new SwordSwing();
        this._attackTimer = 0;
    }

    async init(scene) {
        this.mesh = await loadGLB(CONFIG.player.modelPath);
        this.mesh.scale.setScalar(CONFIG.player.modelScale);
        scene.add(this.mesh);
        this.swing.attach(scene);
    }

    update(dt, input, enemies) {
        if (!this.alive) return;

        // --- movement ---
        const m = input.moveVector();
        this.position.x += m.x * CONFIG.player.moveSpeed * dt;
        this.position.z += m.z * CONFIG.player.moveSpeed * dt;

        // --- facing (movement direction, or nearest enemy if idle) ---
        if (m.x !== 0 || m.z !== 0) {
            this.facing.set(m.x, m.z).normalize();
        } else {
            const near = this._nearest(enemies);
            if (near) {
                this.facing
                    .set(near.position.x - this.position.x, near.position.z - this.position.z)
                    .normalize();
            }
        }

        if (this.mesh) {
            this.mesh.position.copy(this.position);
            this.mesh.rotation.y =
                Math.atan2(this.facing.x, this.facing.y) + CONFIG.player.modelYawOffset;
        }

        // --- auto-attack ---
        this._attackTimer -= dt;
        const target = this._nearest(enemies, CONFIG.sword.range + CONFIG.enemy.radius);
        if (this._attackTimer <= 0 && target) {
            this.swing.trigger(this.position, this.facing, enemies);
            this._attackTimer = CONFIG.sword.swingCooldown;
        }
        this.swing.update(dt);
    }

    takeDamage(amount) {
        if (!this.alive) return;
        this.hp = Math.max(0, this.hp - amount);
        if (this.hp <= 0) {
            this.alive = false;
            if (this.mesh) this.mesh.visible = false;
        }
    }

    _nearest(enemies, maxDist = Infinity) {
        let best = null;
        let bestDist = maxDist;
        for (const e of enemies) {
            if (!e.alive) continue;
            const d = Math.hypot(
                e.position.x - this.position.x,
                e.position.z - this.position.z,
            );
            if (d < bestDist) {
                bestDist = d;
                best = e;
            }
        }
        return best;
    }
}
