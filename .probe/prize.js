// The deep route under fire, per Europa budget. The autopilot has no evasion at
// all, so this measures the pilot as much as the mission - but 0/20 tells you
// nothing either way, so find where it stops saturating.
import { Terrain } from '../src/terrain.js';
import { flyMission } from '../test/pilot.js';
import { EUROPA_MISSIONS, missionToLevel } from '../src/missions.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 37);
for (const idx of [2, 4]) {
  const m = EUROPA_MISSIONS[idx];
  console.log(`${m.id} ${m.name}`);
  for (const b of [2, 3, 4]) {
    const lvl = missionToLevel({ ...m, enemyBudget: b, structures: Math.min(5, b) });
    let quiet = 0, armed = 0, lost = 0, hull = 0;
    for (const seed of SEEDS) {
      if (flyMission(lvl, new Terrain(lvl, seed), { padIndex: 0, viaCells: true }).outcome === 'land') quiet++;
      const r = flyMission(lvl, new Terrain(lvl, seed), { padIndex: 0, viaCells: true, enemies: true });
      if (r.outcome === 'land') armed++;
      if (r.lostToFire) lost++;
      hull += r.hull;
    }
    console.log(`   budget ${b}: prize with no machines ${quiet}/20 · under fire ${armed}/20 (lost ${lost}) · mean hull ${(hull / 20).toFixed(0)}`);
  }
}
