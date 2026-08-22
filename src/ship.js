// The lander: geometry, integration, collision and the landing verdict.

import { clamp, DEG } from './util.js';
import { LANDING, evaluateLanding, capsFor } from './landing.js';
import { applyForces, freshStatus, freshEnv } from './forces.js';
import { amountOf } from './input.js';

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

/**
 * **The two rotating steering modes.**
 *
 * Classic steering is acceleration control: a burner adds angular *momentum*,
 * and stopping a rotation means counter-burning for as long as you started it
 * for. That is the 1969 problem and it is the mode's whole character - but it is
 * also the single hardest thing in the game to learn, and the M29a/M29 logs show
 * it splitting a household: Ian flies it, Tom fights it.
 *
 * So it splits in two, and **the split is one behaviour, not a difficulty
 * slider**:
 *
 * - `pro` is the original law, **unchanged to the digit**. `spinCap: 1` and
 *   `idleDamp: null` make every line below evaluate exactly as it did, which is
 *   what keeps both fixtures regressing the M0 flight model.
 * - `classic` is *rate* control instead. Release both burners and the rotation
 *   stops within about half a second, so the lander holds the attitude you left
 *   it at rather than continuing to turn. You still have to point the nose and
 *   you still choose the angle; you no longer have to cancel your own momentum
 *   by hand.
 *
 * Deliberately **not** an angle spring. Auto-levelling to upright on release
 * would mean holding a burner and the booster together to translate at all,
 * which is a different game and is most of the way to DIRECT - and DIRECT
 * already exists for players who want it. Attitude persists here; only the
 * *rate* is tamed.
 */
export const STEERING = {
  // spinCap multiplies SHIP.maxSpin (so a future component that raises it still
  // works); idleDamp is the per-1/60s decay applied only while neither burner
  // is held, and only when it damps harder than the ship's own spinDamp - so
  // the Gyro Stabilizer's 0.985 is never made worse by it.
  classic: { spinCap: 0.56, idleDamp: 0.90 },
  pro: { spinCap: 1, idleDamp: null },
};

/**
 * Every value `settings.steering` may hold. Exported so the save layer, the
 * settings screen and the tests all read one list - a mode added here and
 * forgotten in `save.js` would load, work for one session, and be silently
 * reset to the default on the next launch, which is the worst kind of bug to
 * hand the one player who chose the non-default mode.
 */
export const STEERING_MODES = ['classic', 'pro', 'direct'];

export const DEFAULT_SETTINGS = {
  // 'classic' = burners rotate, rotation settles on release
  // 'pro'     = burners rotate, momentum is yours to cancel (the original law)
  // 'direct'  = burners translate, the hull holds itself upright
  steering: 'classic',
  invertRotation: false,  // both rotating modes: swap which burner spins which way
  // Accessibility. None of these touch the simulation - they change how it is
  // presented, which is the point: the flight model must feel the same to
  // everyone, and only the presentation should have to adapt.
  shake: 1,               // screen shake scale: 0 off, 0.5 reduced, 1 full
  flash: 1,               // pulsing and strobing: 1 full, 0.35 reduced, 0 steady
  uiScale: 1,             // instrument and text size: 0.85, 1, 1.2
  highContrast: false,    // heavier, colour-independent pad and threat marks
  keys: null,             // null = default bindings, else an action -> keys map
};

/**
 * The landing envelope **for a given gear tier**, derived from the landing
 * config so the instruments describe the thresholds the grader actually uses.
 *
 * The tier argument is the whole point and it was missing. `ENVELOPE` was a
 * module-level constant baked at `gearTier: 1`, and every instrument read it:
 * the F4 bars, the tilt cone, the sink-rate warning and the brief. But the
 * grader evaluates against `capsFor(axis, { ...LANDING, gearTier })`, and gear
 * runs to 1.40 with another 0.32 from the skill tree - so a player in full
 * landing gear was **graded GOOD at 37.8 px/s while every readout drew 22.0**,
 * a 72% understatement of the equipment they had bought.
 *
 * That is this project's oldest fault in a new place: a thing sold and not
 * delivered (the Gyro Stabilizer, `hazardLead`), an instrument that drifted
 * from the rule it describes (`__settleNow`, the autopilot), and a comment
 * asserting the opposite of the truth. The envelope belongs to the lander now,
 * and `ENVELOPE` is what a *stock* one is graded against - which is all the
 * briefing copy and the fixtures ever wanted.
 */
export function envelopeFor(gearTier = 1) {
  const cfg = gearTier !== 1 ? { ...LANDING, gearTier } : LANDING;
  return {
    PERFECT: { vy: capsFor('vy', cfg).perfect, vx: capsFor('vx', cfg).perfect, tilt: capsFor('tilt', cfg).perfect, q: LANDING.quality.PERFECT },
    GOOD: { vy: capsFor('vy', cfg).safe, vx: capsFor('vx', cfg).safe, tilt: capsFor('tilt', cfg).safe, q: LANDING.quality.GOOD },
    HARD: { vy: capsFor('vy', cfg).crash, vx: capsFor('vx', cfg).crash, tilt: capsFor('tilt', cfg).crash, q: LANDING.quality.HARD },
  };
}

/** The stock envelope: what a lander with no gear fitted is graded against. */
export const ENVELOPE = envelopeFor(1);

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
      // The Gyro Stabilizer's second half. It declared `spinDampBonus` from
      // M11 and nothing ever read it, so half of what the module advertises
      // ("resists the rotation gusts put into the hull") did not exist.
      spinDamp: l.spinDampBonus != null ? l.spinDampBonus : SHIP.spinDamp,
    };
    this.gearTier = l.gearTier || 1;
    // Cached rather than derived per read: the HUD asks for this every frame,
    // and it can only change when a loadout is applied.
    this.envelope = envelopeFor(this.gearTier);
    this.restitution = l.restitution;
    this.impactResist = l.impactResist || 1;
    this.hullMax = Math.round(100 * (l.hullMax || 1));
    this.loadout = l;
    return this.spec;
  }

  /**
   * The tank this lander starts a mission with.
   *
   * `level.fuel` is what the mission authors; `fuelCapacity` is what the engine
   * track and the Reserve Tank skill add on top. That multiply was open-coded
   * in `main.js` and in the loadout rig, and **missing from `flyMission`** - so
   * every sweep ever flown with `opts.loadout` flew a bigger engine on a stock
   * tank, and the one skill whose whole effect is the tank could not move a
   * flown mission at all. One rule, one implementation, three callers.
   */
  tankFor(missionFuel) {
    return Math.round(missionFuel * ((this.loadout && this.loadout.fuelCapacity) || 1));
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
    // **Hazard multipliers on the ship's own authority**, both written by
    // forces and both reset by `applyForces` every step, so a body without the
    // hazard cannot inherit one. Heat derates the engine; cold stiffens the
    // attitude thrusters. They are read here rather than folded into `spec`
    // because `spec` is the *derived loadout* and must not move under a hazard -
    // that is the M10 rule that stops a reloaded save stacking an upgrade.
    this.thermalDerate = 1;
    this.rcsStiffness = 1;
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
    this.hullBurn = 0;
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
  /**
   * Continuous damage from the environment rather than from a hit.
   *
   * Deliberately not `damage()`: that counts a hit, flashes the hull hard and
   * feeds the threat statistics, none of which is true of standing in a
   * radiation sweep. A shield still absorbs it first, which is what makes the
   * Ray Shield worth its slot on Europa.
   */
  damageOverTime(amount, source = 'hazard') {
    if (!this.alive || this.landed || this.hull <= 0 || amount <= 0) return 0;
    let left = amount;
    if (this.shieldActive && this.shieldHp > 0) {
      const absorbed = Math.min(this.shieldHp, left);
      this.shieldHp -= absorbed;
      left -= absorbed;
      if (this.shieldHp <= 0) this.shieldActive = false;
    }
    if (left <= 0) return 0;
    this.hull = Math.max(0, this.hull - left);
    this.hullBurn = 0.6;                 // a slow glow, not the hit flash
    if (this.hull <= 0) {
      this.lostToFire = false;
      this.damageSource = source;
    }
    return left;
  }

  damage(amount, source = 'hit', opts = {}) {
    // A wreck cannot be wrecked further: once the hull is gone the loss is
    // already decided, and counting more hits would double-report it.
    if (!this.alive || this.landed || this.hull <= 0 || amount <= 0) {
      return { absorbed: 0, damage: 0, hull: this.hull, destroyed: false };
    }
    // **A raised Ray Shield stops a lethal round, and dies doing it** (Tom's
    // call, M29h). It shipped blowing straight through, which followed from
    // "one shot one kill" read literally and made the shield worthless against
    // the one thing in the game worth raising it for.
    //
    // The shield is spent completely rather than debited: a lethal hit is not a
    // quantity, so there is no sensible amount to subtract. That keeps both
    // halves true - the round is survivable exactly once per charge, and it is
    // still the only thing in the game a hull upgrade cannot answer.
    if (opts.lethal && this.shieldActive && this.shieldHp > 0) {
      const absorbed = this.shieldHp;
      this.shieldHp = 0;
      this.shieldActive = false;
      this.hitsTaken++;
      this.hitFlash = 0.45;
      return { absorbed, damage: 0, hull: this.hull, destroyed: false, shieldBroke: true };
    }
    // **A lethal hit is a property, not a big number.** The Mast Sniper kills
    // in one shot whatever is fitted, and writing that as `damage: 999` would
    // be a figure that silently stops being true the day a Hull L5 exists -
    // the same class of fault M24 and M28 each found in an assertion. So it is
    // asked for by name and costed here, against whatever is actually in the
    // way: the hull, plus a raised shield if there is one.
    let left = opts.lethal ? this.hull : amount;
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
    if (this.hullBurn > 0) this.hullBurn = Math.max(0, this.hullBurn - dt);
    const hasFuel = this.fuel > 0;
    // What the pilot is asking for, as a magnitude rather than a switch. A key
    // answers 1 or 0; a trigger answers anything between. The flight model does
    // not fork on which - it multiplies, and 1.0 multiplies to nothing.
    const throttleIn = hasFuel ? amountOf(input, 'thrust') : 0;
    const leftIn = hasFuel ? amountOf(input, 'left') : 0;
    const rightIn = hasFuel ? amountOf(input, 'right') : 0;
    // The three flags stay *booleans* derived from the magnitudes, because a
    // dozen consumers read them - audio, particles, the HUD, thermal, the gear
    // cue, the debug overlay - and not one of them wants a float.
    this.thrusting = throttleIn > 0;
    this.rcsLeft = leftIn > 0;
    this.rcsRight = rightIn > 0;
    this.holding = amountOf(input, 'hold') > 0 && hasFuel && Math.abs(this.spin) > 0.02;
    this.direct = settings.steering === 'direct';

    // Partial throttle costs proportionally less. Holding attitude is a button
    // and not an axis, so it costs what it always did.
    let burn = 0;
    if (this.thrusting) burn += this.spec.burnMain * throttleIn;
    if (this.rcsLeft) burn += (this.direct ? this.spec.burnSide : this.spec.burnRcs) * leftIn;
    if (this.rcsRight) burn += (this.direct ? this.spec.burnSide : this.spec.burnRcs) * rightIn;
    if (this.holding && !this.direct) burn += this.spec.burnHold;
    this.fuel = Math.max(0, this.fuel - burn * dt);

    // Cold soak stiffens attitude control and heat derates the engine. Both are
    // 1 unless a force on this level says otherwise, and both lag the force by
    // one substep (1/120 s) because forces are applied at the end of the step -
    // deterministic, and far below anything a player or a fixture can see.
    const rcsAuth = this.spec.rcsAccel * this.rcsStiffness;
    const sideAuth = this.spec.sideThrust * this.rcsStiffness;
    const mainThrust = this.spec.thrust * this.thermalDerate;

    if (this.direct) {
      // DIRECT mode: the side thrusters translate instead of rotating, and the
      // hull holds itself upright. Left means left, with no attitude to fly.
      if (this.rcsLeft) this.vx -= sideAuth * leftIn * dt;
      if (this.rcsRight) this.vx += sideAuth * rightIn * dt;
      this.spin *= Math.pow(0.86, dt * 60);
      this.angle += this.spin * dt;
      this.angle -= this.angle * Math.min(1, dt * 7);   // ease back to level
      if (Math.abs(this.angle) < 0.002) this.angle = 0;
    } else {
      // CLASSIC mode: side burners are attitude control.
      const dir = settings.invertRotation ? -1 : 1;
      if (this.rcsLeft) this.spin -= rcsAuth * dir * leftIn * dt;
      if (this.rcsRight) this.spin += rcsAuth * dir * rightIn * dt;
      if (this.holding) {
        const damp = Math.sign(this.spin) * Math.min(Math.abs(this.spin), 6 * dt);
        this.spin -= damp;
      }
      // Which rotating mode this is. `pro` is `{ spinCap: 1, idleDamp: null }`,
      // so both lines below reduce to exactly the arithmetic they had before
      // the split - that identity is what the physics fixture proves.
      const mode = STEERING[settings.steering] || STEERING.classic;
      this.spin = clamp(this.spin, -this.spec.maxSpin * mode.spinCap, this.spec.maxSpin * mode.spinCap);
      // The rate tamer: harder decay while neither burner is held, so letting
      // go stops the rotation instead of leaving it running.
      //
      // **Composed with the ship's own damping, not maxed against it.** The
      // first version took `Math.min`, and 0.90 is stronger than the Gyro
      // Stabilizer's 0.985 - so on the default steering mode the gyro's whole
      // spin-damping half did nothing, and a module the player had bought and
      // equipped was silently inert. That is the `hazardLead` fault (a thing
      // sold and not delivered), and `loadout-tests.js` caught it on the first
      // run. Multiplying keeps the gyro worth fitting in both modes and leaves
      // `pro` exactly as it was, since its `idleDamp` is null.
      const idle = mode.idleDamp != null && !this.rcsLeft && !this.rcsRight;
      const spinDamp = idle ? this.spec.spinDamp * mode.idleDamp : this.spec.spinDamp;
      this.spin *= Math.pow(spinDamp, dt * 60);
      this.angle += this.spin * dt;
    }

    // Linear
    this.throttle += (throttleIn - this.throttle) * Math.min(1, dt * 14);
    if (this.thrusting) {
      this.vx += this.noseX * mainThrust * throttleIn * dt;
      this.vy += this.noseY * mainThrust * throttleIn * dt;
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

    // First contact opens an aggregation window rather than deciding now -
    // unless the impact is already past saving. The window exists so a
    // one-frame speed spike cannot fail a good approach; it was never meant to
    // let a lander arriving at twice the crash limit bounce twice before it
    // admits what happened. Anything beyond the crash cap on its own axis ends
    // here, on the frame it touched.
    const cfg0 = this.gearTier !== 1 ? { ...LANDING, gearTier: this.gearTier } : LANDING;
    const medVy = Ship.median(this.vyHistory.concat(this.vy));
    const medVx = Ship.median(this.vxHistory.concat(this.vx));
    const fatal = medVy > capsFor('vy', cfg0).crash
      || Math.abs(medVx) > capsFor('vx', cfg0).crash
      || Math.abs(normalizeAngle(this.angle)) > capsFor('tilt', cfg0).crash;
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
    if (fatal) {
      this.touchdown.fatal = true;
      return this.finishTouchdown(terrain);
    }
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

    // Flying away cancels the landing. On a low-friction body the window can
    // stay open for seconds while the lander slides, and control is handed back
    // during that time - so a player could take off, cross half the map, and
    // have the mission resolve underneath them. If the gear is clear of the
    // ground and climbing, this was not a landing.
    const clearance = terrain.heightAt(this.x) - this.y;
    if (clearance > LANDING.abortHeight && this.vy < 0) {
      this.touchdown = null;
      this.contact = null;
      return null;
    }

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
      const throttleIn = hasFuel ? amountOf(this.input, 'thrust') : 0;
      const leftIn = hasFuel ? amountOf(this.input, 'left') : 0;
      const rightIn = hasFuel ? amountOf(this.input, 'right') : 0;
      this.thrusting = throttleIn > 0;
      this.rcsLeft = leftIn > 0;
      this.rcsRight = rightIn > 0;
      let burn = 0;
      if (this.thrusting) burn += this.spec.burnMain * throttleIn;
      // One charge for the attitude thrusters however many are lit, which is
      // what this line has always said; the harder-held of the two sets it.
      if (this.rcsLeft || this.rcsRight) burn += this.spec.burnRcs * Math.max(leftIn, rightIn);
      this.fuel = Math.max(0, this.fuel - burn * dt);
      this.throttle += (throttleIn - this.throttle) * Math.min(1, dt * 14);
      if (this.thrusting) {
        this.vx += this.noseX * this.spec.thrust * this.thermalDerate * throttleIn * dt;
        this.vy += this.noseY * this.spec.thrust * this.thermalDerate * throttleIn * dt;
      }
      if (this.rcsLeft) this.spin -= this.spec.rcsAccel * this.rcsStiffness * 0.5 * leftIn * dt;
      if (this.rcsRight) this.spin += this.spec.rcsAccel * this.rcsStiffness * 0.5 * rightIn * dt;
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
      // Gear levels 3 and 4 sell "better hold on a slope" and `slopeGrip` was
      // never read, so they sold nothing. It scales with how steep the ground
      // actually is, so it earns its name instead of being a second flat grip
      // bonus: level ground is unaffected, a real slope is where it shows.
      const steep = Math.min(1, Math.abs(terrain.slopeAt(this.x)) / LANDING.offPadMaxSlope);
      const slopeHold = 1 + (((this.loadout && this.loadout.slopeGrip) || 1) - 1) * steep;
      const cleats = ((this.loadout && this.loadout.gripBonus) || 1) * (this.anchor || 1) * slopeHold;
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
    // Ice gets longer to come to rest, but not unboundedly: dividing by
    // Europa's 0.07 friction gave a 7.5 s pending touchdown, which is what let
    // a landing resolve long after the player had given up on it and flown off.
    const friction = level.surfaceFriction != null ? level.surfaceFriction : 1;
    const stretch = Math.min(LANDING.maxSettleStretch, 1 / Math.max(0.2, friction));
    const maxSettle = LANDING.maxSettle * stretch;
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
