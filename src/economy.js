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

export const RESOURCES = ['salvage', 'data', 'cores'];

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
 * What a completed mission pays. Landing quality drives it, the pad multiplier
 * scales it, and leftover fuel is worth something because it represents a
 * flight flown well rather than merely survived.
 */
export function missionReward({
  grade, padMultiplier, fuelLeft, maxFuel, rareMaterial, firstClear, offPad,
  coreDrought = 0, padTier = 0,
}) {
  const q = grade === 'PERFECT' ? 1 : grade === 'GOOD' ? 0.7 : 0.45;
  const mult = offPad ? 1 : padMultiplier;
  const fuelFrac = maxFuel > 0 ? Math.max(0, fuelLeft / maxFuel) : 0;
  // How far out the landing zone was, as a payout. The near pad always gets you
  // home; the far one is where the good material is, and it is only reachable
  // by committing to the fuel road on the way out.
  const depth = offPad ? 0 : clamp(padTier, 0, 2);

  const salvage = Math.round(((60 + 45 * mult) * q + fuelFrac * 40) * (1 + 0.25 * depth));
  const data = Math.round((firstClear ? 24 : 10) * q + (grade === 'PERFECT' ? 6 : 0));
  // Cores are rare on purpose: a clean landing on a small pad, nothing else -
  // unless the drought has run long enough that "rare" has become "never".
  const earned = grade === 'PERFECT' && mult >= 5 && !offPad;
  const pity = !earned && coreDrought >= CORE_PITY;
  const cores = earned || pity ? 1 : 0;
  // Material yield is the sharp end of the gradient: the deep zone pays roughly
  // triple what the safe one does.
  const material = rareMaterial ? Math.round((8 + 6 * mult) * q * (1 + depth)) : 0;

  return { salvage, data, cores, material, materialId: rareMaterial || null, pityCore: pity, depth };
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
 * cargo a skill or module rescues from a crash - zero until the Technician tree
 * exists.
 */
export function settleHaul(haul, { completed, recovered = 0 }) {
  const keepCargo = completed ? 1 : recovered;
  const materials = {};
  for (const [k, v] of Object.entries(haul.materials)) {
    const kept = Math.round(v * keepCargo);
    if (kept > 0) materials[k] = kept;
  }
  const salvage = haul.salvageSafe + Math.round(haul.salvageCargo * keepCargo);
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
      salvage: Math.round(haul.salvageCargo * (1 - keepCargo)),
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
