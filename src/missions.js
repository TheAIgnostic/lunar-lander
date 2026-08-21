// Authored missions (roadmap section 6). Data only: a MissionDefinition names
// a planet, a terrain archetype and its landing zones, and the engine turns it
// into the level config the generator already understands.
//
// Fields that later milestones consume (enemyBudget, optionalObjective) are
// carried now so the content does not need rewriting when those land.
//
// **Enemy budgets follow one ramp.** Set in M15 after the encounter audit found
// nine of fifteen missions with nothing hostile on them at all; roughly doubled
// in M21, when Tom asked for more machines and the measurement agreed - 71% of
// the deep route had nothing on it at all. Mission 1 of a chapter is still
// always quiet, and 2-5 climb 3, 3, 4, 4 on the Moon and 3, 4, 4, 5 on Mars.
//
// More machines is *not* more of a fight: they take stations strung along the
// crossing rather than ringing the prize, so a route meets one or two at a time.
// The spec's "1-3 at once, rarely 4" is a statement about what is on you now,
// not about what is on the map, and both `placeEnemies` and `validate.js`
// enforce it as one.
//
// **A budget is what the map actually fields**, not an aspiration. These were
// set from a measured capacity sweep: every one of them fills to 95% or better
// over 20 seeds, and no armed mission is ever empty. Raising them past this
// does not put more machines in the world - it just makes the number a lie,
// because a map has room for a finite number of non-overlapping engagements
// and the at-once rule, not the budget, is what decides how many.
//
// **Pads are authored prize-first.** Index 0 is placed in the deepest distance
// band - the far end of the map, past the fuel road, worth the most material -
// and the last pad is the near zone that can always be reached on the starting
// tank. The terrain places them by that order, so swapping two entries in a
// `pads` array moves them across the map.

import { PLANETS, gravityFor } from './planets.js';
import { cargoFor } from './objectives.js';
import { makeRng } from './util.js';

export const MOON_MISSIONS = [
  {
    id: 'moon-1', planet: 'LUNA', index: 1, name: 'THE CRATER',
    brief: 'A wide bowl with the pad on a shelf inside it. You cannot just drop in. Carry your speed across the bowl, then set down flat.',
    width: 2700, relief: 250, detail: 1.0, rough: 150, fuel: 124,
    // THE CRATER is named for its shape, so its shape does not move.
    pinShape: true,
    terrain: { archetype: 'crater' },
    pads: [{ mult: 3, width: 130 }, { mult: 2, width: 200 }],
    optionalObjective: { id: 'sample-titanium', text: 'Recover a titanium-rich sample', reward: { data: 20 } },
    enemyBudget: 0,
  },
  {
    id: 'moon-2', planet: 'LUNA', index: 2, name: 'THE TRENCH',
    brief: 'A deep channel with the pad on the floor, tucked under a cliff. Kill your sideways drift early. Down here a late correction costs more than you have.',
    width: 2900, relief: 300, detail: 1.6, rough: 170, fuel: 116,
    pinShape: true,   // THE TRENCH is named for its shape
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 3, width: 120 }],
    optionalObjective: { id: 'fuel-25', text: 'Land with at least 25% fuel', reward: { salvage: 40 } },
    enemyBudget: 3,
  },
  {
    id: 'moon-3', planet: 'LUNA', index: 3, name: 'THE RELAY',
    brief: 'Broken ridges, and a landing platform cut into the side of one. Telemetry drops in and out this far around, so fly what you can see.',
    width: 3000, relief: 290, detail: 1.2, rough: 200, fuel: 112,
    terrain: { archetype: 'ridge' },
    pads: [{ mult: 3, width: 110 }, { mult: 2, width: 180 }],
    optionalObjective: { id: 'power-relay', text: 'Power the relay for extra research data', reward: { data: 35 } },
    enemyBudget: 3,
  },
  {
    id: 'moon-4', planet: 'LUNA', index: 4, name: 'OLD BATTERY',
    brief: 'A crater rim covered in wreckage. Two security guns still track anything that moves. They are slow, and you can fly around them.',
    width: 3100, relief: 280, detail: 1.8, rough: 210, fuel: 108,
    terrain: { archetype: 'mesa' },
    pads: [{ mult: 3, width: 110 }, { mult: 2, width: 170 }],
    optionalObjective: { id: 'no-ability', text: 'Complete without using the active ability', reward: { cores: 1 } },
    enemyBudget: 4, enemySets: ['sentry-turret'],
  },
  {
    id: 'moon-5', planet: 'LUNA', index: 5, name: 'TYCHO',
    brief: 'Tall walls, a peak in the middle, and a terrace barely wider than your legs. Everything the Moon has taught you, with fuel for one attempt.',
    width: 3200, relief: 320, detail: 1.4, rough: 230, fuel: 104,
    terrain: { archetype: 'caldera' },
    pads: [{ mult: 5, width: 78 }, { mult: 2, width: 170 }],
    optionalObjective: { id: 'centre', text: 'Touch down inside the central bonus area', reward: { cores: 1 } },
    enemyBudget: 4, enemySets: ['sentry-turret'],
  },
];

/**
 * Turn a MissionDefinition into the level config the generator and the physics
 * already consume. Keeping this an adapter means authored content never has to
 * know about the engine's internal shape.
 */
export function missionToLevel(mission) {
  const planet = PLANETS[mission.planet];
  return {
    id: mission.id,
    missionId: mission.id,
    world: planet.world,
    title: mission.name,
    brief: mission.brief,
    planet: mission.planet,
    localIndex: mission.index,

    gravity: gravityFor(mission.planet),
    width: mission.width,
    // M19 raised the world's vertical budget. `legroom` for a canyon is
    // `groundBase - 70` and it was 230 px, which meant the fit clamp squashed
    // every trench to about half its intended depth: raising the relief
    // multiplier made the compression worse and the canyon no deeper. More
    // ground base buys depth; more height keeps the rim room that buys it back.
    height: 1600,
    groundBase: 520,
    rough: mission.rough,
    fuel: mission.fuel,

    wind: mission.wind != null ? mission.wind : planet.wind,
    gust: mission.gust != null ? mission.gust : planet.gust,
    drag: mission.drag != null ? mission.drag : planet.drag,
    surfaceFriction: planet.surfaceFriction,
    visibility: planet.visibility,
    hazards: mission.hazards || planet.hazards,
    rareMaterial: planet.rareMaterial,
    cave: !!mission.cave, clearance: mission.clearance || 0,
    // Somewhere for a machine to stand, and something to have been abandoned.
    // Derived from the mission's own machine budget where the content does not
    // say otherwise, so an armed mission always has flat roofs on it and a
    // quiet one is not littered with buildings nobody used.
    structures: mission.structures != null
      ? mission.structures
      : Math.min(5, mission.enemyBudget || 0),
    // Where the roof opens and where it has closed, as a fraction of the
    // crossing. M19b made the mouth per-mission; a mission that wants to be
    // flown *into* rather than begun indoors sets them.
    caveMouth: mission.caveMouth, caveShut: mission.caveShut,
    // What the ground is made of. A mission may override its body, but almost
    // never should: this is what makes an icy world icy everywhere.
    surface: mission.surface || planet.terrainStyle,
    fuelCells: mission.fuelCells || 0,

    terrain: {
      archetype: mission.terrain.archetype,
      relief: mission.relief,
      detail: mission.detail,
    },
    pads: mission.pads,

    optionalObjective: mission.optionalObjective || null,
    // Resolved here, where content lives, so the terrain generator can place a
    // crate without knowing what an objective is.
    cargoSpec: cargoFor(mission),
    enemyBudget: mission.enemyBudget || 0,
    // A mission may name its own machines; otherwise it inherits whatever the
    // body is allowed to field, so content stays data and the roster can grow.
    enemySets: mission.enemySets || planet.eligibleEnemySets || [],
  };
}

export const MOON_LEVELS = MOON_MISSIONS.map(missionToLevel);

export const MARS_MISSIONS = [
  {
    id: 'mars-1', planet: 'MARS', index: 1, name: 'RED BASIN',
    brief: 'Thin air, but enough to matter. The lander answers late and drifts on the gusts. The pad sits behind a low ridge and there is dust coming in.',
    width: 3000, relief: 240, detail: 1.2, rough: 190, fuel: 136,
    terrain: { archetype: 'basin' },
    pads: [{ mult: 3, width: 120 }, { mult: 2, width: 190 }],
    hazards: [{ type: 'dust', period: 22, minVisibility: 0.55, duty: 0.35 }],
    optionalObjective: { id: 'fuel-25', text: 'Land with at least 25% fuel', reward: { salvage: 45 } },
    enemyBudget: 0,
  },
  {
    id: 'mars-2', planet: 'MARS', index: 2, name: 'THE CANYON',
    brief: 'The wind here stacks in layers, and each layer runs the other way. Drop through them one at a time. Go straight down and it will throw you into a wall.',
    width: 3100, relief: 300, detail: 1.4, rough: 200, fuel: 132,
    pinShape: true,   // THE CANYON is named for its shape
    // **Pinned to the drag this mission was balanced at.** THE CANYON is the one
    // Mars mission that does not use the `atmosphere` force - it declares
    // `windChannels` - which is why M28b's double-drag fix left it alone at
    // 15/20 while the other four went to 20/20. But `windChannels` reads
    // `level.drag` for how hard a band couples to the hull, so M29 raising the
    // *planet's* drag reached it anyway, by a second path nobody had in mind,
    // and took it 15/20 to 8/20. That is the same shape of fault as the
    // double-apply itself: an authored number arriving at the physics through a
    // route the author was not thinking about. Declaring it here keeps the
    // mission exactly where it was measured, and makes the dependency visible.
    drag: 0.15,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 3, width: 130 }],
    hazards: [{ type: 'windChannels', bandHeight: 190, strength: 44 }],
    optionalObjective: { id: 'hull-10', text: 'Keep hull damage below 10%', reward: { data: 30 } },
    enemyBudget: 3, enemySets: ['sentry-turret'],
  },
  {
    id: 'mars-3', planet: 'MARS', index: 3, name: 'BURIED ARRAY',
    brief: 'Dune country, with a sensor array half swallowed by it. The dust comes in hard and often, so learn the ground while you can still see it.',
    width: 3200, relief: 230, detail: 1.8, rough: 210, fuel: 128,
    terrain: { archetype: 'dunes' },
    pads: [{ mult: 3, width: 130 }, { mult: 2, width: 180 }],
    hazards: [{ type: 'dust', period: 13, minVisibility: 0.32, duty: 0.5 }],
    optionalObjective: { id: 'power-array', text: 'Restore a sensor tower for a stronger beacon', reward: { data: 40 } },
    enemyBudget: 4, enemySets: ['sentry-turret', 'seeker-drone'], fuelCells: 2,
  },
  {
    id: 'mars-4', planet: 'MARS', index: 4, name: 'IRON RAIN',
    brief: 'Iron mesas, old ground guns, a drone still flying its patrol, and salvage sitting exactly where the safe route is not. The wind does not care that you are being shot at.',
    width: 3300, relief: 290, detail: 1.6, rough: 230, fuel: 124,
    terrain: { archetype: 'mesa' },
    pads: [{ mult: 3, width: 115 }, { mult: 2, width: 175 }],
    hazards: [{ type: 'dust', period: 18, minVisibility: 0.5, duty: 0.3 }],
    optionalObjective: { id: 'salvage-iron', text: 'Recover the iron-ceramic salvage off the safe route', reward: { salvage: 70 } },
    // Mars meets the sniper on IRON RAIN rather than on STORM EYE: the exam
    // mission is the one whose composition was balanced by hand, and a sniper
    // displaces a drone rather than adding to the map (the at-once rule), so
    // putting one there quietly took STORM EYE from 6/20 to 12/20.
    enemyBudget: 4, enemySets: ['sentry-turret', 'seeker-drone', 'mast-sniper'], fuelCells: 2,
  },
  {
    id: 'mars-5', planet: 'MARS', index: 5, name: 'STORM EYE',
    brief: 'A storm walks the crater on a cycle. The pad is on the mesa in the middle and you will only see it in the gaps. Something is still flying in there. Learn the ground, then commit.',
    width: 3400, relief: 320, detail: 1.5, rough: 240, fuel: 120,
    terrain: { archetype: 'caldera' },
    pads: [{ mult: 5, width: 84 }, { mult: 2, width: 175 }],
    hazards: [{ type: 'dust', period: 11, minVisibility: 0.22, duty: 0.55 }],
    optionalObjective: { id: 'centre', text: 'Touch down inside the central bonus area', reward: { cores: 1 } },
    enemyBudget: 5, enemySets: ['seeker-drone', 'sentry-turret'], fuelCells: 3,
  },
];

export const MARS_LEVELS = MARS_MISSIONS.map(missionToLevel);

export const EUROPA_MISSIONS = [
  {
    id: 'europa-1', planet: 'EUROPA', index: 1, name: 'GLASS',
    brief: 'Smooth ice between the ridges, and almost nothing to hold you. Touching down is only half the landing here. You will keep moving after the legs are down, so arrive slow and arrive straight.',
    width: 2900, relief: 200, detail: 0.8, rough: 150, fuel: 122,
    terrain: { archetype: 'basin' },
    pads: [{ mult: 3, width: 130 }, { mult: 2, width: 200 }],
    optionalObjective: { id: 'centre', text: 'Come to rest inside the central bonus area', reward: { data: 30 } },
    enemyBudget: 0,
  },
  {
    id: 'europa-2', planet: 'EUROPA', index: 2, name: 'THE CREVASSE',
    brief: 'A crack in the shell, open at the mouth and closing over as it runs deeper. The pad is a bridge of ice far down it. Fly in while you can still see sky.',
    width: 3000, relief: 300, detail: 1.2, rough: 190, fuel: 118,
    // A crevasse is a cave entered from above, so the roof closes later and
    // further in than UNDER THE ICE: open sky at the mouth, and about 70% shut
    // by the time the bridge is under you. Closing it any earlier is what the
    // test pilot cannot fly - 0.20/0.52 takes the way home from 20/20 seeds to
    // 16/20, and the wall is the ceiling guard rather than the geometry.
    terrain: { archetype: 'canyon' }, cave: true, clearance: 300, caveMouth: 0.26, caveShut: 0.58,
    pads: [{ mult: 5, width: 120 }],
    optionalObjective: { id: 'core-ice', text: 'Recover an ice core from the crevasse floor', reward: { data: 40 } },
    // Held at one, against the M21 ramp. THE CREVASSE is a single-pad cave, so
    // the sanctuary *is* the prize and the corridor is the only way in: there
    // is no route around a machine here the way there is on a two-zone map.
    // Measured over 40 seeds - unarmed flights lost to fire: 0 at one machine,
    // 2 at two, 6 at three. The unarmed crossing is a promise, so this is the
    // number that keeps it.
    enemyBudget: 1,
  },
  {
    id: 'europa-3', planet: 'EUROPA', index: 3, name: 'RADIATION PASS',
    brief: 'Jupiter sweeps this face on a cycle. The ice blades throw long shadows, and the sheltered route is the slow one. Take it anyway.',
    width: 3100, relief: 320, detail: 1.4, rough: 220, fuel: 116,
    terrain: { archetype: 'ridge' },
    pads: [{ mult: 3, width: 125 }, { mult: 2, width: 175 }],
    hazards: [{ type: 'radiation', period: 15, duty: 0.45, rate: 13 }],
    optionalObjective: { id: 'low-rads', text: 'Land with radiation exposure under 30%', reward: { data: 45 } },
    enemyBudget: 3, fuelCells: 2,
  },
  {
    id: 'europa-4', planet: 'EUROPA', index: 4, name: 'UNDER THE ICE',
    brief: 'A cracked shelf with something buried under it, and something buried in it that wakes up when you pass. The corridor is tight and the ceiling is ice. Neither forgives a fast approach.',
    width: 3200, relief: 260, detail: 1.6, rough: 200, fuel: 126,
    terrain: { archetype: 'canyon' }, cave: true, clearance: 290,
    pads: [{ mult: 3, width: 130 }],
    hazards: [{ type: 'radiation', period: 18, duty: 0.35, rate: 11 }],
    optionalObjective: { id: 'probe-lost', text: 'Recover the probe that went quiet under the shelf', reward: { salvage: 80 } },
    // Two, against the M21 ramp, and for the same structural reason as THE
    // CREVASSE: one pad, one corridor, drones that ram. Over 40 seeds, unarmed
    // flights lost to fire: 0 at two machines, 1 at three, 5 at four.
    enemyBudget: 2, enemySets: ['seeker-drone'], fuelCells: 2,
  },
  {
    id: 'europa-5', planet: 'EUROPA', index: 5, name: 'THE FLOES',
    brief: 'Separated plates of ice, one of them worth landing on, and Jupiter overhead. Everything Europa has taught you, on ground that will not hold a mistake.',
    width: 3300, relief: 300, detail: 1.5, rough: 230, fuel: 124,
    terrain: { archetype: 'caldera' },
    pads: [{ mult: 5, width: 96 }, { mult: 2, width: 180 }],
    hazards: [{ type: 'radiation', period: 13, duty: 0.5, rate: 14 }],
    optionalObjective: { id: 'perfect', text: 'Set down on the plate at PERFECT', reward: { cores: 2 } },
    // Below the ramp, and deliberately. A drone-only chapter cannot absorb
    // machines the way a mixed one can: a turret is something you fly around,
    // a drone follows you and rams. On the deep route here, unarmed flights
    // land 6/20 at two machines, 3/20 at three and 1/20 at four - so this is
    // three, and the ramp is a shape rather than a quota.
    enemyBudget: 3, enemySets: ['seeker-drone'], fuelCells: 3,
  },
];

export const EUROPA_LEVELS = EUROPA_MISSIONS.map(missionToLevel);

/* ============================================================================
 * M29 - the survey bodies become content.
 *
 * Seven bodies flew a generated chapter that dealt the same five names and the
 * same five briefs to every one of them: FIRST LOOK, LOW PASS, DEEP FIELD, THE
 * SHELF, LAST LIGHT, on Titan and on Venus alike. All 35 carried
 * `optionalObjective: null`, so M14's objectives system was dead on seven
 * tenths of a ladder that every run walks. None had a set piece. And four of
 * the bodies had no working hazard at all, because the hazard name they
 * declared did not match any builder (see `BUILDERS` in `forces.js`).
 *
 * These are those 35 missions, authored.
 *
 * **The numbers started from the generator, not from taste.** `generateChapter`
 * carried a fuel formula, pad widths and a depth ramp set from measured sweeps
 * in M9, M21 and M27, and throwing that away to hand-pick 35 fuel budgets would
 * have been the "started from an assumption" failure this file records twice.
 * Each chapter below was seeded with what the generator produced for that body
 * at **its own ladder position**, then hand-tuned where the content asks for
 * something a formula cannot know - a set piece, a longer crossing, a body whose
 * hazard makes hovering expensive. The generator itself was deleted once all ten
 * bodies were authored; its arithmetic is in these numbers, and its guarantees
 * are in `route-tests.js` and `validate-missions.js`.
 *
 * **A body is visited once per run and always at the same rung**, because the
 * ladder order is fixed (Tom, 2026-08-20). So the sector/depth term the
 * generator carried is not needed here: the difficulty is authored at the rung
 * the body actually occupies, which is strictly better than a formula guessing
 * at it.
 *
 * **Every mission declares its full hazard list.** `missionToLevel` does
 * `mission.hazards || planet.hazards` - a mission's list *replaces* its body's
 * rather than adding to it - so a mission that tunes one hazard has to restate
 * the others or silently drop them. That is the per-mission hazard tuning
 * `docs/PROGRESSION.md` recorded as missing, and it is also a trap; it is
 * called out here because the failure is invisible.
 * ==========================================================================*/

export const TITAN_MISSIONS = [
  {
    id: 'titan-1', planet: 'TITAN', index: 1, name: 'THE SHORE',
    brief: 'Thick air and hardly any gravity. Speed up and the air holds you like a wing, so you will float past the pad rather than fall short of it. Come in slow.',
    width: 2950, relief: 210, detail: 0.9, rough: 160, fuel: 168,
    terrain: { archetype: 'basin' },
    pads: [{ mult: 3, width: 130 }, { mult: 2, width: 226 }],
    hazards: ['wind', { type: 'glide', lift: 0.00025, liftCap: 15 },
      { type: 'dust', period: 20, minVisibility: 0.7, duty: 0.35 }],
    optionalObjective: { id: 'fuel-40', text: 'Land with at least 40% fuel', reward: { salvage: 45 } },
    enemyBudget: 0,
  },
  {
    id: 'titan-2', planet: 'TITAN', index: 2, name: 'THE DUNES',
    brief: 'Long sand ridges, and the wind runs along them. The pad is in a hollow between two of them. Get down into the still air early and the last part is easy.',
    width: 3050, relief: 236, detail: 1.1, rough: 178, fuel: 163,
        // Named for its shape (the M26 rule), so its shape does not move.
    pinShape: true,
    terrain: { archetype: 'dunes' },
    pads: [{ mult: 4, width: 111 }, { mult: 3, width: 199 }],
    hazards: ['wind', { type: 'glide', lift: 0.00025, liftCap: 15 },
      { type: 'dust', period: 17, minVisibility: 0.62, duty: 0.5 }],
    optionalObjective: { id: 'lake-sample', text: 'Recover a sample from the methane shore', reward: { data: 35 } },
    enemyBudget: 2,
  },
  {
    id: 'titan-3', planet: 'TITAN', index: 3, name: 'THE HAZE',
    brief: 'The storm here comes in slow and you can watch it arrive. What you cannot watch is the squall inside it. If the ground goes, stop moving and wait.',
    width: 3150, relief: 262, detail: 1.3, rough: 196, fuel: 158,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 4, width: 92 }, { mult: 3, width: 171 }],
    hazards: ['wind', { type: 'glide', lift: 0.00025, liftCap: 15 },
      { type: 'dust', period: 14, minVisibility: 0.5, duty: 0.55, squallChance: 0.4 }],
    optionalObjective: { id: 'hull-10', text: 'Keep hull damage below 10%', reward: { data: 40 } },
    enemyBudget: 3, fuelCells: 2,
  },
  {
    id: 'titan-4', planet: 'TITAN', index: 4, name: 'THE OUTFLOW',
    brief: 'A channel cut by liquid methane, with the pad on the bank. Drones patrol the length of it. There is nowhere up here to sit still and think.',
    width: 3250, relief: 288, detail: 1.5, rough: 214, fuel: 153,
    terrain: { archetype: 'basin' },
    pads: [{ mult: 6, width: 83 }, { mult: 2, width: 174 }],
    hazards: ['wind', { type: 'glide', lift: 0.00025, liftCap: 15 },
      { type: 'dust', period: 16, minVisibility: 0.58, duty: 0.5 }],
    optionalObjective: { id: 'no-hull', text: 'Bring the lander home undamaged', reward: { salvage: 70 } },
    enemyBudget: 3, fuelCells: 2,
  },
  {
    id: 'titan-5', planet: 'TITAN', index: 5, name: 'THE LONG GLIDE',
    brief: 'The widest crossing on the ladder, and not enough fuel to fly it. Build up speed once, let the air carry you, and spend what is left on stopping. This is what Titan has been teaching you.',
    // **Titan's set piece.** The body's whole mechanic is that horizontal speed
    // makes lift, so the exam is a crossing you cannot afford to power across
    // and can afford to glide across. Width and fuel are hand-set against each
    // other here rather than taken from the ramp: the generator has no way to
    // know that a mission is meant to be flown on the air.
    width: 4000, relief: 300, detail: 1.4, rough: 232, fuel: 138,
    terrain: { archetype: 'dunes' },
    pads: [{ mult: 6, width: 78 }, { mult: 2, width: 190 }],
    hazards: ['wind', { type: 'glide', lift: 0.00032, liftCap: 18 },
      { type: 'dust', period: 15, minVisibility: 0.55, duty: 0.45 }],
    optionalObjective: { id: 'quick', text: 'Cross and land in under a minute', reward: { cores: 1 } },
    // The first Mast Sniper on the ladder, on the exam mission of body 3.
    // Anything later and a typical run never meets one at all.
    enemyBudget: 3, enemySets: ['seeker-drone', 'mast-sniper'], fuelCells: 3,
  },
];

export const ENCELADUS_MISSIONS = [
  {
    id: 'enceladus-1', planet: 'ENCELADUS', index: 1, name: 'FIRST FOOTING',
    brief: 'Almost no gravity at all. Every push you make lasts until you cancel it, and nothing here will cancel it for you. Fly in small amounts.',
    width: 3100, relief: 210, detail: 0.9, rough: 160, fuel: 86,
    terrain: { archetype: 'crater' },
    pads: [{ mult: 3, width: 120 }, { mult: 2, width: 212 }],
    hazards: [{ type: 'plume', vents: [{ atX: 0.62, period: 10, duty: 0.28, radius: 190, force: 13 }] }],
    optionalObjective: { id: 'fuel-40', text: 'Land with at least 40% fuel', reward: { salvage: 45 } },
    enemyBudget: 0,
  },
  {
    id: 'enceladus-2', planet: 'ENCELADUS', index: 2, name: 'THE TIGER STRIPES',
    brief: 'Long warm cracks in the ice, and vapour coming out of them on a cycle. A vent will lift you if you are over it. Watch one work before you cross it.',
    width: 3200, relief: 236, detail: 1.1, rough: 178, fuel: 81,
        // Named for its shape (the M26 rule), so its shape does not move.
    pinShape: true,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 4, width: 102 }, { mult: 3, width: 185 }],
    hazards: [{ type: 'plume', vents: [
      { atX: 0.34, period: 9, duty: 0.34, radius: 200, force: 15 },
      { atX: 0.68, period: 7.5, duty: 0.36, radius: 190, force: 16 },
    ] }],
    optionalObjective: { id: 'vent-sensor', text: 'Recover the sensor dropped beside a vent', reward: { data: 40 } },
    // Turrets only: the body's first machines are ones you can fly around.
    enemyBudget: 2, enemySets: ['sentry-turret'],
  },
  {
    id: 'enceladus-3', planet: 'ENCELADUS', index: 3, name: 'COLD START',
    brief: 'A ridge line with the pad on the far side of it. The ice gives you nothing to stop against, so arrive straight and arrive slow, and expect to still be moving after you touch.',
    width: 3300, relief: 262, detail: 1.3, rough: 196, fuel: 76,
    terrain: { archetype: 'ridge' },
    pads: [{ mult: 4, width: 82 }, { mult: 3, width: 157 }],
    hazards: [{ type: 'plume', vents: [
      { atX: 0.28, period: 8, duty: 0.32, radius: 180, force: 14 },
      { atX: 0.72, period: 10, duty: 0.30, radius: 210, force: 14 },
    ] }],
    optionalObjective: { id: 'centre', text: 'Come to rest inside the central bonus area', reward: { data: 40 } },
    enemyBudget: 3, enemySets: ['sentry-turret'], fuelCells: 2,
  },
  {
    id: 'enceladus-4', planet: 'ENCELADUS', index: 4, name: 'SOUTH POLAR',
    brief: 'The pad sits between two of the biggest vents on the moon. Both of them are on a clock. Neither clock is the same.',
    width: 3400, relief: 288, detail: 1.5, rough: 214, fuel: 71,
    terrain: { archetype: 'crater' },
    pads: [{ mult: 6, width: 72 }, { mult: 2, width: 160 }],
    hazards: [{ type: 'plume', vents: [
      { atX: 0.44, period: 8.5, duty: 0.40, radius: 230, force: 17 },
      { atX: 0.60, period: 11.5, duty: 0.38, radius: 230, force: 17 },
    ] }],
    optionalObjective: { id: 'perfect', text: 'Set down at PERFECT with the vents running', reward: { cores: 1 } },
    // The first drone on the body, and the reason the budget stops at three.
    enemyBudget: 3, enemySets: ['sentry-turret', 'seeker-drone'], fuelCells: 2,
  },
  {
    id: 'enceladus-5', planet: 'ENCELADUS', index: 5, name: 'THE GEYSER FIELD',
    brief: 'Five vents and one landing zone, and the vents are the only thing here with any force in them. Ride them across. Fighting them costs fuel you do not have.',
    // **Enceladus' set piece.** Its gravity is 7.3 px/s^2, the weakest in the
    // game, so a vent is not an obstacle here the way Io's fountain is - it is
    // the strongest force on the map and the cheapest way to move. A field of
    // them makes the body's own mechanic the route.
    width: 3500, relief: 300, detail: 1.5, rough: 232, fuel: 66,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 6, width: 64 }, { mult: 2, width: 132 }],
    hazards: [{ type: 'plume', vents: [
      { atX: 0.22, period: 7, duty: 0.42, radius: 200, force: 16 },
      { atX: 0.39, period: 9, duty: 0.40, radius: 200, force: 17 },
      { atX: 0.55, period: 6.5, duty: 0.44, radius: 190, force: 15 },
      { atX: 0.71, period: 10.5, duty: 0.38, radius: 210, force: 18 },
      { atX: 0.87, period: 8, duty: 0.40, radius: 200, force: 16 },
    ] }],
    optionalObjective: { id: 'fuel-25', text: 'Land with at least 25% fuel left', reward: { cores: 1 } },
    enemyBudget: 4, enemySets: ['sentry-turret', 'seeker-drone', 'mast-sniper'], fuelCells: 3,
  },
];

export const GANYMEDE_MISSIONS = [
  {
    id: 'ganymede-1', planet: 'GANYMEDE', index: 1, name: 'THE GROOVES',
    brief: 'Old parallel ridges running the length of the map. There is a magnetic field here and it pulls on the hull, so expect the lander to lean without being asked.',
    width: 3100, relief: 210, detail: 0.9, rough: 160, fuel: 108,
    terrain: { archetype: 'ridge' },
    pads: [{ mult: 3, width: 120 }, { mult: 2, width: 212 }],
    hazards: [{ type: 'magnetic', anomalies: [{ atX: 0.55, radius: 380 }], magRate: 6 }],
    optionalObjective: { id: 'low-charge', text: 'Land with charge under 40%', reward: { salvage: 45 } },
    enemyBudget: 0,
  },
  {
    id: 'ganymede-2', planet: 'GANYMEDE', index: 2, name: 'BAD READING',
    brief: 'Your altitude and speed readouts drift here. They are wrong by a little, all the time, and they are worst near the anomalies. Fly the window you can see instead.',
    width: 3200, relief: 236, detail: 1.1, rough: 178, fuel: 103,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 4, width: 102 }, { mult: 3, width: 185 }],
    hazards: [
      { type: 'magnetic', anomalies: [{ atX: 0.4, radius: 400 }, { atX: 0.75, radius: 380 }], magRate: 8 },
      { type: 'falseRadar', radarError: 1 },
    ],
    optionalObjective: { id: 'beacon-dark', text: 'Recover the beacon that stopped reporting', reward: { data: 40 } },
    enemyBudget: 3,
  },
  {
    id: 'ganymede-3', planet: 'GANYMEDE', index: 3, name: 'THE CRATER CHAIN',
    brief: 'A line of old craters, guns on two of them, and a field strong enough to drag you low over the last stretch. Being heavy here is not your imagination.',
    width: 3300, relief: 262, detail: 1.3, rough: 196, fuel: 98,
        // Named for its shape (the M26 rule), so its shape does not move.
    pinShape: true,
    terrain: { archetype: 'crater' },
    pads: [{ mult: 4, width: 82 }, { mult: 3, width: 157 }],
    hazards: [
      { type: 'magnetic', anomalies: [{ atX: 0.35, radius: 400 }, { atX: 0.68, radius: 420 }], magRate: 9 },
      { type: 'falseRadar', radarError: 0.8 },
    ],
    optionalObjective: { id: 'hull-10', text: 'Keep hull damage below 10%', reward: { data: 45 } },
    enemyBudget: 4, fuelCells: 2,
  },
  {
    id: 'ganymede-4', planet: 'GANYMEDE', index: 4, name: 'THE DARK SIDE OF THE FIELD',
    brief: 'Machines in the air and on the ground, and instruments you cannot trust while you deal with them. Everything you need to know is out of the window.',
    width: 3400, relief: 288, detail: 1.5, rough: 214, fuel: 93,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 6, width: 72 }, { mult: 2, width: 160 }],
    hazards: [
      { type: 'magnetic', anomalies: [{ atX: 0.3, radius: 380 }, { atX: 0.58, radius: 400 }, { atX: 0.84, radius: 380 }], magRate: 10 },
      { type: 'falseRadar', radarError: 1.1 },
    ],
    optionalObjective: { id: 'no-ability', text: 'Complete without using the active module', reward: { cores: 1 } },
    enemyBudget: 4, enemySets: ['sentry-turret', 'seeker-drone', 'mast-sniper'], fuelCells: 2,
  },
  {
    id: 'ganymede-5', planet: 'GANYMEDE', index: 5, name: 'THE BLIND CROSSING',
    brief: 'The strongest field on the moon sits over the middle of the crossing, and the pad is on the far side of it. Nothing you read on the way through will be true. Pick your line before you enter it.',
    // **Ganymede's set piece**, and the one that makes the body's two hazards
    // one idea: a single wide anomaly straddling the crossing, so the lie and
    // the pull arrive together and the answer to both is to have decided
    // already. `magnetic` is physics and `falseRadar` is presentation, and this
    // is the mission that makes the difference legible.
    width: 3500, relief: 300, detail: 1.5, rough: 232, fuel: 88,
    terrain: { archetype: 'ridge' },
    pads: [{ mult: 6, width: 64 }, { mult: 2, width: 132 }],
    hazards: [
      { type: 'magnetic', anomalies: [{ atX: 0.5, radius: 760 }], magRate: 12 },
      { type: 'falseRadar', radarError: 1.4 },
    ],
    optionalObjective: { id: 'low-charge', text: 'Cross the anomaly and land under 40% charge', reward: { cores: 1 } },
    enemyBudget: 5, enemySets: ['sentry-turret', 'seeker-drone', 'mast-sniper'], fuelCells: 3,
  },
];

export const IO_MISSIONS = [
  {
    id: 'io-1', planet: 'IO', index: 1, name: 'THE CALDERA',
    brief: 'A sulphur plain inside an old crater. The engine runs hot here and heat costs you thrust, so short burns and long coasts. Nothing is shooting yet.',
    width: 3100, relief: 210, detail: 0.9, rough: 160, fuel: 111,
        // Named for its shape (the M26 rule), so its shape does not move.
    pinShape: true,
    terrain: { archetype: 'caldera' },
    pads: [{ mult: 3, width: 120 }, { mult: 2, width: 212 }],
    hazards: [{ type: 'heat', heatRise: 7, heatFall: 5 }],
    optionalObjective: { id: 'low-heat', text: 'Land with engine heat under 45%', reward: { salvage: 45 } },
    enemyBudget: 0,
  },
  {
    id: 'io-2', planet: 'IO', index: 2, name: 'THE VENTS',
    brief: 'Two lava fountains on the crossing. Each one swells before it fires, so it will tell you it is coming. Being above one when it does is the worst place on the map.',
    width: 3200, relief: 236, detail: 1.1, rough: 178, fuel: 106,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 4, width: 102 }, { mult: 3, width: 185 }],
    hazards: [
      { type: 'heat', heatRise: 7, heatFall: 5 },
      { type: 'eruption', vents: [{ atX: 0.4 }, { atX: 0.72 }], eruptPeriod: 10 },
    ],
    optionalObjective: { id: 'basalt-core', text: 'Recover a fresh basalt core', reward: { data: 40 } },
    enemyBudget: 2,
  },
  {
    id: 'io-3', planet: 'IO', index: 3, name: 'SULPHUR FLATS',
    brief: 'Wide open ground, which sounds easy until you count the guns standing on it. There is no cover out here and the engine will not let you hurry.',
    width: 3300, relief: 262, detail: 1.3, rough: 196, fuel: 101,
    terrain: { archetype: 'mesa' },
    pads: [{ mult: 4, width: 82 }, { mult: 3, width: 157 }],
    hazards: [
      { type: 'heat', heatRise: 8, heatFall: 5 },
      { type: 'eruption', vents: [{ atX: 0.58 }], eruptPeriod: 11 },
    ],
    optionalObjective: { id: 'low-heat', text: 'Land with engine heat under 45%', reward: { data: 45 } },
    enemyBudget: 4, fuelCells: 2,
  },
  {
    id: 'io-4', planet: 'IO', index: 4, name: 'FRESH GROUND',
    brief: 'This was flat a week ago. Now there is new rock over half of it and three fountains still building it. The safe pad has not moved. Everything around it has.',
    width: 3400, relief: 288, detail: 1.5, rough: 214, fuel: 96,
    terrain: { archetype: 'caldera' },
    pads: [{ mult: 6, width: 72 }, { mult: 2, width: 160 }],
    hazards: [
      { type: 'heat', heatRise: 8, heatFall: 4.5 },
      { type: 'eruption', vents: [{ atX: 0.33 }, { atX: 0.56 }, { atX: 0.8 }], eruptPeriod: 9 },
    ],
    optionalObjective: { id: 'no-hull', text: 'Bring the lander home undamaged', reward: { salvage: 75 } },
    enemyBudget: 4, enemySets: ['sentry-turret', 'seeker-drone', 'mast-sniper'], fuelCells: 2,
  },
  {
    id: 'io-5', planet: 'IO', index: 5, name: 'THE FOUNTAIN',
    brief: 'The pad is a shelf inside the biggest vent field on the moon, and four fountains ring it. They fire on different clocks. Learn all four before you go down, because you only get to be wrong once.',
    // **Io's set piece.** The roadmap wants a moving platform here and pads are
    // static geometry (still deferred, see ROADMAP_STATUS "Known findings"), so
    // the moving part is the *hazard* instead: four telegraphed fountains on
    // different periods around one pad. The timing problem is the same shape,
    // and it needs nothing structural.
    width: 3500, relief: 320, detail: 1.5, rough: 232, fuel: 91,
    terrain: { archetype: 'caldera' },
    pads: [{ mult: 6, width: 64 }, { mult: 2, width: 132 }],
    hazards: [
      { type: 'heat', heatRise: 9, heatFall: 4.5 },
      { type: 'eruption', eruptPeriod: 8, eruptDuty: 0.3, vents: [
        { atX: 0.28, offset: 0.0 }, { atX: 0.46, offset: 0.31 },
        { atX: 0.64, offset: 0.55 }, { atX: 0.82, offset: 0.78 },
      ] },
    ],
    optionalObjective: { id: 'perfect', text: 'Set down on the shelf at PERFECT', reward: { cores: 2 } },
    enemyBudget: 5, enemySets: ['sentry-turret', 'seeker-drone', 'mast-sniper'], fuelCells: 3,
  },
];

export const MERCURY_MISSIONS = [
  {
    id: 'mercury-1', planet: 'MERCURY', index: 1, name: 'THE HOT SIDE',
    brief: 'No air, real weight, and sunlight with nothing between it and you. The engine soaks up heat faster than it sheds it, and hot means weak. Burn in short pushes.',
    width: 3100, relief: 210, detail: 0.9, rough: 160, fuel: 117,
    terrain: { archetype: 'crater' },
    pads: [{ mult: 3, width: 120 }, { mult: 2, width: 212 }],
    hazards: [{ type: 'heat', heatRise: 7, heatFall: 5 }],
    optionalObjective: { id: 'low-heat', text: 'Land with engine heat under 45%', reward: { salvage: 45 } },
    enemyBudget: 0,
  },
  {
    id: 'mercury-2', planet: 'MERCURY', index: 2, name: 'THE SCARP',
    brief: 'A cliff that runs the whole length of the map, with the pad on a bench cut into it. The heavy part of the flight is the last hundred metres, and by then you will be hot.',
    width: 3200, relief: 236, detail: 1.1, rough: 178, fuel: 112,
        // Named for its shape (the M26 rule), so its shape does not move.
    pinShape: true,
    terrain: { archetype: 'ridge' },
    pads: [{ mult: 4, width: 102 }, { mult: 3, width: 185 }],
    hazards: [{ type: 'heat', heatRise: 8, heatFall: 5 }],
    optionalObjective: { id: 'sun-panel', text: 'Recover the array panel off the far bench', reward: { data: 40 } },
    enemyBudget: 3,
  },
  {
    id: 'mercury-3', planet: 'MERCURY', index: 3, name: 'COLD TRAP',
    brief: 'A crater floor the sun has never reached. It is the one place here where the engine cools properly, and there are guns on the rim watching the way in.',
    width: 3300, relief: 262, detail: 1.3, rough: 196, fuel: 107,
    terrain: { archetype: 'crater' },
    pads: [{ mult: 4, width: 82 }, { mult: 3, width: 157 }],
    hazards: [{ type: 'heat', heatRise: 7, heatFall: 7 }],
    optionalObjective: { id: 'fuel-25', text: 'Land with at least 25% fuel', reward: { data: 45 } },
    enemyBudget: 4, fuelCells: 2,
  },
  {
    id: 'mercury-4', planet: 'MERCURY', index: 4, name: 'THE RAMPARTS',
    brief: 'Old defensive ground, still occupied. Weight, heat and guns, and no weather to hide behind. Everything about this one is out in the open.',
    width: 3400, relief: 288, detail: 1.5, rough: 214, fuel: 102,
    terrain: { archetype: 'caldera' },
    pads: [{ mult: 6, width: 72 }, { mult: 2, width: 160 }],
    hazards: [{ type: 'heat', heatRise: 9, heatFall: 4.5 }],
    optionalObjective: { id: 'hull-10', text: 'Keep hull damage below 10%', reward: { cores: 1 } },
    enemyBudget: 4, enemySets: ['sentry-turret', 'mast-sniper'], fuelCells: 2,
  },
  {
    id: 'mercury-5', planet: 'MERCURY', index: 5, name: 'THE TERMINATOR',
    brief: 'The line between day and night runs across this map. Burn on the sunward half and the engine is finished before you arrive. The shadowed half is the long way round and it is the only way there is.',
    // **Mercury's set piece.** Heat is the body's whole idea, so the exam makes
    // it geography: a hot rise (`heatRise` 22 against 15-18) with a fall rate
    // low enough that continuous thrust cannot be afforded across the crossing.
    // The lander has to be paced rather than flown, which is what "engine heat
    // is the real fuel gauge" has claimed since M5 and could not mean until the
    // `thermal` builder had a producer.
    width: 3500, relief: 300, detail: 1.5, rough: 232, fuel: 97,
    terrain: { archetype: 'ridge' },
    pads: [{ mult: 6, width: 64 }, { mult: 2, width: 132 }],
    hazards: [{ type: 'heat', heatRise: 11, heatFall: 4, heatBite: 55 }],
    optionalObjective: { id: 'low-heat', text: 'Reach the pad with engine heat under 45%', reward: { cores: 2 } },
    enemyBudget: 5, enemySets: ['sentry-turret', 'mast-sniper'], fuelCells: 3,
  },
];

export const PLUTO_MISSIONS = [
  {
    id: 'pluto-1', planet: 'PLUTO', index: 1, name: 'NIGHT SIDE',
    brief: 'It is dark out here and the sun is a bright star. You can see the pad lights and not much else. The cold gets into the attitude thrusters, so they answer late once it has.',
    width: 3100, relief: 210, detail: 0.9, rough: 160, fuel: 101,
    terrain: { archetype: 'basin' },
    pads: [{ mult: 3, width: 120 }, { mult: 2, width: 212 }],
    hazards: [{ type: 'cold', coldRate: 1.6 }, { type: 'darkness', darkness: 0.62 }],
    optionalObjective: { id: 'cold-hands', text: 'Land with cold soak under 55%', reward: { salvage: 45 } },
    enemyBudget: 0,
  },
  {
    id: 'pluto-2', planet: 'PLUTO', index: 2, name: 'THE NITROGEN PLAIN',
    brief: 'Flat, frozen and enormous. The ice takes almost nothing off your speed, so pick your stopping point early. Burning warms the lander, which is the one good reason to spend fuel here.',
    width: 3200, relief: 236, detail: 1.1, rough: 178, fuel: 96,
    terrain: { archetype: 'basin' },
    pads: [{ mult: 4, width: 102 }, { mult: 3, width: 185 }],
    hazards: [{ type: 'cold', coldRate: 1.8 }, { type: 'darkness', darkness: 0.68 }],
    optionalObjective: { id: 'ice-drill', text: 'Recover the drill left out on the plain', reward: { data: 40 } },
    enemyBudget: 3,
  },
  {
    id: 'pluto-3', planet: 'PLUTO', index: 3, name: 'THE BLADES',
    brief: 'Standing ridges of methane ice, taller than the lander and sharp at the top. In this light you will see them late. Fly high across, then come down where you know the ground is flat.',
    width: 3300, relief: 280, detail: 1.3, rough: 196, fuel: 91,
    terrain: { archetype: 'ridge' },
    pads: [{ mult: 4, width: 82 }, { mult: 3, width: 157 }],
    hazards: [{ type: 'cold', coldRate: 2.0 }, { type: 'darkness', darkness: 0.72 }],
    optionalObjective: { id: 'no-hull', text: 'Bring the lander home undamaged', reward: { data: 50 } },
    enemyBudget: 4, fuelCells: 2,
  },
  {
    id: 'pluto-4', planet: 'PLUTO', index: 4, name: 'UNDER THE PLAIN',
    brief: 'A tube in the ice with the pad at the bottom of it. The mouth is open sky and the roof is closed by the time you are over the pad. Cold, dark and one way in.',
    // **Pluto's set piece**, and the only cave outside Europa. It is a
    // deliberate pairing: M19b's per-mission mouth plus M29's darkness make a
    // corridor you fly into and then cannot see out of, which no other body can
    // produce. The budget is **2**, not the ramp's 4, for the structural reason
    // M21 measured on `europa-2` and `europa-4`: a single-pad cave has one way
    // in, so the sanctuary *is* the prize and there is no route around a
    // machine. That measurement is why this mission is not simply "a cave with
    // the usual number of guns in it".
    width: 3400, relief: 300, detail: 1.4, rough: 214, fuel: 90,
    terrain: { archetype: 'canyon' }, cave: true, clearance: 300,
    caveMouth: 0.16, caveShut: 0.62,
    pads: [{ mult: 6, width: 96 }],
    hazards: [{ type: 'cold', coldRate: 2.2 }, { type: 'darkness', darkness: 0.8 }],
    optionalObjective: { id: 'cold-hands', text: 'Come back up with cold soak under 55%', reward: { cores: 1 } },
    enemyBudget: 2, fuelCells: 2,
  },
  {
    id: 'pluto-5', planet: 'PLUTO', index: 5, name: 'THE LAST LIGHT',
    brief: 'The darkest ground in the system, and the pad is a terrace on the far side of it. By the time you get there the thrusters will be slow and so will you. Commit early, while the lander is still warm.',
    width: 3500, relief: 300, detail: 1.5, rough: 232, fuel: 86,
    terrain: { archetype: 'mesa' },
    pads: [{ mult: 6, width: 64 }, { mult: 2, width: 132 }],
    hazards: [{ type: 'cold', coldRate: 2.5 }, { type: 'darkness', darkness: 0.86 }],
    optionalObjective: { id: 'quick', text: 'Cross and land in under a minute', reward: { cores: 2 } },
    enemyBudget: 4, enemySets: ['sentry-turret', 'mast-sniper'], fuelCells: 3,
  },
];

export const VENUS_MISSIONS = [
  {
    id: 'venus-1', planet: 'VENUS', index: 1, name: 'THE DEEP AIR',
    brief: 'The heaviest gravity and the thickest air in the game, at the same time. Everything you ask for arrives late and then keeps happening. Start each correction earlier than feels right.',
    width: 3100, relief: 210, detail: 0.9, rough: 160, fuel: 218,
    terrain: { archetype: 'mesa' },
    pads: [{ mult: 3, width: 120 }, { mult: 2, width: 212 }],
    hazards: ['drag', { type: 'acid', acidRate: 1.1 },
      { type: 'dust', period: 14, minVisibility: 0.6, duty: 0.5 }],
    optionalObjective: { id: 'low-acid', text: 'Land with corrosion under 50%', reward: { salvage: 50 } },
    enemyBudget: 0,
  },
  {
    id: 'venus-2', planet: 'VENUS', index: 2, name: 'THE SOUR LOW',
    brief: 'The air near the ground eats the hull, and it is twice as bad on the deck as it is up high. Stay high while you cross and spend as little time low as the landing allows.',
    width: 3200, relief: 236, detail: 1.1, rough: 178, fuel: 213,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 4, width: 102 }, { mult: 3, width: 185 }],
    hazards: ['drag', { type: 'acid', acidRate: 1.5 },
      { type: 'dust', period: 12, minVisibility: 0.5, duty: 0.55 }],
    optionalObjective: { id: 'crush-probe', text: 'Recover the probe that stopped transmitting', reward: { data: 45 } },
    enemyBudget: 3,
  },
  {
    id: 'venus-3', planet: 'VENUS', index: 3, name: 'THE SINK',
    brief: 'Columns of falling air over the middle of the crossing. They come and go on a cycle and they will push you into the ground if you are slow underneath one. Cross between them.',
    width: 3300, relief: 262, detail: 1.3, rough: 196, fuel: 208,
    terrain: { archetype: 'ridge' },
    pads: [{ mult: 4, width: 82 }, { mult: 3, width: 157 }],
    hazards: ['drag', { type: 'acid', acidRate: 1.3 },
      { type: 'downdraft', columns: [0.42, 0.66], downForce: 58 },
      { type: 'dust', period: 13, minVisibility: 0.52, duty: 0.5 }],
    optionalObjective: { id: 'hull-10', text: 'Keep hull damage below 10%', reward: { data: 50 } },
    enemyBudget: 4, fuelCells: 2,
  },
  {
    id: 'venus-4', planet: 'VENUS', index: 4, name: 'THE HIGHLANDS',
    brief: 'High ground, which is the only mercy this planet offers, and guns on it because it is the only mercy this planet offers. Thick storms in between.',
    width: 3400, relief: 288, detail: 1.5, rough: 214, fuel: 203,
        // Named for its shape (the M26 rule), so its shape does not move.
    pinShape: true,
    terrain: { archetype: 'mesa' },
    pads: [{ mult: 6, width: 72 }, { mult: 2, width: 160 }],
    hazards: ['drag', { type: 'acid', acidRate: 1.5 },
      { type: 'downdraft', columns: [0.36, 0.72], downForce: 60 },
      { type: 'dust', period: 11, minVisibility: 0.42, duty: 0.55 }],
    optionalObjective: { id: 'low-acid', text: 'Land with corrosion under 50%', reward: { cores: 1 } },
    enemyBudget: 5, enemySets: ['sentry-turret', 'mast-sniper'], fuelCells: 2,
  },
  {
    id: 'venus-5', planet: 'VENUS', index: 5, name: 'THE DESCENT',
    brief: 'Three sinking columns between you and the last pad in the system, and acid in the air the whole way down. There is no clever line through this one. There is only flying it well.',
    // **Venus' set piece, and the last mission of the ladder.** Its three
    // hazards finally exist and this is where they are asked for together:
    // three downdraft columns on staggered clocks over the approach, corrosion
    // that punishes the low, slow answer to them, and the deepest storm on the
    // body. The columns are on `offset`s that do not divide evenly, so there is
    // no beat to memorise - the same reasoning as the dust squall's hashed slot.
    width: 3500, relief: 320, detail: 1.5, rough: 232, fuel: 198,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 6, width: 64 }, { mult: 2, width: 132 }],
    hazards: ['drag', { type: 'acid', acidRate: 1.8 },
      { type: 'downdraft', downForce: 64, downPeriod: 10, columns: [
        { atX: 0.34, offset: 0.0 }, { atX: 0.56, offset: 0.37 }, { atX: 0.78, offset: 0.69 },
      ] },
      { type: 'dust', period: 11, minVisibility: 0.34, duty: 0.6, squallChance: 0.35 }],
    optionalObjective: { id: 'perfect', text: 'Set down at PERFECT on the last pad in the system', reward: { cores: 3 } },
    enemyBudget: 5, enemySets: ['sentry-turret', 'mast-sniper'], fuelCells: 3,
  },
];

export const TITAN_LEVELS = TITAN_MISSIONS.map(missionToLevel);
export const ENCELADUS_LEVELS = ENCELADUS_MISSIONS.map(missionToLevel);
export const GANYMEDE_LEVELS = GANYMEDE_MISSIONS.map(missionToLevel);
export const IO_LEVELS = IO_MISSIONS.map(missionToLevel);
export const MERCURY_LEVELS = MERCURY_MISSIONS.map(missionToLevel);
export const PLUTO_LEVELS = PLUTO_MISSIONS.map(missionToLevel);
export const VENUS_LEVELS = VENUS_MISSIONS.map(missionToLevel);


/**
 * The chapter for a body. Accepts a planet id ('LUNA'); a chapter id ('moon') is
 * tolerated so older saves and links keep working.
 *
 * **There is no generated fallback any more.** `generateChapter` produced a
 * five-mission survey chapter for any body without authored content, and it did
 * its job: it is what let the ladder grow from three bodies to ten in M27
 * without ten chapters having to exist first. M29 authored all ten, which left
 * it reachable by nothing a player flies, and Tom's call is to delete it rather
 * than keep a tested path nobody takes.
 *
 * What the fallback was really providing was an **invariant** - every body on
 * the ladder has something to fly - and deleting it without replacing that is
 * how a body added to `PLANETS` later becomes a blank screen. So the invariant
 * moved from a fallback to two things that fail loudly instead: this function
 * throws with the body named, and `route-tests.js` asserts that every id in
 * `PLANET_ORDER` has an authored chapter. A missing chapter is now a failing
 * test at build time rather than a generated one at run time.
 */

/**
 * Which missions keep their silhouette, and why (M26).
 *
 * Two reasons, both content:
 *  - the mission is **named for its shape** - THE CRATER, THE TRENCH, THE
 *    CANYON, THE CREVASSE. Reshuffling those makes the name lie.
 *  - the mission is a **cave**. The roof is dropped over a corridor, and the
 *    corridor is a canyon; putting that roof over dunes is not a variation, it
 *    is a geometry the validator has never checked.
 */
function shapeIsPinned(mission) {
  return !!mission.pinShape || !!mission.cave;
}

/**
 * Deal fresh macro shapes to a chapter's unpinned missions, from the body's own
 * palette, deterministically from the run seed.
 *
 * Tom played several runs and said the Moon had stopped feeling random. He was
 * right, and it was not a bug: the authored missions hardcode an archetype
 * each, so moon-1 was a crater in every run that has ever been played. It only
 * became obvious once M25 made the campaign a fixed ladder - before that you
 * routed to different bodies, and now you replay these same fifteen maps every
 * single run. `generateChapter` had been dealing shapes from the palette since
 * M9; the authored chapters, the only ones on the ladder, never did.
 *
 * The bag is dealt without replacement so one chapter spreads across the
 * palette rather than handing out three calderas, and refills when a body has
 * fewer shapes than unpinned missions (Mars has four of each).
 *
 * Difficulty does not move: the ramp lives in pad width, pad multiplier, fuel
 * and enemy budget, all authored per mission and none of them a function of the
 * silhouette.
 */
export function shapedMissions(missions, planetId, seed = 1) {
  const planet = PLANETS[planetId];
  const palette = (planet && planet.terrainPalette) || [];
  if (palette.length < 2) return missions;
  const rng = makeRng(((seed ^ 0x9e3779b9) >>> 0) + String(planetId).length * 7919);
  // Warm the generator. mulberry32's *first* output correlates across nearby
  // seeds, and a two-item pool rides entirely on that first value: Europa dealt
  // an identical chapter on every seed tried until these four draws were
  // discarded. Anything reading only one or two numbers from a fresh mulberry32
  // wants this.
  for (let i = 0; i < 4; i++) rng();
  // Deal from the palette *minus* whatever the pinned missions are already
  // using. Dealing from the whole palette looked more varied per slot and read
  // worse in the hand: Europa's palette is three deep and both of its caves are
  // pinned canyons, so a chapter came out basin/canyon/mesa/canyon/canyon -
  // three canyons in five, which is a duller run than the fixed shapes it
  // replaced. Luna doubled its craters for the same reason.
  // The pool is the body's palette *plus* whatever its authored missions
  // already stand on. Those are not the same set and it matters: Europa's
  // palette is basin/canyon/mesa, but THE FLOES is a caldera and RADIATION PASS
  // was authored as a ridge - so dealing from the palette alone would have
  // quietly retired two shapes the body demonstrably wears. (Europa's double
  // ridges are the most recognisable thing about the real moon, which is a good
  // sign the content was right and the palette was short.)
  const authoredShapes = missions.map((m) => m.terrain && m.terrain.archetype).filter(Boolean);
  const wardrobe = [...new Set([...palette, ...authoredShapes])];
  const taken = new Set(missions.filter(shapeIsPinned).map((m) => m.terrain.archetype));
  const source = wardrobe.filter((a) => !taken.has(a));
  const pool = source.length ? source : wardrobe;
  let bag = [];
  const draw = () => {
    if (!bag.length) {
      bag = [...pool];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = rng.int(0, i);
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop();
  };
  return missions.map((m) => (shapeIsPinned(m)
    ? m
    : { ...m, terrain: { ...m.terrain, archetype: draw() } }));
}

export function chapterFor(planetId, seed = 1) {
  const id = String(planetId);
  const authored = Object.values(CHAPTERS).find(
    (c) => c.planet === id || c.id === id.toLowerCase(),
  );
  // M26: an authored chapter is rebuilt per run so its unpinned missions get
  // fresh silhouettes. The module-level MOON_LEVELS / MARS_LEVELS /
  // EUROPA_LEVELS stay exactly as authored - both fixtures and every sweep
  // regress against those, and they must not move.
  if (authored) {
    return {
      ...authored,
      levels: shapedMissions(authored.missions, authored.planet, seed).map(missionToLevel),
    };
  }
  if (!PLANETS[id]) throw new Error(`chapterFor: no such planet ${id}`);
  throw new Error(
    `chapterFor: ${id} has no authored chapter. Every body on PLANET_ORDER needs `
    + `one in CHAPTERS - there is no generated fallback since M29.`,
  );
}

/**
 * The most machines any one mission of this body's chapter fields. It is what
 * the route card's "resistance" line reads, and it is measured off the chapter
 * rather than inferred from a difficulty table - because inferring it is what
 * made six of the ten M27 cards print the same forecast.
 *
 * It took a `sector` until M29 deleted `generateChapter`, because a survey
 * chapter derived its budgets from the sector's depth term. Every budget is
 * authored now, so the figure depends on the body alone - and that is the
 * better answer anyway: on a fixed ladder a body is always flown at the same
 * rung, so a budget that varied with the sector was describing a situation the
 * player could never be in.
 */
export function peakMachines(planetId) {
  const ch = chapterFor(planetId, 1);
  return (ch.levels || []).reduce((m, l) => Math.max(m, l.enemyBudget || 0), 0);
}

/** Display name for a body, whichever id form is to hand. */
export function chapterTitle(planetId) {
  const id = String(planetId);
  const authored = Object.values(CHAPTERS).find((c) => c.planet === id || c.id === id.toLowerCase());
  if (authored) return authored.title;
  return PLANETS[id] ? PLANETS[id].displayName : id;
}

/**
 * Every chapter, keyed by the short id older saves and links use.
 *
 * **All ten bodies are authored since M29.** `generateChapter` is therefore no
 * longer reached by anything a player flies - `chapterFor` finds an authored
 * chapter for every id in `PLANETS`. It is kept rather than deleted because it
 * is what makes `chapterFor` total: a body added to `PLANETS` without content
 * still produces a playable, validated chapter instead of throwing, which is
 * the property that let the ladder grow from three bodies to ten in the first
 * place. It stays covered by `objectives-tests.js` and by the survey block in
 * `validate-missions.js`, so it cannot rot into something that would fail if it
 * were ever needed. Whether that is worth keeping is Tom's call, and it is
 * flagged rather than taken.
 */
export const CHAPTERS = {
  moon: { id: 'moon', planet: 'LUNA', title: 'THE MOON', levels: MOON_LEVELS, missions: MOON_MISSIONS },
  europa: { id: 'europa', planet: 'EUROPA', title: 'EUROPA', levels: EUROPA_LEVELS, missions: EUROPA_MISSIONS },
  titan: { id: 'titan', planet: 'TITAN', title: 'TITAN', levels: TITAN_LEVELS, missions: TITAN_MISSIONS },
  mars: { id: 'mars', planet: 'MARS', title: 'MARS', levels: MARS_LEVELS, missions: MARS_MISSIONS },
  enceladus: { id: 'enceladus', planet: 'ENCELADUS', title: 'ENCELADUS', levels: ENCELADUS_LEVELS, missions: ENCELADUS_MISSIONS },
  ganymede: { id: 'ganymede', planet: 'GANYMEDE', title: 'GANYMEDE', levels: GANYMEDE_LEVELS, missions: GANYMEDE_MISSIONS },
  io: { id: 'io', planet: 'IO', title: 'IO', levels: IO_LEVELS, missions: IO_MISSIONS },
  mercury: { id: 'mercury', planet: 'MERCURY', title: 'MERCURY', levels: MERCURY_LEVELS, missions: MERCURY_MISSIONS },
  pluto: { id: 'pluto', planet: 'PLUTO', title: 'PLUTO', levels: PLUTO_LEVELS, missions: PLUTO_MISSIONS },
  venus: { id: 'venus', planet: 'VENUS', title: 'VENUS', levels: VENUS_LEVELS, missions: VENUS_MISSIONS },
};
