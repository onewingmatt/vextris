/**
 * effects/blackout.ts — Vex of Blackout visual curse.
 *
 * Creates and manages a single <div id="blackout-overlay"> inside the game
 * container (#game). The overlay fades in and out on a rank-dependent cycle
 * using CSS transitions for smooth animation (no harsh strobing).
 *
 * Public API:
 *   enableBlackout(rank)   — start / update the blackout cycle
 *   disableBlackout()      — stop timers and hide the overlay
 *
 * Safe to call enableBlackout multiple times (idempotent — clears the previous
 * cycle before starting a new one).
 *
 * Timer strategy: plain window.setTimeout (not Phaser timers) so the effect
 * runs even while the game loop is paused (e.g. during the shop).
 */

import { audioManager } from '../audio'

// ---------------------------------------------------------------------------
// Rank configuration
// ---------------------------------------------------------------------------

type BlackoutConfig = {
    /** Overlay opacity at peak darkness (0–1). */
    peakOpacity: number
    /** Brief lightning-like flash opacity shown before the blackout begins. */
    flashOpacity: number
    /** Flash duration in ms. */
    flashMs: number
    /** Small gap between the flash and the blackout fade-in. */
    flashGapMs: number
    /** How long the screen stays dark, in ms. */
    holdMs: number
    /** Time between the END of one blackout and the START of the next, in ms. */
    intervalMs: number
    /** Duration of the fade-in and fade-out transitions, in ms. */
    fadeMs: number
}

type BlackoutRank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

/** Per-rank parameters matching vision.md spec. */
const RANK_CONFIG: Record<BlackoutRank, BlackoutConfig> = {
    1: { peakOpacity: 0.42, flashOpacity: 0.08, flashMs: 50, flashGapMs: 35, holdMs: 420, intervalMs: 15_000, fadeMs: 220 },
    2: { peakOpacity: 0.50, flashOpacity: 0.09, flashMs: 52, flashGapMs: 36, holdMs: 500, intervalMs: 13_000, fadeMs: 210 },
    3: { peakOpacity: 0.58, flashOpacity: 0.10, flashMs: 54, flashGapMs: 38, holdMs: 560, intervalMs: 11_000, fadeMs: 200 },
    4: { peakOpacity: 0.66, flashOpacity: 0.12, flashMs: 56, flashGapMs: 40, holdMs: 620, intervalMs: 9_300, fadeMs: 190 },
    5: { peakOpacity: 0.74, flashOpacity: 0.13, flashMs: 58, flashGapMs: 42, holdMs: 700, intervalMs: 7_800, fadeMs: 180 },
    6: { peakOpacity: 0.82, flashOpacity: 0.15, flashMs: 60, flashGapMs: 44, holdMs: 760, intervalMs: 6_500, fadeMs: 170 },
    7: { peakOpacity: 0.90, flashOpacity: 0.16, flashMs: 62, flashGapMs: 48, holdMs: 840, intervalMs: 5_200, fadeMs: 160 },
    8: { peakOpacity: 0.96, flashOpacity: 0.18, flashMs: 64, flashGapMs: 52, holdMs: 920, intervalMs: 4_000, fadeMs: 150 },
    9: { peakOpacity: 1.00, flashOpacity: 0.20, flashMs: 68, flashGapMs: 56, holdMs: 1_050, intervalMs: 3_000, fadeMs: 138 },
    10: { peakOpacity: 1.00, flashOpacity: 0.23, flashMs: 72, flashGapMs: 60, holdMs: 1_250, intervalMs: 2_200, fadeMs: 124 },
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

const OVERLAY_ID = 'blackout-overlay'
const GAME_CONTAINER_ID = 'game'

/**
 * Returns the overlay element, creating it the first time.
 * Injects the required CSS once into <head>.
 */
function getOrCreateOverlay(): HTMLElement {
    let el = document.getElementById(OVERLAY_ID)
    if (!el) {
        injectCSS()
        el = document.createElement('div')
        el.id = OVERLAY_ID
        const container = document.getElementById(GAME_CONTAINER_ID)
        if (!container) {
            console.warn('[Blackout] #game container not found – overlay not inserted.')
            return el
        }
        container.appendChild(el)
    }
    return el
}

let cssInjected = false
function injectCSS(): void {
    if (cssInjected) return
    cssInjected = true
    const style = document.createElement('style')
    style.textContent = `
    /* Make the game container the stacking context for the overlay */
    #${GAME_CONTAINER_ID} {
      position: relative;
    }

    /*
     * Blackout overlay — sits on top of the canvas, covers board + HUD.
     * pointer-events: none so it never blocks clicks.
     * opacity starts at 0 (invisible); CSS transition smooths changes.
     */
    #${OVERLAY_ID} {
      position: absolute;
      inset: 0;
      background: #000;
            box-shadow: none;
      opacity: 0;
      pointer-events: none;
      z-index: 500;
      /* Transition is applied dynamically so fade-in and fade-out can have
         different durations. Default here is a safe fallback. */
            transition: opacity 0.2s ease;
            will-change: opacity;
    }
  `
    document.head.appendChild(style)
}

// ---------------------------------------------------------------------------
// Timer state
// ---------------------------------------------------------------------------

/** IDs from setTimeout, so we can cancel them on disable / re-enable. */
let cycleTimer: ReturnType<typeof setTimeout> | null = null
let flashTimer: ReturnType<typeof setTimeout> | null = null
let fadeInTimer: ReturnType<typeof setTimeout> | null = null
let fadeOutTimer: ReturnType<typeof setTimeout> | null = null
let holdTimer: ReturnType<typeof setTimeout> | null = null

function clearAllTimers(): void {
    if (cycleTimer !== null) { clearTimeout(cycleTimer); cycleTimer = null }
    if (flashTimer !== null) { clearTimeout(flashTimer); flashTimer = null }
    if (fadeInTimer !== null) { clearTimeout(fadeInTimer); fadeInTimer = null }
    if (fadeOutTimer !== null) { clearTimeout(fadeOutTimer); fadeOutTimer = null }
    if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null }
}

function setDarkState(overlay: HTMLElement): void {
    overlay.style.background = '#000'
    overlay.style.boxShadow = 'none'
}

function setFlashState(overlay: HTMLElement): void {
    overlay.style.background = 'radial-gradient(circle at 50% 18%, rgba(255,255,255,0.95) 0%, rgba(240,246,255,0.55) 24%, rgba(220,232,255,0.16) 48%, rgba(0,0,0,0) 74%), rgba(255,255,255,0.70)'
    overlay.style.boxShadow = 'inset 0 0 140px rgba(255,255,255,0.22), 0 0 70px rgba(190,215,255,0.20)'
}

// ---------------------------------------------------------------------------
// Core cycle
// ---------------------------------------------------------------------------

/**
 * Executes one blackout flash:
 *   1. Show a brief lightning-like flash.
 *   2. Fade the overlay IN (to peakOpacity) over fadeMs.
 *   3. Hold for holdMs.
 *   4. Fade the overlay OUT (to 0) over fadeMs.
 *   5. Schedule the next cycle after intervalMs.
 */
function runCycle(rank: BlackoutRank, cfg: BlackoutConfig): void {
    const overlay = getOrCreateOverlay()

    // ── Step 1: Brief pre-blackout flash ────────────────────────────
    // Tighten timing: play the 'thunder crack' sound the instant the flash starts.
    audioManager.playSfx('blackout', { rank })

    setFlashState(overlay)
    overlay.style.transition = `opacity ${cfg.flashMs}ms ease-out`
    overlay.style.opacity = String(cfg.flashOpacity)

    flashTimer = setTimeout(() => {
        overlay.style.opacity = '0'

        // ── Step 2: Fade to blackout after a tiny beat ───────────────
        fadeInTimer = setTimeout(() => {
            setDarkState(overlay)
            overlay.style.transition = `opacity ${cfg.fadeMs}ms ease-in`
            overlay.style.opacity = String(cfg.peakOpacity)

            // ── Step 3 + 4: Hold, then fade out ──────────────────────
            holdTimer = setTimeout(() => {
                overlay.style.transition = `opacity ${cfg.fadeMs}ms ease-out`
                overlay.style.opacity = '0'

                // ── Step 5: Schedule next cycle ──────────────────────
                fadeOutTimer = setTimeout(() => {
                    scheduleNextCycle(rank, cfg)
                }, cfg.fadeMs)
            }, cfg.fadeMs + cfg.holdMs)
        }, cfg.flashGapMs)
    }, cfg.flashMs)
}

/**
 * Schedules the NEXT cycle after the current one's interval.
 * cycleTimer is used as the "pending" flag — if null, we've been disabled.
 */
function scheduleNextCycle(rank: BlackoutRank, cfg: BlackoutConfig): void {
    cycleTimer = setTimeout(() => {
        cycleTimer = null
        runCycle(rank, cfg)
    }, cfg.intervalMs)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Starts (or restarts) the Blackout effect at the given rank.
 * Safe to call multiple times — clears any existing cycle first.
 */
export function enableBlackout(rank: BlackoutRank): void {
    clearAllTimers()
    const cfg = RANK_CONFIG[rank]

    // Set a placeholder so scheduleNextCycle's cancelled check works
    cycleTimer = null

    // Start sooner than a full cycle so the curse is felt quickly.
    const firstDelayMs = Math.max(900, Math.floor(cfg.intervalMs * 0.45))
    cycleTimer = setTimeout(() => {
        cycleTimer = null
        runCycle(rank, cfg)
    }, firstDelayMs)
}

/**
 * Stops all Blackout timers and immediately hides the overlay.
 * Call this if the Vex is ever removed or you need to reset state.
 */
export function disableBlackout(): void {
    clearAllTimers()
    const overlay = document.getElementById(OVERLAY_ID)
    if (overlay) {
        setDarkState(overlay)
        overlay.style.transition = 'opacity 0.3s ease'
        overlay.style.opacity = '0'
    }
}
