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
    // M24: mission select is earned, not given. Set the first time an
    // expedition is carried through all ten bodies.
    gameCompleted: false,
    // A test switch, off for every real save. Declared here rather than left to
    // fall out of `coerceMeta`'s spread so that NEW GAME clears it and so that
    // "is god mode on?" has one answer with one owner. See `act('god')`.
    godMode: false,
    banked: { salvage: 0, data: 0, cores: 0, materials: {} },
    componentLevels: { hull: 1, gear: 1, engine: 1, rcs: 1, power: 1, sensors: 1, utility: 1 },
    purchasedSkills: {},
    unlockedBlueprints: [],
    settings: { muted: false, steering: 'classic', invertRotation: false },
    // threatsSeen is what opens the Combat skill tree: the trainer sells you
    // threat analysis once something has actually shot at you, not before.
    // The rest is the pilot's logbook, shown on the STATISTICS screen.
    stats: {
      attempts: 0, landings: 0, crashes: 0, perfect: 0, bestScore: 0,
      threatsSeen: 0, threatsDestroyed: 0, hitsTaken: 0, threatsPassed: 0,
      fuelBurned: 0, fuelCarried: 0,     // ratio of these is fuel efficiency
      flightSeconds: 0,
      bodies: {},          // planet id -> chapters cleared there
      missionGrades: {},   // mission id -> best grade
      moduleFlights: {},   // module id -> missions flown with it equipped
      moduleUses: {},      // module id -> times actually triggered
    },
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
  // The logbook's nested tallies arrived after the first v2 saves, so they are
  // merged rather than assumed - an older save simply starts them empty.
  for (const k of ['bodies', 'missionGrades', 'moduleFlights', 'moduleUses']) {
    m.stats[k] = { ...(raw.stats && raw.stats[k]) || {} };
  }
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
    chapterId,                 // planet id of the chapter being flown
    missionIndex: 0,
    shuttles,
    maxShuttles: shuttles,
    seed,
    score: 0,
    combo: 0,
    missionsCleared: 0,
    chaptersCleared: 0,
    visited: [chapterId],
    // Bodies this run has *finished*, in ladder order. `visited` records what
    // was entered; this records what was cleared, which is what the route
    // window and the completion check both read.
    cleared: [],
    sector: 1,
    banked: [],          // settlement ids already paid out, so none pays twice
    coreDrought: 0,      // missions since the last Tech Core, for bad-luck protection
    attempts: {},        // mission id -> how many landers this mission has cost
    loaner: null,        // a module lent for the rest of the expedition
    haul: { salvageSafe: 0, salvageCargo: 0, data: 0, cores: 0, materials: {} },
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
    // M25 added `cleared` - the bodies this run has actually finished, which
    // the ladder and the completion check both read. A run saved before M25 has
    // no such field, and an expedition in progress across the upgrade is
    // exactly the save a player will be holding. It can be reconstructed from
    // what the old run already recorded: `visited` is pushed when a body is
    // *entered*, and a body is always cleared before the next one is chosen, so
    // the first `chaptersCleared` entries are precisely the finished ones.
    if (!Array.isArray(r.cleared)) {
      const visited = Array.isArray(r.visited) ? r.visited : [];
      const done = Math.max(0, Math.min(visited.length, r.chaptersCleared || 0));
      r.cleared = visited.slice(0, done);
    }
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
/**
 * Fold a settlement into permanent progress.
 *
 * A run banks more than once - every sector checkpoint pays out, and then the
 * end of the run pays out again - so each settlement carries an `id` and the
 * run records which ones it has already been paid for. A reload between the
 * payout and the run being cleared used to be able to pay the same settlement
 * twice ("prevent double rewards when reloading"); now the second call sees the
 * id and does nothing.
 */
export function bankRun(meta, run, { completed, settled, id = 'final' }) {
  const m = coerceMeta(meta);
  if (run) {
    run.banked = Array.isArray(run.banked) ? run.banked : [];
    if (run.banked.includes(id)) return m;
    run.banked.push(id);
  }
  const s = settled || { salvage: 0, data: 0, cores: 0, materials: {} };
  m.banked.salvage += s.salvage || 0;
  m.banked.data += s.data || 0;
  m.banked.cores += s.cores || 0;
  for (const [k, v] of Object.entries(s.materials || {})) {
    m.banked.materials[k] = (m.banked.materials[k] || 0) + v;
  }
  m.stats.bestScore = Math.max(m.stats.bestScore, run.score || 0);
  for (const id of run.visited || []) {
    if (completed && !m.clearedChapters.includes(id)) m.clearedChapters.push(id);
  }
  for (const id of run.visited || []) {
    if (!m.discoveredPlanets.includes(id)) m.discoveredPlanets.push(id);
  }
  const prev = m.chapterBests[run.chapterId] || 0;
  if ((run.score || 0) > prev) m.chapterBests[run.chapterId] = run.score || 0;
  return m;
}

/**
 * What a death costs, and what it does not (M24).
 *
 * The run is the roguelike unit now: losing the last shuttle sends you back to
 * the beginning of the route, not back to a menu with your progress intact. So
 * skills and every banked resource go, and the map you had opened up closes.
 *
 * What survives is what you *built*: hangar component levels, recovered
 * blueprints and the equipped modules. That is the trade the design is making -
 * spending a run's salvage on a permanent hangar upgrade is the only way to
 * keep anything, and it costs you the loadout you would otherwise have carried
 * into the next sector. Stats and settings are the player's record and their
 * accessibility choices; neither is progress, so neither is taken.
 */
export function wipeForDeath(meta) {
  const m = coerceMeta(meta);
  m.purchasedSkills = {};
  m.banked = { salvage: 0, data: 0, cores: 0, materials: {} };
  m.clearedChapters = [];
  m.discoveredPlanets = ['LUNA'];
  return m;
}

/**
 * NEW GAME: everything goes except the settings, which are how the player uses
 * the machine rather than what they have earned. Wipes the run too, so there is
 * no expedition left pointing at a save that no longer exists.
 */
export function resetAll(meta, store = safeStore) {
  const fresh = defaultMeta();
  fresh.settings = { ...fresh.settings, ...((meta && meta.settings) || {}) };
  saveMeta(fresh, store);
  clearRun(store);
  return fresh;
}
