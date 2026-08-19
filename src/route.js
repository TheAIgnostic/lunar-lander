// Route selection (roadmap section 2). After a chapter the player picks the
// next body from four offers, drawn from discovery tiers so difficulty and the
// counters a body demands arrive in a fair order.

import { PLANETS, gravityFor } from './planets.js';
import { makeRng } from './util.js';

/** The route screen always shows this many cards when the pool can fill them. */
export const MIN_OFFERS = 4;

export const TIERS = {
  opening: ['LUNA'],
  A: ['MARS', 'TITAN', 'EUROPA', 'ENCELADUS'],
  B: ['MERCURY', 'VENUS', 'IO'],
  C: ['PLUTO', 'GANYMEDE'],
};

/**
 * Which bodies may be offered, given what has been cleared.
 * Tier B opens after two non-Moon chapters, tier C after five chapters.
 */
export function eligibleBodies(clearedChapters = []) {
  const cleared = new Set(clearedChapters.map((id) => String(id).split('-')[0].toUpperCase()));
  const nonMoon = [...cleared].filter((c) => c !== 'LUNA' && c !== 'MOON').length;
  const total = cleared.size;

  const pool = [...TIERS.A];
  if (nonMoon >= 2) pool.push(...TIERS.B);
  if (total >= 5) pool.push(...TIERS.C);

  const unfinished = pool.filter((id) => !cleared.has(id));
  if (unfinished.length >= MIN_OFFERS) return unfinished;
  // "Never remove all four useful planet choices through randomization": when
  // the unexplored pool runs thin - clearing Mars early leaves only three tier-A
  // bodies - already-visited bodies come back to fill the card slots. A repeat
  // leg is a real choice in a roguelite; three cards instead of four is not.
  return [...unfinished, ...pool.filter((id) => cleared.has(id))];
}

const DIFFICULTY = {
  LUNA: 1, EUROPA: 2, TITAN: 2, ENCELADUS: 3, MARS: 2,
  GANYMEDE: 3, IO: 4, MERCURY: 4, PLUTO: 4, VENUS: 5,
};

const RECOMMENDED = {
  LUNA: ['Fuel Recycler', 'Sensor Pulse'],
  MARS: ['Hardened Radar', 'Sensor Pulse'],
  MERCURY: ['Thermal Sink', 'Thermal Purge'],
  VENUS: ['Ablative Acid Skin', 'Aero-Brake Foil'],
  TITAN: ['Atmospheric Control Surfaces', 'Aero-Brake Foil'],
  EUROPA: ['Ice Cleats', 'Magnetic Anchor'],
  ENCELADUS: ['Plume Vanes', 'Gyro Stabilizer'],
  IO: ['Thermal Sink', 'Kinetic Bomb Rack'],
  PLUTO: ['Cryo Insulation', 'Countermeasure Flare'],
  GANYMEDE: ['Hardened Radar', 'Ray Shield'],
};

/**
 * A route card. The forecast is helpful but deliberately incomplete - one
 * hazard is withheld, which the Navigation Forecast skill will later reveal.
 */
export function planetCard(planetId, sector, rng) {
  const p = PLANETS[planetId];
  const hazards = [...p.hazards];
  const hidden = hazards.length > 1 && rng() < 0.5 ? hazards.pop() : null;
  return {
    planet: planetId,
    name: p.displayName,
    gravity: gravityFor(planetId),
    realGravity: p.realGravity,
    atmosphere: p.atmosphere,
    hazards,
    hiddenHazard: hidden,
    enemyIntensity: ['none', 'light', 'moderate', 'heavy'][Math.min(3, Math.floor((DIFFICULTY[planetId] + sector) / 2))],
    rareMaterial: p.rareMaterial,
    recommended: RECOMMENDED[planetId] || [],
    difficulty: Math.min(5, DIFFICULTY[planetId] + Math.floor((sector - 1) / 2)),
    summary: p.summary,
    incomplete: !!hidden,
  };
}

/**
 * Four offers, deterministic from the run seed and how far in the player is.
 * Never fewer than the eligible pool allows, and never a duplicate.
 */
export function routeOffers(clearedChapters, seed, sector = 1, count = 4) {
  const rng = makeRng((seed ^ (sector * 2654435761)) >>> 0);
  const pool = eligibleBodies(clearedChapters);
  const picks = [];
  const bag = [...pool];
  while (picks.length < Math.min(count, pool.length) && bag.length) {
    const i = rng.int(0, bag.length - 1);
    picks.push(bag.splice(i, 1)[0]);
  }
  // Keep the spread readable: easiest first.
  picks.sort((a, b) => DIFFICULTY[a] - DIFFICULTY[b]);
  return picks.map((id) => planetCard(id, sector, rng));
}

/** A sector checkpoint falls after every two chapters. */
export function isCheckpoint(chaptersCleared) {
  return chaptersCleared > 0 && chaptersCleared % 2 === 0;
}
