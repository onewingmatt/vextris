/**
 * scoring.ts — pure scoring pipeline for line clears.
 *
 * Extracted from GameScene (2026-09 audit) so the heart of the game —
 * cluster points × vex multipliers × line multipliers — is unit-testable
 * and independent of Phaser/DOM. GameScene keeps all presentation
 * (floating text, chips, camera shake, SFX); this module computes numbers.
 *
 * The math is IDENTICAL to the original inline block by construction:
 *   - same cluster point formula (sum of size²)
 *   - same additive multiplier accumulation
 *   - same synergy injection
 *   - same final rounding
 * The original code promised "With no Vexes: colorMult=1, lineMult=1 →
 * identical to old formula" — these tests now pin that contract.
 */

import type { ScoringContext, ScoringCluster, Vex } from './vex'
import { getSynergyMultiplier } from './vex'

// ---------------------------------------------------------------------------
// Cluster analysis (pure)
// ---------------------------------------------------------------------------

/**
 * Computes base cluster points and context stats from the clusters captured
 * in the cleared lines.
 *
 * Points formula (unchanged from original): each cluster scores size².
 */
export function analyzeClusters(clusters: ScoringCluster[]): {
    totalClusterPoints: number
    maxClusterSize: number
    colorsInMove: Set<number>
} {
    let totalClusterPoints = 0
    let maxClusterSize = 0
    const colorsInMove = new Set<number>()
    for (const cluster of clusters) {
        const clusterSize = cluster.blocks.length
        totalClusterPoints += clusterSize * clusterSize
        if (clusterSize > maxClusterSize) maxClusterSize = clusterSize
        colorsInMove.add(cluster.color)
    }
    return { totalClusterPoints, maxClusterSize, colorsInMove }
}

/**
 * Builds the ScoringContext for a clear from pure inputs.
 * (Move/run metadata that vexes can read.)
 */
export function buildScoringContext(args: {
    linesCleared: number
    clusters: ScoringCluster[]
    moveIndex: number
    combo: number
    timeRemaining: number
    currentLevel: number
}): ScoringContext {
    const { totalClusterPoints, maxClusterSize, colorsInMove } = analyzeClusters(args.clusters)
    return {
        linesCleared: args.linesCleared,
        clusters: args.clusters,
        totalClusterPoints,
        maxClusterSize,
        colorsInMove,
        moveIndex: args.moveIndex,
        combo: args.combo,
        timeRemaining: args.timeRemaining,
        currentLevel: args.currentLevel,
    }
}

// ---------------------------------------------------------------------------
// Multiplier pipeline (pure)
// ---------------------------------------------------------------------------

/** Result of the scoring pipeline. */
export type ScoreMoveResult = {
    /** Points awarded for this clear (rounded, as the original). */
    moveScore: number
    /** Total cluster points before vex multipliers. */
    totalClusterPoints: number
    /** Color bucket multiplier (1 + bonuses). */
    colorMult: number
    /** Line bucket multiplier (1 + bonuses). */
    lineMult: number
    /** Largest single cluster size in the clear. */
    maxClusterSize: number
    /** Distinct colors present in the clear. */
    colorsInMove: Set<number>
}

/**
 * The full scoring pipeline. Pure: same inputs (vex roster, clusters, move
 * metadata) → same output, always.
 *
 * Formula (unchanged):
 *   colorMult = 1 + Σ color-vex getMultiplier(ctx) + Σ color synergies
 *   lineMult  = 1 + Σ line-vex  getMultiplier(ctx) + Σ line synergies
 *   moveScore = round((totalClusterPoints × colorMult) × (linesCleared × lineMult))
 */
export function scoreMove(ctx: ScoringContext, activeVexes: Vex[]): ScoreMoveResult {
    // Step 3: accumulate additive multiplier bonuses from active Vexes
    let colorMultBonus = 0
    let lineMultBonus = 0
    for (const vex of activeVexes) {
        const m = vex.getMultiplier(ctx, vex.rank)
        if (vex.kind === 'color') colorMultBonus += m
        else if (vex.kind === 'line') lineMultBonus += m
    }

    // Step 3b: synergy bonuses
    colorMultBonus += getSynergyMultiplier(activeVexes, 'color')
    lineMultBonus += getSynergyMultiplier(activeVexes, 'line')

    // Step 4: apply multipliers
    const colorMult = 1 + colorMultBonus
    const lineMult = 1 + lineMultBonus
    const modifiedClusterPoints = ctx.totalClusterPoints * colorMult
    const moveScore = Math.round(modifiedClusterPoints * (ctx.linesCleared * lineMult))

    return {
        moveScore,
        totalClusterPoints: ctx.totalClusterPoints,
        colorMult,
        lineMult,
        maxClusterSize: ctx.maxClusterSize,
        colorsInMove: ctx.colorsInMove,
    }
}
