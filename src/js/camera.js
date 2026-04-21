// Top-down follow camera. Smoothly tracks a target position.

import * as THREE from 'three';
import { CONFIG } from './config.js';

export class FollowCamera {
    constructor(aspect) {
        this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, aspect, 0.1, 200);
        this._desired = new THREE.Vector3();
        this._lookAt = new THREE.Vector3();
    }

    setAspect(aspect) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
    }

    update(dt, targetPos) {
        this._desired.set(
            targetPos.x,
            targetPos.y + CONFIG.camera.height,
            targetPos.z + CONFIG.camera.distance,
        );
        const alpha = 1 - Math.exp(-CONFIG.camera.followSpeed * dt);
        this.camera.position.lerp(this._desired, alpha);
        this._lookAt.copy(targetPos);
        this.camera.lookAt(this._lookAt);
    }
}
