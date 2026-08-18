// Unit tests for the landing grader. Pure functions, no browser needed:
//   node test/landing-tests.js
import { LANDING, evaluateLanding, capsFor } from '../src/landing.js';
import { DEG } from '../src/util.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};

const snap = (o = {}) => ({
  vy: 0, vx: 0, tilt: 0, centerFrac: 0,
  onPad: true, hullContact: false, stable: false, ...o,
});
const grade = (o) => evaluateLanding(snap(o)).grade;

console.log('landing grader');

// --- band boundaries are reproducible exactly on, just under and just over
const c = { vy: capsFor('vy'), vx: capsFor('vx'), tilt: capsFor('tilt') };

check('still air, dead centre is PERFECT', grade({}) === 'PERFECT');
check('at every perfect cap is PERFECT',
  grade({ vy: c.vy.perfect, vx: c.vx.perfect, tilt: c.tilt.perfect, centerFrac: LANDING.caps.center.perfect }) === 'PERFECT',
  evaluateLanding(snap({ vy: c.vy.perfect, vx: c.vx.perfect, tilt: c.tilt.perfect })).score.toFixed(3));

check('a hair over the perfect descent cap drops to GOOD',
  grade({ vy: c.vy.perfect + 0.01 }) === 'GOOD');
check('exactly at the safe descent cap is GOOD',
  grade({ vy: c.vy.safe }) === 'GOOD');
check('a hair over the safe descent cap drops to HARD',
  grade({ vy: c.vy.safe + 0.01 }) === 'HARD');
check('exactly at the crash descent cap is still HARD',
  grade({ vy: c.vy.crash }) === 'HARD');
check('a hair over the crash descent cap is a CRASH',
  grade({ vy: c.vy.crash + 0.01 }) === 'CRASH');

check('drift past its crash cap is a CRASH', grade({ vx: c.vx.crash + 0.01 }) === 'CRASH');
check('tilt past its crash cap is a CRASH', grade({ tilt: c.tilt.crash + 0.001 }) === 'CRASH');
check('hull contact is always a CRASH', grade({ hullContact: true }) === 'CRASH');

// --- centre accuracy must never fail an otherwise clean landing
check('landing on the pad edge still completes',
  ['PERFECT', 'GOOD', 'HARD'].includes(grade({ centerFrac: 1.0 })),
  grade({ centerFrac: 1.0 }));
check('pad edge alone is never a crash', grade({ centerFrac: 1.6 }) !== 'CRASH');
check('landing well off centre costs PERFECT but still completes',
  grade({ centerFrac: 0.9 }) === 'GOOD', grade({ centerFrac: 0.9 }));
check('landing inside the centre cap keeps PERFECT',
  grade({ centerFrac: LANDING.caps.center.perfect - 0.01 }) === 'PERFECT');
check('centre affects the score, not survival',
  evaluateLanding(snap({ centerFrac: 1.0 })).score > evaluateLanding(snap({ centerFrac: 0 })).score);

// --- one bad axis cannot hide behind three good ones
check('a fast descent cannot be averaged into PERFECT',
  grade({ vy: c.vy.safe + 1 }) === 'HARD',
  `score ${evaluateLanding(snap({ vy: c.vy.safe + 1 })).score.toFixed(2)}`);
check('a big tilt cannot be averaged into PERFECT',
  grade({ tilt: c.tilt.safe + 0.01 }) === 'HARD');

// --- upward motion at contact is not an impact
check('rising at contact is not penalised', grade({ vy: -30 }) === 'PERFECT');

// --- the stable-settle promotion. Per-axis caps bind the PERFECT and GOOD
// bands, so promotion is meaningful exactly where several survivable values
// combine into a fatal score.
const borderline = { vy: c.vy.crash - 1, vx: c.vx.crash - 1, tilt: c.tilt.crash - 0.02 };
check('a borderline combination is promoted when the ship settles stable',
  grade(borderline) === 'CRASH' && grade({ ...borderline, stable: true }) === 'HARD',
  `${grade(borderline)} -> ${grade({ ...borderline, stable: true })} at score ${evaluateLanding(snap(borderline)).score.toFixed(2)}`);
check('promotion cannot rescue a genuine crash',
  grade({ vy: c.vy.crash + 5, stable: true }) === 'CRASH');
check('promotion cannot skip a whole band',
  grade({ vy: c.vy.safe + 6, stable: true }) === 'HARD');
check('several survivable values can still combine into a crash',
  grade({ vy: c.vy.crash - 2, vx: c.vx.crash - 2, tilt: c.tilt.crash - 0.02 }) === 'CRASH');

// --- weights behave as documented
const w = evaluateLanding(snap({ vy: c.vy.safe, vx: c.vx.safe, tilt: c.tilt.safe, centerFrac: LANDING.caps.center.safe }));
check('all four exactly at safe scores 1.00', Math.abs(w.score - 1) < 1e-9, w.score.toFixed(6));
check('descent is the heaviest criterion',
  evaluateLanding(snap({ vy: c.vy.safe })).score > evaluateLanding(snap({ vx: c.vx.safe })).score);

// --- gear tier widens tolerance without touching accuracy
const base = capsFor('vy').safe;
LANDING.gearTier = 1.25;
check('gear tier widens the speed envelope', capsFor('vy').safe === base * 1.25);
check('gear tier does not improve centring', capsFor('center').safe === LANDING.caps.center.safe);
LANDING.gearTier = 1.0;

// --- blockers are explanatory
const r = evaluateLanding(snap({ vy: c.vy.safe + 2 }));
check('a non-perfect result explains itself', typeof r.blocker === 'string' && r.blocker.length > 0, r.blocker);
check('a perfect result has nothing to explain', evaluateLanding(snap({})).blocker === null);

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
