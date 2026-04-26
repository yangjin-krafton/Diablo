// Lightning Ring: emits an expanding electric ring centered on the player.
// Three-branch tree:
//   A (col 0) — 강화: more damage and a damage-burst ult that fires multiple
//               rings per cast.
//   B (col 1) — 빈도: faster cooldown, larger / faster rings, and a placement
//               ult that anchors rings in world space (don't follow the player).
//   C (col 2) — 연쇄: chain branch — hit enemies have a chance to spawn a
//               smaller ring on themselves; ult lets chain rings re-chain once.

import { CONFIG } from '../config.js';
import { Skill } from './skill-base.js';
import { LightningRing } from '../combat/lightning-ring.js';

const CHAIN_DEPTH_LIMIT = 2;

export class LightningRingSkill extends Skill {
    static id = 'lightning';
    static displayName = '전기 링';
    static iconPath = './asset/lightning-icon.svg';
    static description = '플레이어 중심으로 전기 링을 방출해 지나치는 적에게 피해를 줍니다. 강화 / 빈도 / 연쇄 분기로 강화할 수 있습니다.';

    constructor(player, game) {
        super(player, game);

        this.rings = [];
        this._burstQueue = [];
        this._cdRemaining = 0;
        this._autoCast = true;
        this.onNodeChanged();
    }

    getNodes() {
        return [
            // Path A — Damage
            { id: 'volt1', col: 0, row: 0, maxRank: 5, requires: [],         name: '전압 증폭',   desc: '랭크마다 피해 +12%' },
            { id: 'volt2', col: 0, row: 1, maxRank: 3, requires: ['volt1'],  name: '충격 강화',   desc: '랭크마다 피해 +20%' },
            { id: 'aura',  col: 0, row: 2, maxRank: 3, requires: ['volt2'],  name: '두꺼운 전류', desc: '랭크마다 링 적중 두께 +18%' },
            { id: 'crit',  col: 0, row: 3, maxRank: 3, requires: ['aura'],   name: '임팩트',      desc: '랭크마다 치명 확률 +10%' },
            { id: 'multi', col: 0, row: 4, maxRank: 1, requires: ['crit'],   name: '다중 방출',   desc: '한 번 시전 시 3개의 링이 빠르게 연속 방출됩니다. (각 링 피해 50%)' },

            // Path B — Hit Rate
            { id: 'cd',     col: 1, row: 0, maxRank: 4, requires: [],          name: '가속 충전',  desc: '랭크마다 재사용 대기시간 -10%' },
            { id: 'range',  col: 1, row: 1, maxRank: 3, requires: ['cd'],      name: '확장 반경',  desc: '랭크마다 링 최대 반경 +18%' },
            { id: 'speed',  col: 1, row: 2, maxRank: 3, requires: ['range'],   name: '빠른 펄스',  desc: '랭크마다 확산 속도 +15%' },
            { id: 'double', col: 1, row: 3, maxRank: 1, requires: ['speed'],   name: '두 번 적중', desc: '같은 적이 링에 두 번 적중할 수 있습니다.' },
            { id: 'static', col: 1, row: 4, maxRank: 1, requires: ['double'],  name: '정적 패턴',  desc: '링이 시전 위치에 남아 더 오래 유지되며, 플레이어를 따라가지 않습니다.' },

            // Path C — Chain
            { id: 'chain_on',     col: 2, row: 0, maxRank: 1, requires: [],               name: '분기 방전',   desc: '적중한 적은 25% 확률로 자기 위치에 작은 전기 링을 생성합니다.' },
            { id: 'chain_chance', col: 2, row: 1, maxRank: 3, requires: ['chain_on'],     name: '분기 가능성', desc: '랭크마다 분기 확률 +15%' },
            { id: 'chain_dmg',    col: 2, row: 2, maxRank: 3, requires: ['chain_chance'], name: '잔류 전류',   desc: '랭크마다 분기 링 피해 +25%' },
            { id: 'chain_size',   col: 2, row: 3, maxRank: 3, requires: ['chain_dmg'],    name: '확산 방전',   desc: '랭크마다 분기 링 반경 +12%' },
            { id: 'chain_self',   col: 2, row: 4, maxRank: 1, requires: ['chain_size'],   name: '연쇄 자생',   desc: '분기 링도 50% 확률로 다시 분기를 일으킵니다.' },
        ];
    }

    getExpForLevel(level) {
        return Math.floor(35 * Math.pow(1.28, level - 1));
    }

    onNodeChanged() {
        const r = (id) => this.rankOf(id);
        const base = CONFIG.lightning ?? {};

        const dmgMult = (1 + 0.12 * r('volt1')) * (1 + 0.20 * r('volt2'));
        this.damage = (base.damage ?? 18) * dmgMult;
        this.thickness = (base.thickness ?? 0.55) * (1 + 0.18 * r('aura'));
        this.critChance = 0.10 * r('crit');

        this.multiUnlocked = r('multi') > 0;
        this.multiCount = this.multiUnlocked ? 3 : 1;
        this.multiDamageScale = this.multiUnlocked ? 0.5 : 1;
        this.multiInterval = 0.08;

        this.cooldown = (base.cooldown ?? 1.2) * Math.max(0.2, 1 - 0.10 * r('cd'));
        this.maxRadius = (base.maxRadius ?? 4.5) * (1 + 0.18 * r('range'));
        this.expandTime = (base.expandTime ?? 0.5) / (1 + 0.15 * r('speed'));
        this.canHitTwice = r('double') > 0;

        // Static placement: ring stays at cast position and holds at max
        // radius for a moment so enemies walking in still get hit.
        this.staticMode = r('static') > 0;
        this.staticHoldTime = this.staticMode ? 0.5 : 0;

        // Chain branch
        this.chainEnabled = r('chain_on') > 0;
        this.chainProbability = this.chainEnabled
            ? Math.min(0.95, 0.25 + 0.15 * r('chain_chance'))
            : 0;
        this.chainDamageScale = 0.5 * (1 + 0.25 * r('chain_dmg'));
        this.chainRadiusScale = 0.4 * (1 + 0.12 * r('chain_size'));
        this.chainSelfChance = r('chain_self') > 0 ? 0.5 : 0;
    }

    update(dt, ctx) {
        this._cdRemaining = Math.max(0, this._cdRemaining - dt);

        for (let i = this._burstQueue.length - 1; i >= 0; i--) {
            const entry = this._burstQueue[i];
            entry.t -= dt;
            if (entry.t <= 0) {
                this._spawnRing(entry.params);
                this._burstQueue.splice(i, 1);
            }
        }

        for (let i = this.rings.length - 1; i >= 0; i--) {
            const ring = this.rings[i];
            ring.update(dt, ctx.enemies);
            if (!ring.alive) {
                ring.detach();
                this.rings.splice(i, 1);
            }
        }

        if (!this._autoCast) return;
        if (this._cdRemaining > 0) return;
        if (!this._anyEnemyInRange(ctx.enemies)) return;

        this._fire();
        this._cdRemaining = this.cooldown;
    }

    _anyEnemyInRange(enemies) {
        const max = this.maxRadius * 1.2;
        const center = this.player.position;
        const surface = this.game.surface;
        for (const e of enemies) {
            if (!e.alive) continue;
            if (surface.arcDistance(e.position, center) <= max) return true;
        }
        return false;
    }

    _fire() {
        const center = this.player.position.clone();
        for (let i = 0; i < this.multiCount; i++) {
            const params = {
                center: center.clone(),
                damage: this.damage * this.multiDamageScale,
                chainDepth: 0,
            };
            if (i === 0) {
                this._spawnRing(params);
            } else {
                this._burstQueue.push({ t: this.multiInterval * i, params });
            }
        }
        this.player.motion?.bounce(0.7);
    }

    _spawnRing(params) {
        const ring = new LightningRing({
            surface: this.game.surface,
            center: params.center,
            followTarget: this.staticMode ? null : this.player,
            radiusStart: 0.3,
            radiusEnd: this.maxRadius,
            expandTime: this.expandTime,
            holdTime: this.staticHoldTime,
            thickness: this.thickness,
            damage: params.damage * this._damageMul(),
            critChance: this.critChance,
            canHitTwice: this.canHitTwice,
            onHit: (enemy) => this._onRingHit(enemy, params),
        });
        ring.attach(this.game.worldRotator);
        this.rings.push(ring);
    }

    _onRingHit(enemy, params) {
        if (!this.chainEnabled) return;
        const depth = params.chainDepth ?? 0;
        if (depth >= CHAIN_DEPTH_LIMIT) return;

        const prob = depth === 0 ? this.chainProbability : this.chainSelfChance;
        if (prob <= 0) return;
        if (Math.random() >= prob) return;

        const chainRadius = Math.max(1.0, this.maxRadius * this.chainRadiusScale);
        const chainRing = new LightningRing({
            surface: this.game.surface,
            center: enemy.position.clone(),
            followTarget: null,
            radiusStart: 0.2,
            radiusEnd: chainRadius,
            expandTime: this.expandTime * 0.7,
            holdTime: 0,
            thickness: this.thickness * 0.85,
            damage: this.damage * this.chainDamageScale * this._damageMul(),
            critChance: this.critChance * 0.5,
            color: 0xb9ffff,
            edgeColor: 0xffffff,
            bodyOpacity: 0.5,
            edgeOpacity: 0.85,
            canHitTwice: false,
            onHit: (next) => this._onRingHit(next, { ...params, chainDepth: depth + 1 }),
        });
        chainRing.attach(this.game.worldRotator);
        this.rings.push(chainRing);
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
        this._burstQueue.length = 0;
        for (const r of this.rings) r.detach();
        this.rings.length = 0;
    }
}
