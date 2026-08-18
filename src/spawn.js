// Where a mission starts. Extracted from the game loop so the validator can
// test the real spawn state - the roadmap requires spawn position and momentum
// to be part of validation, not assumed.

import { clamp } from './util.js';

/** Deterministic starting state for a level+terrain pair. */
export function spawnFor(level, terrain) {
  const pads = terrain.pads;
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
