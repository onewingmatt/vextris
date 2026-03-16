/// <reference types="vite/client" />

import type Phaser from 'phaser'
import type { AudioManager } from './game/audio'
import type { DevPanel } from './game/devPanel'

declare global {
  interface Window {
    game?: Phaser.Game
    __vextrisAudioContext?: AudioContext
    __vextrisAudioManager?: AudioManager
    __vextrisDevPanel?: DevPanel
  }
}

export {}