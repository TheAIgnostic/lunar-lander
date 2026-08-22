// Permanent skill trees, bought with Research Data (roadmap section 10).
//
// All three trees are live. The Combat tree stayed gated until its nodes had
// something to act on; M12 gave it enemies, a weapon and a shield, so every
// node here now changes a value the simulation reads. The gate itself remains,
// because a body with no hostile systems should not be selling threat analysis.

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
      { id: 'salvage-drone', name: 'Salvage Drone', tier: 2, ranks: 2, cost: 90, requires: ['fuel-mix'],
        describe: (r) => `Missions pay ${10 * r}% more salvage`,
        effect: (r) => ({ salvageBonus: 1 + 0.10 * r }) },
      // The capstone, and the only thing in the game that gives a shuttle back
      // after it is gone. Once per expedition, so it buys one mistake and not a
      // habit - and the hold is lost with the lander, per the spec, so it never
      // turns a bad run into a profitable one.
      { id: 'phoenix-protocol', name: 'Phoenix Protocol', tier: 4, ranks: 1, cost: 280, requires: ['black-box'],
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
      { id: 'env-seals', name: 'Environmental Seals', tier: 2, ranks: 2, cost: 85, requires: ['reserve-tank'],
        describe: (r) => `Heat, cold and radiation build ${15 * r}% more slowly`,
        effect: (r) => ({ hazardResist: 1 - 0.15 * r }) },
      { id: 'inertial-dampers', name: 'Inertial Dampers', tier: 2, ranks: 2, cost: 95, requires: ['reinforced-struts'],
        describe: (r) => `Gusts and plumes rotate you ${15 * r}% less`,
        effect: (r) => ({ disturbanceResist: 1 - 0.15 * r }) },
      // **A pad-only node, and it says so.** "Smaller minimum side-thruster
      // pulses" means nothing to a key, which answers exactly 1.0 - and
      // `1 ** anything === 1`, so this is *arithmetically* inert on a keyboard
      // rather than merely unhelpful. It shapes the fractional half of the
      // range a stick lives in. Dead before M30 widened the input contract.
      { id: 'rcs-finesse', name: 'RCS Finesse', tier: 1, ranks: 2, cost: 45,
        describe: (r) => `Analog attitude control is finer near centre (rank ${r}). Stick only`,
        effect: (r) => ({ rcsFinesse: 1 + 0.35 * r }) },
      { id: 'surface-adaptation', name: 'Surface Adaptation', tier: 2, ranks: 2, cost: 85, requires: ['reinforced-struts'],
        describe: (r) => `${20 * r}% more hold on ice and on slopes`,
        effect: (r) => ({ gripBonus: 1 + 0.20 * r, slopeGrip: 1 + 0.20 * r }) },
      { id: 'emergency-arrest', name: 'Emergency Arrest', tier: 3, ranks: 1, cost: 120, requires: ['surface-adaptation'],
        describe: () => 'One panic burn a mission: a hard braking pulse, low, upright, and expensive',
        effect: () => ({ arrest: 1 }) },
      { id: 'nav-forecast', name: 'Navigation Forecast', tier: 3, ranks: 1, cost: 100, requires: ['reserve-tank'],
        describe: () => 'Expedition cards name the hazard they were holding back',
        effect: () => ({ hazardReveal: 1 }) },
      { id: 'steady-hands', name: 'Steady Hands', tier: 3, ranks: 1, cost: 95, requires: ['env-seals'],
        describe: () => 'Fly still for two seconds and the instruments stop lying to you',
        effect: () => ({ steadyHands: 1 }) },
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
      { id: 'energy-on-kill', name: 'Energy on Kill', tier: 2, ranks: 1, cost: 100, requiresFeature: 'enemies', requires: ['threat-analysis'],
        describe: () => 'Destroying a threat returns a module charge',
        effect: () => ({ energyOnKill: 1 }) },
      // The spec's other half of this - "reduces return-fire energy cost" -
      // wants module *energy*, which this build does not have and which is one
      // of the six nodes waiting on a decision. What is built is the half that
      // exists: a shot that misses tells you who took it.
      { id: 'counter-battery', name: 'Counter-Battery Logic', tier: 2, ranks: 1, cost: 85, requiresFeature: 'enemies', requires: ['threat-analysis'],
        describe: () => 'A near miss paints the machine that fired it',
        effect: () => ({ counterBattery: 1 }) },
      { id: 'twin-link', name: 'Twin-Link Control', tier: 3, ranks: 1, cost: 110, requiresFeature: 'enemies', requires: ['capacitor'],
        describe: () => 'The beam arcs to a second machine for a third of the damage',
        effect: () => ({ twinLink: 0.35 }) },
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
  'arrest', 'hazardReveal', 'steadyHands', 'extraShuttle', 'phoenix',
  'counterBattery', 'twinLink',
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
    repairOnLanding: 0, cargoRecovery: 0, salvageBonus: 1,
    hazardResist: 1, disturbanceResist: 1,
    weaponPower: 1, shieldCapacity: 1,
    threatWarning: 0, shieldHazard: 0, energyOnKill: 0,
    rcsFinesse: 1, gripBonus: 1, slopeGrip: 1,
    arrest: 0, hazardReveal: 0, steadyHands: 0, extraShuttle: 0, phoenix: 0,
    counterBattery: 0, twinLink: 0,
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
