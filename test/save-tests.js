// Save, migration and corruption tests:  node test/save-tests.js
import {
  SAVE_VERSION, KEYS, defaultMeta, migrateLegacy, loadMeta, saveMeta,
  newRun, loadRun, saveRun, clearRun, bankRun,
} from '../src/save.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) pass++; else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};

/** In-memory stand-in for the storage adapter. */
const mkStore = (seed = {}) => {
  const m = new Map(Object.entries(seed));
  return {
    get: (k) => (m.has(k) ? m.get(k) : null),
    set: (k, v) => m.set(k, String(v)),
    remove: (k) => m.delete(k),
    _map: m,
  };
};

console.log('save, migration and recovery');

// --- a brand new player
{
  const s = mkStore();
  const { meta, source } = loadMeta(s);
  check('new player gets defaults', source === 'new' && meta.version === SAVE_VERSION);
  check('new player starts with the Moon discovered', meta.discoveredPlanets.includes('LUNA'));
  check('new player has nothing banked', meta.banked.salvage === 0 && meta.banked.cores === 0);
}

// --- migration from the five legacy keys
{
  const s = mkStore({
    tv_high: '5312', tv_unlocked: '7', tv_bests: '{"1":900,"2":1200}',
    tv_muted: '1', tv_settings: '{"steering":"direct","invertRotation":true}',
  });
  const { meta, source } = loadMeta(s);
  check('an existing player is migrated', source === 'migrated');
  check('high score survives', meta.classic.high === 5312);
  check('unlock progress survives', meta.classic.unlocked === 7);
  check('per-mission bests survive', meta.classic.bests['2'] === 1200);
  check('mute survives', meta.settings.muted === true);
  check('steering choice survives', meta.settings.steering === 'direct' && meta.settings.invertRotation === true);
  check('legacy keys are left intact', s.get('tv_high') === '5312');
  check('best score seeds the stats', meta.stats.bestScore === 5312);
}

// --- migration copes with junk in the legacy keys
{
  const s = mkStore({ tv_high: 'not-a-number', tv_bests: '{{{', tv_settings: 'nope' });
  const meta = migrateLegacy(s);
  check('junk high score falls back to zero', meta.classic.high === 0);
  check('junk bests falls back to empty', Object.keys(meta.classic.bests).length === 0);
  check('junk settings falls back to defaults', meta.settings.steering === 'classic');
}

// --- round trip
{
  const s = mkStore();
  const meta = defaultMeta();
  meta.banked.salvage = 250;
  meta.clearedChapters.push('moon');
  saveMeta(meta, s);
  const { meta: back, source } = loadMeta(s);
  check('a saved meta reloads', source === 'loaded' && back.banked.salvage === 250);
  check('cleared chapters reload', back.clearedChapters.includes('moon'));
}

// --- corruption must never blank the game
{
  const s = mkStore({ [KEYS.meta]: '{"banked":' });
  const { meta, source } = loadMeta(s);
  check('a corrupt save loads defaults', source === 'corrupt' && meta.version === SAVE_VERSION);
  check('the corrupt bytes are kept for inspection', s.get(KEYS.backup) === '{"banked":');
}
{
  const s = mkStore({ [KEYS.meta]: '"a string, not an object"' });
  const { source } = loadMeta(s);
  check('a non-object save is treated as corrupt', source === 'corrupt');
}
{
  const s = mkStore({ [KEYS.meta]: JSON.stringify({ version: 99, banked: { salvage: 1 } }) });
  const { source } = loadMeta(s);
  check('a save from a newer build is not downgraded', source === 'newer');
  check('the newer save is left untouched', JSON.parse(s.get(KEYS.meta)).version === 99);
}

// --- a save missing fields a later build added
{
  const s = mkStore({ [KEYS.meta]: JSON.stringify({ version: 2, banked: { salvage: 40 } }) });
  const { meta } = loadMeta(s);
  check('missing fields are filled from defaults', meta.componentLevels.hull === 1 && meta.stats.crashes === 0);
  check('present fields are kept', meta.banked.salvage === 40);
  check('missing arrays become arrays', Array.isArray(meta.clearedChapters));
}

// --- run state
{
  const s = mkStore();
  const run = newRun('moon', 4242);
  check('a run starts with three shuttles', run.shuttles === 3);
  saveRun(run, s);
  const back = loadRun(s);
  check('a run reloads', back && back.chapterId === 'moon' && back.seed === 4242);
  clearRun(s);
  check('a cleared run is gone', loadRun(s) === null);
}
{
  const s = mkStore({ [KEYS.run]: '{"chapterId":5}' });
  check('a malformed run is ignored, not thrown', loadRun(s) === null);
}
{
  const s = mkStore({ [KEYS.run]: 'garbage' });
  check('an unparseable run is ignored', loadRun(s) === null);
}

// --- banking: a failed expedition must still leave something behind
{
  const meta = defaultMeta();
  const run = newRun('moon', 1);
  run.score = 4200;
  const settled = { salvage: 120, data: 60, cores: 0, materials: { 'Ilmenite alloy stock': 30 } };
  const lost = bankRun(meta, run, { completed: false, settled });
  check('a lost run still banks its resources', lost.banked.salvage === 120 && lost.banked.data === 60);
  check('a lost run does not mark the chapter cleared', !lost.clearedChapters.includes('moon'));
  check('a lost run still records the score', lost.stats.bestScore === 4200);
  check('materials bank too', lost.banked.materials['Ilmenite alloy stock'] === 30);
  const won = bankRun(meta, run, { completed: true, settled });
  check('a completed run marks the chapter cleared', won.clearedChapters.includes('moon'));
  check('visiting a body discovers it', won.discoveredPlanets.includes('moon'));
  check('permanent upgrades are never touched by banking',
    won.componentLevels.hull === meta.componentLevels.hull);
}
{
  // banking twice must not double-count into the same object
  const meta = defaultMeta();
  meta.banked.salvage = 100;
  const run = newRun('mars', 1);
  const once = bankRun(meta, run, { completed: true, settled: { salvage: 50, data: 0, cores: 0, materials: {} } });
  check('banking does not mutate the original meta', meta.banked.salvage === 100);
  check('banking adds to the copy', once.banked.salvage === 150);
}

// --- storage that throws must not take the game down
{
  const hostile = { get: () => { throw new Error('nope'); }, set: () => { throw new Error('nope'); }, remove: () => {} };
  let threw = false;
  let result = null;
  try { result = loadMeta(hostile); } catch { threw = true; }
  check('a hostile storage read does not throw', !threw);
  check('a hostile storage read returns usable defaults',
    !!result && result.source === 'unreadable' && result.meta.version === SAVE_VERSION);
  check('saving to hostile storage reports failure', saveMeta(defaultMeta(), hostile) === false);
  let runThrew = false;
  try { loadRun(hostile); } catch { runThrew = true; }
  check('a hostile run read does not throw', !runThrew);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
