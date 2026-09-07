// frameTiming.test.ts — resolution-independence and accumulator correctness.
import { describe, it, expect } from 'vitest'
import {
  TARGET_FPS,
  FRAME_TIME_MS,
  computeFrameDelta,
  framesToMs,
  SteppingAccumulator,
} from './frameTiming'

describe('computeFrameDelta', () => {
  it('returns nominal frame time on first frame (prev=0)', () => {
    expect(computeFrameDelta(0, 5000)).toBe(FRAME_TIME_MS)
  })

  it('returns nominal frame time when time goes backwards', () => {
    expect(computeFrameDelta(1000, 900)).toBe(FRAME_TIME_MS)
  })

  it('returns nominal frame time when time repeats (clock stall)', () => {
    expect(computeFrameDelta(1000, 1000)).toBe(FRAME_TIME_MS)
  })

  it('measures true wall-clock gap on 60Hz processed frames', () => {
    // Processed every rAF tick at 60Hz: gap ~= 16.67ms
    const d = computeFrameDelta(1000, 1016.67)
    expect(d).toBeCloseTo(16.67, 1)
  })

  it('measures FULL gap on 120Hz throttle (the bug this fixes)', () => {
    // rAF fires every 8.33ms; throttle processes every other tick.
    // Raw Phaser delta on a processed frame would be ~8.33 — half real speed.
    const d = computeFrameDelta(1000, 1016.67) // two 8.33ms ticks later
    expect(d).toBeCloseTo(16.67, 1)
    expect(d).toBeGreaterThan(15) // NOT the ~8.3 the old code accumulated
  })

  it('clamps a backgrounded tab gap to 3 frames', () => {
    const d = computeFrameDelta(1000, 1000 + 60_000) // 60s away
    expect(d).toBe(FRAME_TIME_MS * 3)
  })

  it('clamps a pause-resume spike', () => {
    // lastUpdateTime frozen during a 2s pause; on resume the raw gap is 2s.
    const d = computeFrameDelta(1000, 3000)
    expect(d).toBe(FRAME_TIME_MS * 3)
  })
})

describe('framesToMs', () => {
  it('converts Game Boy gravity frames to ms', () => {
    expect(framesToMs(53)).toBeCloseTo(883.3, 1) // GRAVITY_TABLE[0]
    expect(framesToMs(1)).toBeCloseTo(16.67, 2)
  })
})

describe('SteppingAccumulator', () => {
  it('fires zero steps before threshold, one after', () => {
    const acc = new SteppingAccumulator(100)
    expect(acc.add(60)).toBe(0)
    expect(acc.add(60)).toBe(1) // 120 banked → 1 step, 20 remains
    expect(acc.pending).toBeCloseTo(20, 5)
  })

  it('is slice-size independent: 600×2 vs 1000+200 both fire 2', () => {
    const coarse = new SteppingAccumulator(100)
    expect(coarse.add(600)).toBe(6)
    expect(coarse.add(600)).toBe(6)

    const fine = new SteppingAccumulator(100)
    let total = 0
    for (let i = 0; i < 120; i++) total += fine.add(10)
    expect(total).toBe(12) // 1200ms / 100ms — same event count
  })

  it('handles big slices without losing or double-firing', () => {
    const acc = new SteppingAccumulator(100)
    expect(acc.add(750)).toBe(7) // 7 steps, 50ms banked
    expect(acc.pending).toBeCloseTo(50, 5)
  })

  it('re-banks proportionally when threshold changes mid-flight', () => {
    const acc = new SteppingAccumulator(100)
    acc.add(60) // 60 banked
    acc.setThreshold(200) // 60/100 = 60% of new cycle
    expect(acc.pending).toBeCloseTo(120, 5)
    expect(acc.add(100)).toBe(1) // 220 → 1 step, 20 left
    expect(acc.pending).toBeCloseTo(20, 5)
  })

  it('reset clears banked time', () => {
    const acc = new SteppingAccumulator(100)
    acc.add(90)
    acc.reset()
    expect(acc.pending).toBe(0)
    expect(acc.add(50)).toBe(0)
  })
})

describe('TARGET_FPS contract', () => {
  it('frame constants stay 60fps-based (Game Boy timing)', () => {
    expect(TARGET_FPS).toBe(60)
    expect(DAS_FRAMES_MS_SANITY()).toBeCloseTo(DAS_DELAY_MS(), 1)
  })
})

// Local helpers mirroring config values without importing GameScene.
function DAS_FRAMES_MS_SANITY() {
  return framesToMs(16)
}
function DAS_DELAY_MS() {
  return 16 * FRAME_TIME_MS
}
