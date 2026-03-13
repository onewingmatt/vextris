/**
 * shop.ts — Between-level Vex Shop overlay.
 *
 * Renders 3 card choices as an HTML/CSS overlay on top of the Phaser canvas.
 * Cards are either:
 *   - A new Vex at rank 1 (if the player doesn't already own it), or
 *   - A rank-up offer for a Vex the player already owns (max rank 10).
 *
 * Rules:
 *   - Offer pool includes both new Vexes and rank-ups each shop.
 *   - Never offer rank-ups for rank-10 Vexes.
 *   - Prefer at least one new Vex when any remain.
 *   - Show up to 3 cards from available candidates.
 */

import { Vex, STARTER_VEX_FACTORIES, VexId, upgradeVex } from './vex'
import { audioManager } from './audio'

/** A single item the shop can offer. */
import type { VexRank } from './vex'
type ShopOffer =
  | { type: 'new'; vexId: VexId }
  | { type: 'rankup'; vex: Vex; fromRank: VexRank; toRank: VexRank }

const QUICKSAND_PRIORITY_CHANCE = 0.9

function clampVexRank(rank: number): VexRank {
  return Math.max(1, Math.min(10, Math.floor(rank))) as VexRank
}

function isQuicksandOffer(offer: ShopOffer): boolean {
  return offer.type === 'new' ? offer.vexId === 'quicksand' : offer.vex.id === 'quicksand'
}

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
  width: min(100%, 720px);
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
  font: inherit;
  color: inherit;
  text-align: left;
  appearance: none;
  -webkit-appearance: none;
}

#vextris-shop .card:hover,
#vextris-shop .card:focus-visible {
  transform: translateY(-6px) scale(1.03);
  border-color: #32CD32;
  box-shadow: 0 0 20px rgba(50, 205, 50, 0.35);
}

#vextris-shop .card:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

#vextris-shop .card.color-vex {
  border-color: #4a3a00;
}
#vextris-shop .card.color-vex:hover,
#vextris-shop .card.color-vex:focus-visible {
  border-color: #FFD700;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.35);
}
#vextris-shop .card.line-vex {
  border-color: #00274a;
}
#vextris-shop .card.line-vex:hover,
#vextris-shop .card.line-vex:focus-visible {
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
.card-label-secondary { margin-top: 2px; }

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

@media (max-width: 700px) {
  #vextris-shop {
    justify-content: flex-start;
    gap: 16px;
    padding: 14px 10px 18px;
    overflow-y: auto;
  }

  #vextris-shop h2 {
    font-size: 16px;
  }

  #vextris-shop .shop-subtitle {
    margin-top: -10px;
  }

  #vextris-shop .cards {
    width: 100%;
    gap: 12px;
  }

  #vextris-shop .card {
    width: min(100%, 360px);
    min-height: 0;
    padding: 14px 12px;
  }
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
  audioManager.playSfx('shopOpen')

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
    overlay.querySelectorAll<HTMLButtonElement>('button.card').forEach((el) => {
        const idx = Number(el.dataset.offerIdx)
        el.addEventListener('click', () => {
            const offer = offers[idx]
        if (!offer) return
          audioManager.playSfx('uiClick')
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

    // --- Rank-up pool: owned Vexes not yet at rank 10 ---
    const rankupPool: ShopOffer[] = activeVexes
      .filter((v) => v.rank < 10)
      .map((vex) => ({
        type: 'rankup' as const,
        vex,
        fromRank: vex.rank,
        toRank: clampVexRank(vex.rank + 1),
      }))

    const candidates: ShopOffer[] = shuffle([...newVexPool, ...rankupPool]);
    const chosen: ShopOffer[] = []

    // Quicksand should be available in most shops when it is eligible.
    const quicksandOffer = candidates.find(isQuicksandOffer)
    if (quicksandOffer && Math.random() < QUICKSAND_PRIORITY_CHANCE) {
      chosen.push(quicksandOffer)
    }

    // Guarantee at least one new Vex if possible (don't show all rank-ups).
    if (newVexPool.length > 0 && !chosen.some((offer) => offer.type === 'new')) {
      const availableNewOffers = newVexPool.filter((offer) => !chosen.includes(offer))
      if (availableNewOffers.length > 0) {
        chosen.push(shuffle([...availableNewOffers])[0])
      }
    }

    const remaining = shuffle(candidates.filter((offer) => !chosen.includes(offer)))
    for (const offer of remaining) {
      if (chosen.length >= 3) break
      chosen.push(offer)
    }

    return chosen.slice(0, 3)
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderCard(offer: ShopOffer, idx: number): string {
    if (offer.type === 'new') {
        const factory = STARTER_VEX_FACTORIES[offer.vexId];
        const proto = factory(1); // rank-1 preview instance
        const kindClass = proto.kind === 'color' ? 'color-vex' : 'line-vex';
        const kindLabel = proto.kind === 'color' ? 'COLOUR VEX' : 'LINE VEX';
        const mult = proto.getMultiplier({ linesCleared: 1, clusters: [], totalClusterPoints: 1, maxClusterSize: 0, colorsInMove: new Set(), moveIndex: 0, combo: 0, timeRemaining: 999, currentLevel: 1 }, 1);

        return `
      <button type="button" class="card ${kindClass}" data-offer-idx="${idx}">
        <span class="card-label">${kindLabel}</span>
        <div class="card-name">${proto.name}</div>
        <div class="card-rank"><span class="new-rank">NEW - RANK 1</span></div>
        <div class="card-desc">${proto.description}</div>
        <div class="card-downside">⚠ ${proto.downsideDescription}</div>
        <div class="card-mult">+${(mult * 100).toFixed(0)}% mult</div>
      </button>
    `;
    }

    const { vex, fromRank, toRank } = offer
    const kindClass = vex.kind === 'color' ? 'color-vex' : 'line-vex'
    const kindLabel = vex.kind === 'color' ? 'COLOUR VEX' : 'LINE VEX'

    const dummyCtx = {
      linesCleared: 1,
      clusters: [],
      totalClusterPoints: 1,
      maxClusterSize: 0,
      colorsInMove: new Set<number>(),
      moveIndex: 0,
      combo: 0,
      timeRemaining: 999,
      currentLevel: 1,
    }
    const multBefore = vex.getMultiplier(dummyCtx, fromRank)
    const multAfter = vex.getMultiplier(dummyCtx, toRank)
    const multDelta = Math.max(0, multAfter - multBefore)

    return `
      <button type="button" class="card ${kindClass}" data-offer-idx="${idx}">
        <span class="card-label rankup-badge">RANK UP</span>
        <span class="card-label card-label-secondary">${kindLabel}</span>
        <div class="card-name">${vex.name}</div>
        <div class="card-rank">
          <span style="color:#888">RANK ${fromRank}</span>
          <span style="color:#fff"> -> </span>
          <span class="up-rank">RANK ${toRank}</span>
        </div>
        <div class="card-desc">${vex.description}</div>
        <div class="card-downside">⚠ ${vex.downsideDescription}</div>
        <div class="card-mult">+${(multDelta * 100).toFixed(0)}% more mult</div>
      </button>
    `
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
