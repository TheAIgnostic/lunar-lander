// M21: how many machines can engage a lander at the same time, along the route
// it actually flies. "Two to three times as many" has to mean more across the
// map, not four at once in a fight.
import { Terrain } from '../src/terrain.js';
import { placeEnemies, ENEMY_TYPES, lineOfSight } from '../src/enemies.js';
import { spawnFor } from '../src/spawn.js';
import { MOON_LEVELS, MARS_LEVELS, EUROPA_LEVELS } from '../src/missions.js';

const N = +(process.argv[2] || 20);
const SEEDS = Array.from({ length: N }, (_, i) => 1000 + i * 37);
const ALL = [...MOON_LEVELS, ...MARS_LEVELS, ...EUROPA_LEVELS];

// Sample the deep route: the glide line from the entry to the prize, flown low.
function routePoints(level, t) {
  const start = spawnFor(level, t);
  const prize = t.pads.reduce((a, p) => ((p.tier || 0) > (a.tier || 0) ? p : a), t.pads[0]);
  const px = (prize.x1 + prize.x2) / 2;
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const f = i / 40;
    const x = start.x + (px - start.x) * f;
    const ground = t.heightAt(x);
    const roofY = t.ceiling ? t.ceilingAt(x) : 0;
    const y = Math.max(roofY + 120, Math.min(ground - 150, start.y + (prize.y - 170 - start.y) * f));
    pts.push({ x, y });
  }
  return pts;
}

let total = 0, maxAtOnce = 0, sumMax = 0, sumMean = 0, k = 0, zero = 0, samples = 0;
const hist = {};
console.log('mission              placed   engaged at once: mean  max   route under fire');
for (const lvl of ALL) {
  let placed = 0, meanSum = 0, maxSum = 0, underFire = 0, pts = 0;
  for (const seed of SEEDS) {
    const t = new Terrain(lvl, seed);
    const es = placeEnemies(lvl, t, seed);
    placed += es.length;
    const route = routePoints(lvl, t);
    let mx = 0, sum = 0;
    for (const p of route) {
      let n = 0;
      for (const e of es) {
        const type = ENEMY_TYPES[e.type];
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > type.range || d < type.minRange) continue;
        if (!lineOfSight(t, e.x, e.y, p.x, p.y)) continue;
        n++;
      }
      hist[n] = (hist[n] || 0) + 1;
      if (n > mx) mx = n;
      sum += n; pts++; samples++;
      if (n > 0) underFire++;
      if (n > maxAtOnce) maxAtOnce = n;
    }
    meanSum += sum / route.length; maxSum += mx;
  }
  const n = SEEDS.length;
  total += placed;
  sumMean += meanSum / n; sumMax += maxSum / n; k++;
  console.log(`${lvl.id.padEnd(9)} ${lvl.title.slice(0, 9).padEnd(10)} ${(placed / n).toFixed(2).padStart(6)}   ${(meanSum / n).toFixed(2).padStart(18)}  ${(maxSum / n).toFixed(2).padStart(4)}   ${(100 * underFire / pts).toFixed(0).padStart(14)}%`);
}
console.log(`\nmachines total ${(total / SEEDS.length).toFixed(0)} across ${ALL.length} missions`);
console.log(`engaged at once: mean ${(sumMean / k).toFixed(2)}  ·  worst-case seen ${maxAtOnce}  ·  per-seed max ${(sumMax / k).toFixed(2)}`);
const h = Object.entries(hist).sort((a, b) => +a[0] - +b[0])
  .map(([n, c]) => `${n}:${(100 * c / samples).toFixed(0)}%`).join('  ');
console.log(`share of route points with N guns on you   ${h}`);
