import Phaser from 'phaser'
import { GameScene } from './game/scenes/GameScene'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 640,
  height: 768,
  scale: {
    mode: Phaser.Scale.ScaleModes.NONE,
  },
  parent: 'game',
  scene: [GameScene],
  pixelArt: false,
  antialias: true,
}

let game: Phaser.Game | undefined
try {
  game = new Phaser.Game(config)
} catch (err) {
  showFatalError(err instanceof Error ? err.message : String(err))
}

// Expose the Phaser Game instance on window for debugging/demo automation
if (game) {
  window.game = game
  game.canvas.style.imageRendering = 'pixelated'
}

/** Render a visible in-page error when Phaser init fails. */
function showFatalError(msg: string) {
  const el = document.getElementById('game')
  if (el) {
    el.innerHTML = `<div style="padding:40px;text-align:center;color:#c00">
      <h2>Failed to start</h2>
      <pre style="margin-top:12px;font-size:14px">${msg}</pre>
    </div>`
  }
}
