// Static camera. The planet and everything on it lives inside a `worldRotator`
// group that is re-oriented each frame so the player is always rendered at
// world (0, R, 0). The camera therefore never has to move or rotate.

import * as THREE from 'three';
import { CONFIG } from './config.js';

export class StaticCamera {
    constructor(aspect, surface) {
        this.camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, aspect, 0.1, 500);
        this.skyCamera = new THREE.PerspectiveCamera(CONFIG.camera.skyboxFov, aspect, 0.1, 10);
        const R = surface.radius;
        this.camera.position.set(0, R + CONFIG.camera.height, CONFIG.camera.distance);
        this.camera.up.set(0, 1, 0);
        this.camera.lookAt(0, R, 0);
        this.skyCamera.quaternion.copy(this.camera.quaternion);
    }

    setAspect(aspect) {
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();
        this.skyCamera.aspect = aspect;
        this.skyCamera.updateProjectionMatrix();
    }
}
