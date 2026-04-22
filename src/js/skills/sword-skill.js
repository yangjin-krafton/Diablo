// Sword: 근접 자동 공격. 트리가 세 갈래로 뻗어 각기 다른 전투 스타일.
//
//   [col 0] 광역/회오리  — 공격 각도 180° → 360° 로 확장되고, 소용돌이
//                         베기가 풀리면 공격 속도 ×2 + 피해 +30% 로
//                         야만용사 회오리처럼 돌아다니며 공격.
//
//   [col 1] 콤보/치명    — 같은 적을 연속으로 때리면 2연타부터 피해 +,
//                         치명 확률 + 이 붙음. 3연타 궁극기는 치명 확정
//                         + 피해 2배.
//
//   [col 2] 공속/검기    — 쿨타임 감소 + 근접 공격 시 전방으로 검기
//                         투사체가 발사되어 멀리 있는 적을 관통 공격.
//
// SwordSwing 은 시각만 담당 (범위가 바뀌면 geometry 재빌드). 실제 피해는
// 콤보 상태에 따라 이 파일에서 per-enemy 로 계산.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Skill } from './skill-base.js';
import { SwordSwing } from '../combat/sword-swing.js';
import { SwordBeam } from '../combat/sword-beam.js';

export class SwordSkill extends Skill {
    static id = 'sword';
    static displayName = '검술';
    static iconPath = './asset/icon.svg';
    static description = '전방 반원 범위를 베어 근접 피해를 입힙니다. 트리는 세 갈래 — 범위를 키워 회오리처럼 쓸어버리거나, 같은 적에 연타해 치명을 쌓거나, 공속을 올려 검기로 멀리까지 뻗어가는 원거리 근접으로 성장시킬 수 있습니다.';

    constructor(player, game) {
        super(player, game);

        this.swing = new SwordSwing(game.surface);
        this.swing.attach(game.worldRotator);
        this.beams = [];
        this._comboMap = new Map();    // enemy → 연타 누적 횟수

        this._autoCast = true;
        this._cdRemaining = 0;

        this.onNodeChanged();
    }

    // ------- 트리 정의 (3 cols × 5 rows) ---------------------------------
    getNodes() {
        return [
            // ===== col 0: 광역 / 회오리 =====
            { id: 'arc1',       col: 0, row: 0, maxRank: 3, requires: [],              name: '범위 확장 I',   desc: '공격 각도 +15° per rank' },
            { id: 'arc2',       col: 0, row: 1, maxRank: 3, requires: ['arc1'],        name: '범위 확장 II',  desc: '공격 각도 +20° per rank' },
            { id: 'arc_full',   col: 0, row: 2, maxRank: 1, requires: ['arc2'],        name: '완전 회전',     desc: '공격 각도 360° 도달' },
            { id: 'whirl_dmg',  col: 0, row: 3, maxRank: 3, requires: ['arc_full'],    name: '회오리 위력',   desc: '360° 상태에서 피해 +15% per rank' },
            { id: 'whirl_act',  col: 0, row: 4, maxRank: 1, requires: ['whirl_dmg'],   name: '소용돌이 베기', desc: '공격 속도 ×2 · 피해 +30% · 돌아다니며 연속 베기' },

            // ===== col 1: 콤보 / 치명 =====
            { id: 'edge',       col: 1, row: 0, maxRank: 5, requires: [],              name: '날카로움',      desc: '피해 +10% per rank' },
            { id: 'reach',      col: 1, row: 1, maxRank: 3, requires: ['edge'],        name: '사거리 연장',   desc: '근접 사거리 +10% per rank' },
            { id: 'combo_on',   col: 1, row: 2, maxRank: 1, requires: ['reach'],       name: '연속 추적',     desc: '같은 적 연타 감지 활성화' },
            { id: 'combo_boost',col: 1, row: 3, maxRank: 3, requires: ['combo_on'],    name: '콤보 폭발',     desc: '2연타+ 시 피해 +25%·치명 +15% per rank' },
            { id: 'combo_ult',  col: 1, row: 4, maxRank: 1, requires: ['combo_boost'], name: '처형',          desc: '3연타 시 치명 확정 + 피해 ×2' },

            // ===== col 2: 공속 / 검기 =====
            { id: 'speed',      col: 2, row: 0, maxRank: 4, requires: [],              name: '민첩',          desc: '공격 쿨타임 -8% per rank' },
            { id: 'beam_on',    col: 2, row: 1, maxRank: 1, requires: ['speed'],       name: '검기 발사',     desc: '근접 공격 시 전방으로 검기 투사체' },
            { id: 'beam_pierce',col: 2, row: 2, maxRank: 3, requires: ['beam_on'],     name: '검기 관통',     desc: '검기 관통 횟수 +1 per rank' },
            { id: 'beam_dmg',   col: 2, row: 3, maxRank: 3, requires: ['beam_pierce'], name: '검기 강화',     desc: '검기 피해 +20% per rank' },
            { id: 'beam_ult',   col: 2, row: 4, maxRank: 1, requires: ['beam_dmg'],    name: '비검 (飛劍)',   desc: '검기 사거리 ×2 · 피해 ×1.5' },
        ];
    }

    getExpForLevel(level) {
        return Math.floor(35 * Math.pow(1.28, level - 1));
    }

    // ------- 런타임 스탯 재계산 (spent 가 바뀔 때마다) ---------------------
    onNodeChanged() {
        const r = (id) => this.rankOf(id);

        // --- Path A: arc / whirl ---
        const arcAddDeg = 15 * r('arc1') + 20 * r('arc2');
        const arcFull   = r('arc_full') > 0;
        const arcDeg    = arcFull ? 360 : 180 + arcAddDeg;
        this.arc = arcDeg * Math.PI / 180;
        const whirlDmgMult = arcFull ? (1 + 0.15 * r('whirl_dmg')) : 1;
        const whirlActive  = r('whirl_act') > 0;

        // --- Path B: edge / reach / combo ---
        const edgeMult = 1 + 0.10 * r('edge');
        const reachMult = 1 + 0.10 * r('reach');
        this.comboTrackEnabled = r('combo_on') > 0;
        this.comboDmgMult   = 1 + 0.25 * r('combo_boost');
        this.comboCritBonus = 0.15 * r('combo_boost');
        this.comboUltUnlocked = r('combo_ult') > 0;

        // --- Path C: speed / beam ---
        const speedMult = Math.max(0.2, 1 - 0.08 * r('speed'));
        this.beamUnlocked   = r('beam_on') > 0;
        this.beamPierce     = 1 + r('beam_pierce');
        this.beamDmgMult    = (1 + 0.20 * r('beam_dmg')) * (r('beam_ult') > 0 ? 1.5 : 1);
        this.beamRangeMult  = r('beam_ult') > 0 ? 2 : 1;
        this.beamRange      = CONFIG.sword.range * 2.5 * this.beamRangeMult;

        // --- derived ---
        this.damage   = CONFIG.sword.damage * edgeMult * whirlDmgMult * (whirlActive ? 1.3 : 1);
        this.range    = CONFIG.sword.range * reachMult;
        this.cooldown = CONFIG.sword.swingCooldown * speedMult * (whirlActive ? 0.5 : 1);
        this.critChance = 0;   // 기본 치명 없음 — 콤보로만 획득
    }

    // ------- 프레임 업데이트 ---------------------------------------------
    update(dt, ctx) {
        this._cdRemaining = Math.max(0, this._cdRemaining - dt);
        this.swing.update(dt);

        // 죽은 적은 콤보 맵에서 정리
        if (this._comboMap.size > 0) {
            for (const enemy of this._comboMap.keys()) {
                if (!enemy.alive) this._comboMap.delete(enemy);
            }
        }

        // 검기 투사체 업데이트
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

        // 1) 각 적 판정 + per-enemy 콤보 피해 계산
        const hitSet = this._resolveHits(enemies);

        // 2) 콤보 맵 갱신: 이번에 맞지 않은 적은 콤보 리셋
        if (this.comboTrackEnabled) {
            for (const enemy of Array.from(this._comboMap.keys())) {
                if (!hitSet.has(enemy)) this._comboMap.delete(enemy);
            }
            for (const e of hitSet) {
                this._comboMap.set(e, (this._comboMap.get(e) ?? 0) + 1);
            }
        }

        // 3) 시각 연출 (피해는 우리가 이미 처리했으니 enemies=[])
        this.swing.trigger(pos, forward, [], {
            damage: 0,
            range: this.range,
            arcAngle: this.arc,
            critChance: 0,
        });

        // 4) 검기 발사
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

    /** 플레이어 범위/각도 안의 모든 적을 판정하고 피해를 입힌다.
     *  returns Set<Enemy> — 이번 공격에 실제로 맞은 적들. */
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

            // 콤보 카운트 계산 (이 공격 후의 값: prev + 1)
            const newCombo = (this._comboMap.get(e) ?? 0) + 1;

            let dmg = this.damage;
            let crit = this.critChance;
            if (this.comboTrackEnabled && newCombo >= 2) {
                dmg  *= this.comboDmgMult;
                crit += this.comboCritBonus;
            }
            let forceCrit = false;
            if (this.comboUltUnlocked && newCombo >= 3) {
                forceCrit = true;
                dmg *= 2;
            }
            const isCrit = forceCrit || Math.random() < crit;
            const final = isCrit ? dmg * 2 : dmg;
            e.damage(final);
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
            if (d < bestD) { bestD = d; best = e; }
        }
        return best;
    }

    // ------- UI 훅 --------------------------------------------------------
    getCooldownRemaining() { return this._cdRemaining; }
    getCooldownDuration()  { return this.cooldown; }
    isEmphasis()           { return this._autoCast; }
    activate()             { this._autoCast = !this._autoCast; }

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

// module-local scratch vectors (per-call reuse to avoid allocation)
const _up = new THREE.Vector3();
const _dv = new THREE.Vector3();
const _tan = new THREE.Vector3();
