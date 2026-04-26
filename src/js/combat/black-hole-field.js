import * as THREE from 'three';
import { CONFIG } from '../config.js';

const LIFT = 0.55;
const CORE_MIN_SCALE = 0.35;

export class BlackHoleField {
    constructor({
        surface,
        position,
        radius,
        duration,
        pullSpeed,
        pullDamagePerSecond,
        vulnerabilityMultiplier,
        resourceAbsorb,
        rewardMul,
        skillSystem,
        homeController,
        drops,
    }) {
        this.surface = surface;
        this.position = new THREE.Vector3().copy(position);
        this.surface.snapToSurface(this.position);
        this.radius = radius;
        this.duration = duration;
        this.pullSpeed = pullSpeed;
        this.pullDamagePerSecond = pullDamagePerSecond;
        this.vulnerabilityMultiplier = vulnerabilityMultiplier;
        this.resourceAbsorb = resourceAbsorb;
        this.rewardMul = rewardMul;
        this.skillSystem = skillSystem;
        this.homeController = homeController;
        this.drops = drops;
        this.alive = true;
        this._elapsed = 0;
        this._phase = Math.random() * Math.PI * 2;
        this._absorbedShards = new WeakSet();

        this.mesh = this._buildMesh();
        this._refreshMesh();
    }

    attach(parent) { parent.add(this.mesh); }

    detach() {
        if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
        this.mesh.traverse((child) => {
            if (!child.isMesh) return;
            child.geometry?.dispose?.();
            child.material?.dispose?.();
        });
    }

    update(dt, enemies) {
        if (!this.alive) return;
        this._elapsed += dt;

        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const d = this.surface.arcDistance(enemy.position, this.position);
            const bodyRadius = enemy.radius ?? CONFIG.enemy.radius ?? 0;
            if (d > this.radius + bodyRadius) continue;

            enemy.blackHoleDamageTakenMultiplier = Math.max(
                enemy.blackHoleDamageTakenMultiplier ?? 1,
                this.vulnerabilityMultiplier,
            );

            const strength = 1 - Math.min(1, d / Math.max(0.001, this.radius + bodyRadius));
            const damage = this.pullDamagePerSecond * (0.35 + strength * 0.65) * dt;
            if (damage > 0) enemy.damage(damage, this.position);

            if (!enemy.alive || enemy.isHostileBuilding) continue;
            this.surface.tangentTo(enemy.position, this.position, _tangent);
            if (_tangent.lengthSq() > 1e-8) {
                const step = Math.min(d, this.pullSpeed * (0.35 + strength) * dt);
                this.surface.moveAlong(enemy.position, _tangent, step);
                enemy.forward.copy(_tangent);
            }
        }

        if (this.resourceAbsorb) this._absorbResources();

        this._refreshMesh();
        if (this._elapsed >= this.duration) this.alive = false;
    }

    _absorbResources() {
        const shards = this.drops?.shards;
        if (!Array.isArray(shards)) return;

        for (const shard of shards) {
            if (!shard.alive || shard.isCollecting?.() || this._absorbedShards.has(shard)) continue;
            const d = this.surface.arcDistance(shard.position, this.position);
            if (d > this.radius) continue;

            this._absorbedShards.add(shard);
            this.skillSystem?.grantShardExp?.((CONFIG.drops.shardExp ?? 0) * (this.rewardMul ?? 1));
            this.homeController?.gainOre?.(shard.element, 1);
            shard.startCollect(this.position);
        }
    }

    _buildMesh() {
        const group = new THREE.Group();

        this._disk = new THREE.Mesh(
            new THREE.RingGeometry(0.25, 1, 72, 1),
            new THREE.MeshBasicMaterial({
                color: 0x5ad8ff,
                transparent: true,
                opacity: 0.36,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        this._disk.rotation.x = -Math.PI / 2;
        group.add(this._disk);

        this._halo = new THREE.Mesh(
            new THREE.RingGeometry(0.62, 1, 72, 1),
            new THREE.MeshBasicMaterial({
                color: 0xb15cff,
                transparent: true,
                opacity: 0.26,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        this._halo.rotation.x = -Math.PI / 2;
        group.add(this._halo);

        this._core = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 24, 16),
            new THREE.MeshStandardMaterial({
                color: 0x07020d,
                emissive: 0x5b22ff,
                emissiveIntensity: 1.25,
                roughness: 0.7,
                metalness: 0.05,
            }),
        );
        group.add(this._core);

        return group;
    }

    _refreshMesh() {
        const up = _up.copy(this.position).normalize();
        this.surface.orient(this.mesh, this.position, _forward.set(1, 0, 0));
        this.mesh.position.copy(this.position).addScaledVector(up, LIFT);

        const life = Math.min(1, this._elapsed / Math.max(0.001, this.duration));
        const endFade = Math.min(1, (this.duration - this._elapsed) / 0.45);
        const pulse = 1 + Math.sin(performance.now() / 120 + this._phase) * 0.06;
        this._disk.scale.setScalar(this.radius * pulse);
        this._halo.scale.setScalar(this.radius * (1.18 - life * 0.08));
        this._core.scale.setScalar(Math.max(CORE_MIN_SCALE, this.radius * 0.17) * (1 + Math.sin(performance.now() / 85) * 0.08));
        this._disk.rotation.z += 0.035;
        this._halo.rotation.z -= 0.022;
        this._disk.material.opacity = 0.36 * endFade;
        this._halo.material.opacity = 0.26 * endFade;
        this._core.material.emissiveIntensity = 0.9 + Math.sin(performance.now() / 95) * 0.25;
    }
}

const _up = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _tangent = new THREE.Vector3();
