// Landing evaluation: a combined severity score rather than a set of invisible
// cutoffs (roadmap section 4). Every threshold lives here, in one place, so
// tuning is a data change and never a hunt through the physics.

import { DEG, clamp } from './util.js';

export const LANDING = {
  // How much each criterion contributes to the severity score.
  weights: { vy: 0.45, vx: 0.25, tilt: 0.20, center: 0.10 },

  // Per-criterion reference points. `safe` is the normalisation anchor: a value
  // exactly at `safe` scores 1.0 on that axis. Speeds are px/s, tilt radians,
  // center is a fraction of the pad's half-width.
  caps: {
    vy: { perfect: 11, safe: 22, crash: 44 },
    vx: { perfect: 7, safe: 14, crash: 30 },
    tilt: { perfect: 3.5 * DEG, safe: 9 * DEG, crash: 22 * DEG },
    center: { perfect: 0.35, safe: 0.75, crash: 1.0 },
  },

  // Score bands. Below `perfect` is PERFECT, and so on; above `hard` is a crash.
  bands: { perfect: 0.70, good: 1.20, hard: 1.80 },

  // Touchdown is judged over a window, not on the first contact frame, so a
  // single physics spike cannot turn a good landing into a wreck.
  aggregationWindow: 0.20,   // s
  maxSettle: 1.5,            // s - give up waiting for the ship to come to rest
  restSpeed: 6,              // px/s below which the ship counts as settled

  // Gear response during that window.
  restitution: 0.22,         // vertical bounce retained per contact
  groundFriction: 0.55,      // lateral speed retained per contact
  spinDamp: 0.30,            // spin retained per contact
  levelAssist: 3.2,          // rad/s^2 righting torque while both feet touch

  // A result within this distance of the next band up is promoted if the ship
  // settles upright and stable.
  promoteMargin: 0.10,

  // Multiplies `safe` and `crash` caps. Landing-gear upgrades raise it (M10).
  gearTier: 1.0,

  // Off the pad, level ground still holds the legs.
  offPadMaxSlope: 10 * DEG,

  // Reward multiplier per grade.
  quality: { PERFECT: 3.0, GOOD: 2.0, HARD: 1.0 },
};

/** Effective caps for an axis, after the landing-gear multiplier. */
export function capsFor(axis, cfg = LANDING) {
  const c = cfg.caps[axis];
  const t = axis === 'center' ? 1 : cfg.gearTier;   // gear does not improve accuracy
  return { perfect: c.perfect, safe: c.safe * t, crash: c.crash * t };
}

/**
 * Evaluate a touchdown.
 *
 * snap: { vy, vx, tilt, centerFrac, onPad, hullContact, stable, slope }
 * Returns { grade, score, parts, limitedBy, blocker }.
 */
export function evaluateLanding(snap, cfg = LANDING) {
  const axes = ['vy', 'vx', 'tilt', 'center'];
  const value = {
    vy: Math.max(0, snap.vy),          // upward motion at contact is not an impact
    vx: Math.abs(snap.vx),
    tilt: Math.abs(snap.tilt),
    center: clamp(snap.centerFrac ?? 0, 0, 1.6),
  };

  const parts = {};
  let score = 0;
  for (const a of axes) {
    const caps = capsFor(a, cfg);
    // Centre accuracy is capped at the safe anchor: it shapes the score and the
    // reward, but being off-centre must never be what destroys a lander.
    const n = a === 'center' ? Math.min(value[a] / caps.safe, 1) : value[a] / caps.safe;
    parts[a] = { value: value[a], norm: n, weighted: n * cfg.weights[a], caps };
    score += parts[a].weighted;
  }

  if (snap.hullContact) {
    return { grade: 'CRASH', score, parts, limitedBy: 'hull', blocker: 'The hull struck the surface.' };
  }

  // Any single criterion past its own crash cap is fatal regardless of score.
  // Centre accuracy is deliberately excluded: being off-centre must never fail
  // an otherwise clean landing.
  for (const a of ['vy', 'vx', 'tilt']) {
    if (value[a] > capsFor(a, cfg).crash) {
      return { grade: 'CRASH', score, parts, limitedBy: a, blocker: crashReasonFor(a, value[a], cfg) };
    }
  }

  let grade = score <= cfg.bands.perfect ? 'PERFECT'
    : score <= cfg.bands.good ? 'GOOD'
      : score <= cfg.bands.hard ? 'HARD' : 'CRASH';

  // Band ceilings from individual criteria: one bad axis cannot hide inside a
  // good average. Centre accuracy takes part only in the PERFECT ceiling - it
  // can cost you the top grade, but it can never fail a landing.
  let limitedBy = null;
  if (value.center > capsFor('center', cfg).perfect && grade === 'PERFECT') {
    grade = 'GOOD';
    limitedBy = 'center';
  }
  for (const a of ['vy', 'vx', 'tilt']) {
    const caps = capsFor(a, cfg);
    if (value[a] > caps.safe && rank(grade) < rank('HARD')) { grade = 'HARD'; limitedBy = a; }
    else if (value[a] > caps.perfect && rank(grade) < rank('GOOD')) { grade = 'GOOD'; limitedBy = a; }
  }

  // Borderline results resolve upward when the ship settles upright and stable.
  if (snap.stable && grade !== 'PERFECT' && !limitedBy) {
    const boundary = grade === 'CRASH' ? cfg.bands.hard : grade === 'HARD' ? cfg.bands.good : cfg.bands.perfect;
    if (score - boundary <= cfg.promoteMargin) grade = promote(grade);
  }

  return { grade, score, parts, limitedBy, blocker: blockerFor(grade, parts, cfg) };
}

const ORDER = ['PERFECT', 'GOOD', 'HARD', 'CRASH'];
const rank = (g) => ORDER.indexOf(g);
const promote = (g) => ORDER[Math.max(0, rank(g) - 1)];

function crashReasonFor(axis, v, cfg) {
  const caps = capsFor(axis, cfg);
  if (axis === 'vy') return `Descent rate ${(v / 6).toFixed(1)} m/s, past the ${(caps.crash / 6).toFixed(1)} the gear can absorb.`;
  if (axis === 'vx') return `Lateral drift ${(v / 6).toFixed(1)} m/s sheared the legs off.`;
  return `Attitude ${(v / DEG).toFixed(0)}° at contact — past the ${(caps.crash / DEG).toFixed(0)}° rollover limit.`;
}

/** Which criterion cost the most, phrased for the results panel. */
export function blockerFor(grade, parts, cfg = LANDING) {
  if (grade === 'PERFECT') return null;
  let worst = null;
  for (const a of Object.keys(parts)) {
    if (!worst || parts[a].weighted > parts[worst].weighted) worst = a;
  }
  const p = parts[worst];
  const label = {
    vy: `descent rate ${(p.value / 6).toFixed(1)} m/s`,
    vx: `lateral drift ${(p.value / 6).toFixed(1)} m/s`,
    tilt: `tilt ${(p.value / DEG).toFixed(1)}°`,
    center: `${Math.round(p.value * 100)}% off the pad centre`,
  }[worst];
  return `Mostly ${label}.`;
}

/** Live severity for the HUD and the debug overlay, before touchdown. */
export function severityNow(vy, vx, tilt, centerFrac, cfg = LANDING) {
  return evaluateLanding({ vy, vx, tilt, centerFrac, onPad: true, hullContact: false, stable: false }, cfg);
}
