// Single source of truth for tunable values.
// Gameplay iteration = edit this file. Systems read from CONFIG.*.

export const CONFIG = {
    // Planet size tiers picked at session start. The chosen tier drives
    // (1) the actual radius of the sphere, (2) how many NPC/hostile
    // buildings appear, (3) enemy difficulty multipliers, (4) reward
    // multipliers. Bigger planet = harder + more content + more loot.
    // `weight` controls relative pick probability among tiers.
    planetSize: {
        tiers: {
            small: {
                key: 'small',
                label: '소형',
                radius: { min: 22, max: 28 },
                weight: 1,
                npcCountMul: 0.7,
                hostileCountMul: 0.7,
                enemyHpMul: 0.85,
                enemyDamageMul: 0.9,
                rewardMul: 0.8,
            },
            medium: {
                key: 'medium',
                label: '중형',
                radius: { min: 30, max: 38 },
                weight: 2,
                npcCountMul: 1.0,
                hostileCountMul: 1.0,
                enemyHpMul: 1.0,
                enemyDamageMul: 1.0,
                rewardMul: 1.0,
            },
            large: {
                key: 'large',
                label: '대형',
                radius: { min: 42, max: 55 },
                weight: 1,
                npcCountMul: 1.5,
                hostileCountMul: 1.4,
                enemyHpMul: 1.25,
                enemyDamageMul: 1.15,
                rewardMul: 1.6,
            },
        },
    },

    world: {
        // Legacy fixed radius used as a fallback if no tier is selected.
        // The actual game-time radius comes from a sampled `planetSize.tiers`
        // entry (see Game constructor).
        planetRadius: 30,
        bgColor: 0x050510,
        skyboxPaths: [
            './asset/skybox/space_green.png',
            './asset/skybox/space_red.png',
        ],
        skyboxRandomYaw: true,
        skyboxYawOffset: Math.PI * 0.5,
        starCount: 800,
        starDistance: 260,
        // biome tile painting (see world/terrain.js for biome list)
        terrainDetail: 5,        // icosahedron subdivisions; faces = 20 * 4^detail (20480 at d=5; needed so displacement bumps read as smooth relief, not sharp spikes)
        terrainSeeds: 42,        // Voronoi seeds; more = smaller biome patches
        // scattered landmark props add 3D texture on top of the tiles
        landmarks: {
            count: 40,
            minHeight: 0.8,
            maxHeight: 2.2,
            color: 0x3a3a48,
        },
        // distant sun; source of the directional light and visible glow
        sun: {
            position: { x: 90, y: 110, z: 70 },
            size: 9,
            color: 0xffe4a0,              // visible sphere
            haloColor: 0xffc870,           // soft halo shell
            haloScale: 1.9,
            lightColor: 0xffeec0,
            lightIntensity: 1.6,
            ambientSky: 0x3a4766,
            ambientGround: 0x0a0d18,
            ambientIntensity: 0.28,
        },
    },

    camera: {
        // Static camera. Positions itself at (0, R + height, distance) looking at
        // (0, R, 0), the "visible top" of the planet, where the player is
        // always rendered. Adjust for wider/narrower 2D-feel.
        fov: 55,
        skyboxFov: 82,
        height: 22,
        distance: 24,
    },

    player: {
        modelPath: './asset/models/player/fig_p_knight.glb',
        modelScale: 3.0,
        modelLift: 1.05,
        modelYawOffset: 0,       // radians, add if imported model faces wrong way
        moveSpeed: 5.5,          // linear speed along sphere surface
        maxHp: 100,
        radius: 0.4,
        headLight: {
            color: 0xfff0c8,
            intensity: 10,
            distance: 16,
            decay: 1.2,
            lift: 3.4,
        },
    },

    enemy: {
        modelPath: './asset/models/enemy/fig_m_skeleton.glb',
        modelPaths: [
            './asset/models/enemy/fig_m_skeleton.glb',
            './asset/models/enemy/fig_m_zombie.glb',
            './asset/models/enemy/fig_m_imp.glb',
            './asset/models/enemy/fig_m_orc.glb',
            './asset/models/enemy/fig_m_gargoyle.glb',
        ],
        eliteModelPaths: [
            './asset/models/boss/fig_b_demon_lord.glb',
            './asset/models/boss/fig_b_minotaur.glb',
            './asset/models/boss/fig_b_lich_king.glb',
        ],
        modelGroups: {
            common: [
                './asset/models/enemy/fig_m_skeleton.glb',
                './asset/models/enemy/fig_m_zombie.glb',
                './asset/models/enemy/fig_m_goblin.glb',
                './asset/models/enemy/fig_m_kobold.glb',
                './asset/models/enemy/fig_m_wolf.glb',
                './asset/models/enemy/fig_m_spider.glb',
            ],
            planet: {
                ember: [
                    './asset/models/enemy/fig_m_imp.glb',
                    './asset/models/enemy/fig_m_orc.glb',
                    './asset/models/enemy/fig_m_gargoyle.glb',
                    './asset/models/enemy/fig_m_scorpion.glb',
                ],
                storm: [
                    './asset/models/enemy/fig_m_harpy.glb',
                    './asset/models/enemy/fig_m_gargoyle.glb',
                    './asset/models/enemy/fig_m_bat.glb',
                    './asset/models/enemy/fig_m_ghost.glb',
                ],
                verdant: [
                    './asset/models/enemy/fig_m_wolf.glb',
                    './asset/models/enemy/fig_m_spider.glb',
                    './asset/models/enemy/fig_m_snake.glb',
                    './asset/models/enemy/fig_m_fungus_beast.glb',
                    './asset/models/enemy/fig_m_lizardman.glb',
                ],
                glacier: [
                    './asset/models/enemy/fig_m_skeleton.glb',
                    './asset/models/enemy/fig_m_ghost.glb',
                    './asset/models/enemy/fig_m_mummy.glb',
                    './asset/models/enemy/fig_m_crab.glb',
                ],
                mire: [
                    './asset/models/enemy/fig_m_slime.glb',
                    './asset/models/enemy/fig_m_fungus_beast.glb',
                    './asset/models/enemy/fig_m_snake.glb',
                    './asset/models/enemy/fig_m_scorpion.glb',
                    './asset/models/enemy/fig_m_zombie.glb',
                ],
            },
            source: {
                fortress: [
                    './asset/models/enemy/fig_m_orc.glb',
                    './asset/models/enemy/fig_m_goblin.glb',
                    './asset/models/enemy/fig_m_kobold.glb',
                    './asset/models/enemy/fig_m_rock_golem.glb',
                ],
                portal: [
                    './asset/models/enemy/fig_m_imp.glb',
                    './asset/models/enemy/fig_m_ghost.glb',
                    './asset/models/enemy/fig_m_gargoyle.glb',
                    './asset/models/enemy/fig_m_bat.glb',
                ],
                dropShip: [
                    './asset/models/enemy/fig_m_rock_golem.glb',
                    './asset/models/enemy/fig_m_lizardman.glb',
                    './asset/models/enemy/fig_m_orc.glb',
                    './asset/models/enemy/fig_m_scorpion.glb',
                ],
            },
            elite: {
                ember: [
                    './asset/models/boss/fig_b_demon_lord.glb',
                    './asset/models/boss/fig_b_dragon.glb',
                    './asset/models/boss/fig_b_hydra.glb',
                ],
                storm: [
                    './asset/models/boss/fig_b_fallen_angel.glb',
                    './asset/models/boss/fig_b_chimera.glb',
                    './asset/models/boss/fig_b_titan_golem.glb',
                ],
                verdant: [
                    './asset/models/boss/fig_b_minotaur.glb',
                    './asset/models/boss/fig_b_titan_golem.glb',
                    './asset/models/boss/fig_b_chimera.glb',
                ],
                glacier: [
                    './asset/models/boss/fig_b_lich_king.glb',
                    './asset/models/boss/fig_b_kraken.glb',
                    './asset/models/boss/fig_b_cyclops.glb',
                ],
                mire: [
                    './asset/models/boss/fig_b_lich_king.glb',
                    './asset/models/boss/fig_b_demon_lord.glb',
                    './asset/models/boss/fig_b_kraken.glb',
                ],
            },
        },
        modelStats: {
            './asset/models/enemy/fig_m_bat.glb':          { hpScale: 0.65, damageScale: 0.75, moveSpeedScale: 1.45, radiusScale: 0.72 },
            './asset/models/enemy/fig_m_crab.glb':         { hpScale: 1.2,  damageScale: 0.9,  moveSpeedScale: 0.72,  radiusScale: 0.95 },
            './asset/models/enemy/fig_m_fungus_beast.glb': { hpScale: 1.45, damageScale: 1.1,  moveSpeedScale: 0.68, radiusScale: 1.15 },
            './asset/models/enemy/fig_m_gargoyle.glb':     { hpScale: 1.35, damageScale: 1.25, moveSpeedScale: 1.05, radiusScale: 1.05 },
            './asset/models/enemy/fig_m_ghost.glb':        { hpScale: 0.8,  damageScale: 1.25, moveSpeedScale: 1.32, radiusScale: 0.9 },
            './asset/models/enemy/fig_m_goblin.glb':       { hpScale: 0.75, damageScale: 0.85, moveSpeedScale: 1.28, radiusScale: 0.82 },
            './asset/models/enemy/fig_m_harpy.glb':        { hpScale: 0.9,  damageScale: 1.05, moveSpeedScale: 1.38, radiusScale: 0.9 },
            './asset/models/enemy/fig_m_imp.glb':          { hpScale: 0.85, damageScale: 1.2,  moveSpeedScale: 1.22, radiusScale: 0.86 },
            './asset/models/enemy/fig_m_kobold.glb':       { hpScale: 0.8,  damageScale: 0.95, moveSpeedScale: 1.2,  radiusScale: 0.84 },
            './asset/models/enemy/fig_m_lizardman.glb':    { hpScale: 1.25, damageScale: 1.2,  moveSpeedScale: 0.95, radiusScale: 1.05 },
            './asset/models/enemy/fig_m_mummy.glb':        { hpScale: 1.65, damageScale: 1.1,  moveSpeedScale: 0.58, radiusScale: 1.08 },
            './asset/models/enemy/fig_m_orc.glb':          { hpScale: 1.55, damageScale: 1.35, moveSpeedScale: 0.78, radiusScale: 1.16 },
            './asset/models/enemy/fig_m_rock_golem.glb':   { hpScale: 2.4,  damageScale: 1.55, moveSpeedScale: 0.48, radiusScale: 1.4 },
            './asset/models/enemy/fig_m_scorpion.glb':     { hpScale: 1.15, damageScale: 1.3,  moveSpeedScale: 1.05, radiusScale: 0.98 },
            './asset/models/enemy/fig_m_skeleton.glb':     { hpScale: 1.0,  damageScale: 1.0,  moveSpeedScale: 1.0,  radiusScale: 1.0 },
            './asset/models/enemy/fig_m_slime.glb':        { hpScale: 1.35, damageScale: 0.75, moveSpeedScale: 0.64, radiusScale: 1.12 },
            './asset/models/enemy/fig_m_snake.glb':        { hpScale: 0.7,  damageScale: 1.15, moveSpeedScale: 1.5,  radiusScale: 0.7 },
            './asset/models/enemy/fig_m_spider.glb':       { hpScale: 0.85, damageScale: 1.0,  moveSpeedScale: 1.42, radiusScale: 0.82 },
            './asset/models/enemy/fig_m_wolf.glb':         { hpScale: 0.95, damageScale: 1.1,  moveSpeedScale: 1.35, radiusScale: 0.94 },
            './asset/models/enemy/fig_m_zombie.glb':       { hpScale: 1.35, damageScale: 1.0,  moveSpeedScale: 0.62, radiusScale: 1.05 },

            './asset/models/boss/fig_b_chimera.glb':       { hpScale: 1.25, damageScale: 1.25, moveSpeedScale: 1.08,  radiusScale: 1.0 },
            './asset/models/boss/fig_b_cyclops.glb':       { hpScale: 1.55, damageScale: 1.45, moveSpeedScale: 0.72, radiusScale: 1.08 },
            './asset/models/boss/fig_b_demon_lord.glb':    { hpScale: 1.35, damageScale: 1.55, moveSpeedScale: 0.86, radiusScale: 1.05 },
            './asset/models/boss/fig_b_dragon.glb':        { hpScale: 1.4,  damageScale: 1.6,  moveSpeedScale: 1.0,  radiusScale: 1.12 },
            './asset/models/boss/fig_b_fallen_angel.glb':  { hpScale: 1.15, damageScale: 1.45, moveSpeedScale: 1.18,  radiusScale: 1.0 },
            './asset/models/boss/fig_b_hydra.glb':         { hpScale: 1.65, damageScale: 1.35, moveSpeedScale: 0.7,  radiusScale: 1.14 },
            './asset/models/boss/fig_b_kraken.glb':        { hpScale: 1.8,  damageScale: 1.25, moveSpeedScale: 0.62, radiusScale: 1.18 },
            './asset/models/boss/fig_b_lich_king.glb':     { hpScale: 1.25, damageScale: 1.55, moveSpeedScale: 0.92, radiusScale: 1.02 },
            './asset/models/boss/fig_b_minotaur.glb':      { hpScale: 1.7,  damageScale: 1.45, moveSpeedScale: 0.74, radiusScale: 1.15 },
            './asset/models/boss/fig_b_titan_golem.glb':   { hpScale: 2.1,  damageScale: 1.65, moveSpeedScale: 0.46, radiusScale: 1.22 },
        },
        modelScale: 2.85,
        modelLift: 0.95,
        modelYawOffset: 0,
        moveSpeed: 2.4,
        maxHp: 30,
        radius: 0.5,
        contactDamage: 8,        // per second while touching player
        contactRange: 1.1,       // tangent-plane distance
    },

    sword: {
        damage: 22,
        range: 2.6,              // blade reach from the player on the tangent plane
        hitInnerRatio: 0.28,     // inner empty space; hit area is a swept blade band
        hitOuterRatio: 1.08,     // slight tip extension so visuals and hits line up
        arcAngle: Math.PI,       // half-circle (180 degrees)
        swingCooldown: 0.55,
        swingDuration: 0.22,
        color: 0xff4d4d,
        opacity: 0.4,
        lift: 0.05,              // arc mesh height above surface
        effect: {
            slashOpacityScale: 1.8,
            slashWidthRatio: 0.3,
            slashMinWidth: Math.PI / 7,
            slashMaxWidth: Math.PI / 4,
            slashSweepRatio: 0.63,
            trailCount: 8,
            trailSpacing: 0.04,
            trailOpacityDecay: 0.83,
            trailLiftStep: 0.011,
            pulseScale: 0.13,
        },
    },

    firebomb: {
        damage: 16,
        radius: 1.55,
        burnDamagePerSecond: 7.5,
        burnDuration: 2.2,
        patchDuration: 3.2,
        chainExplosionDamage: 12,
        chainExplosionRadius: 1.25,
        range: 9.5,
        scatter: 0.85,
        cooldown: 1.35,
    },

    lightning: {
        damage: 18,
        cooldown: 1.2,
        maxRadius: 4.5,
        thickness: 0.55,
        expandTime: 0.5,
    },

    laser: {
        damage: 28,
        cooldown: 1.6,
        range: 12,
        thickness: 0.45,
        burnDamagePerSecond: 5,
        burnDuration: 2.0,
        burnSpreadRadius: 2.5,
        multiBeamSpread: 0.18,    // radians fan half-spread for the 3-beam ult
    },

    blackHole: {
        radius: 3.3,
        duration: 3.1,
        cooldown: 4.4,
        placeDistance: 4.2,
        pullSpeed: 6.3,
        pullDamagePerSecond: 3.5,
        sequenceInterval: 0.38,
        maxFields: 1,
    },

    decoy: {
        duration: 5.2,
        cooldown: 8.5,
        count: 1,
        maxClones: 6,
        aggroWeight: 2.25,
        aggroRange: 13,
        followSpeed: 4.5,
        pulseDamage: 5.5,
        pulseRadius: 2.0,
        pulseInterval: 0.7,
        explodeDamage: 22,
        explodeRadius: 2.6,
        copyInterval: 1.45,
    },

    spawner: {
        interval: 1.6,
        maxEnemies: 18,
        spawnArcMin: 10,         // arc distance from player
        spawnArcMax: 18,
        bossWaveInterval: 0.45,
        bossWaveMaxEnemies: 34,
        bossWaveSpawnArcMin: 4,
        bossWaveSpawnArcMax: 11,
        bossInterval: 60,
        bossSpawnArcMin: 12,
        bossSpawnArcMax: 20,
        patternInitialDelay: 5,
        patternInterval: 12,
        patternMaxEnemies: 32,
        patternSpawnArcMin: 9,
        patternSpawnArcMax: 17,
        waveDuration: 35,
    },

    home: {
        modelPath: './asset/models/building/fig_s_campfire_tent.glb',
        modelScale: 3.45,
        modelLift: 1.2,
        modelYawOffset: 0,
        beaconHeight: 15,
        spawnArcOffset: 5.5,     // arc distance from player's spawn point
        interactRange: 2.8,
        questKillTarget: 8,
        questRewardFuel: 1,
        startWithQuest: true,
        fuelCapacity: 3,
        departureCountdown: 10,
    },

    // NPC building distribution. See docs/npc-building-distribution-balancing.md.
    // `home` stays anchored at the start area; everything else is placed by the
    // placement system using rarity, distance band, and minimum spacing.
    npcDistribution: {
        startSafeRadius: 7,
        bands: {
            near: { min: 8,  max: 14 },
            mid:  { min: 15, max: 24 },
            far:  { min: 25, max: 38 },
            edge: { min: 39, max: 52 },
        },
        minSpacing: {
            npcToNpc:    6,
            npcToHome:   8,
            rareToRare: 12,
            fortressToHome: 14,
            portalToHome:   10,
            fortressToFortress: 18,
        },
        placementMaxAttempts: 24,
    },

    // Hostile building registry (fortress / portal / drop ship). See sections 7-8 of
    // docs/npc-building-distribution-balancing.md.
    hostileBuildings: {
        fortress: {
            kind: 'fortress',
            modelPath: './asset/models/building/fig_s_castle_keep.glb',
            modelScale: 3.4,
            modelLift: 1.3,
            modelYawOffset: 0,
            band: 'mid',
            count: { min: 1, max: 2 },
            hp: 450,
            regenPerSecond: 1.5,
            bodyRadius: 1.2,
            maxGuards: 6,
            patrolRadius: 6,
            reinforceCooldown: 18,
            rewardDrops: 6,        // bonus shard rolls on destruction
        },
        portal: {
            kind: 'portal',
            modelPath: './asset/models/building/fig_s_magic_portal.glb',
            modelScale: 2.6,
            modelLift: 0.9,
            modelYawOffset: 0,
            // Near-band portals: provide early combat pressure around home.
            band: 'near',
            count: { min: 1, max: 2 },
            hp: 220,
            regenPerSecond: 0,
            bodyRadius: 0.8,
            spawnInterval: 16,
            spawnCount: 2,
            spawnArc: 1.8,
            reopenDelay: 90,
            reopenedHpRatio: 0.6,
            rewardDrops: 2,        // bonus shard rolls when closed
        },
        portalFar: {
            kind: 'portal',
            modelPath: './asset/models/building/fig_s_magic_portal.glb',
            modelScale: 2.6,
            modelLift: 0.9,
            modelYawOffset: 0,
            // Far-band portal: guarantees one portal exists across the planet
            // surface, not just within the start ring.
            band: 'far',
            count: { min: 1, max: 1 },
            hp: 280,
            regenPerSecond: 0,
            bodyRadius: 0.8,
            spawnInterval: 14,
            spawnCount: 2,
            spawnArc: 1.8,
            reopenDelay: 90,
            reopenedHpRatio: 0.6,
            rewardDrops: 3,
        },
        // No fixed structure; the system runs the timer + warning ring + group
        // spawn based on these values whenever activePlanet has dropShip set.
        dropShip: {
            kind: 'dropShip',
            eventCooldown: { min: 90, max: 180 },
            warningTime: 3,
            spawnCount: { min: 5, max: 8 },
            impactArcDistance: { min: 8, max: 16 },
            impactRadius: 2.4,
            eliteChance: 0.12,
        },
    },

    // Registry of placeable NPC buildings. Each entry is self-contained:
    // it owns its model + scale + interact range AND its placement metadata
    // (rarity / band / element). game.js iterates this registry and
    // dispatches by `kind`. See docs/npc-building-distribution-balancing.md.
    npcBuildings: {
        'skillTrainer:sword': {
            kind: 'skillTrainer',
            targetSkillId: 'sword',
            sourceTitle: '검술 대장간',
            modelPath: './asset/models/building/fig_s_blacksmith_shop.glb',
            modelScale: 3.15,
            modelLift: 1.05,
            modelYawOffset: 0,
            interactRange: 2.8,
            rarity: 'uncommon',
            role: 'weapon',
            element: 'physical',
            band: 'mid',
        },
        'skillTrainer:firebomb': {
            kind: 'skillTrainer',
            targetSkillId: 'firebomb',
            sourceTitle: '화염병 교관',
            modelPath: './asset/models/building/fig_s_apothecary.glb',
            modelScale: 2.75,
            modelLift: 1.0,
            modelYawOffset: 0,
            interactRange: 2.8,
            rarity: 'uncommon',
            role: 'alchemy',
            element: 'red',
            band: 'mid',
        },
        'skillTrainer:lightning': {
            kind: 'skillTrainer',
            targetSkillId: 'lightning',
            sourceTitle: '뇌전 첨탑',
            modelPath: './asset/models/building/fig_s_watchtower.glb',
            modelScale: 2.95,
            modelLift: 1.1,
            modelYawOffset: 0,
            interactRange: 2.8,
            rarity: 'uncommon',
            role: 'arcane',
            element: 'yellow',
            band: 'mid',
        },
        'skillTrainer:blackHole': {
            kind: 'skillTrainer',
            targetSkillId: 'blackHole',
            sourceTitle: '중력술 교관',
            modelPath: './asset/models/building/fig_s_magic_portal.glb',
            modelScale: 2.5,
            modelLift: 0.9,
            modelYawOffset: 0,
            interactRange: 2.8,
            rarity: 'rare',
            role: 'gravity',
            element: 'purple',
            band: 'far',
        },
        'skillTrainer:laser': {
            kind: 'skillTrainer',
            targetSkillId: 'laser',
            sourceTitle: '에너지 사출 연구소',
            modelPath: './asset/models/building/fig_s_ruined_tower.glb',
            modelScale: 2.85,
            modelLift: 1.05,
            modelYawOffset: 0,
            interactRange: 2.8,
            rarity: 'uncommon',
            role: 'arcane',
            element: 'blue',
            band: 'mid',
        },
        'skillTrainer:decoy': {
            kind: 'skillTrainer',
            targetSkillId: 'decoy',
            sourceTitle: '환영 허수아비 교관',
            modelPath: './asset/models/building/fig_s_forest_shrine.glb',
            modelScale: 2.75,
            modelLift: 1.0,
            modelYawOffset: 0,
            interactRange: 2.8,
            rarity: 'uncommon',
            role: 'illusion',
            element: 'purple',
            band: 'mid',
        },
        // Heal shrines (kind: 'healShrine'): three tiers of HP recovery.
        // Higher tier = more healing, longer cooldown, costlier instant
        // refresh. Per-planet placement: minor 1-2 + major 1-2 + elite 0-1
        // → total 2-5 shrines per planet (game.js samples a fixed 3-5 from
        // the union to honour the design intent).
        'healShrine:minor': {
            kind: 'healShrine',
            tier: 'minor',
            healPercent: 0.30,
            cooldown: 25,
            resetCost: { key: 'green', amount: 1 },
            sourceTitle: '소형 회복 제단',
            modelPath: './asset/models/building/fig_s_inn.glb',
            modelScale: 2.85,
            modelLift: 1.0,
            modelYawOffset: 0,
            interactRange: 2.6,
            rarity: 'common',
            role: 'heal',
            element: 'green',
            band: 'near',
            count: { min: 1, max: 2 },
        },
        'healShrine:major': {
            kind: 'healShrine',
            tier: 'major',
            healPercent: 0.50,
            cooldown: 60,
            resetCost: { key: 'green', amount: 2 },
            sourceTitle: '회복 사원',
            modelPath: './asset/models/building/fig_s_church_chapel.glb',
            modelScale: 2.8,
            modelLift: 1.05,
            modelYawOffset: 0,
            interactRange: 2.8,
            rarity: 'uncommon',
            role: 'heal',
            element: 'green',
            band: 'mid',
            count: { min: 1, max: 2 },
        },
        'healShrine:elite': {
            kind: 'healShrine',
            tier: 'elite',
            healPercent: 0.70,
            cooldown: 120,
            resetCost: { key: 'green', amount: 4 },
            sourceTitle: '치유의 성소',
            modelPath: './asset/models/building/fig_s_town_statue.glb',
            modelScale: 2.95,
            modelLift: 1.05,
            modelYawOffset: 0,
            interactRange: 2.8,
            rarity: 'rare',
            role: 'heal',
            element: 'green',
            band: 'far',
            count: { min: 1, max: 1 },
        },
        'statTrainer:maxHp': {
            kind: 'statTrainer',
            statId: 'maxHp',
            sourceTitle: '체력 단련소',
            modelPath: './asset/models/building/fig_s_grain_silo.glb',
            modelScale: 2.85,
            modelLift: 1.0,
            modelYawOffset: 0,
            interactRange: 2.6,
            rarity: 'common',
            role: 'stat',
            element: 'green',
            band: 'near',
            count: { min: 1, max: 2 },
            maxRank: 10,
            amountPerRank: 12,        // +12 max HP per rank
            baseCost: 2,
            costGrowth: 1.5,
            costElements: ['green', 'blue'],
        },
        'statTrainer:moveSpeed': {
            kind: 'statTrainer',
            statId: 'moveSpeed',
            sourceTitle: '주행 단련소',
            modelPath: './asset/models/building/fig_s_windmill.glb',
            modelScale: 2.65,
            modelLift: 1.05,
            modelYawOffset: 0,
            interactRange: 2.6,
            rarity: 'common',
            role: 'stat',
            element: 'yellow',
            band: 'near',
            count: { min: 1, max: 1 },
            maxRank: 6,
            amountPerRank: 0.04,      // +4% move speed per rank (read via *Mul)
            baseCost: 2,
            costGrowth: 1.6,
            costElements: ['yellow'],
        },
        'statTrainer:pickupRange': {
            kind: 'statTrainer',
            statId: 'pickupRange',
            sourceTitle: '집석 단련소',
            modelPath: './asset/models/building/fig_s_apothecary.glb',
            modelScale: 2.65,
            modelLift: 1.0,
            modelYawOffset: 0,
            interactRange: 2.6,
            rarity: 'common',
            role: 'stat',
            element: 'yellow',
            // Pulled to mid so the near band isn't a crowd of stat trainers.
            band: 'mid',
            count: { min: 1, max: 1 },
            maxRank: 5,
            amountPerRank: 0.10,      // +10% pickup radius per rank (read via *Mul)
            baseCost: 2,
            costGrowth: 1.55,
            costElements: ['yellow', 'green'],
        },
        'statTrainer:damage': {
            kind: 'statTrainer',
            statId: 'damage',
            sourceTitle: '단조 시설',
            modelPath: './asset/models/building/fig_s_forest_shrine.glb',
            modelScale: 2.7,
            modelLift: 1.0,
            modelYawOffset: 0,
            interactRange: 2.6,
            rarity: 'uncommon',
            role: 'stat',
            element: 'red',
            band: 'mid',
            count: { min: 1, max: 1 },
            maxRank: 8,
            amountPerRank: 0.05,      // +5% damage per rank
            baseCost: 3,
            costGrowth: 1.55,
            costElements: ['red', 'yellow'],
        },
    },

    materials: {
        player: {
            tint: '#ffffff',
            roughness: 0.9,
            metalness: 0,
            emissive: '#000000',
            emissiveIntensity: 0,
            envMapIntensity: 0.12,
            indirectLightIntensity: 0.25,
            opacity: 1,
            wireframe: false,
            toneMapped: true,
        },
        enemy: {
            tint: '#ffffff',
            roughness: 0.92,
            metalness: 0,
            emissive: '#000000',
            emissiveIntensity: 0,
            envMapIntensity: 0.1,
            indirectLightIntensity: 0.22,
            opacity: 1,
            wireframe: false,
            toneMapped: true,
        },
        home: {
            tint: '#ffffff',
            roughness: 0.86,
            metalness: 0.01,
            emissive: '#000000',
            emissiveIntensity: 0,
            envMapIntensity: 1,
            opacity: 1,
            wireframe: false,
            toneMapped: true,
        },
    },

    drops: {
        shardChance: 0.6,        // 0..1, per-enemy-death
        shardExp: 18,            // exp per shard pickup
        pickupRange: 1.3,        // arc distance
        shardSize: 0.28,
        // shardColor / shardEmissive are now derived per-element when an ore
        // is rolled; the shard mesh tints itself accordingly. These keys are
        // kept for backwards compatibility if any tooling still reads them.
        shardColor: 0xffd84f,
        shardEmissive: 0xff7a1f,
    },

    // Five-color resources + space survival meta. See docs/drop-resource-design.md.
    // The active planet's `bias` drives both drop rates and the world palette.
    //
    // Each entry MAY also declare a `surface` block to swap the procedural
    // planet shader for real PBR materials (ambientcg sets) blended by a
    // noise texture (joshbrew Noise_Textures). The shader stays procedural
    // until the textures load and then upgrades in place. Drop downloaded
    // sets into asset/textures/materials/* and asset/textures/noise/*
    // (see asset/textures/README.md and docs/planet-material-system.md).
    //
    //     surface: {
    //         materials: [
    //             { albedo: '...', roughness: '...', normal: '...' },
    //             ...   // up to 3 slots
    //         ],
    //         noise: '...',
    //     }
    activePlanet: 'ember',
    planets: {
        // `surface: { materialCount: N }` opts the planet into the PBR
        // pipeline with N random materials + a random noise picked from
        // `material-catalog.js` each session. To pin specific assets,
        // replace with explicit `materials: [...]` and `noise: '...'`.
        ember: {
            id: 'ember',
            name: '화염 행성',
            dominant: 'red',
            bias: { red: 3.0, yellow: 0.8, green: 0.6, blue: 0.5, purple: 0.7 },
            surface: { materialCount: 3 },
        },
        storm: {
            id: 'storm',
            name: '폭풍 행성',
            dominant: 'yellow',
            bias: { red: 0.7, yellow: 3.0, green: 0.5, blue: 0.8, purple: 0.6 },
            surface: { materialCount: 3 },
        },
        verdant: {
            id: 'verdant',
            name: '정글 행성',
            dominant: 'green',
            bias: { red: 0.5, yellow: 0.6, green: 3.0, blue: 0.7, purple: 0.9 },
            surface: { materialCount: 3 },
        },
        glacier: {
            id: 'glacier',
            name: '빙하 행성',
            dominant: 'blue',
            bias: { red: 0.5, yellow: 0.7, green: 0.6, blue: 3.0, purple: 0.8 },
            surface: { materialCount: 3 },
        },
        mire: {
            id: 'mire',
            name: '부식 행성',
            dominant: 'purple',
            bias: { red: 0.7, yellow: 0.5, green: 0.9, blue: 0.6, purple: 3.0 },
            surface: { materialCount: 3 },
        },
    },
};
