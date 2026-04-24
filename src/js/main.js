// Entry point. Create Game with the canvas element and start.

import { Game } from './game.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
game.start().catch((err) => {
    console.error('[Diablo] failed to start:', err);
    const loading = document.getElementById('loading');
    if (loading) loading.textContent = '오류가 발생했습니다. 콘솔을 확인하세요.';
});
