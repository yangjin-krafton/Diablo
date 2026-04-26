import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Skill } from './skill-base.js';
import { BlackHoleField } from '../combat/black-hole-field.js';

export class BlackHoleSkill extends Skill {
    static id = 'blackHole';
    static attackDirectionMode = 'moveDirection';
    static displayName = '블랙홀 자기장';
    static iconPath = './asset/black-hole-icon.svg';
    static description = '플레이어가 향하는 방향 앞에 적과 자원을 끌어당기는 작은 블랙홀을 생성합니다.';

    constructor(player, game) {
        super(player, game);
        this.fields = [];
        this._cdRemaining = 0;
        this._autoCast = true;
        this._nextSequenceDelay = 0;
        this._sequenceRemaining = 0;
        this.onNodeChanged();
    }

    getNodes() {
        return [
            { id: 'duration1', col: 0, row: 0, maxRank: 5, requires: [], name: '안정된 특이점', desc: '유지시간 +12%' },
            { id: 'duration2', col: 0, row: 1, maxRank: 3, requires: ['duration1'], name: '중력 고정', desc: '유지시간 +18%' },
            { id: 'cooldown', col: 0, row: 2, maxRank: 4, requires: ['duration2'], name: '재응축', desc: '재사용 대기시간 -8%' },
            { id: 'sequence_on', col: 0, row: 3, maxRank: 1, requires: ['cooldown'], name: '연속 붕괴', desc: '시전마다 블랙홀을 2개까지 순차 생성합니다.' },
            { id: 'sequence_more', col: 0, row: 4, maxRank: 1, requires: ['sequence_on'], name: '다중 특이점', desc: '순차 생성 수 +1, 동시에 더 많이 유지됩니다.' },

            { id: 'radius1', col: 1, row: 0, maxRank: 5, requires: [], name: '사건 지평선', desc: '흡입 범위 +10%' },
            { id: 'radius2', col: 1, row: 1, maxRank: 3, requires: ['radius1'], name: '광역 중력장', desc: '흡입 범위 +16%' },
            { id: 'pull', col: 1, row: 2, maxRank: 3, requires: ['radius2'], name: '강한 인력', desc: '끌어당기는 속도 +18%' },
            { id: 'placement', col: 1, row: 3, maxRank: 2, requires: ['pull'], name: '원거리 생성', desc: '생성 거리 +15%' },
            { id: 'resource_on', col: 1, row: 4, maxRank: 1, requires: ['placement'], name: '자원 포식', desc: '주변 자원 조각을 대신 흡수합니다.' },

            { id: 'pull_dmg', col: 2, row: 0, maxRank: 5, requires: [], name: '압축 피해', desc: '흡입 중 지속 피해 +14%' },
            { id: 'vulnerable_on', col: 2, row: 1, maxRank: 1, requires: ['pull_dmg'], name: '취약 노출', desc: '흡입 중인 적이 외부 공격 피해를 더 받습니다.' },
            { id: 'vulnerable', col: 2, row: 2, maxRank: 3, requires: ['vulnerable_on'], name: '방어 붕괴', desc: '취약 추가 피해 +12%' },
            { id: 'crush', col: 2, row: 3, maxRank: 3, requires: ['vulnerable'], name: '중력 압살', desc: '흡입 지속 피해 +22%' },
            { id: 'singularity', col: 2, row: 4, maxRank: 1, requires: ['crush'], name: '붕괴 핵', desc: '취약 피해와 흡입 피해가 크게 증가합니다.' },
        ];
    }

    getExpForLevel(level) {
        return Math.floor(40 * Math.pow(1.29, level - 1));
    }

    onNodeChanged() {
        const r = (id) => this.rankOf(id);
        const base = CONFIG.blackHole ?? {};

        this.duration = (base.duration ?? 3.1)
            * (1 + 0.12 * r('duration1') + 0.18 * r('duration2'));
        this.radius = (base.radius ?? 3.4)
            * (1 + 0.10 * r('radius1') + 0.16 * r('radius2'));
        this.cooldown = (base.cooldown ?? 4.4) * Math.max(0.35, 1 - 0.08 * r('cooldown'));
        this.placeDistance = (base.placeDistance ?? 4.2) * (1 + 0.15 * r('placement'));
        this.pullSpeed = (base.pullSpeed ?? 6.5) * (1 + 0.18 * r('pull'));

        const pullDamageMult = (1 + 0.14 * r('pull_dmg') + 0.22 * r('crush'))
            * (r('singularity') > 0 ? 1.35 : 1);
        this.pullDamagePerSecond = (base.pullDamagePerSecond ?? 3.5) * pullDamageMult;

        this.vulnerabilityMultiplier = r('vulnerable_on') > 0
            ? (1.18 + 0.12 * r('vulnerable')) * (r('singularity') > 0 ? 1.18 : 1)
            : 1;

        this.sequenceCount = r('sequence_on') > 0 ? 2 + (r('sequence_more') > 0 ? 1 : 0) : 1;
        this.sequenceInterval = base.sequenceInterval ?? 0.38;
        this.maxFields = Math.max(this.sequenceCount, base.maxFields ?? 1);
        this.resourceAbsorb = r('resource_on') > 0;
    }

    update(dt, ctx) {
        this._cdRemaining = Math.max(0, this._cdRemaining - dt);

        for (const enemy of ctx.enemies) {
            if (enemy.blackHoleDamageTakenMultiplier !== undefined) {
                enemy.blackHoleDamageTakenMultiplier = 1;
            }
        }

        for (let i = this.fields.length - 1; i >= 0; i--) {
            const field = this.fields[i];
            field.update(dt, ctx.enemies);
            if (!field.alive) {
                field.detach();
                this.fields.splice(i, 1);
            }
        }

        if (this._sequenceRemaining > 0) {
            this._nextSequenceDelay -= dt;
            while (this._sequenceRemaining > 0 && this._nextSequenceDelay <= 0) {
                this._spawnField(this._sequenceRemaining);
                this._sequenceRemaining--;
                this._nextSequenceDelay += this.sequenceInterval;
            }
        }

        if (!this._autoCast || this._cdRemaining > 0) return;
        if (!this._hasEnemyNear(ctx.enemies)) return;
        this._cast();
    }

    _cast() {
        this._spawnField(this.sequenceCount);
        this._sequenceRemaining = Math.max(0, this.sequenceCount - 1);
        this._nextSequenceDelay = this.sequenceInterval;
        this._cdRemaining = this.cooldown;
        this.player.motion?.bounce(0.7);
    }

    _spawnField(sequenceIndex = 1) {
        const position = this._fieldPosition(sequenceIndex);
        const field = new BlackHoleField({
            surface: this.game.surface,
            position,
            radius: this.radius,
            duration: this.duration,
            pullSpeed: this.pullSpeed,
            pullDamagePerSecond: this.pullDamagePerSecond * this._damageMul(),
            vulnerabilityMultiplier: this.vulnerabilityMultiplier,
            resourceAbsorb: this.resourceAbsorb,
            rewardMul: this.game?.tier?.rewardMul ?? 1,
            skillSystem: this.game?.skillSystem,
            homeController: this.game?.homeController,
            drops: this.game?.drops,
        });
        field.attach(this.game.worldRotator);
        this.fields.push(field);

        while (this.fields.length > this.maxFields) {
            const old = this.fields.shift();
            old?.detach?.();
        }
    }

    _fieldPosition(sequenceIndex) {
        const forward = _forward.copy(this.player.forward);
        this.game.surface.projectToTangent(this.player.position, forward, forward);
        if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);

        const pos = _position.copy(this.player.position);
        const offset = this.sequenceCount > 1
            ? (this.sequenceCount - sequenceIndex) * this.radius * 0.62
            : 0;
        this.game.surface.moveAlong(pos, forward, this.placeDistance + offset);
        return pos;
    }

    _hasEnemyNear(enemies) {
        const maxDist = this.placeDistance + this.radius + this._maxEnemyRadius(enemies);
        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            if (this.game.surface.arcDistance(enemy.position, this.player.position) <= maxDist) return true;
        }
        return false;
    }

    _maxEnemyRadius(enemies) {
        let max = CONFIG.enemy.radius ?? 0;
        for (const enemy of enemies) {
            if (enemy.alive) max = Math.max(max, enemy.radius ?? 0);
        }
        return max;
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
        this._sequenceRemaining = 0;
        this._nextSequenceDelay = 0;
        for (const field of this.fields) field.detach();
        this.fields.length = 0;
    }
}

const _forward = new THREE.Vector3();
const _position = new THREE.Vector3();
