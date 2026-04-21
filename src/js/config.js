// Single source of truth for tunable values.
// Gameplay iteration = edit this file. Systems read from CONFIG.*.

export const CONFIG = {
    world: {
        groundSize: 80,
        bgColor: 0x181820,
        fogNear: 24,
        fogFar: 55,
    },

    camera: {
        fov: 55,
        height: 14,
        distance: 11,
        followSpeed: 6,
    },

    player: {
        modelPath: './asset/models/player/fig_ninja_kunoichi_stylized.glb',
        modelScale: 1.0,
        modelYawOffset: 0,       // radians, add if imported model faces wrong way
        moveSpeed: 5.5,
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
        contactRange: 1.1,
    },

    sword: {
        damage: 22,
        range: 2.6,              // radius of semicircle hitbox
        arcAngle: Math.PI,       // 반원 (180°)
        swingCooldown: 0.55,     // seconds
        swingDuration: 0.22,     // visible arc lifetime
        color: 0xff4d4d,
        opacity: 0.4,
    },

    spawner: {
        interval: 1.6,
        maxEnemies: 18,
        spawnRadiusMin: 12,
        spawnRadiusMax: 18,
    },
};
