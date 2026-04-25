// Entry point. Create Game with the canvas element and start.

import { Game } from './game.js';
import { installSwordEffectEditor } from './debug/sword-effect-editor.js';
import { installMaterialEditor } from './debug/material-editor.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
window.diablo = { game };

game.start()
    .then(() => {
        installSwordEffectEditor(game);
        installMaterialEditor(game);
        console.info('[Diablo] console tools: diablo.openSwordEditor(), diablo.openMaterialEditor()');
    })
    .catch((err) => {
        console.error('[Diablo] failed to start:', err);
        const loading = document.getElementById('loading');
        if (loading) loading.textContent = 'Error loading. Check the console.';
    });
