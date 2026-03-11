/**
 * effects/fog.ts — Vex of Fog visual curse.
 *
 * Canvas-based animated fog renderer. Key design decisions:
 *
 * POSITIONING: Detects the actual DOM position and CSS scale of the Phaser
 * canvas at enable time so the fog aligns correctly regardless of browser zoom,
 * DPR scaling, or Phaser's scale mode. The fog canvas copies the exact DOM
 * rect of the board area (not hardcoded px values).
 *
 * HEIGHT: A gradient mask controls how high the fog appears from the bottom.
 * The mask fade zone is proportional to the current height (never exceeds it),
 * so the fog top always dissolves within the covered region — it never bleeds
 * above the highest block.
 *
 * RANK: Only controls opacity and blob density. Height is driven externally
 * by GameScene via setFogHeight() which uses the board's block center-of-mass.
 *
 * Public API:
 *   enableFog(rank)      — start/restart the fog at the given rank
 *   setFogHeight(px)     — update target height in board game-units (call each frame)
 *   disableFog()         — stop animation, hide canvas
 */

// ---------------------------------------------------------------------------
// Board geometry (game-unit coordinates, must match GameScene constants)
// ---------------------------------------------------------------------------

const BLOCK_SIZE = 32
const BOARD_WIDTH = 10
const BOARD_HEIGHT = 18
const BOARD_OFFSET_X = 48    // board x in game units (left edge of board)
const BOARD_OFFSET_Y = 112   // board y in game units (top edge of board)

const BOARD_PX_W = BOARD_WIDTH * BLOCK_SIZE   // 320 game units
const BOARD_PX_H = BOARD_HEIGHT * BLOCK_SIZE   // 576 game units

// ---------------------------------------------------------------------------
// Rank → opacity / blob parameters
// ---------------------------------------------------------------------------

const RANK_OPACITY: Record<1 | 2 | 3, number> = { 1: 0.72, 2: 0.90, 3: 1.00 }
const RANK_BLOB_COUNT: Record<1 | 2 | 3, number> = { 1: 16, 2: 24, 3: 32 }
const RANK_BLOB_SPEED: Record<1 | 2 | 3, number> = { 1: 12, 2: 18, 3: 24 }

// ---------------------------------------------------------------------------
// Blob state
// ---------------------------------------------------------------------------

type Blob = {
  x: number; y: number
  r: number
  dx: number; dy: number
  phase: number; phaseSpeed: number
  alpha: number
  rC: number; gC: number; bC: number
  /** Horizontal and vertical scale — large scaleX, small scaleY = wispy streak */
  scaleX: number; scaleY: number
  /** Slight rotation in radians for variety */
  angle: number
}

function makeBlob(speedScale: number): Blob {
  return {
    x: Math.random() * BOARD_PX_W,
    y: Math.random() * BOARD_PX_H,
    // Smaller base radius — the stretch transform will elongate it
    r: 30 + Math.random() * 50,
    dx: (Math.random() - 0.5) * speedScale,
    dy: -(Math.random() * speedScale * 0.25),  // subtle upward drift
    phase: Math.random() * Math.PI * 2,
    phaseSpeed: 0.2 + Math.random() * 0.4,
    alpha: 0.35 + Math.random() * 0.45,
    rC: 178 + Math.floor(Math.random() * 38),
    gC: 185 + Math.floor(Math.random() * 30),
    bC: 202 + Math.floor(Math.random() * 38),
    // Wide horizontal stretch (2–4×) and strong vertical squash (0.25–0.55×)
    scaleX: 2.2 + Math.random() * 1.8,
    scaleY: 0.25 + Math.random() * 0.30,
    // Slight tilt — most nearly horizontal, some angled wisps
    angle: (Math.random() - 0.5) * 0.35,
  }
}

// ---------------------------------------------------------------------------
// Canvas and module state
// ---------------------------------------------------------------------------

const CANVAS_ID = 'fog-canvas'
const GAME_CONTAINER = 'game'

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let blobs: Blob[] = []
let maxOpacity: number = 0.45
let fogHeight: number = 0      // target height in game units (set by GameScene)
let displayedHeight: number = 0      // lerped height in game units
let rafId: number | null = null
let lastTs: number = 0

// ---------------------------------------------------------------------------
// Board DOM rect detection
// ---------------------------------------------------------------------------

/**
 * Compute the actual CSS pixel rect of the board inside the #game div.
 * Accounts for Phaser's CSS scale (canvas rendered size > internal size)
 * and the canvas element's offset within #game.
 */
function getBoardDOMRect(): { left: number; top: number; w: number; h: number } {
  const gameEl = document.getElementById(GAME_CONTAINER)
  const phaserCanvas = document.querySelector('#' + GAME_CONTAINER + ' canvas') as HTMLCanvasElement | null

  if (!gameEl || !phaserCanvas) {
    // Fallback to raw game-unit values (works if no scaling)
    return { left: BOARD_OFFSET_X, top: BOARD_OFFSET_Y, w: BOARD_PX_W, h: BOARD_PX_H }
  }

  // Scale factors from game units to DOM px
  const scaleX = phaserCanvas.offsetWidth / phaserCanvas.width
  const scaleY = phaserCanvas.offsetHeight / phaserCanvas.height

  // Phaser canvas offset within #game
  const canvasLeft = phaserCanvas.offsetLeft
  const canvasTop = phaserCanvas.offsetTop

  return {
    left: canvasLeft + BOARD_OFFSET_X * scaleX,
    top: canvasTop + BOARD_OFFSET_Y * scaleY,
    w: BOARD_PX_W * scaleX,
    h: BOARD_PX_H * scaleY,
  }
}

function getOrCreateCanvas(): HTMLCanvasElement {
  if (canvas) return canvas

  canvas = document.createElement('canvas') as HTMLCanvasElement
  canvas.id = CANVAS_ID
  // Internal rendering resolution = board game units (all coords are game-unit)
  canvas.width = BOARD_PX_W
  canvas.height = BOARD_PX_H

  const s = canvas.style
  s.position = 'absolute'
  s.pointerEvents = 'none'
  s.zIndex = '501'

  const container = document.getElementById(GAME_CONTAINER)
  if (container) container.appendChild(canvas)

  return canvas
}

/** Sync the fog canvas CSS rect to the actual board DOM position. */
function syncCanvasPosition(): void {
  if (!canvas) return
  const r = getBoardDOMRect()
  canvas.style.left = `${r.left}px`
  canvas.style.top = `${r.top}px`
  canvas.style.width = `${r.w}px`
  canvas.style.height = `${r.h}px`
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

function tick(ts: number): void {
  if (!ctx || !canvas) return

  const dt = Math.min((ts - lastTs) / 1000, 0.1)
  lastTs = ts

  // Lerp toward target (~3× per second, so follows blocks smoothly)
  displayedHeight += (fogHeight - displayedHeight) * Math.min(dt * 3, 1)

  const w = BOARD_PX_W
  const h = BOARD_PX_H

  // ── Advance blobs ────────────────────────────────────────────────
  for (const b of blobs) {
    b.x += b.dx * dt
    b.y += b.dy * dt
    b.phase += b.phaseSpeed * dt

    if (b.x < -b.r) b.x = w + b.r
    if (b.x > w + b.r) b.x = -b.r
    // Blobs drift upward; wrap from top back to bottom
    if (b.y < -b.r) b.y = h + b.r
    if (b.y > h + b.r) b.y = -b.r
  }

  // ── Draw blobs ───────────────────────────────────────────────────
  ctx.clearRect(0, 0, w, h)

  // Canvas blur diffuses blob edges — key to making them look like mist, not circles
  ctx.filter = 'blur(4px)'

  for (const b of blobs) {
    const osc = Math.sin(b.phase) * 0.35 + 0.65
    const alpha = b.alpha * maxOpacity * osc

    // Transform: translate → rotate → stretch into horizontal ellipse
    ctx.save()
    ctx.translate(b.x, b.y)
    ctx.rotate(b.angle)
    ctx.scale(b.scaleX, b.scaleY)

    // Radial gradient in local (squashed) space
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r)
    grad.addColorStop(0, `rgba(${b.rC},${b.gC},${b.bC},${alpha.toFixed(3)})`)
    grad.addColorStop(0.55, `rgba(${b.rC},${b.gC},${b.bC},${(alpha * 0.55).toFixed(3)})`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')

    ctx.beginPath()
    ctx.arc(0, 0, b.r, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()
    ctx.restore()
  }

  ctx.filter = 'none'

  // ── Gradient mask ────────────────────────────────────────────────
  // The mask reveals fog only in the bottom `displayedHeight` game-unit px.
  // Fade zone = 50% of displayedHeight so it NEVER extends above the fog top.
  // All values are fractions of canvas height (0=top, 1=bottom).
  const safeHeight = Math.max(displayedHeight, 0)
  const fadeZone = safeHeight * 0.5            // half the fog height, always contained
  const topOfFog = h - safeHeight              // canvas y where fog starts (game px from top)
  const fadeStart = topOfFog + fadeZone * 0.05  // tiny step inside fog top for cleaner blend

  const topFrac = Math.max(0, Math.min(1, topOfFog / h))
  const fadeFrac = Math.max(0, Math.min(1, (topOfFog + fadeZone) / h))

  ctx.globalCompositeOperation = 'destination-in'
  const mask = ctx.createLinearGradient(0, 0, 0, h)
  mask.addColorStop(0, 'rgba(0,0,0,0)')      // everything above fog: hidden
  mask.addColorStop(topFrac, 'rgba(0,0,0,0)')      // fog start: transparent to…
  mask.addColorStop(fadeFrac, 'rgba(0,0,0,0.80)')   // …lower section: solid
  mask.addColorStop(1, 'rgba(0,0,0,1)')      // board floor: fully opaque
  ctx.fillStyle = mask
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'

  // Suppress unused variable warning from the fadeStart calculation
  void fadeStart

  rafId = requestAnimationFrame(tick)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function enableFog(rank: 1 | 2 | 3): void {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }

  maxOpacity = RANK_OPACITY[rank]

  const c = getOrCreateCanvas()
  ctx = c.getContext('2d')!

  // Sync position to actual board DOM rect (accounts for Phaser scaling)
  syncCanvasPosition()

  blobs = Array.from({ length: RANK_BLOB_COUNT[rank] }, () =>
    makeBlob(RANK_BLOB_SPEED[rank])
  )

  displayedHeight = fogHeight
  lastTs = performance.now()
  rafId = requestAnimationFrame(tick)
}

export function setFogHeight(px: number): void {
  fogHeight = Math.max(0, px)
}

export function disableFog(): void {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  if (ctx && canvas) ctx.clearRect(0, 0, BOARD_PX_W, BOARD_PX_H)
  fogHeight = 0
  displayedHeight = 0
  blobs = []
}
