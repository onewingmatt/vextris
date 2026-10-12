# 03: The scene adopts the Rite's Rng

**What to build:** The run's randomness has exactly one owner. `initRun` creates the Rite (seeded from `?seed=` when present) and the scene draws piece spawns from the Rite's stream instead of holding its own Rng.

**Blocked by:** 02 (The Rite, a pure module that reproduces the trace)

**Status:** done (2026-10-12)

- [x] `initRun` resets the Rite; the scene's own `Rng` field is gone, and so is its `import` of the rng module.
- [x] All 12 draw sites read `this.rite.rng`, freshly on each use, so a reset that re-creates the stream is picked up.
- [x] The number and order of draws is unchanged.
- [x] The golden trace stays green.
- [x] **New coverage**: a `pieces` program records 40 spawns (shape + colours) from the code as it stood. The rules programs freeze gravity and never spawn a piece, so they could not have caught a changed draw order. It is now `✓ pieces: 40 events identical`.

## Note

The piece stream is pinned by the browser gate, not by the Rite's unit tests: building a piece from the stream is the scene's code (`generateNextPiece`), and re-implementing it in a test would grade the test's copy rather than the product.
