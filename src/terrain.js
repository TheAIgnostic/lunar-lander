// Procedural terrain: midpoint displacement heightmap with flat pads carved in,
// plus an optional lethal ceiling for cave levels.

import { clamp, makeRng, smoothstep } from './util.js';
import { buildArchetype } from './archetypes.js';

/**
 * Where a deposit may sit, in pixels. Geometry, which is terrain's business.
 *
 * What a deposit is *worth* is economy's business and lives there. Terrain used
 * to import the price table to stamp a value onto every node, which pointed a
 * low-level generator at a high-level concept and cost us a real crash: the
 * bundler emits terrain before economy, so a module-level read of that table
 * threw "cannot access before initialization" in the single-file build and
 * nowhere else. A node carries its distance `tier` now, and economy prices it.
 */
/**
 * How close the lander has to be to sweep something up. The Salvage Magnet
 * widens it, and `pickupRadius` is the one place that is folded in - both the
 * game loop and the test pilot call it, the way they already share `collect`
 * itself. A second copy of the multiply is how the two disagree about what was
 * picked up, and the fuel road depends on them agreeing.
 */
export const PICKUP_RADIUS = 62;

export function pickupRadius(loadout) {
  return PICKUP_RADIUS * ((loadout && loadout.collectRadius) || 1);
}

export const MATERIAL_SITE = {
  radius: PICKUP_RADIUS,
  padGuard: 150,
  // How far a crate hangs above the ground it was left over. M22 brought the
  // crossing crates into this band from the glide line, which had them a mean
  // of 243 px up and as much as 718 - a marker in the sky rather than cargo.
  //
  // Lower is not free: the detour costs a descent and a climb, and a collector
  // sweep measures 85/300 landings at a mean of 215 px, 82 at 170, 79 at 133
  // and 75 at 106. This band halves the hang height and caps the worst case at
  // 240 px while collecting exactly as much as the old glide-line rule did.
  floatLo: 110,
  floatHi: 240,
};

/**
 * The three knobs M19 tunes, in one place so the whole game moves together
 * rather than fifteen missions moving one at a time.
 *
 *   relief  the macro silhouette's amplitude - how deep a canyon, how tall a rim
 *   rough   the midpoint-displacement amplitude - how broken the surface is
 *   bite    how much of the archetype's own noise damping to give back, 0..1.
 *           Archetypes deliberately smooth their interiors so the shape stays
 *           readable (0.25 inside a canyon, 0.35 in a crater bowl); this lifts
 *           those floors toward 1 so the inside of a feature is rough too,
 *           which is where "bumpy" is actually felt.
 *
 * Tom asked for three times bumpier. Three times is past the point where the
 * mission validator can still promise a landing: see test/BASELINE.md for the
 * sweep and where the wall is.
 */
export const TERRAIN = { relief: 1.8, rough: 1.25, bite: 0.25 };

/**
 * Boulders raised into the heightmap. `min`/`max` are radii in px - the old
 * decorative rocks were 3-9, so the largest of these is a genuine landmark you
 * have to go around rather than a texture you fly through.
 */
export const BOULDER = { density: 1.6, min: 16, max: 74, padGuard: 130, caveScale: 0.5 };

/**
 * Ice is not rock, and until M20 it was drawn in a different colour and
 * generated identically. Measured before the change, Europa was the *smoothest*
 * chapter in the game - mean surface slope 0.618 against Luna's 0.717 and Mars'
 * 0.742, and GLASS was 0.308, the smoothest map anywhere.
 *
 * Two mechanisms, both raised into the heightmap so collision, line of sight,
 * the fuel road and the ore clearances all see the real surface for free - the
 * same rule M19's boulders established:
 *
 *   seam   the shell fractures into plates that *step* against each other. A
 *          seam shifts everything beyond it by `throw` px, so the joint is a
 *          hard cliff rather than a slope, and `bound` keeps the plates
 *          stepping rather than walking the whole map downhill.
 *   serac  blades of ice standing where the plates sheared: narrow, leaning,
 *          and 1.5-3.2x as tall as they are wide. The heightmap samples every
 *          ~12 px, which is what sets `min` - anything narrower than two
 *          samples cannot exist in the ground, only in a drawing of it.
 */
export const ICE = {
  seam: { spacing: [190, 360], throw: [9, 30], bound: 34, padGuard: 170, caveScale: 0.5 },
  serac: { density: 1.5, min: 24, max: 52, rise: [1.5, 3.2], padGuard: 110, caveScale: 0.55 },
};

/**
 * Structures: what is left of whoever was here before.
 *
 * Raised into the heightmap like a boulder or a serac, so a tower is something
 * you collide with, land a machine on and hide behind for nothing. The
 * difference is the *top*: a structure's roof is cut flat, which is the whole
 * reason it exists. M21's complaint was turrets half-buried in slopes, and 30%
 * of them stood on ground steeper than 0.30 - a flat roof is somewhere a gun
 * can honestly stand.
 *
 * Terrain does not know what a turret is. It produces flat-topped geometry and
 * records it; `placeEnemies` chooses among what it finds. That keeps the
 * generator free of concepts it has no business importing.
 */
export const STRUCTURE = {
  padGuard: 210,          // never beside a landing zone
  minGap: 250,            // structures stand apart, so they read as buildings
  maxSlope: 0.55,         // nothing is built on a cliff face
  tower: { w: [34, 62], h: [95, 215] },
  hab: { w: [95, 200], h: [42, 92] },
  towerShare: 0.5,
};

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
      relief: (spec.relief != null ? spec.relief : Math.max(180, cfg.rough * 1.4)) * TERRAIN.relief,
    });

    // The roughness multiplier applies to authored and generated missions only.
    // Legacy levels have no archetype, and the classic twelve have been
    // byte-identical since M2; roughing them up would quietly rewrite the
    // campaign this expansion promised not to touch.
    this._midpoint(groundBase, cfg.rough * (this.shape ? TERRAIN.rough : 1), rng);

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
        // `bite` gives back some of the damping the archetype applies to its
        // own interior, so a canyon floor is broken ground rather than a smooth
        // trough. Pads are carved after this, so a landing zone is still flat.
        const damp = this.shape.noise(nx);
        const mix = damp + (1 - damp) * TERRAIN.bite;
        this.h[i] = groundBase - this.shape.elevation(nx) * fit + base[i] * mix;
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

    // An icy body fractures. Both passes run on their own seed streams, after
    // the pads and the roof and before everything that is placed against the
    // surface, so a rock world is byte-identical to what it was and an ice
    // world's road, ore and cargo see the ice they are actually sitting on.
    this.surface = cfg.surface === 'ice' && this.shape ? 'ice' : 'rock';
    this.seams = this.surface === 'ice' ? this._fractureIce(cfg, seed) : [];
    this.seracs = this.surface === 'ice' ? this._raiseSeracs(cfg, seed) : [];

    // What somebody built here and left. Flat roofs, which is what a machine
    // needs to stand on and what the ground stopped providing when M19
    // roughened it.
    this.structures = this._raiseStructures(cfg, seed);

    // Big rocks are *terrain*, not decoration.
    //
    // Rocks were 3-9 px and drawn on top of the heightmap with no collision at
    // all, so a boulder was something you flew through. Making them large would
    // have meant either obvious fakery or a whole second collision system for
    // free-standing bodies. Raising the heightmap instead gives exact collision
    // for nothing - the same three hull points and two feet already test
    // against the ground - and everything placed afterwards, the fuel road
    // included, sees the real surface.
    this.boulders = this._raiseBoulders(cfg, seed);
    // Every pass that raises ground records the crest it produced, and the last
    // one to run wins. Re-derive them here, once, after all of them: a boulder
    // standing where a serac already stood left the blade's recorded crest 40 px
    // underground, which the renderer reads to place its gradient.
    for (const s of this.seracs) s.top = this.heightAt(s.x + s.lean * s.r);
    for (const b of this.boulders) b.top = this.heightAt(b.x);
    // A structure's roof is the one crest that must *not* drift: a machine is
    // placed on it. Nothing may raise ground inside its footprint afterwards,
    // and `_raiseBoulders` keeps clear of them for that reason.
    for (const st of this.structures) st.top = this.heightAt(st.x);

    this.fuelCells = this._placeFuel(cfg, rng);
    this.cargo = this._placeCargo(cfg, rng);
    this.rocks = this._scatterRocks(cfg, rng);
    // Material runs off its own stream, derived from the seed rather than drawn
    // from `rng`. Everything above this line - heightmap, pads, road, cargo,
    // rocks - was generated before M15 existed, and taking draws from the shared
    // stream would have moved every one of them. The physics fixture has not
    // changed since M0 and this is not the milestone to change it.
    this.materialNodes = this._placeMaterial(cfg, seed);
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

  /**
   * Boulders: raised into the heightmap so they are real obstacles.
   *
   * Runs on its own seed stream, like the ore does, so adding them does not
   * shuffle the pads, the road or anything else that was already placed.
   * Deliberately kept well clear of the landing zones: a rock beside a pad is
   * character, a rock *on* the approach is an ambush the player cannot read.
   */
  _raiseBoulders(cfg, seed) {
    const spec = cfg.terrain || {};
    const density = spec.detail != null ? spec.detail : (this.shape ? 1 : 0);
    if (density <= 0 || !this.shape) return [];
    const rng = makeRng(((((seed | 0) ^ 0x51ed270b) >>> 0) + 7) >>> 0);
    // A cave corridor is the tightest air in the game, and it already has a
    // roof, a drone and a radiation sweep in it. Full-sized boulders there
    // slowed the crossing enough to cost a lander to fire on the safe route,
    // which is the one thing the design promises cannot happen - so a roofed
    // level gets fewer of them and smaller.
    const roofed = !!this.ceiling;
    const scale = roofed ? BOULDER.caveScale : 1;
    const count = Math.round((this.width / 700) * density * BOULDER.density * (roofed ? 0.55 : 1));
    const out = [];
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 18; tries++) {
        const r = rng.range(BOULDER.min, BOULDER.max) * scale;
        const x = rng.range(r + 60, this.width - r - 60);
        // Never near a landing zone, and never on a slope it would slide off.
        if (this.pads.some((p) => x > p.x1 - BOULDER.padGuard - r && x < p.x2 + BOULDER.padGuard + r)) continue;
        // A rock on a roof is a rock a machine cannot stand beside, and it
        // would move a crest that `placeEnemies` has already been promised.
        if (this.structures.some((st) => x > st.x - st.w / 2 - r - 30 && x < st.x + st.w / 2 + r + 30)) continue;
        if (Math.abs(this.slopeAt(x)) > 0.8) continue;
        if (out.some((b) => Math.abs(b.x - x) < (b.r + r) * 1.4)) continue;
        // A cave has to stay flyable: a boulder may not eat the corridor.
        const rise = r * rng.range(0.7, 1.05);
        if (this.ceiling) {
          const gap = this.heightAt(x) - this.ceilingAt(x);
          if (gap - rise < 210) continue;
        }
        // Raise the ground in a jagged dome. The jitter is what stops it
        // reading as a smooth hill - it is the rock's own silhouette, and it
        // is the actual collision surface rather than a drawing of one.
        const i1 = Math.max(0, Math.floor((x - r) / this.step));
        const i2 = Math.min(this.n - 1, Math.ceil((x + r) / this.step));
        const wob = rng.range(0, 6.28);
        for (let k = i1; k <= i2; k++) {
          const d = (k * this.step - x) / r;
          if (Math.abs(d) > 1) continue;
          const dome = Math.cos(d * Math.PI / 2) ** 1.4;
          const jag = 1 + 0.18 * Math.sin(d * 7 + wob) + 0.1 * Math.sin(d * 13 - wob);
          this.h[k] -= rise * dome * jag;
        }
        out.push({ x, r, rise, top: 0 });
        break;
      }
    }
    // Record the crest after every boulder is in, so overlapping ones agree.
    for (const b of out) b.top = this.heightAt(b.x);
    return out;
  }

  /**
   * The shell fractures into plates.
   *
   * A seam shifts every sample beyond it, so the joint is a genuine step in the
   * ground and not a steep piece of noise - which is what makes ice read as
   * *broken* rather than merely rough. The running offset is bounded and
   * reversed rather than accumulated, so the plates step against each other
   * without the far end of the map walking off the bottom of the world.
   *
   * Seams keep clear of the landing zones, which means a pad always lies wholly
   * on one plate: it moves with its plate, stays flat, and `pad.y` stays the
   * ground the lander will actually touch.
   */
  _fractureIce(cfg, seed) {
    const rng = makeRng(((((seed | 0) ^ 0x1ce9b10c) >>> 0) + 11) >>> 0);
    const scale = this.ceiling ? ICE.seam.caveScale : 1;
    const bound = ICE.seam.bound * scale;
    let hMin = Infinity, hMax = -Infinity;
    for (let i = 0; i < this.n; i++) {
      if (this.h[i] < hMin) hMin = this.h[i];
      if (this.h[i] > hMax) hMax = this.h[i];
    }
    const floor = this.height * 0.22 + 6;
    const roof = this.height - 46;
    // An offset the world has no room for is not applied: clamping the
    // heightmap afterwards would leave a pad hanging above ground it no longer
    // touches.
    const fits = (v) => hMax + Math.max(0, v) <= roof && hMin + Math.min(0, v) >= floor;

    const seams = [];
    let off = 0;
    let x = rng.range(ICE.seam.spacing[0], ICE.seam.spacing[1]);
    for (; x < this.width - 140; x += rng.range(ICE.seam.spacing[0], ICE.seam.spacing[1])) {
      if (this.pads.some((p) => x > p.x1 - ICE.seam.padGuard && x < p.x2 + ICE.seam.padGuard)) continue;
      let d = rng.range(ICE.seam.throw[0], ICE.seam.throw[1]) * scale * (rng() < 0.5 ? -1 : 1);
      if (Math.abs(off + d) > bound || !fits(off + d)) d = -d;
      if (Math.abs(off + d) > bound || !fits(off + d)) continue;
      off += d;
      const i = clamp(Math.round(x / this.step), 0, this.n - 1);
      for (let k = i; k < this.n; k++) this.h[k] += d;
      for (const p of this.pads) {
        if (p.i1 >= i) { p.y += d; p.y1 += d; p.y2 += d; }
      }
      seams.push({ x: i * this.step, drop: d });
    }
    return seams;
  }

  /**
   * Seracs: blades of ice raised into the heightmap.
   *
   * Where a boulder is a wide dome you fly around, a serac is a narrow spike
   * you fly *between*, so it is placed denser and kept off the pads by the same
   * rule. Leaning, because a field of upright triangles reads as a sawtooth.
   */
  _raiseSeracs(cfg, seed) {
    const spec = cfg.terrain || {};
    const density = spec.detail != null ? spec.detail : 1;
    if (density <= 0) return [];
    const rng = makeRng(((((seed | 0) ^ 0x5e7ac0de) >>> 0) + 13) >>> 0);
    // A roofed level has the tightest air in the game; M19 already found that
    // full-sized obstacles in a cave cost a lander on the safe route.
    const roofed = !!this.ceiling;
    const scale = roofed ? ICE.serac.caveScale : 1;
    const count = Math.round((this.width / 420) * density * ICE.serac.density * (roofed ? 0.6 : 1));
    const out = [];
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 20; tries++) {
        const r = rng.range(ICE.serac.min, ICE.serac.max) * scale;
        const x = rng.range(r + 50, this.width - r - 50);
        if (this.pads.some((p) => x > p.x1 - ICE.serac.padGuard - r && x < p.x2 + ICE.serac.padGuard + r)) continue;
        if (out.some((s) => Math.abs(s.x - x) < (s.r + r) * 1.25)) continue;
        const rise = r * rng.range(ICE.serac.rise[0], ICE.serac.rise[1]);
        if (this.ceiling && this.heightAt(x) - this.ceilingAt(x) - rise < 210) continue;
        const lean = rng.range(-0.42, 0.42);
        const wob = rng.range(0, 6.28);
        const i1 = Math.max(0, Math.floor((x - r) / this.step));
        const i2 = Math.min(this.n - 1, Math.ceil((x + r) / this.step));
        for (let k = i1; k <= i2; k++) {
          const d = (k * this.step - x) / r;
          if (Math.abs(d) > 1) continue;
          // A leaning tent: 0 at both feet, 1 at the peak, and convex enough
          // near the tip that the blade comes to a point.
          const t = d < lean ? (d + 1) / (lean + 1) : (1 - d) / (1 - lean);
          // The exponent is what makes it a blade rather than a hill: above 1
          // the profile stays low until close to the peak, so the thing comes
          // to a point instead of swelling out of the ground.
          const blade = Math.max(0, t) ** 1.3 * (1 + 0.1 * Math.sin(d * 9 + wob));
          this.h[k] -= rise * blade;
        }
        out.push({ x, r, rise, lean, top: 0 });
        break;
      }
    }
    // The crest after every blade is in, so overlapping ones agree - the same
    // rule the boulders use, and for the same reason: the drawing traces the
    // heightmap rather than guessing at it.
    for (const s of out) s.top = this.heightAt(s.x + s.lean * s.r);
    return out;
  }

  /**
   * Flat-topped blocks cut into the heightmap: towers and low habs.
   *
   * The sides are deliberately vertical - a hard cut at the footprint edge -
   * because a building with sloped sides reads as a hill. The roof is set by
   * `Math.min` against the existing ground, so it is level even where the
   * ground under it is not, which is the property the whole thing exists for.
   */
  _raiseStructures(cfg, seed) {
    const want = Math.max(0, cfg.structures | 0);
    if (!want || !this.shape) return [];
    const rng = makeRng(((((seed | 0) ^ 0x5721c7ea) >>> 0) + 19) >>> 0);
    const out = [];
    for (let i = 0; i < want; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const tower = rng() < STRUCTURE.towerShare;
        const spec = tower ? STRUCTURE.tower : STRUCTURE.hab;
        const w = rng.range(spec.w[0], spec.w[1]);
        const rise = rng.range(spec.h[0], spec.h[1]);
        const x = rng.range(w + 90, this.width - w - 90);
        if (this.pads.some((p) => x > p.x1 - STRUCTURE.padGuard - w && x < p.x2 + STRUCTURE.padGuard + w)) continue;
        if (out.some((o) => Math.abs(o.x - x) < (o.w + w) / 2 + STRUCTURE.minGap)) continue;
        if (Math.abs(this.slopeAt(x)) > STRUCTURE.maxSlope) continue;
        const i1 = Math.max(0, Math.floor((x - w / 2) / this.step));
        const i2 = Math.min(this.n - 1, Math.ceil((x + w / 2) / this.step));
        if (i2 - i1 < 2) continue;                       // narrower than the grid can hold
        // Measure the ground the whole footprint stands on, not just the middle.
        // Taking the height at the centre and lowering everything to it leaves
        // the high end of a slope standing proud *through* the roof - an 87 px
        // step across a 183 px hab, which is not a roof anything can stand on.
        let crest = Infinity, foot = -Infinity;
        for (let k = i1; k <= i2; k++) {
          if (this.h[k] < crest) crest = this.h[k];
          if (this.h[k] > foot) foot = this.h[k];
        }
        const base = foot;
        const top = crest - rise;
        // A cave has to stay flyable, and a tower eats more corridor than a
        // boulder does because it does not taper.
        if (this.ceiling && top - this.ceilingAt(x) < 210) continue;
        if (top < this.height * 0.24) continue;
        for (let k = i1; k <= i2; k++) this.h[k] = Math.min(this.h[k], top);
        out.push({ kind: tower ? 'tower' : 'hab', x, w, rise, base, top, i1, i2 });
        break;
      }
    }
    return out;
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
      // Loose debris, in a much wider spread than the old flat 3-9 px. The big
      // ones are boulders in the heightmap; these are what is scattered between
      // them, and a field of identically-sized pebbles reads as a texture.
      const r = rng.range(2.5, 15) * (1 + density * 0.2);
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

      // Blend the shoulders back into the landscape. The run scales with how
      // rough the world is: a five-sample blend was fine on gentle ground and
      // became a step off a cliff once M19 roughened everything, which is what
      // was costing landings - the pad was flat, but the last thing you flew
      // over on the way in was not. Roughening the world has to come with a
      // longer approach, or the roughness lands entirely on the touchdown.
      const skirt = Math.max(5, Math.round(5 * TERRAIN.rough * (1 + TERRAIN.bite)));
      for (let k = 1; k <= skirt; k++) {
        const t = k / (skirt + 1);
        if (i1 - k >= 0) this.h[i1 - k] = this.h[i1 - k] * t + this.h[i1] * (1 - t);
        if (i2 + k < this.n) this.h[i2 + k] = this.h[i2 + k] * t + this.h[i2] * (1 - t);
      }
      pads.push({
        x1: i1 * this.step, x2: i2 * this.step,
        y, y1: this.h[i1], y2: this.h[i2], slope,
        mult: specPad.mult, kind: anchor ? anchor.kind : 'flat', used: false, i1, i2,
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
    // The mouth: open sky where you come in, a roof by the time you are deep.
    //
    // A cave used to be a lid over the entire level, so a cave mission began
    // already indoors and the ceiling was a fact rather than an event. Lifting
    // the roof clear of the world near the entry and bringing it down across
    // the crossing makes it something you fly *into*: the sky closes over you
    // somewhere around a third of the way in, and from there the corridor is
    // the mission.
    //
    // It is still one array over the whole level, so every consumer - the hull
    // collision, line of sight, the placement clearances, the corridor
    // validator, the pilot's ceiling guard - keeps working untouched. Near the
    // entry the roof is simply out of reach.
    if (this.entry) {
      const run = this.entry.dir > 0 ? this.width - this.entry.x : this.entry.x;
      const open = cfg.caveMouth != null ? cfg.caveMouth : 0.20;   // fully open until here
      const shut = cfg.caveShut != null ? cfg.caveShut : 0.52;     // fully roofed by here
      const sky = -120;                                           // above the top of the world
      for (let i = 0; i < n; i++) {
        const frac = run > 0 ? clamp(Math.abs(i * this.step - this.entry.x) / run, 0, 1) : 1;
        const t = 1 - smoothstep(clamp((frac - open) / Math.max(0.01, shut - open), 0, 1));
        if (t > 0) c[i] = c[i] * (1 - t) + sky * t;
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
    // The mission's cargo spec arrives on the level config, put there by
    // `missionToLevel`. Terrain does not need to know what an objective is.
    const spec = cfg.cargoSpec;
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
   * How far out a point lies, as a fraction of the run from the entry, and the
   * distance tier that goes with it. Same three bands the pads use.
   */
  bandAt(x) {
    if (!this.entry) return { frac: 0, tier: 0 };
    const run = this.entry.dir > 0 ? this.width - this.entry.x : this.entry.x;
    const frac = run > 0 ? clamp(Math.abs(x - this.entry.x) / run, 0, 1) : 0;
    return { frac, tier: frac < 0.38 ? 0 : frac < 0.66 ? 1 : 2 };
  }

  /** Is this point far enough from every landing zone to be a real detour? */
  _clearOfPads(x, guard) {
    return !this.pads.some((p) => x > p.x1 - guard && x < p.x2 + guard);
  }

  /**
   * Material nodes - the reward as an object rather than a figure.
   *
   * Three rules, all of them Tom's, from playing M14 and finding nothing out
   * there:
   *
   *   visible   low over the ground around the deep zone, and floating on the
   *             crossing where they read against the sky
   *   outside   never on a pad and never within `padGuard` of one, so taking
   *             one always means leaving the line you would have flown
   *   deep      nothing in the near band at all, and the far band pays roughly
   *             double the crossing - the M14 gradient made physical
   *
   * They cluster on the deep landing zone, which is where `placeEnemies` puts
   * the guards, so one rule about where the map's value lies serves both.
   */
  _placeMaterial(cfg, seed) {
    if (!this.entry || !this.pads.length) return [];
    const rng = makeRng(((((seed | 0) ^ 0x9e3779b9) >>> 0) + 101) >>> 0);
    const deep = this.pads.reduce((a, p) => ((p.reach || 0) > (a.reach || 0) ? p : a), this.pads[0]);
    const mid = (deep.x1 + deep.x2) / 2;
    const dir = this.entry.dir;
    const span = Math.abs(mid - this.entry.x);
    const out = [];

    const add = (x, y, kind) => {
      const tier = this.bandAt(x).tier;
      if (!tier) return false;                                  // never in the near band
      if (!this._clearOfPads(x, MATERIAL_SITE.padGuard)) return false;
      if (out.some((n) => Math.hypot(n.x - x, n.y - y) < 150)) return false;
      // Never close enough to a cell or a crate to be swept up with it. Two
      // pickups on one pass is one decision, and the ore is supposed to be its
      // own decision - that is the entire point of where it lies.
      const near = (list) => (list || []).some((c) => Math.hypot(c.x - x, c.y - y) < 150);
      if (near(this.fuelCells) || near(this.cargo)) return false;
      out.push({ x, y, tier, kind, taken: false, phase: rng.range(0, 6.28) });
      return true;
    };

    // The crossing: crates hanging low over the ground, so reaching one costs
    // altitude on the leg where altitude is what keeps you out of reach.
    //
    // They used to hang off the glide line, which put them a mean of 243 px up
    // and as much as 718 - high enough that a crate read as a marker floating
    // in the sky rather than as cargo somebody left on the ground. M22 brings
    // them into the same band the seam crates already used.
    const entryY = this.entry.y != null ? this.entry.y : this.height * 0.14;
    const road = clamp(Math.round(span / 900), 2, 3);
    // Spread along the crossing, but expressed in *bands* rather than in
    // fractions of the span. A single-landing-zone mission puts its pad in the
    // middle band, so "42% of the way to the pad" fell inside the near band and
    // every deposit on the crossing was refused: moon-2, mars-2, europa-2 and
    // europa-4 were shipping 0.2 floating deposits apiece. Start where the near
    // band ends instead, whatever fraction of this particular map that is.
    const runLen = this.entry.dir > 0 ? this.width - this.entry.x : this.entry.x;
    const padFrac = runLen > 0 ? span / runLen : 1;
    const tMin = Math.min(0.86, padFrac > 0 ? 0.40 / padFrac : 0.42);
    for (let i = 1; i <= road; i++) {
      const t = tMin + (i / (road + 1)) * (0.96 - tMin);
      for (let tries = 0; tries < 20; tries++) {
        const x = clamp(this.entry.x + dir * span * t + (rng() - 0.5) * span * 0.08, 150, this.width - 150);
        const ground = this.heightAt(x);
        const roof = this.ceiling ? this.ceilingAt(x) : this.height * 0.10;
        const y = clamp(ground - rng.range(MATERIAL_SITE.floatLo, MATERIAL_SITE.floatHi), roof + 90, ground - MATERIAL_SITE.floatLo);
        if (ground - y < MATERIAL_SITE.floatLo || y - roof < 90) continue;
        if (add(x, y, 'float')) break;
      }
    }
    // The seam: ore around the deep zone, just outside it - the ground the
    // machines are placed to cover. Two of the three sit *past* the zone and
    // one short of it, so overflying the pad and coming back is the shape of
    // the detour.
    //
    // Placed after the crossing, not before: on a short single-zone map the two
    // compete for the same stretch, and the crossing is the deposit a player
    // can actually afford. Seam-first left moon-2, mars-2 and europa-2 with 0.1
    // floating deposits apiece.
    for (let i = 0; i < 3; i++) {
      for (let tries = 0; tries < 24; tries++) {
        const out1 = i !== 1;
        const x = clamp(mid + (out1 ? dir * rng.range(200, 700) : -dir * rng.range(190, 520)), 140, this.width - 140);
        const ground = this.heightAt(x);
        if (Math.abs(this.slopeAt(x)) > 0.85) continue;         // nothing hangs over a cliff
        // Low over the ground, not resting on it. Sitting on the surface was
        // the first version and it measured badly: reaching one meant landing,
        // taking off and landing again, which cost more fuel than the deposit
        // was worth - a collector sweep fell to 158/300 landings. At this
        // height it is a low pass on the way in, over the ground the guards
        // cover, which is the decision this was always supposed to be.
        const y = ground - rng.range(60, 130);
        if (this.ceiling && y - this.ceilingAt(x) < 110) continue;
        if (add(x, y, 'seam')) break;
      }
    }

    return out;
  }

  /** The deposits still lying out there. Pricing them is `economy.haulOf`. */
  materialLeft() {
    return (this.materialNodes || []).filter((n) => !n.taken);
  }

  /**
   * Collect anything the lander is touching. Shared by the game loop and the
   * test pilot so both agree on what counts as picked up - the rule used to
   * live in main.js, where no test could reach it.
   */
  collect(x, y, radius = PICKUP_RADIUS) {
    const got = [];
    for (const c of this.fuelCells) {
      if (c.taken) continue;
      if (Math.hypot(c.x - x, c.y - y) < radius) { c.taken = true; got.push({ ...c, kind: 'fuel', ref: c }); }
    }
    for (const c of this.cargo || []) {
      if (c.taken) continue;
      if (Math.hypot(c.x - x, c.y - y) < radius) { c.taken = true; got.push({ ...c, kind: 'cargo', ref: c }); }
    }
    for (const m of this.materialNodes || []) {
      if (m.taken) continue;
      // Scaled, not floored at the site radius: a magnet that widened the reach
      // for fuel cells and not for ore would miss the thing it is named after.
      if (Math.hypot(m.x - x, m.y - y) < Math.max(radius, MATERIAL_SITE.radius * (radius / PICKUP_RADIUS))) {
        m.taken = true;
        got.push({ ...m, kind: 'material', ref: m });
      }
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
