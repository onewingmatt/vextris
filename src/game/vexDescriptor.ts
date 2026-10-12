// vexDescriptor.ts — pure data descriptors for all Vexes.
// This file extracts the behavioral specification from vex.ts into a
// declarative, data-driven format. All logic (timers, effects, scoring)
// reads from this descriptor; zero behavior lives in switch statements.
//
// Design goals:
//   - One source of truth for every Vex parameter (rank curves, timers, drains)
//   - Trivial to add a new Vex: add one object to the DESCRIPTORS map
//   - GameScene, scoring, and effect modules consume via getVexDescriptor(id)
//   - Zero runtime cost after build (descriptors are const objects)
//
// Fields mirror the existing vex.ts factories but are split into:
//   - identity: id, name, kind, rarity, description, downsideDescription
//   - ranking: getFlavorText (tier-based), rank helpers (DASBonus, etc.)
//   - scoring: getMultiplier (rank curve)
//   - behavior: onApply/onRankChange parameter bundles (intervalMs, scale, etc.)
//   - synergies: live in VEX_SYNERGIES (unchanged)
//
// Note: onApply/onRankChange remain as callbacks in GameScene because they
//       touch imperative timers/effects; the descriptor supplies the *rank-
//       dependent parameters* those callbacks consume.

import type { VexRank } from './vex'

/** The pure-data shape of a Vex's behavior. */
export interface VexDescriptor {
  /** Unique identifier (matches STARTER_VEX_FACTORIES key). */
  id: string
  /** Display name. */
  name: string
  /** 'color' or 'line' — which scoring bucket this Vex feeds. */
  kind: 'color' | 'line'
  /** Rarity for shop weighting. */
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic'
  /** Flavor text for card UI (warning/manifestation/consumption tiers). */
  flavorText: {
    warning: string
    manifestation: string
    consumption: string
  }
  /** Tooltip shown in shop / pause menu. */
  description: string
  /** Downside shown when active (always-on penalty). */
  downsideDescription: string

  /* --- Scoring --- */
  /** Returns the additive multiplier this Vex contributes at the given rank. */
  getMultiplier: (rank: VexRank) => number

  /* --- Rank-scaled behavior parameters --- */
  /** Lead Fingers: extra frames added to DAS window (higher = more lenient). */
  getDasBonusFrames: (rank: VexRank) => number
  /** Lead Fingers: extra frames added to ARR gap (higher = more lenient). */
  getArrBonusFrames: (rank: VexRank) => number
  /** Whiplash: blackout pulse duration in ms when triggered. */
  getWhiplashMs: (rank: VexRank) => number
  /** Mirage: how many columns the ghost can lie (±). */
  getMirageColRange: (rank: VexRank) => number
  /** Mirage: ON/OFF timing in ms for the ghostLie effect. */
  getMirageOnMs: (rank: VexRank) => number
  getMirageOffMs: (rank: VexRank) => number
  /** Jinxed: chance to rotate on spawn (0..1). */
  getJinxedRotateChance: (rank: VexRank) => number
  /** Jinxed: always rotate? (boolean). */
  getJinxedAlwaysRotate: (rank: VexRank) => boolean
  /** Jinxed: scramble colors on spawn? (boolean). */
  getJinxedColorScramble: (rank: VexRank) => boolean
  /** Jinxed: column jitter in blocks (0, 1, 2, or 3). */
  getJinxedColumnJitter: (rank: VexRank) => number
  /** Pressure: hard-drop timeout in seconds. */
  getPressureTimeoutSec: (rank: VexRank) => number
  /** Rising Dread: milliseconds between row pushes. */
  getRisingDreadIntervalMs: (rank: VexRank) => number
  /** Rising Dread: how many gaps per garbage row (0..BOARD_WIDTH). */
  getRisingDreadGapsPerRow: (rank: VexRank) => number
  /** Tremor: effect duration in ms. */
  getTremorDurationMs: (rank: VexRank) => number
  /** Tremor: how many pixels the board shakes. */
  getTremorShakePx: (rank: VexRank) => number
  /** Fog: how many rows are hidden from the bottom. */
  getFogRows: (rank: VexRank) => number
  /** Fog: creep speed in rows per second (0 = no creep). */
  getFogCreepRowsPerSec: (rank: VexRank) => number
  /** Blackout: flash duration in ms. */
  getBlackoutFlashMs: (rank: VexRank) => number
  /** Blackout: hold duration at peak opacity in ms. */
  getBlackoutHoldMs: (rank: VexRank) => number
  /** Blackout: fade duration in ms. */
  getBlackoutFadeMs: (rank: VexRank) => number
  /** Corruption: how often to attempt a color corruption (per placed block, 0..1). */
  getCorruptionChancePerBlock: (rank: VexRank) => number
  /** Quicksand: gravity scale multiplier (lower = faster gravity). */
  getQuicksandGravityScale: (rank: VexRank) => number
  /** Amnesia: level-based scale factor (applied on top of rank multiplier). */
  getAmnesiaLevelScale: (rank: VexRank) => number
}

/** All Vex descriptors — the single source of truth for Vex behavior. */
export const VEX_DESCRIPTORS: Record<string, VexDescriptor> = {
  blackout: {
    id: 'blackout',
    name: 'Vex of Blackout',
    kind: 'color',
    rarity: 'common',
    description: 'Blind the chamber and your offerings burn richer tribute.',
    downsideDescription: 'Dark pulses repeatedly swallow the altar view.',
    flavorText: {
      warning: 'The Lantern Sisters taught this pact in cellars of blind stone. They said the altar listens best when the last candle dies.',
      manifestation: 'The candles drown one by one, though no wind walks here. The altar drinks the dark and asks for deeper tribute.',
      consumption: 'Extinguish the final flame. Let the void read your pulse.',
    },
    getMultiplier: (rank) => {
      const values: Record<VexRank, number> = {
        1: 0.2, 2: 0.5, 3: 1.0, 4: 1.5, 5: 2.0, 6: 2.5, 7: 3.0, 8: 3.5, 9: 4.0, 10: 4.5
      }
      return values[rank]
    },
    // --- behavior parameters ---
    getDasBonusFrames: () => 0, // blackout does not affect DAS/ARR
    getArrBonusFrames: () => 0,
    getWhiplashMs: () => 0,
    getMirageColRange: () => 0,
    getMirageOnMs: () => 0,
    getMirageOffMs: () => 0,
    getJinxedRotateChance: () => 0,
    getJinxedAlwaysRotate: () => false,
    getJinxedColorScramble: () => false,
    getJinxedColumnJitter: () => 0,
    getPressureTimeoutSec: () => 0,
    getRisingDreadIntervalMs: () => 0,
    getRisingDreadGapsPerRow: () => 0,
    getTremorDurationMs: () => 0,
    getTremorShakePx: () => 0,
    getFogRows: () => 0,
    getFogCreepRowsPerSec: () => 0,
    getBlackoutFlashMs: (rank) => {
      // flash duration increases slightly with rank
      const base = [150, 200, 250, 300, 350, 400, 450, 500, 550, 600]
      return base[rank - 1]
    },
    getBlackoutHoldMs: (rank) => {
      // hold duration increases with rank
      const base = [1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600, 3900]
      return base[rank - 1]
    },
    getBlackoutFadeMs: (rank) => {
      // fade duration increases with rank
      const base = [150, 200, 250, 300, 350, 400, 450, 500, 550, 600]
      return base[rank - 1]
    },
    getCorruptionChancePerBlock: () => 0,
    getQuicksandGravityScale: () => 1,
    getAmnesiaLevelScale: () => 1,
  },

  fog: {
    id: 'fog',
    name: 'Vex of Fog',
    kind: 'color',
    rarity: 'common',
    description: 'Let the mist climb and buried offerings feed deeper tribute.',
    downsideDescription: 'Rising fog veils the lower altar steps.',
    flavorText: {
      warning: 'Marsh-priests of the Sallow Fen carved this sigil in drowned bone. They warned that low places remember every failed ritual.',
      manifestation: 'Cold mist crawls over the altar steps and clings to your throat. Runes vanish beneath it, whispering from below.',
      consumption: 'Do not look down. The fog is looking up.',
    },
    getMultiplier: (rank) => {
      const values: Record<VexRank, number> = {
        1: 0.3, 2: 0.6, 3: 1.2, 4: 1.8, 5: 2.4, 6: 3.0, 7: 3.6, 8: 4.2, 9: 4.8, 10: 5.4
      }
      return values[rank]
    },
    // --- behavior parameters ---
    getDasBonusFrames: () => 0,
    getArrBonusFrames: () => 0,
    getWhiplashMs: () => 0,
    getMirageColRange: () => 0,
    getMirageOnMs: () => 0,
    getMirageOffMs: () => 0,
    getJinxedRotateChance: () => 0,
    getJinxedAlwaysRotate: () => false,
    getJinxedColorScramble: () => false,
    getJinxedColumnJitter: () => 0,
    getPressureTimeoutSec: () => 0,
    getRisingDreadIntervalMs: () => 0,
    getRisingDreadGapsPerRow: () => 0,
    getTremorDurationMs: () => 0,
    getTremorShakePx: () => 0,
    getFogRows: (rank) => {
      // fog hides more rows as rank increases
      const base = [1, 2, 2, 3, 3, 4, 4, 5, 5, 6]
      return base[rank - 1]
    },
    getFogCreepRowsPerSec: (rank) => {
      // creep starts at rank 3, increases with rank
      if (rank < 3) return 0
      const base = [0, 0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]
      return base[rank - 1]
    },
    getBlackoutFlashMs: () => 0,
    getBlackoutHoldMs: () => 0,
    getBlackoutFadeMs: () => 0,
    getCorruptionChancePerBlock: () => 0,
    getQuicksandGravityScale: () => 1,
    getAmnesiaLevelScale: () => 1,
  },

  corruption: {
    id: 'corruption',
    name: 'Vex of Corruption',
    kind: 'color',
    rarity: 'mythic',
    description: 'Rot the pigments and corrupted patterns yield richer tribute.',
    downsideDescription: 'Placed runes mutate over time, undoing stable formations.',
    flavorText: {
      warning: 'The Rot-Coven mixed seven inks with gravewater and named it mercy. Any rune marked with it forgets its first oath.',
      manifestation: 'Pigment bleeds across the altar like living mold. Neighboring runes trade names while you watch.',
      consumption: 'Nothing keeps its color. Nothing keeps its name.',
    },
    getMultiplier: (rank) => {
      const values: Record<VexRank, number> = {
        1: 0.35, 2: 0.8, 3: 1.45, 4: 2.1, 5: 2.75, 6: 3.4, 7: 4.05, 8: 4.7, 9: 5.35, 10: 6.0
      }
      return values[rank]
    },
    // --- behavior parameters ---
    getDasBonusFrames: () => 0,
    getArrBonusFrames: () => 0,
    getWhiplashMs: () => 0,
    getMirageColRange: () => 0,
    getMirageOnMs: () => 0,
    getMirageOffMs: () => 0,
    getJinxedRotateChance: () => 0,
    getJinxedAlwaysRotate: () => false,
    getJinxedColorScramble: () => false,
    getJinxedColumnJitter: () => 0,
    getPressureTimeoutSec: () => 0,
    getRisingDreadIntervalMs: () => 0,
    getRisingDreadGapsPerRow: () => 0,
    getTremorDurationMs: () => 0,
    getTremorShakePx: () => 0,
    getFogRows: () => 0,
    getFogCreepRowsPerSec: () => 0,
    getBlackoutFlashMs: () => 0,
    getBlackoutHoldMs: () => 0,
    getBlackoutFadeMs: () => 0,
    getCorruptionChancePerBlock: (rank) => {
      // chance per block increases with rank
      const base = [0.02, 0.04, 0.07, 0.10, 0.13, 0.16, 0.20, 0.24, 0.28, 0.32]
      return base[rank - 1]
    },
    getQuicksandGravityScale: () => 1,
    getAmnesiaLevelScale: () => 1,
  },

  quicksand: {
    id: 'quicksand',
    name: 'Vex of Quicksand',
    kind: 'line',
    rarity: 'uncommon',
    description: 'Embrace the sinking pace and each cut drives harsher tribute.',
    downsideDescription: 'Gravity quickens and runes fall with little mercy.',
    flavorText: {
      warning: 'Pilgrims of the Sinking Choir swore this pact in dry wells. They learned the altar has a hunger for haste.',
      manifestation: 'The stone beneath the ritual turns to starving sand. Every rune sinks before your hands can bless it.',
      consumption: 'Stop fighting the pull. Descend with the offering.',
    },
    getMultiplier: (rank) => {
      const values: Record<VexRank, number> = {
        1: 0.04, 2: 0.07, 3: 0.10, 4: 0.13, 5: 0.17, 6: 0.21, 7: 0.26, 8: 0.32, 9: 0.40, 10: 0.50
      }
      return values[rank]
    },
    // --- behavior parameters ---
    getDasBonusFrames: () => 0,
    getArrBonusFrames: () => 0,
    getWhiplashMs: () => 0,
    getMirageColRange: () => 0,
    getMirageOnMs: () => 0,
    getMirageOffMs: () => 0,
    getJinxedRotateChance: () => 0,
    getJinxedAlwaysRotate: () => false,
    getJinxedColorScramble: () => false,
    getJinxedColumnJitter: () => 0,
    getPressureTimeoutSec: () => 0,
    getRisingDreadIntervalMs: () => 0,
    getRisingDreadGapsPerRow: () => 0,
    getTremorDurationMs: () => 0,
    getTremorShakePx: () => 0,
    getFogRows: () => 0,
    getFogCreepRowsPerSec: () => 0,
    getBlackoutFlashMs: () => 0,
    getBlackoutHoldMs: () => 0,
    getBlackoutFadeMs: () => 0,
    getCorruptionChancePerBlock: () => 0,
    getQuicksandGravityScale: (rank) => {
      // lower scale = faster gravity
      const values: Record<VexRank, number> = {
        1: 0.9, 2: 0.86, 3: 0.82, 4: 0.78, 5: 0.74, 6: 0.7, 7: 0.66, 8: 0.62, 9: 0.58, 10: 0.54
      }
      return values[rank]
    },
    getAmnesiaLevelScale: () => 1,
  },

  amnesia: {
    id: 'amnesia',
    name: 'Vex of Amnesia',
    kind: 'line',
    rarity: 'uncommon',
    description: 'Forget certainty and desperate cuts carve greater tribute.',
    downsideDescription: 'Future omens fade from sight; memory tools are stripped away.',
    flavorText: {
      warning: 'The Mneme-Eaters erased whole covens and left only blank tablets. Their pact strips memory from every rite.',
      manifestation: 'The next omen will not come when called. Your own hands move as if they belong to a dead augur.',
      consumption: 'Forget the pattern. Obey the void.',
    },
    getMultiplier: (rank) => {
      const values: Record<VexRank, number> = {
        1: 0.3, 2: 0.7, 3: 1.3, 4: 1.95, 5: 2.6, 6: 3.25, 7: 3.9, 8: 4.55, 9: 5.2, 10: 5.85
      }
      const levelScale = 0.65 + Math.max(0, Math.min(1, (rank - 1) / 9)) * 0.35
      return values[rank] * levelScale
    },
    // --- behavior parameters ---
    getDasBonusFrames: () => 0,
    getArrBonusFrames: () => 0,
    getWhiplashMs: () => 0,
    getMirageColRange: () => 0,
    getMirageOnMs: () => 0,
    getMirageOffMs: () => 0,
    getJinxedRotateChance: () => 0,
    getJinxedAlwaysRotate: () => false,
    getJinxedColorScramble: () => false,
    getJinxedColumnJitter: () => 0,
    getPressureTimeoutSec: () => 0,
    getRisingDreadIntervalMs: () => 0,
    getRisingDreadGapsPerRow: () => 0,
    getTremorDurationMs: () => 0,
    getTremorShakePx: () => 0,
    getFogRows: () => 0,
    getFogCreepRowsPerSec: () => 0,
    getBlackoutFlashMs: () => 0,
    getBlackoutHoldMs: () => 0,
    getBlackoutFadeMs: () => 0,
    getCorruptionChancePerBlock: () => 0,
    getQuicksandGravityScale: () => 1,
    getAmnesiaLevelScale: (rank) => {
      // level scale applies on top of the multiplier; higher rank = stronger effect
      const base = [0.65, 0.70, 0.75, 0.80, 0.85, 0.90, 0.95, 1.00, 1.05, 1.10]
      return base[rank - 1]
    },
  },

  rising_dread: {
    id: 'rising_dread',
    name: 'Vex of Rising Dread',
    kind: 'line',
    rarity: 'uncommon',
    description: 'When the buried stir, each surviving cut earns harsher tribute.',
    downsideDescription: 'Old offerings rise from below in hostile rows.',
    flavorText: {
      warning: 'The first altar was raised over a pit of unfinished rites. The buried augurs still press their knuckles against the stone.',
      manifestation: 'The floor bucks upward in wet, deliberate breaths. New rows of old offerings force themselves into your ritual.',
      consumption: 'Make room below you. They are rising through your seat.',
    },
    getMultiplier: (rank) => {
      const values: Record<VexRank, number> = {
        1: 0.2, 2: 0.6, 3: 1.2, 4: 1.8, 5: 2.4, 6: 3.0, 7: 3.6, 8: 4.2, 9: 4.8, 10: 5.4
      }
      return values[rank]
    },
    // --- behavior parameters ---
    getDasBonusFrames: () => 0,
    getArrBonusFrames: () => 0,
    getWhiplashMs: () => 0,
    getMirageColRange: () => 0,
    getMirageOnMs: () => 0,
    getMirageOffMs: () => 0,
    getJinxedRotateChance: () => 0,
    getJinxedAlwaysRotate: () => false,
    getJinxedColorScramble: () => false,
    getJinxedColumnJitter: () => 0,
    getPressureTimeoutSec: () => 0,
    getRisingDreadIntervalMs: (rank) => {
      // interval decreases with rank (faster garbage)
      const base = [4000, 3500, 3000, 2500, 2000, 1800, 1600, 1400, 1200, 1000]
      return base[rank - 1]
    },
    getRisingDreadGapsPerRow: (rank) => {
      // fewer gaps = more dangerous rows
      const base = [6, 5, 5, 4, 4, 3, 3, 2, 2, 1]
      return base[rank - 1]
    },
    getTremorDurationMs: () => 0,
    getTremorShakePx: () => 0,
    getFogRows: () => 0,
    getFogCreepRowsPerSec: () => 0,
    getBlackoutFlashMs: () => 0,
    getBlackoutHoldMs: () => 0,
    getBlackoutFadeMs: () => 0,
    getCorruptionChancePerBlock: () => 0,
    getQuicksandGravityScale: () => 1,
    getAmnesiaLevelScale: () => 1,
  },

  lead_fingers: {
    id: 'lead_fingers',
    name: 'Vex of Lead Fingers',
    kind: 'line',
    rarity: 'common',
    description: 'Heavy hands, harder vows; endured strain grants richer tribute.',
    downsideDescription: 'Horizontal control grows heavy as DAS and ARR delays worsen.',
    flavorText: {
      warning: 'The Iron Nuns wore prayer weights until their fingers split. They forged this pact to keep trembling augurs obedient.',
      manifestation: 'Your joints thicken like poured lead. Each command reaches the altar late, as if spoken underwater.',
      consumption: 'Your hands are not yours. The ritual moves them.',
    },
    getMultiplier: (rank) => {
      const values: Record<VexRank, number> = {
        1: 0.18, 2: 0.5, 3: 1.0, 4: 1.5, 5: 2.0, 6: 2.5, 7: 3.0, 8: 3.5, 9: 4.0, 10: 4.5
      }
      return values[rank]
    },
    // --- behavior parameters ---
    getDasBonusFrames: (rank) => {
      // DAS window increases with rank (more frames to initiate repeat)
      const base = [10, 14, 18, 22, 25, 29, 32, 35, 38, 40]
      return base[rank - 1]
    },
    getArrBonusFrames: (rank) => {
      // ARR gap increases with rank (more frames between repeats)
      const base = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      return base[rank - 1]
    },
    getWhiplashMs: () => 0,
    getMirageColRange: () => 0,
    getMirageOnMs: () => 0,
    getMirageOffMs: () => 0,
    getJinxedRotateChance: () => 0,
    getJinxedAlwaysRotate: () => false,
    getJinxedColorScramble: () => false,
    getJinxedColumnJitter: () => 0,
    getPressureTimeoutSec: () => 0,
    getRisingDreadIntervalMs: () => 0,
    getRisingDreadGapsPerRow: () => 0,
    getTremorDurationMs: () => 0,
    getTremorShakePx: () => 0,
    getFogRows: () => 0,
    getFogCreepRowsPerSec: () => 0,
    getBlackoutFlashMs: () => 0,
    getBlackoutHoldMs: () => 0,
    getBlackoutFadeMs: () => 0,
    getCorruptionChancePerBlock: () => 0,
    getQuicksandGravityScale: () => 1,
    getAmnesiaLevelScale: () => 1,
  },

  whiplash: {
    id: 'whiplash',
    name: 'Vex of Whiplash',
    kind: 'line',
    rarity: 'common',
    description: 'Violent descent feeds the rite and impact cuts deepen tribute.',
    downsideDescription: 'Manual hard drops trigger brief blackout lashes.',
    flavorText: {
      warning: 'Duelists of the Lash-Coven struck the altar to wake sleeping judges. Every impact bought tribute and took sight in return.',
      manifestation: 'Each violent descent cracks a black flare across your vision. The room blinks out, then returns closer.',
      consumption: 'Strike harder. Blink less. Do not miss the dark.',
    },
    getMultiplier: (rank) => {
      const values: Record<VexRank, number> = {
        1: 0.2, 2: 0.54, 3: 1.08, 4: 1.62, 5: 2.16, 6: 2.7, 7: 3.24, 8: 3.78, 9: 4.32, 10: 4.86
      }
      return values[rank]
    },
    // --- behavior parameters ---
    getDasBonusFrames: () => 0,
    getArrBonusFrames: () => 0,
    getWhiplashMs: (rank) => {
      // pulse duration increases with rank
      const base = [150, 210, 270, 330, 400, 480, 560, 640, 720, 800]
      return base[rank - 1]
    },
    getMirageColRange: () => 0,
    getMirageOnMs: () => 0,
    getMirageOffMs: () => 0,
    getJinxedRotateChance: () => 0,
    getJinxedAlwaysRotate: () => false,
    getJinxedColorScramble: () => false,
    getJinxedColumnJitter: () => 0,
    getPressureTimeoutSec: () => 0,
    getRisingDreadIntervalMs: () => 0,
    getRisingDreadGapsPerRow: () => 0,
    getTremorDurationMs: () => 0,
    getTremorShakePx: () => 0,
    getFogRows: () => 0,
    getFogCreepRowsPerSec: () => 0,
    getBlackoutFlashMs: () => 0,
    getBlackoutHoldMs: () => 0,
    getBlackoutFadeMs: () => 0,
    getCorruptionChancePerBlock: () => 0,
    getQuicksandGravityScale: () => 1,
    getAmnesiaLevelScale: () => 1,
  },

  tremor: {
    id: 'tremor',
    name: 'Vex of Tremor',
    kind: 'color',
    rarity: 'rare',
    description: 'When the altar shudders, steady offerings burn deeper tribute.',
    downsideDescription: 'Periodic tremors shake the altar and your camera view.',
    flavorText: {
      warning: 'Miners beneath Hollow Veyl heard this pact before they saw it. Their runes danced on untouched altars.',
      manifestation: 'The altar shivers between heartbeats and dust falls upward. Your teeth count the pulses for you.',
      consumption: 'The stone is awake. Match its trembling.',
    },
    getMultiplier: (rank) => {
      const values: Record<VexRank, number> = {
        1: 0.18, 2: 0.5, 3: 1.0, 4: 1.5, 5: 2.0, 6: 2.5, 7: 3.0, 8: 3.5, 9: 4.0, 10: 4.5
      }
      return values[rank]
    },
    // --- behavior parameters ---
    getDasBonusFrames: () => 0,
    getArrBonusFrames: () => 0,
    getWhiplashMs: () => 0,
    getMirageColRange: () => 0,
    getMirageOnMs: () => 0,
    getMirageOffMs: () => 0,
    getJinxedRotateChance: () => 0,
    getJinxedAlwaysRotate: () => false,
    getJinxedColorScramble: () => false,
    getJinxedColumnJitter: () => 0,
    getPressureTimeoutSec: () => 0,
    getRisingDreadIntervalMs: () => 0,
    getRisingDreadGapsPerRow: () => 0,
    getTremorDurationMs: (rank) => {
      // effect duration increases with rank
      const base = [300, 350, 400, 450, 500, 550, 600, 650, 700, 750]
      return base[rank - 1]
    },
    getTremorShakePx: (rank) => {
      // shake intensity increases with rank
      const base = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      return base[rank - 1]
    },
    getFogRows: () => 0,
    getFogCreepRowsPerSec: () => 0,
    getBlackoutFlashMs: () => 0,
    getBlackoutHoldMs: () => 0,
    getBlackoutFadeMs: () => 0,
    getCorruptionChancePerBlock: () => 0,
    getQuicksandGravityScale: () => 1,
    getAmnesiaLevelScale: () => 1,
  },

  mirage: {
    id: 'mirage',
    name: 'Vex of Mirage',
    kind: 'color',
    rarity: 'mythic',
    description: 'False visions test conviction; true offerings yield richer tribute.',
    downsideDescription: 'The ghost omen periodically lies about landing columns.',
    flavorText: {
      warning: 'Mirror-witches polished obsidian until it answered with false futures. Their pact shows where a rune could be, never where it will bleed.',
      manifestation: 'Pale doubles hover over the altar and point to wrong endings. You follow one and the other laughs.',
      consumption: 'Trust no reflection. The void prefers liars.',
    },
    getMultiplier: (rank) => {
      const values: Record<VexRank, number> = {
        1: 0.28, 2: 0.68, 3: 1.24, 4: 1.82, 5: 2.4, 6: 2.98, 7: 3.56, 8: 4.14, 9: 4.72, 10: 5.3
      }
      return values[rank]
    },
    // --- behavior parameters ---
    getDasBonusFrames: () => 0,
    getArrBonusFrames: () => 0,
    getWhiplashMs: () => 0,
    getMirageColRange: (rank) => {
      // ghost can lie about more columns at higher rank
      const base = [1, 1, 1, 2, 2, 2, 2, 3, 3, 3]
      return base[rank - 1]
    },
    getMirageOnMs: (rank) => {
      // ON duration increases with rank
      const base = [2000, 2200, 2400, 2600, 3000, 3400, 3800, 4200, 4600, 5000]
      return base[rank - 1]
    },
    getMirageOffMs: (rank) => {
      // OFF duration decreases with rank (more frequent lies)
      const base = [20000, 17000, 15000, 12500, 10000, 8500, 7000, 6000, 5500, 5000]
      return base[rank - 1]
    },
    getJinxedRotateChance: () => 0,
    getJinxedAlwaysRotate: () => false,
    getJinxedColorScramble: () => false,
    getJinxedColumnJitter: () => 0,
    getPressureTimeoutSec: () => 0,
    getRisingDreadIntervalMs: () => 0,
    getRisingDreadGapsPerRow: () => 0,
    getTremorDurationMs: () => 0,
    getTremorShakePx: () => 0,
    getFogRows: () => 0,
    getFogCreepRowsPerSec: () => 0,
    getBlackoutFlashMs: () => 0,
    getBlackoutHoldMs: () => 0,
    getBlackoutFadeMs: () => 0,
    getCorruptionChancePerBlock: () => 0,
    getQuicksandGravityScale: () => 1,
    getAmnesiaLevelScale: () => 1,
  },

  jinxed: {
    id: 'jinxed',
    name: 'Vex of Jinxed',
    kind: 'line',
    rarity: 'rare',
    description: 'Court disorder and survive it; chaotic cuts grant deeper tribute.',
    downsideDescription: 'Spawns gain random rotation and colour, then column jitter at high rank.',
    flavorText: {
      warning: 'Hex-smiths of the Crooked Star bound chance into a copper charm. It blesses no ritual; it only chooses.',
      manifestation: 'Runes arrive twisted, painted in borrowed blood, eager to break formation. The altar applauds every mistake.',
      consumption: 'Let chaos officiate. Offer without intention.',
    },
    getMultiplier: (rank) => {
      const values: Record<VexRank, number> = {
        1: 0.28, 2: 0.66, 3: 1.2, 4: 1.8, 5: 2.4, 6: 3.0, 7: 3.6, 8: 4.2, 9: 4.8, 10: 5.4
      }
      return values[rank]
    },
    // --- behavior parameters ---
    getDasBonusFrames: () => 0,
    getArrBonusFrames: () => 0,
    getWhiplashMs: () => 0,
    getMirageColRange: () => 0,
    getMirageOnMs: () => 0,
    getMirageOffMs: () => 0,
    getJinxedRotateChance: (rank) => {
      // rotate chance increases with rank
      const base = [0.4, 0.7, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]
      return base[rank - 1]
    },
    getJinxedAlwaysRotate: (rank) => {
      // always rotate starts at rank 3
      return rank >= 3
    },
    getJinxedColorScramble: (rank) => {
      // color scramble starts at rank 3
      return rank >= 3
    },
    getJinxedColumnJitter: (rank) => {
      // column jitter starts at rank 7
      return rank >= 7 ? 3 : 0
    },
    getPressureTimeoutSec: () => 0,
    getRisingDreadIntervalMs: () => 0,
    getRisingDreadGapsPerRow: () => 0,
    getTremorDurationMs: () => 0,
    getTremorShakePx: () => 0,
    getFogRows: () => 0,
    getFogCreepRowsPerSec: () => 0,
    getBlackoutFlashMs: () => 0,
    getBlackoutHoldMs: () => 0,
    getBlackoutFadeMs: () => 0,
    getCorruptionChancePerBlock: () => 0,
    getQuicksandGravityScale: () => 1,
    getAmnesiaLevelScale: () => 1,
  },

  pressure: {
    id: 'pressure',
    name: 'Vex of Pressure',
    kind: 'color',
    rarity: 'common',
    description: 'Race the bell and hold form; timed offerings deepen tribute.',
    downsideDescription: 'Each piece carries a drop timer and hard-drops on expiry.',
    flavorText: {
      warning: 'The Bell of Vhar was cast to end rituals before dawn. Its pact counts every breath as debt.',
      manifestation: 'An unseen toll follows each rune across the altar. When the count ends, the offering is taken from your hands.',
      consumption: 'Hear the final bell. Surrender before it strikes.',
    },
    getMultiplier: (rank) => {
      const values: Record<VexRank, number> = {
        1: 0.24, 2: 0.6, 3: 1.12, 4: 1.68, 5: 2.24, 6: 2.8, 7: 3.36, 8: 3.92, 9: 4.48, 10: 5.04
      }
      return values[rank]
    },
    // --- behavior parameters ---
    getDasBonusFrames: () => 0,
    getArrBonusFrames: () => 0,
    getWhiplashMs: () => 0,
    getMirageColRange: () => 0,
    getMirageOnMs: () => 0,
    getMirageOffMs: () => 0,
    getJinxedRotateChance: () => 0,
    getJinxedAlwaysRotate: () => false,
    getJinxedColorScramble: (rank) => rank >= 3,
    getJinxedColumnJitter: () => 0,
    getPressureTimeoutSec: (rank) => {
      // timeout decreases with rank (faster hard-drop)
      const base = [8, 7.25, 6.5, 5.75, 5, 4.5, 4, 3.6, 3.3, 3]
      return base[rank - 1]
    },
    getRisingDreadIntervalMs: () => 0,
    getRisingDreadGapsPerRow: () => 0,
    getTremorDurationMs: () => 0,
    getTremorShakePx: () => 0,
    getFogRows: () => 0,
    getFogCreepRowsPerSec: () => 0,
    getBlackoutFlashMs: () => 0,
    getBlackoutHoldMs: () => 0,
    getBlackoutFadeMs: () => 0,
    getCorruptionChancePerBlock: () => 0,
    getQuicksandGravityScale: () => 1,
    getAmnesiaLevelScale: () => 1,
  },
}

/** Helper: get the descriptor for a Vex id (throws if unknown). */
export function getVexDescriptor(id: string): VexDescriptor {
  const desc = VEX_DESCRIPTORS[id]
  if (!desc) throw new Error(`Unknown Vex id: ${id}`)
  return desc
}

/** Helper: get all active descriptors given a vex roster. */
export function getActiveVexDescriptors(activeVexes: { id: string; rank: VexRank }[]): VexDescriptor[] {
  return activeVexes.map(v => getVexDescriptor(v.id))
}