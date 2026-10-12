# 01: Record the golden trace from the current code

**What to build:** A committed, byte-reproducible recording of one real seeded run, captured from the game as it stands today. This is the net the whole refactor hangs on, so it has to exist before the first line of the Rite does. It is recorded through the browser because that is where the rules currently live; the Rite's own tests will replay it without one.

**Blocked by:** None (can start immediately)

**Status:** done (2026-10-12)

- [x] A `?seed=` URL parameter seeds the run's gameplay Rng. Read in `initRun`; absent a param the seed is generated and logged exactly as before.
- [x] With a seed, the run is deterministic: **three consecutive recordings were byte-identical** (346 fade events, 52 seal events).
- [x] The trace captures the **inputs** as well as the results: a `dt` on every drain event, and each clear's line count, cluster colours and cluster sizes.
- [x] The trace captures per-move score, levelScore, Resolve, moves, and the seal outcome. Both outcomes are covered: RESOLVE_FADED and SEAL_BROKEN.
- [x] The fixture is committed (`src/game/__fixtures__/rite-trace-{fade,seal}.json`) and `npm run trace:verify` fails when it stops matching.
- [x] Determinism is proven by repeated recording, not assumed.
- [x] **The gate was shown to fail**: perturbing one number in the seal fixture produced `✗ seal: first divergence at event 24`, naming the differing field, and exit 1. Restored afterwards.

## What was built

- `scripts/record-rite-trace.mjs` — drives the real scene in a headless browser and writes the fixtures. Falls back to the newest chromium already on disk when this playwright's own browser revision is missing (it is: the repo pins one revision, the cache holds others).
- `scripts/verify-rite-trace.mjs` — re-records and diffs against the fixtures. `npm run trace:verify`.
- `src/game/__fixtures__/rite-trace-{fade,seal}.json` — the fixtures.
- `GameScene.ts` — `?seed=` support, a `?trace=1` flag, a `record()` helper, and trace points at the drain, the clear and the two outcomes. Off unless the flag is present.

## Two traps this ticket walked into, both worth keeping

1. **A real played run cannot be the trace.** Two recordings of the same seed in a real browser disagree on frame timing, so "record twice, diff" fails for reasons unrelated to the rules. The trace is therefore a *scripted* program on a **fixed logical clock**, not a played session.
2. **Float drift silently skipped frames.** Accumulating `t += 1000/60` makes `time - lastUpdateTime` occasionally land a hair below the game's 16.67 ms FPS throttle, and the game drops that frame. That was the entire source of the first recordings' nondeterminism — and it also corrupted the program, letting a clear land after a driver reset and break a seal early. The driver now steps on exact integer multiples of 20 ms, which cannot fall under the throttle.

## Coverage the program was chosen to give

Clear shapes were picked to hit the scoring and refund edges rather than to be a normal game: `lines: 1` (the `lines < 2` refund early-return), `lines: 2/3/4` (each refund bracket), and cluster sizes 2, 3, 4, 5, 6, 7, 8 (including the `maxClusterSize >= 6` bonus path). Roster is quicksand 3, fog 2, tremor 3, jinxed 2 — covering both drain formulas and the refund scale.

**Deliberately excluded:** corruption and rising_dread, because both drive behaviour from `setTimeout` and would reintroduce real-time nondeterminism into the trace. Their contribution to the refund scale is therefore not pinned by this fixture. Worth covering once the Rite owns the rules and the timers are someone else's problem.

**Also not pinned:** the board and the cluster BFS (out of scope — they stay in the scene). The driver supplies finished clear descriptors, which is exactly what the Rite will receive.
