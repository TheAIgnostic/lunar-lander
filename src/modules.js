// Active and passive loadout modules (roadmap section 11).
//
// One active, one passive, chosen before a body and fixed for the chapter.
// Only modules whose effects the simulation can actually deliver are offered.
// The weapon waited for M12's enemies, because a gun with nothing to shoot is
// a number on a screen; it is here now, and `src/abilities.js` runs all of it.
//
// **`cue` is when a player would reach for it**, and it is here rather than in
// the test pilot for the M30g reason: a list of behaviours kept beside the
// modules is a list that drifts away from them. M30a taught the pilot to press
// an active, with one policy - fire when something is aiming at you - which is
// right for a weapon and a shield and wrong for everything else. The Magnetic
// Anchor is a landing tool and the Thermal Purge answers a gauge, so under a
// combat cue neither one could be measured at all: fitted, flown and provably
// identical to an empty slot across a whole chapter.
//
//   threat  something is aiming at you        (weapon, shield)
//   final   over the pad and coming down      (anchor)
//   status  a status channel has started to bite (purge)
//   blind   you cannot see the ground         (sensor pulse)
//
// The cue is what the *instrument* presses on. Nothing in the game reads it -
// a player presses the button - so it can never change a real flight.

export const ACTIVE_MODULES = {
  'sensor-pulse': {
    id: 'sensor-pulse', name: 'SENSOR PULSE',
    blurb: 'Burns through dust and darkness for a few seconds, and paints the pad.',
    good: ['MARS', 'PLUTO', 'GANYMEDE'],
    cue: 'blind',
    charges: 3, duration: 5, cooldown: 6,
    effect: { revealVisibility: 1, beacon: 2.4 },
  },
  'ray-shield': {
    id: 'ray-shield', name: 'RAY SHIELD',
    blurb: 'A directional barrier. Holds off radiation and hazard exposure while it lasts.',
    good: ['EUROPA', 'GANYMEDE', 'IO'],
    cue: 'threat',
    charges: 2, duration: 6, cooldown: 8,
    effect: { hazardShield: 0.15 },
  },
  'magnetic-anchor': {
    id: 'magnetic-anchor', name: 'MAGNETIC ANCHOR',
    blurb: 'Grips the surface on contact. The difference between landing and sliding off.',
    good: ['EUROPA', 'ENCELADUS'],
    cue: 'final',
    charges: 2, duration: 4, cooldown: 6,
    effect: { anchorGrip: 6 },
  },
  'thermal-purge': {
    id: 'thermal-purge', name: 'THERMAL PURGE',
    blurb: 'Dumps engine heat and sheds cold soak, at the cost of a moment blind.',
    good: ['MERCURY', 'IO', 'PLUTO'],
    cue: 'status',
    charges: 2, duration: 1, cooldown: 10,
    effect: { purgeStatus: 0.7 },
  },
  // The Moon has no weather to fight, so the weapon is its recommendation -
  // and it is the only body where a turret is the hardest thing in the sky.
  'pulse-laser': {
    id: 'pulse-laser', name: 'PULSE LASER',
    blurb: 'Tracks the nearest hostile in line of sight and burns it down. Short range, short burst.',
    good: ['LUNA'],
    cue: 'threat',
    charges: 3, duration: 2.5, cooldown: 5,
    effect: { laserDps: 26, laserRange: 520 },
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
  // --- M31 -----------------------------------------------------------------
  //
  // Five specialists, each scaling a channel that already exists. `good` names
  // only bodies where the thing they answer **measurably happens** - the
  // loadout gate flies every claim, so a body listed here for flavour is a
  // failing test rather than a hopeful line on a route card.
  'ablative-acid-skin': {
    id: 'ablative-acid-skin', name: 'ABLATIVE ACID SKIN',
    blurb: 'A sacrificial hull layer. Venus eats it instead of you.',
    good: ['VENUS'],
    // One lever, both halves of the spec's "reduces acid and corrosion damage":
    // the hull cost is driven by how far corrosion is past its bite, so slowing
    // the build slows the damage. A second key would be two dials on one wire.
    effect: { corrosionResist: 0.55 },
  },
  'cryo-insulation': {
    id: 'cryo-insulation', name: 'CRYO INSULATION',
    blurb: 'Keeps the cold out of the attitude thrusters a good while longer.',
    // Pluto only. The spec lists Europa too, and Europa declares no `cold` at
    // all - its weather is ice underfoot and radiation overhead - so claiming
    // it would be a route card recommending kit that does nothing there.
    good: ['PLUTO'],
    effect: { coldResist: 0.55 },
  },
  'plume-vanes': {
    id: 'plume-vanes', name: 'PLUME VANES',
    blurb: 'Splits a vapour jet around the hull. You still rise; you stop being thrown sideways.',
    good: ['ENCELADUS'],
    // Lateral only, per the spec's "while preserving some lift". At 1.4 m/s2
    // the column is free altitude and the sideways shove is what loses the pad.
    effect: { plumeLateral: 0.35 },
  },
  'atmospheric-control-surfaces': {
    id: 'atmospheric-control-surfaces', name: 'CONTROL SURFACES',
    blurb: 'Flare to float, tip forward to drop. Thick air becomes something you fly.',
    good: ['TITAN', 'VENUS'],
    // Two halves, and on each body only one of them leads: Titan is the glide,
    // Venus is the gust. Both are real on the body listed.
    //
    // Worth knowing before flying it: `disturbanceResist` scales Titan's raw
    // lift as well as its gusts, so fitting the foil takes about 15% off the
    // float *before* the attitude term is asked for anything. Measured on
    // titan-5 at 120 px/s - stock 4.60 whatever the nose is doing, foil 5.10
    // flared, 3.91 level, 2.72 tipped into the crossing. You trade a little
    // free altitude for the ability to choose when you have it.
    effect: { glideTrim: 0.7, disturbanceResist: 0.85 },
  },
  'salvage-magnet': {
    id: 'salvage-magnet', name: 'SALVAGE MAGNET',
    blurb: 'Sweeps cells, cargo and ore in from half again the distance.',
    // No body: it answers the map rather than the weather, so it is never the
    // specialist a route card names. `recommendedFor` simply never returns it,
    // which is what an empty list means and is checked rather than assumed.
    good: [],
    effect: { collectRadius: 1.5 },
  },
};

export const STARTER_PASSIVES = ['fuel-recycler', 'gyro-stabilizer'];
/** Guaranteed choice during the Moon chapter, per the blueprint rules. */
export const MOON_BLUEPRINTS = ['sensor-pulse', 'ray-shield', 'magnetic-anchor'];
/**
 * Recovered from the first chapter that had hostile systems in it. The weapon
 * is deliberately not the reward for shooting things, which would be circular -
 * it is the reward for surviving a body that shot at you.
 */
export const COMBAT_BLUEPRINT = 'pulse-laser';

export function moduleById(id) {
  return ACTIVE_MODULES[id] || PASSIVE_MODULES[id] || null;
}

/** Every module, actives first, in declaration order. */
export function allModules() {
  return [...Object.values(ACTIVE_MODULES), ...Object.values(PASSIVE_MODULES)];
}

/**
 * **What clearing a body hands over.**
 *
 * Until M31 there were exactly three ways a blueprint could be unlocked: the
 * two starter passives, `MOON_BLUEPRINTS[0]` on a first chapter clear, and the
 * weapon for surviving a mission that shot at you. That is **four modules of
 * nine**, and the other five - Ray Shield, Magnetic Anchor, Thermal Purge, Ice
 * Cleats, Hardened Radar - could not be obtained in a normal game at all. God
 * mode granted them, which is why it never showed in a playtest.
 *
 * It is M30g's fault one level deeper. That milestone stopped the route card
 * naming modules that had **no implementation**, by deriving the advice from
 * each module's own `good` field; nobody then asked whether an implemented
 * module was *reachable*. So Europa's card honestly recommended Ice Cleats and
 * Ray Shield, and the player could never own either.
 *
 * The rule: a cleared body hands over a blueprint for **the body you are about
 * to fly** - which is the same moment the supply stop opens the loadout, so the
 * thing you are given is the thing the next card is telling you to bring. It is
 * derived from `good` rather than from a second table, for exactly the reason
 * M30g recorded: a hand-written list beside the modules is a list that drifts.
 * When the next body's kit is already owned it falls through to whatever is
 * still missing, so nothing is ever stranded, and it never grants a duplicate.
 *
 * Blueprints survive death, so this is a permanent drip: ten bodies to a run
 * and the collection carries between them.
 */
export function nextBlueprint(unlocked = [], planetId = null) {
  const owned = new Set(unlocked);
  const every = allModules();
  const suited = planetId ? every.filter((m) => m.good.includes(planetId)) : [];
  const pick = [...suited, ...every].find((m) => !owned.has(m.id));
  return pick ? pick.id : null;
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
