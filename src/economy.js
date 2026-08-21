// Resources and the rules for keeping them (roadmap section 8).
//
// Three global resources, each with a different relationship to risk:
//   Salvage       half is transmitted on pickup, half rides as cargo
//   Research Data transmitted as it is gathered, so never lost
//   Tech Cores    only yours once the lander is down safely
//
// Plus one rare material per body, which is cargo like the physical half of
// salvage. The point is that a crash costs you something specific, not that it
// wipes the run.

import { clamp } from './util.js';


/**
 * Material nodes: the reward as an object in the world.
 *
 * M14 made the payout scale with distance, and M13 made it scale with grade,
 * and both of those are numbers on a results screen. Tom flew the whole thing
 * and reported, twice, that he never saw any material to pick up - which was
 * exactly right, because there was none to see. A figure computed at touchdown
 * cannot be taken, cannot be lost, and cannot be defended by a machine.
 *
 * So the ore is an object now. `tier` is the distance band it sits in - 1 is
 * the crossing, 2 is the far end of the map - and it pays accordingly. What the
 * landing does is *multiply* the haul, not create it.
 */
export const MATERIAL_NODE = {
  material: [0, 13, 24],         // by distance tier
  salvage: [0, 34, 64],
};

/** What one deposit in a given distance band is worth. */
export function nodeWorth(tier) {
  const t = Math.max(0, Math.min(2, tier | 0));
  return { material: MATERIAL_NODE.material[t], salvage: MATERIAL_NODE.salvage[t] };
}

/**
 * Price a list of deposits. Terrain hands over geometry - where they are and
 * which band they sit in - and this decides what that is worth, which is the
 * direction the dependency should have run all along.
 */
export function haulOf(nodes = []) {
  let material = 0, salvage = 0;
  for (const n of nodes) {
    const w = nodeWorth(n.tier);
    material += w.material;
    salvage += w.salvage;
  }
  return { material, salvage, nodes: nodes.length };
}

/**
 * What a landing does to the haul you flew home. This is deliberately gentler
 * than the salvage quality curve below: the ore is already in the hold, and a
 * hard landing has usually cost hull as well. It scales the reward, it does not
 * decide it.
 */
export const HAUL_GRADE = { PERFECT: 1, GOOD: 0.9, HARD: 0.75 };

/**
 * Anti-frustration numbers (roadmap section 13).
 *
 * `CORE_PITY` is bad-luck protection: Tech Cores normally need a perfect
 * landing on a small pad, which a player who is still learning may not manage
 * for a long time. After this many missions without one, the next clear pays a
 * core regardless.
 *
 * `DEBRIEF` is what a *failed* expedition still transmits. The rule it exists
 * for is "the first failed expedition should still unlock or purchase something
 * meaningful" - the data floor is set to the price of the cheapest skill rank,
 * so a run that ends badly still ends with a decision.
 */
export const CORE_PITY = 8;
export const DEBRIEF = { salvage: 60, data: 40 };

export function freshHaul() {
  return { salvageSafe: 0, salvageCargo: 0, data: 0, cores: 0, materials: {} };
}

/**
 * What a completed mission pays.
 *
 * Until M15 this *computed* the material yield from the grade and the pad tier,
 * which meant flying 2,600 px into a guarded valley showed up as a bigger
 * number on a screen and nothing else. Material is carried home now: `carried`
 * is what the lander actually picked up out of the world, the landing grade
 * multiplies it, and what remains here is a stipend - enough that a flight
 * which collects nothing still pays something, never enough to be the point.
 *
 * Salvage moved the same way, less far: the computed part keeps the shape it
 * had at `SALVAGE_BASE` of its old value and loses its depth bonus, because
 * depth is expressed by where the ore lies now rather than by a multiplier.
 */
export const SALVAGE_BASE = 0.65;

/**
 * The whole salvage economy, scaled in one place.
 *
 * Tom, after the 2026-08-21 full run: *"Receive 70% less salvage, the hangar
 * upgrades seem too cheap (materials seem fine but on the salvage side)"*. His
 * four banked figures were 850 / 1496 / 1353 / 580, averaging **1,070 a body**,
 * against a cheapest rung of 260 - so a single body clear bought three or four
 * upgrades and the permanent track had no weight at all.
 *
 * It is applied at the point every source has been summed - the computed
 * mission pay, the ore carried home, the kill bonus and the objective - rather
 * than to any one of them, because four separate multipliers are four things to
 * forget. `scaleSalvage` is the funnel and `missionReward` does not apply it:
 * the caller assembles the total first.
 */
export const SALVAGE_SCALE = 0.3;

/** Apply the economy-wide salvage scale. */
export function scaleSalvage(n) {
  return Math.round((n || 0) * SALVAGE_SCALE);
}

export function missionReward({
  grade, padMultiplier, fuelLeft, maxFuel, rareMaterial, firstClear, offPad,
  coreDrought = 0, padTier = 0, carried = null,
}) {
  const q = grade === 'PERFECT' ? 1 : grade === 'GOOD' ? 0.7 : 0.45;
  const mult = offPad ? 1 : padMultiplier;
  const fuelFrac = maxFuel > 0 ? Math.max(0, fuelLeft / maxFuel) : 0;
  const depth = offPad ? 0 : clamp(padTier, 0, 2);
  // The haul multiplier is the landing's job now. A hard landing has usually
  // cost hull as well, so this curve is gentler than the quality curve above.
  const haulMult = HAUL_GRADE[grade] != null ? HAUL_GRADE[grade] : HAUL_GRADE.HARD;
  const hauledMaterial = Math.round(((carried && carried.material) || 0) * haulMult);
  const hauledSalvage = Math.round(((carried && carried.salvage) || 0) * haulMult);

  const salvage = Math.round(((60 + 45 * mult) * q + fuelFrac * 40) * SALVAGE_BASE) + hauledSalvage;
  const data = Math.round((firstClear ? 24 : 10) * q + (grade === 'PERFECT' ? 6 : 0));
  // Cores are rare on purpose: a clean landing on a small pad, nothing else -
  // unless the drought has run long enough that "rare" has become "never".
  const earned = grade === 'PERFECT' && mult >= 5 && !offPad;
  const pity = !earned && coreDrought >= CORE_PITY;
  const cores = earned || pity ? 1 : 0;
  // The stipend: the assay of the ground you landed on. It still leans on
  // depth, because a deep landing is a real achievement, but it is a fraction
  // of what a loaded hold is worth.
  const stipend = rareMaterial ? Math.round((4 + 2 * mult) * q * (1 + 0.4 * depth)) : 0;
  const material = rareMaterial ? stipend + hauledMaterial : 0;

  return {
    salvage, data, cores, material, materialId: rareMaterial || null, pityCore: pity, depth,
    // What the results screen needs to show the split honestly.
    stipend, hauledMaterial, hauledSalvage, haulMult,
    leftBehind: carried ? { material: carried.leftMaterial || 0, salvage: carried.leftSalvage || 0, nodes: carried.leftNodes || 0 } : null,
    nodesTaken: (carried && carried.nodes) || 0,
  };
}

/** Add a mission's pay to the run's haul, splitting salvage by risk. */
export function addReward(haul, reward) {
  const h = { ...haul, materials: { ...haul.materials } };
  h.salvageSafe += Math.round(reward.salvage * 0.5);
  h.salvageCargo += reward.salvage - Math.round(reward.salvage * 0.5);
  h.data += reward.data;
  h.cores += reward.cores;
  if (reward.materialId && reward.material) {
    h.materials[reward.materialId] = (h.materials[reward.materialId] || 0) + reward.material;
  }
  return h;
}

/**
 * What survives leaving the expedition. `recovered` is the fraction of physical
 * cargo a skill rescues from a crash - the Technician tree's `cargoRecovery`
 * pays 0.25 a rank, so this is genuinely fractional in play.
 *
 * **Kept is rounded and lost is derived from it**, never rounded separately: at
 * a half-unit boundary two independent `Math.round`s both go up and the two
 * halves report more cargo than the run was carrying.
 */
export function settleHaul(haul, { completed, recovered = 0 }) {
  const keepCargo = completed ? 1 : recovered;
  const materials = {};
  for (const [k, v] of Object.entries(haul.materials)) {
    const kept = Math.round(v * keepCargo);
    if (kept > 0) materials[k] = kept;
  }
  const keptCargo = Math.round(haul.salvageCargo * keepCargo);
  const salvage = haul.salvageSafe + keptCargo;
  const data = haul.data;                              // transmitted, always kept
  // A lost expedition still files its debrief. Without this an early run can
  // end with nothing to spend and nothing to change, which is the one failure
  // state a roguelite cannot afford.
  const debrief = completed ? null : {
    salvage: Math.max(0, DEBRIEF.salvage - salvage),
    data: Math.max(0, DEBRIEF.data - data),
  };
  return {
    salvage: salvage + (debrief ? debrief.salvage : 0),
    data: data + (debrief ? debrief.data : 0),
    cores: completed ? haul.cores : 0,                 // only once the lander is down
    materials,
    debrief: debrief && (debrief.salvage || debrief.data) ? debrief : null,
    lost: {
      salvage: haul.salvageCargo - keptCargo,
      cores: completed ? 0 : haul.cores,
    },
  };
}

/** Fold a settlement into permanent progress. */
export function bankHaul(banked, settled) {
  const b = { ...banked, materials: { ...banked.materials } };
  b.salvage += settled.salvage;
  b.data += settled.data;
  b.cores += settled.cores;
  for (const [k, v] of Object.entries(settled.materials)) {
    b.materials[k] = (b.materials[k] || 0) + v;
  }
  return b;
}
