// Single source of truth for tunable values.
// Gameplay iteration = edit this file. Systems read from CONFIG.*.

export const CONFIG = {
    world: {
        planetRadius: 30,
        bgColor: 0x060610,
        planetColor: 0x2a2a36,
        planetEmissive: 0x0a0a14,
        starCount: 700,
        starDistance: 220,
        // scattered landmark props so rotation on the sphere is visible
        landmarks: {
            count: 60,
            minHeight: 0.8,
            maxHeight: 2.2,
            color: 0x4a4a5a,
        },
    },

    camera: {
        // Static camera. Positions itself at (0, R + height, distance) looking at
        // (0, R, 0) — the "visible top" of the planet, where the player is
        // always rendered. Adjust for wider/narrower 2D-feel.
        fov: 55,
        height: 22,
        distance: 24,
    },

    player: {
        modelPath: './asset/models/player/fig_ninja_kunoichi_stylized.glb',
        modelScale: 1.0,
        modelYawOffset: 0,       // radians, add if imported model faces wrong way
        moveSpeed: 5.5,          // linear speed along sphere surface
        maxHp: 100,
        radius: 0.4,
    },

    enemy: {
        modelPath: './asset/models/enemy/fig_abomination_chibi.glb',
        modelScale: 1.0,
        modelYawOffset: 0,
        moveSpeed: 2.4,
        maxHp: 30,
        radius: 0.5,
        contactDamage: 8,        // per second while touching player
        contactRange: 1.1,       // tangent-plane distance
    },

    sword: {
        damage: 22,
        range: 2.6,              // semicircle hitbox radius (tangent plane)
        arcAngle: Math.PI,       // 반원 (180°)
        swingCooldown: 0.55,
        swingDuration: 0.22,
        color: 0xff4d4d,
        opacity: 0.4,
        lift: 0.05,              // arc mesh height above surface
    },

    spawner: {
        interval: 1.6,
        maxEnemies: 18,
        spawnArcMin: 10,         // arc distance from player
        spawnArcMax: 18,
    },
};
