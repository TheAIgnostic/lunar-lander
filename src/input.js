// Keyboard + touch -> a single intent object the sim reads each step.
//
// Every flight control is a *binding*, not a hardcoded key, so the settings
// screen can rebind any of them and a player who cannot reach the default keys
// is not locked out of the game.
//
// **The contract the simulation reads is a magnitude, not a switch.** `held()`
// answers "is this action on", `amount()` answers "how hard", 0..1 - and a
// key or a touch button can only ever answer 1 or 0, so they are the
// degenerate case of the same question. That is what lets an analog trigger
// arrive later without the flight model forking: `ship.js` multiplies by the
// amount, the keyboard multiplies by exactly 1.0, and `x * 1.0 === x` under
// IEEE-754 - measured over 6.6M multiplications across this game's own
// constants, zero values changed. Two flight models is the fault this project
// has been burned by three times; one law, one implementation.

/**
 * The controls a fresh install flies with. Each action may hold several, and
 * since M30 a binding is either a **key name** or a **pad pseudo-key**:
 * `pad:7` is button 7 and `axis:0-` is axis 0 pushed negative. They live in the
 * same map on purpose - `rebind()`, `setBindings()`, the save format and the
 * whole settings screen then keep working without learning what a gamepad is.
 *
 * The pad defaults are the Standard Gamepad mapping, which is what the browser
 * normalises an Xbox or PlayStation pad into: right trigger and A for the
 * booster, the left stick and the d-pad for attitude, left trigger to hold, X
 * for the module. The keyboard bindings come first because the settings screen
 * shows `[0]` as the summary and a keyboard is the device everyone has.
 */
export const DEFAULT_KEYS = {
  thrust: [' ', 'w', 'arrowup', 'pad:7', 'pad:0'],
  left: ['a', 'arrowleft', 'axis:0-', 'pad:14'],
  right: ['d', 'arrowright', 'axis:0+', 'pad:15'],
  // **The descent thrusters** (M41), and they take the controls attitude-hold
  // used to have. Two arguments, one per device.
  //
  // Keyboard: down is down. It is the only default a new player will guess, and
  // descent is a *primary* flight control - used constantly, on every body -
  // where holding the attitude is secondary and has been less needed since
  // M29c's CLASSIC steering started settling the rotation on release.
  //
  // Pad: **LT is the mirror of RT**, and both are analog. The descent thrusters
  // are an axis like the main engine, so a trigger gives a fraction of them for
  // free through the M30 magnitude contract - which is exactly what the left
  // trigger is shaped for and what a face button could never give.
  //
  // Attitude hold moves to `c` and L3. Everything here is rebindable from the
  // settings screen, so this is a default and not a decision.
  down: ['s', 'arrowdown', 'pad:6'],
  hold: ['c', 'pad:10'],
  // **Two active modules since M37**, and the second is a full control rather
  // than a modifier on the first. Tom's playtest reason: *"you need laser for
  // enemies. everyone picks the laser and keeps it"* - one slot was not a
  // choice between ten modules, it was the weapon and nine things nobody could
  // afford to carry.
  // E and X on the pad for the first, Q and Y for the second - adjacent on both
  // devices. **Deliberately not `x` on the keyboard for the second slot**: the
  // pad's X button is the *first* slot, so a screen that says "SLOT II - X"
  // beside a pad prompt reading X for slot I is two different X's on one panel.
  ability: ['e', 'pad:2'],
  ability2: ['q', 'pad:3'],
  // Emergency Arrest (M34). A rebindable action like any other, which is the
  // whole point of the M30 binding work: `ACTIONS` is derived from this object,
  // so the settings screen, the rebind rules, the save format and the pad all
  // learned about it without being told.
  //
  // **Moved off Y (`pad:3`) in M37**, which the second module now holds - the
  // two ability buttons belong side by side under the thumb, and LB is the
  // nearest free control.
  arrest: ['f', 'pad:4'],
  // Combat Overdrive (M35). The Combat tree's capstone, and a rebindable action
  // for the same reason Emergency Arrest is: `ACTIONS` is derived from this
  // object, so the settings screen, the rebind rules, the save format and the
  // pad all learn about it without being told. RB, because it sits under the
  // finger already holding the trigger.
  overdrive: ['g', 'pad:5'],
};

export const ACTIONS = Object.keys(DEFAULT_KEYS);

/**
 * Pad controls that stand in for an **interface key**.
 *
 * The pad does not get a menu layer of its own: it presses the keys the
 * interface already listens on, so every screen, every `input.bind(...)` and
 * every shortcut keeps working with nothing added. A is SPACE — the universal
 * per-screen confirm, which on the keyboard is the same key that fires the
 * booster and is harmless in flight because that handler has no `play` case.
 * B and START are Escape, which is back, cancel-a-rebind, and pause.
 *
 * **This is parity with the keyboard, not a new navigation system.** There is
 * no d-pad cursor because there is no keyboard cursor either — the menus are
 * clickable HTML with one primary action on SPACE, and that is exactly what a
 * pad can now reach.
 *
 * Deliberately *not* in the rebindable map: these are interface controls, the
 * same way `input.bind('escape')` is independent of `DEFAULT_KEYS`.
 */
export const PAD_UI = {
  'pad:0': ' ',        // A     - confirm
  'pad:1': 'escape',   // B     - back, and cancel a rebind
  'pad:9': 'escape',   // START - pause in flight, back out everywhere else
};

/** Is this binding a gamepad pseudo-key rather than a keyboard key? */
export function isPadToken(k) {
  return typeof k === 'string' && (k.startsWith('pad:') || k.startsWith('axis:'));
}

/**
 * Analog response. **Not tuned against a person** - a control curve is the
 * least measurable thing in this project (the M29c note about steering applies
 * here word for word), so these are reasoned defaults with the levers named,
 * not numbers a sweep chose.
 *
 * The two endpoints matter more than the shape between them. Below `deadzone` a
 * stick answers **exactly 0** and above `saturate` a trigger answers **exactly
 * 1**, so a pad at rest and a pad at the stop produce the same two values the
 * keyboard does - which is what keeps a fully-held burn identical whatever it
 * was held with, and keeps the fixtures meaningful for a pad player too.
 */
export const PAD = {
  deadzone: 0.18,      // a stick at rest is never quite centred
  triggerFloor: 0.06,  // nor is a trigger quite released
  saturate: 0.95,      // and it rarely reaches a clean 1.0 at the stop
  uiPress: 0.5,        // a firm press, for the interface controls in PAD_UI
  curve: 1.5,          // see below - it is where the hover point lands
};

// **Why the curve is 1.5 and not 1.** A throttle curve cannot be measured for
// feel, but *where it puts the hover point* can be: that is where a player's
// thumb lives for the whole of a landing. Thrust is 130 px/s^2 and gravity runs
// 8.4 (Enceladus) to 62.9 (Venus), so the throttle that exactly cancels gravity
// runs 6% to 48% - and on a linear trigger the entire ladder would be flown in
// the bottom third of the travel, which is where a trigger has the least
// resolution and the most stiction. At 1.5 the hover band sits at 20% to 61%,
// with the eight ordinary bodies between 30% and 49%: the middle of the travel.
// Raise it and the top of the trigger goes numb; lower it and the bottom does.

/**
 * Menu navigation off the stick and the d-pad.
 *
 * Emitted as **steps**, not as a held direction: one push moves one item, and
 * holding repeats after a pause, the way a held arrow key does. Without the
 * pause a single flick crosses the whole ten-card ladder before you let go.
 *
 * `press` and `release` are far apart on purpose. A stick resting near the
 * threshold would otherwise chatter between "held" and "let go" and emit a
 * step every few frames - the hysteresis is what makes one push mean one item.
 */
const NAV = {
  press: 0.55,        // how far to push before it counts as a direction
  release: 0.35,      // and how far back before it counts as released
  firstRepeat: 0.42,  // s held before it starts repeating
  repeat: 0.13,       // s between repeats after that
};

// Standard Gamepad mapping, for the settings screen.
const PAD_BUTTONS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START',
  'LS', 'RS', 'PAD↑', 'PAD↓', 'PAD←', 'PAD→', 'HOME'];
const PAD_AXES = [['LS←', 'LS→'], ['LS↑', 'LS↓'], ['RS←', 'RS→'], ['RS↑', 'RS↓']];

/** Human-readable control name for the settings screen. */
export function keyLabel(k) {
  if (k === ' ') return 'SPACE';
  if (k.startsWith('arrow')) return { arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→' }[k];
  if (k.startsWith('pad:')) {
    const n = Number(k.slice(4));
    return PAD_BUTTONS[n] || `PAD ${n}`;
  }
  if (k.startsWith('axis:')) {
    const n = Number(k.slice(5, -1));
    const neg = k.slice(-1) === '-';
    const pair = PAD_AXES[n];
    return pair ? pair[neg ? 0 : 1] : `AXIS ${n}${neg ? '-' : '+'}`;
  }
  return k.toUpperCase();
}

/**
 * One raw pad reading, shaped into 0..1. Everything outside the live band
 * collapses to an exact endpoint; only the middle is curved.
 */
function shape(v, floor) {
  if (!(v > floor)) return 0;
  if (v >= PAD.saturate) return 1;
  return Math.pow((v - floor) / (PAD.saturate - floor), PAD.curve);
}

/** What one pad button reports, across the two shapes browsers use for it. */
function buttonValue(b) {
  if (b == null) return 0;
  if (typeof b === 'number') return b;
  if (typeof b.value === 'number') return b.value;
  return b.pressed ? 1 : 0;
}

/**
 * The raw navigation push on one axis, -1..1, from the stick *and* the d-pad.
 *
 * Deliberately raw rather than run through `shape()`: that curve exists to put
 * a throttle's hover point in the middle of the travel, which is exactly the
 * wrong thing for "did they push it far enough to mean it".
 */
function navAxis(gp, axis, negBtn, posBtn) {
  const a = gp.axes && gp.axes[axis];
  let v = typeof a === 'number' && Number.isFinite(a) ? a : 0;
  v += buttonValue(gp.buttons && gp.buttons[posBtn]) - buttonValue(gp.buttons && gp.buttons[negBtn]);
  return v > 1 ? 1 : v < -1 ? -1 : v;
}

/** How hard `gp` is driving one binding token, 0..1. */
function readToken(gp, token) {
  if (token.startsWith('pad:')) {
    return shape(buttonValue(gp.buttons && gp.buttons[Number(token.slice(4))]), PAD.triggerFloor);
  }
  if (token.startsWith('axis:')) {
    const a = gp.axes && gp.axes[Number(token.slice(5, -1))];
    if (typeof a !== 'number') return 0;
    return shape(token.slice(-1) === '-' ? -a : a, PAD.deadzone);
  }
  return 0;
}

export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.touch = { thrust: false, left: false, right: false, hold: false, down: false };
    // The third source. Keyboard and touch are events; a gamepad is not - the
    // Gamepad API has no per-button event at all, so this is filled by
    // `pollGamepad()` once a frame and read like the other two.
    this.pad = zeroPad();
    this.padIndex = null;   // null = whichever pad answers; set to pin one
    this.padName = null;
    this.padToken = null;   // what the pad is pressing, for the CONTROLS screen
    this.padUi = {};        // last state of each interface control, for edges
    // Menu navigation. `nav` is what this poll *emitted* - a step or nothing -
    // rather than what the stick is currently doing, so a screen reads it once
    // and moves once. Zeroed every poll.
    this.nav = { x: 0, y: 0 };
    this._navHeld = { x: 0, y: 0 };
    this._navTimer = { x: 0, y: 0 };
    this.onPress = new Map();   // key -> callback, for one-shot UI actions
    this.onAction = new Map();  // action -> callback, for one-shot bound actions
    this.setBindings(null);

    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = keyName(e);
      if (this.handled.has(k)) e.preventDefault();
      this.keys.add(k);
      const cb = this.onPress.get(k);
      if (cb) cb();
      const action = this.actionFor(k);
      if (action) {
        const acb = this.onAction.get(action);
        if (acb) acb();
      }
      const any = this.onPress.get('*');
      if (any) any(k);
    });
    target.addEventListener('keyup', (e) => this.keys.delete(keyName(e)));
    // A held trigger must not survive the tab losing focus, for the same reason
    // a held key must not: the browser stops reporting either, and whatever was
    // last seen would stay latched on.
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pad = zeroPad();
      this.padToken = null;
      this.padUi = {};
      this.nav = { x: 0, y: 0 };
      this._navHeld = { x: 0, y: 0 };
    });
    // Hot-plug. This is a *label*, not the plumbing: `pollGamepad` asks the
    // browser what is there every frame regardless, because a pad is famously
    // invisible to `getGamepads()` until it has been touched, so a player who
    // plugs in and presses a button gets no connect event to hang anything on.
    window.addEventListener('gamepadconnected', (e) => {
      const gp = e && e.gamepad;
      if (!gp) return;
      if (this.padIndex == null) this.padIndex = gp.index;
      this.padName = gp.id || null;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      const gp = e && e.gamepad;
      if (gp && this.padIndex === gp.index) { this.padIndex = null; this.padName = null; }
      this.pad = zeroPad();
    });
  }

  /**
   * Read the pad and fill `this.pad`. Called once per frame from the loop,
   * because the Gamepad API is poll-only - there is no button event to bind.
   *
   * Deliberately **not** called from `__advance`, so a headless sweep is not at
   * the mercy of whatever is plugged into the machine running it.
   *
   * Takes an optional list so the mapping seam can be tested with a fake pad:
   * that is where the bugs are, and it is a pure function of pad in / intent
   * out. The physics does not need testing through a gamepad - stage 1 proved
   * the flight model by leaving both fixtures unmoved.
   */
  pollGamepad(list, dt = 0) {
    const pads = list !== undefined ? list
      : (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null);
    const gp = this.choosePad(pads);
    const next = zeroPad();
    if (gp) {
      for (const a of ACTIONS) {
        for (const token of this.bindings[a]) {
          if (!isPadToken(token)) continue;
          const v = readToken(gp, token);
          // Hardest-pressed wins, and **this comparison is not `Math.max`** on
          // purpose: `NaN > x` is false so a bad reading is dropped here, while
          // `Math.max(0, NaN)` is NaN - which would multiply straight into
          // `vx`/`vy` and put the lander nowhere at all. `shape()` already
          // refuses a NaN for the same reason (`!(NaN > floor)`); this is the
          // second of the two, and neither is decoration.
          if (v > next[a]) next[a] = v;
        }
      }
    }
    // One-shot actions. `ability` fires from a `keydown` on the keyboard, so on
    // a pad the same edge has to be *found* by comparing this poll with the
    // last one. Rising edge only, and the callback is the same `onAction` the
    // keyboard calls - one action, one handler.
    for (const a of ACTIONS) {
      if (next[a] > 0 && !(this.pad[a] > 0)) {
        const cb = this.onAction.get(a);
        if (cb) cb();
      }
    }
    this.pad = next;
    // The interface controls, on a rising edge each. **Before the rebinding
    // capture below**, and the order is the mechanism rather than a tidiness:
    // B is Escape, Escape cancels a listening rebind by clearing `g.rebinding`,
    // and the capture reads that flag - so firing the key first is what stops
    // the back button binding *itself* to whatever was listening. That is the
    // order a `keydown` already has, and this matches it deliberately.
    for (const token of PAD_UI_TOKENS) {
      const down = gp ? readToken(gp, token) >= PAD.uiPress : false;
      if (down && !this.padUi[token]) {
        const cb = this.onPress.get(PAD_UI[token]);
        if (cb) cb();
      }
      this.padUi[token] = down;
    }
    // Menu navigation, as a step per push. Read by whatever is on screen; the
    // pad has no idea what a card or a button is, and the screen has no idea
    // what a stick is.
    this.nav.x = gp ? this._navStep('x', navAxis(gp, 0, 14, 15), dt) : this._navStep('x', 0, dt);
    this.nav.y = gp ? this._navStep('y', navAxis(gp, 1, 12, 13), dt) : this._navStep('y', 0, dt);
    // And the raw token, for the CONTROLS screen, which listens on '*' exactly
    // as it does for a key. That is what lets a trigger be bound to an action
    // through the rebinding flow that already exists.
    const token = gp ? firstPadToken(gp) : null;
    if (token && token !== this.padToken) {
      const any = this.onPress.get('*');
      if (any) any(token);
    }
    this.padToken = token;
    return gp;
  }

  /**
   * One axis of menu navigation: raw push in, a step or zero out.
   *
   * Between `release` and `press` the direction is *kept* rather than
   * recomputed, which is the hysteresis that stops a stick resting on the
   * threshold from emitting a step every few frames.
   */
  _navStep(axis, raw, dt) {
    const held = this._navHeld[axis];
    let dir;
    if (raw >= NAV.press) dir = 1;
    else if (raw <= -NAV.press) dir = -1;
    else if (Math.abs(raw) < NAV.release) dir = 0;
    else dir = held;
    let step = 0;
    if (dir && dir !== held) {
      step = dir;                       // the push itself
      this._navTimer[axis] = NAV.firstRepeat;
    } else if (dir) {
      this._navTimer[axis] -= dt;       // held: repeat, after a pause
      if (this._navTimer[axis] <= 0) { step = dir; this._navTimer[axis] = NAV.repeat; }
    }
    this._navHeld[axis] = dir;
    return step;
  }

  /**
   * Which pad to fly with. A pinned one wins; otherwise the first that answers.
   * If the pinned one has gone, fall back rather than going dead - a pad
   * unplugged mid-flight should hand control back to the keyboard, not freeze.
   */
  choosePad(pads) {
    if (!pads) return null;
    const live = [];
    for (const gp of pads) if (gp && gp.connected !== false) live.push(gp);
    if (!live.length) return null;
    if (this.padIndex != null) {
      const pinned = live.find((gp) => gp.index === this.padIndex);
      if (pinned) return pinned;
      this.padIndex = null;
      this.padName = null;
    }
    return live[0];
  }

  /** Replace the key map. `null` restores the defaults. Never partial. */
  setBindings(map) {
    const out = {};
    for (const a of ACTIONS) {
      const given = map && Array.isArray(map[a]) ? map[a].filter((k) => typeof k === 'string' && k) : null;
      out[a] = given && given.length ? [...given] : [...DEFAULT_KEYS[a]];
    }
    this.bindings = out;
    // Keys the game consumes, so the browser does not also scroll on them.
    this.handled = new Set(['r', 'p', 'm', 'escape', 'enter']);
    for (const a of ACTIONS) for (const k of out[a]) this.handled.add(k);
    return this.bindings;
  }

  /** Which action, if any, this key drives. */
  actionFor(key) {
    for (const a of ACTIONS) if (this.bindings[a].includes(key)) return a;
    return null;
  }

  /**
   * Bind one control to one action, taking it away from whatever held it.
   * Returns the new map, or null when the control is reserved by the interface
   * - rebinding Escape onto the booster would leave a player unable to reach
   * the menu.
   *
   * **It replaces within a family, not across one.** Before M30 this set
   * `next[action] = [key]`, which was right when every binding was a key. With
   * a pad in the same map that would mean binding the booster to a trigger
   * silently unbinds the space bar, and the player who did it has no way to
   * know until they put the pad down. A keyboard rebind replaces the keys, a
   * pad rebind replaces the pad controls, and the other family is left alone.
   */
  rebind(action, key) {
    if (!ACTIONS.includes(action)) return null;
    if (RESERVED.has(key)) return null;
    const pad = isPadToken(key);
    const sameFamily = (k) => isPadToken(k) === pad;
    const next = {};
    for (const a of ACTIONS) next[a] = this.bindings[a].filter((k) => k !== key);
    next[action] = next[action].filter((k) => !sameFamily(k)).concat(key);
    // An action can never be left with nothing on it - and since M30 that is
    // asked **per family**, because an action holding only `pad:7` is
    // unreachable for a player with no pad, which is the exact lockout this
    // rule exists to prevent.
    for (const a of ACTIONS) {
      for (const wantPad of [false, true]) {
        if (next[a].some((k) => isPadToken(k) === wantPad)) continue;
        next[a] = next[a].concat(DEFAULT_KEYS[a].filter((k) => isPadToken(k) === wantPad && k !== key));
      }
    }
    // The keyboard is the device every player has, so an action with no key on
    // it is refused outright. An action with no *pad* control is allowed: that
    // is a pad the player chose to spend elsewhere, not a lockout.
    for (const a of ACTIONS) if (!next[a].some((k) => !isPadToken(k))) return null;
    return this.setBindings(next);
  }

  bind(key, cb) {
    this.onPress.set(key, cb);
  }

  /** One-shot callback when a *bound action* is pressed, whatever key that is. */
  bindAction(action, cb) {
    this.onAction.set(action, cb);
  }

  bindTouchButton(el, prop) {
    const on = (e) => {
      e.preventDefault();
      this.touch[prop] = true;
      el.classList.add('active');
    };
    const off = (e) => {
      e.preventDefault();
      this.touch[prop] = false;
      el.classList.remove('active');
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }

  /**
   * How hard an action is being asked for, 0..1, from whichever of the three
   * sources is asking hardest.
   *
   * A key and a touch button are all-or-nothing, so they return exactly 1 or
   * exactly 0 - never 0.999 and never a smoothed ramp, because the *exactness*
   * is what makes a keyboard flight bit-identical to one from before the
   * contract widened. With no pad connected `this.pad` is all zeroes and this
   * is the same function it was.
   */
  amount(action) {
    if (this.touch[action]) return 1;
    if (this.bindings[action].some((k) => this.keys.has(k))) return 1;
    return this.pad[action] || 0;
  }

  /** Is a held action active at all, from any of the three sources? */
  held(action) {
    return this.amount(action) > 0;
  }

  get thrust() { return this.held('thrust'); }
  get left() { return this.held('left'); }
  get right() { return this.held('right'); }
  get hold() { return this.held('hold'); }
}

/**
 * How hard `input` is asking for `action`, 0..1, whatever kind of input it is.
 *
 * The simulation is flown by three different things and only one of them is an
 * `Input`: the browser passes the real device, `test/pilot.js` passes a plain
 * object of booleans it rewrites every step, and the physics fixture passes a
 * scripted one. So the widening has to meet a bare `{ thrust: true }` as well
 * as a device with an `amount()` on it, which is what this function is for -
 * `ship.js` asks one question and never learns which of the three answered.
 *
 * `true` becomes exactly 1 and `false` exactly 0, so the fixtures do not move.
 * A number is taken at its word and clamped, which is how a test drives a
 * partial throttle without needing a device at all.
 */
export function amountOf(input, action) {
  if (!input) return 0;
  if (typeof input.amount === 'function') return input.amount(action);
  const v = input[action];
  if (typeof v === 'number') return v > 1 ? 1 : v > 0 ? v : 0;
  return v ? 1 : 0;
}

/** Controls the interface owns; they can never be taken for a flight control. */
const RESERVED = new Set(['escape', 'enter', 'p', 'r', 'm', 'f3', 'f4', 'f5', '`', 'tab',
  // START and HOME on a pad, for the same reason Escape is reserved on a
  // keyboard: they are how a player gets out, on every other game they own.
  'pad:9', 'pad:16',
  // B is the back button now (see PAD_UI), so it is the interface's for the
  // same reason Escape is. A is deliberately *not* here: it is SPACE's
  // counterpart, and SPACE is a flight control you are allowed to move.
  'pad:1']);

const PAD_UI_TOKENS = Object.keys(PAD_UI);

/** A fresh, all-zero pad reading - one per action, same shape as `amount`. */
function zeroPad() {
  const out = {};
  for (const a of ACTIONS) out[a] = 0;
  return out;
}

/**
 * The one control a pad is most obviously pressing, for the CONTROLS screen.
 * Deliberately a high threshold: a resting stick and a scraping trigger must
 * not capture a binding the player did not mean to make.
 */
function firstPadToken(gp) {
  const buttons = gp.buttons || [];
  for (let i = 0; i < buttons.length; i++) if (buttonValue(buttons[i]) >= 0.7) return `pad:${i}`;
  const axes = gp.axes || [];
  for (let i = 0; i < axes.length; i++) {
    if (typeof axes[i] !== 'number') continue;
    if (axes[i] >= 0.7) return `axis:${i}+`;
    if (axes[i] <= -0.7) return `axis:${i}-`;
  }
  return null;
}

/** Normalized key name, falling back to `code` when `key` is missing. */
function keyName(e) {
  const k = (e.key || '').toLowerCase();
  if (k) return k;
  const c = e.code || '';
  if (c === 'Space') return ' ';
  return c.replace(/^Key|^Digit/, '').toLowerCase();
}
