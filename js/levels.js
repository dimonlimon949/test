/* ============ УРОВНИ: генерация мира, платформ, врагов, боссов ============ */
const LEVELS = [
  { name:'Неоновые джунгли', bg:['#0a1230','#161f4d'], accent:'#39ffb0', len:5200, gravity:1800,
    enemies:{crawler:10, flyer:4, turret:2}, boss:{hp:380, name:'ЖУК-ТИТАН', color:'#39ffb0'}, reward:120 },
  { name:'Пепельные пустоши', bg:['#1a0d12','#3a1620'], accent:'#ff7a4d', len:6000, gravity:1800,
    enemies:{crawler:12, flyer:7, turret:4}, boss:{hp:560, name:'МАГМАВОЛК', color:'#ff7a4d'}, reward:180 },
  { name:'Ледяные шпили', bg:['#081c2e','#0f3350'], accent:'#7df9ff', len:6800, gravity:1700,
    enemies:{crawler:10, flyer:10, turret:6}, boss:{hp:760, name:'КРИОДРОН-ПРАЙМ', color:'#7df9ff'}, reward:250 },
  { name:'Гроза над городом', bg:['#120b26','#2a1652'], accent:'#ffd76b', len:7600, gravity:1750,
    enemies:{crawler:14, flyer:12, turret:8}, boss:{hp:980, name:'ВОЛЬТ-КОЛОСС', color:'#ffd76b'}, reward:330 },
  { name:'Тёмная орбита', bg:['#05050f','#141432'], accent:'#ff5bd6', len:8400, gravity:1650,
    enemies:{crawler:14, flyer:16, turret:10}, boss:{hp:1250, name:'НЕКСУС-СТРАЖ', color:'#ff5bd6'}, reward:420 },
  { name:'Ядро бездны', bg:['#1b0218','#3c0530'], accent:'#b400ff', len:9200, gravity:1600,
    enemies:{crawler:16, flyer:18, turret:12}, boss:{hp:1600, name:'ВЛАДЫКА БЕЗДНЫ', color:'#b400ff'}, reward:600 },
];

const Levels = {
  /* Псевдослучайный генератор с сидом — уровень всегда одинаков */
  rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); },

  build(index) {
    const cfg = LEVELS[index], R = this.rng(1000 + index * 777);
    const W = cfg.len, groundY = 620;
    const world = { cfg, index, width: W, groundY, platforms: [], enemies: [], coins: [], hearts: [], portal: null, bossSpawnX: W - 700 };

    // земля с ямами
    let x = 0;
    while (x < W) {
      const gapChance = x > 600 && x < W - 900 ? 0.22 : 0;
      if (R() < gapChance) { const g = 130 + R() * 110; x += g; continue; }
      const seg = 320 + R() * 520;
      world.platforms.push({ x, y: groundY, w: Math.min(seg, W - x), h: 140, ground: true });
      x += seg;
    }
    // парящие платформы
    let px = 500;
    while (px < W - 900) {
      px += 260 + R() * 320;
      const py = groundY - (120 + R() * 240);
      world.platforms.push({ x: px, y: py, w: 130 + R() * 130, h: 22, ground: false });
      // монеты дугой над платформой
      for (let i = 0; i < 4; i++) world.coins.push({ x: px + 20 + i * 34, y: py - 55 - Math.sin(i / 3 * Math.PI) * 26, r: 11, taken: false, ph: R() * 6 });
    }
    // наземные монеты
    for (let cx = 300; cx < W - 900; cx += 150 + R() * 200) {
      if (R() < 0.55) world.coins.push({ x: cx, y: groundY - 46, r: 11, taken: false, ph: R() * 6 });
    }
    // аптечки
    for (let i = 0; i < 3; i++) world.hearts.push({ x: 900 + R() * (W - 2200), y: groundY - 60, r: 15, taken: false, ph: R() * 6 });

    // враги
    const place = (type, n) => {
      for (let i = 0; i < n; i++) {
        const ex = 700 + (W - 1800) * ((i + R() * 0.7) / n);
        if (type === 'crawler') world.enemies.push(new Crawler(ex, groundY - 34));
        else if (type === 'flyer') world.enemies.push(new Flyer(ex, groundY - 220 - R() * 160));
        else world.enemies.push(new Turret(ex, groundY - 30));
      }
    };
    for (const [t, n] of Object.entries(cfg.enemies)) place(t, n);

    world.portal = { x: W - 180, y: groundY - 120, w: 70, h: 120, active: false, ph: 0 };
    world.bossCfg = cfg.boss;
    return world;
  }
};
