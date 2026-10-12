import { describe, it, expect } from 'vitest'
import { rollOffers } from './shop'
import { createRng } from './rng'
import { createVexJinxed, createVexTremor, type Vex, type VexId } from './vex'

const SEED = 20261012

/** The offer pool is drawn from every Vex except quicksand, which is a starter. */
const NEVER_OFFERED: VexId = 'quicksand'

const idsOf = (offers: ReturnType<typeof rollOffers>): string[] =>
  offers.map((o) => (o.type === 'new' ? o.vexId : o.vex.id)).sort()

describe('the offer roll is a function of the run', () => {
  it('gives the same offers for the same seed, roster and seal', () => {
    const roster = (): Vex[] => [createVexJinxed(3)]
    const a = rollOffers(roster(), 4, createRng(SEED))
    const b = rollOffers(roster(), 4, createRng(SEED))
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(0)
  })

  it('reads the stream it was handed rather than global randomness', () => {
    // Same seed, but one stream has already been drawn from: if the roll were
    // still calling Math.random() both would be driven by the same global
    // source and this would not reliably differ.
    const used = createRng(SEED)
    used.next()
    const fresh = createRng(SEED)
    const offers = rollOffers([], 2, fresh)
    expect(idsOf(offers)).not.toEqual(idsOf(rollOffers([], 2, used)))
  })

  it('advances the stream it was given', () => {
    const probe = createRng(SEED)
    rollOffers([], 1, probe)
    const afterRoll = probe.next()
    expect(afterRoll).not.toBe(createRng(SEED).next())
  })

  it('offers three distinct picks, and never the starter', () => {
    const offers = rollOffers([], 1, createRng(SEED))
    expect(offers).toHaveLength(3)
    expect(offers.every((o) => o.type === 'new')).toBe(true)
    const ids = offers.map((o) => (o.type === 'new' ? o.vexId : ''))
    expect(new Set(ids).size).toBe(3)
    expect(ids).not.toContain(NEVER_OFFERED)
  })

  it('never offers a Vex the run already owns, and only ranks up owned ones', () => {
    const roster = [createVexJinxed(3), createVexTremor(1)]
    const owned = new Set(roster.map((v) => v.id))
    for (let i = 0; i < 40; i++) {
      for (const offer of rollOffers(roster, 6, createRng(SEED + i))) {
        if (offer.type === 'new') {
          expect(owned.has(offer.vexId)).toBe(false)
          expect(offer.vexId).not.toBe(NEVER_OFFERED)
        } else {
          expect(owned.has(offer.vex.id)).toBe(true)
          expect(offer.toRank).toBe(offer.fromRank + 1)
          expect(offer.vex.id).not.toBe(NEVER_OFFERED)
        }
      }
    }
  })

  it('scales the odds with the seal', () => {
    // Not a statistical claim, just that the seal is an input: an early seal and
    // a late one should not produce identical sequences for every seed.
    const early = new Set<string>()
    const late = new Set<string>()
    for (let i = 0; i < 20; i++) {
      early.add(idsOf(rollOffers([], 1, createRng(SEED + i))).join(','))
      late.add(idsOf(rollOffers([], 9, createRng(SEED + i))).join(','))
    }
    expect([...early].join('|')).not.toBe([...late].join('|'))
  })
})
