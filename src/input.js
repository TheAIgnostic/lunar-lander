// Keyboard + touch -> a single intent object the sim reads each step.
//
// Every flight control is a *binding*, not a hardcoded key, so the settings
// screen can rebind any of them and a player who cannot reach the default keys
// is not locked out of the game.

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

  get thrust() { return this.held('thrust'); }
  get left() { return this.held('left'); }
  get right() { return this.held('right'); }
  get hold() { return this.held('hold'); }
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
