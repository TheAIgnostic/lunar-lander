// Mission validation (roadmap section 5, layer 5 and the fairness rules).
//
// Structural checks only - geometry the generator can get wrong. Whether the
// mission can actually be *flown* is proven separately by simulating it, since
// only a flight accounts for momentum and fuel.

import { DEG, clamp } from './util.js';
import { SHIP } from './ship.js';
import { spawnFor } from './spawn.js';
import { COMBAT, ENEMY_TYPES, placeEnemies, sanctuaryPad, sanctuaryGates, lineOfSight } from './enemies.js';
import { MATERIAL_SITE } from './terrain.js';

export const VALIDATION = {
  shipHalfWidth: 20,
  shipHeight: 32,
  spawnClearance: 90,      // px of free space needed around the start
  padApproachHeight: 150,  // vertical corridor that must be clear above a pad
  padApproachWidth: 34,    // half-width of that corridor
  minCorridor: 150,        // ground-to-ceiling gap a lander can pass through
  maxPadSlope: 8 * DEG,
  minPadWidth: 56,         // both feet plus a margin
  materialClearance: 70,   // air a deposit must sit in, so it can be flown to
  fuelCellValue: 22,       // what one cell on the road is worth, for the range bound
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

  // --- fuel must be sufficient in principle, for *two* routes.
  //
  //     Since the map became a distance gradient there are two claims to prove,
  //     not one. The near zone must be reachable on the starting tank, because
  //     that is the promise that every mission can be completed with minimum
  //     gear. The deep zone is deliberately *not* reachable on the tank alone -
  //     that is the whole design - so it is measured against the tank plus the
  //     fuel road, and the road is what has to make it possible.
  const dvFor = (pad) => {
    const dx = Math.abs((pad.x1 + pad.x2) / 2 - start.x);
    const fallHeight = Math.max(0, pad.y - start.y);
    const vImpact = Math.sqrt(Math.max(0, 2 * level.gravity * fallHeight));
    const flightTime = Math.max(6, Math.sqrt(2 * fallHeight / Math.max(level.gravity, 1)));
    return vImpact + 2 * Math.sqrt(dx * level.gravity * 0.35) + level.gravity * flightTime * 0.5;
  };
  const dvOf = (fuel) => (fuel / SHIP.burnMain) * SHIP.thrust;
  const tiered = terrain.pads.some((p) => p.tier != null);
  const nearPad = tiered
    ? terrain.pads.reduce((a, b) => ((b.tier || 0) < (a.tier || 0) ? b : a), terrain.pads[0])
    : terrain.pads.reduce((a, b) => (b.mult > a.mult ? b : a), terrain.pads[0]);
  const deepPad = tiered
    ? terrain.pads.reduce((a, b) => ((b.tier || 0) > (a.tier || 0) ? b : a), terrain.pads[0])
    : nearPad;

  const tank = dvOf(level.fuel);
  const road = dvOf(level.fuel + terrain.fuelCells.length * cfg.fuelCellValue);
  const nearNeed = dvFor(nearPad);
  const deepNeed = dvFor(deepPad);
  notes.deltaV = {
    tank: Math.round(tank), road: Math.round(road),
    near: Math.round(nearNeed), deep: Math.round(deepNeed),
  };
  if (tank < nearNeed) {
    problems.push(`the near landing zone is out of range: ~${Math.round(nearNeed)} px/s of delta-v needed, ${Math.round(tank)} in the tank`);
  }
  if (deepPad !== nearPad && road < deepNeed) {
    problems.push(`the deep landing zone is unreachable even with the fuel road: ~${Math.round(deepNeed)} needed, ${Math.round(road)} available`);
  }

  // --- material must be an invitation, never a requirement
  //
  //     The rule this enforces is the same one the sanctuary enforces for
  //     enemies: the mission has to be completable while collecting nothing.
  //     The delta-v bound above is measured on the tank and the fuel road
  //     alone - deposits carry no fuel - so a mission can never come to depend
  //     on ore. What is left to check is that the ore is somewhere a player can
  //     actually get to, and nowhere that turns the safe landing into a detour.
  const nodes = terrain.materialNodes || [];
  notes.material = { count: nodes.length, tiers: [0, 1, 2].map((t) => nodes.filter((n) => n.tier === t).length) };
  const safePad = sanctuaryPad(terrain);
  const gates = safePad ? sanctuaryGates(safePad) : null;
  for (const m of nodes) {
    const label = `material@${Math.round(m.x)}`;
    if (!m.tier) problems.push(`${label} sits in the near band - collecting must be a detour, not a freebie`);
    for (const p of terrain.pads) {
      if (m.x > p.x1 - MATERIAL_SITE.padGuard && m.x < p.x2 + MATERIAL_SITE.padGuard) {
        problems.push(`${label} is within ${MATERIAL_SITE.padGuard} px of a landing zone`);
        break;
      }
    }
    // Reachable: in open air, with room to fly a lander into it.
    const ground = terrain.heightAt(m.x);
    if (m.y > ground + 1) problems.push(`${label} is below the surface`);
    if (terrain.ceiling && m.y < terrain.ceilingAt(m.x) + cfg.materialClearance) {
      problems.push(`${label} is inside or against the ceiling`);
    }
    // And never sitting in the corridor the safe landing descends through: the
    // safe route stays the safe route, with nothing on it to tempt a diversion.
    if (gates && gates.some((pt) => Math.hypot(m.x - pt.x, m.y - pt.y) < MATERIAL_SITE.radius + 60)) {
      problems.push(`${label} sits in the sanctuary approach corridor`);
    }
  }
  if (terrain.entry && terrain.pads.length > 1 && !nodes.length) {
    problems.push('no material deposits placed - the mission pays only on the results screen');
  }

  return { ok: problems.length === 0, problems, notes };
}

/**
 * Enemy placement checks (roadmap section 12 and the section 17 combat list).
 *
 * The load-bearing one is the sanctuary: every mission must keep a landing zone
 * that nothing can shoot into, because "every required landing must have a
 * viable non-combat path" is a promise about geometry, not about skill. The
 * rest stop a machine appearing somewhere it could never be fair from.
 */
export function validateEnemies(level, terrain, seed) {
  const problems = [];
  const notes = {};
  const budget = Math.max(0, (level.enemyBudget | 0));
  const enemies = placeEnemies(level, terrain, seed);
  notes.placed = enemies.length;
  notes.budget = budget;
  if (!budget) return { ok: true, problems, notes, enemies };

  const start = spawnFor(level, terrain);
  const safe = sanctuaryPad(terrain);
  notes.sanctuary = safe ? { mid: Math.round((safe.x1 + safe.x2) / 2), mult: safe.mult } : null;

  for (const e of enemies) {
    const type = ENEMY_TYPES[e.type];
    const label = `${e.id}@${Math.round(e.x)}`;

    // Nothing may open fire on a lander that has not had time to react.
    const d0 = Math.hypot(e.x - start.x, e.y - start.y);
    if (d0 < COMBAT.spawnSafeRadius) {
      problems.push(`${label} sits ${d0.toFixed(0)} px from the spawn, inside the ${COMBAT.spawnSafeRadius} px safe radius`);
    }

    // Nothing may stand on a landing zone, or close enough to overlap one.
    for (const p of terrain.pads) {
      if (e.x > p.x1 - COMBAT.padGuard && e.x < p.x2 + COMBAT.padGuard) {
        problems.push(`${label} stands within ${COMBAT.padGuard} px of a pad`);
        break;
      }
    }

    // Nothing may be inside the scenery, which would make it unkillable and
    // able to shoot through a hill it is technically behind.
    const ground = terrain.heightAt(e.x);
    if (e.y > ground + 2) problems.push(`${label} is below the surface`);
    if (terrain.ceiling && e.y < terrain.ceilingAt(e.x)) problems.push(`${label} is inside the ceiling`);

    // The sanctuary must be unreachable: no point in the corridor a lander
    // descends through may lie inside this machine's engagement range.
    if (safe) {
      const nearest = sanctuaryGates(safe)
        .reduce((m, p) => Math.min(m, Math.hypot(e.x - p.x, e.y - p.y)), Infinity);
      if (nearest < type.range) {
        problems.push(`${label} can engage the sanctuary corridor (${nearest.toFixed(0)} px, reach ${type.range})`);
      }
    }
  }

  // Threats have to stay countable: the spec asks for 1-3 at once, 4 at most.
  if (enemies.length > 4) problems.push(`${enemies.length} enemies placed, above the 4 the design allows`);
  if (budget && !enemies.length) {
    notes.starved = true;   // reported, not failed: fewer enemies is always safe
  }

  return { ok: problems.length === 0, problems, notes, enemies };
}

/**
 * Is the sanctuary approach genuinely out of sight of every machine? Range
 * alone is the hard rule; this is the softer, more honest question, sampled
 * down the actual descent corridor.
 */
export function sanctuaryClear(level, terrain, enemies) {
  const safe = sanctuaryPad(terrain);
  if (!safe) return { ok: true, exposed: 0 };
  let exposed = 0;
  for (const p of sanctuaryGates(safe)) {
    for (const e of enemies) {
      const type = ENEMY_TYPES[e.type];
      if (Math.hypot(e.x - p.x, e.y - p.y) > type.range) continue;
      if (lineOfSight(terrain, e.x, e.y - type.radius, p.x, p.y)) exposed++;
    }
  }
  return { ok: exposed === 0, exposed };
}
