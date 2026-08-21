// Optional objectives (roadmap section 3, "optional mission objectives").
//
// These were carried as data from M4 onward and read by exactly one thing: the
// briefing screen, which printed them. The game told you to recover a titanium
// sample and then had no sample, no way to recover one, and no reward if you
// somehow had. That is the worst kind of bug - the game lying about itself - so
// this file is the half that was missing.
//
// Two kinds:
//   condition  measured from the flight the moment it ends
//   cargo      a physical thing in the world that has to be flown to and taken

export const OBJECTIVES = {
  'fuel-25': {
    kind: 'condition', short: 'FUEL 25%',
    test: (r) => r.fuelFrac >= 0.25,
    progress: (r) => `${Math.round(r.fuelFrac * 100)}% / 25%`,
  },
  'hull-10': {
    kind: 'condition', short: 'HULL',
    test: (r) => r.hullLost <= 0.10,
    progress: (r) => `${Math.round(r.hullLost * 100)}% lost / 10% allowed`,
  },
  centre: {
    kind: 'condition', short: 'CENTRE',
    test: (r) => r.onPad && r.centreFrac <= 0.35,
    progress: (r) => (r.onPad ? `${Math.round(r.centreFrac * 100)}% off centre / 35%` : 'off pad'),
  },
  perfect: {
    kind: 'condition', short: 'PERFECT',
    test: (r) => r.grade === 'PERFECT',
    progress: (r) => `${r.grade || 'no landing'}`,
  },
  'no-ability': {
    kind: 'condition', short: 'NO MODULE',
    test: (r) => r.abilityUses === 0,
    progress: (r) => (r.abilityUses ? `module used ${r.abilityUses}×` : 'module unused'),
  },
  'low-rads': {
    kind: 'condition', short: 'RADIATION',
    test: (r) => r.radiation < 30,
    progress: (r) => `${Math.round(r.radiation)}% / under 30%`,
  },

  // M29. Seven bodies had `optionalObjective: null` on all 35 of their
  // missions, so M14's whole objectives system was dead on seven tenths of the
  // ladder. These are the conditions those chapters are written against, and
  // every one of them reads a status channel that a body's own hazard raises -
  // an objective is a reason to engage with the hazard, so an objective about a
  // hazard the body does not have would be filler.
  'low-heat': {
    kind: 'condition', short: 'HEAT',
    test: (r) => r.heat < 45,
    progress: (r) => `${Math.round(r.heat)}% / under 45%`,
  },
  'cold-hands': {
    kind: 'condition', short: 'COLD',
    test: (r) => r.cold < 55,
    progress: (r) => `${Math.round(r.cold)}% / under 55%`,
  },
  'low-acid': {
    kind: 'condition', short: 'CORROSION',
    test: (r) => r.corrosion < 50,
    progress: (r) => `${Math.round(r.corrosion)}% / under 50%`,
  },
  'low-charge': {
    kind: 'condition', short: 'CHARGE',
    test: (r) => r.charge < 40,
    progress: (r) => `${Math.round(r.charge)}% / under 40%`,
  },
  'no-hull': {
    kind: 'condition', short: 'NO DAMAGE',
    test: (r) => r.hullLost <= 0.001,
    progress: (r) => (r.hullLost <= 0.001 ? 'no damage' : `${Math.round(r.hullLost * 100)}% lost`),
  },
  'fuel-40': {
    kind: 'condition', short: 'FUEL 40%',
    test: (r) => r.fuelFrac >= 0.40,
    progress: (r) => `${Math.round(r.fuelFrac * 100)}% / 40%`,
  },
  // A time objective is the one that asks for commitment rather than caution,
  // which is the counterweight the set is otherwise short of: every other
  // condition here rewards flying slowly and carefully.
  quick: {
    kind: 'condition', short: 'UNDER 60s',
    test: (r) => r.elapsed > 0 && r.elapsed < 60,
    progress: (r) => `${r.elapsed.toFixed(0)}s / under 60s`,
  },

  // Cargo. `label` is drawn on the object, `place` says where it belongs.
  'sample-titanium': { kind: 'cargo', short: 'SAMPLE', label: 'SAMPLE', place: 'deep' },
  'power-relay': { kind: 'cargo', short: 'RELAY', label: 'RELAY', place: 'deep' },
  'power-array': { kind: 'cargo', short: 'ARRAY', label: 'ARRAY', place: 'deep' },
  'salvage-iron': { kind: 'cargo', short: 'SALVAGE', label: 'SALVAGE', place: 'offRoute' },
  // Europa had no recoveries at all - five missions of conditions, nothing to
  // fly to. Measured in the M14 encounter audit; these are the fix.
  'core-ice': { kind: 'cargo', short: 'ICE CORE', label: 'CORE', place: 'deep' },
  'probe-lost': { kind: 'cargo', short: 'PROBE', label: 'PROBE', place: 'offRoute' },

  // M29 recoveries, one per survey body, so every body has something physical
  // to fly to and not only a number to keep under.
  'lake-sample': { kind: 'cargo', short: 'SAMPLE', label: 'SAMPLE', place: 'deep' },       // Titan
  'vent-sensor': { kind: 'cargo', short: 'SENSOR', label: 'SENSOR', place: 'offRoute' },   // Enceladus
  'beacon-dark': { kind: 'cargo', short: 'BEACON', label: 'BEACON', place: 'offRoute' },   // Ganymede
  'basalt-core': { kind: 'cargo', short: 'CORE', label: 'CORE', place: 'deep' },           // Io
  'sun-panel': { kind: 'cargo', short: 'PANEL', label: 'PANEL', place: 'deep' },           // Mercury
  'ice-drill': { kind: 'cargo', short: 'DRILL', label: 'DRILL', place: 'offRoute' },       // Pluto
  'crush-probe': { kind: 'cargo', short: 'PROBE', label: 'PROBE', place: 'deep' },         // Venus
};

export function objectiveDef(id) {
  return OBJECTIVES[id] || null;
}

/** Does this mission's objective need something physical in the world? */
export function cargoFor(level) {
  const o = level && level.optionalObjective;
  const def = o && objectiveDef(o.id);
  return def && def.kind === 'cargo' ? { id: o.id, ...def } : null;
}

/**
 * Judge a completed flight. `report` is the plain snapshot the game assembles
 * at touchdown, so nothing here needs the ship, the terrain or the clock.
 * Returns { id, met, text, progress, reward } or null when there is no objective.
 */
export function evaluateObjective(level, report) {
  const o = level && level.optionalObjective;
  if (!o) return null;
  const def = objectiveDef(o.id);
  if (!def) return { id: o.id, met: false, text: o.text, progress: 'not implemented', reward: null };
  const met = def.kind === 'cargo' ? !!report.cargoTaken : !!def.test(report);
  return {
    id: o.id,
    kind: def.kind,
    short: def.short,
    met,
    text: o.text,
    progress: def.kind === 'cargo'
      ? (report.cargoTaken ? 'recovered' : 'left behind')
      : def.progress(report),
    reward: met ? o.reward || null : null,
  };
}

/** Every objective id used by content, so a typo fails a test rather than a run. */
export const OBJECTIVE_IDS = Object.keys(OBJECTIVES);
