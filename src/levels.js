// Mission table. 12 hand-tuned levels across 4 worlds, then a scaling endless mode.

/**
 * A world is a name and a palette, and **every body on the ladder gets its own**.
 *
 * Six of the ten used to borrow: Mercury, Io and Venus pointed at MARS, and
 * Enceladus, Ganymede and Pluto at EUROPA. `world` drives both the name drawn
 * over the mission and the whole colour scheme, so more than half the ladder
 * announced itself as somewhere else - Tom, on a full run: "when I click
 * Mercury, levels for Mars come", "when I click Pluto, levels for Europa come".
 * The terrain underneath was always the right body's; the label and the paint
 * were not.
 *
 * The four originals are untouched, because `levels.js` is the M0 physics
 * baseline and both fixtures regress against it.
 */
export const WORLDS = {
  LUNA: { name: 'LUNA', sky: ['#05060c', '#0b1226'], hill: '#141c33', accent: '#5ff5ff', planet: '#1b2647', dustRGB: '120,140,180' },
  MARS: { name: 'MARS', sky: ['#0a0507', '#2a0f14'], hill: '#331520', accent: '#ff8a5f', planet: '#4a1d22', dustRGB: '184,96,54' },
  EUROPA: { name: 'EUROPA', sky: ['#03080e', '#0a2230'], hill: '#0e2b3a', accent: '#7ef2d0', planet: '#124055', dustRGB: '150,190,210' },
  TITAN: { name: 'TITAN', sky: ['#0b0703', '#2e1c05'], hill: '#3a2708', accent: '#ffd166', planet: '#5a3d0d', dustRGB: '190,150,70' },

  // Sulphur and frozen nitrogen, pale gold on near-black - a small bright world
  // with the plumes going up behind you.
  ENCELADUS: { name: 'ENCELADUS', sky: ['#04070c', '#0d1a2b'], hill: '#16283d', accent: '#a8e8ff', planet: '#1d3a55', dustRGB: '190,225,245' },
  // Rust and iron, dark and magnetic. Warmer than Europa, colder than Mars.
  GANYMEDE: { name: 'GANYMEDE', sky: ['#06070a', '#1c1a24', ], hill: '#2b2733', accent: '#c9b6ff', planet: '#3a3346', dustRGB: '170,160,190' },
  // Sulphur yellow over basalt: the loudest palette in the game, for the
  // loudest body.
  IO: { name: 'IO', sky: ['#0a0803', '#2e2606'], hill: '#3d3208', accent: '#ffe14d', planet: '#5c4a0c', dustRGB: '220,200,90' },
  // Iron and slag, scorched grey-white under a hard sun.
  MERCURY: { name: 'MERCURY', sky: ['#08070a', '#241f1c'], hill: '#332c26', accent: '#ffb38a', planet: '#4a3f34', dustRGB: '200,180,160' },
  // Tholin: the real Pluto is red-brown, not blue. Dark, with a cold sky.
  PLUTO: { name: 'PLUTO', sky: ['#07050a', '#211525'], hill: '#2e1f2e', accent: '#ff9ecb', planet: '#402c3d', dustRGB: '210,170,190' },
  // Sulphuric acid haze: sickly yellow-green, the densest air on the ladder.
  VENUS: { name: 'VENUS', sky: ['#0a0903', '#2f2a08'], hill: '#3d3512', accent: '#e8ff70', planet: '#584c14', dustRGB: '220,215,120' },
};

const base = {
  width: 2800,
  height: 1400,
  groundBase: 300,
  rough: 150,
  gravity: 32,
  fuel: 100,
  wind: 0,
  gust: 0,
  drag: 0,
  cave: false,
  fuelCells: 0,
  start: 0.5,
};

function L(o) {
  return { ...base, ...o };
}

export const LEVELS = [
  L({
    id: 1, world: 'LUNA', title: 'FIRST CONTACT', gravity: 28, fuel: 110, rough: 90,
    pads: [{ width: 260, mult: 2 }],
    brief: 'Wide pad, gentle gravity. Feather the booster and keep her level.',
  }),
  L({
    id: 2, world: 'LUNA', title: 'MARE SERENITY', gravity: 30, fuel: 100, rough: 130,
    pads: [{ width: 180, mult: 2 }, { width: 110, mult: 3 }],
    brief: 'Two pads. The narrow one pays more. Drift costs fuel.',
  }),
  L({
    id: 3, world: 'LUNA', title: 'THE NEEDLE', gravity: 32, fuel: 92, rough: 190, width: 3000,
    pads: [{ width: 240, mult: 2 }, { width: 66, mult: 5 }],
    brief: 'A x5 sliver on the far side. Commit early or take the safe money.',
  }),

  L({
    id: 4, world: 'MARS', title: 'DUST BASIN', gravity: 42, fuel: 130, rough: 200, width: 3000,
    pads: [{ width: 190, mult: 2 }, { width: 120, mult: 3 }],
    brief: 'Heavier world. You fall faster than instinct expects.',
  }),
  L({
    id: 5, world: 'MARS', title: 'RILLE RUN', gravity: 45, fuel: 122, rough: 260, width: 3200, fuelCells: 2,
    pads: [{ width: 150, mult: 3 }, { width: 78, mult: 5 }],
    brief: 'Thin tanks. There are fuel cells floating in the canyon and they are worth the detour.',
  }),
  L({
    id: 6, world: 'MARS', title: 'OLYMPUS SHELF', gravity: 48, fuel: 116, rough: 300, width: 3400, fuelCells: 2,
    pads: [{ width: 70, mult: 5 }],
    brief: 'One pad. Sixty-eight metres of it. No second option.',
  }),

  L({
    id: 7, world: 'EUROPA', title: 'ICE CORRIDOR', gravity: 30, fuel: 124, rough: 180, width: 3000,
    cave: true, clearance: 300,
    pads: [{ width: 170, mult: 3 }, { width: 100, mult: 3 }],
    brief: 'Ceiling ice is lethal. Fly the corridor, not the sky.',
  }),
  L({
    id: 8, world: 'EUROPA', title: 'CRYO VENTS', gravity: 33, fuel: 118, rough: 230, width: 3200,
    cave: true, clearance: 275, fuelCells: 2,
    pads: [{ width: 130, mult: 3 }, { width: 72, mult: 5 }],
    brief: 'Tighter tunnel, tighter pads. Small burns only.',
  }),
  L({
    id: 9, world: 'EUROPA', title: 'DEEP SHAFT', gravity: 35, fuel: 112, rough: 280, width: 3400,
    cave: true, clearance: 255, fuelCells: 3,
    pads: [{ width: 190, mult: 2 }, { width: 64, mult: 5 }],
    brief: 'The shaft narrows toward the x5. Bleed speed before you enter it.',
  }),

  L({
    id: 10, world: 'TITAN', title: 'METHANE GALE', gravity: 55, fuel: 160, rough: 200, width: 3200,
    wind: 26, gust: 16, drag: 0.14, fuelCells: 2,
    pads: [{ width: 200, mult: 2 }, { width: 110, mult: 3 }],
    brief: 'Atmosphere. Wind pushes, drag fights back. Watch the vane.',
  }),
  L({
    id: 11, world: 'TITAN', title: 'CROSSWIND', gravity: 58, fuel: 164, rough: 260, width: 3400,
    wind: -38, gust: 26, drag: 0.16, fuelCells: 3,
    pads: [{ width: 140, mult: 3 }, { width: 80, mult: 5 }],
    brief: 'Gusts reverse mid-descent. Hold a nose-into-wind attitude.',
  }),
  L({
    id: 12, world: 'TITAN', title: 'TERMINAL VELOCITY', gravity: 66, fuel: 178, rough: 320, width: 3600,
    wind: 44, gust: 28, drag: 0.18, fuelCells: 3,
    pads: [{ width: 210, mult: 2 }, { width: 60, mult: 5 }],
    brief: 'Everything at once. Land it and the program is yours.',
  }),
];

const ENDLESS_WORLDS = ['LUNA', 'MARS', 'EUROPA', 'TITAN'];

/** Endless mission n (1-based), difficulty scales without ever going unfair. */
export function endlessLevel(n, seedRng) {
  const world = ENDLESS_WORLDS[(n - 1) % 4];
  const tier = Math.floor((n - 1) / 4);
  const d = Math.min(tier, 6);
  const cave = world === 'EUROPA';
  const windy = world === 'TITAN';
  return L({
    id: 100 + n,
    world,
    title: `SECTOR ${String(n).padStart(2, '0')}`,
    gravity: (world === 'TITAN' ? 55 : world === 'MARS' ? 42 : 30) + d * 3,
    fuel: Math.max(110, 158 - d * 7),
    rough: 160 + d * 28 + (seedRng ? seedRng() * 60 : 0),
    width: 2900 + d * 120,
    cave,
    clearance: cave ? 300 - d * 8 : 0,
    wind: windy ? (seedRng && seedRng() < 0.5 ? -1 : 1) * (24 + d * 6) : 0,
    gust: windy ? 14 + d * 4 : 0,
    drag: windy ? 0.15 : 0,
    fuelCells: 1 + Math.min(3, d),
    pads:
      d < 2
        ? [{ width: 190, mult: 2 }, { width: 100, mult: 3 }]
        : [{ width: Math.max(120, 170 - d * 8), mult: 3 }, { width: Math.max(56, 84 - d * 4), mult: 5 }],
    brief: 'Unsurveyed sector. Good luck, pilot.',
  });
}
