// Authored missions (roadmap section 6). Data only: a MissionDefinition names
// a planet, a terrain archetype and its landing zones, and the engine turns it
// into the level config the generator already understands.
//
// Fields that later milestones consume (enemyBudget, optionalObjective) are
// carried now so the content does not need rewriting when those land.
//
// **Enemy budgets follow one ramp**, set in M15 after the encounter audit found
// nine of fifteen missions with nothing hostile on them at all: mission 1 of a
// chapter is always quiet, and 2-5 climb 1, 1-2, 2, 2-3. That stays inside the
// spec's "1-3 at once, rarely 4" rule while making the empty two thirds of the
// game the exception rather than the default.
//
// **Pads are authored prize-first.** Index 0 is placed in the deepest distance
// band - the far end of the map, past the fuel road, worth the most material -
// and the last pad is the near zone that can always be reached on the starting
// tank. The terrain places them by that order, so swapping two entries in a
// `pads` array moves them across the map.

import { PLANETS, gravityFor } from './planets.js';
import { makeRng } from './util.js';

export const MOON_MISSIONS = [
  {
    id: 'moon-1', planet: 'LUNA', index: 1, name: 'THE CRATER',
    brief: 'A wide bowl with the pad on a shelf inside it. You cannot just drop in. Carry your speed across the bowl, then set down flat.',
    width: 2700, relief: 250, detail: 1.0, rough: 150, fuel: 124,
    terrain: { archetype: 'crater' },
    pads: [{ mult: 3, width: 130 }, { mult: 2, width: 200 }],
    optionalObjective: { id: 'sample-titanium', text: 'Recover a titanium-rich sample', reward: { data: 20 } },
    enemyBudget: 0,
  },
  {
    id: 'moon-2', planet: 'LUNA', index: 2, name: 'THE TRENCH',
    brief: 'A deep channel with the pad on the floor, tucked under a cliff. Kill your sideways drift early. Down here a late correction costs more than you have.',
    width: 2900, relief: 300, detail: 1.6, rough: 170, fuel: 116,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 3, width: 120 }],
    optionalObjective: { id: 'fuel-25', text: 'Land with at least 25% fuel', reward: { salvage: 40 } },
    enemyBudget: 1,
  },
  {
    id: 'moon-3', planet: 'LUNA', index: 3, name: 'THE RELAY',
    brief: 'Broken ridges, and a landing platform cut into the side of one. Telemetry drops in and out this far around, so fly what you can see.',
    width: 3000, relief: 290, detail: 1.2, rough: 200, fuel: 112,
    terrain: { archetype: 'ridge' },
    pads: [{ mult: 3, width: 110 }, { mult: 2, width: 180 }],
    optionalObjective: { id: 'power-relay', text: 'Power the relay for extra research data', reward: { data: 35 } },
    enemyBudget: 1,
  },
  {
    id: 'moon-4', planet: 'LUNA', index: 4, name: 'OLD BATTERY',
    brief: 'A crater rim covered in wreckage. Two security guns still track anything that moves. They are slow, and you can fly around them.',
    width: 3100, relief: 280, detail: 1.8, rough: 210, fuel: 108,
    terrain: { archetype: 'mesa' },
    pads: [{ mult: 3, width: 110 }, { mult: 2, width: 170 }],
    optionalObjective: { id: 'no-ability', text: 'Complete without using the active ability', reward: { cores: 1 } },
    enemyBudget: 2, enemySets: ['sentry-turret'],
  },
  {
    id: 'moon-5', planet: 'LUNA', index: 5, name: 'TYCHO',
    brief: 'Tall walls, a peak in the middle, and a terrace barely wider than your legs. Everything the Moon has taught you, with fuel for one attempt.',
    width: 3200, relief: 320, detail: 1.4, rough: 230, fuel: 104,
    terrain: { archetype: 'caldera' },
    pads: [{ mult: 5, width: 78 }, { mult: 2, width: 170 }],
    optionalObjective: { id: 'centre', text: 'Touch down inside the central bonus area', reward: { cores: 1 } },
    enemyBudget: 2, enemySets: ['sentry-turret'],
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
    height: 1400,
    groundBase: 300,
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
    fuelCells: mission.fuelCells || 0,

    terrain: {
      archetype: mission.terrain.archetype,
      relief: mission.relief,
      detail: mission.detail,
    },
    pads: mission.pads,

    optionalObjective: mission.optionalObjective || null,
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
    hazards: ['atmosphere', { type: 'dust', period: 22, minVisibility: 0.55, duty: 0.35 }],
    optionalObjective: { id: 'fuel-25', text: 'Land with at least 25% fuel', reward: { salvage: 45 } },
    enemyBudget: 0,
  },
  {
    id: 'mars-2', planet: 'MARS', index: 2, name: 'THE CANYON',
    brief: 'The wind here stacks in layers, and each layer runs the other way. Drop through them one at a time. Go straight down and it will throw you into a wall.',
    width: 3100, relief: 300, detail: 1.4, rough: 200, fuel: 132,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 3, width: 130 }],
    hazards: [{ type: 'windChannels', bandHeight: 190, strength: 44 }],
    optionalObjective: { id: 'hull-10', text: 'Keep hull damage below 10%', reward: { data: 30 } },
    enemyBudget: 1, enemySets: ['sentry-turret'],
  },
  {
    id: 'mars-3', planet: 'MARS', index: 3, name: 'BURIED ARRAY',
    brief: 'Dune country, with a sensor array half swallowed by it. The dust comes in hard and often, so learn the ground while you can still see it.',
    width: 3200, relief: 230, detail: 1.8, rough: 210, fuel: 128,
    terrain: { archetype: 'dunes' },
    pads: [{ mult: 3, width: 130 }, { mult: 2, width: 180 }],
    hazards: ['atmosphere', { type: 'dust', period: 13, minVisibility: 0.32, duty: 0.5 }],
    optionalObjective: { id: 'power-array', text: 'Restore a sensor tower for a stronger beacon', reward: { data: 40 } },
    enemyBudget: 2, enemySets: ['sentry-turret', 'seeker-drone'], fuelCells: 2,
  },
  {
    id: 'mars-4', planet: 'MARS', index: 4, name: 'IRON RAIN',
    brief: 'Iron mesas, old ground guns, a drone still flying its patrol, and salvage sitting exactly where the safe route is not. The wind does not care that you are being shot at.',
    width: 3300, relief: 290, detail: 1.6, rough: 230, fuel: 124,
    terrain: { archetype: 'mesa' },
    pads: [{ mult: 3, width: 115 }, { mult: 2, width: 175 }],
    hazards: ['atmosphere', { type: 'dust', period: 18, minVisibility: 0.5, duty: 0.3 }],
    optionalObjective: { id: 'salvage-iron', text: 'Recover the iron-ceramic salvage off the safe route', reward: { salvage: 70 } },
    enemyBudget: 2, enemySets: ['sentry-turret', 'seeker-drone'], fuelCells: 2,
  },
  {
    id: 'mars-5', planet: 'MARS', index: 5, name: 'STORM EYE',
    brief: 'A storm walks the crater on a cycle. The pad is on the mesa in the middle and you will only see it in the gaps. Something is still flying in there. Learn the ground, then commit.',
    width: 3400, relief: 320, detail: 1.5, rough: 240, fuel: 120,
    terrain: { archetype: 'caldera' },
    pads: [{ mult: 5, width: 84 }, { mult: 2, width: 175 }],
    hazards: ['atmosphere', { type: 'dust', period: 11, minVisibility: 0.22, duty: 0.55 }],
    optionalObjective: { id: 'centre', text: 'Touch down inside the central bonus area', reward: { cores: 1 } },
    enemyBudget: 3, enemySets: ['seeker-drone', 'sentry-turret'], fuelCells: 3,
  },
];

export const MARS_LEVELS = MARS_MISSIONS.map(missionToLevel);

export const EUROPA_MISSIONS = [
  {
    id: 'europa-1', planet: 'EUROPA', index: 1, name: 'GLASS',
    brief: 'Smooth ice, and almost nothing to hold you. Touching down is only half the landing here. You will keep moving after the legs are down, so arrive slow and arrive straight.',
    width: 2900, relief: 200, detail: 0.8, rough: 150, fuel: 122,
    terrain: { archetype: 'basin' },
    pads: [{ mult: 3, width: 130 }, { mult: 2, width: 200 }],
    optionalObjective: { id: 'centre', text: 'Come to rest inside the central bonus area', reward: { data: 30 } },
    enemyBudget: 0,
  },
  {
    id: 'europa-2', planet: 'EUROPA', index: 2, name: 'THE CREVASSE',
    brief: 'The pad is a bridge of ice over a crack you cannot see the bottom of. Come in gently. There is nothing under it if you do not.',
    width: 3000, relief: 300, detail: 1.2, rough: 190, fuel: 118,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 5, width: 120, fragile: 16 }],
    optionalObjective: { id: 'core-ice', text: 'Recover an ice core from the crevasse floor', reward: { data: 40 } },
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
    enemyBudget: 2, fuelCells: 2,
  },
  {
    id: 'europa-4', planet: 'EUROPA', index: 4, name: 'UNDER THE ICE',
    brief: 'A cracked shelf with something buried under it, and something buried in it that wakes up when you pass. The corridor is tight and the ceiling is ice. Neither forgives a fast approach.',
    width: 3200, relief: 260, detail: 1.6, rough: 200, fuel: 126,
    terrain: { archetype: 'canyon' }, cave: true, clearance: 290,
    pads: [{ mult: 3, width: 130 }],
    hazards: [{ type: 'radiation', period: 18, duty: 0.35, rate: 11 }],
    optionalObjective: { id: 'probe-lost', text: 'Recover the probe that went quiet under the shelf', reward: { salvage: 80 } },
    enemyBudget: 2, enemySets: ['seeker-drone'], fuelCells: 2,
  },
  {
    id: 'europa-5', planet: 'EUROPA', index: 5, name: 'THE FLOES',
    brief: 'Separated plates of ice, one of them worth landing on, and Jupiter overhead. Everything Europa has taught you, on ground that will not hold a mistake.',
    width: 3300, relief: 300, detail: 1.5, rough: 230, fuel: 124,
    terrain: { archetype: 'caldera' },
    pads: [{ mult: 5, width: 96, fragile: 14 }, { mult: 2, width: 180 }],
    hazards: [{ type: 'radiation', period: 13, duty: 0.5, rate: 14 }],
    optionalObjective: { id: 'perfect', text: 'Set down on the plate without cracking it', reward: { cores: 2 } },
    // Two, not the three the ramp allows: Europa's drones ram, the plate is
    // fragile, and at three an unarmed flight to the prize fell from 20/20 to
    // 5/20. The ramp is a shape, not a quota.
    enemyBudget: 2, enemySets: ['seeker-drone'], fuelCells: 3,
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
      pads: i >= 3
        ? [{ mult: mult + 1, width: Math.round(padWidth * 0.8) }, { mult: 2, width: padWidth + 70 }]
        : [{ mult: mult + 1, width: Math.round(padWidth * 0.7) }, { mult, width: padWidth + 40 }],
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
export function chapterFor(planetId, seed = 1, sector = 1) {
  const id = String(planetId);
  const authored = Object.values(CHAPTERS).find(
    (c) => c.planet === id || c.id === id.toLowerCase(),
  );
  if (authored) return authored;
  if (!PLANETS[id]) throw new Error(`chapterFor: no such planet ${id}`);
  return generateChapter(id, seed, sector);
}

/** Display name for a body, whichever id form is to hand. */
export function chapterTitle(planetId) {
  const id = String(planetId);
  const authored = Object.values(CHAPTERS).find((c) => c.planet === id || c.id === id.toLowerCase());
  if (authored) return authored.title;
  return PLANETS[id] ? PLANETS[id].displayName : id;
}

export const CHAPTERS = {
  moon: { id: 'moon', planet: 'LUNA', title: 'THE MOON', levels: MOON_LEVELS },
  mars: { id: 'mars', planet: 'MARS', title: 'MARS', levels: MARS_LEVELS },
  europa: { id: 'europa', planet: 'EUROPA', title: 'EUROPA', levels: EUROPA_LEVELS },
};
