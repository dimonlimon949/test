const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8041/index.html');
  await page.waitForSelector('#menu-screen.active', { timeout: 8000 });
  // чистый профиль
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#menu-screen.active', { timeout: 8000 });

  // выдаём монеты и покупаем ВСЕ улучшения до MAX через реальный код покупки
  await page.evaluate(() => {
    Save.data.coins = 100000; Save.store();
    UPGRADES.forEach(def => { for (let i = 0; i < def.max; i++) Upgrades.buy(def.id); });
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
  for (let i = 0; i < 160; i++) {
    await page.waitForTimeout(450);
    const st = await page.evaluate(() => Game.state);
    if (st === 'win') { result = 'WIN at step ' + i; break; }
    if (st === 'dead') { result = 'DEAD at step ' + i + ' hp:' + await page.evaluate(() => document.getElementById('hp-text').textContent); break; }
  }
  console.log(result);
  await page.screenshot({ path: '/tmp/shot_full.png' });
  if (result.startsWith('WIN')) {
    console.log('unlocked:', await page.evaluate(() => Save.data.unlockedLevel), 'coins:', await page.evaluate(() => Save.data.coins));
    await page.click('#win-screen [data-action="next-level"]');
    await page.waitForTimeout(400);
    console.log('after next: state=', await page.evaluate(() => Game.state), 'level=', await page.evaluate(() => document.getElementById('hud-level').textContent));
  }
  await page.evaluate(() => clearInterval(window.__bot));
  await page.keyboard.up('x'); await page.keyboard.up('d');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS');
  await browser.close();
})();
