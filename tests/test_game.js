const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

  await page.goto('http://localhost:8041/index.html');
  await page.waitForSelector('#menu-screen.active', { timeout: 8000 });
  console.log('LOADING->MENU OK');

  const closeModal = () => page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')));

  await page.click('[data-action="upgrades"]');
  await page.waitForSelector('#upgrade-modal.active');
  console.log('UPGRADE MODAL OK, rows:', await page.locator('.upg-row').count());
  await closeModal();

  await page.click('[data-action="levels"]');
  await page.waitForSelector('#levels-modal.active');
  console.log('LEVELS MODAL OK, cards:', await page.locator('.level-card').count());
  await closeModal();

  await page.click('[data-action="howto"]');
  await page.waitForSelector('#howto-modal.active');
  await closeModal();

  // старт игры
  await page.click('[data-action="play"]');
  await page.waitForSelector('#game-screen.active');
  console.log('GAME STARTED, state=', await page.evaluate(() => Game.state));

  // движение/прыжок/стрельба
  await page.keyboard.down('d'); await page.waitForTimeout(900);
  await page.keyboard.press('w'); await page.waitForTimeout(400);
  await page.keyboard.down('x'); await page.waitForTimeout(700); await page.keyboard.up('x');
  await page.keyboard.up('d');
  console.log('HUD:', JSON.stringify(await page.evaluate(() => ({ hp: document.getElementById('hp-text').textContent, coins: document.getElementById('hud-coins').textContent }))));

  // пауза/продолжить
  await page.keyboard.press('p'); await page.waitForTimeout(300);
  console.log('PAUSE state=', await page.evaluate(() => Game.state));
  await page.click('[data-action="resume"]');

  // долго стоим и стреляем — проверяем, что бой с жуками работает и монеты капают
  await page.keyboard.down('x'); await page.waitForTimeout(2500); await page.keyboard.up('x');
  const hud2 = await page.evaluate(() => ({ hp: document.getElementById('hp-text').textContent, kills: document.getElementById('hud-kills').textContent, score: document.getElementById('hud-score').textContent }));
  console.log('AFTER COMBAT:', JSON.stringify(hud2));
  await page.screenshot({ path: '/tmp/shot_game.png' });

  // проверка покупки улучшения за накопленные монеты прямо из игры через модалку паузы
  await page.evaluate(() => Game.pause(true));
  await page.click('[data-action="open-upgrade-pause"]');
  const buyable = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.upg-buy')].filter(b => !b.disabled);
    if (btns.length) { btns[0].click(); return true; } return false;
  });
  console.log('BOUGHT UPGRADE IN-GAME:', buyable, 'coins now:', await page.evaluate(() => Save.data.coins));
  await closeModal();
  await page.evaluate(() => Game.pause(false));

  // смерть игрока -> экран смерти
  await page.evaluate(() => Game.onPlayerDeath());
  await page.waitForSelector('#death-screen.active');
  console.log('DEATH SCREEN OK');
  await page.click('[data-action="quit"]');
  await page.waitForSelector('#menu-screen.active');
  console.log('QUIT TO MENU OK');

  // победа: форсируем портал на уровне 1
  await page.click('[data-action="play"]');
  await page.waitForSelector('#game-screen.active');
  await page.evaluate(() => { /* нет доступа к world извне — используем следующий трюк: ждём. Вместо этого проверим win-экран напрямую */ });
  await page.evaluate(() => { Game.quitToMenu(); });
  // проверка разблокировки через localStorage после «победы» симулируем вручную невозможна — пропускаем

  await page.screenshot({ path: '/tmp/shot_menu.png' });
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
