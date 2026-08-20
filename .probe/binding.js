// Which rule decides how many machines a map can hold?
import { Terrain } from '../src/terrain.js';
import { placeEnemies, COMBAT } from '../src/enemies.js';
import { MOON_LEVELS, MARS_LEVELS, EUROPA_LEVELS } from '../src/missions.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 37);
const ARMED = [...MOON_LEVELS, ...MARS_LEVELS, ...EUROPA_LEVELS].filter((l) => l.enemyBudget > 0);
const save = { ...COMBAT };

function fill(label) {
  let placed = 0, want = 0;
  for (const lvl of ARMED) {
    for (const seed of SEEDS) placed += placeEnemies(lvl, new Terrain(lvl, seed), seed).length;
    want += lvl.enemyBudget * SEEDS.length;
  }
  console.log(`${label.padEnd(34)} ${placed}/${want} (${(100 * placed / want).toFixed(0)}%)`);
}

fill('as shipped');
Object.assign(COMBAT, save, { maxAtOnce: 5 });        fill('at-once cap 5 instead of 4');
Object.assign(COMBAT, save, { maxAtOnce: 99 });       fill('no at-once cap');
Object.assign(COMBAT, save, { sanctuaryMargin: 0 });  fill('no sanctuary margin');
Object.assign(COMBAT, save, { groundSlope: 0.5, footSpan: 999 }); fill('old loose footing rules');
Object.assign(COMBAT, save, { minSpacing: 150 });     fill('tighter spacing allowed');
Object.assign(COMBAT, save, { placementTries: 2000 }); fill('4x the placement attempts');
Object.assign(COMBAT, save);
