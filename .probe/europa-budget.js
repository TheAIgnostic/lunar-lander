// What budget can a single-pad cave carry and still promise an unarmed way in?
import { Terrain } from '../src/terrain.js';
import { placeEnemies } from '../src/enemies.js';
import { flyMission } from '../test/pilot.js';
import { EUROPA_MISSIONS, missionToLevel } from '../src/missions.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 37);
const nearIndex = (t) => t.pads.reduce((a, p, i) => ((p.tier || 0) < (t.pads[a].tier || 0) ? i : a), 0);

for (const idx of [1, 2, 3, 4]) {
  const m = EUROPA_MISSIONS[idx];
  const line = [];
  for (const budget of [2, 3, 4, 5]) {
    const lvl = missionToLevel({ ...m, enemyBudget: budget });
    let lost = 0, landed = 0, hullMin = 100, placed = 0;
    for (const seed of SEEDS) {
      const t = new Terrain(lvl, seed);
      placed += placeEnemies(lvl, t, seed).length;
      const r = flyMission(lvl, t, { padIndex: nearIndex(t), enemies: true });
      if (r.lostToFire) lost++;
      if (r.outcome === 'land') landed++;
      hullMin = Math.min(hullMin, r.hull);
    }
    line.push(`b${budget}: placed ${(placed / SEEDS.length).toFixed(1)} lost ${lost} landed ${landed} hull>=${hullMin}`);
  }
  console.log(`${m.id} ${m.name}`);
  for (const l of line) console.log('   ' + l);
}
