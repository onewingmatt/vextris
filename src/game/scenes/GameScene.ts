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
import { Vex, ScoringContext } from '../vex'
import { showVexShop } from '../shop'
import { DevPanel } from '../devPanel'
import { updateVexBar } from '../vexBar'
import { setFogHeight } from '../effects/fog'

export class GameScene extends Phaser.Scene {
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
  private gameOver = false
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
  private shopping = false
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
  // HUD dirty tracking - cache previous values to avoid unnecessary setText() calls
  private lastHudLevel = -1
  private lastHudScore = -1
  private lastHudScoreTarget = -1
  private lastHudTime = -1
  private lastHudResolveMax = -1
  private lastHudSpeed = -1
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

  // DAS variables
  private leftDownTime = 0
  private rightDownTime = 0
  private lastLeftMove = 0
  private lastRightMove = 0

  constructor() {
    super({ key: 'GameScene' })
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

    // Set background
    this.cameras.main.setBackgroundColor(COLORS.background)

    // Board and HUD layout

    // Create graphics for rendering
    this.graphics = this.add.graphics();

    const hudX = 416;
    let hudY = 112;

    // HUD Panel background
    this.add.rectangle(hudX - 16, hudY - 16, 208, 608, 0x111111, 0.6).setOrigin(0, 0).setStrokeStyle(4, 0x333333);

    const hudFont = {
      fontSize: '16px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ffffff',
    };
    const hudValueFont = { ...hudFont, fontSize: '14px' };

    // LEVEL
    this.add.text(hudX, hudY, 'LEVEL', hudFont).setOrigin(0, 0);
    this.hudLevelText = this.add.text(hudX, hudY + 20, '1', { ...hudFont, color: '#32CD32', fontSize: '22px' }).setOrigin(0, 0);
    hudY += 60;

    // SCORE  (cur / target)
    this.add.text(hudX, hudY, 'SCORE', hudFont).setOrigin(0, 0);
    this.hudScoreText = this.add.text(hudX, hudY + 20, '0/800', { ...hudValueFont, color: '#00BFFF' }).setOrigin(0, 0);
    hudY += 60;

    // TIME
    this.add.text(hudX, hudY, 'RESOLVE', hudFont).setOrigin(0, 0);
    this.hudTimeText = this.add.text(hudX, hudY + 20, '80/80', { ...hudValueFont, color: '#FFD700' }).setOrigin(0, 0);
    hudY += 60;

    // SPEED (gravity level)
    this.add.text(hudX, hudY, 'SPEED', hudFont).setOrigin(0, 0);
    this.hudSpeedText = this.add.text(hudX, hudY + 20, '0', { ...hudValueFont, color: '#FF6347' }).setOrigin(0, 0);
    hudY += 60;

    // NEXT
    this.add.text(hudX, hudY, 'NEXT', hudFont).setOrigin(0, 0);
    hudY += 145;

    // HOLD
    this.add.text(hudX, hudY, 'HOLD', hudFont).setOrigin(0, 0);

    // Last full-clear calculation — two-row scoreline panel
    const boardBottomY = 112 + BOARD_HEIGHT * BLOCK_SIZE;
    const boardLeftX = 48;
    // Stretch from board left to near right edge of game (640px wide)
    const boxWidth = 640 - boardLeftX - 20; // 572px available
    const boxHeight = 62;
    const boxX = boardLeftX + boxWidth / 2;
    const boxY = boardBottomY + 8;

    // Background panel
    this.lastCalcBox = this.add.rectangle(boxX, boxY, boxWidth, boxHeight, 0x0a0a0a, 0.95)
      .setOrigin(0.5, 0).setDepth(5).setStrokeStyle(2, 0x333333);

    // Top accent line
    this.add.rectangle(boxX, boxY, boxWidth, 2, 0x00BFFF, 0.8).setOrigin(0.5, 0).setDepth(6);

    // Top row: breakdown chips [clusters] [lines] [color mult] [line mult]
    const topConfigs = [
      // Top row: single full-width CLUSTER chip
      { id: 'clusters', icon: '@', label: 'CLUSTER', color: 0x8a8a8a, width: boxWidth - 32 },
    ];

    const chipGap = 6;
    const topChipY = boxY + 19;
    this.lastChips = [];
    // Single full-width CLUSTER chip, centered
    const clusterConfig = topConfigs[0];
    const clusterBg = this.add.rectangle(boxX, topChipY, clusterConfig.width, 20, 0x141414, 0.9)
      .setOrigin(0.5, 0.5).setDepth(6).setStrokeStyle(1, clusterConfig.color);
    this.add.rectangle(boxX - clusterConfig.width / 2 + 14, topChipY, 14, 14, clusterConfig.color, 0.22)
      .setOrigin(0.5, 0.5).setDepth(7).setStrokeStyle(1, clusterConfig.color, 0.8);
    this.add.text(boxX - clusterConfig.width / 2 + 14, topChipY, clusterConfig.icon, {
      fontSize: '8px', fontFamily: '"Press Start 2P", monospace', color: '#FFFFFF',
    }).setOrigin(0.5, 0.5).setDepth(8);
    const clusterLabel = this.add.text(boxX - clusterConfig.width / 2 + 25, topChipY, clusterConfig.label, {
      fontSize: '8px', fontFamily: '"Press Start 2P", monospace', color: '#D2D2D2', align: 'left', padding: { left: 0, right: 0, top: 0, bottom: 0 }
    }).setOrigin(0, 0.5).setDepth(7);
    const clusterValueText = this.add.text(boxX + clusterConfig.width / 2 - 10, topChipY, '', {
      fontSize: '9px', fontFamily: '"Press Start 2P", monospace', color: '#FFFFFF', align: 'right', padding: { left: 0, right: 0, top: 0, bottom: 0 }
    }).setOrigin(1, 0.5).setDepth(7);
    let clusterTexts: Phaser.GameObjects.Text[] = [];
    this.lastChips.push({ bg: clusterBg, text: clusterValueText, label: clusterLabel, config: clusterConfig, clusterTexts });

    // Bottom row: separator line and TOTAL
    const separatorY = boxY + 34;
    this.add.rectangle(boxX, separatorY, boxWidth - 20, 1, 0x222222, 0.8)
      .setOrigin(0.5, 0.5).setDepth(6);

    // Bottom row: COLOR, CLEARED, LINE MULT, TOTAL
    const bottomConfigs = [
      { id: 'color', icon: 'C', label: 'COLOR', color: 0x00BFFF, width: 80 },
      { id: 'cleared', icon: '#', label: 'CLEARED', color: 0x8a8a8a, width: 80 },
      { id: 'lineMult', icon: '×', label: 'LINE MULT', color: 0xFFA500, width: 100 },
      { id: 'total', icon: 'T', label: 'TOTAL', color: 0x7CFC00, width: 180 },
    ];
    const bottomContentWidth = bottomConfigs.reduce((sum, c) => sum + c.width, 0);
    const bottomTotalGap = chipGap * (bottomConfigs.length - 1);
    const bottomStartX = boxX - (bottomContentWidth + bottomTotalGap) / 2;
    const bottomChipY = boxY + 49;

    let bottomChipX = bottomStartX;
    for (const config of bottomConfigs) {
      const bg = this.add.rectangle(bottomChipX + config.width / 2, bottomChipY, config.width, 20, config.id === 'total' ? 0x102314 : 0x141414, config.id === 'total' ? 0.95 : 0.9)
        .setOrigin(0.5, 0.5).setDepth(6).setStrokeStyle(config.id === 'total' ? 2 : 1, config.color, config.id === 'total' ? 0.95 : 0.8);

      this.add.rectangle(bottomChipX + 14, bottomChipY, 14, 14, config.color, config.id === 'total' ? 0.25 : 0.22)
        .setOrigin(0.5, 0.5).setDepth(7).setStrokeStyle(1, config.color, config.id === 'total' ? 0.9 : 0.8);
      this.add.text(bottomChipX + 14, bottomChipY, config.icon, {
        fontSize: '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: config.id === 'total' ? '#E8FFE8' : '#FFFFFF',
      }).setOrigin(0.5, 0.5).setDepth(8);

      const labelText = this.add.text(bottomChipX + 25, bottomChipY, config.label, {
        fontSize: config.id === 'total' ? '9px' : '8px',
        fontFamily: '"Press Start 2P", monospace',
        color: config.id === 'total' ? '#CFFFD3' : '#D2D2D2',
        fontStyle: config.id === 'total' ? 'bold' : undefined,
        align: 'left',
        padding: { left: 0, right: 0, top: 0, bottom: 0 }
      }).setOrigin(0, 0.5).setDepth(7);

      const valueText = this.add.text(bottomChipX + config.width - 10, bottomChipY, '', {
        fontSize: config.id === 'total' ? '12px' : '9px',
        fontFamily: '"Press Start 2P", monospace',
        color: config.id === 'total' ? '#E8FFE8' : '#FFFFFF',
        fontStyle: config.id === 'total' ? 'bold' : undefined,
        align: 'right',
        padding: { left: 0, right: 0, top: 0, bottom: 0 }
      }).setOrigin(1, 0.5).setDepth(7);

      (bg as any).chipColor = config.color;
      this.lastChips.push({ bg, text: valueText, label: labelText, config });
      bottomChipX += config.width + chipGap;
    }

    // Game Over UI
    const gameOverX = 320; // Center of the 640px wide game
    const gameOverY = Math.floor(112 + (BOARD_HEIGHT * BLOCK_SIZE) / 2);

    this.gameOverBg = this.add.rectangle(gameOverX, gameOverY, 600, 160, 0x000000, 0.9)
      .setVisible(false).setDepth(9).setStrokeStyle(4, 0xFF6347);

    this.gameOverText = this.add.text(gameOverX, gameOverY, 'GAME OVER', {
      fontSize: '24px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6347',
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
      return;
    }

    this.currentPiece = this.nextPiece!
    this.currentPiece.position = { x: Math.floor(BOARD_WIDTH / 2) - Math.floor(this.currentPiece.shape[0].length / 2), y: 0 }
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
  }

  private handleInput(delta: number, time: number) {
    // Left movement with DAS
    if (Phaser.Input.Keyboard.JustDown(this.leftKey)) {
      this.movePiece(-1, 0)
      this.leftDownTime = 0
    } else if (this.leftKey.isDown) {
      this.leftDownTime += delta
      if (this.leftDownTime >= DAS_DELAY * 16.67 && (time - this.lastLeftMove) >= ARR_DELAY * 16.67) {
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
      if (this.rightDownTime >= DAS_DELAY * 16.67 && (time - this.lastRightMove) >= ARR_DELAY * 16.67) {
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
      this.hardDrop()
    } else if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.holdPiece()
    }
  }

  private hardDrop() {
    if (!this.currentPiece) return
    const ghostPos = this.getGhostPosition()
    if (ghostPos) {
      this.currentPiece.position = ghostPos

      // Screen shake and lock immediately
      this.cameras.main.shake(100, 0.003)
      this.lockPiece()
      this.clearLines()
      this.currentPiece = null
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
    this.gravityTimer = 0;
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

  private render() {
    this.graphics.clear();

    const boardOffsetX = 48;
    const boardOffsetY = 112;
    const severeFog = this.fogRank >= 9 && this.fogHeightPx > 0
    const fogTopLocalY = BOARD_HEIGHT * BLOCK_SIZE - this.fogHeightPx

    // Draw background panel for board
    this.graphics.fillStyle(0x0a0a0a, 0.8);
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

        const px = Math.floor(boardOffsetX + x * BLOCK_SIZE);
        const py = Math.floor(boardOffsetY + y * BLOCK_SIZE);

        if (cell.filled || this.clearingLines.includes(y)) {
          const isOccluded = this.isHardFogOccludedRow(y);
          this.drawBlock(px, py, color, isOccluded ? 0.95 : 1, !isOccluded);
        }
      }
    }

    // Draw ghost piece
    if (this.currentPiece && !this.gameOver) {
      const ghostPos = this.getGhostPosition();
      if (ghostPos && ghostPos.y > this.currentPiece.position.y) {
        const { shape, colors } = this.currentPiece;
        for (let y = 0; y < shape.length; y++) {
          for (let x = 0; x < shape[y].length; x++) {
            if (shape[y][x] && !this.isHardFogOccludedRow(ghostPos.y + y)) {
              const px = Math.floor(boardOffsetX + (ghostPos.x + x) * BLOCK_SIZE);
              const py = Math.floor(boardOffsetY + (ghostPos.y + y) * BLOCK_SIZE);
              this.drawBlock(px, py, colors[y][x], 0.2); // Semi-transparent
            }
          }
        }
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
            if (this.fogRank > 0) {
              pieceColor = this.desaturateColorByFogRank(pieceColor);
            }
            const occluded = this.isHardFogOccludedRow(row);
            const px = Math.floor(boardOffsetX + (position.x + x) * BLOCK_SIZE);
            const py = Math.floor(boardOffsetY + (position.y + y) * BLOCK_SIZE);
            this.drawBlock(px, py, pieceColor, occluded ? 0.95 : 1, !occluded);
          }
        }
      }
    }

    // Draw next piece preview — positioned directly under the NEXT label
    // HUD starts at y=112. Rows: LEVEL(60) + SCORE(60) + TIME(60) + SPEED(60) + NEXT_label(20) = 372 → preview at ~392
    if (this.nextPiece) {
      const { shape, colors } = this.nextPiece;
      const nextX = 416;
      const nextY = 392;
      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (shape[y][x]) {
            const px = Math.floor(nextX + x * BLOCK_SIZE);
            const py = Math.floor(nextY + y * BLOCK_SIZE);
            this.drawBlock(px, py, colors[y][x]);
          }
        }
      }
    }

    // Draw held piece preview — positioned directly under the HOLD label
    // HOLD label is ~145px below NEXT label → ~112 + 60*4 + 145 = 497 → preview at ~517
    if (this.heldPiece) {
      const { shape, colors } = this.heldPiece;
      const holdX = 416;
      const holdY = 537;
      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (shape[y][x]) {
            const px = Math.floor(holdX + x * BLOCK_SIZE);
            const py = Math.floor(holdY + y * BLOCK_SIZE);
            this.drawBlock(px, py, colors[y][x]);
          }
        }
      }
    }

    // Draw board border with a subtle glow
    this.graphics.lineStyle(2, 0x00BFFF, 0.5); // Cyan glow
    this.graphics.strokeRect(boardOffsetX - 1, boardOffsetY - 1, BOARD_WIDTH * BLOCK_SIZE + 2, BOARD_HEIGHT * BLOCK_SIZE + 2);
    this.graphics.lineStyle(1, 0xFFFFFF, 0.8);
    this.graphics.strokeRect(boardOffsetX, boardOffsetY, BOARD_WIDTH * BLOCK_SIZE, BOARD_HEIGHT * BLOCK_SIZE);

    // Draw subtle grid lines
    this.graphics.lineStyle(1, 0x333333, 0.3);
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

    // Draw floating score texts and impact messages
    this.renderFloatingTexts();
  }

  update(time: number, delta: number) {
    if (this.gameOver || this.shopping) return;

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
        const vexDetails: string[] = [];
        for (const vex of this.activeVexes) {
          const m = vex.getMultiplier(ctx, vex.rank);
          // Record contribution for the HUD breakdown (skip zero contributions)
          if (m !== 0) {
            vexDetails.push(`${vex.name} (r${vex.rank}, ${vex.kind}): ${m >= 0 ? '+' : ''}${m.toFixed(2)}`);
          }
          if (vex.kind === 'color') colorMultBonus += m;
          else if (vex.kind === 'line') lineMultBonus += m;
        }

        // Step 4: apply multipliers
        // colorMult scales how much colour clusters are worth.
        // lineMult scales how much clearing more lines is worth.
        // With no Vexes: colorMult=1, lineMult=1 → identical to old formula.
        const colorMult = 1 + colorMultBonus;
        const lineMult = 1 + lineMultBonus;
        const modifiedClusterPoints = totalClusterPoints * colorMult;
        const moveScore = Math.round(modifiedClusterPoints * (linesCleared * lineMult));

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
              clusterChip.text.setColor('#FFFFFF');
            }
          }
          // Update other chips
          const chipMap = new Map(this.lastChips.map(c => [c.config.id, c]));
          chipMap.get('cleared')?.text.setText(`×${linesCleared}`);
          chipMap.get('color')?.text.setText(`${colorMult.toFixed(2)}`);
          chipMap.get('lineMult')?.text.setText(`${lineMult.toFixed(2)}`);
          chipMap.get('total')?.text.setText(`${calcResult}`);

          // Activate chip backgrounds
          for (const chip of this.lastChips) {
            if (chip.config.id === 'total') {
              chip.bg.setFillStyle(0x204d2b, 0.95);
              chip.text.setColor('#E8FFE8');
              chip.label.setColor('#CFFFD3');
              chip.label.setVisible(true);
            } else if (chip.config.id === 'clusters') {
              chip.bg.setFillStyle(chip.config.color, 0.16);
              chip.text.setColor('#FFFFFF');
              chip.label.setColor('#D6D6D6');
              chip.label.setVisible(false);
              // Hide clusterTexts when not showing score
              if (chip.clusterTexts) for (const t of chip.clusterTexts) t.setVisible(true);
            } else {
              chip.bg.setFillStyle(chip.config.color, 0.16);
              chip.text.setColor('#FFFFFF');
              chip.label.setColor('#D6D6D6');
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

          let color = '#FFFFFF';
          let scale = 1.0;
          let shakeMag = 0;

          if (moveScore >= 1000) {
            color = '#FFD700';
            scale = 1.4;
            shakeMag = 0.005;
            this.cameras.main.flash(100, 255, 255, 255, false); // Very subtle white flash
          } else if (moveScore >= 500) {
            color = '#FFD700'; // Gold for good scores
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
    const currentDelay = isSoftDrop ? 1 : this.gravityDelay;
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
        this.gameOver = true;
        this.gameOverBg.setVisible(true);
        this.gameOverText.setVisible(true);
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
        const retreatSpeed = this.fogRank >= 9 ? 18 : this.fogRank >= 7 ? 24 : 40
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
            chip.text.setText('');
            if (chip.config.id === 'total') {
              chip.bg.setFillStyle(0x102314, 0.95);
              chip.label.setColor('#CFFFD3');
              chip.label.setVisible(true);
            } else if (chip.config.id === 'clusters') {
              chip.bg.setFillStyle(0x141414, 0.9);
              chip.label.setColor('#D2D2D2');
              chip.label.setVisible(true);
              // Hide clusterTexts when idle
              if (chip.clusterTexts) for (const t of chip.clusterTexts) t.setVisible(false);
            } else {
              chip.bg.setFillStyle(0x141414, 0.9);
              chip.label.setColor('#D2D2D2');
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
    this.shopping = true

    // Visual flash before the overlay
    const boardCenterX = 48 + (BOARD_WIDTH * BLOCK_SIZE) / 2
    const boardCenterY = 112 + (BOARD_HEIGHT * BLOCK_SIZE) / 2
    this.showFloatingText(boardCenterX, boardCenterY, `LEVEL ${this.currentLevel} CLEAR!`, '#32CD32', 1.2)
    this.cameras.main.flash(300, 50, 255, 50, false)

    // Small delay so the flash is visible before overlay appears
    this.time.delayedCall(400, () => {
      showVexShop(this.activeVexes, this.currentLevel, () => {
        this.startNextLevel()
      })
    })
  }

  /**
   * Resets per-level state and starts the next level.
   * Called by the shop's onPick callback.
   */
  private startNextLevel(): void {
    this.shopping = false
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
    this.gameOver = true
    this.gameOverBg.setVisible(true)
    this.gameOverText.setText('RESOLVE DEPLETED!')
    this.gameOverText.setStyle({ color: '#FF6347' })
    this.gameOverText.setVisible(true)
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

    // 4. Check for top-out (if blocks exceed top of board, game over)
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (this.board[0][x].filled) {
        // Top row has a block — trigger game over via existing logic
        this.gameOver = true;
        this.gameOverBg.setVisible(true);
        this.gameOverText.setText('GARBAGE OVERFLOW!');
        this.gameOverText.setStyle({ color: '#FF6347' });
        this.gameOverText.setVisible(true);
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
      const rockColors = [0x8B4513, 0x654321, 0x704214, 0x6F4E37, 0x704214];
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
        if (!this.shopping && !this.gameOver) {
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
  }

  /**
   * Sets up effects for all active Vexes.
   * Called at the start of each level after activeVexes is populated.
   */
  private setupVexEffects(): void {
    for (const vex of this.activeVexes) {
      if (vex.id === 'rising_dread') {
        this.startRisingDreadTimer(vex.rank);
      }
      // Add more Vex effects here as needed
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
    const rowsByRank = [0, 0, 0.5, 1, 1.75, 2.5, 3.1, 4.1, 5.4, 6.7, 8]
    return rowsByRank[clampedRank]
  }

  private isHardFogOccludedRow(row: number): boolean {
    if (this.fogRank < 9 || this.fogHeightPx <= 0) return false
    const rowMidpoint = row * BLOCK_SIZE + BLOCK_SIZE / 2
    return rowMidpoint >= (BOARD_HEIGHT * BLOCK_SIZE - this.fogHeightPx)
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

    // Gradually fade colors to grayscale from rank 1 to 10
    // Rank 1-3: mostly colored, Rank 4-6: increasingly gray, Rank 7-10: mostly grayscale
    let desaturation = Math.max(0, Math.min(1, (this.fogRank - 2) / 8)) // 0 at rank ≤2, 1 at rank ≥10
    
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
    const pressureColumns = Math.max(1, Math.ceil(columnHeights.length * 0.35))
    const pressureSurface = columnHeights.slice(0, pressureColumns)
      .reduce((sum, height) => sum + height, 0) / pressureColumns
    const paddingRows = 1 + Math.min(1.1, Math.max(0, fogRank - 1) * 0.12)
    const targetRows = Math.min(BOARD_HEIGHT, Math.max(minimumRows, pressureSurface + paddingRows))

    return targetRows * BLOCK_SIZE
  }
}
