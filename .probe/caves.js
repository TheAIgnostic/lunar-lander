// The two single-pad caves, where the sanctuary IS the prize: what budget still
// keeps "you can cross this unarmed" true?
import { Terrain } from '../src/terrain.js';
import { placeEnemies } from '../src/enemies.js';
import { flyMission } from '../test/pilot.js';
import { EUROPA_MISSIONS, missionToLevel } from '../src/missions.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => 700 + i * 53);
const nearIndex = (t) => t.pads.reduce((a, p, i) => ((p.tier || 0) < (t.pads[a].tier || 0) ? i : a), 0);

for (const idx of [1, 3]) {
  const m = EUROPA_MISSIONS[idx];
  console.log(`${m.id} ${m.name}   (pads ${m.pads.length}, cave ${!!m.cave})`);
  for (const budget of [1, 2, 3, 4]) {
    const lvl = missionToLevel({ ...m, enemyBudget: budget });
    let lost = 0, landed = 0, placed = 0, hullSum = 0;
    for (const seed of SEEDS) {
      const t = new Terrain(lvl, seed);
      placed += placeEnemies(lvl, t, seed).length;
      const r = flyMission(lvl, t, { padIndex: nearIndex(t), enemies: true });
      if (r.lostToFire) lost++;
      if (r.outcome === 'land') landed++;
      hullSum += r.hull;
    }
    const n = SEEDS.length;
    console.log(`   budget ${budget}: placed ${(placed / n).toFixed(1)}   lost to fire ${lost}/${n}   landed ${landed}/${n}   mean hull ${(hullSum / n).toFixed(0)}`);
  }
}
