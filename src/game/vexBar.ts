/**
 * vexBar.ts — Balatro-style Vex card row across the top of the game.
 *
 * Renders active Vexes as small cards inside #game, positioned above the board.
 * Cards show a coloured kind badge, short name, and Roman numeral rank.
 *
 * Usage:
 *   updateVexBar(activeVexes)  — call each frame or on change; creates the bar on first call.
 *   removeVexBar()             — remove the bar from the DOM.
 */

import { Vex } from './vex'

const BAR_ID = 'vex-bar'
const GAME_CONTAINER = 'game'

// Positional constants — sits between top of #game and board start (y=112)
const BAR_TOP = 8
const BAR_LEFT = 48   // board left edge
const BAR_WIDTH = 320  // board width (320px = 10 blocks × 32px)

const RANK_NUMERAL = ['', 'I', 'II', 'III']

const BAR_CSS = `
/* ── Vex card bar ─────────────────────────────────────────────────── */
#${BAR_ID} {
  position: absolute;
  top:   ${BAR_TOP}px;
  left:  ${BAR_LEFT}px;
  width: ${BAR_WIDTH}px;
  height: 90px;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 0 2px 4px;
  pointer-events: none;
  z-index: 600;
}

/* ── Individual Vex card ─────────────────────────────────────────── */
.vex-card {
  flex: 1;
  max-width: 56px;
  min-width: 44px;
  height: 78px;
  background: linear-gradient(160deg, #0d1520 0%, #080e18 100%);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 0 4px 5px;
  gap: 3px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 3px 10px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  animation: vex-card-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both;
}

/* Top accent bar coloured by kind */
.vex-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  border-radius: 6px 6px 0 0;
}
.vex-card.color-vex::before { background: linear-gradient(90deg, #b8860b, #FFD700, #b8860b); }
.vex-card.line-vex::before  { background: linear-gradient(90deg, #005f8f, #00BFFF, #005f8f); }

/* Left edge glow strip */
.vex-card::after {
  content: '';
  position: absolute;
  top: 3px; left: 0; bottom: 0;
  width: 2px;
  border-radius: 0 0 0 6px;
}
.vex-card.color-vex::after { background: rgba(255, 215, 0, 0.25); }
.vex-card.line-vex::after  { background: rgba(0, 191, 255, 0.25); }

/* Border */
.vex-card.color-vex { border: 1px solid rgba(255,215,0,0.30); }
.vex-card.line-vex  { border: 1px solid rgba(0,191,255,0.25); }

/* Kind badge */
.vex-card-kind {
  font-family: "Press Start 2P", monospace;
  font-size: 5px;
  letter-spacing: 0.5px;
  padding: 2px 4px;
  border-radius: 3px;
  text-transform: uppercase;
  align-self: stretch;
  text-align: center;
}
.color-vex .vex-card-kind { background: rgba(255,215,0,0.12); color: #FFD700; }
.line-vex  .vex-card-kind { background: rgba(0,191,255,0.10); color: #00BFFF; }

/* Vex name */
.vex-card-name {
  font-family: "Press Start 2P", monospace;
  font-size: 6px;
  color: #ddd;
  text-align: center;
  line-height: 1.4;
  word-break: break-word;
}

/* Rank badge (Roman numeral) */
.vex-card-rank {
  font-family: "Press Start 2P", monospace;
  font-size: 8px;
  font-weight: bold;
}
.color-vex .vex-card-rank { color: #FFD700; }
.line-vex  .vex-card-rank { color: #00BFFF; }

/* Slide-in animation when a card appears */
@keyframes vex-card-in {
  from { opacity: 0; transform: translateY(10px) scale(0.85); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}
`

let cssInjected = false
function injectCSS(): void {
    if (cssInjected) return
    cssInjected = true
    const s = document.createElement('style')
    s.textContent = BAR_CSS
    document.head.appendChild(s)
}

function getOrCreateBar(): HTMLElement {
    let bar = document.getElementById(BAR_ID)
    if (!bar) {
        injectCSS()
        bar = document.createElement('div')
        bar.id = BAR_ID
        const container = document.getElementById(GAME_CONTAINER)
        if (container) container.appendChild(bar)
    }
    return bar
}

// Track last rendered state so we only update the DOM on actual changes
let lastRendered = ''

export function updateVexBar(activeVexes: Vex[]): void {
    const key = activeVexes.map(v => `${v.id}:${v.rank}`).join(',')
    if (key === lastRendered) return   // no change — skip DOM update
    lastRendered = key

    const bar = getOrCreateBar()

    bar.innerHTML = activeVexes.map(vex => {
        const kindClass = vex.kind === 'color' ? 'color-vex' : 'line-vex'
        const kindLabel = vex.kind === 'color' ? 'COLOUR' : 'LINE'
        const shortName = vex.name.replace('Vex of ', '')
        const rank = RANK_NUMERAL[vex.rank] ?? ''

        return `
      <div class="vex-card ${kindClass}">
        <span class="vex-card-kind">${kindLabel}</span>
        <span class="vex-card-name">${shortName}</span>
        <span class="vex-card-rank">${rank}</span>
      </div>
    `
    }).join('')
}

export function removeVexBar(): void {
    document.getElementById(BAR_ID)?.remove()
    lastRendered = ''
}
