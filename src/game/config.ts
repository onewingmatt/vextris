// Game configuration constants

export const BOARD_WIDTH = 10
export const BOARD_HEIGHT = 18

export const BLOCK_SIZE = 32 // 32x32 pixels per block for high-res rendering

export const INITIAL_LEVEL = 0
export const LINES_PER_LEVEL = 10

// Gravity: frames per row drop, Game Boy style
export const GRAVITY_TABLE = [
  53, 49, 45, 41, 37, 33, 28, 22, 17, 11,
  10, 9, 8, 7, 6, 6, 5, 5, 4, 4,
  3, 3, 2, 2, 2, 2, 2, 2, 1, 1,
] // Extend as needed

// Scoring: based on Game Boy Tetris
export const SCORE_TABLE = {
  single: 40,
  double: 100,
  triple: 300,
  tetris: 1200,
}

// Soft drop multiplier
export const SOFT_DROP_MULTIPLIER = 20

// Input delays (in frames, assuming 60 FPS)
export const DAS_DELAY = 16 // Delayed Auto Shift
export const ARR_DELAY = 6 // Auto Repeat Rate
export const SOFT_DROP_DELAY = 0 // Immediate

// Colors: Distinct vibrant palette
export const COLORS = {
  background: 0x000000, // Black
  empty: 0x111111, // Dark gray
  blockI: 0x00BFFF, // Deep Sky Blue
  blockO: 0xFFD700, // Gold
  blockT: 0xDA70D6, // Orchid
  blockS: 0x32CD32, // Lime Green
  blockZ: 0xFF6347, // Tomato
  blockJ: 0x4169E1, // Royal Blue
  blockL: 0xFFA07A, // Light Salmon
}

// Pieces
export const PIECES = [
  {
    type: 'I',
    shape: [[1, 1, 1, 1]],
  },
  {
    type: 'O',
    shape: [[1, 1], [1, 1]],
  },
  {
    type: 'T',
    shape: [[0, 1, 0], [1, 1, 1]],
  },
  {
    type: 'S',
    shape: [[0, 1, 1], [1, 1, 0]],
  },
  {
    type: 'Z',
    shape: [[1, 1, 0], [0, 1, 1]],
  },
  {
    type: 'J',
    shape: [[1, 0, 0], [1, 1, 1]],
  },
  {
    type: 'L',
    shape: [[0, 0, 1], [1, 1, 1]],
  },
]

export const BLOCK_COLORS = [
  COLORS.blockI,
  COLORS.blockO,
  COLORS.blockT,
  COLORS.blockS,
  COLORS.blockZ,
  COLORS.blockJ,
  COLORS.blockL,
]

// Types
export interface Cell {
  filled: boolean
  color: number
}

export interface Position {
  x: number
  y: number
}

export interface Piece {
  type: string
  shape: number[][]
  colors: number[][]
  position: Position
}

export interface BoardState {
  grid: Cell[][]
  currentPiece: Piece | null
  score: number
  level: number
  lines: number
}

// --- Level Progression ---

export interface LevelParams {
  level: number
  targetScore: number       // Score needed for this level (currentLevelScore)
  timeLimitSeconds: number  // Seconds allowed to reach the targetScore
}

/** Level data for levels 1–10, clamped above 10. */
const LEVEL_TABLE: LevelParams[] = [
  { level: 1, targetScore: 800, timeLimitSeconds: 180 },
  { level: 2, targetScore: 1400, timeLimitSeconds: 200 },
  { level: 3, targetScore: 2000, timeLimitSeconds: 220 },
  { level: 4, targetScore: 2600, timeLimitSeconds: 240 },
  { level: 5, targetScore: 3200, timeLimitSeconds: 260 },
  { level: 6, targetScore: 3800, timeLimitSeconds: 280 },
  { level: 7, targetScore: 4400, timeLimitSeconds: 300 },
  { level: 8, targetScore: 5000, timeLimitSeconds: 320 },
  { level: 9, targetScore: 5600, timeLimitSeconds: 340 },
  { level: 10, targetScore: 6200, timeLimitSeconds: 360 },
]

/**
 * Returns the LevelParams for a given level number.
 * Levels above 10 are clamped to level-10 params.
 */
export function getLevelParams(level: number): LevelParams {
  const clamped = Math.max(1, Math.min(level, LEVEL_TABLE.length))
  return LEVEL_TABLE[clamped - 1]
}
