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
        this.beacon = null;
        this._beaconParticles = [];
        this._t = 0;
    }

    async init(parent, externalPosition = null) {
        this.mesh = await loadGLB(this.config.modelPath);
        applyMaterialPreset(this.mesh, CONFIG.materials.home);
        this.mesh.scale.setScalar(this.config.modelScale ?? 1);
        parent.add(this.mesh);

        this.ring = this._buildRing();
        parent.add(this.ring);

        this.beacon = this._buildBeacon();
        parent.add(this.beacon);

        if (externalPosition) {
            this.placeAt(externalPosition);
        } else {
            this.place();
        }
    }

    /** Place this NPC at an externally chosen position (typically supplied by
     *  the NPC placement system). Forward orients toward the planet's start
     *  point so the building faces the player's spawn. */
    placeAt(position) {
        this.position.copy(position);
        const toAnchor = _v.set(0, this.surface.radius, 0).sub(this.position);
        this.surface.projectToTangent(this.position, toAnchor, this.forward);
        this.orientSelf();
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
        this._updateBeacon(dt, inRange);
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
        if (this.config.modelLift) {
            const up = _v.copy(this.position).normalize();
            this.mesh.position.addScaledVector(up, this.config.modelLift);
        }
        const up = _v.copy(this.position).normalize();
        if (this.ring) {
            this.surface.orient(this.ring, this.position, this.forward);
            this.ring.position.copy(this.position).addScaledVector(up, 0.06);
        }
        if (this.beacon) {
            this.surface.orient(this.beacon, this.position, this.forward);
            this.beacon.position.copy(this.position).addScaledVector(up, 0.08);
        }
    }

    _buildRing() {
        const r = this.config.interactRange;
        const thickness = 0.18;
        const geo = new THREE.RingGeometry(r - thickness / 2, r + thickness / 2, 96);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
            color: beaconColorFor(this.config),
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        return new THREE.Mesh(geo, mat);
    }

    _buildBeacon() {
        const color = beaconColorFor(this.config);
        const group = new THREE.Group();
        group.name = 'npc-beacon';

        const height = this.config.beaconHeight ?? beaconHeightFor(this.config);
        const radius = this.config.beaconRadius ?? 0.42;
        group.userData.height = height;
        group.userData.radius = radius;

        const outerGeo = new THREE.CylinderGeometry(radius, radius * 0.7, height, 28, 1, true);
        const outerMat = makeBeaconMaterial(color, 0.16);
        const outer = new THREE.Mesh(outerGeo, outerMat);
        outer.position.y = height * 0.5;
        group.add(outer);
        group.userData.outer = outer;

        const coreGeo = new THREE.CylinderGeometry(radius * 0.22, radius * 0.16, height, 18, 1, true);
        const coreMat = makeBeaconMaterial(color, 0.34);
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.y = height * 0.5;
        group.add(core);
        group.userData.core = core;

        const particleGeo = new THREE.SphereGeometry(1, 6, 4);
        this._beaconParticles = [];
        const count = this.config.beaconParticleCount ?? 30;
        for (let i = 0; i < count; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                toneMapped: false,
            });
            const p = new THREE.Mesh(particleGeo, mat);
            p.userData.phase = Math.random();
            p.userData.angle = Math.random() * Math.PI * 2;
            p.userData.radius = radius * (0.25 + Math.random() * 0.75);
            p.userData.speed = 0.08 + Math.random() * 0.11;
            p.userData.spin = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.7);
            p.userData.size = 0.045 + Math.random() * 0.075;
            group.add(p);
            this._beaconParticles.push(p);
        }

        return group;
    }

    _updateBeacon(dt, inRange) {
        if (!this.beacon) return;
        const height = this.beacon.userData.height;
        const radius = this.beacon.userData.radius;
        const pulse = 0.5 + 0.5 * Math.sin(this._t * (inRange ? 5.2 : 2.1));
        const activeBoost = inRange ? 1.35 : 1;

        const outer = this.beacon.userData.outer;
        const core = this.beacon.userData.core;
        if (outer) {
            outer.material.uniforms.uOpacity.value = (0.12 + pulse * 0.06) * activeBoost;
            outer.scale.set(1 + pulse * 0.08, 1, 1 + pulse * 0.08);
        }
        if (core) {
            core.material.uniforms.uOpacity.value = (0.26 + pulse * 0.14) * activeBoost;
            core.scale.set(1 + pulse * 0.12, 1, 1 + pulse * 0.12);
        }

        for (const p of this._beaconParticles) {
            const u = (p.userData.phase + this._t * p.userData.speed) % 1;
            const angle = p.userData.angle + this._t * p.userData.spin;
            const drift = radius * 0.12 * Math.sin(this._t * 2.7 + p.userData.phase * 12.0);
            const r = p.userData.radius + drift;
            const fade = Math.sin(u * Math.PI);
            p.position.set(Math.cos(angle) * r, u * height, Math.sin(angle) * r);
            p.scale.setScalar(p.userData.size * (0.65 + fade * 0.9) * activeBoost);
            p.material.opacity = fade * (inRange ? 0.9 : 0.58);
        }
    }
}

const _v = new THREE.Vector3();

function beaconColorFor(config) {
    if (config === CONFIG.home) return 0xffd76a;
    if (config.kind === 'skillTrainer') return 0xff5757;
    const byStat = {
        maxHp: 0x55ff8a,
        moveSpeed: 0xffe45c,
        pickupRange: 0x5cc9ff,
        damage: 0xff5c5c,
    };
    if (config.statId && byStat[config.statId]) return byStat[config.statId];
    const byElement = {
        red: 0xff5c5c,
        yellow: 0xffe45c,
        green: 0x55ff8a,
        blue: 0x5cc9ff,
        purple: 0xc46cff,
        physical: 0xfff0a6,
    };
    return byElement[config.element] ?? 0x8fd8ff;
}

function beaconHeightFor(config) {
    if (config === CONFIG.home) return 7;
    if (config.kind === 'skillTrainer') return 7;
    return 7;
}

function makeBeaconMaterial(color, opacity) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(color) },
            uOpacity: { value: opacity },
        },
        vertexShader: `
            varying float vUvY;
            void main() {
                vUvY = uv.y;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uOpacity;
            varying float vUvY;
            void main() {
                float topFade = 1.0 - smoothstep(0.42, 1.0, vUvY);
                float bottomSoft = smoothstep(0.0, 0.12, vUvY);
                float alpha = uOpacity * topFade * bottomSoft;
                gl_FragColor = vec4(uColor, alpha);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
}
