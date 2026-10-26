/* ============ ИГРОК ============ */
class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.w = 34; this.h = 52;
    this.vx = 0; this.vy = 0;
    this.dir = 1; this.onGround = false; this.jumpsLeft = 1;
    this.shootCd = 0; this.invuln = 0; this.animT = 0;
    this.level = 1; this.xp = 0; this.xpNext = 60;
    this.stats = Upgrades.stats();
    this.hp = this.stats.maxHp;
  }
  get cx(){ return this.x + this.w/2; } get cy(){ return this.y + this.h/2; }

  refreshStats() {
    const oldMax = this.stats.maxHp;
    this.stats = Upgrades.stats();
    if (this.stats.maxHp > oldMax) this.hp += this.stats.maxHp - oldMax; // прибавляем новые HP
    this.hp = Math.min(this.hp, this.stats.maxHp);
  }

  addXp(n) {
    this.xp += n;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext; this.level++;
      this.xpNext = Math.floor(60 * Math.pow(1.35, this.level - 1));
      this.hp = Math.min(this.stats.maxHp, this.hp + 20);
      Sound.play('levelup');
      toast('⭐ Уровень ' + this.level + '! +20 HP');
      Game.spawnLevelBurst(this.cx, this.cy);
    }
  }

  hurt(d, fromX) {
    if (this.invuln > 0) return;
    this.hp -= d; this.invuln = 0.9;
    Sound.play('hurt');
    Game.shakeScreen(7, 0.25);
    // отброс
    this.vy = -280; this.vx = (this.cx < fromX ? -1 : 1) * 240;
    if (this.hp <= 0) { this.hp = 0; Game.onPlayerDeath(); }
  }

  update(dt, world, keys) {
    const S = this.stats;
    // --- движение ---
    let ax = 0;
    if (keys.left) ax -= 1; if (keys.right) ax += 1;
    if (ax !== 0) { this.dir = ax; this.vx += ax * S.speed * 9 * dt; }
    else this.vx *= Math.pow(0.0004, dt); // трение
    this.vx = Math.max(-S.speed, Math.min(S.speed, this.vx));

    // --- прыжок ---
    if (keys.jumpPressed) {
      const maxJ = S.doubleJump ? 2 : 1;
      if (this.onGround) { this.vy = -640; this.jumpsLeft = maxJ - 1; Sound.play('jump'); Game.spawnDust(this.cx, this.y + this.h); }
      else if (this.jumpsLeft > 0) { this.vy = -560; this.jumpsLeft--; Sound.play('jump'); Game.spawnDust(this.cx, this.y + this.h, true); }
      keys.jumpPressed = false;
    }
    // быстрое падение при отпускании — «прыжковая» модуляция
    if (!keys.jump && this.vy < -220) this.vy += 1400 * dt;

    // --- гравитация и коллизии ---
    this.vy += world.cfg.gravity * dt;
    this.vy = Math.min(this.vy, 1200);
    this.x += this.vx * dt;
    // X-коллизии с землёй (боковые стены ям не блокируем — только границы мира)
    this.x = Math.max(0, Math.min(world.width - this.w, this.x));
    const prevBottom = this.y + this.h;
    this.y += this.vy * dt;
    this.onGround = false;
    for (const p of world.platforms) {
      if (this.x + this.w > p.x + 3 && this.x < p.x + p.w - 3) {
        if (this.vy >= 0 && prevBottom <= p.y + 4 && this.y + this.h >= p.y) {
          this.y = p.y - this.h; this.vy = 0; this.onGround = true; this.jumpsLeft = S.doubleJump ? 1 : 0;
        } else if (p.ground && this.y < p.y + p.h && this.y + this.h > p.y + 10 && prevBottom > p.y + 6) {
          // внутрь земли не проваливаемся
          this.y = p.y - this.h; this.vy = 0; this.onGround = true;
        }
      }
    }
    // упал в яму
    if (this.y > 900) { this.hp = 0; Game.onPlayerDeath(); return; }

    // --- регенерация ---
    if (S.regen > 0 && this.hp < S.maxHp && this.invuln <= 0) this.hp = Math.min(S.maxHp, this.hp + S.regen * dt);

    // --- стрельба ---
    this.shootCd -= dt;
    if (keys.shoot && this.shootCd <= 0) {
      this.shootCd = S.shootDelay;
      const bx = this.cx + this.dir * 24, by = this.cy - 4;
      const spread = S.pellets > 1 ? (S.pellets - 1) * 0.12 : 0;
      for (let i = 0; i < S.pellets; i++) {
        const ang = this.dir > 0 ? (-spread/2 + spread * (i/(Math.max(1,S.pellets-1)))) : Math.PI + (spread/2 - spread * (i/(Math.max(1,S.pellets-1))));
        Game.spawnBullet(bx, by, Math.cos(ang), Math.sin(ang), S.damage, S.pierce);
      }
      if (S.multishot) {
        Game.spawnBullet(bx, by - 6, 0, -1, S.damage * 0.8, S.pierce);
        Game.spawnBullet(bx, by + 6, 0, 1, S.damage * 0.8, S.pierce);
      }
      Sound.play(S.pellets > 1 ? 'shotgun' : 'shoot');
      Game.shakeScreen(2, 0.06);
    }

    this.invuln -= dt; this.animT += dt;
  }

  draw(ctx, t) {
    if (this.invuln > 0 && Math.floor(t * 18) % 2 === 0) return; // мигание при неуязвимости
    const moving = Math.abs(this.vx) > 30, runPhase = t * 12;
    ctx.save(); ctx.translate(this.cx, this.cy);
    ctx.scale(this.dir, 1);
    ctx.shadowColor = '#00e5ff'; ctx.shadowBlur = 16;
    // ноги
    ctx.strokeStyle = '#1de3ff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    const l1 = moving ? Math.sin(runPhase) * 10 : 3, l2 = moving ? Math.sin(runPhase + Math.PI) * 10 : -3;
    ctx.beginPath(); ctx.moveTo(-4, 8); ctx.lineTo(-4 + l1, 26); ctx.moveTo(5, 8); ctx.lineTo(5 + l2, 26); ctx.stroke();
    // тело
    ctx.fillStyle = '#0e2a4a'; ctx.strokeStyle = '#1de3ff'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.roundRect(-11, -12, 22, 24, 6); ctx.fill(); ctx.stroke();
    // ранцевый огонь
    if (!this.onGround) {
      ctx.fillStyle = '#ff9d2f'; ctx.shadowColor = '#ff5b00';
      ctx.beginPath(); ctx.moveTo(-13, -6); ctx.lineTo(-22 - Math.random()*8, -2); ctx.lineTo(-13, 2); ctx.closePath(); ctx.fill();
      ctx.shadowColor = '#00e5ff';
    }
    // голова/шлем
    ctx.fillStyle = '#123a5f'; ctx.strokeStyle = '#1de3ff';
    ctx.beginPath(); ctx.arc(0, -20, 11, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#aefcff'; ctx.shadowBlur = 10;
    ctx.fillRect(2, -24, 8, 5); // визор
    // пушка
    ctx.shadowBlur = 8; ctx.fillStyle = '#1de3ff';
    const rec = this.shootCd > (this.stats.shootDelay - 0.06) ? -4 : 0;
    ctx.fillRect(8 + rec, -6, 18, 6);
    ctx.restore();
  }
}
