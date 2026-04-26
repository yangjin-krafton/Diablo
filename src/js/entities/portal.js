// 차원문형 적대 건물.
//
// 일정 간격으로 적을 1~N마리 소환한다. HP가 0이 되면 닫힌(closed) 상태가 되고,
// reopenDelay 후 reopenedHpRatio만큼 HP를 회복하며 다시 열린다. 닫힌 동안에는
// 소환을 멈춘다. 영구 파괴되지 않는 구조.
//
// 닫힘/재개방 동안 spawner.enemies에 그대로 남아 있어야 한다 (메시는 숨김
// 처리). 그래서 alive=false로 만들지 않고 closed 플래그로 관리한다.

import { HostileBuilding } from './hostile-building.js';
import { PortalVortexEffect } from '../systems/hostile-effects.js';

export class Portal extends HostileBuilding {
    constructor(surface, position, def, opts = {}) {
        super(surface, position, def);
        this.spawnRequest = opts.spawnRequest; // (centerPos, arcRadius, options) => Enemy
        this.spawnInterval = def.spawnInterval ?? 16;
        this.spawnCount = def.spawnCount ?? 2;
        this.spawnArc = def.spawnArc ?? 1.5;          // emit enemies just outside the body
        this.reopenDelay = def.reopenDelay ?? 120;
        this.reopenedHpRatio = def.reopenedHpRatio ?? 0.6;
        this._spawnTimer = Math.min(this.spawnInterval, 6);
        this._reopenTimer = 0;
        this.closed = false;
        this.effect = null;
    }

    async init(parent) {
        await super.init(parent);
        this.effect = new PortalVortexEffect(this.surface, this);
        this.effect.attach(parent);
    }

    update(dt, player) {
        if (this.closed) {
            this._reopenTimer -= dt;
            this.hpBar?.update();
            if (this._reopenTimer <= 0) this._reopen();
            return;
        }
        super.update(dt, player);
        if (!this.alive) return;
        this.effect?.update(dt);

        this._spawnTimer -= dt;
        if (this._spawnTimer <= 0) {
            this._spawnTimer = this.spawnInterval;
            this._emit();
        }
    }

    _emit() {
        if (!this.spawnRequest) return;
        for (let i = 0; i < this.spawnCount; i++) {
            this.spawnRequest(this.position, this.spawnArc, {
                spawnSource: 'portal',
            });
        }
    }

    /** Override death so the entity sticks around: set `closed` instead of
     *  marking it not-alive. The owning system reopens after a delay. */
    kill() {
        if (this.closed) return;
        this.closed = true;
        this.hp = 0;
        this._reopenTimer = this.reopenDelay;
        if (this.mesh) this.mesh.visible = false;
        this.effect?.setVisible(false);
    }

    _reopen() {
        this.closed = false;
        this.hp = Math.max(1, this.maxHp * this.reopenedHpRatio);
        this._spawnTimer = Math.min(this.spawnInterval, 6);
        if (this.mesh) this.mesh.visible = true;
        this.effect?.setVisible(true);
    }
}
