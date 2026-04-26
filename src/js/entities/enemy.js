// Enemy entity on spherical surface. Chases the player along great-circle paths,
// deals contact damage while touching.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadGLB } from '../assets.js';
import { applyMaterialPreset } from '../material-controls.js';
import { TransformMotion } from '../animation/transform-motion.js';

export class Enemy {
    constructor(surface, position, options = {}) {
        this.surface = surface;
        this.position = new THREE.Vector3().copy(position);
        this.surface.snapToSurface(this.position);
        this.forward = new THREE.Vector3(0, 0, 1);
        // derive a valid initial tangent forward at our position
        this.surface.projectToTangent(this.position, this.forward, this.forward);

        this.hp = CONFIG.enemy.maxHp * (options.hpScale ?? 1);
        this.moveSpeed = CONFIG.enemy.moveSpeed * (options.moveSpeedScale ?? 1);
        this.contactDamage = CONFIG.enemy.contactDamage * (options.damageScale ?? 1);
        this.modelScale = CONFIG.enemy.modelScale * (options.modelScale ?? 1);
        this.modelLift = CONFIG.enemy.modelLift * (options.modelScale ?? 1);
        this.radius = (CONFIG.enemy.radius ?? 0.5) * (options.radiusScale ?? options.modelScale ?? 1);
        this.contactRange = CONFIG.enemy.contactRange + this.radius + (CONFIG.player.radius ?? 0.4);
        this.modelPath = options.modelPath ?? randomFrom(CONFIG.enemy.modelPaths) ?? CONFIG.enemy.modelPath;
        this.difficultyTier = options.difficultyTier ?? 'standard';
        this.spawnSource = options.spawnSource ?? null;
        this.modelTier = options.modelTier ?? null;
        this.alive = true;
        this._deathStarted = false;
        this.mesh = null;
        this.motion = new TransformMotion();

        this._tangent = new THREE.Vector3();
        this._hitDir = new THREE.Vector3();
        this.hitSparks = null;
    }

    async init(parent) {
        this.mesh = await loadGLB(this.modelPath);
        applyMaterialPreset(this.mesh, CONFIG.materials.enemy);
        this.mesh.scale.setScalar(this.modelScale);
        parent.add(this.mesh);
        this._orientMesh();
    }

    update(dt, player) {
        if (!this.alive) return;
        this.motion.update(dt);

        const arcDist = this.surface.arcDistance(this.position, player.position);

        if (arcDist > this.contactRange) {
            // chase — tangent toward player
            this.surface.tangentTo(this.position, player.position, this._tangent);
            if (this._tangent.lengthSq() > 1e-8) {
                this.surface.moveAlong(this.position, this._tangent, this.moveSpeed * dt);
                this.forward.copy(this._tangent);
            }
        } else {
            // touching player
            _hitDir.subVectors(player.position, this.position);
            this.surface.projectToTangent(player.position, _hitDir, _hitDir);
            player.takeDamage(this.contactDamage * dt, _hitDir);
            // still face player
            this.surface.tangentTo(this.position, player.position, this.forward);
        }

        if (this.mesh) this._orientMesh();
    }

    damage(amount, sourcePosition = null) {
        if (!this.alive) return;
        this._setHitDirection(sourcePosition);
        this.motion.shake(this._hitDir, Math.min(1.8, 0.65 + amount / CONFIG.enemy.maxHp));
        this.hitSparks?.emit(this.position, this._hitDir);
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
        if (!this.motion.isDropDone) return false;
        if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
        return true;
    }

    _orientMesh() {
        this.surface.orient(this.mesh, this.position, this.forward, CONFIG.enemy.modelYawOffset);
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

function randomFrom(list) {
    if (!Array.isArray(list) || list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
}

const _up = new THREE.Vector3();
const _hitDir = new THREE.Vector3();
