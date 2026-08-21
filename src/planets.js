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
  eligibleEnemySets: [],
  // What the ground is made of, which the generator reads: 'rock' is the
  // heightmap the game has always made, 'ice' fractures it into stepped plates
  // and stands seracs between them (see ICE in terrain.js). A body opts in
  // here, so an icy world is data rather than a special case in the generator.
  terrainStyle: 'rock',
  ...o,
});

// Which machines a body can be given, following the distribution in section 12.
//
// **The Mast Sniper is deliberately not in any of these lists.** Since M29b
// deleted `generateChapter`, `eligibleEnemySets` is only the *default* for a
// mission that does not declare its own `enemySets` - so putting a lethal
// machine here would quietly hand one to every armed mission on the body,
// including a mission 2 and including `pluto-4`, a single-pad cave where M21
// measured that there is no route around a machine at all. It is named per
// mission instead, on the last two missions of the last five bodies, which is
// what "harder levels" means as data.
// Only the two designs M12 implements appear here; the other six roster entries
// join the list they belong to when they exist, and nothing else has to change.

export const PLANETS = {
  LUNA: P({
    id: 'LUNA', displayName: 'THE MOON', realGravity: 1.62, world: 'LUNA',
    rareMaterial: 'Ilmenite alloy stock',
    // 'basin' belongs here: a lunar mare is an impact basin, and without it
    // the Moon had only three unpinned shapes to deal from (M26).
    terrainPalette: ['crater', 'canyon', 'ridge', 'caldera', 'mesa', 'basin'],
    eligibleEnemySets: ['sentry-turret'],
    summary: 'No atmosphere. Inertia, fuel planning and rugged ground.',
  }),
  MARS: P({
    id: 'MARS', displayName: 'MARS', realGravity: 3.71, world: 'MARS',
    // **The authored drag, raised in M29 on Tom's call.** M28b found Mars had
    // been flying at *double* its own drag from M6 to M28 - `forcesFor` built
    // `atmosphere` twice - and removing the duplication left the hardest body in
    // the game as the easiest on the ladder: his playtest flew mars-5 in ten
    // seconds with 129 of 138 fuel left. M28b recorded the honest fix as raising
    // the authored number rather than restoring the double-apply, and this is
    // that number.
    //
    // Measured over 5 missions x 20 seeds before choosing it. The shape is the
    // one M19 and M20 both found for a difficulty knob: the way home barely
    // moves and the prize route carries the whole cost.
    //
    // | drag | way home | prize route | fuel left |
    // | ---: | ---: | ---: | ---: |
    // | 0.15 | 95/100 | 76/100 | 58.8 |
    // | 0.20 | 95/100 | 71/100 | 56.6 |
    // | **0.24** | **94/100** | **62/100** | **53.9** |
    // | 0.28 | 93/100 | 61/100 | 49.3 |
    // | 0.32 | 92/100 | 49/100 | 45.7 |
    //
    // 0.24 and not 0.30: 0.30 is what the double-apply was worth, and Mars sits
    // at position 4 of 10. Restoring the accidental figure would re-invert the
    // ramp in the other direction and put Mars above the six bodies that follow
    // it, which is the fault M27 sorted the ladder to fix.
    feelOffset: 1.0, atmosphere: 'thin', drag: 0.24, wind: 24, gust: 20, visibility: 0.85,
    hazards: ['wind', 'dust'],
    rareMaterial: 'Iron-oxide ceramic',
    terrainPalette: ['basin', 'canyon', 'dunes', 'mesa'],
    eligibleEnemySets: ['sentry-turret', 'seeker-drone'],
    summary: 'Thin air. Weak drag, dust and gusts that shift a descent.',
  }),
  MERCURY: P({
    id: 'MERCURY', displayName: 'MERCURY', realGravity: 3.70, world: 'MERCURY',
    // `'heat'` resolves to the `thermal` builder through the M29 alias table.
    // Until then it resolved to nothing, and Mercury - "engine heat is the real
    // fuel gauge" since M5 - had no hazard on it at all.
    feelOffset: 1.02, atmosphere: 'none',
    hazards: [{ type: 'heat', heatRise: 8, heatFall: 5 }],
    rareMaterial: 'Nickel-iron / tungsten stock',
    // **Widened in M29, for the reason M26 added 'basin' to Luna.** A body's
    // palette is what `shapedMissions` deals fresh silhouettes from, minus
    // whatever its shape-named missions have pinned. At three shapes with one
    // pinned, the pool is two and a body deals four chapter layouts over forty
    // seeds - and every run walks every body, so that is the same "it stopped
    // feeling random" Tom reported on the Moon, waiting on seven more bodies.
    // `route-tests.js` asserts a floor of ten layouts and caught it.
    terrainPalette: ['crater', 'ridge', 'caldera', 'mesa', 'basin', 'canyon'],
    eligibleEnemySets: ['sentry-turret'],
    summary: 'Sunlight and shadow. Engine heat is the real fuel gauge.',
  }),
  VENUS: P({
    id: 'VENUS', displayName: 'VENUS', realGravity: 8.87, world: 'VENUS',
    // Venus is the wall, and until M29 three of its four hazards were words.
    // `acid` is corrosion that is thickest at the deck - the exact inverse of
    // Europa's radiation belt, which is why the two sit at opposite ends of the
    // ladder. `downdraft` puts columns of sinking air at fixed places, so the
    // dense air becomes somewhere rather than a number.
    feelOffset: 0.96, atmosphere: 'dense', drag: 0.32, wind: 22, gust: 30, visibility: 0.6,
    hazards: [
      'drag',
      { type: 'acid', acidRate: 1.4 },
      { type: 'downdraft', columns: [0.34, 0.56, 0.79] },
      { type: 'dust', period: 12, minVisibility: 0.5, duty: 0.6 },
    ],
    rareMaterial: 'Sulfur-resistant ceramic',
    terrainPalette: ['canyon', 'mesa', 'ridge', 'caldera', 'basin', 'dunes'],
    eligibleEnemySets: ['sentry-turret'],
    summary: 'Heavy air and heavier gravity. Everything responds late.',
  }),
  TITAN: P({
    id: 'TITAN', displayName: 'TITAN', realGravity: 1.35, world: 'TITAN',
    feelOffset: 1.05, atmosphere: 'thick', drag: 0.22, wind: 30, gust: 26, visibility: 0.75,
    // `glide` is a real force since M29: thick air at a seventh of a g makes
    // horizontal speed into lift, so Titan's own summary - "you glide, and you
    // overshoot" - is finally true of the physics and not only of the blurb.
    hazards: [
      'wind',
      { type: 'glide', lift: 0.00025, liftCap: 15 },
      { type: 'dust', period: 17, minVisibility: 0.62, duty: 0.5 },
    ],
    rareMaterial: 'Hydrocarbon composite',
    terrainPalette: ['dunes', 'basin', 'canyon', 'mesa', 'ridge', 'crater'],
    eligibleEnemySets: ['seeker-drone'],
    summary: 'Thick air, low gravity. You glide, and you overshoot.',
  }),
  EUROPA: P({
    id: 'EUROPA', displayName: 'EUROPA', realGravity: 1.31, world: 'EUROPA',
    feelOffset: 0.98, surfaceFriction: 0.07, hazards: ['ice', 'radiation'],
    terrainStyle: 'ice',
    rareMaterial: 'Conductive ice salts',
    terrainPalette: ['basin', 'canyon', 'mesa'],
    eligibleEnemySets: ['seeker-drone'],
    summary: 'Ice. Touchdown is only the first half of the landing.',
  }),
  ENCELADUS: P({
    id: 'ENCELADUS', displayName: 'ENCELADUS', realGravity: 0.11, world: 'ENCELADUS',
    // **The vents exist now.** `'plume'` was spelled against a `plumes` builder
    // and so was never built at all - caught by the M28b review, which read it as
    // "builds with no vents" and had the mechanism wrong in the way that
    // mattered: authoring vents would have fixed nothing while the name missed.
    // Positions are fractions of the map width, so a vent field does not need to
    // know how wide the terrain came out.
    feelOffset: 1.15, surfaceFriction: 0.3, terrainStyle: 'ice',
    hazards: [{
      type: 'plume',
      vents: [
        { atX: 0.30, period: 9, duty: 0.34, radius: 210, force: 15 },
        { atX: 0.58, period: 7.5, duty: 0.38, radius: 190, force: 16 },
        { atX: 0.83, period: 11, duty: 0.30, radius: 230, force: 14 },
      ],
    }],
    rareMaterial: 'Silica nanograins',
    terrainPalette: ['canyon', 'ridge', 'crater', 'basin', 'mesa', 'caldera'],
    // **It had none**, at position 5 of 10 - measured and printed by M27, which
    // recorded it as M29 content rather than a formula bug. A body halfway down
    // the ladder with nothing hostile on it is a hole in the ramp.
    //
    // Drones alone were the first answer and the measurement rejected it. At
    // 7.3 px/s^2 a lander cannot decelerate, and a drone that closes and rams is
    // not a difficulty knob there - it is a coin toss. Measured, unarmed, over
    // 20 seeds on the way home:
    //
    // | machines | drones only | turrets only | mixed |
    // | ---: | ---: | ---: | ---: |
    // | 2 | 2-5/20 | 17-20/20 | 17-20/20 |
    // | 3 | 2-5/20 | 17-20/20 | 15-16/20 |
    // | 4 | 0-4/20 | 17-20/20 | 8-13/20 |
    //
    // The *count* barely matters and the *type* decides everything, which is
    // M21's "a turret is something you fly around, a drone follows you and rams"
    // in its sharpest form. So Enceladus is a turret body that meets its first
    // drone late, and the chapter's budgets are authored against that table.
    eligibleEnemySets: ['sentry-turret', 'seeker-drone'],
    summary: 'Almost no gravity. Every correction lasts far too long.',
  }),
  IO: P({
    id: 'IO', displayName: 'IO', realGravity: 1.80, world: 'IO',
    // Both hazards were hollow: `'heat'` missed the `thermal` builder and
    // `eruption` had no builder at all, so "lava reshapes the safe ground" was
    // a sentence on a card. Io's fountains lift and burn, and they telegraph -
    // a hazard that arrives without warning is a dice roll (the M12 rule).
    feelOffset: 1.0,
    hazards: [
      { type: 'heat', heatRise: 7, heatFall: 5 },
      { type: 'eruption', vents: [{ atX: 0.42 }, { atX: 0.71 }] },
    ],
    rareMaterial: 'Sulfur-basalt ceramic',
    // No crater, deliberately: Io resurfaces itself faster than anything can
    // scar it, and it is the one body in the game with essentially no impact
    // craters on it. A palette is content.
    terrainPalette: ['caldera', 'canyon', 'mesa', 'ridge', 'basin', 'dunes'],
    eligibleEnemySets: ['sentry-turret', 'seeker-drone'],
    summary: 'Lava reshapes the safe ground while you are still deciding.',
  }),
  PLUTO: P({
    id: 'PLUTO', displayName: 'PLUTO', realGravity: 0.62, world: 'PLUTO',
    // **Darkness is not fog.** It was implemented as `visibility: 0.45`, and the
    // renderer draws visibility as *dust*, so the darkest body in the game came
    // out as pale blue haze - which is what Tom reported walking the ladder.
    // Pluto has essentially no atmosphere, so its air is now perfectly clear
    // (`visibility: 1`) and the night is its own channel. `'cold'` was the third
    // hazard spelled against a builder it did not match (`cryo`), so cold soak
    // had never once been applied either.
    feelOffset: 1.08, visibility: 1, surfaceFriction: 0.25,
    hazards: [
      { type: 'cold', coldRate: 2 },
      { type: 'darkness', darkness: 0.72 },
    ],
    terrainStyle: 'ice',
    rareMaterial: 'Tholin cryocomposite',
    terrainPalette: ['ridge', 'basin', 'mesa', 'canyon', 'crater', 'caldera'],
    eligibleEnemySets: ['sentry-turret'],
    summary: 'Dark and cold. Momentum is cheap to gain, expensive to lose.',
  }),
  GANYMEDE: P({
    id: 'GANYMEDE', displayName: 'GANYMEDE', realGravity: 1.43, world: 'GANYMEDE',
    // Both of Ganymede's hazards were hollow, which is why `docs/PROGRESSION.md`
    // called it "the Moon with a different colour". `magnetic` is physics - a
    // torque and, past the bite, a pull toward the ground - and `falseRadar` is
    // presentation only: it moves the readout and never the lander. Keeping
    // those two in separate forces is the point, not an accident of tidiness.
    feelOffset: 1.0, surfaceFriction: 0.5,
    hazards: [
      { type: 'magnetic', anomalies: [{ atX: 0.38 }, { atX: 0.66 }, { atX: 0.88 }] },
      { type: 'falseRadar', radarError: 1 },
    ],
    terrainStyle: 'ice',
    rareMaterial: 'Magnetite conductor',
    terrainPalette: ['canyon', 'ridge', 'crater', 'basin', 'mesa', 'dunes'],
    eligibleEnemySets: ['sentry-turret', 'seeker-drone'],
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
