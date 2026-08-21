// Route eligibility and economy rules:  node test/route-tests.js
import { routeChoices, ladderTrail, planetCard, isCheckpoint, isExpeditionComplete, nextPlanet, PLANET_ORDER } from '../src/route.js';
import { makeRng } from '../src/util.js';
import { missionReward, addReward, settleHaul, bankHaul, freshHaul, CORE_PITY, DEBRIEF } from '../src/economy.js';
import { PLANET_IDS, PLANETS } from '../src/planets.js';
import { WORLDS } from '../src/levels.js';
import { chapterFor } from '../src/missions.js';
import { everyMaterial } from '../src/components.js';

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${e}`); } };

console.log('route and economy');

// --- discovery tiers: deleted with the machinery.
//
// `TIERS`, `eligibleBodies`, `routeOffers`, `MIN_OFFERS` and `SECTORS` were
// M9's forecast machinery, unwired since M25 and kept only because it was still
// an open question whether the seven survey bodies would rejoin the route as a
// tiered choice. M27 answered it - they join `PLANET_ORDER` - so the code and
// the twenty-odd checks that covered it went with the answer. What replaces
// them is the ladder section below.

// --- the ladder (M27)
//
// Ten bodies in one fixed order, Moon first and Venus last, and it never varies
// between runs. These replace the M25 three-body checks: the property is the
// same - there is an order, a place to spend, and an end - but all three moved.
check('the ladder is ten bodies', PLANET_ORDER.length === 10, String(PLANET_ORDER.length));
check('it starts at the Moon and ends at Venus',
  PLANET_ORDER[0] === 'LUNA' && PLANET_ORDER[9] === 'VENUS', PLANET_ORDER.join(','));
check('it is the difficulty-sorted order Tom set',
  PLANET_ORDER.join(',') === 'LUNA,EUROPA,TITAN,MARS,ENCELADUS,GANYMEDE,IO,MERCURY,PLUTO,VENUS',
  PLANET_ORDER.join(','));
check('every body in the game is on it', new Set(PLANET_ORDER).size === PLANET_IDS.length
  && PLANET_IDS.every((id) => PLANET_ORDER.includes(id)));

// The blocker this milestone exists to clear: a hangar level costs salvage plus
// a material only one body produces, and the three-body ladder put seven of the
// ten out of reach. This is the check that the fix is structural rather than a
// re-pointing of the costs - every material has a body on the route that makes
// it.
check('every rare material in the game is on the ladder',
  PLANET_IDS.every((id) => PLANET_ORDER.some((b) => PLANETS[b].rareMaterial === PLANETS[id].rareMaterial)));
// The stronger form, and the one that will still be doing work after M28's
// re-authoring pass: every material a *component asks for* is produced by a body
// the player actually flies to. This is the M27 blocker stated as an invariant -
// it is what fails if a re-cut points a cost at something unreachable.
{
  const produced = new Set(PLANET_ORDER.map((id) => PLANETS[id].rareMaterial));
  const orphans = everyMaterial().filter((m) => !produced.has(m));
  check('every material the hangar charges for is produced somewhere on the ladder',
    orphans.length === 0, orphans.join(', '));
}

check('a fresh run starts at the Moon', nextPlanet([]) === 'LUNA');
check('clearing the Moon points at Europa', nextPlanet(['LUNA']) === 'EUROPA');
check('the ladder walks in order, whatever order it is told about',
  PLANET_ORDER.every((id, i) => nextPlanet(PLANET_ORDER.slice(0, i).reverse()) === id));
check('the ladder ends after Venus', nextPlanet(PLANET_ORDER) === null);
check('an expedition is not complete part-way',
  PLANET_ORDER.slice(0, 9).every((_, i) => !isExpeditionComplete(PLANET_ORDER.slice(0, i + 1))));
check('and is complete once every body is cleared', isExpeditionComplete(PLANET_ORDER));
check('order does not matter to completion', isExpeditionComplete([...PLANET_ORDER].reverse()));

// The bug M25 was reported for: salvage reaches `meta.banked` only when a
// checkpoint banks the haul, so a checkpoint that does not fire after the first
// body means a whole chapter's pay is unspendable.
check('every body is a supply stop', PLANET_ORDER.every((_, i) => isCheckpoint(i + 1)));
check('but not before one is cleared', !isCheckpoint(0));

// --- no replay (M27, Tom's decision 3)
//
// The route window offers the next body and nothing else. This is enforced by
// what `routeChoices` returns rather than by the screen, because `route:N`
// indexes that array: if a cleared body is never in it, there is no index that
// reaches one.
{
  let ok = true, off = '';
  for (let n = 0; n < PLANET_ORDER.length; n++) {
    const cleared = PLANET_ORDER.slice(0, n);
    const offers = routeChoices(cleared, n + 1, 4242);
    if (offers.length !== 1 || !offers[0].isNext || offers[0].planet !== PLANET_ORDER[n]
        || offers[0].cleared || cleared.includes(offers[0].planet)) {
      ok = false; off = `${n} cleared -> ${offers.map((o) => o.planet).join()}`;
    }
  }
  check('the route window offers exactly one body, and it is the next one', ok, off);
  check('a cleared body is never offered again',
    routeChoices(['LUNA'], 2, 4242).every((c) => c.planet !== 'LUNA'));
  check('with the ladder finished nothing is offered',
    routeChoices(PLANET_ORDER, 11, 4242).length === 0);
  check('the card carries what a supply stop needs to decide',
    routeChoices([], 1, 4242).every((c) => c.gravity > 0 && c.rareMaterial && c.recommended.length
      && c.difficulty >= 1 && Array.isArray(c.hazards)));
  check('the offer is deterministic from the seed',
    JSON.stringify(routeChoices(['LUNA'], 2, 4242)) === JSON.stringify(routeChoices(['LUNA'], 2, 4242)));
}

// --- the progress trail
//
// What replaced the cleared-body cards: the whole ladder, drawn, with no way to
// click any of it.
{
  const trail = ladderTrail(['LUNA', 'EUROPA']);
  check('the trail is the whole ladder, always', trail.length === PLANET_ORDER.length);
  check('it is in ladder order', trail.every((r, i) => r.planet === PLANET_ORDER[i] && r.position === i + 1));
  check('cleared bodies are marked cleared', trail[0].cleared && trail[1].cleared);
  check('exactly one rung is next', trail.filter((r) => r.isNext).length === 1);
  check('...and it is the body after the last cleared one', trail[2].isNext && trail[2].planet === 'TITAN');
  check('the rest are marked ahead', trail.slice(3).every((r) => r.ahead && !r.cleared && !r.isNext));
  check('every rung has a name to draw', trail.every((r) => !!r.name));
  check('a finished ladder marks nothing next', ladderTrail(PLANET_ORDER).every((r) => r.cleared && !r.isNext));
  check('a fresh ladder marks only the Moon next',
    ladderTrail([]).filter((r) => r.isNext).length === 1 && ladderTrail([])[0].isNext);
}

// --- the forecast still carries information at body 10
//
// It did not. `difficulty` and `enemyIntensity` were both bumped by the sector,
// which ran to 3 under M25 and runs to 10 now: measured across the ladder, six
// of the ten cards printed an identical forecast (difficulty 5, "heavy"). That
// is the M24 saturation fault - a formula that destroys the ordering the
// content was authored with - and these are the checks that it stays fixed.
{
  const cards = PLANET_ORDER.map((id, i) => planetCard(id, i + 1, makeRng(7)));
  const diffs = new Set(cards.map((c) => c.difficulty));
  check('difficulty still spreads across the whole ladder', diffs.size >= 4, [...diffs].join());
  check('difficulty rises down the ladder and never falls',
    cards.every((c, i) => i === 0 || cards[i - 1].difficulty <= c.difficulty),
    cards.map((c) => c.difficulty).join());
  check('the Moon is the easiest and Venus the hardest',
    cards[0].difficulty === 1 && cards[9].difficulty === 5);
  check('resistance is read off the chapter, not guessed',
    cards.every((c) => typeof c.machines === 'number'
      && (c.machines === 0) === (c.enemyIntensity === 'none')));
  check('the same machine count always reads the same way',
    cards.every((c) => cards.filter((o) => o.machines === c.machines)
      .every((o) => o.enemyIntensity === c.enemyIntensity)));

  // **Printed, not asserted.** Reading resistance off the chapter fixed the
  // saturation and immediately exposed something the saturated "heavy" had been
  // hiding: the machine count barely moves down the ladder, and where it moves
  // it moves the wrong way. The authored bodies field 4 and 5; every survey
  // body caps at 3, because `generateChapter`'s budget is `min(3, ...)`. And
  // Enceladus, at position 5, has no `eligibleEnemySets` at all - a body with
  // nothing hostile on it, halfway down.
  //
  // That is an M28 balance finding and an M29 content one, not a formula bug,
  // so it is measured here rather than gated. A number nobody watches rots.
  console.log('  ..  machines down the ladder: '
    + cards.map((c) => `${c.planet.slice(0, 3).toLowerCase()} ${c.machines}`).join(' · '));
}

// --- every body is its own body
//
// Six of the ten used to point `world` at another body's palette, so Mercury,
// Io and Venus announced themselves as MARS and Enceladus, Ganymede and Pluto as
// EUROPA - the name drawn over the mission and the entire colour scheme. Tom
// found it on a full run: "when I click mercury, levels for mars come". The
// terrain was always right; the label and the paint were not.
{
  const worlds = PLANET_ORDER.map((id) => PLANETS[id].world);
  check('every body has a world of its own', new Set(worlds).size === PLANET_ORDER.length,
    worlds.join(','));
  check('...and it is its own id', PLANET_ORDER.every((id) => PLANETS[id].world === id));
  check('every world exists in the palette table', PLANET_ORDER.every((id) => !!WORLDS[PLANETS[id].world]));
  // Not "the world name equals the display name" - the Moon is THE MOON on a
  // world called LUNA, deliberately. The property that matters is that no body
  // draws a name belonging to a *different* body, which is the bug itself.
  check('no body draws another body\'s name', PLANET_ORDER.every((id) => {
    const drawn = WORLDS[PLANETS[id].world].name;
    return !PLANET_ORDER.some((other) => other !== id
      && (PLANETS[other].displayName === drawn || other === drawn));
  }));
  const accents = PLANET_ORDER.map((id) => WORLDS[PLANETS[id].world].accent);
  check('no two bodies share an accent colour', new Set(accents).size === accents.length, accents.join(','));
  // Ice that is not slippery is a texture; slippery ground that is not ice is a
  // surprise. They travel together.
  const icy = PLANET_ORDER.filter((id) => PLANETS[id].terrainStyle === 'ice');
  check('the icy bodies are the slippery ones',
    icy.every((id) => PLANETS[id].surfaceFriction < 1), icy.join(','));
}

// --- the M26 shuffle, re-checked at ten bodies
//
// M26 exists because M25 made the campaign a fixed ladder: you re-fly the same
// maps every run, so one permanent silhouette per mission became unbearable.
// M27 makes that argument stronger, not weaker - ten bodies, still fixed, still
// every run - so the shuffle is re-measured across the whole ladder rather than
// the three bodies it was built against.
//
// The two failure modes it protects against are both real and both were found
// by measuring: a chapter that deals the same shapes on every seed (Europa did,
// on mulberry32's correlated first output), and a chapter that deals so few
// distinct shapes that the variety is nominal.
{
  const seeds = Array.from({ length: 40 }, (_, i) => 1000 + i * 137);
  const counts = PLANET_ORDER.map((id, i) => {
    const layouts = new Set();
    for (const seed of seeds) {
      layouts.add(chapterFor(id, seed, i + 1).levels
        .map((l) => (l.terrain && l.terrain.archetype) || '?').join('/'));
    }
    return { id, n: layouts.size };
  });
  const worst = counts.reduce((a, b) => (a.n <= b.n ? a : b));
  check('every body on the ladder deals more than one chapter layout',
    counts.every((c) => c.n > 1), `${worst.id} ${worst.n}`);
  check('and enough of them that re-flying a body is not re-flying a map',
    counts.every((c) => c.n >= 10), counts.map((c) => `${c.id} ${c.n}`).join(', '));
  console.log(`  ..  chapter layouts over 40 seeds: ${counts.map((c) => `${c.id.slice(0, 3).toLowerCase()} ${c.n}`).join(' · ')}`);
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

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
