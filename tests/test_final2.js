const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8041/index.html');
  await page.waitForSelector('#menu-screen.active', { timeout: 8000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#menu-screen.active', { timeout: 8000 });

  // купить все улучшения до MAX (теперь цикл корректный) + godmode для бота через maxhp-прогрев
  await page.evaluate(() => {
    Save.data.coins = 100000; Save.store();
    UPGRADES.forEach(def => { for (let i = 0; i < def.max; i++) Upgrades.buy(def.id); });
    Sound.setEnabled(false);
  });
  console.log('upg levels:', await page.evaluate(() => JSON.stringify(Save.data.upg)));

  await page.click('[data-action="play"]');
  await page.waitForSelector('#game-screen.active');

  await page.evaluate(() => {
    window.__bot = setInterval(() => {
      if (Game.state !== 'playing') return;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' })), 200);
    }, 550);
  });
  await page.keyboard.down('d');
  await page.keyboard.down('x');

  let result = 'timeout';
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => Game.state);
    if (st === 'win') { result = 'REAL GAMEPLAY WIN at step ' + i; break; }
    if (st === 'dead') {
      const x = await page.evaluate(() => Math.round(Game.debug.player ? Game.debug.player.x : -1));
      result = 'DEAD at step ' + i + ', playerX=' + x; break;
    }
  }
  console.log(result);
  await page.screenshot({ path: '/tmp/shot_end.png' });
  if (result.includes('WIN')) {
    console.log('unlocked:', await page.evaluate(() => Save.data.unlockedLevel));
    await page.click('#win-screen [data-action="next-level"]');
    await page.waitForTimeout(500);
    console.log('after next: state=', await page.evaluate(() => Game.state), 'level=', await page.evaluate(() => document.getElementById('hud-level').textContent));
  }
  await page.evaluate(() => clearInterval(window.__bot));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS');
  await browser.close();
})();
