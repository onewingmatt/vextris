import Phaser from 'phaser'
import { GameScene } from './game/scenes/GameScene'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 640,
  height: 768,
  scale: {
    mode: Phaser.Scale.ScaleModes.FIT,
    autoCenter: Phaser.Scale.Center.CENTER_BOTH
  },
  parent: 'game',
  scene: [GameScene],
  pixelArt: false,
  antialias: true,
}

const game = new Phaser.Game(config)

// Ensure crisp pixels
game.canvas.style.imageRendering = 'pixelated'
