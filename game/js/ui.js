// ui.js — DOM HUD, menus, and the 9-button action pad. Keyboard and
// pointer feed the same input layer (callbacks into main.js).
const ACTIONS = [
  { id: 'punch', label: 'Punch', key: 'J' },
  { id: 'kick', label: 'Kick', key: 'K' },
  { id: 'block', label: 'Block', key: 'L', hold: true },
  { id: 'jump', label: 'Jump', key: 'Space' },
  { id: 'dash', label: 'Dash', key: 'Shift' },
  { id: 'skill1', label: 'Skill 1', key: 'Q' },
  { id: 'skill2', label: 'Skill 2', key: 'E' },
  { id: 'skill3', label: 'Skill 3', key: 'R' },
  { id: 'ult', label: 'ULTIMATE', key: 'F' },
];

export class UI {
  constructor(cb) {
    this.cb = cb;
    this.selHero = 0; this.selBot = 5; this.difficulty = 'normal';
    this.$ = (id) => document.getElementById(id);
    this.buildButtons();
    this.wireScreens();
  }
  buildButtons() {
    const pad = this.$('buttons');
    pad.innerHTML = '';
    this.btnEls = {};
    for (const a of ACTIONS) {
      const b = document.createElement('button');
      b.className = 'act-btn'; b.dataset.action = a.id;
      b.innerHTML = `<span class="cd"></span><span class="key">${a.key}</span><span class="lbl">${a.label}</span><span class="sub"></span>`;
      if (a.hold) {
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.cb.onAction('block', true); b.classList.add('held'); });
        const up = (e) => { e.preventDefault(); this.cb.onAction('block', false); b.classList.remove('held'); };
        b.addEventListener('pointerup', up);
        b.addEventListener('pointerleave', up);
        b.addEventListener('pointercancel', up);
      } else {
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.cb.onAction(a.id, true); });
      }
      pad.appendChild(b);
      this.btnEls[a.id] = b;
    }
  }
  wireScreens() {
    this.$('btn-fight').addEventListener('click', () => { this.cb.onSelect(); });
    this.$('btn-controls').addEventListener('click', () => { this.$('controls-overlay').classList.add('show'); this.cb.onSound('ui'); });
    this.$('btn-audio').addEventListener('click', () => {
      const on = this.cb.onToggleAudio();
      this.$('btn-audio').textContent = on ? 'SOUND: ON' : 'SOUND: OFF';
    });
    this.$('btn-close-controls').addEventListener('click', () => this.$('controls-overlay').classList.remove('show'));
    this.$('btn-start').addEventListener('click', () => this.cb.onStart());
    this.$('btn-rematch').addEventListener('click', () => this.cb.onRematch());
    this.$('btn-change').addEventListener('click', () => this.cb.onChangeFighter());
    this.$('btn-menu').addEventListener('click', () => this.cb.onMenu());
    for (const d of ['easy', 'normal', 'hard']) {
      this.$('diff-' + d).addEventListener('click', () => {
        this.difficulty = d;
        for (const x of ['easy', 'normal', 'hard']) this.$('diff-' + x).classList.toggle('sel', x === d);
        this.cb.onSound('ui');
      });
    }
  }
  // ---- character select ----
  buildSelect(heroes, botHeroes) {
    const grid = this.$('hero-grid');
    grid.innerHTML = '';
    heroes.forEach((h, i) => {
      const card = document.createElement('button');
      card.className = 'hero-card';
      card.style.setProperty('--el', h.color);
      card.innerHTML = `<span class="hero-glyph">${h.name[0]}</span>
        <span class="hero-name">${h.name}</span>
        <span class="hero-title">${h.title}</span>
        <span class="hero-stats">HP ${h.hp} · SPD ${h.speed} · DMG ${h.skills[0].damage}</span>`;
      card.addEventListener('click', () => { this.selHero = i; this.cb.onHeroPick(i); this.refreshSelect(heroes); });
      grid.appendChild(card);
    });
    const bg = this.$('bot-grid');
    bg.innerHTML = '';
    botHeroes.forEach((h, i) => {
      const card = document.createElement('button');
      card.className = 'hero-card bot';
      card.style.setProperty('--el', h.color);
      card.innerHTML = `<span class="hero-glyph">${h.name[0]}</span><span class="hero-name">${h.name}</span>`;
      card.addEventListener('click', () => { this.selBot = i; this.refreshSelect(heroes); this.cb.onSound('ui'); });
      bg.appendChild(card);
    });
    this.refreshSelect(heroes);
  }
  refreshSelect(heroes) {
    const cards = this.$('hero-grid').children;
    for (let i = 0; i < cards.length; i++) cards[i].classList.toggle('sel', i === this.selHero);
    const bcards = this.$('bot-grid').children;
    for (let i = 0; i < bcards.length; i++) bcards[i].classList.toggle('sel', i === this.selBot);
    const h = heroes[this.selHero];
    this.$('sel-name').textContent = h.name + ' — ' + h.title;
    this.$('sel-desc').textContent = h.desc;
    this.$('sel-skills').innerHTML = h.skills.map((s) => `<li><b>${s.key}</b> ${s.name} — ${s.desc}</li>`).join('') +
      `<li><b>F</b> ${h.ult.name} — ${h.ult.desc}</li>`;
    this.$('sel-preview').style.setProperty('--el', h.color);
    this.$('sel-preview').textContent = h.name[0];
  }
  // ---- screens ----
  show(id) {
    for (const s of ['screen-title', 'screen-select', 'screen-intro', 'screen-roundend', 'screen-matchend']) {
      this.$(s).classList.toggle('show', s === id);
    }
    this.$('hud').classList.toggle('show', id === null);
    this.$('pad-wrap').classList.toggle('show', id === null);
  }
  setIntro(a, b) {
    this.$('intro-names').textContent = `${a.name}  VS  ${b.name}`;
    this.$('intro-sub').textContent = 'BEST OF 3 · THE SHATTERCOURT';
    this.$('intro-count').textContent = '3';
  }
  setCount(n) { this.$('intro-count').textContent = String(n); }
  setRoundEnd(txt, score) {
    this.$('roundend-text').textContent = txt;
    this.$('roundend-score').textContent = score;
  }
  setMatchEnd(win, score, dmg) {
    this.$('matchend-title').textContent = win ? 'VICTORY' : 'DEFEAT';
    this.$('matchend-title').className = win ? 'win' : 'lose';
    this.$('matchend-score').textContent = score;
    this.$('matchend-dmg').textContent = 'Damage dealt: ' + dmg;
  }
  // ---- HUD (called every frame) ----
  updateHUD(m) {
    if (!m.a) return;
    const a = m.a, b = m.b;
    this.$('hp-a').style.width = (a.hp / a.maxHp * 100).toFixed(1) + '%';
    this.$('hp-b').style.width = (b.hp / b.maxHp * 100).toFixed(1) + '%';
    this.$('hp-a-txt').textContent = `${a.hero.name} ${Math.ceil(a.hp)} / ${a.maxHp}`;
    this.$('hp-b-txt').textContent = `${b.hero.name} ${Math.ceil(b.hp)} / ${b.maxHp}`;
    this.$('timer').textContent = String(Math.max(0, Math.ceil(m.timer / 60)));
    this.$('timer').classList.toggle('low', m.timer <= 600);
    const pips = (el, n) => { const c = this.$(el).children; for (let i = 0; i < 2; i++) c[i].classList.toggle('won', i < n); };
    pips('pips-a', a.rounds); pips('pips-b', b.rounds);
    this.$('meter-a').style.width = a.meter.toFixed(0) + '%';
    this.$('meter-a-txt').textContent = a.meter >= 100 ? 'ULT READY — press F' : `METER ${Math.floor(a.meter)}%`;
    this.$('meter-a-txt').classList.toggle('ready', a.meter >= 100);
    this.$('meter-b').style.width = b.meter.toFixed(0) + '%';
    // cooldowns + skill labels
    const setBtn = (id, def, cdKey, ready) => {
      const el = this.btnEls[id];
      if (!el) return;
      el.querySelector('.sub').textContent = def ? def.name : '';
      const cd = cdKey ? (a.cooldowns[cdKey] || 0) / 60 : 0;
      el.classList.toggle('cooling', cd > 0);
      el.querySelector('.cd').style.height = cd > 0 ? Math.min(100, (cd / (def.cooldown || 1)) * 100).toFixed(0) + '%' : '0%';
      el.querySelector('.lbl').textContent = cd > 0 ? Math.ceil(cd) + 's' : (def ? def.name : ACTIONS.find((x) => x.id === id).label);
      if (id === 'ult') {
        el.classList.toggle('ready', a.meter >= 100);
        if (a.meter < 100) el.querySelector('.lbl').textContent = 'ULT ' + Math.floor(a.meter) + '%';
      }
    };
    setBtn('skill1', a.hero.skills[0], 'skill1');
    setBtn('skill2', a.hero.skills[1], 'skill2');
    setBtn('skill3', a.hero.skills[2], 'skill3');
    setBtn('ult', a.hero.ult, null);
    this.btnEls.punch.classList.toggle('active', a.mode === 'attack' && a.moveId === 'punch');
    this.btnEls.kick.classList.toggle('active', a.mode === 'attack' && a.moveId === 'kick');
  }
}
