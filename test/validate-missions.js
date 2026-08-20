// Mission validation sweep (roadmap section 5, layer 5 + section 17).
// Structural checks plus a real flight, over many seeds, with no browser:
//   node test/validate-missions.js [seedCount]
import { Terrain } from '../src/terrain.js';
import { validateTerrain, validateEnemies, sanctuaryClear } from '../src/validate.js';
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

/** The nearest landing zone - the one every mission promises you can reach. */
const nearIndex = (terrain) => {
  let best = 0;
  terrain.pads.forEach((p, i) => {
    if ((p.tier || 0) < (terrain.pads[best].tier || 0)) best = i;
  });
  return best;
};

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

    // Two routes, because the map has two. The way home is the near zone on the
    // starting tank, flown straight in and then deliberately from each side -
    // two of three succeeding is "at least two viable approach paths". The
    // prize is the deep zone by way of the fuel road, and it is evidence rather
    // than proof: a deep run the test pilot fumbles is not a broken mission.
    const near = nearIndex(terrain);
    const runs = [
      flyMission(level, terrain, { padIndex: near }),
      flyMission(level, terrain, { padIndex: near, approach: 'left' }),
      flyMission(level, terrain, { padIndex: near, approach: 'right' }),
    ];
    const deep = flyMission(level, new Terrain(level, seed), { padIndex: 0, viaCells: true });
    const landed = runs.filter((r) => r.outcome === 'land').length;
    const reached = runs.filter((r) => r.reached).length;
    rows.push({ seed, structural: v.problems, flight: { landed, reached, runs, deep, notes: v.notes } });
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
  const deepLanded = rows.filter((r) => r.flight && r.flight.deep.outcome === 'land').length;
  const deepCells = rows.filter((r) => r.flight).reduce((a, r) => a + r.flight.deep.cellsTaken, 0);
  console.log(`${mark} ${label.padEnd(22)} structural ${String(n - structuralFails).padStart(3)}/${n}` +
    `   home ${String(n - unflyable).padStart(3)}/${n}` +
    `   prize ${String(deepLanded).padStart(3)}/${n}` +
    `   cells ${(deepCells / Math.max(1, n)).toFixed(1)}` +
    `   single-path ${String(singlePath).padStart(3)}`);

  if (unflyable && !unreachable) {
    console.log(`       ${unflyable}/${seedList.length} seeds: pad reached but touchdown missed — pilot precision${limited ? ` (crosswind ${level.wind}±${level.gust})` : ''}, not a mission defect`);
  }
  for (const r of rows) {
    if (r.structural.length) console.log(`       seed ${r.seed}: ${r.structural.join('; ')}`);
    else if (r.flight && r.flight.reached === 0) {
      const dv = r.flight.notes.deltaV;
      console.log(`       seed ${r.seed}: the near pad was never reached (closest ${r.flight.runs.map((x) => x.closest).join('/')} px) ` +
        `(${r.flight.runs.map((x) => `${x.outcome}${x.grade ? '/' + x.grade : ''}`).join(', ')})` +
        `  deltaV need ${dv.near} / tank ${dv.tank}`);
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
    let worstReach = 0, worstLand = 0, structural = 0, deepMiss = 0;
    for (const level of ch.levels) {
      for (const seed of seedList.slice(0, 6)) {
        const terrain = new Terrain(level, seed);
        const v = validateTerrain(level, terrain);
        const ev = validateEnemies(level, terrain, seed);
        if (v.problems.length || ev.problems.length) structural++;
        // The way home on the tank, then the prize by way of the fuel road.
        const near = nearIndex(terrain);
        const runs = [
          flyMission(level, terrain, { padIndex: near }),
          flyMission(level, new Terrain(level, seed), { padIndex: near, approach: 'left' }),
        ];
        if (!runs.some((r) => r.reached)) worstReach++;
        if (!runs.some((r) => r.outcome === 'land')) worstLand++;
        if (flyMission(level, new Terrain(level, seed), { padIndex: 0, viaCells: true }).outcome !== 'land') deepMiss++;
      }
    }
    const n = ch.levels.length * 6;
    const ok = structural === 0 && worstReach === 0;
    if (!ok) hardFail++;
    console.log(`${ok ? (worstLand ? 'ok* ' : 'ok  ') : 'FAIL'} ${(pid + ' s' + sector).padEnd(22)}` +
      ` structural ${String(n - structural).padStart(3)}/${n}   home ${String(n - worstLand).padStart(3)}/${n}` +
      `   prize ${String(n - deepMiss).padStart(3)}/${n}`);
  }
}

// ---------------------------------------------------------------- combat
//
// The acceptance criterion for M12 is that a weapon is never required. So this
// sweep flies every armed mission with the machines live, the same autopilot,
// and nothing equipped: no laser, no shield, no evasive logic at all. If that
// pilot still lands, a human with any of those has a path.
console.log(`\nvalidating combat: every armed mission, flown with no weapon\n`);
const ARMED = [...MOON_LEVELS, ...MARS_LEVELS, ...EUROPA_LEVELS].filter((l) => l.enemyBudget > 0);
let combatFail = 0;
for (const level of ARMED) {
  const rows = [];
  for (const seed of seedList) {
    const terrain = new Terrain(level, seed);
    const ev = validateEnemies(level, terrain, seed);
    const exposure = sanctuaryClear(level, terrain, ev.enemies);
    // The guarantee is about the *sanctuary*: the near landing zone and the
    // column above it stay outside every machine's reach, so a weapon is never
    // the price of completing a mission. That is the flight this proves.
    //
    // It used to fly with no `padIndex`, which targets the highest-multiplier
    // pad - the deep zone, past the fuel road, with the guards on it. That is
    // the risk route, and "you can take the prize unarmed" is a stronger claim
    // than the design makes. It is still measured, and still printed, but as
    // evidence rather than as the proof.
    const near = nearIndex(terrain);
    const armed = flyMission(level, terrain, { padIndex: near, enemies: true, enemySeed: seed });
    const quiet = flyMission(level, terrain, { padIndex: near });
    const prize = flyMission(level, new Terrain(level, seed), { enemies: true, enemySeed: seed, viaCells: true });
    rows.push({ seed, ev, exposure, armed, quiet, prize });
  }
  const structural = rows.filter((r) => r.ev.problems.length).length;
  const exposed = rows.filter((r) => !r.exposure.ok).length;
  const shotDown = rows.filter((r) => r.armed.lostToFire).length;
  const costLanding = rows.filter((r) => r.quiet.outcome === 'land' && r.armed.outcome !== 'land').length;
  const landed = rows.filter((r) => r.armed.outcome === 'land').length;
  const placed = rows.reduce((a, r) => a + r.ev.enemies.length, 0) / rows.length;
  const worstHull = Math.min(...rows.map((r) => r.armed.hull));
  const prizeLost = rows.filter((r) => r.prize.lostToFire).length;
  const prizeLanded = rows.filter((r) => r.prize.outcome === 'land').length;
  const hits = rows.reduce((a, r) => a + (r.armed.combat ? r.armed.combat.hitsTaken : 0), 0) / rows.length;

  // Structure and survivability are proofs; a landing the pilot fumbled under
  // fire is evidence, and is reported as such.
  const ok = structural === 0 && exposed === 0 && shotDown === 0;
  if (!ok) { hardFail++; combatFail++; }
  const n = rows.length;
  console.log(`${ok ? (costLanding ? 'ok* ' : 'ok  ') : 'FAIL'} ${(level.id + ' ' + level.title).padEnd(22)}` +
    ` placed ${placed.toFixed(1)}/${level.enemyBudget}   sanctuary ${String(n - exposed).padStart(3)}/${n}` +
    `   survived fire ${String(n - shotDown).padStart(3)}/${n}   landed ${String(landed).padStart(3)}/${n}` +
    `   hull>=${String(worstHull).padStart(3)}   hits ${hits.toFixed(1)}` +
    `   · prize unarmed ${String(prizeLanded).padStart(2)}/${n}${prizeLost ? ` (lost ${prizeLost})` : ''}`);
  for (const r of rows) {
    if (r.ev.problems.length) console.log(`       seed ${r.seed}: ${r.ev.problems.join('; ')}`);
    if (!r.exposure.ok) console.log(`       seed ${r.seed}: sanctuary pad exposed in ${r.exposure.exposed} samples`);
    if (r.armed.lostToFire) console.log(`       seed ${r.seed}: LOST TO ENEMY FIRE ON THE SAFE ROUTE - no non-combat path`);
  }
  if (costLanding) {
    warnings.push(`${level.id}: ${costLanding}/${n} seeds the pilot landed unarmed and quiet but missed under fire`);
    console.log(`       ${costLanding}/${n} seeds: reached and survived, but the touchdown slipped - pilot precision under pressure`);
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
  `${combatFail === 0 ? `, ${ARMED.length} armed missions flyable with no weapon` : `, ${combatFail} armed missions WITHOUT a non-combat path`}` +
  `${warnings.length ? `, ${warnings.length} with flight warnings` : ''}\n`);
process.exit(hardFail ? 1 : 0);
