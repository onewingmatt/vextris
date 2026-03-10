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
} from '../config'

export class GameScene extends Phaser.Scene {
  private board: Cell[][] = []
  private currentPiece: Piece | null = null
  private nextPiece: Piece | null = null
  private heldPiece: Piece | null = null
  private canHold = true
  private score = 0
  private level = INITIAL_LEVEL
  private lines = 0
  private gravityTimer = 0
  private gravityDelay = GRAVITY_TABLE[0]
  private lockDelayTimer = 0
  private lockDelayActive = false
  private readonly LOCK_DELAY = 24; // frames (about 0.4s at 60fps)
  private gameOver = false
  private clearingLines: number[] = []
  private scoringClusters: { blocks: { x: number, y: number }[], color: number }[] = []
  private clearTimer = 0

  private particles: { x: number, y: number, vx: number, vy: number, life: number, color: number }[] = []
  private floatingTexts: { x: number, y: number, text: string, life: number, color: string, scale: number }[] = []

  private graphics!: Phaser.GameObjects.Graphics
  private gameOverBg!: Phaser.GameObjects.Rectangle
  private gameOverText!: Phaser.GameObjects.Text
  private scoreValueText!: Phaser.GameObjects.Text
  private levelValueText!: Phaser.GameObjects.Text
  private linesValueText!: Phaser.GameObjects.Text

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
    const boardOffsetX = 48; 
    const boardOffsetY = 112; 

    // Create graphics for rendering
    this.graphics = this.add.graphics();

    // HUD: Professional panels and crisp text
    const hudX = 416; 
    let hudY = 112;
    
    // HUD Panel background
    this.add.rectangle(hudX - 16, hudY - 16, 208, 608, 0x111111, 0.6).setOrigin(0, 0).setStrokeStyle(4, 0x333333);

    const hudFont = {
      fontSize: '32px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#ffffff',
    };
    
    this.add.text(hudX, hudY, 'SCORE', hudFont).setOrigin(0, 0);
    this.scoreValueText = this.add.text(hudX, hudY + 32, '0', { ...hudFont, color: '#00BFFF' }).setOrigin(0, 0);
    hudY += 96;
    
    this.add.text(hudX, hudY, 'LEVEL', hudFont).setOrigin(0, 0);
    this.levelValueText = this.add.text(hudX, hudY + 32, '0', { ...hudFont, color: '#32CD32' }).setOrigin(0, 0);
    hudY += 96;
    
    this.add.text(hudX, hudY, 'LINES', hudFont).setOrigin(0, 0);
    this.linesValueText = this.add.text(hudX, hudY + 32, '0', { ...hudFont, color: '#FFD700' }).setOrigin(0, 0);
    hudY += 96;
    
    this.add.text(hudX, hudY, 'NEXT', hudFont).setOrigin(0, 0);
    hudY += 160; 

    this.add.text(hudX, hudY, 'HOLD', hudFont).setOrigin(0, 0);
    
    // Game Over UI: Resize to fit board and add background
    const gameOverX = Math.floor(boardOffsetX + (BOARD_WIDTH * BLOCK_SIZE) / 2);
    const gameOverY = Math.floor(boardOffsetY + (BOARD_HEIGHT * BLOCK_SIZE) / 2);
    
    this.gameOverBg = this.add.rectangle(gameOverX, gameOverY, BOARD_WIDTH * BLOCK_SIZE, 128, 0x000000, 0.8)
      .setVisible(false).setDepth(9);
      
    this.gameOverText = this.add.text(gameOverX, gameOverY, 'GAME OVER', {
      fontSize: '32px',
      fontFamily: '"Press Start 2P", monospace',
      color: '#FF6347',
      align: 'center',
    }).setOrigin(0.5).setShadow(4, 4, '#000', 0, true, true).setVisible(false).setDepth(10);
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
      this.lockDelayActive = false
      this.lockDelayTimer = 0
    }
  }

  private movePiece(dx: number, dy: number): boolean {
    if (!this.currentPiece) return false
    const newPos = { x: this.currentPiece.position.x + dx, y: this.currentPiece.position.y + dy }
    if (this.isValidPosition(this.currentPiece.shape, newPos)) {
      this.currentPiece.position = newPos
      // If piece is on the ground after move, reset lock delay
      if (this.isOnGround(this.currentPiece)) {
        this.lockDelayActive = true;
        this.lockDelayTimer = 0;
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
    if (this.isValidPosition(rotated, this.currentPiece.position)) {
      this.currentPiece.shape = rotated
      this.currentPiece.colors = rotatedColors
      // If piece is on the ground after rotate, reset lock delay
      if (this.isOnGround(this.currentPiece)) {
        this.lockDelayActive = true;
        this.lockDelayTimer = 0;
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
    this.lockDelayActive = false;
    this.lockDelayTimer = 0;
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

  // Returns true if the piece is on the ground (cannot move down)
  private isOnGround(piece: Piece): boolean {
    const pos = { x: piece.position.x, y: piece.position.y + 1 };
    return !this.isValidPosition(piece.shape, pos);
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

    // Draw next piece preview
    if (this.nextPiece) {
      const { shape, colors } = this.nextPiece;
      const nextX = 416;
      const nextY = 448;
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

    // Draw held piece preview
    if (this.heldPiece) {
      const { shape, colors } = this.heldPiece;
      const holdX = 416;
      const holdY = 608;
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
    if (this.gameOver) return;

    // Line clear animation delay
    if (this.clearTimer > 0) {
      this.clearTimer--;
      if (this.clearTimer === 0) {
        // --- Scoring Revamp: Color Clusters ---
        // We MUST score the blocks BEFORE we clear the board rows
        const linesCleared = this.clearingLines.length;
        this.lines += linesCleared;

        // Feedback: Clear previous floating texts to prevent clutter
        this.floatingTexts = [];

        let totalClusterPoints = 0;
        this.scoringClusters.forEach(cluster => {
          totalClusterPoints += cluster.blocks.length * cluster.blocks.length;
        });

        const moveScore = totalClusterPoints * linesCleared;
        this.score += moveScore;
        
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

    // Gravity
    const isSoftDrop = this.downKey.isDown;
    const currentDelay = isSoftDrop ? 1 : this.gravityDelay;
    this.gravityTimer += delta;
    
    if (this.gravityTimer >= currentDelay * 16.67) {
      const moved = this.movePiece(0, 1);
      if (!moved) {
        if (!this.lockDelayActive) {
          this.lockDelayActive = true;
          this.lockDelayTimer = 0;
        }
      }
      this.gravityTimer = 0;
    }

    // Lock delay logic
    if (this.lockDelayActive && this.currentPiece) {
      if (!this.isOnGround(this.currentPiece)) {
        this.lockDelayActive = false;
        this.lockDelayTimer = 0;
      } else {
        this.lockDelayTimer++;
        if (this.lockDelayTimer >= this.LOCK_DELAY) {
          this.lockPiece();
          this.clearLines();
          this.currentPiece = null;
          this.lockDelayActive = false;
          this.lockDelayTimer = 0;
          
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
      }
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
    this.scoreValueText.setText(this.score.toString());
    this.levelValueText.setText(this.level.toString());
    this.linesValueText.setText(this.lines.toString());

    // Render
    this.render();
    this.renderParticles();
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
}
