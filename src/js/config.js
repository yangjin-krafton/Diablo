// Single source of truth for tunable values.
// Gameplay iteration = edit this file. Systems read from CONFIG.*.

export const CONFIG = {
    world: {
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
        terrainDetail: 3,        // icosahedron subdivisions; faces = 20 * 4^detail
        terrainSeeds: 42,        // Voronoi seeds — more = smaller biome patches
        // scattered landmark props add 3D texture on top of the tiles
        landmarks: {
            count: 40,
            minHeight: 0.8,
            maxHeight: 2.2,
            color: 0x3a3a48,
        },
        // distant sun — source of the directional light and visible glow
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
        // (0, R, 0) — the "visible top" of the planet, where the player is
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
        arcAngle: Math.PI,       // 반원 (180°)
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

    spawner: {
        interval: 1.6,
        maxEnemies: 18,
        spawnArcMin: 10,         // arc distance from player
        spawnArcMax: 18,
        bossWaveInterval: 0.45,
        bossWaveMaxEnemies: 34,
        bossWaveSpawnArcMin: 4,
        bossWaveSpawnArcMax: 11,
    },

    home: {
        modelPath: './asset/models/building/fig_s_campfire_tent.glb',
        modelScale: 3.45,
        modelLift: 1.2,
        modelYawOffset: 0,
        spawnArcOffset: 5.5,     // arc distance from player's spawn point
        interactRange: 2.8,
        questKillTarget: 8,
        questRewardFuel: 1,
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

    // 적대 건물 등록 (요새 / 차원문 / 운송선). See §7-8 of
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
            band: 'near',
            count: { min: 2, max: 3 },
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
        // No fixed structure — the system runs the timer + warning ring + group
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
            band: 'near',
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
            roughness: 0.72,
            metalness: 0.03,
            emissive: '#000000',
            emissiveIntensity: 0,
            envMapIntensity: 1,
            opacity: 1,
            wireframe: false,
            toneMapped: true,
        },
        enemy: {
            tint: '#ffffff',
            roughness: 0.78,
            metalness: 0.02,
            emissive: '#000000',
            emissiveIntensity: 0,
            envMapIntensity: 1,
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

    // 5색 자원 + 우주 생존 메타. See docs/drop-resource-design.md.
    // The active planet's `bias` drives both drop rates and the world palette.
    activePlanet: 'ember',
    planets: {
        ember: {
            id: 'ember',
            name: '화염 행성',
            dominant: 'red',
            bias: { red: 3.0, yellow: 0.8, green: 0.6, blue: 0.5, purple: 0.7 },
        },
        storm: {
            id: 'storm',
            name: '폭풍 행성',
            dominant: 'yellow',
            bias: { red: 0.7, yellow: 3.0, green: 0.5, blue: 0.8, purple: 0.6 },
        },
        verdant: {
            id: 'verdant',
            name: '정글 행성',
            dominant: 'green',
            bias: { red: 0.5, yellow: 0.6, green: 3.0, blue: 0.7, purple: 0.9 },
        },
        glacier: {
            id: 'glacier',
            name: '빙하 행성',
            dominant: 'blue',
            bias: { red: 0.5, yellow: 0.7, green: 0.6, blue: 3.0, purple: 0.8 },
        },
        mire: {
            id: 'mire',
            name: '부식 행성',
            dominant: 'purple',
            bias: { red: 0.7, yellow: 0.5, green: 0.9, blue: 0.6, purple: 3.0 },
        },
    },
};
