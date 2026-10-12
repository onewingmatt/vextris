/**
 * rite.test.ts — the Rite's golden trace, replayed.
 *
 * Ticket 01 recorded a real seeded run's rules events from the pre-extraction
 * scene into src/game/__fixtures__/rite-trace-{fade,seal}.json: every Resolve
 * drain, every clear's score / levelScore / moves / refund, and the outcome.
 * This file replays that input stream through src/game/rite.ts and asserts every
 * recorded number.
 *
 * The trace is the accepted proof that the extraction changed no behaviour, so
 * the comparison is exact: `Object.is` on doubles, not an epsilon. Any drifted
 * number — a drain rate, a refund bracket, a multiplier, the seal target —
 * fails here, in jsdom, with no browser and no canvas.
 *
 * The recorder's program is the input, so two of its moves are mirrored below
 * and marked: both are inputs the fixture cannot show on its own (see
 * scripts/record-rite-trace.mjs).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRite, type Rite } from './rite'
import {
  STARTER_VEX_FACTORIES,
  type ScoringCluster,
  type VexId,
  type VexRank,
} from './vex'

// ---------------------------------------------------------------------------
// The fixture's shape
// ---------------------------------------------------------------------------

type TraceEvent =
  | { kind: 'drain'; dt: number; resolve: number }
  | {
      kind: 'clear'
      lines: number
      clusters: { color: number; size: number }[]
      maxClusterSize: number
      moveIndex: number
      combo: number
      timeRemaining: number
      level: number
      score: number
      levelScore: number
      moves: number
      refund: number
      resolve: number
      colorMult: number
      lineMult: number
      totalClusterPoints: number
    }
  | { kind: 'lock'; resolve: number }
  | { kind: 'outcome'; outcome: 'SEAL_BROKEN' | 'RESOLVE_FADED'; level: number; score: number }

type Fixture = {
  program: 'fade' | 'seal' | 'locks'
  roster: { id: string; rank: number }[]
  trace: TraceEvent[]
}

/**
 * Read the fixture from disk rather than `import ... from '...json'`.
 *
 * Vite transforms a JSON import into a JS module, and that path is not
 * lossless: at least one double in rite-trace-fade.json comes back one ulp low
 * (149.89853999999985 → 149.89853999999982648). This file compares doubles
 * exactly, so it must read the same bytes scripts/verify-rite-trace.mjs does.
 */
const fixture = (name: 'fade' | 'seal' | 'locks'): Fixture => {
  const dir = (import.meta as unknown as { dirname: string }).dirname
  const path = join(dir, `__fixtures__/rite-trace-${name}.json`)
  return JSON.parse(readFileSync(path, 'utf8')) as Fixture
}

/** The recorder's seed (scripts/record-rite-trace.mjs). The Rite owns the stream. */
const SEED = 20261012

/**
 * Inputs the recorder's program applied that the trace does not record, both
 * from record-rite-trace.mjs:
 *  - `tailResolve`: the fade program writes Resolve = 1.5 after the last clear
 *    so the bleed-out takes 220 frames instead of 26,000. It shows up in the
 *    fixture only as a cliff in the Resolve column.
 *  - `zeroLevelScoreOnClear`: the fade program zeroes the level score after every
 *    clear, so a scripted clear cannot break the level-1 seal before the run has
 *    bled out. (The scene's own clear frame ends before its win check runs, which
 *    is why that write lands before the check rather than after it.)
 */
const PROGRAMS = {
  fade: { tailResolve: 1.5 as number | null, zeroLevelScoreOnClear: true },
  seal: { tailResolve: null as number | null, zeroLevelScoreOnClear: false },
  // The lock run never clears and never bleeds out: it exists to pin the
  // per-piece Resolve bleed, which is the third place Resolve moves.
  locks: { tailResolve: null as number | null, zeroLevelScoreOnClear: false },
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

type Divergence = { index: number; field: string; expected: unknown; actual: unknown }

/** The clusters the recorder arranged; only the size is scored, so cells are placeholders. */
const clustersOf = (ev: Extract<TraceEvent, { kind: 'clear' }>): ScoringCluster[] =>
  ev.clusters.map(c => ({
    color: c.color,
    blocks: Array.from({ length: c.size }, (_, i) => ({ x: i, y: 0 })),
  }))

/**
 * Replay a fixture's input stream through the Rite and return every number that
 * drifted. Not an assertion, so the perturbed-input test below can drive the
 * same code path and look at where it diverges.
 */
function replay(name: 'fade' | 'seal' | 'locks', opts: { perturbDrainAt?: number } = {}): {
  rite: Rite
  divergences: Divergence[]
} {
  const program = PROGRAMS[name]
  const data = fixture(name)

  const rite = createRite({ seed: SEED })
  for (const { id, rank } of data.roster) {
    rite.takePact(STARTER_VEX_FACTORIES[id as VexId](rank as VexRank))
  }

  const divergences: Divergence[] = []
  /** Compare, don't throw: one drift should not hide the rest. */
  const check = (index: number, field: string, expected: unknown, actual: unknown): void => {
    if (!Object.is(expected, actual)) divergences.push({ index, field, expected, actual })
  }

  const lastClearIndex = data.trace.reduce((acc, ev, i) => (ev.kind === 'clear' ? i : acc), -1)

  data.trace.forEach((ev, index) => {
    if (ev.kind === 'drain') {
      const dt = opts.perturbDrainAt === index ? ev.dt + 0.001 : ev.dt
      rite.tick(dt)
      check(index, 'resolve', ev.resolve, rite.resolve)
      return
    }

    if (ev.kind === 'lock') {
      // The return is read here so it is not a phantom: a lock bleeds Resolve but
      // never ends the run on its own (the recorded locks run stays alive), and the
      // frame acts on the outcome at the next tick rather than at the lock.
      check(index, 'lockPiece outcome', null, rite.lockPiece())
      check(index, 'resolve', ev.resolve, rite.resolve)
      return
    }

    if (ev.kind === 'clear') {
      const timeRemaining = rite.resolve
      const before = { score: rite.score, moves: rite.moves }
      const clusters = clustersOf(ev)
      const result = rite.applyClear({ lines: ev.lines, clusters })

      // The recorded descriptor: what the scene handed the scorer.
      check(index, 'timeRemaining', ev.timeRemaining, timeRemaining)
      check(index, 'maxClusterSize', ev.maxClusterSize, Math.max(...clusters.map(c => c.blocks.length)))
      check(index, 'moveIndex', ev.moveIndex, before.moves)
      check(index, 'combo', ev.combo, 0)

      // The recorded result of applying it.
      check(index, 'earned', ev.score - before.score, result.earned)
      check(index, 'refund', ev.refund, result.refund)
      check(index, 'score', ev.score, rite.score)
      check(index, 'levelScore', ev.levelScore, rite.levelScore)
      check(index, 'moves', ev.moves, rite.moves)
      check(index, 'level', ev.level, rite.level)
      check(index, 'resolve', ev.resolve, rite.resolve)
      check(index, 'colorMult', ev.colorMult, result.colorMult)
      check(index, 'lineMult', ev.lineMult, result.lineMult)
      check(index, 'totalClusterPoints', ev.totalClusterPoints, result.totalClusterPoints)
      check(index, 'result.maxClusterSize', ev.maxClusterSize, result.maxClusterSize)

      // The call reports the outcome the state implies; see PROGRAMS above for
      // why the fade program's level score does not end its run here.
      const expectedOutcome = rite.levelScore >= rite.targetScore ? 'SEAL_BROKEN' : null
      check(index, 'outcome', expectedOutcome, result.outcome)

      if (program.zeroLevelScoreOnClear) rite.levelScore = 0
      if (index === lastClearIndex && program.tailResolve !== null) rite.resolve = program.tailResolve
      return
    }

    check(index, 'outcome', ev.outcome, rite.outcome)
    check(index, 'level', ev.level, rite.level)
    check(index, 'score', ev.score, rite.score)
  })

  return { rite, divergences }
}

// ---------------------------------------------------------------------------

describe('the Rite reproduces the golden trace', () => {
  for (const name of ['fade', 'seal'] as const) {
    it(`replays the ${name} program, number for number`, () => {
      const { rite, divergences } = replay(name)
      expect(divergences).toEqual([])
      const last = fixture(name).trace[fixture(name).trace.length - 1]
      expect(last.kind).toBe('outcome')
      expect(rite.outcome).toBe(name === 'seal' ? 'SEAL_BROKEN' : 'RESOLVE_FADED')
    })
  }

  it('replays the locks program, number for number', () => {
    // The per-piece Resolve bleed: the frame's third Resolve writer, which the
    // rules programs cannot reach because they freeze gravity.
    const { divergences } = replay('locks')
    expect(divergences).toEqual([])
  })

  it('records the same roster the run was seeded with', () => {
    const { rite } = replay('fade')
    expect(rite.roster.map(v => ({ id: v.id, rank: v.rank }))).toEqual(fixture('fade').roster)
  })

  it('hits every event of both fixture programs', () => {
    expect(fixture('fade').trace).toHaveLength(346)
    expect(fixture('seal').trace).toHaveLength(52)
    expect(fixture('fade').trace.filter(e => e.kind === 'clear')).toHaveLength(5)
    expect(fixture('seal').trace.filter(e => e.kind === 'clear')).toHaveLength(2)
    expect(fixture('fade').trace.filter(e => e.kind === 'outcome')).toHaveLength(1)
    expect(fixture('seal').trace.filter(e => e.kind === 'outcome')).toHaveLength(1)
    expect(fixture('locks').trace).toHaveLength(183)
    expect(fixture('locks').trace.filter(e => e.kind === 'lock')).toHaveLength(9)
  })

  it('fails when a single frame is perturbed — the gate is a gate', () => {
    const { divergences } = replay('seal', { perturbDrainAt: 30 })
    expect(divergences.length).toBeGreaterThan(0)
    expect(divergences[0]).toMatchObject({ index: 30, field: 'resolve' })
  })
})

describe('the Rite is a pure module', () => {
  it('imports no Phaser, and clamps Resolve with plain arithmetic', () => {
    const dir = (import.meta as unknown as { dirname: string }).dirname
    const source = readFileSync(join(dir, 'rite.ts'), 'utf8')
    // Comments talk about Phaser (they explain what was replaced); code must not.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/from\s+['"]phaser['"]/)
    expect(code).not.toMatch(/Phaser/)
    expect(code).toMatch(/Math\.min\(Math\.max\(/)
  })

  it('runs with no DOM beyond jsdom, and reads its own rng', () => {
    const rite = createRite({ seed: 7 })
    expect(rite.rng.next()).toBe(createRite({ seed: 7 }).rng.next())
  })
})

describe('createRite', () => {
  it('takes an injected seed so a run is reproducible end to end', () => {
    const a = createRite({ seed: 1234 })
    const b = createRite({ seed: 1234 })
    expect(Array.from({ length: 8 }, () => a.rng.next())).toEqual(
      Array.from({ length: 8 }, () => b.rng.next()),
    )
  })

  it('generates a seed when none is injected, and keeps it readable', () => {
    const rite = createRite()
    expect(Number.isInteger(rite.seed)).toBe(true)
    expect(rite.seed).toBeGreaterThanOrEqual(0)
    expect(rite.seed).toBeLessThanOrEqual(0xffffffff)
  })

  it('starts on seal 1 with its params from the level table', () => {
    const rite = createRite({ seed: 1 })
    expect(rite.level).toBe(1)
    expect(rite.targetScore).toBe(400)
    expect(rite.resolveMax).toBe(150)
    expect(rite.resolve).toBe(150)
    expect(rite.score).toBe(0)
    expect(rite.levelScore).toBe(0)
    expect(rite.moves).toBe(0)
    expect(rite.outcome).toBeNull()
  })

  it('exposes one stable roster array — the dev panel holds the reference', () => {
    const rite = createRite({ seed: 1 })
    const roster = rite.roster
    rite.takePact(STARTER_VEX_FACTORIES.tremor(2))
    expect(rite.roster).toBe(roster)
    expect(roster).toHaveLength(1)
  })
})

describe('tick — the realtime Resolve drain', () => {
  it('bleeds Resolve in proportion to the frame, before any Vex', () => {
    const rite = createRite({ seed: 1 })
    rite.tick(1000)
    expect(rite.resolve).toBeCloseTo(150 - 0.3, 12)
  })

  it('bleeds faster with quicksand, pressure, fog and blackout taken', () => {
    const rite = createRite({ seed: 1 })
    rite.takePact(STARTER_VEX_FACTORIES.quicksand(3))
    rite.takePact(STARTER_VEX_FACTORIES.pressure(2))
    rite.takePact(STARTER_VEX_FACTORIES.fog(2))
    rite.takePact(STARTER_VEX_FACTORIES.blackout(4))
    rite.tick(1000)
    // 0.3 + 3*0.01 + 2*0.012 + 2*0.006 + 4*0.004
    expect(rite.resolve).toBeCloseTo(150 - 0.382, 12)
  })

  it('clamps at zero and reports the fade', () => {
    const rite = createRite({ seed: 1 })
    rite.resolve = 0.1
    expect(rite.tick(1000)).toBe('RESOLVE_FADED')
    expect(rite.resolve).toBe(0)
  })

  it('never bleeds past resolveMax', () => {
    const rite = createRite({ seed: 1 })
    rite.resolve = 149.999
    rite.tick(1)
    expect(rite.resolve).toBeLessThanOrEqual(rite.resolveMax)
  })
})

describe('applyClear — the scoring pipeline and the seal', () => {
  const cluster = (size: number, color = 0xff0000): ScoringCluster => ({
    color,
    blocks: Array.from({ length: size }, (_, i) => ({ x: i, y: 0 })),
  })

  it('refunds nothing for a single line, and scores it anyway', () => {
    const rite = createRite({ seed: 1 })
    const before = rite.resolve
    const result = rite.applyClear({ lines: 1, clusters: [cluster(3)] })
    expect(result.refund).toBe(0)
    expect(result.earned).toBe(9) // one 3-cluster, no Vexes: 3² × 1 × 1
    expect(rite.resolve).toBe(before)
  })

  it('refunds 0.25 for two lines, scaled by corruption and tremor and rising dread', () => {
    const rite = createRite({ seed: 1 })
    rite.takePact(STARTER_VEX_FACTORIES.tremor(3))
    rite.resolve = 10
    const result = rite.applyClear({ lines: 2, clusters: [cluster(5)] })
    expect(result.refund).toBeCloseTo(0.25 * 1.03, 12)
  })

  it('adds the big-cluster refund only from six blocks up', () => {
    const five = createRite({ seed: 1 })
    const six = createRite({ seed: 1 })
    const fiveRefund = five.applyClear({ lines: 3, clusters: [cluster(5)] }).refund
    const sixRefund = six.applyClear({ lines: 3, clusters: [cluster(6)] }).refund
    expect(fiveRefund).toBeCloseTo(0.65, 12)
    expect(sixRefund).toBeCloseTo(0.65 + 0.06, 12)
  })

  it('counts a move and totals the tribute', () => {
    const rite = createRite({ seed: 1 })
    const result = rite.applyClear({ lines: 1, clusters: [cluster(2)] })
    expect(rite.moves).toBe(1)
    expect(rite.score).toBe(result.earned)
    expect(rite.levelScore).toBe(result.earned)
  })

  it('reports the seal broken in the same call that applies the score', () => {
    const rite = createRite({ seed: 1 })
    rite.applyClear({ lines: 4, clusters: [cluster(10)] })
    // 10² × 1 × (4 × 1) = 400, exactly the seal-1 target.
    expect(rite.levelScore).toBe(400)
    const result = rite.applyClear({ lines: 1, clusters: [cluster(1)] })
    expect(result.outcome).toBe('SEAL_BROKEN')
    expect(rite.outcome).toBe('SEAL_BROKEN')
  })

  it('reports no outcome while the run is alive', () => {
    const rite = createRite({ seed: 1 })
    const result = rite.applyClear({ lines: 1, clusters: [cluster(2)] })
    expect(result.outcome).toBeNull()
    expect(rite.outcome).toBeNull()
  })

  it('scores through the real Vex roster, not around it', () => {
    const withVex = createRite({ seed: 1 })
    withVex.takePact(STARTER_VEX_FACTORIES.fog(2))
    const earned = withVex.applyClear({ lines: 2, clusters: [cluster(5)] }).earned
    // fog rank 2 is +0.6 color; quicksand is absent, so lineMult stays 1:
    // round(25 × 1.6 × 2) = 80.
    expect(earned).toBe(80)
  })
})

describe('advanceSeal and reset', () => {
  it('advances the level, re-derives its params and refills Resolve', () => {
    const rite = createRite({ seed: 1 })
    rite.resolve = 3
    rite.applyClear({ lines: 1, clusters: [{ color: 1, blocks: [{ x: 0, y: 0 }] }] })
    rite.advanceSeal()
    expect(rite.level).toBe(2)
    expect(rite.targetScore).toBe(600)
    expect(rite.resolveMax).toBe(170)
    expect(rite.resolve).toBe(170)
    expect(rite.levelScore).toBe(0)
    expect(rite.score).toBe(1)
    expect(rite.moves).toBe(1)
  })

  it('resets the run: level 1, no score, no roster, the same seed', () => {
    const rite = createRite({ seed: 99 })
    rite.takePact(STARTER_VEX_FACTORIES.tremor(1))
    rite.applyClear({ lines: 2, clusters: [{ color: 2, blocks: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }] })
    rite.advanceSeal()
    rite.resolve = 1

    rite.reset()

    expect(rite.level).toBe(1)
    expect(rite.targetScore).toBe(400)
    expect(rite.resolve).toBe(150)
    expect(rite.score).toBe(0)
    expect(rite.levelScore).toBe(0)
    expect(rite.moves).toBe(0)
    expect(rite.roster).toHaveLength(0)
    expect(rite.seed).toBe(99)
    const fresh = createRite({ seed: 99 })
    expect(Array.from({ length: 5 }, () => rite.rng.next())).toEqual(
      Array.from({ length: 5 }, () => fresh.rng.next()),
    )
  })
})

describe('the outcome the clear reports, and when the frame acts on it', () => {
  it('knows the run ended immediately, one tick before the frame acts', () => {
    // applyClear's outcome is correct the moment the seal breaks; the frame
    // deliberately reads it from tick() on the following frame instead, so that a
    // seal does not break a frame earlier than the recorded run does. This pins
    // both halves, since the caller ignoring `cleared.outcome` is otherwise
    // invisible.
    const rite = createRite({ seed: SEED })
    rite.levelScore = rite.targetScore - 1
    const result = rite.applyClear({
      lines: 2,
      clusters: [{ color: 0x4ade80, blocks: [0, 1, 2].map((x) => ({ x, y: 0 })) }],
    })
    expect(result.outcome).toBe('SEAL_BROKEN')
    expect(rite.outcome).toBe('SEAL_BROKEN')
    // and the tick that follows agrees rather than re-deriving something else
    expect(rite.tick(1)).toBe('SEAL_BROKEN')
  })
})

describe('Pacts enter and deepen through the run', () => {
  it('adds a Pact, and ignores one the run already holds', () => {
    const rite = createRite({ seed: SEED })
    const jinxed = STARTER_VEX_FACTORIES.jinxed(2)
    rite.takePact(jinxed)
    expect(rite.roster).toHaveLength(1)
    // A second take of the same Pact must not stack its rules twice.
    rite.takePact(STARTER_VEX_FACTORIES.jinxed(2))
    expect(rite.roster).toHaveLength(1)
    expect(rite.rankOf('jinxed')).toBe(2)
  })

  it('deepens a Pact the run holds, and refuses one it never took', () => {
    const rite = createRite({ seed: SEED })
    const held = STARTER_VEX_FACTORIES.jinxed(2)
    rite.takePact(held)
    // Success reports the Vex's id, matching upgradeVex's own channel.
    expect(rite.upgradePact(held, 5)).toBe('jinxed')
    expect(rite.rankOf('jinxed')).toBe(5)

    // A Pact this run never took is left alone rather than mutated from outside,
    // and says so by reporting nothing changed.
    const stranger = STARTER_VEX_FACTORIES.tremor(3)
    expect(rite.upgradePact(stranger, 4)).toBeUndefined()
    expect(stranger.rank).toBe(3)
    expect(rite.roster).toHaveLength(1)
  })

  it('drains by what the roster says, not by what the roster holds', () => {
    // The roster is load-bearing: quicksand's rank feeds the realtime drain, so
    // taking it must visibly cost more Resolve over the same elapsed time.
    const plain = createRite({ seed: SEED })
    const quicksand = createRite({ seed: SEED })
    quicksand.takePact(STARTER_VEX_FACTORIES.quicksand(5))

    plain.tick(1000)
    quicksand.tick(1000)
    expect(quicksand.resolve).toBeLessThan(plain.resolve)
    expect(plain.resolve - quicksand.resolve).toBeCloseTo(0.05, 6)
  })
})
