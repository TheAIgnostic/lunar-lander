// What each map can actually field, so the authored number means something.
import { Terrain } from '../src/terrain.js';
import { placeEnemies } from '../src/enemies.js';
import { MOON_MISSIONS, MARS_MISSIONS, EUROPA_MISSIONS, missionToLevel } from '../src/missions.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 37);
const MISSIONS = [...MOON_MISSIONS, ...MARS_MISSIONS, ...EUROPA_MISSIONS].filter((m) => m.enemyBudget > 0);

for (const m of MISSIONS) {
  const row = [];
  let best = 0;
  for (const b of [2, 3, 4, 5, 6, 7]) {
    const lvl = missionToLevel({ ...m, enemyBudget: b, structures: Math.min(5, b) });
    let p = 0, min = 99;
    for (const seed of SEEDS) {
      const n = placeEnemies(lvl, new Terrain(lvl, seed), seed).length;
      p += n; min = Math.min(min, n);
    }
    const fill = p / (b * SEEDS.length);
    row.push(`${b}:${(p / SEEDS.length).toFixed(1)}(${(100 * fill).toFixed(0)}%,min${min})`);
    if (fill >= 0.95) best = b;
  }
  console.log(`${m.id.padEnd(9)} now ${m.enemyBudget}  capacity ${best}   ${row.join(' ')}`);
}
