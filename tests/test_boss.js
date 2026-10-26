const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8041/index.html');
  await page.waitForSelector('#menu-screen.active', { timeout: 8000 });
  await page.click('[data-action="play"]');
  await page.waitForSelector('#game-screen.active');

  // зажать "вправо" на 30 секунд игрового времени с автострельбой — добежим до босса
  await page.keyboard.down('d');
  await page.keyboard.down('x');
  let bossSeen = false, portalActive = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({ state: Game.state, kills: document.getElementById('hud-kills').textContent, hp: document.getElementById('hp-text').textContent }));
    if (!bossSeen && st.kills >= 0) { /* noop */ }
    if (st.state === 'dead') { console.log('DIED at step', i, JSON.stringify(st)); break; }
    if (st.state === 'win') { console.log('WON at step', i); break; }
    const bb = await page.evaluate(() => !document.getElementById('boss-bar').classList.contains('hidden'));
    if (bb && !bossSeen) { bossSeen = true; console.log('BOSS BAR VISIBLE, hp:', await page.evaluate(() => document.getElementById('boss-fill').style.width)); }
  }
  await page.keyboard.up('x'); await page.keyboard.up('d');
  console.log('final state:', await page.evaluate(() => Game.state), 'boss seen:', bossSeen);
  await page.screenshot({ path: '/tmp/shot_boss.png' });
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS IN BOSS RUN');
  await browser.close();
})();
