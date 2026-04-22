// Glowing shard dropped by killed enemies. Planet-local position; bobs along
// the radial up axis so it floats above the surface and spins. Picked up by
// walking over it (see DropSystem).
//
// Three-state life cycle for juiciness:
//   dropping    — brief scale-up + vertical hop so the drop is noticeable
//   idle        — steady bob + spin while waiting to be picked up
//   collecting  — fly toward the player, shrink, fade, then flag alive=false
//                 so the DropSystem can detach it.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const DROP_DUR    = 0.28;
const COLLECT_DUR = 0.35;
const BASE_LIFT   = 0.5;
const BOB_AMP     = 0.18;

export class SkillShard {
    constructor(surface, position) {
        this.surface = surface;
        this.position = new THREE.Vector3().copy(position);
        this.surface.snapToSurface(this.position);
        this.alive = true;
        this._phase = Math.random() * Math.PI * 2;

        this._state = 'dropping';
        this._stateT = 0;

        const geo = new THREE.IcosahedronGeometry(CONFIG.drops.shardSize, 0);
        const mat = new THREE.MeshStandardMaterial({
            color: CONFIG.drops.shardColor,
            emissive: CONFIG.drops.shardEmissive,
            emissiveIntensity: 0.9,
            metalness: 0.4,
            roughness: 0.3,
            transparent: true,
            opacity: 1,
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.castShadow = true;
        this.mesh.scale.setScalar(0.01);  // grows during 'dropping'

        this._up = new THREE.Vector3();
        this._idleWorldPos = new THREE.Vector3();
        this._collectTarget = new THREE.Vector3();
        this._placeIdle(0);
    }

    attach(parent) { parent.add(this.mesh); }
    detach() {
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }

    /** Kick off the collect animation. `target` is a planet-local position to
     *  fly toward (typically the player's position). */
    startCollect(target) {
        if (this._state === 'collecting') return;
        this._state = 'collecting';
        this._stateT = 0;
        this._collectTarget.copy(target).setLength(this.surface.radius + BASE_LIFT + 0.3);
    }

    isCollecting() { return this._state === 'collecting'; }

    update(dt, timeSec) {
        this._stateT += dt;

        if (this._state === 'dropping') {
            const t = Math.min(1, this._stateT / DROP_DUR);
            // ease-out cubic: snappy growth then settle (no bob change so
            // the transition to 'idle' is seamless).
            const eased = 1 - Math.pow(1 - t, 3);
            this.mesh.scale.setScalar(eased);
            this._placeIdle(timeSec, 1);
            if (t >= 1) {
                this._state = 'idle';
                this._stateT = 0;
                this.mesh.scale.setScalar(1);
            }
        } else if (this._state === 'idle') {
            this._placeIdle(timeSec, 1);
            this.mesh.rotation.y += dt * 2.2;
            this.mesh.rotation.x += dt * 0.8;
        } else if (this._state === 'collecting') {
            const t = Math.min(1, this._stateT / COLLECT_DUR);
            // accelerating travel toward target
            const eased = t * t;
            this.mesh.position.lerpVectors(this._idleWorldPos, this._collectTarget, eased);
            this.mesh.rotation.y += dt * 6;
            this.mesh.rotation.x += dt * 3;
            this.mesh.scale.setScalar(Math.max(0, 1 - t * 0.9));
            this.mesh.material.opacity = Math.max(0, 1 - t);
            this.mesh.material.emissiveIntensity = 0.9 + t * 1.5;
            if (t >= 1) this.alive = false;
        }
    }

    _placeIdle(timeSec, bobScale = 1) {
        this._up.copy(this.position).normalize();
        const bob = BASE_LIFT + Math.sin(this._phase + timeSec * 2.5) * BOB_AMP;
        this.mesh.position.copy(this.position).addScaledVector(this._up, bob * bobScale);
        this._idleWorldPos.copy(this.mesh.position);
    }
}
