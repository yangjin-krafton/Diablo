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
