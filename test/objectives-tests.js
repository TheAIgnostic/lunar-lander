// Optional objectives, the distance gradient and the fuel road:
//   node test/objectives-tests.js
import { OBJECTIVES, OBJECTIVE_IDS, objectiveDef, cargoFor, evaluateObjective } from '../src/objectives.js';
import { Terrain } from '../src/terrain.js';
import { spawnFor } from '../src/spawn.js';
import { flyMission } from './pilot.js';
import { missionReward } from '../src/economy.js';
import { MOON_LEVELS, MARS_LEVELS, EUROPA_LEVELS, generateChapter } from '../src/missions.js';
import { LEVELS } from '../src/levels.js';

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${e}`); } };

console.log('objectives, distance tiers and the fuel road');

const AUTHORED = [...MOON_LEVELS, ...MARS_LEVELS, ...EUROPA_LEVELS];
const SEEDS = [1000, 1137, 1274, 1411, 1548, 1685];

// --- every objective the content names is actually implemented
{
  for (const lvl of AUTHORED) {
    const o = lvl.optionalObjective;
    if (!o) continue;
    check(`${lvl.id}: its objective exists`, !!objectiveDef(o.id), o.id);
    check(`${lvl.id}: its objective pays something`, !!o.reward && Object.keys(o.reward).length > 0);
  }
  check('every registered objective declares a kind',
    OBJECTIVE_IDS.every((id) => ['condition', 'cargo'].includes(OBJECTIVES[id].kind)));
  check('every condition objective can be tested',
    OBJECTIVE_IDS.filter((id) => OBJECTIVES[id].kind === 'condition')
      .every((id) => typeof OBJECTIVES[id].test === 'function'));
}

/** A plain flight report, the shape the game hands the judge. */
const report = (over = {}) => ({
  grade: 'PERFECT', onPad: true, centreFrac: 0.1, fuelFrac: 0.4, hullLost: 0,
  abilityUses: 0, radiation: 0, brokePad: false, cargoTaken: false, ...over,
});

// --- the conditions actually discriminate
{
  const lvl = { optionalObjective: { id: 'fuel-25', text: 'x', reward: { salvage: 40 } } };
  check('a met condition is met', evaluateObjective(lvl, report({ fuelFrac: 0.3 })).met);
  check('a missed condition is not', !evaluateObjective(lvl, report({ fuelFrac: 0.2 })).met);
  check('a met objective pays', evaluateObjective(lvl, report({ fuelFrac: 0.3 })).reward.salvage === 40);
  check('a missed objective pays nothing', evaluateObjective(lvl, report({ fuelFrac: 0.1 })).reward === null);
  check('the result explains itself', /%/.test(evaluateObjective(lvl, report()).progress));

  const hull = { optionalObjective: { id: 'hull-10', text: 'x', reward: { data: 30 } } };
  check('hull damage is judged', !evaluateObjective(hull, report({ hullLost: 0.4 })).met);
  const centre = { optionalObjective: { id: 'centre', text: 'x', reward: { cores: 1 } } };
  check('off pad can never meet a centring objective', !evaluateObjective(centre, report({ onPad: false })).met);
  const noab = { optionalObjective: { id: 'no-ability', text: 'x', reward: { cores: 1 } } };
  check('using the module fails the no-module objective', !evaluateObjective(noab, report({ abilityUses: 1 })).met);
  const perfect = { optionalObjective: { id: 'perfect', text: 'x', reward: { cores: 1 } } };
  check('cracking the ice fails a perfect objective', !evaluateObjective(perfect, report({ brokePad: true })).met);
  check('no objective, no result', evaluateObjective({}, report()) === null);
}

// --- cargo objectives get a real object, deep in the map
{
  const cargoLevels = AUTHORED.filter((l) => cargoFor(l));
  check('the cargo objectives are the four that ask for a thing', cargoLevels.length === 4,
    cargoLevels.map((l) => l.id).join());
  for (const lvl of cargoLevels) {
    let placed = 0;
    let deep = 0;
    for (const seed of SEEDS) {
      const t = new Terrain(lvl, seed);
      const st = spawnFor(lvl, t);
      if (t.cargo.length) placed++;
      const prize = t.pads.reduce((a, p) => ((p.reach || 0) > (a.reach || 0) ? p : a), t.pads[0]);
      // It belongs out with the prize, not next to where you started.
      if (t.cargo.length && Math.abs(t.cargo[0].x - st.x) > Math.abs(prize.reach) * 0.6) deep++;
      check(`${lvl.id}: the cargo is not sitting on a pad`, !t.cargo.length || !t.padAt(t.cargo[0].x));
    }
    check(`${lvl.id}: the cargo exists on every seed`, placed === SEEDS.length, `${placed}/${SEEDS.length}`);
    check(`${lvl.id}: the cargo is out at the deep end`, deep === SEEDS.length, `${deep}/${SEEDS.length}`);
  }
  check('a mission without a cargo objective has no cargo',
    new Terrain(MOON_LEVELS[1], 1000).cargo.length === 0);
}

// --- collecting is one rule, and it is the terrain's
{
  const t = new Terrain(MOON_LEVELS[0], 1000);
  const cell = t.fuelCells[0];
  check('nothing is collected at a distance', t.collect(cell.x + 400, cell.y).length === 0);
  const got = t.collect(cell.x, cell.y);
  check('a cell is collected when touched', got.length === 1 && got[0].kind === 'fuel');
  check('and only once', t.collect(cell.x, cell.y).length === 0);
  const crate = t.cargo[0];
  const gotCargo = t.collect(crate.x, crate.y);
  check('cargo is collected the same way', gotCargo.length === 1 && gotCargo[0].kind === 'cargo');
  check('the terrain knows the objective is done', t.cargoTaken === true);
}

// --- the gradient: near is reachable on the tank, deep needs the road
{
  let nearOk = 0, deepDirect = 0, deepRoad = 0, total = 0;
  for (const lvl of AUTHORED) {
    for (const seed of SEEDS) {
      total++;
      const nearT = new Terrain(lvl, seed);
      const near = nearT.pads.reduce((a, p, i) => ((p.tier || 0) < (nearT.pads[a].tier || 0) ? i : a), 0);
      if (flyMission(lvl, nearT, { padIndex: near }).outcome === 'land') nearOk++;
      if (flyMission(lvl, new Terrain(lvl, seed), { padIndex: 0 }).outcome === 'land') deepDirect++;
      if (flyMission(lvl, new Terrain(lvl, seed), { padIndex: 0, viaCells: true }).outcome === 'land') deepRoad++;
    }
  }
  check('the way home is always there', nearOk >= total * 0.9, `${nearOk}/${total}`);
  check('the fuel road beats flying straight at the prize', deepRoad > deepDirect, `${deepRoad} vs ${deepDirect}`);
  console.log(`       home ${nearOk}/${total} · prize direct ${deepDirect}/${total} · prize via the road ${deepRoad}/${total}`);
}

// --- distance pays
{
  const shallow = missionReward({ grade: 'PERFECT', padMultiplier: 3, fuelLeft: 50, maxFuel: 100, rareMaterial: 'Ore', firstClear: true, padTier: 0 });
  const deep = missionReward({ grade: 'PERFECT', padMultiplier: 3, fuelLeft: 50, maxFuel: 100, rareMaterial: 'Ore', firstClear: true, padTier: 2 });
  check('the deep zone pays more material', deep.material > shallow.material * 2, `${shallow.material} -> ${deep.material}`);
  check('the deep zone pays more salvage', deep.salvage > shallow.salvage);
  check('an off-pad landing gets no depth bonus',
    missionReward({ grade: 'PERFECT', padMultiplier: 3, fuelLeft: 50, maxFuel: 100, rareMaterial: 'Ore', offPad: true, padTier: 2 }).depth === 0);
}

// --- tiers exist where they should, and nowhere else
{
  for (const lvl of AUTHORED) {
    const t = new Terrain(lvl, 4242);
    check(`${lvl.id}: every pad has a distance tier`, t.pads.every((p) => p.tier != null));
    if (t.pads.length > 1) {
      const near = Math.min(...t.pads.map((p) => p.reach));
      const far = Math.max(...t.pads.map((p) => p.reach));
      check(`${lvl.id}: the map has a real gradient`, far > near * 1.8, `${near} -> ${far}`);
    }
  }
  check('legacy levels are untouched by any of this',
    new Terrain(LEVELS[0], 1000).pads.every((p) => p.tier == null && p.reach == null));
  const gen = generateChapter('TITAN', 4242, 1);
  check('generated chapters get the gradient too',
    new Terrain(gen.levels[0], 1000).pads.every((p) => p.tier != null));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
