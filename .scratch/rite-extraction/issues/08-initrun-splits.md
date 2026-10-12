# 08: `initRun` splits into rules and presentation

**What to build:** Starting a run separates the two jobs currently tangled in one method.

**Blocked by:** 07 (The seal advances through the Rite)

**Status:** done (2026-10-12)

- [x] The run's rules reset as one call: seal, params, level score, Resolve, tribute, moves and an empty roster.
- [x] The scene's own cleanup stays in the scene: effect teardown, fog height, mirage and pressure resets, canvas filter.
- [x] Starting a run with `?seed=` is reproducible from the URL alone.
- [x] No run state is reset twice, and none is missed — enforced by the compiler: the fields are gone, so any surviving write would not compile.
- [x] `npm test` (123 tests) and `npm run typecheck` are both clean, `npm run lint` reports 0 errors.
- [x] The golden trace stays green.

## The design the code forced: reset, never replace

`initRun` runs more than once — `resetGame()` calls it on restart from the pause menu. `DevPanel` captures the roster array once at construction, and the scene used to preserve that identity with `activeVexes.length = 0`. Constructing a fresh Rite per run would hand the panel a stale array.

So the Rite is created once and **reset** thereafter, and `reset(seed?)` takes an optional seed so a restart can start a differently seeded run on the same object. That parameter is the one interface change this ticket needed.

## Left as-is, deliberately

The scene still has a `combo` field that is always 0, while the Rite hardcodes `COMBO = 0` because `ScoringContext` requires the field. Two places now hold "combo is unused" and they can drift. Worth collapsing when combo is either implemented or removed.
