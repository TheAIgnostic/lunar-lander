// Exactly how often can N machines engage at once, over the whole route and the
// whole descent - the property the spec's "1-3 at once, rarely 4" is about.
import { Terrain } from '../src/terrain.js';
import { placeEnemies, ENEMY_TYPES, lineOfSight } from '../src/enemies.js';
import { spawnFor } from '../src/spawn.js';
import { MOON_LEVELS, MARS_LEVELS, EUROPA_LEVELS } from '../src/missions.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 37);
const ALL = [...MOON_LEVELS, ...MARS_LEVELS, ...EUROPA_LEVELS];

// A grid over all the air a lander can actually be in, not just one glide line.
function engagedGrid(level, t, es) {
  let worst = 0; const hist = {};
  for (let x = 120; x < t.width - 120; x += 60) {
    const ground = t.heightAt(x);
    const top = t.ceiling ? t.ceilingAt(x) + 60 : 120;
    for (let y = top; y < ground - 40; y += 70) {
      let n = 0;
      for (const e of es) {
        const type = ENEMY_TYPES[e.type];
        const d = Math.hypot(e.x - x, e.y - y);
        if (d > type.range || d < type.minRange) continue;
        if (!lineOfSight(t, e.x, e.y, x, y)) continue;
        n++;
      }
      hist[n] = (hist[n] || 0) + 1;
      if (n > worst) worst = n;
    }
  }
  return { worst, hist };
}

const all = {}; let worstAll = 0; const worstBy = {};
for (const lvl of ALL) {
  let w = 0;
  for (const seed of SEEDS) {
    const t = new Terrain(lvl, seed);
    const es = placeEnemies(lvl, t, seed);
    const { worst, hist } = engagedGrid(lvl, t, es);
    for (const [k, v] of Object.entries(hist)) all[k] = (all[k] || 0) + v;
    if (worst > w) w = worst;
    if (worst > worstAll) worstAll = worst;
  }
  worstBy[lvl.id] = w;
}
const tot = Object.values(all).reduce((a, b) => a + b, 0);
console.log('anywhere a lander can fly, how many machines can see it at once:');
for (const [k, v] of Object.entries(all).sort((a, b) => +a[0] - +b[0])) {
  console.log(`  ${k}: ${(100 * v / tot).toFixed(2)}%   (${v})`);
}
console.log(`worst anywhere: ${worstAll}`);
console.log('worst per mission:', Object.entries(worstBy).map(([k, v]) => `${k.slice(0, 8)}:${v}`).join(' '));
