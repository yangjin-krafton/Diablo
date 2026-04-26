// Owns the hostile buildings (요새, 차원문) on the active planet and the
// dropship event scheduler (운송선). See §7-8 of
// docs/npc-building-distribution-balancing.md.
//
// Each fortress / portal is added to `spawner.enemies` so existing sword/beam
// damage handlers hit them as if they were enemies. Their own `update()`
// drives reinforcements and portal cycles via the spawner's `spawnAt()` API.
//
// The dropship event runs entirely from this system: at random intervals it
// picks an arc-distance point near the player, displays a warning ring on
// the surface for `warningTime` seconds, then spawns a group of enemies at
// the impact and removes the ring.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Fortress } from '../entities/fortress.js';
import { Portal } from '../entities/portal.js';
import { DropShipMeteorEffect, ImpactBurstEffect } from './hostile-effects.js';
import { HostileHpBar } from '../ui/hostile-hp-bar.js';

export class HostileBuildingSystem {
    constructor(surface, parent, spawner, drops, player, camera = null) {
        this.surface = surface;
        this.parent = parent;          // worldRotator
        this.spawner = spawner;
        this.drops = drops;
        this.player = player;
        this.camera = camera;

        this.fortresses = [];
        this.portals = [];

        this._dropShipCfg = CONFIG.hostileBuildings?.dropShip ?? null;
        this._dropShipState = null;
        this._dropShipNextEvent = this._dropShipCooldown(true);
        this._impactEffects = [];
    }

    /** Spawn helper for hostile buildings: routes to spawner.spawnAt with the
     *  active planet's enemy bias intact. */
    _spawnRequest = (centerPos, arcRadius, options = {}) => {
        return this.spawner.spawnAt(centerPos, arcRadius, options);
    };

    /** Construct a hostile building from a registry entry. Caller hands the
     *  position from the placement system. */
    async addBuilding(def, position) {
        let building = null;
        if (def.kind === 'fortress') {
            building = new Fortress(this.surface, position, def, { spawnRequest: this._spawnRequest });
            this.fortresses.push(building);
        } else if (def.kind === 'portal') {
            building = new Portal(this.surface, position, def, { spawnRequest: this._spawnRequest });
            this.portals.push(building);
        }
        if (!building) return null;
        await building.init(this.parent);
        if (this.camera) {
            building.hpBar = new HostileHpBar(this.parent, this.camera, this.surface, building);
            building.hpBar.update();
        }
        // Register as a damageable target in the live enemies pool.
        this.spawner.addExternalTarget(building);
        return building;
    }

    /** Per-frame tick. Hostile-building entities update themselves through
     *  their place in spawner.enemies; this method only handles the
     *  dropship event scheduler. */
    update(dt) {
        this._updateDropShip(dt);
        this._updateImpactEffects(dt);
        this._cullDeadPortals();
    }

    /** Drop the dropship warning ring (if any) and reset its scheduler.
     *  Called on player respawn so we don't leave orphan meshes in the
     *  scene. Existing fortresses / portals are kept across deaths. */
    resetForRespawn() {
        if (this._dropShipState?.ring?.parent) {
            this._dropShipState.ring.parent.remove(this._dropShipState.ring);
        }
        this._dropShipState?.meteor?.detach();
        for (const fx of this._impactEffects) {
            if (fx.group?.parent) fx.group.parent.remove(fx.group);
        }
        this._impactEffects.length = 0;
        this._dropShipState = null;
        this._dropShipNextEvent = this._dropShipCooldown(true);
    }

    _cullDeadPortals() {
        // Portals never go alive=false (they cycle), so they stay in
        // spawner.enemies. Nothing to do here unless a future feature lets
        // them be permanently destroyed.
    }

    /** Called by Spawner.onDeath when an entity is pruned. Awards the
     *  hostile-building bonus drop, scaled by the active planet tier so
     *  larger planets pay better. Returns true if it consumed the death. */
    onDeath(pos, entity) {
        if (!entity?.isHostileBuilding) return false;
        const baseBonus = entity.dropBonus ?? 0;
        const mul = this.tier?.rewardMul ?? 1;
        const bonus = Math.max(0, Math.round(baseBonus * mul));
        if (bonus > 0) this.drops.spawnBundle(pos, bonus);
        return true;
    }

    // -- 운송선 이벤트 ------------------------------------------------------

    _dropShipCooldown(initial = false) {
        const cfg = this._dropShipCfg;
        if (!cfg) return Infinity;
        const range = cfg.eventCooldown ?? { min: 90, max: 180 };
        const min = range.min;
        const max = range.max;
        const base = min + Math.random() * (max - min);
        // First event waits a bit longer so the early game stays calm.
        return initial ? base + 30 : base;
    }

    _updateDropShip(dt) {
        const cfg = this._dropShipCfg;
        if (!cfg) return;

        // Active warning → impact transition
        if (this._dropShipState) {
            this._dropShipState.timer -= dt;
            this._tickWarningRing(this._dropShipState, dt);
            if (this._dropShipState.timer <= 0) {
                this._dropShipImpact(this._dropShipState);
                this._dropShipState = null;
                this._dropShipNextEvent = this._dropShipCooldown();
            }
            return;
        }

        // Next event scheduling
        this._dropShipNextEvent -= dt;
        if (this._dropShipNextEvent <= 0) this._beginDropShipEvent();
    }

    _beginDropShipEvent() {
        const cfg = this._dropShipCfg;
        if (!cfg) return;

        const arcRange = cfg.impactArcDistance ?? { min: 8, max: 16 };
        const arc = arcRange.min + Math.random() * (arcRange.max - arcRange.min);
        const impactPos = new THREE.Vector3();
        this.surface.randomPointAtArc(this.player.position, arc, impactPos);

        const ring = this._buildWarningRing(cfg);
        ring.userData.impactPos = impactPos.clone();
        this.parent.add(ring);
        const duration = cfg.warningTime ?? 3;
        const meteor = new DropShipMeteorEffect(this.surface, impactPos, duration);
        meteor.attach(this.parent);

        this._dropShipState = {
            timer: duration,
            duration,
            ring,
            meteor,
            impactPos: ring.userData.impactPos,
            spawnCount: pickInt(cfg.spawnCount ?? { min: 5, max: 8 }),
            eliteChance: cfg.eliteChance ?? 0.12,
        };
        this._placeRingOnSurface(ring, impactPos);
    }

    _dropShipImpact(state) {
        if (state.ring && state.ring.parent) state.ring.parent.remove(state.ring);
        state.meteor?.detach();
        const impactFx = new ImpactBurstEffect(this.surface, state.impactPos);
        impactFx.attach(this.parent);
        this._impactEffects.push(impactFx);
        for (let i = 0; i < state.spawnCount; i++) {
            const elite = Math.random() < state.eliteChance;
            const opts = elite ? eliteOptions() : {};
            this.spawner.spawnAt(state.impactPos, 1.6, { spawnSource: 'dropShip', ...opts });
        }
    }

    _buildWarningRing(cfg) {
        const radius = cfg.impactRadius ?? 2.4;
        const geo = new THREE.RingGeometry(radius * 0.92, radius, 64);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xff5f86,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        return new THREE.Mesh(geo, mat);
    }

    _placeRingOnSurface(ring, pos) {
        // Orient like the NPC ring helper does: pos as up axis, arbitrary
        // tangent forward.
        const up = _v1.copy(pos).normalize();
        let f = _v2.set(1, 0, 0).addScaledVector(up, -up.x);
        if (f.lengthSq() < 1e-4) f.set(0, 0, 1).addScaledVector(up, -up.z);
        f.normalize();
        const right = _v3.crossVectors(up, f).normalize();
        const fwd = _v4.crossVectors(right, up).normalize();
        _m.makeBasis(right, up, fwd);
        ring.quaternion.setFromRotationMatrix(_m);
        ring.position.copy(pos).addScaledVector(up, 0.05);
    }

    _tickWarningRing(state, dt) {
        const t = 1 - Math.max(0, state.timer / state.duration);
        const pulse = 0.45 + 0.55 * Math.sin(t * Math.PI * 6);
        state.ring.material.opacity = 0.35 + pulse * 0.55;
        const s = 1 + 0.18 * Math.sin(t * Math.PI * 4);
        state.ring.scale.setScalar(s);
        state.meteor?.update(dt);
    }

    _updateImpactEffects(dt) {
        for (let i = this._impactEffects.length - 1; i >= 0; i--) {
            const fx = this._impactEffects[i];
            fx.update(dt);
            if (!fx.alive) this._impactEffects.splice(i, 1);
        }
    }
}

function pickInt(range) {
    const min = range.min ?? 1;
    const max = range.max ?? min;
    return min + Math.floor(Math.random() * (max - min + 1));
}

function eliteOptions() {
    return {
        modelTier: 'elite',
        hpScale: 2.4,
        damageScale: 1.5,
        moveSpeedScale: 0.95,
        modelScale: 1.4,
    };
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _m  = new THREE.Matrix4();
