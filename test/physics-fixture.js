// Physics regression with no pilot in the loop.
//
// The flight fixture measures the game *through* the autopilot, so improving
// the pilot moves it. This one replays a fixed input script against fixed
// levels and hashes the trajectory, so it moves only when the physics moves.
//
//   node test/physics-fixture.js            compare
//   node test/physics-fixture.js --record   rewrite
import { readFileSync, writeFileSync } from 'node:fs';
import { Ship } from '../src/ship.js';
import { Terrain } from '../src/terrain.js';

const FIXTURE = new URL('./physics-fixture.json', import.meta.url);

// A deliberately awkward input script: burn, tilt, coast, counter-tilt, burn.
const SCRIPT = [
  [1.2, { thrust: true }],
  [0.8, { left: true }],
  [1.0, { thrust: true, left: true }],
  [1.5, {}],
  [1.0, { right: true }],
  [1.2, { thrust: true, right: true }],
  [0.6, { hold: true }],
  [2.0, { thrust: true }],
];

const CASES = [
  { name: 'vacuum-low-g', level: { gravity: 28, width: 2400, height: 1400, groundBase: 300, rough: 150, fuel: 200, pads: [{ mult: 2, width: 200 }] } },
  { name: 'vacuum-high-g', level: { gravity: 66, width: 2400, height: 1400, groundBase: 300, rough: 150, fuel: 200, pads: [{ mult: 2, width: 200 }] } },
  { name: 'atmosphere', level: { gravity: 42, width: 2400, height: 1400, groundBase: 300, rough: 150, fuel: 200, wind: 26, gust: 14, drag: 0.16, pads: [{ mult: 2, width: 200 }] } },
  { name: 'direct-steering', settings: { steering: 'direct', invertRotation: false }, level: { gravity: 32, width: 2400, height: 1400, groundBase: 300, rough: 150, fuel: 200, pads: [{ mult: 2, width: 200 }] } },
];

function run(c) {
  const terrain = new Terrain(c.level, 4242);
  const ship = new Ship();
  ship.reset(600, 200, c.level.fuel);
  const settings = c.settings || { steering: 'classic', invertRotation: false };
  const dt = 1 / 120;
  let t = 0;
  const samples = [];
  for (const [dur, input] of SCRIPT) {
    const full = { thrust: false, left: false, right: false, hold: false, ...input };
    for (let i = 0; i < Math.round(dur / dt); i++) {
      if (!ship.alive || ship.landed) break;
      ship.step(dt, full, c.level, terrain, t, settings);
      t += dt;
    }
    samples.push([ship.x, ship.y, ship.vx, ship.vy, ship.angle, ship.fuel]
      .map((v) => v.toFixed(4)).join(','));
  }
  return samples;
}

const now = {};
for (const c of CASES) now[c.name] = run(c);

if (process.argv.includes('--record')) {
  writeFileSync(FIXTURE, JSON.stringify(now, null, 2) + '\n');
  console.log(`recorded ${CASES.length} physics cases`);
  process.exit(0);
}

const expected = JSON.parse(readFileSync(FIXTURE, 'utf8'));
let diffs = 0;
for (const name of Object.keys(now)) {
  (expected[name] || []).forEach((v, i) => {
    if (v !== now[name][i]) {
      console.log(`  CHANGED  ${name} step ${i}\n             was ${v}\n             now ${now[name][i]}`);
      diffs++;
    }
  });
}
console.log(`\nphysics fixture: ${diffs === 0 ? 'unchanged' : `${diffs} differences`}`);
process.exit(diffs ? 1 : 0);
