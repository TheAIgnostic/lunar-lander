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
  { name: 'classic-steering', settings: { steering: 'classic', invertRotation: false }, level: { gravity: 32, width: 2400, height: 1400, groundBase: 300, rough: 150, fuel: 200, pads: [{ mult: 2, width: 200 }] } },
  { name: 'direct-steering', settings: { steering: 'direct', invertRotation: false }, level: { gravity: 32, width: 2400, height: 1400, groundBase: 300, rough: 150, fuel: 200, pads: [{ mult: 2, width: 200 }] } },
];

function run(c) {
  const terrain = new Terrain(c.level, 4242);
  const ship = new Ship();
  ship.reset(600, 200, c.level.fuel);
  // **Pinned to `pro`, which is the original rotation law to the digit.**
  // M29c split classic steering in two and made the *new* tuned mode the
  // default, so leaving this on the default would have quietly re-pointed the
  // M0 physics baseline at a different flight model. This fixture exists to
  // prove the original has not drifted, so it names the mode that is the
  // original. The new mode gets its own case below.
  const settings = c.settings || { steering: 'pro', invertRotation: false };
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
// **A case this file does not know about must be reported, not skipped.**
// This used to iterate `Object.keys(now)` and read `expected[name] || []`, so a
// newly added case compared against nothing and passed silently, and a case
// deleted from the fixture was never noticed at all. A regression test that can
// quietly test nothing is the M18 `pipefail` fault in another costume - found
// when M29c added a `classic-steering` case and the fixture cheerfully reported
// "unchanged" without ever having run it.
for (const name of new Set([...Object.keys(expected), ...Object.keys(now)])) {
  if (!expected[name]) { console.log(`  NEW      ${name} (${now[name].length} steps) - record to accept`); continue; }
  if (!now[name]) { console.log(`  MISSING  ${name}`); diffs++; continue; }
  if (expected[name].length !== now[name].length) {
    console.log(`  LENGTH   ${name}: was ${expected[name].length} steps, now ${now[name].length}`);
    diffs++;
  }
  expected[name].forEach((v, i) => {
    if (v !== now[name][i]) {
      console.log(`  CHANGED  ${name} step ${i}\n             was ${v}\n             now ${now[name][i]}`);
      diffs++;
    }
  });
}
console.log(`\nphysics fixture: ${diffs === 0 ? 'unchanged' : `${diffs} differences`}`);
process.exit(diffs ? 1 : 0);
