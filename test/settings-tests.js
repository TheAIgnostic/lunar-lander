// Accessibility settings, key bindings and the logbook:
//   node test/settings-tests.js
//
// The rule these tests exist to hold: an accessibility setting changes how the
// game is *presented*, never how it behaves. A player who turns the shake off
// must be flying exactly the same simulation as one who leaves it on.
import { Input, ACTIONS, DEFAULT_KEYS, keyLabel, amountOf, isPadToken, PAD, PAD_UI } from '../src/input.js';
import { DEFAULT_SETTINGS, Ship, SHIP, STEERING, STEERING_MODES } from '../src/ship.js';
import { defaultMeta, loadMeta, saveMeta } from '../src/save.js';
import { readFileSync } from 'node:fs';
import { Terrain } from '../src/terrain.js';
import { flyMission } from './pilot.js';
import { MOON_LEVELS } from '../src/missions.js';

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${e}`); } };

console.log('settings, bindings and the logbook');

{
  // **The runtime carries one ability slot per `ACTIVE_SLOTS`**, asserted from
  // the source because `main.js` is the game loop and needs a browser.
  //
  // M37 added the second slot and the mutation that quietly builds it empty
  // raised **zero failures** in every suite - not because nothing checks it,
  // but because nothing in node can reach that line at all. Same answer as
  // M36's second thrust site: when the honest reason is "nothing goes there",
  // state the rule where it can be read.
  const loop = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('the loop builds its slots from ACTIVE_SLOTS',
    /g\.slots\s*=\s*ACTIVE_SLOTS\.map\(/.test(loop),
    'a hand-written slot list will drift from the equip rule and the screen');
  check('and steps every slot rather than one',
    /for \(const a of g\.slots \|\| \[\]\) \{\s*events\.push/.test(loop),
    'a slot that is not stepped is a module that never runs');
  check('and the second ability is bound to its own action',
    /bindAction\('ability2'/.test(loop) && /bindAction\('ability'/.test(loop),
    'both slots need a control of their own');
}


{
  // **God mode does not lose shuttles**, and it is written as a skipped
  // decrement rather than a topped-up count so nothing downstream meets a life
  // total that is not a number. Asserted from the source for the same reason
  // the CONTROLS labels are: `main.js` is the game loop and needs a browser.
  //
  // The crash still happens and is still counted - it is the *expedition* that
  // cannot end. Checked in both directions so the guard cannot quietly widen
  // into "god mode skips the crash".
  const loop = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const at = loop.indexOf('g.lives--');
  check('god mode does not spend a shuttle on a crash',
    /!meta\.godMode[^{]*\{\s*$/.test(loop.slice(0, at).trimEnd()),
    'the only g.lives-- is not guarded by the flag');
  check('and the crash is still counted',
    /meta\.stats\.crashes\+\+/.test(loop.slice(at, at + 200)),
    'god mode should cost you the lander, just not the expedition');
  check('there is exactly one place a shuttle is spent',
    loop.split('g.lives--').length - 1 === 1,
    'a second decrement will not be guarded');
}


{
  // **Every rebindable action has a name on the CONTROLS screen, and every name
  // is for a real action.**
  //
  // `ACTIONS` is derived from `DEFAULT_KEYS`, which is what lets a new control
  // reach the settings screen, the rebind rules, the save format and the pad
  // with nothing added. The one thing it does *not* carry is the human label,
  // and the miss is **silent**: the row appears, the binding works, and the
  // title reads `undefined`. M34's Emergency Arrest shipped exactly like that
  // and no test could see it, because no node test draws.
  //
  // Same shape as `BUILDERS` in M29 and `flightAssist`'s tips after it: a name
  // in one place indexing a table in another. Asserted in both directions, from
  // the source, because `screens.js` needs a browser to import.
  const src = readFileSync(new URL('../src/screens.js', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf("case 'keys': {"));
  const table = block.slice(block.indexOf('const names = {'), block.indexOf('};'));
  const named = [...table.matchAll(/(\w+):\s*'/g)].map((m) => m[1]);
  for (const a of ACTIONS) {
    check(`the CONTROLS screen names "${a}"`, named.includes(a),
      'the row will render its title as undefined');
  }
  for (const n of named) {
    check(`the CONTROLS screen names something real: "${n}"`, ACTIONS.includes(n),
      'a label for an action that no longer exists');
  }
}

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
  // The window-level listeners: focus loss, and the pad hot-plug events.
  input._blur = () => globalTarget.fire('blur', {});
  input._padConnect = (gamepad) => globalTarget.fire('gamepadconnected', { gamepad });
  input._padDisconnect = (gamepad) => globalTarget.fire('gamepaddisconnected', { gamepad });
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
  // **A free key, derived rather than chosen.** This used to move the booster
  // onto `f`, which was unbound until M34 gave it to Emergency Arrest - at
  // which point `rebind` correctly refused (it would have left an action with
  // no keyboard control) and the test died on a null. The rule it is checking
  // was right and the constant was stale, which is the failure mode a
  // hard-coded key has every time the default map grows.
  const taken = new Set(ACTIONS.flatMap((a) => DEFAULT_KEYS[a]));
  const free = 'zxcvbnmghjkl'.split('').find((k) => !taken.has(k));
  check('the default map leaves a key free to rebind onto', !!free);
  const next = input.rebind('thrust', free);
  check('a control can be moved', next.thrust.includes(free));
  input._press(free);
  check('the new key flies', input.thrust === true);
  input._release(free);
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

// --- **The hangar and the loadout are reachable on the same terms** (M29d)
//
// Tom went looking for the skill tree mid-run and it was not there. It lives on
// the LOADOUT screen, and the menu had hidden that button whenever an
// expedition was in progress - since M24, which un-hid HANGAR and left LOADOUT
// hidden. So for the length of a run there was nowhere to read the skill tree,
// and nowhere to see research data at all, M29a having taken it off the hangar
// screen because the hangar cannot spend it.
//
// The rule is unchanged - skills and modules are still only *changed* at a
// supply stop - but the refusal belongs on the action, not on the button. A
// button that is absent is worse than one that says why, which is the M16 rule
// this fell foul of.
{
  const src = readFileSync(new URL('../src/screens.js', import.meta.url), 'utf8');
  const menu = src.slice(src.indexOf("case 'menu':"), src.indexOf("case 'help':"));
  const lineFor = (action) => (menu.split('\n').find((l) => l.includes(`btn('${action}'`)) || '');
  const guarded = (action) => /\?\s*''\s*:|:\s*''/.test(lineFor(action));
  check('the menu offers the hangar during a run', !guarded('hangar'), lineFor('hangar').trim());
  check('the menu offers the loadout during a run', !guarded('outfit'), lineFor('outfit').trim());
  check('...on the same terms as each other',
    guarded('hangar') === guarded('outfit'),
    `hangar ${guarded('hangar')} / outfit ${guarded('outfit')}`);

  // And the lock moved rather than lapsed: both spend paths refuse in-run.
  const actions = readFileSync(new URL('../src/actions.js', import.meta.url), 'utf8');
  const handler = (name) => {
    const i = actions.indexOf(`action.startsWith('${name}:')`);
    return i < 0 ? '' : actions.slice(i, i + 400);
  };
  for (const name of ['skill', 'equip']) {
    check(`${name}: refuses outside the loadout window`,
      /g\.run && !g\.loadoutWindow/.test(handler(name)) && /flow\.toast/.test(handler(name)),
      handler(name).split('\n').slice(0, 5).join(' ').trim().slice(0, 90));
    check(`${name}: god mode still holds the window open`,
      /!meta\.godMode/.test(handler(name)));
  }
}

// ---------------------------------------------------------------------------
// The input contract is a magnitude, and the keyboard is its degenerate case.
//
// M30 widened what the simulation reads from a boolean to a 0..1 amount so that
// an analog trigger can arrive without the flight model forking - two flight
// models being the fault this project has been burned by three times. The whole
// design rests on one arithmetic fact: the keyboard produces *exactly* 1.0 and
// *exactly* 0.0, and `x * 1.0 === x` under IEEE-754, so widening the contract
// cannot move a keyboard flight by a single ulp.
//
// Both fixtures are the milestone's gate, but neither is this claim: the
// physics fixture compares to four decimal places and the flight fixture to
// `outcome/grade/fuelLeft/simSecs`. Those are tolerances. What is asserted here
// is the exactness the tolerances rest on, because the day `amount()` starts
// returning a smoothed 0.999 for a held key, every recorded figure in
// `test/BASELINE.md` quietly stops measuring the game it was measured against
// and no rounded fixture will say so.
{
  const input = makeInput();

  // 1. Exactly 1 and exactly 0 - not 1.0000001, not `true`, not -0.
  for (const a of ['thrust', 'left', 'right', 'hold']) {
    input._press(DEFAULT_KEYS[a][0]);
    check(`amount(${a}) is exactly 1 while held`, Object.is(input.amount(a), 1), String(input.amount(a)));
    input._release(DEFAULT_KEYS[a][0]);
    check(`amount(${a}) is exactly 0 while released`, Object.is(input.amount(a), 0), String(input.amount(a)));
  }

  // 2. It never disagrees with `held()`. Two sources of truth for "is the
  //    booster on" is how the HUD ends up lit while the engine is off.
  for (const a of ACTIONS) {
    for (const on of [false, true]) {
      if (on) input._press(DEFAULT_KEYS[a][0]);
      check(`amount and held agree on ${a} (${on})`, (input.amount(a) > 0) === input.held(a));
      if (on) input._release(DEFAULT_KEYS[a][0]);
    }
  }

  // 3. Touch is a button too, so it answers 1 or 0 like a key does.
  input.touch.thrust = true;
  check('a touch button reads exactly 1', Object.is(input.amount('thrust'), 1));
  input.touch.thrust = false;

  // 4. `amountOf` is what `ship.js` actually calls, and it meets three shapes:
  //    the real device, the plain boolean object `test/pilot.js` rewrites every
  //    step, and a number for a test that wants a partial throttle with no
  //    device at all. A `true` must become exactly 1 or the fixtures move.
  check('amountOf reads a device', Object.is(amountOf(input, 'thrust'), 0));
  check('amountOf turns true into exactly 1', Object.is(amountOf({ thrust: true }, 'thrust'), 1));
  check('amountOf turns false into exactly 0', Object.is(amountOf({ thrust: false }, 'thrust'), 0));
  check('amountOf treats a missing action as 0', Object.is(amountOf({}, 'thrust'), 0));
  check('amountOf survives no input at all', Object.is(amountOf(null, 'thrust'), 0));
  check('amountOf takes a number at its word', amountOf({ thrust: 0.37 }, 'thrust') === 0.37);
  check('amountOf clamps above 1', amountOf({ thrust: 4 }, 'thrust') === 1);
  check('amountOf clamps below 0', Object.is(amountOf({ thrust: -3 }, 'thrust'), 0));
}

// And the property the two facts above add up to: a flight flown on booleans
// and the same flight flown on the numbers 1 and 0 are the same flight, to the
// bit. This is the fixtures' claim stated at full precision - and it is stated
// here rather than left in a scratchpad because it is the invariant stage 2
// has to not break when a real trigger starts feeding these numbers.
{
  const view = new DataView(new ArrayBuffer(8));
  const bits = (x) => { view.setFloat64(0, x); return view.getBigUint64(0); };
  const terrain = new Terrain(MOON_LEVELS[0], 4242);
  // Awkward on purpose: burn, tilt, coast, counter-tilt, hold, burn.
  const phase = (t) => ({
    thrust: t < 1.2 || (t >= 3.0 && t < 4.2) || t >= 5.4,
    left: t >= 0.8 && t < 2.2,
    right: t >= 3.6 && t < 4.8,
    hold: t >= 4.8 && t < 5.4,
  });
  const fly = (numeric, mode) => {
    const ship = new Ship();
    ship.reset(1500, 600, 200);
    ship.applyLoadout(null);
    const dt = 1 / 120;
    const trace = [];
    for (let i = 0; i < Math.round(7 / dt); i++) {
      const t = i * dt;
      const p = phase(t);
      const inp = numeric
        ? { thrust: p.thrust ? 1 : 0, left: p.left ? 1 : 0, right: p.right ? 1 : 0, hold: p.hold ? 1 : 0 }
        : p;
      ship.step(dt, inp, MOON_LEVELS[0], terrain, t, { steering: mode, invertRotation: false });
      for (const v of [ship.x, ship.y, ship.vx, ship.vy, ship.angle, ship.spin, ship.fuel, ship.throttle]) trace.push(bits(v));
    }
    return trace;
  };
  for (const mode of STEERING_MODES) {
    const a = fly(false, mode), b = fly(true, mode);
    let differing = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differing++;
    check(`booleans and exact 1/0 fly identically in ${mode}, to the bit`,
      differing === 0, `${differing} of ${a.length} values differ`);
  }

  // The other half of the same property: the magnitude must actually *reach*
  // the physics. A widening that silently ignored the number would pass every
  // check above and every fixture, and would be a contract that does nothing.
  const burnFor = (amount) => {
    const ship = new Ship();
    ship.reset(1500, 600, 200);
    ship.applyLoadout(null);
    const dt = 1 / 120;
    for (let i = 0; i < 120; i++) {
      ship.step(dt, { thrust: amount, left: 0, right: 0, hold: 0 }, MOON_LEVELS[0], terrain, i * dt,
        { steering: 'pro', invertRotation: false });
    }
    return { spent: 200 - ship.fuel, vy: ship.vy };
  };
  const full = burnFor(1), half = burnFor(0.5), none = burnFor(0);
  check('half throttle burns about half the fuel',
    Math.abs(half.spent - full.spent / 2) < 1e-9, `${half.spent} vs ${full.spent / 2}`);
  check('half throttle gives less than full acceleration', half.vy > full.vy && half.vy < none.vy,
    `full ${full.vy} half ${half.vy} none ${none.vy}`);
}

// ---------------------------------------------------------------------------
// M30 stage 2-5: the gamepad, tested at the mapping seam.
//
// There is no pad in node and none in a headless browser, so the thing that can
// be tested is the seam: **a fake pad object in, an intent out.** That is a pure
// function and it is where the bugs are. The physics is deliberately not tested
// through a gamepad - stage 1 proved the flight model by leaving both fixtures
// unmoved, and re-proving it through a device would only measure the device.
{
  // A Standard Gamepad, filled in as a test asks. Triggers are analog, so
  // `buttons[6]` and `buttons[7]` carry a value rather than just a flag - which
  // is the whole reason any of this exists.
  const fakePad = (over = {}) => ({
    index: over.index != null ? over.index : 0,
    id: over.id || 'Test Pad (STANDARD GAMEPAD)',
    connected: over.connected !== false,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      value: over.buttons && over.buttons[i] != null ? over.buttons[i] : 0,
      pressed: !!(over.buttons && over.buttons[i] >= 0.5),
    })),
    axes: Array.from({ length: 4 }, (_, i) => (over.axes && over.axes[i] != null ? over.axes[i] : 0)),
  });

  // 1. **The two endpoints are exact.** This is the same property stage 1 rests
  //    on, extended to the pad: at rest exactly 0, at the stop exactly 1. If a
  //    trigger at the stop returned 0.998 then a pad player would be flying a
  //    measurably different game from every figure in test/BASELINE.md.
  {
    const input = makeInput();
    input.pollGamepad([fakePad()]);
    check('a pad at rest reads exactly 0', Object.is(input.amount('thrust'), 0), String(input.amount('thrust')));
    input.pollGamepad([fakePad({ buttons: { 7: 1 } })]);
    check('a trigger at the stop reads exactly 1', Object.is(input.amount('thrust'), 1), String(input.amount('thrust')));
    input.pollGamepad([fakePad({ axes: { 0: -1 } })]);
    check('a stick at the stop reads exactly 1', Object.is(input.amount('left'), 1), String(input.amount('left')));
    // And the exactness survives *saturate*, so a trigger that never quite
    // reaches 1.0 - which is most of them - still commands a full burn.
    input.pollGamepad([fakePad({ buttons: { 7: PAD.saturate } })]);
    check('a trigger at the saturation point reads exactly 1', Object.is(input.amount('thrust'), 1));
  }

  // 2. Noise below the floor is not intent.
  {
    const input = makeInput();
    input.pollGamepad([fakePad({ axes: { 0: -PAD.deadzone }, buttons: { 7: PAD.triggerFloor } })]);
    check('a resting stick is exactly 0', Object.is(input.amount('left'), 0), String(input.amount('left')));
    check('a resting trigger is exactly 0', Object.is(input.amount('thrust'), 0), String(input.amount('thrust')));
    check('a resting pad is not "held"', !input.held('left') && !input.held('thrust'));
  }

  // 2b. **Inside** the dead band, not merely at its edge - and the reason this
  //     is its own check is that it was not caught by testing the boundary. The
  //     shaping subtracts the floor before raising to a power, so a reading
  //     *below* the floor with no guard is `Math.pow(negative, 1.5)`, which is
  //     **NaN** - and a NaN amount multiplies straight into `vx`/`vy` and puts
  //     the lander nowhere at all. A test at exactly the floor returns a clean
  //     zero either way and says nothing.
  {
    const input = makeInput();
    input.pollGamepad([fakePad({ axes: { 0: -0.10 } })]);
    check('a stick inside the dead band is exactly 0', Object.is(input.amount('left'), 0), String(input.amount('left')));
    input.pollGamepad([fakePad({ buttons: { 7: 0.03 } })]);
    check('a trigger inside its floor is exactly 0', Object.is(input.amount('thrust'), 0), String(input.amount('thrust')));
  }

  // 2c. And the property that covers every reading at once, including the ones
  //     no real pad should ever send. Whatever comes off the wire, what reaches
  //     `ship.js` must be a finite number in 0..1 - it gets multiplied into the
  //     velocity, so a NaN, a negative or a 1.4 is not a bad control feel, it is
  //     a lander that leaves the world.
  {
    const input = makeInput();
    let bad = null;
    for (let raw = -1.5; raw <= 1.5001 && !bad; raw += 0.01) {
      const r = Math.round(raw * 1000) / 1000;
      input.pollGamepad([fakePad({ axes: { 0: r }, buttons: { 7: r, 6: r, 2: r } })]);
      for (const a of ACTIONS) {
        const v = input.amount(a);
        if (!Number.isFinite(v) || v < 0 || v > 1) { bad = `${a} = ${v} at raw ${r}`; break; }
      }
    }
    check('every raw pad reading maps into a finite 0..1', !bad, bad || '');

    // Including a pad that reports nonsense. Two things refuse a NaN and both
    // are load-bearing: `shape()` (`!(NaN > floor)` is true) and the fold in
    // `pollGamepad` (`NaN > 0` is false, which is why it is not `Math.max`).
    input.pollGamepad([fakePad({ axes: { 0: NaN }, buttons: { 7: NaN } })]);
    check('a pad reporting NaN reads exactly 0', Object.is(input.amount('left'), 0)
      && Object.is(input.amount('thrust'), 0), `${input.amount('left')} ${input.amount('thrust')}`);
    input.pollGamepad([fakePad({ axes: { 0: -Infinity }, buttons: { 7: Infinity } })]);
    check('a pad reporting Infinity clamps to 1', input.amount('left') === 1 && input.amount('thrust') === 1,
      `${input.amount('left')} ${input.amount('thrust')}`);
  }

  // 3. The middle is genuinely analog, and monotonic. A widening that produced
  //    only 0 and 1 from a trigger would pass every check above.
  {
    const input = makeInput();
    const at = (v) => { input.pollGamepad([fakePad({ buttons: { 7: v } })]); return input.amount('thrust'); };
    const q = at(0.3), h = at(0.55), t = at(0.8);
    check('a half-pulled trigger is between the endpoints', h > 0 && h < 1, String(h));
    check('trigger response is monotonic', q < h && h < t, `${q} ${h} ${t}`);
  }

  // 4. Direction. A stick pushed left must not also drive right, which is the
  //    single easiest sign error to make here and invisible until you fly it.
  {
    const input = makeInput();
    input.pollGamepad([fakePad({ axes: { 0: -1 } })]);
    check('stick left drives left', input.amount('left') === 1);
    check('stick left does not drive right', Object.is(input.amount('right'), 0), String(input.amount('right')));
    input.pollGamepad([fakePad({ axes: { 0: 1 } })]);
    check('stick right drives right', input.amount('right') === 1);
    check('stick right does not drive left', Object.is(input.amount('left'), 0));
  }

  // 5. **A connected but idle pad may not change what the keyboard reports.**
  //    This is the one that would move the fixtures for a player who owns a
  //    controller and flies on keys anyway.
  {
    const input = makeInput();
    input.pollGamepad([fakePad()]);
    for (const a of ['thrust', 'left', 'right', 'hold']) {
      input._press(DEFAULT_KEYS[a][0]);
      check(`key + idle pad still reads exactly 1 (${a})`, Object.is(input.amount(a), 1), String(input.amount(a)));
      input._release(DEFAULT_KEYS[a][0]);
      check(`released key + idle pad still reads exactly 0 (${a})`, Object.is(input.amount(a), 0), String(input.amount(a)));
    }
    // And a key beats a feathered trigger rather than averaging with it.
    input.pollGamepad([fakePad({ buttons: { 7: 0.4 } })]);
    input._press(' ');
    check('a held key wins over a part-pulled trigger', Object.is(input.amount('thrust'), 1), String(input.amount('thrust')));
    input._release(' ');
  }

  // 6. One-shot actions. `ability` fires from a keydown on the keyboard; the pad
  //    has no event, so the rising edge has to be found between polls. Once per
  //    press, not once per frame - or holding X empties the module.
  {
    const input = makeInput();
    let fired = 0;
    input.bindAction('ability', () => { fired++; });
    input.pollGamepad([fakePad()]);
    check('ability does not fire on an idle pad', fired === 0);
    input.pollGamepad([fakePad({ buttons: { 2: 1 } })]);
    check('ability fires on the press', fired === 1, String(fired));
    input.pollGamepad([fakePad({ buttons: { 2: 1 } })]);
    input.pollGamepad([fakePad({ buttons: { 2: 1 } })]);
    check('ability does not re-fire while held', fired === 1, `fired ${fired} times while held`);
    input.pollGamepad([fakePad()]);
    input.pollGamepad([fakePad({ buttons: { 2: 1 } })]);
    check('ability fires again after a release', fired === 2, String(fired));
  }

  // 7. The CONTROLS screen listens on '*' for a key; a pad token has to arrive
  //    the same way or a trigger cannot be bound through the flow that exists.
  {
    const input = makeInput();
    const seen = [];
    input.bind('*', (k) => seen.push(k));
    input.pollGamepad([fakePad({ buttons: { 5: 1 } })]);
    check('a pad press reaches the rebinding hook', seen[0] === 'pad:5', JSON.stringify(seen));
    input.pollGamepad([fakePad({ buttons: { 5: 1 } })]);
    check('and does not repeat while held', seen.length === 1, JSON.stringify(seen));
    input.pollGamepad([fakePad({ axes: { 1: -1 } })]);
    check('a stick push reaches it as an axis token', seen[1] === 'axis:1-', JSON.stringify(seen));
    input.pollGamepad([fakePad({ axes: { 0: 0.2 } })]);
    check('a barely-moved stick captures nothing', seen.length === 2, JSON.stringify(seen));
  }

  // 8. Hot-plug. A pad unplugged mid-flight hands control back to the keyboard;
  //    it never leaves the last reading latched on.
  {
    const input = makeInput();
    input.pollGamepad([fakePad({ buttons: { 7: 1 } })]);
    check('pad drives thrust while connected', input.amount('thrust') === 1);
    input.pollGamepad([]);
    check('an unplugged pad reads 0, not the last value', Object.is(input.amount('thrust'), 0), String(input.amount('thrust')));
    input.pollGamepad(null);
    check('no pad list at all is survivable', Object.is(input.amount('thrust'), 0));
    // A pinned pad that has gone falls back rather than going dead.
    input.padIndex = 3;
    input.pollGamepad([fakePad({ index: 0, buttons: { 7: 1 } })]);
    check('a pinned pad that vanished falls back to one that is there', input.amount('thrust') === 1);
    check('and stops claiming to be pinned to it', input.padIndex === null);
    // A slot the browser reports as empty is skipped, not read.
    input.pollGamepad([null, fakePad({ index: 1, buttons: { 7: 1 } })]);
    check('an empty pad slot is skipped', input.amount('thrust') === 1);
  }

  // 8b. The connect event is a *label*, not the plumbing. `pollGamepad` asks the
  //     browser every frame regardless, because a pad is famously invisible to
  //     `getGamepads()` until it has been touched - so a player who plugs in and
  //     presses a button gets no event to hang anything on, and the game has to
  //     work anyway.
  {
    const input = makeInput();
    check('a pad works with no connect event at all', (() => {
      input.pollGamepad([fakePad({ index: 0, buttons: { 7: 1 } })]);
      return input.amount('thrust') === 1;
    })());
    input._padConnect({ index: 1, id: 'Second Pad' });
    check('connecting names the pad', input.padName === 'Second Pad', String(input.padName));
    input._padDisconnect({ index: 1, id: 'Second Pad' });
    check('disconnecting unpins it', input.padIndex === null && input.padName === null);
    check('and zeroes what it was reporting', Object.is(input.amount('thrust'), 0), String(input.amount('thrust')));
  }

  // 8c. **The interface controls.** A pad flies the lander; without these it
  //     cannot get past the brief that launches the mission. The pad does not
  //     get a menu layer of its own - it presses the keys the interface already
  //     listens on, so every screen and every `input.bind(...)` keeps working.
  {
    const input = makeInput();
    const fired = [];
    input.bind(' ', () => fired.push('confirm'));
    input.bind('escape', () => fired.push('back'));

    input.pollGamepad([fakePad()]);
    check('an idle pad presses nothing', fired.length === 0, JSON.stringify(fired));

    input.pollGamepad([fakePad({ buttons: { 0: 1 } })]);
    check('A confirms, like SPACE', fired[0] === 'confirm', JSON.stringify(fired));
    input.pollGamepad([fakePad({ buttons: { 0: 1 } })]);
    check('and does not repeat while held', fired.length === 1, JSON.stringify(fired));
    input.pollGamepad([fakePad()]);
    input.pollGamepad([fakePad({ buttons: { 0: 1 } })]);
    check('and confirms again after a release', fired.length === 2, JSON.stringify(fired));

    input.pollGamepad([fakePad()]);
    input.pollGamepad([fakePad({ buttons: { 1: 1 } })]);
    check('B backs out, like Escape', fired[2] === 'back', JSON.stringify(fired));
    input.pollGamepad([fakePad()]);
    input.pollGamepad([fakePad({ buttons: { 9: 1 } })]);
    check('START backs out too', fired[3] === 'back', JSON.stringify(fired));

    // Every interface control maps to a key something is actually bound to.
    // The M29 rule: a name in content indexing a table in code must resolve,
    // because the failure mode is a button that silently does nothing.
    check('every PAD_UI control maps to a key the interface binds',
      Object.values(PAD_UI).every((k) => input.onPress.has(k)), JSON.stringify(PAD_UI));
  }

  // 8d. **The ordering that stops the back button binding itself.** B is
  //     Escape; Escape cancels a listening rebind; the rebind capture reads the
  //     same flag. So the interface key has to fire *before* the capture, which
  //     is the order a `keydown` already has. Get it the other way round and
  //     pressing B on the CONTROLS screen binds B to whatever was listening,
  //     and the player can no longer back out of anything.
  {
    const input = makeInput();
    let listening = true;
    const seen = [];
    input.bind('escape', () => { listening = false; });
    input.bind('*', (k) => { if (listening) seen.push(k); });
    input.pollGamepad([fakePad({ buttons: { 1: 1 } })]);
    check('B cancels the rebind rather than being captured by it',
      !listening && seen.length === 0, JSON.stringify(seen));
    check('B is reserved from being taken for a flight control',
      input.rebind('thrust', 'pad:1') === null);
    // A is not reserved, because it is SPACE's counterpart and SPACE is a
    // flight control a player is allowed to move.
    check('A can still be taken for a flight control', input.rebind('hold', 'pad:0') !== null);
  }

  // 8e. **Menu navigation, as steps rather than a held direction.** One push
  //     moves one item; holding repeats after a pause, the way a held arrow key
  //     does. Without the pause a single flick crosses the ten-card ladder
  //     before you let go, and without the hysteresis a stick resting near the
  //     threshold emits a step every few frames.
  {
    const input = makeInput();
    const steps = (pads, dt, n) => {
      let count = 0;
      for (let i = 0; i < n; i++) { input.pollGamepad(pads, dt); if (input.nav.x) count++; }
      return count;
    };

    input.pollGamepad([fakePad()], 1 / 60);
    check('a centred stick emits nothing', input.nav.x === 0 && input.nav.y === 0);

    // One push, one step - and not another for as long as it is held, until
    // the repeat delay is up.
    input.pollGamepad([fakePad({ axes: { 0: 1 } })], 1 / 60);
    check('a push emits one step', input.nav.x === 1, String(input.nav.x));
    check('and only one', steps([fakePad({ axes: { 0: 1 } })], 1 / 60, 10) === 0);

    // Held long enough, it repeats.
    const repeats = steps([fakePad({ axes: { 0: 1 } })], 1 / 60, 60);
    check('holding repeats after a pause', repeats >= 3 && repeats <= 12, `${repeats} in 1s`);

    // Directions, and the vertical axis.
    input.pollGamepad([fakePad()], 1 / 60);
    input.pollGamepad([fakePad({ axes: { 0: -1 } })], 1 / 60);
    check('pushing left steps left', input.nav.x === -1, String(input.nav.x));
    input.pollGamepad([fakePad()], 1 / 60);
    input.pollGamepad([fakePad({ axes: { 1: 1 } })], 1 / 60);
    check('pushing down steps down', input.nav.y === 1, String(input.nav.y));

    // The d-pad drives the same thing, so a player who never touches the stick
    // is not locked out of the menus.
    input.pollGamepad([fakePad()], 1 / 60);
    input.pollGamepad([fakePad({ buttons: { 15: 1 } })], 1 / 60);
    check('the d-pad navigates too', input.nav.x === 1, String(input.nav.x));

    // A half-pushed stick is not a direction, and the hysteresis band holds
    // whatever it had rather than chattering.
    input.pollGamepad([fakePad()], 1 / 60);
    check('a stick at 0.45 is not a push', steps([fakePad({ axes: { 0: 0.45 } })], 1 / 60, 20) === 0);
    // The case the hysteresis exists for, and it is not "eases back to centre"
    // - that returns 0 steps either way. It is a stick **wobbling across the
    // threshold**, which is what a thumb resting on one actually does. Without
    // the band each dip below `press` counts as a release and the next rise
    // counts as a fresh push, so one held direction machine-guns the cursor
    // across the list.
    input.pollGamepad([fakePad()], 1 / 60);
    let wobbleSteps = 0;
    for (let i = 0; i < 12; i++) {
      input.pollGamepad([fakePad({ axes: { 0: i % 2 ? 0.40 : 0.62 } })], 0);
      if (input.nav.x) wobbleSteps++;
    }
    check('a stick wobbling across the threshold steps once, not once per wobble',
      wobbleSteps === 1, `${wobbleSteps} steps from one held direction`);

    // And navigation is shaped-free: the throttle curve exists to put a hover
    // point mid-travel, which is exactly wrong for "did they mean it".
    input.pollGamepad([fakePad()], 1 / 60);
    input.pollGamepad([fakePad({ axes: { 0: PAD.deadzone + 0.01 } })], 1 / 60);
    check('a barely-deflected stick does not navigate', input.nav.x === 0, String(input.nav.x));
  }

  // 9. Losing focus drops the pad, exactly as it drops the keys. Otherwise a
  //    trigger held while alt-tabbing stays burning.
  {
    const input = makeInput();
    input.pollGamepad([fakePad({ buttons: { 7: 1 } })]);
    check('trigger is live before blur', input.amount('thrust') === 1);
    input._blur();
    check('blur releases the pad too', Object.is(input.amount('thrust'), 0), String(input.amount('thrust')));
    // And an interface control held across the blur re-fires on the way back,
    // rather than being stuck down and eating the next real press.
    let confirms = 0;
    input.bind(' ', () => confirms++);
    input.pollGamepad([fakePad({ buttons: { 0: 1 } })]);
    input._blur();
    input.pollGamepad([fakePad({ buttons: { 0: 1 } })]);
    check('an interface control is not stuck down across a blur', confirms === 2, String(confirms));
  }
}

// The binding map holds both families, and the rules that protected a keyboard
// player have to keep protecting them now that a pad shares the map.
{
  check('every default binding is a key or a parseable pad token', ACTIONS.every((a) =>
    DEFAULT_KEYS[a].every((k) => typeof k === 'string' && k.length > 0 &&
      (!isPadToken(k) || /^(pad:\d+|axis:\d+[-+])$/.test(k)))),
    JSON.stringify(DEFAULT_KEYS));

  // Same rule the hazard table lives under: a name in content indexing a table
  // in code must resolve, because the failure mode is silence. A pad token that
  // labels as "PAD 23" is a binding nobody can read on the settings screen.
  for (const a of ACTIONS) {
    for (const k of DEFAULT_KEYS[a]) {
      check(`${a}: ${k} has a readable label`, !!keyLabel(k) && !/^(PAD|AXIS) /.test(keyLabel(k)), keyLabel(k));
    }
  }

  // No control drives two actions, in either family.
  {
    const seen = new Map();
    let clash = null;
    for (const a of ACTIONS) for (const k of DEFAULT_KEYS[a]) {
      if (seen.has(k)) clash = `${k} on both ${seen.get(k)} and ${a}`;
      seen.set(k, a);
    }
    check('no default control drives two actions', !clash, clash || '');
  }

  check('every action has a keyboard binding', ACTIONS.every((a) => DEFAULT_KEYS[a].some((k) => !isPadToken(k))));
  check('every flight action has a pad binding', ['thrust', 'left', 'right', 'hold', 'ability']
    .every((a) => DEFAULT_KEYS[a].some((k) => isPadToken(k))));

  // **Rebinding replaces within a family, never across one.** Before M30 this
  // set the action's bindings to `[key]`, which was right when they were all
  // keys. With a pad in the same map that would mean binding the booster to a
  // trigger silently unbinds the space bar - and the player who did it finds
  // out the next time they put the pad down.
  {
    const input = makeInput();
    input.rebind('thrust', 'pad:5');
    check('binding a pad control keeps the keys', input.bindings.thrust.includes(' '), JSON.stringify(input.bindings.thrust));
    check('binding a pad control replaces the pad controls', input.bindings.thrust.includes('pad:5')
      && !input.bindings.thrust.includes('pad:7'), JSON.stringify(input.bindings.thrust));
  }
  {
    const input = makeInput();
    input.rebind('thrust', 'j');
    check('binding a key keeps the pad controls', input.bindings.thrust.includes('pad:7'), JSON.stringify(input.bindings.thrust));
    check('binding a key replaces the keys', input.bindings.thrust.includes('j')
      && !input.bindings.thrust.includes(' '), JSON.stringify(input.bindings.thrust));
  }
  {
    // The case that actually separates "replace within a family" from "replace
    // everything and let the restore rule patch it up": a player who has
    // customised *both* families. Restoring from DEFAULT_KEYS silently throws
    // away the choice they made first, and it looks fine on a fresh install.
    const input = makeInput();
    input.rebind('thrust', 'pad:5');
    input.rebind('thrust', 'j');
    check('rebinding a key keeps a pad control the player chose earlier',
      input.bindings.thrust.includes('pad:5'), JSON.stringify(input.bindings.thrust));
    check('and does not resurrect the default pad control',
      !input.bindings.thrust.includes('pad:7'), JSON.stringify(input.bindings.thrust));
    input.rebind('thrust', 'pad:4');
    check('and it works the other way round too',
      input.bindings.thrust.includes('j') && input.bindings.thrust.includes('pad:4')
      && !input.bindings.thrust.includes('pad:5'), JSON.stringify(input.bindings.thrust));
  }
  {
    // Taking a pad control from another action takes it from there, and leaves
    // that action's keys intact.
    const input = makeInput();
    input.rebind('hold', 'pad:7');
    check('a stolen pad control leaves the loser its keys', input.bindings.thrust.includes(' '));
    check('a stolen pad control is gone from the loser', !input.bindings.thrust.includes('pad:7'),
      JSON.stringify(input.bindings.thrust));
    check('and the loser is not left with no pad control at all', input.bindings.thrust.some(isPadToken),
      JSON.stringify(input.bindings.thrust));
  }
  {
    // START and HOME are reserved for the same reason Escape is: they are how
    // a player gets out of a game, on every other game they own.
    const input = makeInput();
    check('START cannot be taken for a flight control', input.rebind('thrust', 'pad:9') === null);
    check('HOME cannot be taken for a flight control', input.rebind('thrust', 'pad:16') === null);
    check('escape is still reserved', input.rebind('thrust', 'escape') === null);
  }
  {
    // And the guarantee that has to survive all of it: no action may end up
    // reachable only on a pad, because a keyboard is the device everyone has.
    const input = makeInput();
    for (const a of ACTIONS) for (const k of ['pad:3', 'pad:4', 'pad:5', 'pad:11']) input.rebind(a, k);
    check('no action is ever left pad-only', ACTIONS.every((a) => input.bindings[a].some((k) => !isPadToken(k))),
      JSON.stringify(input.bindings));
  }
  {
    // A saved binding map round-trips both families - a pad binding that the
    // save layer dropped would work for one session and reset on the next
    // launch, which is the M29c steering-mode fault in a different file.
    const input = makeInput();
    input.rebind('thrust', 'pad:5');
    const saved = JSON.parse(JSON.stringify(input.bindings));
    const fresh = makeInput();
    fresh.setBindings(saved);
    check('a binding map survives a save/load round trip',
      JSON.stringify(fresh.bindings) === JSON.stringify(input.bindings), JSON.stringify(fresh.bindings.thrust));
  }
}



{
  // --- **Nothing reads a `g` that nothing writes.** --------------------------
  //
  // The generalisation of a fault this project has now shipped four times: an
  // identifier that is *read* on a path no node test executes and *assigned*
  // nowhere. Three of them were free variables and crashed the game (M30e's
  // `ship`, M31's `rad`, M35's `bonus`). The fourth was quieter and shipped
  // longer: `main.js` logged a crash as
  //
  //     reason: (ship.landingResult && ship.landingResult.blocker) || g.crashReason || 'impact'
  //
  // and **nothing in the codebase has ever assigned `g.crashReason`.** A
  // property read is not a ReferenceError, so it did not throw - it just
  // silently fell through, and every lander lost to a gun, a ram, its own
  // charge or the weather was filed as `reason=impact` in the playtest log Tom
  // pastes into chat. A field of a debugging tool that was only ever right by
  // accident.
  //
  // `g` is the shared mutable state, so the honest set of keys is "declared in
  // `state.js`, or assigned by somebody" - and a read outside that set is a
  // name that can only ever be `undefined`. Structural, because these three
  // files need a browser (AUDIT.md section 4, case 3).
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const read = (f) => strip(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8'));
  const files = ['state.js', 'main.js', 'screens.js', 'actions.js', 'hud.js', 'render.js', 'debug.js'];
  const texts = new Map(files.map((f) => [f, read(f)]));

  const state = texts.get('state.js');
  const literal = state.slice(state.indexOf('export const g = {'));
  check('the g literal is findable', literal.length > 100);
  // `key:` and shorthand `key,` alike.
  const keys = new Set([...literal.matchAll(/^ {2}([A-Za-z_$][\w$]*)\s*[:,]/gm)].map((m) => m[1]));
  // Plus every key anything assigns onto g - the state object is grown at
  // runtime on purpose (`g.slots`, `g.carried`, `g.lastResult`).
  for (const t of texts.values()) {
    for (const m of t.matchAll(/\bg\.([A-Za-z_$][\w$]*)\s*(?:=[^=]|\+\+|--|\+=|-=)/g)) keys.add(m[1]);
  }
  check('g declares a state object worth checking', keys.size > 30, String(keys.size));

  // Only the three that import the real `g`; elsewhere `g` is a parameter or a
  // local, and a local named `g` would make this guard lie.
  const dangling = [];
  for (const f of ['main.js', 'screens.js', 'actions.js']) {
    for (const m of texts.get(f).matchAll(/\bg\.([A-Za-z_$][\w$]*)/g)) {
      if (!keys.has(m[1])) dangling.push(`${f}: g.${m[1]}`);
    }
  }
  check('nothing reads a g property nothing ever writes', dangling.length === 0,
    [...new Set(dangling)].join(', '));
}


{
  // **Every hazard that can empty the hull has something to say about it.**
  //
  // `crashReason()` knew about enemy fire, the ice ceiling, a dry tank and all
  // four landing axes, and nothing at all about the weather - so a lander taken
  // apart in mid-air by Io's fountains was told *"Touched down off the pad. The
  // surface is not level enough to hold a lander."* Measured: io-3's vent
  // empties a 100-hull lander in 35.5 s, and the loss carries
  // `damageSource: 'eruption'` with `lostToFire` false.
  //
  // The table is keyed on the `source` string a force hands `damageOverTime`,
  // which is the `BUILDERS` shape again - a name written in one file indexing a
  // table in another, failing silently. So it is asserted the way `BUILDERS`
  // and the tips table are: every source resolves, and nothing in the table is
  // for a source nothing passes.
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const screens = strip(readFileSync(new URL('../src/screens.js', import.meta.url), 'utf8'));
  const forces = strip(readFileSync(new URL('../src/forces.js', import.meta.url), 'utf8'));
  const shipSrc = strip(readFileSync(new URL('../src/ship.js', import.meta.url), 'utf8'));
  const loop = strip(readFileSync(new URL('../src/main.js', import.meta.url), 'utf8'));

  const from = screens.indexOf('const HAZARD_DEATHS = {');
  const to = screens.indexOf('};', from);
  check('the hazard-death table is findable', from > 0 && to > from);
  const named = new Set([...screens.slice(from, to).matchAll(/^ {2}([a-zA-Z]+):/gm)].map((m) => m[1]));

  // Every source string any force actually passes, plus the parameter default.
  // Balanced rather than regex: one call site reads
  // `damageOverTime(hull * ... * hazardScale(ship, 'heat') * dt, 'eruption')`,
  // and a lazy `[^)]*` stops at the inner close and reports the wrong string -
  // which is the same class of quiet miss this block exists to catch.
  const callSources = (text) => {
    const out = [];
    for (let i = text.indexOf('damageOverTime('); i >= 0; i = text.indexOf('damageOverTime(', i + 1)) {
      let j = i + 'damageOverTime('.length;
      let depth = 1;
      for (; j < text.length && depth > 0; j++) {
        if (text[j] === '(') depth++;
        else if (text[j] === ')') depth--;
      }
      const args = text.slice(i + 'damageOverTime('.length, j - 1);
      const last = [...args.matchAll(/'([a-z]+)'/g)].pop();
      // The final quoted string at depth zero of the argument list is `source`.
      const tail = args.slice(args.lastIndexOf(','));
      if (last && /'([a-z]+)'/.test(tail)) out.push(tail.match(/'([a-z]+)'/)[1]);
    }
    return out;
  };
  const sources = new Set(callSources(forces));
  const fallback = (shipSrc.match(/damageOverTime\(amount, source = '([a-z]+)'\)/) || [, ''])[1];
  if (fallback) sources.add(fallback);
  check('some force actually raises a hazard death', sources.size >= 3, [...sources].join(', '));
  for (const src of sources) {
    check(`a hazard death by '${src}' can be described`, named.has(src),
      'the generic line is what a missing key falls through to, and nobody sees a gap');
  }
  for (const k of named) {
    check(`the '${k}' line is for a source something passes`, sources.has(k), k);
  }

  // And the two readers agree, because they were two answers to one question
  // and only the screen's worked.
  check('the crash screen classifies through crashCause',
    /export function crashCause\(\)/.test(screens) && /const cause = crashCause\(\);/.test(screens));
  check('and the playtest log records the same classification',
    /reason: \(ship\.landingResult && ship\.landingResult\.blocker\) \|\| crashCause\(\)/.test(loop),
    'the log line used to reach for g.crashReason, which nothing assigns');
  check('a hull emptied by the weather is flagged as such',
    /this\.lostToHazard = true;/.test(shipSrc) && /lostToHazard = false/.test(shipSrc),
    'set on a hazard death and cleared everywhere else, or the branch is unreachable');
}



{
  // **A voice that has already arrived is not re-scheduled.**
  //
  // `engines` has carried this guard since M16, where per-frame automation was
  // found writing 240 events a second forever and Tom heard it as a click while
  // holding a key. **`silence()` put it straight back**: it cleared `_mainOn`
  // and `_rcsOn` before asking, so the equality test could never hit, and the
  // frame loop calls `silence()` every frame the game is not in play. Measured
  // live on the title screen - a screen with no engines on it - at **240
  // automation events a second**, the same number to the digit, all of them
  // setting values the voices already held. 4 in the first second and 0 a
  // second after.
  //
  // `laser` and `setWind` are asked every frame too and had no guard at all.
  // `audio.js` has no unit suite and nothing in node can hear it, so the honest
  // assertion is the shape (AUDIT.md section 4, case 3).
  const audioSrc = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const body = (name) => {
    const at = audioSrc.indexOf(`\n  ${name}(`);
    if (at < 0) return '';
    let i = audioSrc.indexOf('{', at);
    let depth = 1;
    for (let j = i + 1; j < audioSrc.length && depth > 0; j++) {
      if (audioSrc[j] === '{') depth++;
      else if (audioSrc[j] === '}') { depth--; if (!depth) return audioSrc.slice(i, j); }
    }
    return '';
  };
  check('engines still guards on no-change', /if \(this\._mainOn === mainOn && this\._rcsOn === rcsOn\) return;/.test(body('engines')));
  check('and silence does not clear that guard before asking',
    !/_mainOn\s*=\s*null/.test(body('silence')) && !/_rcsOn\s*=\s*null/.test(body('silence')),
    'nulling the dedupe state makes it unreachable, and this method runs every frame off the play screen');
  check('the laser voice is only re-scheduled when it changes',
    /if \(this\._laserOn === on\) return;/.test(body('laser')),
    'the frame loop asks about the beam every frame');
  check('and the wind bed has a deadband rather than a per-frame write',
    /_windTarget/.test(body('setWind')),
    'a 0.4 s envelope re-anchored every 16 ms never settles');
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
