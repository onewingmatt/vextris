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

const RANK_NUMERAL = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

const BAR_CSS = `
/* ── Vex card bar ─────────────────────────────────────────────────── */
#${BAR_ID} {
  position: absolute;
  top: ${BAR_TOP}px;
  left: ${BAR_LEFT}px;
  width: ${BAR_WIDTH}px;
  height: 96px;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  grid-auto-rows: 44px;
  gap: 4px;
  padding: 2px 0 2px;
  pointer-events: none;
  z-index: 600;
}

/* ── Individual Vex card ─────────────────────────────────────────── */
.vex-card {
  min-width: 0;
  height: 44px;
  background: linear-gradient(165deg, #1a1420 0%, #110d17 100%);
  border-radius: 1px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 2px 3px 3px;
  gap: 1px;
  position: relative;
  overflow: visible;
  box-shadow: 0 2px 6px rgba(0,0,0,0.62), inset 0 1px 0 rgba(240,220,200,0.06);
  animation: vex-card-in 0.22s ease-out both;
}

/* Top accent bar coloured by kind */
.vex-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  border-radius: 1px 1px 0 0;
}
.vex-card.color-vex::before { background: linear-gradient(90deg, #87633b, #caa56c, #87633b); }
.vex-card.line-vex::before  { background: linear-gradient(90deg, #4e6f7b, #89acb8, #4e6f7b); }

/* Left edge glow strip */
.vex-card::after {
  content: '';
  position: absolute;
  top: 2px; left: 0; bottom: 0;
  width: 2px;
  border-radius: 0;
}
.vex-card.color-vex.common::after { background: rgba(180, 180, 180, 0.26); }
.vex-card.color-vex.uncommon::after { background: rgba(100, 180, 100, 0.26); }
.vex-card.color-vex.rare::after { background: rgba(100, 140, 220, 0.26); }
.vex-card.color-vex.mythic::after { background: rgba(180, 100, 220, 0.26); }
.vex-card.line-vex.common::after { background: rgba(180, 180, 180, 0.24); }
.vex-card.line-vex.uncommon::after { background: rgba(100, 180, 100, 0.24); }
.vex-card.line-vex.rare::after { background: rgba(100, 140, 220, 0.24); }
.vex-card.line-vex.mythic::after { background: rgba(180, 100, 220, 0.24); }

/* Border with rarity colors */
.vex-card.color-vex.common { border: 1px solid rgba(180,180,180,0.34); box-shadow: 0 2px 8px rgba(180,180,180,0.12); }
.vex-card.color-vex.uncommon { border: 1px solid rgba(100,180,100,0.34); box-shadow: 0 2px 8px rgba(100,180,100,0.12); }
.vex-card.color-vex.rare { border: 1px solid rgba(100,140,220,0.34); box-shadow: 0 2px 8px rgba(100,140,220,0.12); }
.vex-card.color-vex.mythic { border: 1px solid rgba(180,100,220,0.34); box-shadow: 0 2px 8px rgba(180,100,220,0.12); }
.vex-card.line-vex.common { border: 1px solid rgba(180,180,180,0.28); box-shadow: 0 2px 8px rgba(180,180,180,0.10); }
.vex-card.line-vex.uncommon { border: 1px solid rgba(100,180,100,0.28); box-shadow: 0 2px 8px rgba(100,180,100,0.10); }
.vex-card.line-vex.rare { border: 1px solid rgba(100,140,220,0.28); box-shadow: 0 2px 8px rgba(100,140,220,0.10); }
.vex-card.line-vex.mythic { border: 1px solid rgba(180,100,220,0.28); box-shadow: 0 2px 8px rgba(180,100,220,0.10); }

/* Kind badge */
.vex-card-kind {
  font-family: "Press Start 2P", monospace;
  font-size: 4px;
  letter-spacing: 0.5px;
  padding: 1px 3px;
  border-radius: 1px;
  text-transform: uppercase;
  align-self: stretch;
  text-align: center;
}
.color-vex .vex-card-kind { background: rgba(202,165,108,0.14); color: #caa56c; }
.line-vex  .vex-card-kind { background: rgba(137,172,184,0.12); color: #89acb8; }

/* Vex name */
.vex-card-name {
  font-family: "Press Start 2P", monospace;
  font-size: 5px;
  color: #dac7b4;
  text-align: center;
  line-height: 1.2;
  word-break: break-word;
  padding: 0 1px;
}

/* Rank badge (Roman numeral) */
.vex-card-rank {
  font-family: "Press Start 2P", monospace;
  font-size: 7px;
  font-weight: bold;
}
.color-vex .vex-card-rank { color: #d1ae72; }
.line-vex  .vex-card-rank { color: #96b8c4; }

/* Slide-in animation when a card appears */
@keyframes vex-card-in {
  from { opacity: 0; transform: translateY(6px) scale(0.94); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}

/* Rank-up pulse animation */
@keyframes vex-rank-up {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); box-shadow: 0 0 24px rgba(255, 255, 255, 0.6); }
  100% { transform: scale(1); }
}

.vex-card.rank-up {
  animation: vex-rank-up 0.4s ease-out;
}

/* Tooltip styles */
.vex-card-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-8px);
  width: 220px;
  background: linear-gradient(165deg, #1a1420 0%, #0f0c14 100%);
  border: 2px solid #4a2c34;
  border-radius: 8px;
  padding: 10px 12px;
  font-family: "Press Start 2P", monospace;
  font-size: 7px;
  color: #d8c5b1;
  line-height: 1.8;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8), 0 0 12px rgba(74, 44, 52, 0.6);
  z-index: 700;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
  pointer-events: none;
}

.vex-card:hover .vex-card-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) translateY(-4px);
}

.vex-card-tooltip-title {
  font-size: 8px;
  color: #f0e6d8;
  margin-bottom: 6px;
  text-transform: uppercase;
}

.vex-card-tooltip-kind {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 6px;
  margin-right: 6px;
}

.vex-card-tooltip-rarity {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 6px;
  background: #2a1f28;
  color: #c9b8aa;
}

.vex-card-tooltip-desc {
  color: #c1b2a4;
  margin: 8px 0;
}

.vex-card-tooltip-downside {
  color: #b56f65;
  border-top: 1px solid #3a2730;
  padding-top: 8px;
  margin-top: 8px;
}

.vex-card-tooltip-flavor {
  font-style: italic;
  color: #9a8b80;
  border-top: 1px solid #3a2730;
  padding-top: 8px;
  margin-top: 8px;
  line-height: 1.9;
}

/* Rarity tooltip colors */
.vex-card-tooltip.common .vex-card-tooltip-kind { background: #2a2a2a; color: #b4b4b4; }
.vex-card-tooltip.uncommon .vex-card-tooltip-kind { background: #1f2a1f; color: #64b464; }
.vex-card-tooltip.rare .vex-card-tooltip-kind { background: #1f242a; color: #648cdc; }
.vex-card-tooltip.mythic .vex-card-tooltip-kind { background: #2a1f2a; color: #b464dc; }
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

export function updateVexBar(activeVexes: Vex[], justRankedUpVexId?: string): void {
    const key = activeVexes.map(v => `${v.id}:${v.rank}`).join(',')
    if (key === lastRendered) return   // no change — skip DOM update
    lastRendered = key

    const bar = getOrCreateBar()

    bar.innerHTML = activeVexes.map(vex => {
        const kindClass = vex.kind === 'color' ? 'color-vex' : 'line-vex';
        const kindLabel = vex.kind === 'color' ? 'COLOUR' : 'LINE';
        const shortName = vex.name.replace('Vex of ', '');
        const rarityClass = vex.rarity;
        const rankUpClass = justRankedUpVexId === vex.id ? ' rank-up' : '';
        let rankDisplay = '';
        if (vex.rank <= 3) {
            rankDisplay = RANK_NUMERAL[vex.rank] ?? '';
        } else {
            rankDisplay = vex.rank.toString();
        }
        const flavorText = vex.getFlavorText?.(vex.rank) ?? '';
        const multiplierValue = vex.getMultiplier({
            linesCleared: 1,
            clusters: [],
            totalClusterPoints: 1,
            maxClusterSize: 0,
            colorsInMove: new Set(),
            moveIndex: 0,
            combo: 0,
            timeRemaining: 999,
            currentLevel: 1,
        }, vex.rank);
        const multiplierPercent = Math.round(multiplierValue * 100);
        
        return `
      <div class="vex-card ${kindClass} ${rarityClass}${rankUpClass}">
        <span class="vex-card-kind">${kindLabel}</span>
        <span class="vex-card-name">${shortName}</span>
        <span class="vex-card-rank">${rankDisplay}</span>
        <div class="vex-card-tooltip vex-card-tooltip-${rarityClass}">
          <div class="vex-card-tooltip-title">
            <span class="vex-card-tooltip-kind">${vex.rarity.toUpperCase()}</span>
            <span class="vex-card-tooltip-rarity">${kindLabel} VEX</span>
          </div>
          <div class="vex-card-tooltip-desc">${vex.description}</div>
          <div class="vex-card-tooltip-downside">! ${vex.downsideDescription}</div>
          <div class="vex-card-tooltip-flavor">"${flavorText}"</div>
          <div style="margin-top:8px;color:#d7b172">+${multiplierPercent}% ${vex.kind.toUpperCase()} MULT</div>
        </div>
      </div>
    `;
    }).join('');
}

export function removeVexBar(): void {
    document.getElementById(BAR_ID)?.remove()
    lastRendered = ''
}
