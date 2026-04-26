// NPC building placement on the spherical surface.
// See docs/npc-building-distribution-balancing.md.
//
// Distribution model: *whole-planet uniform sampling*. Buildings are spread
// across the entire sphere, not packed into rings around the player spawn.
//   - Each placement draws K uniform candidates on the sphere surface.
//   - Candidates are rejected if they sit inside the rarity-derived
//     `minArcFromHome` ring (so a `legendary` building can't land right next
//     to home), or violate min-spacing rules vs. existing placements.
//   - Among survivors, Mitchell's best-candidate picks the one with the
//     LARGEST minimum distance to existing placements — actively maximises
//     spread across the planet.
//   - If no candidate survives the spacing test we relax `minArcFromHome`
//     in steps. Final emergency fallback: uniform sample, ignore spacing.
//
// `def.band` is interpreted as a *minimum distance from home* (= band.min).
// The band's `max` is ignored — the planet is the only natural cap.
// Buildings can therefore appear on the opposite side of the planet from
// the player spawn if that's where the spread algorithm sends them.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const DEFAULT_SPACING = { npcToNpc: 6, npcToHome: 8, rareToRare: 12 };
const DEFAULT_BAND_FLOORS = { near: 8, mid: 15, far: 25, edge: 39 };
const CANDIDATE_POOL = 16;
const SPACING_RELAX_STEPS = [1, 0.6, 0.3, 0];   // multipliers on minArcFromHome

export class NpcBuildingPlacement {
    constructor(surface, anchor) {
        this.surface = surface;
        this.anchor = new THREE.Vector3().copy(anchor);
        // Each entry: { id, position, kind }
        this.placements = [];
        this._candidate = new THREE.Vector3();
    }

    /** Mark a position as occupied so subsequent placements honor spacing. */
    register(id, position, kind = 'home') {
        this.placements.push({
            id,
            position: new THREE.Vector3().copy(position),
            kind,
        });
    }

    _spacing() {
        const dist = CONFIG.npcDistribution ?? {};
        return { ...DEFAULT_SPACING, ...(dist.minSpacing ?? {}) };
    }

    /** Resolve the minimum arc distance from home for a building def. Source
     *  precedence: explicit `def.minArcFromHome` → band floor (config or
     *  defaults) → `startSafeRadius` → fallback 8. */
    _minArcFromHome(def) {
        if (typeof def.minArcFromHome === 'number') return def.minArcFromHome;
        const dist = CONFIG.npcDistribution ?? {};
        const bandKey = def.band;
        const bandCfg = dist.bands?.[bandKey];
        if (bandCfg && typeof bandCfg.min === 'number') return bandCfg.min;
        if (DEFAULT_BAND_FLOORS[bandKey] != null) return DEFAULT_BAND_FLOORS[bandKey];
        return dist.startSafeRadius ?? 8;
    }

    /** Element-bias: matching buildings get extra candidate budget so they
     *  tend to land in better-spread positions on themed planets. */
    _planetMatchScore(def) {
        const planetId = CONFIG.activePlanet;
        const planet = CONFIG.planets?.[planetId];
        if (!planet || !def.element || def.element === 'physical') return 1.0;
        return def.element === planet.dominant ? 1.4 : 0.85;
    }

    /** Place a single building. Returns the chosen position (cloned). */
    placeBuilding(id, def) {
        const spacing = this._spacing();
        const isRare = def.rarity === 'rare' || def.rarity === 'legendary';
        const kind = def.kind ?? def.role ?? null;
        const baseFloor = this._minArcFromHome(def);
        const candidatePool = Math.max(6, Math.round(CANDIDATE_POOL * this._planetMatchScore(def)));

        // Try progressively relaxed home-floor multipliers until we find a
        // valid spot. Spacing rules are kept in every step except the very
        // last emergency fallback.
        for (const relax of SPACING_RELAX_STEPS) {
            const floor = baseFloor * relax;
            const pick = this._bestCandidate(floor, spacing, isRare, kind, candidatePool);
            if (pick) return this._commit(id, pick, kind ?? def.rarity);
        }

        // Emergency: pure uniform sphere sample, no constraints.
        this.surface.randomPointOnSphere(this._candidate);
        return this._commit(id, this._candidate, kind ?? def.rarity);
    }

    /** Generate K uniform candidates across the sphere, filter by
     *  minArcFromHome and spacing rules, return the one with the largest
     *  min-distance to existing placements (Mitchell's best-candidate). */
    _bestCandidate(minFromHome, spacing, isRare, kind, poolSize) {
        let bestPos = null;
        let bestScore = -Infinity;

        for (let i = 0; i < poolSize; i++) {
            this.surface.randomPointOnSphere(this._candidate);

            if (this.surface.arcDistance(this._candidate, this.anchor) < minFromHome) continue;
            if (!this._satisfiesSpacing(this._candidate, spacing, isRare, kind)) continue;

            const score = this._minDistance(this._candidate);
            if (score > bestScore) {
                bestScore = score;
                if (!bestPos) bestPos = new THREE.Vector3();
                bestPos.copy(this._candidate);
            }
        }

        return bestPos;
    }

    /** Distance to the nearest existing placement (Infinity if none). */
    _minDistance(point) {
        let min = Infinity;
        for (const p of this.placements) {
            const d = this.surface.arcDistance(point, p.position);
            if (d < min) min = d;
        }
        return min;
    }

    _satisfiesSpacing(point, spacing, isRare, kind = null) {
        for (const p of this.placements) {
            let min;
            if (p.kind === 'home') {
                if (kind === 'fortress') min = spacing.fortressToHome ?? spacing.npcToHome;
                else if (kind === 'portal') min = spacing.portalToHome ?? spacing.npcToHome;
                else min = spacing.npcToHome;
            } else if (kind === 'fortress' && p.kind === 'fortress') {
                min = spacing.fortressToFortress ?? spacing.rareToRare ?? spacing.npcToNpc;
            } else if (isRare && (p.kind === 'rare' || p.kind === 'legendary')) {
                min = spacing.rareToRare;
            } else {
                min = spacing.npcToNpc;
            }
            if (this.surface.arcDistance(point, p.position) < min) return false;
        }
        return true;
    }

    _commit(id, point, kind) {
        const pos = new THREE.Vector3().copy(point);
        this.placements.push({ id, position: pos, kind });
        return pos;
    }

    /** Convenience: iterate every CONFIG.npcBuildings entry (or a filtered
     *  subset) and yield {id, def, position}. */
    *iterRegistry(filter = null) {
        const reg = CONFIG.npcBuildings ?? {};
        for (const [id, def] of Object.entries(reg)) {
            if (filter && !filter(id, def)) continue;
            const pos = this.placeBuilding(id, def);
            yield { id, def, position: pos };
        }
    }

    /** Diagnostic snapshot — useful in dev console to confirm spread.
     *  Returns each placement's id, kind, and arc distance from home so you
     *  can verify buildings land all over the planet, not in one ring. */
    debugSummary() {
        return this.placements.map((p) => ({
            id: p.id,
            kind: p.kind,
            arcFromHome: this.surface.arcDistance(this.anchor, p.position).toFixed(1),
        }));
    }
}
