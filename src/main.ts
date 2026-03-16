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

function showFatalError(message: string): void {
  console.error('[Vextris]', message)
  const container = document.getElementById('game') ?? document.body
  const errorDiv = document.createElement('div')
  errorDiv.style.cssText =
    'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
    'background:#07060b;color:#c76559;font-family:monospace;font-size:14px;padding:24px;text-align:center;'
  errorDiv.textContent = `Failed to start Vextris: ${message}`
  container.appendChild(errorDiv)
}

let game: Phaser.Game
try {
  game = new Phaser.Game(config)

  // Expose the Phaser Game instance on window for debugging/demo automation
  ;(window as { game?: Phaser.Game }).game = game

  // Ensure crisp pixels — canvas is guaranteed present after Phaser init
  game.canvas.style.imageRendering = 'pixelated'
} catch (err) {
  showFatalError(err instanceof Error ? err.message : String(err))
}
