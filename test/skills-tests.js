// Skills, modules and the folded loadout:  node test/skills-tests.js
import { TREES, ALL_NODES, deriveSkills, skillCheck, buySkill, findNode } from '../src/skills.js';
import { ACTIVE_MODULES, PASSIVE_MODULES, derivePassive, recommendedFor, MOON_BLUEPRINTS } from '../src/modules.js';
import { deriveFull } from '../src/components.js';
import { Ship, SHIP } from '../src/ship.js';

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${e}`); } };

console.log('skills and modules');

// ---------------------------------------------------------------------------
// **FIVE NODES PER TREE, AND THE SHAPE THEY MAKE. Tom's decision, 2026-08-22.**
//
// This is the decision written as a test rather than as a comment, because a
// comment does not stop the next session adding a sixth node from the spec's
// list of thirty. The reasoning is in `src/skills.js` and in `ROADMAP_STATUS.md`
// under "M35"; what is asserted here is the outcome:
//
//   * five nodes in every tree, no more and no fewer
//   * the tiers run **T1, T1, T2, T3, T4** - two cheap entries, one identity per
//     tier, a capstone at the top
//   * the capstone stands behind the tier-3, so each tree is a ladder rather
//     than a shopping list
//
// The shape matters as much as the count and cost more to get right. Before
// M35, Technician had **no tier 3 at all** and Combat had **no tier 4** - two
// structural holes that trimming to five would not have fixed and did not: they
// were closed by building `autonomous-repair` and `combat-overdrive`.
//
// **If you are here because this test is failing**, the question to answer is
// not "how do I make it pass" but "is the five-node board being reopened". If
// it is, this test changes with it. If it is not, the tree does.
{
  const SHAPE = [1, 1, 2, 3, 4];
  for (const tree of Object.values(TREES)) {
    check(`${tree.id}: exactly five nodes`, tree.nodes.length === 5,
      `${tree.nodes.length} - the board is five per tree (M35)`);
    const tiers = tree.nodes.map((n) => n.tier).sort((a, b) => a - b);
    check(`${tree.id}: tiers run 1,1,2,3,4`, tiers.join(',') === SHAPE.join(','),
      `${tiers.join(',')} - two entry nodes, one per tier, then the capstone`);
    const cap = tree.nodes.find((n) => n.tier === 4);
    const t3 = tree.nodes.find((n) => n.tier === 3);
    check(`${tree.id}: has a capstone`, !!cap, 'every tree ends in a tier 4');
    check(`${tree.id}: the capstone stands behind the tier-3`,
      !!cap && !!t3 && (cap.requires || []).includes(t3.id),
      `${cap ? (cap.requires || []).join() : '-'} - it should require ${t3 ? t3.id : '?'}`);
    // Every node except the two entries has to be reachable *through* the tree,
    // or a tier is decoration.
    for (const n of tree.nodes) {
      if (n.tier === 1) continue;
      check(`${tree.id}/${n.id}: sits behind something`, (n.requires || []).length > 0,
        'a node above tier 1 with no prerequisite is not on the ladder');
    }
  }
}

// --- every node is described, priced and reachable
for (const n of ALL_NODES) {
  check(`${n.id}: has ranks`, n.ranks >= 1);
  check(`${n.id}: costs research`, n.cost > 0);
  check(`${n.id}: describes itself at every rank`,
    Array.from({ length: n.ranks }, (_, i) => n.describe(i + 1)).every((d) => typeof d === 'string' && d.length > 4));
  for (const req of n.requires || []) check(`${n.id}: prerequisite exists`, !!findNode(req), req);
}

// --- live trees have testable effects; the gated tree says why
{
  const live = ALL_NODES.filter((n) => !n.requiresFeature);
  check('live nodes all change something',
    live.every((n) => Object.keys(n.effect(1)).length > 0), live.filter((n) => !Object.keys(n.effect(1)).length).map((n) => n.id).join());
  check('the combat tree is gated with a reason', typeof TREES.combat.gated === 'string' && TREES.combat.gated.length > 10);
  const gated = skillCheck('capacitor', {}, 9999, { enemies: false });
  check('a gated node cannot be bought', !gated.ok && gated.gated === true);
  check('a gated node explains itself', /hostile systems/.test(gated.reason));
  check('the same node opens once the feature exists',
    skillCheck('capacitor', {}, 9999, { enemies: true }).ok === true);
}

// --- purchase rules
{
  check('a first rank is affordable with enough data', skillCheck('fuel-mix', {}, 100).ok);
  const poor = skillCheck('fuel-mix', {}, 10);
  check('an unaffordable node says how much is missing', !poor.ok && /more research data/.test(poor.reason));
  const locked = skillCheck('black-box', {}, 9999);
  check('a node behind a prerequisite is locked', !locked.ok && locked.locked === true);
  check('the lock names the prerequisite', /Field Patching/.test(locked.reason));
  check('the prerequisite opens it', skillCheck('black-box', { 'field-patching': 1 }, 9999).ok);

  const bought = buySkill('fuel-mix', {}, 100);
  check('buying takes a rank', bought.purchased['fuel-mix'] === 1);
  check('buying spends data', bought.researchData === 100 - 40);
  check('later ranks cost more', skillCheck('fuel-mix', { 'fuel-mix': 1 }, 999).cost > 40);
  const maxed = skillCheck('fuel-mix', { 'fuel-mix': 3 }, 999);
  check('a maxed node is refused', !maxed.ok && maxed.maxed === true);
  check('buying a maxed node returns nothing', buySkill('fuel-mix', { 'fuel-mix': 3 }, 999) === null);
}

// --- derivation is pure and rank-scaled
{
  const one = deriveSkills({ 'fuel-mix': 1 });
  const three = deriveSkills({ 'fuel-mix': 3 });
  check('rank scales the effect', three.burnMain < one.burnMain, `${three.burnMain} vs ${one.burnMain}`);
  check('deriving is stable', JSON.stringify(deriveSkills({ 'fuel-mix': 2 })) === JSON.stringify(deriveSkills({ 'fuel-mix': 2 })));
  check('nothing purchased is neutral', deriveSkills({}).burnMain === 1 && deriveSkills({}).gearTier === 1);
  check('additive effects add', deriveSkills({ 'field-patching': 2 }).repairOnLanding === 0.2);
}

// --- modules
{
  check('every active module has charges and a cooldown',
    Object.values(ACTIVE_MODULES).every((m) => m.charges > 0 && m.cooldown > 0));
  check('every module explains itself',
    [...Object.values(ACTIVE_MODULES), ...Object.values(PASSIVE_MODULES)].every((m) => m.blurb.length > 10));
  check('a passive derives to its effect', derivePassive('fuel-recycler').burnMain === 0.8);
  check('no passive equipped derives to nothing', Object.keys(derivePassive(null)).length === 0);
  check('recommendations exist for a body', !!recommendedFor('EUROPA').passive);
  check('recommendations are advice, never a gate',
    Object.values(recommendedFor('LUNA')).every((v) => v === null || typeof v === 'string'));
  check('the Moon blueprint guarantee offers real actives',
    MOON_BLUEPRINTS.every((id) => !!ACTIVE_MODULES[id]));
}

// --- the folded spec, and the stacking guarantee
{
  const levels = { engine: 2 };
  const skills = deriveSkills({ 'reserve-tank': 2, 'fuel-mix': 3 });
  const passive = derivePassive('fuel-recycler');
  const full = deriveFull(levels, skills, passive);
  check('component and skill fuel bonuses compound',
    Math.abs(full.fuelCapacity - 1.15 * 1.2) < 1e-9, String(full.fuelCapacity));
  check('skill and passive burn savings compound',
    Math.abs(full.burnMain - 0.85 * 0.8) < 1e-9, String(full.burnMain));
  check('deriving the full spec is stable',
    JSON.stringify(deriveFull(levels, skills, passive)) === JSON.stringify(full));

  const baseThrust = SHIP.thrust;
  const ship = new Ship();
  ship.applyLoadout(full);
  ship.reset(0, 0, 100);
  const first = ship.spec.burnMain;
  ship.applyLoadout(full);
  check('applying the folded spec twice does not compound', ship.spec.burnMain === first);
  check('the shared constants are still untouched', SHIP.thrust === baseThrust);
  check('the passive reaches the ship', ship.spec.burnMain < SHIP.burnMain);
}

// --- a passive removed leaves no trace
{
  const withCleats = deriveFull({}, deriveSkills({}), derivePassive('ice-cleats'));
  const without = deriveFull({}, deriveSkills({}), derivePassive(null));
  check('a passive applies while equipped', withCleats.gripBonus === 3.2);
  check('unequipping removes it cleanly', without.gripBonus === undefined || without.gripBonus === 1);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
