// The lander: geometry, integration, collision and the landing verdict.

import { clamp, DEG } from './util.js';
import { LANDING, evaluateLanding, capsFor } from './landing.js';
import { applyForces, freshStatus, freshEnv } from './forces.js';

export const SHIP = {
  thrust: 130,        // px/s^2 along the nose vector
  rcsAccel: 5.0,      // rad/s^2 from a side burner
  maxSpin: 3.2,       // rad/s
  spinDamp: 0.995,    // per 1/60s - slight, so RCS still demands attention
  burnMain: 9,        // fuel/s - a full tank is roughly 25s of continuous burn
  burnRcs: 3.2,
  burnHold: 5,
  sideThrust: 62,     // px/s^2 of lateral push in DIRECT steering
  burnSide: 5.5,      // translating costs more than nudging the attitude
  radius: 20,
};

export const DEFAULT_SETTINGS = {
  steering: 'classic',    // 'classic' = burners rotate | 'direct' = burners translate
  invertRotation: false,  // classic only: swap which burner spins which way
  // Accessibility. None of these touch the simulation - they change how it is
  // presented, which is the point: the flight model must feel the same to
  // everyone, and only the presentation should have to adapt.
  shake: 1,               // screen shake scale: 0 off, 0.5 reduced, 1 full
  flash: 1,               // pulsing and strobing: 1 full, 0.35 reduced, 0 steady
  uiScale: 1,             // instrument and text size: 0.85, 1, 1.2
  highContrast: false,    // heavier, colour-independent pad and threat marks
  keys: null,             // null = default bindings, else an action -> keys map
};

// Derived from the landing config so the HUD, the tilt gauge and the debug
// overlay always describe the same thresholds the grader actually uses.
export const ENVELOPE = {
  PERFECT: { vy: capsFor('vy').perfect, vx: capsFor('vx').perfect, tilt: capsFor('tilt').perfect, q: LANDING.quality.PERFECT },
  GOOD: { vy: capsFor('vy').safe, vx: capsFor('vx').safe, tilt: capsFor('tilt').safe, q: LANDING.quality.GOOD },
  HARD: { vy: capsFor('vy').crash, vx: capsFor('vx').crash, tilt: capsFor('tilt').crash, q: LANDING.quality.HARD },
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

  /** Apply a loadout: a derived spec, so a reloaded save cannot stack it twice. */
  applyLoadout(loadout) {
    const l = loadout || {};
    this.spec = {
      ...SHIP,
      thrust: SHIP.thrust * (l.thrust || 1),
      rcsAccel: SHIP.rcsAccel * (l.rcsAccel || 1),
      sideThrust: SHIP.sideThrust * (l.sideThrust || 1),
      burnMain: SHIP.burnMain * (l.burnMain || 1),
      burnRcs: SHIP.burnRcs * (l.burnRcs || 1),
      burnSide: SHIP.burnSide * (l.burnRcs || 1),
    };
    this.gearTier = l.gearTier || 1;
    this.restitution = l.restitution;
    this.impactResist = l.impactResist || 1;
    this.hullMax = Math.round(100 * (l.hullMax || 1));
    this.loadout = l;
    return this.spec;
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
    this.touchdown = null;
    this.landingResult = null;
    this.vyHistory = [];
    this.vxHistory = [];
    this.statusLevels = freshStatus();
    this.env = freshEnv();
    // Combat state. A mission with no enemies never touches any of it.
    this.shieldActive = false;
    this.shieldHp = 0;
    this.shieldHazard = false;
    this.anchor = 1;
    this.beaconBoost = 1;
    this.revealed = false;
    this.hitsTaken = 0;
    this.hitFlash = 0;
    this.lostToFire = false;
    if (!this.spec) this.applyLoadout(null);
    this.hull = this.hullMax;
  }

  /**
   * Take damage from anything that is not the ground: enemy fire, a ram, a
   * hazard that finally bites. A raised shield absorbs first and collapses when
   * its pool is gone, so the module buys a window rather than immunity.
   *
   * Returns { absorbed, damage, hull, destroyed }. It never touches thrust,
   * fuel or the controls - being shot must not take the aircraft away from the
   * pilot, only the margin.
   */
  damage(amount, source = 'hit') {
    // A wreck cannot be wrecked further: once the hull is gone the loss is
    // already decided, and counting more hits would double-report it.
    if (!this.alive || this.landed || this.hull <= 0 || amount <= 0) {
      return { absorbed: 0, damage: 0, hull: this.hull, destroyed: false };
    }
    let left = amount;
    let absorbed = 0;
    if (this.shieldActive && this.shieldHp > 0) {
      absorbed = Math.min(this.shieldHp, left);
      this.shieldHp -= absorbed;
      left -= absorbed;
      if (this.shieldHp <= 0) this.shieldActive = false;
    }
    if (left > 0) {
      this.hull = Math.max(0, this.hull - left);
      this.hitsTaken++;
      this.hitFlash = 0.45;
    }
    const destroyed = this.hull <= 0;
    if (destroyed) {
      this.lostToFire = source !== 'impact';
      this.damageSource = source;
    }
    return { absorbed, damage: left, hull: this.hull, destroyed };
  }

  /** Median of the recent samples, so one freak frame cannot define an impact. */
  static median(a) {
    if (!a.length) return 0;
    const b = [...a].sort((x, y) => x - y);
    const m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
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
  step(dt, input, level, terrain, t, settings = DEFAULT_SETTINGS) {
    if (!this.alive || this.landed) return null;
    this.input = input;
    if (this.touchdown) return this.settle(dt, level, terrain);

    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
    const hasFuel = this.fuel > 0;
    this.thrusting = input.thrust && hasFuel;
    this.rcsLeft = input.left && hasFuel;
    this.rcsRight = input.right && hasFuel;
    this.holding = input.hold && hasFuel && Math.abs(this.spin) > 0.02;
    this.direct = settings.steering === 'direct';

    let burn = 0;
    if (this.thrusting) burn += this.spec.burnMain;
    if (this.rcsLeft) burn += this.direct ? this.spec.burnSide : this.spec.burnRcs;
    if (this.rcsRight) burn += this.direct ? this.spec.burnSide : this.spec.burnRcs;
    if (this.holding && !this.direct) burn += this.spec.burnHold;
    this.fuel = Math.max(0, this.fuel - burn * dt);

    if (this.direct) {
      // DIRECT mode: the side thrusters translate instead of rotating, and the
      // hull holds itself upright. Left means left, with no attitude to fly.
      if (this.rcsLeft) this.vx -= this.spec.sideThrust * dt;
      if (this.rcsRight) this.vx += this.spec.sideThrust * dt;
      this.spin *= Math.pow(0.86, dt * 60);
      this.angle += this.spin * dt;
      this.angle -= this.angle * Math.min(1, dt * 7);   // ease back to level
      if (Math.abs(this.angle) < 0.002) this.angle = 0;
    } else {
      // CLASSIC mode: side burners are attitude control.
      const dir = settings.invertRotation ? -1 : 1;
      if (this.rcsLeft) this.spin -= this.spec.rcsAccel * dir * dt;
      if (this.rcsRight) this.spin += this.spec.rcsAccel * dir * dt;
      if (this.holding) {
        const damp = Math.sign(this.spin) * Math.min(Math.abs(this.spin), 6 * dt);
        this.spin -= damp;
      }
      this.spin = clamp(this.spin, -this.spec.maxSpin, this.spec.maxSpin);
      this.spin *= Math.pow(this.spec.spinDamp, dt * 60);
      this.angle += this.spin * dt;
    }

    // Linear
    const throttleTarget = this.thrusting ? 1 : 0;
    this.throttle += (throttleTarget - this.throttle) * Math.min(1, dt * 14);
    if (this.thrusting) {
      this.vx += this.noseX * this.spec.thrust * dt;
      this.vy += this.noseY * this.spec.thrust * dt;
    }
    this.vy += level.gravity * dt;

    applyForces(this, level, t, dt, terrain);

    // Short history of approach velocity, sampled before contact. The impact is
    // graded on the median of these, so a single anomalous frame - a collision
    // spike, a one-frame integration artefact - cannot manufacture a crash.
    this.vyHistory.push(this.vy);
    this.vxHistory.push(this.vx);
    if (this.vyHistory.length > 5) { this.vyHistory.shift(); this.vxHistory.shift(); }

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

    // First contact opens an aggregation window rather than deciding now.
    this.contact = { x: this.x, y: this.y };
    this.touchdown = {
      t: 0,
      vy: Ship.median(this.vyHistory.concat(this.vy)),
      vx: Ship.median(this.vxHistory.concat(this.vx)),
      tilt: normalizeAngle(this.angle),
      instantVy: this.vy,
      peakVy: Math.max(0, this.vy),
      bounces: 0,
      hull: false,
    };
    return null;
  }

  /**
   * The 150-250 ms after first contact. The gear compresses, the ship bounces,
   * slides and rights itself, and only then is the landing graded - so a single
   * physics spike cannot turn a good landing into a wreck.
   */
  settle(dt, level, terrain) {
    const td = this.touchdown;
    td.t += dt;

    // The gear owns the first moments of contact. After that, if the lander is
    // still travelling - which on ice it will be - control comes back, because
    // arresting a slide is the whole point of the surface.
    const sliding = td.t > LANDING.aggregationWindow &&
      Math.hypot(this.vx, this.vy) > LANDING.restSpeed;
    if (!sliding) {
      this.thrusting = false;
      this.rcsLeft = false;
      this.rcsRight = false;
      this.holding = false;
      this.throttle *= Math.pow(0.02, dt);
    } else if (this.input) {
      const hasFuel = this.fuel > 0;
      this.thrusting = this.input.thrust && hasFuel;
      this.rcsLeft = this.input.left && hasFuel;
      this.rcsRight = this.input.right && hasFuel;
      let burn = 0;
      if (this.thrusting) burn += this.spec.burnMain;
      if (this.rcsLeft || this.rcsRight) burn += this.spec.burnRcs;
      this.fuel = Math.max(0, this.fuel - burn * dt);
      this.throttle += ((this.thrusting ? 1 : 0) - this.throttle) * Math.min(1, dt * 14);
      if (this.thrusting) {
        this.vx += this.noseX * this.spec.thrust * dt;
        this.vy += this.noseY * this.spec.thrust * dt;
      }
      if (this.rcsLeft) this.spin -= this.spec.rcsAccel * 0.5 * dt;
      if (this.rcsRight) this.spin += this.spec.rcsAccel * 0.5 * dt;
    }

    this.vy += level.gravity * dt;
    if (level.drag) this.vx += ((this.windNow || 0) - this.vx) * level.drag * dt;
    else if (level.wind) this.vx += (this.windNow || 0) * dt;

    this.angle += this.spin * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (terrain.ceiling) {
      for (const pt of HULL_POINTS.concat(FEET)) {
        const w = this.toWorld(pt[0], pt[1]);
        if (w.y < terrain.ceilingAt(w.x)) { td.hull = true; return this.finishTouchdown(terrain); }
      }
    }
    for (const pt of HULL_POINTS) {
      const w = this.toWorld(pt[0], pt[1]);
      if (w.y >= terrain.heightAt(w.x)) { td.hull = true; this.contact = w; return this.finishTouchdown(terrain); }
    }

    // Gear contact response, per foot.
    const feet = this.feet();
    let contacts = 0;
    let deepest = 0;
    let contactLocalX = 0;
    feet.forEach((f, i) => {
      const g = terrain.heightAt(f.x);
      if (f.y >= g) {
        contacts++;
        deepest = Math.max(deepest, f.y - g);
        contactLocalX = FEET[i][0];
      }
    });

    if (contacts > 0) {
      this.y -= deepest;
      if (this.vy > 0) {
        td.peakVy = Math.max(td.peakVy, this.vy);
        // Only a real rebound counts as a bounce; micro-settling does not.
        if (this.vy > LANDING.restSpeed) td.bounces++;
        this.vy = -this.vy * (this.restitution != null ? this.restitution : LANDING.restitution);
        if (Math.abs(this.vy) < 4) this.vy = 0;
      }
      const surface = level.surfaceFriction != null ? level.surfaceFriction : 1;
      const cleats = ((this.loadout && this.loadout.gripBonus) || 1) * (this.anchor || 1);
      const grip = LANDING.groundFriction ** (surface * cleats);
      this.vx *= Math.pow(grip, dt);
      this.spin *= Math.pow(LANDING.spinDamp, dt * 60);
      if (contacts === 2) {
        // Both feet down: the gear rights the hull.
        const a = normalizeAngle(this.angle);
        this.angle -= a * Math.min(1, dt * 6);
        this.spin -= Math.sign(a) * Math.min(Math.abs(a) * LANDING.levelAssist, 4) * dt;
      } else {
        // One foot down: the ship pivots about it, as it would on a slope.
        this.spin -= Math.sign(contactLocalX) * level.gravity * 0.02 * dt;
      }
    }

    const speed = Math.hypot(this.vx, this.vy);
    const resting = contacts > 0 && speed < LANDING.restSpeed && Math.abs(this.spin) < 0.5;
    const maxSettle = LANDING.maxSettle / Math.max(0.2, level.surfaceFriction != null ? level.surfaceFriction : 1);
    if ((td.t >= LANDING.aggregationWindow && resting) || td.t >= maxSettle) {
      return this.finishTouchdown(terrain);
    }
    return null;
  }

  /** Grade the completed touchdown and decide land or crash. */
  finishTouchdown(terrain) {
    const td = this.touchdown;
    this.touchdown = null;

    const feet = this.feet();
    const padL = terrain.padAt(feet[0].x);
    const padR = terrain.padAt(feet[1].x);
    const onPad = !!(padL && padR && padL === padR);
    const pad = onPad ? padL : null;
    const centerFrac = pad
      ? Math.abs(this.x - (pad.x1 + pad.x2) / 2) / Math.max(1, (pad.x2 - pad.x1) / 2)
      : 1;
    const speed = Math.hypot(this.vx, this.vy);
    const stable = speed < LANDING.restSpeed && Math.abs(normalizeAngle(this.angle)) < capsFor('tilt').safe;

    const cfg = this.gearTier !== 1 ? { ...LANDING, gearTier: this.gearTier } : LANDING;
    const result = evaluateLanding({
      vy: td.vy, vx: td.vx, tilt: td.tilt,
      centerFrac, onPad, hullContact: td.hull, stable,
    }, cfg);
    this.landingResult = {
      ...result, onPad, centerFrac, bounces: td.bounces, settleTime: td.t,
      instantVy: td.instantVy, peakVy: td.peakVy,
    };

    if (result.grade === 'CRASH') return 'crash';

    if (pad && pad.fragile && td.vy > pad.fragile) {
      this.landingResult.grade = 'CRASH';
      this.landingResult.brokePad = true;
      this.landingResult.blocker =
        `The ice took ${(td.vy / 6).toFixed(1)} m/s and split — it holds ${(pad.fragile / 6).toFixed(1)}.`;
      return 'crash';
    }

    if (!onPad) {
      const slope = Math.abs(terrain.slopeAt(this.x));
      if (result.grade === 'HARD' || slope > LANDING.offPadMaxSlope) {
        this.landingResult.grade = 'CRASH';
        this.landingResult.blocker = slope > LANDING.offPadMaxSlope
          ? `Ground sloped ${(slope / DEG).toFixed(0)}° — too steep to hold the legs.`
          : 'Too hard an arrival to survive off the pad.';
        return 'crash';
      }
      this.offPad = true;
    } else {
      this.offPad = false;
    }
    this.pad = pad;
    this.quality = result.grade;

    // Field Patching returns some hull on every landing.
    const patch = (this.loadout && this.loadout.repairOnLanding) || 0;
    if (patch > 0) {
      const before = this.hull;
      this.hull = Math.min(this.hullMax, this.hull + Math.round(this.hullMax * patch));
      this.landingResult.hullRepaired = this.hull - before;
    }

    // A hard arrival is survivable but not free: it costs hull, and a lander
    // with no hull left does not fly again.
    if (result.grade === 'HARD' || this.offPad) {
      const over = Math.max(0, td.vy - capsFor('vy', cfg).safe);
      const damage = Math.round((8 + over * 0.9) * this.impactResist);
      this.hull = Math.max(0, this.hull - damage);
      this.landingResult.hullDamage = damage;
      this.landingResult.hullLeft = this.hull;
      if (this.hull <= 0) {
        this.landingResult.grade = 'CRASH';
        this.landingResult.blocker = 'The hull gave out on touchdown — nothing left to absorb it.';
        return 'crash';
      }
    }
    return 'land';
  }

  /** Live grade if the ship touched down right now - for the debug overlay. */
  verdict() {
    const r = evaluateLanding({
      vy: this.vy, vx: this.vx, tilt: normalizeAngle(this.angle),
      centerFrac: 0, onPad: true, hullContact: false, stable: false,
    });
    return r.grade === 'CRASH' ? null : r.grade;
  }

  /** Live envelope check for the HUD: which readouts are currently green. */
  status() {
    return {
      vy: this.vy <= capsFor('vy').safe,
      vx: Math.abs(this.vx) <= capsFor('vx').safe,
      tilt: Math.abs(normalizeAngle(this.angle)) <= capsFor('tilt').safe,
    };
  }

  /** Snap neatly onto the surface for the results pose. */
  restOnPad(terrain) {
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
