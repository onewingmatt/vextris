#!/usr/bin/env node
/**
 * Verify the Rite's golden trace still matches the committed fixtures.
 *
 * Re-records through the live game and diffs against src/game/__fixtures__.
 * This is the gate ticket 01 asked for: a change that perturbs the run's
 * numbers — drain, score, refund, Resolve, the seal outcome — fails here,
 * before the Rite is extracted and again at every ticket boundary after it.
 *
 * Exit 0 = identical. Exit 1 = the recording drifted, or the recorder failed.
 *
 * Usage: node scripts/verify-rite-trace.mjs
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

const FIXTURE_DIR = resolve('src/game/__fixtures__');
const PROGRAMS = ['fade', 'seal', 'locks', 'pieces'];

const tmp = mkdtempSync(join(tmpdir(), 'rite-trace-'));
const recorded = join(tmp, 'recorded.json');

try {
  const run = spawnSync('node', ['scripts/record-rite-trace.mjs', '--out', recorded], {
    stdio: 'inherit',
  });
  if (run.status !== 0) {
    console.error('recorder failed — the trace could not be reproduced at all');
    process.exit(1);
  }

  const actual = JSON.parse(readFileSync(recorded, 'utf8'));
  let failed = 0;

  for (const program of PROGRAMS) {
    const expected = JSON.parse(readFileSync(join(FIXTURE_DIR, `rite-trace-${program}.json`), 'utf8')).trace;
    const got = actual[program].trace;

    if (expected.length !== got.length) {
      console.error(`✗ ${program}: recorded ${got.length} events, fixture has ${expected.length}`);
      failed++;
      continue;
    }

    let bad = -1;
    for (let i = 0; i < expected.length; i++) {
      if (JSON.stringify(expected[i]) !== JSON.stringify(got[i])) { bad = i; break; }
    }
    if (bad === -1) {
      console.log(`✓ ${program}: ${expected.length} events identical`);
    } else {
      console.error(`✗ ${program}: first divergence at event ${bad}`);
      console.error(`    fixture: ${JSON.stringify(expected[bad])}`);
      console.error(`    now:     ${JSON.stringify(got[bad])}`);
      failed++;
    }
  }

  process.exit(failed ? 1 : 0);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
