// The encounter audit: what a player actually meets in the world.
//
//   node test/encounter-audit.js [seeds]
//
// The other sweeps ask whether a mission *can* be flown. This one asks what is
// out there when you fly it: how often you are shot at, what there is to pick
// up, and what the two routes cost. It exists because M14 shipped working
// systems onto content that never invoked them - nine of fifteen missions had
// no enemies and eleven had nothing to recover, and no test noticed, because
// every test was asking a different question.
//
// Each mission is flown twice per seed: the safe route to the near zone on the
// starting tank, and the deep route to the prize by way of the fuel road.
import { Terrain } from '../src/terrain.js';
import { flyMission } from './pilot.js';
import { cargoFor } from '../src/objectives.js';
import { MOON_LEVELS, MARS_LEVELS, EUROPA_LEVELS } from '../src/missions.js';
import { placeEnemies, ENEMY_TYPES, lineOfSight } from '../src/enemies.js';

const SEEDS = +(process.argv[2] || 20);
const seedList = Array.from({ length: SEEDS }, (_, i) => 1000 + i * 137);
const AUTHORED = [...MOON_LEVELS, ...MARS_LEVELS, ...EUROPA_LEVELS];

/** The near landing zone: the one the mission promises is always reachable. */
const nearIndex = (terrain) => {
  let best = 0;
  terrain.pads.forEach((p, i) => { if ((p.tier || 0) < (terrain.pads[best].tier || 0)) best = i; });
  return best;
};

const mean = (rows, f) => (rows.length ? rows.reduce((a, r) => a + f(r), 0) / rows.length : 0);
const shotAt = (r) => !!(r.combat && r.combat.shotsFired > 0);

/**
 * `route` is one of:
 *   safe     the near zone on the starting tank
 *   deep     the prize by way of the fuel road
 *   collect  the prize by way of the road *and* every deposit on it
 *
 * The third exists because the control law will never detour for something it
 * was not told to fly to, so "the autopilot collected nothing" says nothing
 * about whether the ore can be had. This is the measurement that does.
 */
function fly(level, seed, route) {
  const terrain = new Terrain(level, seed);
  const armed = level.enemyBudget > 0;
  const opts = route === 'safe'
    ? { padIndex: nearIndex(terrain), enemies: armed, enemySeed: seed }
    : { padIndex: 0, viaCells: true, enemies: armed, enemySeed: seed, maxSeconds: 150 };
  if (route === 'collect') opts.viaMaterial = true;
  const r = flyMission(level, terrain, opts);
  // What the world offered versus what the flight came home with.
  r.nodes = (terrain.materialNodes || []).length;
  r.nodesTaken = (terrain.materialNodes || []).filter((n) => n.taken).length;
  r.hasCargo = (terrain.cargo || []).length > 0;
  // How far the ore lies from the nearest machine. The roadmap asks for one
  // rule serving both - guards on the prize, ore on the prize - so this is the
  // number that says whether that actually happened.
  r.guardGap = [];
  if (armed) {
    const machines = placeEnemies(level, terrain, seed);
    for (const n of terrain.materialNodes || []) {
      if (!machines.length) continue;
      r.guardGap.push(Math.round(Math.min(...machines.map((e) => Math.hypot(e.x - n.x, e.y - n.y)))));
    }
  }
  return r;
}

console.log(`encounter audit - ${AUTHORED.length} missions x ${SEEDS} seeds, both routes\n`);
console.log('                       SAFE ROUTE                  DEEP ROUTE                        COLLECTING');
console.log('mission             land  secs  shot-at  mat     land  secs  shot-at  cells  nodes   mat  cargo  land  nodes   mat');

let safeShot = 0, deepShot = 0, safeFlights = 0, deepFlights = 0;
let noEnemies = 0, nothingToTake = 0;
const perPlanet = {};
const rows = [];

for (const level of AUTHORED) {
  const safe = seedList.map((s) => fly(level, s, 'safe'));
  const deep = seedList.map((s) => fly(level, s, 'deep'));
  const grab = seedList.map((s) => fly(level, s, 'collect'));
  safeShot += safe.filter(shotAt).length;
  deepShot += deep.filter(shotAt).length;
  safeFlights += safe.length;
  deepFlights += deep.length;

  const nodes = mean(deep, (r) => r.nodes);
  const taken = mean(deep, (r) => r.nodesTaken);
  const cargo = deep.some((r) => r.hasCargo);
  if (!level.enemyBudget) noEnemies++;
  // "Nothing to recover" means the mission offers no physical object at all -
  // no cargo objective and no material node. That is the count Tom's report
  // came down to: he flew out and there was nothing there.
  if (!cargo && nodes === 0) nothingToTake++;
  const planet = level.planet;
  perPlanet[planet] = perPlanet[planet] || { missions: 0, armed: 0, recoverable: 0 };
  perPlanet[planet].missions++;
  if (level.enemyBudget) perPlanet[planet].armed++;
  if (cargo || nodes > 0) perPlanet[planet].recoverable++;

  const name = `${level.id} ${level.title}`.slice(0, 19).padEnd(19);
  console.log(`${name} ${String(safe.filter((r) => r.outcome === 'land').length).padStart(2)}/${SEEDS}` +
    ` ${String(Math.round(mean(safe, (r) => r.simSecs))).padStart(4)}s` +
    ` ${String(safe.filter(shotAt).length).padStart(5)}/${SEEDS}` +
    ` ${mean(safe, (r) => r.carried.material).toFixed(0).padStart(4)}` +
    `    ${String(deep.filter((r) => r.outcome === 'land').length).padStart(2)}/${SEEDS}` +
    ` ${String(Math.round(mean(deep, (r) => r.simSecs))).padStart(4)}s` +
    ` ${String(deep.filter(shotAt).length).padStart(5)}/${SEEDS}` +
    ` ${mean(deep, (r) => r.cellsTaken).toFixed(1).padStart(6)}` +
    ` ${(nodes ? `${taken.toFixed(1)}/${nodes.toFixed(1)}` : '  —').padStart(7)}` +
    ` ${mean(deep, (r) => r.carried.material).toFixed(0).padStart(5)}` +
    `  ${cargo ? 'yes' : ' no'}` +
    `   ${String(grab.filter((r) => r.outcome === 'land').length).padStart(2)}/${SEEDS}` +
    ` ${mean(grab, (r) => r.carried.nodes).toFixed(1)}/${nodes.toFixed(1)}` +
    ` ${mean(grab, (r) => r.carried.material).toFixed(0).padStart(4)}`);
  rows.push({ level, safe, deep, grab, nodes, taken, cargo });
}

console.log(`\nflights that were shot at:  safe route ${safeShot}/${safeFlights}` +
  ` (${Math.round((safeShot / safeFlights) * 100)}%)   ` +
  `deep route ${deepShot}/${deepFlights} (${Math.round((deepShot / deepFlights) * 100)}%)`);

console.log('\ncontent distribution\n');
console.log(`  missions with no enemies at all        ${noEnemies} of ${AUTHORED.length}`);
console.log(`  missions with nothing to recover       ${nothingToTake} of ${AUTHORED.length}`);
for (const [p, v] of Object.entries(perPlanet)) {
  console.log(`  ${p.padEnd(8)} armed ${v.armed}/${v.missions}   with something to recover ${v.recoverable}/${v.missions}`);
}

// The deep route has to *cost* something, or the gradient is decoration.
const safeSecs = mean(rows.flatMap((r) => r.safe), (r) => r.simSecs);
const deepSecs = mean(rows.flatMap((r) => r.deep), (r) => r.simSecs);
console.log(`\n  flight time   safe ${safeSecs.toFixed(0)}s   deep ${deepSecs.toFixed(0)}s   (${(deepSecs / safeSecs).toFixed(2)}x)`);

// Is the ore where the guards are? One rule was supposed to serve both.
const gaps = rows.flatMap((r) => r.deep.flatMap((f) => f.guardGap)).sort((a, b) => a - b);
if (gaps.length) {
  const med = gaps[Math.floor(gaps.length / 2)];
  const within = gaps.filter((d) => d <= 600).length;
  console.log(`  ore to the nearest machine: median ${med} px · ${Math.round((within / gaps.length) * 100)}% within 600 px`);
}

// What a flight actually brings home, both ways round.
const safeMat = mean(rows.flatMap((r) => r.safe), (r) => r.carried.material);
const deepMat = mean(rows.flatMap((r) => r.deep), (r) => r.carried.material);
console.log(`  material carried home   safe ${safeMat.toFixed(0)}   deep ${deepMat.toFixed(0)}`);

// Can the reward actually be taken? The claim M15 rests on.
const grabLanded = rows.reduce((a, r) => a + r.grab.filter((f) => f.outcome === 'land').length, 0);
const grabFlown = rows.reduce((a, r) => a + r.grab.length, 0);
const grabTaken = mean(rows.flatMap((r) => r.grab), (r) => r.carried.nodes);
const grabOffered = mean(rows.flatMap((r) => r.grab), (r) => r.nodes);
console.log(`  collecting the lot: ${grabLanded}/${grabFlown} still land, ` +
  `${grabTaken.toFixed(1)} of ${grabOffered.toFixed(1)} deposits taken, ` +
  `${mean(rows.flatMap((r) => r.grab), (r) => r.carried.material).toFixed(0)} material carried home`);

// Armed missions only: on those, is the deep route actually contested?
const armedRows = rows.filter((r) => r.level.enemyBudget > 0);
if (armedRows.length) {
  const engaged = armedRows.reduce((a, r) => a + r.deep.filter(shotAt).length, 0);
  const flown = armedRows.reduce((a, r) => a + r.deep.length, 0);
  console.log(`  armed missions: engaged on the deep route ${engaged}/${flown} (${Math.round((engaged / flown) * 100)}%)`);

  // How crowded it actually gets. The spec's rule is "1-3 at once, rarely 4",
  // and M21's whole argument for more machines is that more *on the map* is not
  // more *on you* - so the audit has to report the thing being claimed. Every
  // point of air a lander can occupy, counting only machines that are in range
  // and can see it.
  const hist = {};
  let worst = 0;
  for (const r of armedRows) {
    for (const seed of seedList) {
      const terrain = new Terrain(r.level, seed);
      const machines = placeEnemies(r.level, terrain, seed);
      for (let x = 140; x < terrain.width - 140; x += 90) {
        const ground = terrain.heightAt(x);
        const roof = terrain.ceiling ? terrain.ceilingAt(x) + 60 : 130;
        for (let y = roof; y < ground - 40; y += 90) {
          let n = 0;
          for (const e of machines) {
            const type = ENEMY_TYPES[e.type];
            const d = Math.hypot(e.x - x, e.y - y);
            if (d > type.range || d < type.minRange) continue;
            if (!lineOfSight(terrain, e.x, e.y, x, y)) continue;
            n++;
          }
          hist[n] = (hist[n] || 0) + 1;
          if (n > worst) worst = n;
        }
      }
    }
  }
  const samples = Object.values(hist).reduce((a, b) => a + b, 0);
  const share = Object.keys(hist).sort((a, b) => +a - +b)
    .map((n) => `${n}:${(100 * hist[n] / samples).toFixed(1)}%`).join('  ');
  console.log(`  machines that can engage you at once   ${share}   (worst ${worst})`);
}
