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
import { VALIDATION } from './validate.js';
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
    enemyBudget: 4, enemySets: ['sentry-turret', 'seeker-drone'], fuelCells: 2,
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

const SURVEY_NAMES = [
  ['FIRST LOOK', 'Nobody has landed here. The map always costs less than the ground does.'],
  ['LOW PASS', 'Second landing, tighter ground. The forecast was optimistic.'],
  ['DEEP FIELD', 'Further in, where the terrain stops being scenery.'],
  ['THE SHELF', 'A narrow ledge, and good reasons not to be standing on it.'],
  ['LAST LIGHT', 'The one that asks for everything this world does, all at once.'],
];

/**
 * A five-mission chapter generated from a PlanetDefinition, for bodies with no
 * authored missions yet. Same shape, same systems, same validator - the route
 * screen would be a lie if half the cards led nowhere.
 */
export function generateChapter(planetId, seed = 1, sector = 1) {
  const planet = PLANETS[planetId];
  const rng = makeRng(((seed ^ 0x5bf03635) + planetId.length * 7919) >>> 0);
  const gravity = gravityFor(planetId);
  const palette = planet.terrainPalette;
  // **The floor under the deep pad**, and the reason it is read from the
  // validator rather than written here: the two must agree or the generator
  // produces missions its own checker rejects, which is exactly what happened.
  //
  // The prize pad narrows with the mission and again with the sector's depth,
  // and at depth 2 - sector 5 and beyond - mission 5 asked for 50 px against a
  // 56 px stance. M25's three-body ladder never reached sector 5, and this
  // sweep only ever ran sectors 1 and 3, so the last five bodies of the M27
  // ladder each generated one impossible mission and nothing said so.
  //
  // The margin is a terrain cell: a pad is carved to whole cells (~7 px), so a
  // request of exactly the minimum quantises *down* through it. Measured: 60
  // requested carves to 54.7, 62 carves to 61.5. Read inside the function, not
  // at module load - a module-level read of an imported config is the M15 trip
  // hazard that throws "cannot access before initialization" in the bundle.
  const minDeepPad = VALIDATION.minPadWidth + 8;

  const missions = SURVEY_NAMES.map(([name, brief], i) => {
    const step = i / 4;                       // 0 at mission 1, 1 at mission 5
    const depth = Math.min(2, (sector - 1) * 0.5);
    const archetype = palette[(i + rng.int(0, palette.length - 1)) % palette.length];
    const padWidth = Math.round(200 - 110 * step - depth * 14);
    const mult = i >= 3 ? 5 : i >= 1 ? 3 : 2;
    // Fuel has to pay for three things: hovering against gravity for the length
    // of the flight, fighting the atmosphere, and the hazards. Ignoring the
    // atmosphere term made every Titan survey run the tank dry.
    const fuel = Math.round(
      80 + gravity * 0.9 + (planet.drag || 0) * 180 + Math.abs(planet.wind || 0) * 0.35
      + planet.hazards.length * 6 - i * 5 - depth * 4,
    );
    return {
      id: `${planetId.toLowerCase()}-s${sector}-${i + 1}`,
      planet: planetId, index: i + 1,
      name: `${name}`,
      brief,
      width: 2800 + i * 100 + Math.round(depth * 150),
      relief: 200 + i * 26 + Math.round(depth * 30),
      detail: 0.9 + i * 0.18,
      rough: 160 + i * 18,
      fuel,
      terrain: { archetype },
      // Pads are authored prize-first: index 0 is the deep one - narrower,
      // richer, and past the fuel road - and the last is the wide near zone
      // that always gets you home.
      // The deep pad tightens with the mission and the sector, but never below
      // what the lander can stand on. Past that floor the difficulty has to
      // come from somewhere else - the same lesson as the enemy budgets, where
      // a number past the map's capacity is fiction rather than difficulty.
      pads: i >= 3
        ? [{ mult: mult + 1, width: Math.max(minDeepPad, Math.round(padWidth * 0.8)) }, { mult: 2, width: padWidth + 70 }]
        : [{ mult: mult + 1, width: Math.max(minDeepPad, Math.round(padWidth * 0.7)) }, { mult, width: padWidth + 40 }],
      hazards: planet.hazards.length ? undefined : [],   // undefined = inherit the planet's
      fuelCells: i >= 2 ? 2 : 0,
      // The same ramp the authored chapters use (M15): the first mission of a
      // chapter is always quiet, and the rest climb. Depth makes a later sector
      // harder but can never arm mission one - "somewhere to learn the body"
      // has to survive the difficulty curve.
      enemyBudget: planet.eligibleEnemySets.length && i > 0
        ? Math.min(3, [0, 1, 2, 2, 3][i] + Math.floor(depth))
        : 0,
      enemySets: planet.eligibleEnemySets,
      optionalObjective: null,
      procedural: true,
    };
  });

  return {
    id: `${planetId.toLowerCase()}-s${sector}`,
    planet: planetId,
    title: planet.displayName,
    procedural: true,
    levels: missions.map(missionToLevel),
  };
}

/**
 * The chapter for a body: authored where one exists, generated otherwise.
 * Accepts a planet id ('LUNA'); a chapter id ('moon') is tolerated so older
 * saves and links keep working.
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

export function chapterFor(planetId, seed = 1, sector = 1) {
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
  return generateChapter(id, seed, sector);
}

/**
 * The most machines any one mission of this body's chapter fields, at this
 * sector. It is what the route card's "resistance" line reads, and it is
 * measured off the chapter rather than inferred from a difficulty table -
 * because inferring it is what made six of the ten M27 cards print the same
 * forecast. Enemy budgets are authored (or, for a survey chapter, derived from
 * the sector), so this is seed-independent and cheap enough to call per render.
 */
export function peakMachines(planetId, sector = 1) {
  const ch = chapterFor(planetId, 1, sector);
  return (ch.levels || []).reduce((m, l) => Math.max(m, l.enemyBudget || 0), 0);
}

/** Display name for a body, whichever id form is to hand. */
export function chapterTitle(planetId) {
  const id = String(planetId);
  const authored = Object.values(CHAPTERS).find((c) => c.planet === id || c.id === id.toLowerCase());
  if (authored) return authored.title;
  return PLANETS[id] ? PLANETS[id].displayName : id;
}

export const CHAPTERS = {
  moon: { id: 'moon', planet: 'LUNA', title: 'THE MOON', levels: MOON_LEVELS, missions: MOON_MISSIONS },
  mars: { id: 'mars', planet: 'MARS', title: 'MARS', levels: MARS_LEVELS, missions: MARS_MISSIONS },
  europa: { id: 'europa', planet: 'EUROPA', title: 'EUROPA', levels: EUROPA_LEVELS, missions: EUROPA_MISSIONS },
};
