# 02: The Rite, a pure module that reproduces the trace

**What to build:** `src/game/rite.ts` — the run's state and rules behind one interface, with no Phaser, no canvas and no DOM. The proof it is faithful is that it replays ticket 01's recorded inputs and lands on every recorded number.

**Blocked by:** 01 (Record the golden trace from the current code)

**Status:** done (2026-10-12)

- [x] `createRite({ seed })` returns a Rite; the Rng is owned and exposed, and an injected seed makes the run reproducible.
- [x] `applyClear({ lines, clusters })` composes `buildScoringContext` and `scoreMove` from the existing `scoring.ts` and returns earned score, Resolve refund and the outcome in one call.
- [x] `tick(deltaMs)` applies the realtime Resolve drain.
- [x] Accessors cover every read the scene makes: score, level, levelScore, targetScore, resolve, resolveMax, moves, roster, rng.
- [x] The module imports no Phaser; the resolve clamp is plain `Math.min`/`Math.max`.
- [x] The level params come from `getLevelParams`.
- [x] A vitest test replays the full recorded input stream and asserts every recorded number and the final outcome.
- [x] The whole test runs in jsdom with no browser and no canvas.

## What was built

- `src/game/rite.ts` — `createRite(options)` returns a closure-backed object: `tick`, `applyClear`, `takePact`, `advanceSeal`, `reset`, and the accessors above. `targetScore` and `resolveMax` are getters over the `getLevelParams(level)` params, so `advanceSeal` is the only place the level moves. `outcome` is one predicate: target met → `SEAL_BROKEN`, else Resolve spent → `RESOLVE_FADED`, else null. Win is asked first, matching the scene's frame.
- `src/game/rite.test.ts` — 24 tests. The load-bearing one replays both fixtures event by event and diffs every recorded number with `Object.is` (exact doubles, no epsilon): per drain the Resolve, per clear the earned/refund/score/levelScore/moves/level/Resolve plus the descriptor the recorder handed the scorer (timeRemaining, maxClusterSize, moveIndex, combo), and the trailing outcome. It reports all divergences rather than throwing on the first, and a companion test perturbs one frame's `dt` to show the replay actually fails.
- Suite: 122 tests (was 98), typecheck clean, lint 0 errors (4 pre-existing warnings). `npm run trace:verify` green after the module landed: fade 346 events identical, seal 52 events identical.

## Ordering worth knowing before ticket 03

The scene's clear frame **returns before** the drain and before the win/loss checks (`GameScene.ts` `update()`: the `clearTimer` branch ends in `render(); return`). So in one frame either a clear is processed, or the frame drains and checks — never both. Two consequences the replay depends on:

1. The fixture's clear event is always followed by the *next* frame's drain, not the same frame's.
2. The fade program's win check never sees the scripted clear's level score, because the recorder zeroes `levelScore` after the clear and the check only runs on a later frame. That is why `applyClear` returning `SEAL_BROKEN` at fade clear 3 is correct and harmless: the scene must keep returning from the clear frame without acting on it, and act on `tick()`'s outcome instead. If ticket 03 moves the check into the clear frame, the fade fixture breaks — the gate will say so.

`levelScore` and `resolve` are writable for the same reason the scene writes them: `advanceSeal`/`reset` set them, and the recorder's program writes them mid-run (documented in the test as `PROGRAMS`).

## Trap this ticket walked into

**Do not `import` the fixture as JSON.** Vite transforms a JSON import into a JS module and that path is not lossless — `149.89853999999985` in `rite-trace-fade.json` comes back as `149.89853999999982648`, one ulp low, and event 14 of the fade replay fails on a difference no rule can explain. The test reads the fixtures with `readFileSync` + `JSON.parse`, the same bytes `verify-rite-trace.mjs` reads. Any exact-double comparison against a JSON fixture needs this, not just this one.
