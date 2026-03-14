/**
 * vex.test.ts — Unit tests for src/game/vex.ts
 *
 * Tests Vex multipliers, rank helpers, and upgradeVex — all pure logic that
 * doesn't touch the DOM. Effects (blackout, fog) are mocked out so these tests
 * run in a Node environment without a browser.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock DOM-dependent effect modules before importing vex.ts
vi.mock('./effects/blackout', () => ({
  enableBlackout: vi.fn(),
  disableBlackout: vi.fn(),
}))
vi.mock('./effects/fog', () => ({
  enableFog: vi.fn(),
  disableFog: vi.fn(),
}))

import {
  upgradeVex,
  getLeadFingersDASBonus,
  getLeadFingersARRBonus,
  getWhiplashDuration,
  getMirageConfig,
  getPressureTimeLimit,
  getQuicksandBonusMultiplier,
  getJinxedConfig,
  STARTER_VEX_FACTORIES,
  type ScoringContext,
  type VexRank,
} from './vex'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ScoringContext for use in multiplier tests. */
function makeCtx(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    linesCleared: 1,
    clusters: [],
    totalClusterPoints: 9,
    maxClusterSize: 3,
    colorsInMove: new Set([0x55c3d8]),
    moveIndex: 0,
    combo: 0,
    timeRemaining: 60,
    currentLevel: 1,
    ...overrides,
  }
}

const ALL_RANKS: VexRank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

// ---------------------------------------------------------------------------
// upgradeVex
// ---------------------------------------------------------------------------

describe('upgradeVex', () => {
  it('updates the rank and calls onRankChange', () => {
    const onRankChange = vi.fn()
    const vex = STARTER_VEX_FACTORIES.blackout(1)
    vex.onRankChange = onRankChange

    upgradeVex(vex, 3)

    expect(vex.rank).toBe(3)
    expect(onRankChange).toHaveBeenCalledWith(1, 3)
  })

  it('does nothing when the rank is unchanged', () => {
    const onRankChange = vi.fn()
    const vex = STARTER_VEX_FACTORIES.blackout(5)
    vex.onRankChange = onRankChange

    upgradeVex(vex, 5)

    expect(vex.rank).toBe(5)
    expect(onRankChange).not.toHaveBeenCalled()
  })

  it('clamps rank at 10', () => {
    const vex = STARTER_VEX_FACTORIES.blackout(9)
    upgradeVex(vex, 10)
    expect(vex.rank).toBe(10)
  })
})

// ---------------------------------------------------------------------------
// Rank helper functions
// ---------------------------------------------------------------------------

describe('getLeadFingersDASBonus', () => {
  it('returns a positive value for all ranks', () => {
    for (const rank of ALL_RANKS) {
      expect(getLeadFingersDASBonus(rank)).toBeGreaterThan(0)
    }
  })

  it('increases with rank', () => {
    for (let i = 1; i < ALL_RANKS.length; i++) {
      expect(getLeadFingersDASBonus(ALL_RANKS[i])).toBeGreaterThanOrEqual(
        getLeadFingersDASBonus(ALL_RANKS[i - 1]),
      )
    }
  })

  it('returns 10 at rank 1 and 40 at rank 10', () => {
    expect(getLeadFingersDASBonus(1)).toBe(10)
    expect(getLeadFingersDASBonus(10)).toBe(40)
  })
})

describe('getLeadFingersARRBonus', () => {
  it('returns a positive value for all ranks', () => {
    for (const rank of ALL_RANKS) {
      expect(getLeadFingersARRBonus(rank)).toBeGreaterThan(0)
    }
  })

  it('increases with rank', () => {
    for (let i = 1; i < ALL_RANKS.length; i++) {
      expect(getLeadFingersARRBonus(ALL_RANKS[i])).toBeGreaterThanOrEqual(
        getLeadFingersARRBonus(ALL_RANKS[i - 1]),
      )
    }
  })
})

describe('getWhiplashDuration', () => {
  it('returns positive ms for all ranks', () => {
    for (const rank of ALL_RANKS) {
      expect(getWhiplashDuration(rank)).toBeGreaterThan(0)
    }
  })

  it('returns 150ms at rank 1 and 800ms at rank 10', () => {
    expect(getWhiplashDuration(1)).toBe(150)
    expect(getWhiplashDuration(10)).toBe(800)
  })
})

describe('getPressureTimeLimit', () => {
  it('returns positive seconds for all ranks', () => {
    for (const rank of ALL_RANKS) {
      expect(getPressureTimeLimit(rank)).toBeGreaterThan(0)
    }
  })

  it('decreases with rank (higher rank = tighter time limit)', () => {
    for (let i = 1; i < ALL_RANKS.length; i++) {
      expect(getPressureTimeLimit(ALL_RANKS[i])).toBeLessThanOrEqual(
        getPressureTimeLimit(ALL_RANKS[i - 1]),
      )
    }
  })

  it('returns 8s at rank 1 and 3s at rank 10', () => {
    expect(getPressureTimeLimit(1)).toBe(8)
    expect(getPressureTimeLimit(10)).toBe(3)
  })
})

describe('getQuicksandBonusMultiplier', () => {
  it('equals rank * 0.15', () => {
    for (const rank of ALL_RANKS) {
      expect(getQuicksandBonusMultiplier(rank)).toBeCloseTo(rank * 0.15)
    }
  })
})

describe('getMirageConfig', () => {
  it('returns config with positive onMs and offMs', () => {
    for (const rank of ALL_RANKS) {
      const cfg = getMirageConfig(rank)
      expect(cfg.onMs).toBeGreaterThan(0)
      expect(cfg.offMs).toBeGreaterThan(0)
      expect(cfg.colRange).toBeGreaterThan(0)
    }
  })
})

describe('getJinxedConfig', () => {
  it('rotateChance is between 0 and 1', () => {
    for (const rank of ALL_RANKS) {
      const cfg = getJinxedConfig(rank)
      expect(cfg.rotateChance).toBeGreaterThanOrEqual(0)
      expect(cfg.rotateChance).toBeLessThanOrEqual(1)
    }
  })

  it('alwaysRotate is true from rank 3+', () => {
    expect(getJinxedConfig(2).alwaysRotate).toBe(false)
    expect(getJinxedConfig(3).alwaysRotate).toBe(true)
    expect(getJinxedConfig(10).alwaysRotate).toBe(true)
  })

  it('columnJitter is 0 below rank 7, positive at rank 7+', () => {
    expect(getJinxedConfig(6).columnJitter).toBe(0)
    expect(getJinxedConfig(7).columnJitter).toBeGreaterThan(0)
    expect(getJinxedConfig(10).columnJitter).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Vex multipliers — all factories
// ---------------------------------------------------------------------------

describe('Vex multipliers: return 0 when scoring context does not qualify', () => {
  it('color vexes return 0 when totalClusterPoints is 0', () => {
    const colorVexIds = ['blackout', 'fog', 'corruption', 'tremor', 'mirage', 'pressure'] as const
    const ctx = makeCtx({ totalClusterPoints: 0 })

    for (const id of colorVexIds) {
      const vex = STARTER_VEX_FACTORIES[id](1)
      expect(vex.getMultiplier(ctx, 1)).toBe(0)
    }
  })

  it('line vexes return 0 when linesCleared is 0', () => {
    const lineVexIds = ['quicksand', 'amnesia', 'rising_dread', 'lead_fingers', 'whiplash', 'jinxed'] as const
    const ctx = makeCtx({ linesCleared: 0 })

    for (const id of lineVexIds) {
      const vex = STARTER_VEX_FACTORIES[id](1)
      expect(vex.getMultiplier(ctx, 1)).toBe(0)
    }
  })
})

describe('Vex multipliers: return positive value when context qualifies', () => {
  const ctx = makeCtx()

  it('blackout returns positive at all ranks', () => {
    for (const rank of ALL_RANKS) {
      expect(STARTER_VEX_FACTORIES.blackout(rank).getMultiplier(ctx, rank)).toBeGreaterThan(0)
    }
  })

  it('fog returns positive at all ranks', () => {
    for (const rank of ALL_RANKS) {
      expect(STARTER_VEX_FACTORIES.fog(rank).getMultiplier(ctx, rank)).toBeGreaterThan(0)
    }
  })

  it('quicksand returns positive at all ranks', () => {
    for (const rank of ALL_RANKS) {
      expect(STARTER_VEX_FACTORIES.quicksand(rank).getMultiplier(ctx, rank)).toBeGreaterThan(0)
    }
  })

  it('amnesia returns positive at all ranks (level 1)', () => {
    for (const rank of ALL_RANKS) {
      expect(STARTER_VEX_FACTORIES.amnesia(rank).getMultiplier(ctx, rank)).toBeGreaterThan(0)
    }
  })

  it('amnesia scales with level (level 10 > level 1)', () => {
    const rank: VexRank = 5
    const low = STARTER_VEX_FACTORIES.amnesia(rank).getMultiplier(makeCtx({ currentLevel: 1 }), rank)
    const high = STARTER_VEX_FACTORIES.amnesia(rank).getMultiplier(makeCtx({ currentLevel: 10 }), rank)
    expect(high).toBeGreaterThan(low)
  })
})

describe('Vex multipliers: increase monotonically with rank', () => {
  const ctx = makeCtx()

  const allVexIds = Object.keys(STARTER_VEX_FACTORIES) as (keyof typeof STARTER_VEX_FACTORIES)[]

  for (const id of allVexIds) {
    it(`${id} multiplier is non-decreasing across ranks 1–10`, () => {
      for (let i = 1; i < ALL_RANKS.length; i++) {
        const lower = STARTER_VEX_FACTORIES[id](ALL_RANKS[i - 1]).getMultiplier(ctx, ALL_RANKS[i - 1])
        const higher = STARTER_VEX_FACTORIES[id](ALL_RANKS[i]).getMultiplier(ctx, ALL_RANKS[i])
        expect(higher).toBeGreaterThanOrEqual(lower)
      }
    })
  }
})

// ---------------------------------------------------------------------------
// Scoring formula
// ---------------------------------------------------------------------------

describe('Scoring formula', () => {
  /**
   * Replicates the formula from GameScene (moveScore calculation):
   *   colorMult = 1 + Σ(color vex multipliers)
   *   lineMult  = 1 + Σ(line vex multipliers)
   *   score     = (totalClusterPoints * colorMult) * (linesCleared * lineMult)
   */
  function computeScore(
    totalClusterPoints: number,
    linesCleared: number,
    colorBonus: number,
    lineBonus: number,
  ) {
    const colorMult = 1 + colorBonus
    const lineMult = 1 + lineBonus
    return (totalClusterPoints * colorMult) * (linesCleared * lineMult)
  }

  it('returns 0 when no lines are cleared', () => {
    expect(computeScore(9, 0, 0, 0)).toBe(0)
  })

  it('returns 0 when no cluster points exist', () => {
    expect(computeScore(0, 4, 0, 0)).toBe(0)
  })

  it('baseline (no Vexes): clusterPoints * linesCleared', () => {
    expect(computeScore(9, 1, 0, 0)).toBe(9)
    expect(computeScore(4, 2, 0, 0)).toBe(8)
  })

  it('color bonus scales totalClusterPoints', () => {
    // colorMult = 1.5, lineMult = 1
    expect(computeScore(9, 1, 0.5, 0)).toBeCloseTo(9 * 1.5)
  })

  it('line bonus scales linesCleared', () => {
    // colorMult = 1, lineMult = 2
    expect(computeScore(9, 2, 0, 1)).toBeCloseTo(9 * 2 * 2)
  })

  it('both bonuses compound multiplicatively', () => {
    const result = computeScore(9, 2, 0.5, 1)
    // (9 * 1.5) * (2 * 2) = 13.5 * 4 = 54
    expect(result).toBeCloseTo(54)
  })
})

// ---------------------------------------------------------------------------
// STARTER_VEX_FACTORIES registry
// ---------------------------------------------------------------------------

describe('STARTER_VEX_FACTORIES', () => {
  it('contains all expected Vex IDs', () => {
    const expectedIds = [
      'blackout', 'fog', 'corruption', 'quicksand', 'amnesia',
      'rising_dread', 'lead_fingers', 'whiplash', 'tremor', 'mirage',
      'jinxed', 'pressure',
    ]
    for (const id of expectedIds) {
      expect(id in STARTER_VEX_FACTORIES).toBe(true)
    }
  })

  it('each factory creates a Vex with matching id', () => {
    for (const [id, factory] of Object.entries(STARTER_VEX_FACTORIES)) {
      const vex = factory(1)
      expect(vex.id).toBe(id)
    }
  })

  it('each factory creates a Vex with valid kind', () => {
    for (const factory of Object.values(STARTER_VEX_FACTORIES)) {
      const vex = factory(1)
      expect(['color', 'line']).toContain(vex.kind)
    }
  })

  it('each factory creates a Vex with valid rarity', () => {
    const validRarities = ['common', 'uncommon', 'rare', 'mythic']
    for (const factory of Object.values(STARTER_VEX_FACTORIES)) {
      const vex = factory(1)
      expect(validRarities).toContain(vex.rarity)
    }
  })
})
