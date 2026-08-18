// Permanent skill trees, bought with Research Data (roadmap section 10).
//
// Two trees are live. The Combat tree is defined but gated: its nodes act on
// enemies, which do not exist until M12, and a node with no testable effect is
// worse than a node that says why it is not available yet.

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
    ],
  },
  combat: {
    id: 'combat', name: 'COMBAT SYSTEMS',
    blurb: 'Weapons, shields and reading a threat early.',
    gated: 'Nothing out here is shooting at you yet. This tree opens with hostile systems.',
    nodes: [
      { id: 'capacitor', name: 'Capacitor Bank', tier: 1, ranks: 3, cost: 45, requiresFeature: 'enemies',
        describe: (r) => `Weapon damage and shield capacity +${8 * r}%`, effect: () => ({}) },
      { id: 'threat-analysis', name: 'Threat Analysis', tier: 1, ranks: 1, cost: 60, requiresFeature: 'enemies',
        describe: () => 'Enemy firing arcs are marked earlier', effect: () => ({}) },
      { id: 'shield-harmonics', name: 'Shield Harmonics', tier: 2, ranks: 1, cost: 90, requiresFeature: 'enemies',
        describe: () => 'Ray Shield absorbs one extra hazard type', effect: () => ({}) },
      { id: 'energy-on-kill', name: 'Energy on Kill', tier: 2, ranks: 1, cost: 100, requiresFeature: 'enemies',
        describe: () => 'Destroying a threat returns module energy', effect: () => ({}) },
    ],
  },
};

export const TREE_IDS = Object.keys(TREES);
export const ALL_NODES = TREE_IDS.flatMap((t) => TREES[t].nodes.map((n) => ({ ...n, tree: t })));

export function findNode(id) {
  return ALL_NODES.find((n) => n.id === id) || null;
}

/** Effects of every purchased rank, folded together. Pure. */
export function deriveSkills(purchased = {}) {
  const out = {
    burnMain: 1, burnRcs: 1, fuelCapacity: 1, gearTier: 1,
    repairOnLanding: 0, cargoRecovery: 0, salvageBonus: 1,
    hazardResist: 1, disturbanceResist: 1,
  };
  for (const node of ALL_NODES) {
    const rank = Math.min(node.ranks, purchased[node.id] || 0);
    if (rank <= 0) continue;
    for (const [k, v] of Object.entries(node.effect(rank))) {
      // Multiplicative stats compound; additive ones add.
      if (k === 'repairOnLanding' || k === 'cargoRecovery') out[k] += v;
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
