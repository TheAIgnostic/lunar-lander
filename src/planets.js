// PlanetDefinition (roadmap sections 7 and 14).
//
// Gravity: real values are the reference, but adopting them literally breaks the
// flight feel - real lunar gravity at this scale is a thrust-to-weight of 13,
// and Enceladus would be effectively weightless. The physics value is therefore
// a compressed mapping anchored on the Moon, plus a hand-tuned per-body
// feelOffset (Tom's decision, 2026-08-16). Real values remain for display.
//
// Difficulty must never touch gravity. It shapes terrain, hazards, pad size,
// spawn momentum and fuel - never the planet's physics.

const MOON_REAL = 1.62;
const MOON_PX = 28;

/** Compressed mapping: preserves ordering and character, keeps every body flyable. */
export function gravityPx(realGravity, feelOffset = 1) {
  return +(MOON_PX * Math.sqrt(realGravity / MOON_REAL) * feelOffset).toFixed(2);
}

const P = (o) => ({
  feelOffset: 1,
  atmosphere: 'none',
  drag: 0, wind: 0, gust: 0,
  surfaceFriction: 1,
  visibility: 1,
  hazards: [],
  ...o,
});

export const PLANETS = {
  LUNA: P({
    id: 'LUNA', displayName: 'THE MOON', realGravity: 1.62, world: 'LUNA',
    rareMaterial: 'Ilmenite alloy stock',
    terrainPalette: ['crater', 'canyon', 'ridge', 'caldera', 'mesa'],
    summary: 'No atmosphere. Inertia, fuel planning and rugged ground.',
  }),
  MARS: P({
    id: 'MARS', displayName: 'MARS', realGravity: 3.71, world: 'MARS',
    feelOffset: 1.0, atmosphere: 'thin', drag: 0.14, wind: 22, gust: 16, visibility: 0.85,
    hazards: ['wind', 'dust'],
    rareMaterial: 'Iron-oxide ceramic',
    terrainPalette: ['basin', 'canyon', 'dunes', 'mesa'],
    summary: 'Thin air. Weak drag, dust and gusts that shift a descent.',
  }),
  MERCURY: P({
    id: 'MERCURY', displayName: 'MERCURY', realGravity: 3.70, world: 'MARS',
    feelOffset: 1.02, atmosphere: 'none', hazards: ['heat'],
    rareMaterial: 'Nickel-iron / tungsten stock',
    terrainPalette: ['crater', 'ridge', 'caldera'],
    summary: 'Sunlight and shadow. Engine heat is the real fuel gauge.',
  }),
  VENUS: P({
    id: 'VENUS', displayName: 'VENUS', realGravity: 8.87, world: 'MARS',
    feelOffset: 0.96, atmosphere: 'dense', drag: 0.34, wind: 18, gust: 26, visibility: 0.6,
    hazards: ['drag', 'acid', 'downdraft'],
    rareMaterial: 'Sulfur-resistant ceramic',
    terrainPalette: ['canyon', 'mesa', 'ridge'],
    summary: 'Heavy air and heavier gravity. Everything responds late.',
  }),
  TITAN: P({
    id: 'TITAN', displayName: 'TITAN', realGravity: 1.35, world: 'TITAN',
    feelOffset: 1.05, atmosphere: 'thick', drag: 0.30, wind: 30, gust: 22, visibility: 0.75,
    hazards: ['wind', 'glide'],
    rareMaterial: 'Hydrocarbon composite',
    terrainPalette: ['dunes', 'basin', 'canyon'],
    summary: 'Thick air, low gravity. You glide, and you overshoot.',
  }),
  EUROPA: P({
    id: 'EUROPA', displayName: 'EUROPA', realGravity: 1.31, world: 'EUROPA',
    feelOffset: 0.98, surfaceFriction: 0.25, hazards: ['ice', 'radiation'],
    rareMaterial: 'Conductive ice salts',
    terrainPalette: ['basin', 'canyon', 'mesa'],
    summary: 'Ice. Touchdown is only the first half of the landing.',
  }),
  ENCELADUS: P({
    id: 'ENCELADUS', displayName: 'ENCELADUS', realGravity: 0.11, world: 'EUROPA',
    feelOffset: 1.15, surfaceFriction: 0.5, hazards: ['plume'],
    rareMaterial: 'Silica nanograins',
    terrainPalette: ['canyon', 'ridge', 'crater'],
    summary: 'Almost no gravity. Every correction lasts far too long.',
  }),
  IO: P({
    id: 'IO', displayName: 'IO', realGravity: 1.80, world: 'MARS',
    feelOffset: 1.0, hazards: ['heat', 'eruption'],
    rareMaterial: 'Sulfur-basalt ceramic',
    terrainPalette: ['caldera', 'canyon', 'mesa'],
    summary: 'Lava reshapes the safe ground while you are still deciding.',
  }),
  PLUTO: P({
    id: 'PLUTO', displayName: 'PLUTO', realGravity: 0.62, world: 'EUROPA',
    feelOffset: 1.08, visibility: 0.45, hazards: ['cold', 'darkness'],
    rareMaterial: 'Tholin cryocomposite',
    terrainPalette: ['ridge', 'basin', 'mesa'],
    summary: 'Dark and cold. Momentum is cheap to gain, expensive to lose.',
  }),
  GANYMEDE: P({
    id: 'GANYMEDE', displayName: 'GANYMEDE', realGravity: 1.43, world: 'EUROPA',
    feelOffset: 1.0, hazards: ['magnetic', 'falseRadar'],
    rareMaterial: 'Magnetite conductor',
    terrainPalette: ['canyon', 'ridge', 'crater'],
    summary: 'The instruments lie. Fly the window, not the readout.',
  }),
};

export const PLANET_IDS = Object.keys(PLANETS);

/** Physics gravity for a planet, in px/s^2. Never modified by difficulty. */
export function gravityFor(planetId) {
  const p = PLANETS[planetId];
  if (!p) throw new Error(`unknown planet: ${planetId}`);
  return gravityPx(p.realGravity, p.feelOffset);
}
