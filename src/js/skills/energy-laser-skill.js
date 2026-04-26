// Energy Laser: hit-scan straight beam fired along the player's aim. Three
// branches:
//   A (col 0) — 출력: more damage, crit, and a pierce ult that lets the beam
//               hit multiple enemies in line (eventually with no falloff).
//   B (col 1) — 적종: cooldown / range / thickness, and a bounce ult that
//               redirects the beam toward more enemies after each hit.
//   C (col 2) — 화염 연동: applies a fire DoT to hit enemies, with an ult
//               that fires multiple beams in a fan so several enemies ignite
//               per cast.
//
// Burn DoT is owned by this skill (this._burning Map) — the laser only flags
// hit enemies; the per-tick damage is applied here so it can survive even if
// the laser flash mesh has expired.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Skill } from './skill-base.js';
import { EnergyLaser } from '../combat/energy-laser.js';

export class EnergyLaserSkill extends Skill {
    static id = 'laser';
    static attackDirectionMode = 'nearestEnemy';
    static displayName = '에너지 레이저';
    static iconPath = './asset/laser-icon.svg';
    static description = '플레이어로부터 일직선으로 에너지 빔을 발사해 적중 적에게 즉시 피해를 줍니다. 출력 / 적종 / 화염 연동 분기로 강화할 수 있습니다.';

    constructor(player, game) {
        super(player, game);

        this.lasers = [];
        this._burning = new Map();
        this._cdRemaining = 0;
        this._autoCast = true;
        this.onNodeChanged();
    }

    getNodes() {
        return [
            // Path A — Damage + Pierce ult
            { id: 'power1',       col: 0, row: 0, maxRank: 5, requires: [],              name: '출력 증폭',   desc: '랭크마다 피해 +12%' },
            { id: 'power2',       col: 0, row: 1, maxRank: 3, requires: ['power1'],      name: '집속 강화',   desc: '랭크마다 피해 +20%' },
            { id: 'crit',         col: 0, row: 2, maxRank: 3, requires: ['power2'],      name: '정밀 조준',   desc: '랭크마다 치명 확률 +10%' },
            { id: 'pierce_count', col: 0, row: 3, maxRank: 4, requires: ['crit'],        name: '관통',        desc: '랭크마다 관통 +1, 관통당 피해 차감 30/24/18/12%' },
            { id: 'pierce_full',  col: 0, row: 4, maxRank: 1, requires: ['pierce_count'], name: '일관 사출',  desc: '관통당 피해 차감이 사라지고 관통 +1' },

            // Path B — Hit Rate + Bounce ult
            { id: 'cd',           col: 1, row: 0, maxRank: 4, requires: [],              name: '가속 충전',   desc: '랭크마다 재사용 대기시간 -10%' },
            { id: 'range',        col: 1, row: 1, maxRank: 3, requires: ['cd'],          name: '사거리 연장', desc: '랭크마다 빔 사거리 +20%' },
            { id: 'width',        col: 1, row: 2, maxRank: 3, requires: ['range'],       name: '광역 빔',     desc: '랭크마다 빔 적중 두께 +15%' },
            { id: 'bounce_count', col: 1, row: 3, maxRank: 4, requires: ['width'],       name: '도탄',        desc: '랭크마다 도탄 +1, 도탄당 피해 차감 25/20/15/10%' },
            { id: 'bounce_full',  col: 1, row: 4, maxRank: 1, requires: ['bounce_count'], name: '영구 도탄',  desc: '도탄 피해 차감이 사라지고 도탄 +1' },

            // Path C — Fire Chain + Multi-beam ult
            { id: 'burn_on',     col: 2, row: 0, maxRank: 1, requires: [],              name: '점화',        desc: '적중한 적이 일정 시간 화염 피해를 받습니다.' },
            { id: 'burn_dmg',    col: 2, row: 1, maxRank: 3, requires: ['burn_on'],     name: '점화 위력',   desc: '랭크마다 화염 지속피해 +20%' },
            { id: 'burn_time',   col: 2, row: 2, maxRank: 3, requires: ['burn_dmg'],    name: '잔불',        desc: '랭크마다 화염 지속시간 +20%' },
            { id: 'burn_spread', col: 2, row: 3, maxRank: 3, requires: ['burn_time'],   name: '화염 전이',   desc: '랭크마다 점화된 적이 죽을 때 주변 적에게 화염을 옮길 확률 +20%' },
            { id: 'multi_beam',  col: 2, row: 4, maxRank: 1, requires: ['burn_spread'], name: '다중 빔',     desc: '한 번 시전 시 3줄의 빔이 부채꼴로 발사됩니다. (각 빔 피해 60%)' },
        ];
    }

    getExpForLevel(level) {
        return Math.floor(38 * Math.pow(1.29, level - 1));
    }

    onNodeChanged() {
        const r = (id) => this.rankOf(id);
        const base = CONFIG.laser ?? {};

        const dmgMult = (1 + 0.12 * r('power1')) * (1 + 0.20 * r('power2'));
        this.damage = (base.damage ?? 28) * dmgMult;
        this.critChance = 0.10 * r('crit');

        // Pierce
        const pierceRank = r('pierce_count');
        this.pierceCount = pierceRank + (r('pierce_full') > 0 ? 1 : 0);
        if (r('pierce_full') > 0) {
            this.pierceFalloff = 0;
        } else if (pierceRank > 0) {
            // 30 / 24 / 18 / 12 % per pierce as rank grows
            this.pierceFalloff = Math.max(0, 0.30 - 0.06 * (pierceRank - 1));
        } else {
            this.pierceFalloff = 0;
        }

        // Hit rate
        this.cooldown = (base.cooldown ?? 1.6) * Math.max(0.2, 1 - 0.10 * r('cd'));
        this.range = (base.range ?? 12) * (1 + 0.20 * r('range'));
        this.thickness = (base.thickness ?? 0.45) * (1 + 0.15 * r('width'));

        // Bounce
        const bounceRank = r('bounce_count');
        this.bounceCount = bounceRank + (r('bounce_full') > 0 ? 1 : 0);
        if (r('bounce_full') > 0) {
            this.bounceFalloff = 0;
        } else if (bounceRank > 0) {
            // 25 / 20 / 15 / 10 % per bounce as rank grows
            this.bounceFalloff = Math.max(0, 0.25 - 0.05 * (bounceRank - 1));
        } else {
            this.bounceFalloff = 0;
        }

        // Burn
        this.burnEnabled = r('burn_on') > 0;
        this.burnDPS = (base.burnDamagePerSecond ?? 5) * (1 + 0.20 * r('burn_dmg'));
        this.burnDuration = (base.burnDuration ?? 2.0) * (1 + 0.20 * r('burn_time'));
        this.burnSpreadChance = 0.20 * r('burn_spread');
        this.burnSpreadRadius = base.burnSpreadRadius ?? 2.5;

        // Multi-beam
        this.multiBeamUnlocked = r('multi_beam') > 0;
        this.multiBeamCount = this.multiBeamUnlocked ? 3 : 1;
        this.multiBeamDamageScale = this.multiBeamUnlocked ? 0.6 : 1;
        this.multiBeamSpread = base.multiBeamSpread ?? 0.18;
    }

    update(dt, ctx) {
        this._cdRemaining = Math.max(0, this._cdRemaining - dt);

        for (let i = this.lasers.length - 1; i >= 0; i--) {
            const laser = this.lasers[i];
            laser.update(dt);
            if (!laser.alive) {
                laser.detach();
                this.lasers.splice(i, 1);
            }
        }

        if (this._burning.size > 0) this._tickBurns(dt, ctx.enemies);

        if (!this._autoCast || this._cdRemaining > 0) return;
        const target = this._nearestEnemyInRange(ctx.enemies);
        if (!target) return;
        this._fire(ctx.enemies, target);
    }

    _fire(enemies, target) {
        const origin = this.player.position;
        const baseDir = _aimForward;
        this.game.surface.tangentTo(origin, target.position, baseDir);
        if (baseDir.lengthSq() < 1e-8) baseDir.copy(this.player.forward);
        const damageMul = this._damageMul();

        const count = this.multiBeamCount;
        const spread = this.multiBeamSpread;
        const damagePerBeam = this.damage * this.multiBeamDamageScale * damageMul;

        for (let i = 0; i < count; i++) {
            const offset = count === 1 ? 0 : -spread + (2 * spread * i) / (count - 1);
            const dir = this._rotateAroundUp(baseDir, origin, offset);
            const laser = new EnergyLaser({
                surface: this.game.surface,
                origin,
                direction: dir,
                range: this.range,
                thickness: this.thickness,
                damage: damagePerBeam,
                critChance: this.critChance,
                pierceCount: this.pierceCount,
                pierceFalloff: this.pierceFalloff,
                bounceCount: this.bounceCount,
                bounceRange: 6.5,
                bounceFalloff: this.bounceFalloff,
                onHit: (enemy) => this._onLaserHit(enemy),
                enemies,
            });
            laser.attach(this.game.worldRotator);
            this.lasers.push(laser);
        }

        this.player.motion?.bounce(0.6);
        this._cdRemaining = this.cooldown;
    }

    _onLaserHit(enemy) {
        if (!this.burnEnabled || !enemy.alive) return;
        this._igniteEnemy(enemy, 0);
    }

    _igniteEnemy(enemy, depth) {
        const durationScale = depth > 0 ? 0.7 : 1;
        const prev = this._burning.get(enemy);
        const newRemaining = this.burnDuration * durationScale;
        if (prev && prev.remaining > newRemaining) {
            prev.dps = Math.max(prev.dps, this.burnDPS);
            return;
        }
        this._burning.set(enemy, {
            dps: this.burnDPS,
            remaining: newRemaining,
            depth,
        });
    }

    _tickBurns(dt, enemies) {
        for (const [enemy, info] of Array.from(this._burning.entries())) {
            if (!enemy.alive) {
                this._burning.delete(enemy);
                continue;
            }
            const wasAlive = enemy.alive;
            enemy.damage(info.dps * dt, this.player.position);
            info.remaining -= dt;
            if (wasAlive && !enemy.alive && this.burnSpreadChance > 0 && info.depth < 1) {
                this._spreadBurnFromDeath(enemy, enemies, info);
            }
            if (info.remaining <= 0 || !enemy.alive) {
                this._burning.delete(enemy);
            }
        }
    }

    _spreadBurnFromDeath(deadEnemy, enemies, info) {
        const surface = this.game.surface;
        const radius = this.burnSpreadRadius;
        for (const e of enemies) {
            if (!e.alive || e === deadEnemy) continue;
            if (this._burning.has(e)) continue;
            const d = surface.arcDistance(e.position, deadEnemy.position);
            const bodyR = e.radius ?? 0;
            if (d > radius + bodyR) continue;
            if (Math.random() >= this.burnSpreadChance) continue;
            this._igniteEnemy(e, info.depth + 1);
        }
    }

    _rotateAroundUp(direction, position, angle) {
        if (Math.abs(angle) < 1e-6) return direction.clone();
        _up.copy(position).normalize();
        return direction.clone().applyAxisAngle(_up, angle);
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
        this._burning.clear();
        for (const l of this.lasers) l.detach();
        this.lasers.length = 0;
    }
}

const _aimForward = new THREE.Vector3();
const _up = new THREE.Vector3();
