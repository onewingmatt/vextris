# 06: The roster and Pact picks move into the Rite

**What to build:** The active Vexes belong with the rules that read them, and the dev panel's array reference keeps working.

**Blocked by:** 04 (The clear path delegates to the Rite)

**Status:** done (2026-10-12)

- [x] The roster is the Rite's, one stable array, mutated in place. All 12 scene references read `this.rite.roster`.
- [x] `Rite.reset()` clears it in place (`roster.length = 0`) rather than replacing it, so the dev panel's captured reference survives a restart. This is the reason the Rite must be **reset, not replaced** — see 08.
- [x] Every rank query reads the Rite's roster; `getActiveVexRank` is now a thin read of it.
- [x] The shop overlay is handed the Rite's roster and still offers the correct list.
- [x] The golden trace stays green, and the recorded rosters still match.

## Honest note on `takePact`

`takePact(vex)` exists on the Rite and is covered by its tests, but the shop's pick does not call it: `showVexShop` is handed the roster array and mutates it in place, which the callback then syncs to the dev panel. Routing the pick through `takePact` would mean changing `shop.ts`'s contract. Left as is, and flagged rather than papered over.
