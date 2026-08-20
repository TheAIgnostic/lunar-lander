// Route eligibility and economy rules:  node test/route-tests.js
import { eligibleBodies, routeOffers, routeChoices, isCheckpoint, isExpeditionComplete, MIN_OFFERS, nextPlanet, PLANET_ORDER, SECTORS, TIERS } from '../src/route.js';
import { missionReward, addReward, settleHaul, bankHaul, freshHaul, CORE_PITY, DEBRIEF } from '../src/economy.js';
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
// A cleared body steps aside for anything unexplored, but comes back rather
// than letting the route screen shrink below four cards.
{
  const thin = eligibleBodies(['LUNA', 'MARS']);
  check('unexplored bodies come first', thin.slice(0, 3).every((b) => b !== 'MARS'), thin.join());
  // A cleared body only comes back when the unexplored pool cannot fill the
  // card slots. With two cards that needs the pool worn right down to one.
  const worn = eligibleBodies(PLANET_IDS.filter((p) => p !== 'GANYMEDE'));
  check('a cleared body returns only to fill the card slots',
    worn[0] === 'GANYMEDE' && worn.length > 1, worn.join());
  const wide = eligibleBodies(['LUNA', 'MARS', 'EUROPA']);
  check('with enough unexplored bodies, cleared ones stay out',
    !wide.includes('MARS') && !wide.includes('EUROPA'), wide.join());
}
check('the pool is never empty', eligibleBodies(PLANET_IDS).length > 0);

// --- offers
{
  const offers = routeOffers(['LUNA'], 4242, 1);
  check('two offers are made', offers.length === MIN_OFFERS, String(offers.length));
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
    [1, 7, 8, 42, 99, 1234, 5150].flatMap((sd) => routeOffers(['LUNA'], sd, 1)).some((o) => o.incomplete));
  check('and some are complete, so incompleteness means something',
    [1, 7, 8, 42, 99, 1234, 5150].flatMap((sd) => routeOffers(['LUNA'], sd, 1)).some((o) => !o.incomplete));
}
{
  // near the end of the campaign there are fewer bodies than card slots
  const nearlyDone = PLANET_IDS.filter((p) => p !== 'GANYMEDE');
  const offers = routeOffers(nearlyDone, 1, 5);
  check('offers never exceed the pool', offers.length >= 1 && offers.length <= MIN_OFFERS, String(offers.length));
  check('offers still make a valid card', offers.every((o) => !!o.name));
}

// --- the ladder (M25)
//
// These replace the old sector tests. An expedition used to run five sectors
// with a checkpoint every second body; it is a linear three-body ladder now,
// with a supply stop after every one. The property being protected is the same
// - there is a place to spend, and there is an end - but both moved.
check('the ladder is Moon, Mars, Europa in that order',
  PLANET_ORDER.join(',') === 'LUNA,MARS,EUROPA');
check('a fresh run starts at the Moon', nextPlanet([]) === 'LUNA');
check('clearing the Moon points at Mars', nextPlanet(['LUNA']) === 'MARS');
check('clearing Moon and Mars points at Europa', nextPlanet(['LUNA', 'MARS']) === 'EUROPA');
check('the ladder ends after Europa', nextPlanet(['LUNA', 'MARS', 'EUROPA']) === null);
check('an expedition is not complete part-way',
  !isExpeditionComplete([]) && !isExpeditionComplete(['LUNA']) && !isExpeditionComplete(['LUNA', 'MARS']));
check('and is complete once every body is cleared',
  isExpeditionComplete(['LUNA', 'MARS', 'EUROPA']));
check('order does not matter to completion', isExpeditionComplete(['EUROPA', 'LUNA', 'MARS']));

// The bug this milestone was reported for: salvage reaches `meta.banked` only
// when a checkpoint banks the haul, so a checkpoint that does not fire after
// the first body means a whole chapter's pay is unspendable.
check('every body is a supply stop', isCheckpoint(1) && isCheckpoint(2) && isCheckpoint(3));
check('but not before one is cleared', !isCheckpoint(0));

// --- what the route window offers
{
  const first = routeChoices([], 1, 4242);
  check('before anything is cleared it offers one card', first.length === 1);
  check('...and that card is the Moon, marked as next',
    first[0].planet === 'LUNA' && first[0].isNext && !first[0].cleared);

  const second = routeChoices(['LUNA'], 2, 4242);
  check('after the Moon it offers two', second.length === 2);
  check('...the Moon, replayable to farm', second[0].planet === 'LUNA' && second[0].cleared && !second[0].isNext);
  check('...and Mars as the next body', second[1].planet === 'MARS' && second[1].isNext);

  const third = routeChoices(['LUNA', 'MARS'], 3, 4242);
  check('after Mars it offers all three', third.length === 3);
  check('exactly one card is ever the next body',
    [first, second, third].every((set) => set.filter((c) => c.isNext).length === 1));

  const done = routeChoices(['LUNA', 'MARS', 'EUROPA'], 4, 4242);
  check('with the ladder finished nothing is marked next',
    done.length === 3 && done.every((c) => !c.isNext && c.cleared));
  check('every card carries a readable forecast',
    [...first, ...second, ...third].every((c) => !!c.name && !!c.rareMaterial && Array.isArray(c.hazards)));
}

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
  check('a lost expedition keeps transmitted salvage', kept.salvage >= haul.salvageSafe);
  check('a lost expedition loses the cargo', kept.lost.salvage === haul.salvageCargo);
  check('research is never lost', kept.data >= haul.data);
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

// --- anti-frustration (roadmap section 13)
{
  // A run that ends with almost nothing still files a debrief, so the player
  // always leaves with a decision to make rather than an empty hangar.
  const thin = settleHaul(freshHaul(), { completed: false });
  check('a failed expedition still transmits a debrief', thin.salvage >= DEBRIEF.salvage && thin.data >= DEBRIEF.data,
    `${thin.salvage}/${thin.data}`);
  check('the debrief is reported, not smuggled in', !!thin.debrief);
  check('the cheapest skill rank is affordable after one failure', thin.data >= 40);

  // A good run is never topped up - the floor is a floor, not a subsidy.
  let rich = freshHaul();
  for (let i = 0; i < 6; i++) rich = addReward(rich, missionReward({ grade: 'PERFECT', padMultiplier: 3, fuelLeft: 60, maxFuel: 120, firstClear: true }));
  const settledRich = settleHaul(rich, { completed: false });
  check('a good run gets no top-up', settledRich.debrief === null);

  // Tech Core bad-luck protection.
  const dry = missionReward({ grade: 'GOOD', padMultiplier: 2, fuelLeft: 10, maxFuel: 100, firstClear: false, coreDrought: CORE_PITY });
  check('a long core drought eventually pays out', dry.cores === 1 && dry.pityCore === true);
  const early = missionReward({ grade: 'GOOD', padMultiplier: 2, fuelLeft: 10, maxFuel: 100, firstClear: false, coreDrought: 2 });
  check('a short drought does not', early.cores === 0);
  const earned = missionReward({ grade: 'PERFECT', padMultiplier: 5, fuelLeft: 10, maxFuel: 100, firstClear: false, coreDrought: 0 });
  check('an earned core is still an earned core', earned.cores === 1 && !earned.pityCore);
}

// --- the route always offers a real choice.
//
// The rule survived the change from four cards to two: whatever has been
// cleared and whatever sector the run is in, the screen must show a full set of
// distinct bodies. Two identical-looking options is the failure this catches
// now, where three-instead-of-four was the failure it caught before.
{
  const shapes = [[], ['LUNA'], ['LUNA', 'MARS'], ['LUNA', 'MARS', 'EUROPA', 'TITAN', 'ENCELADUS'],
    ['LUNA', 'MARS', 'EUROPA', 'TITAN', 'ENCELADUS', 'MERCURY', 'VENUS', 'IO', 'PLUTO', 'GANYMEDE']];
  let ok = true;
  for (const cleared of shapes) {
    for (let sector = 1; sector <= 5; sector++) {
      for (const seed of [1, 99, 12345, 777777]) {
        const offers = routeOffers(cleared, seed, sector);
        const ids = offers.map((o) => o.planet);
        if (offers.length < MIN_OFFERS || new Set(ids).size !== ids.length) {
          ok = false;
          console.log(`  ...  cleared ${cleared.length}, sector ${sector}, seed ${seed}: ${ids.join()}`);
        }
      }
    }
  }
  check('every route screen offers two distinct bodies, at every stage', ok);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
