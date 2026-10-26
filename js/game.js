/* ============ ГЛАВНЫЙ ДВИЖОК ИГРЫ ============ */
const Game = (() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const VIEW_H = 760; // логическая высота мира
  let W = 0, H = 0, scale = 1;

  let state = 'boot'; // boot | menu | playing | paused | dead | win
  let world = null, player = null;
  let bullets = [], ebullets = [], particles = [], floatTexts = [];
  let camX = 0, shakeT = 0, shakeAmp = 0, time = 0, lastTs = 0;
  let kills = 0, score = 0, levelCoins = 0, boss = null, bossSpawned = false, portalTimer = 0;
  let currentLevel = 0;

  const keys = { left:false, right:false, jump:false, jumpPressed:false, shoot:false };

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W; canvas.height = H;
    scale = H / VIEW_H;
  }
  window.addEventListener('resize', resize); resize();

  /* ---------- ввод (поддержка русской раскладки) ---------- */
  window.addEventListener('keydown', e => {
    if (['ArrowLeft','a','A','ф'].includes(e.key)) keys.left = true;
    if (['ArrowRight','d','D','в'].includes(e.key)) keys.right = true;
    if ([' ','ArrowUp','w','W','ц'].includes(e.key)) { if (!keys.jump) keys.jumpPressed = true; keys.jump = true; e.preventDefault(); }
    if (['x','X','j','J','о'].includes(e.key)) keys.shoot = true;
    if (['p','P','з','Escape'].includes(e.key)) {
      if (state === 'playing') API.pause(true); else if (state === 'paused') API.pause(false);
    }
  });
  window.addEventListener('keyup', e => {
    if (['ArrowLeft','a','A','ф'].includes(e.key)) keys.left = false;
    if (['ArrowRight','d','D','в'].includes(e.key)) keys.right = false;
    if ([' ','ArrowUp','w','W','ц'].includes(e.key)) keys.jump = false;
    if (['x','X','j','J','о'].includes(e.key)) keys.shoot = false;
  });

  /* ---------- эффекты ---------- */
  function spawnParticles(x, y, n, color, spd, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, v = spd * (0.4 + Math.random());
      particles.push({ x, y, vx: Math.cos(a)*v, vy: Math.sin(a)*v - 40, life: life*(0.6+Math.random()*0.7), max: life, color, r: 2+Math.random()*3 });
    }
  }
  function floatText(x, y, text, color) { floatTexts.push({ x, y, text, color, life: 0.9 }); }
  function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  /* ================= ОБНОВЛЕНИЕ ================= */
  function update(dt) {
    const p = player;
    p.update(dt, world, keys);
    if (state !== 'playing') return; // игрок мог умереть внутри update

    // камера
    const viewW = W / scale;
    const targetCam = Math.max(0, Math.min(Math.max(0, world.width - viewW), p.cx - viewW * 0.42));
    camX += (targetCam - camX) * Math.min(1, dt * 6);

    // активация босса
    if (!bossSpawned && p.x > world.bossSpawnX) {
      bossSpawned = true;
      boss = new Boss(world.bossCfg, world);
      world.enemies.push(boss);
      Sound.play('bossRoar');
      document.getElementById('boss-bar').classList.remove('hidden');
      document.getElementById('boss-name').textContent = '☠ ' + boss.name;
      toast('⚠ БОСС: ' + boss.name);
    }

    // враги
    for (const e of world.enemies) {
      if (e.dead) continue;
      e.flash -= dt;
      if (!e.isBoss && Math.abs(e.cx - p.cx) > viewW * 0.9) continue; // спящий режим вдали
      e.onGround = false;
      e.update(dt, world, p);
      if (rectOverlap(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) p.hurt(e.touchDmg, e.cx);
    }
    world.enemies = world.enemies.filter(e => !e.dead);

    // пули игрока
    for (const b of bullets) {
      b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
      for (const e of world.enemies) {
        if (e.dead || b.hits.has(e)) continue;
        if (b.x > e.x && b.x < e.x + e.w && b.y > e.y && b.y < e.y + e.h) {
          e.hurt(b.dmg); b.hits.add(e);
          if (b.pierce <= 0) { b.life = 0; break; } else b.pierce--;
        }
      }
      if (b.life > 0) for (const pl of world.platforms) {
        if (pl.ground && b.x > pl.x && b.x < pl.x + pl.w && b.y > pl.y && b.y < pl.y + 30) { b.life = 0; spawnParticles(b.x, b.y, 3, '#8ea2c8', 80, 0.2); break; }
      }
    }
    bullets = bullets.filter(b => b.life > 0);

    // пули врагов
    for (const b of ebullets) {
      b.life -= dt; b.x += b.vx * dt; b.y += b.vy * dt;
      if (rectOverlap(p.x, p.y, p.w, p.h, b.x - 6, b.y - 6, 12, 12)) { p.hurt(b.dmg, b.x); b.life = 0; }
    }
    ebullets = ebullets.filter(b => b.life > 0);

    // монеты + магнит
    for (const c of world.coins) {
      if (c.taken) continue;
      c.ph += dt * 4;
      if (c.drop > 0) { c.drop -= dt; c.y += 200 * dt; }
      const dx = p.cx - c.x, dy = p.cy - c.y, d = Math.hypot(dx, dy);
      if (d < p.stats.magnetRange) { c.x += dx * dt * 7; c.y += dy * dt * 7; }
      if (d < 30) {
        c.taken = true; levelCoins++; score += 10;
        Save.data.coins++; Save.store();
        Sound.play('coin'); floatText(c.x, c.y, '+1💰', '#ffd76b');
        spawnParticles(c.x, c.y, 4, '#ffd76b', 90, 0.3);
      }
    }
    world.coins = world.coins.filter(c => !c.taken);

    // аптечки
    for (const h of world.hearts) {
      if (h.taken) continue; h.ph += dt * 3;
      if (Math.hypot(p.cx - h.x, p.cy - h.y) < 34) {
        h.taken = true; p.hp = Math.min(p.stats.maxHp, p.hp + 35);
        Sound.play('pickup'); floatText(h.x, h.y, '+35 HP', '#39ffb0');
        spawnParticles(h.x, h.y, 10, '#39ffb0', 120, 0.4);
      }
    }
    world.hearts = world.hearts.filter(h => !h.taken);

    // портал
    if (world.portal.active) {
      world.portal.ph += dt * 5;
      const pt = world.portal;
      if (rectOverlap(p.x, p.y, p.w, p.h, pt.x, pt.y, pt.w, pt.h)) enterPortal();
    }

    // частицы и тексты
    for (const q of particles) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 300 * dt; }
    particles = particles.filter(q => q.life > 0);
    for (const f of floatTexts) { f.life -= dt; f.y -= 40 * dt; }
    floatTexts = floatTexts.filter(f => f.life > 0);

    if (shakeT > 0) shakeT -= dt; else shakeAmp = 0;

    updateHud();
    if (boss && !boss.dead) document.getElementById('boss-fill').style.width = (100 * boss.hp / boss.maxHp) + '%';
  }

  function enterPortal() {
    portalTimer += 1;
    if (portalTimer === 1) Sound.play('portal');
    if (portalTimer > 40) {
      state = 'win'; Sound.stopMusic(); Sound.play('win');
      const reward = world.cfg.reward;
      Save.data.coins += reward;
      Save.data.unlockedLevel = Math.max(Save.data.unlockedLevel, currentLevel + 2);
      const best = Save.data.bestScores[currentLevel] || 0;
      if (score > best) Save.data.bestScores[currentLevel] = score;
      Save.store();
      document.getElementById('boss-bar').classList.add('hidden');
      if (currentLevel + 1 >= LEVELS.length) { showFinal(); return; }
      document.getElementById('win-stats').innerHTML =
        `🏆 Очки: ${score}<br>👾 Убийств: ${kills}<br>💰 Монет за уровень: ${levelCoins}<br>🎁 Бонус за победу: +${reward} 💰`;
      document.getElementById('win-screen').classList.add('active');
    }
  }

  function updateHud() {
    if (!player) return;
    document.getElementById('hp-fill').style.width = (100 * player.hp / player.stats.maxHp) + '%';
    document.getElementById('hp-text').textContent = Math.ceil(player.hp) + '/' + player.stats.maxHp;
    document.getElementById('xp-fill').style.width = (100 * player.xp / player.xpNext) + '%';
    document.getElementById('xp-text').textContent = 'LVL ' + player.level;
    document.getElementById('hud-coins').textContent = Save.data.coins;
    document.getElementById('hud-kills').textContent = kills;
    document.getElementById('hud-score').textContent = score;
  }

  /* ================= ОТРИСОВКА ================= */
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cfg = world.cfg;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, cfg.bg[0]); g.addColorStop(1, cfg.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    drawParallax();

    let sx = 0, sy = 0;
    if (shakeT > 0) { sx = (Math.random()-0.5) * shakeAmp * 2; sy = (Math.random()-0.5) * shakeAmp * 2; }
    ctx.setTransform(scale, 0, 0, scale, -camX * scale + sx, sy);

    // платформы
    for (const p of world.platforms) {
      if (p.x + p.w < camX - 50 || p.x > camX + W/scale + 50) continue;
      if (p.ground) {
        ctx.fillStyle = '#131b38';
        ctx.fillRect(p.x, p.y, p.w, p.h);
        ctx.fillStyle = cfg.accent; ctx.globalAlpha = .9;
        ctx.fillRect(p.x, p.y, p.w, 5); ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 2;
        for (let gx = p.x + 40; gx < p.x + p.w; gx += 80) { ctx.beginPath(); ctx.moveTo(gx, p.y + 8); ctx.lineTo(gx - 20, p.y + p.h); ctx.stroke(); }
      } else {
        ctx.fillStyle = '#1c2750';
        ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, 8); ctx.fill();
        ctx.fillStyle = cfg.accent; ctx.shadowColor = cfg.accent; ctx.shadowBlur = 12;
        ctx.fillRect(p.x + 4, p.y, p.w - 8, 3); ctx.shadowBlur = 0;
      }
    }

    // монеты
    for (const c of world.coins) {
      if (c.x < camX - 30 || c.x > camX + W/scale + 30) continue;
      const sq = Math.abs(Math.cos(c.ph));
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(sq * 0.8 + 0.2, 1);
      ctx.fillStyle = '#ffd76b'; ctx.shadowColor = '#ffb400'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(0, 0, c.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#a86f00'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (sq > 0.4) ctx.fillText('$', 0, 1);
      ctx.restore();
    }

    // аптечки
    for (const h of world.hearts) {
      if (h.taken) continue;
      const bob = Math.sin(h.ph) * 5;
      ctx.save(); ctx.translate(h.x, h.y + bob);
      ctx.fillStyle = '#39ffb0'; ctx.shadowColor = '#39ffb0'; ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(0, 6); ctx.bezierCurveTo(-16, -8, -8, -18, 0, -8); ctx.bezierCurveTo(8, -18, 16, -8, 0, 6); ctx.fill();
      ctx.restore();
    }

    // портал
    const pt = world.portal;
    ctx.save(); ctx.translate(pt.x + pt.w/2, pt.y + pt.h/2);
    if (pt.active) {
      const cols = ['#7df9ff','#b400ff','#ff5bd6','#39ffb0'];
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = cols[i];
        ctx.globalAlpha = .8; ctx.lineWidth = 5; ctx.shadowColor = cols[i]; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.ellipse(0, 0, 30 - i*6 + Math.sin(pt.ph + i)*4, 55 - i*10, Math.sin(pt.ph*0.3 + i), 0, 7); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center';
      ctx.fillText('ПОБЕДА!', 0, -78);
    } else {
      ctx.globalAlpha = .25; ctx.strokeStyle = '#556'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, 0, 28, 52, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // враги
    for (const e of world.enemies) {
      if (e.x + e.w < camX - 80 || e.x > camX + W/scale + 80) continue;
      e.draw(ctx, time);
      if (!e.isBoss && e.hp < e.maxHp) {
        ctx.fillStyle = '#0009'; ctx.fillRect(e.x, e.y - 10, e.w, 5);
        ctx.fillStyle = '#ff2f5e'; ctx.fillRect(e.x, e.y - 10, e.w * e.hp / e.maxHp, 5);
      }
    }

    // пули
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 10;
    for (const b of bullets) {
      ctx.fillStyle = '#aefcff';
      ctx.beginPath(); ctx.ellipse(b.x, b.y, 7, 3, Math.atan2(b.vy, b.vx), 0, 7); ctx.fill();
    }
    ctx.shadowColor = '#ff2f5e';
    for (const b of ebullets) {
      ctx.fillStyle = '#ff8ba7';
      ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, 7); ctx.fill();
    }
    ctx.shadowBlur = 0;

    // игрок
    if (player && state !== 'dead') player.draw(ctx, time);

    // частицы
    for (const q of particles) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.r/2, q.y - q.r/2, q.r, q.r);
    }
    ctx.globalAlpha = 1;

    // всплывающий текст
    ctx.textAlign = 'center'; ctx.font = 'bold 16px Arial';
    for (const f of floatTexts) {
      ctx.globalAlpha = Math.max(0, f.life / 0.9);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawParallax() {
    ctx.save();
    for (let layer = 0; layer < 3; layer++) {
      const spd = [0.1, 0.25, 0.45][layer];
      const baseH = [0.22, 0.34, 0.46][layer];
      const col = ['#0d1330', '#121a40', '#182352'][layer];
      const step = 150 + layer * 60;
      const shift = camX * spd * scale;
      ctx.fillStyle = col;
      for (let bx = -(shift % step) - step; bx < W + step; bx += step) {
        const idx = Math.floor((bx + shift) / step);
        const hh = H * (baseH + Math.abs(Math.sin(idx * 12.9898 + layer * 7)) * 0.18);
        const ww = step * 0.62;
        ctx.fillRect(bx, H - hh, ww, hh);
        if (layer === 2) {
          ctx.fillStyle = world.cfg.accent; ctx.globalAlpha = 0.10;
          for (let wy = H - hh + 18; wy < H - 30; wy += 30)
            for (let wx = bx + 8; wx < bx + ww - 10; wx += 20)
              if (Math.abs(Math.sin(wx * 3.7 + wy * 1.3)) > 0.55) ctx.fillRect(wx, wy, 7, 10);
          ctx.globalAlpha = 1; ctx.fillStyle = col;
        }
      }
    }
    // звёзды
    const R = Levels.rng(42 + currentLevel * 7);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 70; i++) {
      const sx0 = R() * 4000, sy0 = R() * H * 0.55, sz = 0.02 + R() * 0.06;
      let x = (sx0 - camX * sz * scale) % (W + 60); if (x < 0) x += W + 60;
      ctx.globalAlpha = 0.15 + R() * 0.55;
      ctx.fillRect(x - 30, sy0, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ================= ПУБЛИЧНЫЙ API ================= */
  const API = {
    spawnBullet(x, y, dx, dy, dmg, pierce) { bullets.push({ x, y, vx: dx*760, vy: dy*760, dmg, pierce, hits: new Set(), life: 1.15 }); },
    enemyShoot(x, y, ang, spd, dmg) { ebullets.push({ x, y, vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd, dmg, life: 4 }); },
    spawnHitSpark(x, y) { spawnParticles(x, y, 5, '#ffe9a0', 130, 0.25); },
    spawnDeathBurst(x, y, c) { spawnParticles(x, y, 16, c, 190, 0.5); },
    spawnLevelBurst(x, y) { spawnParticles(x, y, 22, '#7df9ff', 220, 0.7); },
    spawnDust(x, y, magic) { spawnParticles(x, y, magic ? 8 : 4, magic ? '#b400ff' : '#8ea2c8', 70, 0.3); },
    shakeScreen(amp, t) { shakeAmp = Math.max(shakeAmp, amp); shakeT = Math.max(shakeT, t); },
    onEnemyKilled(e) {
      kills++; score += e.isBoss ? 500 : 25; Save.data.totalKills++;
      player.addXp(e.xp);
      for (let i = 0; i < Math.min(8, e.coinDrop); i++)
        world.coins.push({ x: e.cx + (Math.random()-0.5)*40, y: e.cy - 10, r: 10, taken: false, ph: Math.random()*6, drop: 0.5 });
      floatText(e.cx, e.cy - 20, '+' + e.xp + ' XP', '#7df9ff');
      if (e.isBoss) API.onBossDefeated();
      Save.store();
    },
    refreshPlayerStats() { if (player) player.refreshStats(); updateHud(); },

    start(levelIdx) {
      currentLevel = Math.max(0, Math.min(LEVELS.length - 1, levelIdx));
      world = Levels.build(currentLevel);
      player = new Player(60, world.groundY - 140);
      bullets = []; ebullets = []; particles = []; floatTexts = [];
      camX = 0; kills = 0; score = 0; levelCoins = 0; boss = null; bossSpawned = false; portalTimer = 0;
      state = 'playing';
      showScreen('game-screen'); hideOverlays();
      document.getElementById('hud-level').textContent = currentLevel + 1;
      document.getElementById('boss-bar').classList.add('hidden');
      const b = document.getElementById('level-banner');
      b.textContent = `Уровень ${currentLevel+1}: ${world.cfg.name}`;
      b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
      Sound.startMusic();
      updateHud();
    },
    restart() { API.start(currentLevel); },
    nextLevel() { API.start(currentLevel + 1); },
    quitToMenu() {
      state = 'menu'; Sound.stopMusic();
      showScreen('menu-screen'); hideOverlays();
      document.getElementById('boss-bar').classList.add('hidden');
    },
    pause(on) {
      if (on && state === 'playing') { state = 'paused'; document.getElementById('pause-screen').classList.add('active'); Sound.play('back'); }
      else if (!on && state === 'paused') { state = 'playing'; document.getElementById('pause-screen').classList.remove('active'); Sound.play('click'); lastTs = performance.now(); }
    },
    onPlayerDeath() {
      if (state !== 'playing') return;
      state = 'dead'; Sound.stopMusic(); Sound.play('lose');
      spawnParticles(player.cx, player.cy, 30, '#00e5ff', 260, 0.8);
      document.getElementById('death-stats').innerHTML =
        `💰 Монет собрано: ${levelCoins}<br>👾 Убийств: ${kills}<br>🏆 Очки: ${score}`;
      document.getElementById('death-screen').classList.add('active');
    },
    onBossDefeated() {
      Sound.play('explosion'); API.shakeScreen(14, 0.6);
      world.portal.active = true;
      document.getElementById('boss-bar').classList.add('hidden');
      toast('🌀 Портал открыт! Иди к нему!');
      Sound.play('portal');
    },
    loop(ts) {
      requestAnimationFrame(t => API.loop(t));
      const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016); lastTs = ts;
      time += dt;
      if (state === 'playing') update(dt);
      if ((state === 'playing' || state === 'paused' || state === 'dead' || state === 'win') && world) draw();
    },
    get state(){ return state; },
    /* отладочный доступ к игровым объектам (используется автотестами) */
    debug: { get world(){ return world; }, get player(){ return player; } },
  };
  return API;
})();

/* ================= UI: ЭКРАНЫ, МЕНЮ, ЗАГРУЗКА ================= */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function hideOverlays() {
  document.querySelectorAll('.overlay-screen, .modal').forEach(m => m.classList.remove('active'));
}
function showFinal() {
  document.getElementById('final-stats').innerHTML =
    `Все ${LEVELS.length} уровней пройдены!<br>💰 Всего монет: ${Save.data.coins}<br>👾 Всего убийств: ${Save.data.totalKills}`;
  document.getElementById('final-screen').classList.add('active');
}

/* ---- анимированный фон меню ---- */
(function menuBg() {
  const c = document.getElementById('menu-bg'), x = c.getContext('2d');
  let stars = [];
  function init() {
    c.width = innerWidth; c.height = innerHeight;
    stars = Array.from({length: 130}, () => ({ x: Math.random()*c.width, y: Math.random()*c.height, z: 0.3 + Math.random()*1.4, r: Math.random()*2+0.5 }));
  }
  init(); addEventListener('resize', init);
  (function anim(t) {
    requestAnimationFrame(anim);
    x.fillStyle = '#05060f'; x.fillRect(0, 0, c.width, c.height);
    for (const s of stars) {
      s.x -= s.z * 0.7; if (s.x < 0) s.x = c.width;
      x.fillStyle = `rgba(${(120+s.z*80)|0},${(180+s.z*40)|0},255,${0.25+s.z*0.3})`;
      x.fillRect(s.x, s.y, s.r, s.r);
    }
    x.strokeStyle = 'rgba(0,229,255,.08)'; x.lineWidth = 1;
    for (let gy = c.height*0.72; gy < c.height; gy += 26) { x.beginPath(); x.moveTo(0, gy); x.lineTo(c.width, gy); x.stroke(); }
    for (let gx = (t/40)%80 - 80; gx < c.width; gx += 80) { x.beginPath(); x.moveTo(gx, c.height*0.72); x.lineTo(gx*2-c.width/2, c.height); x.stroke(); }
  })(0);
})();

/* ---- экран загрузки ---- */
const TIPS = [
  'Совет: двойной прыжок спасает от ям — купи его в мастерской.',
  'Совет: турели стреляют издалека — обходи их по парящим платформам.',
  'Совет: после смерти монеты остаются — улучшения не сгорают!',
  'Совет: магнит монет окупается на первом же уровне.',
  'Совет: приземлённый удар босса сыплет веером — прыгай в ритм.',
  'Загрузка неоновых текстур…', 'Калибровка бластера…', 'Пробуждение боссов…',
];
(function loading() {
  const fill = document.getElementById('loader-fill'), pct = document.getElementById('loader-percent'), tip = document.getElementById('loader-tip');
  let p = 0, ti = 0;
  const iv = setInterval(() => {
    p += 3 + Math.random() * 7; if (p > 100) p = 100;
    fill.style.width = p + '%'; pct.textContent = Math.floor(p) + '%';
    if (Math.random() < 0.35) { ti = (ti + 1) % TIPS.length; tip.textContent = TIPS[ti]; }
    if (p >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        showScreen('menu-screen');
        Sound.setEnabled(Save.data.sound);
        updateSoundBtn();
      }, 450);
    }
  }, 90);
})();

/* ---- hover-звуки кнопок ---- */
document.body.addEventListener('mouseover', e => { if (e.target.closest('[data-sound]')) Sound.play('hover'); });

function updateSoundBtn() {
  const on = Sound.isEnabled();
  document.querySelectorAll('[data-action="sound"]').forEach(b => b.textContent = (on ? '🔊' : '🔇') + ' Звук: ' + (on ? 'ВКЛ' : 'ВЫКЛ'));
  const m = document.getElementById('btn-mute'); if (m) m.textContent = on ? '🔊' : '🔇';
}

/* ---- действия кнопок ---- */
document.body.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  Sound.ensure();
  const act = el.dataset.action;
  switch (act) {
    case 'play': {
      Sound.play('click');
      const lvl = Math.min(Save.data.unlockedLevel, LEVELS.length) - 1;
      Game.start(lvl);
      break;
    }
    case 'upgrades': Sound.play('click'); Upgrades.render(document.getElementById('upgrade-list')); document.getElementById('upgrade-modal').classList.add('active'); break;
    case 'levels': Sound.play('click'); renderLevels(); document.getElementById('levels-modal').classList.add('active'); break;
    case 'howto': Sound.play('click'); document.getElementById('howto-modal').classList.add('active'); break;
    case 'close-modal': Sound.play('back'); document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); break;
    case 'sound': {
      Sound.play('click');
      const on = !Sound.isEnabled();
      Sound.setEnabled(on); Save.data.sound = on; Save.store(); updateSoundBtn();
      if (on && Game.state === 'playing') Sound.startMusic();
      break;
    }
    case 'resume': Game.pause(false); break;
    case 'restart': Sound.play('click'); Game.restart(); break;
    case 'quit': Sound.play('back'); Game.quitToMenu(); break;
    case 'next-level': Sound.play('click'); Game.nextLevel(); break;
    case 'open-upgrade-pause': Sound.play('click'); Upgrades.render(document.getElementById('upgrade-list')); document.getElementById('upgrade-modal').classList.add('active'); break;
  }
});
document.getElementById('btn-pause').onclick = () => { Sound.ensure(); if (Game.state === 'playing') Game.pause(true); };
document.getElementById('btn-mute').onclick = () => {
  Sound.ensure();
  const on = !Sound.isEnabled(); Sound.setEnabled(on); Save.data.sound = on; Save.store(); updateSoundBtn();
};

/* ---- выбор уровня ---- */
function renderLevels() {
  const grid = document.getElementById('levels-grid');
  grid.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const unlocked = i + 1 <= Save.data.unlockedLevel;
    const done = (Save.data.bestScores[i] || 0) > 0;
    const card = document.createElement('div');
    card.className = 'level-card' + (unlocked ? '' : ' locked') + (done ? ' done' : '');
    card.innerHTML = `<div class="level-num">${unlocked ? (done ? '✔' : i+1) : '🔒'}</div><div class="level-name">${lv.name}</div>
      <div class="upg-lvl">${done ? 'Рекорд: ' + Save.data.bestScores[i] : unlocked ? 'Открыт' : 'Заблокирован'}</div>`;
    if (unlocked) card.onclick = () => { Sound.play('click'); document.querySelectorAll('.modal').forEach(m => m.classList.remove('active')); Game.start(i); };
    else card.onclick = () => Sound.play('deny');
    grid.appendChild(card);
  });
}

/* старт главного цикла */
requestAnimationFrame(t => Game.loop(t));
