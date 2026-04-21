// DOM HUD binding. Reads game state each frame and writes to #hud-* spans.
// Extension: add more fields by adding spans to index.html and updating here.

export class Hud {
    constructor() {
        this.hp = document.getElementById('hud-hp');
        this.kills = document.getElementById('hud-kills');
        this.enemies = document.getElementById('hud-enemies');
    }

    update(player, spawner) {
        this.hp.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
        this.hp.style.color = player.hp > player.maxHp * 0.3 ? '#d8d8d8' : '#ff6464';
        this.kills.textContent = String(spawner.kills);
        this.enemies.textContent = String(spawner.enemies.length);
    }
}
