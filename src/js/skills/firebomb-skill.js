import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Skill } from './skill-base.js';
import { FirebombGrenade, FirePatch } from '../combat/firebomb-grenade.js';

export class FirebombSkill extends Skill {
    static id = 'firebomb';
    static attackDirectionMode = 'nearestEnemy';
    static displayName = '화염병 수류탄';
    static iconPath = './asset/firebomb-icon.svg';
    static description = '가까운 적 방향으로 화염병을 던져 작은 폭발 피해와 일정 시간 연소 지역 피해를 줍니다.';

    constructor(player, game) {
        super(player, game);
        this.grenades = [];
        this.patches = [];
        this._autoCast = true;
        this._cdRemaining = 0;
        this.onNodeChanged();
    }

    getNodes() {
        return [
            { id: 'blast_dmg', col: 0, row: 0, maxRank: 5, requires: [], name: '강화 화약', desc: '즉발 폭발 피해 +12%' },
            { id: 'blast_radius', col: 0, row: 1, maxRank: 3, requires: ['blast_dmg'], name: '넓은 파편', desc: '폭발 범위 +10%' },
            { id: 'blast_focus', col: 0, row: 2, maxRank: 1, requires: ['blast_radius'], name: '고열 충격', desc: '폭발 피해 +35%' },
            { id: 'chain_on', col: 0, row: 3, maxRank: 1, requires: ['blast_focus'], name: '인화성 잔해', desc: '연소 피해로 죽은 적이 작게 폭발합니다.' },
            { id: 'chain_dmg', col: 0, row: 4, maxRank: 3, requires: ['chain_on'], name: '연쇄 폭발', desc: '2차 폭발 피해 +20%' },

            { id: 'range', col: 1, row: 0, maxRank: 4, requires: [], name: '투척 훈련', desc: '탐색 거리 +12%, 분산 -8%' },
            { id: 'cooldown', col: 1, row: 1, maxRank: 4, requires: ['range'], name: '빠른 장전', desc: '재사용 대기시간 -8%' },
            { id: 'accuracy', col: 1, row: 2, maxRank: 3, requires: ['cooldown'], name: '정확한 포물선', desc: '분산 -18%, 폭발 범위 +5%' },
            { id: 'multi_on', col: 1, row: 3, maxRank: 1, requires: ['accuracy'], name: '다발 투척', desc: '한 번에 3개를 던지지만 착탄 위치가 흩어집니다.' },
            { id: 'multi_more', col: 1, row: 4, maxRank: 1, requires: ['multi_on'], name: '화염비', desc: '다발 투척 수 +2, 분산이 더 커집니다.' },

            { id: 'burn_dmg', col: 2, row: 0, maxRank: 5, requires: [], name: '진한 연료', desc: '연소 피해 +14%' },
            { id: 'burn_time', col: 2, row: 1, maxRank: 3, requires: ['burn_dmg'], name: '끈적한 불길', desc: '연소 지속시간 +15%' },
            { id: 'patch_time', col: 2, row: 2, maxRank: 3, requires: ['burn_time'], name: '기름 웅덩이', desc: '연소 지역 지속시간 +18%' },
            { id: 'burn_spread', col: 2, row: 3, maxRank: 1, requires: ['patch_time'], name: '불씨 전이', desc: '연소 지역 범위 +20%, 연소 피해 +20%' },
            { id: 'burn_ult', col: 2, row: 4, maxRank: 1, requires: ['burn_spread'], name: '지옥불', desc: '연소 피해 +45%, 지역 지속시간 +25%' },
        ];
    }

    getExpForLevel(level) {
        return Math.floor(38 * Math.pow(1.29, level - 1));
    }

    onNodeChanged() {
        const r = (id) => this.rankOf(id);

        const blastMult = (1 + 0.12 * r('blast_dmg')) * (r('blast_focus') > 0 ? 1.35 : 1);
        const burnMult = (1 + 0.14 * r('burn_dmg')) * (r('burn_spread') > 0 ? 1.2 : 1) * (r('burn_ult') > 0 ? 1.45 : 1);
        const radiusMult = (1 + 0.10 * r('blast_radius') + 0.05 * r('accuracy')) * (r('burn_spread') > 0 ? 1.2 : 1);
        const rangeMult = 1 + 0.12 * r('range');
        const cooldownMult = Math.max(0.35, 1 - 0.08 * r('cooldown'));
        const burnTimeMult = 1 + 0.15 * r('burn_time');
        const patchTimeMult = (1 + 0.18 * r('patch_time')) * (r('burn_ult') > 0 ? 1.25 : 1);

        this.damage = CONFIG.firebomb.damage * blastMult;
        this.radius = CONFIG.firebomb.radius * radiusMult;
        this.burnDamagePerSecond = CONFIG.firebomb.burnDamagePerSecond * burnMult;
        this.burnDuration = CONFIG.firebomb.burnDuration * burnTimeMult;
        this.patchDuration = CONFIG.firebomb.patchDuration * patchTimeMult;
        this.range = CONFIG.firebomb.range * rangeMult;
        this.cooldown = CONFIG.firebomb.cooldown * cooldownMult;
        this.scatter = Math.max(0.2, CONFIG.firebomb.scatter * (1 - 0.08 * r('range') - 0.18 * r('accuracy')));
        this.grenadeCount = r('multi_on') > 0 ? 3 + (r('multi_more') > 0 ? 2 : 0) : 1;
        this.chainExplosionDamage = r('chain_on') > 0
            ? CONFIG.firebomb.chainExplosionDamage * (1 + 0.20 * r('chain_dmg'))
            : 0;
        this.chainExplosionRadius = CONFIG.firebomb.chainExplosionRadius;
    }

    update(dt, ctx) {
        this._cdRemaining = Math.max(0, this._cdRemaining - dt);

        for (let i = this.grenades.length - 1; i >= 0; i--) {
            const grenade = this.grenades[i];
            grenade.update(dt);
            if (!grenade.alive) {
                grenade.detach();
                this.grenades.splice(i, 1);
            }
        }

        for (let i = this.patches.length - 1; i >= 0; i--) {
            const patch = this.patches[i];
            patch.update(dt, ctx.enemies);
            if (!patch.alive) {
                patch.detach();
                this.patches.splice(i, 1);
            }
        }

        if (!this._autoCast || this._cdRemaining > 0) return;
        const target = this._nearestEnemyInRange(ctx.enemies);
        if (!target) return;
        this._throwAt(target);
    }

    _throwAt(target) {
        const baseTarget = target.position;
        const count = this.grenadeCount;
        const damageMul = this._damageMul();
        const multiScatter = count > 1 ? 1.55 + 0.18 * (count - 3) : 1;

        for (let i = 0; i < count; i++) {
            const targetPos = this._scatteredTarget(baseTarget, this.scatter * multiScatter, i, count);
            const grenade = new FirebombGrenade({
                surface: this.game.surface,
                start: this.player.position,
                target: targetPos,
                damage: this.damage * damageMul,
                radius: this.radius,
                burnDamagePerSecond: this.burnDamagePerSecond * damageMul,
                burnDuration: this.burnDuration,
                patchDuration: this.patchDuration,
                chainExplosionDamage: this.chainExplosionDamage * damageMul,
                chainExplosionRadius: this.chainExplosionRadius,
                onImpact: (g) => this._createPatch(g),
            });
            grenade.attach(this.game.worldRotator);
            this.grenades.push(grenade);
        }

        this.player.motion?.bounce(0.85);
        this._cdRemaining = this.cooldown;
    }

    _createPatch(grenade) {
        const patch = new FirePatch({
            surface: this.game.surface,
            position: grenade.target,
            radius: grenade.radius,
            damage: grenade.damage,
            burnDamagePerSecond: grenade.burnDamagePerSecond,
            burnDuration: grenade.burnDuration,
            duration: grenade.patchDuration,
            chainExplosionDamage: grenade.chainExplosionDamage,
            chainExplosionRadius: grenade.chainExplosionRadius,
        });
        patch.attach(this.game.worldRotator);
        this.patches.push(patch);
    }

    _scatteredTarget(center, scatter, index, count) {
        if (scatter <= 0.001) return _target.copy(center);
        const amount = count === 1 ? Math.random() * scatter : scatter * (0.35 + Math.random() * 0.65);
        const bearing = count === 1
            ? Math.random() * Math.PI * 2
            : (Math.PI * 2 * index / count) + (Math.random() - 0.5) * 0.9;
        return this.game.surface.pointAtArcAndBearing(center, amount, bearing, new THREE.Vector3());
    }

    _nearestEnemyInRange(enemies) {
        const surface = this.game.surface;
        let best = null;
        let bestD = this.range + this._maxEnemyRadius(enemies);
        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const d = surface.arcDistance(enemy.position, this.player.position);
            const bodyRadius = enemy.radius ?? CONFIG.enemy.radius ?? 0;
            if (d <= this.range + bodyRadius && d < bestD) {
                best = enemy;
                bestD = d;
            }
        }
        return best;
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
        for (const grenade of this.grenades) grenade.detach();
        this.grenades.length = 0;
        for (const patch of this.patches) patch.detach();
        this.patches.length = 0;
    }
}

const _target = new THREE.Vector3();
