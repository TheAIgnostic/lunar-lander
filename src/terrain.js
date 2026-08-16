// Procedural terrain: midpoint displacement heightmap with flat pads carved in,
// plus an optional lethal ceiling for cave levels.

import { clamp, makeRng } from './util.js';

export class Terrain {
  constructor(cfg, seed) {
    const rng = makeRng(seed);
    this.rng = rng;
    this.width = cfg.width;
    this.height = cfg.height;
    // Midpoint displacement needs a 2^k + 1 grid, so derive the sample spacing
    // from the level width rather than fixing it.
    const cells = 1 << Math.ceil(Math.log2(Math.max(8, this.width / 12)));
    this.step = this.width / cells;
    const n = cells + 1;
    this.n = n;
    this.h = new Float32Array(n);

    const groundBase = this.height - cfg.groundBase;
    this._midpoint(groundBase, cfg.rough, rng);

    // Keep everything inside sane vertical bounds.
    for (let i = 0; i < n; i++) {
      this.h[i] = clamp(this.h[i], this.height * 0.32, this.height - 40);
    }

    this.pads = this._carvePads(cfg, rng);

    this.ceiling = null;
    if (cfg.cave) this._makeCeiling(cfg, rng);

    this.fuelCells = this._placeFuel(cfg, rng);
  }

  _midpoint(base, rough, rng) {
    const { n, h } = this;
    h[0] = base + rng.range(-40, 40);
    h[n - 1] = base + rng.range(-40, 40);
    let span = n - 1;
    let amp = rough;
    while (span > 1) {
      const half = span >> 1;
      for (let i = half; i < n; i += span) {
        h[i] = (h[i - half] + h[i + half]) / 2 + rng.range(-amp, amp);
      }
      span = half;
      amp *= 0.53;
    }
    // One smoothing pass to kill single-sample spikes.
    for (let i = 1; i < n - 1; i++) h[i] = (h[i - 1] + h[i] * 2 + h[i + 1]) / 4;
  }

  _carvePads(cfg, rng) {
    const pads = [];
    const specs = cfg.pads;
    const margin = 180;
    const usable = this.width - margin * 2;
    const slot = usable / specs.length;

    specs.forEach((spec, i) => {
      const w = spec.width;
      const lo = margin + slot * i + 20;
      const hi = margin + slot * (i + 1) - w - 20;
      const x1 = hi > lo ? rng.range(lo, hi) : lo;
      const x2 = x1 + w;
      const i1 = clamp(Math.floor(x1 / this.step), 0, this.n - 1);
      const i2 = clamp(Math.ceil(x2 / this.step), 0, this.n - 1);

      // Level the pad at the average height of the ground it replaces.
      let sum = 0;
      for (let k = i1; k <= i2; k++) sum += this.h[k];
      const y = Math.round(sum / (i2 - i1 + 1));
      for (let k = i1; k <= i2; k++) this.h[k] = y;
      // Blend the shoulders so pads do not sit on cliffs.
      for (let k = 1; k <= 4; k++) {
        const t = k / 5;
        if (i1 - k >= 0) this.h[i1 - k] = this.h[i1 - k] * t + y * (1 - t);
        if (i2 + k < this.n) this.h[i2 + k] = this.h[i2 + k] * t + y * (1 - t);
      }
      pads.push({ x1: i1 * this.step, x2: i2 * this.step, y, mult: spec.mult, used: false, i1, i2 });
    });
    return pads;
  }

  _makeCeiling(cfg, rng) {
    const n = this.n;
    const c = new Float32Array(n);
    const base = this.height * 0.16;
    c[0] = base;
    c[n - 1] = base;
    let span = n - 1;
    let amp = cfg.rough * 0.8;
    while (span > 1) {
      const half = span >> 1;
      for (let i = half; i < n; i += span) {
        c[i] = (c[i - half] + c[i + half]) / 2 + rng.range(-amp, amp);
      }
      span = half;
      amp *= 0.55;
    }
    for (let i = 1; i < n - 1; i++) c[i] = (c[i - 1] + c[i] * 2 + c[i + 1]) / 4;

    // Guarantee a corridor: never squeeze tighter than `clearance` above ground,
    // and stay clear above every pad so a landing is always possible.
    const clearance = cfg.clearance || 260;
    for (let i = 0; i < n; i++) {
      c[i] = clamp(c[i], 40, this.h[i] - clearance);
    }
    for (const p of this.pads) {
      for (let i = Math.max(0, p.i1 - 8); i <= Math.min(n - 1, p.i2 + 8); i++) {
        c[i] = Math.min(c[i], p.y - clearance - 60);
      }
    }
    this.ceiling = c;
  }

  _placeFuel(cfg, rng) {
    const cells = [];
    for (let i = 0; i < (cfg.fuelCells || 0); i++) {
      for (let tries = 0; tries < 40; tries++) {
        const x = rng.range(200, this.width - 200);
        const ground = this.heightAt(x);
        const ceil = this.ceiling ? this.ceilingAt(x) : this.height * 0.12;
        const lo = ceil + 70;
        const hi = ground - 90;
        if (hi - lo < 60) continue;
        const y = rng.range(lo, hi);
        if (cells.some((c) => Math.hypot(c.x - x, c.y - y) < 260)) continue;
        cells.push({ x, y, taken: false, phase: rng.range(0, 6.28) });
        break;
      }
    }
    return cells;
  }

  /** Linearly interpolated ground height at world x. */
  heightAt(x) {
    const t = clamp(x / this.step, 0, this.n - 1.001);
    const i = Math.floor(t);
    const f = t - i;
    return this.h[i] * (1 - f) + this.h[i + 1] * f;
  }

  ceilingAt(x) {
    if (!this.ceiling) return -Infinity;
    const t = clamp(x / this.step, 0, this.n - 1.001);
    const i = Math.floor(t);
    const f = t - i;
    return this.ceiling[i] * (1 - f) + this.ceiling[i + 1] * f;
  }

  padAt(x) {
    for (const p of this.pads) if (x >= p.x1 && x <= p.x2) return p;
    return null;
  }

  /** Approximate surface slope in radians at world x. */
  slopeAt(x) {
    const d = this.step;
    return Math.atan2(this.heightAt(x + d) - this.heightAt(x - d), d * 2);
  }
}
