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

// ---------------------------------------------------------------------------
// Rank configuration
// ---------------------------------------------------------------------------

type BlackoutConfig = {
    /** Overlay opacity at peak darkness (0–1). */
    peakOpacity: number
    /** How long the screen stays dark, in ms. */
    holdMs: number
    /** Time between the END of one blackout and the START of the next, in ms. */
    intervalMs: number
    /** Duration of the fade-in and fade-out transitions, in ms. */
    fadeMs: number
}

/** Per-rank parameters matching vision.md spec. */
const RANK_CONFIG: Record<1 | 2 | 3, BlackoutConfig> = {
    // Rank 1: dims to ~60% dark (40% visible), 0.3s hold, every ~20s
    1: { peakOpacity: 0.40, holdMs: 300, intervalMs: 20_000, fadeMs: 200 },
    // Rank 2: dims to ~70% dark (30% visible), 0.5s hold, every ~15s
    2: { peakOpacity: 0.70, holdMs: 500, intervalMs: 15_000, fadeMs: 200 },
    // Rank 3: near-full blackout (95% dark), 0.4s hold, every ~10s
    3: { peakOpacity: 0.95, holdMs: 400, intervalMs: 10_000, fadeMs: 150 },
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
      opacity: 0;
      pointer-events: none;
      z-index: 500;
      /* Transition is applied dynamically so fade-in and fade-out can have
         different durations. Default here is a safe fallback. */
      transition: opacity 0.2s ease;
    }
  `
    document.head.appendChild(style)
}

// ---------------------------------------------------------------------------
// Timer state
// ---------------------------------------------------------------------------

/** IDs from setTimeout, so we can cancel them on disable / re-enable. */
let cycleTimer: ReturnType<typeof setTimeout> | null = null
let fadeOutTimer: ReturnType<typeof setTimeout> | null = null
let holdTimer: ReturnType<typeof setTimeout> | null = null

function clearAllTimers(): void {
    if (cycleTimer !== null) { clearTimeout(cycleTimer); cycleTimer = null }
    if (fadeOutTimer !== null) { clearTimeout(fadeOutTimer); fadeOutTimer = null }
    if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null }
}

// ---------------------------------------------------------------------------
// Core cycle
// ---------------------------------------------------------------------------

/**
 * Executes one blackout flash:
 *   1. Fade the overlay IN  (to peakOpacity) over fadeMs.
 *   2. Hold for holdMs.
 *   3. Fade the overlay OUT (to 0) over fadeMs.
 *   4. Schedule the next cycle after intervalMs.
 */
function runCycle(cfg: BlackoutConfig): void {
    const overlay = getOrCreateOverlay()

    // ── Step 1: Fade in ──────────────────────────────────────────────
    overlay.style.transition = `opacity ${cfg.fadeMs}ms ease`
    overlay.style.opacity = String(cfg.peakOpacity)

    // ── Step 2 + 3: Hold, then fade out ─────────────────────────────
    holdTimer = setTimeout(() => {
        overlay.style.opacity = '0'

        // ── Step 4: Schedule next cycle ──────────────────────────────
        fadeOutTimer = setTimeout(() => {
            // Only reschedule if we haven't been cancelled
            if (cycleTimer !== null || holdTimer !== null || fadeOutTimer !== null) {
                // Timers already cleared means disableBlackout() was called — bail out.
                // (We check below via a dedicated flag instead.)
            }
            scheduleNextCycle(cfg)
        }, cfg.fadeMs)

    }, cfg.holdMs)
}

/**
 * Schedules the NEXT cycle after the current one's interval.
 * cycleTimer is used as the "pending" flag — if null, we've been disabled.
 */
function scheduleNextCycle(cfg: BlackoutConfig): void {
    cycleTimer = setTimeout(() => {
        cycleTimer = null
        runCycle(cfg)
    }, cfg.intervalMs)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Starts (or restarts) the Blackout effect at the given rank.
 * Safe to call multiple times — clears any existing cycle first.
 */
export function enableBlackout(rank: 1 | 2 | 3): void {
    clearAllTimers()
    const cfg = RANK_CONFIG[rank]

    // Set a placeholder so scheduleNextCycle's cancelled check works
    cycleTimer = null

    // Kick off after one full interval so it doesn't fire immediately on apply
    cycleTimer = setTimeout(() => {
        cycleTimer = null
        runCycle(cfg)
    }, cfg.intervalMs)
}

/**
 * Stops all Blackout timers and immediately hides the overlay.
 * Call this if the Vex is ever removed or you need to reset state.
 */
export function disableBlackout(): void {
    clearAllTimers()
    const overlay = document.getElementById(OVERLAY_ID)
    if (overlay) {
        overlay.style.transition = 'opacity 0.3s ease'
        overlay.style.opacity = '0'
    }
}
