// Builds the base scene: background, fog, lights, ground plane.

import * as THREE from 'three';
import { CONFIG } from './config.js';

export function createScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.world.bgColor);
    scene.fog = new THREE.Fog(CONFIG.world.bgColor, CONFIG.world.fogNear, CONFIG.world.fogFar);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.55);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xffe0b0, 0.95);
    dir.position.set(8, 18, 6);
    scene.add(dir);

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(CONFIG.world.groundSize, CONFIG.world.groundSize),
        new THREE.MeshStandardMaterial({ color: 0x26262e, roughness: 1.0, metalness: 0.0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // subtle grid for orientation
    const grid = new THREE.GridHelper(CONFIG.world.groundSize, 40, 0x333344, 0x2a2a34);
    grid.position.y = 0.01;
    scene.add(grid);

    return scene;
}
