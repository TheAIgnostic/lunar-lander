// Why does a machine fail to be placed? Mirrors placeEnemies' filters.
import { Terrain } from '../src/terrain.js';
import { ENEMY_TYPES, COMBAT, sanctuaryPad, sanctuaryGates, guardedPad } from '../src/enemies.js';
import { spawnFor } from '../src/spawn.js';
import { makeRng, clamp } from '../src/util.js';
import { MOON_LEVELS, MARS_LEVELS, EUROPA_LEVELS } from '../src/missions.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => 1000 + i * 37);
const ALL = [...MOON_LEVELS, ...MARS_LEVELS, ...EUROPA_LEVELS];
const tally = {};
const bump = (k) => { tally[k] = (tally[k] || 0) + 1; };

function footSpan(t, x, r) {
  let lo = Infinity, hi = -Infinity;
  for (let d = -r; d <= r; d += 2) { const h = t.heightAt(x + d); if (h < lo) lo = h; if (h > hi) hi = h; }
  return hi - lo;
}

let short = 0, want = 0, got = 0;
for (const level of ALL) {
  for (const seed of SEEDS) {
    const terrain = new Terrain(level, seed);
    const budget = Math.max(0, level.enemyBudget | 0);
    const sets = (level.enemySets || []).filter((id) => ENEMY_TYPES[id]);
    if (!budget || !sets.length) continue;
    want += budget;
    const rng = makeRng((((seed | 0) ^ 0x7f4a7c15) >>> 0) + 17);
    const start = spawnFor(level, terrain);
    const safe = sanctuaryPad(terrain);
    const gates = safe ? sanctuaryGates(safe) : null;
    const roofs = (terrain.structures || []).slice();
    const margin = 180;
    const out = [];
    const prize = guardedPad(terrain);
    const guardAt = prize ? (prize !== safe ? (prize.x1 + prize.x2) / 2 : (start.x + (prize.x1 + prize.x2) / 2) / 2) : null;
    for (let tries = 0; tries < COMBAT.placementTries && out.length < budget; tries++) {
      const type = ENEMY_TYPES[sets[out.length % sets.length]];
      const station = guardAt == null ? null : clamp(start.x + (guardAt - start.x) * (budget <= 1 ? 0.88
        : COMBAT.stationLo + (COMBAT.stationHi - COMBAT.stationLo) * (out.length / (budget - 1))), margin, level.width - margin);
      let perchIndex = -1;
      if (type.kind === 'ground' && roofs.length && rng() < COMBAT.perchShare) {
        perchIndex = 0;
        if (station != null) roofs.forEach((r, i) => { if (Math.abs(r.x - station) < Math.abs(roofs[perchIndex].x - station)) perchIndex = i; });
        else perchIndex = rng.int(0, roofs.length - 1);
      }
      const spread = COMBAT.stationJitter * (1 + (COMBAT.stationWiden - 1) * (tries / COMBAT.placementTries));
      const x = perchIndex >= 0 ? roofs[perchIndex].x
        : (station != null ? clamp(station + (rng() - 0.5) * spread, margin, level.width - margin) : rng.range(margin, level.width - margin));
      const ground = terrain.heightAt(x);
      const roof = terrain.ceiling ? terrain.ceilingAt(x) : -Infinity;
      let y;
      if (type.kind === 'ground') {
        if (terrain.padAt(x)) { bump('on a pad'); continue; }
        if (perchIndex >= 0) y = roofs[perchIndex].top - type.radius;
        else {
          if (Math.abs(terrain.slopeAt(x)) > COMBAT.groundSlope) { bump('slope too steep'); continue; }
          if (footSpan(terrain, x, type.radius) > COMBAT.footSpan) { bump('base not level'); continue; }
          y = ground - type.radius;
        }
        if (terrain.ceiling && y - roof < 120) { bump('no headroom'); continue; }
      } else {
        const hover = rng.range(COMBAT.hoverMin, COMBAT.hoverMax);
        y = ground - hover;
        if (terrain.ceiling && y - roof < 90) y = roof + 110;
        if (ground - y < 110) { bump('too near the deck'); continue; }
      }
      let clear = true;
      for (const p of terrain.pads) if (x > p.x1 - COMBAT.padGuard && x < p.x2 + COMBAT.padGuard) { clear = false; break; }
      if (!clear) { bump('pad guard'); continue; }
      if (Math.hypot(x - start.x, y - start.y) < COMBAT.spawnSafeRadius) { bump('too near the spawn'); continue; }
      if (gates) {
        const reach = type.range + COMBAT.sanctuaryMargin;
        if (gates.some((p) => Math.hypot(x - p.x, y - p.y) < reach)) { bump('sanctuary'); continue; }
      }
      if (out.some((e) => Math.hypot(e.x - x, e.y - y) < COMBAT.minSpacing)) { bump('too close to another'); continue; }
      out.push({ x, y });
      if (perchIndex >= 0) roofs.splice(perchIndex, 1);
    }
    got += out.length;
    if (out.length < budget) short++;
  }
}
console.log(`placed ${got}/${want}   seeds short of budget: ${short}`);
console.log('rejections:');
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${v}`);
