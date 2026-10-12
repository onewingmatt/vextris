# 05: The frame's Resolve drain moves to the Rite

**What to build:** The per-second drain leaves `update()`. The scene hands the Rite the frame delta and the Rite decides how much Resolve the player lost.

**Blocked by:** 04 (The clear path delegates to the Rite)

**Status:** done (2026-10-12) — landed with 04

- [x] The drain block inside the frame is one `tick(deltaMs)` call.
- [x] The realtime formula and its per-Vex rank modifiers live in the Rite.
- [x] The scene's drain constants moved with the formula instead of being duplicated.
- [x] Resolve still cannot fall below zero or rise above the level's maximum.
- [x] The golden trace stays green.

## A third Resolve writer the spec did not know about

`getPerPieceResolveDrain` bleeds Resolve on every **piece lock** — 0.8 plus modifiers for quicksand, lead_fingers, jinxed and rising_dread. It was not in the Rite's interface and not covered by any fixture, because the rules programs freeze gravity and never lock a piece. Both gaps are now closed: the Rite has `lockPiece()`, the scene calls it on the lock path, and a `locks` program records 9 locks with a lead_fingers/jinxed roster to pin the modifiers (`✓ locks: 183 events identical`).

The frame deliberately ignores `lockPiece()`'s returned outcome. It has always checked the run on the following tick, and checking at the lock would break a seal one frame earlier than the recorded run does.
