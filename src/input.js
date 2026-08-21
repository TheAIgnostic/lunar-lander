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

/** The keys a fresh install flies with. Each action may hold several. */
export const DEFAULT_KEYS = {
  thrust: [' ', 'w', 'arrowup'],
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  hold: ['s', 'arrowdown'],
  ability: ['e', 'q'],
};

export const ACTIONS = Object.keys(DEFAULT_KEYS);

/** Human-readable key name for the settings screen. */
export function keyLabel(k) {
  if (k === ' ') return 'SPACE';
  if (k.startsWith('arrow')) return { arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→' }[k];
  return k.toUpperCase();
}

export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.touch = { thrust: false, left: false, right: false, hold: false };
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
    window.addEventListener('blur', () => this.keys.clear());
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
   * Bind one key to one action, taking it away from whatever held it. Returns
   * the new map, or null when the key is reserved by the interface - rebinding
   * Escape onto the booster would leave a player unable to reach the menu.
   */
  rebind(action, key) {
    if (!ACTIONS.includes(action)) return null;
    if (RESERVED.has(key)) return null;
    const next = {};
    for (const a of ACTIONS) next[a] = this.bindings[a].filter((k) => k !== key);
    next[action] = [key];
    // An action can never be left with nothing on it.
    for (const a of ACTIONS) if (!next[a].length) next[a] = [...DEFAULT_KEYS[a]].filter((k) => k !== key);
    for (const a of ACTIONS) if (!next[a].length) return null;
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

  /** Is a held action active right now, from either keyboard or touch? */
  held(action) {
    if (this.touch[action]) return true;
    return this.bindings[action].some((k) => this.keys.has(k));
  }

  /**
   * How hard an action is being asked for, 0..1. A key and a touch button are
   * both all-or-nothing, so this returns exactly 1 or exactly 0 - never 0.999
   * or a smoothed ramp, because the *exactness* is what makes a keyboard
   * flight bit-identical to one from before the contract widened.
   */
  amount(action) {
    return this.held(action) ? 1 : 0;
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

/** Keys the interface owns; they can never be taken for a flight control. */
const RESERVED = new Set(['escape', 'enter', 'p', 'r', 'm', 'f3', 'f4', 'f5', '`', 'tab']);

/** Normalized key name, falling back to `code` when `key` is missing. */
function keyName(e) {
  const k = (e.key || '').toLowerCase();
  if (k) return k;
  const c = e.code || '';
  if (c === 'Space') return ' ';
  return c.replace(/^Key|^Digit/, '').toLowerCase();
}
