import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { NpcBase } from './npc-base.js';
import { HomePanel } from './home-panel.js';

export class HomeNpc extends NpcBase {
    constructor(surface) {
        super(surface, CONFIG.home);
    }

    place() {
        this.position.set(0, this.surface.radius, 0);
        const tangent = _v.set(1, 0, 0.2);
        this.surface.projectToTangent(this.position, tangent, tangent);
        this.surface.moveAlong(this.position, tangent, CONFIG.home.spawnArcOffset);

        const toPlayer = _v2.set(0, this.surface.radius, 0).sub(this.position);
        this.surface.projectToTangent(this.position, toPlayer, this.forward);
        this.orientSelf();
    }

    createPanel(uiRoot, controller, options = {}) {
        return new HomePanel(uiRoot, controller, options);
    }
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
