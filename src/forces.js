// Environmental forces and status effects (roadmap section 14: "hazards should
// apply explicit forces/status effects through a shared interface").
//
// A force reads the ship and the clock and applies acceleration, or raises a
// status level. Missions list hazards by name; nothing in the flight loop knows
// what a planet is. Every force is a pure function of (ship, level, t), so the
// same seed and the same inputs always reproduce the same flight.

/** Status channels a hazard can raise. Damage models consume these later. */
export const STATUS_CHANNELS = ['heat', 'cold', 'corrosion', 'radiation', 'charge'];

export function freshStatus() {
  const s = {};
  for (const k of STATUS_CHANNELS) s[k] = 0;
  return s;
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
    apply(ship, level, t, dt) {
      const w = wind + Math.sin(t * 0.7) * gust + Math.sin(t * 1.9 + 1.3) * gust * 0.4;
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
      const s = ship.status;
      s.heat = Math.max(0, Math.min(100, s.heat + (ship.thrusting ? rise : -fall) * dt));
    },
  };
}

/** Ambient cold: builds continuously, slowed by burning. Pluto reads this. */
function cryo(cfg) {
  const rate = cfg.coldRate != null ? cfg.coldRate : 6;
  return {
    id: 'cryo',
    apply(ship, level, t, dt) {
      const s = ship.status;
      s.cold = Math.max(0, Math.min(100, s.cold + (ship.thrusting ? rate * 0.3 : rate) * dt));
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
        ship.vy -= v.force * falloff * dt;
        ship.vx += Math.sign(dx || 1) * v.force * 0.25 * falloff * dt;
      }
    },
  };
}

const BUILDERS = { atmosphere, thermal, cryo, plumes };

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
export function applyForces(ship, level, t, dt) {
  const list = forcesFor(level);
  if (!list.length) { ship.windNow = 0; return; }
  for (const f of list) f.apply(ship, level, t, dt);
}
