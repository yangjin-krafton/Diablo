// Player entity on a spherical world viewed through a static camera.
//
// The trick: everything on the planet lives inside a `worldRotator` group whose
// quaternion is adjusted each frame so the player's planet-local position maps
// to world (0, R, 0). The player therefore appears fixed at the top of the
// visible hemisphere; WASD input is interpreted in world/screen axes and mapped
// to the tangent plane at the player's planet-local position via the inverse
// of the worldRotator's quaternion.
//
// Input mapping (world-space, because the camera is static):
//   W (input.z = -1) → move in world -Z (into the screen)
//   S (input.z = +1) → move in world +Z
//   A (input.x = -1) → move in world -X (left)
//   D (input.x = +1) → move in world +X (right)

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadGLB } from '../assets.js';
import { SwordSwing } from '../combat/sword-swing.js';

export class Player {
    constructor(surface) {
        this.surface = surface;
        // planet-local position on sphere surface
        this.position = new THREE.Vector3(0, surface.radius, 0);
        // planet-local tangent forward; -Z so player's nose faces INTO the screen
        this.forward = new THREE.Vector3(0, 0, -1);

        this.hp = CONFIG.player.maxHp;
        this.maxHp = CONFIG.player.maxHp;
        this.alive = true;

        this.mesh = null;
        this.swing = new SwordSwing(surface);
        this._attackTimer = 0;
    }

    async init(parent) {
        this.mesh = await loadGLB(CONFIG.player.modelPath);
        this.mesh.scale.setScalar(CONFIG.player.modelScale);
        parent.add(this.mesh);
        this.swing.attach(parent);
        this._orientMesh();
    }

    update(dt, input, worldRotator, enemies) {
        if (!this.alive) return;

        const m = input.moveVector();
        _worldDir.set(m.x, 0, m.z);

        if (_worldDir.lengthSq() > 1e-8) {
            _worldDir.normalize();
            // worldRotator.quaternion maps planet-local player.position → (0, R, 0).
            // Its inverse therefore maps world-space tangent directions (at the
            // player's visual position) back to planet-local tangent directions
            // at the player's actual position on the sphere.
            _invQ.copy(worldRotator.quaternion).invert();
            _localDir.copy(_worldDir).applyQuaternion(_invQ);
            this.surface.projectToTangent(this.position, _localDir, _localDir);
            if (_localDir.lengthSq() > 1e-8) {
                this.surface.moveAlong(this.position, _localDir, CONFIG.player.moveSpeed * dt);
                this.forward.copy(_localDir);
            }
        } else {
            // idle: face nearest enemy (in planet-local)
            const near = this._nearest(enemies);
            if (near) this.surface.tangentTo(this.position, near.position, this.forward);
        }

        // keep forward numerically tangent
        this.surface.projectToTangent(this.position, this.forward, this.forward);

        if (this.mesh) this._orientMesh();

        // --- auto-attack ---
        this._attackTimer -= dt;
        const target = this._nearest(enemies, CONFIG.sword.range + CONFIG.enemy.radius);
        if (this._attackTimer <= 0 && target) {
            this.swing.trigger(this.position, this.forward, enemies);
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

    _orientMesh() {
        this.surface.orient(this.mesh, this.position, this.forward, CONFIG.player.modelYawOffset);
    }

    _nearest(enemies, maxDist = Infinity) {
        let best = null;
        let bestDist = maxDist;
        for (const e of enemies) {
            if (!e.alive) continue;
            const d = this.surface.arcDistance(e.position, this.position);
            if (d < bestDist) {
                bestDist = d;
                best = e;
            }
        }
        return best;
    }
}

const _worldDir = new THREE.Vector3();
const _localDir = new THREE.Vector3();
const _invQ = new THREE.Quaternion();
