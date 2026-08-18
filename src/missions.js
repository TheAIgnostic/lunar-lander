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

export const CHAPTERS = {
  moon: { id: 'moon', planet: 'LUNA', title: 'THE MOON', levels: MOON_LEVELS },
};
