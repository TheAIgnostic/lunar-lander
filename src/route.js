// The ladder (roadmap M27). The campaign is ten bodies in one fixed order, and
// that order never varies between runs.
//
// It was a two-card forecast once (M9), then a three-body ladder with cleared
// bodies re-flyable to farm salvage (M25). Both are gone, on Tom's call
// (2026-08-20, recorded in docs/PROGRESSION.md under "Decided"): a roguelike
// run wants a known ladder and an attrition curve, not a forecast to read and
// not a grind to fall back on.
//
// The discovery-tier machinery that served the old forecast - `TIERS`,
// `eligibleBodies`, `routeOffers`, `MIN_OFFERS`, `SECTORS` - was left in place
// through M25 and M26 with a note saying "delete it or wire it", because the
// open question was whether the seven survey bodies would join `PLANET_ORDER`
// or come back as a tiered choice after it. **M27 answers that question**: they
// join the ladder. So it is deleted rather than kept.

import { PLANETS, gravityFor } from './planets.js';
import { peakMachines } from './missions.js';
import { makeRng } from './util.js';

/**
 * The campaign, in order. All ten bodies, sorted by measured difficulty, Moon
 * first and Venus last (Tom's decision 1).
 *
 * Sorting by difficulty fixes the inverted ramp M25 shipped for free. Europa
 * had been the finale despite having the weakest gravity in the game and the
 * fewest machines; at position 2 it is the body that *teaches* ice, while Venus
 * - gravity 10.48 and dense drag - is a genuine wall to end on.
 *
 * This is also what unblocks the hangar. Every component level costs salvage
 * plus a material only one body produces, and the three-body ladder made seven
 * of those ten materials unreachable: Sensors could not be bought at all and
 * Hull capped at L2, which is the track that answers M24's two-shot machines.
 * Putting the bodies back on the route makes the materials reachable *by being
 * flown to*, so the "this material comes from that world" texture survives
 * intact rather than being repointed at whatever is nearby.
 */
export const PLANET_ORDER = [
  'LUNA', 'EUROPA', 'TITAN', 'MARS', 'ENCELADUS',
  'GANYMEDE', 'IO', 'MERCURY', 'PLUTO', 'VENUS',
];

/** The next body on the ladder, or null when the ladder is finished. */
export function nextPlanet(cleared = []) {
  const done = new Set(cleared);
  return PLANET_ORDER.find((id) => !done.has(id)) || null;
}

/**
 * What the route window offers: **the next body, and nothing else** (Tom's
 * decision 3). A cleared body cannot be re-flown. M25 kept every cleared body
 * on the screen as a card you could go back to and farm for salvage, and that
 * is the half of M25 this reverses - the supply stop is a supply stop, not a
 * choice.
 *
 * Returning only the actionable card is what *enforces* it: `route:N` indexes
 * this array, so there is no index a cleared body can be reached through. The
 * ladder behind the player is a display concern, and it is `ladderTrail`.
 */
export function routeChoices(cleared = [], sector = 1, seed = 0) {
  const next = nextPlanet(cleared);
  if (!next) return [];
  const rng = makeRng((seed ^ (sector * 2654435761)) >>> 0);
  return [{ ...planetCard(next, sector, rng), cleared: false, isNext: true }];
}

/**
 * The ladder as a progress trail: all ten bodies in order, each marked cleared,
 * next, or still ahead. Non-interactive - it is how far this run got, drawn so
 * the player can see it, which is the thing the M25 route screen did carry and
 * is worth keeping now that the cards themselves are gone.
 */
export function ladderTrail(cleared = []) {
  const done = new Set(cleared);
  const next = nextPlanet(cleared);
  return PLANET_ORDER.map((id, i) => ({
    planet: id,
    name: PLANETS[id].displayName,
    position: i + 1,
    cleared: done.has(id),
    isNext: id === next,
    ahead: !done.has(id) && id !== next,
  }));
}

/**
 * How hard a body is, on its own terms. This table predates the ladder and
 * turns out to agree with it: read in `PLANET_ORDER` it is non-decreasing, 1 at
 * the Moon and 5 at Venus, which is a good sign the ordering Tom chose and the
 * difficulty recorded here were measuring the same thing.
 */
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

/** What "N machines on the worst mission of this body" reads as on a card. */
function intensityOf(machines) {
  if (machines <= 0) return 'none';
  if (machines <= 2) return 'light';
  if (machines <= 4) return 'moderate';
  return 'heavy';
}

/**
 * A route card. The forecast is helpful but deliberately incomplete - one
 * hazard is withheld, which the Navigation Forecast skill will later reveal.
 *
 * **Two figures on this card used to be bumped by the sector**, and M27 broke
 * both by making the sector run to 10 instead of 3. Measured across the ladder,
 * `min(5, DIFFICULTY + floor((sector - 1) / 2))` read 5 for bodies 5 through 10
 * and `enemyIntensity` read "heavy" from body 4 on: six of ten cards printed the
 * same forecast. That is the M24 saturation fault again - a formula that
 * destroys the ordering the content was authored with.
 *
 * The fix is the same shape as M24's. Difficulty drops the sector term, because
 * on a fixed ladder the sector *is* the position and the position is already
 * sorted by difficulty, so adding both counts one axis twice. Intensity is read
 * off the chapter the player will actually fly rather than inferred, which is
 * the honest number and spreads because it is measured.
 */
export function planetCard(planetId, sector, rng) {
  const p = PLANETS[planetId];
  const hazards = [...p.hazards];
  const hidden = hazards.length > 1 && rng() < 0.5 ? hazards.pop() : null;
  const machines = peakMachines(planetId, sector);
  return {
    planet: planetId,
    name: p.displayName,
    gravity: gravityFor(planetId),
    realGravity: p.realGravity,
    atmosphere: p.atmosphere,
    hazards,
    hiddenHazard: hidden,
    machines,
    enemyIntensity: intensityOf(machines),
    rareMaterial: p.rareMaterial,
    recommended: RECOMMENDED[planetId] || [],
    difficulty: DIFFICULTY[planetId] || 1,
    summary: p.summary,
    incomplete: !!hidden,
  };
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

/** Every body on the ladder cleared. Ten of ten, ending on Venus. */
export function isExpeditionComplete(cleared = []) {
  return PLANET_ORDER.every((id) => cleared.includes(id));
}
