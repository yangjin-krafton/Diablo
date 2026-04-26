import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { loadGLB } from '../assets.js';
import { Skill } from './skill-base.js';
import { LightningRing } from '../combat/lightning-ring.js';
import { FirePatch } from '../combat/firebomb-grenade.js';

const TAU = Math.PI * 2;
const CLONE_LIFT = 0.04;

export class DecoySkill extends Skill {
    static id = 'decoy';
    static displayName = '분신 허수아비';
    static iconPath = './asset/decoy-icon.svg';
    static description = '일정 시간 분신을 만들어 적의 어그로를 분산합니다.';

    constructor(player, game) {
        super(player, game);
        this.clones = [];
        this._cdRemaining = 0;
        this._autoCast = true;
        this.onNodeChanged();
    }

    getNodes() {
        return [
            { id: 'duration1', col: 0, row: 0, maxRank: 5, requires: [], name: '긴 잔상', desc: '분신 유지 시간 +14%' },
            { id: 'duration2', col: 0, row: 1, maxRank: 3, requires: ['duration1'], name: '지속 투영', desc: '분신 유지 시간 +20%' },
            { id: 'cooldown', col: 0, row: 2, maxRank: 4, requires: ['duration2'], name: '빠른 재소환', desc: '재사용 대기시간 -8%' },
            { id: 'follow_on', col: 0, row: 3, maxRank: 1, requires: ['cooldown'], name: '호위 잔상', desc: '분신이 플레이어 근처를 따라다닙니다.' },
            { id: 'follow_speed', col: 0, row: 4, maxRank: 2, requires: ['follow_on'], name: '동조 이동', desc: '따라오는 속도 +20%' },

            { id: 'count1', col: 1, row: 0, maxRank: 3, requires: [], name: '다중 투영', desc: '2랭크마다 분신 수 +1' },
            { id: 'count2', col: 1, row: 1, maxRank: 2, requires: ['count1'], name: '거울 군단', desc: '분신 수 +1' },
            { id: 'aggro', col: 1, row: 2, maxRank: 3, requires: ['count2'], name: '강한 기척', desc: '분신 어그로 +18%' },
            { id: 'copy_on', col: 1, row: 3, maxRank: 1, requires: ['aggro'], name: '스킬 복사', desc: '분신이 주기적으로 보유 스킬 하나를 약화 시전합니다.' },
            { id: 'copy_power', col: 1, row: 4, maxRank: 3, requires: ['copy_on'], name: '복사 숙련', desc: '복사 스킬 피해 30% / 50% / 70%' },

            { id: 'pulse_on', col: 2, row: 0, maxRank: 1, requires: [], name: '위협 파동', desc: '분신 주변 적에게 주기적으로 피해를 줍니다.' },
            { id: 'pulse_damage', col: 2, row: 1, maxRank: 4, requires: ['pulse_on'], name: '환영 칼날', desc: '분신 피해 +18%' },
            { id: 'pulse_radius', col: 2, row: 2, maxRank: 3, requires: ['pulse_damage'], name: '넓은 파동', desc: '분신 피해 범위 +14%' },
            { id: 'explode_on', col: 2, row: 3, maxRank: 1, requires: ['pulse_radius'], name: '소멸 폭파', desc: '분신이 사라질 때 주변에 피해를 줍니다.' },
            { id: 'explode_damage', col: 2, row: 4, maxRank: 3, requires: ['explode_on'], name: '환영 파열', desc: '소멸 폭파 피해 +24%' },
        ];
    }

    getExpForLevel(level) {
        return Math.floor(38 * Math.pow(1.29, level - 1));
    }

    onNodeChanged() {
        const r = (id) => this.rankOf(id);
        const base = CONFIG.decoy ?? {};

        this.duration = (base.duration ?? 5.2) * (1 + 0.14 * r('duration1') + 0.20 * r('duration2'));
        this.cooldown = (base.cooldown ?? 8.5) * Math.max(0.35, 1 - 0.08 * r('cooldown'));
        this.count = (base.count ?? 1) + Math.floor(r('count1') / 2) + r('count2');
        this.aggroWeight = (base.aggroWeight ?? 2.25) * (1 + 0.18 * r('aggro'));
        this.aggroRange = base.aggroRange ?? 13;
        this.followPlayer = r('follow_on') > 0;
        this.followSpeed = (base.followSpeed ?? 4.5) * (1 + 0.20 * r('follow_speed'));

        this.pulseEnabled = r('pulse_on') > 0;
        this.pulseDamage = (base.pulseDamage ?? 5.5) * (1 + 0.18 * r('pulse_damage'));
        this.pulseRadius = (base.pulseRadius ?? 2.0) * (1 + 0.14 * r('pulse_radius'));
        this.pulseInterval = base.pulseInterval ?? 0.7;

        this.explodeEnabled = r('explode_on') > 0;
        this.explodeDamage = (base.explodeDamage ?? 22) * (1 + 0.24 * r('explode_damage'));
        this.explodeRadius = base.explodeRadius ?? 2.6;

        this.copyEnabled = r('copy_on') > 0;
        const copyRank = r('copy_power');
        this.copyDamageScale = copyRank <= 0 ? 0.3 : [0.3, 0.5, 0.7][Math.min(2, copyRank - 1)];
        this.copyInterval = base.copyInterval ?? 1.45;
    }

    update(dt, ctx) {
        this._cdRemaining = Math.max(0, this._cdRemaining - dt);

        for (let i = this.clones.length - 1; i >= 0; i--) {
            const clone = this.clones[i];
            clone.update(dt, ctx.enemies);
            if (!clone.alive) {
                clone.detach();
                this.clones.splice(i, 1);
            }
        }

        if (!this._autoCast || this._cdRemaining > 0) return;
        if (!this._hasEnemyNear(ctx.enemies)) return;
        this._cast();
    }

    aggroTargets() {
        return this.clones.filter((clone) => clone.alive);
    }

    _cast() {
        const activeSkill = this._copiedSkillId();
        for (let i = 0; i < this.count; i++) {
            const pos = this._spawnPosition(i, this.count);
            const clone = new DecoyClone({
                skill: this,
                index: i,
                position: pos,
                duration: this.duration,
                aggroWeight: this.aggroWeight,
                aggroRange: this.aggroRange,
                followPlayer: this.followPlayer,
                followSpeed: this.followSpeed,
                pulseEnabled: this.pulseEnabled,
                pulseDamage: this.pulseDamage * this._damageMul(),
                pulseRadius: this.pulseRadius,
                pulseInterval: this.pulseInterval,
                explodeEnabled: this.explodeEnabled,
                explodeDamage: this.explodeDamage * this._damageMul(),
                explodeRadius: this.explodeRadius,
                copyEnabled: this.copyEnabled,
                copySkillId: activeSkill,
                copyDamageScale: this.copyDamageScale,
                copyInterval: this.copyInterval,
            });
            clone.attach(this.game.worldRotator);
            this.clones.push(clone);
        }

        const maxClones = Math.max(this.count, CONFIG.decoy?.maxClones ?? 6);
        while (this.clones.length > maxClones) {
            this.clones.shift()?.expire();
        }

        this._cdRemaining = this.cooldown;
        this.player.motion?.bounce(0.75);
    }

    _spawnPosition(index, count) {
        const bearing = count <= 1 ? 0 : index / count * TAU;
        return this.game.surface.pointAtArcAndBearing(
            this.player.position,
            1.7 + 0.25 * Math.min(3, count),
            bearing,
            new THREE.Vector3(),
        );
    }

    _hasEnemyNear(enemies) {
        for (const enemy of enemies) {
            if (!enemy.alive || enemy.isHostileBuilding) continue;
            if (this.game.surface.arcDistance(enemy.position, this.player.position) <= this.aggroRange) return true;
        }
        return false;
    }

    _copiedSkillId() {
        if (!this.copyEnabled) return null;
        const candidates = this.game?.skillSystem?.skills
            ?.filter((skill) => !skill.isEmpty && skill.id !== this.id)
            ?.map((skill) => skill.id) ?? [];
        if (candidates.length === 0) return null;
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    _damageMul() {
        return this.game?.statsProgression?.damageMul?.() ?? 1;
    }

    getCooldownRemaining() { return this._cdRemaining; }
    getCooldownDuration() { return this.cooldown; }
    isEmphasis() { return this._autoCast; }
    activate() { this._autoCast = !this._autoCast; }

    resetRuntime() {
        this._cdRemaining = 0;
        for (const clone of this.clones) clone.detach();
        this.clones.length = 0;
    }
}

class DecoyClone {
    constructor(options) {
        Object.assign(this, options);
        this.surface = options.skill.game.surface;
        this.game = options.skill.game;
        this.player = options.skill.player;
        this.position = new THREE.Vector3().copy(options.position);
        this.forward = new THREE.Vector3().copy(this.player.forward);
        this.radius = CONFIG.player.radius ?? 0.4;
        this.alive = true;
        this._age = 0;
        this._pulseTimer = 0.1 + this.index * 0.12;
        this._copyTimer = this.copyInterval * (0.45 + this.index * 0.17);
        this._expired = false;
        this._copyEffects = [];
        this.group = new THREE.Group();
        this._body = null;
        this._halo = this._buildHalo();
        this.group.add(this._halo);
    }

    attach(parent) {
        parent.add(this.group);
        this._loadBody();
        this._refreshTransform();
    }

    detach() {
        if (this.group.parent) this.group.parent.remove(this.group);
        this.group.traverse((child) => {
            if (!child.isMesh) return;
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) {
                for (const mat of child.material) mat.dispose?.();
            } else {
                child.material?.dispose?.();
            }
        });
        for (const effect of this._copyEffects) effect.detach?.();
        this._copyEffects.length = 0;
    }

    async _loadBody() {
        const body = await loadGLB(CONFIG.player.modelPath);
        if (!this.alive) return;
        body.scale.setScalar(CONFIG.player.modelScale * 0.92);
        body.traverse((child) => {
            if (!child.isMesh) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            child.material = mats.map((mat) => {
                const clone = mat.clone();
                clone.transparent = true;
                clone.opacity = 0.42;
                if (clone.emissive) {
                    clone.emissive.set(0x66ccff);
                    clone.emissiveIntensity = 0.35;
                }
                return clone;
            });
            if (child.material.length === 1) child.material = child.material[0];
        });
        this._body = body;
        this.group.add(body);
        this._refreshTransform();
    }

    update(dt, enemies) {
        if (!this.alive) return;
        this._age += dt;

        if (this.followPlayer) this._follow(dt);
        this._updateCopyEffects(dt, enemies);

        if (this.pulseEnabled) {
            this._pulseTimer -= dt;
            if (this._pulseTimer <= 0) {
                this._pulseTimer += this.pulseInterval;
                this._damageAround(enemies, this.pulseRadius, this.pulseDamage);
                this._spawnBurst(this.pulseRadius, 0x83f5ff, 0.38);
            }
        }

        if (this.copyEnabled && this.copySkillId) {
            this._copyTimer -= dt;
            if (this._copyTimer <= 0) {
                this._copyTimer += this.copyInterval;
                this._castCopy(enemies);
            }
        }

        this._refreshTransform();
        if (this._age >= this.duration) this.expire(enemies);
    }

    takeDamage(amount) {
        this._age += amount / Math.max(1, CONFIG.enemy.contactDamage ?? 8) * 0.25;
    }

    expire(enemies = null) {
        if (this._expired) return;
        this._expired = true;
        if (this.explodeEnabled && enemies) {
            this._damageAround(enemies, this.explodeRadius, this.explodeDamage);
            this._spawnBurst(this.explodeRadius, 0xff7adf, 0.82);
        }
        this.alive = false;
    }

    _follow(dt) {
        const bearing = this.index * 2.2 + performance.now() / 1900;
        this.surface.pointAtArcAndBearing(this.player.position, 1.85, bearing, _followTarget);
        const dist = this.surface.arcDistance(this.position, _followTarget);
        if (dist <= 0.04) return;
        this.surface.tangentTo(this.position, _followTarget, _forward);
        this.surface.moveAlong(this.position, _forward, Math.min(dist, this.followSpeed * dt));
        if (_forward.lengthSq() > 1e-8) this.forward.copy(_forward);
    }

    _castCopy(enemies) {
        const target = this._nearestEnemy(enemies, 9.5);
        if (!target) return;

        if (this.copySkillId === 'firebomb') {
            this._spawnFirePatch(target.position, 11 * this.copyDamageScale);
        } else if (this.copySkillId === 'lightning') {
            this._spawnLightning(18 * this.copyDamageScale, 3.2);
        } else if (this.copySkillId === 'sword') {
            this._damageAround(enemies, 2.45, 22 * this.copyDamageScale);
            this._spawnBurst(2.45, 0xc9f7ff, 0.58);
        } else {
            this._damageAround(enemies, 2.8, 24 * this.copyDamageScale);
            this._spawnLightning(14 * this.copyDamageScale, 2.8);
        }
    }

    _spawnLightning(damage, radius) {
        const ring = new LightningRing({
            surface: this.surface,
            center: this.position.clone(),
            followTarget: null,
            radiusStart: 0.25,
            radiusEnd: radius,
            expandTime: 0.36,
            thickness: 0.48,
            damage,
            color: 0x88ddff,
            edgeColor: 0xffffff,
            bodyOpacity: 0.38,
            edgeOpacity: 0.78,
        });
        ring.attach(this.game.worldRotator);
        this._copyEffects.push(ring);
    }

    _spawnFirePatch(position, damage) {
        const patch = new FirePatch({
            surface: this.surface,
            position: position.clone(),
            radius: 1.35,
            damage,
            burnDamagePerSecond: 3 * this.copyDamageScale,
            burnDuration: 1.2,
            duration: 1.35,
            chainExplosionDamage: 0,
            chainExplosionRadius: 0,
        });
        patch.attach(this.game.worldRotator);
        this._copyEffects.push(patch);
    }

    _updateCopyEffects(dt, enemies) {
        for (let i = this._copyEffects.length - 1; i >= 0; i--) {
            const effect = this._copyEffects[i];
            effect.update(dt, enemies);
            if (!effect.alive) {
                effect.detach();
                this._copyEffects.splice(i, 1);
            }
        }
    }

    _damageAround(enemies, radius, damage) {
        if (damage <= 0) return;
        for (const enemy of enemies) {
            if (!enemy.alive || enemy.isHostileBuilding) continue;
            const bodyRadius = enemy.radius ?? 0;
            if (this.surface.arcDistance(enemy.position, this.position) <= radius + bodyRadius) {
                enemy.damage(damage, this.position);
            }
        }
    }

    _nearestEnemy(enemies, maxDist) {
        let best = null;
        let bestDist = maxDist;
        for (const enemy of enemies) {
            if (!enemy.alive || enemy.isHostileBuilding) continue;
            const dist = this.surface.arcDistance(enemy.position, this.position);
            if (dist < bestDist) {
                bestDist = dist;
                best = enemy;
            }
        }
        return best;
    }

    _buildHalo() {
        const mesh = new THREE.Mesh(
            new THREE.RingGeometry(0.55, 0.78, 36, 1),
            new THREE.MeshBasicMaterial({
                color: 0x76e7ff,
                transparent: true,
                opacity: 0.62,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        mesh.rotation.x = -Math.PI / 2;
        return mesh;
    }

    _spawnBurst(radius, color, opacity) {
        const burst = new THREE.Mesh(
            new THREE.RingGeometry(0.25, 1, 44, 1),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            }),
        );
        this.surface.orient(burst, this.position, this.forward);
        burst.position.addScaledVector(_up.copy(this.position).normalize(), CLONE_LIFT + 0.03);
        burst.scale.setScalar(radius);
        this.game.worldRotator.add(burst);

        const started = performance.now();
        const tick = () => {
            const t = (performance.now() - started) / 300;
            if (t >= 1) {
                burst.parent?.remove(burst);
                burst.geometry.dispose();
                burst.material.dispose();
                return;
            }
            burst.scale.setScalar(radius * (0.7 + t * 0.55));
            burst.material.opacity = opacity * (1 - t);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }

    _refreshTransform() {
        this.surface.orient(this.group, this.position, this.forward, CONFIG.player.modelYawOffset);
        this.group.position.addScaledVector(_up.copy(this.position).normalize(), CONFIG.player.modelLift + CLONE_LIFT);
        const pulse = 1 + Math.sin(performance.now() / 120 + this.index) * 0.06;
        this._halo.scale.setScalar(pulse);
        this._halo.material.opacity = 0.42 + 0.18 * Math.max(0, 1 - this._age / this.duration);
    }
}

const _up = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _followTarget = new THREE.Vector3();
