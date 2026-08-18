// Planet definitions (roadmap section 7 and 14). The full data model lands in
// M5; this is the shape it will grow into, with the Moon filled in.
//
// Gravity: real values are the reference, but adopting them literally breaks
// the flight feel - real lunar gravity at this scale is a thrust-to-weight of
// 13, and Enceladus would be effectively weightless. So the physics value is a
// compressed mapping anchored on the Moon, plus a hand-tuned per-body offset
// (Tom's decision, 2026-08-16). Real values remain for display.

const MOON_REAL = 1.62;
const MOON_PX = 28;

/** Compressed mapping: preserves ordering and character, keeps every body flyable. */
export function gravityPx(realGravity, feelOffset = 1) {
  return +(MOON_PX * Math.sqrt(realGravity / MOON_REAL) * feelOffset).toFixed(2);
}

export const PLANETS = {
  LUNA: {
    id: 'LUNA',
    displayName: 'THE MOON',
    realGravity: 1.62,
    feelOffset: 1.0,          // hand-tuned on top of the compressed baseline
    atmosphere: 'none',
    drag: 0,
    wind: 0,
    gust: 0,
    surfaceFriction: 1.0,
    signatureHazards: [],
    rareMaterial: 'Ilmenite alloy stock',
    terrainPalette: ['crater', 'canyon', 'ridge', 'caldera'],
    world: 'LUNA',            // existing visual theme key in levels.js
  },
};

/** Physics gravity for a planet, in px/s^2. */
export function gravityFor(planetId) {
  const p = PLANETS[planetId];
  if (!p) throw new Error(`unknown planet: ${planetId}`);
  return gravityPx(p.realGravity, p.feelOffset);
}
