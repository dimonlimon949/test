/* ============ ВРАГИ И БОССЫ ============ */
class Enemy {
  constructor(x, y, w, h, hp) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.hp = hp; this.maxHp = hp;
    this.dead = false; this.flash = 0; this.ph = Math.random() * 6.28;
    this.touchDmg = 14; this.xp = 8; this.coinDrop = 3;
  }
  get cx(){ return this.x + this.w/2; } get cy(){ return this.y + this.h/2; }
  hurt(d) {
    if (this.dead) return;
    this.hp -= d; this.flash = 0.12;
    Sound.play('hit');
    Game.spawnHitSpark(this.cx, this.cy);
    if (this.hp <= 0) this.die();
  }
  die() {
    if (this.dead) return;
    this.dead = true;
    Sound.play('kill');
    Game.onEnemyKilled(this);
    Game.spawnDeathBurst(this.cx, this.cy, this.color || '#ff5b7d');
  }
  update(dt, world, player) {}
  draw(ctx, t) {}
  applyGravity(dt, world, g) {
    this.vy += g * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    for (const p of world.platforms) {
      if (this.x + this.w > p.x && this.x < p.x + p.w && this.y + this.h > p.y && this.y + this.h < p.y + 40 && this.vy >= 0) {
        this.y = p.y - this.h; this.vy = 0; this.onGround = true;
      }
    }
  }
}

/* Ползущий жук — патрулирует, разворачивается у края */
class Crawler extends Enemy {
  constructor(x, y) { super(x, y, 46, 34, 30); this.speed = 90; this.dir = Math.random() < .5 ? -1 : 1; this.color = '#ff5b7d'; this.squish = 0; }
  update(dt, world, player) {
    this.applyGravity(dt, world, world.cfg.gravity);
    // разворот у края платформы
    const aheadX = this.dir > 0 ? this.x + this.w + 4 : this.x - 4;
    let supported = false;
    for (const p of world.platforms) if (aheadX > p.x && aheadX < p.x + p.w && Math.abs((p.y) - (this.y + this.h)) < 6) supported = true;
    if (!supported && this.onGround) this.dir *= -1;
    this.vx = this.speed * this.dir;
    this.squish = Math.sin(performance.now()/120 + this.ph) * 0.12;
  }
  draw(ctx, t) {
    ctx.save(); ctx.translate(this.cx, this.y + this.h);
    ctx.scale(1, 1 - this.squish);
    const c = this.flash > 0 ? '#ffffff' : this.color;
    ctx.shadowColor = c; ctx.shadowBlur = 14;
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(0, -16, 22, 15, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(-22, -18, 44, 6);
    // лапки
    ctx.strokeStyle = c; ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) {
      const lx = i * 13, sw = Math.sin(t*10 + i*2 + this.ph) * 5;
      ctx.beginPath(); ctx.moveTo(lx, -6); ctx.lineTo(lx + sw, 0); ctx.stroke();
    }
    // глаза
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(this.dir*8, -20, 4, 0, 7); ctx.arc(this.dir*16, -18, 3.4, 0, 7); ctx.fill();
    ctx.restore();
  }
}

/* Летающий дрон — пикирует на игрока */
class Flyer extends Enemy {
  constructor(x, y) { super(x, y, 40, 30, 22); this.homeY = y; this.color = '#7df9ff'; this.xp = 10; this.touchDmg = 12; }
  update(dt, world, player) {
    this.ph += dt * 3;
    const dx = player.cx - this.cx, dy = player.cy - this.cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 380) { // атака — преследует
      this.vx += (dx / dist) * 420 * dt; this.vy += (dy / dist) * 380 * dt;
    } else { // парит дома
      this.vx += ((this.x - this.x) * 0 + (Math.cos(this.ph) * 40 - this.vx)) * dt * 2;
      this.vy += ((this.homeY + Math.sin(this.ph * 1.7) * 26 - this.y) * 6 - this.vy) * dt * 3;
    }
    const cap = 190;
    this.vx = Math.max(-cap, Math.min(cap, this.vx)); this.vy = Math.max(-cap, Math.min(cap, this.vy));
    this.x += this.vx * dt; this.y += this.vy * dt;
  }
  draw(ctx, t) {
    const c = this.flash > 0 ? '#fff' : this.color;
    ctx.save(); ctx.translate(this.cx, this.cy);
    ctx.shadowColor = c; ctx.shadowBlur = 16;
    ctx.fillStyle = '#101a33'; ctx.strokeStyle = c; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 19, 11, 0, 0, 7); ctx.fill(); ctx.stroke();
    // роторы
    const r = Math.sin(t * 30 + this.ph) * 9;
    ctx.strokeStyle = c; ctx.globalAlpha = .7;
    ctx.beginPath(); ctx.moveTo(-16 - r, -13); ctx.lineTo(-16 + r, -13); ctx.moveTo(16 - r, -13); ctx.lineTo(16 + r, -13); ctx.stroke();
    ctx.globalAlpha = 1;
    // глаз
    ctx.fillStyle = c; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(0, 1, 5, 0, 7); ctx.fill();
    ctx.restore();
  }
}

/* Турель — стреляет снарядами */
class Turret extends Enemy {
  constructor(x, y) { super(x, y, 38, 30, 45); this.cd = 1.5; this.color = '#ffd76b'; this.xp = 14; this.coinDrop = 5; this.aimA = 0; }
  update(dt, world, player) {
    this.cd -= dt;
    const dx = player.cx - this.cx, dy = player.cy - this.cy, dist = Math.hypot(dx, dy);
    this.aimA = Math.atan2(dy, dx);
    if (dist < 560 && this.cd <= 0) {
      this.cd = 1.9;
      Game.enemyShoot(this.cx + Math.cos(this.aimA)*26, this.cy + Math.sin(this.aimA)*26, this.aimA, 240, 10);
      Sound.play('shootEnemy');
    }
  }
  draw(ctx, t) {
    const c = this.flash > 0 ? '#fff' : this.color;
    ctx.save(); ctx.translate(this.cx, this.y + this.h);
    ctx.fillStyle = '#242438'; ctx.strokeStyle = c; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-19, 0); ctx.lineTo(-13, -16); ctx.lineTo(13, -16); ctx.lineTo(19, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.translate(0, -18); ctx.rotate(this.aimA);
    ctx.shadowColor = c; ctx.shadowBlur = 12;
    ctx.fillStyle = c; ctx.fillRect(0, -4, 22, 8);
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
    ctx.restore();
  }
}

/* БОСС: паттерны — таран, круговые залпы, прыжки */
class Boss extends Enemy {
  constructor(cfg, world) {
    const s = 1 + world.index * 0.12;
    super(world.width - 420, world.groundY - 130, 120, 120, cfg.hp);
    this.name = cfg.name; this.color = cfg.color;
    this.state = 'idle'; this.timer = 1.2; this.dir = -1;
    this.touchDmg = 24; this.xp = 120; this.coinDrop = 40;
    this.isBoss = true; this.bulletDmg = 12 * s; this.bulletSpeed = 250 + world.index * 22;
  }
  update(dt, world, player) {
    this.timer -= dt;
    this.applyGravity(dt, world, world.cfg.gravity);
    const px = player.cx, dx = px - this.cx;
    if (this.state === 'idle') {
      this.vx = Math.sign(dx) * 130;
      if (this.timer <= 0) {
        const r = Math.random();
        if (r < 0.4) { this.state = 'volley'; this.shots = 5; }
        else if (r < 0.7) { this.state = 'charge'; this.vx = Math.sign(dx) * 430; }
        else { this.state = 'leap'; this.vy = -640; this.vx = Math.sign(dx) * 260; }
        Sound.play('bossRoar');
      }
    } else if (this.state === 'volley') {
      this.vx = 0;
      if (this.timer <= 0 && this.shots > 0) {
        this.shots--;
        const base = Math.atan2(player.cy - this.cy, player.cx - this.cx);
        for (let i = -1; i <= 1; i++) Game.enemyShoot(this.cx, this.cy, base + i * 0.22, this.bulletSpeed, this.bulletDmg);
        Sound.play('shootEnemy');
        this.timer = 0.45;
        if (this.shots <= 0) { this.state = 'idle'; this.timer = 1.6 + Math.random(); }
      }
    } else if (this.state === 'charge') {
      if (this.timer <= 0 || this.x < 100 || this.x > world.width - 100) { this.state = 'idle'; this.timer = 1.2 + Math.random(); }
    } else if (this.state === 'leap') {
      if (this.onGround) {
        this.state = 'idle'; this.timer = 1 + Math.random();
        Game.shakeScreen(9, 0.3);
        Sound.play('explosion');
        const base = -Math.PI / 2;
        for (let i = 0; i < 8; i++) Game.enemyShoot(this.cx, this.cy - 40, base + (i / 7) * Math.PI, this.bulletSpeed * 0.8, this.bulletDmg);
      }
    }
    this.onGround = false;
  }
  draw(ctx, t) {
    const c = this.flash > 0 ? '#fff' : this.color;
    ctx.save(); ctx.translate(this.cx, this.cy);
    ctx.shadowColor = c; ctx.shadowBlur = 26;
    // тело
    ctx.fillStyle = '#141a33'; ctx.strokeStyle = c; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-55, 60); ctx.lineTo(-45, -35); ctx.quadraticCurveTo(0, -75, 45, -35); ctx.lineTo(55, 60);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // броневые линии
    ctx.strokeStyle = c; ctx.globalAlpha = .5; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-40 + i*8, 20 + i*12); ctx.lineTo(40 - i*8, 20 + i*12); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // глаза
    const eyePulse = 6 + Math.sin(t * 5) * 2;
    ctx.fillStyle = c; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(-18, -25, eyePulse, 0, 7); ctx.arc(18, -25, eyePulse, 0, 7); ctx.fill();
    // рога
    ctx.strokeStyle = c; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-40, -40); ctx.lineTo(-58, -66); ctx.moveTo(40, -40); ctx.lineTo(58, -66); ctx.stroke();
    ctx.restore();
  }
}
