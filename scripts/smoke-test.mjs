#!/usr/bin/env node

import { spawn } from 'node:child_process';
import net from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';

const HOST = '127.0.0.1';
const DEFAULT_PORT = {
  preview: 4173,
  dev: 3000,
};

function parseArgs(argv) {
  let mode = 'preview';
  let port;
  let skipBuild = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--mode' && argv[i + 1]) {
      mode = argv[++i];
    } else if (arg.startsWith('--mode=')) {
      mode = arg.slice('--mode='.length);
    } else if (arg === '--port' && argv[i + 1]) {
      port = Number(argv[++i]);
    } else if (arg.startsWith('--port=')) {
      port = Number(arg.slice('--port='.length));
    } else if (arg === '--skip-build') {
      skipBuild = true;
    }
  }

  if (mode !== 'preview' && mode !== 'dev') {
    throw new Error(`Unsupported mode: ${mode}. Use --mode=preview or --mode=dev.`);
  }
  if (port !== undefined && (!Number.isInteger(port) || port <= 0)) {
    throw new Error(`Invalid port: ${port}`);
  }

  return { mode, port, skipBuild };
}

function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} failed with exit code ${code}`));
      }
    });
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, HOST);
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 30; port++) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`Could not find a free port near ${startPort}`);
}

async function waitForServer(url, timeoutMs, hasExitedRef) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (hasExitedRef.value) {
      throw new Error('Server process exited before becoming ready.');
    }

    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        return;
      }
    } catch {
      // Retry while server is still starting.
    }

    await sleep(250);
  }

  throw new Error(`Timed out waiting for server at ${url}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const terminate = (signal) => {
    try {
      if (child.pid) {
        // Detached child is process-group leader; kill group to include spawned Vite process tree.
        process.kill(-child.pid, signal);
        return;
      }
    } catch {
      // Fallback to direct child signal.
    }

    try {
      child.kill(signal);
    } catch {
      // Ignore if already terminated.
    }
  };

  const waitForExit = async (timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        return true;
      }
      await sleep(100);
    }
    return child.exitCode !== null || child.signalCode !== null;
  };

  terminate('SIGTERM');
  const exited = await waitForExit(3000);

  if (!exited) {
    terminate('SIGKILL');
    await waitForExit(3000);
  }
}

async function startServer(mode, port) {
  const script = mode === 'preview' ? 'preview' : 'dev';
  const viteBin = resolve(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
  const args = [
    ...(mode === 'preview' ? ['preview'] : []),
    '--host',
    HOST,
    '--port',
    String(port),
    '--strictPort',
  ];

  const child = spawn(process.execPath, [viteBin, ...args], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  const output = [];
  const hasExitedRef = { value: false };

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    output.push(text);
    process.stdout.write(`[${script}] ${text}`);
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    output.push(text);
    process.stderr.write(`[${script}] ${text}`);
  });

  child.on('exit', () => {
    hasExitedRef.value = true;
  });

  const url = `http://${HOST}:${port}/`;

  try {
    await waitForServer(url, 30000, hasExitedRef);
  } catch (error) {
    await stopProcess(child);
    const lastOutput = output.join('').split('\n').slice(-20).join('\n');
    throw new Error(`${error.message}\n\nLast server output:\n${lastOutput}`);
  }

  return { child, url };
}

async function runSmokeSuite(url, mode) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const consoleWarnings = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'warning' || msg.type() === 'error') {
      consoleWarnings.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err));
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);

  const beginButton = page.locator('#btn-begin-rite');
  if (await beginButton.count()) {
    await beginButton.click();
    await page.waitForTimeout(300);
  }

  // Instrument preview rendering to ensure NEXT/HOLD pieces are actually being drawn.
  await page.evaluate(() => {
    const scene = window.game?.scene?.keys?.GameScene;
    if (!scene) return;
    scene.__smokePreviewCalls = [];
    const original = scene.renderPreviewPiece?.bind(scene);
    if (!original) return;
    scene.renderPreviewPiece = (...args) => {
      scene.__smokePreviewCalls.push(args);
      return original(...args);
    };
  });

  const bootstrap = await page.evaluate(() => {
    const scene = window.game?.scene?.keys?.GameScene;
    if (!scene) {
      return { passed: false, details: { reason: 'GameScene not found' } };
    }

    const height = Array.isArray(scene.board) ? scene.board.length : -1;
    const width = height > 0 && Array.isArray(scene.board[0]) ? scene.board[0].length : -1;

    return {
      passed: width === 10 && height === 18,
      details: { width, height },
    };
  });

  const directLineClear = await page.evaluate(() => {
    const scene = window.game?.scene?.keys?.GameScene;
    if (!scene) {
      return { passed: false, details: { reason: 'GameScene not found' } };
    }

    scene.gameState = 'PLAYING';
    scene.resolveCurrent = Math.max(scene.resolveCurrent, 999);

    const height = scene.board.length;
    const width = scene.board[0].length;

    scene.board = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ filled: false, color: 0x111111 }))
    );

    scene.board[height - 1] = Array.from({ length: width }, () => ({ filled: true, color: 0x33aaff }));
    scene.clearingLines = [];
    scene.scoringClusters = [];
    scene.clearTimer = 0;

    scene.clearLines();
    const detected = scene.clearingLines.length;
    const timerSet = scene.clearTimer;

    scene.clearTimer = 1;
    scene.lastUpdateTime = 0;
    scene.update(performance.now() + 34, 16.67);

    const bottomFilledCount = scene.board[height - 1].filter((cell) => cell.filled).length;
    const passed = detected === 1 && timerSet > 0 && bottomFilledCount === 0;

    return {
      passed,
      details: {
        detected,
        timerSet,
        bottomFilledCount,
      },
    };
  });

  const keyboardSetup = await page.evaluate(() => {
    const scene = window.game?.scene?.keys?.GameScene;
    if (!scene) {
      return { passed: false, details: { reason: 'GameScene not found' } };
    }

    const height = scene.board.length;
    const width = scene.board[0].length;
    const gapStart = 3;

    scene.board = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ filled: false, color: 0x111111 }))
    );

    scene.board[height - 1] = Array.from({ length: width }, (_, x) => ({
      filled: !(x >= gapStart && x <= gapStart + 3),
      color: 0x44bbff,
    }));

    const iColor = 0x00bfff;
    scene.currentPiece = {
      type: 'I',
      shape: [[1, 1, 1, 1]],
      colors: [[iColor, iColor, iColor, iColor]],
      position: { x: gapStart, y: 0 },
    };

    scene.nextPiece = {
      type: 'O',
      shape: [[1, 1], [1, 1]],
      colors: [[0xffd700, 0xffd700], [0xffd700, 0xffd700]],
      position: { x: 11, y: 2 },
    };

    scene.clearingLines = [];
    scene.scoringClusters = [];
    scene.clearTimer = 0;
    scene.gravityTimer = 0;
    scene.gameState = 'PLAYING';
    scene.resolveCurrent = Math.max(scene.resolveCurrent, 999);

    const linesBefore = scene.lines;
    const bottomFilledBefore = scene.board[height - 1].filter((cell) => cell.filled).length;
    window.__smokeLinesBefore = linesBefore;

    return {
      passed: bottomFilledBefore === 6,
      details: {
        linesBefore,
        bottomFilledBefore,
      },
    };
  });

  await page.locator('canvas').first().click();
  await page.keyboard.press('ArrowUp');

  await page.waitForFunction(() => {
    const scene = window.game?.scene?.keys?.GameScene;
    if (!scene) return false;
    const linesBefore = window.__smokeLinesBefore ?? -1;
    return scene.lines > linesBefore;
  }, { timeout: 2500 });

  await page.waitForTimeout(250);

  const keyboardLineClear = await page.evaluate(() => {
    const scene = window.game?.scene?.keys?.GameScene;
    if (!scene) {
      return { passed: false, details: { reason: 'GameScene not found' } };
    }

    const linesBefore = window.__smokeLinesBefore ?? 0;
    const linesAfter = scene.lines;
    const lineDelta = linesAfter - linesBefore;
    const height = scene.board.length;
    const bottomFilledCount = scene.board[height - 1].filter((cell) => cell.filled).length;

    return {
      passed: lineDelta >= 1 && bottomFilledCount === 0,
      details: {
        linesBefore,
        linesAfter,
        lineDelta,
        bottomFilledCount,
      },
    };
  });

  const previewVisibility = await page.evaluate(() => {
    const scene = window.game?.scene?.keys?.GameScene;
    if (!scene) {
      return { passed: false, details: { reason: 'GameScene not found' } };
    }

    // If amnesia is active, previews may be intentionally hidden.
    const amnesiaRank = scene.getAmnesiaRank?.() ?? 0;
    const intensity = scene.getAmnesiaIntensity?.(amnesiaRank) ?? 0;
    const hideNext = scene.shouldHideNextPreview?.(intensity);
    const hideHold = scene.shouldHideHoldPreview?.(intensity);

    const calls = Array.isArray(scene.__smokePreviewCalls) ? scene.__smokePreviewCalls.length : 0;
    const called = calls > 0;

    return {
      passed: !hideNext && !hideHold && called,
      details: {
        amnesiaRank,
        intensity,
        hideNext,
        hideHold,
        previewCalls: calls,
      },
    };
  });

  let quicksandBonusHex = {
    passed: true,
    details: { skipped: mode !== 'dev' },
  };

  if (mode === 'dev') {
    await page.evaluate(async () => {
      const scene = window.game?.scene?.keys?.GameScene;
      if (!scene) return;
      const { showVexShop } = await import('/src/game/shop.ts');

      scene.activeVexes.splice(0, scene.activeVexes.length);
      scene.resolveCurrent = 80;
      scene.currentLevelParams = { ...scene.currentLevelParams, resolveMax: 100 };
      scene.currentLevel = 3;
      scene.gameState = 'SHOP';
      window.__quicksandSmokePicked = null;

      showVexShop(
        scene.activeVexes,
        scene.currentLevel,
        scene.resolveCurrent,
        scene.currentLevelParams.resolveMax,
        () => {
          // The shop callback does not receive the activeVexes array; read it from the scene instead.
          window.__quicksandSmokePicked = scene.activeVexes.map((v) => `${v.id}:${v.rank}`);
          scene.gameState = 'PLAYING';
        },
      );
    });

    await page.waitForSelector('#vextris-shop', { timeout: 2500 });

    const quicksandTierSetup = await page.evaluate(() => {
      const plusTwo = document.querySelector('button.quicksand-tier[data-qs-ranks="2"]');
      const plusThree = document.querySelector('button.quicksand-tier[data-qs-ranks="3"]');

      return {
        plusTwoDisabled: plusTwo instanceof HTMLButtonElement ? plusTwo.disabled : null,
        plusThreeDisabled: plusThree instanceof HTMLButtonElement ? plusThree.disabled : null,
      };
    });

    await page.click('button.quicksand-tier[data-qs-ranks="2"]');
    await page.click('button.card');

    await page.waitForFunction(() => !document.getElementById('vextris-shop'), { timeout: 2500 });
    await page.waitForTimeout(250);

    const quicksandBonusHexDetails = await page.evaluate(() => {
      const scene = window.game?.scene?.keys?.GameScene;
      if (!scene) {
        return { reason: 'GameScene not found' };
      }

      const quicksand = scene.activeVexes.filter((v) => v.id === 'quicksand');
      return {
        quicksandCount: quicksand.length,
        quicksandRank: quicksand[0]?.rank ?? 0,
        activeVexes: scene.activeVexes.map((v) => `${v.id}:${v.rank}`),
      };
    });

    quicksandBonusHex = {
      passed:
        quicksandTierSetup.plusTwoDisabled === false &&
        quicksandTierSetup.plusThreeDisabled === false &&
        quicksandBonusHexDetails.quicksandCount === 1 &&
        quicksandBonusHexDetails.quicksandRank === 2,
      details: {
        plusTwoDisabled: quicksandTierSetup.plusTwoDisabled,
        plusThreeDisabled: quicksandTierSetup.plusThreeDisabled,
        ...quicksandBonusHexDetails,
      },
    };
  }

  const vexRuntimeSanity = await page.evaluate(() => {
    const scene = window.game?.scene?.keys?.GameScene;
    if (!scene) {
      return { passed: false, details: { reason: 'GameScene not found' } };
    }

    const scale1 = scene.getQuicksandGravityScale?.(1);
    const scale5 = scene.getQuicksandGravityScale?.(5);
    const scale10 = scene.getQuicksandGravityScale?.(10);
    const quicksandScalingValid =
      Number.isFinite(scale1) &&
      Number.isFinite(scale5) &&
      Number.isFinite(scale10) &&
      scale1 > scale5 &&
      scale5 > scale10;

    const gameEl = document.getElementById('game');
    gameEl?.classList.remove('rising-warning');
    scene.showRisingWarning?.();
    const risingWarningApplied = gameEl ? gameEl.classList.contains('rising-warning') : false;

    const previousVexes = Array.isArray(scene.activeVexes) ? [...scene.activeVexes] : [];
    scene.clearAllVexTimers?.();

    scene.activeVexes.splice(0, scene.activeVexes.length,
      { id: 'rising_dread', rank: 10 },
      { id: 'corruption', rank: 10 },
      { id: 'mirage', rank: 10 },
      { id: 'tremor', rank: 6 },
      { id: 'whiplash', rank: 6 },
    );
    scene.setupVexEffects?.();

    const hasRisingTimer = scene.vexIntervals?.has?.('rising_dread') ?? false;
    const hasCorruptionTimer = scene.vexIntervals?.has?.('corruption') ?? false;
    const hasMirageTimer = scene.vexIntervals?.has?.('mirage') ?? false;
    const tremorOverlayPresent = Boolean(document.getElementById('tremor-overlay'));
    const whiplashOverlayPresent = Boolean(document.getElementById('whiplash-overlay'));

    scene.clearAllVexTimers?.();
    scene.activeVexes.splice(0, scene.activeVexes.length, ...previousVexes);
    scene.setupVexEffects?.();

    const passed =
      quicksandScalingValid &&
      risingWarningApplied &&
      hasRisingTimer &&
      hasCorruptionTimer &&
      hasMirageTimer &&
      tremorOverlayPresent &&
      whiplashOverlayPresent;

    return {
      passed,
      details: {
        scale1,
        scale5,
        scale10,
        quicksandScalingValid,
        risingWarningApplied,
        hasRisingTimer,
        hasCorruptionTimer,
        hasMirageTimer,
        tremorOverlayPresent,
        whiplashOverlayPresent,
      },
    };
  });

  let resolveModifiers = {
    passed: true,
    details: { skipped: mode !== 'dev' },
  };

  if (mode === 'dev') {
    resolveModifiers = await page.evaluate(async () => {
      const scene = window.game?.scene?.keys?.GameScene;
      if (!scene) {
        return { passed: false, details: { reason: 'GameScene not found' } };
      }

      const { STARTER_VEX_FACTORIES } = await import('/src/game/vex.ts');
      const previousVexes = [...scene.activeVexes];
      const previousResolve = scene.resolveCurrent;
      const previousParams = { ...scene.currentLevelParams };

      scene.activeVexes.splice(0, scene.activeVexes.length);
      const baseRealtime = scene.getRealtimeResolveDrainPerSecond?.();
      const basePerPiece = scene.getPerPieceResolveDrain?.();
      const baseRefund = scene.getResolveRefundForClear?.(4, 8);

      scene.activeVexes.splice(
        0,
        scene.activeVexes.length,
        STARTER_VEX_FACTORIES.quicksand(10),
        STARTER_VEX_FACTORIES.pressure(10),
        STARTER_VEX_FACTORIES.corruption(10),
        STARTER_VEX_FACTORIES.rising_dread(10),
        STARTER_VEX_FACTORIES.tremor(10),
      );

      const boostedRealtime = scene.getRealtimeResolveDrainPerSecond?.();
      const boostedPerPiece = scene.getPerPieceResolveDrain?.();
      const boostedRefund = scene.getResolveRefundForClear?.(4, 8);

      scene.currentLevelParams = { ...scene.currentLevelParams, resolveMax: 100 };
      scene.resolveCurrent = 99.5;
      scene.applyResolveDelta?.(5);
      const clampedHigh = scene.resolveCurrent;
      scene.applyResolveDelta?.(-500);
      const clampedLow = scene.resolveCurrent;

      scene.activeVexes.splice(0, scene.activeVexes.length, ...previousVexes);
      scene.resolveCurrent = previousResolve;
      scene.currentLevelParams = previousParams;

      return {
        passed:
          Number.isFinite(baseRealtime) &&
          Number.isFinite(basePerPiece) &&
          Number.isFinite(baseRefund) &&
          Number.isFinite(boostedRealtime) &&
          Number.isFinite(boostedPerPiece) &&
          Number.isFinite(boostedRefund) &&
          boostedRealtime > baseRealtime &&
          boostedPerPiece > basePerPiece &&
          boostedRefund > baseRefund &&
          clampedHigh === 100 &&
          clampedLow === 0,
        details: {
          baseRealtime,
          boostedRealtime,
          basePerPiece,
          boostedPerPiece,
          baseRefund,
          boostedRefund,
          clampedHigh,
          clampedLow,
        },
      };
    });
  }

  let vexFactoryMatrix = {
    passed: true,
    details: { skipped: mode !== 'dev' },
  };

  if (mode === 'dev') {
    vexFactoryMatrix = await page.evaluate(async () => {
      const scene = window.game?.scene?.keys?.GameScene;
      if (!scene) {
        return { passed: false, details: { reason: 'GameScene not found' } };
      }

      const { STARTER_VEX_FACTORIES } = await import('/src/game/vex.ts');
      const ids = Object.keys(STARTER_VEX_FACTORIES);
      const previousVexes = Array.isArray(scene.activeVexes) ? [...scene.activeVexes] : [];
      const previousState = scene.gameState;
      const details = {};

      scene.gameState = 'PLAYING';

      for (const id of ids) {
        scene.clearAllVexTimers?.();
        scene.activeVexes.splice(0, scene.activeVexes.length, STARTER_VEX_FACTORIES[id](10));
        scene.setupVexEffects?.();

        // Allow DOM overlays/timers to initialize.
        const settleMs = id === 'blackout' ? 1200 : 30;
        await new Promise((resolve) => setTimeout(resolve, settleMs));

        let ok = true;
        if (id === 'blackout') ok = Boolean(document.getElementById('blackout-overlay'));
        if (id === 'fog') ok = Boolean(document.getElementById('fog-canvas'));
        if (id === 'corruption') ok = scene.vexIntervals?.has?.('corruption') ?? false;
        if (id === 'quicksand') {
          const rank = scene.getActiveVexRank?.('quicksand') ?? 0;
          const scale = scene.getQuicksandGravityScale?.(rank);
          ok = Number.isFinite(scale) && scale > 0 && scale < 1;
        }
        if (id === 'amnesia') ok = (scene.getActiveVexRank?.('amnesia') ?? 0) === 10;
        if (id === 'rising_dread') ok = scene.vexIntervals?.has?.('rising_dread') ?? false;
        if (id === 'lead_fingers') ok = (scene.getActiveVexRank?.('lead_fingers') ?? 0) === 10;
        if (id === 'whiplash') ok = Boolean(document.getElementById('whiplash-overlay'));
        if (id === 'tremor') ok = Boolean(document.getElementById('tremor-overlay'));
        if (id === 'mirage') ok = scene.vexIntervals?.has?.('mirage') ?? false;
        if (id === 'jinxed') ok = (scene.getActiveVexRank?.('jinxed') ?? 0) === 10;
        if (id === 'pressure') ok = (scene.getActiveVexRank?.('pressure') ?? 0) === 10;

        details[id] = ok;
      }

      scene.clearAllVexTimers?.();
      scene.activeVexes.splice(0, scene.activeVexes.length, ...previousVexes);
      scene.gameState = previousState;
      scene.setupVexEffects?.();

      const passed = Object.values(details).every(Boolean);
      return { passed, details };
    });
  }

  let devPanelVexToggle = {
    passed: true,
    details: { skipped: mode !== 'dev' },
  };

  if (mode === 'dev') {
    // Use the exposed panel API so automation doesn't depend on keyboard focus.
    await page.evaluate(() => {
      const panel = window.__vextrisDevPanel
      if (panel?.open) panel.open()
      else if (panel?.toggle) panel.toggle()
    })

    await page.waitForSelector('#vextris-dev-panel.open', { timeout: 5000 });
    await page.click('#dev-clear-vexes');
    await page.click('[data-vex="fog"][data-rank="1"]');
    await page.waitForTimeout(200);

    const devPanelDetails = await page.evaluate(() => {
      const scene = window.game?.scene?.keys?.GameScene;
      if (!scene) {
        return { reason: 'GameScene not found' };
      }

      const fog = scene.activeVexes.find((v) => v.id === 'fog');
      const panel = document.getElementById('vextris-dev-panel');
      const fogCanvas = document.getElementById('fog-canvas');

      return {
        fogRank: fog?.rank ?? 0,
        activeIds: scene.activeVexes.map((v) => `${v.id}:${v.rank}`),
        panelOpen: panel ? panel.classList.contains('open') : false,
        fogCanvasPresent: Boolean(fogCanvas),
      };
    });

    devPanelVexToggle = {
      passed: devPanelDetails.fogRank === 1 && devPanelDetails.fogCanvasPresent === true,
      details: devPanelDetails,
    };

    await page.click('#dev-clear-vexes');
    await page.keyboard.press('Backquote');
  }

  const perf = await page.evaluate(() => {
    const scene = window.game?.scene?.keys?.GameScene;
    if (!scene || typeof scene.render !== 'function' || typeof scene.update !== 'function') {
      return { passed: false, details: { reason: 'Scene render/update unavailable' } };
    }

    const renderIterations = 180;
    let start = performance.now();
    for (let i = 0; i < renderIterations; i++) {
      scene.render();
    }
    const renderAvgMs = (performance.now() - start) / renderIterations;

    const updateIterations = 180;
    let now = performance.now();
    start = performance.now();
    for (let i = 0; i < updateIterations; i++) {
      now += 17;
      scene.update(now, 16.67);
    }
    const updateAvgMs = (performance.now() - start) / updateIterations;

    return {
      passed: Number.isFinite(renderAvgMs) && Number.isFinite(updateAvgMs),
      details: {
        renderAvgMs: Number(renderAvgMs.toFixed(3)),
        updateAvgMs: Number(updateAvgMs.toFixed(3)),
        updateApproxFpsCpuBound: Number((1000 / updateAvgMs).toFixed(1)),
      },
    };
  });

  const allocationMicrobench = await page.evaluate(() => {
    const scene = window.game?.scene?.keys?.GameScene;
    if (!scene) {
      return { passed: false, details: { reason: 'GameScene not found' } };
    }
    if (typeof scene.showFloatingText !== 'function' || typeof scene.renderFloatingTexts !== 'function' || typeof scene.clearLines !== 'function') {
      return { passed: false, details: { reason: 'Required benchmark hooks unavailable' } };
    }

    const boardHeight = scene.board?.length ?? 0;
    const boardWidth = boardHeight > 0 ? scene.board[0]?.length ?? 0 : 0;
    if (boardWidth <= 0 || boardHeight <= 0) {
      return { passed: false, details: { reason: 'Board dimensions unavailable' } };
    }

    if (Array.isArray(scene.floatingTextPool)) {
      for (const ft of scene.floatingTextPool) {
        ft.active = false;
        ft.obj?.setVisible?.(false);
      }
    }

    const floatBursts = 80;
    const burstSize = 8;
    const floatStart = performance.now();
    let maxActiveFloating = 0;

    for (let burst = 0; burst < floatBursts; burst++) {
      const baseX = (scene.BOARD_OFFSET_X ?? 48) + (scene.BOARD_PIXEL_WIDTH ?? 320) / 2;
      const baseY = (scene.BOARD_OFFSET_Y ?? 112) + ((burst % 6) * 20);
      for (let i = 0; i < burstSize; i++) {
        scene.showFloatingText(baseX + (i - 4) * 4, baseY, `+${burst}-${i}`, '#e6d2be', 1);
      }

      for (let step = 0; step < 6; step++) {
        for (const ft of scene.floatingTextPool) {
          if (!ft.active) continue;
          ft.y -= 0.25;
          ft.life -= 0.09;
          if (ft.life <= 0) ft.active = false;
        }
        scene.renderFloatingTexts();
      }

      let activeNow = 0;
      for (const ft of scene.floatingTextPool) {
        if (ft.active) activeNow++;
      }
      if (activeNow > maxActiveFloating) maxActiveFloating = activeNow;
    }

    const floatBurstAvgMs = (performance.now() - floatStart) / floatBursts;
    const floatingPoolSize = Array.isArray(scene.floatingTextPool) ? scene.floatingTextPool.length : -1;

    const clearIterations = 120;
    const clearStart = performance.now();
    let totalClusters = 0;
    let totalLines = 0;

    for (let iter = 0; iter < clearIterations; iter++) {
      scene.board = Array.from({ length: boardHeight }, () =>
        Array.from({ length: boardWidth }, () => ({ filled: false, color: 0x111111 }))
      );

      for (let y = boardHeight - 1; y >= boardHeight - 4; y--) {
        for (let x = 0; x < boardWidth; x++) {
          const band = ((x + iter) % 3);
          const color = band === 0 ? 0x44bbff : band === 1 ? 0xff8844 : 0x6fd08a;
          scene.board[y][x] = { filled: true, color };
        }
      }

      scene.clearingLines = [];
      scene.scoringClusters = [];
      scene.clearTimer = 0;
      scene.clearLines();

      totalLines += scene.clearingLines.length;
      totalClusters += scene.scoringClusters.length;
    }

    const clearLinesAvgMs = (performance.now() - clearStart) / clearIterations;
    const particlePoolSize = Array.isArray(scene.particlePool) ? scene.particlePool.length : -1;

    return {
      passed:
        Number.isFinite(floatBurstAvgMs) &&
        Number.isFinite(clearLinesAvgMs) &&
        floatingPoolSize > 0 &&
        floatingPoolSize <= 20 &&
        particlePoolSize <= 80,
      details: {
        floatBurstAvgMs: Number(floatBurstAvgMs.toFixed(3)),
        clearLinesAvgMs: Number(clearLinesAvgMs.toFixed(3)),
        floatingPoolSize,
        maxActiveFloating,
        particlePoolSize,
        totalLines,
        totalClusters,
      },
    };
  });

  const memory = await page.evaluate(() => {
    if (!performance.memory) {
      return null;
    }

    return {
      usedMB: Number((performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1)),
      totalMB: Number((performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(1)),
    };
  });

  const leadFingersScaling = await page.evaluate(() => {
    const scene = window.game?.scene?.keys?.GameScene;
    if (!scene) {
      return { passed: false, details: { reason: 'GameScene not found' } };
    }
    if (typeof scene.getLeadFingersPenaltyScale !== 'function') {
      return { passed: false, details: { reason: 'getLeadFingersPenaltyScale not accessible' } };
    }

    // Save and restore currentLevel
    const savedLevel = scene.currentLevel;

    scene.currentLevel = 1;
    const scaleAt1 = scene.getLeadFingersPenaltyScale();

    scene.currentLevel = 10;
    const scaleAt10 = scene.getLeadFingersPenaltyScale();

    scene.currentLevel = 5;
    const scaleAt5 = scene.getLeadFingersPenaltyScale();

    scene.currentLevel = savedLevel;

    const expectedAt1 = 0.4;
    const expectedAt10 = 1.0;
    const expectedAt5 = 0.4 + 0.6 * (4 / 9);

    const tol = 0.001;
    const ok1 = Math.abs(scaleAt1 - expectedAt1) < tol;
    const ok10 = Math.abs(scaleAt10 - expectedAt10) < tol;
    const ok5 = Math.abs(scaleAt5 - expectedAt5) < tol;
    const monotonicOk = scaleAt1 < scaleAt5 && scaleAt5 < scaleAt10;

    return {
      passed: ok1 && ok10 && ok5 && monotonicOk,
      details: { scaleAt1, scaleAt5, scaleAt10, ok1, ok5, ok10, monotonicOk },
    };
  });

  await browser.close();

  const tests = [
    { name: 'scene_bootstrap', ...bootstrap },
    { name: 'direct_line_clear', ...directLineClear },
    { name: 'keyboard_setup', ...keyboardSetup },
    { name: 'keyboard_line_clear_e2e', ...keyboardLineClear },
    { name: 'preview_visibility', ...previewVisibility },
    { name: 'quicksand_bonus_hex', ...quicksandBonusHex },
    { name: 'vex_runtime_sanity', ...vexRuntimeSanity },
    { name: 'resolve_modifiers', ...resolveModifiers },
    { name: 'vex_factory_matrix', ...vexFactoryMatrix },
    { name: 'devpanel_vex_toggle', ...devPanelVexToggle },
    { name: 'allocation_microbench', ...allocationMicrobench },
    { name: 'lead_fingers_scaling', ...leadFingersScaling },
    { name: 'perf_microbench', ...perf },
  ];

  const failedTests = tests.filter((test) => !test.passed).map((test) => test.name);

  return {
    ok: failedTests.length === 0 && pageErrors.length === 0,
    tests,
    failedTests,
    perf: perf.details,
    memory,
    consoleWarnings,
    pageErrors,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const port = args.port ?? await findAvailablePort(DEFAULT_PORT[args.mode]);

  console.log(`Running smoke suite in ${args.mode} mode on port ${port}...`);

  if (args.mode === 'preview' && !args.skipBuild) {
    await runCommand('npm', ['run', 'build'], 'Production build');
  }

  let serverProcess;
  try {
    const { child, url } = await startServer(args.mode, port);
    serverProcess = child;

    const startedAt = Date.now();
    const report = await runSmokeSuite(url, args.mode);
    const totalMs = Date.now() - startedAt;

    console.log('\nSmoke Suite Report');
    console.log('==================');
    for (const test of report.tests) {
      const icon = test.passed ? 'PASS' : 'FAIL';
      console.log(`${icon} ${test.name}`);
    }
    console.log(`Duration: ${totalMs}ms`);
    if (report.perf) {
      console.log(`Perf: renderAvgMs=${report.perf.renderAvgMs}, updateAvgMs=${report.perf.updateAvgMs}, cpuBoundFps=${report.perf.updateApproxFpsCpuBound}`);
    }
    if (report.memory) {
      console.log(`Memory: usedMB=${report.memory.usedMB}, totalMB=${report.memory.totalMB}`);
    }

    console.log('\nRaw report JSON:');
    console.log(JSON.stringify(report, null, 2));

    if (!report.ok) {
      throw new Error(`Smoke suite failed. Failed tests: ${report.failedTests.join(', ') || 'none'}; pageErrors=${report.pageErrors.length}`);
    }
  } finally {
    await stopProcess(serverProcess);
  }
}

main().catch((error) => {
  console.error('\nSmoke suite execution failed:');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
