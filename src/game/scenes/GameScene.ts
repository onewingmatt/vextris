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

  private particles: { x: number, y: number, vx: number, vy: number, life: number, color: number }[] = []
  private floatingTexts: { x: number, y: number, text: string, life: number, color: string, scale: number }[] = []

  private graphics!: Phaser.GameObjects.Graphics
  private gameOverBg!: Phaser.GameObjects.Rectangle
  private gameOverText!: Phaser.GameObjects.Text
  // HUD text references
  private hudLevelText!: Phaser.GameObjects.Text
  private hudScoreText!: Phaser.GameObjects.Text  // "cur / target"
  private hudTimeText!: Phaser.GameObjects.Text
  private hudSpeedText!: Phaser.GameObjects.Text  // gravity speed level
  private lastCalcTimestamp = 0
  private lastCalcBox!: Phaser.GameObjects.Rectangle
  private lastChips!: { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }[]

  /** Dev panel — backtick to open/close */
  private devPanel!: DevPanel

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

    // Last full-clear calculation — compact chip-style panel aligned with board to avoid HUD overlap
    const boardBottomY = 112 + BOARD_HEIGHT * BLOCK_SIZE;
    const boardLeftX = 48;
    const boardWidthPx = BOARD_WIDTH * BLOCK_SIZE;
    const boxWidth = boardWidthPx + 16; // small padding
    const boxHeight = 40;
    const boxX = boardLeftX + boardWidthPx / 2;
    const boxY = boardBottomY + 8;
    this.lastCalcBox = this.add.rectangle(boxX, boxY, boxWidth, boxHeight, 0x000000, 0.6).setOrigin(0.5, 0).setDepth(5).setStrokeStyle(2, 0x222222);

    // Create compact chips (no labels). They auto-align inside the board width so they won't overlap the HUD.
    const chipCount = 6;
    const chipPadding = 8;
    const chipGap = 6;
    const chipWidth = Math.floor((boxWidth - chipPadding * 2 - chipGap * (chipCount - 1)) / chipCount);
    let chipX = boxX - boxWidth / 2 + chipPadding;
    const chipY = boxY + boxHeight / 2;

    const chipColors = [0xFFFFFF, 0xFFFFFF, 0x00BFFF, 0xFFA500, 0xFFD700, 0x7CFC00];
    this.lastChips = [];
    for (let i = 0; i < chipCount; i++) {
      const bg = this.add.rectangle(chipX + chipWidth / 2, chipY, chipWidth, boxHeight - 12, 0x000000, 0).setOrigin(0.5, 0.5).setDepth(6).setStrokeStyle(1, 0x111111);
      const txt = this.add.text(chipX + 6, chipY - 8, '', { fontSize: '12px', fontFamily: '"Press Start 2P", monospace', color: '#FFFFFF' }).setOrigin(0, 0.5).setDepth(7);
      // store intended chip color (used when active)
      (bg as any).chipColor = chipColors[i];
      this.lastChips.push({ bg, text: txt });
      chipX += chipWidth + chipGap;
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

    // Dev panel (backtick to toggle)
    this.devPanel = new DevPanel(this.activeVexes, () => { /* no extra action needed */ })
    this.devPanel.bindKey()
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


  private drawBlock(x: number, y: number, color: number, alpha: number = 1) {
    const size = BLOCK_SIZE;

    // Main block
    this.graphics.fillStyle(color, alpha);
    this.graphics.fillRect(x, y, size, size);

    if (alpha === 1) {
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

        const px = Math.floor(boardOffsetX + x * BLOCK_SIZE);
        const py = Math.floor(boardOffsetY + y * BLOCK_SIZE);

        if (cell.filled || this.clearingLines.includes(y)) {
          this.drawBlock(px, py, color);
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
            if (shape[y][x]) {
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
            const px = Math.floor(boardOffsetX + (position.x + x) * BLOCK_SIZE);
            const py = Math.floor(boardOffsetY + (position.y + y) * BLOCK_SIZE);
            this.drawBlock(px, py, colors[y][x]);
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
    for (let x = 1; x < BOARD_WIDTH; x++) {
      this.graphics.moveTo(boardOffsetX + x * BLOCK_SIZE, boardOffsetY)
        .lineTo(boardOffsetX + x * BLOCK_SIZE, boardOffsetY + BOARD_HEIGHT * BLOCK_SIZE)
        .stroke();
    }
    for (let y = 1; y < BOARD_HEIGHT; y++) {
      this.graphics.moveTo(boardOffsetX, boardOffsetY + y * BLOCK_SIZE)
        .lineTo(boardOffsetX + BOARD_WIDTH * BLOCK_SIZE, boardOffsetY + y * BLOCK_SIZE)
        .stroke();
    }

    // Draw floating score texts and impact messages
    this.renderFloatingTexts();
  }

  update(time: number, delta: number) {
    if (this.gameOver || this.shopping) return;

    // Line clear animation delay
    if (this.clearTimer > 0) {
      this.clearTimer--;
      if (this.clearTimer === 0) {
        // --- Scoring: Color Clusters + Vex multipliers ---
        // We MUST score BEFORE clearing the board rows.
        const linesCleared = this.clearingLines.length;
        this.lines += linesCleared;

        // Feedback: clear stale floating texts
        this.floatingTexts = [];

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
          // Compact, label-free display
          // Clusters: show sizes as "4·2" (dot separator)
          const clusterSizes = this.scoringClusters.map(c => c.blocks.length).join('·');
          // Map values to chips: [clusters, lines, colorBonus, lineBonus, multipliers, result]
          const chipValues = [
            clusterSizes,
            `×${linesCleared}`,
            colorMultBonus !== 0 ? `${colorMultBonus >= 0 ? '+' : ''}${colorMultBonus.toFixed(2)}` : '',
            lineMultBonus !== 0 ? `${lineMultBonus >= 0 ? '+' : ''}${lineMultBonus.toFixed(2)}` : '',
            `${colorMult.toFixed(2)}·${lineMult.toFixed(2)}`,
            `=${calcResult}`,
          ];

          for (let i = 0; i < this.lastChips.length; i++) {
            const chip = this.lastChips[i];
            const val = chipValues[i] || '';
            chip.text.setText(val);
            if (val) {
              (chip.bg as any).setFillStyle((chip.bg as any).chipColor, 0.12);
            } else {
              (chip.bg as any).setFillStyle(0x000000, 0);
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

    // Update particles
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // gravity
      p.life -= 0.02;
      return p.life > 0;
    });

    // Update floating texts
    this.floatingTexts = this.floatingTexts.filter(ft => {
      ft.y -= 0.3; // float up
      ft.life -= 0.015;
      return ft.life > 0;
    });

    // Update HUD
    this.hudLevelText.setText(`${this.currentLevel}`)
    this.hudScoreText.setText(`${this.currentLevelScore}/${this.currentLevelParams.targetScore}`)
    this.hudTimeText.setText(`${Math.ceil(this.resolveCurrent)} / ${this.currentLevelParams.resolveMax}`)
    this.hudSpeedText.setText(`${this.level}`)

    // Update Balatro-style Vex bar across the top
    updateVexBar(this.activeVexes)

    // If Fog Vex is active, drive the canvas height from board state
    if (this.activeVexes.some(v => v.id === 'fog')) {
      setFogHeight(this.computeFogHeight())
    }

    // Fade the last calculation display after 7 seconds
    if (this.lastCalcTimestamp) {
      const age = Date.now() - this.lastCalcTimestamp;
      if (age > 7000) {
        if (this.lastChips) {
          for (const chip of this.lastChips) {
            chip.text.setText('');
            chip.bg.setFillStyle(0x000000, 0);
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
      this.particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 16,
        vy: (Math.random() - 0.5) * 16,
        life: 1.0,
        color
      });
    }
  }

  private renderParticles() {
    this.particles.forEach(p => {
      this.graphics.fillStyle(p.color, p.life);
      this.graphics.fillRect(p.x - 4, p.y - 4, 8, 8);
    });
  }

  private showFloatingText(x: number, y: number, text: string, color: string, scale: number = 1) {
    this.floatingTexts.push({ x, y, text, life: 1.0, color, scale });
  }

  private renderFloatingTexts() {
    this.floatingTexts.forEach(ft => {
      const alpha = Math.min(1, ft.life * 2);
      // Using a temporary text object for rendering
      // Note: In a production app, we'd use a pool or bitmap fonts for performance
      const t = this.add.text(ft.x, ft.y, ft.text, {
        fontSize: '32px',
        fontFamily: '"Press Start 2P", monospace',
        color: ft.color,
        align: 'center',
        resolution: 3,
      }).setOrigin(0.5).setAlpha(alpha).setScale(ft.scale).setDepth(20);

      // Force immediate render then destroy
      // This is a bit of a hack for the manual render loop but works for few objects
      this.children.bringToTop(t);
      this.time.delayedCall(0, () => t.destroy());
    });
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
  /**
   * Compute the target fog height in pixels.
   * For each column that has any blocks, finds the topmost filled row and
   * takes the average across all filled columns. This tracks the game surface
   * level — where active stacking is happening — rather than the bulk average
   * (which always lags well below the block tops).
   *
   * Empty columns are ignored so a single tiny stack doesn't pull the average
   * all the way across an otherwise open board.
   */
  private computeFogHeight(): number {
    let totalTopRowFromBottom = 0
    let filledCols = 0

    for (let col = 0; col < BOARD_WIDTH; col++) {
      for (let row = 0; row < BOARD_HEIGHT; row++) {
        if (this.board[row][col].filled) {
          // row 17 (bottom row) = 1 from bottom; row 0 (top) = 18 from bottom
          totalTopRowFromBottom += (BOARD_HEIGHT - row)
          filledCols++
          break   // only need the topmost block in each column
        }
      }
      // empty column contributes nothing
    }

    if (filledCols === 0) return 0

    const avgTopFromBottom = totalTopRowFromBottom / filledCols
    // +1 row padding so the fog clearly wraps around the block tops
    return (avgTopFromBottom + 1) * BLOCK_SIZE
  }
}
