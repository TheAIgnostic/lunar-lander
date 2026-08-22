// Permanent skill trees, bought with Research Data (roadmap section 10).
//
// All three trees are live. The Combat tree stayed gated until its nodes had
// something to act on; M12 gave it enemies, a weapon and a shield, so every
// node here now changes a value the simulation reads. The gate itself remains,
// because a body with no hostile systems should not be selling threat analysis.
//
// ===========================================================================
// **FIVE NODES PER TREE. Tom's decision, 2026-08-22, and it replaces the
// spec's thirty.** Do not add a sixth to any tree without reopening it.
// ===========================================================================
//
// Section 10 of the brief asks for ten nodes in each of three trees. M34 built
// Flight & Survival out to that ten and Tom looked at the result on the screen:
// the Flight column ran off the bottom while Technician stopped a third of the
// way down, and the verdict was *"we have way too many skills, there should
// only be 5 in each path"*. M35 cut eight and built two.
//
// **The shape is the rule, and every tree has it: T1, T1, T2, T3, T4.** Two
// cheap entry nodes, then one identity per tier, then a capstone standing
// behind the tier-3. That is a ladder rather than a shopping list, and it is
// what makes five nodes a design instead of a trim - before M35, Technician had
// **no tier 3 at all** (it jumped from small percentages straight to a 280-cost
// capstone) and Combat had **no tier 4 at all**. Neither hole was about the
// count, and cutting to five did not fix either one; building
// `autonomous-repair` and `combat-overdrive` did.
//
// The arithmetic that says five is enough: every rank of all fifteen costs
// **2,525** research and a typical run banks about **298** before losing it, so
// a player buys three to five nodes a run whether the board holds fifteen or
// thirty. Past the point where every tier is covered, more nodes is variety
// with a sharply falling return - and each one is another thing that has to be
// proved delivered. The spec's thirty is a count; the ladder above is structure.
//
// **What was cut, and why it is not coming back** (the full reasoning is in
// `ROADMAP_STATUS.md` under "M35"): Salvage Drone, RCS Finesse, Environmental
// Seals, Inertial Dampers, Navigation Forecast, Steady Hands, Energy on Kill
// and Counter-Battery Logic. Each was the **only** thing selling its effect
// key, so the mechanic underneath went with it rather than being left orphaned
// for the loadout gate to find - except Inertial Dampers, whose
// `disturbanceResist` is still sold by the Gyro Stabilizer, the Control
// Surfaces and a hangar rung, and so cost nothing at all to remove.
//
// Nine further nodes in the brief were **never built**, and five of those name
// systems this build does not have (module energy, engine-stall status,
// crafting costs, a loadout change that is already free). They are recorded
// under "Superseded by the five-node board" in `ROADMAP_STATUS.md`. Do not
// build one because the spec lists it.

export const TREES = {
  technician: {
    id: 'technician', name: 'TECHNICIAN',
    blurb: 'Efficiency, repair and what you keep when it goes wrong.',
    nodes: [
      { id: 'fuel-mix', name: 'Fuel-Mix Calibration', tier: 1, ranks: 3, cost: 40,
        describe: (r) => `Thrusters use ${5 * r}% less fuel`,
        effect: (r) => ({ burnMain: 1 - 0.05 * r, burnRcs: 1 - 0.05 * r }) },
      { id: 'field-patching', name: 'Field Patching', tier: 1, ranks: 2, cost: 55,
        describe: (r) => `Recover ${10 * r}% hull after each landing`,
        effect: (r) => ({ repairOnLanding: 0.10 * r }) },
      { id: 'black-box', name: 'Black-Box Recovery', tier: 2, ranks: 2, cost: 80, requires: ['field-patching'],
        describe: (r) => `Recover ${25 * r}% of cargo lost in a crash`,
        effect: (r) => ({ cargoRecovery: 0.25 * r }) },
      // **Technician's tier 3, and it had none until M35.** The tree ran T1, T1,
      // T2, T2, T4 - so a player specialising into it had nothing at all
      // between "+5% fuel" and a 280-cost capstone that one run cannot fund.
      // That was the hole, and it was not the node count.
      //
      // **Half of what the spec asks for.** The other half - *"unlocks the
      // Repair Nanites active module"* - names the crafting/unlock economy the
      // brief assumed and this build does not have: modules are not bought or
      // built, they are blueprints handed over for clearing a body, and
      // `nextBlueprint` guarantees every one inside two runs. A skill handing
      // one over early would be a second grant path competing with the only
      // progression that survives a death, which is a decision about the
      // blueprint drip rather than a skill node.
      { id: 'autonomous-repair', name: 'Autonomous Repair', tier: 3, ranks: 1, cost: 100, requires: ['black-box'],
        describe: () => 'Repair Nanites rebuild hull 20% faster',
        effect: () => ({ repairRate: 1.2 }) },
      // The capstone, and the only thing in the game that gives a shuttle back
      // after it is gone. Once per expedition, so it buys one mistake and not a
      // habit - and the hold is lost with the lander, per the spec, so it never
      // turns a bad run into a profitable one.
      //
      // It stands behind the tier-3 rather than the tier-2 since M35, which is
      // the ladder every tree has now.
      { id: 'phoenix-protocol', name: 'Phoenix Protocol', tier: 4, ranks: 1, cost: 280, requires: ['autonomous-repair'],
        describe: () => 'Once an expedition, a lost shuttle comes back at 35% hull — without its cargo',
        // The number *is* the hull it comes back on, so the blurb and the
        // behaviour cannot drift apart - the same reason `sensor-pulse` reveals
        // to `revealVisibility` rather than to a 1 written in `abilities.js`.
        effect: () => ({ phoenix: 0.35 }) },
    ],
  },
  flight: {
    id: 'flight', name: 'FLIGHT & SURVIVAL',
    blurb: 'Control, tolerance and staying alive long enough to land.',
    nodes: [
      { id: 'reserve-tank', name: 'Reserve Tank', tier: 1, ranks: 2, cost: 45,
        describe: (r) => `Start each mission with ${10 * r}% more fuel`,
        effect: (r) => ({ fuelCapacity: 1 + 0.10 * r }) },
      { id: 'reinforced-struts', name: 'Reinforced Struts', tier: 1, ranks: 3, cost: 50,
        describe: (r) => `Landing envelope ${8 * r}% wider`,
        effect: (r) => ({ gearTier: 1 + 0.08 * r }) },
      // **Cut in M35, and this is the record of the three that were here.**
      // Environmental Seals (`hazardResist`), Inertial Dampers
      // (`disturbanceResist`) and RCS Finesse (`rcsFinesse`) went when the tree
      // came down to five. Inertial Dampers cost nothing to remove - the Gyro
      // Stabilizer, the Control Surfaces and a hangar rung all still sell
      // `disturbanceResist` - while the other two took their mechanic with
      // them. Two more went at tier 3: Navigation Forecast (`hazardReveal`,
      // which printed the hazard an expedition card was holding back) and
      // Steady Hands (`steadyHands`, which settled the instruments after two
      // still seconds). All five were real and all five worked; the tree simply
      // does not have room for them at five nodes, and what it kept is one
      // identity per tier.
      { id: 'surface-adaptation', name: 'Surface Adaptation', tier: 2, ranks: 2, cost: 85, requires: ['reinforced-struts'],
        describe: (r) => `${20 * r}% more hold on ice and on slopes`,
        effect: (r) => ({ gripBonus: 1 + 0.20 * r, slopeGrip: 1 + 0.20 * r }) },
      { id: 'emergency-arrest', name: 'Emergency Arrest', tier: 3, ranks: 1, cost: 120, requires: ['surface-adaptation'],
        describe: () => 'One panic burn a mission: a hard braking pulse, low, upright, and expensive',
        effect: () => ({ arrest: 1 }) },
      // **The one node that touches the attrition curve** the whole run model
      // rests on (M27, decision 4), so it is gated on having cleared five
      // bodies rather than on research alone - by which point a player has met
      // the curve and is choosing to change it.
      { id: 'fourth-shuttle', name: 'Fourth Shuttle', tier: 4, ranks: 1, cost: 260,
        requires: ['emergency-arrest'], requiresCleared: 5,
        describe: () => 'Expeditions carry a fourth shuttle',
        effect: () => ({ extraShuttle: 1 }) },
    ],
  },
  combat: {
    id: 'combat', name: 'COMBAT SYSTEMS',
    blurb: 'Weapons, shields and reading a threat early.',
    gated: 'Nothing out here is shooting at you yet. This tree opens with hostile systems.',
    nodes: [
      { id: 'capacitor', name: 'Capacitor Bank', tier: 1, ranks: 3, cost: 45, requiresFeature: 'enemies',
        describe: (r) => `Weapon damage and shield capacity +${8 * r}%`,
        effect: (r) => ({ weaponPower: 1 + 0.08 * r, shieldCapacity: 1 + 0.08 * r }) },
      { id: 'threat-analysis', name: 'Threat Analysis', tier: 1, ranks: 1, cost: 60, requiresFeature: 'enemies',
        describe: () => 'Enemy firing arcs are marked while they are still tracking',
        effect: () => ({ threatWarning: 1 }) },
      { id: 'shield-harmonics', name: 'Shield Harmonics', tier: 2, ranks: 1, cost: 90, requiresFeature: 'enemies', requires: ['capacitor'],
        describe: () => 'Ray Shield also holds off heat, cold and radiation',
        effect: () => ({ shieldHazard: 1 }) },
      // **Cut in M35**: Energy on Kill (`energyOnKill`, which returned a charge
      // for a kill) and Counter-Battery Logic (`counterBattery`, which painted
      // the machine that missed you). Both worked; the tree came down to five
      // and kept one identity per tier. Counter-Battery was already only half
      // its spec line - the other half wanted module energy - and the charge
      // Energy on Kill gave back is now the capstone's business.
      { id: 'twin-link', name: 'Twin-Link Control', tier: 3, ranks: 1, cost: 110, requiresFeature: 'enemies', requires: ['shield-harmonics'],
        describe: () => 'The beam arcs to a second machine for a third of the damage',
        effect: () => ({ twinLink: 0.35 }) },
      // **The Combat capstone, and this tree had none until M35** - the only
      // one of the three with nothing at tier 4, while Flight had the Fourth
      // Shuttle and Technician the Phoenix Protocol.
      //
      // **Re-pointed from energy onto cooldown, and that is Tom's call, not a
      // liberty.** The spec asks for *"five seconds of faster weapon recharge
      // and stronger shielding, followed by an engine-heat penalty"*, and
      // "recharge" means an energy pool this build does not have: an active has
      // charges and a **cooldown**. Building the pool underneath one node was
      // offered and declined - it is a milestone of its own, and it is what the
      // unbuilt Power Core component track wants too. On the cooldown the same
      // sentence is buildable to the letter, and all three clauses are:
      //
      //   recharge   the equipped module's cooldown drains `OVERDRIVE.recharge`
      //              times faster, so a spent module comes back inside the window
      //   shielding  a Ray Shield raised during it starts with a bigger pool,
      //              and one already up is topped up to match
      //   the cost   `ship.overheat` seconds of a real thrust derate afterwards
      //
      // **The penalty is a derate rather than a heat gauge, and that is
      // measured rather than stylistic.** `ship.thermalDerate` is reset to 1 by
      // `applyForces` every step and written only by the `thermal` force, so
      // raising `statusLevels.heat` costs nothing at all on the eight bodies
      // that do not declare heat - and M31 measured that on the two that do it
      // peaks at 10-31% against a bite of 55-60, so it would cost nothing there
      // either. A penalty that is free on ten bodies out of ten is the
      // `hazardLead` fault upside down. The overdrive supplies its own heat.
      //
      // A rebindable action like Emergency Arrest (`g`, `pad:5`), once per
      // mission, for the same reason: `ACTIONS` is derived from `DEFAULT_KEYS`,
      // so the settings screen, the rebind rules, the save format and the pad
      // all learn about it without being told.
      { id: 'combat-overdrive', name: 'Combat Overdrive', tier: 4, ranks: 1, cost: 260, requiresFeature: 'enemies', requires: ['twin-link'],
        describe: () => 'Once a mission: five seconds of instant recharge and a stronger shield, then the engine derates',
        effect: () => ({ overdrive: 1 }) },
    ],
  },
};

export const TREE_IDS = Object.keys(TREES);
export const ALL_NODES = TREE_IDS.flatMap((t) => TREES[t].nodes.map((n) => ({ ...n, tree: t })));

/**
 * What the trees are allowed to know about a career, in one place.
 *
 * Built twice - once by the screen that draws the nodes and once by the action
 * that buys one - and the two were already a copy of each other before M34 gave
 * them a second field to disagree about. `cleared` counts **distinct bodies
 * ever finished**, not this run's: skills are wiped on death and the *right* to
 * buy one should not be, or the Fourth Shuttle would be unreachable by anybody
 * who ever lost a run.
 */
export function skillFeatures(meta) {
  const stats = (meta && meta.stats) || {};
  return {
    enemies: (stats.threatsSeen || 0) > 0,
    cleared: Object.keys(stats.bodies || {}).length,
  };
}

export function findNode(id) {
  return ALL_NODES.find((n) => n.id === id) || null;
}

/**
 * Stats that accumulate rather than compound. Everything else multiplies.
 *
 * Exported because `deriveFull` folds skills and the equipped passive into the
 * same spec and has to agree with this list. It used to carry its own list of
 * *multiplicative* keys instead, which meant a key missing from that list was
 * silently added - and the Gyro Stabilizer, whose effect is a 0.7 multiplier,
 * turned into `1 + 0.7 = 1.7` and made gusts 70% stronger. Naming the additive
 * ones and multiplying everything else puts the safe behaviour on the default.
 */
export const ADDITIVE = new Set([
  'repairOnLanding', 'cargoRecovery', 'threatWarning', 'shieldHazard', 'energyOnKill',
  // M34's flags and fractions. Each is "how much of a thing you did not have",
  // so zero is the absence and two sources should add reach rather than
  // multiply two fractions into less than either.
  'arrest', 'extraShuttle', 'phoenix', 'twinLink',
  // M35's capstone. "How many overdrives you did not have", so zero is the
  // absence and a second source would add one rather than multiply.
  'overdrive',
  // How much attitude authority a control surface gives you over lift. Zero is
  // "no foil fitted", so it accumulates rather than multiplying - a second
  // source of it should add reach, and multiplying two fractions would take it
  // away. Naming it here is the whole of that decision (see `deriveFull`).
  'glideTrim',
]);

/** Effects of every purchased rank, folded together. Pure. */
export function deriveSkills(purchased = {}) {
  const out = {
    burnMain: 1, burnRcs: 1, fuelCapacity: 1, gearTier: 1,
    repairOnLanding: 0, cargoRecovery: 0,
    disturbanceResist: 1,
    weaponPower: 1, shieldCapacity: 1,
    threatWarning: 0, shieldHazard: 0,
    gripBonus: 1, slopeGrip: 1,
    arrest: 0, extraShuttle: 0, phoenix: 0, twinLink: 0,
    repairRate: 1, overdrive: 0,
  };
  for (const node of ALL_NODES) {
    const rank = Math.min(node.ranks, purchased[node.id] || 0);
    if (rank <= 0) continue;
    for (const [k, v] of Object.entries(node.effect(rank))) {
      if (ADDITIVE.has(k)) out[k] += v;
      else out[k] *= v;
    }
  }
  return out;
}

/** Can this rank be bought, and if not, why not? */
export function skillCheck(nodeId, purchased = {}, researchData = 0, features = {}) {
  const node = findNode(nodeId);
  if (!node) return { ok: false, reason: 'No such node.' };
  const rank = purchased[nodeId] || 0;
  if (rank >= node.ranks) return { ok: false, reason: 'Fully researched.', maxed: true };
  if (node.requiresFeature && !features[node.requiresFeature]) {
    return { ok: false, reason: TREES[nodeIdTree(nodeId)].gated || 'Not available yet.', gated: true };
  }
  if (node.requiresCleared && (features.cleared || 0) < node.requiresCleared) {
    const short = node.requiresCleared - (features.cleared || 0);
    return { ok: false, reason: `Clear ${short} more ${short === 1 ? 'body' : 'bodies'} first.`, locked: true };
  }
  for (const req of node.requires || []) {
    if (!(purchased[req] > 0)) {
      return { ok: false, reason: `Needs ${findNode(req).name} first.`, locked: true };
    }
  }
  const cost = node.cost * (rank + 1);
  if (researchData < cost) {
    return { ok: false, reason: `Needs ${cost - researchData} more research data.`, cost };
  }
  return { ok: true, cost, rank: rank + 1 };
}

function nodeIdTree(nodeId) {
  return (ALL_NODES.find((n) => n.id === nodeId) || {}).tree;
}

/** Spend research and take the rank. Never mutates. */
export function buySkill(nodeId, purchased = {}, researchData = 0, features = {}) {
  const check = skillCheck(nodeId, purchased, researchData, features);
  if (!check.ok) return null;
  return {
    purchased: { ...purchased, [nodeId]: check.rank },
    researchData: researchData - check.cost,
  };
}
