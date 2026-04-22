// Home building. Fixed landmark on the planet surface. Entering its interact
// range pauses the game and opens the skill tree panel (see Game._tick).
//
// Visual affordance: a thin gold ring sits on the surface at exactly the
// interact radius. It pulses slowly when the player is far and pulses faster
// + brighter when the player steps inside the range — telegraphing the
// interaction boundary.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadGLB } from '../assets.js';

export class Home {
    constructor(surface) {
        this.surface = surface;
        // Planet-local position — lives INSIDE worldRotator so it stays glued
        // to the planet as the player walks.
        this.position = new THREE.Vector3();
        this.forward = new THREE.Vector3(0, 0, 1);
        this.mesh = null;
        this.ring = null;
        this._t = 0;
    }

    async init(parent) {
        this.mesh = await loadGLB(CONFIG.home.modelPath);
        this.mesh.scale.setScalar(CONFIG.home.modelScale);
        parent.add(this.mesh);

        this.ring = this._buildRing();
        parent.add(this.ring);

        this._place();
    }

    _buildRing() {
        const r = CONFIG.home.interactRange;
        const thickness = 0.18;
        const geo = new THREE.RingGeometry(r - thickness / 2, r + thickness / 2, 96);
        // RingGeometry is in local XY; rotate so it lies in local XZ (on the
        // ground). surface.orient then puts that plane tangent to the sphere.
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffd84f,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        return new THREE.Mesh(geo, mat);
    }

    /** Place near the player spawn (north pole) offset by spawnArcOffset. */
    _place() {
        // Start from the player's initial local position (0, R, 0) and walk
        // along a fixed tangent direction so home is a bit to the side.
        this.position.set(0, this.surface.radius, 0);
        const tangent = _v.set(1, 0, 0.2);
        this.surface.projectToTangent(this.position, tangent, tangent);
        this.surface.moveAlong(this.position, tangent, CONFIG.home.spawnArcOffset);

        // Face back toward the spawn pole so the door looks at the player.
        const toPlayer = _v2.set(0, this.surface.radius, 0).sub(this.position);
        this.surface.projectToTangent(this.position, toPlayer, this.forward);
        this.surface.orient(this.mesh, this.position, this.forward, CONFIG.home.modelYawOffset);

        // Ring sits flat on the surface, lifted slightly to avoid z-fighting
        // with the planet.
        if (this.ring) {
            this.surface.orient(this.ring, this.position, this.forward);
            const up = _v.copy(this.position).normalize();
            this.ring.position.copy(this.position).addScaledVector(up, 0.06);
        }
    }

    update(dt, player) {
        if (!this.ring) return;
        this._t += dt;
        const d = this.surface.arcDistance(this.position, player.position);
        const range = CONFIG.home.interactRange;
        const inRange = d < range;
        // Slow ambient pulse when outside, faster/brighter when inside.
        const freq = inRange ? 3.4 : 1.2;
        const pulse = 0.5 + 0.5 * Math.sin(this._t * freq);
        const base  = inRange ? 0.55 : 0.28;
        const amp   = inRange ? 0.32 : 0.18;
        this.ring.material.opacity = base + pulse * amp;
        // subtle scale breathing when in range so the boundary reads as active
        const scale = 1 + (inRange ? pulse * 0.03 : 0);
        this.ring.scale.setScalar(scale);
    }

    isPlayerInRange(player) {
        return this.surface.arcDistance(this.position, player.position) < CONFIG.home.interactRange;
    }
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
