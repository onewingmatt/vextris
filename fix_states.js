const fs = require('fs');
let code = fs.readFileSync('src/game/scenes/GameScene.ts', 'utf8');

// Replace declarations
code = code.replace(/private gameOver = false\n/g, '');
code = code.replace(/private shopping = false/g, "private gameState: 'MENU' | 'PLAYING' | 'PAUSED' | 'SHOP' | 'GAMEOVER' = 'MENU'");

// Proper regex for usage:
code = code.replace(/(?<!\w)this\.shopping(?!\w)/g, "this.gameState === 'SHOP'");
code = code.replace(/(?<!\w)this\.gameOver(?!\w)/g, "this.gameState === 'GAMEOVER'");

// Also handle the assignments:
// this.gameOver = true  -> this.gameState = 'GAMEOVER'
// this.gameOver = false -> this.gameState = 'PLAYING'
// this.shopping = true  -> this.gameState = 'SHOP'
// this.shopping = false -> this.gameState = 'PLAYING'
code = code.replace(/this\.gameState === 'GAMEOVER' = true/g, "this.gameState = 'GAMEOVER'");
code = code.replace(/this\.gameState === 'GAMEOVER' = false/g, "this.gameState = 'PLAYING'");
code = code.replace(/this\.gameState === 'SHOP' = true/g, "this.gameState = 'SHOP'");
code = code.replace(/this\.gameState === 'SHOP' = false/g, "this.gameState = 'PLAYING'");

fs.writeFileSync('src/game/scenes/GameScene.ts', code, 'utf8');
