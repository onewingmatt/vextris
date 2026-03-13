/**
 * effects/tremor.ts - Vex of Tremor visual shake scheduler.
 *
 * Runs on plain setTimeout so tremors continue even if Phaser timers pause.
 */

import Phaser from 'phaser'
import type { VexRank } from '../vex'

type TremorConfig = {
    intervalMs: number
    durationMs: number
    intensity: number
    jitterPx: number
}

const RANK_CONFIG: Record<VexRank, TremorConfig> = {
    1: { intervalMs: 14000, durationMs: 300, intensity: 0.003, jitterPx: 2 },
    2: { intervalMs: 12500, durationMs: 340, intensity: 0.0034, jitterPx: 2 },
    3: { intervalMs: 11000, durationMs: 380, intensity: 0.004, jitterPx: 3 },
    4: { intervalMs: 9500, durationMs: 430, intensity: 0.0048, jitterPx: 3 },
    5: { intervalMs: 8000, durationMs: 500, intensity: 0.0056, jitterPx: 4 },
    6: { intervalMs: 6500, durationMs: 560, intensity: 0.0062, jitterPx: 4 },
    7: { intervalMs: 5200, durationMs: 620, intensity: 0.0069, jitterPx: 5 },
    8: { intervalMs: 4300, durationMs: 660, intensity: 0.0075, jitterPx: 6 },
    9: { intervalMs: 3600, durationMs: 680, intensity: 0.0082, jitterPx: 7 },
    10: { intervalMs: 3000, durationMs: 700, intensity: 0.009, jitterPx: 8 },
}

const GAME_CONTAINER_ID = 'game'

let cycleTimer: ReturnType<typeof setTimeout> | null = null
let jitterTimer: ReturnType<typeof setInterval> | null = null
let activeScene: Phaser.Scene | null = null
let active = false
let baseTransform = ''

function clearTimers(): void {
    if (cycleTimer !== null) {
        clearTimeout(cycleTimer)
        cycleTimer = null
    }
    if (jitterTimer !== null) {
        clearInterval(jitterTimer)
        jitterTimer = null
    }
}

function getGameContainer(): HTMLElement | null {
    return document.getElementById(GAME_CONTAINER_ID)
}

function applyJitter(config: TremorConfig): void {
    const gameContainer = getGameContainer()
    if (!gameContainer) return

    if (jitterTimer !== null) {
        clearInterval(jitterTimer)
        jitterTimer = null
    }

    const startedAt = Date.now()
    jitterTimer = setInterval(() => {
        if (!active) return

        const elapsed = Date.now() - startedAt
        if (elapsed >= config.durationMs) {
            if (jitterTimer !== null) {
                clearInterval(jitterTimer)
                jitterTimer = null
            }
            gameContainer.style.transform = baseTransform
            return
        }

        const dx = (Math.random() * 2 - 1) * config.jitterPx
        const dy = (Math.random() * 2 - 1) * (config.jitterPx * 0.45)
        const translate = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`
        gameContainer.style.transform = baseTransform
            ? `${baseTransform} ${translate}`
            : translate
    }, 26)
}

function trigger(config: TremorConfig): void {
    if (!active || !activeScene) return
    activeScene.cameras.main.shake(config.durationMs, config.intensity)
    applyJitter(config)
}

function schedule(config: TremorConfig): void {
    cycleTimer = setTimeout(() => {
        cycleTimer = null
        if (!active) return
        trigger(config)
        schedule(config)
    }, config.intervalMs)
}

export function enableTremor(scene: Phaser.Scene, rank: VexRank): void {
    disableTremor()

    active = true
    activeScene = scene

    const gameContainer = getGameContainer()
    if (gameContainer) {
        baseTransform = gameContainer.style.transform || ''
    }

    const config = RANK_CONFIG[rank]
    const firstDelay = Math.max(700, Math.floor(config.intervalMs * 0.45))
    cycleTimer = setTimeout(() => {
        cycleTimer = null
        if (!active) return
        trigger(config)
        schedule(config)
    }, firstDelay)
}

export function disableTremor(): void {
    active = false
    activeScene = null
    clearTimers()

    const gameContainer = getGameContainer()
    if (gameContainer) {
        gameContainer.style.transform = baseTransform
    }
    baseTransform = ''
}
