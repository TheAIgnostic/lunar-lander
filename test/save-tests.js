// Save, migration and corruption tests:  node test/save-tests.js
import {
  SAVE_VERSION, KEYS, defaultMeta, migrateLegacy, loadMeta, saveMeta,
  newRun, loadRun, saveRun, clearRun, bankRun, resetAll, wipeForDeath,
} from '../src/save.js';
import { settleHaul, freshHaul } from '../src/economy.js';
import { purchase, COMPONENTS } from '../src/components.js';

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

// --- a save carrying fields of the wrong *type*, not just missing ones
//
// The tallies are grown with `+=` all over `main.js`, and a string that gets
// in - a hand-edited save, a corrupted-but-parseable write - concatenates
// forever instead of adding. Type coercion falls back to the default.
{
  const s = mkStore({ [KEYS.meta]: JSON.stringify({ version: 2,
    stats: { landings: '12', fuelBurned: null, crashes: 3 },
    banked: { salvage: 'lots', data: 85 }, diamonds: '1' }) });
  const { meta } = loadMeta(s);
  check('a string tally falls back to its default', meta.stats.landings === 0 && meta.stats.fuelBurned === 0);
  check('a numeric tally beside it is kept', meta.stats.crashes === 3);
  check('a string balance falls back, a number stays', meta.banked.salvage === 0 && meta.banked.data === 85);
  check('a mistyped trophy count falls back', meta.diamonds === 0);
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

// --- M25: an expedition saved before the ladder existed
//
// `cleared` is what the ladder and the completion check read, and a run written
// by any build before M25 has no such field. A player mid-expedition across the
// upgrade is exactly the save that exists in the wild, so it is reconstructed
// rather than defaulted to empty: `visited` is pushed on entry and a body is
// always cleared before the next is chosen, so the first `chaptersCleared`
// entries are the finished ones.
{
  const old = (extra) => mkStore({
    [KEYS.run]: JSON.stringify({ chapterId: 'MARS', missionIndex: 2, shuttles: 2, ...extra }),
  });
  const midMars = loadRun(old({ visited: ['LUNA', 'MARS'], chaptersCleared: 1 }));
  check('a pre-M25 run mid-Mars knows the Moon is behind it',
    JSON.stringify(midMars.cleared) === '["LUNA"]');

  const midMoon = loadRun(old({ visited: ['LUNA'], chaptersCleared: 0 }));
  check('...and one still on its first body has cleared nothing',
    JSON.stringify(midMoon.cleared) === '[]');

  const midEuropa = loadRun(old({ visited: ['LUNA', 'MARS', 'EUROPA'], chaptersCleared: 2 }));
  check('...and one on Europa has two behind it',
    JSON.stringify(midEuropa.cleared) === '["LUNA","MARS"]');

  const noVisited = loadRun(old({ chaptersCleared: 3 }));
  check('a run with no visited list survives the reconstruction',
    Array.isArray(noVisited.cleared) && noVisited.cleared.length === 0);

  const already = loadRun(old({ visited: ['LUNA'], chaptersCleared: 0, cleared: ['LUNA', 'MARS'] }));
  check('a run that already has the field keeps it',
    JSON.stringify(already.cleared) === '["LUNA","MARS"]');
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
  // A separate run for the winning path: one expedition cannot both fail and
  // complete, and since M13 the same run can only be banked once.
  const wonRun = newRun('moon', 1);
  wonRun.score = 4200;
  const won = bankRun(meta, wonRun, { completed: true, settled });
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

// --- the progression checklist (roadmap section 17)
{
  // Prevent double rewards when reloading: banking the same run twice pays once.
  const run = newRun('moon', 4242);
  run.haul = { salvageSafe: 100, salvageCargo: 100, data: 50, cores: 1, materials: {} };
  run.score = 900;
  const settled = settleHaul(run.haul, { completed: true });
  const once = bankRun(defaultMeta(), run, { completed: true, settled });
  const twice = bankRun(once, run, { completed: true, settled });
  check('a run banks once', once.banked.salvage === settled.salvage);
  check('banking the same settlement again pays nothing', twice.banked.salvage === once.banked.salvage);
  check('the run records what it has been paid for', run.banked.includes('final'));

  // A checkpoint is a different settlement, so it pays even though the run has
  // already banked once - that is the whole point of a checkpoint.
  const mid = bankRun(twice, run, { completed: true, settled, id: 'sector-1' });
  check('a checkpoint settlement still pays', mid.banked.salvage > twice.banked.salvage);
  check('and it too pays only once',
    bankRun(mid, run, { completed: true, settled, id: 'sector-1' }).banked.salvage === mid.banked.salvage);

  // A fresh run is unaffected by the previous one's stamp.
  const next = newRun('mars', 99);
  next.haul = { salvageSafe: 10, salvageCargo: 0, data: 0, cores: 0, materials: {} };
  const after = bankRun(twice, next, { completed: false, settled: settleHaul(next.haul, { completed: false }) });
  check('the next run banks normally', after.banked.salvage > twice.banked.salvage);
}

{
  // Crash with 2, 1 and 0 shuttles: the run survives the first two and only the
  // last one settles. This is the shape main.js drives; the save is what has to
  // stay coherent across it.
  const s = mkStore();
  let run = newRun('moon', 7);
  for (const remaining of [2, 1, 0]) {
    run.shuttles = remaining;
    run.missionIndex = 2;
    saveRun(run, s);
    const back = loadRun(s);
    check(`a crash with ${remaining} left keeps the run readable`, !!back && back.shuttles === remaining);
    check(`the seed is kept for the retry (${remaining} left)`, back.seed === 7);
  }
  clearRun(s);
  check('an ended expedition leaves no run behind', loadRun(s) === null);
}

{
  // Quit during flight, on the result screen, in the hangar, mid-purchase and
  // on the route screen. Each is "the run is persisted, then the tab closes".
  const s = mkStore();
  const stages = ['flight', 'result', 'hangar', 'purchase', 'route'];
  let meta = defaultMeta();
  meta.banked.salvage = 1000;
  // Stock whatever the upgrade under test actually asks for. Naming a material
  // here made this test a hostage to the cost tables, and M28's re-cut moved
  // the one it named onto a different body.
  const rcsCost = COMPONENTS.rcs.levels[1].cost;
  for (const [m, n] of Object.entries(rcsCost.materials)) meta.banked.materials[m] = n + 60;
  let ok = true;
  for (const stage of stages) {
    const run = newRun('moon', 1234);
    run.missionIndex = 3;
    run.haul = { salvageSafe: 40, salvageCargo: 40, data: 20, cores: 0, materials: {} };
    saveRun(run, s);
    if (stage === 'purchase') {
      // A purchase completes against the *saved* meta, so quitting after the
      // write can never deduct twice.
      const bought = purchase('rcs', meta.componentLevels, meta.banked);
      meta = { ...meta, banked: bought.banked, componentLevels: bought.componentLevels };
      saveMeta(meta, s);
    }
    saveMeta(meta, s);
    const reloadedRun = loadRun(s);
    const reloadedMeta = loadMeta(s).meta;
    if (!reloadedRun || reloadedRun.missionIndex !== 3) ok = false;
    if (reloadedMeta.banked.salvage !== meta.banked.salvage) ok = false;
    if (reloadedMeta.componentLevels.rcs !== meta.componentLevels.rcs) ok = false;
  }
  check('quitting at any stage reloads to the same place', ok);
  check('a completed purchase is deducted exactly once',
    meta.banked.salvage === 1000 - rcsCost.salvage, String(meta.banked.salvage));
  check('the bought level stuck', meta.componentLevels.rcs === 2);
}

// --- M28: the anti-frustration floor actually reaches the player
//
// M13 built `DEBRIEF` so "a run that ends badly still ends with a decision".
// M24 then made death empty `meta.banked`. The two met and nobody noticed: the
// floor was banked by `bankRun` and zeroed by `wipeForDeath` on the next line,
// so it had not paid out since. M27 made it matter more by removing replay -
// this is now the only income a run that dies early leaves behind.
//
// The order is the fix, so the order is what these assert.
{
  const settled = settleHaul(freshHaul(), { completed: false });
  check('a failed run still files a debrief', settled.debrief !== null);

  let meta = defaultMeta();
  meta = bankRun(meta, { banked: [], sector: 1, visited: [], score: 0 },
    { completed: false, settled, id: 'final' });
  check('banking it before the wipe is not enough', meta.banked.salvage > 0);
  check('...because the wipe takes it', wipeForDeath(meta).banked.salvage === 0);

  const paid = wipeForDeath(meta, { debrief: settled.debrief });
  check('paying it through the wipe is what reaches the player',
    paid.banked.salvage === settled.debrief.salvage && paid.banked.data === settled.debrief.data,
    `${paid.banked.salvage}/${paid.banked.data}`);
  check('the debrief still leaves the player able to buy something',
    paid.banked.data >= 40, String(paid.banked.data));
  check('death still takes everything else',
    Object.keys(paid.purchasedSkills).length === 0 && paid.banked.cores === 0
    && Object.keys(paid.banked.materials).length === 0);
  check('and still keeps what the hangar built',
    JSON.stringify(paid.componentLevels) === JSON.stringify(meta.componentLevels));

  // **The floor is what death leaves - exactly, for everyone.** It used to be
  // `DEBRIEF - transmitted`, which paid the *complement* of the final leg's
  // haul: die empty and keep 60/40, die carrying 42/10 and keep 18/30, die
  // carrying the floor or more and keep nothing at all. Both endpoints were
  // asserted here and the middle was never asked, which is how a payout that
  // *punished* gathering shipped as an anti-frustration feature. The three
  // cases below pin the whole curve: flat at the floor.
  const cases = [
    ['empty hold', freshHaul()],
    ['a little gathered', { salvageSafe: 42, salvageCargo: 0, data: 10, cores: 0, materials: {} }],
    ['a rich final leg', { salvageSafe: 400, salvageCargo: 400, data: 200, cores: 2, materials: {} }],
  ];
  for (const [name, haul] of cases) {
    const s = settleHaul(haul, { completed: false });
    const after = wipeForDeath(defaultMeta(), { debrief: s.debrief });
    check(`death leaves exactly the floor: ${name}`,
      after.banked.salvage === 60 && after.banked.data === 40,
      `${after.banked.salvage}/${after.banked.data}`);
  }
  // Everything above the floor is what the wipe costs - the floor is a floor,
  // not a subsidy, and a rich run keeps not one salvage more than a wreck.
  const rich = settleHaul({ salvageSafe: 400, salvageCargo: 400, data: 200, cores: 2, materials: {} },
    { completed: false });
  check('a rich run keeps nothing above the floor',
    wipeForDeath(defaultMeta(), { debrief: rich.debrief }).banked.salvage === 60);
}

// --- the diamond
//
// Awarded for carrying an expedition through all ten bodies. It is a trophy
// rather than a resource: nothing spends it, and unlike every banked resource it
// survives a death, because the thing it records already happened.
{
  check('a new save has no diamonds', defaultMeta().diamonds === 0);
  const earned = { ...defaultMeta(), diamonds: 2, banked: { salvage: 900, data: 90, cores: 3, materials: { X: 5 } } };
  const dead = wipeForDeath(earned);
  check('death does not take the diamonds', dead.diamonds === 2, String(dead.diamonds));
  check('death still takes everything else', dead.banked.salvage === 0 && dead.banked.cores === 0);
  const s = mkStore();
  saveMeta(earned, s);
  check('diamonds survive a save and reload', loadMeta(s).meta.diamonds === 2);
  check('NEW GAME clears them', resetAll(earned, mkStore()).diamonds === 0);
  const legacy = { ...defaultMeta() };
  delete legacy.diamonds;
  check('a save from before they existed loads at zero',
    loadMeta(mkStore({ [KEYS.meta]: JSON.stringify(legacy) })).meta.diamonds === 0);
}

// --- god mode is a test switch, and must behave like one
//
// It lives in the save so it survives a reload - which is exactly why it has to
// default off and be cleared by NEW GAME. A flag that quietly persisted into
// what someone thinks is a fresh game would make every number after it a lie.
{
  // **Two active slots since M37**, and a save written before them has one.
  // The loadout screen and `startLevel` both index `active2` directly, so
  // "missing" and "empty" must not be two states to handle - a mutation that
  // drops it from the coercion raised nothing until this was written down.
  {
    const older = JSON.stringify({ version: 2, equipped: { active: 'pulse-laser', passive: 'ice-cleats' } });
    const eq = loadMeta({ get: () => older, set: () => {} }).meta.equipped;
    check('a save from before the second slot loads with it empty', eq.active2 === null,
      JSON.stringify(eq));
    check('and keeps what it already had', eq.active === 'pulse-laser' && eq.passive === 'ice-cleats');
    const newer = JSON.stringify({ version: 2, equipped: { active: 'pulse-laser', active2: 'ray-shield', passive: null } });
    check('and a save with two actives keeps both',
      loadMeta({ get: () => newer, set: () => {} }).meta.equipped.active2 === 'ray-shield');
  }
  check('god mode is off on a new save', defaultMeta().godMode === false);

  const s = mkStore();
  const on = { ...defaultMeta(), godMode: true, banked: { salvage: 999999, data: 0, cores: 0, materials: {} } };
  saveMeta(on, s);
  check('god mode survives a save and reload', loadMeta(s).meta.godMode === true);

  const reset = resetAll(on, s);
  check('NEW GAME clears god mode', reset.godMode === false);
  check('NEW GAME clears what god mode granted', reset.banked.salvage === 0);

  // A save written before the flag existed must not come back with it on.
  const legacy = { ...defaultMeta() };
  delete legacy.godMode;
  const s2 = mkStore({ [KEYS.meta]: JSON.stringify(legacy) });
  check('a save from before the flag existed loads with it off',
    loadMeta(s2).meta.godMode === false);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
