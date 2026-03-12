/**
 * shop.ts — Between-level Vex Shop overlay.
 *
 * Renders 3 card choices as an HTML/CSS overlay on top of the Phaser canvas.
 * Cards are either:
 *   - A new Vex at rank 1 (if the player doesn't already own it), or
 *   - A rank-up offer for an Vex the player already owns (max rank 3).
 *
 * Rules (from vision.md):
 *   - If activeVexes.length < 2  → only offer new rank-1 Vexes.
 *   - If activeVexes.length >= 2 → allow rank-ups.
 *   - Never offer a rank-up to an already rank-3 Vex.
 *   - Show exactly 3 cards. If there aren't enough valid options, pad with
 *     whatever is available (the pool always has at least 6 distinct Vexes).
 */

import { Vex, STARTER_VEX_FACTORIES, VexId, upgradeVex } from './vex'

/** A single item the shop can offer. */
type ShopOffer =
    | { type: 'new'; vexId: VexId }
    | { type: 'rankup'; vex: Vex; fromRank: 1 | 2 | 3; toRank: 2 | 3 }

// ---------------------------------------------------------------------------
// CSS – injected once into the document <head>
// ---------------------------------------------------------------------------
const SHOP_CSS = `
#vextris-shop {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.82);
  z-index: 1000;
  font-family: "Press Start 2P", monospace;
  gap: 24px;
  backdrop-filter: blur(4px);
  touch-action: none;
}

#vextris-shop h2 {
  color: #fff;
  font-size: 20px;
  letter-spacing: 2px;
  margin: 0;
  text-align: center;
  text-shadow: 0 0 18px rgba(50, 205, 50, 0.8);
}

#vextris-shop .shop-subtitle {
  color: #888;
  font-size: 9px;
  letter-spacing: 1px;
  margin-top: -16px;
  text-align: center;
}

#vextris-shop .cards {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  justify-content: center;
}

#vextris-shop .card {
  width: 200px;
  min-height: 240px;
  background: #0d1117;
  border: 2px solid #333;
  border-radius: 10px;
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
  box-sizing: border-box;
}

#vextris-shop .card:hover {
  transform: translateY(-6px) scale(1.03);
  border-color: #32CD32;
  box-shadow: 0 0 20px rgba(50, 205, 50, 0.35);
}

#vextris-shop .card.color-vex {
  border-color: #4a3a00;
}
#vextris-shop .card.color-vex:hover {
  border-color: #FFD700;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.35);
}
#vextris-shop .card.line-vex {
  border-color: #00274a;
}
#vextris-shop .card.line-vex:hover {
  border-color: #00BFFF;
  box-shadow: 0 0 20px rgba(0, 191, 255, 0.35);
}

#vextris-shop .card-label {
  font-size: 8px;
  letter-spacing: 1px;
  text-transform: uppercase;
  padding: 3px 7px;
  border-radius: 4px;
  display: inline-block;
  align-self: flex-start;
}
.color-vex .card-label { background: #2a1f00; color: #FFD700; }
.line-vex  .card-label { background: #001a2e; color: #00BFFF; }
.rankup-badge { background: #1a003a; color: #bf8fff; }

#vextris-shop .card-name {
  font-size: 11px;
  color: #fff;
  line-height: 1.6;
  padding-right: 4px;
}

#vextris-shop .card-rank {
  font-size: 9px;
  color: #888;
}
#vextris-shop .card-rank .new-rank { color: #32CD32; }
#vextris-shop .card-rank .up-rank  { color: #bf8fff; }

#vextris-shop .card-desc {
  font-size: 8px;
  color: #bbb;
  line-height: 1.8;
  flex: 1;
  padding: 4px 0;
}

#vextris-shop .card-downside {
  font-size: 7px;
  color: #FF6347;
  line-height: 1.7;
  border-top: 1px solid #2a2a2a;
  padding-top: 8px;
}

#vextris-shop .card-mult {
  font-size: 8px;
  color: #32CD32;
  align-self: flex-end;
}
`

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Shows the Vex shop overlay.
 *
 * @param activeVexes   The player's currently active Vex array (mutated in-place on pick).
 * @param completedLevel The level number just completed (used to title the screen).
 * @param onPick        Called after the player picks a card, with the updated activeVexes.
 */
export function showVexShop(
    activeVexes: Vex[],
    completedLevel: number,
    onPick: (activeVexes: Vex[]) => void,
): void {
    injectCSS()

    const offers = buildOffers(activeVexes)

    const overlay = document.createElement('div')
    overlay.id = 'vextris-shop'
    overlay.innerHTML = `
    <h2>LEVEL ${completedLevel} CLEAR!</h2>
    <div class="shop-subtitle">CHOOSE YOUR VEX</div>
    <div class="cards">
      ${offers.map((o, i) => renderCard(o, i)).join('')}
    </div>
  `

    document.body.appendChild(overlay)

    // Attach click handlers to cards
    overlay.querySelectorAll<HTMLElement>('.card').forEach((el) => {
        const idx = Number(el.dataset.offerIdx)
        el.addEventListener('click', () => {
            const offer = offers[idx]
            applyOffer(offer, activeVexes)
            overlay.remove()
            onPick(activeVexes)
        })
    })
}

// ---------------------------------------------------------------------------
// Offer generation
// ---------------------------------------------------------------------------

function buildOffers(activeVexes: Vex[]): ShopOffer[] {
    const ownedIds = new Set(activeVexes.map((v) => v.id as VexId))
    const allIds = Object.keys(STARTER_VEX_FACTORIES) as VexId[]

    // --- New-Vex pool: Vexes the player doesn't own yet ---
    const newVexPool: ShopOffer[] = allIds
        .filter((id) => !ownedIds.has(id))
        .map((vexId) => ({ type: 'new', vexId }))

    // --- Rank-up pool: owned Vexes not yet at rank 3 ---
    const rankupPool: ShopOffer[] = activeVexes
        .filter((v) => v.rank < 3)
        .map((vex) => ({
            type: 'rankup' as const,
            vex,
            fromRank: vex.rank as 1 | 2 | 3,
            toRank: (vex.rank + 1) as 2 | 3,
        }))

    // --- Per vision.md: if player has < 2 Vexes, only offer new ones ---
    const allowRankups = activeVexes.length >= 2

    let candidates: ShopOffer[] = allowRankups
        ? shuffle([...newVexPool, ...rankupPool])
        : shuffle([...newVexPool])

    // Guarantee at least one new Vex if possible (don't show all rank-ups)
    if (allowRankups && newVexPool.length > 0) {
        const hasNew = candidates.slice(0, 3).some((o) => o.type === 'new')
        if (!hasNew) {
            const newOffer = shuffle([...newVexPool])[0]
            candidates = [newOffer, ...candidates.filter((o) => o !== newOffer)]
        }
    }

    // Take up to 3; pad with new-vex pool if short
    const chosen = candidates.slice(0, 3)
    while (chosen.length < 3 && newVexPool.length > 0) {
        const extra = newVexPool.find((n) => !chosen.includes(n))
        if (!extra) break
        chosen.push(extra)
    }

    return chosen
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderCard(offer: ShopOffer, idx: number): string {
    if (offer.type === 'new') {
        const factory = STARTER_VEX_FACTORIES[offer.vexId]
        const proto = factory(1) // rank-1 preview instance
        const kindClass = proto.kind === 'color' ? 'color-vex' : 'line-vex'
        const kindLabel = proto.kind === 'color' ? 'COLOUR VEX' : 'LINE VEX'
        const mult = proto.getMultiplier({ linesCleared: 1, clusters: [], totalClusterPoints: 1, maxClusterSize: 0, colorsInMove: new Set(), moveIndex: 0, combo: 0, timeRemaining: 999, currentLevel: 1 }, 1)

        return `
      <div class="card ${kindClass}" data-offer-idx="${idx}">
        <span class="card-label">${kindLabel}</span>
        <div class="card-name">${proto.name}</div>
        <div class="card-rank"><span class="new-rank">NEW — RANK I</span></div>
        <div class="card-desc">${proto.description}</div>
        <div class="card-downside">⚠ ${proto.downsideDescription}</div>
        <div class="card-mult">+${(mult * 100).toFixed(0)}% mult</div>
      </div>
    `
    } else {
        // rank-up
        const { vex, fromRank, toRank } = offer
        const kindClass = vex.kind === 'color' ? 'color-vex' : 'line-vex'
        const kindLabel = vex.kind === 'color' ? 'COLOUR VEX' : 'LINE VEX'
        const rankNumeral = (r: number) => ['I', 'II', 'III'][r - 1]

        // Multiplier delta: toRank minus fromRank
        const dummyCtx = { linesCleared: 1, clusters: [], totalClusterPoints: 1, maxClusterSize: 0, colorsInMove: new Set<number>(), moveIndex: 0, combo: 0, timeRemaining: 999, currentLevel: 1 }
        const multBefore = vex.getMultiplier(dummyCtx, fromRank)
        const multAfter = vex.getMultiplier(dummyCtx, toRank)
        const multDelta = multAfter - multBefore

        return `
      <div class="card ${kindClass}" data-offer-idx="${idx}">
        <span class="card-label rankup-badge">⬆ RANK UP</span>
        <span class="card-label ${kindClass === 'color-vex' ? '' : ''}" style="margin-top:2px">${kindLabel}</span>
        <div class="card-name">${vex.name}</div>
        <div class="card-rank">
          <span style="color:#888">${rankNumeral(fromRank)}</span>
          <span style="color:#fff"> → </span>
          <span class="up-rank">${rankNumeral(toRank)}</span>
        </div>
        <div class="card-desc">${vex.description}</div>
        <div class="card-downside">⚠ ${vex.downsideDescription}</div>
        <div class="card-mult">+${(multDelta * 100).toFixed(0)}% more mult</div>
      </div>
    `
    }
}

// ---------------------------------------------------------------------------
// Apply offer
// ---------------------------------------------------------------------------

function applyOffer(offer: ShopOffer, activeVexes: Vex[]): void {
    if (offer.type === 'new') {
        const newVex = STARTER_VEX_FACTORIES[offer.vexId](1)
        activeVexes.push(newVex)
        newVex.onApply?.(1)
    } else {
        upgradeVex(offer.vex, offer.toRank)
    }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
            ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
}

let cssInjected = false
function injectCSS(): void {
    if (cssInjected) return
    cssInjected = true
    const style = document.createElement('style')
    style.textContent = SHOP_CSS
    document.head.appendChild(style)
}
