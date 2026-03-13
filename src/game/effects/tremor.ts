/**
 * effects/tremor.ts - Vex of Tremor visual pulse scheduler.
 *
 * Important: This module intentionally avoids camera shake and all CSS
 * transform/translate mutations to prevent zoom artifacts on responsive layouts.
 */

import type Phaser from 'phaser'
import type { VexRank } from '../vex'
import { audioManager } from '../audio'

type TremorConfig = {
    intervalMs: number
    durationMs: number
    minOpacity: number
    maxOpacity: number
    glowPx: number
    contrast: number
    brightness: number
    shakeIntensity: number
}

const RANK_CONFIG: Record<VexRank, TremorConfig> = {
    1: { intervalMs: 7600, durationMs: 620, minOpacity: 0.14, maxOpacity: 0.24, glowPx: 12, contrast: 1.03, brightness: 1.018, shakeIntensity: 0.0032 },
    2: { intervalMs: 7000, durationMs: 650, minOpacity: 0.15, maxOpacity: 0.25, glowPx: 13, contrast: 1.034, brightness: 1.02, shakeIntensity: 0.0037 },
    3: { intervalMs: 6400, durationMs: 680, minOpacity: 0.16, maxOpacity: 0.27, glowPx: 14, contrast: 1.038, brightness: 1.022, shakeIntensity: 0.0043 },
    4: { intervalMs: 5800, durationMs: 710, minOpacity: 0.17, maxOpacity: 0.29, glowPx: 16, contrast: 1.043, brightness: 1.024, shakeIntensity: 0.0050 },
    5: { intervalMs: 5200, durationMs: 740, minOpacity: 0.18, maxOpacity: 0.31, glowPx: 18, contrast: 1.048, brightness: 1.027, shakeIntensity: 0.0059 },
    6: { intervalMs: 4600, durationMs: 780, minOpacity: 0.20, maxOpacity: 0.33, glowPx: 20, contrast: 1.054, brightness: 1.03, shakeIntensity: 0.0070 },
    7: { intervalMs: 4000, durationMs: 830, minOpacity: 0.22, maxOpacity: 0.36, glowPx: 22, contrast: 1.061, brightness: 1.033, shakeIntensity: 0.0082 },
    8: { intervalMs: 3400, durationMs: 880, minOpacity: 0.24, maxOpacity: 0.39, glowPx: 24, contrast: 1.068, brightness: 1.036, shakeIntensity: 0.0098 },
    9: { intervalMs: 2800, durationMs: 930, minOpacity: 0.26, maxOpacity: 0.42, glowPx: 27, contrast: 1.076, brightness: 1.04, shakeIntensity: 0.0116 },
    10: { intervalMs: 2300, durationMs: 980, minOpacity: 0.28, maxOpacity: 0.46, glowPx: 30, contrast: 1.085, brightness: 1.044, shakeIntensity: 0.0138 },
}

const GAME_CONTAINER_ID = 'game'
const OVERLAY_ID = 'tremor-overlay'

let cycleTimer: ReturnType<typeof setTimeout> | null = null
let pulseTimer: ReturnType<typeof setInterval> | null = null
let active = false
let cssInjected = false
let activeScene: Phaser.Scene | null = null

function resetCameraState(): void {
    const cam = activeScene?.cameras.main
    if (!cam) return

    // Keep Tremor from ever leaving camera state drift behind.
    cam.setZoom(1)
    cam.setRotation(0)
    ;(cam as { stopShake?: () => void }).stopShake?.()
}

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
      pointer-events: none;
      z-index: 518;
      opacity: 0;
            background:
                repeating-linear-gradient(
                    0deg,
                    rgba(255,255,255,0.10) 0px,
                    rgba(255,255,255,0.10) 2px,
                    rgba(255,255,255,0) 2px,
                    rgba(255,255,255,0) 7px
                ),
                radial-gradient(circle at 50% 50%, rgba(255,255,255,0.28), rgba(255,255,255,0));
      mix-blend-mode: screen;
            will-change: opacity, box-shadow, background-position;
    }
  `
    document.head.appendChild(style)
}

function clearTimers(): void {
    if (cycleTimer !== null) {
        clearTimeout(cycleTimer)
        cycleTimer = null
    }
    if (pulseTimer !== null) {
        clearInterval(pulseTimer)
        pulseTimer = null
    }
}

function getGameContainer(): HTMLElement | null {
    return document.getElementById(GAME_CONTAINER_ID)
}

function isGameplayActive(): boolean {
    if (!activeScene) return false
    const sceneWithState = activeScene as unknown as { gameState?: string }
    const state = sceneWithState.gameState
    // If gameState isn't present, default to active to avoid hard coupling.
    if (!state) return true
    return state === 'PLAYING'
}

function getOrCreateOverlay(): HTMLElement | null {
    injectCss()

    let overlay = document.getElementById(OVERLAY_ID)
    if (overlay) return overlay

    const gameContainer = getGameContainer()
    if (!gameContainer) return null

    overlay = document.createElement('div')
    overlay.id = OVERLAY_ID
    gameContainer.appendChild(overlay)
    return overlay
}

function resetOverlay(): void {
    const overlay = document.getElementById(OVERLAY_ID)
    const gameContainer = getGameContainer()

    if (overlay) {
        overlay.style.opacity = '0'
        overlay.style.boxShadow = 'none'
        overlay.style.backgroundPosition = '0px 0px, center'
    }
    if (gameContainer) {
        gameContainer.style.filter = 'none'
    }
}

function runPulse(config: TremorConfig): void {
    if (!isGameplayActive()) return

    const overlay = getOrCreateOverlay()
    const gameContainer = getGameContainer()
    if (!overlay || !gameContainer) return

    const sceneWithState = activeScene as unknown as { getActiveVexRank?: (vexId: string) => VexRank | 0 }
    const activeRank = sceneWithState.getActiveVexRank?.('tremor') ?? 1
    audioManager.playSfx('tremor', { rank: activeRank })

    const cam = activeScene?.cameras.main
    if (cam) {
        cam.setZoom(1)
        cam.shake(config.durationMs, config.shakeIntensity, true)
    }

    if (pulseTimer !== null) {
        clearInterval(pulseTimer)
        pulseTimer = null
    }

    const startedAt = Date.now()
    pulseTimer = setInterval(() => {
        if (!active) return

        const elapsed = Date.now() - startedAt
        if (elapsed >= config.durationMs) {
            if (pulseTimer !== null) {
                clearInterval(pulseTimer)
                pulseTimer = null
            }
            resetCameraState()
            resetOverlay()
            return
        }

        const alpha = config.minOpacity + Math.random() * (config.maxOpacity - config.minOpacity)
        const glow = Math.round(config.glowPx * (0.75 + Math.random() * 0.5))
        const yOffset = Math.floor(Math.random() * 14)
        overlay.style.opacity = alpha.toFixed(3)
        overlay.style.boxShadow = `inset 0 0 ${glow}px rgba(255, 245, 210, 0.26)`
        overlay.style.backgroundPosition = `0px ${yOffset}px, center`
        const contrast = config.contrast + Math.random() * 0.02
        const brightness = config.brightness + Math.random() * 0.02
        gameContainer.style.filter = `contrast(${contrast.toFixed(3)}) brightness(${brightness.toFixed(3)})`
    }, 33)
}

function schedule(config: TremorConfig): void {
    cycleTimer = setTimeout(() => {
        cycleTimer = null
        if (!active) return
        if (!isGameplayActive()) {
            schedule({ ...config, intervalMs: 450 })
            return
        }
        runPulse(config)
        schedule(config)
    }, config.intervalMs)
}

export function enableTremor(_scene: Phaser.Scene, rank: VexRank): void {
    disableTremor()

    active = true
    activeScene = _scene
    getOrCreateOverlay()

    const config = RANK_CONFIG[rank]
    // Trigger immediately so the curse is always felt right after it is applied.
    runPulse(config)

    const firstDelay = Math.max(950, Math.floor(config.intervalMs * 0.35))
    cycleTimer = setTimeout(() => {
        cycleTimer = null
        if (!active) return
        if (!isGameplayActive()) {
            schedule({ ...config, intervalMs: 450 })
            return
        }
        runPulse(config)
        schedule(config)
    }, firstDelay)
}

export function disableTremor(): void {
    active = false
    clearTimers()
    resetCameraState()
    resetOverlay()
    activeScene = null
}
