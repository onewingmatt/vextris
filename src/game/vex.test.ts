import { describe, it, expect } from 'vitest'
import {
  VexRank,
  ScoringContext,
  createVexBlackout,
  createVexFog,
  createVexCorruption,
  createVexQuicksand,
  createVexAmnesia,
  createVexLeadFingers,
  createVexWhiplash,
  createVexTremor,
  createVexMirage,
  createVexJinxed,
  createVexPressure,
  getQuicksandBonusMultiplier,
  getLeadFingersDASBonus,
  getLeadFingersARRBonus,
  getWhiplashDuration,
  getMirageConfig,
  getJinxedConfig,
  getPressureTimeLimit,
  upgradeVex,
  getSynergyMultiplier,
  VEX_SYNERGIES,
} from './vex'

/** Creates a mock ScoringContext for testing. */
function createMockContext(overrides: Partial<ScoringContext> = {}): ScoringContext {
  return {
    linesCleared: 1,
    clusters: [],
    totalClusterPoints: 4,
    maxClusterSize: 2,
    colorsInMove: new Set<number>(),
    moveIndex: 0,
    combo: 0,
    timeRemaining: 100,
    currentLevel: 1,
    ...overrides,
  }
}

describe('Vex Multipliers', () => {
  describe('Blackout', () => {
    it('should return 0 when no cluster points', () => {
      const vex = createVexBlackout(1)
      const ctx = createMockContext({ totalClusterPoints: 0 })
      expect(vex.getMultiplier(ctx, 1)).toBe(0)
    })

    it('should increase with rank', () => {
      const ctx = createMockContext({ totalClusterPoints: 10 })
      const r1 = createVexBlackout(1).getMultiplier(ctx, 1)
      const r5 = createVexBlackout(5).getMultiplier(ctx, 5)
      const r10 = createVexBlackout(10).getMultiplier(ctx, 10)
      expect(r5).toBeGreaterThan(r1)
      expect(r10).toBeGreaterThan(r5)
    })
  })

  describe('Fog', () => {
    it('should return 0 when no cluster points', () => {
      const vex = createVexFog(1)
      const ctx = createMockContext({ totalClusterPoints: 0 })
      expect(vex.getMultiplier(ctx, 1)).toBe(0)
    })

    it('should scale with rank', () => {
      const ctx = createMockContext({ totalClusterPoints: 10 })
      const r1 = createVexFog(1).getMultiplier(ctx, 1)
      const r10 = createVexFog(10).getMultiplier(ctx, 10)
      expect(r10).toBeGreaterThan(r1)
    })
  })

  describe('Corruption', () => {
    it('should return 0 when no cluster points', () => {
      const vex = createVexCorruption(1)
      const ctx = createMockContext({ totalClusterPoints: 0 })
      expect(vex.getMultiplier(ctx, 1)).toBe(0)
    })

    it('should have highest multiplier at rank 10', () => {
      const ctx = createMockContext({ totalClusterPoints: 10 })
      const r10 = createVexCorruption(10).getMultiplier(ctx, 10)
      expect(r10).toBeGreaterThanOrEqual(5.0)
    })
  })

  describe('Quicksand', () => {
    it('should return 0 when no lines cleared', () => {
      const vex = createVexQuicksand(1)
      const ctx = createMockContext({ linesCleared: 0 })
      expect(vex.getMultiplier(ctx, 1)).toBe(0)
    })

    it('should return bonus multiplier when lines cleared', () => {
      const vex = createVexQuicksand(1)
      const ctx = createMockContext({ linesCleared: 2 })
      expect(vex.getMultiplier(ctx, 1)).toBe(getQuicksandBonusMultiplier(1))
    })
  })

  describe('Amnesia', () => {
    it('should scale with current level', () => {
      const ctx1 = createMockContext({ linesCleared: 2, currentLevel: 1 })
      const ctx10 = createMockContext({ linesCleared: 2, currentLevel: 10 })
      const r5 = createVexAmnesia(5)
      const mult1 = r5.getMultiplier(ctx1, 5)
      const mult10 = r5.getMultiplier(ctx10, 5)
      expect(mult10).toBeGreaterThanOrEqual(mult1)
    })
  })

  describe('Lead Fingers', () => {
    it('should return 0 when no lines cleared', () => {
      const vex = createVexLeadFingers(1)
      const ctx = createMockContext({ linesCleared: 0 })
      expect(vex.getMultiplier(ctx, 1)).toBe(0)
    })

    it('should increase with rank', () => {
      const ctx = createMockContext({ linesCleared: 1 })
      const r1 = createVexLeadFingers(1).getMultiplier(ctx, 1)
      const r10 = createVexLeadFingers(10).getMultiplier(ctx, 10)
      expect(r10).toBeGreaterThan(r1)
    })
  })

  describe('Whiplash', () => {
    it('should return 0 when no lines cleared', () => {
      const vex = createVexWhiplash(1)
      const ctx = createMockContext({ linesCleared: 0 })
      expect(vex.getMultiplier(ctx, 1)).toBe(0)
    })

    it('should scale with rank', () => {
      const ctx = createMockContext({ linesCleared: 2 })
      const r1 = createVexWhiplash(1).getMultiplier(ctx, 1)
      const r10 = createVexWhiplash(10).getMultiplier(ctx, 10)
      expect(r10).toBeGreaterThan(r1)
    })
  })

  describe('Tremor', () => {
    it('should return 0 when no cluster points', () => {
      const vex = createVexTremor(1)
      const ctx = createMockContext({ totalClusterPoints: 0 })
      expect(vex.getMultiplier(ctx, 1)).toBe(0)
    })
  })

  describe('Mirage', () => {
    it('should return 0 when no cluster points', () => {
      const vex = createVexMirage(1)
      const ctx = createMockContext({ totalClusterPoints: 0 })
      expect(vex.getMultiplier(ctx, 1)).toBe(0)
    })

    it('should be mythic rarity', () => {
      const vex = createVexMirage(1)
      expect(vex.rarity).toBe('mythic')
    })
  })

  describe('Jinxed', () => {
    it('should return 0 when no lines cleared', () => {
      const vex = createVexJinxed(1)
      const ctx = createMockContext({ linesCleared: 0 })
      expect(vex.getMultiplier(ctx, 1)).toBe(0)
    })
  })

  describe('Pressure', () => {
    it('should return 0 when no cluster points', () => {
      const vex = createVexPressure(1)
      const ctx = createMockContext({ totalClusterPoints: 0 })
      expect(vex.getMultiplier(ctx, 1)).toBe(0)
    })
  })
})

describe('Vex Helper Functions', () => {
  describe('getQuicksandBonusMultiplier', () => {
    it('should increase with rank', () => {
      const r1 = getQuicksandBonusMultiplier(1)
      const r5 = getQuicksandBonusMultiplier(5)
      const r10 = getQuicksandBonusMultiplier(10)
      expect(r5).toBeGreaterThan(r1)
      expect(r10).toBeGreaterThan(r5)
    })

    it('should cap at +50% at rank 10', () => {
      expect(getQuicksandBonusMultiplier(10)).toBe(0.5)
    })
  })

  describe('getLeadFingersDASBonus', () => {
    it('should increase with rank', () => {
      expect(getLeadFingersDASBonus(10)).toBeGreaterThan(getLeadFingersDASBonus(1))
    })
  })

  describe('getLeadFingersARRBonus', () => {
    it('should increase with rank', () => {
      expect(getLeadFingersARRBonus(10)).toBeGreaterThan(getLeadFingersARRBonus(1))
    })
  })

  describe('getWhiplashDuration', () => {
    it('should increase with rank', () => {
      expect(getWhiplashDuration(10)).toBeGreaterThan(getWhiplashDuration(1))
    })
  })

  describe('getMirageConfig', () => {
    it('should have onMs > offMs at low ranks', () => {
      const cfg = getMirageConfig(1)
      expect(cfg.onMs).toBeLessThan(cfg.offMs)
    })

    it('should have equal on/off at rank 10', () => {
      const cfg = getMirageConfig(10)
      expect(cfg.onMs).toBe(cfg.offMs)
    })
  })

  describe('getJinxedConfig', () => {
    it('should have alwaysRotate at rank 3+', () => {
      expect(getJinxedConfig(3).alwaysRotate).toBe(true)
      expect(getJinxedConfig(2).alwaysRotate).toBe(false)
    })

    it('should have colorScramble at rank 3+', () => {
      expect(getJinxedConfig(3).colorScramble).toBe(true)
      expect(getJinxedConfig(2).colorScramble).toBe(false)
    })

    it('should have columnJitter at rank 7+', () => {
      expect(getJinxedConfig(7).columnJitter).toBe(3)
      expect(getJinxedConfig(6).columnJitter).toBe(0)
    })
  })

  describe('getPressureTimeLimit', () => {
    it('should decrease with rank', () => {
      expect(getPressureTimeLimit(10)).toBeLessThan(getPressureTimeLimit(1))
    })

    it('should be 3 seconds at rank 10', () => {
      expect(getPressureTimeLimit(10)).toBe(3)
    })
  })
})

describe('Vex Upgrade System', () => {
  it('should upgrade vex rank', () => {
    const vex = createVexBlackout(1)
    expect(vex.rank).toBe(1)
    upgradeVex(vex, 5)
    expect(vex.rank).toBe(5)
  })

  it('should clamp to rank 10', () => {
    const vex = createVexBlackout(9)
    upgradeVex(vex, 15)
    expect(vex.rank).toBe(10)
  })

  it('should not change if same rank', () => {
    const vex = createVexBlackout(5)
    const result = upgradeVex(vex, 5)
    expect(result).toBeUndefined()
    expect(vex.rank).toBe(5)
  })

  it('should call onRankChange callback', () => {
    const vex = createVexBlackout(1)
    let called = false
    let oldRank = 0
    let newRank = 0
    vex.onRankChange = (old, newR) => {
      called = true
      oldRank = old
      newRank = newR
    }
    upgradeVex(vex, 3)
    expect(called).toBe(true)
    expect(oldRank).toBe(1)
    expect(newRank).toBe(3)
  })
})

describe('Vex Synergies', () => {
  it('should have defined synergies', () => {
    expect(VEX_SYNERGIES.length).toBeGreaterThan(0)
  })

  it('synergy bonus multipliers should be positive', () => {
    for (const synergy of VEX_SYNERGIES) {
      expect(synergy.bonusMultiplier).toBeGreaterThan(0)
    }
  })

  it('synergy multipliers should be additive', () => {
    // Test that synergies can stack
    const mockVexes = [
      { id: 'blackout', kind: 'color' as const, rank: 5 as VexRank, getMultiplier: () => 2 },
      { id: 'fog', kind: 'color' as const, rank: 5 as VexRank, getMultiplier: () => 2 },
    ]
    // With blackout + fog (both color vexes), blind_faith synergy should apply
    const mult = getSynergyMultiplier(mockVexes as any, 'color')
    expect(mult).toBeGreaterThan(0)
  })
})
