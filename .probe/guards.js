// M21 baseline: where the guards sit, and how many a player meets on a route.
import { Terrain } from '../src/terrain.js';
import { placeEnemies, ENEMY_TYPES, COMBAT } from '../src/enemies.js';
import { MOON_LEVELS, MARS_LEVELS, EUROPA_LEVELS } from '../src/missions.js';

const N = +(process.argv[2] || 20);
const SEEDS = Array.from({ length: N }, (_, i) => 1000 + i * 37);
const ALL = [...MOON_LEVELS, ...MARS_LEVELS, ...EUROPA_LEVELS];

// How level is the ground a ground gun stands on, and how far does the surface
// under its own footprint vary? A turret half-buried in a slope is one whose
// footprint spans a big height range.
let rows = [];
let slopes = [], foot = [], counts = [], perMission = [];
for (const lvl of ALL) {
  let n = 0, ns = 0, sSum = 0, fSum = 0, worstFoot = 0, buried = 0;
  for (const seed of SEEDS) {
    const t = new Terrain(lvl, seed);
    const es = placeEnemies(lvl, t, seed);
    n += es.length;
    for (const e of es) {
      const type = ENEMY_TYPES[e.type];
      if (type.kind !== 'ground') continue;
      ns++;
      const s = Math.abs(t.slopeAt(e.x));
      sSum += s; slopes.push(s);
      // the ground across the machine's own width
      const r = type.radius;
      let lo = Infinity, hi = -Infinity;
      for (let d = -r; d <= r; d += 2) {
        const h = t.heightAt(e.x + d);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      const span = hi - lo;
      fSum += span; foot.push(span);
      worstFoot = Math.max(worstFoot, span);
      if (span > r) buried++;             // more than a radius of height across its base
    }
  }
  counts.push(n / SEEDS.length);
  perMission.push({ id: lvl.id, title: lvl.title, budget: lvl.enemyBudget, placed: n / SEEDS.length,
    slope: ns ? sSum / ns : 0, foot: ns ? fSum / ns : 0, worstFoot, buried, ground: ns });
}

console.log('mission            budget placed  gnd  mean|slope|  mean base span  worst  half-buried');
for (const r of perMission) {
  console.log(`${r.id.padEnd(9)} ${r.title.slice(0, 8).padEnd(9)} ${String(r.budget).padStart(4)}  ${r.placed.toFixed(2).padStart(5)}  ${String(r.ground).padStart(3)}  ${r.slope.toFixed(3).padStart(9)}  ${r.foot.toFixed(1).padStart(13)}  ${r.worstFoot.toFixed(0).padStart(5)}  ${String(r.buried).padStart(10)}`);
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const pct = (a, v) => (100 * a.filter((x) => x > v).length / Math.max(1, a.length)).toFixed(0);
console.log(`\nground guns: ${slopes.length}   mean |slope| ${mean(slopes).toFixed(3)}   over 0.30: ${pct(slopes, 0.3)}%   over 0.40: ${pct(slopes, 0.4)}%`);
console.log(`base span: mean ${mean(foot).toFixed(1)} px   over 16 px (a radius): ${pct(foot, 16)}%   over 24: ${pct(foot, 24)}%`);
console.log(`machines placed per mission: mean ${mean(counts).toFixed(2)}   total budget ${ALL.reduce((a, l) => a + (l.enemyBudget || 0), 0)}`);
