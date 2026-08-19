// Procedural terrain: midpoint displacement heightmap with flat pads carved in,
// plus an optional lethal ceiling for cave levels.

import { clamp, makeRng } from './util.js';
import { buildArchetype } from './archetypes.js';
import { cargoFor } from './objectives.js';

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

    // Where the lander enters the map. Chosen *before* the pads, because "how
    // far from the start" is the axis the whole map is built around now - it
    // used to be derived from the best pad afterwards, which made every mission
    // exactly 30% of its own width long.
    this.entry = this.shape ? this._chooseEntry(rng) : null;
    if (this.entry) this.entry.y = this.height * 0.14;

    this.pads = this.shape ? this._carveAnchoredPads(cfg, rng) : this._carvePads(cfg, rng);

    this.ceiling = null;
    if (cfg.cave) this._makeCeiling(cfg, rng);

    this.fuelCells = this._placeFuel(cfg, rng);
    this.cargo = this._placeCargo(cfg, rng);
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
  /**
   * The lander enters near one edge, so the map runs away from it. Which edge is
   * seeded, so a mission is not always flown in the same direction.
   */
  _chooseEntry(rng) {
    const inset = this.width * 0.10;
    const dir = rng() < 0.5 ? 1 : -1;                 // +1 = the map lies to the right
    return { x: dir > 0 ? inset : this.width - inset, dir };
  }

  /**
   * How far from the entry a pad of this rank should sit, as a window in world
   * x. Pads are authored prize-first, so pad 0 takes the deepest band and the
   * last pad takes the nearest - which is what makes the low-value pad the one
   * you can always get home to.
   */
  _bandFor(index, count) {
    const BANDS = [[0.14, 0.34], [0.38, 0.62], [0.66, 0.94]];
    const run = this.entry.dir > 0 ? this.width - this.entry.x : this.entry.x;
    // One pad sits mid-map; with more, the first is deepest and the last nearest.
    const rank = count === 1 ? 1 : Math.min(2, Math.round(((count - 1 - index) / (count - 1)) * 2));
    const [lo, hi] = BANDS[rank];
    const a = this.entry.x + this.entry.dir * run * lo;
    const b = this.entry.x + this.entry.dir * run * hi;
    return { lo: Math.min(a, b), hi: Math.max(a, b), tier: rank };
  }

  _carveAnchoredPads(cfg, rng) {
    const pads = [];
    const anchors = this.shape.anchors;
    const count = cfg.pads.length;
    cfg.pads.forEach((specPad, i) => {
      const band = this._bandFor(i, count);
      const width = specPad.width || 140;
      // An anchor inside the band is worth taking - that is the archetype's own
      // interesting ground. Otherwise the flattest free spot inside the band.
      const anchor = anchors.find((a) => {
        const x = a.nx * this.width;
        return x >= band.lo && x <= band.hi && !pads.some((p) => x + width / 2 > p.x1 - 90 && x - width / 2 < p.x2 + 90);
      }) || null;
      const slope = specPad.slope != null ? specPad.slope : (anchor ? anchor.slope || 0 : 0);
      const cx = anchor
        ? clamp(anchor.nx * this.width, width * 0.6 + 60, this.width - width * 0.6 - 60)
        : this._findFlatSpot(width, pads, band);
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
        // 0 = near and safe, 1 = a real crossing, 2 = the far end of the map.
        tier: band.tier,
        reach: Math.round(Math.abs((i1 + i2) / 2 * this.step - this.entry.x)),
      });
    });
    return pads;
  }

  /** Centre of the flattest window of `width` that no existing pad occupies. */
  _findFlatSpot(width, pads, band = null) {
    const half = width / 2;
    const margin = 70;
    let best = null;
    let bestScore = Infinity;
    const from = Math.max(half + margin, band ? band.lo : 0);
    const to = Math.min(this.width - half - margin, band ? band.hi : this.width);
    for (let cx = from; cx <= to; cx += this.step * 2) {
      const clash = pads.some((p) => cx + half > p.x1 - 90 && cx - half < p.x2 + 90);
      if (clash) continue;
      const i1 = Math.max(0, Math.round((cx - half) / this.step));
      const i2 = Math.min(this.n - 1, Math.round((cx + half) / this.step));
      let lo = Infinity, hi = -Infinity;
      for (let k = i1; k <= i2; k++) { lo = Math.min(lo, this.h[k]); hi = Math.max(hi, this.h[k]); }
      const score = hi - lo;
      if (score < bestScore) { bestScore = score; best = cx; }
    }
    // A band with no free ground in it falls back to the whole map rather than
    // dropping the pad: fewer landing zones is worse than a mistimed one.
    if (best == null && band) return this._findFlatSpot(width, pads, null);
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

  /**
   * The fuel road.
   *
   * Cells used to be scattered anywhere, which made them a lottery. They are a
   * *route* now: a line of them between the entry and the deepest landing zone,
   * flown low. That is the whole economy of the map - the far pad is beyond the
   * starting tank, and the only way to reach it is the low road, which is also
   * the ground the guns can see. Going deep is a decision made at the top of
   * the flight, not a whim at the end of it.
   */
  _placeFuel(cfg, rng) {
    if (!this.entry || !this.pads.length) return this._scatterFuel(cfg, rng);
    const deep = this.pads.reduce((a, p) => ((p.reach || 0) > (a.reach || 0) ? p : a), this.pads[0]);
    const target = (deep.x1 + deep.x2) / 2;
    const span = Math.abs(target - this.entry.x);
    // The road follows the glide line from the entry to the far pad, then sits
    // a little under it. A cell you have to stop and hover for costs more fuel
    // than it carries; a cell on the line you were already flying is a choice
    // about *altitude* - lower and slower, in reach of the guns - which is the
    // trade this map is built on.
    const entryY = this.entry.y != null ? this.entry.y : this.height * 0.14;
    const glide = (t) => entryY + (deep.y - 170 - entryY) * t + 70;
    // One cell roughly every 700 px of crossing, and never fewer than the
    // mission asked for. A short hop needs no road.
    const want = Math.max(cfg.fuelCells || 0, span > 900 ? Math.round(span / 700) : 0);
    const cells = [];
    for (let i = 1; i <= want; i++) {
      const t = i / (want + 1);
      let placed = false;
      for (let tries = 0; tries < 24 && !placed; tries++) {
        const jitter = (rng() - 0.5) * span * 0.06;
        const x = clamp(this.entry.x + (target - this.entry.x) * t + jitter, 160, this.width - 160);
        const ground = this.heightAt(x);
        const ceil = this.ceiling ? this.ceilingAt(x) : this.height * 0.12;
        const lo = ceil + 80;
        const hi = ground - 120;
        if (hi - lo < 40) continue;
        const y = clamp(glide(t) + (rng() - 0.5) * 60, lo, hi);
        if (cells.some((c) => Math.hypot(c.x - x, c.y - y) < 220)) continue;
        cells.push({ x, y, taken: false, phase: rng.range(0, 6.28), road: true });
        placed = true;
      }
    }
    return cells;
  }

  /** The old scatter, kept for legacy levels whose layout assumes it. */
  _scatterFuel(cfg, rng) {
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

  /**
   * The thing a cargo objective asks you to recover, as an object in the world.
   * It sits deep and low - a detour off the landing approach, so "recover the
   * sample" is a route decision rather than a line of text on the briefing.
   */
  _placeCargo(cfg, rng) {
    const spec = cargoFor(cfg);
    if (!spec || !this.entry || !this.pads.length) return [];
    const deep = this.pads.reduce((a, p) => ((p.reach || 0) > (a.reach || 0) ? p : a), this.pads[0]);
    const mid = (deep.x1 + deep.x2) / 2;
    const dir = this.entry.dir;
    for (let tries = 0; tries < 30; tries++) {
      // 'offRoute' sits past the landing zone, so taking it means overflying the
      // pad and coming back; everything else sits just short of it.
      const off = spec.place === 'offRoute'
        ? dir * rng.range(240, 460)
        : -dir * rng.range(200, 380);
      const x = clamp(mid + off, 150, this.width - 150);
      if (this.padAt(x)) continue;
      const ground = this.heightAt(x);
      const ceil = this.ceiling ? this.ceilingAt(x) : this.height * 0.12;
      const y = ground - rng.range(70, 130);
      if (y - ceil < 80) continue;
      return [{
        x, y, id: spec.id, label: spec.label, kind: 'cargo',
        taken: false, phase: rng.range(0, 6.28),
      }];
    }
    return [];
  }

  /**
   * Collect anything the lander is touching. Shared by the game loop and the
   * test pilot so both agree on what counts as picked up - the rule used to
   * live in main.js, where no test could reach it.
   */
  collect(x, y, radius = 62) {
    const got = [];
    for (const c of this.fuelCells) {
      if (c.taken) continue;
      if (Math.hypot(c.x - x, c.y - y) < radius) { c.taken = true; got.push({ ...c, kind: 'fuel', ref: c }); }
    }
    for (const c of this.cargo || []) {
      if (c.taken) continue;
      if (Math.hypot(c.x - x, c.y - y) < radius) { c.taken = true; got.push({ ...c, kind: 'cargo', ref: c }); }
    }
    return got;
  }

  /** Has the mission's cargo objective been picked up? */
  get cargoTaken() {
    return (this.cargo || []).length > 0 && this.cargo.every((c) => c.taken);
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
