// 요새형 적대 건물.
//
// 주둔 경비 수가 maxGuards 미만이면 reinforceCooldown마다 새 경비를 스폰한다.
// 경비는 보통 Enemy로 만들고 spawner.enemies에 추가해 기존 추적 AI를 그대로
// 쓴다 (경비 = 그냥 적). 요새는 "어디서 적이 나오는가"의 출처 역할만 담당.
//
// 파괴 시 dropBonus만큼 추가 자원을 떨어뜨린다 (HostileBuildingSystem이
// onDeath 시 처리).

import { HostileBuilding } from './hostile-building.js';
import { FortressSmokeEffect } from '../systems/hostile-effects.js';

export class Fortress extends HostileBuilding {
    constructor(surface, position, def, opts = {}) {
        super(surface, position, def);
        this.spawnRequest = opts.spawnRequest;     // (centerPos, arcRadius, options) => Enemy
        this.guards = [];                          // tracked Enemy refs
        this.maxGuards = def.maxGuards ?? 6;
        this.patrolRadius = def.patrolRadius ?? 6;
        this.reinforceCooldown = def.reinforceCooldown ?? 18;
        this._reinforceTimer = Math.min(this.reinforceCooldown, 4);  // first guard arrives a bit sooner
        this.effect = null;
    }

    async init(parent) {
        await super.init(parent);
        this.effect = new FortressSmokeEffect(this.surface, this);
        this.effect.attach(parent);
    }

    update(dt, player) {
        super.update(dt, player);
        if (!this.alive) return;
        this.effect?.update(dt);

        // Cull dead guards
        for (let i = this.guards.length - 1; i >= 0; i--) {
            if (!this.guards[i].alive) this.guards.splice(i, 1);
        }

        if (this.guards.length >= this.maxGuards) {
            // Hold the timer at a small floor so reinforcement begins quickly
            // once a guard dies.
            this._reinforceTimer = Math.min(this._reinforceTimer, this.reinforceCooldown * 0.4);
            return;
        }

        this._reinforceTimer -= dt;
        if (this._reinforceTimer <= 0) {
            this._reinforceTimer = this.reinforceCooldown;
            this._spawnGuard();
        }
    }

    _spawnGuard() {
        if (!this.spawnRequest) return;
        const guard = this.spawnRequest(this.position, this.patrolRadius, {
            // Mark provenance so future logic can attribute or recall.
            spawnSource: 'fortress',
        });
        if (guard) this.guards.push(guard);
    }

    kill() {
        super.kill();
        this.effect?.detach();
    }
}
