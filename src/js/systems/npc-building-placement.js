// NPC building placement on the spherical surface.
// See docs/npc-building-distribution-balancing.md for the full design.
//
// Responsibilities:
//   - Hold the player spawn anchor and the set of already-placed buildings.
//   - For each registry entry (`CONFIG.npcBuildings.*`), pick a position in
//     its rarity-appropriate distance band, respecting minimum spacing rules
//     against other placed structures.
//   - Optionally weight retries by element bias against the active planet's
//     dominant element so themed buildings cluster on themed planets.
//
// `home` is treated as a fixed anchor — registered up front so other
// placements stay outside of `npcToHome` distance.

import * as THREE from 'three';
import { CONFIG } from '../config.js';

const DEFAULT_BAND = { min: 8, max: 14 };
const DEFAULT_SPACING = { npcToNpc: 6, npcToHome: 8, rareToRare: 12 };

export class NpcBuildingPlacement {
    constructor(surface, anchor) {
        this.surface = surface;
        this.anchor = new THREE.Vector3().copy(anchor);
        // Each entry: { id, position, kind: 'home' | rarity }
        this.placements = [];
        this._tmp = new THREE.Vector3();
    }

    /** Mark a position as occupied so subsequent placements honor spacing. */
    register(id, position, kind = 'home') {
        this.placements.push({
            id,
            position: new THREE.Vector3().copy(position),
            kind,
        });
    }

    /** Resolve the band the given def should use. Falls back to mid. */
    _bandFor(def) {
        const dist = CONFIG.npcDistribution ?? {};
        const band = dist.bands?.[def.band];
        return band ?? DEFAULT_BAND;
    }

    _spacing() {
        const dist = CONFIG.npcDistribution ?? {};
        return { ...DEFAULT_SPACING, ...(dist.minSpacing ?? {}) };
    }

    _maxAttempts() {
        return CONFIG.npcDistribution?.placementMaxAttempts ?? 24;
    }

    /** Pick a planet element bias multiplier for a building. Buildings that
     *  match the dominant element keep weight 1.0; mismatched buildings get a
     *  penalty so their candidate points are rejected more often (we apply by
     *  re-rolling some attempts). */
    _planetMatchScore(def) {
        const planetId = CONFIG.activePlanet;
        const planet = CONFIG.planets?.[planetId];
        if (!planet || !def.element || def.element === 'physical') return 1.0;
        return def.element === planet.dominant ? 1.4 : 0.85;
    }

    /** Place a single building. Returns the chosen position (cloned) or null
     *  if no slot satisfied spacing within the attempt budget. The caller is
     *  responsible for handing the position to `npc.init(parent, position)`. */
    placeBuilding(id, def) {
        const band = this._bandFor(def);
        const spacing = this._spacing();
        const isRare = def.rarity === 'rare' || def.rarity === 'legendary';
        const maxAttempts = Math.max(1, Math.round(this._maxAttempts() * this._planetMatchScore(def)));
        const kind = def.kind ?? def.role ?? null;

        for (let i = 0; i < maxAttempts; i++) {
            const arc = band.min + Math.random() * Math.max(0, band.max - band.min);
            this.surface.randomPointAtArc(this.anchor, arc, this._tmp);

            if (this._satisfiesSpacing(this._tmp, spacing, isRare, kind)) {
                return this._commit(id, this._tmp, kind ?? def.rarity);
            }
        }

        // Fallback: place at band midpoint at a random angle (ignore spacing).
        const arc = (band.min + band.max) / 2;
        this.surface.randomPointAtArc(this.anchor, arc, this._tmp);
        return this._commit(id, this._tmp, kind ?? def.rarity);
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
     *  subset) and yield {id, def, position}. The caller wires positions to
     *  the matching NPC instance via `npc.init(parent, position)`. */
    *iterRegistry(filter = null) {
        const reg = CONFIG.npcBuildings ?? {};
        for (const [id, def] of Object.entries(reg)) {
            if (filter && !filter(id, def)) continue;
            const pos = this.placeBuilding(id, def);
            yield { id, def, position: pos };
        }
    }
}
