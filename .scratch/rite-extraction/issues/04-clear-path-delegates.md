# 04: The clear path delegates to the Rite

**What to build:** Applying a clear stops being scene arithmetic. The scene computes the clear descriptor and hands it over; the Rite awards the score, refunds Resolve and reports the run's outcome.

**Blocked by:** 03 (The scene adopts the Rite's Rng)

**Status:** done (2026-10-12) — landed together with 05, see below

- [x] The scene's inline score, levelScore and moveIndex writes are gone.
- [x] The hand-written win check (`levelScore >= targetScore`) and loss check (`resolve <= 0`) are gone from the frame; the outcome comes from the Rite.
- [x] Scoring still happens before the rows are cleared. The ordering is now a property of `applyClear`, not a comment.
- [x] The "We MUST score BEFORE clearing the board rows" comment is deleted (grep for it in `src/` returns nothing).
- [x] The golden trace stays green.
- [x] The Rite's `getResolveRefundForClear`, `getRealtimeResolveDrainPerSecond`, `getPerPieceResolveDrain` and `applyResolveDelta` are deleted from the scene; so are the `REALTIME_DRAIN_PER_SECOND` and `PERPIECE_DRAIN` constants and the six run-state fields.

## Why 04 and 05 landed together

`applyResolveDelta` was the **only** writer of Resolve and was called from three places: the clear refund, the realtime drain, and the per-piece lock. Move the clear path alone and two owners hold one value, which fails the gate immediately. The Resolve value cannot have two owners, so the clear path and the drain moved as one change.

## The interface grew where the spec was thin

Wiring the clear path showed `ClearResult` was missing what the frame displays. It now also returns `colorMult`, `lineMult`, `totalClusterPoints` and `maxClusterSize` — the numbers the scoreline chips show — so the scene never runs the scoring pipeline a second time to display a result the Rite already has. Those four are recorded in the fixture too, so a transposition in the wiring cannot hide.
