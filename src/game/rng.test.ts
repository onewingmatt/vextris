// rng.test.ts — determinism contract for the seeded RNG.
import { describe, it, expect } from 'vitest'
import { createRng, createSessionRng, cosmeticRng } from './rng'

describe('createRng — determinism', () => {
  it('same seed → identical sequence', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 1000 }, () => a.next())
    const seqB = Array.from({ length: 1000 }, () => b.next())
    expect(seqA).toEqual(seqB)
  })

  it('different seeds → different sequences (overwhelmingly likely)', () => {
    const a = createRng(1)
    const b = createRng(2)
    const seqA = Array.from({ length: 100 }, () => a.next())
    const seqB = Array.from({ length: 100 }, () => b.next())
    expect(seqA).not.toEqual(seqB)
  })

  it('next() stays in [0, 1)', () => {
    const r = createRng(7)
    for (let i = 0; i < 10_000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('seed 0 works (no zero-state lockup)', () => {
    const r = createRng(0)
    expect(r.next()).not.toBe(r.next())
  })

  it('int(n) covers [0, n) without overflow', () => {
    const r = createRng(123)
    const seen = new Set<number>()
    for (let i = 0; i < 500; i++) {
      const v = r.int(6)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(6)
      seen.add(v)
    }
    // all faces appear in 500 rolls of a d6
    expect(seen.size).toBe(6)
  })

  it('pick returns elements; every element reachable', () => {
    const r = createRng(999)
    const arr = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) seen.add(r.pick(arr))
    expect(seen.size).toBe(arr.length)
  })

  it('range is half-open [min, max)', () => {
    const r = createRng(555)
    for (let i = 0; i < 500; i++) {
      const v = r.range(10, 20)
      expect(v).toBeGreaterThanOrEqual(10)
      expect(v).toBeLessThan(20)
    }
  })

  it('chance(p) frequency approximates p', () => {
    const r = createRng(314)
    let hits = 0
    const N = 20_000
    for (let i = 0; i < N; i++) if (r.chance(0.25)) hits++
    // within ±2 percentage points — generous for a deterministic PRNG
    expect(Math.abs(hits / N - 0.25)).toBeLessThan(0.02)
  })

  it('invalid arguments throw', () => {
    const r = createRng(1)
    expect(() => r.int(0)).toThrow()
    expect(() => r.int(-3)).toThrow()
    expect(() => r.range(5, 5)).toThrow()
    expect(() => r.pick([])).toThrow()
  })
})

describe('session + cosmetic rng', () => {
  it('createSessionRng produces a usable stream', () => {
    const r = createSessionRng()
    expect(r.next()).toBeLessThan(1)
    expect([1, 2, 3]).toContain(r.pick([1, 2, 3]))
  })

  it('cosmeticRng satisfies the same contract (unseeded)', () => {
    expect(cosmeticRng.next()).toBeLessThan(1)
    expect(cosmeticRng.int(4)).toBeLessThan(4)
    expect(['a']).toContain(cosmeticRng.pick(['a']))
  })
})
