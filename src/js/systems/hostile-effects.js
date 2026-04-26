import * as THREE from 'three';

export class PortalVortexEffect {
    constructor(surface, building) {
        this.surface = surface;
        this.building = building;
        this.group = new THREE.Group();
        this.group.name = 'portal-vortex-effect';
        this._t = 0;

        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x9b5cff,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0x38d8ff,
            transparent: true,
            opacity: 0.28,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        this.outer = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.055, 10, 48), ringMat);
        this.inner = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.035, 8, 40), ringMat.clone());
        this.inner.material.color.setHex(0x4cffd8);
        this.core = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), coreMat);
        this.group.add(this.core, this.outer, this.inner);

        this._place();
    }

    attach(parent) { parent.add(this.group); }

    detach() {
        if (this.group.parent) this.group.parent.remove(this.group);
    }

    setVisible(visible) {
        this.group.visible = !!visible;
    }

    update(dt) {
        if (!this.group.visible) return;
        this._t += dt;
        this._place();
        this.outer.rotation.z = this._t * 2.8;
        this.inner.rotation.z = -this._t * 4.1;
        const pulse = 0.5 + 0.5 * Math.sin(this._t * 5.2);
        this.core.material.opacity = 0.18 + pulse * 0.18;
        this.group.scale.setScalar(1 + pulse * 0.08);
    }

    _place() {
        this.surface.orient(this.group, this.building.position, this.building.forward, this.building.modelYawOffset);
        const up = _v1.copy(this.building.position).normalize();
        this.group.position.copy(this.building.position).addScaledVector(up, this.building.modelLift + 0.65);
    }
}

export class FortressSmokeEffect {
    constructor(surface, building) {
        this.surface = surface;
        this.building = building;
        this.group = new THREE.Group();
        this.group.name = 'fortress-smoke-effect';
        this._t = 0;
        this._particles = [];

        const flameMat = new THREE.MeshBasicMaterial({
            color: 0xff7a22,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 8), flameMat);
        this.flame.position.y = 0.22;
        this.group.add(this.flame);

        const geo = new THREE.SphereGeometry(1, 8, 6);
        for (let i = 0; i < 28; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: 0x3b3b3b,
                transparent: true,
                opacity: 0,
                depthWrite: false,
            });
            const p = new THREE.Mesh(geo, mat);
            p.userData.phase = Math.random();
            p.userData.angle = Math.random() * Math.PI * 2;
            p.userData.radius = 0.08 + Math.random() * 0.18;
            p.userData.speed = 0.08 + Math.random() * 0.08;
            p.userData.size = 0.12 + Math.random() * 0.18;
            this.group.add(p);
            this._particles.push(p);
        }
        this._place();
    }

    attach(parent) { parent.add(this.group); }

    detach() {
        if (this.group.parent) this.group.parent.remove(this.group);
    }

    update(dt) {
        if (!this.group.visible) return;
        this._t += dt;
        this._place();

        const flicker = 0.65 + Math.sin(this._t * 18) * 0.18 + Math.random() * 0.18;
        this.flame.scale.set(0.85 + flicker * 0.25, 0.85 + flicker * 0.35, 0.85 + flicker * 0.25);
        this.flame.material.opacity = 0.55 + flicker * 0.35;

        for (const p of this._particles) {
            const u = (p.userData.phase + this._t * p.userData.speed) % 1;
            const angle = p.userData.angle + this._t * 0.55;
            const widen = 0.25 + u * 0.95;
            p.position.set(Math.cos(angle) * p.userData.radius * widen, 0.38 + u * 3.2, Math.sin(angle) * p.userData.radius * widen);
            p.scale.setScalar(p.userData.size * (0.7 + u * 2.2));
            p.material.opacity = Math.sin(u * Math.PI) * 0.34;
        }
    }

    _place() {
        this.surface.orient(this.group, this.building.position, this.building.forward, this.building.modelYawOffset);
        const up = _v1.copy(this.building.position).normalize();
        this.group.position.copy(this.building.position).addScaledVector(up, this.building.modelLift + 0.65);
    }
}

export class DropShipMeteorEffect {
    constructor(surface, impactPos, duration) {
        this.surface = surface;
        this.impactPos = impactPos.clone();
        this.duration = Math.max(0.1, duration);
        this.timer = this.duration;
        this.alive = true;
        this.group = new THREE.Group();
        this.group.name = 'dropship-meteor-effect';
        this._particles = [];

        const rockMat = new THREE.MeshStandardMaterial({
            color: 0x2b2320,
            emissive: 0xff3b00,
            emissiveIntensity: 1.6,
            roughness: 0.7,
        });
        this.rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48, 1), rockMat);
        this.group.add(this.rock);

        const geo = new THREE.SphereGeometry(1, 8, 6);
        for (let i = 0; i < 42; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: Math.random() < 0.45 ? 0xff7a18 : 0x272321,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            const p = new THREE.Mesh(geo, mat);
            p.userData.phase = Math.random();
            p.userData.size = 0.05 + Math.random() * 0.14;
            this.group.add(p);
            this._particles.push(p);
        }
        this._place(0);
    }

    attach(parent) { parent.add(this.group); }

    detach() {
        if (this.group.parent) this.group.parent.remove(this.group);
        this.alive = false;
    }

    update(dt) {
        if (!this.alive) return;
        this.timer = Math.max(0, this.timer - dt);
        const t = 1 - this.timer / this.duration;
        this._place(t);
        this.rock.rotation.x += dt * 5.2;
        this.rock.rotation.z += dt * 3.7;

        for (const p of this._particles) {
            const u = (p.userData.phase + t * 1.8) % 1;
            const angle = p.userData.phase * Math.PI * 2 + u * 4.0;
            const tail = -u * 5.5;
            const spread = u * 0.65;
            p.position.set(Math.cos(angle) * spread, tail, Math.sin(angle) * spread);
            p.scale.setScalar(p.userData.size * (1.2 + u * 2.5));
            p.material.opacity = (1 - u) * 0.75;
        }
    }

    _place(t) {
        this.surface.orient(this.group, this.impactPos, _fallbackForward);
        const up = _v1.copy(this.impactPos).normalize();
        const height = THREE.MathUtils.lerp(13, 0.55, t);
        this.group.position.copy(this.impactPos).addScaledVector(up, height);
    }
}

export class ImpactBurstEffect {
    constructor(surface, position) {
        this.surface = surface;
        this.position = position.clone();
        this.age = 0;
        this.life = 0.8;
        this.alive = true;
        this.group = new THREE.Group();
        this.group.name = 'impact-burst-effect';
        this._particles = [];

        const ringGeo = new THREE.RingGeometry(0.25, 0.5, 48);
        ringGeo.rotateX(-Math.PI / 2);
        this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
            color: 0xffb15a,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        }));
        this.group.add(this.ring);

        const geo = new THREE.SphereGeometry(1, 8, 6);
        for (let i = 0; i < 70; i++) {
            const hot = Math.random() < 0.35;
            const mat = new THREE.MeshBasicMaterial({
                color: hot ? 0xff7a22 : 0x7b6b57,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: hot ? THREE.AdditiveBlending : THREE.NormalBlending,
            });
            const p = new THREE.Mesh(geo, mat);
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.6 + Math.random() * 4.8;
            p.userData.dir = new THREE.Vector3(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);
            p.userData.up = 0.7 + Math.random() * 2.8;
            p.userData.size = 0.08 + Math.random() * 0.2;
            this.group.add(p);
            this._particles.push(p);
        }
        this._place();
    }

    attach(parent) { parent.add(this.group); }

    update(dt) {
        this.age += dt;
        const t = this.age / this.life;
        if (t >= 1) {
            this.alive = false;
            if (this.group.parent) this.group.parent.remove(this.group);
            return;
        }
        this._place();
        const fade = 1 - t;
        this.ring.scale.setScalar(1 + t * 7);
        this.ring.material.opacity = fade * 0.75;

        const up = _v1.copy(this.position).normalize();
        for (const p of this._particles) {
            p.position.copy(p.userData.dir).multiplyScalar(t);
            p.position.addScaledVector(up, p.userData.up * Math.sin(t * Math.PI));
            p.scale.setScalar(p.userData.size * (0.6 + t * 2.5));
            p.material.opacity = fade * fade * 0.75;
        }
    }

    _place() {
        this.surface.orient(this.group, this.position, _fallbackForward);
        const up = _v1.copy(this.position).normalize();
        this.group.position.copy(this.position).addScaledVector(up, 0.08);
    }
}

const _v1 = new THREE.Vector3();
const _fallbackForward = new THREE.Vector3(0, 0, 1);
