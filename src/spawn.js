// Where a mission starts. Extracted from the game loop so the validator can
// test the real spawn state - the roadmap requires spawn position and momentum
// to be part of validation, not assumed.

import { clamp } from './util.js';

/**
 * Deterministic starting state for a level+terrain pair.
 *
 * The terrain owns the entry point now. It used to be derived here, as an
 * offset from the highest-multiplier pad, which made every mission exactly 30%
 * of its own width long - the same traverse fifteen times - and occasionally
 * dropped the lander directly above a landing zone with nothing to fly to.
 * Legacy levels keep the old rule, because the classic campaign is laid out
 * around it.
 */
export function spawnFor(level, terrain) {
  const pads = terrain.pads;
  if (terrain.entry) {
    const x = clamp(terrain.entry.x, 140, level.width - 140);
    let y = level.height * 0.14;
    if (terrain.ceiling) {
      y = clamp((terrain.ceilingAt(x) + terrain.heightAt(x)) / 2, 0, level.height);
    }
    // Enter with a little momentum in the direction the map runs.
    return { x, y, vx: terrain.entry.dir * 22, vy: 6 };
  }

  const best = pads.reduce((a, b) => (b.mult > a.mult ? b : a), pads[0]);
  const bestMid = (best.x1 + best.x2) / 2;
  const dir = bestMid > level.width / 2 ? -1 : 1;
  const x = clamp(bestMid + dir * level.width * 0.3, 140, level.width - 140);

  let y = level.height * 0.14;
  if (terrain.ceiling) {
    y = clamp((terrain.ceilingAt(x) + terrain.heightAt(x)) / 2, 0, level.height);
  }
  return { x, y, vx: bestMid > x ? 22 : -22, vy: 6 };
}
