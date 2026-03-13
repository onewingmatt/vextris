/**
 * effects/whiplash.ts - Vex of Whiplash triggered blackout pulse.
 *
 * Unlike blackout.ts (periodic), this module exposes an imperative pulse API
 * that GameScene calls on manual hard-drops.
 */

const OVERLAY_ID = 'whiplash-overlay'
const GAME_CONTAINER_ID = 'game'

let cssInjected = false
let fadeTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

function injectCss(): void {
    if (cssInjected) return
    cssInjected = true

    const style = document.createElement('style')
    style.textContent = `
    #${GAME_CONTAINER_ID} {
      position: relative;
    }

    #${OVERLAY_ID} {
      position: absolute;
      inset: 0;
      background: #000;
      opacity: 0;
      pointer-events: none;
      z-index: 520;
      transition: opacity 80ms ease-out;
      will-change: opacity;
    }
  `

    document.head.appendChild(style)
}

function getOrCreateOverlay(): HTMLElement | null {
    injectCss()

    let overlay = document.getElementById(OVERLAY_ID)
    if (overlay) return overlay

    const container = document.getElementById(GAME_CONTAINER_ID)
    if (!container) {
        console.warn('[Whiplash] #game container not found - overlay not inserted.')
        return null
    }

    overlay = document.createElement('div')
    overlay.id = OVERLAY_ID
    container.appendChild(overlay)
    return overlay
}

function clearTimers(): void {
    if (fadeTimer !== null) {
        clearTimeout(fadeTimer)
        fadeTimer = null
    }
    if (hideTimer !== null) {
        clearTimeout(hideTimer)
        hideTimer = null
    }
}

export function enableWhiplash(): void {
    getOrCreateOverlay()
}

/**
 * Trigger a single blackout pulse.
 * durationMs is the "blind" period before fade-out begins.
 */
export function triggerWhiplash(durationMs: number): void {
    const overlay = getOrCreateOverlay()
    if (!overlay) return

    clearTimers()

    overlay.style.transition = 'opacity 45ms ease-out'
    overlay.style.opacity = '0.85'

    fadeTimer = setTimeout(() => {
        overlay.style.transition = 'opacity 120ms ease-in'
        overlay.style.opacity = '0'
        fadeTimer = null
    }, Math.max(50, Math.floor(durationMs)))

    hideTimer = setTimeout(() => {
        overlay.style.opacity = '0'
        hideTimer = null
    }, Math.max(180, Math.floor(durationMs + 140)))
}

export function disableWhiplash(): void {
    clearTimers()
    const overlay = document.getElementById(OVERLAY_ID)
    if (overlay) {
        overlay.style.opacity = '0'
    }
}
