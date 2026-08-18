// Authored missions (roadmap section 6). Data only: a MissionDefinition names
// a planet, a terrain archetype and its landing zones, and the engine turns it
// into the level config the generator already understands.
//
// Fields that later milestones consume (enemyBudget, optionalObjective) are
// carried now so the content does not need rewriting when those land.

import { PLANETS, gravityFor } from './planets.js';

export const MOON_MISSIONS = [
  {
    id: 'moon-1', planet: 'LUNA', index: 1, name: 'FIRST SCAR',
    brief: 'A bowl crater with the pad on an offset inner shelf. You cannot simply fall onto it — carry your speed across the bowl and set down level.',
    width: 2700, relief: 250, detail: 1.0, rough: 150, fuel: 124,
    terrain: { archetype: 'crater' },
    pads: [{ mult: 3, width: 130 }, { mult: 2, width: 200 }],
    optionalObjective: { id: 'sample-titanium', text: 'Recover a titanium-rich sample', reward: { data: 20 } },
    enemyBudget: 0,
  },
  {
    id: 'moon-2', planet: 'LUNA', index: 2, name: 'RILLE RUN',
    brief: 'A deep rille with the pad on the floor, under a cliff. Kill your lateral speed early — boulders make a late correction expensive.',
    width: 2900, relief: 300, detail: 1.6, rough: 170, fuel: 116,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 3, width: 120 }],
    optionalObjective: { id: 'fuel-25', text: 'Land with at least 25% fuel', reward: { salvage: 40 } },
    enemyBudget: 0,
  },
  {
    id: 'moon-3', planet: 'LUNA', index: 3, name: 'FAR-SIDE RELAY',
    brief: 'Broken ridges and a relay platform cut into the flank. Telemetry is intermittent out here; fly what you can see.',
    width: 3000, relief: 290, detail: 1.2, rough: 200, fuel: 112,
    terrain: { archetype: 'ridge' },
    pads: [{ mult: 3, width: 110 }, { mult: 2, width: 180 }],
    optionalObjective: { id: 'power-relay', text: 'Power the relay for extra research data', reward: { data: 35 } },
    enemyBudget: 0,
  },
  {
    id: 'moon-4', planet: 'LUNA', index: 4, name: 'SILENT BATTERY',
    brief: 'A crater rim strewn with wreckage. Two old security turrets still track movement — they are slow, and they can be flown around.',
    width: 3100, relief: 280, detail: 1.8, rough: 210, fuel: 108,
    terrain: { archetype: 'mesa' },
    pads: [{ mult: 3, width: 110 }, { mult: 2, width: 170 }],
    optionalObjective: { id: 'no-ability', text: 'Complete without using the active ability', reward: { cores: 1 } },
    enemyBudget: 2, enemySets: ['sentry-turret'],
  },
  {
    id: 'moon-5', planet: 'LUNA', index: 5, name: 'TYCHO DESCENT',
    brief: 'Tall walls, a central peak, and a terrace barely wider than the lander. Everything the Moon has taught you, with the fuel to do it once.',
    width: 3200, relief: 320, detail: 1.4, rough: 230, fuel: 104,
    terrain: { archetype: 'caldera' },
    pads: [{ mult: 5, width: 78 }, { mult: 2, width: 170 }],
    optionalObjective: { id: 'centre', text: 'Touch down inside the central bonus area', reward: { cores: 1 } },
    enemyBudget: 1, enemySets: ['sentry-turret'],
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
    enemySets: mission.enemySets || [],
  };
}

export const MOON_LEVELS = MOON_MISSIONS.map(missionToLevel);

export const MARS_MISSIONS = [
  {
    id: 'mars-1', planet: 'MARS', index: 1, name: 'RED VEIL',
    brief: 'Thin air, but enough to matter: the lander answers late and drifts on the gusts. The pad sits behind a low ridge, and a dust front is crossing the basin.',
    width: 3000, relief: 240, detail: 1.2, rough: 190, fuel: 136,
    terrain: { archetype: 'basin' },
    pads: [{ mult: 2, width: 190 }, { mult: 3, width: 120 }],
    hazards: ['atmosphere', { type: 'dust', period: 22, minVisibility: 0.55, duty: 0.35 }],
    optionalObjective: { id: 'fuel-25', text: 'Land with at least 25% fuel', reward: { salvage: 45 } },
    enemyBudget: 0,
  },
  {
    id: 'mars-2', planet: 'MARS', index: 2, name: 'VALLES CROSSWIND',
    brief: 'The canyon stacks its wind in layers, and each layer runs the other way. Drop through them one at a time — a straight descent will be thrown into a wall.',
    width: 3100, relief: 300, detail: 1.4, rough: 200, fuel: 132,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 3, width: 130 }],
    hazards: [{ type: 'windChannels', bandHeight: 190, strength: 44 }],
    optionalObjective: { id: 'hull-10', text: 'Keep hull damage below 10%', reward: { data: 30 } },
    enemyBudget: 0,
  },
  {
    id: 'mars-3', planet: 'MARS', index: 3, name: 'BURIED ARRAY',
    brief: 'Dune country, with a sensor array half swallowed by it. The dust comes in hard and often; learn the ground during the clear windows.',
    width: 3200, relief: 230, detail: 1.8, rough: 210, fuel: 128,
    terrain: { archetype: 'dunes' },
    pads: [{ mult: 3, width: 130 }, { mult: 2, width: 180 }],
    hazards: ['atmosphere', { type: 'dust', period: 13, minVisibility: 0.32, duty: 0.5 }],
    optionalObjective: { id: 'power-array', text: 'Restore a sensor tower for a stronger beacon', reward: { data: 40 } },
    enemyBudget: 0, fuelCells: 2,
  },
  {
    id: 'mars-4', planet: 'MARS', index: 4, name: 'IRON RAIN',
    brief: 'Iron-rich mesas, old ground batteries, and salvage sitting exactly where the safe route is not. The gusts do not care that you are being shot at.',
    width: 3300, relief: 290, detail: 1.6, rough: 230, fuel: 124,
    terrain: { archetype: 'mesa' },
    pads: [{ mult: 3, width: 115 }, { mult: 2, width: 175 }],
    hazards: ['atmosphere', { type: 'dust', period: 18, minVisibility: 0.5, duty: 0.3 }],
    optionalObjective: { id: 'salvage-iron', text: 'Recover the iron-ceramic salvage off the safe route', reward: { salvage: 70 } },
    enemyBudget: 2, enemySets: ['sentry-turret', 'mortar-platform'], fuelCells: 2,
  },
  {
    id: 'mars-5', planet: 'MARS', index: 5, name: 'STORM EYE',
    brief: 'A storm walks the crater on a cycle. The pad is on the central mesa, and you will only see it in the gaps. Memorise the ground, then commit.',
    width: 3400, relief: 320, detail: 1.5, rough: 240, fuel: 120,
    terrain: { archetype: 'caldera' },
    pads: [{ mult: 5, width: 84 }, { mult: 2, width: 175 }],
    hazards: ['atmosphere', { type: 'dust', period: 11, minVisibility: 0.22, duty: 0.55 }],
    optionalObjective: { id: 'centre', text: 'Touch down inside the central bonus area', reward: { cores: 1 } },
    enemyBudget: 1, enemySets: ['sentry-turret'], fuelCells: 3,
  },
];

export const MARS_LEVELS = MARS_MISSIONS.map(missionToLevel);

export const EUROPA_MISSIONS = [
  {
    id: 'europa-1', planet: 'EUROPA', index: 1, name: 'GLASS LANDING',
    brief: 'Smooth ice, and almost nothing to hold you. Touchdown is only half the landing here — you will keep moving after the legs are down, so arrive slow and arrive straight.',
    width: 2900, relief: 200, detail: 0.8, rough: 150, fuel: 122,
    terrain: { archetype: 'basin' },
    pads: [{ mult: 2, width: 200 }, { mult: 3, width: 130 }],
    optionalObjective: { id: 'centre', text: 'Come to rest inside the central bonus area', reward: { data: 30 } },
    enemyBudget: 0,
  },
  {
    id: 'europa-2', planet: 'EUROPA', index: 2, name: 'BLUE FRACTURE',
    brief: 'The pad is an ice bridge over a crevasse. It will hold a gentle lander and nothing heavier — the fracture limit is printed on the approach.',
    width: 3000, relief: 300, detail: 1.2, rough: 190, fuel: 118,
    terrain: { archetype: 'canyon' },
    pads: [{ mult: 5, width: 120, fragile: 16 }],
    optionalObjective: { id: 'perfect', text: 'Set down without cracking the bridge', reward: { cores: 1 } },
    enemyBudget: 0,
  },
  {
    id: 'europa-3', planet: 'EUROPA', index: 3, name: 'RADIATION PASS',
    brief: 'Jupiter sweeps this face on a cycle. Ice blades throw a long shadow — the sheltered route is slower, and it is the one that keeps your instruments honest.',
    width: 3100, relief: 320, detail: 1.4, rough: 220, fuel: 116,
    terrain: { archetype: 'ridge' },
    pads: [{ mult: 3, width: 125 }, { mult: 2, width: 175 }],
    hazards: [{ type: 'radiation', period: 15, duty: 0.45, rate: 30 }],
    optionalObjective: { id: 'low-rads', text: 'Land with radiation exposure under 30%', reward: { data: 45 } },
    enemyBudget: 0, fuelCells: 2,
  },
  {
    id: 'europa-4', planet: 'EUROPA', index: 4, name: 'UNDER-ICE SIGNAL',
    brief: 'A fractured shelf with something buried under it. The corridor is tight, the ceiling is ice, and neither forgives a fast approach.',
    width: 3200, relief: 260, detail: 1.6, rough: 200, fuel: 126,
    terrain: { archetype: 'canyon' }, cave: true, clearance: 290,
    pads: [{ mult: 3, width: 130 }],
    hazards: [{ type: 'radiation', period: 18, duty: 0.35, rate: 22 }],
    optionalObjective: { id: 'no-ability', text: 'Complete without using the active ability', reward: { cores: 1 } },
    enemyBudget: 2, enemySets: ['magnetic-mine'], fuelCells: 2,
  },
  {
    id: 'europa-5', planet: 'EUROPA', index: 5, name: 'DRIFTING PLATE',
    brief: 'Separated floes, a fragile plate at the centre of them, and Jupiter overhead. Everything Europa has taught you, on ice that will not hold a mistake.',
    width: 3300, relief: 300, detail: 1.5, rough: 230, fuel: 124,
    terrain: { archetype: 'caldera' },
    pads: [{ mult: 5, width: 96, fragile: 14 }, { mult: 2, width: 180 }],
    hazards: [{ type: 'radiation', period: 13, duty: 0.5, rate: 32 }],
    optionalObjective: { id: 'perfect', text: 'Set down on the plate without cracking it', reward: { cores: 2 } },
    enemyBudget: 1, enemySets: ['magnetic-mine'], fuelCells: 3,
  },
];

export const EUROPA_LEVELS = EUROPA_MISSIONS.map(missionToLevel);

export const CHAPTERS = {
  moon: { id: 'moon', planet: 'LUNA', title: 'THE MOON', levels: MOON_LEVELS },
  mars: { id: 'mars', planet: 'MARS', title: 'MARS', levels: MARS_LEVELS },
  europa: { id: 'europa', planet: 'EUROPA', title: 'EUROPA', levels: EUROPA_LEVELS },
};
