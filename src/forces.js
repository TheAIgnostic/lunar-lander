import { clamp } from './util.js';

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
export function hazardScale(ship, channel) {
  const base = (ship.loadout && ship.loadout.hazardResist) || 1;
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
  hullPerSecond: 2.5,   // hull per second at full exposure, unsheltered
  floor: 0.45,          // it will never take you below this fraction of the hull
};

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
    const spec = typeof h === 'string' ? { type: h } : h;
    if (spec.type !== 'dust') continue;
    worst = Math.min(worst, obscure(spec.minVisibility != null ? spec.minVisibility : 0.35));
  }
  return worst;
}

/** Environment readings a force can write and the renderer/HUD can read. */
export function freshEnv() {
  return { visibility: 1, dust: 0, radiationSweep: 0, shielded: false };
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
      if (drag) {
        ship.vx += (w - ship.vx) * drag * dt;
        ship.vy += (0 - ship.vy) * drag * 0.5 * dt;
      } else {
        ship.vx += w * dt;
      }
    },
  };
}

/** Engine heat: rises while burning, falls otherwise. Mercury and Io read this. */
function thermal(cfg) {
  const rise = cfg.heatRise != null ? cfg.heatRise : 14;
  const fall = cfg.heatFall != null ? cfg.heatFall : 9;
  return {
    id: 'thermal',
    apply(ship, level, t, dt) {
      const s = ship.statusLevels;
      const res = hazardScale(ship, 'heat');
      s.heat = Math.max(0, Math.min(100, s.heat + (ship.thrusting ? rise * res : -fall) * dt));
    },
  };
}

/** Ambient cold: builds continuously, slowed by burning. Pluto reads this. */
function cryo(cfg) {
  const rate = cfg.coldRate != null ? cfg.coldRate : 6;
  return {
    id: 'cryo',
    apply(ship, level, t, dt) {
      const s = ship.statusLevels;
      const res = hazardScale(ship, 'cold');
      s.cold = Math.max(0, Math.min(100, s.cold + (ship.thrusting ? rate * 0.3 : rate) * res * dt));
    },
  };
}

/** Periodic vapour jets that push the lander. Enceladus reads this. */
function plumes(cfg) {
  const vents = cfg.vents || [];
  return {
    id: 'plumes',
    apply(ship, level, t, dt) {
      for (const v of vents) {
        const phase = (t / v.period + v.offset) % 1;
        if (phase > v.duty) continue;                  // vent is quiet
        const dx = ship.x - v.x;
        if (Math.abs(dx) > v.radius) continue;
        const falloff = 1 - Math.abs(dx) / v.radius;
        const damp = (ship.loadout && ship.loadout.disturbanceResist) || 1;
        ship.vy -= v.force * falloff * damp * dt;
        ship.vx += Math.sign(dx || 1) * v.force * 0.25 * falloff * damp * dt;
      }
    },
  };
}

/**
 * Dust: cycles visibility between clear and near-blind. Missions use it either
 * as a passing front (long period, shallow floor) or a storm that must be
 * waited out (short period, deep floor). Deterministic in t.
 */
function dust(cfg) {
  const period = cfg.period || 14;
  const offset = cfg.offset || 0;
  const floor = cfg.minVisibility != null ? cfg.minVisibility : 0.35;
  const duty = cfg.duty != null ? cfg.duty : 0.45;   // fraction of the cycle obscured
  return {
    id: 'dust',
    apply(ship, level, t) {
      const phase = ((t / period) + offset) % 1;
      // smooth in and out so the player can read the front coming
      const inStorm = phase < duty ? Math.sin((phase / duty) * Math.PI) : 0;
      ship.env.visibility = obscure(1 - (1 - floor) * inStorm);
      ship.env.dust = inStorm;
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
      const active = phase < duty;
      ship.env.radiationSweep = active ? 1 - Math.abs(phase / duty - 0.5) * 2 : 0;
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
      const take = (shielded ? rate * 0.15 : rate) * res;
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

const BUILDERS = { atmosphere, thermal, cryo, plumes, dust, windChannels, radiation };

/**
 * Force list for a level, built once and cached on it. Legacy levels declare
 * wind/gust/drag directly; authored missions declare `hazards`.
 */
export function forcesFor(level) {
  if (level.__forces) return level.__forces;
  const list = [];
  if (level.wind || level.gust || level.drag) list.push(atmosphere(level));
  for (const h of level.hazards || []) {
    const spec = typeof h === 'string' ? { type: h } : h;
    const build = BUILDERS[spec.type];
    if (build) list.push(build({ ...level, ...spec }));
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
  if (!list.length) { ship.windNow = 0; return; }
  for (const f of list) f.apply(ship, level, t, dt, terrain);
}
