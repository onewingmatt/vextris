# Rite extraction — pull the run's rules out of GameScene

**Status:** ready-for-agent
**Date:** 2026-10-12
**Head:** a5900e4
**Origin:** architecture review of vextris, candidate 2 ("Give the Rite a body"), grilled and settled in three rounds

---

## Problem Statement

The rules that decide whether a run lives or dies are private members of a Phaser
presentation class. Resolve drain, the refund for clearing lines, the seal target,
descent progression, and the win/loss checks all live on `GameScene` as private
fields and private methods. To exercise any of them you have to stand up a
browser and play.

The evidence that this is a real cost, not a preference:

- `src/game/frameTiming.test.ts:107` — *"Local helpers mirroring config values
  without importing GameScene."* A test file re-implements the scene's values
  rather than importing it, because there is no seam to import through.
- `scoring.ts` is pure, tested and deep — but the order that matters ("We MUST
  score BEFORE clearing the board rows", `GameScene.ts:1899`) is a comment inside
  the frame, so the composition is unverified while its parts are verified.
- 5 of 25 source files have tests, and all 5 are pure logic. `GameScene.ts`
  (3,033 lines, 32% of the codebase) has none.

## Solution

Extract the run's state and rules into a pure module, `src/game/rite.ts`,
constructed by `createRite()` and driven by the scene. The scene keeps the board,
the piece, the stage machine, rendering and audio; the Rite keeps the run.

After this, the run's rules are testable in jsdom with no Phaser, no canvas and
no DOM, and a seeded run is reproducible end to end.

## User Stories

1. As a maintainer, I want the Resolve drain formula to have a caller I can call
   directly, so that I can change the difficulty curve and see the effect without
   playing the game.
2. As a maintainer, I want the refund-for-clearing formula out of a private scene
   method, so that its edge cases (lines < 2, cluster >= 6, Vex rank scaling) can
   be asserted one at a time.
3. As a maintainer, I want the clamp on Resolve to be plain arithmetic rather
   than `Phaser.Math.Clamp`, so that the rules module can exist without Phaser.
4. As a maintainer, I want "score before clearing the rows" to be enforced by the
   shape of a call rather than by a comment, so that reordering the frame cannot
   silently change scoring.
5. As a maintainer, I want the win check (`levelScore >= targetScore`) and the
   loss check (`resolve <= 0`) to be produced by the same call that applies the
   score, so that no code path can forget to ask.
6. As a maintainer, I want the descent level, its params and the Resolve refill
   to advance in one place, so that adding a level above 10 or changing the
   refill rule is a one-function change.
7. As a maintainer, I want the run's seed to be injectable, so that a bug report
   can be replayed and a regression test can be deterministic.
8. As a maintainer, I want the Vex roster to live with the rules that read it, so
   that a rule's inputs are not spread across two modules.
9. As a maintainer, I want the dev panel's array reference to survive the move,
   so that existing dev tooling keeps working through the change.
10. As a maintainer, I want a recorded trace of a real run to fail loudly if the
    extraction changes any number, so that "pure refactor" is a measured claim.
11. As a maintainer, I want `initRun` split into rules reset and presentation
    cleanup, so that the effect teardown stops being entangled with run state.
12. As a maintainer, I want high score and run history to keep reading the run
    without owning it, so that persistence stays a scene concern.
13. As a player, I want the game to behave identically after the refactor, so
    that a structural improvement does not cost me a run.
14. As a player, I want a seeded run to be reproducible, so that "I died to X at
    level 7" is a shareable, replayable seed rather than an anecdote.

## Implementation Decisions

- **Scope is the run's rules only.** Board, piece, stage machine (`gameState`),
  rendering, audio, effects and DOM stay in `GameScene`. The stage machine and the
  board become their own cuts later; this spec deliberately does not touch them.
- **One seam.** The module's public surface is the only thing the scene and the
  tests cross. Nothing reaches past it.

```ts
// src/game/rite.ts — the decision-rich shape, not a working draft
createRite({ seed? }): Rite

Rite.tick(deltaMs)                          // realtime Resolve drain
Rite.applyClear({ lines, clusters })        // composes scoring; returns the outcome
Rite.takePact(vex)                          // the shop's pick, into the roster
Rite.advanceSeal()                          // level++, re-derive params, refill Resolve
Rite.reset()                                // the rules half of initRun

Rite.rng          // exposed; one stream drives piece spawns and Pact offers
Rite.roster       // stable array, mutated in place (DevPanel's reference survives)
Rite.score  Rite.level  Rite.levelScore  Rite.targetScore
Rite.resolve  Rite.resolveMax  Rite.moves
```

- **`applyClear()` returns earned + refund + outcome in one call**, so neither win
  nor loss can be missed by a caller that forgets to check.
- **Scoring is composed inside the Rite.** The scene computes the clear
  descriptor (`{ lines, clusters }`); the Rite calls `buildScoringContext` and
  `scoreMove` from the existing pure `scoring.ts`. This gives the score-before-
  clear ordering a real home.
- **The Rite owns the Rng and exposes it.** `createRite({ seed })` injects for
  tests; absent a seed, the Rite generates one and it stays readable. Piece spawns
  and Pact offers must draw from this one stream.
- **The Rite calls `getLevelParams` itself**; `config.ts` is already pure and tested.
- **The Rite does not import Phaser.** `Phaser.Math.Clamp` in the resolve path
  becomes `Math.min`/`Math.max`. This is the constraint that makes the module pure;
  it is not optional.
- **Naming follows the domain.** `LORE.md` is the vocabulary source: the Rite of
  Descent, Resolve, Vex, Pact, tribute, seals. A run is one traversal of the Rite.
- **Defaults taken, both reversible:** `initRun` splits into `rite.reset()` plus the
  scene's own cleanup (`disableBlackout/Fog/Tremor/Whiplash`, `setFogHeight(0)`,
  mirage and pressure resets, canvas filter); high score and `saveRunHistory` stay
  in the scene, reading `Rite.score` and `Rite.level`. localStorage is not the
  Rite's business.
- **No file paths or code snippets in the tickets** beyond the shape above; they go
  stale. The shape above is decision-rich and earns its place.

## Testing Decisions

- **One seam, so tests only cross it.** The Rite's public surface is what tests
  call. No test reaches into its internals, and no test needs a browser.
- **A good test here asserts behaviour through the interface**: given a roster, a
  level and a sequence of clears, the run's numbers and outcome follow. Not
  "the private drain function returns 0.36".
- **The golden run is the accepted proof that the extraction changed no
  behaviour.** A recorded trace of a real seeded run — per-move score, levelScore,
  Resolve, moves, and the seal outcome — captured from the pre-extraction code.
  The extracted Rite must reproduce it exactly.
- **The trace must be recorded from the current code, before the extraction
  starts.** Recording it after proves nothing about faithfulness. The scene already
  exposes `window.game` for automation and already logs its run seed; a `?seed=`
  URL parameter (anticipated in the code's own comment) plus a per-move trace dump
  is the path, driven once with the existing playwright setup.
- **The fixture must be green at every ticket boundary, not just at the end.**
  A net that only holds at the final commit does not protect the intermediate ones.
- **The RNG stream order is part of the contract.** Piece spawns and Pact offers
  share one seeded stream, so the trace is also the guard on consumption order: a
  refactor that draws in a different order must fail the gate, and that failure is
  the gate working.
- **Prior art:** `src/game/scoring.test.ts` and `rng.test.ts` show the house style
  for a pure module; `npm test` (vitest, jsdom) is the gate CI already runs.

## Out of Scope

- The stage machine (`gameState` and its nine assignment sites) — its own cut.
- The board, piece, hold, ghost and the cluster BFS — they stay in the scene, and
  the scene hands the Rite a finished clear descriptor.
- Rendering, the HUD, its eight `lastHud*` cache fields, and the scoreline chips.
- The chamber effects and their module-scope state (candidate 3).
- The Vex catalogue duplication and the dead `vexDescriptor.ts` (candidate 4).
- `shop.ts` drawing from `Math.random()` instead of the injected Rng. Note the
  interaction: once the Rite owns the run's Rng, the shop's unseeded roll is the
  obvious next fix, but it is not this spec.
- `SRS_WALL_KICKS` and the hardcoded rotation offsets (candidate 5).
- Any behaviour change in the drain, refund, target or refill curves. This is a
  refactor: identical numbers or it has failed.

## Further Notes

- `currentLevel` is read by the amnesia curves (five sites) and by the scoring
  context's `levelBoost`/`levelMultiplier`. Those reads become `Rite.level`; the
  curves themselves stay where they are.
- `Phaser.Math.Clamp` is the first genuine obstacle: it is the difference between a
  module that is pure and one that merely looks it.
- The dev panel's comment ("Keep the same array instance so DevPanel references
  stay valid") is a constraint, not a preference. `Rite.roster` must be one stable
  array mutated in place.
- Reports on either side of this change: candidate 1 (`update()` is seven systems)
  becomes materially easier once the run state has a home, and candidate 8 (the
  stage machine) is the natural follow-on cut.
