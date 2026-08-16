// Keyboard + touch -> a single intent object the sim reads each step.

export class Input {
  constructor(target = window) {
    this.keys = new Set();
    this.touch = { thrust: false, left: false, right: false, hold: false };
    this.onPress = new Map(); // key -> callback, for one-shot UI actions

    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = keyName(e);
      if (HANDLED.has(k)) e.preventDefault();
      this.keys.add(k);
      const cb = this.onPress.get(k);
      if (cb) cb();
      const any = this.onPress.get('*');
      if (any) any(k);
    });
    target.addEventListener('keyup', (e) => this.keys.delete(keyName(e)));
    window.addEventListener('blur', () => this.keys.clear());
  }

  bind(key, cb) {
    this.onPress.set(key, cb);
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

  get thrust() {
    return this.touch.thrust || this.keys.has(' ') || this.keys.has('w') || this.keys.has('arrowup');
  }
  get left() {
    return this.touch.left || this.keys.has('a') || this.keys.has('arrowleft');
  }
  get right() {
    return this.touch.right || this.keys.has('d') || this.keys.has('arrowright');
  }
  get hold() {
    return this.touch.hold || this.keys.has('s') || this.keys.has('arrowdown');
  }
}

/** Normalized key name, falling back to `code` when `key` is missing. */
function keyName(e) {
  const k = (e.key || '').toLowerCase();
  if (k) return k;
  const c = e.code || '';
  if (c === 'Space') return ' ';
  return c.replace(/^Key|^Digit/, '').toLowerCase();
}

const HANDLED = new Set([
  ' ', 'w', 'a', 's', 'd', 'r', 'p', 'm', 'escape', 'enter',
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
]);
