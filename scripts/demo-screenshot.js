const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 640, height: 840 } });
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const res = await page.evaluate(() => {
    const scene = window.game && window.game.scene && window.game.scene.keys && window.game.scene.keys['GameScene'];
    if (!scene) return 'no-scene';
    scene.scoringClusters = [{ blocks: [{ x: 0, y: 17 }, { x: 1, y: 17 }, { x: 2, y: 17 }, { x: 3, y: 17 }], color: 0x00BFFF }];
    scene.clearingLines = [17];
    scene.clearTimer = 1;
    return 'ok';
  });
  console.log('eval result', res);
  await page.waitForTimeout(1400);
  const path = 'C:/dev/vextris/last_clear_demo.png';
  await page.screenshot({ path, fullPage: true });
  console.log('screenshot saved to', path);
  await browser.close();
})().catch(e=>{ console.error(e); process.exit(1); });