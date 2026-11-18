// Round 2: harbour-job payouts reuse the cash blip and hot-cargo pickups reuse the wanted sting.
// Procedural WebAudio: no audio assets, everything is synthesized on the fly.
// The engine hum is a pair of detuned oscillators; every other sound is a
// short tone or a burst of filtered noise, so the game ships zero audio files.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenTimer = 0;
    this.sirenOn = false;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      // Engine: two detuned saws through a lowpass, gain follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const sub = this.ctx.createOscillator();
      sub.type = 'square'; sub.frequency.value = 28;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 420;
      this.engineOsc.connect(filt); sub.connect(filt);
      filt.connect(this.engineGain); this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start(); sub.start();
      this._engineSub = sub;
    } catch { this.ctx = null; }
  }

  setEngine(speedNorm, driving) {
    if (!this.ctx || !this.engineGain) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : (driving ? 0.05 + speedNorm * 0.06 : 0), t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 130, t, 0.1);
    this._engineSub.frequency.setTargetAtTime(28 + speedNorm * 60, t, 0.1);
  }

  _tone(freq, dur, type = 'sine', vol = 0.12, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  _noise(dur, vol = 0.2, freq = 1200) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t);
  }

  blip() { this._tone(880, 0.09, 'sine', 0.1); this._tone(1320, 0.12, 'sine', 0.08, 0.07); }
  cash() { this._tone(1046, 0.08, 'triangle', 0.12); this._tone(1568, 0.14, 'triangle', 0.1, 0.06); }
  horn() { this._tone(370, 0.25, 'square', 0.06); this._tone(466, 0.25, 'square', 0.06); }
  gunshot() { this._noise(0.16, 0.3, 900); }
  punch() { this._noise(0.08, 0.2, 300); }
  thud() { this._noise(0.2, 0.25, 180); }
  missionOk() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.16, 'triangle', 0.12, i * 0.09)); }
  missionFail() { [392, 330, 262].forEach((f, i) => this._tone(f, 0.2, 'triangle', 0.1, i * 0.12)); }
  busted() { [220, 185, 147].forEach((f, i) => this._tone(f, 0.3, 'sawtooth', 0.08, i * 0.15)); }

  // Two-tone police siren while any police car is near.
  siren(dt, active) {
    if (!this.ctx || this.muted) return;
    this.sirenTimer += dt;
    if (!active) { this.sirenOn = false; return; }
    const phase = Math.floor(this.sirenTimer / 0.45) % 2;
    const freq = phase === 0 ? 700 : 950;
    if (!this.sirenOn || this._sirenFreq !== freq) {
      this._sirenFreq = freq;
      this._tone(freq, 0.42, 'sine', 0.045);
    }
    this.sirenOn = true;
  }
}
