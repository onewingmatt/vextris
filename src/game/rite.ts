/**
 * rite.ts — the Rite: one run's state and rules, with no Phaser, no canvas, no DOM.
 *
 * Extracted out of GameScene (candidate 2, docs/specs/rite-extraction.md). The
 * scene keeps the board, the piece, the stage machine, rendering, audio and the
 * HUD; the Rite keeps the run: Resolve and its drain, the score and the seal it
 * is measured against, the refund for clearing, the Vex roster, and the Rng.
 *
 * Faithfulness is measured, not asserted. `scripts/record-rite-trace.mjs`
 * recorded a real seeded run's rules events — every drain, every clear's numbers,
 * the outcome — from the pre-extraction scene, into
 * src/game/__fixtures__/rite-trace-{fade,seal}.json. `rite.test.ts` replays that
 * input stream through this module and asserts every recorded number, and
 * `npm run trace:verify` re-records the live scene and diffs the same fixtures.
 * One perturbed number fails both.
 *
 * No Phaser: that is a constraint, not a preference. The Resolve clamp the scene
 * did with `Phaser.Math.Clamp` is plain `Math.min`/`Math.max` here, which is what
 * lets this module run in jsdom with no canvas.
 *
 * Vocabulary (LORE.md): the Rite of Descent, Resolve, Vex, Pact, tribute, seals.
 * A run is one traversal of the Rite.
 */

import { getLevelParams, type LevelParams } from './config'
import { createRng, type Rng } from './rng'
import { buildScoringContext, scoreMove } from './scoring'
import { upgradeVex, type ScoringCluster, type Vex, type VexRank } from './vex'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** How a run ends. Null while it is still alive. */
export type RiteOutcome = 'SEAL_BROKEN' | 'RESOLVE_FADED'

/** What the scene hands the Rite when it has resolved a set of cleared lines. */
export type ClearDescriptor = {
  lines: number
  clusters: ScoringCluster[]
}

/**
 * What applying a clear produced. `outcome` is the run's state after the call, so
 * a caller cannot apply a score and forget to ask whether it ended the run.
 */
export type ClearResult = {
  /** Tribute earned by this clear (the scene shows this as a floating +N). */
  earned: number
  /** Resolve given back for the clear. Zero for a single line. */
  refund: number
  /** The run's outcome, or null if it is still alive. */
  outcome: RiteOutcome | null

  // The numbers the scene's scoreline chips display. Returned rather than
  // recomputed: the scene must not run the scoring pipeline a second time to
  // show a result the Rite already has.
  /** Colour-cluster multiplier for this move. */
  colorMult: number
  /** Line multiplier for this move. */
  lineMult: number
  /** sum(clusterSize^2) over this move's clusters. */
  totalClusterPoints: number
  /** Biggest single cluster in this move, as the scoring context saw it. */
  maxClusterSize: number
}

export interface Rite {
  /**
   * The run's seed. Readable so a seeded run can be replayed or reported, and
   * re-seedable through `reset`, because the scene restarts a run on the same
   * Rite to keep its roster array identical for the dev panel.
   */
  readonly seed: number
  /** One stream for all gameplay draws: piece spawns and Pact offers share it. */
  readonly rng: Rng
  /**
   * The Vexes taken this run. One stable array mutated in place — the dev panel
   * (and the shop) hold this reference, so it must never be replaced.
   */
  readonly roster: Vex[]

  /** Total tribute for the run. */
  score: number
  /** The seal being attempted (the scene's `currentLevel`). */
  level: number
  /** Tribute earned on the current seal only. */
  levelScore: number
  /** Resolve left on the current seal. */
  resolve: number
  /** Scoring moves this run (the scene's `moveIndex`). */
  moves: number

  /** Tribute needed to break the current seal. */
  readonly targetScore: number
  /** Resolve the current seal refills to. */
  readonly resolveMax: number
  /** The run's outcome, or null while it is still alive. */
  readonly outcome: RiteOutcome | null
  /**
   * Rank of a Vex in the roster, or 0 if the run never took it. The one place
   * that answers the question, so the scene's own rank reads go through here
   * instead of re-implementing the lookup against the roster.
   */
  rankOf(vexId: string): VexRank | 0

  /** Apply the realtime Resolve drain for one frame. Returns the run's outcome. */
  tick(deltaMs: number): RiteOutcome | null
  /**
   * Apply the Resolve bleed for one locked piece. Returns the run's outcome,
   * which the frame ignores on purpose: it checks the run on the next tick.
   */
  lockPiece(): RiteOutcome | null
  /** Compose the scoring pipeline for a clear and apply its effect on the run. */
  applyClear(clear: ClearDescriptor): ClearResult
  /** Add a Pact the run has taken. One already held is ignored. */
  takePact(vex: Vex): void
  /**
   * Deepen a Pact the run holds, by one rank or more. Returns the Vex's id when
   * its rank changed and `undefined` otherwise; a Pact this run never took is
   * left untouched.
   */
  upgradePact(vex: Vex, toRank: VexRank): string | undefined
  /** Break the seal: advance the level, re-derive its params, refill Resolve. */
  advanceSeal(): void
  /**
   * Reset the run's rules — the half of `initRun` that is not presentation.
   * Pass a seed to start a differently seeded run on the same Rite.
   */
  reset(seed?: number): void
}

// ---------------------------------------------------------------------------
// Tuning (mirrors the scene's private constants at the extraction point)
// ---------------------------------------------------------------------------

/** Resolve bled per second of real time, before Vexes. Deliberately forgiving. */
const REALTIME_DRAIN_PER_SECOND = 0.3

/** Resolve bled per locked piece, before Vexes. Deliberately forgiving. */
const PERPIECE_DRAIN = 0.8

/**
 * The scene's `moveIndex` sibling. Always 0 today (the scene's `combo` field says
 * "unused for now"), but ScoringContext carries it, so the Rite must too.
 */
const COMBO = 0

/** Callables the scene passes: `createRite({ seed })`. */
export type RiteOptions = {
  /** Omit to generate a run seed, which stays readable on `Rite.seed`. */
  seed?: number
}

// ---------------------------------------------------------------------------
// The Rite
// ---------------------------------------------------------------------------

export function createRite(options: RiteOptions = {}): Rite {
  let seed = options.seed ?? ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0)

  let rng = createRng(seed)
  const roster: Vex[] = []

  let params: LevelParams = getLevelParams(1)
  let score = 0
  let level = 1
  let levelScore = 0
  let resolve = params.resolveMax
  let moves = 0

  /** Rank of a Vex in the roster, or 0 if it was never taken. */
  const rankOf = (id: string): VexRank | 0 => roster.find(vex => vex.id === id)?.rank ?? 0

  /**
   * Resolve bled per second of real time. Ordering matches the scene's
   * accumulation exactly — the fixture pins every digit of it.
   */
  const drainPerSecond = (): number => {
    let drain = REALTIME_DRAIN_PER_SECOND
    drain += rankOf('quicksand') * 0.01
    drain += rankOf('pressure') * 0.012
    drain += rankOf('fog') * 0.006
    drain += rankOf('blackout') * 0.004
    return drain
  }

  /** Resolve bled per locked piece. Ordering matches the frame's accumulation. */
  const perPieceDrain = (): number => {
    let drain = PERPIECE_DRAIN
    drain += rankOf('quicksand') * 0.025
    drain += rankOf('lead_fingers') * 0.015
    drain += rankOf('jinxed') * 0.02
    drain += rankOf('rising_dread') * 0.018
    return drain
  }

  /** Resolve given back for a clear. Single lines refund nothing. */
  const refundForClear = (linesCleared: number, maxClusterSize: number): number => {
    if (linesCleared < 2) return 0

    const refundByLines = [0, 0, 0.25, 0.65, 1.2]
    let refund = refundByLines[Math.min(linesCleared, 4)]

    if (maxClusterSize >= 6) {
      refund += Math.min(0.6, (maxClusterSize - 5) * 0.06)
    }

    const refundScale = 1
      + rankOf('corruption') * 0.015
      + rankOf('tremor') * 0.01
      + rankOf('rising_dread') * 0.015

    return refund * refundScale
  }

  /** Clamped Resolve movement. Plain arithmetic: this module has no Phaser. */
  const applyResolveDelta = (delta: number): void => {
    resolve = Math.min(Math.max(resolve + delta, 0), params.resolveMax)
  }

  /**
   * The run's outcome. Win is asked first, as the scene's frame does: reaching
   * the target on the frame Resolve expires is a seal broken, not a fade.
   */
  const outcomeOf = (): RiteOutcome | null => {
    if (levelScore >= params.targetScore) return 'SEAL_BROKEN'
    if (resolve <= 0) return 'RESOLVE_FADED'
    return null
  }

  const tick = (deltaMs: number): RiteOutcome | null => {
    applyResolveDelta(-(deltaMs * drainPerSecond() / 1000))
    return outcomeOf()
  }

  /**
   * Apply the Resolve bleed for one locked piece.
   *
   * The third place the frame moved Resolve, and the reason `tick` alone could
   * not take over. The frame deliberately ignores the returned outcome: it has
   * always checked the run on the following tick, and checking here instead
   * would break the seal one frame earlier than the recorded run does.
   */
  const lockPiece = (): RiteOutcome | null => {
    applyResolveDelta(-perPieceDrain())
    return outcomeOf()
  }

  const applyClear = (clear: ClearDescriptor): ClearResult => {
    // Score BEFORE the board rows are cleared: that ordering used to be a
    // comment inside the frame's clear block, and this call is now its home.
    const ctx = buildScoringContext({
      linesCleared: clear.lines,
      clusters: clear.clusters,
      moveIndex: moves,
      combo: COMBO,
      timeRemaining: resolve,
      currentLevel: level,
    })
    const scored = scoreMove(ctx, roster)
    const moveScore = scored.moveScore

    score += moveScore
    levelScore += moveScore
    moves += 1

    const refund = refundForClear(clear.lines, ctx.maxClusterSize)
    if (refund > 0) applyResolveDelta(refund)

    return {
      earned: moveScore,
      refund,
      outcome: outcomeOf(),
      colorMult: scored.colorMult,
      lineMult: scored.lineMult,
      totalClusterPoints: scored.totalClusterPoints,
      maxClusterSize: ctx.maxClusterSize,
    }
  }

  /**
   * Add a Pact the run has just taken. One already in the run is ignored, so a
   * caller cannot double-add and silently double that Pact's contribution to the
   * drain and the refund.
   */
  const takePact = (vex: Vex): void => {
    if (roster.some(taken => taken.id === vex.id)) return
    roster.push(vex)
  }

  /**
   * Deepen a Pact the run already holds, and only one it holds: the roster is the
   * run's, so a Vex it never took is left untouched rather than mutated from
   * outside the run.
   *
   * Returns the Vex's id when its rank actually changed, `undefined` otherwise —
   * the same channel `upgradeVex` uses, so a caller reads one signal either way
   * and a refusal is not a special case it has to decode.
   */
  const upgradePact = (vex: Vex, toRank: VexRank): string | undefined => {
    if (!roster.includes(vex)) return undefined
    return upgradeVex(vex, toRank)
  }

  const advanceSeal = (): void => {
    level += 1
    params = getLevelParams(level)
    levelScore = 0
    resolve = params.resolveMax
  }

  const reset = (nextSeed?: number): void => {
    if (nextSeed !== undefined) seed = nextSeed
    params = getLevelParams(1)
    level = 1
    levelScore = 0
    resolve = params.resolveMax
    score = 0
    moves = 0
    roster.length = 0
    rng = createRng(seed)
  }

  return {
    get seed() { return seed },
    roster,
    get rng() { return rng },
    get score() { return score },
    get level() { return level },
    get levelScore() { return levelScore },
    set levelScore(value: number) { levelScore = value },
    get resolve() { return resolve },
    set resolve(value: number) { resolve = value },
    get moves() { return moves },
    get targetScore() { return params.targetScore },
    get resolveMax() { return params.resolveMax },
    get outcome() { return outcomeOf() },
    rankOf,
    tick,
    lockPiece,
    applyClear,
    takePact,
    upgradePact,
    advanceSeal,
    reset,
  }
}
