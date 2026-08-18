// Durable flight regression. Any change that alters how the lander flies shows
// up here as a diff, which is what "the controls must still feel like the
// original build" means in practice.
//
//   node test/flight-fixture.js          compare against the recorded fixture
//   node test/flight-fixture.js --record rewrite it (only with a reason)
import { readFileSync, writeFileSync } from 'node:fs';
import { Terrain } from '../src/terrain.js';
import { flyMission } from './pilot.js';
import { LEVELS } from '../src/levels.js';
import { MOON_LEVELS } from '../src/missions.js';

const FIXTURE = new URL('./flight-fixture.json', import.meta.url);
const SEEDS = [12345, 777, 2024];

function measure() {
  const out = {};
  for (const lvl of [...LEVELS, ...MOON_LEVELS]) {
    out[lvl.id] = SEEDS.map((seed) => {
      const r = flyMission(lvl, new Terrain(lvl, seed), {});
      return `${r.outcome}/${r.grade}/${r.fuelLeft}/${r.simSecs}`;
    });
  }
  return out;
}

const now = measure();

if (process.argv.includes('--record')) {
  writeFileSync(FIXTURE, JSON.stringify(now, null, 2) + '\n');
  console.log(`recorded ${Object.keys(now).length} missions x ${SEEDS.length} seeds`);
  process.exit(0);
}

let expected;
try {
  expected = JSON.parse(readFileSync(FIXTURE, 'utf8'));
} catch {
  console.error('no fixture yet - run: node test/flight-fixture.js --record');
  process.exit(1);
}

let diffs = 0;
for (const id of new Set([...Object.keys(expected), ...Object.keys(now)])) {
  const a = expected[id];
  const b = now[id];
  if (!a) { console.log(`  NEW      ${id}: ${b.join(' | ')}`); continue; }
  if (!b) { console.log(`  MISSING  ${id}`); diffs++; continue; }
  a.forEach((v, i) => {
    if (v !== b[i]) { console.log(`  CHANGED  ${id} seed ${SEEDS[i]}\n             was ${v}\n             now ${b[i]}`); diffs++; }
  });
}
console.log(`\nflight fixture: ${diffs === 0 ? 'unchanged' : `${diffs} differences`}`);
process.exit(diffs ? 1 : 0);
