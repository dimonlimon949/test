const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8041/index.html');
  await page.waitForSelector('#menu-screen.active', { timeout: 8000 });
  await page.evaluate(() => { Save.data.coins = 3000; Save.store(); });
  await page.click('[data-action="play"]');
  await page.waitForSelector('#game-screen.active');

  // бот-игрок: прыгает когда нужно и стреляет
  await page.evaluate(() => {
    window.__bot = setInterval(() => {
      if (Game.state !== 'playing') return;
      // «прыжок» через событие клавиатуры
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
      setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' })), 250);
    }, 900);
  });
  await page.keyboard.down('d');
  await page.keyboard.down('x');

  let result = 'timeout';
  for (let i = 0; i < 100; i++) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => Game.state);
    if (st === 'win') { result = 'WIN at step ' + i; break; }
    if (st === 'dead') { result = 'DEAD at step ' + i; break; }
  }
  console.log(result);
  if (result.startsWith('WIN')) {
    console.log('unlocked now:', await page.evaluate(() => Save.data.unlockedLevel), 'coins:', await page.evaluate(() => Save.data.coins));
    await page.screenshot({ path: '/tmp/shot_win.png' });
  } else {
    // перезапуск с покупкой улучшений перед боем — имитация прокачанного игрока
    await page.evaluate(() => { clearInterval(window.__bot); });
  }
  await page.keyboard.up('x'); await page.keyboard.up('d');
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS IN WIN RUN');
  await browser.close();
})();
