/**
 * shop.ts - Between-level Vex Shop overlay.
 *
 * Renders 3 weighted main offers plus an optional Quicksand bonus slot.
 */

import { STARTER_VEX_FACTORIES, upgradeVex, getQuicksandBonusMultiplier } from './vex'
import { audioManager } from './audio'
import type { Vex, VexId, VexRank, VexRarity } from './vex'

type ShopOffer =
  | { type: 'new'; vexId: VexId }
  | { type: 'rankup'; vex: Vex; fromRank: VexRank; toRank: VexRank }

type WeightedOffer = {
  offer: ShopOffer
  weight: number
}

type QuicksandTier = {
  ranksToAdd: 1 | 2 | 3
  minResolveRatio: number
  accent: string
}

type QuicksandTierState = {
  ranksToAdd: 1 | 2 | 3
  unlocked: boolean
  disabled: boolean
  lockedReason: string
  effectiveGain: number
  resultingRank: VexRank
  multDelta: number
  accent: string
}

const QUICKSAND_TIERS: QuicksandTier[] = [
  { ranksToAdd: 1, minResolveRatio: 0, accent: '#7f8c8d' },
  { ranksToAdd: 2, minResolveRatio: 0.4, accent: '#00BFFF' },
  { ranksToAdd: 3, minResolveRatio: 0.7, accent: '#FFD700' },
]

const SHOP_CSS = `
#vextris-shop {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.82);
  z-index: 1000;
  font-family: "Press Start 2P", monospace;
  backdrop-filter: blur(4px);
  touch-action: pan-y;
}

#vextris-shop .shop-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  gap: 20px;
  padding: 18px;
  box-sizing: border-box;
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
  margin-top: -10px;
  text-align: center;
}

#vextris-shop .cards {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  justify-content: center;
  width: min(100%, 760px);
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
.line-vex .card-label { background: #001a2e; color: #00BFFF; }
.rankup-badge { background: #1a003a; color: #bf8fff; }
.rarity-badge { background: #1a1a1a; color: #cfd4db; margin-top: 2px; }

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
#vextris-shop .card-rank .up-rank { color: #bf8fff; }

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

#vextris-shop .vex-flavor-text {
  font-size: 7px;
  color: #888888;
  font-style: italic;
  line-height: 1.8;
  border-top: 1px solid #2a2a2a;
  margin-top: 6px;
  padding-top: 8px;
}

#vextris-shop .quicksand-slot {
  width: min(100%, 760px);
  background: rgba(13, 17, 23, 0.88);
  border: 2px solid #4b3a2a;
  border-radius: 10px;
  padding: 12px;
  box-sizing: border-box;
}

#vextris-shop .quicksand-title {
  font-size: 10px;
  color: #f0d9b5;
  margin-bottom: 8px;
  letter-spacing: 1px;
}

#vextris-shop .quicksand-subtitle {
  font-size: 7px;
  color: #ab9f90;
  margin-bottom: 10px;
  line-height: 1.6;
}

#vextris-shop .quicksand-tiers {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

#vextris-shop .quicksand-tier {
  min-width: 132px;
  flex: 1;
  border: 2px solid #5f5f5f;
  border-radius: 8px;
  background: #141920;
  color: #d8dee8;
  padding: 10px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
  font: inherit;
}

#vextris-shop .quicksand-tier:hover,
#vextris-shop .quicksand-tier:focus-visible {
  transform: translateY(-2px);
  box-shadow: 0 0 14px rgba(255, 215, 0, 0.18);
}

#vextris-shop .quicksand-tier.selected {
  border-color: #FFD700;
  box-shadow: 0 0 18px rgba(255, 215, 0, 0.3);
}

#vextris-shop .quicksand-tier.locked,
#vextris-shop .quicksand-tier:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
  pointer-events: none;
}

#vextris-shop .qs-tier-name {
  font-size: 8px;
  color: #f8f3e3;
  margin-bottom: 8px;
}

#vextris-shop .qs-tier-meta,
#vextris-shop .qs-tier-mult,
#vextris-shop .qs-tier-lock {
  font-size: 7px;
  line-height: 1.6;
}

#vextris-shop .qs-tier-lock {
  color: #ff6e6e;
}

@media (max-width: 700px) {
  #vextris-shop .cards {
    gap: 12px;
  }

  #vextris-shop .card {
    width: min(100%, 360px);
    min-height: 0;
    padding: 14px 12px;
  }

  #vextris-shop .quicksand-tier {
    min-width: 100%;
  }
}
`

const DUMMY_CTX = {
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

function clampVexRank(rank: number): VexRank {
  return Math.max(1, Math.min(10, Math.floor(rank))) as VexRank
}

function normalizeRarityLabel(rarity: VexRarity): string {
  switch (rarity) {
    case 'common': return 'COMMON'
    case 'uncommon': return 'UNCOMMON'
    case 'rare': return 'RARE'
    case 'mythic': return 'MYTHIC'
    default: return 'UNKNOWN'
  }
}

function getRarityWeightForLevel(level: number, rarity: VexRarity): number {
  const clampedLevel = Math.max(1, Math.min(10, Math.floor(level)))

  let profile: Record<VexRarity, number>
  if (clampedLevel <= 2) {
    profile = { common: 57, uncommon: 29, rare: 11, mythic: 3 }
  } else if (clampedLevel <= 4) {
    profile = { common: 48, uncommon: 30, rare: 17, mythic: 5 }
  } else if (clampedLevel <= 6) {
    profile = { common: 39, uncommon: 30, rare: 23, mythic: 8 }
  } else if (clampedLevel <= 8) {
    profile = { common: 32, uncommon: 28, rare: 27, mythic: 13 }
  } else {
    profile = { common: 26, uncommon: 26, rare: 31, mythic: 17 }
  }

  return profile[rarity]
}

function getOfferRarity(offer: ShopOffer): VexRarity {
  if (offer.type === 'new') {
    return STARTER_VEX_FACTORIES[offer.vexId](1).rarity
  }
  return offer.vex.rarity
}

function getOfferWeight(offer: ShopOffer, completedLevel: number): number {
  const rarity = getOfferRarity(offer)
  const baseWeight = getRarityWeightForLevel(completedLevel, rarity)

  if (offer.type === 'rankup') {
    const rankPenalty = Math.max(0.35, 1 - (offer.vex.rank - 1) * 0.06)
    return Math.max(1, baseWeight * 0.8 * rankPenalty)
  }

  // Slightly favor new offers so the roster expands at a healthy pace.
  return Math.max(1, baseWeight * 1.08)
}

function weightedPop(candidates: WeightedOffer[]): WeightedOffer | null {
  if (candidates.length === 0) return null

  const total = candidates.reduce((sum, item) => sum + item.weight, 0)
  if (total <= 0) {
    const fallbackIndex = Math.floor(Math.random() * candidates.length)
    return candidates.splice(fallbackIndex, 1)[0]
  }

  let roll = Math.random() * total
  for (let i = 0; i < candidates.length; i++) {
    roll -= candidates[i].weight
    if (roll <= 0) {
      return candidates.splice(i, 1)[0]
    }
  }

  return candidates.pop() ?? null
}

function isSameOffer(a: ShopOffer, b: ShopOffer): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'new' && b.type === 'new') return a.vexId === b.vexId
  if (a.type === 'rankup' && b.type === 'rankup') {
    return a.vex.id === b.vex.id && a.fromRank === b.fromRank && a.toRank === b.toRank
  }
  return false
}

function buildOffers(activeVexes: Vex[], completedLevel: number): ShopOffer[] {
  const ownedIds = new Set(activeVexes.map((v) => v.id as VexId))
  const allIds = (Object.keys(STARTER_VEX_FACTORIES) as VexId[]).filter((id) => id !== 'quicksand')

  const newVexPool: ShopOffer[] = allIds
    .filter((id) => !ownedIds.has(id))
    .map((vexId) => ({ type: 'new', vexId }))

  const rankupPool: ShopOffer[] = activeVexes
    .filter((v) => v.rank < 10 && v.id !== 'quicksand')
    .map((vex) => ({
      type: 'rankup' as const,
      vex,
      fromRank: vex.rank,
      toRank: clampVexRank(vex.rank + 1),
    }))

  const weightedCandidates: WeightedOffer[] = [...newVexPool, ...rankupPool].map((offer) => ({
    offer,
    weight: getOfferWeight(offer, completedLevel),
  }))

  const chosen: ShopOffer[] = []

  if (newVexPool.length > 0) {
    const weightedNew = weightedCandidates.filter((entry) => entry.offer.type === 'new')
    const guaranteed = weightedPop(weightedNew)
    if (guaranteed) {
      chosen.push(guaranteed.offer)

      for (let i = weightedCandidates.length - 1; i >= 0; i--) {
        if (isSameOffer(weightedCandidates[i].offer, guaranteed.offer)) {
          weightedCandidates.splice(i, 1)
        }
      }
    }
  }

  while (chosen.length < 3) {
    const picked = weightedPop(weightedCandidates)
    if (!picked) break
    chosen.push(picked.offer)
  }

  return chosen.slice(0, 3)
}

function getCurrentQuicksandRank(activeVexes: Vex[]): VexRank | 0 {
  return activeVexes.find((v) => v.id === 'quicksand')?.rank ?? 0
}

function quicksandMultiplierForRank(rank: number): number {
  if (rank <= 0) return 0
  return getQuicksandBonusMultiplier(clampVexRank(rank))
}

function buildQuicksandTierStates(
  resolveCurrent: number,
  resolveMax: number,
  quicksandRank: VexRank | 0,
): QuicksandTierState[] {
  const ratio = resolveMax > 0 ? resolveCurrent / resolveMax : 0

  return QUICKSAND_TIERS.map((tier) => {
    const unlocked = ratio >= tier.minResolveRatio
    const resultingRank = clampVexRank(quicksandRank + tier.ranksToAdd)
    const effectiveGain = Math.max(0, resultingRank - quicksandRank)
    const disabled = !unlocked || effectiveGain <= 0
    const multBefore = quicksandMultiplierForRank(quicksandRank)
    const multAfter = quicksandMultiplierForRank(resultingRank)

    return {
      ranksToAdd: tier.ranksToAdd,
      unlocked,
      disabled,
      lockedReason: tier.minResolveRatio <= 0 ? 'AVAILABLE' : `NEED ${Math.round(tier.minResolveRatio * 100)}% RESOLVE`,
      effectiveGain,
      resultingRank,
      multDelta: Math.max(0, multAfter - multBefore),
      accent: tier.accent,
    }
  })
}

function renderQuicksandSlot(tiers: QuicksandTierState[], quicksandRank: VexRank | 0): string {
  return `
    <div class="quicksand-slot">
      <div class="quicksand-title">BONUS HEX: QUICKSAND (OPTIONAL)</div>
      <div class="quicksand-subtitle">Resolve left lets you stack extra Quicksand ranks this shop. Pick at most one tier.</div>
      <div class="quicksand-subtitle">Current Quicksand Rank: ${quicksandRank}</div>
      <div class="quicksand-tiers">
        ${tiers.map((tier) => renderQuicksandTierCard(tier)).join('')}
      </div>
    </div>
  `
}

function renderQuicksandTierCard(tier: QuicksandTierState): string {
  const disabledAttr = tier.disabled ? 'disabled' : ''
  const lockClass = tier.disabled ? 'locked' : ''
  const title = tier.effectiveGain > 0
    ? `+${tier.effectiveGain} RANK${tier.effectiveGain > 1 ? 'S' : ''}`
    : 'MAXED'

  return `
    <button
      type="button"
      class="quicksand-tier ${lockClass}"
      data-qs-ranks="${tier.ranksToAdd}"
      style="border-color:${tier.accent};"
      ${disabledAttr}
    >
      <div class="qs-tier-name">${title}</div>
      <div class="qs-tier-meta">TARGET RANK: ${tier.resultingRank}</div>
      <div class="qs-tier-mult">+${(tier.multDelta * 100).toFixed(0)}% LINE MULT</div>
      <div class="qs-tier-lock">${tier.unlocked ? 'UNLOCKED' : tier.lockedReason}</div>
    </button>
  `
}

function getCardFlavorText(vex: Vex, rank: VexRank): string {
  return vex.getFlavorText?.(rank) ?? ''
}

export function showVexShop(
  activeVexes: Vex[],
  completedLevel: number,
  resolveCurrent: number,
  resolveMax: number,
  onPick: (activeVexes: Vex[]) => void,
): void {
  injectCSS()
  audioManager.playSfx('shopOpen')

  const offers = buildOffers(activeVexes, completedLevel)
  const quicksandRank = getCurrentQuicksandRank(activeVexes)
  const quicksandTiers = buildQuicksandTierStates(resolveCurrent, resolveMax, quicksandRank)

  const overlay = document.createElement('div')
  overlay.id = 'vextris-shop'
  overlay.innerHTML = `
    <div class="shop-inner">
      <h2>The Crossroads</h2>
      <div class="shop-subtitle">SEAL ${completedLevel} BROKEN - CHOOSE YOUR PACT</div>
      <div class="cards">
        ${offers.map((o, i) => renderCard(o, i)).join('')}
      </div>
      ${renderQuicksandSlot(quicksandTiers, quicksandRank)}
    </div>
  `

  document.body.appendChild(overlay)

  let selectedQuicksandTier: 1 | 2 | 3 | 0 = 0

  const quicksandTitleEl = overlay.querySelector<HTMLElement>('.quicksand-title')

  overlay.querySelectorAll<HTMLButtonElement>('button.quicksand-tier').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.disabled) return

      const tierValue = Number(el.dataset.qsRanks) as 1 | 2 | 3
      const alreadySelected = selectedQuicksandTier === tierValue

      overlay.querySelectorAll<HTMLButtonElement>('button.quicksand-tier').forEach((button) => {
        button.classList.remove('selected')
      })

      if (alreadySelected) {
        selectedQuicksandTier = 0
        if (quicksandTitleEl) quicksandTitleEl.textContent = 'BONUS HEX: QUICKSAND (OPTIONAL)'
      } else {
        selectedQuicksandTier = tierValue
        el.classList.add('selected')
        if (quicksandTitleEl) quicksandTitleEl.textContent = `+${tierValue} RANK SELECTED — NOW PICK A CARD`
      }

      audioManager.playSfx('uiClick')
    })
  })

  overlay.querySelectorAll<HTMLButtonElement>('button.card').forEach((el) => {
    const idx = Number(el.dataset.offerIdx)
    el.addEventListener('click', () => {
      const offer = offers[idx]
      if (!offer) return

      audioManager.playSfx('uiClick')
      applyOffer(offer, activeVexes)

      if (selectedQuicksandTier > 0) {
        applyQuicksandBonus(activeVexes, selectedQuicksandTier as 1 | 2 | 3)
      }

      overlay.remove()
      onPick(activeVexes)
    })
  })
}

function renderCard(offer: ShopOffer, idx: number): string {
  if (offer.type === 'new') {
    const factory = STARTER_VEX_FACTORIES[offer.vexId]
    const proto = factory(1)
    const kindClass = proto.kind === 'color' ? 'color-vex' : 'line-vex'
    const kindLabel = proto.kind === 'color' ? 'COLOUR VEX' : 'LINE VEX'
    const rarityLabel = normalizeRarityLabel(proto.rarity)
    const mult = proto.getMultiplier(DUMMY_CTX, 1)
    const flavorText = getCardFlavorText(proto, 1)

    return `
      <button type="button" class="card ${kindClass}" data-offer-idx="${idx}">
        <span class="card-label">${kindLabel}</span>
        <span class="card-label rarity-badge">${rarityLabel}</span>
        <div class="card-name">${proto.name}</div>
        <div class="card-rank"><span class="new-rank">NEW - RANK 1</span></div>
        <div class="card-desc">${proto.description}</div>
        <div class="card-downside">! ${proto.downsideDescription}</div>
        <div class="card-mult">+${(mult * 100).toFixed(0)}% mult</div>
        <div class="vex-flavor-text">${flavorText}</div>
      </button>
    `
  }

  const { vex, fromRank, toRank } = offer
  const kindClass = vex.kind === 'color' ? 'color-vex' : 'line-vex'
  const kindLabel = vex.kind === 'color' ? 'COLOUR VEX' : 'LINE VEX'
  const rarityLabel = normalizeRarityLabel(vex.rarity)

  const multBefore = vex.getMultiplier(DUMMY_CTX, fromRank)
  const multAfter = vex.getMultiplier(DUMMY_CTX, toRank)
  const multDelta = Math.max(0, multAfter - multBefore)
  const flavorText = getCardFlavorText(vex, toRank)

  return `
    <button type="button" class="card ${kindClass}" data-offer-idx="${idx}">
      <span class="card-label rankup-badge">RANK UP</span>
      <span class="card-label">${kindLabel}</span>
      <span class="card-label rarity-badge">${rarityLabel}</span>
      <div class="card-name">${vex.name}</div>
      <div class="card-rank">
        <span style="color:#888">RANK ${fromRank}</span>
        <span style="color:#fff"> -> </span>
        <span class="up-rank">RANK ${toRank}</span>
      </div>
      <div class="card-desc">${vex.description}</div>
      <div class="card-downside">! ${vex.downsideDescription}</div>
      <div class="card-mult">+${(multDelta * 100).toFixed(0)}% more mult</div>
      <div class="vex-flavor-text">${flavorText}</div>
    </button>
  `
}

function applyOffer(offer: ShopOffer, activeVexes: Vex[]): void {
  if (offer.type === 'new') {
    const newVex = STARTER_VEX_FACTORIES[offer.vexId](1)
    activeVexes.push(newVex)
    newVex.onApply?.(1)
  } else {
    upgradeVex(offer.vex, offer.toRank)
  }
}

function applyQuicksandBonus(activeVexes: Vex[], ranksToAdd: 1 | 2 | 3): void {
  const quicksand = activeVexes.find((v) => v.id === 'quicksand')

  if (!quicksand) {
    const targetRank = clampVexRank(ranksToAdd)
    const newQuicksand = STARTER_VEX_FACTORIES.quicksand(targetRank)
    activeVexes.push(newQuicksand)
    newQuicksand.onApply?.(targetRank)
    return
  }

  if (quicksand.rank >= 10) return
  const targetRank = clampVexRank(quicksand.rank + ranksToAdd)
  upgradeVex(quicksand, targetRank)
}

let cssInjected = false
function injectCSS(): void {
  if (cssInjected) return
  cssInjected = true
  const style = document.createElement('style')
  style.textContent = SHOP_CSS
  document.head.appendChild(style)
}
