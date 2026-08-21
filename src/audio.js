// Fully synthesized audio - no files. Everything is WebAudio nodes.
import { clamp, safeStore } from './util.js';

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = safeStore.get('tv_muted') === '1';
    this.ready = false;
  }

  /** Must be called from a user gesture before anything will sound. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const master = this.ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.9;
    master.connect(this.ctx.destination);
    this.master = master;

    // Shared noise buffer for all the thruster voices.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.main = this._thruster(320, 0.55);
    this.rcs = this._thruster(1500, 0.16);
    this.ready = true;
  }

  _thruster(baseCutoff, gain) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = baseCutoff;
    filt.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    src.connect(filt).connect(g).connect(this.master);
    src.start();
    return { src, filt, g, gain, baseCutoff };
  }

  setMuted(m) {
    this.muted = m;
    safeStore.set('tv_muted', m ? '1' : '0');
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  /**
   * Continuous engine levels, called every frame.
   *
   * Only re-schedules when something actually changes. It used to write two
   * automation events per voice on every single frame - 240 a second, forever,
   * including while the engines were already silent - which re-anchors the
   * envelope faster than it can settle and is a well-known source of zipper
   * artefacts. Tom heard a clicking while holding a key, which is exactly the
   * steady state where this was doing the most pointless work.
   */
  engines(mainOn, rcsOn) {
    if (!this.ready) return;
    if (this._mainOn === mainOn && this._rcsOn === rcsOn) return;
    this._mainOn = mainOn;
    this._rcsOn = rcsOn;
    const t = this.ctx.currentTime;
    const set = (v, on) => {
      v.g.gain.setTargetAtTime(on ? v.gain : 0, t, on ? 0.02 : 0.08);
      v.filt.frequency.setTargetAtTime(v.baseCutoff * (on ? 1.6 : 1), t, 0.05);
    };
    set(this.main, mainOn);
    set(this.rcs, rcsOn);
  }

  /**
   * Stop the *flight* voices. Deliberately not the space bed: the frame loop
   * calls this every frame the game is not in play, so a bed switched off here
   * would be switched off on the very screen it exists for. The bed has exactly
   * one owner, `setState`, and this is the fault of giving it two.
   */
  silence() {
    if (!this.ready) return;
    this._mainOn = null;
    this._rcsOn = null;
    if (this.laserVoice) this.laserVoice.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
    this.engines(false, false);
  }

  _env(node, peak, attack, decay) {
    const t = this.ctx.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  blip(freq = 880, dur = 0.08, type = 'square', vol = 0.12) {
    if (!this.ready) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g).connect(this.master);
    this._env(g, vol, 0.005, dur);
    o.start();
    o.stop(this.ctx.currentTime + dur + 0.05);
  }

  arpeggio(notes, step = 0.09, type = 'triangle', vol = 0.16) {
    if (!this.ready) return;
    notes.forEach((f, i) => setTimeout(() => this.blip(f, 0.28, type, vol), i * step * 1000));
  }

  explosion() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(1800, t);
    filt.frequency.exponentialRampToValueAtTime(90, t + 1.1);
    const g = this.ctx.createGain();
    src.connect(filt).connect(g).connect(this.master);
    this._env(g, 0.75, 0.01, 1.2);
    src.start();
    src.stop(t + 1.4);

    const o = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    o.connect(og).connect(this.master);
    this._env(og, 0.45, 0.01, 0.8);
    o.start();
    o.stop(t + 1.0);
  }

  touchdown(quality) {
    if (!this.ready) return;
    const thump = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    thump.type = 'sine';
    const t = this.ctx.currentTime;
    thump.frequency.setValueAtTime(180, t);
    thump.frequency.exponentialRampToValueAtTime(50, t + 0.25);
    thump.connect(g).connect(this.master);
    this._env(g, 0.4, 0.005, 0.3);
    thump.start();
    thump.stop(t + 0.4);
    if (quality === 'PERFECT') this.arpeggio([523.25, 659.25, 783.99, 1046.5], 0.085);
    else if (quality === 'GOOD') this.arpeggio([523.25, 659.25, 783.99], 0.09);
    else this.arpeggio([392, 493.88], 0.1, 'square', 0.12);
  }

  alarm() {
    this.blip(220, 0.12, 'sawtooth', 0.1);
  }

  /**
   * Warning layers, with right of way. Mars can have low fuel, a dust front, a
   * heat build and a turret charging inside the same second, and four alarms at
   * once is the same as none: a warning has to be identifiable to be useful.
   * A more urgent warning always interrupts; an equal or lesser one waits.
   */
  warn(kind) {
    const spec = WARNINGS[kind];
    if (!spec || !this.ready) return false;
    const now = this.ctx.currentTime;
    const last = this._lastWarn;
    if (last && now - last.t < spec.hold && WARNINGS[last.kind].rank >= spec.rank) return false;
    this._lastWarn = { kind, t: now };
    spec.play(this);
    return true;
  }

  /** First contact: the legs touching down, before anything is graded. */
  gearContact(force = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(64, t + 0.16);
    o.connect(g).connect(this.master);
    this._env(g, 0.14 + 0.2 * clamp(force, 0, 1), 0.004, 0.2);
    o.start();
    o.stop(t + 0.3);
  }

  /**
   * Combat voices. Each attack has a sound before it has an effect - the charge
   * rises, the shot cracks, and only then can anything hit you.
   */
  charge(seconds = 1.2) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(620, t + seconds);
    o.connect(g).connect(this.master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + seconds * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.05);
    o.start();
    o.stop(t + seconds + 0.1);
  }

  enemyShot() {
    this.blip(140, 0.1, 'square', 0.09);
  }

  /** Being hit: a dull knock plus a warning, so it registers without masking the HUD. */
  hullHit() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 320;
    const g = this.ctx.createGain();
    src.connect(filt).connect(g).connect(this.master);
    this._env(g, 0.4, 0.005, 0.22);
    src.start();
    src.stop(t + 0.3);
    this.blip(98, 0.16, 'sawtooth', 0.09);
  }

  shieldHit() {
    this.blip(1320, 0.07, 'sine', 0.09);
  }

  laser(on) {
    if (!this.ready) return;
    if (!this.laserVoice) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.value = 720;
      g.gain.value = 0;
      o.connect(g).connect(this.master);
      o.start();
      this.laserVoice = { o, g };
    }
    const t = this.ctx.currentTime;
    this.laserVoice.g.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.03);
  }

  enemyDown() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(2200, t);
    filt.frequency.exponentialRampToValueAtTime(160, t + 0.45);
    const g = this.ctx.createGain();
    src.connect(filt).connect(g).connect(this.master);
    this._env(g, 0.4, 0.01, 0.5);
    src.start();
    src.stop(t + 0.6);
    this.arpeggio([660, 440], 0.06, 'triangle', 0.1);
  }

  pickup() {
    this.arpeggio([880, 1174.66], 0.06, 'triangle', 0.13);
  }

  ui(up = true) {
    this.blip(up ? 660 : 440, 0.05, 'square', 0.07);
  }

  /**
   * **The space bed: the title screen's ambience.**
   *
   * Everything in this file is synthesized - there are no audio files in this
   * project and there is not going to be one for this - so it is built out of
   * the same nodes as the engines, just slower and much quieter.
   *
   * Four layers, and each is doing a specific job:
   *
   *  - **the drone** is the body: two sines a few cents apart at 55 Hz and a
   *    triangle a fifth above. The detune is the point - they beat against each
   *    other about every seven seconds, so the bed never sits still without
   *    anything having to move it.
   *  - **the wind** is filtered noise with its band drifting on a 90-second
   *    cycle. It reads as distance rather than as weather, because the band is
   *    narrow and centred low.
   *  - **the shimmer** is two quiet high partials that swell against each other
   *    on a slower cycle again, so the top of the mix breathes instead of
   *    sitting as a fixed hiss.
   *  - **the beacon** is one sparse ping, 9 to 22 seconds apart. It is what
   *    stops the bed being wallpaper: something out there is still transmitting.
   *
   * **All the movement is LFO nodes, not per-frame JavaScript.** M16 found
   * `engines` writing 240 automation events a second forever, and a bed that
   * plays for as long as somebody leaves the title screen up is exactly where
   * that fault would be worst. The graph is built once, the oscillators run
   * themselves, and the only JavaScript that ever runs afterwards is one
   * `setTimeout` per beacon ping - which stops being rescheduled the moment the
   * bed is switched off.
   *
   * It is deliberately very quiet (peak 0.085 against the engines' 0.55). A
   * title bed that competes with the UI blips is a title bed people turn off.
   */
  spaceBed(on) {
    if (!this.ready) return;
    // The `engines` guard: do nothing at all unless the state actually changed.
    if (this._bedOn === on) return;
    this._bedOn = on;
    const t = this.ctx.currentTime;

    if (!this.bed) {
      if (!on) return;                     // never build it just to switch it off
      const out = this.ctx.createGain();
      out.gain.value = 0;
      out.connect(this.master);

      // A slow LFO helper: an oscillator driving a param through a gain.
      const lfo = (rate, depth, target, base) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = rate;
        g.gain.value = depth;
        o.connect(g).connect(target);
        target.value = base;
        o.start();
        return o;
      };

      // --- the drone
      const droneGain = this.ctx.createGain();
      droneGain.gain.value = 0.055;
      const droneFilt = this.ctx.createBiquadFilter();
      droneFilt.type = 'lowpass';
      droneFilt.frequency.value = 240;
      droneFilt.Q.value = 0.7;
      droneFilt.connect(droneGain).connect(out);
      for (const [type, freq] of [['sine', 55], ['sine', 55.19], ['triangle', 82.4]]) {
        const o = this.ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.value = freq > 60 ? 0.35 : 1;
        o.connect(g).connect(droneFilt);
        o.start();
      }
      // The drone breathes, very slightly, on a 25-second cycle.
      lfo(0.04, 0.018, droneGain.gain, 0.055);

      // --- the wind
      const wind = this.ctx.createBufferSource();
      wind.buffer = this.noiseBuf;
      wind.loop = true;
      const windFilt = this.ctx.createBiquadFilter();
      windFilt.type = 'bandpass';
      windFilt.Q.value = 1.6;
      const windGain = this.ctx.createGain();
      windGain.gain.value = 0.02;
      wind.connect(windFilt).connect(windGain).connect(out);
      lfo(0.011, 130, windFilt.frequency, 260);    // ~90 s sweep
      lfo(0.017, 0.011, windGain.gain, 0.02);
      wind.start();

      // --- the shimmer
      const shimmer = this.ctx.createGain();
      shimmer.gain.value = 0.006;
      shimmer.connect(out);
      for (const [freq, rate] of [[1320, 0.023], [1976, 0.031]]) {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.value = 0.5;
        o.connect(g).connect(shimmer);
        lfo(rate, 0.5, g.gain, 0.5);
        o.start();
      }

      this.bed = { out };
    }

    this.bed.out.gain.cancelScheduledValues(t);
    // Long fades either way: a bed that snaps on is a bed you notice, and the
    // whole job is not being noticed.
    this.bed.out.gain.setTargetAtTime(on ? 1 : 0, t, on ? 1.6 : 0.5);

    if (on) this._scheduleBeacon();
    else if (this._beaconTimer) { clearTimeout(this._beaconTimer); this._beaconTimer = null; }
  }

  /**
   * One distant ping, then book the next one. The chain reschedules only while
   * the bed is on, so switching the bed off ends it rather than leaving a timer
   * running for the rest of the session.
   */
  _scheduleBeacon() {
    if (this._beaconTimer) clearTimeout(this._beaconTimer);
    const wait = 9000 + Math.random() * 13000;
    this._beaconTimer = setTimeout(() => {
      this._beaconTimer = null;
      if (!this._bedOn || !this.ready) return;
      this._beacon();
      this._scheduleBeacon();
    }, wait);
  }

  _beacon() {
    if (!this.ready || this.muted) return;
    const t = this.ctx.currentTime;
    // Two partials a fifth apart with a long tail, through a lowpass that
    // closes as it decays - a signal arriving from a long way off.
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(2600, t);
    filt.frequency.exponentialRampToValueAtTime(420, t + 2.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
    filt.connect(g).connect(this.master);
    for (const [freq, level] of [[523.25, 1], [783.99, 0.45]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const og = this.ctx.createGain();
      og.gain.value = level;
      o.connect(og).connect(filt);
      o.start(t);
      o.stop(t + 3.2);
    }
  }

  /** Wind bed for atmosphere levels. */
  setWind(strength) {
    if (!this.ready) return;
    if (!this.windVoice) {
      this.windVoice = this._thruster(240, 0.25);
      this.windVoice.filt.Q.value = 3;
    }
    const on = strength > 0.05;
    const t = this.ctx.currentTime;
    this.windVoice.g.gain.setTargetAtTime(on ? clamp(strength, 0, 1) * 0.22 : 0, t, 0.4);
  }
}

/**
 * The warning table. `rank` is right of way, `hold` is how long that claim
 * lasts in seconds.
 */
const WARNINGS = {
  'fuel-low':      { rank: 1, hold: 2.0, play: (a) => a.blip(330, 0.12, 'sawtooth', 0.09) },
  heat:            { rank: 2, hold: 3.0, play: (a) => a.arpeggio([520, 470], 0.09, 'sawtooth', 0.08) },
  cold:            { rank: 2, hold: 3.0, play: (a) => a.arpeggio([300, 260], 0.09, 'triangle', 0.09) },
  radiation:       { rank: 2, hold: 3.0, play: (a) => a.arpeggio([740, 740, 740], 0.07, 'square', 0.06) },
  // M29's two new status channels. Same rank as the other three status voices,
  // so the right-of-way rule (M13) still keeps a charging turret and a low tank
  // from shouting over each other - a new hazard joins the queue, it does not
  // jump it. Corrosion is a falling sour pair, magnetic a rising hum.
  corrosion:       { rank: 2, hold: 3.0, play: (a) => a.arpeggio([410, 345], 0.11, 'sawtooth', 0.08) },
  charge:          { rank: 2, hold: 3.0, play: (a) => a.arpeggio([180, 240, 300], 0.08, 'sine', 0.10) },
  lock:            { rank: 3, hold: 0.4, play: (a) => a.charge(1.1) },
  'fuel-critical': { rank: 4, hold: 1.5, play: (a) => a.blip(220, 0.16, 'sawtooth', 0.11) },
  hull:            { rank: 5, hold: 0.5, play: (a) => a.hullHit() },
  dry:             { rank: 6, hold: 3.0, play: (a) => a.arpeggio([220, 165], 0.1, 'sawtooth', 0.12) },
};
