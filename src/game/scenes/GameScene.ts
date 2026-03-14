

import Phaser from 'phaser'
import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  BLOCK_SIZE,
  COLORS,
  Cell,
  Position,
  Piece,
  GRAVITY_TABLE,
  DAS_DELAY,
  ARR_DELAY,
  INITIAL_LEVEL,
  LINES_PER_LEVEL,
  PIECES,
  BLOCK_COLORS,
  LevelParams,
  getLevelParams,
} from '../config'
import {
  Vex,
  ScoringContext,
  VexRank,
  getLeadFingersDASBonus,
  getLeadFingersARRBonus,
  getWhiplashDuration,
  getMirageConfig,
  getJinxedConfig,
  getPressureTimeLimit,
} from '../vex'
import { showVexShop } from '../shop'
import { DevPanel } from '../devPanel'
import { updateVexBar } from '../vexBar'
import { disableBlackout } from '../effects/blackout'
import { setFogHeight, disableFog } from '../effects/fog'
import { enableTremor, disableTremor } from '../effects/tremor'
import { enableWhiplash, disableWhiplash, triggerWhiplash } from '../effects/whiplash'
import { audioManager } from '../audio'
import { ensureSoundControls } from '../soundControls'

export class GameScene extends Phaser.Scene {
  private static readonly BGM_URL = '/Hex%20Cabin%20Riddles.mp3'

  private board: Cell[][] = []
  private currentPiece: Piece | null = null
  private nextPiece: Piece | null = null
  private heldPiece: Piece | null = null
  private canHold = true
  private score = 0              // total run score
  private level = INITIAL_LEVEL  // gravity level (separate from progression level)
  private lines = 0
  private gravityTimer = 0
  private gravityDelay = GRAVITY_TABLE[0]
    private clearingLines: number[] = []
  private scoringClusters: { blocks: { x: number, y: number }[], color: number }[] = []
  private clearTimer = 0


  // --- Level Progression ---
  private currentLevel = 1
  private currentLevelScore = 0          // score earned this level only
  private currentLevelParams!: LevelParams
  private resolveCurrent = 0             // current Resolve remaining this level

  // Resolve drain tuning (can be tweaked for difficulty)
  private readonly REALTIME_DRAIN_PER_SECOND = 0.3  // more forgiving real-time drain
  private readonly PERPIECE_DRAIN = 0.8                // more forgiving drain per piece lock

  // --- Vex System ---
  /** Active Vexes for this run; all always-on once taken. */
  private activeVexes: Vex[] = []
  /** Number of scoring moves (line-clears) this run. Used by ScoringContext. */
  private moveIndex = 0
  /** Consecutive scoring moves without a break. Unused for now; always 0. */
  private combo = 0
  /** True while the between-level shop is open; pauses all game logic. */
  private gameState: 'MENU' | 'PLAYING' | 'PAUSED' | 'SHOP' | 'GAMEOVER' = 'MENU'

  /** Timer IDs for Vex effects (e.g., Rising Dread's garbage timer). Keyed by vex.id. */
  private vexIntervals: Map<string, NodeJS.Timeout> = new Map()

  // Object pools for particles and floating texts to avoid allocation churn
  private particlePool: { x: number, y: number, vx: number, vy: number, life: number, color: number, active: boolean, rotation?: number, rotationVelocity?: number, size?: number }[] = []
  private floatingTextPool: { x: number, y: number, text: string, life: number, color: string, scale: number, active: boolean }[] = []

  private graphics!: Phaser.GameObjects.Graphics
  private gameOverBg!: Phaser.GameObjects.Rectangle
  private gameOverText!: Phaser.GameObjects.Text
  // HUD text references
  private hudLevelText!: Phaser.GameObjects.Text
  private hudScoreText!: Phaser.GameObjects.Text  // "cur / target"
  private hudTimeText!: Phaser.GameObjects.Text
  private hudSpeedText!: Phaser.GameObjects.Text  // gravity speed level
  private hudNextLabelText!: Phaser.GameObjects.Text
  private hudHoldLabelText!: Phaser.GameObjects.Text
  // HUD dirty tracking - cache previous values to avoid unnecessary setText() calls
  private lastHudLevel = -1
  private lastHudScore = -1
  private lastHudScoreTarget = -1
  private lastHudTime = -1
  private lastHudResolveMax = -1
  private lastHudSpeed = -1
  // Cached always-visible multiplier values for the scoreline multiplier chips.
  private lastColorMult = 1
  private lastLineMult = 1
  private lastCalcTimestamp = 0
  private lastCalcBox!: Phaser.GameObjects.Rectangle
  private lastChips!: { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text; label: Phaser.GameObjects.Text; config: { id: string; icon: string; label: string; color: number; width: number }; clusterTexts?: Phaser.GameObjects.Text[] }[]
  private fogRank = 0
  private fogHeightPx = 0
  private prevFogRank = -1 // Track rank changes to invalidate cache
  private colorDesaturationCache = new Map<number, number>() // Cache: original color -> desaturated color

  // Ghost piece rendering (no caching needed - validation is fast enough)
  // Removed in favor of simplicity; recalculates every frame

  // FPS cap tuning
  private readonly TARGET_FPS = 60
  private readonly FRAME_TIME_MS = 1000 / this.TARGET_FPS
  private lastUpdateTime = 0

  /** Dev panel (dev builds only) — backtick to open/close */
  private devPanel?: DevPanel

  // Input handling
  private leftKey!: Phaser.Input.Keyboard.Key
  private rightKey!: Phaser.Input.Keyboard.Key
  private downKey!: Phaser.Input.Keyboard.Key
  private upKey!: Phaser.Input.Keyboard.Key
  private zKey!: Phaser.Input.Keyboard.Key
  private xKey!: Phaser.Input.Keyboard.Key
  private spaceKey!: Phaser.Input.Keyboard.Key
  private pKey!: Phaser.Input.Keyboard.Key
  private escKey!: Phaser.Input.Keyboard.Key

  // DAS variables
  private leftDownTime = 0
  private rightDownTime = 0
  private lastLeftMove = 0
  private lastRightMove = 0
  private lastFogPulseAtMs = 0
  private lastBlackoutPulseAtMs = 0
  private lastGhostVisible = true
  private mirageActive = false
  private mirageColOffset = 0
  private pressureCountdown: number | null = null
  private corruptionPulseTimer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    super({ key: 'GameScene' })
  }

  private formatMultiplierValue(mult: number): string {
    return `x${mult.toFixed(2)}`
  }

  private getActiveVexRank(vexId: string): VexRank | 0 {
    return this.activeVexes.find(vex => vex.id === vexId)?.rank ?? 0
  }

  private getQuicksandGravityScale(rank: VexRank | 0): number {
    if (rank <= 0) return 1

    // Quicksand should feel consistently "fast" without escalating every rank.
    return 0.78
  }

  private getAmnesiaRank(): VexRank | 0 {
    return this.getActiveVexRank('amnesia')
  }

  private blendColorToGray(color: number, amount: number): number {
    const blend = Math.max(0, Math.min(1, amount))
    if (blend <= 0) return color

    const red = (color >> 16) & 0xff
    const green = (color >> 8) & 0xff
    const blue = color & 0xff
    const gray = Math.round(0.299 * red + 0.587 * green + 0.114 * blue)

    const outRed = Math.round(red * (1 - blend) + gray * blend)
    const outGreen = Math.round(green * (1 - blend) + gray * blend)
    const outBlue = Math.round(blue * (1 - blend) + gray * blend)

    return (outRed << 16) | (outGreen << 8) | outBlue
  }

  private blendColors(colorA: number, colorB: number, amount: number): number {
    const blend = Math.max(0, Math.min(1, amount))
    const aR = (colorA >> 16) & 0xff
    const aG = (colorA >> 8) & 0xff
    const aB = colorA & 0xff
    const bR = (colorB >> 16) & 0xff
    const bG = (colorB >> 8) & 0xff
    const bB = colorB & 0xff

    const outR = Math.round(aR * (1 - blend) + bR * blend)
    const outG = Math.round(aG * (1 - blend) + bG * blend)
    const outB = Math.round(aB * (1 - blend) + bB * blend)
    return (outR << 16) | (outG << 8) | outB
  }

  private colorToHexString(color: number): string {
    return `#${color.toString(16).padStart(6, '0')}`
  }

  private getLineClearThemeColor(linesCleared: number): number {
    const clampedLines = Math.max(1, Math.min(4, linesCleared))
    const lineAccentByCount = [0, 0x7eaec0, 0x7fbf93, 0xc9a064, 0xbb635a]

    const sortedClusters = [...this.scoringClusters].sort((left, right) => right.blocks.length - left.blocks.length)
    let themeColor = sortedClusters[0]?.color ?? lineAccentByCount[clampedLines]
    themeColor = this.blendColors(themeColor, lineAccentByCount[clampedLines], 0.35)

    if (this.getActiveVexRank('corruption') > 0) {
      themeColor = this.blendColors(themeColor, 0x8754b5, 0.18)
    }
    if (this.getActiveVexRank('fog') > 0 || this.getActiveVexRank('blackout') > 0) {
      themeColor = this.blendColors(themeColor, 0xaaa39c, 0.22)
    }

    return themeColor
  }

  private getLineClearCallout(linesCleared: number): string | null {
    if (linesCleared >= 4) return 'HEX SWEEP'
    return null
  }

  private getAmnesiaPieceDesaturation(rank: VexRank | 0): number {
    const values: number[] = [0, 0, 0, 0.55, 0.7, 0.82, 0.9, 0.95, 0.98, 1, 1]
    return values[Math.max(0, Math.min(10, rank))]
  }

  private getAmnesiaBoardDesaturation(rank: VexRank | 0): number {
    const values: number[] = [0, 0, 0, 0, 0, 0.15, 0.3, 0.45, 0.6, 0.8, 1]
    return values[Math.max(0, Math.min(10, rank))]
  }

  private getAmnesiaGhostVisibilityChance(rank: VexRank | 0): number {
    const values: number[] = [1, 0.95, 0.9, 0.82, 0.72, 0.6, 0.48, 0.36, 0.24, 0.14, 0.08]
    return values[Math.max(0, Math.min(10, rank))]
  }

  private getAmnesiaGhostFlickerWindowMs(rank: VexRank | 0): number {
    const values: number[] = [9999, 260, 220, 190, 160, 140, 120, 105, 90, 80, 70]
    return values[Math.max(0, Math.min(10, rank))]
  }

  private getAmnesiaGhostAlpha(rank: VexRank | 0): number {
    const values: number[] = [0.2, 0.18, 0.17, 0.16, 0.14, 0.12, 0.1, 0.08, 0.07, 0.06, 0.05]
    return values[Math.max(0, Math.min(10, rank))]
  }

  private rotatePieceDataClockwise(shape: number[][], colors: number[][]): { shape: number[][]; colors: number[][] } {
    const rows = shape.length
    const cols = shape[0].length
    const rotatedShape = Array.from({ length: cols }, () => Array(rows).fill(0))
    const rotatedColors = Array.from({ length: cols }, () => Array(rows).fill(0))

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        rotatedShape[x][rows - 1 - y] = shape[y][x]
        rotatedColors[x][rows - 1 - y] = colors[y][x]
      }
    }

    return { shape: rotatedShape, colors: rotatedColors }
  }

  private applyJinxedSpawnMutations(): void {
    if (!this.currentPiece) return

    const rank = this.getActiveVexRank('jinxed')
    if (rank <= 0) return

    const cfg = getJinxedConfig(rank as VexRank)
    const shouldRotate = cfg.alwaysRotate || Math.random() < cfg.rotateChance

    if (shouldRotate) {
      let nextShape = this.currentPiece.shape
      let nextColors = this.currentPiece.colors
      const rotationCount = 1 + Math.floor(Math.random() * 3)

      for (let step = 0; step < rotationCount; step++) {
        const rotated = this.rotatePieceDataClockwise(nextShape, nextColors)
        nextShape = rotated.shape
        nextColors = rotated.colors
      }

      if (this.isValidPosition(nextShape, this.currentPiece.position)) {
        this.currentPiece.shape = nextShape
        this.currentPiece.colors = nextColors
      }
    }

    if (cfg.colorScramble) {
      const randomColor = Phaser.Utils.Array.GetRandom(BLOCK_COLORS)
      this.currentPiece.colors = this.currentPiece.shape.map((row) =>
        row.map((block) => (block ? randomColor : 0))
      )
    }

    if (cfg.columnJitter > 0) {
      const offsets: number[] = []
      for (let offset = -cfg.columnJitter; offset <= cfg.columnJitter; offset++) {
        if (offset !== 0) offsets.push(offset)
      }
      Phaser.Utils.Array.Shuffle(offsets)

      for (const offset of offsets) {
        const candidate = {
          x: this.currentPiece.position.x + offset,
          y: this.currentPiece.position.y,
        }
        if (this.isValidPosition(this.currentPiece.shape, candidate)) {
          this.currentPiece.position = candidate
          break
        }
      }
    }
  }

  private startMirageTimer(rank: VexRank): void {
    const cfg = getMirageConfig(rank)

    const scheduleCycle = () => {
      const offTimer = setTimeout(() => {
        if (this.gameState !== 'SHOP' && this.gameState !== 'GAMEOVER') {
          this.mirageActive = true
          let colOffset = Phaser.Math.Between(-cfg.colRange, cfg.colRange)
          if (colOffset === 0) {
            colOffset = Math.random() < 0.5 ? -1 : 1
          }
          this.mirageColOffset = colOffset
        }

        const onTimer = setTimeout(() => {
          this.mirageActive = false
          this.mirageColOffset = 0
          scheduleCycle()
        }, cfg.onMs)
        this.vexIntervals.set('mirage', onTimer)
      }, cfg.offMs)
      this.vexIntervals.set('mirage', offTimer)
    }

    scheduleCycle()
  }

  private resetPressureCountdownForCurrentPiece(): void {
    const rank = this.getActiveVexRank('pressure')
    if (rank > 0 && this.currentPiece) {
      this.pressureCountdown = getPressureTimeLimit(rank as VexRank)
      return
    }
    this.pressureCountdown = null
  }

  private triggerCorruptionPulse(rank: VexRank): void {
    if (rank < 5) return
    const canvas = this.game.canvas as HTMLCanvasElement | null
    if (!canvas) return

    if (this.corruptionPulseTimer !== null) {
      clearTimeout(this.corruptionPulseTimer)
      this.corruptionPulseTimer = null
    }

    const intensity = rank >= 8 ? 1.8 : 1.5
    canvas.style.filter = `brightness(${intensity}) saturate(0)`

    this.corruptionPulseTimer = setTimeout(() => {
      canvas.style.filter = ''
      this.corruptionPulseTimer = null
    }, 200)
  }

  private getFogOccludedAlpha(rank: number): number {
    const clampedRank = Math.max(0, Math.min(10, Math.floor(rank)))
    const values: number[] = [1, 1, 0.98, 0.96, 0.93, 0.88, 0.8, 0.7, 0.55, 0.4, 0.28]
    return values[clampedRank]
  }

  private getFogHardOcclusionFactor(rank: number): number {
    const clampedRank = Math.max(0, Math.min(10, Math.floor(rank)))
    const values: number[] = [0, 0, 0, 0, 0, 0.15, 0.28, 0.45, 0.62, 0.8, 1]
    return values[clampedRank]
  }

  private shouldRenderGhostForAmnesia(rank: VexRank | 0): boolean {
    if (rank <= 0) return true

    const chance = this.getAmnesiaGhostVisibilityChance(rank)
    if (chance >= 1) return true

    const windowMs = this.getAmnesiaGhostFlickerWindowMs(rank)
    const bucket = Math.floor(this.time.now / windowMs)

    // Deterministic pseudo-random value per time window so flicker feels jittery
    // but does not vary per frame.
    const hashed = ((bucket * 1103515245 + rank * 12345) >>> 0) / 0xffffffff
    return hashed < chance
  }

  private getCorruptionParams(rank: VexRank): { intervalMs: number; cellsPerTick: number } {
    const intervalByRank = [0, 8000, 7200, 6400, 5600, 5000, 4400, 3800, 3200, 2600, 2200]
    const cellsByRank = [0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5]
    return {
      intervalMs: intervalByRank[rank],
      cellsPerTick: cellsByRank[rank],
    }
  }

  private applyCorruptionTick(rank: VexRank, cellsPerTick: number): void {
    if (cellsPerTick <= 0) return

    const filledCells: { x: number; y: number; color: number }[] = []
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        if (this.board[y][x].filled) {
          filledCells.push({ x, y, color: this.board[y][x].color })
        }
      }
    }

    if (filledCells.length === 0) return

    const visited = new Set<string>()
    let largestCluster: { x: number; y: number }[] = []

    for (const cell of filledCells) {
      const key = `${cell.x},${cell.y}`
      if (visited.has(key)) continue

      const cluster: { x: number; y: number }[] = []
      const queue: { x: number; y: number }[] = [{ x: cell.x, y: cell.y }]
      visited.add(key)

      while (queue.length > 0) {
        const current = queue.shift()!
        cluster.push(current)

        const neighbors = [
          { x: current.x + 1, y: current.y },
          { x: current.x - 1, y: current.y },
          { x: current.x, y: current.y + 1 },
          { x: current.x, y: current.y - 1 },
        ]

        for (const neighbor of neighbors) {
          if (neighbor.x < 0 || neighbor.x >= BOARD_WIDTH || neighbor.y < 0 || neighbor.y >= BOARD_HEIGHT) {
            continue
          }

          const neighborKey = `${neighbor.x},${neighbor.y}`
          if (visited.has(neighborKey)) continue

          const neighborCell = this.board[neighbor.y][neighbor.x]
          if (!neighborCell.filled || neighborCell.color !== cell.color) continue

          visited.add(neighborKey)
          queue.push(neighbor)
        }
      }

      if (cluster.length > largestCluster.length) {
        largestCluster = cluster
      }
    }

    const targetPool = [...largestCluster]
    if (targetPool.length < cellsPerTick) {
      const used = new Set(targetPool.map((c) => `${c.x},${c.y}`))
      for (const cell of filledCells) {
        const key = `${cell.x},${cell.y}`
        if (!used.has(key)) {
          targetPool.push({ x: cell.x, y: cell.y })
        }
      }
    }

    const changes = Math.min(cellsPerTick, targetPool.length)
    for (let index = 0; index < changes; index++) {
      const pick = Math.floor(Math.random() * targetPool.length)
      const { x, y } = targetPool.splice(pick, 1)[0]
      const current = this.board[y][x].color

      let nextColor = current
      for (let attempt = 0; attempt < 6 && nextColor === current; attempt++) {
        nextColor = BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)]
      }
      this.board[y][x].color = nextColor
    }

    this.triggerCorruptionPulse(rank)
  }

  private startCorruptionTimer(rank: VexRank): void {
    const { intervalMs, cellsPerTick } = this.getCorruptionParams(rank)

    const scheduleTick = () => {
      const timeoutId = setTimeout(() => {
        if (this.gameState !== 'SHOP' && this.gameState !== 'GAMEOVER') {
          this.applyCorruptionTick(rank, cellsPerTick)
          audioManager.playSfx('corruption', { rank })
        }
        scheduleTick()
      }, intervalMs)
      this.vexIntervals.set('corruption', timeoutId)
    }

    scheduleTick()
  }

  create() {
    // Initialise run state (Vexes, level progression, score counters)
    this.initRun()

    // Create rising dirt overlay if it doesn't exist
    let overlay = document.getElementById('rising-dirt-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'rising-dirt-overlay';
      const gameContainer = document.getElementById('game');
      if (gameContainer) {
        gameContainer.appendChild(overlay);
      }
    }

    // Initialize board
    this.initializeBoard()

    // Generate first next piece
    this.generateNextPiece()

    // Spawn first piece
    this.spawnPiece()

    // Set up input
    this.setupInput()

    // Audio: start BGM + controls, with first-gesture unlock for browsers.
    audioManager.init()
    audioManager.startBgm(GameScene.BGM_URL)
    this.input.once('pointerdown', () => {
      audioManager.unlock()
      audioManager.startBgm(GameScene.BGM_URL)
    })
    this.input.keyboard?.once('keydown', () => {
      audioManager.unlock()
      audioManager.startBgm(GameScene.BGM_URL)
    })
    ensureSoundControls()
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => audioManager.stopBgm())
    this.events.once(Phaser.Scenes.Events.DESTROY, () => audioManager.stopBgm())

    // Set background
    this.cameras.main.setBackgroundColor(COLORS.background)

    // Board and HUD layout

    // Create graphics for rendering
    this.graphics = this.add.graphics();
    this.setupUI();

    const hudX = 416;
    let hudY = 112;

    // HUD Panel background
    this.add.rectangle(hudX - 16, hudY - 16, 208, 608, 0x130f16, 0.74).setOrigin(0, 0).setStrokeStyle(4, 0x4a2c34);

    const hudFont = {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#d8c5b1',
    };
    const hudValueFont = { ...hudFont, fontSize: '14px' };

    // SEAL
    this.add.text(hudX, hudY, 'SEAL', hudFont).setOrigin(0, 0);
    this.hudLevelText = this.add.text(hudX, hudY + 20, '1', { ...hudFont, color: '#c56b5c', fontSize: '22px' }).setOrigin(0, 0);
    hudY += 60;

    // TRIBUTE  (cur / target)
    this.add.text(hudX, hudY, 'TRIBUTE', hudFont).setOrigin(0, 0);
    this.hudScoreText = this.add.text(hudX, hudY + 20, '0/800', { ...hudValueFont, color: '#9dbbc7' }).setOrigin(0, 0);
    hudY += 60;

    // TIME
    this.add.text(hudX, hudY, 'RESOLVE', hudFont).setOrigin(0, 0);
    this.hudTimeText = this.add.text(hudX, hudY + 20, '80/80', { ...hudValueFont, color: '#cfad72' }).setOrigin(0, 0);
    hudY += 60;

    // SPEED (gravity level)
    this.add.text(hudX, hudY, 'SPEED', hudFont).setOrigin(0, 0);
    this.hudSpeedText = this.add.text(hudX, hudY + 20, '0', { ...hudValueFont, color: '#ba6b5f' }).setOrigin(0, 0);
    hudY += 60;

    // NEXT
    this.hudNextLabelText = this.add.text(hudX, hudY, 'NEXT', hudFont).setOrigin(0, 0);
    hudY += 145;

    // HOLD
    this.hudHoldLabelText = this.add.text(hudX, hudY, 'HOLD', hudFont).setOrigin(0, 0);

    // Last full-clear calculation — two-row scoreline panel
    const boardBottomY = 112 + BOARD_HEIGHT * BLOCK_SIZE;
    const boardLeftX = 48;
    // Stretch from board left to near right edge of game (640px wide)
    const boxWidth = 640 - boardLeftX - 20; // 572px available
    const boxHeight = 62;
    const boxX = boardLeftX + boxWidth / 2;
    const boxY = boardBottomY + 8;

    // Background panel
    this.lastCalcBox = this.add.rectangle(boxX, boxY, boxWidth, boxHeight, 0x0f0c12, 0.95)
      .setOrigin(0.5, 0).setDepth(5).setStrokeStyle(2, 0x4a2c34);

    // Top accent line
    this.add.rectangle(boxX, boxY, boxWidth, 2, 0x7a4248, 0.8).setOrigin(0.5, 0).setDepth(6);

    // Top row: breakdown chips [clusters] [lines] [color mult] [line mult]
    const topConfigs = [
      // Top row: single full-width CLUSTER chip
      { id: 'clusters', icon: '@', label: 'CLUSTER', color: 0x8f7764, width: boxWidth - 32 },
    ];

    const chipGap = 6;
    const topChipY = boxY + 19;
    this.lastChips = [];
    // Single full-width CLUSTER chip, centered
    const clusterConfig = topConfigs[0];
    const clusterBg = this.add.rectangle(boxX, topChipY, clusterConfig.width, 20, 0x1a141c, 0.9)
      .setOrigin(0.5, 0.5).setDepth(6).setStrokeStyle(1, clusterConfig.color);
    this.add.rectangle(boxX - clusterConfig.width / 2 + 14, topChipY, 14, 14, clusterConfig.color, 0.22)
      .setOrigin(0.5, 0.5).setDepth(7).setStrokeStyle(1, clusterConfig.color, 0.8);
    this.add.text(boxX - clusterConfig.width / 2 + 14, topChipY, clusterConfig.icon, {
      fontSize: '8px', fontFamily: '"Press Start 2P", monospace', color: '#f0e6d8',
    }).setOrigin(0.5, 0.5).setDepth(8);
    const clusterLabel = this.add.text(boxX - clusterConfig.width / 2 + 25, topChipY, clusterConfig.label, {
      fontSize: '8px', fontFamily: '"Press Start 2P", monospace', color: '#b8a796', align: 'left', padding: { left: 0, right: 0, top: 0, bottom: 0 }
    }).setOrigin(0, 0.5).setDepth(7);
    const clusterValueText = this.add.text(boxX + clusterConfig.width / 2 - 10, topChipY, '', {
      fontSize: '9px', fontFamily: '"Press Start 2P", monospace', color: '#efe1d3', align: 'right', padding: { left: 0, right: 0, top: 0, bottom: 0 }
    }).setOrigin(1, 0.5).setDepth(7);
    let clusterTexts: Phaser.GameObjects.Text[] = [];
    this.lastChips.push({ bg: clusterBg, text: clusterValueText, label: clusterLabel, config: clusterConfig, clusterTexts });

    // Bottom row: separator line and TOTAL
    const separatorY = boxY + 34;
    this.add.rectangle(boxX, separatorY, boxWidth - 20, 1, 0x3a2b33, 0.8)
      .setOrigin(0.5, 0.5).setDepth(6);

    // Bottom row: CLEARED (left), multipliers (middle), TOTAL (right)
    const bottomConfigs = [
      { id: 'cleared', icon: '#', label: 'CLEARED', color: 0x8f7764, width: 92 },
      { id: 'color', icon: 'C', label: 'COLOR', color: 0x7db0be, width: 98 },
      { id: 'lineMult', icon: 'L', label: 'LINE', color: 0xc5965d, width: 108 },
      { id: 'total', icon: 'T', label: 'TOTAL', color: 0xc76f5f, width: 180 },
    ];
    const bottomContentWidth = bottomConfigs.reduce((sum, c) => sum + c.width, 0);
    const bottomTotalGap = chipGap * (bottomConfigs.length - 1);
    const bottomStartX = boxX - (bottomContentWidth + bottomTotalGap) / 2;
    const bottomChipY = boxY + 49;

    let bottomChipX = bottomStartX;
    for (const config of bottomConfigs) {
      const bg = this.add.rectangle(bottomChipX + config.width / 2, bottomChipY, config.width, 20, config.id === 'total' ? 0x241617 : 0x1a141c, config.id === 'total' ? 0.95 : 0.9)
        .setOrigin(0.5, 0.5).setDepth(6).setStrokeStyle(config.id === 'total' ? 2 : 1, config.color, config.id === 'total' ? 0.95 : 0.8);

      this.add.rectangle(bottomChipX + 14, bottomChipY, 14, 14, config.color, config.id === 'total' ? 0.25 : 0.22)
        .setOrigin(0.5, 0.5).setDepth(7).setStrokeStyle(1, config.color, config.id === 'total' ? 0.9 : 0.8);
      this.add.text(bottomChipX + 14, bottomChipY, config.icon, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: config.id === 'total' ? '#f4ded5' : '#f0e6d8',
      }).setOrigin(0.5, 0.5).setDepth(8);

      const labelText = this.add.text(bottomChipX + 25, bottomChipY, config.label, {
        fontSize: config.id === 'total' ? '9px' : '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: config.id === 'total' ? '#ddb6aa' : '#b8a796',
        fontStyle: config.id === 'total' ? 'bold' : undefined,
        align: 'left',
        padding: { left: 0, right: 0, top: 0, bottom: 0 }
      }).setOrigin(0, 0.5).setDepth(7);

      const valueText = this.add.text(bottomChipX + config.width - 10, bottomChipY, '', {
        fontSize: config.id === 'total' ? '12px' : '9px',
        fontFamily: '"Press Start 2P", monospace',
        color: config.id === 'total' ? '#f7e1d5' : '#efe1d3',
        fontStyle: config.id === 'total' ? 'bold' : undefined,
        align: 'right',
        padding: { left: 0, right: 0, top: 0, bottom: 0 }
      }).setOrigin(1, 0.5).setDepth(7);

      (bg as any).chipColor = config.color;
      this.lastChips.push({ bg, text: valueText, label: labelText, config });
      bottomChipX += config.width + chipGap;
    }

    const bottomChipMap = new Map(this.lastChips.map(c => [c.config.id, c]))
    bottomChipMap.get('color')?.text.setText(this.formatMultiplierValue(this.lastColorMult))
    bottomChipMap.get('lineMult')?.text.setText(this.formatMultiplierValue(this.lastLineMult))
    bottomChipMap.get('color')?.label.setVisible(false)
    bottomChipMap.get('lineMult')?.label.setVisible(false)

    // Game Over UI
    const gameOverX = 320; // Center of the 640px wide game
    const gameOverY = Math.floor(112 + (BOARD_HEIGHT * BLOCK_SIZE) / 2);

    this.gameOverBg = this.add.rectangle(gameOverX, gameOverY, 600, 160, 0x000000, 0.9)
      .setVisible(false).setDepth(9).setStrokeStyle(4, 0xc66a5c);

    this.gameOverText = this.add.text(gameOverX, gameOverY, 'GAME OVER', {
      fontSize: '24px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#c66a5c',
      align: 'center',
    }).setOrigin(0.5).setShadow(4, 4, '#000', 0, true, true).setVisible(false).setDepth(10);

    // Dev panel (backtick to toggle) is available only in development builds
    const isDevBuild = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
    if (isDevBuild) {
      this.devPanel = new DevPanel(this.activeVexes, () => {
        // When dev panel changes vexes, re-setup all effects
        this.clearAllVexTimers();
        this.setupVexEffects();
      })
      this.devPanel.bindKey()
    }
  }

  private renderBoardSigils(boardOffsetX: number, boardOffsetY: number): void {
    const boardWidthPx = BOARD_WIDTH * BLOCK_SIZE
    const boardHeightPx = BOARD_HEIGHT * BLOCK_SIZE
    const right = boardOffsetX + boardWidthPx
    const bottom = boardOffsetY + boardHeightPx
    const sigilColor = 0x7a4248
    const emberDot = 0xcfb18a
    const pad = 7
    const arm = 12

    this.graphics.lineStyle(1, sigilColor, 0.52)

    this.graphics.moveTo(boardOffsetX - pad, boardOffsetY + arm)
      .lineTo(boardOffsetX - pad, boardOffsetY - pad)
      .lineTo(boardOffsetX + arm, boardOffsetY - pad)
      .stroke()

    this.graphics.moveTo(right - arm, boardOffsetY - pad)
      .lineTo(right + pad, boardOffsetY - pad)
      .lineTo(right + pad, boardOffsetY + arm)
      .stroke()

    this.graphics.moveTo(right + pad, bottom - arm)
      .lineTo(right + pad, bottom + pad)
      .lineTo(right - arm, bottom + pad)
      .stroke()

    this.graphics.moveTo(boardOffsetX + arm, bottom + pad)
      .lineTo(boardOffsetX - pad, bottom + pad)
      .lineTo(boardOffsetX - pad, bottom - arm)
      .stroke()

    this.graphics.fillStyle(emberDot, 0.16)
    this.graphics.fillCircle(boardOffsetX - pad, boardOffsetY - pad, 2)
    this.graphics.fillCircle(right + pad, boardOffsetY - pad, 2)
    this.graphics.fillCircle(right + pad, bottom + pad, 2)
    this.graphics.fillCircle(boardOffsetX - pad, bottom + pad, 2)
  }

  private updateVexAmbienceAudio(nowMs: number): void {
    if (this.gameState !== 'PLAYING') return

    const fogRank = this.getActiveVexRank('fog')
    if (fogRank > 0) {
      const fogInterval = Math.max(1700, 8800 - fogRank * 620)
      if (nowMs - this.lastFogPulseAtMs >= fogInterval) {
        audioManager.playSfx('fog', { rank: fogRank })
        this.lastFogPulseAtMs = nowMs
      }
    }

    const blackoutRank = this.getActiveVexRank('blackout')
    if (blackoutRank > 0) {
      const blackoutInterval = Math.max(1300, 10500 - blackoutRank * 900)
      if (nowMs - this.lastBlackoutPulseAtMs >= blackoutInterval) {
        audioManager.playSfx('blackout', { rank: blackoutRank })
        this.lastBlackoutPulseAtMs = nowMs
      }
    }
  }


  private initializeBoard() {
    this.board = Array.from({ length: BOARD_HEIGHT }, () =>
      Array.from({ length: BOARD_WIDTH }, () => ({ filled: false, color: COLORS.empty }))
    )
  }

  private spawnPiece() {
    // Safety check: ensure no full lines remain before spawning
    this.clearLines();
    if (this.clearingLines.length > 0) {
      // If we found missed lines, trigger the clear sequence and wait
      this.clearTimer = 5;
      this.pressureCountdown = null
      return;
    }

    this.currentPiece = this.nextPiece!
    this.currentPiece.position = { x: Math.floor(BOARD_WIDTH / 2) - Math.floor(this.currentPiece.shape[0].length / 2), y: 0 }
    this.applyJinxedSpawnMutations()
    this.resetPressureCountdownForCurrentPiece()
    this.generateNextPiece()
  }

  private generateNextPiece() {
    const data = Phaser.Utils.Array.GetRandom(PIECES)
    this.nextPiece = {
      type: data.type,
      shape: data.shape.map(row => [...row]),
      colors: data.shape.map(row => row.map(block => block ? Phaser.Utils.Array.GetRandom(BLOCK_COLORS) : 0)),
      position: { x: 11, y: 2 },
    }
  }

  private setupInput() {
    this.leftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT)
    this.rightKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT)
    this.downKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN)
    this.upKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP)
    this.zKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z)
    this.xKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X)
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.pKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P)
    this.escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
  }

  private handleInput(delta: number, time: number) {
    const leadFingersRank = this.getActiveVexRank('lead_fingers')
    const dasBonus = leadFingersRank > 0 ? getLeadFingersDASBonus(leadFingersRank as VexRank) : 0
    const arrBonus = leadFingersRank > 0 ? getLeadFingersARRBonus(leadFingersRank as VexRank) : 0
    const dasThresholdMs = (DAS_DELAY + dasBonus) * 16.67
    const arrThresholdMs = (ARR_DELAY + arrBonus) * 16.67

    // Left movement with DAS
    if (Phaser.Input.Keyboard.JustDown(this.leftKey)) {
      this.movePiece(-1, 0)
      this.leftDownTime = 0
    } else if (this.leftKey.isDown) {
      this.leftDownTime += delta
      if (this.leftDownTime >= dasThresholdMs && (time - this.lastLeftMove) >= arrThresholdMs) {
        this.movePiece(-1, 0)
        this.lastLeftMove = time
      }
    } else {
      this.leftDownTime = 0
    }

    // Right movement
    if (Phaser.Input.Keyboard.JustDown(this.rightKey)) {
      this.movePiece(1, 0)
      this.rightDownTime = 0
    } else if (this.rightKey.isDown) {
      this.rightDownTime += delta
      if (this.rightDownTime >= dasThresholdMs && (time - this.lastRightMove) >= arrThresholdMs) {
        this.movePiece(1, 0)
        this.lastRightMove = time
      }
    } else {
      this.rightDownTime = 0
    }

    // Rotation/Hard Drop/Hold
    if (Phaser.Input.Keyboard.JustDown(this.zKey) || Phaser.Input.Keyboard.JustDown(this.xKey)) {
      this.rotatePiece()
    } else if (Phaser.Input.Keyboard.JustDown(this.upKey)) {
      this.hardDrop(true)
    } else if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.holdPiece()
    }
  }

  private hardDrop(isManual: boolean = false) {
    if (!this.currentPiece) return
    const ghostPos = this.getGhostPosition()
    if (ghostPos) {
      this.currentPiece.position = ghostPos
      audioManager.playSfx('hardDrop')

      if (isManual) {
        const whiplashRank = this.getActiveVexRank('whiplash')
        if (whiplashRank > 0) {
          triggerWhiplash(getWhiplashDuration(whiplashRank as VexRank))
        }
      }

      // Screen shake and lock immediately
      this.cameras.main.shake(100, 0.003)
      this.lockPiece()
      this.clearLines()
      this.currentPiece = null
      this.pressureCountdown = null
      this.gravityTimer = 0
    }
  }

  private movePiece(dx: number, dy: number): boolean {
    if (!this.currentPiece) return false
    const newPos = { x: this.currentPiece.position.x + dx, y: this.currentPiece.position.y + dy }
    if (this.isValidPosition(this.currentPiece.shape, newPos)) {
      this.currentPiece.position = newPos
      // GB Skating: reset gravity on move
      this.gravityTimer = 0
      if (dy === 0 && dx !== 0) {
        audioManager.playSfx('move')
      }
      return true
    }
    return false
  }


  private rotatePiece() {
    if (!this.currentPiece) return
    const shape = this.currentPiece.shape
    const rows = shape.length
    const cols = shape[0].length
    const rotated = Array.from({ length: cols }, () => Array(rows).fill(0))
    const rotatedColors = Array.from({ length: cols }, () => Array(rows).fill(0))
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        rotated[x][rows - 1 - y] = shape[y][x]
        rotatedColors[x][rows - 1 - y] = this.currentPiece.colors[y][x]
      }
    }

    // Wall Kicks: Try several offsets if initial rotation is blocked
    const offsets = [0, -1, 1, -2, 2];
    for (const dx of offsets) {
      const newPos = { x: this.currentPiece.position.x + dx, y: this.currentPiece.position.y };
      if (this.isValidPosition(rotated, newPos)) {
        this.currentPiece.position = newPos;
        this.currentPiece.shape = rotated;
        this.currentPiece.colors = rotatedColors;
        // GB Rotation Stall: reset gravity on rotate
        this.gravityTimer = 0;
        audioManager.playSfx('rotate')
        return; // Success
      }
    }
  }

  private isValidPosition(shape: number[][], pos: Position): boolean {
    const rows = shape.length
    const cols = shape[0].length

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (shape[y][x]) {
          const boardX = pos.x + x
          const boardY = pos.y + y
          if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT) {
            return false
          }
          if (boardY >= 0 && this.board[boardY][boardX].filled) {
            return false
          }
        }
      }
    }
    return true
  }

  private holdPiece() {
    if (!this.canHold || !this.currentPiece) return;

    // Save current piece type
    const typeToHold = this.currentPiece.type;
    const currentHeldType = this.heldPiece ? this.heldPiece.type : null;

    // Generate new piece for holding (resetting rotation)
    const holdData = PIECES.find(p => p.type === typeToHold)!;
    const newHeldPiece: Piece = {
      type: holdData.type,
      shape: holdData.shape.map(row => [...row]),
      colors: holdData.shape.map(row => row.map(block => block ? Phaser.Utils.Array.GetRandom(BLOCK_COLORS) : 0)),
      position: { x: 0, y: 0 }
    };

    if (currentHeldType) {
      // Create new piece from held type
      const data = PIECES.find(p => p.type === currentHeldType)!;
      this.currentPiece = {
        type: data.type,
        shape: data.shape.map(row => [...row]),
        colors: data.shape.map(row => row.map(block => block ? Phaser.Utils.Array.GetRandom(BLOCK_COLORS) : 0)),
        position: { x: Math.floor(BOARD_WIDTH / 2) - Math.floor(data.shape[0].length / 2), y: 0 }
      };
    } else {
      // Run normal spawn logic
      this.currentPiece = this.nextPiece!;
      this.currentPiece.position = { x: Math.floor(BOARD_WIDTH / 2) - Math.floor(this.currentPiece.shape[0].length / 2), y: 0 };
      this.generateNextPiece();
    }

    this.heldPiece = newHeldPiece;
    this.canHold = false;
    this.resetPressureCountdownForCurrentPiece()
    this.gravityTimer = 0;
    audioManager.playSfx('hold')
  }

  private getGhostPosition(): Position | null {
    if (!this.currentPiece) return null
    
    // Calculate ghost position by finding where the piece would land
    let ghostY = this.currentPiece.position.y
    while (this.isValidPosition(this.currentPiece.shape, { x: this.currentPiece.position.x, y: ghostY + 1 })) {
      ghostY++
    }
    
    return { x: this.currentPiece.position.x, y: ghostY }
  }

  private lockPiece() {
    this.canHold = true;
    this.pressureCountdown = null
    if (!this.currentPiece) return
    const { shape, position, colors } = this.currentPiece
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x]) {
          const bx = position.x + x
          const by = position.y + y
          if (by >= 0) {
            this.board[by][bx] = { filled: true, color: colors[y][x] }
          }
        }
      }
    }

    // TODO: Vex modifiers can change this per-piece Resolve cost or refund on big clears.
    this.resolveCurrent -= this.PERPIECE_DRAIN
    if (this.resolveCurrent < 0) this.resolveCurrent = 0

    audioManager.playSfx('lock')
    const quicksandRank = this.getActiveVexRank('quicksand')
    if (quicksandRank > 0) {
      audioManager.playSfx('quicksand', { rank: quicksandRank })
    }
  }

  private clearLines() {
    this.clearingLines = []
    for (let y = BOARD_HEIGHT - 1; y >= 0; y--) {
      if (this.board[y].every(cell => cell.filled)) {
        this.clearingLines.push(y)
      }
    }
    if (this.clearingLines.length > 0) {
      this.clearTimer = 5;

      // Calculate clusters for visual feedback
      const blocksToScore: { x: number, y: number, color: number }[] = [];
      this.clearingLines.forEach(y => {
        for (let x = 0; x < BOARD_WIDTH; x++) {
          if (this.board[y] && this.board[y][x]) {
            blocksToScore.push({ x, y, color: this.board[y][x].color });
          }
        }
      });

      this.scoringClusters = [];
      const visited = new Set<string>();

      blocksToScore.forEach(block => {
        const key = `${block.x},${block.y}`;
        if (!visited.has(key)) {
          const cluster: { x: number, y: number }[] = [];
          const queue = [block];
          visited.add(key);

          while (queue.length > 0) {
            const current = queue.shift()!;
            cluster.push(current);

            const neighbors = [
              { x: current.x + 1, y: current.y },
              { x: current.x - 1, y: current.y },
              { x: current.x, y: current.y + 1 },
              { x: current.x, y: current.y - 1 },
            ];

            neighbors.forEach(n => {
              const nKey = `${n.x},${n.y}`;
              if (!visited.has(nKey)) {
                const match = blocksToScore.find(b => b.x === n.x && b.y === n.y && b.color === block.color);
                if (match) {
                  visited.add(nKey);
                  queue.push(match);
                }
              }
            });
          }
          this.scoringClusters.push({ blocks: cluster, color: block.color });
        }
      });

      const linesCleared = this.clearingLines.length
      const themedBurstCount = Math.max(0, linesCleared - 2)
      if (themedBurstCount > 0) {
        const themeColor = this.getLineClearThemeColor(linesCleared)
        const boardCenterX = 48 + (BOARD_WIDTH * BLOCK_SIZE) / 2
        const firstRow = this.clearingLines[0]
        const lastRow = this.clearingLines[this.clearingLines.length - 1]
        const midRow = (firstRow + lastRow) / 2
        const rowCenterY = 112 + midRow * BLOCK_SIZE + BLOCK_SIZE / 2
        this.createParticles(boardCenterX, rowCenterY, themedBurstCount, themeColor)
      }
    }
  }


  private drawBlock(x: number, y: number, color: number, alpha: number = 1, withDetail: boolean = true) {
    const size = BLOCK_SIZE;

    // Main block
    this.graphics.fillStyle(color, alpha);
    this.graphics.fillRect(x, y, size, size);

    if (alpha === 1 && withDetail) {
      // Light highlight (top and left) - scaled to 4px
      this.graphics.lineStyle(4, 0xffffff, 0.3);
      this.graphics.strokeLineShape(new Phaser.Geom.Line(x + 2, y + 2, x + size - 2, y + 2));
      this.graphics.strokeLineShape(new Phaser.Geom.Line(x + 2, y + 2, x + 2, y + size - 2));

      // Dark shadow (bottom and right) - scaled to 4px
      this.graphics.lineStyle(4, 0x000000, 0.4);
      this.graphics.strokeLineShape(new Phaser.Geom.Line(x + 2, y + size - 2, x + size - 2, y + size - 2));
      this.graphics.strokeLineShape(new Phaser.Geom.Line(x + size - 2, y + 2, x + size - 2, y + size - 2));
    }
  }

  private renderThematicLineClearOverlay(boardOffsetX: number, boardOffsetY: number): void {
    if (this.clearTimer <= 0 || this.clearingLines.length === 0) return

    const timerMax = 5
    const progress = 1 - Math.max(0, Math.min(1, this.clearTimer / timerMax))
    const pulse = 0.45 + 0.55 * Math.sin(progress * Math.PI)
    const linesCleared = this.clearingLines.length
    const themeColor = this.getLineClearThemeColor(linesCleared)

    const boardWidthPx = BOARD_WIDTH * BLOCK_SIZE
    const boardHeightPx = BOARD_HEIGHT * BLOCK_SIZE

    const ambientAlpha = Math.min(0.22, (0.05 + linesCleared * 0.03) * pulse)
    this.graphics.fillStyle(themeColor, ambientAlpha)
    this.graphics.fillRect(boardOffsetX, boardOffsetY, boardWidthPx, boardHeightPx)

    const sweepWidth = Math.max(24, Math.floor(BLOCK_SIZE * (1 + linesCleared * 0.25)))
    const sweepTravel = boardWidthPx + sweepWidth * 2
    const sweepX = boardOffsetX - sweepWidth + progress * sweepTravel
    const rowAlpha = Math.min(0.75, (0.26 + linesCleared * 0.08) * pulse)

    for (const row of this.clearingLines) {
      const rowY = boardOffsetY + row * BLOCK_SIZE

      this.graphics.fillStyle(themeColor, rowAlpha)
      this.graphics.fillRect(boardOffsetX, rowY, boardWidthPx, BLOCK_SIZE)

      this.graphics.fillStyle(0xf0dfcf, Math.min(0.42, 0.22 + linesCleared * 0.05) * pulse)
      this.graphics.fillRect(sweepX, rowY, sweepWidth, BLOCK_SIZE)

      this.graphics.lineStyle(2, themeColor, Math.min(0.9, 0.45 + linesCleared * 0.08) * pulse)
      this.graphics.moveTo(boardOffsetX, rowY + 1)
        .lineTo(boardOffsetX + boardWidthPx, rowY + 1)
        .stroke()
      this.graphics.moveTo(boardOffsetX, rowY + BLOCK_SIZE - 1)
        .lineTo(boardOffsetX + boardWidthPx, rowY + BLOCK_SIZE - 1)
        .stroke()
    }
  }

  private render() {
    this.graphics.clear();

    const boardOffsetX = 48;
    const boardOffsetY = 112;
    const severeFog = this.fogRank >= 9 && this.fogHeightPx > 0
    const fogTopLocalY = BOARD_HEIGHT * BLOCK_SIZE - this.fogHeightPx
    const amnesiaRank = this.getAmnesiaRank()
    const hideNextPreview = amnesiaRank >= 1
    const hideHoldPreview = amnesiaRank >= 2
    const amnesiaPieceDesaturation = this.getAmnesiaPieceDesaturation(amnesiaRank)
    const amnesiaBoardDesaturation = this.getAmnesiaBoardDesaturation(amnesiaRank)
    const ghostVisible = this.shouldRenderGhostForAmnesia(amnesiaRank)
    const ghostAlpha = this.getAmnesiaGhostAlpha(amnesiaRank)
    const fogOccludedAlpha = this.getFogOccludedAlpha(this.fogRank)

    if (amnesiaRank > 0 && ghostVisible !== this.lastGhostVisible) {
      audioManager.playSfx('amnesia', { rank: amnesiaRank })
    }
    this.lastGhostVisible = ghostVisible

    // Draw background panel for board
    this.graphics.fillStyle(0x110d15, 0.85);
    this.graphics.fillRect(boardOffsetX, boardOffsetY, BOARD_WIDTH * BLOCK_SIZE, BOARD_HEIGHT * BLOCK_SIZE);

    // Draw board cells
    for (let y = 0; y < BOARD_HEIGHT; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        const cell = this.board[y][x];
        let color = cell.color;
        if (this.clearingLines.includes(y)) {
          const cluster = this.scoringClusters.find(c => c.blocks.some(b => b.x === x && b.y === y));
          if (cluster && cluster.blocks.length > 1) {
            color = 0xFFFFFF; // Flash bright white for matching clusters only
          } else {
            // Keep normal color for isolated blocks
          }
        }

        // Apply gradual color desaturation based on fog rank
        if (this.fogRank > 0) {
          color = this.desaturateColorByFogRank(color);
        }
        if (amnesiaBoardDesaturation > 0) {
          color = this.blendColorToGray(color, amnesiaBoardDesaturation)
        }

        const px = Math.floor(boardOffsetX + x * BLOCK_SIZE);
        const py = Math.floor(boardOffsetY + y * BLOCK_SIZE);

        if (cell.filled || this.clearingLines.includes(y)) {
          const isOccluded = this.isHardFogOccludedRow(y);
          this.drawBlock(px, py, color, isOccluded ? fogOccludedAlpha : 1, !isOccluded);
        }
      }
    }

    // Draw ghost piece
    if (this.currentPiece && this.gameState !== 'GAMEOVER' && ghostVisible) {
      const ghostPos = this.getGhostPosition();
      if (ghostPos && ghostPos.y > this.currentPiece.position.y) {
        const ghostRenderX = ghostPos.x + (this.mirageActive ? this.mirageColOffset : 0)
        const { shape, colors } = this.currentPiece;
        for (let y = 0; y < shape.length; y++) {
          for (let x = 0; x < shape[y].length; x++) {
            const boardX = ghostRenderX + x
            if (shape[y][x] && boardX >= 0 && boardX < BOARD_WIDTH && !this.isHardFogOccludedRow(ghostPos.y + y)) {
              const px = Math.floor(boardOffsetX + boardX * BLOCK_SIZE);
              const py = Math.floor(boardOffsetY + (ghostPos.y + y) * BLOCK_SIZE);
              let ghostColor = colors[y][x]
              if (amnesiaPieceDesaturation > 0) {
                ghostColor = this.blendColorToGray(ghostColor, amnesiaPieceDesaturation)
              }
              if (this.fogRank > 0) {
                ghostColor = this.desaturateColorByFogRank(ghostColor)
              }
              this.drawBlock(px, py, ghostColor, ghostAlpha); // Semi-transparent
            }
          }
        }
      }
    }

    const pressureRank = this.getActiveVexRank('pressure')
    if (this.currentPiece && pressureRank > 0 && this.pressureCountdown !== null) {
      const { shape, position } = this.currentPiece
      const timeLimit = getPressureTimeLimit(pressureRank as VexRank)
      const ratio = Math.max(0, Math.min(1, this.pressureCountdown / timeLimit))

      let minX = Number.POSITIVE_INFINITY
      let maxX = Number.NEGATIVE_INFINITY
      let minY = Number.POSITIVE_INFINITY

      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (!shape[y][x]) continue
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
        }
      }

      if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minY)) {
        const barX = boardOffsetX + (position.x + minX) * BLOCK_SIZE
        const barY = boardOffsetY + (position.y + minY) * BLOCK_SIZE - 10
        const barWidth = Math.max(24, (maxX - minX + 1) * BLOCK_SIZE)
        const fillWidth = Math.max(0, (barWidth - 2) * ratio)

        const barColor = ratio > 0.4 ? 0x79a86b : ratio > 0.2 ? 0xc49a5c : 0xbb5c54

        this.graphics.fillStyle(0x1a141e, 0.85)
        this.graphics.fillRect(barX, barY, barWidth, 6)
        this.graphics.lineStyle(1, 0xd9c6b4, 0.45)
        this.graphics.strokeRect(barX, barY, barWidth, 6)
        this.graphics.fillStyle(barColor, 0.95)
        this.graphics.fillRect(barX + 1, barY + 1, fillWidth, 4)
      }
    }

    // Draw current piece
    if (this.currentPiece) {
      const { shape, colors, position } = this.currentPiece;
      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (shape[y][x]) {
            const row = position.y + y;
            let pieceColor = colors[y][x];
            if (amnesiaPieceDesaturation > 0) {
              pieceColor = this.blendColorToGray(pieceColor, amnesiaPieceDesaturation)
            }
            if (this.fogRank > 0) {
              pieceColor = this.desaturateColorByFogRank(pieceColor);
            }
            const occluded = this.isHardFogOccludedRow(row);
            const px = Math.floor(boardOffsetX + (position.x + x) * BLOCK_SIZE);
            const py = Math.floor(boardOffsetY + (position.y + y) * BLOCK_SIZE);
            this.drawBlock(px, py, pieceColor, occluded ? fogOccludedAlpha : 1, !occluded);
          }
        }
      }
    }

    // Draw next piece preview — positioned directly under the NEXT label
    // HUD starts at y=112. Rows: LEVEL(60) + SCORE(60) + TIME(60) + SPEED(60) + NEXT_label(20) = 372 → preview at ~392
    if (this.nextPiece && !hideNextPreview) {
      const { shape, colors } = this.nextPiece;
      const nextX = 416;
      const nextY = 392;
      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (shape[y][x]) {
            const px = Math.floor(nextX + x * BLOCK_SIZE);
            const py = Math.floor(nextY + y * BLOCK_SIZE);
            let previewColor = colors[y][x]
            if (amnesiaPieceDesaturation > 0) {
              previewColor = this.blendColorToGray(previewColor, amnesiaPieceDesaturation)
            }
            this.drawBlock(px, py, previewColor);
          }
        }
      }
    }

    // Draw held piece preview — positioned directly under the HOLD label
    // HOLD label is ~145px below NEXT label → ~112 + 60*4 + 145 = 497 → preview at ~517
    if (this.heldPiece && !hideHoldPreview) {
      const { shape, colors } = this.heldPiece;
      const holdX = 416;
      const holdY = 537;
      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (shape[y][x]) {
            const px = Math.floor(holdX + x * BLOCK_SIZE);
            const py = Math.floor(holdY + y * BLOCK_SIZE);
            let holdColor = colors[y][x]
            if (amnesiaPieceDesaturation > 0) {
              holdColor = this.blendColorToGray(holdColor, amnesiaPieceDesaturation)
            }
            this.drawBlock(px, py, holdColor);
          }
        }
      }
    }

    this.renderBoardSigils(boardOffsetX, boardOffsetY)

    // Draw board border with a subtle glow
    this.graphics.lineStyle(2, 0x7a4248, 0.52);
    this.graphics.strokeRect(boardOffsetX - 1, boardOffsetY - 1, BOARD_WIDTH * BLOCK_SIZE + 2, BOARD_HEIGHT * BLOCK_SIZE + 2);
    this.graphics.lineStyle(1, 0xd6c1ad, 0.72);
    this.graphics.strokeRect(boardOffsetX, boardOffsetY, BOARD_WIDTH * BLOCK_SIZE, BOARD_HEIGHT * BLOCK_SIZE);

    // Draw subtle grid lines
    this.graphics.lineStyle(1, 0x3c2c34, 0.34);
    const gridBottomY = severeFog ? boardOffsetY + Math.max(0, fogTopLocalY) : boardOffsetY + BOARD_HEIGHT * BLOCK_SIZE;
    for (let x = 1; x < BOARD_WIDTH; x++) {
      this.graphics.moveTo(boardOffsetX + x * BLOCK_SIZE, boardOffsetY)
        .lineTo(boardOffsetX + x * BLOCK_SIZE, gridBottomY)
        .stroke();
    }
    for (let y = 1; y < BOARD_HEIGHT; y++) {
      const lineY = boardOffsetY + y * BLOCK_SIZE;
      if (severeFog && lineY >= gridBottomY) break;
      this.graphics.moveTo(boardOffsetX, boardOffsetY + y * BLOCK_SIZE)
        .lineTo(boardOffsetX + BOARD_WIDTH * BLOCK_SIZE, boardOffsetY + y * BLOCK_SIZE)
        .stroke();
    }

    // Draw themed line-clear sweep on top of board cells and grid.
    this.renderThematicLineClearOverlay(boardOffsetX, boardOffsetY)

    // Draw floating score texts and impact messages
    this.renderFloatingTexts();
  }

  update(time: number, delta: number) {
    if (Phaser.Input.Keyboard.JustDown(this.pKey) || Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.togglePause();
    }

    if (this.gameState !== 'PLAYING') return;

    // FPS cap: throttle game updates to TARGET_FPS
    if (this.lastUpdateTime !== 0 && time - this.lastUpdateTime < this.FRAME_TIME_MS) {
      return
    }
    this.lastUpdateTime = time

    // Line clear animation delay
    if (this.clearTimer > 0) {
      this.clearTimer--;
      if (this.clearTimer === 0) {
        // --- Scoring: Color Clusters + Vex multipliers ---
        // We MUST score BEFORE clearing the board rows.
        const linesCleared = this.clearingLines.length;
        this.lines += linesCleared;

        // Feedback: clear stale floating texts (mark all as inactive)
        for (let i = 0; i < this.floatingTextPool.length; i++) {
          this.floatingTextPool[i].active = false;
        }

        // Step 1: base cluster points (unchanged formula)
        let totalClusterPoints = 0;
        for (const cluster of this.scoringClusters) {
          totalClusterPoints += cluster.blocks.length * cluster.blocks.length;
        }

        // Step 2: build ScoringContext so Vexes can inspect the move
        const ctx: ScoringContext = {
          linesCleared,
          clusters: this.scoringClusters,
          totalClusterPoints,
          maxClusterSize: this.scoringClusters.length
            ? Math.max(...this.scoringClusters.map(c => c.blocks.length))
            : 0,
          colorsInMove: new Set(this.scoringClusters.map(c => c.color)),
          moveIndex: this.moveIndex,
          combo: this.combo,
          timeRemaining: this.resolveCurrent,
          currentLevel: this.currentLevel,
        };

        // Step 3: accumulate additive multiplier bonuses from active Vexes
        let colorMultBonus = 0;  // scales colour-cluster points
        let lineMultBonus = 0;  // scales line-count multiplier
        for (const vex of this.activeVexes) {
          const m = vex.getMultiplier(ctx, vex.rank);
          if (vex.kind === 'color') colorMultBonus += m;
          else if (vex.kind === 'line') lineMultBonus += m;
        }

        // Step 4: apply multipliers
        // colorMult scales how much colour clusters are worth.
        // lineMult scales how much clearing more lines is worth.
        // With no Vexes: colorMult=1, lineMult=1 → identical to old formula.
        const colorMult = 1 + colorMultBonus;
        const lineMult = 1 + lineMultBonus;
        this.lastColorMult = colorMult
        this.lastLineMult = lineMult
        const modifiedClusterPoints = totalClusterPoints * colorMult;
        const moveScore = Math.round(modifiedClusterPoints * (linesCleared * lineMult));

        audioManager.playSfx('lineClear', { linesCleared })

        this.score += moveScore;
        this.currentLevelScore += moveScore;
        this.moveIndex += 1;

        const calcResult = moveScore;
        if (this.lastCalcBox) {
          // Score breakdown: clusters, lines, color mult, line mult → total
          // True per-cluster color rendering for the CLUSTER chip
          const clusterChip = this.lastChips.find(c => c.config.id === 'clusters');
          if (clusterChip) {
            // Remove any previous clusterTexts
            if (clusterChip.clusterTexts && clusterChip.clusterTexts.length > 0) {
              for (const t of clusterChip.clusterTexts) t.destroy();
              clusterChip.clusterTexts = [];
            }
            if (this.scoringClusters.length > 0) {
              // Sort clusters by size descending
              const clustersSorted = [...this.scoringClusters].sort((a, b) => b.blocks.length - a.blocks.length);
              let x = clusterChip.text.x;
              const y = clusterChip.text.y;
              const sep = '·';
              const maxWidth = clusterChip.config.width - 38; // leave space for icon and padding
              let tempTexts: Phaser.GameObjects.Text[] = [];
              let totalWidth = 0;
              let shown = 0;
              let otherSum = 0;
              // Try to fit as many as possible, then aggregate the rest
              for (let i = 0; i < clustersSorted.length; ++i) {
                const cluster = clustersSorted[i];
                let hex = Phaser.Display.Color.IntegerToColor(cluster.color).color;
                let hexStr = '#' + hex.toString(16).padStart(6, '0');
                // Create a temp text to measure width
                const txt = this.add.text(0, y, `${cluster.blocks.length}`, {
                  fontSize: '9px', fontFamily: '"Press Start 2P", monospace', color: hexStr, align: 'right',
                }).setOrigin(1, 0.5).setDepth(8);
                let sepTxt: Phaser.GameObjects.Text | null = null;
                if (i < clustersSorted.length - 1) {
                  sepTxt = this.add.text(0, y, sep, {
                    fontSize: '9px', fontFamily: '"Press Start 2P", monospace', color: '#BBBBBB', align: 'right',
                  }).setOrigin(1, 0.5).setDepth(8);
                }
                let nextWidth = totalWidth + txt.width + (sepTxt ? sepTxt.width : 0);
                // If adding this cluster would overflow, aggregate the rest
                if (nextWidth > maxWidth && shown > 0) {
                  txt.destroy(); if (sepTxt) sepTxt.destroy();
                  // Sum remaining clusters
                  for (let j = i; j < clustersSorted.length; ++j) otherSum += clustersSorted[j].blocks.length;
                  break;
                }
                tempTexts.push(txt);
                if (sepTxt) tempTexts.push(sepTxt);
                totalWidth = nextWidth;
                shown++;
              }
              // If there are aggregated clusters, add (+N)
              if (otherSum > 0) {
                const plusTxt = this.add.text(0, y, `(+${otherSum})`, {
                  fontSize: '9px', fontFamily: '"Press Start 2P", monospace', color: '#BBBBBB', align: 'right',
                }).setOrigin(1, 0.5).setDepth(8);
                tempTexts.push(plusTxt);
                totalWidth += plusTxt.width;
              }
              // Position right-aligned at clusterChip.text.x
              let curX = x;
              for (let i = tempTexts.length - 1; i >= 0; --i) {
                tempTexts[i].x = curX;
                curX -= tempTexts[i].width;
              }
              clusterChip.clusterTexts = tempTexts;
              clusterChip.text.setText('');
            } else {
              clusterChip.text.setText('0');
              clusterChip.text.setColor('#efe1d3');
            }
          }
          // Update other chips
          const chipMap = new Map(this.lastChips.map(c => [c.config.id, c]));
          chipMap.get('cleared')?.text.setText(`x${linesCleared}`);
          chipMap.get('color')?.text.setText(this.formatMultiplierValue(colorMult));
          chipMap.get('lineMult')?.text.setText(this.formatMultiplierValue(lineMult));
          chipMap.get('total')?.text.setText(`${calcResult}`);

          // Activate chip backgrounds
          for (const chip of this.lastChips) {
            if (chip.config.id === 'total') {
              chip.bg.setFillStyle(0x3a2120, 0.95);
              chip.text.setColor('#f9ded2');
              chip.label.setColor('#ddb6aa');
              chip.label.setVisible(true);
            } else if (chip.config.id === 'clusters') {
              chip.bg.setFillStyle(chip.config.color, 0.16);
              chip.text.setColor('#efe1d3');
              chip.label.setColor('#cab7a7');
              chip.label.setVisible(false);
              // Hide clusterTexts when not showing score
              if (chip.clusterTexts) for (const t of chip.clusterTexts) t.setVisible(true);
            } else {
              chip.bg.setFillStyle(chip.config.color, 0.16);
              chip.text.setColor('#efe1d3');
              chip.label.setColor('#cab7a7');
              chip.label.setVisible(false);
            }
          }

          this.lastCalcTimestamp = Date.now();
        }

        // Clean, Minimalist Feedback
        if (moveScore > 0) {
          const midY = (this.clearingLines[0] + this.clearingLines[this.clearingLines.length - 1]) / 2;
          const py = 112 + midY * BLOCK_SIZE;
          const px = 48 + (BOARD_WIDTH * BLOCK_SIZE) / 2;
          const clearThemeColor = this.getLineClearThemeColor(linesCleared)
          const clearThemeHex = this.colorToHexString(clearThemeColor)

          let color = '#FFFFFF';
          let scale = 1.0;
          let shakeMag = 0;

          if (moveScore >= 1000) {
            color = clearThemeHex;
            scale = 1.4;
            shakeMag = 0.005;
            this.cameras.main.flash(
              120,
              (clearThemeColor >> 16) & 0xff,
              (clearThemeColor >> 8) & 0xff,
              clearThemeColor & 0xff,
              false,
            );
          } else if (moveScore >= 500) {
            color = clearThemeHex;
            scale = 1.2;
            shakeMag = 0.003;
          } else if (moveScore >= 200) {
            scale = 1.1;
            shakeMag = 0.001;
          }

          let displayText = `+${moveScore}`;
          if (linesCleared > 1) {
            // Show the base points and the multiplier if multiple lines were cleared
            displayText = `+${totalClusterPoints} x ${linesCleared}`;
          }

          this.showFloatingText(px, py, displayText, color, scale);

          const callout = this.getLineClearCallout(linesCleared)
          if (callout) {
            const mutedCalloutColor = this.colorToHexString(this.blendColors(clearThemeColor, 0xd3c0af, 0.72))
            this.showFloatingText(px, py - 22, callout, mutedCalloutColor, 0.9)
          }

          if (shakeMag > 0) {
            this.cameras.main.shake(150, shakeMag);
          }
        }

        // --- Board Update: Clear the lines ---
        this.clearingLines.sort((a, b) => b - a);

        // Fix: Do all splices first from bottom to top so indices don't shift dynamically relative to the remaining clearingLines
        for (const y of this.clearingLines) {
          this.board.splice(y, 1);
        }

        // Then add the new empty rows to the top
        for (let i = 0; i < this.clearingLines.length; i++) {
          this.board.unshift(Array.from({ length: BOARD_WIDTH }, () => ({ filled: false, color: COLORS.empty })));
        }

        this.level = Math.floor(this.lines / LINES_PER_LEVEL);
        this.gravityDelay = GRAVITY_TABLE[this.level] || GRAVITY_TABLE[GRAVITY_TABLE.length - 1];
        this.clearingLines = [];
      }
      this.render();
      return;
    }

    // Input handling
    this.handleInput(delta, time);

    const pressureRank = this.getActiveVexRank('pressure')
    if (pressureRank > 0 && this.currentPiece) {
      if (this.pressureCountdown === null) {
        this.resetPressureCountdownForCurrentPiece()
      }
      if (this.pressureCountdown !== null) {
        this.pressureCountdown = Math.max(0, this.pressureCountdown - delta / 1000)
        if (this.pressureCountdown <= 0) {
          this.hardDrop(false)
          return
        }
      }
    } else {
      this.pressureCountdown = null
    }

    // --- Resolve Drain: Hybrid system ---
    // TODO: Vex modifiers can adjust REALTIME_DRAIN_PER_SECOND.
    this.resolveCurrent -= delta * this.REALTIME_DRAIN_PER_SECOND / 1000;
    if (this.resolveCurrent < 0) this.resolveCurrent = 0;

    // Win condition: reached target score before Resolve ran out
    if (this.currentLevelScore >= this.currentLevelParams.targetScore) {
      this.onLevelComplete();
      return;
    }

    // Fail condition: Resolve expired and target not met
    if (this.resolveCurrent <= 0) {
      this.onLevelFailed();
      return;
    }

    // Gravity
    const isSoftDrop = this.downKey.isDown;
    const quicksandRank = this.getActiveVexRank('quicksand')
    const quicksandScale = this.getQuicksandGravityScale(quicksandRank)
    const currentDelay = isSoftDrop ? 1 : Math.max(1, this.gravityDelay * quicksandScale);
    this.gravityTimer += delta;

    if (this.gravityTimer >= currentDelay * 16.67) {
      const moved = this.movePiece(0, 1);
      if (!moved) {
        // GB Lock: piece locks immediately if it cannot move down when gravity hits
        this.lockPiece();
        this.clearLines();
        this.currentPiece = null;

        if (this.clearingLines.length > 0) {
          // True-color particle burst
          this.clearingLines.forEach(y => {
            for (let x = 0; x < BOARD_WIDTH; x++) {
              const cell = this.board[y][x];
              if (cell && cell.filled) {
                const cluster = this.scoringClusters.find(c => c.blocks.some(b => b.x === x && b.y === y));
                if (cluster && cluster.blocks.length > 1) {
                  // Larger burst for matching clusters
                  this.createParticles(48 + x * BLOCK_SIZE + 16, 112 + y * BLOCK_SIZE + 16, 3, cell.color);
                } else {
                  // Very subtle burst for isolated blocks
                  this.createParticles(48 + x * BLOCK_SIZE + 16, 112 + y * BLOCK_SIZE + 16, 1, cell.color);
                }
              }
            }
          });
        }
      }
      this.gravityTimer = 0;
    }

    // Spawn new piece
    if (!this.currentPiece && this.clearTimer === 0) {
      this.spawnPiece();
      // Use local reference to help TS with type inference after spawn
      const piece = this.currentPiece as Piece | null;
      if (piece && !this.isValidPosition(piece.shape, piece.position)) {
        this.gameState = 'GAMEOVER';
        this.gameOverBg.setVisible(true);
        this.gameOverText.setVisible(true);
        audioManager.playSfx('fail')
      }
    }

    // Update particles (reuse pool - only iterate active)
    for (let i = 0; i < this.particlePool.length; i++) {
      const p = this.particlePool[i];
      if (p.active) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.1; // gravity
        p.life -= 0.02;
        if (p.life <= 0) p.active = false;
      }
    }

    // Update floating texts (reuse pool - only iterate active)
    for (let i = 0; i < this.floatingTextPool.length; i++) {
      const ft = this.floatingTextPool[i];
      if (ft.active) {
        ft.y -= 0.3; // float up
        ft.life -= 0.015;
        if (ft.life <= 0) ft.active = false;
      }
    }

    // Update HUD with dirty tracking - only setText() if value changed
        // Always show color/line mult on scoreline (even if not just scored)
        if (this.lastChips) {
          const chipMap = new Map(this.lastChips.map(c => [c.config.id, c]));
          const colorChip = chipMap.get('color')
          if (colorChip) {
            colorChip.text.setText(this.formatMultiplierValue(this.lastColorMult))
            colorChip.label.setVisible(false)
          }
          const lineChip = chipMap.get('lineMult')
          if (lineChip) {
            lineChip.text.setText(this.formatMultiplierValue(this.lastLineMult))
            lineChip.label.setVisible(false)
          }
        }
    if (this.lastHudLevel !== this.currentLevel) {
      this.lastHudLevel = this.currentLevel;
      this.hudLevelText.setText(`${this.currentLevel}`);
    }
    if (this.lastHudScore !== this.currentLevelScore || this.lastHudScoreTarget !== this.currentLevelParams.targetScore) {
      this.lastHudScore = this.currentLevelScore;
      this.lastHudScoreTarget = this.currentLevelParams.targetScore;
      this.hudScoreText.setText(`${this.currentLevelScore}/${this.currentLevelParams.targetScore}`);
    }
    const resolveTimeMs = Math.ceil(this.resolveCurrent);
    if (this.lastHudTime !== resolveTimeMs || this.lastHudResolveMax !== this.currentLevelParams.resolveMax) {
      this.lastHudTime = resolveTimeMs;
      this.lastHudResolveMax = this.currentLevelParams.resolveMax;
      this.hudTimeText.setText(`${resolveTimeMs} / ${this.currentLevelParams.resolveMax}`);
    }
    if (this.lastHudSpeed !== this.level) {
      this.lastHudSpeed = this.level;
      this.hudSpeedText.setText(`${this.level}`);
    }

    this.updateVexAmbienceAudio(time)

    const amnesiaRank = this.getAmnesiaRank()
    this.hudNextLabelText.setVisible(amnesiaRank < 1)
    this.hudHoldLabelText.setVisible(amnesiaRank < 2)

    // Update Balatro-style Vex bar across the top
    updateVexBar(this.activeVexes)

    // If Fog Vex is active, drive the canvas height from board state.
    const activeFog = this.activeVexes.find(v => v.id === 'fog')
    this.fogRank = activeFog?.rank ?? 0
    if (activeFog) {
      const targetFogHeight = this.computeFogHeight(this.fogRank)
      if (targetFogHeight >= this.fogHeightPx) {
        this.fogHeightPx = targetFogHeight
      } else {
        const retreatSpeed = this.fogRank >= 9 ? 10 : this.fogRank >= 7 ? 16 : 26
        const retreatStep = (retreatSpeed * delta) / 1000
        this.fogHeightPx = Math.max(targetFogHeight, this.fogHeightPx - retreatStep)
      }
      setFogHeight(this.fogHeightPx)
    } else {
      this.fogHeightPx = 0
      setFogHeight(0)
    }

    // Fade the last calculation display after 5 seconds
    if (this.lastCalcTimestamp) {
      const age = Date.now() - this.lastCalcTimestamp;
      if (age > 5000) {
        if (this.lastChips) {
          for (const chip of this.lastChips) {
            if (chip.config.id !== 'color' && chip.config.id !== 'lineMult') {
              chip.text.setText('');
            }
            if (chip.config.id === 'total') {
              chip.bg.setFillStyle(0x241617, 0.95);
              chip.label.setColor('#ddb6aa');
              chip.label.setVisible(true);
            } else if (chip.config.id === 'clusters') {
              chip.bg.setFillStyle(0x1a141c, 0.9);
              chip.label.setColor('#b8a796');
              chip.label.setVisible(true);
              // Hide clusterTexts when idle
              if (chip.clusterTexts) for (const t of chip.clusterTexts) t.setVisible(false);
            } else if (chip.config.id === 'color' || chip.config.id === 'lineMult') {
              chip.bg.setFillStyle(0x1a141c, 0.9);
              chip.text.setColor('#efe1d3');
              const multValue = chip.config.id === 'color' ? this.lastColorMult : this.lastLineMult
              chip.text.setText(this.formatMultiplierValue(multValue));
              chip.label.setColor('#b8a796');
              chip.label.setVisible(false);
            } else {
              chip.bg.setFillStyle(0x1a141c, 0.9);
              chip.label.setColor('#b8a796');
              chip.label.setVisible(true);
            }
          }
        }
        this.lastCalcTimestamp = 0;
      }
    }

    // Render
    this.render();
    this.renderParticles();
  }

  /**
   * Called when the player reaches the target score before time runs out.
   * Pauses the game and opens the Vex shop. On card pick, advances the level.
   */
  private onLevelComplete(): void {
    this.gameState = 'SHOP'
    audioManager.playSfx('levelClear')

    // Visual flash before the overlay
    const boardCenterX = 48 + (BOARD_WIDTH * BLOCK_SIZE) / 2
    const boardCenterY = 112 + (BOARD_HEIGHT * BLOCK_SIZE) / 2
    this.showFloatingText(boardCenterX, boardCenterY, `SEAL ${this.currentLevel} BROKEN!`, '#cfa36b', 1.2)
    this.cameras.main.flash(300, 190, 112, 91, false)

    // Small delay so the flash is visible before overlay appears
    this.time.delayedCall(400, () => {
      showVexShop(this.activeVexes, this.currentLevel, this.resolveCurrent, this.currentLevelParams.resolveMax, () => {
        this.startNextLevel()
      })
    })
  }

  /**
   * Resets per-level state and starts the next level.
   * Called by the shop's onPick callback.
   */
  private startNextLevel(): void {
    this.gameState = 'PLAYING'
    this.currentLevel++
    this.currentLevelParams = getLevelParams(this.currentLevel)
    this.currentLevelScore = 0
    this.resolveCurrent = this.currentLevelParams.resolveMax

    // Reset board for a fresh level
    this.initializeBoard()
    this.currentPiece = null
    this.heldPiece = null
    this.canHold = true
    this.clearingLines = []
    this.clearTimer = 0
    this.gravityTimer = 0

    // Clear old Vex timers and set up new ones for this level
    this.clearAllVexTimers()
    this.setupVexEffects()
    this.generateNextPiece()
    this.spawnPiece()
  }

  /**
   * Called when the Resolve hits zero without reaching the target score.
   * Currently triggers game over; can later be wired to a retry flow.
   */
  private onLevelFailed(): void {
    this.gameState = 'GAMEOVER'
    this.gameOverBg.setVisible(true)
    this.gameOverText.setText('RESOLVE DEPLETED!')
    this.gameOverText.setStyle({ color: '#c66a5c' })
    this.gameOverText.setVisible(true)
    audioManager.playSfx('fail')
  }

  private createParticles(x: number, y: number, count: number, color: number) {
    for (let i = 0; i < count; i++) {
      // Find next available slot in pool
      let found = false;
      for (let j = 0; j < this.particlePool.length; j++) {
        if (!this.particlePool[j].active) {
          const p = this.particlePool[j];
          p.x = x; p.y = y;
          p.vx = (Math.random() - 0.5) * 16;
          p.vy = (Math.random() - 0.5) * 16;
          p.life = 1.0;
          p.color = color;
          p.active = true;
          found = true;
          break;
        }
      }
      // If no inactive slot, add to pool (up to 50 max)
      if (!found && this.particlePool.length < 50) {
        this.particlePool.push({
          x, y,
          vx: (Math.random() - 0.5) * 16,
          vy: (Math.random() - 0.5) * 16,
          life: 1.0,
          color,
          active: true
        });
      }
    }
  }

  private renderParticles() {
    for (let i = 0; i < this.particlePool.length; i++) {
      const p = this.particlePool[i];
      if (p.active) {
        const size = p.size || 8;
        
        // Draw particles as small colored squares with alpha based on remaining life
        this.graphics.fillStyle(p.color, p.life);
        this.graphics.fillRect(p.x - size / 2, p.y - size / 2, size, size);
      }
    }
  }

  private showFloatingText(x: number, y: number, text: string, color: string, scale: number = 1) {
    // Find next available slot in pool
    let found = false;
    for (let i = 0; i < this.floatingTextPool.length; i++) {
      if (!this.floatingTextPool[i].active) {
        const ft = this.floatingTextPool[i];
        ft.x = x; ft.y = y;
        ft.text = text;
        ft.life = 1.0;
        ft.color = color;
        ft.scale = scale;
        ft.active = true;
        found = true;
        break;
      }
    }
    // If no inactive slot, add to pool (up to 20 max)
    if (!found && this.floatingTextPool.length < 20) {
      this.floatingTextPool.push({ x, y, text, life: 1.0, color, scale, active: true });
    }
  }

  private renderFloatingTexts() {
    for (let i = 0; i < this.floatingTextPool.length; i++) {
      const ft = this.floatingTextPool[i];
      if (ft.active) {
        const alpha = Math.min(1, ft.life * 2);
        // Using a temporary text object for rendering
        const t = this.add.text(ft.x, ft.y, ft.text, {
          fontSize: '32px',
          fontFamily: '"Press Start 2P", monospace',
          color: ft.color,
          align: 'center',
          resolution: 3,
        }).setOrigin(0.5).setAlpha(alpha).setScale(ft.scale).setDepth(20);

        // Force immediate render then destroy
        this.children.bringToTop(t);
        this.time.delayedCall(0, () => t.destroy());
      }
    }
  }

  /**
   * Pushes a garbage row up from the bottom of the board.
   * Shifts all existing rows up by 1, then fills the bottom row with random
   * blocks and creates gapsPerRow empty spaces.
   */
  private pushGarbageRow(gapsPerRow: number): void {
    // 1. Shift existing rows up by 1
    for (let y = 0; y < BOARD_HEIGHT - 1; y++) {
      for (let x = 0; x < BOARD_WIDTH; x++) {
        this.board[y][x] = this.board[y + 1][x];
      }
    }

    // 2. Create a new bottom row with random gaps
    const garbageColors = [
      COLORS.blockI, COLORS.blockO, COLORS.blockT, COLORS.blockS,
      COLORS.blockZ, COLORS.blockJ, COLORS.blockL,
    ];

    // Choose random gap positions (distinct indices)
    const gapPositions = new Set<number>();
    while (gapPositions.size < gapsPerRow) {
      gapPositions.add(Math.floor(Math.random() * BOARD_WIDTH));
    }

    // Fill bottom row
    const bottomRow = BOARD_HEIGHT - 1;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (gapPositions.has(x)) {
        this.board[bottomRow][x] = { filled: false, color: COLORS.empty };
      } else {
        const randomColor = garbageColors[Math.floor(Math.random() * garbageColors.length)];
        this.board[bottomRow][x] = { filled: true, color: randomColor };
      }
    }

    // 3. Trigger visual effect
    this.playRisingDirtEffect();
    audioManager.playSfx('risingImpact')

    // 4. Check for top-out (if blocks exceed top of board, game over)
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (this.board[0][x].filled) {
        // Top row has a block — trigger game over via existing logic
        this.gameState = 'GAMEOVER';
        this.gameOverBg.setVisible(true);
        this.gameOverText.setText('GARBAGE OVERFLOW!');
        this.gameOverText.setStyle({ color: '#c66a5c' });
        this.gameOverText.setVisible(true);
        audioManager.playSfx('fail')
        break;
      }
    }
  }

  /**
   * Plays the "dirt/rocks flying up" visual effect.
   * Creates particles that burst upward from the bottom with rotation and gravity.
   */
  private playRisingDirtEffect(): void {
    // Create 8-12 rock/dirt particles
    const particleCount = 8 + Math.floor(Math.random() * 5);
    
    for (let i = 0; i < particleCount; i++) {
      // Random horizontal spread within board width
      const boardCenterX = 112 + (BOARD_WIDTH * BLOCK_SIZE) / 2;
      const boardWidth = BOARD_WIDTH * BLOCK_SIZE;
      const x = boardCenterX + (Math.random() - 0.5) * (boardWidth * 0.8);
      const y = 112 + BOARD_HEIGHT * BLOCK_SIZE; // bottom of board
      
      // Burst upward with velocity
      const vx = (Math.random() - 0.5) * 8;  // horizontal spread
      const vy = -8 - Math.random() * 6;     // upward velocity
      
      // Brown/earth colors for rocks
      const rockColors = [0x7a4f32, 0x5c3b28, 0x6b4630, 0x71503a, 0x8a5b3e];
      const color = rockColors[Math.floor(Math.random() * rockColors.length)];
      
      this.particlePool.push({
        x, y, vx, vy,
        life: 1.0,
        color,
        active: true,
        rotation: Math.random() * Math.PI * 2,    // Random initial rotation
        rotationVelocity: (Math.random() - 0.5) * 0.15, // Spin
        size: 4 + Math.random() * 4  // Vary size
      });
    }
    
    // Also trigger the overlay glow (faster fade for visual impact)
    const overlay = document.getElementById('rising-dirt-overlay');
    if (overlay) {
      overlay.classList.remove('rising-dirt-active');
      void overlay.offsetWidth;
      overlay.classList.add('rising-dirt-active');
    }
  }

  /**
   * Shows a warning flash before garbage row insertion.
   * Briefly highlights the bottom border of the board.
   */
  private showRisingWarning(): void {
    audioManager.playSfx('risingWarn')
    const boardElement = document.querySelector('.board, #board, [data-board]') as HTMLElement;
    if (!boardElement) return;

    // Add warning class
    boardElement.classList.add('rising-warning');

    // Remove after flash duration (200ms)
    setTimeout(() => {
      boardElement.classList.remove('rising-warning');
    }, 200);
  }

  /**
   * Starts the Rising Dread timer for the given rank.
   * Shows warning, then pushes garbage after 1 second, repeating every intervalSeconds.
   */
  private startRisingDreadTimer(rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): void {
    // Import the helper (ensure it's imported at the top of GameScene)
    // For now, compute directly:
    const intervalSeconds = Math.max(30 - 2 * (rank - 1), 10);
    const gapsPerRow = Math.max(3 - Math.floor((rank - 1) / 3), 1);

    const scheduleGarbageEvent = () => {
      // Show warning immediately
      this.showRisingWarning();

      // After 1 second, push garbage and schedule next event
      const timeoutId = setTimeout(() => {
        if (this.gameState !== 'SHOP' && this.gameState !== 'GAMEOVER') {
          this.pushGarbageRow(gapsPerRow);
        }
        // Schedule next occurrence
        const nextId = setTimeout(scheduleGarbageEvent, intervalSeconds * 1000);
        this.vexIntervals.set('rising_dread', nextId);
      }, 1000);

      this.vexIntervals.set('rising_dread', timeoutId);
    };

    // Start first cycle
    scheduleGarbageEvent();
  }

  /**
   * Resets all Vex timers.
   * Called when level ends or vexes are replaced.
   */
  private clearAllVexTimers(): void {
    for (const [, timerId] of this.vexIntervals) {
      clearTimeout(timerId);
    }
    this.vexIntervals.clear();
    disableTremor()
    disableWhiplash()

    this.mirageActive = false
    this.mirageColOffset = 0

    if (this.corruptionPulseTimer !== null) {
      clearTimeout(this.corruptionPulseTimer)
      this.corruptionPulseTimer = null
      this.game.canvas.style.filter = ''
    }
  }

  /**
   * Sets up effects for all active Vexes.
   * Called at the start of each level after activeVexes is populated.
   */
  private setupVexEffects(): void {
    const activeIds = new Set(this.activeVexes.map(vex => vex.id))

    if (!activeIds.has('blackout')) {
      disableBlackout()
    }
    if (!activeIds.has('fog')) {
      disableFog()
      this.fogRank = 0
      this.fogHeightPx = 0
      setFogHeight(0)
    }
    if (!activeIds.has('tremor')) {
      disableTremor()
    }
    if (!activeIds.has('whiplash')) {
      disableWhiplash()
    }
    if (!activeIds.has('mirage')) {
      this.mirageActive = false
      this.mirageColOffset = 0
    }
    if (!activeIds.has('pressure')) {
      this.pressureCountdown = null
    }

    for (const vex of this.activeVexes) {
      if (vex.id === 'blackout' || vex.id === 'fog') {
        vex.onApply?.(vex.rank)
      }
      if (vex.id === 'tremor') {
        enableTremor(this, vex.rank)
      }
      if (vex.id === 'whiplash') {
        enableWhiplash()
      }
      if (vex.id === 'rising_dread') {
        this.startRisingDreadTimer(vex.rank);
      }
      if (vex.id === 'corruption') {
        this.startCorruptionTimer(vex.rank)
      }
      if (vex.id === 'mirage') {
        this.startMirageTimer(vex.rank)
      }
      if (vex.id === 'pressure') {
        this.resetPressureCountdownForCurrentPiece()
      }
    }
  }

  /**
   * Resets all per-run state and seeds active Vexes.
   *
   * Called from create() for a fresh game, and can be called again to restart.
   * Once a shop UI exists, Vexes will be populated from the player's choices
   * rather than being hard-coded here.
   */
  private initRun(): void {
    disableBlackout()
    disableFog()
    disableTremor()
    disableWhiplash()
    setFogHeight(0)
    this.lastFogPulseAtMs = 0
    this.lastBlackoutPulseAtMs = 0
    this.lastGhostVisible = true
    this.mirageActive = false
    this.mirageColOffset = 0
    this.pressureCountdown = null

    if (this.corruptionPulseTimer !== null) {
      clearTimeout(this.corruptionPulseTimer)
      this.corruptionPulseTimer = null
    }
    this.game.canvas.style.filter = ''

    // Level progression
    this.currentLevel = 1
    this.currentLevelParams = getLevelParams(1)
    this.currentLevelScore = 0
    this.resolveCurrent = this.currentLevelParams.resolveMax

    // Scoring bookkeeping
    this.score = 0
    this.moveIndex = 0
    this.combo = 0

    // Vexes are chosen via the shop between levels.
    // Start with an empty array — no effects until the player picks one.
    this.activeVexes = []
  }
  private getMinimumFogRows(fogRank: number): number {
    const clampedRank = Math.max(0, Math.min(10, Math.floor(fogRank)))
    const rowsByRank = [0, 0.6, 1.2, 1.9, 2.8, 3.8, 5.0, 6.3, 7.7, 9.2, 10.8]
    return rowsByRank[clampedRank]
  }

  private isHardFogOccludedRow(row: number): boolean {
    if (this.fogRank < 5 || this.fogHeightPx <= 0) return false
    const factor = this.getFogHardOcclusionFactor(this.fogRank)
    if (factor <= 0) return false
    const hardOcclusionHeight = this.fogHeightPx * factor
    const rowMidpoint = row * BLOCK_SIZE + BLOCK_SIZE / 2
    return rowMidpoint >= (BOARD_HEIGHT * BLOCK_SIZE - hardOcclusionHeight)
  }

  private desaturateColorByFogRank(color: number): number {
    // Check cache first
    if (this.colorDesaturationCache.has(color)) {
      return this.colorDesaturationCache.get(color)!
    }

    // Invalidate cache if fog rank changed
    if (this.prevFogRank !== this.fogRank) {
      this.colorDesaturationCache.clear()
      this.prevFogRank = this.fogRank
    }

    // Stronger rank curve: mild at low ranks, severe by rank 8+.
    const desaturationByRank = [0, 0.08, 0.15, 0.24, 0.34, 0.47, 0.6, 0.73, 0.84, 0.93, 1]
    let desaturation = desaturationByRank[Math.max(0, Math.min(10, this.fogRank))]
    
    const r = (color >> 16) & 0xFF
    const g = (color >> 8) & 0xFF
    const b = color & 0xFF
    
    // Convert to grayscale using luminance
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    
    // Blend between original color and grayscale
    const finalR = Math.round(r * (1 - desaturation) + gray * desaturation)
    const finalG = Math.round(g * (1 - desaturation) + gray * desaturation)
    const finalB = Math.round(b * (1 - desaturation) + gray * desaturation)
    
    const result = (finalR << 16) | (finalG << 8) | finalB
    this.colorDesaturationCache.set(color, result)
    return result
  }

  /**
   * Compute the target fog height in pixels.
   * High ranks use the tallest portion of the stack plus a minimum coverage
   * floor so fog remains oppressive even on flatter boards.
   */
  private computeFogHeight(fogRank: number = this.fogRank): number {
    const columnHeights: number[] = []

    for (let col = 0; col < BOARD_WIDTH; col++) {
      for (let row = 0; row < BOARD_HEIGHT; row++) {
        if (this.board[row][col].filled) {
          columnHeights.push(BOARD_HEIGHT - row)
          break
        }
      }
    }

    const minimumRows = this.getMinimumFogRows(fogRank)
    if (columnHeights.length === 0) {
      return minimumRows * BLOCK_SIZE
    }

    columnHeights.sort((left, right) => right - left)
    const pressureColumns = Math.max(1, Math.ceil(columnHeights.length * 0.45))
    const pressureSurface = columnHeights.slice(0, pressureColumns)
      .reduce((sum, height) => sum + height, 0) / pressureColumns
    const paddingRows = 1.2 + Math.min(1.8, Math.max(0, fogRank - 1) * 0.2)
    const targetRows = Math.min(BOARD_HEIGHT, Math.max(minimumRows, pressureSurface + paddingRows))

    return targetRows * BLOCK_SIZE
  }

  // --- UI Overlays & State ---
  private setupUI() {
    const btnBegin = document.getElementById('btn-begin-rite');
    if (btnBegin) {
      btnBegin.onclick = () => {
        document.getElementById('main-menu')?.classList.add('hidden');
        this.resetGame();
        this.gameState = 'PLAYING';
        audioManager.playSfx('uiClick');
      };
    }

    const btnResume = document.getElementById('btn-resume-rite');
    if (btnResume) {
      btnResume.onclick = () => this.togglePause();
    }

    const btnAbandon = document.getElementById('btn-abandon-rite');
    if (btnAbandon) {
      btnAbandon.onclick = () => {
        this.abandonRun();
      };
    }
  }

  private togglePause() {
    if (this.gameState === 'PLAYING') {
      this.gameState = 'PAUSED';
      this.openPauseMenu();
      audioManager.playSfx('uiClick');
    } else if (this.gameState === 'PAUSED') {
      this.gameState = 'PLAYING';
      this.closePauseMenu();
      audioManager.playSfx('uiClick');
    }
  }

  private openPauseMenu() {
    const pauseScreen = document.getElementById('pause-screen');
    const grimoireList = document.getElementById('grimoire-list');
    if (!pauseScreen || !grimoireList) return;

    grimoireList.innerHTML = '';
    
    if (this.activeVexes.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'grimoire-pact';
      msg.style.gridColumn = '1 / -1';
      msg.style.textAlign = 'center';
      msg.textContent = 'The altar is clean. No pacts have been struck.';
      grimoireList.appendChild(msg);
    } else {
      this.activeVexes.forEach(vex => {
        const pact = document.createElement('div');
        pact.className = 'grimoire-pact';
        
        const roman = ['I', 'II', 'III'][vex.rank - 1] || vex.rank;
        const title = document.createElement('h3');
        title.textContent = `${vex.name} ${roman}`;
        
        const desc = document.createElement('div');
        desc.textContent = vex.description;

        const flavorText = vex.getFlavorText ? vex.getFlavorText(vex.rank as any) : '';
        const flavor = document.createElement('span');
        flavor.className = 'flavor';
        flavor.textContent = flavorText;

        pact.appendChild(title);
        pact.appendChild(desc);
        if (flavorText) pact.appendChild(flavor);

        grimoireList.appendChild(pact);
      });
    }

    pauseScreen.classList.remove('hidden');
  }

  private closePauseMenu() {
    const pauseScreen = document.getElementById('pause-screen');
    if (pauseScreen) pauseScreen.classList.add('hidden');
  }

    private resetGame() {
    this.initRun();
    this.initializeBoard();
    this.canHold = true;
    this.heldPiece = null;
    this.currentPiece = null;
    this.nextPiece = null;
    this.clearAllVexTimers();
    this.generateNextPiece();
    this.spawnPiece();
    if (this.gameOverBg) this.gameOverBg.setVisible(false);
    if (this.gameOverText) this.gameOverText.setVisible(false);
  }

  private abandonRun() {
    this.closePauseMenu();
    document.getElementById('main-menu')?.classList.remove('hidden');
    this.resetGame();
    this.gameState = 'MENU';
  }
}
