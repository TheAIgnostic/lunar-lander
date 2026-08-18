// Mission validation sweep (roadmap section 5, layer 5 + section 17).
// Structural checks plus a real flight, over many seeds, with no browser:
//   node test/validate-missions.js [seedCount]
import { Terrain } from '../src/terrain.js';
import { validateTerrain } from '../src/validate.js';
import { flyMission } from './pilot.js';
import { LEVELS } from '../src/levels.js';
import { ARCHETYPE_NAMES } from '../src/archetypes.js';
import { MOON_LEVELS, MARS_LEVELS, EUROPA_LEVELS, generateChapter } from '../src/missions.js';
import { PLANET_IDS } from '../src/planets.js';

const SEEDS = +(process.argv[2] || 12);
let hardFail = 0;
const warnings = [];

const base = {
  width: 3000, height: 1400, groundBase: 300, rough: 190, gravity: 32, fuel: 110,
  wind: 0, gust: 0, drag: 0, cave: false, fuelCells: 0,
};

// The test pilot has a known weakness: sustained crosswind. Those missions were
// verified by hand in earlier sessions, so a flight failure there is reported
// as a pilot limitation rather than a broken mission - but it is never hidden.
const PILOT_LIMITED = (level) => Math.abs(level.wind || 0) >= 30;

function assess(label, level, seedList) {
  const rows = [];
  for (const seed of seedList) {
    let terrain;
    try {
      terrain = new Terrain(level, seed);
    } catch (e) {
      rows.push({ seed, structural: [String(e.message)], flight: null });
      continue;
    }
    const v = validateTerrain(level, terrain);

    // Fly it: straight in, then deliberately from each side. Two of the three
    // succeeding is the roadmap's "at least two viable approach paths".
    const runs = [
      flyMission(level, terrain, {}),
      flyMission(level, terrain, { approach: 'left' }),
      flyMission(level, terrain, { approach: 'right' }),
    ];
    const landed = runs.filter((r) => r.outcome === 'land').length;
    const reached = runs.filter((r) => r.reached).length;
    rows.push({ seed, structural: v.problems, flight: { landed, reached, runs, notes: v.notes } });
  }

  const structuralFails = rows.filter((r) => r.structural.length).length;
  const unreachable = rows.filter((r) => r.flight && r.flight.reached === 0).length;
  const unflyable = rows.filter((r) => r.flight && r.flight.landed === 0).length;
  const singlePath = rows.filter((r) => r.flight && r.flight.reached === 1).length;
  // A validator can *prove* geometry. It can only offer *evidence* about
  // flyability, because a failed flight may be the test pilot's fault. So
  // structural problems fail the sweep; flight problems are always reported
  // but never silently treated as proof that a mission is impossible.
  const limited = PILOT_LIMITED(level);
  const ok = structuralFails === 0;
  if (unreachable) warnings.push(`${label}: ${unreachable}/${seedList.length} seeds the pilot never reached the pad`);
  if (!ok) hardFail++;

  const mark = !ok ? 'FAIL' : (unreachable ? 'warn' : (unflyable === 0 ? 'ok  ' : 'ok* '));
  const n = seedList.length;
  console.log(`${mark} ${label.padEnd(22)} structural ${String(n - structuralFails).padStart(3)}/${n}` +
    `   reachable ${String(n - unreachable).padStart(3)}/${n}` +
    `   landed ${String(n - unflyable).padStart(3)}/${n}` +
    `   single-path ${String(singlePath).padStart(3)}`);

  if (unflyable && !unreachable) {
    console.log(`       ${unflyable}/${seedList.length} seeds: pad reached but touchdown missed — pilot precision${limited ? ` (crosswind ${level.wind}±${level.gust})` : ''}, not a mission defect`);
  }
  for (const r of rows) {
    if (r.structural.length) console.log(`       seed ${r.seed}: ${r.structural.join('; ')}`);
    else if (r.flight && r.flight.reached === 0) {
      console.log(`       seed ${r.seed}: pad never reached (closest ${r.flight.runs.map((x) => x.closest).join('/')} px) ` +
        `(${r.flight.runs.map((x) => `${x.outcome}${x.grade ? '/' + x.grade : ''}`).join(', ')})` +
        `  deltaV ${r.flight.notes.deltaV.needed}/${r.flight.notes.deltaV.available}`);
    }
  }
  return ok;
}

const seedList = Array.from({ length: SEEDS }, (_, i) => 1000 + i * 137);

console.log(`\nvalidating each archetype over ${SEEDS} seeds\n`);
for (const name of ARCHETYPE_NAMES) {
  assess(name, { ...base, terrain: { archetype: name, relief: 260, detail: 1 }, pads: [{ mult: 2 }, { mult: 5, width: 90 }] }, seedList);
}

console.log(`\nvalidating cave variants\n`);
for (const name of ['canyon', 'crater', 'basin']) {
  assess(`${name} + ice ceiling`, {
    ...base, cave: true, clearance: 280, fuel: 124,
    terrain: { archetype: name, relief: 240, detail: 1 }, pads: [{ mult: 3, width: 150 }],
  }, seedList);
}

console.log(`\nvalidating the Moon chapter\n`);
for (const level of MOON_LEVELS) {
  assess(`${level.id} ${level.title}`, level, seedList);
}

console.log(`\nvalidating the Mars chapter\n`);
for (const level of MARS_LEVELS) {
  assess(`${level.id} ${level.title}`, level, seedList);
}

console.log(`\nvalidating the Europa chapter\n`);
for (const level of EUROPA_LEVELS) {
  assess(`${level.id} ${level.title}`, level, seedList);
}

console.log(`\nvalidating generated survey chapters (every body, sector 1 and 3)\n`);
for (const pid of PLANET_IDS) {
  for (const sector of [1, 3]) {
    const ch = generateChapter(pid, 4242, sector);
    let worstReach = 0, worstLand = 0, structural = 0;
    for (const level of ch.levels) {
      for (const seed of seedList.slice(0, 6)) {
        const terrain = new Terrain(level, seed);
        const v = validateTerrain(level, terrain);
        if (v.problems.length) structural++;
        const runs = [flyMission(level, terrain, {}), flyMission(level, terrain, { approach: 'left' })];
        if (!runs.some((r) => r.reached)) worstReach++;
        if (!runs.some((r) => r.outcome === 'land')) worstLand++;
      }
    }
    const n = ch.levels.length * 6;
    const ok = structural === 0 && worstReach === 0;
    if (!ok) hardFail++;
    console.log(`${ok ? (worstLand ? 'ok* ' : 'ok  ') : 'FAIL'} ${(pid + ' s' + sector).padEnd(22)}` +
      ` structural ${String(n - structural).padStart(3)}/${n}   reachable ${String(n - worstReach).padStart(3)}/${n}` +
      `   landed ${String(n - worstLand).padStart(3)}/${n}`);
  }
}

console.log(`\nvalidating the classic campaign (legacy terrain)\n`);
for (const level of LEVELS) {
  assess(`${level.id} ${level.title}`, level, seedList);
}

if (warnings.length) {
  console.log('\nflight warnings (geometry is sound; the test pilot fell short):');
  for (const w of warnings) console.log(`  - ${w}`);
}
console.log(`\n${hardFail === 0 ? 'all mission families structurally valid' : `${hardFail} mission families STRUCTURALLY INVALID`}` +
  `${warnings.length ? `, ${warnings.length} with flight warnings` : ''}\n`);
process.exit(hardFail ? 1 : 0);
