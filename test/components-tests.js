// Component effects, purchase rules and stacking:  node test/components-tests.js
import {
  COMPONENTS, COMPONENT_IDS, deriveLoadout, purchaseCheck, purchase,
  RECOMMENDED_TIER, fittedLevels, tierCheck,
} from '../src/components.js';
import { PLANET_ORDER } from '../src/route.js';
import { PLANETS } from '../src/planets.js';
import { Ship, SHIP } from '../src/ship.js';

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${e}`); } };

console.log('components');

// --- every level must change something the simulation reads
for (const id of COMPONENT_IDS) {
  const c = COMPONENTS[id];
  check(`${id}: has four levels`, c.levels.length === 4);
  for (let i = 1; i < 4; i++) {
    check(`${id} L${i + 1}: changes a stat`, Object.keys(c.levels[i].effect).length > 0);
    check(`${id} L${i + 1}: costs salvage`, c.levels[i].cost.salvage > 0);
    check(`${id} L${i + 1}: costs more than the level below`,
      c.levels[i].cost.salvage > (c.levels[i - 1].cost ? c.levels[i - 1].cost.salvage : 0));
    check(`${id} L${i + 1}: explains itself`, typeof c.levels[i].describe === 'string' && c.levels[i].describe.length > 4);
  }
}

// --- deriving is pure and idempotent: the reason upgrades cannot stack twice
{
  const levels = { gear: 3, engine: 2 };
  const a = deriveLoadout(levels);
  const b = deriveLoadout(levels);
  check('deriving twice gives the same result', JSON.stringify(a) === JSON.stringify(b));
  check('a level-1 track contributes nothing', deriveLoadout({}).gearTier === 1);
  check('gear tier comes from the gear track', a.gearTier === 1.25, String(a.gearTier));
  check('fuel capacity comes from the engine track', a.fuelCapacity === 1.15);
  check('unrelated tracks stay neutral', a.rcsAccel === 1 && a.hullMax === 1);
  check('out-of-range levels are clamped',
    deriveLoadout({ gear: 99 }).gearTier === deriveLoadout({ gear: 4 }).gearTier);
}

// --- applying a loadout to a ship never mutates the shared constants
{
  const baseThrust = SHIP.thrust;
  const ship = new Ship();
  ship.applyLoadout(deriveLoadout({ engine: 4, rcs: 4, hull: 4, gear: 4 }));
  ship.reset(0, 0, 100);
  check('the shared SHIP constants are untouched', SHIP.thrust === baseThrust);
  check('the ship spec is upgraded', ship.spec.thrust > baseThrust, `${ship.spec.thrust} vs ${baseThrust}`);
  check('burn rate improves', ship.spec.burnMain < SHIP.burnMain);
  check('gear tier reaches the ship', ship.gearTier === 1.4);
  check('hull capacity grows', ship.hullMax === 140 && ship.hull === 140);

  // applying twice must not compound
  const once = { ...ship.spec };
  ship.applyLoadout(deriveLoadout({ engine: 4, rcs: 4, hull: 4, gear: 4 }));
  check('applying a loadout twice does not compound', ship.spec.thrust === once.thrust);
}

// --- purchases
{
  // Read the price off the table rather than writing it down here: M28 re-cut
  // every material cost, and a test that hardcodes one is asserting a decision
  // instead of a rule. What has to hold is that buying *spends what it says it
  // costs* - which is true at any price.
  const cost = COMPONENTS.gear.levels[1].cost;
  const material = Object.keys(cost.materials)[0];
  const banked = { salvage: cost.salvage + 80, materials: { [material]: cost.materials[material] + 10 } };
  const levels = { gear: 1 };
  const ok = purchaseCheck('gear', levels, banked);
  check('an affordable upgrade is allowed', ok.ok === true);
  const result = purchase('gear', levels, banked);
  check('buying raises the level', result.componentLevels.gear === 2);
  check('buying spends salvage', result.banked.salvage === 80);
  check('buying spends materials', result.banked.materials[material] === 10);
  check('the original records are untouched', banked.salvage === cost.salvage + 80 && levels.gear === 1);
}
{
  const poor = purchaseCheck('gear', { gear: 1 }, { salvage: 10, materials: {} });
  check('an unaffordable upgrade is refused', poor.ok === false);
  check('the refusal says exactly what is missing',
    /more salvage/.test(poor.reason) && /Ilmenite/.test(poor.reason), poor.reason);
  check('buying an unaffordable upgrade returns nothing',
    purchase('gear', { gear: 1 }, { salvage: 10, materials: {} }) === null);
}
{
  const maxed = purchaseCheck('gear', { gear: 4 }, { salvage: 99999, materials: {} });
  check('a maxed track is refused', maxed.ok === false && maxed.maxed === true);
  check('a maxed track says so', /Fully upgraded/.test(maxed.reason));
}

// --- M28: the material re-cut
//
// Two properties, both of which the M27 ladder broke and neither of which any
// test covered. They are stated against `PLANET_ORDER` rather than against a
// list of bodies, so a change to the ladder fails here rather than silently
// making a track unbuyable again.
{
  const position = {};
  PLANET_ORDER.forEach((id, i) => { position[PLANETS[id].rareMaterial] = i + 1; });
  const gateOf = (level) => {
    const ms = Object.keys((level.cost && level.cost.materials) || {});
    return ms.length ? Math.max(...ms.map((m) => position[m] || 99)) : 1;
  };

  // 1. Ordering. Every track's L2 comes from bodies 1-3, L3 from 3-6, L4 from
  //    6-10 - so a track is always climbable in the order its levels run, and
  //    no track waits until the end of the ladder to start.
  const WINDOW = { 2: [1, 3], 3: [3, 6], 4: [6, 10] };
  for (const id of COMPONENT_IDS) {
    const t = COMPONENTS[id];
    const gates = t.levels.map(gateOf).slice(1);
    gates.forEach((g, i) => {
      const [lo, hi] = WINDOW[i + 2];
      check(`${t.name} L${i + 2} gates inside bodies ${lo}-${hi}`, g >= lo && g <= hi, `body ${g}`);
    });
    check(`${t.name} never asks for a later body than the level above it`,
      gates.every((g, i) => i === 0 || gates[i - 1] <= g), gates.join(' -> '));
  }
  check('Hull L2 comes before Mars, so the two-shot answer is not a late-run luxury',
    gateOf(COMPONENTS.hull.levels[1]) < PLANET_ORDER.indexOf('MARS') + 1,
    `body ${gateOf(COMPONENTS.hull.levels[1])}`);

  // 2. Scale. A body yields roughly 50 of its material on a normal run and ~90
  //    on a clean one (M28 measured it; the theoretical sweep-everything
  //    ceiling is ~470, which almost nobody reaches - the encounter audit lands
  //    the full sweep 33 times in 300). A rung that costs more than one visit
  //    can produce is unbuyable in practice, because materials are wiped on
  //    death and each body is visited once per run. Before the re-cut every
  //    single L4 failed this: gear L4 wanted 160 Ilmenite against 90.
  const NORMAL_RUN_YIELD = 50;
  for (const id of COMPONENT_IDS) {
    const t = COMPONENTS[id];
    t.levels.forEach((l, i) => {
      if (!l.cost) return;
      const worst = Math.max(0, ...Object.values(l.cost.materials || {}));
      check(`${t.name} L${i + 1} fits inside one visit's yield`,
        worst <= NORMAL_RUN_YIELD, `${worst} of one material`);
    });
  }
}

// --- M28: the recommended tier is fundable, not aspirational
{
  check('the recommendation runs the length of the ladder',
    RECOMMENDED_TIER.length === PLANET_ORDER.length);
  check('it never asks for less than the body before',
    RECOMMENDED_TIER.every((v, i) => i === 0 || RECOMMENDED_TIER[i - 1] <= v));
  check('the first body expects a stock lander', RECOMMENDED_TIER[0] === 0);
  const rungs = COMPONENT_IDS.reduce((n, id) => n + COMPONENTS[id].levels.length - 1, 0);
  check('and the last never asks for more upgrades than exist',
    RECOMMENDED_TIER[RECOMMENDED_TIER.length - 1] <= rungs,
    `${RECOMMENDED_TIER[RECOMMENDED_TIER.length - 1]} of ${rungs}`);

  const stock = { hull: 1, gear: 1, engine: 1, rcs: 1, sensors: 1 };
  check('a stock lander is ready for body 1 and short for body 5',
    tierCheck(1, stock).ready && !tierCheck(5, stock).ready);
  check('fittedLevels counts levels above stock, not levels',
    fittedLevels(stock) === 0 && fittedLevels({ ...stock, hull: 3 }) === 2);
  check('the shortfall is what the screen prints', tierCheck(5, stock).short === RECOMMENDED_TIER[4]);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
