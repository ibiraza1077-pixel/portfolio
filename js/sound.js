// All sound is synthesised: CRT hum and whine, mechanical key clicks, a POST beep,
// the dive whoosh and a shimmer when the particles re-form. No audio files.

export class Sound {
  constructor() { this.on = false; this.ctx = null; }

  start() {
    if (!this.ctx) this.build();
    this.ctx.resume();
    this.on = true;
    this.master.gain.setTargetAtTime(0.8, this.ctx.currentTime, 0.4);
  }

  stop() {
    if (!this.ctx) return;
    this.on = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }

  toggle() { this.on ? this.stop() : this.start(); return this.on; }

  build() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // Room reverb
    const verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    verb.connect(wet).connect(this.master);
    this.bus = ctx.createGain();
    this.bus.connect(this.master);
    this.bus.connect(verb);

    // CRT: 60 Hz mains hum with harmonics, and the faint flyback whine.
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    this.hum.connect(this.master);
    [[60, 0.05], [120, 0.03], [180, 0.012]].forEach(([f, g]) => {
      const o = ctx.createOscillator();
      const gn = ctx.createGain();
      o.frequency.value = f;
      gn.gain.value = g;
      o.connect(gn).connect(this.hum);
      o.start();
    });
    const whine = ctx.createOscillator();
    const wg = ctx.createGain();
    whine.frequency.value = 15734;
    wg.gain.value = 0.004;
    whine.connect(wg).connect(this.hum);
    whine.start();

    // Wind for the dive and the inside world
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 300;
    this.windFilter.Q.value = 0.8;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    src.connect(this.windFilter).connect(this.wind).connect(this.bus);
    src.start();

    // Inside drone
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    this.drone.connect(lp).connect(this.bus);
    [55, 82.41, 110, 164.81].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 6;
      const g = ctx.createGain();
      g.gain.value = 0.05 / (i + 1);
      o.connect(g).connect(this.drone);
      o.start();
    });
  }

  setPower(p) {
    if (!this.on) return;
    this.hum.gain.setTargetAtTime(p * 0.9, this.ctx.currentTime, 0.3);
  }

  // dive 0..1 sweeps the wind up; inside crossfades hum to drone.
  setDive(d, inside) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const surge = Math.sin(Math.min(d, 1) * Math.PI);
    this.wind.gain.setTargetAtTime(surge * 0.5 + (inside ? 0.05 : 0), t, 0.1);
    this.windFilter.frequency.setTargetAtTime(250 + d * 1800, t, 0.1);
    this.hum.gain.setTargetAtTime(inside ? 0 : (1 - d) * 0.9, t, 0.2);
    this.drone.gain.setTargetAtTime(inside ? 0.6 : d * 0.25, t, 0.4);
  }

  key(kind = 'char') {
    if (!this.on) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = kind === 'enter' || kind === 'space' ? 1400 : 2600 + Math.random() * 900;
    f.Q.value = 3;
    const g = ctx.createGain();
    const vol = kind === 'enter' ? 0.5 : 0.32;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 1.5, 0.06);
    // the thock of the key bottoming out
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.frequency.setValueAtTime(kind === 'enter' ? 140 : 220, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.05);
    og.gain.setValueAtTime(0.12, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(og).connect(this.bus);
    o.start(t);
    o.stop(t + 0.07);
  }

  beep(freq = 880, dur = 0.12) {
    if (!this.on) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.06, t);
    g.gain.setValueAtTime(0.06, t + dur - 0.01);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  shimmer() {
    if (!this.on) return;
    const { ctx } = this;
    const t = ctx.currentTime;
    [659.25, 987.77, 1318.5, 1975.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.06);
      g.gain.linearRampToValueAtTime(0.05, t + i * 0.06 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.06 + 1.6);
      o.connect(g).connect(this.bus);
      o.start(t + i * 0.06);
      o.stop(t + i * 0.06 + 1.7);
    });
  }
}
