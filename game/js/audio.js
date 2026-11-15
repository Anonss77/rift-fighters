// audio.js — procedural Web Audio. No audio files. One graph after the
// user's first interaction; master 70%; max 12 simultaneous voices.
const EL_TIMBRE = {
  fire: 'fire', wind: 'wind', earth: 'earth',
  lightning: 'lightning', ice: 'ice', nature: 'nature',
};

export class AudioSys {
  constructor() {
    this.ctx = null; this.master = null; this.on = true; this.voices = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
  }
  toggle() { this.on = !this.on; if (this.master) this.master.gain.value = this.on ? 0.7 : 0; return this.on; }
  _env(g, t0, a, peak, dec) {
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + a + dec);
  }
  _noiseBuf(dur) {
    const b = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  _tone(freq, type, dur, peak, when = 0) {
    if (!this.ctx || !this.on || this.voices >= 12) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    this._env(g, t0, 0.008, peak, dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.1);
    this.voices++;
    o.onended = () => { this.voices--; };
  }
  _noise(dur, filterFreq, type, peak, when = 0) {
    if (!this.ctx || !this.on || this.voices >= 12) return;
    const t0 = this.ctx.currentTime + when;
    const s = this.ctx.createBufferSource();
    s.buffer = this._noiseBuf(dur + 0.05);
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    this._env(g, t0, 0.005, peak, dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.1);
    this.voices++;
    s.onended = () => { this.voices--; };
  }
  play(name, el) {
    if (!this.ctx || !this.on) return;
    switch (name) {
      case 'punch':
        this._noise(0.08, 900, 'lowpass', 0.5); this._tone(90, 'sine', 0.12, 0.6);
        break;
      case 'kick':
        this._tone(65, 'sine', 0.16, 0.7); this._noise(0.09, 700, 'lowpass', 0.45);
        break;
      case 'block':
        this._tone(700, 'triangle', 0.12, 0.25); this._tone(1100, 'triangle', 0.1, 0.18);
        this._tone(1600, 'triangle', 0.08, 0.12); this._noise(0.03, 3000, 'highpass', 0.2);
        break;
      case 'dash': this._noise(0.12, 1800, 'bandpass', 0.25); break;
      case 'jump': this._tone(320, 'sine', 0.12, 0.15); break;
      case 'skill': this.skill(el); break;
      case 'ult':
        this._noise(0.25, 500, 'lowpass', 0.5); this._tone(50, 'sine', 0.4, 0.8);
        this.skill(el, 0.1);
        break;
      case 'ko':
        this._tone(220, 'sine', 0.5, 0.7); this._tone(110, 'sine', 0.5, 0.6, 0.05);
        break;
      case 'win': [523, 659, 784].forEach((f, i) => this._tone(f, 'sine', 0.18, 0.3, i * 0.12)); break;
      case 'lose': [392, 311].forEach((f, i) => this._tone(f, 'sine', 0.25, 0.3, i * 0.18)); break;
      case 'ui': this._tone(900, 'sine', 0.06, 0.2); break;
      case 'confirm': this._tone(660, 'sine', 0.08, 0.25); this._tone(880, 'sine', 0.1, 0.25, 0.08); break;
      case 'cancel': this._tone(440, 'sine', 0.1, 0.2); break;
    }
  }
  skill(el, delay = 0) {
    switch (EL_TIMBRE[el] || 'fire') {
      case 'fire': this._noise(0.2, 1200, 'lowpass', 0.4, delay); this._tone(300, 'sine', 0.25, 0.3, delay); break;
      case 'wind': this._noise(0.25, 2400, 'bandpass', 0.35, delay); break;
      case 'earth': this._tone(70, 'sine', 0.3, 0.7, delay); this._noise(0.15, 300, 'lowpass', 0.4, delay); break;
      case 'lightning': this._tone(2400, 'square', 0.05, 0.2, delay); this._tone(1800, 'square', 0.05, 0.2, delay + 0.07); break;
      case 'ice': this._tone(1800, 'sine', 0.2, 0.25, delay); this._tone(2600, 'sine', 0.15, 0.18, delay + 0.05); break;
      case 'nature': this._tone(520, 'sine', 0.15, 0.35, delay); this._tone(180, 'triangle', 0.1, 0.3, delay); break;
    }
  }
}
