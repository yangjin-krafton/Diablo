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

export class Player {
    constructor(surface) {
        this.surface = surface;
        this.position = new THREE.Vector3(0, surface.radius, 0);
        this.forward = new THREE.Vector3(0, 0, -1);

        this.hp = CONFIG.player.maxHp;
        this.maxHp = CONFIG.player.maxHp;
        this.alive = true;

        this.mesh = null;
    }

    async init(parent) {
        this.mesh = await loadGLB(CONFIG.player.modelPath);
        applyMaterialPreset(this.mesh, CONFIG.materials.player);
        this.mesh.scale.setScalar(CONFIG.player.modelScale);
        parent.add(this.mesh);
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

        if (this.mesh) this._orientMesh();
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

const _invQ = new THREE.Quaternion();
