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

  // покупка ВСЕХ улучшений до MAX через реальный код UI-покупки
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
    if (st === 'win') { result = 'WIN at step ' + i; break; }
    if (st === 'dead') {
      const x = await page.evaluate(() => Math.round(Game.debug.player ? Game.debug.player.x : -1));
      result = 'DEAD at step ' + i + ', playerX=' + x; break;
    }
  }
  console.log(result);

  if (result.startsWith('DEAD')) {
    // проверка полного цикла победы на уровне 1 с помощью отладочного доступа
    await page.evaluate(() => clearInterval(window.__bot));
    await page.keyboard.up('x'); await page.keyboard.up('d');
    await page.evaluate(() => Game.restart());
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      // мгновенно убиваем всех врагов и босса корректным способом — открываем портал
      const w = Game.debug.world;
      w.enemies.forEach(e => e.die());
      w.bossCfg && null;
      Game.onBossDefeated(); // тот же путь, что после реального убийства босса
      // ставим игрока прямо к порталу
      Game.debug.player.x = w.portal.x - 10;
      Game.debug.player.y = w.groundY - 100;
    });
    let win = false;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(300);
      if (await page.evaluate(() => Game.state) === 'win') { win = true; break; }
    }
    console.log(win ? 'FULL WIN CYCLE OK (портал -> экран победы)' : 'WIN CYCLE FAILED');
    if (win) {
      console.log('unlocked:', await page.evaluate(() => Save.data.unlockedLevel), 'coins:', await page.evaluate(() => Save.data.coins));
      await page.screenshot({ path: '/tmp/shot_win.png' });
      await page.click('#win-screen [data-action="next-level"]');
      await page.waitForTimeout(500);
      console.log('after next: state=', await page.evaluate(() => Game.state), 'level=', await page.evaluate(() => document.getElementById('hud-level').textContent));
    }
  } else if (result.startsWith('WIN')) {
    await page.screenshot({ path: '/tmp/shot_win.png' });
    await page.click('#win-screen [data-action="next-level"]');
    await page.waitForTimeout(500);
    console.log('after next: state=', await page.evaluate(() => Game.state), 'level=', await page.evaluate(() => document.getElementById('hud-level').textContent));
  }

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS');
  await browser.close();
})();
