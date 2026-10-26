/* ============ СИСТЕМА УЛУЧШЕНИЙ ============ */
const UPGRADES = [
  { id:'damage',   icon:'⚔️', name:'Мощь пушки',     desc:'+25% урона за уровень',            max:8, baseCost:40,  growth:1.6 },
  { id:'firerate', icon:'🔫', name:'Скорострельность', desc:'-12% задержки между выстрелами',  max:6, baseCost:55,  growth:1.7 },
  { id:'speed',    icon:'👟', name:'Беговые ботинки', desc:'+8% скорости бега',                max:6, baseCost:35,  growth:1.55 },
  { id:'maxhp',    icon:'❤️', name:'Крепче сталь',    desc:'+25 к максимальному HP',           max:8, baseCost:50,  growth:1.6 },
  { id:'regen',    icon:'💚', name:'Наноремонт',      desc:'Регенерация +1.2 HP/сек',          max:5, baseCost:80,  growth:1.8 },
  { id:'djump',    icon:'🦘', name:'Двойной прыжок',  desc:'Прыжок второй раз в воздухе',      max:1, baseCost:150, growth:1 },
  { id:'magnet',   icon:'🧲', name:'Магнит монет',    desc:'+70px радиуса притяжения',         max:5, baseCost:45,  growth:1.5 },
  { id:'shotgun',  icon:'💥', name:'Дробовик',        desc:'+1 дробина веером при выстреле',   max:4, baseCost:90,  growth:1.75 },
  { id:'pierce',   icon:'🗡️', name:'Бронебойные',     desc:'Пули пробивают +1 врага',          max:3, baseCost:120, growth:1.9 },
  { id:'multishot',icon:'✨', name:'Три-выстрел',     desc:'Стрельба вверх и вниз тоже',      max:1, baseCost:250, growth:1 },
];

const Save = {
  key: 'neonrunner_save_v1',
  data: null,
  defaults() {
    return { coins: 0, upg: {}, unlockedLevel: 1, bestScores: {}, sound: true, totalKills: 0 };
  },
  load() {
    try { this.data = Object.assign(this.defaults(), JSON.parse(localStorage.getItem(this.key)) || {}); }
    catch(e) { this.data = this.defaults(); }
    if (!this.data.upg) this.data.upg = {};
    return this.data;
  },
  store() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch(e){} }
};
Save.load();

const Upgrades = {
  lvl(id) { return Save.data.upg[id] || 0; },
  cost(def) { const l = this.lvl(def.id); return Math.floor(def.baseCost * Math.pow(def.growth, l)); },
  buy(id) {
    const def = UPGRADES.find(u => u.id === id);
    if (!def) return false;
    const l = this.lvl(def);
    if (l >= def.max) { Sound.play('deny'); return false; }
    const c = this.cost(def);
    if (Save.data.coins < c) { Sound.play('deny'); return false; }
    Save.data.coins -= c;
    Save.data.upg[id] = l + 1;
    Save.store();
    Sound.play('buy');
    return true;
  },
  /* Итоговые характеристики игрока */
  stats() {
    const L = id => this.lvl(id);
    return {
      damage:       12 * (1 + 0.25 * L('damage')),
      shootDelay:   0.32 * Math.pow(0.88, L('firerate')),
      speed:        260 * (1 + 0.08 * L('speed')),
      maxHp:        100 + 25 * L('maxhp'),
      regen:        1.2 * L('regen'),
      doubleJump:   L('djump') > 0,
      magnetRange:  60 + 70 * L('magnet'),
      pellets:      1 + L('shotgun'),
      pierce:       L('pierce'),
      multishot:    L('multishot') > 0,
    };
  },
  render(container) {
    container.innerHTML = '';
    document.getElementById('modal-coins').textContent = Save.data.coins;
    for (const def of UPGRADES) {
      const l = this.lvl(def.id), maxed = l >= def.max, cost = this.cost(def);
      const row = document.createElement('div');
      row.className = 'upg-row' + (maxed ? ' maxed' : '');
      row.innerHTML = `<div class="upg-icon">${def.icon}</div>
        <div class="upg-info">
          <div class="upg-name">${def.name}</div>
          <div class="upg-desc">${def.desc}</div>
          <div class="upg-lvl">Уровень: ${'●'.repeat(l)}${'○'.repeat(def.max - l)} (${l}/${def.max})</div>
        </div>`;
      const btn = document.createElement('button');
      btn.className = 'btn upg-buy';
      btn.textContent = maxed ? 'MAX' : `💰 ${cost}`;
      btn.disabled = maxed || Save.data.coins < cost;
      btn.dataset.sound = 'click';
      btn.onclick = () => {
        if (this.buy(def.id)) { this.render(container); Game.refreshPlayerStats(); toast('✔ ' + def.name + ' улучшено!'); }
        else this.render(container);
      };
      row.appendChild(btn);
      container.appendChild(row);
    }
  }
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800);
}
