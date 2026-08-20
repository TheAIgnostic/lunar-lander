// Does giving a mission more flat roofs let it field the machines it asked for?
import { Terrain } from '../src/terrain.js';
import { placeEnemies } from '../src/enemies.js';
import { MOON_MISSIONS, MARS_MISSIONS, EUROPA_MISSIONS, missionToLevel } from '../src/missions.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 37);
const MISSIONS = [...MOON_MISSIONS, ...MARS_MISSIONS, ...EUROPA_MISSIONS].filter((m) => m.enemyBudget > 0);

for (const factor of [0.8, 1.0, 1.3, 1.6, 2.0]) {
  let placed = 0, want = 0;
  const per = [];
  for (const m of MISSIONS) {
    const n = Math.min(9, Math.round(m.enemyBudget * factor));
    const lvl = missionToLevel({ ...m, structures: n });
    let p = 0;
    for (const seed of SEEDS) p += placeEnemies(lvl, new Terrain(lvl, seed), seed).length;
    placed += p; want += m.enemyBudget * SEEDS.length;
    per.push(`${m.id.slice(0, 8)}:${(p / SEEDS.length).toFixed(1)}/${m.enemyBudget}`);
  }
  console.log(`structures = budget x ${factor}:  filled ${placed}/${want} (${(100 * placed / want).toFixed(0)}%)`);
  console.log('    ' + per.join('  '));
}
