import { clamp } from './util.js';
import { sanctuaryPad } from './enemies.js';

// Environmental forces and status effects (roadmap section 14: "hazards should
// apply explicit forces/status effects through a shared interface").
//
// A force reads the ship and the clock and applies acceleration, or raises a
// status level. Missions list hazards by name; nothing in the flight loop knows
// what a planet is. Every force is a pure function of (ship, level, t), so the
// same seed and the same inputs always reproduce the same flight.

/**
 * How much of a hazard actually reaches the ship on one channel. Skills and
 * modules reduce it; a raised Ray Shield reduces it a great deal, but only on
 * the channels that shield covers. Every force asks this rather than reaching
 * into the loadout itself, so a new mitigation has one place to land.
 */
/**
 * Which loadout key answers which status channel.
 *
 * `hazardResist` answers every channel; a **per-channel** key answers one. That
 * is the difference between Environmental Seals, which is general, and the
 * Ablative Acid Skin, which is Venus' answer and does nothing about cold.
 *
 * **Written out rather than built as `channel + 'Resist'`.** The concatenated
 * version worked and was invisible: `loadout-tests.js` searches the source for
 * every key the game sells, and a name that is assembled at runtime appears
 * nowhere, so two new passives read as hollow to the guard that exists to catch
 * hollow things. A table can also be asserted complete, which a template
 * literal cannot - `forces-tests.js` requires an entry per `STATUS_CHANNELS`
 * and requires each one to actually slow its own channel.
 */
export const CHANNEL_RESIST = {
  heat: 'heatResist',
  cold: 'coldResist',
  corrosion: 'corrosionResist',
  radiation: 'radiationResist',
  charge: 'chargeResist',
};

export function hazardScale(ship, channel) {
  const l = (ship && ship.loadout) || {};
  const key = CHANNEL_RESIST[channel];
  const base = (l.hazardResist || 1) * ((key && l[key]) || 1);
  if (!ship.shieldActive) return base;
  const covered = channel === 'radiation' || ship.shieldHazard;
  return covered ? base * (ship.shieldFactor != null ? ship.shieldFactor : 0.15) : base;
}

/**
 * When exposure stops being a readout and starts being damage. Below `bite` the
 * only consequence is instrument noise, which gives the player a warning they
 * can act on before anything is lost.
 */
/**
 * The boundary layer. `floor` is how much of the gust survives at ground level,
 * `fullAt` is the altitude above which it blows at full strength.
 */
export const GUST = { floor: 0.32, fullAt: 260 };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const RADIATION = {
  bite: 55,             // exposure % at which it stops warning and starts biting
  // Hull per second at full exposure, unsheltered. Tripled on Tom's note
  // (2026-08-21): at 2.5 the sweep was survivable by ignoring it, which made
  // the terrain shadow and the Ray Shield both optional.
  hullPerSecond: 7.5,
  floor: 0.45,          // it will never take you below this fraction of the hull
  /**
   * **Radiation lives in the sky.** Above this many pixels of altitude the sweep
   * reaches you; below it you are under the belt and it decays.
   *
   * Tom asked for it "only in high altitude - around half of the top screen",
   * and that turns the hazard into a *descent* problem: the sweep prices
   * loitering on the way in, and getting low is the answer. It also gives the
   * thing a shape a player can see, which is the other half of the same note -
   * a hazard that is only a gauge is a hazard nobody can learn.
   */
  minAltitude: 420,
  /** How far above `minAltitude` the sweep reaches full strength. */
  falloff: 160,
};

/**
 * **Engine heat, and why it is not radiation with a different label.**
 *
 * Radiation eats hull; heat takes *thrust*. Mercury's own summary has said
 * "engine heat is the real fuel gauge" since M5, and a gauge that only goes up
 * is the thing M29a's radiation note was about. Past `bite` the engine derates,
 * so a long burn is a decision with a price and the answer is pacing rather
 * than armour. It recovers the moment you stop burning, so it is never a
 * one-way trip to a crash.
 */
export const HEAT = { bite: 60, minThrust: 0.55 };

/**
 * Cold soak. The third consequence, deliberately different again: heat costs
 * power and radiation costs hull, so cold costs **control** - the attitude
 * thrusters stiffen and the lander answers late. It builds while you coast and
 * is held off by burning, which makes a slow, fuel-saving descent the expensive
 * one on Pluto and a committed one cheap.
 */
export const COLD = { bite: 55, minRcs: 0.45 };

/**
 * Venus' air. Corrosion is the mirror of radiation and that is the whole point
 * of putting it on the other end of the ladder: radiation lives high and comes
 * in sweeps, so you get low and wait it out; acid is **thickest at the deck**
 * and never stops, so on Venus loitering low is what kills you. Two bodies,
 * opposite instincts, one status channel each.
 */
export const ACID = { bite: 45, hullPerSecond: 6, floor: 0.5, thickBelow: 300 };

/**
 * Ganymede's field. It raises `charge`, and charge does two things a player can
 * feel: it puts a slow torque into the hull, and past `bite` it drags the
 * lander toward the ground it is anchored in. The instruments lying is the
 * other half of the body and is a separate force, because one is physics and
 * one is presentation and they must never be the same code.
 */
export const MAGNETIC = { bite: 50, pull: 12, torque: 0.9 };

/** Status channels a hazard can raise. */
export const STATUS_CHANNELS = ['heat', 'cold', 'corrosion', 'radiation', 'charge'];

export function freshStatus() {
  const s = {};
  for (const k of STATUS_CHANNELS) s[k] = 0;
  return s;
}

/**
 * How hard the weather is to see through. M24: Tom asked for visibility "300%
 * more challenging", and challenge is the *obscured* fraction, not the visible
 * one - tripling obscuration takes Mars' 22% storm floor to near-blind while
 * leaving Luna's vacuum exactly as clear as it was. Dividing visibility instead
 * would have fogged an airless body, which is not weather, it is a bug.
 *
 * The floor exists because fully blind is not difficulty, it is a coin toss:
 * the pad beacons and the ore crates still draw above the haze (M18/M22), so a
 * player always has a target even when the ground is gone.
 */
export const VISIBILITY = {
  challenge: 3,
  floor: 0.05,
};

/**
 * Apply the challenge multiplier to a raw visibility in 0..1.
 *
 * `v ** challenge`, not `1 - (1 - v) * challenge`. The first version tripled the
 * *obscured* fraction linearly, which saturates: anything already below 0.67
 * clamps to the floor, and four of the five Mars missions came out at exactly
 * the same near-blind number. THE STORM EYE and BURIED ARRAY were authored two
 * stops apart and measured identical, which throws away the content.
 *
 * Exponentiating is both better behaved and the physically right answer -
 * transmission through a medium falls exponentially with its depth, so three
 * times the dust in the air *is* v³. It is monotonic, so the ordering the
 * missions were authored in survives; it leaves a vacuum at exactly 1.0; and it
 * needs the floor only for the two deepest storms instead of for most of Mars.
 */
export function obscure(v) {
  return clamp(Math.pow(clamp(v, 0, 1), VISIBILITY.challenge), VISIBILITY.floor, 1);
}

/**
 * The worst visibility a mission ever reaches, after the challenge multiplier.
 *
 * Worth knowing: `dust` *overwrites* visibility rather than combining with the
 * planet's, so on a body with weather the planet's own figure never applies -
 * the storm floor is the only number that matters, and between fronts the air
 * goes fully clear. That is longstanding behaviour and is left alone here; this
 * helper exists so the playtest log records what a mission actually flies at
 * its worst rather than a base value that a storm overrides.
 */
export function worstVisibility(level) {
  let worst = obscure(level.visibility != null ? level.visibility : 1);
  for (const h of level.hazards || []) {
    const spec = hazardSpec(h);
    if (spec.type !== 'dust') continue;
    worst = Math.min(worst, obscure(spec.minVisibility != null ? spec.minVisibility : 0.35));
  }
  return worst;
}

/** Environment readings a force can write and the renderer/HUD can read. */
export function freshEnv() {
  return {
    visibility: 1, dust: 0, darkness: 0,
    radiationSweep: 0, radiationBand: 0, radiationReach: 0, shielded: false,
    // M29 channels. Each is written by one force and read by the renderer or
    // the HUD; none of them is read back by the simulation, except `magnetic`,
    // which `falseRadar` reads to decide where the lie is worst.
    lift: 0, acid: 0, downdraft: 0, magnetic: 0, instrumentError: 0,
    plumes: null, eruptions: null, anomalies: null, downColumns: null,
  };
}

/**
 * Atmosphere: steady wind with two gust harmonics, plus drag toward the moving
 * air mass. This is the behaviour the game already had, moved behind the
 * interface unchanged - the arithmetic and its order are deliberately identical
 * so the flight model does not drift.
 */
function atmosphere(cfg) {
  const wind = cfg.wind || 0;
  const gust = cfg.gust || 0;
  const drag = cfg.drag || 0;
  return {
    id: 'atmosphere',
    apply(ship, level, t, dt, terrain) {
      // Inertial dampers and the gyro passive settle the gust component, not
      // the steady wind - you still have to fly the weather.
      const damp = (ship.loadout && ship.loadout.disturbanceResist) || 1;
      // Gusts fall off near the surface.
      //
      // Scaling the gust up until you can feel it made the *crossing* exciting
      // and the touchdown a lottery: the last hundred pixels are where a metre
      // per second of drift decides the grade, and a full-strength gust there
      // is not difficulty, it is noise. A boundary layer is also simply what
      // wind does. The crossing keeps the whole gust; the deck keeps a third.
      const alt = terrain ? Math.max(0, terrain.heightAt(ship.x) - ship.y) : GUST.fullAt;
      const shear = GUST.floor + (1 - GUST.floor) * clamp01(alt / GUST.fullAt);
      const g2 = gust * damp * shear;
      const w = wind + Math.sin(t * 0.7) * g2 + Math.sin(t * 1.9 + 1.3) * g2 * 0.4;
      ship.windNow = w;
      // A deployed Aero-Brake Foil is more surface in the same air. Note it
      // multiplies `drag` rather than adding to it, so on an airless body it
      // multiplies zero - which is the spec's "poor in vacuum" falling out of
      // the arithmetic instead of being a special case somebody has to write.
      const d = drag * (ship.airBrake || 1);
      if (d) {
        ship.vx += (w - ship.vx) * d * dt;
        ship.vy += (0 - ship.vy) * d * 0.5 * dt;
      } else {
        ship.vx += w * dt;
      }
    },
  };
}

/**
 * Engine heat: rises while burning, falls otherwise, and **derates the engine**
 * past `HEAT.bite`. Mercury and Io read this.
 *
 * Built in M5 and, until M29, produced by nothing at all: both bodies declare
 * the hazard as `'heat'` and the builder is keyed `thermal`, so it was the
 * `plume`/`plumes` fault a second and third time. Mercury and Io had no working
 * hazard whatsoever. The alias is in `BUILDERS`; the derate is what stops the
 * fix being a gauge that goes up and costs nothing.
 */
function thermal(cfg) {
  const rise = cfg.heatRise != null ? cfg.heatRise : 14;
  const fall = cfg.heatFall != null ? cfg.heatFall : 9;
  const bite = cfg.heatBite != null ? cfg.heatBite : HEAT.bite;
  const minThrust = cfg.minThrust != null ? cfg.minThrust : HEAT.minThrust;
  return {
    id: 'thermal',
    apply(ship, level, t, dt) {
      const s = ship.statusLevels;
      const res = hazardScale(ship, 'heat');
      s.heat = Math.max(0, Math.min(100, s.heat + (ship.thrusting ? rise * res : -fall) * dt));
      const over = clamp01((s.heat - bite) / (100 - bite));
      ship.thermalDerate = 1 - (1 - minThrust) * over;
    },
  };
}

/**
 * Ambient cold: builds continuously, slowed by burning, and **stiffens the
 * attitude thrusters** past `COLD.bite`. Pluto reads this.
 *
 * Same history as `thermal` - Pluto declares `'cold'`, the builder is keyed
 * `cryo`, and so cold soak had never once been applied to a lander.
 */
function cryo(cfg) {
  const rate = cfg.coldRate != null ? cfg.coldRate : 6;
  const bite = cfg.coldBite != null ? cfg.coldBite : COLD.bite;
  const minRcs = cfg.minRcs != null ? cfg.minRcs : COLD.minRcs;
  return {
    id: 'cryo',
    apply(ship, level, t, dt) {
      const s = ship.statusLevels;
      const res = hazardScale(ship, 'cold');
      s.cold = Math.max(0, Math.min(100, s.cold + (ship.thrusting ? rate * 0.3 : rate) * res * dt));
      const over = clamp01((s.cold - bite) / (100 - bite));
      ship.rcsStiffness = 1 - (1 - minRcs) * over;
    },
  };
}

/**
 * **Body lift.** Titan is thick air at a seventh of a g, and its own summary has
 * promised "you glide, and you overshoot" since M5 while the hazard behind it
 * (`'glide'`) had no builder. This is the builder: horizontal speed makes lift,
 * so crossing fast floats you, and the way down is to slow down first.
 *
 * Quadratic in speed and capped, because lift that grows without limit turns a
 * fast crossing into a launch. The cap is the interesting part of the mechanic
 * anyway - it is a terminal glide slope, not an ejection seat.
 */
function glide(cfg) {
  const lift = cfg.lift != null ? cfg.lift : 0.00055;
  const cap = cfg.liftCap != null ? cfg.liftCap : 26;
  return {
    id: 'glide',
    apply(ship, level, t, dt) {
      const damp = (ship.loadout && ship.loadout.disturbanceResist) || 1;
      // **Control surfaces buy authority, not lift.** Stock, the only thing
      // that decides how much the air holds you up is how fast you are going,
      // and Titan's own summary has promised "you glide, and you overshoot"
      // since M5. With a foil the attitude counts too: flare away from the
      // direction of travel and it bites, tip into it and it sheds.
      //
      // **The trim term** is zero without a foil and zero at a level nose, so
      // it is authority rather than a bonus: what it is worth depends entirely
      // on how you fly it. Measured live on titan-5 at 120 px/s - 5.10 flared,
      // 3.91 level, 2.72 tipped forward.
      //
      // Note that a foil is not *only* its trim. `damp` above is the same
      // disturbance resistance a gyro carries, and it scales the raw lift too,
      // so the Control Surfaces trim about 15% off the float before the
      // attitude term does anything. That is the module, not the trim, and it
      // is stated on the module rather than pretended away here.
      const trim = (ship.loadout && ship.loadout.glideTrim) || 0;
      const pitch = trim
        ? clamp(-Math.sin(ship.angle) * Math.sign(ship.vx || 1), -1, 1)
        : 0;
      // The foil's second consequence, and it is one surface rather than two
      // dials: what drags also spoils. Deploying it on Titan is how you stop
      // floating, which is the half of "glide control" the trim does not cover.
      const up = Math.min(cap, lift * ship.vx * ship.vx) * damp * (1 + trim * pitch)
        / (ship.airBrake || 1);
      ship.vy -= up * dt;
      ship.env.lift = up;
    },
  };
}

/**
 * **Acid haze.** Corrosion builds everywhere in Venus' air and builds fastest at
 * the deck, then eats hull past `ACID.bite` down to a floor - the same shape as
 * radiation and deliberately the opposite geometry, so the two bodies teach
 * opposite instincts. Radiation: get low. Acid: do not loiter low.
 *
 * The floor is the M18 rule and it is not negotiable: a hazard that can finish
 * you on its own turns a route the map is built to tempt you down into the
 * route that kills you however well it was flown.
 */
function acid(cfg) {
  const rate = cfg.acidRate != null ? cfg.acidRate : 9;
  const bite = cfg.acidBite != null ? cfg.acidBite : ACID.bite;
  const thickBelow = cfg.thickBelow != null ? cfg.thickBelow : ACID.thickBelow;
  const perSecond = cfg.acidHull != null ? cfg.acidHull : ACID.hullPerSecond;
  return {
    id: 'acid',
    apply(ship, level, t, dt, terrain) {
      const alt = terrain ? Math.max(0, terrain.heightAt(ship.x) - ship.y) : thickBelow;
      // Twice as aggressive on the deck as it is well above it.
      const thickness = 1 + (1 - clamp01(alt / thickBelow));
      const res = hazardScale(ship, 'corrosion');
      const s = ship.statusLevels;
      s.corrosion = Math.min(100, s.corrosion + rate * thickness * res * dt);
      ship.env.acid = clamp01(s.corrosion / 100);
      if (s.corrosion > bite && ship.damageOverTime) {
        const floor = ship.hullMax * ACID.floor;
        const room = ship.hull - floor;
        if (room > 0) {
          const over = (s.corrosion - bite) / (100 - bite);
          ship.damageOverTime(Math.min(room, perSecond * over * dt), 'acid');
        }
      }
    },
  };
}

/**
 * **Downdrafts.** Columns of sinking air at fixed places on the map, on a cycle.
 * Venus' other hollow hazard, and the one that makes its dense air a *place*
 * rather than a global number: the map has spots you must not be slow over.
 *
 * Positions are fractions of the map width so a mission authors them without
 * knowing how wide the terrain came out, and they are published on `env` so the
 * renderer can draw the column. Drawing it is the M29a rule - if a hazard has a
 * boundary, the player gets to see the boundary.
 */
function downdraft(cfg) {
  const columns = cfg.columns || [];
  const width = cfg.width || 3000;
  const force = cfg.downForce != null ? cfg.downForce : 62;
  const radius = cfg.downRadius != null ? cfg.downRadius : 190;
  const period = cfg.downPeriod != null ? cfg.downPeriod : 11;
  const duty = cfg.downDuty != null ? cfg.downDuty : 0.5;
  const spec = columns.map((c, i) => (typeof c === 'number'
    ? { x: c * width, offset: i / Math.max(1, columns.length) }
    : { x: (c.atX != null ? c.atX * width : c.x), offset: c.offset != null ? c.offset : i / Math.max(1, columns.length),
        force: c.force, radius: c.radius }));
  return {
    id: 'downdraft',
    apply(ship, level, t, dt, terrain) {
      let strongest = 0;
      const live = [];
      for (const c of spec) {
        if (!offSanctuary(terrain, c.x, c.radius || radius)) continue;
        live.push(c);
        const phase = (t / period + c.offset) % 1;
        if (phase > duty) continue;
        const dx = ship.x - c.x;
        const r = c.radius || radius;
        if (Math.abs(dx) > r) continue;
        // Smooth in the cycle and across the column, so the edge of one is a
        // shove rather than a wall.
        const swell = Math.sin((phase / duty) * Math.PI);
        const across = 1 - Math.abs(dx) / r;
        const damp = (ship.loadout && ship.loadout.disturbanceResist) || 1;
        const f = (c.force || force) * swell * across * damp;
        ship.vy += f * dt;
        // Sinking air drags sideways toward the core as well as down.
        ship.vx -= Math.sign(dx || 1) * f * 0.18 * dt;
        strongest = Math.max(strongest, swell * across);
      }
      ship.env.downdraft = strongest;
      ship.env.downColumns = live;
      ship.env.downPeriod = period;
      ship.env.downDuty = duty;
    },
  };
}

/**
 * **Io's fountains.** Lava thrown from fixed vents on a cycle: it lifts, and it
 * burns anything standing in it. Structurally a plume with teeth, and kept a
 * separate force because the two bodies want opposite things from it -
 * Enceladus' vents are a *ride* you can use, Io's are a thing to time.
 *
 * The telegraph is the design: `env.eruptions` publishes each vent's phase, so
 * the renderer shows a vent swelling before it fires. A hazard that arrives
 * without warning is a dice roll, which is the M12 telegraph rule applied to
 * weather instead of to a gun.
 */
function eruption(cfg) {
  const vents = cfg.vents || [];
  const width = cfg.width || 3000;
  const period = cfg.eruptPeriod != null ? cfg.eruptPeriod : 9;
  const duty = cfg.eruptDuty != null ? cfg.eruptDuty : 0.28;
  const reach = cfg.eruptReach != null ? cfg.eruptReach : 520;
  const force = cfg.eruptForce != null ? cfg.eruptForce : 96;
  const hull = cfg.eruptHull != null ? cfg.eruptHull : 14;
  const spec = vents.map((v, i) => (typeof v === 'number'
    ? { x: v * width, offset: i / Math.max(1, vents.length), radius: 120 }
    : { x: (v.atX != null ? v.atX * width : v.x), offset: v.offset != null ? v.offset : i / Math.max(1, vents.length),
        radius: v.radius || 120, reach: v.reach || reach }));
  return {
    id: 'eruption',
    apply(ship, level, t, dt, terrain) {
      const live = [];
      for (const v of spec) {
        if (!offSanctuary(terrain, v.x, v.radius)) continue;
        const phase = (t / period + v.offset) % 1;
        // 0 while quiet, climbing through the telegraph, 1 at full fountain.
        const firing = phase < duty ? Math.sin((phase / duty) * Math.PI) : 0;
        const warn = phase >= duty && phase < duty + 0.12 ? 0 : clamp01((0.12 - Math.min(0.12, 1 - phase)) / 0.12);
        live.push({ x: v.x, radius: v.radius, reach: v.reach || reach, firing, warn });
        if (firing <= 0.02) continue;
        const dx = ship.x - v.x;
        if (Math.abs(dx) > v.radius) continue;
        const ground = terrain ? terrain.heightAt(v.x) : ship.y;
        const alt = ground - ship.y;
        if (alt < 0 || alt > (v.reach || reach) * firing) continue;
        const across = 1 - Math.abs(dx) / v.radius;
        const damp = (ship.loadout && ship.loadout.disturbanceResist) || 1;
        ship.vy -= force * firing * across * damp * dt;
        ship.statusLevels.heat = Math.min(100, ship.statusLevels.heat + 24 * firing * across * dt);
        if (ship.damageOverTime) {
          ship.damageOverTime(hull * firing * across * hazardScale(ship, 'heat') * dt, 'eruption');
        }
      }
      ship.env.eruptions = live;
    },
  };
}

/**
 * **Ganymede's field.** Raises `charge`, puts a slow torque into the hull, and
 * past `MAGNETIC.bite` pulls the lander down toward the ground it is anchored
 * in. The pull is what makes the body a *weight* problem rather than a noise
 * problem, and the torque is what you spend attitude fuel answering.
 *
 * Charge decays out of the field's reach, so the anomalies are places on the
 * map, not a global tax.
 */
function magnetic(cfg) {
  const anomalies = cfg.anomalies || [];
  const width = cfg.width || 3000;
  const radius = cfg.magRadius != null ? cfg.magRadius : 420;
  const rate = cfg.magRate != null ? cfg.magRate : 22;
  const bite = cfg.magBite != null ? cfg.magBite : MAGNETIC.bite;
  const spec = anomalies.map((a) => (typeof a === 'number'
    ? { x: a * width, radius }
    : { x: (a.atX != null ? a.atX * width : a.x), radius: a.radius || radius }));
  return {
    id: 'magnetic',
    apply(ship, level, t, dt) {
      let near = 0;
      for (const a of spec) {
        const dx = Math.abs(ship.x - a.x);
        if (dx > a.radius) continue;
        near = Math.max(near, 1 - dx / a.radius);
      }
      const res = hazardScale(ship, 'charge');
      const s = ship.statusLevels;
      s.charge = Math.max(0, Math.min(100, s.charge + (near ? rate * near * res : -rate * 0.8) * dt));
      ship.env.magnetic = near;
      ship.env.anomalies = spec;
      if (near > 0) {
        // A steady torque, signed by which side of the anomaly you are on, so
        // crossing one rolls you the other way and has to be flown through.
        ship.spin += Math.sign(ship.x - (spec.find((a) => Math.abs(ship.x - a.x) <= a.radius) || spec[0]).x || 1)
          * MAGNETIC.torque * near * dt;
      }
      const over = clamp01((s.charge - bite) / (100 - bite));
      if (over > 0) ship.vy += MAGNETIC.pull * over * dt;
    },
  };
}

/**
 * **The instruments lie.** Ganymede's other hollow hazard, and the one rule it
 * must obey: it writes an error onto `env` and **changes nothing in the
 * simulation**. The lander flies true; the readout does not. That is the same
 * line the accessibility settings live on, taken from the other side - there,
 * presentation may never reach the simulation; here, a hazard may never leave
 * presentation.
 *
 * It follows that no autopilot in this project can measure it, exactly as no
 * automated test here can measure visibility (M24). Recorded, not asserted.
 *
 * The error swims rather than jitters, because a needle that buzzes reads as a
 * broken game and a needle that drifts reads as a lying one.
 */
function falseRadar(cfg) {
  const amount = cfg.radarError != null ? cfg.radarError : 1;
  const period = cfg.radarPeriod != null ? cfg.radarPeriod : 7;
  return {
    id: 'falseRadar',
    apply(ship, level, t) {
      const swim = Math.sin(t / period * Math.PI * 2) * 0.6 + Math.sin(t / (period * 0.37) + 2.1) * 0.4;
      // Worst where the field is, so the lie has a location like everything
      // else on this body. Bare `falseRadar` with no anomalies lies everywhere.
      const where = ship.env.magnetic != null ? Math.max(0.35, ship.env.magnetic) : 1;
      ship.env.instrumentError = swim * amount * where;
    },
  };
}

/**
 * **The sanctuary rule, extended from machines to weather.**
 *
 * M12 promises that a mission's lowest-tier landing zone - the one you can
 * always get home to on the starting tank - is outside every machine's reach,
 * and `validate.js` proves it as geometry. M29 put hazards *in places* for the
 * first time (vents, fountains, sinking air), and the first tuning pass had an
 * Enceladus vent sitting over the safe pad: the way home fell to 11/20 while
 * the deep route stayed at 19/20 on every setting tried. Sweeping the vent's
 * force from 15 down to 8 barely moved it, which is what said the problem was
 * *where* it was and not how hard it blew.
 *
 * So a placed hazard keeps off the safe zone, for the same reason a turret
 * does: the near pad is a promise about geometry, and weather standing on it
 * breaks that promise exactly as a gun would. The deep zone is fair game, which
 * is why the prize route never moved in that sweep.
 *
 * It reads `sanctuaryPad` from `enemies.js` rather than reimplementing "the
 * nearest zone" - one rule, one implementation, which is the lesson `__settleNow`
 * cost M27 an hour to relearn. The result is cached per terrain because this is
 * asked 120 times a second per vent.
 */
export const HAZARD_PAD_GUARD = 240;

function sanctuaryOf(terrain) {
  if (!terrain || !terrain.pads || !terrain.pads.length) return null;
  if (terrain.__sanctuary === undefined) {
    Object.defineProperty(terrain, '__sanctuary', { value: sanctuaryPad(terrain), enumerable: false });
  }
  return terrain.__sanctuary;
}

/** True when a hazard centred at `x` with this reach is clear of the safe pad. */
function offSanctuary(terrain, x, reach) {
  const safe = sanctuaryOf(terrain);
  if (!safe) return true;
  const guard = HAZARD_PAD_GUARD + reach;
  return x < safe.x1 - guard || x > safe.x2 + guard;
}

/**
 * Periodic vapour jets that push the lander. Enceladus reads this.
 *
 * Built in M5 and **never once applied**: Enceladus declares the hazard as
 * `'plume'` and this builder is keyed `plumes`, so the lookup missed and the
 * body's only hazard was a word on a route card. Caught by an external review
 * in M28b, which flagged it as "builds with no vents, a no-op" - right about the
 * outcome, wrong about the mechanism, and the mechanism was the half that
 * mattered, because authoring vents alone would have fixed nothing.
 *
 * A vent authors its position as `atX`, a fraction of the map width, so content
 * does not have to know how wide the terrain came out. Absolute `x` still works.
 * Vents are published on `env` so the renderer can draw them - they are a hazard
 * with a place, and M29a's rule is that those get drawn.
 */
function plumes(cfg) {
  const width = cfg.width || 3000;
  const vents = (cfg.vents || []).map((v, i) => ({
    x: v.atX != null ? v.atX * width : v.x,
    period: v.period || 8,
    offset: v.offset != null ? v.offset : i / Math.max(1, (cfg.vents || []).length),
    duty: v.duty != null ? v.duty : 0.4,
    radius: v.radius || 200,
    force: v.force || 42,
  }));
  return {
    id: 'plumes',
    apply(ship, level, t, dt, terrain) {
      const live = [];
      for (const v of vents) {
        if (!offSanctuary(terrain, v.x, v.radius)) continue;   // never over the way home
        const phase = (t / v.period + v.offset) % 1;
        const strength = phase < v.duty ? Math.sin((phase / v.duty) * Math.PI) : 0;
        live.push({ x: v.x, radius: v.radius, strength });
        if (phase > v.duty) continue;                  // vent is quiet
        const dx = ship.x - v.x;
        if (Math.abs(dx) > v.radius) continue;
        const falloff = 1 - Math.abs(dx) / v.radius;
        const damp = (ship.loadout && ship.loadout.disturbanceResist) || 1;
        // Vanes cut the **sideways** shove and leave the lift alone, which is
        // the module as the spec describes it: on a body at 1.4 m/s2 the column
        // of vapour is free altitude and the thing that ruins a landing is
        // being thrown off the pad sideways.
        const lat = (ship.loadout && ship.loadout.plumeLateral) || 1;
        ship.vy -= v.force * falloff * damp * dt;
        ship.vx += Math.sign(dx || 1) * v.force * 0.25 * falloff * damp * lat * dt;
      }
      ship.env.plumes = live;
    },
  };
}

/**
 * **Night.** Pluto's `darkness` was implemented as `visibility: 0.45`, and the
 * renderer draws visibility as *dust* - so the darkest body in the game came out
 * as pale blue fog, which is what Tom found on the ladder. Darkness is its own
 * channel now: it dims the world and closes a sight radius around the lander,
 * while dust stays a coloured haze in the air. A body can have either, both, or
 * neither, and they no longer have to lie about each other.
 *
 * Like dust it leaves the beacons and the ore crates drawn above it (M18/M22),
 * so the player always has a target. Blind is difficulty; targetless is a coin
 * toss, and this project has decided that distinction twice already.
 */
function darkness(cfg) {
  const level0 = cfg.darkness != null ? cfg.darkness : 0.7;
  const period = cfg.darkPeriod || 0;
  const swing = cfg.darkSwing != null ? cfg.darkSwing : 0;
  return {
    id: 'darkness',
    apply(ship, level, t) {
      // A static night by default; a body may breathe it if it wants weather.
      const pulse = period ? Math.sin((t / period) * Math.PI * 2) * swing : 0;
      ship.env.darkness = clamp(level0 + pulse, 0, 0.92);
    },
  };
}

/**
 * Dust: cycles visibility between clear and near-blind. Missions use it either
 * as a passing front (long period, shallow floor) or a storm that must be
 * waited out (short period, deep floor). Deterministic in t.
 */
/**
 * A deterministic hash of an integer into 0..1. Forces must be pure functions of
 * `(ship, level, t)` - that is what makes the same seed reproduce the same
 * flight - so a "random" squall cannot call `Math.random()`. It hashes the time
 * slot instead: unpredictable to the player, identical on every replay.
 */
function hash01(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Stable per-mission salt, so two missions do not storm in lockstep. */
function saltOf(level) {
  let h = 2166136261;
  for (const ch of String((level && (level.missionId || level.id)) || '')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Airborne dust: a slow front that comes and goes, plus **squalls**.
 *
 * The slow front is readable by design - you can see it coming and wait it out.
 * Tom, after the full run: *"there should be random phases with close to zero
 * visibility for 3-5 seconds"*. That is a different thing and it is the one that
 * makes weather frightening: a front you can plan around, and inside it a squall
 * you cannot. It lands on the floor `obscure` already enforces, so the pad
 * beacons and the ore still draw - blind, but never a coin toss.
 *
 * One squall is rolled per `squallSlot` seconds and most slots come up empty, so
 * they arrive irregularly rather than on a beat the player can count.
 */
function dust(cfg) {
  const period = cfg.period || 14;
  const offset = cfg.offset || 0;
  const floor = cfg.minVisibility != null ? cfg.minVisibility : 0.35;
  const duty = cfg.duty != null ? cfg.duty : 0.45;   // fraction of the cycle obscured
  const squallSlot = cfg.squallSlot || 9;            // seconds per roll
  const squallChance = cfg.squallChance != null ? cfg.squallChance : 0.3;
  const squallFloor = cfg.squallFloor != null ? cfg.squallFloor : 0.06;
  const salt = saltOf(cfg);
  return {
    id: 'dust',
    apply(ship, level, t) {
      const phase = ((t / period) + offset) % 1;
      // smooth in and out so the player can read the front coming
      const inStorm = phase < duty ? Math.sin((phase / duty) * Math.PI) : 0;

      // The squall. One roll per slot; when it hits, it runs 3-5 s somewhere
      // inside that slot, ramping in and out over about half a second so it
      // reads as weather arriving rather than as a light switch.
      const slot = Math.floor(t / squallSlot);
      let squall = 0;
      if (hash01(slot ^ salt) < squallChance) {
        // Nominal 3.5-6 s. The ramp in and out costs about half a second at
        // each end, so the *fully blind* stretch lands on the 3-5 s Tom asked
        // for rather than the envelope being 3-5 s and the blackout shorter.
        const dur = 3.5 + hash01((slot * 7 + 1) ^ salt) * 2.5;
        const start = hash01((slot * 13 + 5) ^ salt) * Math.max(0, squallSlot - dur);
        const u = (t - slot * squallSlot - start) / dur;
        if (u >= 0 && u <= 1) squall = Math.min(1, Math.min(u, 1 - u) * 8);
      }

      const front = 1 - (1 - floor) * inStorm;
      ship.env.visibility = obscure(Math.min(front, 1 - (1 - squallFloor) * squall));
      ship.env.dust = Math.max(inStorm, squall);
    },
  };
}

/**
 * Alternating horizontal wind bands stacked by altitude - the Valles channels.
 * Crossing a band boundary reverses the push, so a descent has to be timed
 * rather than flown straight down.
 */
function windChannels(cfg) {
  const bandHeight = cfg.bandHeight || 180;
  const strength = cfg.strength || 46;
  const drift = cfg.drift || 0.25;
  return {
    id: 'windChannels',
    apply(ship, level, t, dt) {
      const band = Math.floor(ship.y / bandHeight);
      const dir = band % 2 === 0 ? 1 : -1;
      // The dampers work here too. They did not, and that was a real hole: the
      // canyon is the mission built entirely around wind, and it was the one
      // place where the gear sold to answer wind did nothing at all. The steady
      // band still stands - you fly the weather - but the swing between bands
      // is a disturbance like any other.
      const damp = (ship.loadout && ship.loadout.disturbanceResist) || 1;
      const swing = Math.sin(t * 0.6 + band) * drift * damp;
      const w = dir * strength * (1 + swing);
      ship.windNow = w;
      const d = level.drag || 0.12;
      ship.vx += (w - ship.vx) * d * dt;
    },
  };
}

/**
 * Radiation sweeps. Jupiter floods the surface on a cycle; terrain shields it.
 * The check is deliberately simple and readable from the cockpit: if there is
 * ground higher than you within a short distance, you are in its lee.
 */
function radiation(cfg) {
  const period = cfg.period || 16;
  const duty = cfg.duty != null ? cfg.duty : 0.4;
  // How fast exposure climbs. Slow enough that the sweep is a warning before
  // it is a wound: at the old rate a lander went from clean to saturated in
  // three seconds, which left no room to reach a shadow.
  const rate = cfg.rate || 12;
  const shieldReach = cfg.shieldReach || 220;
  return {
    id: 'radiation',
    apply(ship, level, t, dt, terrain) {
      const phase = (t / period + (cfg.offset || 0)) % 1;
      // How far up the lander is. The belt is an altitude band, so this decides
      // whether the sweep reaches at all - and it is published on `env` so the
      // renderer can draw the edge of it rather than leaving the player to
      // infer a boundary from a gauge.
      const alt = terrain ? terrain.heightAt(ship.x) - ship.y : RADIATION.minAltitude + RADIATION.falloff;
      const reach = clamp01((alt - RADIATION.minAltitude) / RADIATION.falloff);
      const active = phase < duty && reach > 0;
      ship.env.radiationSweep = phase < duty ? 1 - Math.abs(phase / duty - 0.5) * 2 : 0;
      ship.env.radiationBand = RADIATION.minAltitude;
      ship.env.radiationReach = reach;
      if (!active) {
        ship.statusLevels.radiation = Math.max(0, ship.statusLevels.radiation - rate * 0.5 * dt);
        ship.env.shielded = false;
        return;
      }
      let shielded = false;
      if (terrain) {
        for (const dx of [-shieldReach, -shieldReach / 2, shieldReach / 2, shieldReach]) {
          if (terrain.heightAt(ship.x + dx) < ship.y - 40) { shielded = true; break; }
        }
      }
      ship.env.shielded = shielded;
      const res = hazardScale(ship, 'radiation');
      // Two shelters, and they answer different questions: a ridge shadows you
      // where you are, and altitude takes you out of the belt entirely.
      const take = (shielded ? rate * 0.15 : rate) * res * reach;
      const before = ship.statusLevels.radiation;
      ship.statusLevels.radiation = Math.min(100, before + take * dt);

      // Exposure has to cost something, or it is a number that goes up.
      //
      // Until now radiation only made the instruments lie, which is why Tom
      // could not say what it did: the honest answer was "nothing you can lose
      // anything to". Past `RADIATION.bite` it eats hull, at a rate that climbs
      // with exposure, so sitting in a sweep in the open is a decision with a
      // price and the terrain shadow and the Ray Shield both become worth using.
      const exposure = ship.statusLevels.radiation;
      if (exposure > RADIATION.bite && ship.damageOverTime) {
        // A floor, deliberately. Radiation softens you up; it never finishes
        // you on its own. Europa 5 is a 48-second deep run with two drones on
        // it, and without this the sweep and the machines together took more
        // than a full hull - the route the map is built to tempt you down
        // became the route that killed you regardless of how well you flew.
        const floor = ship.hullMax * RADIATION.floor;
        const room = ship.hull - floor;
        if (room > 0) {
          const over = (exposure - RADIATION.bite) / (100 - RADIATION.bite);
          ship.damageOverTime(Math.min(room, RADIATION.hullPerSecond * over * dt), 'radiation');
        }
      }
    },
  };
}

/**
 * **The hazard name a mission writes is the key that is looked up here, and for
 * four bodies it had never matched anything.**
 *
 * This table is the single most expensive line in the project's history for its
 * size. `PlanetDefinition.hazards` is authored prose-ish data - `'heat'`,
 * `'plume'`, `'cold'` - and the builders were named for what they model -
 * `thermal`, `plumes`, `cryo`. A miss is silent: `BUILDERS[spec.type]` comes
 * back undefined, `add()` is never called, and the body flies with no hazard at
 * all while its route card, its summary and its briefing all describe one.
 *
 * Audited in M29 across every planet and every authored mission. What it found:
 *
 * | declared | builder it wanted | state before M29 |
 * | --- | --- | --- |
 * | `heat` (Mercury, Io) | `thermal` | **never built** |
 * | `cold` (Pluto) | `cryo` | **never built** |
 * | `plume` (Enceladus) | `plumes` | **never built** |
 * | `wind` (Mars, Titan) | `atmosphere` | built anyway, via wind/gust/drag |
 * | `drag` (Venus) | `atmosphere` | built anyway, via wind/gust/drag |
 * | `ice` (Europa) | none - `surfaceFriction` | correct, not a force |
 *
 * So **Mercury, Io, Enceladus and Ganymede had no working hazard whatsoever**,
 * halfway down a ladder every run walks. M28b caught the Enceladus case from a
 * review; the other two spellings had never been noticed, and neither
 * `ROADMAP_STATUS.md` nor `docs/ARCHITECTURE.md` listed `heat` or `cold` among
 * the hollow ones - both documents believed they worked.
 *
 * The aliases below are the fix, and `forces-tests.js` now asserts the property
 * rather than the list: **every hazard string any planet or mission declares
 * must resolve to a builder**, so a new body cannot ship a hazard that does
 * nothing without failing a test. `ice` and `darkness` are the two deliberate
 * exceptions and `darkness` stopped being one in M29 - it is a real force now.
 */
const BUILDERS = {
  atmosphere, thermal, cryo, plumes, dust, windChannels, radiation,
  // M29 builders, one per hazard that was previously a string with nothing
  // behind it.
  glide, acid, downdraft, eruption, magnetic, falseRadar, darkness,
  // Aliases: the name content writes, pointing at the model that implements it.
  heat: thermal,
  cold: cryo,
  plume: plumes,
  wind: atmosphere,
  drag: atmosphere,
};

/**
 * Hazards that are deliberately not forces: they are implemented by a
 * `PlanetDefinition` field the generator or the collision code reads, so having
 * no builder is correct rather than a hole. Exported so the test that proves
 * "every declared hazard resolves" can state its own exceptions.
 */
export const NON_FORCE_HAZARDS = ['ice'];

/**
 * **A hazard entry is either a bare name or a spec object**, and every reader
 * has to know that. `'wind'` and `{ type: 'dust', period: 12 }` are both legal
 * in the same array - Venus declares one of each - because a hazard that needs
 * tuning carries it and one that does not should not have to.
 *
 * This was open-coded in three places, and the third got it wrong: the
 * expedition screen printed `c.hazards.join(', ')` and **six of the ten bodies
 * read `weather: [object Object]`** - every body M29 authored with a tuned
 * hazard, on the screen a player picks a run from. The shape is the rule, so
 * the rule lives here and gets read rather than re-derived.
 */
export function hazardSpec(h) {
  return typeof h === 'string' ? { type: h } : (h || {});
}

/** The hazard's name - what a screen prints and what `BUILDERS` is keyed on. */
export function hazardName(h) {
  return hazardSpec(h).type;
}

/**
 * Force list for a level, built once and cached on it. Legacy levels declare
 * wind/gust/drag directly; authored missions declare `hazards`.
 */
export function forcesFor(level) {
  if (level.__forces) return level.__forces;
  const list = [];
  // **One force per id.** A level that both carries wind/gust/drag *and* names
  // `atmosphere` in its hazards used to get the force twice, and applying it
  // twice per step is not a doubled reading - it is doubled physics. Four of
  // the five authored Mars missions flew that way from M6 to M28, at roughly
  // twice the drag their own numbers ask for.
  //
  // The redundant hazard strings are gone from the content too, but the guard
  // is what stops it happening again: a hazard list is authored data, and
  // "declaring the weather twice" should be harmless rather than a physics bug.
  const seen = new Set();
  const add = (f) => { if (f && !seen.has(f.id)) { seen.add(f.id); list.push(f); } };
  if (level.wind || level.gust || level.drag) add(atmosphere(level));
  for (const h of level.hazards || []) {
    const spec = hazardSpec(h);
    const build = BUILDERS[spec.type];
    if (build) add(build({ ...level, ...spec }));
  }
  Object.defineProperty(level, '__forces', { value: list, enumerable: false });
  return list;
}

/** Apply every force for one step. */
export function applyForces(ship, level, t, dt, terrain) {
  const list = forcesFor(level);
  if (!ship.env) ship.env = freshEnv();
  if (!ship.statusLevels) ship.statusLevels = freshStatus();
  ship.env.visibility = obscure(level.visibility != null ? level.visibility : 1);
  ship.env.dust = 0;
  // **Every channel a force writes is reset before the forces run**, including
  // the two the ship itself reads back. A force that is not on this level must
  // leave no trace of the last one that was: `thermalDerate` and `rcsStiffness`
  // multiply thrust and attitude authority, so a stale value from a previous
  // mission would be a hazard that followed the lander to another body.
  ship.env.darkness = 0;
  ship.env.lift = 0;
  ship.env.acid = 0;
  ship.env.downdraft = 0;
  ship.env.magnetic = 0;
  ship.env.instrumentError = 0;
  ship.thermalDerate = 1;
  ship.rcsStiffness = 1;
  if (!list.length) { ship.windNow = 0; return; }
  for (const f of list) f.apply(ship, level, t, dt, terrain);
}
