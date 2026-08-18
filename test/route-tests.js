// Route eligibility and economy rules:  node test/route-tests.js
import { eligibleBodies, routeOffers, isCheckpoint, TIERS } from '../src/route.js';
import { missionReward, addReward, settleHaul, bankHaul, freshHaul } from '../src/economy.js';
import { PLANET_IDS } from '../src/planets.js';

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${e}`); } };

console.log('route and economy');

// --- discovery tiers
check('tier A only, at the start', eligibleBodies([]).every((b) => TIERS.A.includes(b)));
check('tier B stays shut after one non-Moon chapter',
  !eligibleBodies(['LUNA', 'MARS']).some((b) => TIERS.B.includes(b)));
check('tier B opens after two non-Moon chapters',
  eligibleBodies(['LUNA', 'MARS', 'EUROPA']).some((b) => TIERS.B.includes(b)));
check('tier C stays shut before five chapters',
  !eligibleBodies(['LUNA', 'MARS', 'EUROPA', 'TITAN']).some((b) => TIERS.C.includes(b)));
check('tier C opens after five',
  eligibleBodies(['LUNA', 'MARS', 'EUROPA', 'TITAN', 'ENCELADUS']).some((b) => TIERS.C.includes(b)));
check('a cleared body drops out of the pool', !eligibleBodies(['LUNA', 'MARS']).includes('MARS'));
check('the pool is never empty', eligibleBodies(PLANET_IDS).length > 0);

// --- offers
{
  const offers = routeOffers(['LUNA'], 4242, 1);
  check('four offers are made', offers.length === 4, String(offers.length));
  check('offers never repeat a body', new Set(offers.map((o) => o.planet)).size === offers.length);
  check('offers carry what a decision needs',
    offers.every((o) => o.gravity > 0 && o.rareMaterial && o.recommended.length && o.difficulty >= 1));
  check('offers are deterministic from the seed',
    JSON.stringify(routeOffers(['LUNA'], 4242, 1)) === JSON.stringify(offers));
  check('a different seed offers differently',
    JSON.stringify(routeOffers(['LUNA'], 99, 1)) !== JSON.stringify(offers));
  check('offers are ordered easiest first',
    offers.every((o, i) => i === 0 || offers[i - 1].difficulty <= o.difficulty));
  check('some forecasts are incomplete, as designed',
    routeOffers(['LUNA'], 7, 1).concat(routeOffers(['LUNA'], 8, 1)).some((o) => o.incomplete));
}
{
  // near the end of the campaign there are fewer bodies than card slots
  const nearlyDone = PLANET_IDS.filter((p) => p !== 'GANYMEDE');
  const offers = routeOffers(nearlyDone, 1, 5);
  check('offers never exceed the pool', offers.length >= 1 && offers.length <= 4, String(offers.length));
  check('offers still make a valid card', offers.every((o) => !!o.name));
}

// --- checkpoints
check('no checkpoint before two chapters', !isCheckpoint(0) && !isCheckpoint(1));
check('checkpoint every second chapter', isCheckpoint(2) && !isCheckpoint(3) && isCheckpoint(4));

// --- rewards
{
  const perfect = missionReward({ grade: 'PERFECT', padMultiplier: 5, fuelLeft: 60, maxFuel: 120, rareMaterial: 'X', firstClear: true });
  const hard = missionReward({ grade: 'HARD', padMultiplier: 2, fuelLeft: 5, maxFuel: 120, rareMaterial: 'X', firstClear: false });
  check('a better landing pays more', perfect.salvage > hard.salvage);
  check('a small pad pays a core on a perfect landing', perfect.cores === 1);
  check('a hard landing pays no core', hard.cores === 0);
  check('an off-pad landing loses the multiplier',
    missionReward({ grade: 'PERFECT', padMultiplier: 5, fuelLeft: 0, maxFuel: 120, offPad: true }).cores === 0);
  check('first clears pay more research', perfect.data > hard.data);
}

// --- the risk split
{
  let haul = freshHaul();
  haul = addReward(haul, missionReward({ grade: 'PERFECT', padMultiplier: 3, fuelLeft: 50, maxFuel: 100, rareMaterial: 'Ore', firstClear: true }));
  check('salvage splits between transmitted and cargo', haul.salvageSafe > 0 && haul.salvageCargo > 0);
  check('the split is even to the unit',
    Math.abs(haul.salvageSafe - haul.salvageCargo) <= 1, `${haul.salvageSafe}/${haul.salvageCargo}`);

  const kept = settleHaul(haul, { completed: false });
  check('a lost expedition keeps transmitted salvage', kept.salvage === haul.salvageSafe);
  check('a lost expedition loses the cargo', kept.lost.salvage === haul.salvageCargo);
  check('research is never lost', kept.data === haul.data);
  check('cores need a safe landing', kept.cores === 0);
  check('materials are cargo too', Object.keys(kept.materials).length === 0);

  const won = settleHaul(haul, { completed: true });
  check('a completed expedition keeps everything',
    won.salvage === haul.salvageSafe + haul.salvageCargo && won.cores === haul.cores);
  check('recovery skills can rescue part of the cargo',
    settleHaul(haul, { completed: false, recovered: 0.5 }).salvage > kept.salvage);

  const banked = bankHaul({ salvage: 10, data: 0, cores: 0, materials: { Ore: 5 } }, won);
  check('banking adds to what was there', banked.salvage === 10 + won.salvage);
  check('banking merges materials', banked.materials.Ore === 5 + (won.materials.Ore || 0));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
