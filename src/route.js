// Route selection (roadmap section 2). After a chapter the player picks the
// next body, drawn from discovery tiers so difficulty and the counters a body
// demands arrive in a fair order.
//
// Two offers, not four. Four cards of dense forecast is a spreadsheet at the
// exact moment the run wants a decision, and Tom asked for the simpler shape.
// Two still makes it a choice; the tier rules still decide what may appear.

import { PLANETS, gravityFor } from './planets.js';
import { makeRng } from './util.js';

/** The route screen always shows this many cards when the pool can fill them. */
export const MIN_OFFERS = 2;

/** How many sectors an expedition runs before it is complete. */
export const SECTORS = 5;

/**
 * The campaign, in order (M25). Tom's call: the progression is linear - Moon,
 * then Mars, then Europa - and losing a run puts you back at the Moon. There is
 * no "choose your next body" any more, because a roguelite run wants a known
 * ladder rather than a forecast to read.
 *
 * What survives of the choice is *farming*: once a body is cleared it stays on
 * the route screen and can be re-flown for salvage, so the decision at each
 * window is "go on, or go back and pay for the hangar first". That is a real
 * decision about risk and money, which the old four-card forecast never was.
 *
 * These are the three bodies with authored chapters. The other seven still fly
 * generated surveys and are not on the ladder until they are written.
 */
export const PLANET_ORDER = ['LUNA', 'MARS', 'EUROPA'];

/** The next body on the ladder, or null when the ladder is finished. */
export function nextPlanet(cleared = []) {
  const done = new Set(cleared);
  return PLANET_ORDER.find((id) => !done.has(id)) || null;
}

/**
 * What the route window offers: every body already cleared, in ladder order,
 * plus the next one. Each card says which it is, so "replay to farm" and "go
 * on" are visibly different choices rather than two identical buttons.
 */
export function routeChoices(cleared = [], sector = 1, seed = 0) {
  const rng = makeRng((seed ^ (sector * 2654435761)) >>> 0);
  const done = PLANET_ORDER.filter((id) => cleared.includes(id));
  const next = nextPlanet(cleared);
  const ids = [...done, ...(next ? [next] : [])];
  return ids.map((id) => ({
    ...planetCard(id, sector, rng),
    cleared: done.includes(id),
    isNext: id === next,
  }));
}

// -------------------------------------------------------------------------
// NOT WIRED TO THE GAME since M25. `TIERS`, `eligibleBodies`, `routeOffers`,
// `MIN_OFFERS` and `SECTORS` are M9's discovery-tier machinery: they decided
// which bodies could be *offered* when the route was a choice between two
// forecasts. The ladder replaced that, and nothing outside this file calls them
// any more.
//
// They are kept rather than deleted because the question they answer is still
// open: seven bodies still fly generated surveys, and when those chapters are
// authored they either join `PLANET_ORDER` or come back as a tiered choice
// after the ladder. That is Tom's call, not a refactor - but until it is made,
// this is dead code with passing tests, which is the state the M11 note warns
// about ("a system only ever read by a screen has not been shown to work").
// Delete it or wire it; do not leave it here indefinitely.
// -------------------------------------------------------------------------

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
  EUROPA: ['Ray Shield', 'Ice Cleats'],
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
 * The offers, deterministic from the run seed and how far in the player is.
 * Never fewer than the eligible pool allows, and never a duplicate.
 *
 * Two bodies that differ is worth more than two that do not, so when the pool
 * allows it the pair is spread across the difficulty range rather than taken at
 * random - otherwise "choose your next leg" can offer two of the same thing.
 */
export function routeOffers(clearedChapters, seed, sector = 1, count = MIN_OFFERS) {
  const rng = makeRng((seed ^ (sector * 2654435761)) >>> 0);
  const pool = eligibleBodies(clearedChapters);
  const picks = [];
  const bag = [...pool];
  while (picks.length < Math.min(count, pool.length) && bag.length) {
    const i = rng.int(0, bag.length - 1);
    picks.push(bag.splice(i, 1)[0]);
  }
  // With only two cards, a pair that reads the same is a choice in name only.
  // Swap the second for the most different body still available.
  if (picks.length === 2 && bag.length && DIFFICULTY[picks[0]] === DIFFICULTY[picks[1]]) {
    const spread = bag.reduce((best, id) => (
      Math.abs(DIFFICULTY[id] - DIFFICULTY[picks[0]]) > Math.abs(DIFFICULTY[best] - DIFFICULTY[picks[0]]) ? id : best
    ), bag[0]);
    if (DIFFICULTY[spread] !== DIFFICULTY[picks[0]]) picks[1] = spread;
  }
  // Keep the spread readable: easiest first.
  picks.sort((a, b) => DIFFICULTY[a] - DIFFICULTY[b]);
  return picks.map((id) => planetCard(id, sector, rng));
}

/**
 * A checkpoint falls after **every body** (M25). It used to be every second
 * one, and that was the bug Tom hit: mission salvage accumulates in `run.haul`
 * and only reaches `meta.banked` - the pot `purchase()` and `buySkill()`
 * actually spend from - when a checkpoint banks it. Clear the Moon, and there
 * was no checkpoint, so a whole chapter's salvage and research sat in the run
 * unspendable. M24 then closed the hangar outside that same window, which
 * turned a delay into a wall: two bodies deep with nothing to spend.
 *
 * Banking every body is the fix, and it is also the shape the design wants -
 * the window between bodies is where you decide whether to spend or press on.
 */
export function isCheckpoint(chaptersCleared) {
  return chaptersCleared > 0;
}

/** Every body on the ladder cleared. */
export function isExpeditionComplete(cleared = []) {
  return PLANET_ORDER.every((id) => cleared.includes(id));
}
