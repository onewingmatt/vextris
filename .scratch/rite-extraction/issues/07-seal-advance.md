# 07: The seal advances through the Rite

**What to build:** Breaking a seal stops being a scatter of scene assignments.

**Blocked by:** 06 (The roster and Pact picks move into the Rite)

**Status:** done (2026-10-12)

- [x] `advanceSeal()` increments the seal, re-derives its params from `getLevelParams` and refills Resolve to the new maximum — all inside the Rite.
- [x] The per-seal score resets and the new target is readable as `rite.targetScore`.
- [x] `startNextLevel` no longer writes run state: it is `this.gameState = 'PLAYING'` followed by `this.rite.advanceSeal()`, then the presentation resets it always owned.
- [x] Breaking a seal in the browser still opens the shop, advances the seal and refills the bar — the `seal` fixture records exactly that path and stays identical.
- [x] Level 10 clamping is `getLevelParams`' own behaviour and unchanged.
- [x] The golden trace stays green.
