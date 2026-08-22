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
import { hazardName } from './forces.js';
import { ACTIVE_MODULES, PASSIVE_MODULES } from './modules.js';

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
export function routeChoices(cleared = [], sector = 1, seed = 0, opts = {}) {
  const next = nextPlanet(cleared);
  if (!next) return [];
  const rng = makeRng((seed ^ (sector * 2654435761)) >>> 0);
  return [{ ...planetCard(next, sector, rng, opts), cleared: false, isNext: true }];
}

/**
 * Every body on the ladder as a full forecast card, at the sector it will be
 * flown at - what the expedition start screen shows before a run begins.
 *
 * The same `planetCard` the supply stop builds, so the two screens cannot drift
 * apart: a body reads the same on the way in as it does when you get there. The
 * rng is seeded per position rather than per run, so the withheld hazard is
 * stable across re-renders instead of flickering each time the screen redraws.
 */
export function ladderPreview(cleared = [], opts = {}) {
  const done = new Set(cleared);
  const next = nextPlanet(cleared);
  return PLANET_ORDER.map((id, i) => ({
    ...planetCard(id, i + 1, makeRng((i + 1) * 2654435761 >>> 0), opts),
    position: i + 1,
    cleared: done.has(id),
    isNext: id === next,
    locked: id !== next && !done.has(id),
  }));
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

/**
 * What to take to a body, **derived from the modules themselves**.
 *
 * This was a hand-written table of prose names beside the card, and it named
 * the roster the spec *plans* rather than the one the game *has*: **10 of its
 * 20 entries were modules that do not exist.** Titan and Venus recommended two
 * apiece and neither body had a single obtainable one - on the screen where a
 * player commits to a run and then goes to the loadout to act on it.
 *
 * A module already declares the bodies it is good for (`good: ['VENUS']`), and
 * `modules.recommendedFor` already reads that. Two sources of truth for "what
 * should I take here" is how one of them drifts, so there is one now: this
 * derives from the same field, cannot name something unobtainable, and a module
 * added later appears on the right cards without anyone editing a list.
 *
 * One active and one passive, which is the two-item shape the card was drawn
 * for. A body nothing claims returns nothing, and the card says so plainly -
 * that is true of Titan and Venus today, and it is honest rather than a gap:
 * no built module is for thick air or acid.
 */
function recommendedNames(planetId) {
  const pick = (table) => {
    const m = Object.values(table).find((x) => x.good.includes(planetId));
    return m ? m.name : null;
  };
  return [pick(ACTIVE_MODULES), pick(PASSIVE_MODULES)].filter(Boolean);
}

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
export function planetCard(planetId, sector, rng, opts = {}) {
  const p = PLANETS[planetId];
  // **Names, not specs.** A hazard entry is either a bare string or a tuned
  // object, and this card is presentation: `join(', ')` on the raw list printed
  // `weather: [object Object]` for every body M29 authored with a tuned hazard,
  // which was six of the ten, on the screen a player picks a run from.
  const hazards = p.hazards.map(hazardName);
  // Navigation Forecast buys the half of the forecast the card holds back. The
  // *draw* is unchanged either way - the same rng call, so a card with the
  // skill and one without describe the same body - and only whether the held
  // name is printed differs. Rolling it differently would make the skill change
  // what the weather **is**, which is a route card lying in a new direction.
  let hidden = hazards.length > 1 && rng() < 0.5 ? hazards.pop() : null;
  if (hidden && opts.reveal) { hazards.push(hidden); hidden = null; }
  const machines = peakMachines(planetId);
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
    recommended: recommendedNames(planetId),
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
