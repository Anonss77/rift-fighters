// combat.js — fixed 60 Hz fight simulation. Frame data from moves.json.
// Three-box model in 1D: pushbox (min separation), hurtbox (range check),
// hitbox (active only during ACTIVE frames). No physics engine.
import { playLoop, playAttack, playBlock, playOnce, unlock } from './chars.js';

export const FRAME = 1 / 60;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export class Fighter {
  constructor(hero, side, moves) {
    this.hero = hero; this.side = side; this.moves = moves;
    this.maxHp = hero.hp; this.hp = hero.hp; this.meter = 0;
    this.x = side === 0 ? -3 : 3; this.y = 0; this.vy = 0;
    this.facing = side === 0 ? 1 : -1;
    this.mode = 'idle'; this.modeFrame = 0;
    this.move = null; this.moveFrame = 0; this.hitDone = []; this.hitCount = 0;
    this.buffer = []; // {action, frame}
    this.blocking = false; this.airborne = false;
    this.cooldowns = {}; this.rounds = 0;
    this.combo = 0; this.comboTimer = 0; this.juggled = false;
    this.burnDps = 0; this.burnFrames = 0; this.burnTick = 0;
    this.slowFrames = 0; this.rootFrames = 0; this.stunFrames = 0;
    this.armorFrames = 0; this.guardFrames = 0; this.auraFrames = 0; this.auraTick = 0;
    this.dashCd = 0; this.dashFrames = 0; this.dashDir = 0; this.iframes = 0;
    this.wall = null; // {x, frames} glacial wall owned by this fighter
    this.damageDealt = 0; this.rig = null; this.walkAnim = 0;
  }
  resetRound() {
    this.hp = this.maxHp; this.meter = 0; this.x = this.side === 0 ? -3 : 3;
    this.y = 0; this.vy = 0; this.facing = this.side === 0 ? 1 : -1;
    this.mode = 'idle'; this.modeFrame = 0; this.move = null; this.buffer = [];
    this.cooldowns = {}; this.combo = 0; this.comboTimer = 0;
    this.burnDps = 0; this.burnFrames = 0; this.slowFrames = 0; this.rootFrames = 0;
    this.stunFrames = 0; this.armorFrames = 0; this.guardFrames = 0; this.auraFrames = 0;
    this.dashCd = 0; this.dashFrames = 0; this.iframes = 0; this.wall = null;
    this.blocking = false; this.airborne = false;
    if (this.rig) playLoop(this.rig, 'Idle');
  }
  get busy() { return this.mode === 'attack' || this.mode === 'hit' || this.mode === 'blockstun' || this.mode === 'launch' || this.mode === 'ko' || this.mode === 'stun' || this.rootFrames > 0; }
  get canAct() { return !this.busy && this.mode !== 'dash' && this.mode !== 'win'; }
  speed() { return this.hero.speed * (this.slowFrames > 0 ? 0.75 : 1); }
}

export class Match {
  constructor(moves, events) {
    this.moves = moves; this.events = events; // events: {type, ...} drained by main
    this.a = null; this.b = null;
    this.round = 1; this.timer = moves.arena.roundTime * 60; this.timerMax = this.timer;
    this.phase = 'intro'; // intro | fight | roundEnd | matchEnd
    this.phaseFrame = 0; this.hitstop = 0; this.shake = 0;
    this.replay = false; this.winner = null; this.drawReplayed = false;
    this.projectiles = []; this.waves = [];
  }
  start(heroA, heroB) {
    this.a = new Fighter(heroA, 0, this.moves);
    this.b = new Fighter(heroB, 1, this.moves);
    this.round = 1; this.drawReplayed = false; this.winner = null;
    this.projectiles = []; this.waves = [];
    this.beginRound();
  }
  beginRound() {
    this.timer = (this.replay ? 30 : this.moves.arena.roundTime) * 60;
    this.timerMax = this.timer; this.replay = false;
    this.a.resetRound(); this.b.resetRound();
    this.phase = 'intro'; this.phaseFrame = 0; this.hitstop = 0;
    this.events.push({ type: 'round', round: this.round });
  }
  // ---- input ----
  queue(f, action) {
    const buf = action === 'punch' || action === 'kick' ? 18 : action === 'ult' ? 10 : 12;
    f.buffer.push({ action, frame: buf });
    if (f.buffer.length > 4) f.buffer.shift();
  }
  setBlock(f, on) { f.blocking = on; }

  // ---- per-frame sim (60 Hz) ----
  step() {
    if (!this.a || !this.b) return; // no match started yet (title/select screens)
    if (this.hitstop > 0) { this.hitstop--; return; }
    if (this.phase === 'intro') {
      this.phaseFrame++;
      if (this.phaseFrame >= 180) { this.phase = 'fight'; this.events.push({ type: 'fight' }); }
      return;
    }
    if (this.phase !== 'fight') {
      this.phaseFrame++;
      if (this.phase === 'roundEnd' && this.phaseFrame >= 120) {
        if (this.winner) { this.phase = 'matchEnd'; this.phaseFrame = 0; this.events.push({ type: 'match', winner: this.winner }); }
        else { this.round++; this.beginRound(); }
      }
      return;
    }
    this.timer--;
    if (this.timer <= 0) { this.endRound(null); return; }
    this.stepFighter(this.a, this.b);
    this.stepFighter(this.b, this.a);
    this.separate();
    this.stepProjectiles();
    this.stepWaves();
    // combo window
    for (const f of [this.a, this.b]) {
      if (f.comboTimer > 0) { f.comboTimer--; if (f.comboTimer === 0) f.combo = 0; }
    }
    if (this.a.hp <= 0 || this.b.hp <= 0) this.endRound(this.a.hp <= 0 ? this.b : this.a);
  }

  stepFighter(f, o) {
    // timers
    if (f.dashCd > 0) f.dashCd--;
    if (f.iframes > 0) f.iframes--;
    if (f.slowFrames > 0) f.slowFrames--;
    if (f.stunFrames > 0) { f.stunFrames--; if (f.stunFrames === 0 && f.mode === 'stun') { f.mode = 'idle'; } }
    if (f.rootFrames > 0) { f.rootFrames--; if (f.rootFrames === 0 && f.mode === 'root') f.mode = 'idle'; }
    if (f.armorFrames > 0) f.armorFrames--;
    if (f.guardFrames > 0) f.guardFrames--;
    if (f.burnFrames > 0) {
      f.burnFrames--; f.burnTick++;
      if (f.burnTick >= 30) { f.burnTick = 0; this.applyDamage(f, Math.max(1, Math.round(f.burnDps / 2)), null, 'burn'); }
    }
    if (f.auraFrames > 0) {
      f.auraFrames--; f.auraTick++;
      if (f.auraTick >= 60) {
        f.auraTick = 0;
        if (Math.abs(o.x - f.x) <= 2.0 && o.mode !== 'ko') {
          this.applyDamage(o, 2, f, 'skill'); f.meter = clamp(f.meter + 1, 0, 100);
          this.events.push({ type: 'spark', x: o.x, y: 1.2, color: f.hero.color, big: false });
        }
      }
    }
    for (const k in f.cooldowns) if (f.cooldowns[k] > 0) f.cooldowns[k]--;
    // buffered input
    for (const b of f.buffer) b.frame--;
    f.buffer = f.buffer.filter((b) => b.frame > 0);
    // jump physics
    if (f.airborne) {
      f.vy -= 0.055; f.y += f.vy;
      if (f.y <= 0) { f.y = 0; f.vy = 0; f.airborne = false; if (f.mode === 'jump') f.mode = 'idle'; }
    }
    // mode updates
    switch (f.mode) {
      case 'attack': this.stepAttack(f, o); break;
      case 'hit': case 'blockstun': case 'launch':
        f.modeFrame++;
        if (f.mode === 'launch') {
          f.y = Math.max(0, Math.sin((f.modeFrame / 30) * Math.PI) * 1.4);
          if (f.modeFrame >= 30) { f.y = 0; f.mode = 'idle'; f.juggled = false; }
        } else if (f.modeFrame >= f.stunDur) { f.mode = 'idle'; }
        break;
      case 'dash':
        f.modeFrame++;
        f.x = clamp(f.x + f.dashDir * (2.0 / 10), -5.2, 5.2);
        if (f.modeFrame >= 2 && f.modeFrame <= 5) f.iframes = 1;
        if (f.modeFrame >= 28) { f.mode = 'idle'; }
        break;
      case 'ko': case 'win': case 'idle': case 'walk': break;
    }
    // blocking pose
    if (f.blocking && f.canAct && !f.airborne) {
      if (f.mode !== 'block') { f.mode = 'block'; if (f.rig) playBlock(f.rig); }
    } else if (f.mode === 'block') {
      f.mode = 'idle'; if (f.rig) playLoop(f.rig, 'Idle');
    }
    // buffered action executes on first legal frame
    if (f.canAct && f.buffer.length) {
      const act = f.buffer.shift().action;
      this.tryAction(f, o, act);
    }
    // facing: turn within 4 frames after crossing
    const want = o.x >= f.x ? 1 : -1;
    if (f.facing !== want && f.canAct) f.facing = want;
    // clamp
    f.x = clamp(f.x, -5.2, 5.2);
    // wall collision (glacial wall blocks movement)
    if (o.wall && Math.abs(f.x - o.wall.x) < 0.6) f.x = o.wall.x + (f.x < o.wall.x ? -0.6 : 0.6);
  }

  tryAction(f, o, act) {
    if (act === 'walk') return;
    if (act === 'jump') {
      if (!f.airborne) { f.airborne = true; f.vy = 0.42; f.mode = 'jump'; this.events.push({ type: 'sound', name: 'jump' }); }
      return;
    }
    if (act === 'dash') {
      const cd = f.hero.dashCooldown || this.moves.common.dashCooldown;
      if (f.dashCd > 0 || f.airborne) return;
      f.dashCd = cd; f.dashDir = f.facing; f.mode = 'dash'; f.modeFrame = 0;
      if (f.rig) playAttack(f.rig, 'Roll', 10, 28);
      this.events.push({ type: 'sound', name: 'dash' });
      return;
    }
    const def = this.moveDef(f, act);
    if (!def) return;
    if (def.cooldown && (f.cooldowns[act] || 0) > 0) return;
    if (act === 'ult' && f.meter < 100) return;
    if (act === 'ult') f.meter = 0;
    if (def.cooldown) f.cooldowns[act] = def.cooldown * 60;
    f.mode = 'attack'; f.modeFrame = 0; f.move = def; f.moveId = act; f.hitDone = []; f.hitCount = 0;
    f.combo = 0; // new attack resets own combo count; hits rebuild it
    if (f.rig) {
      const clip = def.clip || 'punch';
      playAttack(f.rig, clip === 'punch' ? 'Punch_Right' : clip === 'kick' ? 'Kick_Right' : clip === 'slash' ? 'Sword_Slash' : clip === 'roll' ? 'Roll' : 'Punch_Right',
        def.startup + def.active / 2, def.startup + def.active + def.recovery);
    }
    if (def.projectile) {
      this.projectiles.push({ x: f.x + f.facing * 0.6, vx: f.facing * 10 / 60, owner: f, def, life: 120 });
      this.events.push({ type: 'sound', name: 'skill', el: f.hero.element });
    } else if (def.shockwave) {
      this.waves.push({ x: f.x + f.facing * 0.6, vx: f.facing * 8 / 60, owner: f, def, life: 60 });
      this.events.push({ type: 'sound', name: 'skill', el: f.hero.element });
    } else if (def.wall) {
      f.wall = { x: clamp(f.x + f.facing * 2.5, -5.2, 5.2), frames: def.wall * 60 };
      this.events.push({ type: 'wall', x: f.wall.x, color: f.hero.color });
    } else if (def.armor) {
      f.armorFrames = def.armor * 60;
      this.events.push({ type: 'sound', name: 'skill', el: f.hero.element });
    } else if (def.guard) {
      f.guardFrames = def.guard * 60;
      this.events.push({ type: 'sound', name: 'skill', el: f.hero.element });
    } else if (def.aura) {
      f.auraFrames = def.aura * 60; f.auraTick = 0;
      this.events.push({ type: 'sound', name: 'skill', el: f.hero.element });
    } else if (act === 'ult') {
      this.events.push({ type: 'ult', x: f.x, color: f.hero.color });
      this.events.push({ type: 'sound', name: 'ult', el: f.hero.element });
    } else if (def.damage > 0) {
      this.events.push({ type: 'sound', name: 'skill', el: f.hero.element });
    }
  }

  moveDef(f, act) {
    const c = this.moves.common;
    const h = f.hero;
    if (act === 'punch') return { ...c.punch, damage: h.punchDmg || c.punch.damage, clip: 'punch' };
    if (act === 'kick') return { ...c.kick, damage: h.kickDmg || c.kick.damage, clip: 'kick' };
    if (act === 'skill1') return { ...h.skills[0], clip: h.skills[0].clip };
    if (act === 'skill2') return { ...h.skills[1], clip: h.skills[1].clip };
    if (act === 'skill3') return { ...h.skills[2], clip: h.skills[2].clip };
    if (act === 'ult') return { ...h.ult, clip: h.ult.clip };
    return null;
  }

  stepAttack(f, o) {
    f.modeFrame++;
    const d = f.move;
    const total = d.startup + d.active + d.recovery;
    // multi-hit scheduling
    const hits = d.hits || 1;
    const hitDmg = d.hitDmg || [d.damage];
    for (let i = 0; i < hits; i++) {
      if (f.hitDone.includes(i)) continue;
      const at = d.startup + Math.floor((i + 0.5) * (d.active / hits));
      if (f.modeFrame === at) {
        if (i > 0 && f.hitCount === 0) break; // later hits need the first to land
        this.tryHit(f, o, hitDmg[i] ?? d.damage, i, d);
      }
    }
    if (f.modeFrame >= total) {
      f.mode = 'idle'; f.move = null;
      if (f.rig) { unlock(f.rig); playLoop(f.rig, 'Idle'); }
    }
  }

  inRange(f, o, range) {
    const dist = Math.abs(o.x - f.x);
    const facingOk = (o.x - f.x) * f.facing > -0.3;
    return dist <= range + 0.5 && facingOk;
  }

  tryHit(f, o, dmg, idx, d) {
    if (o.mode === 'ko' || o.iframes > 0) return;
    if (!this.inRange(f, o, d.range)) return;
    // glacial wall blocks strikes crossing it
    if (o.wall && ((f.x < o.wall.x && o.x > o.wall.x) || (f.x > o.wall.x && o.x < o.wall.x))) return;
    f.hitDone.push(idx); f.hitCount++;
    // guard (wind wall): blocks one frontal strike
    if (o.guardFrames > 0 && !d.unblockable) {
      o.guardFrames = 0;
      o.x = clamp(o.x + f.facing * 1.5, -5.2, 5.2);
      this.events.push({ type: 'text', x: o.x, y: 2.0, txt: 'BLOCK', color: '#9fd8ff' });
      this.events.push({ type: 'sound', name: 'block' });
      this.hitstop = 3;
      return;
    }
    const blocked = o.blocking && !o.airborne && o.mode !== 'attack' && (o.x - f.x) * f.facing > 0;
    if (blocked) {
      let chip = Math.max(1, Math.round(dmg * this.moves.common.blockChip * (o.hero.chipMul || 1)));
      if (d.blockChip) chip = d.blockChip;
      if (o.hp - chip <= 0) chip = Math.max(0, o.hp - 1); // chip cannot KO
      o.hp -= chip; o.mode = 'blockstun'; o.modeFrame = 0; o.stunDur = d.stagger ? 6 : this.moves.common.blockstun;
      f.meter = clamp(f.meter + (d.cooldown ? 3 : 2), 0, 100);
      this.hitstop = this.moves.common.hitstop.block;
      this.events.push({ type: 'text', x: o.x, y: 2.0, txt: 'BLOCK', color: '#cfe8ff' });
      this.events.push({ type: 'spark', x: o.x - f.facing * 0.4, y: 1.3, color: '#bcd8ff', big: false });
      this.events.push({ type: 'sound', name: 'block' });
      return;
    }
    // full hit
    let scale = Math.pow(this.moves.common.comboScale, f.combo);
    scale = Math.max(this.moves.common.comboMin, scale);
    if (f.juggled) scale = Math.min(scale, 0.7);
    let final = Math.max(1, Math.round(dmg * scale));
    // passives
    if (f.hero.slowBonus && o.slowFrames > 0 && f.combo === 0) final += f.hero.slowBonus;
    if (f.hero.rootBonus && o.rootFrames > 0 && f.combo === 0) final += f.hero.rootBonus;
    if (d.bonusVs && (o.slowFrames > 0 || o.rootFrames > 0)) final = d.bonusVs;
    if (o.armorFrames > 0) final = Math.max(1, Math.round(final / 2));
    f.combo++; f.comboTimer = this.moves.common.comboWindow;
    this.applyDamage(o, final, f, d.cooldown ? 'skill' : 'basic');
    // hitstop + shake
    const hs = final >= 20 ? this.moves.common.hitstop.heavy
      : d.cooldown ? this.moves.common.hitstop.skill
      : d === this.moves.common.kick ? this.moves.common.hitstop.kick : this.moves.common.hitstop.punch;
    this.hitstop = hs;
    if (final >= 10) this.shake = 2;
    if (d.cooldown) this.shake = Math.max(this.shake, 3);
    // effects
    if (d.burn) { o.burnDps = d.burn / d.burnTime; o.burnFrames = d.burnTime * 60; o.burnTick = 0; }
    if (d.launch) { o.mode = 'launch'; o.modeFrame = 0; o.juggled = true; o.airborne = true; }
    else if (d.knockdown) { o.mode = 'hit'; o.modeFrame = 0; o.stunDur = 40; }
    else if (d.stagger && o.armorFrames <= 0) { o.mode = 'hit'; o.modeFrame = 0; o.stunDur = d.stagger; }
    else if (d.stun) { o.mode = 'stun'; o.modeFrame = 0; o.stunFrames = d.stun; }
    else if (d.root) { o.rootFrames = d.root; o.mode = 'root'; o.modeFrame = 0; }
    else if (d.trip) { o.mode = 'hit'; o.modeFrame = 0; o.stunDur = d.trip; }
    else if (d.slow) { o.slowFrames = d.slow * 60; }
    else { o.mode = 'hit'; o.modeFrame = 0; o.stunDur = d.hitstun || 18; }
    if (d.pull) o.x = clamp(o.x - f.facing * d.pull, -5.2, 5.2);
    if (d.chain && Math.abs(o.x - f.x) <= d.chainRange) {
      const extra = Math.max(1, Math.round(d.damage * d.chain * scale));
      this.applyDamage(o, extra, f, 'skill');
      this.events.push({ type: 'spark', x: o.x, y: 1.4, color: f.hero.color, big: false });
    }
    if (o.rig) playOnce(o.rig, o.mode === 'launch' ? 'HitRecieve_2' : 'HitRecieve', 1.4);
    this.events.push({ type: 'text', x: o.x, y: 2.2, txt: String(final), color: f.hero.color });
    this.events.push({ type: 'spark', x: o.x - f.facing * 0.4, y: 1.4, color: f.hero.color, big: final >= 20 });
    this.events.push({ type: 'sound', name: d.cooldown ? 'skill' : (d === this.moves.common.kick ? 'kick' : 'punch'), el: f.hero.element });
  }

  applyDamage(target, amount, attacker, kind) {
    if (target.mode === 'ko') return;
    target.hp = Math.max(0, target.hp - amount);
    if (attacker) {
      attacker.damageDealt += amount;
      attacker.meter = clamp(attacker.meter + (kind === 'skill' ? 8 : kind === 'basic' ? 6 : 0), 0, 100);
      target.meter = clamp(target.meter + 4, 0, 100);
    }
    if (target.hp <= 0) { target.hp = 0; target.mode = 'ko'; if (target.rig) playOnce(target.rig, 'Death', 1); }
  }

  separate() {
    const min = 0.9;
    const d = this.b.x - this.a.x;
    if (Math.abs(d) < min && this.a.mode !== 'ko' && this.b.mode !== 'ko') {
      const push = (min - Math.abs(d)) / 2 * (d >= 0 ? 1 : -1);
      this.a.x = clamp(this.a.x - push, -5.2, 5.2);
      this.b.x = clamp(this.b.x + push, -5.2, 5.2);
    }
  }

  stepProjectiles() {
    for (const p of this.projectiles) {
      p.x += p.vx; p.life--;
      const t = p.owner === this.a ? this.b : this.a;
      this.events.push({ type: 'proj', x: p.x, y: 1.2, color: p.owner.hero.color });
      if (t.wall && Math.abs(p.x - t.wall.x) < 0.5) { p.life = 0; this.events.push({ type: 'spark', x: t.wall.x, y: 1.2, color: '#9fd8ff', big: false }); continue; }
      if (Math.abs(p.x - t.x) < 0.5 && t.mode !== 'ko') {
        p.life = 0;
        const blocked = t.blocking && !t.airborne;
        if (blocked) {
          t.hp = Math.max(1, t.hp - (p.def.blockChip || 2));
          this.events.push({ type: 'text', x: t.x, y: 2.0, txt: 'BLOCK', color: '#cfe8ff' });
        } else {
          this.applyDamage(t, p.def.damage, p.owner, 'skill');
          t.mode = 'hit'; t.modeFrame = 0; t.stunDur = 18;
          if (t.rig) playOnce(t.rig, 'HitRecieve', 1.4);
          this.events.push({ type: 'text', x: t.x, y: 2.2, txt: String(p.def.damage), color: p.owner.hero.color });
          this.events.push({ type: 'spark', x: t.x, y: 1.3, color: p.owner.hero.color, big: false });
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0 && Math.abs(p.x) < 7);
  }

  stepWaves() {
    for (const w of this.waves) {
      w.x += w.vx; w.life--;
      const t = w.owner === this.a ? this.b : this.a;
      this.events.push({ type: 'wave', x: w.x, color: w.owner.hero.color });
      if (!t.airborne && Math.abs(w.x - t.x) < 0.6 && t.mode !== 'ko') {
        w.life = 0;
        this.applyDamage(t, w.def.damage, w.owner, 'skill');
        t.mode = 'hit'; t.modeFrame = 0; t.stunDur = w.def.trip || 30;
        if (t.rig) playOnce(t.rig, 'HitRecieve_2', 1.4);
        this.events.push({ type: 'text', x: t.x, y: 2.2, txt: String(w.def.damage), color: w.owner.hero.color });
        this.events.push({ type: 'spark', x: t.x, y: 0.4, color: w.owner.hero.color, big: true });
      }
    }
    this.waves = this.waves.filter((w) => w.life > 0 && Math.abs(w.x) < 7);
    // glacial walls decay
    for (const f of [this.a, this.b]) {
      if (f.wall) { f.wall.frames--; if (f.wall.frames <= 0) { f.wall = null; this.events.push({ type: 'wallgone' }); } }
    }
  }

  endRound(winner) {
    if (!winner) {
      // timeout: more HP wins; equal = draw
      if (this.a.hp === this.b.hp) {
        if (!this.drawReplayed) {
          this.drawReplayed = true; this.replay = true;
          this.events.push({ type: 'text', x: 0, y: 3, txt: 'DRAW — REPLAY', color: '#ffffff' });
          this.round++; this.beginRound(); return;
        }
        winner = this.a; // replay still tied: award to player
      } else winner = this.a.hp > this.b.hp ? this.a : this.b;
    }
    winner.rounds++;
    winner.mode = 'win'; if (winner.rig) playOnce(winner.rig, 'Wave', 1);
    const loser = winner === this.a ? this.b : this.a;
    if (loser.mode !== 'ko') { loser.mode = 'ko'; if (loser.rig) playOnce(loser.rig, 'Death', 1); }
    this.phase = 'roundEnd'; this.phaseFrame = 0;
    this.events.push({ type: 'roundEnd', winner: winner.side, rounds: [this.a.rounds, this.b.rounds] });
    this.events.push({ type: 'sound', name: 'ko' });
    if (winner.rounds >= this.moves.arena.roundsToWin) this.winner = winner;
  }
}
