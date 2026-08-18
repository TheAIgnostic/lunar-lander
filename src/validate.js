// Mission validation (roadmap section 5, layer 5 and the fairness rules).
//
// Structural checks only - geometry the generator can get wrong. Whether the
// mission can actually be *flown* is proven separately by simulating it, since
// only a flight accounts for momentum and fuel.

import { DEG, clamp } from './util.js';
import { SHIP } from './ship.js';
import { spawnFor } from './spawn.js';

export const VALIDATION = {
  shipHalfWidth: 20,
  shipHeight: 32,
  spawnClearance: 90,      // px of free space needed around the start
  padApproachHeight: 150,  // vertical corridor that must be clear above a pad
  padApproachWidth: 34,    // half-width of that corridor
  minCorridor: 150,        // ground-to-ceiling gap a lander can pass through
  maxPadSlope: 8 * DEG,
  minPadWidth: 56,         // both feet plus a margin
};

/**
 * Returns { ok, problems[], notes{} }. Problems are hard failures: a player
 * should never be given this mission.
 */
export function validateTerrain(level, terrain, cfg = VALIDATION) {
  const problems = [];
  const notes = {};

  // --- spawn must be in open air, with room to react
  const start = spawnFor(level, terrain);
  notes.spawn = { x: Math.round(start.x), y: Math.round(start.y) };
  const groundAtSpawn = terrain.heightAt(start.x);
  if (start.y > groundAtSpawn - cfg.spawnClearance) {
    problems.push(`spawn is inside or too close to the ground (${Math.round(groundAtSpawn - start.y)} px clearance)`);
  }
  if (terrain.ceiling) {
    const roof = terrain.ceilingAt(start.x);
    if (start.y - roof < cfg.shipHeight) problems.push('spawn is inside the ceiling');
    if (groundAtSpawn - roof < cfg.minCorridor) problems.push('spawn sits in a corridor too tight to fly');
  }

  // --- every pad must be landable and approachable
  terrain.pads.forEach((pad, i) => {
    const mid = (pad.x1 + pad.x2) / 2;
    const width = pad.x2 - pad.x1;
    if (width < cfg.minPadWidth) problems.push(`pad ${i} is ${width.toFixed(0)} px wide, narrower than the lander's stance`);
    if (Math.abs(pad.slope || 0) > cfg.maxPadSlope) problems.push(`pad ${i} slopes ${((pad.slope || 0) / DEG).toFixed(1)}°, too steep to hold`);

    // a clear vertical corridor above the pad, so a final approach exists
    let blocked = 0;
    for (let dx = -cfg.padApproachWidth; dx <= cfg.padApproachWidth; dx += 6) {
      for (let dy = 20; dy <= cfg.padApproachHeight; dy += 12) {
        const x = mid + dx;
        const y = pad.y - dy;
        if (y > terrain.heightAt(x)) blocked++;
        if (terrain.ceiling && y < terrain.ceilingAt(x)) blocked++;
      }
    }
    if (blocked > 0) problems.push(`pad ${i} has ${blocked} obstructed samples in its approach corridor`);
    notes[`pad${i}`] = { mid: Math.round(mid), width: Math.round(width), kind: pad.kind };
  });

  // --- cave corridors must stay flyable end to end
  if (terrain.ceiling) {
    let minGap = Infinity;
    let pinch = 0;
    for (let i = 0; i < terrain.n; i++) {
      const gap = terrain.h[i] - terrain.ceiling[i];
      if (gap < minGap) { minGap = gap; pinch = i * terrain.step; }
    }
    notes.minCorridor = Math.round(minGap);
    if (minGap < cfg.minCorridor) {
      problems.push(`corridor pinches to ${minGap.toFixed(0)} px at x=${pinch.toFixed(0)}, tighter than ${cfg.minCorridor}`);
    }
  }

  // --- no lethal overhang that can trap a lander: a ceiling level must not
  //     have a downward spike that closes a corridor faster than the ship can
  //     react at cruise speed
  if (terrain.ceiling) {
    for (let i = 1; i < terrain.n; i++) {
      const d = Math.abs(terrain.ceiling[i] - terrain.ceiling[i - 1]) / terrain.step;
      if (d > 3.5) { problems.push(`ceiling steps ${d.toFixed(1)}:1 at x=${(i * terrain.step).toFixed(0)} - an unavoidable overhang`); break; }
    }
  }

  // --- fuel must be sufficient in principle: a lower bound on the delta-v to
  //     cancel the fall and cross to the pad, versus what the tank can deliver
  const best = terrain.pads.reduce((a, b) => (b.mult > a.mult ? b : a), terrain.pads[0]);
  const dx = Math.abs((best.x1 + best.x2) / 2 - start.x);
  const fallHeight = Math.max(0, best.y - start.y);
  const vImpact = Math.sqrt(Math.max(0, 2 * level.gravity * fallHeight));
  const flightTime = Math.max(6, Math.sqrt(2 * fallHeight / Math.max(level.gravity, 1)));
  const dvNeeded = vImpact + 2 * Math.sqrt(dx * level.gravity * 0.35) + level.gravity * flightTime * 0.5;
  const dvAvailable = (level.fuel / SHIP.burnMain) * SHIP.thrust;
  notes.deltaV = { needed: Math.round(dvNeeded), available: Math.round(dvAvailable) };
  if (dvAvailable < dvNeeded) {
    problems.push(`fuel budget is short: ~${Math.round(dvNeeded)} px/s of delta-v needed, ${Math.round(dvAvailable)} available`);
  }

  return { ok: problems.length === 0, problems, notes };
}
