// Accessibility settings, key bindings and the logbook:
//   node test/settings-tests.js
//
// The rule these tests exist to hold: an accessibility setting changes how the
// game is *presented*, never how it behaves. A player who turns the shake off
// must be flying exactly the same simulation as one who leaves it on.
import { Input, ACTIONS, DEFAULT_KEYS, keyLabel } from '../src/input.js';
import { DEFAULT_SETTINGS, Ship, SHIP, STEERING, STEERING_MODES } from '../src/ship.js';
import { defaultMeta, loadMeta, saveMeta } from '../src/save.js';
import { readFileSync } from 'node:fs';
import { Terrain } from '../src/terrain.js';
import { flyMission } from './pilot.js';
import { MOON_LEVELS } from '../src/missions.js';

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${e}`); } };

console.log('settings, bindings and the logbook');

/** A stand-in for `window` that records what was bound to it. */
function fakeTarget() {
  const handlers = {};
  return {
    addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); },
    fire: (type, ev) => (handlers[type] || []).forEach((fn) => fn(ev)),
  };
}

function makeInput() {
  const target = fakeTarget();
  const globalTarget = fakeTarget();
  const realWindow = globalThis.window;
  globalThis.window = globalTarget;
  const input = new Input(target);
  globalThis.window = realWindow;
  input._press = (key) => target.fire('keydown', { key, preventDefault() {} });
  input._release = (key) => target.fire('keyup', { key });
  return input;
}

// --- defaults
{
  const input = makeInput();
  check('every action has a default binding', ACTIONS.every((a) => input.bindings[a].length > 0));
  check('the defaults are the documented ones',
    JSON.stringify(input.bindings) === JSON.stringify(DEFAULT_KEYS));
  input._press(' ');
  check('the default booster key flies', input.thrust === true);
  input._release(' ');
  check('releasing it stops', input.thrust === false);
  check('key labels are readable', keyLabel(' ') === 'SPACE' && keyLabel('arrowup') === '↑' && keyLabel('f') === 'F');
}

// --- rebinding
{
  const input = makeInput();
  const next = input.rebind('thrust', 'f');
  check('a control can be moved', next.thrust.includes('f'));
  input._press('f');
  check('the new key flies', input.thrust === true);
  input._release('f');
  input._press(' ');
  check('the old key no longer does', input.thrust === false);
  input._release(' ');

  // Taking a key from another action leaves that action with something.
  const input2 = makeInput();
  input2.rebind('thrust', 'a');           // 'a' was the left burner
  check('a stolen key leaves the old action usable', input2.bindings.left.length > 0, JSON.stringify(input2.bindings.left));
  check('no action is ever left empty', ACTIONS.every((x) => input2.bindings[x].length > 0));
  check('the key belongs to exactly one action',
    ACTIONS.filter((x) => input2.bindings[x].includes('a')).length === 1);
}

// --- reserved keys
{
  const input = makeInput();
  for (const k of ['escape', 'enter', 'p', 'r', 'm']) {
    check(`${k} cannot be taken for a flight control`, input.rebind('thrust', k) === null);
  }
  check('the bindings survive a refused rebind', input.bindings.thrust.includes(' '));
  check('an unknown action is refused', input.rebind('warp', 'z') === null);
}

// --- restoring
{
  const input = makeInput();
  input.rebind('thrust', 'f');
  input.setBindings(null);
  check('null restores the defaults', JSON.stringify(input.bindings) === JSON.stringify(DEFAULT_KEYS));
  input.setBindings({ thrust: [], left: ['j'] });
  check('an empty list falls back to the default', input.bindings.thrust.length > 0);
  check('a partial map still binds every action', ACTIONS.every((a) => input.bindings[a].length > 0));
  check('what was given is honoured', input.bindings.left.includes('j'));
}

// --- one-shot actions
{
  const input = makeInput();
  let fired = 0;
  input.bindAction('ability', () => { fired++; });
  input._press('e');
  check('a bound action fires on press', fired === 1);
  input._release('e');
  input.rebind('ability', 'z');
  input._press('z');
  check('it follows the rebind', fired === 2);
  input._press('e');
  check('and no longer answers the old key', fired === 2);
}

// --- the settings themselves
{
  check('accessibility settings ship with sane defaults',
    DEFAULT_SETTINGS.shake === 1 && DEFAULT_SETTINGS.flash === 1 &&
    DEFAULT_SETTINGS.uiScale === 1 && DEFAULT_SETTINGS.highContrast === false);
  check('bindings default to "unset" rather than a snapshot', DEFAULT_SETTINGS.keys === null);

  // The load path fills in anything an older save has never heard of.
  const store = (() => {
    const m = new Map();
    return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, String(v)), remove: (k) => m.delete(k) };
  })();
  const old = defaultMeta();
  delete old.settings.shake;
  delete old.stats.bodies;
  saveMeta(old, store);
  const back = loadMeta(store).meta;
  const merged = { ...DEFAULT_SETTINGS, ...back.settings };
  check('an older save still lands on a full settings object',
    merged.shake === 1 && merged.uiScale === 1);
  check('and on a full logbook', !!back.stats.bodies && !!back.stats.moduleFlights);
}

// --- presentation must not touch the simulation
{
  // Two identical flights: the settings the accessibility screen changes are
  // not passed to the simulation at all, so this is a check that they never
  // sneak in through the flight settings object.
  const level = MOON_LEVELS[1];
  const terrain = new Terrain(level, 4242);
  const plain = flyMission(level, terrain, { settings: { ...DEFAULT_SETTINGS } });
  const adapted = flyMission(level, terrain, {
    settings: { ...DEFAULT_SETTINGS, shake: 0, flash: 0, uiScale: 1.25, highContrast: true },
  });
  check('an accessibility setting changes nothing about the flight',
    JSON.stringify(plain) === JSON.stringify(adapted),
    `${JSON.stringify(plain)} vs ${JSON.stringify(adapted)}`);

  // Steering, by contrast, is a real control change and must show.
  const direct = flyMission(level, terrain, { settings: { ...DEFAULT_SETTINGS, steering: 'direct' } });
  check('a steering change does show', JSON.stringify(plain) !== JSON.stringify(direct));
}

// --- **The steering split** (M29c)
//
// Tom cannot hold an attitude in classic steering and his son Ian can, which is
// the clearest signal this project has had that one control law was serving two
// very different pairs of hands. CLASSIC is the tuned mode now and PRO CLASSIC
// is the original.
//
// Three things have to hold, and the first is the one that protects everything
// else in the repo.
{
  const terrain = new Terrain(MOON_LEVELS[0], 1000);
  const fly = (steering, script, secs = 6) => {
    const ship = new Ship();
    ship.reset(1500, 600, 200);
    ship.applyLoadout(null);
    const set = { steering, invertRotation: false };
    const dt = 1 / 120;
    const trace = [];
    // `t = i * dt` rather than an accumulator, so the hand-reproduction below
    // can index the same frames. An accumulated `t += dt` drifts by a few ulps
    // and flips which frame a burner is released on, which showed up as a 4%
    // disagreement that looked like a physics difference and was not.
    for (let i = 0; i < Math.round(secs / dt); i++) {
      const t = i * dt;
      ship.step(dt, script(t), MOON_LEVELS[0], terrain, t, set);
      trace.push({ t: t + dt, spin: ship.spin, angle: ship.angle });
    }
    return trace;
  };

  // 1. **PRO is the original law, bit for bit.** `STEERING.pro` is
  //    `{ spinCap: 1, idleDamp: null }` precisely so that every line of the
  //    classic branch reduces to the arithmetic it had before the split. Both
  //    fixtures and every figure in BASELINE.md are measured against it.
  check('pro leaves the rotation cap untouched', STEERING.pro.spinCap === 1);
  check('pro adds no damping of its own', STEERING.pro.idleDamp === null);
  {
    // Reproduce the pre-split arithmetic by hand and require an exact match.
    const script = (t) => ({ thrust: false, left: t < 0.4, right: t >= 1.2 && t < 1.5, hold: false });
    const got = fly('pro', script, 3);
    let spin = 0, angle = 0;
    const dt = 1 / 120;
    for (let i = 0; i < Math.round(3 / dt); i++) {
      const t = i * dt;
      const inp = script(t);
      if (inp.left) spin -= SHIP.rcsAccel * dt;
      if (inp.right) spin += SHIP.rcsAccel * dt;
      spin = Math.max(-SHIP.maxSpin, Math.min(SHIP.maxSpin, spin));
      spin *= Math.pow(SHIP.spinDamp, dt * 60);
      angle += spin * dt;
    }
    const last = got[got.length - 1];
    check('pro reproduces the pre-split rotation exactly',
      Math.abs(last.spin - spin) < 1e-9 && Math.abs(last.angle - angle) < 1e-9,
      `spin ${last.spin} vs ${spin}, angle ${last.angle} vs ${angle}`);
  }

  // 2. **CLASSIC settles on release**, which is the whole point. A tap turns
  //    the nose and stops; the same tap in pro keeps turning past inverted.
  {
    const tap = (t) => ({ thrust: false, left: t < 0.4, right: false, hold: false });
    const pro = fly('pro', tap, 6);
    const cls = fly('classic', tap, 6);
    const stopped = (tr) => tr.find((x) => x.t > 0.5 && Math.abs(x.spin) < 0.05);
    check('classic stops rotating within a second of letting go',
      !!stopped(cls) && stopped(cls).t - 0.4 < 1, stopped(cls) ? `${(stopped(cls).t - 0.4).toFixed(2)}s` : 'never');
    check('pro keeps rotating, which is its character', !stopped(pro));
    const deg = (r) => Math.abs(r * 180 / Math.PI);
    check('a tap in classic turns a usable amount, not a nudge',
      deg(cls.find((x) => x.t >= 2).angle) > 15 && deg(cls.find((x) => x.t >= 2).angle) < 70,
      `${deg(cls.find((x) => x.t >= 2).angle).toFixed(0)}deg`);
  }

  // 3. **CLASSIC is not DIRECT.** The attitude you set has to persist, or this
  //    is just the assisted mode that already exists under another name. This
  //    is the assertion that stops a future "make it easier still" turning the
  //    mode into a duplicate.
  {
    const tap = (t) => ({ thrust: false, left: t < 0.25, right: false, hold: false });
    const cls = fly('classic', tap, 8);
    const at4 = cls.find((x) => x.t >= 4).angle;
    const at8 = cls[cls.length - 1].angle;
    check('classic holds the attitude you set', Math.abs(at4) > 0.1 && Math.abs(at8 - at4) < 0.02,
      `${(at4 * 180 / Math.PI).toFixed(1)}deg -> ${(at8 * 180 / Math.PI).toFixed(1)}deg`);
    const dir = fly('direct', tap, 8);
    check('...where direct returns to upright', Math.abs(dir[dir.length - 1].angle) < 0.01);
  }

  // 4. The vocabulary is shared, so the save layer cannot reject a mode the
  //    settings screen offers - which would reset the choice of the one player
  //    who picked the non-default.
  const mkStore = () => {
    const m = new Map();
    return { get: (k) => (m.has(k) ? m.get(k) : null), set: (k, v) => m.set(k, String(v)), remove: (k) => m.delete(k) };
  };
  check('every steering mode round-trips through a save', STEERING_MODES.every((mode) => {
    const store = mkStore();
    const meta = defaultMeta();
    meta.settings = { ...meta.settings, steering: mode };
    saveMeta(meta, store);
    return loadMeta(store).meta.settings.steering === mode;
  }));
  {
    const store = mkStore();
    const meta = defaultMeta();
    meta.settings = { ...meta.settings, steering: 'banana' };
    saveMeta(meta, store);
    check('an unknown mode falls back to the default',
      loadMeta(store).meta.settings.steering === DEFAULT_SETTINGS.steering,
      loadMeta(store).meta.settings.steering);
  }
  check('the default is the tuned mode, not the original',
    DEFAULT_SETTINGS.steering === 'classic', DEFAULT_SETTINGS.steering);
  // The settings screen has to offer every mode that exists. A mode added to
  // the table and not to the screen is unreachable; one on the screen that the
  // table does not know falls back silently. Both are caught by reading the
  // screen source for the action the button fires.
  {
    const src = readFileSync(new URL('../src/screens.js', import.meta.url), 'utf8');
    const offered = [...src.matchAll(/'steering', '([a-z]+)'/g)].map((m) => m[1]);
    check('the settings screen offers exactly the modes that exist',
      offered.length === STEERING_MODES.length && STEERING_MODES.every((m) => offered.includes(m)),
      `screen: ${offered.join(',')} / table: ${STEERING_MODES.join(',')}`);
  }
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
