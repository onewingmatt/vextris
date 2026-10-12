/**
 * config.test.ts — Unit tests for src/game/config.ts
 *
 * Tests pure configuration helpers that have no runtime dependencies.
 */
import { describe, it, expect } from 'vitest'
import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  GRAVITY_TABLE,
  LINES_PER_LEVEL,
  DAS_DELAY,
  ARR_DELAY,
  getLevelParams,
  WALL_KICK_OFFSETS,
} from './config'

describe('Board constants', () => {
  it('has correct board dimensions', () => {
    expect(BOARD_WIDTH).toBe(10)
    expect(BOARD_HEIGHT).toBe(18)
  })

  it('has standard lines-per-level', () => {
    expect(LINES_PER_LEVEL).toBe(10)
  })
})

describe('Input delay constants', () => {
  it('has DAS_DELAY of 16 frames', () => {
    expect(DAS_DELAY).toBe(16)
  })

  it('has ARR_DELAY of 6 frames', () => {
    expect(ARR_DELAY).toBe(6)
  })
})

describe('GRAVITY_TABLE', () => {
  it('has 30 entries', () => {
    expect(GRAVITY_TABLE).toHaveLength(30)
  })

  it('starts at 53 (slowest) and ends at 1 (fastest)', () => {
    expect(GRAVITY_TABLE[0]).toBe(53)
    expect(GRAVITY_TABLE[GRAVITY_TABLE.length - 1]).toBe(1)
  })

  it('is non-increasing (gravity only speeds up)', () => {
    for (let i = 1; i < GRAVITY_TABLE.length; i++) {
      expect(GRAVITY_TABLE[i]).toBeLessThanOrEqual(GRAVITY_TABLE[i - 1])
    }
  })

  it('contains only positive integers', () => {
    for (const frames of GRAVITY_TABLE) {
      expect(Number.isInteger(frames)).toBe(true)
      expect(frames).toBeGreaterThan(0)
    }
  })
})

describe('getLevelParams', () => {
  it('returns params for level 1', () => {
    const p = getLevelParams(1)
    expect(p.level).toBe(1)
    expect(p.targetScore).toBeGreaterThan(0)
    expect(p.resolveMax).toBeGreaterThan(0)
  })

  it('returns params for level 10', () => {
    const p = getLevelParams(10)
    expect(p.level).toBe(10)
    expect(p.targetScore).toBeGreaterThan(0)
  })

  it('clamps level below 1 to level 1', () => {
    expect(getLevelParams(0)).toEqual(getLevelParams(1))
    expect(getLevelParams(-5)).toEqual(getLevelParams(1))
  })

  it('clamps level above 10 to level 10', () => {
    expect(getLevelParams(11)).toEqual(getLevelParams(10))
    expect(getLevelParams(99)).toEqual(getLevelParams(10))
  })

  it('target scores increase from level 1 to 10', () => {
    for (let lvl = 2; lvl <= 10; lvl++) {
      expect(getLevelParams(lvl).targetScore).toBeGreaterThan(
        getLevelParams(lvl - 1).targetScore,
      )
    }
  })
})
describe('WALL_KICK_OFFSETS', () => {
  // Pins the rotation feel. If this fails, someone changed how rotation behaves
  // against a wall (e.g. by wiring in SRS_WALL_KICKS, whose entries also move
  // the piece vertically) — a gameplay change, and it should be a deliberate one.
  it('is the five sideways offsets, in the order rotatePiece tries them', () => {
    expect([...WALL_KICK_OFFSETS]).toEqual([0, -1, 1, -2, 2])
  })

  it('tries the unshifted rotation first, so a free rotation never displaces the piece', () => {
    expect(WALL_KICK_OFFSETS[0]).toBe(0)
  })

  it('never moves the piece vertically', () => {
    expect(WALL_KICK_OFFSETS.every((offset) => Number.isInteger(offset))).toBe(true)
    expect(WALL_KICK_OFFSETS).toHaveLength(5)
  })
})
