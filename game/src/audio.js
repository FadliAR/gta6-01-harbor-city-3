// NEON HARBOR — all sound is synthesized with WebAudio. No audio files.
// Three radio stations play original looping patterns (bass + lead + hats);
// the engine hum follows the player's speed, and one-shots cover pickups,
// sirens, crashes, gunshots and mission jingles.

import { RADIO_STATIONS } from './config.js';

// Minor / major pentatonic-ish note ladders (frequencies in Hz).
const SCALES = {
  minor: [110, 130.81, 146.83, 164.81, 196, 220, 261.63, 293.66],
  major: [110, 123.47, 138.59, 164.81, 185, 207.65, 246.94, 277.18],
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.radioOn = true;
    this.stationIndex = 0;
    this.radioGain = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenNodes = null;
    this._step = 0;
    this._nextNoteTime = 0;
    this._timer = null;
  }

  // Must be called from a user gesture (click / key) at least once.
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.radioGain = this.ctx.createGain();
    this.radioGain.gain.value = 0.16;
    this.radioGain.connect(this.master);
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 40;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this._nextNoteTime = this.ctx.currentTime + 0.1;
    this._timer = window.setInterval(() => this._scheduleRadio(), 40);
  }

  get station() {
    return RADIO_STATIONS[this.stationIndex];
  }

  toggleRadio() {
    this.radioOn = !this.radioOn;
    if (this.radioGain) this.radioGain.gain.value = this.radioOn ? 0.16 : 0;
    return this.radioOn;
  }

  nextStation() {
    this.stationIndex = (this.stationIndex + 1) % RADIO_STATIONS.length;
    this._step = 0;
    return this.station;
  }

  setEngine(speedNorm, driving) {
    if (!this.ctx) return;
    const target = driving ? 0.05 + speedNorm * 0.06 : 0.012;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(38 + speedNorm * 120, this.ctx.currentTime, 0.1);
  }

  _scheduleRadio() {
    if (!this.ctx || !this.radioOn) return;
    const station = this.station;
    const scale = SCALES[station.minor ? 'minor' : 'major'];
    const stepDur = 60 / station.bpm / 2; // eighth notes
    while (this._nextNoteTime < this.ctx.currentTime + 0.18) {
      const t = this._nextNoteTime;
      const step = this._step;
      // Bass on beats 0 and 4 of each 8-step bar.
      if (step % 8 === 0 || step % 8 === 4) {
        this._note(scale[step % 4 === 0 ? 0 : 3] / 2, t, stepDur * 1.8, 'triangle', 0.5);
      }
      // Lead pluck on a sparse pattern.
      if ([1, 3, 6].includes(step % 8)) {
        const idx = (step * 3 + 2) % scale.length;
        this._note(scale[idx] * 2, t, stepDur * 0.9, station.wave, 0.16);
      }
      // Hat tick every off-beat.
      if (step % 2 === 1) this._hat(t);
      this._step += 1;
      this._nextNoteTime += stepDur;
    }
  }

  _note(freq, time, dur, type, vol) {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(vol, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
    osc.connect(gain);
    gain.connect(this.radioGain);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  _hat(time) {
    const buffer = this.ctx.createBuffer(1, 2205, 44100);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.radioGain);
    src.start(time);
  }

  _blip(freq, dur, type, vol, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  pickup() {
    this._blip(880, 0.12, 'sine', 0.25, 1320);
    window.setTimeout(() => this._blip(1320, 0.15, 'sine', 0.2, 1760), 90);
  }

  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => {
      window.setTimeout(() => this._blip(f, 0.22, 'triangle', 0.25), i * 110);
    });
  }

  crash() {
    this._blip(120, 0.25, 'sawtooth', 0.3, 40);
  }

  shot() {
    this._blip(1400, 0.08, 'square', 0.2, 200);
  }

  busted() {
    [392, 311, 233].forEach((f, i) => {
      window.setTimeout(() => this._blip(f, 0.3, 'sawtooth', 0.22), i * 180);
    });
  }

  // Two-tone police siren while any wanted level is active.
  setSiren(active) {
    if (!this.ctx) return;
    if (active && !this.sirenNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 700;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.045;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.7;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      lfo.start();
      this.sirenNodes = { osc, lfo, gain };
    } else if (!active && this.sirenNodes) {
      const { osc, lfo, gain } = this.sirenNodes;
      gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      window.setTimeout(() => {
        try { osc.stop(); lfo.stop(); } catch (e) { /* already stopped */ }
      }, 400);
      this.sirenNodes = null;
    }
  }
}
