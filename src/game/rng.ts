/**
 * rng.ts — seeded, injectable RNG for Vextris.
 *
 * Why (2026-09 audit): every randomness call site used Math.random /
 * Phaser.Utils.Array.GetRandom, so:
 *   - benchmark-results.json was unreproducible noise — the same "run" could
 *     never be replayed or compared
 *   - gameplay bugs caused by unlucky piece/color streams could not be
 *     reproduced from a seed
 *
 * Design:
 *   - mulberry32: tiny, fast, well-distributed 32-bit PRNG. Good enough for
 *     game feel; NOT cryptographic (that's not the job here).
 *   - The RNG instance lives on the GameScene and is passed to every
 *     gameplay-relevant call site (piece spawn, jinxed mutations, garbage
 *     gaps/colors). Purely cosmetic randomness (particles, debris) keeps
 *     Math.random — replaying a bug doesn't care about sparkle positions,
 *     and it keeps the seeded stream short: gameplay draws only.
 *   - Determinism contract: same seed + same input sequence → same game.
 *     Guaranteed by the unit tests in rng.test.ts.
 */

/** A seeded random source with the subset of APIs Vextris needs. */
export interface Rng {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [0, n). */
  int(n: number): number
  /** Integer in [min, max) — half-open, matching int(n). */
  range(min: number, max: number): number
  /** True with probability p (0..1). */
  chance(p: number): boolean
  /** Random element of a non-empty array. */
  pick<T>(arr: readonly T[]): T
}

/** Creates a mulberry32-based Rng. Same seed → same sequence, always. */
export function createRng(seed: number): Rng {
  // Force uint32; seed 0 is allowed (mulberry32 handles it).
  let state = seed >>> 0

  function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int(n: number): number {
      if (n <= 0) throw new Error(`rng.int: n must be > 0, got ${n}`)
      return Math.floor(next() * n)
    },
    range(min: number, max: number): number {
      if (max <= min) throw new Error(`rng.range: max must exceed min (${min}..${max})`)
      return min + Math.floor(next() * (max - min))
    },
    chance(p: number): boolean {
      return next() < p
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('rng.pick: empty array')
      return arr[Math.floor(next() * arr.length)]
    },
  }
}

/**
 * Default RNG — used at boot and as a fallback for cosmetic randomness.
 * Seeded from Date.now so real play sessions differ, but the GameScene
 * overrides this with a logged/known seed when reproducibility matters.
 */
export function createSessionRng(): Rng {
  return createRng((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0)
}

/** The engine's shared unseeded fallback (cosmetic randomness only). */
export const cosmeticRng: Rng = {
  next: () => Math.random(),
  int(n: number): number {
    if (n <= 0) throw new Error(`rng.int: n must be > 0, got ${n}`)
    return Math.floor(Math.random() * n)
  },
  range(min: number, max: number): number {
    if (max <= min) throw new Error(`rng.range: max must exceed min (${min}..${max})`)
    return min + Math.floor(Math.random() * (max - min))
  },
  chance(p: number): boolean {
    return Math.random() < p
  },
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('rng.pick: empty array')
    return arr[Math.floor(Math.random() * arr.length)]
  },
}
