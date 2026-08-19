// Accessibility settings, key bindings and the logbook:
//   node test/settings-tests.js
//
// The rule these tests exist to hold: an accessibility setting changes how the
// game is *presented*, never how it behaves. A player who turns the shake off
// must be flying exactly the same simulation as one who leaves it on.
import { Input, ACTIONS, DEFAULT_KEYS, keyLabel } from '../src/input.js';
import { DEFAULT_SETTINGS } from '../src/ship.js';
import { defaultMeta, loadMeta, saveMeta } from '../src/save.js';
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

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
