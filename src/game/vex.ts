/**
 * vex.ts — Vex (curse) system for Vextris.
 *
 * Each Vex is always-active once taken, applies a visual/gameplay downside,
 * and provides a scoring multiplier as a reward. Ranks 1–3 scale both.
 *
 * Scoring is split into two multiplier buckets:
 *   "color" — scales totalClusterPoints (color-cluster scoring)
 *   "line"  — scales linesCleared as a multiplier
 *
 * Final score formula (in GameScene):
 *   colorMult = 1 + sum(vex.getMultiplier for color vexes)
 *   lineMult  = 1 + sum(vex.getMultiplier for line vexes)
 *   moveScore = (totalClusterPoints * colorMult) * (linesCleared * lineMult)
 */

import { enableBlackout, disableBlackout } from './effects/blackout'
import { enableFog, disableFog } from './effects/fog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A cluster of same-color adjacent blocks inside cleared lines. */
export type ScoringCluster = {
    blocks: { x: number; y: number }[]
    color: number   // Phaser hex number (matches existing scoringClusters)
}

/**
 * Everything the scoring function (and Vex getMultiplier) needs about the
 * current move. Built once per line-clear event, passed to all active Vexes.
 */
export type ScoringContext = {
    linesCleared: number
    clusters: ScoringCluster[]
    totalClusterPoints: number     // sum(cluster.length^2)
    maxClusterSize: number         // size of the biggest single cluster
    colorsInMove: Set<number>      // distinct colours in this clear
    moveIndex: number              // how many scoring moves have happened this run
    combo: number                  // consecutive scoring moves (0 if unused)
    timeRemaining: number          // seconds left on the level timer
    currentLevel: number           // progression level (1–10)
}

/** Which multiplier bucket this Vex affects. */
export type VexKind = 'color' | 'line'

/**
 * A Vex definition. Instantiate via the factory functions below.
 * onApply / onRankChange are intentionally stubs — the GameScene wires
 * the actual timers and visual effects and calls these hooks.
 */
export type Vex = {
    id: string
    name: string
    kind: VexKind
    rank: 1 | 2 | 3
    description: string
    downsideDescription: string

    /**
     * Returns the additive multiplier bonus this Vex contributes to its bucket
     * given the current scoring context and rank.
     * Return 0 if the context doesn't qualify (e.g. no lines cleared).
     */
    getMultiplier: (ctx: ScoringContext, rank: 1 | 2 | 3) => number

    /**
     * Called once when this Vex first becomes active (or when it is loaded).
     * Should start any repeating timers or visual effects.
     * @stub — implement the body in GameScene after calling onApply?.()
     */
    onApply?: (rank: 1 | 2 | 3) => void

    /**
     * Called when the Vex's rank is upgraded.
     * Should adjust existing timers/effects to match the new rank.
     * @stub — implement the body in GameScene after calling onRankChange?.()
     */
    onRankChange?: (oldRank: 1 | 2 | 3, newRank: 1 | 2 | 3) => void
}

// ---------------------------------------------------------------------------
// Rank helpers
// ---------------------------------------------------------------------------

// (rankStep is available for future getMultiplier implementations that need
// interpolated values rather than lookup tables.)
// const rankStep = (rank: 1 | 2 | 3, base: number, step: number) =>
//   base + step * (rank - 1)

// ---------------------------------------------------------------------------
// Color Vexes  (affect colour-cluster scoring)
// ---------------------------------------------------------------------------

/**
 * Vex of Blackout
 * Downside: screen periodically darkens, obscuring the board.
 * Reward:   colour clusters score more.
 */
export const createVexBlackout = (rank: 1 | 2 | 3): Vex => ({
    id: 'blackout',
    name: 'Vex of Blackout',
    kind: 'color',
    rank,
    description: 'The lights flicker; colour clusters score more.',
    downsideDescription: 'Screen periodically darkens, obscuring the board.',

    getMultiplier(ctx, r) {
        if (ctx.totalClusterPoints === 0) return 0
        // Rank 1: +0.20, Rank 2: +0.50, Rank 3: +1.00
        const values: Record<1 | 2 | 3, number> = { 1: 0.2, 2: 0.5, 3: 1.0 }
        return values[r]
    },

    onApply(r) {
        // Start the blackout cycle at the given rank.
        // enableBlackout is idempotent — safe to call multiple times.
        enableBlackout(r)
    },

    onRankChange(_oldRank, newRank) {
        // Clear the existing cycle and restart with the new rank's parameters.
        // disableBlackout hides the overlay and cancels pending timers before
        // enableBlackout sets up the new (stronger, more frequent) cycle.
        disableBlackout()
        enableBlackout(newRank)
    },
})

/**
 * Vex of Fog
 * Downside: bottom rows are covered by fog (hidden from the player).
 * Reward:   colour clusters score more.
 */
export const createVexFog = (rank: 1 | 2 | 3): Vex => ({
    id: 'fog',
    name: 'Vex of Fog',
    kind: 'color',
    rank,
    description: 'The depths are obscured; colour clusters score more.',
    downsideDescription: 'Bottom rows are covered by fog.',

    getMultiplier(ctx, r) {
        if (ctx.totalClusterPoints === 0) return 0
        // Rank 1: +0.30, Rank 2: +0.60, Rank 3: +1.20
        const values: Record<1 | 2 | 3, number> = { 1: 0.3, 2: 0.6, 3: 1.2 }
        return values[r]
    },

    onApply(r) {
        // Start the fog overlay at the given rank.
        // enableFog creates the overlay element on first call and sets its
        // height/opacity; for rank 3 it also starts the creep timer.
        enableFog(r)
    },

    onRankChange(_oldRank, newRank) {
        // Disabling first clears any existing creep timer before re-enabling
        // with the new rank's parameters (denser fog, or creep added at rank 3).
        disableFog()
        enableFog(newRank)
    },
})

/**
 * Vex of Corruption
 * Downside: random placed blocks quietly change colour over time,
 *           disrupting cluster formation.
 * Reward:   colour clusters score more.
 */
export const createVexCorruption = (rank: 1 | 2 | 3): Vex => ({
    id: 'corruption',
    name: 'Vex of Corruption',
    kind: 'color',
    rank,
    description: 'Colours bleed and shift; clusters score more.',
    downsideDescription: 'Random placed blocks change colour over time.',

    getMultiplier(ctx, r) {
        if (ctx.totalClusterPoints === 0) return 0
        // Rank 1: +0.30, Rank 2: +0.70, Rank 3: +1.30
        const values: Record<1 | 2 | 3, number> = { 1: 0.3, 2: 0.7, 3: 1.3 }
        return values[r]
    },

    onApply(_r) {
        // TODO (GameScene): every N seconds pick K random filled board cells and
        // recolour them to a random BLOCK_COLOR (from config).
        //   rank 1 → K=1, every 8s
        //   rank 2 → K=2, every 5s
        //   rank 3 → K=4, every 3s
    },

    onRankChange(_oldRank, _newRank) {
        // TODO (GameScene): adjust K and the timer interval.
    },
})

// ---------------------------------------------------------------------------
// Line Vexes  (affect line-clear scoring)
// ---------------------------------------------------------------------------

/**
 * Vex of Quicksand
 * Downside: base drop speed (gravity) increases significantly.
 * Reward:   line clears score more.
 */
export const createVexQuicksand = (rank: 1 | 2 | 3): Vex => ({
    id: 'quicksand',
    name: 'Vex of Quicksand',
    kind: 'line',
    rank,
    description: 'Pieces fall faster; line clears score more.',
    downsideDescription: 'Base drop speed increases significantly.',

    getMultiplier(ctx, r) {
        if (ctx.linesCleared === 0) return 0
        // Rank 1: +0.20, Rank 2: +0.60, Rank 3: +1.20
        const values: Record<1 | 2 | 3, number> = { 1: 0.2, 2: 0.6, 3: 1.2 }
        return values[r]
    },

    onApply(_r) {
        // TODO (GameScene): override gravityDelay with a faster value.
        //   rank 1: gravityDelay * 0.75
        //   rank 2: gravityDelay * 0.50
        //   rank 3: gravityDelay * 0.30
        // Store the original so it can be restored on rank change.
    },

    onRankChange(_oldRank, _newRank) {
        // TODO (GameScene): update the gravity multiplier to match newRank.
    },
})

/**
 * Vex of Amnesia
 * Downside: next-piece preview is hidden; at higher ranks hold and colours too.
 * Reward:   line clears score more.
 */
export const createVexAmnesia = (rank: 1 | 2 | 3): Vex => ({
    id: 'amnesia',
    name: 'Vex of Amnesia',
    kind: 'line',
    rank,
    description: "You forget what's coming; line clears score more.",
    downsideDescription: 'Next-piece preview (and later hold, colours) is hidden.',

    getMultiplier(ctx, r) {
        if (ctx.linesCleared === 0) return 0
        // Rank 1: +0.30, Rank 2: +0.70, Rank 3: +1.30
        const values: Record<1 | 2 | 3, number> = { 1: 0.3, 2: 0.7, 3: 1.3 }
        return values[r]
    },

    onApply(_r) {
        // TODO (GameScene): hide NEXT preview UI at all ranks.
        //   rank 2+: also hide HOLD UI.
        //   rank 3:  render all current-piece blocks as a single grey colour.
    },

    onRankChange(_oldRank, _newRank) {
        // TODO (GameScene): extend or reduce hidden UI based on newRank.
    },
})

/**
 * Vex of Rising Dread
 * Downside: garbage rows periodically rise from the bottom.
 * Reward:   line clears score more.
 */
export const createVexRisingDread = (rank: 1 | 2 | 3): Vex => ({
    id: 'rising_dread',
    name: 'Vex of Rising Dread',
    kind: 'line',
    rank,
    description: 'The dead rise beneath you; line clears score more.',
    downsideDescription: 'Garbage rows periodically rise from the bottom.',

    getMultiplier(ctx, r) {
        if (ctx.linesCleared === 0) return 0
        // Rank 1: +0.20, Rank 2: +0.60, Rank 3: +1.20
        const values: Record<1 | 2 | 3, number> = { 1: 0.2, 2: 0.6, 3: 1.2 }
        return values[r]
    },

    onApply(_r) {
        // TODO (GameScene): create a repeating timer that shifts the board up by 1
        // and inserts a random garbage row at the bottom with 1 hole.
        //   rank 1 → every 20s
        //   rank 2 → every 12s
        //   rank 3 → every 7s
    },

    onRankChange(_oldRank, _newRank) {
        // TODO (GameScene): adjust the timer interval to match newRank.
    },
})

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * All starter Vex factories in one object, keyed by Vex id.
 * Use this to create Vex instances by id:
 *   STARTER_VEX_FACTORIES.blackout(1)   // rank-1 Blackout
 */
export const STARTER_VEX_FACTORIES = {
    blackout: createVexBlackout,
    fog: createVexFog,
    corruption: createVexCorruption,
    quicksand: createVexQuicksand,
    amnesia: createVexAmnesia,
    rising_dread: createVexRisingDread,
} as const

export type VexId = keyof typeof STARTER_VEX_FACTORIES

/**
 * Upgrades a Vex to a new rank in-place and fires onRankChange.
 * Safe to call even if old rank === new rank.
 */
export function upgradeVex(vex: Vex, newRank: 1 | 2 | 3): void {
    if (vex.rank === newRank) return
    const oldRank = vex.rank
    vex.rank = newRank
    vex.onRankChange?.(oldRank, newRank)
}
