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
 * RANK: Controls opacity and the number of pre-rendered mist layers. Height is
 * driven externally by GameScene.
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
const FOG_RENDER_SCALE = 0.5
const INTERNAL_W = Math.round(BOARD_PX_W * FOG_RENDER_SCALE)
const INTERNAL_H = Math.round(BOARD_PX_H * FOG_RENDER_SCALE)
const FOG_FRAME_MS = 1000 / 30

// ---------------------------------------------------------------------------
// Rank → opacity / blob parameters (10 levels)
// ---------------------------------------------------------------------------

const RANK_OPACITY: Record<1|2|3|4|5|6|7|8|9|10, number> = {
  1: 0.35, 2: 0.41, 3: 0.46, 4: 0.52, 5: 0.57,
  6: 0.62, 7: 0.68, 8: 0.74, 9: 0.82, 10: 0.91
}
const RANK_BLOB_COUNT: Record<1|2|3|4|5|6|7|8|9|10, number> = {
  1: 6, 2: 7, 3: 9, 4: 10, 5: 12,
  6: 13, 7: 15, 8: 17, 9: 20, 10: 22
}

// ---------------------------------------------------------------------------
// Layer state
// ---------------------------------------------------------------------------

type FogLayer = {
  canvas: HTMLCanvasElement
  driftX: number
  driftY: number
  offsetX: number
  offsetY: number
  alpha: number
}

function createLayerCanvas(): HTMLCanvasElement {
  const layer = document.createElement('canvas')
  layer.width = INTERNAL_W
  layer.height = INTERNAL_H
  return layer
}

function paintLayer(layerCtx: CanvasRenderingContext2D, puffCount: number, alphaScale: number): void {
  layerCtx.clearRect(0, 0, INTERNAL_W, INTERNAL_H)
  layerCtx.filter = 'blur(10px)'

  for (let index = 0; index < puffCount; index++) {
    const x = Math.random() * INTERNAL_W
    const y = Math.random() * INTERNAL_H
    const radius = 24 + Math.random() * 34
    const scaleX = 1.7 + Math.random() * 1.5
    const scaleY = 0.4 + Math.random() * 0.3
    const angle = (Math.random() - 0.5) * 0.25
    const rC = 178 + Math.floor(Math.random() * 38)
    const gC = 185 + Math.floor(Math.random() * 30)
    const bC = 202 + Math.floor(Math.random() * 38)
    const alpha = (0.34 + Math.random() * 0.34) * alphaScale

    layerCtx.save()
    layerCtx.translate(x, y)
    layerCtx.rotate(angle)
    layerCtx.scale(scaleX, scaleY)

    const grad = layerCtx.createRadialGradient(0, 0, 0, 0, 0, radius)
    grad.addColorStop(0, `rgba(${rC},${gC},${bC},${alpha.toFixed(3)})`)
    grad.addColorStop(0.6, `rgba(${rC},${gC},${bC},${(alpha * 0.55).toFixed(3)})`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')

    layerCtx.beginPath()
    layerCtx.arc(0, 0, radius, 0, Math.PI * 2)
    layerCtx.fillStyle = grad
    layerCtx.fill()
    layerCtx.restore()
  }

  // Add a soft lower band so high-rank fog feels dense without many animated puffs.
  const floorBand = layerCtx.createLinearGradient(0, INTERNAL_H * 0.45, 0, INTERNAL_H)
  floorBand.addColorStop(0, 'rgba(0,0,0,0)')
  floorBand.addColorStop(0.7, `rgba(188,196,208,${(0.10 * alphaScale).toFixed(3)})`)
  floorBand.addColorStop(1, `rgba(188,196,208,${(0.24 * alphaScale).toFixed(3)})`)
  layerCtx.fillStyle = floorBand
  layerCtx.fillRect(0, 0, INTERNAL_W, INTERNAL_H)

  layerCtx.filter = 'none'
}

function makeLayer(rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10, layerIndex: number, layerCount: number): FogLayer {
  const layerCanvas = createLayerCanvas()
  const layerCtx = layerCanvas.getContext('2d')!
  const puffCount = Math.max(4, Math.ceil(RANK_BLOB_COUNT[rank] / layerCount))
  const alphaScale = 0.9 - layerIndex * 0.18
  paintLayer(layerCtx, puffCount, alphaScale)

  return {
    canvas: layerCanvas,
    driftX: ((layerIndex % 2 === 0 ? 1 : -1) * (4 + rank + layerIndex * 1.5)) * FOG_RENDER_SCALE,
    driftY: -(0.6 + layerIndex * 0.35) * FOG_RENDER_SCALE,
    offsetX: Math.random() * INTERNAL_W,
    offsetY: Math.random() * INTERNAL_H,
    alpha: 0.55 + layerIndex * 0.12,
  }
}

function rebuildLayers(rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): FogLayer[] {
  const layerCount = rank >= 8 ? 3 : 2
  return Array.from({ length: layerCount }, (_, index) => makeLayer(rank, index, layerCount))
}

function drawWrappedLayer(targetCtx: CanvasRenderingContext2D, layer: FogLayer): void {
  const layerW = layer.canvas.width
  const layerH = layer.canvas.height
  const offsetX = ((layer.offsetX % layerW) + layerW) % layerW
  const offsetY = ((layer.offsetY % layerH) + layerH) % layerH

  for (const x of [-offsetX, -offsetX + layerW]) {
    for (const y of [-offsetY, -offsetY + layerH]) {
      targetCtx.drawImage(layer.canvas, x, y)
    }
  }
}

// ---------------------------------------------------------------------------
// Canvas and module state
// ---------------------------------------------------------------------------

const CANVAS_ID = 'fog-canvas'
const GAME_CONTAINER = 'game'

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let layers: FogLayer[] = []
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
  // Render fog at half-resolution and let CSS scale it up. The blur hides the
  // reduced detail but the lower fill-rate materially improves performance.
  canvas.width = INTERNAL_W
  canvas.height = INTERNAL_H

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

  if (lastTs === 0) {
    lastTs = ts
  }

  const elapsed = ts - lastTs
  if (elapsed < FOG_FRAME_MS) {
    rafId = requestAnimationFrame(tick)
    return
  }

  const dt = Math.min(elapsed / 1000, 0.1)
  lastTs = ts

  // Rise quickly and retreat slowly so the effect applies real pressure.
  const followStrength = fogHeight > displayedHeight ? Math.min(dt * 4.5, 1) : Math.min(dt * 1.2, 1)
  displayedHeight += (fogHeight - displayedHeight) * followStrength

  const w = canvas.width
  const h = canvas.height

  // ── Advance and draw pre-rendered layers ────────────────────────
  for (const layer of layers) {
    layer.offsetX += layer.driftX * dt
    layer.offsetY += layer.driftY * dt
  }

  ctx.clearRect(0, 0, w, h)
  for (const layer of layers) {
    ctx.globalAlpha = Math.min(1, maxOpacity * layer.alpha)
    drawWrappedLayer(ctx, layer)
  }
  ctx.globalAlpha = 1

  // ── Gradient mask ────────────────────────────────────────────────
  const safeHeight = Math.max(displayedHeight * FOG_RENDER_SCALE, 0)
  const fadeZone = Math.max(6, safeHeight * 0.14)
  const topOfFog = h - safeHeight

  const topFrac = Math.max(0, Math.min(1, topOfFog / h))
  const fadeFrac = Math.max(0, Math.min(1, (topOfFog + fadeZone) / h))

  ctx.globalCompositeOperation = 'destination-in'
  const mask = ctx.createLinearGradient(0, 0, 0, h)
  mask.addColorStop(0, 'rgba(0,0,0,0)')
  mask.addColorStop(topFrac, 'rgba(0,0,0,0)')
  mask.addColorStop(fadeFrac, 'rgba(0,0,0,0.92)')
  mask.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.fillStyle = mask
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'

  rafId = requestAnimationFrame(tick)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function enableFog(rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10): void {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }

  maxOpacity = RANK_OPACITY[rank]

  const c = getOrCreateCanvas()
  ctx = c.getContext('2d')!

  // Sync position to actual board DOM rect (accounts for Phaser scaling)
  syncCanvasPosition()

  layers = rebuildLayers(rank)

  displayedHeight = Math.max(displayedHeight, fogHeight)
  lastTs = 0
  rafId = requestAnimationFrame(tick)
}

export function setFogHeight(px: number): void {
  fogHeight = Math.max(0, px)
}

export function disableFog(): void {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
  
  // Clean up layer memory
  for (const layer of layers) {
    // Firefox may hold onto canvas memory; explicitly clear it
    const layerCtx = layer.canvas.getContext('2d')
    if (layerCtx) {
      layerCtx.clearRect(0, 0, layer.canvas.width, layer.canvas.height)
    }
  }
  layers = []
  
  if (ctx && canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  fogHeight = 0
  displayedHeight = 0
}
