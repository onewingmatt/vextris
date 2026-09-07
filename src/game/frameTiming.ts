// Frame timing utilities — resolution-independent game-time.

/**
 * TARGET_FPS: the logical tick rate the game's frame-based constants
 * (DAS/ARR frames, gravity "frames per row") assume.
 */
export const TARGET_FPS = 60

/** Logical frame duration in ms. */
export const FRAME_TIME_MS = 1000 / TARGET_FPS

/**
 * Computes the elapsed game-time (ms) to advance for this processed frame.
 *
 * Why this exists: Phaser calls Scene.update() once per animation frame
 * (typically 60/120/144Hz depending on display). Vextris throttles processed
 * updates to TARGET_FPS, but the `delta` Phaser passes on a processed frame
 * only covers the LAST animation-frame step (e.g. ~8.3ms at 120Hz), not the
 * full ~16.7ms since the previous processed frame. Accumulating that raw
 * delta makes gravity/DAS/Resolve/pressure run at (rAF Hz / 60) × real speed
 * — e.g. half-speed on a 120Hz monitor.
 *
 * This function measures wall-clock progress between processed frames
 * instead, with two guards:
 *
 * 1. Clamped to a maximum (maxMs), so a tab-backgrounded frame gap or a
 *    pause doesn't dump seconds of accumulated time into one tick.
 * 2. Falls back to the nominal frame time when `time` goes backwards,
 *    repeats, or on the very first frame (prev === 0), where the interval
 *    is unknown.
 *
 * @param prev    Timestamp (ms) of the previously processed frame, 0 if none.
 * @param time    Timestamp (ms) of the current frame (Phaser's `time`).
 * @param maxMs   Clamp for the computed delta. Default 3 frames (~50ms).
 */
export function computeFrameDelta(prev: number, time: number, maxMs = FRAME_TIME_MS * 3): number {
  if (prev <= 0 || !Number.isFinite(time) || time <= prev) {
    return FRAME_TIME_MS
  }
  return Math.min(time - prev, maxMs)
}

/**
 * Converts a frame-based delay (frames at 60fps) into milliseconds.
 * Replaces ad-hoc `* 16.67` constants.
 */
export function framesToMs(frames: number): number {
  return frames * FRAME_TIME_MS
}

// ---------------------------------------------------------------------------
// Accumulator: sub-frame threshold stepping (fixed-timestep without drift)
// ---------------------------------------------------------------------------

/**
 * A threshold accumulator that steps in fixed-size chunks so the number of
 * discrete events (gravity rows, DAS/ARR shifts) is independent of the size
 * of each elapsed-time slice.
 *
 * Example: gravity with a 1000ms threshold fed 600ms slices must fire once
 * and keep 200ms banked — not zero events with 200ms banked (naive
 * subtract-once) or two events (naive divide, undersampled input).
 */
export class SteppingAccumulator {
  private banked = 0

  private thresholdMs: number

  constructor(thresholdMs: number) {
    if (thresholdMs <= 0) throw new Error('thresholdMs must be > 0')
    this.thresholdMs = thresholdMs
  }

  /** Adds elapsed ms and returns how many threshold steps elapsed. */
  add(elapsedMs: number): number {
    this.banked += elapsedMs
    let steps = 0
    while (this.banked >= this.thresholdMs) {
      this.banked -= this.thresholdMs
      steps++
    }
    return steps
  }

  /** Banked time (ms) waiting toward the next step. */
  get pending(): number {
    return this.banked
  }

  /** Sets the threshold without discarding banked time. */
  setThreshold(thresholdMs: number): void {
    if (thresholdMs <= 0) throw new Error('thresholdMs must be > 0')
    // Re-bank proportionally so mid-gravity-speed changes don't spike or stall.
    const ratio = this.banked / this.thresholdMs
    this.thresholdMs = thresholdMs
    this.banked = ratio * thresholdMs
  }

  /** Clears banked time (e.g. on piece lock — gravity bank resets). */
  reset(): void {
    this.banked = 0
  }
}
