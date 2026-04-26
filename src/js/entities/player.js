// Player entity. On a spherical world with a static camera and a rotating
// worldRotator, the player's mesh lives INSIDE worldRotator with a planet-local
// position — updated each frame so that after worldRotator's rotation the mesh
// always lands at world (0, R, 0). Concretely:
//
//   player.position (planet-local) = invQ * (0, R, 0)
//   player.forward  (planet-local) = invQ * worldForward   (when moving)
//
// The worldRotator itself is driven by input (see Game._applyInputRotation).
// Player does not update its own position — it derives it. The logic here is
// limited to facing (derived or idle-toward-nearest-enemy), mesh orientation,
// and hp. Combat lives in the skill subclasses (see src/js/skills/).

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadGLB } from '../assets.js';
import { applyMaterialPreset } from '../material-controls.js';
import { TransformMotion } from '../animation/transform-motion.js';

export class Player {
    constructor(surface) {
        this.surface = surface;
        this.position = new THREE.Vector3(0, surface.radius, 0);
        this.forward = new THREE.Vector3(0, 0, -1);

        this.hp = CONFIG.player.maxHp;
        this.maxHp = CONFIG.player.maxHp;
        this.radius = CONFIG.player.radius ?? 0.4;
        this.alive = true;

        this.mesh = null;
        this.headLight = null;
        this.hitSparks = null;
        this._hitSparkCooldown = 0;
        this.motion = new TransformMotion({
            bounceHeight: 0.32,
            shakeDistance: 0.14,
            dropDuration: 0.35,
        });
    }

    async init(parent) {
        this.mesh = await loadGLB(CONFIG.player.modelPath);
        applyMaterialPreset(this.mesh, CONFIG.materials.player);
        this.mesh.scale.setScalar(CONFIG.player.modelScale);
        parent.add(this.mesh);

        const lightCfg = CONFIG.player.headLight;
        if (lightCfg) {
            this.headLight = new THREE.PointLight(
                lightCfg.color ?? 0xfff0c8,
                lightCfg.intensity ?? 1.6,
                lightCfg.distance ?? 8,
                lightCfg.decay ?? 1.8,
            );
            this.headLight.name = 'player-head-light';
            this.headLight.castShadow = false;
            parent.add(this.headLight);
        }

        this._orientMesh();
    }

    /** @param worldForward world-space unit tangent direction of movement, or null */
    update(dt, worldRotator, enemies, worldForward) {
        if (!this.alive) return;

        // --- derive planet-local position from worldRotator ---
        _invQ.copy(worldRotator.quaternion).invert();
        this.position.set(0, this.surface.radius, 0).applyQuaternion(_invQ);

        // --- derive forward ---
        if (worldForward) {
            this.forward.copy(worldForward).applyQuaternion(_invQ);
        } else {
            const near = this._nearest(enemies);
            if (near) this.surface.tangentTo(this.position, near.position, this.forward);
        }
        this.surface.projectToTangent(this.position, this.forward, this.forward);

        this._hitSparkCooldown = Math.max(0, this._hitSparkCooldown - dt);
        this.motion.update(dt);
        if (this.mesh) this._orientMesh();
    }

    updateMotion(dt) {
        this._hitSparkCooldown = Math.max(0, this._hitSparkCooldown - dt);
        this.motion.update(dt);
        if (this.mesh) this._orientMesh();
    }

    takeDamage(amount, hitDirection = null) {
        if (!this.alive) return;
        this.hp = Math.max(0, this.hp - amount);
        if (hitDirection) {
            this.motion.shake(hitDirection, Math.min(1.6, 0.55 + amount / 18));
            if (this._hitSparkCooldown <= 0) {
                this.hitSparks?.emit(this.position, hitDirection, {
                    count: 42,
                    lift: CONFIG.player.modelLift * 0.75,
                    speedMin: 6.2,
                    speedMax: 11.5,
                    sizeMin: 0.04,
                    sizeMax: 0.095,
                });
                this._hitSparkCooldown = 0.08;
            }
        }
        if (this.hp <= 0) {
            this.alive = false;
            if (this.mesh) this.mesh.visible = false;
            if (this.headLight) this.headLight.visible = false;
        }
    }

    _orientMesh() {
        this.surface.orient(this.mesh, this.position, this.forward, CONFIG.player.modelYawOffset);
        _up.copy(this.position).normalize();
        if (CONFIG.player.modelLift) {
            this.mesh.position.addScaledVector(_up, CONFIG.player.modelLift);
        }
        this.mesh.scale.setScalar(CONFIG.player.modelScale);
        this.motion.apply(this.mesh, { up: _up, baseScale: CONFIG.player.modelScale });

        if (this.headLight) {
            const lift = CONFIG.player.headLight?.lift ?? 4.2;
            this.headLight.visible = this.alive;
            this.headLight.position.copy(this.position).addScaledVector(_up, lift);
        }
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

const _invQ = new THREE.Quaternion();
const _up = new THREE.Vector3();
