import * as THREE from 'three';

const BOTTLE_SPEED = 16;
const BOTTLE_LIFT = 0.42;
const ARC_HEIGHT = 2.8;
const IMPACT_DURATION_MIN = 0.22;
const IMPACT_DURATION_MAX = 0.72;
const PATCH_LIFT = 0.045;

export class FirebombGrenade {
    constructor({
        surface,
        start,
        target,
        damage,
        radius,
        burnDamagePerSecond,
        burnDuration,
        patchDuration,
        chainExplosionDamage,
        chainExplosionRadius,
        onImpact,
    }) {
        this.surface = surface;
        this.start = new THREE.Vector3().copy(start);
        this.surface.snapToSurface(this.start);
        this.target = new THREE.Vector3().copy(target);
        this.surface.snapToSurface(this.target);
        this.position = new THREE.Vector3().copy(this.start);
        this.damage = damage;
        this.radius = radius;
        this.burnDamagePerSecond = burnDamagePerSecond;
        this.burnDuration = burnDuration;
        this.patchDuration = patchDuration;
        this.chainExplosionDamage = chainExplosionDamage;
        this.chainExplosionRadius = chainExplosionRadius;
        this.onImpact = onImpact;
        this.alive = true;
        this._elapsed = 0;

        this._distance = Math.max(0.01, this.surface.arcDistance(this.start, this.target));
        this._duration = THREE.MathUtils.clamp(this._distance / BOTTLE_SPEED, IMPACT_DURATION_MIN, IMPACT_DURATION_MAX);
        this._forward = new THREE.Vector3();
        this.surface.tangentTo(this.start, this.target, this._forward);

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

    update(dt) {
        if (!this.alive) return;
        this._elapsed += dt;
        const t = Math.min(1, this._elapsed / this._duration);
        this.position.copy(this.start);
        this.surface.moveAlong(this.position, this._forward, this._distance * t);
        this._refreshMesh(t);
        if (t >= 1) {
            this.alive = false;
            this.onImpact?.(this);
        }
    }

    _buildMesh() {
        const group = new THREE.Group();

        const bottle = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.13, 0.38, 5, 8),
            new THREE.MeshStandardMaterial({
                color: 0x315044,
                emissive: 0xff3a12,
                emissiveIntensity: 0.25,
                roughness: 0.38,
                metalness: 0.08,
            }),
        );
        bottle.rotation.x = Math.PI / 2;
        group.add(bottle);

        const flame = new THREE.Mesh(
            new THREE.SphereGeometry(0.11, 10, 8),
            new THREE.MeshBasicMaterial({
                color: 0xffb22a,
                transparent: true,
                opacity: 0.92,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }),
        );
        flame.position.z = -0.34;
        group.add(flame);
        this._flame = flame;

        return group;
    }

    _refreshMesh(t = 0) {
        const up = _up.copy(this.position).normalize();
        const lift = BOTTLE_LIFT + Math.sin(Math.PI * t) * ARC_HEIGHT;
        this.mesh.position.copy(this.position).addScaledVector(up, lift);
        this.surface.tangentTo(this.position, this.target, _forward);
        if (_forward.lengthSq() < 1e-8) _forward.copy(this._forward);
        this.surface.orient(this.mesh, this.position, _forward);
        this.mesh.position.addScaledVector(up, lift);
        this.mesh.rotateX(t * Math.PI * 8);
        if (this._flame) {
            const pulse = 1 + Math.sin(performance.now() / 55) * 0.18;
            this._flame.scale.setScalar(pulse);
        }
    }
}

export class FirePatch {
    constructor({
        surface,
        position,
        radius,
        damage,
        burnDamagePerSecond,
        burnDuration,
        duration,
        chainExplosionDamage,
        chainExplosionRadius,
    }) {
        this.surface = surface;
        this.position = new THREE.Vector3().copy(position);
        this.surface.snapToSurface(this.position);
        this.radius = radius;
        this.damage = damage;
        this.burnDamagePerSecond = burnDamagePerSecond;
        this.burnDuration = burnDuration;
        this.duration = duration;
        this.chainExplosionDamage = chainExplosionDamage;
        this.chainExplosionRadius = chainExplosionRadius;
        this.alive = true;
        this._elapsed = 0;
        this._burning = new Map();
        this._chainExploded = new WeakSet();
        this._impactDone = false;

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

        if (!this._impactDone) {
            this._impactDone = true;
            this._damageInRadius(enemies, this.position, this.radius, this.damage);
        }

        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const d = this.surface.arcDistance(enemy.position, this.position);
            const bodyRadius = enemy.radius ?? 0;
            if (d <= this.radius + bodyRadius) {
                const prev = this._burning.get(enemy) ?? 0;
                this._burning.set(enemy, Math.max(prev, this.burnDuration));
            }
        }

        for (const [enemy, remaining] of Array.from(this._burning.entries())) {
            if (!enemy.alive) {
                this._burning.delete(enemy);
                continue;
            }
            const next = remaining - dt;
            this._burning.set(enemy, next);
            const wasAlive = enemy.alive;
            enemy.damage(this.burnDamagePerSecond * dt, this.position);
            if (wasAlive && !enemy.alive) this._chainExplode(enemy, enemies);
            if (next <= 0) this._burning.delete(enemy);
        }

        this._refreshMesh();
        if (this._elapsed >= this.duration && this._burning.size === 0) this.alive = false;
    }

    _damageInRadius(enemies, center, radius, damage, exclude = null) {
        if (damage <= 0) return;
        for (const enemy of enemies) {
            if (!enemy.alive || enemy === exclude) continue;
            const d = this.surface.arcDistance(enemy.position, center);
            const bodyRadius = enemy.radius ?? 0;
            if (d <= radius + bodyRadius) enemy.damage(damage, center);
        }
    }

    _chainExplode(enemy, enemies) {
        if (this.chainExplosionDamage <= 0 || this._chainExploded.has(enemy)) return;
        this._chainExploded.add(enemy);
        this._damageInRadius(enemies, enemy.position, this.chainExplosionRadius, this.chainExplosionDamage, enemy);
        this._spawnBurst(enemy.position, this.chainExplosionRadius, 0xfff0a0);
    }

    _buildMesh() {
        const group = new THREE.Group();

        const flame = new THREE.Mesh(
            new THREE.RingGeometry(0.18, 1, 48, 1),
            new THREE.MeshBasicMaterial({
                color: 0xff5a16,
                transparent: true,
                opacity: 0.58,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        flame.rotation.x = -Math.PI / 2;
        group.add(flame);
        this._flame = flame;

        const glow = new THREE.Mesh(
            new THREE.CircleGeometry(1, 48),
            new THREE.MeshBasicMaterial({
                color: 0xff2200,
                transparent: true,
                opacity: 0.22,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        glow.rotation.x = -Math.PI / 2;
        group.add(glow);
        this._glow = glow;

        this._burst = new THREE.Mesh(
            new THREE.RingGeometry(0.25, 1, 56, 1),
            new THREE.MeshBasicMaterial({
                color: 0xffd15a,
                transparent: true,
                opacity: 0,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        this._burst.rotation.x = -Math.PI / 2;
        group.add(this._burst);
        this._burstTimer = 0.28;
        this._burstRadius = this.radius;

        return group;
    }

    _spawnBurst(position, radius, color = 0xffd15a) {
        const burst = new THREE.Mesh(
            new THREE.RingGeometry(0.18, 1, 40, 1),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        const up = _up.copy(position).normalize();
        this.surface.orient(burst, position, _forward.set(1, 0, 0));
        burst.position.copy(position).addScaledVector(up, PATCH_LIFT + 0.03);
        burst.scale.setScalar(radius);
        this.mesh.parent?.add(burst);
        const started = performance.now();
        const tick = () => {
            const t = (performance.now() - started) / 260;
            if (t >= 1) {
                burst.parent?.remove(burst);
                burst.geometry.dispose();
                burst.material.dispose();
                return;
            }
            burst.scale.setScalar(radius * (1 + t * 0.65));
            burst.material.opacity = 0.8 * (1 - t);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    _refreshMesh() {
        const up = _up.copy(this.position).normalize();
        this.surface.orient(this.mesh, this.position, _forward.set(1, 0, 0));
        this.mesh.position.copy(this.position).addScaledVector(up, PATCH_LIFT);

        const lifeT = Math.min(1, this._elapsed / Math.max(0.001, this.duration));
        const fade = Math.max(0, 1 - lifeT);
        const pulse = 1 + Math.sin(performance.now() / 130) * 0.05;
        this._flame.scale.setScalar(this.radius * pulse);
        this._glow.scale.setScalar(this.radius * (1.08 + Math.sin(performance.now() / 180) * 0.04));
        this._flame.material.opacity = 0.44 + fade * 0.22;
        this._glow.material.opacity = 0.10 + fade * 0.16;

        if (this._burstTimer > 0) {
            this._burstTimer = Math.max(0, this._burstTimer - 1 / 60);
            const t = 1 - this._burstTimer / 0.28;
            this._burst.scale.setScalar(this._burstRadius * (0.45 + t * 0.9));
            this._burst.material.opacity = 0.82 * Math.max(0, 1 - t);
        }
    }
}

const _up = new THREE.Vector3();
const _forward = new THREE.Vector3();
