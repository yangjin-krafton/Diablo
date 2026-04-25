import * as THREE from 'three';
import { loadGLB } from '../assets.js';
import { CONFIG } from '../config.js';
import { applyMaterialPreset } from '../material-controls.js';

export class NpcBase {
    constructor(surface, config) {
        this.surface = surface;
        this.config = config;
        this.position = new THREE.Vector3();
        this.forward = new THREE.Vector3(0, 0, 1);
        this.mesh = null;
        this.ring = null;
        this._t = 0;
    }

    async init(parent) {
        this.mesh = await loadGLB(this.config.modelPath);
        applyMaterialPreset(this.mesh, CONFIG.materials.home);
        this.mesh.scale.setScalar(this.config.modelScale ?? 1);
        parent.add(this.mesh);

        this.ring = this._buildRing();
        parent.add(this.ring);

        this.place();
    }

    update(dt, player) {
        if (!this.ring) return;

        this._t += dt;
        const inRange = this.isPlayerInRange(player);
        const freq = inRange ? 3.4 : 1.2;
        const pulse = 0.5 + 0.5 * Math.sin(this._t * freq);
        const base = inRange ? 0.55 : 0.28;
        const amp = inRange ? 0.32 : 0.18;

        this.ring.material.opacity = base + pulse * amp;
        this.ring.scale.setScalar(1 + (inRange ? pulse * 0.03 : 0));
    }

    isPlayerInRange(player) {
        return this.surface.arcDistance(this.position, player.position) < this.config.interactRange;
    }

    place() {
        throw new Error(`${this.constructor.name}.place() must be implemented`);
    }

    createPanel() {
        return null;
    }

    orientSelf(yawOffset = this.config.modelYawOffset ?? 0) {
        this.surface.orient(this.mesh, this.position, this.forward, yawOffset);
        if (!this.ring) return;

        this.surface.orient(this.ring, this.position, this.forward);
        const up = _v.copy(this.position).normalize();
        this.ring.position.copy(this.position).addScaledVector(up, 0.06);
    }

    _buildRing() {
        const r = this.config.interactRange;
        const thickness = 0.18;
        const geo = new THREE.RingGeometry(r - thickness / 2, r + thickness / 2, 96);
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
}

const _v = new THREE.Vector3();
