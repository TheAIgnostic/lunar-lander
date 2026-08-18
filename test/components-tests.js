// Component effects, purchase rules and stacking:  node test/components-tests.js
import { COMPONENTS, COMPONENT_IDS, deriveLoadout, purchaseCheck, purchase } from '../src/components.js';
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
  const banked = { salvage: 400, materials: { 'Ilmenite alloy stock': 50 } };
  const levels = { gear: 1 };
  const ok = purchaseCheck('gear', levels, banked);
  check('an affordable upgrade is allowed', ok.ok === true);
  const result = purchase('gear', levels, banked);
  check('buying raises the level', result.componentLevels.gear === 2);
  check('buying spends salvage', result.banked.salvage === 400 - 320);
  check('buying spends materials', result.banked.materials['Ilmenite alloy stock'] === 10);
  check('the original records are untouched', banked.salvage === 400 && levels.gear === 1);
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

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
