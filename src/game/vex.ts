/**
 * vex.ts — Vex (curse) system for Vextris.
 *
 * Each Vex is always-active once taken, applies a visual/gameplay downside,
 * and provides a scoring multiplier as a reward. Ranks 1-10 scale both.
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

/** Rarity used by shop weighted-offer generation. */
export type VexRarity = 'common' | 'uncommon' | 'rare' | 'mythic'

/**
 * A Vex definition. Instantiate via the factory functions below.
 * onApply / onRankChange are intentionally stubs — the GameScene wires
 * the actual timers and visual effects and calls these hooks.
 */
export type Vex = {
    id: string
    name: string
    kind: VexKind
    rarity: VexRarity
    rank: VexRank
    description: string
    downsideDescription: string
    getFlavorText?: (rank: VexRank) => string

    /**
     * Returns the additive multiplier bonus this Vex contributes to its bucket
     * given the current scoring context and rank.
     * Return 0 if the context doesn't qualify (e.g. no lines cleared).
     */
    getMultiplier: (ctx: ScoringContext, rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10) => number

    /**
     * Called once when this Vex first becomes active (or when it is loaded).
     * Should start any repeating timers or visual effects.
     * @stub — implement the body in GameScene after calling onApply?.()
     */
    onApply?: (rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10) => void

    /**
     * Called when the Vex's rank is upgraded.
     * Should adjust existing timers/effects to match the new rank.
     * @stub — implement the body in GameScene after calling onRankChange?.()
     */
    onRankChange?: (oldRank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, newRank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10) => void
}

export type MirageConfig = {
    colRange: number
    onMs: number
    offMs: number
}

export type JinxedConfig = {
    rotateChance: number
    alwaysRotate: boolean
    colorScramble: boolean
    columnJitter: number
}

// ---------------------------------------------------------------------------
// Rank helpers
// ---------------------------------------------------------------------------

/**
 * Rising Dread garbage row parameters based on Vex rank.
 * Higher rank = faster interval, fewer gaps.
 */
/**
 * Vexes can now be leveled up to rank 10 (stacking, Vampire Survivors style).
 * If you want to allow even higher stacking, extend this type and logic.
 */
export type VexRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
/**
 * Upgrades a Vex to a new rank in-place and fires onRankChange.
 * Safe to call even if old rank === new rank.
 * If newRank > 10, clamps to 10 (raise VexRank type if you want higher stacking).
 * Returns the vex ID if the rank was actually changed, undefined otherwise.
 */
export function upgradeVex(vex: Vex, newRank: VexRank): string | undefined {
    const clampedRank = Math.min(newRank, 10) as VexRank;
    if (vex.rank === clampedRank) return undefined;
    const oldRank = vex.rank;
    vex.rank = clampedRank;
    vex.onRankChange?.(oldRank, clampedRank);
    return vex.id;
}

export function getLeadFingersDASBonus(rank: VexRank): number {
    const values: Record<VexRank, number> = {
        1: 10, 2: 14, 3: 18, 4: 22, 5: 25, 6: 29, 7: 32, 8: 35, 9: 38, 10: 40,
    }
    return values[rank]
}

export function getLeadFingersARRBonus(rank: VexRank): number {
    const values: Record<VexRank, number> = {
        1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 11,
    }
    return values[rank]
}

export function getWhiplashDuration(rank: VexRank): number {
    const values: Record<VexRank, number> = {
        1: 150, 2: 210, 3: 270, 4: 330, 5: 400, 6: 480, 7: 560, 8: 640, 9: 720, 10: 800,
    }
    return values[rank]
}

export function getMirageConfig(rank: VexRank): MirageConfig {
    const values: Record<VexRank, MirageConfig> = {
        1: { colRange: 1, onMs: 2000, offMs: 20000 },
        2: { colRange: 1, onMs: 2200, offMs: 17000 },
        3: { colRange: 1, onMs: 2400, offMs: 15000 },
        4: { colRange: 2, onMs: 2600, offMs: 12500 },
        5: { colRange: 2, onMs: 3000, offMs: 10000 },
        6: { colRange: 2, onMs: 3400, offMs: 8500 },
        7: { colRange: 2, onMs: 3800, offMs: 7000 },
        8: { colRange: 3, onMs: 4200, offMs: 6000 },
        9: { colRange: 3, onMs: 4600, offMs: 5500 },
        10: { colRange: 3, onMs: 5000, offMs: 5000 },
    }
    return values[rank]
}

export function getJinxedConfig(rank: VexRank): JinxedConfig {
    const rotateChanceByRank: Record<VexRank, number> = {
        1: 0.4, 2: 0.7, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1,
    }
    return {
        rotateChance: rotateChanceByRank[rank],
        alwaysRotate: rank >= 3,
        colorScramble: rank >= 3,
        columnJitter: rank >= 7 ? 3 : 0,
    }
}

export function getPressureTimeLimit(rank: VexRank): number {
    const values: Record<VexRank, number> = {
        1: 8, 2: 7.25, 3: 6.5, 4: 5.75, 5: 5, 6: 4.5, 7: 4, 8: 3.6, 9: 3.3, 10: 3,
    }
    return values[rank]
}

export function getQuicksandBonusMultiplier(rank: VexRank): number {
    return rank * 0.25
}

type FlavorTextTiers = {
    warning: string
    manifestation: string
    consumption: string
}

/**
 * Mystery-copy checklist for short Vex card text (description/downsideDescription):
 * 1) Lead with fiction and consequence, not mechanics.
 * 2) Keep to one clear sentence each; avoid system jargon where possible.
 * 3) Put the cost in downsideDescription as an immediate chamber effect.
 * 4) Reserve direct numeric clarity for dedicated stat/mult UI.
 */

const FLAVOR_TEXT_BY_VEX_ID = {
    blackout: {
        warning: 'The Lantern Sisters taught this pact in cellars of blind stone. They said the altar listens best when the last candle dies.',
        manifestation: 'The candles drown one by one, though no wind walks here. The altar drinks the dark and asks for deeper tribute.',
        consumption: 'Extinguish the final flame. Let the void read your pulse.',
    },
    fog: {
        warning: 'Marsh-priests of the Sallow Fen carved this sigil in drowned bone. They warned that low places remember every failed ritual.',
        manifestation: 'Cold mist crawls over the altar steps and clings to your throat. Runes vanish beneath it, whispering from below.',
        consumption: 'Do not look down. The fog is looking up.',
    },
    corruption: {
        warning: 'The Rot-Coven mixed seven inks with gravewater and named it mercy. Any rune marked with it forgets its first oath.',
        manifestation: 'Pigment bleeds across the altar like living mold. Neighboring runes trade names while you watch.',
        consumption: 'Nothing keeps its color. Nothing keeps its name.',
    },
    quicksand: {
        warning: 'Pilgrims of the Sinking Choir swore this pact in dry wells. They learned the altar has a hunger for haste.',
        manifestation: 'The stone beneath the ritual turns to starving sand. Every rune sinks before your hands can bless it.',
        consumption: 'Stop fighting the pull. Descend with the offering.',
    },
    amnesia: {
        warning: 'The Mneme-Eaters erased whole covens and left only blank tablets. Their pact strips memory from every rite.',
        manifestation: 'The next omen will not come when called. Your own hands move as if they belong to a dead augur.',
        consumption: 'Forget the pattern. Obey the void.',
    },
    rising_dread: {
        warning: 'The first altar was raised over a pit of unfinished rites. The buried augurs still press their knuckles against the stone.',
        manifestation: 'The floor bucks upward in wet, deliberate breaths. New rows of old offerings force themselves into your ritual.',
        consumption: 'Make room below you. They are rising through your seat.',
    },
    lead_fingers: {
        warning: 'The Iron Nuns wore prayer weights until their fingers split. They forged this pact to keep trembling augurs obedient.',
        manifestation: 'Your joints thicken like poured lead. Each command reaches the altar late, as if spoken underwater.',
        consumption: 'Your hands are not yours. The ritual moves them.',
    },
    whiplash: {
        warning: 'Duelists of the Lash-Coven struck the altar to wake sleeping judges. Every impact bought tribute and took sight in return.',
        manifestation: 'Each violent descent cracks a black flare across your vision. The room blinks out, then returns closer.',
        consumption: 'Strike harder. Blink less. Do not miss the dark.',
    },
    tremor: {
        warning: 'Miners beneath Hollow Veyl heard this pact before they saw it. Their runes danced on untouched altars.',
        manifestation: 'The altar shivers between heartbeats and dust falls upward. Your teeth count the pulses for you.',
        consumption: 'The stone is awake. Match its trembling.',
    },
    mirage: {
        warning: 'Mirror-witches polished obsidian until it answered with false futures. Their pact shows where a rune could be, never where it will bleed.',
        manifestation: 'Pale doubles hover over the altar and point to wrong endings. You follow one and the other laughs.',
        consumption: 'Trust no reflection. The void prefers liars.',
    },
    jinxed: {
        warning: 'Hex-smiths of the Crooked Star bound chance into a copper charm. It blesses no ritual; it only chooses.',
        manifestation: 'Runes arrive twisted, painted in borrowed blood, eager to break formation. The altar applauds every mistake.',
        consumption: 'Let chaos officiate. Offer without intention.',
    },
    pressure: {
        warning: 'The Bell of Vhar was cast to end rituals before dawn. Its pact counts every breath as debt.',
        manifestation: 'An unseen toll follows each rune across the altar. When the count ends, the offering is taken from your hands.',
        consumption: 'Hear the final bell. Surrender before it strikes.',
    },
} as const satisfies Record<string, FlavorTextTiers>

function getFlavorTextForRank(vexId: keyof typeof FLAVOR_TEXT_BY_VEX_ID, rank: VexRank): string {
    const tiers = FLAVOR_TEXT_BY_VEX_ID[vexId]
    if (rank >= 10) return tiers.consumption
    if (rank >= 5) return tiers.manifestation
    return tiers.warning
}
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
export const createVexBlackout = (rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): Vex => ({
    id: 'blackout',
    name: 'Vex of Blackout',
    kind: 'color',
    rarity: 'common',
    rank,
    description: 'Blind the chamber and your offerings burn richer tribute.',
    downsideDescription: 'Dark pulses repeatedly swallow the altar view.',
    getFlavorText: (r) => getFlavorTextForRank('blackout', r),

    getMultiplier(ctx, r) {
        if (ctx.totalClusterPoints === 0) return 0
        const values: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, number> = {
            1: 0.2, 2: 0.5, 3: 1.0, 4: 1.5, 5: 2.0, 6: 2.5, 7: 3.0, 8: 3.5, 9: 4.0, 10: 4.5
        }
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
export const createVexFog = (rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): Vex => ({
    id: 'fog',
    name: 'Vex of Fog',
    kind: 'color',
    rarity: 'common',
    rank,
    description: 'Let the mist climb and buried offerings feed deeper tribute.',
    downsideDescription: 'Rising fog veils the lower altar steps.',
    getFlavorText: (r) => getFlavorTextForRank('fog', r),

    getMultiplier(ctx, r) {
        if (ctx.totalClusterPoints === 0) return 0
        const values: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, number> = {
            1: 0.3, 2: 0.6, 3: 1.2, 4: 1.8, 5: 2.4, 6: 3.0, 7: 3.6, 8: 4.2, 9: 4.8, 10: 5.4
        }
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
export const createVexCorruption = (rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): Vex => ({
    id: 'corruption',
    name: 'Vex of Corruption',
    kind: 'color',
    rarity: 'mythic',
    rank,
    description: 'Rot the pigments and corrupted patterns yield richer tribute.',
    downsideDescription: 'Placed runes mutate over time, undoing stable formations.',
    getFlavorText: (r) => getFlavorTextForRank('corruption', r),

    getMultiplier(ctx, r) {
        if (ctx.totalClusterPoints === 0) return 0
        const values: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, number> = {
            1: 0.35, 2: 0.8, 3: 1.45, 4: 2.1, 5: 2.75, 6: 3.4, 7: 4.05, 8: 4.7, 9: 5.35, 10: 6.0
        }
        return values[r]
    },

    onApply(_r) {
        // GameScene wires a recurring corruption timer based on rank.
    },

    onRankChange(_oldRank, _newRank) {
        // GameScene reconfigures corruption cadence/strength from rank.
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
export const createVexQuicksand = (rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): Vex => ({
    id: 'quicksand',
    name: 'Vex of Quicksand',
    kind: 'line',
    rarity: 'uncommon',
    rank,
    description: 'Embrace the sinking pace and each cut drives harsher tribute.',
    downsideDescription: 'Gravity quickens and runes fall with little mercy.',
    getFlavorText: (r) => getFlavorTextForRank('quicksand', r),

    getMultiplier(ctx, r) {
        if (ctx.linesCleared === 0) return 0
        return getQuicksandBonusMultiplier(r)
    },

    onApply(_r) {
        // GameScene applies quicksand gravity scaling each frame.
    },

    onRankChange(_oldRank, _newRank) {
        // GameScene uses current rank to update gravity scaling in real time.
    },
})

/**
 * Vex of Amnesia
 * Downside: next-piece preview is hidden; at higher ranks hold and colours too.
 * Reward:   line clears score more.
 */
export const createVexAmnesia = (rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): Vex => ({
    id: 'amnesia',
    name: 'Vex of Amnesia',
    kind: 'line',
    rarity: 'uncommon',
    rank,
    description: 'Forget certainty and desperate cuts carve greater tribute.',
    downsideDescription: 'Future omens fade from sight; memory tools are stripped away.',
    getFlavorText: (r) => getFlavorTextForRank('amnesia', r),

    getMultiplier(ctx, r) {
        if (ctx.linesCleared === 0) return 0
        const values: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, number> = {
            1: 0.3, 2: 0.7, 3: 1.3, 4: 1.95, 5: 2.6, 6: 3.25, 7: 3.9, 8: 4.55, 9: 5.2, 10: 5.85
        }
        const levelScale = 0.65 + Math.max(0, Math.min(1, (ctx.currentLevel - 1) / 9)) * 0.35
        return values[r] * levelScale
    },

    onApply(_r) {
        // GameScene applies amnesia visibility/colour penalties while rendering.
    },

    onRankChange(_oldRank, _newRank) {
        // GameScene reads rank each frame to update amnesia penalties.
    },
})

/**
 * Vex of Rising Dread
 * Downside: garbage rows periodically rise from the bottom.
 * Reward:   line clears score more.
 */
export const createVexRisingDread = (rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): Vex => ({
    id: 'rising_dread',
    name: 'Vex of Rising Dread',
    kind: 'line',
    rarity: 'uncommon',
    rank,
    description: 'When the buried stir, each surviving cut earns harsher tribute.',
    downsideDescription: 'Old offerings rise from below in hostile rows.',
    getFlavorText: (r) => getFlavorTextForRank('rising_dread', r),

    getMultiplier(ctx, r) {
        if (ctx.linesCleared === 0) return 0
        const values: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, number> = {
            1: 0.2, 2: 0.6, 3: 1.2, 4: 1.8, 5: 2.4, 6: 3.0, 7: 3.6, 8: 4.2, 9: 4.8, 10: 5.4
        }
        return values[r]
    },

    onApply(_r) {
        // GameScene wires this up:
        // 1. Compute params via getRisingDreadParams(_r)
        // 2. Schedule repeating timer:
        //    - Show warning flash for ~200ms
        //    - After 1s, call pushGarbageRow(gapsPerRow)
        // 3. Store timer ID in GameScene's vexIntervals map keyed by 'rising_dread'
    },

    onRankChange(_oldRank, _newRank) {
        // GameScene wires this up:
        // 1. Clear old interval via vexIntervals.get('rising_dread')
        // 2. Call onApply(_newRank) to restart with new params
    },
})

/**
 * Vex of Lead Fingers
 * Downside: horizontal movement inputs feel heavy and delayed.
 * Reward:   line clears score more.
 */
export const createVexLeadFingers = (rank: VexRank): Vex => ({
    id: 'lead_fingers',
    name: 'Vex of Lead Fingers',
    kind: 'line',
    rarity: 'common',
    rank,
    description: 'Heavy hands, harder vows; endured strain grants richer tribute.',
    downsideDescription: 'Horizontal control grows heavy as DAS and ARR delays worsen.',
    getFlavorText: (r) => getFlavorTextForRank('lead_fingers', r),

    getMultiplier(ctx, r) {
        if (ctx.linesCleared === 0) return 0
        const values: Record<VexRank, number> = {
            1: 0.18, 2: 0.5, 3: 1.0, 4: 1.5, 5: 2.0, 6: 2.5, 7: 3.0, 8: 3.5, 9: 4.0, 10: 4.5,
        }
        return values[r]
    },

    onApply(_r) {
        // GameScene applies DAS/ARR penalties during input handling.
    },

    onRankChange(_oldRank, _newRank) {
        // GameScene reads current rank each frame.
    },
})

/**
 * Vex of Whiplash
 * Downside: manual hard-drops trigger a brief blackout pulse.
 * Reward:   line clears score more.
 */
export const createVexWhiplash = (rank: VexRank): Vex => ({
    id: 'whiplash',
    name: 'Vex of Whiplash',
    kind: 'line',
    rarity: 'common',
    rank,
    description: 'Violent descent feeds the rite and impact cuts deepen tribute.',
    downsideDescription: 'Manual hard drops trigger brief blackout lashes.',
    getFlavorText: (r) => getFlavorTextForRank('whiplash', r),

    getMultiplier(ctx, r) {
        if (ctx.linesCleared === 0) return 0
        const values: Record<VexRank, number> = {
            1: 0.2, 2: 0.54, 3: 1.08, 4: 1.62, 5: 2.16, 6: 2.7, 7: 3.24, 8: 3.78, 9: 4.32, 10: 4.86,
        }
        return values[r]
    },

    onApply(_r) {
        // GameScene triggers and controls whiplash pulses per hard-drop.
    },

    onRankChange(_oldRank, _newRank) {
        // GameScene reads rank for pulse duration.
    },
})

/**
 * Vex of Tremor
 * Downside: periodic tremors shake board readability.
 * Reward:   colour clusters score more.
 */
export const createVexTremor = (rank: VexRank): Vex => ({
    id: 'tremor',
    name: 'Vex of Tremor',
    kind: 'color',
    rarity: 'rare',
    rank,
    description: 'When the altar shudders, steady offerings burn deeper tribute.',
    downsideDescription: 'Periodic tremors shake the altar and your camera view.',
    getFlavorText: (r) => getFlavorTextForRank('tremor', r),

    getMultiplier(ctx, r) {
        if (ctx.totalClusterPoints === 0) return 0
        const values: Record<VexRank, number> = {
            1: 0.18, 2: 0.5, 3: 1.0, 4: 1.5, 5: 2.0, 6: 2.5, 7: 3.0, 8: 3.5, 9: 4.0, 10: 4.5,
        }
        return values[r]
    },

    onApply(_r) {
        // GameScene enables tremor scheduling.
    },

    onRankChange(_oldRank, _newRank) {
        // GameScene updates tremor scheduling.
    },
})

/**
 * Vex of Mirage
 * Downside: ghost piece periodically lies about landing columns.
 * Reward:   colour clusters score more.
 */
export const createVexMirage = (rank: VexRank): Vex => ({
    id: 'mirage',
    name: 'Vex of Mirage',
    kind: 'color',
    rarity: 'mythic',
    rank,
    description: 'False visions test conviction; true offerings yield richer tribute.',
    downsideDescription: 'The ghost omen periodically lies about landing columns.',
    getFlavorText: (r) => getFlavorTextForRank('mirage', r),

    getMultiplier(ctx, r) {
        if (ctx.totalClusterPoints === 0) return 0
        const values: Record<VexRank, number> = {
            1: 0.28, 2: 0.68, 3: 1.24, 4: 1.82, 5: 2.4, 6: 2.98, 7: 3.56, 8: 4.14, 9: 4.72, 10: 5.3,
        }
        return values[r]
    },

    onApply(_r) {
        // GameScene enables mirage timing and fake ghost offsets.
    },

    onRankChange(_oldRank, _newRank) {
        // GameScene updates mirage cadence from rank.
    },
})

/**
 * Vex of Jinxed
 * Downside: pieces spawn with increasingly chaotic rotation/colour/position.
 * Reward:   line clears score more.
 */
export const createVexJinxed = (rank: VexRank): Vex => ({
    id: 'jinxed',
    name: 'Vex of Jinxed',
    kind: 'line',
    rarity: 'rare',
    rank,
    description: 'Court disorder and survive it; chaotic cuts grant deeper tribute.',
    downsideDescription: 'Spawns gain random rotation and colour, then column jitter at high rank.',
    getFlavorText: (r) => getFlavorTextForRank('jinxed', r),

    getMultiplier(ctx, r) {
        if (ctx.linesCleared === 0) return 0
        const values: Record<VexRank, number> = {
            1: 0.28, 2: 0.66, 3: 1.2, 4: 1.8, 5: 2.4, 6: 3.0, 7: 3.6, 8: 4.2, 9: 4.8, 10: 5.4,
        }
        return values[r]
    },

    onApply(_r) {
        // GameScene mutates spawned pieces according to rank.
    },

    onRankChange(_oldRank, _newRank) {
        // GameScene reads rank each spawn.
    },
})

/**
 * Vex of Pressure
 * Downside: spawned pieces auto hard-drop when their timer expires.
 * Reward:   colour clusters score more.
 */
export const createVexPressure = (rank: VexRank): Vex => ({
    id: 'pressure',
    name: 'Vex of Pressure',
    kind: 'color',
    rarity: 'common',
    rank,
    description: 'Race the bell and hold form; timed offerings deepen tribute.',
    downsideDescription: 'Each piece carries a drop timer and hard-drops on expiry.',
    getFlavorText: (r) => getFlavorTextForRank('pressure', r),

    getMultiplier(ctx, r) {
        if (ctx.totalClusterPoints === 0) return 0
        const values: Record<VexRank, number> = {
            1: 0.24, 2: 0.6, 3: 1.12, 4: 1.68, 5: 2.24, 6: 2.8, 7: 3.36, 8: 3.92, 9: 4.48, 10: 5.04,
        }
        return values[r]
    },

    onApply(_r) {
        // GameScene manages per-piece countdown state.
    },

    onRankChange(_oldRank, _newRank) {
        // GameScene resets/updates countdown limits from rank.
    },
})

// ---------------------------------------------------------------------------
// Vex Synergies
// ---------------------------------------------------------------------------

/**
 * Synergy definitions: when specific Vex combinations are active,
 * they provide additional multiplier bonuses and unique effects.
 */
export type VexSynergy = {
    /** Unique ID for this synergy */
    id: string
    /** Display name */
    name: string
    /** Required Vex IDs (all must be active) */
    requiredVexes: VexId[]
    /** Minimum total rank across all required vexes to activate */
    minTotalRank: number
    /** Additional multiplier bonus (additive to the appropriate bucket) */
    bonusMultiplier: number
    /** Which bucket this synergy affects */
    kind: VexKind
    /** Flavor text for the synergy */
    flavorText: string
    /** Optional: special effect callback (called when synergy activates) */
    onActivate?: () => void
}

/**
 * All defined Vex synergies. These are checked automatically during scoring.
 */
export const VEX_SYNERGIES: VexSynergy[] = [
    {
        id: 'blind_faith',
        name: 'Blind Faith',
        requiredVexes: ['blackout', 'fog'],
        minTotalRank: 10,
        bonusMultiplier: 0.5,
        kind: 'color',
        flavorText: 'When sight fails, the void speaks. The altar sees through your blindness.',
    },
    {
        id: 'sinking_world',
        name: 'Sinking World',
        requiredVexes: ['quicksand', 'rising_dread'],
        minTotalRank: 12,
        bonusMultiplier: 0.6,
        kind: 'line',
        flavorText: 'The floor descends as the ceiling falls. There is no ground, only the descent.',
    },
    {
        id: 'shattered_mind',
        name: 'Shattered Mind',
        requiredVexes: ['amnesia', 'corruption'],
        minTotalRank: 10,
        bonusMultiplier: 0.55,
        kind: 'color',
        flavorText: 'Memory rots. Color bleeds. The ritual continues without the augur.',
    },
    {
        id: 'iron_blind',
        name: 'Iron Blind',
        requiredVexes: ['lead_fingers', 'blackout'],
        minTotalRank: 10,
        bonusMultiplier: 0.45,
        kind: 'line',
        flavorText: 'Heavy hands serve a blind master. The altar accepts trembling offerings.',
    },
    {
        id: 'false_vision',
        name: 'False Vision',
        requiredVexes: ['mirage', 'fog'],
        minTotalRank: 12,
        bonusMultiplier: 0.5,
        kind: 'color',
        flavorText: 'Mist shows what cannot be. The void laughs at your certainty.',
    },
    {
        id: 'chaos_descent',
        name: 'Chaos Descent',
        requiredVexes: ['jinxed', 'whiplash'],
        minTotalRank: 10,
        bonusMultiplier: 0.5,
        kind: 'line',
        flavorText: 'Broken offerings strike the altar. Chaos bleeds into order.',
    },
    {
        id: 'trembling_void',
        name: 'Trembling Void',
        requiredVexes: ['tremor', 'blackout'],
        minTotalRank: 12,
        bonusMultiplier: 0.45,
        kind: 'color',
        flavorText: 'The earth shakes in darkness. Something wakes beneath the altar.',
    },
    {
        id: 'pressure_cooker',
        name: 'Pressure Cooker',
        requiredVexes: ['pressure', 'quicksand'],
        minTotalRank: 10,
        bonusMultiplier: 0.5,
        kind: 'color',
        flavorText: 'Time crushes downward. The ritual accelerates toward its end.',
    },
    {
        id: 'forgotten_rising',
        name: 'Forgotten Rising',
        requiredVexes: ['amnesia', 'rising_dread'],
        minTotalRank: 12,
        bonusMultiplier: 0.55,
        kind: 'line',
        flavorText: 'What you forget, they remember. The dead keep your name.',
    },
    {
        id: 'corrupted_mirror',
        name: 'Corrupted Mirror',
        requiredVexes: ['corruption', 'mirage'],
        minTotalRank: 14,
        bonusMultiplier: 0.7,
        kind: 'color',
        flavorText: 'Reflections rot. The glass shows what you are becoming.',
    },
]

/**
 * Calculates all active synergies given the current Vex roster.
 * Returns an array of active synergy bonuses.
 */
export function getActiveSynergies(activeVexes: Vex[]): { synergy: VexSynergy; totalRank: number }[] {
    const activeSynergies: { synergy: VexSynergy; totalRank: number }[] = []
    const vexMap = new Map(activeVexes.map(v => [v.id, v]))

    for (const synergy of VEX_SYNERGIES) {
        // Check if all required vexes are present
        const requiredVexes = synergy.requiredVexes.map(id => vexMap.get(id)).filter((v): v is Vex => v !== undefined)
        if (requiredVexes.length !== synergy.requiredVexes.length) continue

        // Calculate total rank across all required vexes
        const totalRank = requiredVexes.reduce((sum, v) => sum + v.rank, 0)
        if (totalRank < synergy.minTotalRank) continue

        // Synergy is active!
        activeSynergies.push({ synergy, totalRank })
    }

    return activeSynergies
}

/**
 * Calculates the total synergy bonus multiplier for a given kind.
 */
export function getSynergyMultiplier(activeVexes: Vex[], kind: VexKind): number {
    const synergies = getActiveSynergies(activeVexes)
    return synergies
        .filter(({ synergy }) => synergy.kind === kind)
        .reduce((sum, { synergy }) => sum + synergy.bonusMultiplier, 0)
}

/**
 * Gets a formatted string describing active synergies for UI display.
 */
export function getSynergyDisplayText(activeVexes: Vex[]): string[] {
    const synergies = getActiveSynergies(activeVexes)
    if (synergies.length === 0) return []

    return synergies.map(({ synergy }) => ({
        name: synergy.name,
        text: `${synergy.name} (+${Math.round(synergy.bonusMultiplier * 100)}% ${synergy.kind.toUpperCase()})`,
        flavor: synergy.flavorText,
    })).sort((a, b) => b.name.localeCompare(a.name)).map(s => s.text)
}

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
    lead_fingers: createVexLeadFingers,
    whiplash: createVexWhiplash,
    tremor: createVexTremor,
    mirage: createVexMirage,
    jinxed: createVexJinxed,
    pressure: createVexPressure,
} as const

export type VexId = keyof typeof STARTER_VEX_FACTORIES


