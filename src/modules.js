// Active and passive loadout modules (roadmap section 11).
//
// One active, one passive, chosen before a body and fixed for the chapter.
// Only modules whose effects the simulation can actually deliver are offered;
// weapons wait for the enemies that give them a target.

export const ACTIVE_MODULES = {
  'sensor-pulse': {
    id: 'sensor-pulse', name: 'SENSOR PULSE',
    blurb: 'Burns through dust and darkness for a few seconds, and paints the pad.',
    good: ['MARS', 'PLUTO', 'GANYMEDE'],
    charges: 3, duration: 5, cooldown: 6,
    effect: { revealVisibility: 1, beacon: 2.4 },
  },
  'ray-shield': {
    id: 'ray-shield', name: 'RAY SHIELD',
    blurb: 'A directional barrier. Holds off radiation and hazard exposure while it lasts.',
    good: ['EUROPA', 'GANYMEDE', 'IO'],
    charges: 2, duration: 6, cooldown: 8,
    effect: { hazardShield: 0.15 },
  },
  'magnetic-anchor': {
    id: 'magnetic-anchor', name: 'MAGNETIC ANCHOR',
    blurb: 'Grips the surface on contact. The difference between landing and sliding off.',
    good: ['EUROPA', 'ENCELADUS'],
    charges: 2, duration: 4, cooldown: 6,
    effect: { anchorGrip: 6 },
  },
  'thermal-purge': {
    id: 'thermal-purge', name: 'THERMAL PURGE',
    blurb: 'Dumps engine heat and sheds cold soak, at the cost of a moment blind.',
    good: ['MERCURY', 'IO', 'PLUTO'],
    charges: 2, duration: 1, cooldown: 10,
    effect: { purgeStatus: 0.7 },
  },
};

export const PASSIVE_MODULES = {
  'fuel-recycler': {
    id: 'fuel-recycler', name: 'FUEL RECYCLER',
    blurb: 'Twenty per cent more endurance from the same tank.',
    good: ['LUNA', 'PLUTO'],
    effect: { burnMain: 0.8, burnRcs: 0.8 },
  },
  'gyro-stabilizer': {
    id: 'gyro-stabilizer', name: 'GYRO STABILIZER',
    blurb: 'Resists the rotation that gusts and plumes put into the hull.',
    good: ['ENCELADUS', 'GANYMEDE'],
    effect: { disturbanceResist: 0.7, spinDampBonus: 0.985 },
  },
  'ice-cleats': {
    id: 'ice-cleats', name: 'ICE CLEATS',
    blurb: 'Bites into ice. You still slide — just far less far.',
    good: ['EUROPA'],
    effect: { gripBonus: 3.2 },
  },
  'hardened-radar': {
    id: 'hardened-radar', name: 'HARDENED RADAR',
    blurb: 'Instruments that keep telling the truth through dust and interference.',
    good: ['MARS', 'PLUTO', 'GANYMEDE'],
    effect: { noiseResist: 0.3, beacon: 1.5 },
  },
};

export const STARTER_PASSIVES = ['fuel-recycler', 'gyro-stabilizer'];
/** Guaranteed choice during the Moon chapter, per the blueprint rules. */
export const MOON_BLUEPRINTS = ['sensor-pulse', 'ray-shield', 'magnetic-anchor'];

export function moduleById(id) {
  return ACTIVE_MODULES[id] || PASSIVE_MODULES[id] || null;
}

/** Passive effects only; actives apply while triggered, not at derive time. */
export function derivePassive(passiveId) {
  const m = PASSIVE_MODULES[passiveId];
  return m ? { ...m.effect } : {};
}

/**
 * Recommended pairing for a body, used by the loadout screen. Advice only -
 * nothing is ever required, so a missing blueprint can never lock a route.
 */
export function recommendedFor(planetId) {
  const active = Object.values(ACTIVE_MODULES).find((m) => m.good.includes(planetId));
  const passive = Object.values(PASSIVE_MODULES).find((m) => m.good.includes(planetId));
  return { active: active ? active.id : null, passive: passive ? passive.id : null };
}
