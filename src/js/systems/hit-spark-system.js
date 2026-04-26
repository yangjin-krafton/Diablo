import * as THREE from 'three';

const DEFAULTS = {
    poolSize: 500,
    count: 54,
    lifeMin: 0.14,
    lifeMax: 0.28,
    speedMin: 7.2,
    speedMax: 13.0,
    upSpeed: 4.6,
    sizeMin: 0.045,
    sizeMax: 0.105,
    lift: 0.86,
    burstRadiusScale: 3,
    drag: 7.8,
    gravity: 3.2,
    color: 0xfff0a6,
    hotColor: 0xff7a22,
};

export class HitSparkSystem {
    constructor(surface, parent, options = {}) {
        this.surface = surface;
        this.options = { ...DEFAULTS, ...options };
        this.group = new THREE.Group();
        this.group.name = 'hit-sparks';
        parent.add(this.group);

        this._particles = [];
        this._cursor = 0;
        this._up = new THREE.Vector3();
        this._right = new THREE.Vector3();
        this._side = new THREE.Vector3();
        this._dir = new THREE.Vector3();

        const geo = new THREE.SphereGeometry(1, 6, 4);
        for (let i = 0; i < this.options.poolSize; i++) {
            const mat = new THREE.MeshBasicMaterial({
                color: this.options.color,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                toneMapped: false,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.visible = false;
            this.group.add(mesh);
            this._particles.push({
                mesh,
                velocity: new THREE.Vector3(),
                age: 0,
                life: 0,
                size: 1,
                active: false,
            });
        }
    }

    emit(position, direction = null, options = {}) {
        const cfg = { ...this.options, ...options };
        this._up.copy(position).normalize();
        this._dir.copy(direction ?? this._up);
        this.surface.projectToTangent(position, this._dir, this._dir);
        if (this._dir.lengthSq() < 1e-8) this._dir.copy(this._up);
        this._dir.normalize();

        this._right.crossVectors(this._up, this._dir);
        if (this._right.lengthSq() < 1e-8) this._right.crossVectors(this._up, _fallbackAxis);
        this._right.normalize();

        const count = Math.max(1, Math.floor(cfg.count));
        for (let i = 0; i < count; i++) {
            const p = this._nextParticle();
            const mesh = p.mesh;
            const life = rand(cfg.lifeMin, cfg.lifeMax);
            const speed = rand(cfg.speedMin, cfg.speedMax);
            const radiusScale = cfg.burstRadiusScale ?? 1;
            const side = (Math.random() - 0.5) * 2;
            const spread = 0.35 + Math.random() * 0.65;

            this._side.copy(this._right).multiplyScalar(side * spread);
            p.velocity.copy(this._dir)
                .multiplyScalar(speed * radiusScale)
                .add(this._side.multiplyScalar(speed * 0.45 * radiusScale))
                .addScaledVector(this._up, cfg.upSpeed * Math.sqrt(radiusScale) * (0.45 + Math.random()));

            p.age = 0;
            p.life = life;
            p.size = rand(cfg.sizeMin, cfg.sizeMax);
            p.active = true;

            mesh.position.copy(position).addScaledVector(this._up, cfg.lift);
            mesh.scale.setScalar(p.size);
            mesh.material.color.set(Math.random() < 0.28 ? cfg.hotColor : cfg.color);
            mesh.material.opacity = 1;
            mesh.visible = true;
        }
    }

    update(dt) {
        const drag = Math.max(0, 1 - this.options.drag * dt);
        for (const p of this._particles) {
            if (!p.active) continue;
            p.age += dt;
            if (p.age >= p.life) {
                p.active = false;
                p.mesh.visible = false;
                p.mesh.material.opacity = 0;
                continue;
            }

            this._up.copy(p.mesh.position).normalize();
            p.velocity.addScaledVector(this._up, -this.options.gravity * dt);
            p.mesh.position.addScaledVector(p.velocity, dt);
            p.velocity.multiplyScalar(drag);

            const t = p.age / p.life;
            const fade = 1 - t;
            const pop = Math.sin(Math.min(1, t * 2.4) * Math.PI * 0.5);
            p.mesh.material.opacity = fade * fade;
            p.mesh.scale.setScalar(p.size * (0.35 + pop * 1.65) * fade);
        }
    }

    clear() {
        for (const p of this._particles) {
            p.active = false;
            p.mesh.visible = false;
            p.mesh.material.opacity = 0;
        }
    }

    _nextParticle() {
        const p = this._particles[this._cursor];
        this._cursor = (this._cursor + 1) % this._particles.length;
        return p;
    }
}

function rand(min, max) {
    return min + Math.random() * (max - min);
}

const _fallbackAxis = new THREE.Vector3(1, 0, 0);
