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

// Colors: occult-forward palette that keeps all piece hues clearly distinct.
// Piece hues are tuned slightly brighter/warmer for readability against the ritual UI shell.
export const COLORS = {
  background: 0x07060b, // Near-black violet stone
  empty: 0x19141f, // Ritual slate
  blockI: 0x55c3d8, // Ether cyan
  blockO: 0xd8b764, // Relic gold
  blockT: 0xa57cd1, // Hex violet
  blockS: 0x73ad63, // Moss green
  blockZ: 0xc76559, // Blood clay
  blockJ: 0x5a74bd, // Dusk indigo
  blockL: 0xd79456, // Ember amber
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
  targetScore: number   // Score needed for this level (currentLevelScore)
  resolveMax: number    // Total Resolve resource for this level
}

/** Level data for levels 1–10, clamped above 10. */
const LEVEL_TABLE: LevelParams[] = [
  // Early levels are softened further to let players reach the core Vex mechanics.
  { level: 1, targetScore: 500, resolveMax: 150 },
  { level: 2, targetScore: 700, resolveMax: 170 },
  { level: 3, targetScore: 1000, resolveMax: 185 },
  { level: 4, targetScore: 1400, resolveMax: 195 },
  { level: 5, targetScore: 2200, resolveMax: 205 },
  { level: 6, targetScore: 6075, resolveMax: 195 },
  { level: 7, targetScore: 9110, resolveMax: 210 },
  { level: 8, targetScore: 13665, resolveMax: 225 },
  { level: 9, targetScore: 20497, resolveMax: 240 },
  { level: 10, targetScore: 30746, resolveMax: 255 },
]

/**
 * Returns the LevelParams for a given level number.
 * Levels above 10 are clamped to level-10 params.
 */
export function getLevelParams(level: number): LevelParams {
  const clamped = Math.max(1, Math.min(level, LEVEL_TABLE.length))
  return LEVEL_TABLE[clamped - 1]
}
