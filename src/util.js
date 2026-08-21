// Small math + helper toolbox shared by every module.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);

/** Frame-rate independent exponential approach. */
export const approach = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/** Deterministic PRNG so a seed always rebuilds the same world. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const r = mulberry32(seed);
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  return r;
}

/** Shortest signed angular difference, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}


export function formatScore(n) {
  return Math.round(n).toLocaleString('en-US');
}

/**
 * localStorage that cannot throw. Safari refuses it on file:// URLs and private
 * windows refuse it everywhere, so the game falls back to memory and merely
 * forgets scores between sessions instead of failing to start.
 */
export const safeStore = (() => {
  let backing = null;
  try {
    const probe = '__tv_probe';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    backing = window.localStorage;
  } catch {
    backing = null;
  }
  const memory = new Map();
  const guard = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
  return {
    persistent: backing !== null,
    get: (k) => guard(() => (backing ? backing.getItem(k) : (memory.has(k) ? memory.get(k) : null)), null),
    set: (k, v) => guard(() => (backing ? backing.setItem(k, v) : memory.set(k, v)), undefined),
    remove: (k) => guard(() => (backing ? backing.removeItem(k) : memory.delete(k)), undefined),
  };
})();
