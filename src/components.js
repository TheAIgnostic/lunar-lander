// Permanent ship components (roadmap section 9).
//
// Every level must change a stat or a rule the simulation actually reads -
// no cosmetic percentages. The effects here are applied by deriving a per-run
// spec from the base values, never by mutating the shared constants, so
// reloading a save cannot stack an upgrade twice.

import { ADDITIVE } from './skills.js';

export const COMPONENTS = {
  gear: {
    id: 'gear',
    name: 'LANDING GEAR',
    blurb: 'Struts, dampers and footpads. Widens what the lander can absorb.',
    levels: [
      { effect: {}, describe: 'Standard struts' },
      { cost: { salvage: 320, materials: { 'Ilmenite alloy stock': 40 } },
        effect: { gearTier: 1.12, restitution: 0.20 },
        describe: '+12% landing envelope, softer rebound' },
      { cost: { salvage: 780, materials: { 'Ilmenite alloy stock': 90, 'Conductive ice salts': 40 } },
        effect: { gearTier: 1.25, restitution: 0.17, slopeGrip: 1.2 },
        describe: '+25% envelope, better hold on a slope' },
      { cost: { salvage: 1600, materials: { 'Ilmenite alloy stock': 160, 'Iron-oxide ceramic': 90 } },
        effect: { gearTier: 1.40, restitution: 0.14, slopeGrip: 1.4 },
        describe: '+40% envelope, near-total shock absorption' },
    ],
  },
  engine: {
    id: 'engine',
    name: 'ENGINE & TANKS',
    blurb: 'Capacity and efficiency. More time in the air, per kilo of fuel.',
    levels: [
      { effect: {}, describe: 'Standard tanks' },
      { cost: { salvage: 300, materials: { 'Ilmenite alloy stock': 35 } },
        effect: { fuelCapacity: 1.15 },
        describe: '+15% fuel capacity' },
      { cost: { salvage: 720, materials: { 'Iron-oxide ceramic': 70 } },
        effect: { fuelCapacity: 1.25, burnMain: 0.92 },
        describe: '+25% capacity, 8% less burn per second' },
      { cost: { salvage: 1500, materials: { 'Iron-oxide ceramic': 140, 'Nickel-iron / tungsten stock': 80 } },
        effect: { fuelCapacity: 1.35, burnMain: 0.86, thrust: 1.06 },
        describe: '+35% capacity, 14% less burn, 6% more thrust' },
    ],
  },
  rcs: {
    id: 'rcs',
    name: 'ATTITUDE THRUSTERS',
    blurb: 'The burners you steer with. Authority and appetite.',
    levels: [
      { effect: {}, describe: 'Standard burners' },
      { cost: { salvage: 260, materials: { 'Ilmenite alloy stock': 30 } },
        effect: { rcsAccel: 1.08 },
        describe: '+8% lateral authority' },
      { cost: { salvage: 640, materials: { 'Hydrocarbon composite': 60 } },
        effect: { rcsAccel: 1.15, burnRcs: 0.85 },
        describe: '+15% authority, 15% less fuel' },
      { cost: { salvage: 1400, materials: { 'Hydrocarbon composite': 120, 'Magnetite conductor': 70 } },
        effect: { rcsAccel: 1.22, burnRcs: 0.75, sideThrust: 1.15 },
        describe: '+22% authority, adaptive output' },
    ],
  },
  hull: {
    id: 'hull',
    name: 'HULL',
    blurb: 'What is left between you and the ground. Hard landings cost hull.',
    levels: [
      { effect: {}, describe: '100 integrity' },
      { cost: { salvage: 340, materials: { 'Iron-oxide ceramic': 45 } },
        effect: { hullMax: 1.12 },
        describe: '+12% integrity' },
      { cost: { salvage: 800, materials: { 'Iron-oxide ceramic': 95, 'Sulfur-resistant ceramic': 45 } },
        effect: { hullMax: 1.25, impactResist: 0.85 },
        describe: '+25% integrity, 15% less impact damage' },
      { cost: { salvage: 1700, materials: { 'Sulfur-resistant ceramic': 130, 'Sulfur-basalt ceramic': 80 } },
        effect: { hullMax: 1.40, impactResist: 0.7 },
        describe: '+40% integrity, 30% less impact damage' },
    ],
  },
  sensors: {
    id: 'sensors',
    name: 'SENSORS',
    blurb: 'How far you can see, and how much of it you can believe.',
    levels: [
      { effect: {}, describe: 'Standard suite' },
      { cost: { salvage: 280, materials: { 'Silica nanograins': 35 } },
        effect: { predict: 1.4, beacon: 1.3 },
        describe: 'Longer trajectory prediction, stronger pad beacon' },
      { cost: { salvage: 700, materials: { 'Silica nanograins': 80, 'Magnetite conductor': 45 } },
        effect: { predict: 1.9, beacon: 1.6, hazardLead: 1.4 },
        describe: 'Hazard trajectory prediction' },
      { cost: { salvage: 1500, materials: { 'Magnetite conductor': 120, 'Tholin cryocomposite': 70 } },
        effect: { predict: 2.4, beacon: 2.0, hazardLead: 1.8, noiseResist: 0.35 },
        describe: 'Resists dust, darkness and false returns' },
    ],
  },
};

export const COMPONENT_IDS = Object.keys(COMPONENTS);

/**
 * Effective multipliers for a set of component levels. Pure - no mutation.
 * Skills and the equipped passive are folded in by `deriveFull` below, so the
 * whole ship spec comes from one place and can never be applied twice.
 */
export function deriveLoadout(componentLevels = {}) {
  const out = {
    gearTier: 1, restitution: null, slopeGrip: 1,
    fuelCapacity: 1, burnMain: 1, thrust: 1,
    rcsAccel: 1, burnRcs: 1, sideThrust: 1,
    hullMax: 1, impactResist: 1,
    predict: 1, beacon: 1, hazardLead: 1, noiseResist: 1,
  };
  for (const id of COMPONENT_IDS) {
    const level = Math.max(1, Math.min(4, componentLevels[id] || 1));
    const spec = COMPONENTS[id].levels[level - 1];
    for (const [k, v] of Object.entries(spec.effect || {})) out[k] = v;
  }
  return out;
}

/**
 * Components + skills + equipped passive, folded into one spec.
 *
 * Effects are *multiplied* unless they are named in `ADDITIVE`. That default
 * matters: this used to hold its own list of multiplicative keys and add
 * anything missing from it, so an effect nobody remembered to list combined
 * backwards. The Gyro Stabilizer declares `disturbanceResist: 0.7` and was
 * folded as `1 + 0.7 = 1.7`, which made gusts 70% *stronger* — a module the
 * player buys and equips, doing the opposite of what it says. Multiplying by
 * default means the failure mode of forgetting a key is a correct fold.
 */
export function deriveFull(componentLevels, skillEffects = {}, passiveEffects = {}) {
  const base = deriveLoadout(componentLevels);
  const out = { ...base };
  for (const src of [skillEffects, passiveEffects]) {
    for (const [k, v] of Object.entries(src)) {
      if (typeof v !== 'number') { out[k] = v; continue; }
      if (ADDITIVE.has(k)) out[k] = (out[k] != null ? out[k] : 0) + v;
      else out[k] = (out[k] != null ? out[k] : 1) * v;
    }
  }
  return out;
}

/** Can this be bought, and if not, exactly what is missing? */
export function purchaseCheck(componentId, componentLevels, banked) {
  const comp = COMPONENTS[componentId];
  const level = Math.max(1, componentLevels[componentId] || 1);
  if (level >= 4) return { ok: false, reason: 'Fully upgraded.', maxed: true };
  const next = comp.levels[level];
  const missing = [];
  if ((banked.salvage || 0) < next.cost.salvage) {
    missing.push(`${next.cost.salvage - (banked.salvage || 0)} more salvage`);
  }
  for (const [mat, need] of Object.entries(next.cost.materials || {})) {
    const have = (banked.materials || {})[mat] || 0;
    if (have < need) missing.push(`${need - have} more ${mat}`);
  }
  if (missing.length) return { ok: false, reason: `Needs ${missing.join(', ')}.`, cost: next.cost, next };
  return { ok: true, cost: next.cost, next, level: level + 1 };
}

/** Spend and level up. Returns a new banked record and levels - never mutates. */
/**
 * Every material any component level asks for, derived from the cost tables
 * rather than listed. A hand-kept list would drift the moment a cost is
 * re-authored, and M28 is a re-authoring pass over exactly these tables.
 */
export function everyMaterial() {
  const names = new Set();
  for (const id of COMPONENT_IDS) {
    for (const lvl of COMPONENTS[id].levels) {
      for (const m of Object.keys((lvl.cost && lvl.cost.materials) || {})) names.add(m);
    }
  }
  return [...names];
}

export function purchase(componentId, componentLevels, banked) {
  const check = purchaseCheck(componentId, componentLevels, banked);
  if (!check.ok) return null;
  const nextBanked = { ...banked, materials: { ...banked.materials } };
  nextBanked.salvage -= check.cost.salvage;
  for (const [mat, need] of Object.entries(check.cost.materials || {})) {
    nextBanked.materials[mat] = (nextBanked.materials[mat] || 0) - need;
  }
  const levels = { ...componentLevels, [componentId]: check.level };
  return { banked: nextBanked, componentLevels: levels };
}
