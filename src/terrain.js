// Procedural terrain: midpoint displacement heightmap with flat pads carved in,
// plus an optional lethal ceiling for cave levels.

import { clamp, makeRng } from './util.js';
import { buildArchetype } from './archetypes.js';

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
    const spec = cfg.terrain || {};
    this.archetypeName = spec.archetype || 'legacy';

    // The macro silhouette is laid down first; the familiar midpoint noise then
    // rides on top of it, damped wherever the shape needs to stay readable.
    this.shape = buildArchetype(this.archetypeName, rng, {
      relief: spec.relief != null ? spec.relief : Math.max(180, cfg.rough * 1.4),
    });

    this._midpoint(groundBase, cfg.rough, rng);

    if (this.shape) {
      const base = new Float32Array(n);
      for (let i = 0; i < n; i++) base[i] = this.h[i] - groundBase;   // noise only

      // Fit the silhouette to the world instead of letting it clip flat against
      // the floor or ceiling: a canyon deeper than the level is a flat canyon.
      let up = 0, down = 0;
      for (let i = 0; i < n; i++) {
        const e = this.shape.elevation(i / (n - 1));
        if (e > up) up = e;
        if (-e > down) down = -e;
      }
      const headroom = groundBase - this.height * 0.26;
      const legroom = this.height - 70 - groundBase;
      const fit = Math.min(1, up > 0 ? headroom / up : 1, down > 0 ? legroom / down : 1);
      this.reliefScale = fit;

      for (let i = 0; i < n; i++) {
        const nx = i / (n - 1);
        this.h[i] = groundBase - this.shape.elevation(nx) * fit + base[i] * this.shape.noise(nx);
      }
      for (let k = 0; k < 2; k++) {
        for (let i = 1; i < n - 1; i++) this.h[i] = (this.h[i - 1] + this.h[i] * 2 + this.h[i + 1]) / 4;
      }
    }

    // Keep everything inside sane vertical bounds.
    for (let i = 0; i < n; i++) {
      this.h[i] = clamp(this.h[i], this.height * 0.22, this.height - 40);
    }

    this.pads = this.shape ? this._carveAnchoredPads(cfg, rng) : this._carvePads(cfg, rng);

    this.ceiling = null;
    if (cfg.cave) this._makeCeiling(cfg, rng);

    this.fuelCells = this._placeFuel(cfg, rng);
    this.rocks = this._scatterRocks(cfg, rng);
    this._assertSane();
  }

  /**
   * A malformed mission definition used to produce a silently NaN heightmap and
   * an unlandable world. With 50 authored missions coming, that has to be a
   * loud failure at generation time.
   */
  _assertSane() {
    for (let i = 0; i < this.n; i++) {
      if (!Number.isFinite(this.h[i])) {
        throw new Error(`terrain[${this.archetypeName}]: height ${i} is not finite - check pad widths and archetype relief`);
      }
    }
    for (const p of this.pads) {
      if (!Number.isFinite(p.x1) || !Number.isFinite(p.x2) || p.x2 <= p.x1) {
        throw new Error(`terrain[${this.archetypeName}]: pad has no usable width (${p.x1}..${p.x2})`);
      }
      if (!Number.isFinite(p.y)) {
        throw new Error(`terrain[${this.archetypeName}]: pad height is not finite`);
      }
    }
  }

  /** Layer 4: boulders and debris along the surface, away from the pads. */
  _scatterRocks(cfg, rng) {
    const spec = cfg.terrain || {};
    const density = spec.detail != null ? spec.detail : (this.shape ? 1 : 0);
    if (density <= 0) return [];
    const count = Math.round((this.width / 90) * density);
    const rocks = [];
    for (let i = 0; i < count; i++) {
      const x = rng.range(40, this.width - 40);
      if (this.padAt(x)) continue;
      const slope = Math.abs(this.slopeAt(x));
      if (slope > 0.9) continue;                 // nothing perches on a cliff
      const r = rng.range(3, 9) * (1 + density * 0.2);
      const pts = [];
      const sides = rng.int(5, 7);
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const rr = r * rng.range(0.62, 1.15);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.72]);
      }
      rocks.push({ x, y: this.heightAt(x), r, pts, tilt: this.slopeAt(x) });
    }
    return rocks;
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
      const w = Number.isFinite(spec.width) ? spec.width : 140;
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
      pads.push({
        x1: i1 * this.step, x2: i2 * this.step,
        y, y1: y, y2: y, slope: 0,
        mult: spec.mult, kind: 'legacy', used: false, i1, i2,
      });
    });
    return pads;
  }

  /**
   * Pads placed where the macro shape says a lander could sit - an inner shelf,
   * a canyon floor, a ridge terrace - rather than at evenly spaced slots.
   */
  _carveAnchoredPads(cfg, rng) {
    const pads = [];
    const anchors = this.shape.anchors;
    cfg.pads.forEach((specPad, i) => {
      const anchor = i < anchors.length ? anchors[i] : null;
      const width = specPad.width || (anchor && anchor.width) || 140;
      const slope = specPad.slope != null ? specPad.slope : (anchor ? anchor.slope || 0 : 0);
      // More pads than the shape offers anchors: put the extras on the flattest
      // ground still free, rather than carving them over an existing pad.
      const cx = anchor
        ? clamp(anchor.nx * this.width, width * 0.6 + 60, this.width - width * 0.6 - 60)
        : this._findFlatSpot(width, pads);
      const i1 = clamp(Math.round((cx - width / 2) / this.step), 1, this.n - 2);
      const i2 = clamp(Math.round((cx + width / 2) / this.step), i1 + 2, this.n - 2);

      let sum = 0;
      for (let k = i1; k <= i2; k++) sum += this.h[k];
      const mid = (i1 + i2) / 2;
      const y = Math.round(sum / (i2 - i1 + 1));
      for (let k = i1; k <= i2; k++) this.h[k] = y + (k - mid) * this.step * slope;

      for (let k = 1; k <= 5; k++) {
        const t = k / 6;
        if (i1 - k >= 0) this.h[i1 - k] = this.h[i1 - k] * t + this.h[i1] * (1 - t);
        if (i2 + k < this.n) this.h[i2 + k] = this.h[i2 + k] * t + this.h[i2] * (1 - t);
      }
      pads.push({
        x1: i1 * this.step, x2: i2 * this.step,
        y, y1: this.h[i1], y2: this.h[i2], slope,
        mult: specPad.mult, kind: anchor ? anchor.kind : 'flat', used: false, i1, i2,
        fragile: specPad.fragile || 0,
      });
    });
    return pads;
  }

  /** Centre of the flattest window of `width` that no existing pad occupies. */
  _findFlatSpot(width, pads) {
    const half = width / 2;
    const margin = 70;
    let best = null;
    let bestScore = Infinity;
    for (let cx = half + margin; cx <= this.width - half - margin; cx += this.step * 2) {
      const clash = pads.some((p) => cx + half > p.x1 - 90 && cx - half < p.x2 + 90);
      if (clash) continue;
      const i1 = Math.max(0, Math.round((cx - half) / this.step));
      const i2 = Math.min(this.n - 1, Math.round((cx + half) / this.step));
      let lo = Infinity, hi = -Infinity;
      for (let k = i1; k <= i2; k++) { lo = Math.min(lo, this.h[k]); hi = Math.max(hi, this.h[k]); }
      const score = hi - lo;
      if (score < bestScore) { bestScore = score; best = cx; }
    }
    return best != null ? best : this.width * 0.5;
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
