// Sword: automatic melee attack with a trainable skill tree.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Skill } from './skill-base.js';
import { SwordSwing } from '../combat/sword-swing.js';
import { SwordBeam } from '../combat/sword-beam.js';

export class SwordSkill extends Skill {
    static id = 'sword';
    static displayName = '검술';
    static iconPath = './asset/icon.svg';
    static description = '전방 반원 범위의 적에게 근접 피해를 줍니다. 범위 확장, 연속 공격, 치명타, 공격 속도, 검기를 강화할 수 있습니다.';

    constructor(player, game) {
        super(player, game);

        this.swing = new SwordSwing(game.surface);
        this.swing.attach(game.worldRotator);
        this.beams = [];
        this._comboMap = new Map();

        this._autoCast = true;
        this._cdRemaining = 0;

        this.onNodeChanged();
    }

    getNodes() {
        return [
            { id: 'arc1', col: 0, row: 0, maxRank: 3, requires: [], name: '범위 확장 I', desc: '랭크마다 공격 각도 +15도' },
            { id: 'arc2', col: 0, row: 1, maxRank: 3, requires: ['arc1'], name: '범위 확장 II', desc: '랭크마다 공격 각도 +20도' },
            { id: 'arc_full', col: 0, row: 2, maxRank: 1, requires: ['arc2'], name: '전방위 회전', desc: '공격 각도가 360도가 됩니다.' },
            { id: 'whirl_dmg', col: 0, row: 3, maxRank: 3, requires: ['arc_full'], name: '회오리 위력', desc: '360도 공격 상태에서 랭크마다 피해 +15%' },
            { id: 'whirl_act', col: 0, row: 4, maxRank: 1, requires: ['whirl_dmg'], name: '소용돌이 베기', desc: '공격 속도 2배, 피해 +30%, 계속 회전하며 공격합니다.' },

            { id: 'edge', col: 1, row: 0, maxRank: 5, requires: [], name: '날 세우기', desc: '랭크마다 피해 +10%' },
            { id: 'reach', col: 1, row: 1, maxRank: 3, requires: ['edge'], name: '사거리 연장', desc: '랭크마다 근접 사거리 +10%' },
            { id: 'combo_on', col: 1, row: 2, maxRank: 1, requires: ['reach'], name: '연속 추적', desc: '같은 적을 연속으로 맞히면 콤보를 쌓습니다.' },
            { id: 'combo_boost', col: 1, row: 3, maxRank: 3, requires: ['combo_on'], name: '콤보 폭발', desc: '2연속 이상 적중 시 랭크마다 피해 +25%, 치명 확률 +15%' },
            { id: 'combo_ult', col: 1, row: 4, maxRank: 1, requires: ['combo_boost'], name: '처형', desc: '3연속 이상 적중 시 치명타가 확정되고 피해가 2배가 됩니다.' },

            { id: 'speed', col: 2, row: 0, maxRank: 4, requires: [], name: '민첩', desc: '랭크마다 공격 재사용 대기시간 -8%' },
            { id: 'beam_on', col: 2, row: 1, maxRank: 1, requires: ['speed'], name: '검기 발사', desc: '근접 공격 때 전방으로 검기를 발사합니다.' },
            { id: 'beam_pierce', col: 2, row: 2, maxRank: 3, requires: ['beam_on'], name: '검기 관통', desc: '랭크마다 검기 관통 횟수 +1' },
            { id: 'beam_dmg', col: 2, row: 3, maxRank: 3, requires: ['beam_pierce'], name: '검기 강화', desc: '랭크마다 검기 피해 +20%' },
            { id: 'beam_ult', col: 2, row: 4, maxRank: 1, requires: ['beam_dmg'], name: '비검', desc: '검기 사거리 2배, 검기 피해 1.5배' },
        ];
    }

    getExpForLevel(level) {
        return Math.floor(35 * Math.pow(1.28, level - 1));
    }

    onNodeChanged() {
        const r = (id) => this.rankOf(id);

        const arcAddDeg = 15 * r('arc1') + 20 * r('arc2');
        const arcFull = r('arc_full') > 0;
        const arcDeg = arcFull ? 360 : 180 + arcAddDeg;
        this.arc = arcDeg * Math.PI / 180;
        const whirlDmgMult = arcFull ? (1 + 0.15 * r('whirl_dmg')) : 1;
        const whirlActive = r('whirl_act') > 0;

        const edgeMult = 1 + 0.10 * r('edge');
        const reachMult = 1 + 0.10 * r('reach');
        this.comboTrackEnabled = r('combo_on') > 0;
        this.comboDmgMult = 1 + 0.25 * r('combo_boost');
        this.comboCritBonus = 0.15 * r('combo_boost');
        this.comboUltUnlocked = r('combo_ult') > 0;

        const speedMult = Math.max(0.2, 1 - 0.08 * r('speed'));
        this.beamUnlocked = r('beam_on') > 0;
        this.beamPierce = 1 + r('beam_pierce');
        this.beamDmgMult = (1 + 0.20 * r('beam_dmg')) * (r('beam_ult') > 0 ? 1.5 : 1);
        this.beamRangeMult = r('beam_ult') > 0 ? 2 : 1;
        this.beamRange = CONFIG.sword.range * 2.5 * this.beamRangeMult;

        this.damage = CONFIG.sword.damage * edgeMult * whirlDmgMult * (whirlActive ? 1.3 : 1);
        this.range = CONFIG.sword.range * reachMult;
        this.cooldown = CONFIG.sword.swingCooldown * speedMult * (whirlActive ? 0.5 : 1);
        this.critChance = 0;
    }

    update(dt, ctx) {
        this._cdRemaining = Math.max(0, this._cdRemaining - dt);
        this.swing.update(dt);

        if (this._comboMap.size > 0) {
            for (const enemy of this._comboMap.keys()) {
                if (!enemy.alive) this._comboMap.delete(enemy);
            }
        }

        for (let i = this.beams.length - 1; i >= 0; i--) {
            const b = this.beams[i];
            b.update(dt, ctx.enemies);
            if (!b.alive) {
                b.detach();
                this.beams.splice(i, 1);
            }
        }

        if (!this._autoCast) return;
        if (this._cdRemaining > 0) return;

        const target = this._nearestEnemyInRange(ctx.enemies);
        if (!target) return;

        this._fire(ctx.enemies);
    }

    _fire(enemies) {
        const pos = this.player.position;
        const forward = this.player.forward;
        const hitSet = this._resolveHits(enemies);

        if (this.comboTrackEnabled) {
            for (const enemy of Array.from(this._comboMap.keys())) {
                if (!hitSet.has(enemy)) this._comboMap.delete(enemy);
            }
            for (const e of hitSet) {
                this._comboMap.set(e, (this._comboMap.get(e) ?? 0) + 1);
            }
        }

        this.swing.trigger(pos, forward, [], {
            damage: 0,
            range: this.range,
            arcAngle: this.arc,
            critChance: 0,
        });

        if (this.beamUnlocked) {
            const beam = new SwordBeam({
                surface: this.game.surface,
                position: pos,
                forward,
                damage: this.damage * this.beamDmgMult,
                critChance: 0,
                range: this.beamRange,
                pierce: this.beamPierce,
            });
            beam.attach(this.game.worldRotator);
            this.beams.push(beam);
        }

        this._cdRemaining = this.cooldown;
    }

    _resolveHits(enemies) {
        const pos = this.player.position;
        const forward = this.player.forward;
        const halfArc = this.arc / 2;
        const rangeSq = this.range * this.range;
        _up.copy(pos).normalize();

        const hitSet = new Set();
        for (const e of enemies) {
            if (!e.alive) continue;
            _dv.subVectors(e.position, pos);
            _tan.copy(_dv).addScaledVector(_up, -_dv.dot(_up));
            const distSq = _tan.lengthSq();
            if (distSq > rangeSq) continue;
            let inArc = false;
            const dist = Math.sqrt(distSq);
            if (dist < 1e-4) {
                inArc = true;
            } else {
                const cos = forward.dot(_tan) / dist;
                const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
                inArc = ang <= halfArc;
            }
            if (!inArc) continue;

            const newCombo = (this._comboMap.get(e) ?? 0) + 1;
            let dmg = this.damage;
            let crit = this.critChance;
            if (this.comboTrackEnabled && newCombo >= 2) {
                dmg *= this.comboDmgMult;
                crit += this.comboCritBonus;
            }
            let forceCrit = false;
            if (this.comboUltUnlocked && newCombo >= 3) {
                forceCrit = true;
                dmg *= 2;
            }
            const isCrit = forceCrit || Math.random() < crit;
            e.damage(isCrit ? dmg * 2 : dmg);
            hitSet.add(e);
        }
        return hitSet;
    }

    _nearestEnemyInRange(enemies) {
        const surface = this.game.surface;
        const maxDist = this.range + CONFIG.enemy.radius;
        let best = null;
        let bestD = maxDist;
        for (const e of enemies) {
            if (!e.alive) continue;
            const d = surface.arcDistance(e.position, this.player.position);
            if (d < bestD) {
                bestD = d;
                best = e;
            }
        }
        return best;
    }

    getCooldownRemaining() { return this._cdRemaining; }
    getCooldownDuration() { return this.cooldown; }
    isEmphasis() { return this._autoCast; }
    activate() { this._autoCast = !this._autoCast; }

    resetRuntime() {
        this._cdRemaining = 0;
        this.swing._active = false;
        this.swing._timer = 0;
        this.swing.mesh.visible = false;
        this._comboMap.clear();
        for (const b of this.beams) b.detach();
        this.beams.length = 0;
    }
}

const _up = new THREE.Vector3();
const _dv = new THREE.Vector3();
const _tan = new THREE.Vector3();
