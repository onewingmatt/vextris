#!/usr/bin/env node
/**
 * Record the Rite's golden trace.
 *
 * Plays a scripted sequence of drains and line-clears through the game's own
 * rules — in a real browser, because that is where the rules live today — and
 * writes every number the rules produced to a fixture. The extracted Rite
 * (src/game/rite.ts) must later reproduce that fixture exactly, which is the
 * accepted proof that the extraction changed no behaviour.
 *
 * Determinism, both kinds:
 *   1. Randomness — the run is seeded from `?seed=`.
 *   2. Time — the game loop is put to sleep and the scene is stepped by hand at
 *      a fixed 60Hz frame delta, so no wall-clock jitter can reach the trace.
 *
 * Without (2) the trace is not reproducible: two recordings of the same seed in
 * a real browser disagree on frame timing, so "record twice, diff" would fail
 * for reasons that have nothing to do with the rules.
 *
 * Usage:
 *   node scripts/record-rite-trace.mjs                  # writes the fixtures
 *   node scripts/record-rite-trace.mjs --out /tmp/x.json
 *   node scripts/record-rite-trace.mjs --port=5299
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

/**
 * Launch chromium, tolerating a missing browser revision.
 *
 * The browser revision this playwright version wants is not always the one in
 * the shared cache (a newer playwright elsewhere on the machine installs a
 * newer revision). Rather than fail — or pull 170 MB — fall back to the newest
 * chromium that is actually on disk.
 */
function newestInstalledChromium() {
  const cache = join(homedir(), '.cache', 'ms-playwright');
  let entries = [];
  try { entries = readdirSync(cache); } catch { return null; }
  const revisions = entries
    .map((d) => /^chromium-(\d+)$/.exec(d))
    .filter(Boolean)
    .map((m) => Number(m[1]))
    .sort((a, b) => b - a);
  for (const rev of revisions) {
    const exe = join(cache, `chromium-${rev}`, 'chrome-linux64', 'chrome');
    try { readdirSync(dirname(exe)); return exe; } catch { /* keep looking */ }
  }
  return null;
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (err) {
    const fallback = process.env.VEXTRIS_CHROME ?? newestInstalledChromium();
    if (!fallback) throw err;
    console.warn(`  playwright's own chromium is missing; using ${fallback}`);
    return await chromium.launch({ executablePath: fallback });
  }
}

const HOST = '127.0.0.1';
const DEFAULT_PORT = 5299;
const SEED = 20261012;
/** Fixture location; the Rite's vitest replays these. */
const FIXTURE_DIR = resolve('src/game/__fixtures__');

function parseArgs(argv) {
  const out = { port: DEFAULT_PORT, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' && argv[i + 1]) out.port = Number(argv[++i]);
    else if (a.startsWith('--port=')) out.port = Number(a.slice('--port='.length));
    else if (a === '--out' && argv[i + 1]) out.out = argv[++i];
    else if (a.startsWith('--out=')) out.out = a.slice('--out='.length);
  }
  if (!Number.isInteger(out.port) || out.port <= 0) throw new Error(`Invalid port: ${out.port}`);
  return out;
}

function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((res, rej) => {
    const attempt = () => {
      const sock = net.connect(port, HOST);
      sock.once('connect', () => { sock.destroy(); res(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() > deadline) rej(new Error(`dev server never listened on ${HOST}:${port}`));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

/** The scripted program, run inside the page against the real scene. */
async function driveScene({ program, clears }) {
  const game = window.game;
  const scene = game.scene.scenes[0];
  if (!scene || !scene.board) throw new Error('scene not ready');

  // Stop the real-time loop; from here the driver owns every frame.
  game.loop.sleep();

  // Take over from a known state. Real frames ran between create() and this
  // call — how many depends on page load time, so the run would otherwise start
  // from a different point every recording and the trace would never be
  // reproducible. Re-initialise from the seeded run, then hold the board still:
  // a valid piece must exist (spawnPiece reads nextPiece.shape), but freezing
  // gravity means it never falls, so no lock ever happens and the only rules
  // events are the scripted clears and the drains between them.
  scene.initRun();
  scene.initializeBoard();
  scene.generateNextPiece();
  scene.spawnPiece();
  scene.clearingLines = [];
  scene.clearTimer = 0;
  scene.lastUpdateTime = 0;
  scene.gameState = 'PLAYING';
  /** Hold the piece in place; the clear path rewrites gravityDelay, so re-apply. */
  const freezeGravity = () => { scene.gravityDelay = 1e9; scene.gravityTimer = 0; };
  freezeGravity();

  // A roster that exercises the drain and refund scaling paths. Only Vexes with
  // no time-driven behaviour: a setTimeout-based effect would reintroduce
  // real-time nondeterminism into the trace.
  const vex = await import('/src/game/vex.ts');
  // Roster per program. Quicksand slows gravity by design, which starves a
  // program whose whole point is letting pieces fall and lock; it also is not
  // one of the per-piece drain's modifiers.
  const roster = program === 'locks'
    ? [vex.createVexLeadFingers(2), vex.createVexJinxed(3)]
    : [vex.createVexQuicksand(3), vex.createVexFog(2), vex.createVexTremor(3), vex.createVexJinxed(2)];
  scene.rite.roster.length = 0;
  for (const v of roster) scene.rite.roster.push(v);

  // A fixed 50Hz logical frame. Deliberately above the game's 16.67ms FPS
  // throttle: the game skips any frame whose timestamp gap falls below it, and
  // an accumulating `t += 16.6667` drifts into that comparison, silently
  // dropping frames. Integer multiples of 20 cannot. The drain is linear in dt,
  // so the absolute frame length does not matter to the numbers recorded.
  const FRAME = 20;
  let frame = 0;
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      frame += 1;
      scene.update(frame * FRAME, FRAME);
    }
  };

  /** Arrange a clear of the given shape, then let exactly one frame run it. */
  const pushClear = (lines, clusters) => {
    const height = scene.board.length;
    scene.clearingLines = Array.from({ length: lines }, (_, i) => height - 1 - i);
    scene.scoringClusters = clusters.map((c) => ({
      color: c.color,
      blocks: Array.from({ length: c.size }, (_, i) => ({ x: i % 10, y: 0 })),
    }));
    scene.clearTimer = 1;
    step(1);
  };

  if (program === 'locks') {
    // Let pieces fall and lock. The per-piece Resolve bleed has no other
    // coverage: the rules programs freeze gravity, so no piece ever locks and
    // that third Resolve writer would go untested.
    // Level picks a fast row delay from GRAVITY_TABLE (index 25 -> 2ms, so one
    // row per frame at this frame length). The clear path rewrites gravityDelay,
    // but this program never clears, so the value holds.
    scene.level = 25;
    scene.gravityDelay = 2;
    scene.gravityTimer = 0;
    step(300);
  } else {
    for (const c of clears) {
      step(24);            // let Resolve drain across a fixed number of frames
      pushClear(c.lines, c.clusters);
      freezeGravity();     // the clear path restored the real gravity table
      // Keep the seal intact on the fade program: the point of that run is the
      // Resolve bleeding out, and a scripted clear worth 500 points would break
      // the level-1 seal first (it did, on the first attempt).
      if (program === 'fade') scene.rite.levelScore = 0;
    }

    if (program === 'fade') {
      // Practical shorthand so the run does not need 26,000 frames to bleed out.
      scene.rite.resolve = 1.5;
      step(400);
    } else {
      scene.rite.levelScore = scene.rite.targetScore - 1;
      step(2);
      pushClear(2, [{ color: 0x38bdf8, size: 4 }]);
      step(3);
    }
  }

  return {
    program,
    roster: scene.rite.roster.map((v) => ({ id: v.id, rank: v.rank })),
    trace: window.__vextrisTrace,
  };
}

/** Record the piece stream: the Rng draw order that spawns pieces. */
async function collectPieces({ count }) {
  const game = window.game;
  const scene = game.scene.scenes[0];
  if (!scene || !scene.board) throw new Error('scene not ready');
  game.loop.sleep();
  scene.initRun(); // seeds the run from ?seed=
  const trace = [];
  for (let i = 0; i < count; i++) {
    scene.generateNextPiece();
    const piece = scene.nextPiece;
    trace.push({ kind: 'piece', index: i, shape: piece.shape, colors: piece.colors });
  }
  return { program: 'pieces', trace };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const server = spawn('npm', ['run', 'dev', '--', '--host', HOST, '--port', String(args.port), '--strictPort'], {
    stdio: 'ignore',
    env: process.env,
  });

  let browser;
  try {
    await waitForPort(args.port);
    browser = await launchBrowser();
    const page = await browser.newPage();

    // Clear shapes chosen to cover the scoring and refund edges: the `lines < 2`
    // early return, each refund bracket, and the `cluster >= 6` bonus.
    const PROGRAMS = {
      locks: [],
      fade: [
        { lines: 1, clusters: [{ color: 0xf87171, size: 3 }] },
        { lines: 2, clusters: [{ color: 0x4ade80, size: 4 }, { color: 0x60a5fa, size: 2 }] },
        { lines: 3, clusters: [{ color: 0xfacc15, size: 6 }] },
        { lines: 4, clusters: [{ color: 0xc084fc, size: 8 }] },
        { lines: 2, clusters: [{ color: 0xfb923c, size: 5 }] },
      ],
      seal: [
        { lines: 2, clusters: [{ color: 0x4ade80, size: 5 }] },
        { lines: 3, clusters: [{ color: 0xf87171, size: 7 }] },
        { lines: 4, clusters: [{ color: 0x60a5fa, size: 6 }] },
      ],
    };

    const results = {};
    for (const [program, clears] of Object.entries(PROGRAMS)) {
      await page.goto(`http://${HOST}:${args.port}/?seed=${SEED}&trace=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => Array.isArray(window.__vextrisTrace), null, { timeout: 20000 });
      await sleep(300); // let create() finish wiring before the driver takes over
      results[program] = await page.evaluate(driveScene, { program, clears });
      const events = results[program].trace.length;
      console.log(`  ${program}: ${events} events`);
      if (!events) throw new Error(`${program}: recorded nothing`);
    }

    // The rules programs hold the piece still, so they cannot show whether the
    // spawn stream is still consumed in the same order. Record it separately.
    await page.goto(`http://${HOST}:${args.port}/?seed=${SEED}&trace=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => Array.isArray(window.__vextrisTrace), null, { timeout: 20000 });
    await sleep(300);
    results.pieces = await page.evaluate(collectPieces, { count: 40 });
    console.log(`  pieces: ${results.pieces.trace.length} spawns`);
    if (!results.pieces.trace.length) throw new Error('pieces: recorded nothing');

    if (args.out) {
      mkdirSync(dirname(resolve(args.out)), { recursive: true });
      writeFileSync(resolve(args.out), JSON.stringify(results, null, 2) + '\n');
      console.log(`wrote ${resolve(args.out)}`);
    } else {
      mkdirSync(FIXTURE_DIR, { recursive: true });
      for (const [program, data] of Object.entries(results)) {
        const path = resolve(FIXTURE_DIR, `rite-trace-${program}.json`);
        writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
        console.log(`wrote ${path}`);
      }
    }
  } finally {
    if (browser) await browser.close();
    server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
