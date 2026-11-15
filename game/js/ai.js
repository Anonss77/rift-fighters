// ai.js — bot state machine. Decides every 12 frames; reaction delay and
// probabilities scale with difficulty. Never reads buffered inputs; only
// reacts to visible moves (startup >= 20 frames can be reacted to).
const DIFF = {
  easy: { react: 30, block: 0.35, punish: 0.25, skill: 0.3, idleMin: 20 },
  normal: { react: 18, block: 0.65, punish: 0.55, skill: 0.6, idleMin: 8 },
  hard: { react: 8, block: 0.85, punish: 0.8, skill: 0.85, idleMin: 0 },
};

export class Bot {
  constructor(difficulty) {
    this.cfg = DIFF[difficulty] || DIFF.normal;
    this.decideIn = 0; this.idleFor = 0; this.plan = 'approach';
    this.seenMoveAt = -999; this.comboIn = 0;
  }
  // called once per sim frame; m = match, me = bot fighter, foe = player
  update(m, me, foe, frame) {
    if (m.phase !== 'fight' || me.mode === 'ko' || me.mode === 'win') return;
    // remember when the foe started a visible move
    if (foe.mode === 'attack' && foe.modeFrame === 1) this.seenMoveAt = frame;
    // walk input is applied continuously by main via this.walk
    this.walk = 0;
    if (!me.canAct) return;
    this.decideIn--;
    if (this.decideIn > 0) return;
    this.decideIn = 12;
    const cfg = this.cfg;
    const dist = Math.abs(foe.x - me.x);
    const foeAttacking = foe.mode === 'attack';
    const foeStartup = foeAttacking ? foe.move.startup + foe.move.active : 0;
    const foeRecovering = foe.mode === 'attack' && foe.modeFrame > foeStartup;
    const reactReady = frame - this.seenMoveAt >= cfg.react;
    // defend: block a visible attack we can react to
    if (foeAttacking && reactReady && foe.move.startup >= 8 && Math.random() < cfg.block) {
      m.setBlock(me, true);
      this.idleFor = 0;
      return;
    }
    m.setBlock(me, false);
    // punish a whiffed / recovering foe
    if (foeRecovering && dist < 2.6 && Math.random() < cfg.punish) {
      this.attack(m, me, foe, dist);
      return;
    }
    // spacing: walk toward foe until in range, back off if too close and foe is dangerous
    if (dist > 2.4) { this.walk = foe.x > me.x ? 1 : -1; this.plan = 'approach'; return; }
    if (dist < 1.1 && foeAttacking) { this.walk = foe.x > me.x ? -1 : 1; return; }
    // in range: attack
    if (this.idleFor > 0) { this.idleFor--; return; }
    if (Math.random() < 0.55) {
      this.attack(m, me, foe, dist);
      this.idleFor = cfg.idleMin + Math.floor(Math.random() * 24);
    }
  }
  attack(m, me, foe, dist) {
    const cfg = this.cfg;
    const r = Math.random();
    // skills when ready and in range
    if (r < cfg.skill * 0.45) {
      const ready = [0, 1, 2].filter((i) => !(me.cooldowns['skill' + (i + 1)] > 0));
      if (ready.length) {
        const i = ready[Math.floor(Math.random() * ready.length)];
        const def = me.hero.skills[i];
        if (dist <= def.range + 0.5 || def.projectile || def.shockwave) {
          m.queue(me, 'skill' + (i + 1));
          return;
        }
      }
    }
    // ultimate when full
    if (me.meter >= 100 && dist < 3 && Math.random() < 0.7) { m.queue(me, 'ult'); return; }
    // basics: kick at range, punch up close; sometimes chain punch->kick
    if (dist > 2.0) m.queue(me, 'kick');
    else m.queue(me, 'punch');
    if (this.comboIn > 0) { this.comboIn--; m.queue(me, 'kick'); }
    else if (Math.random() < 0.3) this.comboIn = 1;
  }
}
