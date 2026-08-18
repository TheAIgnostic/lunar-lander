// Persistence (roadmap Phase 3 and section 14).
//
// Two records, deliberately separate:
//   MetaSave  - permanent progress. Must survive anything.
//   RunState  - the expedition in progress. Disposable by design.
//
// Every function takes a storage adapter so this is testable without a browser
// and so a failure to read never reaches the game as an exception.

import { safeStore } from './util.js';

export const SAVE_VERSION = 2;

export const KEYS = {
  meta: 'tv_save_v2',
  run: 'tv_run_v2',
  backup: 'tv_save_corrupt',
  legacy: ['tv_high', 'tv_unlocked', 'tv_bests', 'tv_muted', 'tv_settings'],
};

export function defaultMeta() {
  return {
    version: SAVE_VERSION,
    clearedChapters: [],
    discoveredPlanets: ['LUNA'],
    banked: { salvage: 0, data: 0, cores: 0, materials: {} },
    componentLevels: { hull: 1, gear: 1, engine: 1, rcs: 1, power: 1, sensors: 1, utility: 1 },
    purchasedSkills: {},
    unlockedBlueprints: [],
    settings: { muted: false, steering: 'classic', invertRotation: false },
    stats: { attempts: 0, landings: 0, crashes: 0, perfect: 0, bestScore: 0 },
    classic: { high: 0, unlocked: 1, bests: {} },
    chapterBests: {},
  };
}

/** Read the pre-v2 keys a player may already have. Never destructive. */
export function migrateLegacy(store = safeStore) {
  const meta = defaultMeta();
  const read = (k) => { try { return store.get(k); } catch { return null; } };
  const num = (k, d) => {
    const v = read(k);
    return v == null || v === '' || Number.isNaN(+v) ? d : +v;
  };
  meta.classic.high = num('tv_high', 0);
  meta.classic.unlocked = num('tv_unlocked', 1);
  try {
    meta.classic.bests = JSON.parse(read('tv_bests') || '{}') || {};
  } catch { meta.classic.bests = {}; }
  meta.settings.muted = read('tv_muted') === '1';
  try {
    const s = JSON.parse(read('tv_settings') || '{}') || {};
    if (s.steering === 'classic' || s.steering === 'direct') meta.settings.steering = s.steering;
    meta.settings.invertRotation = !!s.invertRotation;
  } catch { /* defaults stand */ }
  meta.stats.bestScore = meta.classic.high;
  meta.migratedFrom = 1;
  return meta;
}

function coerceMeta(raw) {
  // Merge onto defaults so a save written by an older build - or one missing a
  // field a later build added - still loads with sensible values.
  const d = defaultMeta();
  const m = { ...d, ...raw };
  m.banked = { ...d.banked, ...(raw.banked || {}) };
  m.banked.materials = { ...(raw.banked && raw.banked.materials) || {} };
  m.componentLevels = { ...d.componentLevels, ...(raw.componentLevels || {}) };
  m.settings = { ...d.settings, ...(raw.settings || {}) };
  m.stats = { ...d.stats, ...(raw.stats || {}) };
  m.classic = { ...d.classic, ...(raw.classic || {}) };
  m.clearedChapters = Array.isArray(raw.clearedChapters) ? raw.clearedChapters : [];
  m.discoveredPlanets = Array.isArray(raw.discoveredPlanets) && raw.discoveredPlanets.length
    ? raw.discoveredPlanets : d.discoveredPlanets;
  m.unlockedBlueprints = Array.isArray(raw.unlockedBlueprints) ? raw.unlockedBlueprints : [];
  m.version = SAVE_VERSION;
  return m;
}

/**
 * Load permanent progress. A corrupt or unreadable save is set aside under a
 * backup key and replaced with defaults - the game must never open to a blank
 * screen because of one bad string.
 */
export function loadMeta(store = safeStore) {
  let raw;
  try {
    raw = store.get(KEYS.meta);
  } catch {
    return { meta: defaultMeta(), source: 'unreadable' };
  }
  if (raw == null) {
    const migrated = migrateLegacy(store);
    return { meta: migrated, source: migrated.classic.high || migrated.classic.unlocked > 1 ? 'migrated' : 'new' };
  }
  const stash = (value) => { try { store.set(KEYS.backup, String(value)); } catch { /* nothing more we can do */ } };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    stash(raw);
    return { meta: defaultMeta(), source: 'corrupt' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    stash(raw);
    return { meta: defaultMeta(), source: 'corrupt' };
  }
  if (typeof parsed.version === 'number' && parsed.version > SAVE_VERSION) {
    // A newer build wrote this. Keep it untouched and run on defaults rather
    // than silently downgrading someone's progress.
    return { meta: defaultMeta(), source: 'newer' };
  }
  return { meta: coerceMeta(parsed), source: 'loaded' };
}

export function saveMeta(meta, store = safeStore) {
  try {
    store.set(KEYS.meta, JSON.stringify({ ...meta, version: SAVE_VERSION }));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- run state

export function newRun(chapterId, seed, shuttles = 3) {
  return {
    version: SAVE_VERSION,
    chapterId,
    missionIndex: 0,
    shuttles,
    maxShuttles: shuttles,
    seed,
    score: 0,
    combo: 0,
    missionsCleared: 0,
    sector: 1,
    unbanked: { salvage: 0, data: 0, cores: 0 },
    startedAt: Date.now(),
  };
}

export function loadRun(store = safeStore) {
  let raw;
  try {
    raw = store.get(KEYS.run);
  } catch {
    return null;
  }
  if (raw == null) return null;
  try {
    const r = JSON.parse(raw);
    if (!r || typeof r !== 'object' || typeof r.chapterId !== 'string') return null;
    if (typeof r.missionIndex !== 'number' || r.missionIndex < 0) return null;
    if (typeof r.shuttles !== 'number' || r.shuttles < 0) return null;
    return r;
  } catch {
    return null;
  }
}

export function saveRun(run, store = safeStore) {
  try {
    if (!run) { store.remove(KEYS.run); return true; }
    store.set(KEYS.run, JSON.stringify(run));
    return true;
  } catch {
    return false;
  }
}

export function clearRun(store = safeStore) {
  try { store.remove(KEYS.run); } catch { /* nothing to do */ }
}

/**
 * Fold a finished expedition into permanent progress. Called whether the run
 * was completed or lost: a failed expedition must still leave something behind.
 */
export function bankRun(meta, run, { completed }) {
  const m = coerceMeta(meta);
  m.banked.salvage += run.unbanked.salvage || 0;
  m.banked.data += run.unbanked.data || 0;
  m.banked.cores += run.unbanked.cores || 0;
  m.stats.bestScore = Math.max(m.stats.bestScore, run.score || 0);
  if (completed && !m.clearedChapters.includes(run.chapterId)) {
    m.clearedChapters.push(run.chapterId);
  }
  const prev = m.chapterBests[run.chapterId] || 0;
  if ((run.score || 0) > prev) m.chapterBests[run.chapterId] = run.score || 0;
  return m;
}
