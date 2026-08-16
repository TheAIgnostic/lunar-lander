// The lander: geometry, integration, collision and the landing verdict.

import { clamp, DEG } from './util.js';

export const SHIP = {
  thrust: 130,        // px/s^2 along the nose vector
  rcsAccel: 5.0,      // rad/s^2 from a side burner
  maxSpin: 3.2,       // rad/s
  spinDamp: 0.995,    // per 1/60s - slight, so RCS still demands attention
  burnMain: 9,        // fuel/s - a full tank is roughly 25s of continuous burn
  burnRcs: 3.2,
  burnHold: 5,
  radius: 20,
};

// Landing envelope, loosest-first check order matters in verdict().
export const ENVELOPE = {
  PERFECT: { vy: 11, vx: 7, tilt: 3.5 * DEG, q: 3.0 },
  GOOD: { vy: 20, vx: 13, tilt: 8 * DEG, q: 2.0 },
  HARD: { vy: 34, vx: 22, tilt: 15 * DEG, q: 1.0 },
};

// Hull outline in local space (nose toward -y).
export const HULL = [
  [0, -15], [8, -9], [11, -1], [11, 5], [-11, 5], [-11, -1], [-8, -9],
];
export const LEGS = [
  [[-9, 5], [-16, 16]], [[9, 5], [16, 16]],
  [[-20, 16], [-12, 16]], [[12, 16], [20, 16]],
];
const FEET = [[-16, 16], [16, 16]];
const HULL_POINTS = [[0, -15], [11, -1], [11, 5], [-11, 5], [-11, -1], [8, -9], [-8, -9]];

export class Ship {
  constructor() {
    this.reset(0, 0, 100);
  }

  reset(x, y, fuel) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.spin = 0;
    this.fuel = fuel;
    this.maxFuel = fuel;
    this.alive = true;
    this.landed = false;
    this.thrusting = false;
    this.rcsLeft = false;
    this.rcsRight = false;
    this.holding = false;
    this.throttle = 0;   // visual ramp 0..1
    this.contact = null;
    this.pad = null;
    this.offPad = false;
    this.quality = null;
    this.windNow = 0;
  }

  /** Local point -> world point. */
  toWorld(px, py) {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    return { x: this.x + px * c - py * s, y: this.y + px * s + py * c };
  }

  get noseX() { return Math.sin(this.angle); }
  get noseY() { return -Math.cos(this.angle); }

  nozzle() { return this.toWorld(0, 8); }
  feet() { return FEET.map((p) => this.toWorld(p[0], p[1])); }

  /** One fixed physics step. Returns an event string or null. */
  step(dt, input, level, terrain, t) {
    if (!this.alive || this.landed) return null;

    const hasFuel = this.fuel > 0;
    this.thrusting = input.thrust && hasFuel;
    this.rcsLeft = input.left && hasFuel;
    this.rcsRight = input.right && hasFuel;
    this.holding = input.hold && hasFuel && Math.abs(this.spin) > 0.02;

    let burn = 0;
    if (this.thrusting) burn += SHIP.burnMain;
    if (this.rcsLeft) burn += SHIP.burnRcs;
    if (this.rcsRight) burn += SHIP.burnRcs;
    if (this.holding) burn += SHIP.burnHold;
    this.fuel = Math.max(0, this.fuel - burn * dt);

    // Angular
    if (this.rcsLeft) this.spin -= SHIP.rcsAccel * dt;
    if (this.rcsRight) this.spin += SHIP.rcsAccel * dt;
    if (this.holding) {
      const damp = Math.sign(this.spin) * Math.min(Math.abs(this.spin), 6 * dt);
      this.spin -= damp;
    }
    this.spin = clamp(this.spin, -SHIP.maxSpin, SHIP.maxSpin);
    this.spin *= Math.pow(SHIP.spinDamp, dt * 60);
    this.angle += this.spin * dt;

    // Linear
    const throttleTarget = this.thrusting ? 1 : 0;
    this.throttle += (throttleTarget - this.throttle) * Math.min(1, dt * 14);
    if (this.thrusting) {
      this.vx += this.noseX * SHIP.thrust * dt;
      this.vy += this.noseY * SHIP.thrust * dt;
    }
    this.vy += level.gravity * dt;

    if (level.wind || level.drag) {
      const w = level.wind + Math.sin(t * 0.7) * level.gust + Math.sin(t * 1.9 + 1.3) * level.gust * 0.4;
      this.windNow = w;
      if (level.drag) {
        this.vx += (w - this.vx) * level.drag * dt;
        this.vy += (0 - this.vy) * level.drag * 0.5 * dt;
      } else {
        this.vx += w * dt;
      }
    } else {
      this.windNow = 0;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Soft world walls
    const m = 26;
    if (this.x < m) { this.x = m; this.vx = Math.abs(this.vx) * 0.35; }
    if (this.x > level.width - m) { this.x = level.width - m; this.vx = -Math.abs(this.vx) * 0.35; }
    if (this.y < 40) { this.y = 40; this.vy = Math.max(this.vy, 0); }

    return this.collide(terrain);
  }

  collide(terrain) {
    // Ceiling is always fatal.
    if (terrain.ceiling) {
      for (const p of HULL_POINTS.concat(FEET)) {
        const w = this.toWorld(p[0], p[1]);
        if (w.y < terrain.ceilingAt(w.x)) {
          this.contact = w;
          return 'crash';
        }
      }
    }

    const feet = this.feet();
    const footHit = feet.some((f) => f.y >= terrain.heightAt(f.x));
    let hullHit = false;
    for (const p of HULL_POINTS) {
      const w = this.toWorld(p[0], p[1]);
      if (w.y >= terrain.heightAt(w.x)) { hullHit = true; this.contact = w; break; }
    }

    if (hullHit) return 'crash';
    if (!footHit) return null;

    this.contact = { x: this.x, y: this.y };
    const padL = terrain.padAt(feet[0].x);
    const padR = terrain.padAt(feet[1].x);
    const onPad = padL && padR && padL === padR;
    const v = this.verdict();
    if (!v) return 'crash';

    if (onPad) {
      this.pad = padL;
      this.offPad = false;
      this.quality = v;
      return 'land';
    }
    // Off the pad, a textbook touchdown on near-level ground survives - it just
    // pays the base rate and breaks the streak. Anything rougher is a crash.
    const slope = Math.abs(terrain.slopeAt(this.x));
    if (v === 'HARD' || slope > 10 * DEG) return 'crash';
    this.pad = null;
    this.offPad = true;
    this.quality = v;
    return 'land';
  }

  /** Which envelope band this touchdown falls in, or null for a crash. */
  verdict() {
    const tilt = Math.abs(normalizeAngle(this.angle));
    const vy = this.vy;
    const vx = Math.abs(this.vx);
    for (const name of ['PERFECT', 'GOOD', 'HARD']) {
      const e = ENVELOPE[name];
      if (vy <= e.vy && vx <= e.vx && tilt <= e.tilt) return name;
    }
    return null;
  }

  /** Live envelope check for the HUD: which readouts are currently green. */
  status() {
    const e = ENVELOPE.GOOD;
    return {
      vy: this.vy <= e.vy,
      vx: Math.abs(this.vx) <= e.vx,
      tilt: Math.abs(normalizeAngle(this.angle)) <= e.tilt,
    };
  }

  settle(terrain) {
    // Snap neatly onto the pad surface for the results pose.
    const pad = terrain.padAt(this.x);
    const y = pad ? pad.y : terrain.heightAt(this.x);
    this.y = y - 16;
    this.vx = 0;
    this.vy = 0;
    this.spin = 0;
    this.angle = 0;
    this.landed = true;
    this.thrusting = false;
    this.throttle = 0;
  }

  shards() {
    const segs = [];
    for (let i = 0; i < HULL.length; i++) {
      const a = HULL[i];
      const b = HULL[(i + 1) % HULL.length];
      segs.push([a[0], a[1], b[0], b[1]]);
    }
    for (const l of LEGS) segs.push([l[0][0], l[0][1], l[1][0], l[1][1]]);
    return segs;
  }
}

export function normalizeAngle(a) {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
}
