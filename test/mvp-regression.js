// The MVP regression (roadmap Phase 8).
//
//   node test/mvp-regression.js [seeds]
//
// Three questions, all of which have to answer yes before the MVP is done:
//   1. Does every mission in the game have a seed the autopilot can land on?
//   2. Does the simulation still run fast enough with the worst load on it?
//   3. Does a long session stay stable - no drift, no growth, no exceptions?
import { Terrain } from '../src/terrain.js';
import { flyMission } from './pilot.js';
import { Ship } from '../src/ship.js';
import { spawnFor } from '../src/spawn.js';
import { EnemyField, COMBAT } from '../src/enemies.js';
import { Abilities } from '../src/abilities.js';
import { LEVELS } from '../src/levels.js';
import { MOON_LEVELS, MARS_LEVELS, EUROPA_LEVELS } from '../src/missions.js';

const SEEDS = +(process.argv[2] || 12);
const seedList = Array.from({ length: SEEDS }, (_, i) => 1000 + i * 137);
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) return true;
  fail++;
  console.log(`  FAIL  ${name}  ${extra}`);
  return false;
};

const AUTHORED = [...MOON_LEVELS, ...MARS_LEVELS, ...EUROPA_LEVELS];

/** The near landing zone: the one the mission promises is always reachable. */
const nearIndex = (terrain) => {
  let best = 0;
  terrain.pads.forEach((p, i) => { if ((p.tier || 0) < (terrain.pads[best].tier || 0)) best = i; });
  return best;
};

function sweep(title, levels) {
  console.log(`\n${title}\n`);
  let landed = 0;
  let flights = 0;
  let deepLanded = 0;
  let deepFlights = 0;
  const tallies = { PERFECT: 0, GOOD: 0, HARD: 0 };
  for (const level of levels) {
    // The way home, on the starting tank. This is the acceptance criterion:
    // every mission has a seed the autopilot can complete.
    const rows = seedList.map((seed) => {
      const terrain = new Terrain(level, seed);
      return flyMission(level, terrain, {
        padIndex: nearIndex(terrain), enemies: level.enemyBudget > 0, enemySeed: seed,
      });
    });
    // And the deep run, by way of the fuel road - reported, never required.
    // Legacy levels have no distance tiers, so there is no deep run to fly.
    const tiered = new Terrain(level, seedList[0]).pads.some((p) => p.tier != null);
    const deep = tiered ? seedList.map((seed) => flyMission(level, new Terrain(level, seed), {
      padIndex: 0, viaCells: true, enemies: level.enemyBudget > 0, enemySeed: seed,
    })) : [];
    const deepOk = deep.filter((r) => r.outcome === 'land').length;
    deepLanded += deepOk;
    deepFlights += deep.length;
    const ok = rows.filter((r) => r.outcome === 'land');
    landed += ok.length;
    flights += rows.length;
    for (const r of ok) tallies[r.grade] = (tallies[r.grade] || 0) + 1;
    const fuel = ok.length ? Math.round(ok.reduce((a, r) => a + r.fuelLeft, 0) / ok.length / level.fuel * 100) : 0;
    const worstHull = Math.min(...rows.map((r) => (r.hull == null ? 100 : r.hull)));
    const best = ok.sort((a, b) => ({ HARD: 1, GOOD: 2, PERFECT: 3 }[b.grade] - { HARD: 1, GOOD: 2, PERFECT: 3 }[a.grade]))[0];

    // The acceptance criterion: a mission the autopilot can complete on at
    // least one seed. Everything else on this line is context for tuning.
    const pass = ok.length > 0;
    if (!pass) fail++;
    const cells = deep.length ? (deep.reduce((a, r) => a + r.cellsTaken, 0) / deep.length).toFixed(1) : '—';
    console.log(`${pass ? (ok.length >= seedList.length * 0.5 ? 'ok  ' : 'ok* ') : 'FAIL'} ` +
      `${(level.id + ' ' + level.title).padEnd(24)} home ${String(ok.length).padStart(3)}/${seedList.length}` +
      `   prize ${(deep.length ? `${deepOk}/${seedList.length}` : '   —').padStart(5)}  cells ${String(cells).padStart(3)}` +
      `   best ${(best ? best.grade : '—').padEnd(7)} fuel ${String(fuel).padStart(3)}%   hull>=${String(worstHull).padStart(3)}`);
  }
  return { landed, flights, tallies, deepLanded, deepFlights };
}

const a = sweep(`the 15-mission MVP, ${SEEDS} seeds each`, AUTHORED);
const c = sweep('the classic campaign', LEVELS);

const total = a.landed + c.landed;
const flights = a.flights + c.flights;
const grades = { ...a.tallies };
for (const [k, v] of Object.entries(c.tallies)) grades[k] = (grades[k] || 0) + v;
const deepTotal = a.deepLanded + c.deepLanded;
const deepFlown = a.deepFlights + c.deepFlights;
console.log(`\nhome ${total}/${flights} (${Math.round((total / flights) * 100)}%)  ` +
  `· prize ${deepTotal}/${deepFlown} (${Math.round((deepTotal / deepFlown) * 100)}%)  ` +
  Object.entries(grades).map(([k, v]) => `${k} ${Math.round((v / total) * 100)}%`).join('  '));

// ---------------------------------------------------------------- performance
//
// "Performance remains stable at the maximum intended enemy/projectile count."
// The budget is generous on purpose: what this catches is an accidental O(n^2),
// not a few microseconds.
console.log('\nperformance under the worst intended load\n');
{
  const level = { ...MARS_LEVELS[3], enemyBudget: 4, enemySets: ['sentry-turret', 'seeker-drone'] };
  const terrain = new Terrain(level, 4242);
  const ship = new Ship();
  const start = spawnFor(level, terrain);

  const time = (label, fn, steps) => {
    const t0 = process.hrtime.bigint();
    fn(steps);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const perStep = (ms / steps) * 1000;   // microseconds
    console.log(`  ${label.padEnd(34)} ${ms.toFixed(0)} ms for ${steps} steps  (${perStep.toFixed(1)} µs/step)`);
    return perStep;
  };

  time('physics only', (steps) => {
    ship.reset(start.x, start.y, level.fuel);
    const input = { thrust: true, left: false, right: false, hold: false };
    for (let i = 0; i < steps; i++) ship.step(1 / 120, input, level, terrain, i / 120);
  }, 20000);

  let peakShots = 0;
  let placed = 0;
  const loaded = time('physics + 4 machines firing + a laser', (steps) => {
    ship.reset(start.x, start.y, level.fuel);
    const field = new EnemyField(level, terrain, 4242);
    placed = field.enemies.length;
    const laser = new Abilities('pulse-laser', {});
    const input = { thrust: true, left: false, right: false, hold: false };
    // Park the lander inside everyone's engagement envelope and hold it there,
    // so this measures a fight rather than a quiet flight.
    const anchor = field.enemies.length
      ? { x: field.enemies[0].x + 260, y: field.enemies[0].y - 170 }
      : { x: start.x, y: start.y };
    for (let i = 0; i < steps; i++) {
      const t = i / 120;
      ship.step(1 / 120, input, level, terrain, t);
      ship.x = anchor.x; ship.y = anchor.y; ship.vx = 0; ship.vy = 0;
      ship.hull = 1e9;                                             // nothing dies
      ship.fuel = level.fuel;
      field.update(1 / 120, t, ship);
      laser.update(1 / 120, { ship, field });
      for (const e of field.enemies) { e.hp = e.maxHp; e.dead = false; }
      peakShots = Math.max(peakShots, field.shots.length);
    }
  }, 20000);

  console.log(`  machines placed                    ${placed}`);
  console.log(`  peak live projectiles              ${peakShots} (cap ${COMBAT.maxShots})`);
  check('the load test actually exchanged fire', peakShots > 0, 'no shots were fired');
  check('a loaded step still fits inside a 120 Hz budget', loaded < 8300 / 1000 * 1000, `${loaded.toFixed(1)} µs`);

  // How combat scales with the number of machines.
  //
  // This used to be `loaded < bare * 3` - a ratio against the physics-only
  // loop. That is not the O(n^2) canary it was written to be: `bare` runs after
  // the whole mission sweep has thoroughly warmed `ship.step`, so its number
  // moves with the JIT's history rather than with the engine's cost, and in M15
  // it failed on a change that adds no per-step combat work at all (material
  // nodes are placed once, at level generation). Measured directly instead:
  // cost per machine must not climb as machines are added, which is exactly
  // what an accidental all-pairs loop would do.
  const perMachine = [];
  for (const budget of [1, 4]) {
    const lvl = { ...level, enemyBudget: budget };
    const t2 = new Terrain(lvl, 4242);
    const s2 = new Ship();
    const st2 = spawnFor(lvl, t2);
    const f2 = new EnemyField(lvl, t2, 4242);
    if (!f2.enemies.length) continue;
    s2.reset(st2.x, st2.y, lvl.fuel);
    s2.x = f2.enemies[0].x + 260;
    s2.y = f2.enemies[0].y - 170;
    s2.hull = 1e9;
    const steps = 20000;
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < steps; i++) {
      f2.update(1 / 120, i / 120, s2);
      for (const e of f2.enemies) { e.hp = e.maxHp; e.dead = false; }
    }
    const us = Number(process.hrtime.bigint() - t0) / 1e6 / steps * 1000;
    perMachine.push({ n: f2.enemies.length, us, each: us / f2.enemies.length });
    console.log(`  ${f2.enemies.length} machine${f2.enemies.length === 1 ? ' ' : 's'} updating` +
      `${''.padEnd(19)} ${us.toFixed(2)} µs/step  (${(us / f2.enemies.length).toFixed(2)} each)`);
  }
  if (perMachine.length === 2) {
    const [one, many] = perMachine;
    check('combat cost per machine does not climb with the count',
      many.each < one.each * 1.5, `${one.each.toFixed(2)} -> ${many.each.toFixed(2)} µs each`);
  }
  check('projectiles stay capped', peakShots <= COMBAT.maxShots, String(peakShots));
}

// ---------------------------------------------------------------- long session
console.log('\na long session\n');
{
  // Sixty missions back to back, the way an evening of play looks. What this
  // catches is state that leaks between missions: growth, drift, or an
  // exception on the fortieth flight rather than the first.
  const missions = [...AUTHORED, ...LEVELS];
  const first = [];
  const last = [];
  let threw = null;
  try {
    for (let i = 0; i < 60; i++) {
      const level = missions[i % missions.length];
      const terrain = new Terrain(level, 5000 + i);
      const t0 = process.hrtime.bigint();
      const r = flyMission(level, terrain, { enemies: level.enemyBudget > 0, enemySeed: 5000 + i });
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      (i < 10 ? first : i >= 50 ? last : []).push(ms);
      if (!r || !r.outcome) throw new Error(`mission ${level.id} returned nothing`);
    }
  } catch (e) {
    threw = e;
  }
  const mean = (xs) => xs.reduce((x, y) => x + y, 0) / xs.length;
  check('sixty missions run without an exception', !threw, threw ? threw.message : '');
  if (!threw) {
    console.log(`  first ten ${mean(first).toFixed(1)} ms/mission · last ten ${mean(last).toFixed(1)} ms/mission`);
    check('the sixtieth mission costs what the first did', mean(last) < mean(first) * 2.5,
      `${mean(first).toFixed(1)} -> ${mean(last).toFixed(1)} ms`);
  }
}

// ---------------------------------------------------------------- determinism
{
  let same = true;
  let differs = false;
  for (const level of AUTHORED.slice(0, 5)) {
    const a1 = JSON.stringify(flyMission(level, new Terrain(level, 31337), { enemies: true, enemySeed: 31337 }));
    const a2 = JSON.stringify(flyMission(level, new Terrain(level, 31337), { enemies: true, enemySeed: 31337 }));
    const b1 = JSON.stringify(flyMission(level, new Terrain(level, 999), { enemies: true, enemySeed: 999 }));
    if (a1 !== a2) same = false;
    if (a1 !== b1) differs = true;
  }
  check('the same seed reproduces the same flight, enemies and all', same);
  check('a different seed does not', differs);
}

console.log(`\n${fail === 0 ? 'MVP regression passed' : `${fail} MVP regression failures`}\n`);
process.exit(fail ? 1 : 0);
