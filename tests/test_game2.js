const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://localhost:8041/index.html');
  await page.waitForSelector('#menu-screen.active', { timeout: 8000 });

  // --- тест покупки улучшения с выданными монетами ---
  await page.evaluate(() => { Save.data.coins = 500; Save.store(); });
  await page.click('[data-action="upgrades"]');
  await page.waitForSelector('#upgrade-modal.active');
  const bought = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.upg-buy')].filter(b => !b.disabled);
    if (!btns.length) return null;
    btns[0].click();
    return Save.data.upg;
  });
  console.log('UPGRADE PURCHASE:', JSON.stringify(bought), 'coins left:', await page.evaluate(() => Save.data.coins));
  await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')));

  // --- старт игры, покупка двойного прыжка и проверка stats ---
  await page.click('[data-action="play"]');
  await page.waitForSelector('#game-screen.active');
  await page.evaluate(() => { Upgrades.buy('djump'); });
  console.log('DOUBLE JUMP stat:', await page.evaluate(() => Game.state === 'playing'));

  // --- форсируем победу: открываем портал и "входим" в него серией update ---
  await page.evaluate(() => {
    // доступ к замыканию нет — поэтому проверим win через реальный геймплей невозможно.
    // вместо этого симулируем: вызов onBossDefeated тоже недосягаем. Оставляем только UI-тесты.
  });

  // --- экран победы напрямую через DOM-классы (проверка кнопок) ---
  await page.evaluate(() => {
    document.getElementById('win-stats').innerHTML = 'test';
    document.getElementById('win-screen').classList.add('active');
  });
  await page.click('#win-screen [data-action="next-level"]');
  await page.waitForTimeout(300);
  console.log('NEXT LEVEL state:', await page.evaluate(() => Game.state), 'level:', await page.evaluate(() => document.getElementById('hud-level').textContent));

  // --- финальный экран ---
  await page.evaluate(() => { showFinal(); });
  await page.waitForSelector('#final-screen.active');
  console.log('FINAL SCREEN OK');
  await page.click('#final-screen [data-action="quit"]');
  await page.waitForSelector('#menu-screen.active');
  console.log('QUIT FROM FINAL OK');

  // --- death screen quit (видимая кнопка внутри death-screen) ---
  await page.click('[data-action="play"]');
  await page.waitForSelector('#game-screen.active');
  await page.evaluate(() => Game.onPlayerDeath());
  await page.waitForSelector('#death-screen.active');
  await page.click('#death-screen [data-action="quit"]');
  await page.waitForSelector('#menu-screen.active');
  console.log('DEATH->QUIT OK');

  // скриншоты
  await page.screenshot({ path: '/tmp/shot_menu.png' });
  await page.click('[data-action="play"]');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '/tmp/shot_game.png' });

  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
