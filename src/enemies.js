// Enemies and light combat (roadmap section 12).
//
// The premise is abandoned automation: mining, security and survey machines
// that kept running long after their owners stopped answering. That lets the
// same few designs appear on very different bodies without inventing a species
// for each one.
//
// Three rules shape everything in this file:
//   1. Every attack is telegraphed long enough to be flown away from, and the
//      aim freezes when the telegraph starts - so moving always beats standing.
//   2. Every mission keeps one landing zone that no enemy can engage, so a
//      weapon is never the price of admission ("every required landing must
//      have a viable non-combat path").
//   3. Enemies pressure position and timing. They never touch thrust input,
//      never hide telemetry, and stop shooting once the gear is down.
//
// Nothing here imports rendering or audio: the field reports events and the
// game turns them into noise and light.

import { clamp, makeRng, angleDelta } from './util.js';
import { spawnFor } from './spawn.js';

/** Tunables. Every number a designer might want to argue about lives here. */
export const COMBAT = {
  shipRadius: 17,          // collision radius used for enemy fire
  spawnSafeRadius: 430,    // no enemy may sit this close to the lander's start
  sanctuaryMargin: 140,    // extra clearance beyond reach around the safe pad
  muzzleSafe: 56,          // a shot may never appear closer than this to the ship
  padGuard: 110,           // no ground enemy on or beside a pad
  minSpacing: 230,         // enemies stand apart, so threats stay countable
  // What counts as ground a gun can stand on. M19 roughened the world and
  // nobody re-checked this: 30% of ground guns stood on slopes past 0.30, and
  // one in five had more than its own radius of height across its footprint -
  // which is what "half-buried in a slope" looks like as a number. A roof is
  // exempt because it is flat by construction.
  groundSlope: 0.28,
  footSpan: 11,            // px of height across the machine's own base
  perchShare: 0.75,        // how often a ground gun takes an available roof
  guardSpread: 560,        // how loosely machines ring the prize
  roadReach: 500,          // and how far back up the fuel road they sit
  // Where along the crossing the machines stand, as a fraction of the distance
  // from the entry to what they guard. M21 asks for two to three times as many
  // of them, and ringing that many around the prize puts four in one fight -
  // so they are strung out along the route instead, each taking a station.
  // Stations start *past* the sanctuary. The safe pad sits 14-34% of the way in
  // and carries a 700 px exclusion bubble, so a station at 0.30 is inside it:
  // the first version spent 26,000 of its 30,000 rejections there and placed
  // three machines in four.
  stationLo: 0.46,
  stationHi: 1.06,
  stationJitter: 300,      // how far either side of its station a machine looks
  stationWiden: 4,         // ...growing to this multiple as attempts fail
  // "1-3 at once, rarely 4" is the spec's rule, and it is about how many
  // machines can engage the lander *at the same time* - not how many are on the
  // map. If a machine's engagement disc overlaps at most this many others,
  // then no point inside its disc can be covered by more than maxAtOnce, which
  // makes the rule a cheap local test instead of a sweep over the whole world.
  maxAtOnce: 4,
  losSamples: 26,
  hoverMin: 170,           // drone patrol altitude above the surface
  hoverMax: 300,
  maxShots: 24,            // hard cap; old shots are culled first
  placementTries: 520,     // raised with the budgets: more machines, tighter ground
};

/**
 * The roster. Two machines in this milestone - a ground gun that punishes a
 * straight line, and an air unit that punishes hovering - each with a
 * counterplay that needs no weapon at all.
 */
export const ENEMY_TYPES = {
  'sentry-turret': {
    id: 'sentry-turret',
    name: 'SENTRY TURRET',
    kind: 'ground',
    hp: 30,
    radius: 16,
    range: 560,
    minRange: 130,         // it cannot depress the barrel closer than this
    turnRate: 1.15,        // rad/s: slow enough to be out-turned
    aimTolerance: 0.16,
    // M24: was 1.25. Tom asked for 80% less aiming time, so the lock is now
    // something you read early rather than something you react to. The shot
    // still telegraphs - what is gone is the comfort. Total reaction window at
    // this gun's own range is 0.25 + 560/600 = 1.18 s, and `enemies-tests.js`
    // asserts that window rather than either constant, because the window is
    // the property and the constants are just this milestone's answer to it.
    telegraph: 0.25,       // aim locks and is drawn for this long before firing
    cooldown: 3.0,
    leadFactor: 0.75,      // deliberately imperfect prediction
    // 50 damage on a 100 hull is Tom's "two shots with no upgrades"; a hull
    // upgrade buys a third, which is what keeps that track worth its salvage.
    shot: { speed: 600, damage: 50, radius: 5, life: 5.5, drift: 0.5 },
    reward: 26,
    counterplay: 'Put terrain between you, or fly inside its arc.',
  },

  /**
   * **The Mast Sniper.** The first of the six roster designs the MVP deferred,
   * and the first machine in the game that kills in one shot.
   *
   * Tom's brief, and every clause of it is a number below: *"it should be a
   * sniper, one shot one kill. no more than 1 per level, it should take longer
   * to aim and then keep aim for some amount that players can avoid and take
   * longer to reload. max 3 shots."*
   *
   * The shape of it is the opposite of the casemate. A turret is a thing you
   * fly around; this is a thing you must not be in front of when it finishes
   * aiming. **No hull level survives a hit**, so armour is not the answer and
   * evasion is - a genuinely new question to ask a player who has spent nine
   * bodies learning to soak two shots. The one thing that does answer it is the
   * Ray Shield, which stops exactly one and burns out doing so.
   *
   * **It is avoidable five ways, and that is what makes lethal fair:**
   *  1. `turnRate` 0.42 - less than half the turret's, so it is slow to bring
   *     round and a moving lander keeps breaking its solution
   *  2. `telegraph` 1.7 s with the aim **frozen** (the M12 rule) - the longest
   *     window in the game, and simply not being on that line beats it
   *  3. losing line of sight during the telegraph cancels the shot outright
   *  4. `minRange` 260 - a big blind spot; getting close is a real answer
   *  5. `ammo` 3 - it runs out, permanently, and shows you how many are left
   *  6. a raised **Ray Shield** stops one outright and is spent doing it (M29h)
   *
   * ...and `cooldown` 8 s between them, so a mission never sees more than a
   * handful even if it never runs dry.
   */
  'mast-sniper': {
    id: 'mast-sniper',
    name: 'MAST SNIPER',
    kind: 'ground',
    // Lightly built: it is a tripod and a sensor head, not a casemate. The
    // laser kills it in appreciably less time than a turret, which is the
    // reward for carrying a weapon to a body that fields one.
    hp: 22,
    radius: 16,
    // Longer than anything else (the turret is 560), and **not as long as it
    // wants to be**, for a reason worth recording: range costs this machine
    // twice over. The sanctuary bubble scales with it, so a longer reach is
    // pushed further from where the player goes; and the at-once rule counts
    // overlapping engagement discs, so a big disc crowds out the turrets that
    // would otherwise fill the mission's budget. Measured over every armed
    // mission x 20 seeds:
    //
    // | range | campaign fill | fill on its own missions | present | fires (deep) |
    // | ---: | ---: | ---: | ---: | ---: |
    // | 760 | 95% | 84% | 70% | 41% |
    // | **640** | **97%** | **91%** | **77%** | **33%** |
    // | 560 | 97% | 90% | 73% | 18% |
    //
    // 640 keeps M21's "a budget is what the map fields" intact while the thing
    // still engages on a third of deep runs.
    range: 640,
    minRange: 260,         // ...and has a correspondingly large blind spot
    turnRate: 0.42,        // "longer to aim": slow to traverse
    aimTolerance: 0.075,   // and it wants a tighter solution before it commits
    telegraph: 1.7,        // "keep aim for some amount that players can avoid"
    cooldown: 8.0,         // "longer to reload"
    leadFactor: 0.9,       // it predicts better than the turret does
    ammo: 3,               // "max 3 shots" - per mission, and it never reloads
    // It will only stand where it can see at least this share of the crossing.
    // See the vantage rule in `placeEnemies` for why this exists and why
    // raising `range` instead made it worse.
    // Measured, over 9 missions x 20 seeds, against how often it actually
    // engages on the deep route:
    //
    // | vantage | placed | sees | fires in | way home |
    // | ---: | ---: | ---: | ---: | ---: |
    // | 0.45 | 33/180 | 0.9 s | 8% | 154/180 |
    // | 0.30 | 104/180 | 3.3 s | 30% | 152/180 |
    // | **0.20** | **128/180** | **4.3 s** | **42%** | **150/180** |
    //
    // 0.20 and not lower: past it the placement rate barely moves and the rule
    // stops meaning anything. Note the last column - it threatens the *prize*
    // route and costs the way home almost nothing, which is the shape a sniper
    // should have. It is absent on about one seed in four, and that is left
    // alone deliberately: a map with no vantage on it has no business fielding
    // one, and the budget is filled by a turret instead.
    vantage: 0.20,
    maxPerMission: 1,      // "no more than 1 per level"
    // Lethal, deliberately, and expressed as a flag rather than a big number:
    // "one shot one kill" is a *property*, and a damage figure large enough to
    // beat today's hull ceiling is a figure that quietly stops being true the
    // day someone adds Hull L5. M24 and M28 both found assertions that had
    // encoded a number instead of the rule; this is the same trap in content.
    shot: { speed: 950, damage: 100, lethal: true, radius: 4.5, life: 6, drift: 0 },
    reward: 64,
    counterplay: 'It holds its aim before it fires. Be somewhere else by then, break its line, or take the shot on a raised shield.',
  },
  'seeker-drone': {
    id: 'seeker-drone',
    name: 'SEEKER DRONE',
    kind: 'air',
    hp: 18,
    radius: 14,
    range: 520,
    minRange: 0,
    patrol: 320,           // half-width of its idle beat
    cruise: 58,
    chase: 88,             // slower than a lander under thrust: it is outrunnable
    standoff: 195,
    turnRate: 2.2,
    aimTolerance: 0.22,
    // Deliberately NOT cut to 0.25: Tom's 80% was asked for the turret by name.
    // It also reads well - a turret is a snap gun you must not be seen by, and
    // a drone is a thing that follows you and lines up. Worth revisiting if the
    // contrast plays as inconsistent rather than as two different machines.
    telegraph: 1.0,
    cooldown: 2.6,
    leadFactor: 0.6,
    ram: { range: 44, damage: 50 },
    shot: { speed: 765, damage: 50, radius: 4, life: 4, drift: 0.35 },
    reward: 34,
    counterplay: 'Outrun it, or break the lock behind a ridge.',
  },
};

export const ENEMY_IDS = Object.keys(ENEMY_TYPES);

/**
 * The landing zone that stays out of every enemy's reach. The lowest-multiplier
 * pad is the generous one, so contesting the high-scoring pad and leaving the
 * safe one alone is exactly the "tempt risk, never require it" rule.
 */
export function sanctuaryPad(terrain) {
  const pads = terrain.pads;
  if (!pads || !pads.length) return null;
  // With distance tiers, the sanctuary is simply the nearest zone - the one you
  // can always still get home to. Falling back to the lowest multiplier keeps
  // legacy levels, which have no tiers, behaving as they did.
  if (pads.some((p) => p.tier != null)) {
    return pads.reduce((a, b) => {
      if ((b.tier || 0) !== (a.tier || 0)) return (b.tier || 0) < (a.tier || 0) ? b : a;
      return (b.x2 - b.x1) > (a.x2 - a.x1) ? b : a;
    }, pads[0]);
  }
  return pads.reduce((a, b) => {
    if (b.mult !== a.mult) return b.mult < a.mult ? b : a;
    return (b.x2 - b.x1) > (a.x2 - a.x1) ? b : a;
  }, pads[0]);
}

/** What the machines are here to protect: the deepest landing zone. */
export function guardedPad(terrain) {
  const pads = terrain.pads;
  if (!pads || !pads.length) return null;
  if (pads.some((p) => p.tier != null)) {
    return pads.reduce((a, b) => ((b.tier || 0) > (a.tier || 0) ? b : a), pads[0]);
  }
  return pads.reduce((a, b) => (b.mult > a.mult ? b : a), pads[0]);
}

/**
 * The column an approach to that pad descends through. Placement and validation
 * both measure against these exact points - when they disagreed, placement
 * cleared two points while the validator swept the whole descent, and a drone
 * could sit high above the sanctuary and still see it.
 */
export function sanctuaryGates(pad) {
  const mid = (pad.x1 + pad.x2) / 2;
  const out = [{ x: mid, y: pad.y }];
  for (let dy = 40; dy <= SANCTUARY_HEIGHT; dy += 40) out.push({ x: mid, y: pad.y - dy });
  return out;
}

/** How far up the sanctuary corridor stays protected. */
export const SANCTUARY_HEIGHT = 420;

/** Is there clear air between two world points? Ground and ceiling both block. */
export function lineOfSight(terrain, ax, ay, bx, by) {
  const n = COMBAT.losSamples;
  for (let i = 1; i < n; i++) {
    const f = i / n;
    const x = ax + (bx - ax) * f;
    const y = ay + (by - ay) * f;
    if (y >= terrain.heightAt(x)) return false;
    if (terrain.ceiling && y <= terrain.ceilingAt(x)) return false;
  }
  return true;
}

function typeOf(e) {
  return ENEMY_TYPES[e.type];
}

/**
 * Would a shot born here already be touching the lander? The section 17 rule
 * is "enemy fire cannot spawn already intersecting the player", and the only
 * geometry that can produce it is a target that closed the distance during the
 * telegraph. When this says no, the machine holds fire.
 */
export function muzzleIsSafe(px, py, ship) {
  if (!ship) return true;
  return Math.hypot(px - ship.x, py - ship.y) >= COMBAT.muzzleSafe;
}

/**
 * Deterministic placement from the mission's budget and sets. Rules are refused
 * rather than bent: if a body cannot hold the full budget without breaking the
 * sanctuary rule, it gets fewer enemies, and the validator reports the count.
 */
export function placeEnemies(level, terrain, seed) {
  const budget = Math.max(0, level.enemyBudget | 0);
  const sets = (level.enemySets || []).filter((id) => ENEMY_TYPES[id]);
  if (!budget || !sets.length || !terrain.pads.length) return [];

  const rng = makeRng((((seed | 0) ^ 0x7f4a7c15) >>> 0) + 17);
  const start = spawnFor(level, terrain);
  // Roofs are the good ground. Terrain built them without knowing what they are
  // for; a gun claims one here, and each is claimed at most once.
  const roofs = (terrain.structures || []).slice();
  // Roofs a *given* machine has already been turned away from. The nearest roof
  // to a station is a deterministic choice, so without this the loop offers the
  // same rejected roof every try and burns the whole budget of attempts on it.
  let tried = new Set();
  let triedFor = -1;
  // Types this map has proved it cannot seat, so the round-robin stops offering
  // them and the budget is filled by something it can. Without it a type with a
  // demanding placement rule burns the whole attempt budget on one slot and the
  // *whole mission* comes out under-filled - the Mast Sniper's vantage rule
  // took fill from 99% to 65-86% before this existed, which is M21's "a budget
  // is what the map fields" broken by a machine that could not be seated.
  //
  // Giving up on the type is the right answer rather than relaxing its rule:
  // a sniper with no line of sight is the decorative machine the vantage rule
  // was added to prevent, so a map with no vantage should field a turret.
  const givenUp = new Set();
  const vantageFails = new Map();
  const safe = sanctuaryPad(terrain);
  const gates = safe ? sanctuaryGates(safe) : null;
  const margin = 180;
  const out = [];

  // Machines guard what is worth taking. Scattering them uniformly across the
  // map - which is what this did - put half of them at the far end of the world
  // from anywhere the player would ever fly, so they were never met at all.
  const prize = guardedPad(terrain);
  // With one landing zone there is no prize distinct from the sanctuary, so the
  // machines guard the *road* instead - the crossing, not the destination.
  const guardAt = prize
    ? (prize !== safe ? (prize.x1 + prize.x2) / 2 : (start.x + (prize.x1 + prize.x2) / 2) / 2)
    : null;

  for (let tries = 0; tries < COMBAT.placementTries && out.length < budget; tries++) {
    // Round-robin through the mission's sets, **skipping any type already at
    // its cap**. `maxPerMission` exists for the Mast Sniper - "no more than 1
    // per level" - and without the skip the round-robin would happily deal a
    // second one the moment the budget came round again. Falling through to the
    // next eligible type rather than wasting the attempt keeps the fill rate
    // (99% since M21) where it was.
    let type = null;
    for (let k = 0; k < sets.length; k++) {
      const cand = ENEMY_TYPES[sets[(out.length + k) % sets.length]];
      if (!cand || givenUp.has(cand.id)) continue;
      const cap = cand.maxPerMission != null ? cand.maxPerMission : Infinity;
      if (out.filter((m) => m.type === cand.id).length < cap) { type = cand; break; }
    }
    if (!type) break;   // every eligible type is at its cap: the map is full

    // A gun takes a roof when there is one going. It is flat by construction,
    // it is what the structure was built for, and it puts the machine
    // somewhere a player can read from a distance.
    // Each machine has a station along the crossing, so a route meets them one
    // or two at a time instead of walking into all of them at the end.
    const station = guardAt == null ? null : clamp(
      start.x + (guardAt - start.x) * (budget <= 1
        ? 0.88
        : COMBAT.stationLo + (COMBAT.stationHi - COMBAT.stationLo) * (out.length / (budget - 1))),
      margin, level.width - margin,
    );

    // A gun takes a roof when there is one going - the nearest to its own
    // station, so claiming one does not pull it out of position. A roof is flat
    // by construction, which is what the structure was built for.
    if (triedFor !== out.length) { tried = new Set(); triedFor = out.length; }
    let perchIndex = -1;
    if (type.kind === 'ground' && roofs.length && rng() < COMBAT.perchShare) {
      roofs.forEach((r, i) => {
        if (tried.has(r)) return;
        if (perchIndex < 0
          || (station != null
            ? Math.abs(r.x - station) < Math.abs(roofs[perchIndex].x - station)
            : rng() < 0.35)) perchIndex = i;
      });
    }

    // The search widens as attempts fail. A station is where a machine *wants*
    // to stand, not a demand the terrain has to satisfy: on a map whose station
    // lands on a cliff, a fixed window simply never places the machine, which
    // is how the first version of this quietly cut the roster from 21 to 9.
    const spread = COMBAT.stationJitter
      * (1 + (COMBAT.stationWiden - 1) * (tries / COMBAT.placementTries));
    // Past the point where stationing is clearly not working, drop it entirely
    // and search the whole map. A station is a preference; fielding the machine
    // at all is the promise. Without this, RADIATION PASS placed *nothing* on
    // one seed in five - the same "declared enemies, empty mission" the M15
    // audit was written to catch.
    const desperate = tries > COMBAT.placementTries * 0.6;
    const x = perchIndex >= 0
      ? roofs[perchIndex].x
      : (station != null && !desperate
        ? clamp(station + (rng() - 0.5) * spread, margin, level.width - margin)
        : rng.range(margin, level.width - margin));
    const ground = terrain.heightAt(x);
    const roof = terrain.ceiling ? terrain.ceilingAt(x) : -Infinity;

    // Any rejection below retires this roof for this machine, so the next try
    // offers the next-nearest one instead of the same one again.
    const reject = () => { if (perchIndex >= 0) tried.add(roofs[perchIndex]); return true; };

    let y;
    if (type.kind === 'ground') {
      if (terrain.padAt(x) && reject()) continue;
      if (perchIndex >= 0) {
        y = roofs[perchIndex].top - type.radius;
      } else {
        // Flat *and* short: the slope test alone passes a gun standing across a
        // 40 px step, because a step between two samples is not a slope.
        if (Math.abs(terrain.slopeAt(x)) > COMBAT.groundSlope) continue;
        if (footSpan(terrain, x, type.radius) > COMBAT.footSpan) continue;
        y = ground - type.radius;
      }
      if (terrain.ceiling && y - roof < 120 && reject()) continue;   // no room to stand
    } else {
      const hover = rng.range(COMBAT.hoverMin, COMBAT.hoverMax);
      y = ground - hover;
      if (terrain.ceiling && y - roof < 90) y = roof + 110;
      if (ground - y < 110) continue;                               // too near the deck
    }

    // Never on top of a pad, never in the lander's face at t=0.
    let clear = true;
    for (const p of terrain.pads) {
      if (x > p.x1 - COMBAT.padGuard && x < p.x2 + COMBAT.padGuard) { clear = false; break; }
    }
    if (!clear && reject()) continue;
    if (Math.hypot(x - start.x, y - start.y) < COMBAT.spawnSafeRadius && reject()) continue;

    // The sanctuary must stay out of reach: no point in the corridor a lander
    // descends through may sit inside this machine's engagement range.
    if (gates) {
      const reach = type.range + COMBAT.sanctuaryMargin;
      if (gates.some((p) => Math.hypot(x - p.x, y - p.y) < reach) && reject()) continue;
    }
    if (out.some((e) => Math.hypot(e.x - x, e.y - y) < COMBAT.minSpacing) && reject()) continue;

    // **A sniper needs a view, not a station.** Measured before this existed:
    // the Mast Sniper could see the lander for **0.5 s in a whole flight** and
    // got a shot off on 8% of them, because the generic station rule drops a
    // machine on the crossing without ever asking whether it can see anything
    // from there. A lethal machine that never fires is not difficult, it is
    // decorative - the M11 fault, where a system read only by a screen had
    // never been shown to work.
    //
    // Raising `range` was the obvious fix and it made things **worse**, which
    // is the finding worth keeping: the sanctuary bubble scales with range, so
    // the further a machine reaches the further it is pushed from the one place
    // the player reliably goes. At 1300 px it saw the lander for 0.0 s. Reach
    // is not vantage.
    //
    // So a type may demand line of sight to a share of the corridor it is meant
    // to cover, sampled along the crossing at the altitude a lander actually
    // flies. Nothing else asks for this, and nothing else should: a turret is
    // something you come to, and this is something that comes to you.
    if (type.vantage && guardAt != null) {
      // **The deep half of the crossing, not all of it.** Asking for a view of
      // the whole run was unplaceable - 2 seeds in 180 - and it was also the
      // wrong ask: the near end is inside the sanctuary bubble by construction,
      // so a machine that could see it would be one that had no business
      // standing there. This is a threat on the way to the prize.
      const lo = Math.min(start.x, guardAt) + Math.abs(guardAt - start.x) * 0.45;
      const hi = Math.max(start.x, guardAt);
      let seen = 0;
      const SAMPLES = 9;
      for (let i = 0; i < SAMPLES; i++) {
        const sx = lo + ((hi - lo) * (i + 0.5)) / SAMPLES;
        // The glide line a crossing is actually flown on, not the ground.
        const sy = terrain.heightAt(sx) - 260;
        const d = Math.hypot(sx - x, sy - y);
        if (d > type.range || d < type.minRange) continue;
        if (lineOfSight(terrain, x, y - type.radius, sx, sy)) seen++;
      }
      if (seen / SAMPLES < type.vantage) {
        const n = (vantageFails.get(type.id) || 0) + 1;
        vantageFails.set(type.id, n);
        // Twenty-six attempts is enough to know. Measured against campaign
        // fill: giving up at 0.35 / 0.15 / 0.08 / 0.05 of the attempt budget
        // yields 93% / 93% / 94% / **95%** fill, with the sniper present on 70-71%
        // of seeds in every case - so the decision was always made in the first
        // few dozen tries and everything after that was spent proving it again,
        // at the cost of the machines that could have taken the slot.
        if (n > COMBAT.placementTries * 0.05) givenUp.add(type.id);
        reject();
        continue;
      }
    }

    // Countable threats: adding this one may not let five engage at once.
    //
    // The test has to be symmetric. Counting only the machines already placed
    // passes a candidate that overlaps three, while pushing each of those three
    // to four - the constraint is on every machine, not on the newest one, and
    // the validator caught exactly that on OLD BATTERY and IRON RAIN.
    const overlapping = out.filter((e) => {
      const other = ENEMY_TYPES[e.type];
      return Math.hypot(e.x - x, e.y - y) < type.range + other.range;
    });
    if (overlapping.length > COMBAT.maxAtOnce - 1 && reject()) continue;
    const crowds = overlapping.some((e) => {
      const other = ENEMY_TYPES[e.type];
      const already = out.filter((o) => o !== e
        && Math.hypot(o.x - e.x, o.y - e.y) < other.range + ENEMY_TYPES[o.type].range).length;
      return already + 1 > COMBAT.maxAtOnce - 1;
    });
    if (crowds && reject()) continue;

    const e = makeEnemy(type, x, y, out.length, rng);
    if (type.kind === 'air') e.hover = ground - y;
    if (perchIndex >= 0) {
      e.perch = roofs[perchIndex].kind;
      roofs.splice(perchIndex, 1);
    }
    out.push(e);
  }
  return out;
}

/** How much height the ground varies across a machine's own footprint. */
function footSpan(terrain, x, r) {
  let lo = Infinity, hi = -Infinity;
  for (let d = -r; d <= r; d += 2) {
    const h = terrain.heightAt(x + d);
    if (h < lo) lo = h;
    if (h > hi) hi = h;
  }
  return hi - lo;
}

function makeEnemy(type, x, y, index, rng) {
  return {
    type: type.id,
    id: `${type.id}-${index}`,
    x, y,
    homeX: x,
    homeY: y,
    hover: 220,             // air units hold this far above the surface
    hp: type.hp,
    maxHp: type.hp,
    dead: false,
    state: 'idle',          // idle | track | telegraph | recover | dead
    timer: 0,
    aim: type.kind === 'ground' ? -Math.PI / 2 : 0,
    aimX: x, aimY: y - 100,
    beat: rng ? rng.range(0, Math.PI * 2) : 0,   // patrol phase, so two drones never march in step
    dir: rng && rng() < 0.5 ? -1 : 1,
    alert: 0,               // 0..1, how awake it looks
    hitFlash: 0,
    // Finite shots, for machines that have them. `null` means "never runs out",
    // which is every machine before the Mast Sniper. It is per mission and
    // never reloads: a sniper you have made spend its three is spent.
    ammo: type.ammo != null ? type.ammo : null,
  };
}

/**
 * The live combat state for one mission: the machines, their shots, and the
 * rules that connect them to the lander. Deterministic given the same seed and
 * the same flight.
 */
export class EnemyField {
  constructor(level, terrain, seed) {
    this.level = level;
    this.terrain = terrain;
    this.enemies = placeEnemies(level, terrain, seed);
    this.shots = [];
    this.sanctuary = sanctuaryPad(terrain);
    this.kills = 0;
    this.shotsFired = 0;
    this.hitsTaken = 0;
    this.suppressed = 0;      // shots refused because they would have spawned on the ship
  }

  get live() {
    return this.enemies.filter((e) => !e.dead);
  }

  /** Anything currently aiming at the lander - the HUD's threat count. */
  get engaged() {
    return this.enemies.filter((e) => !e.dead && (e.state === 'track' || e.state === 'telegraph')).length;
  }

  get empty() {
    return this.enemies.length === 0;
  }

  /** Anything that has just fired and is still cycling. */
  get reloading() {
    return this.enemies.filter((e) => !e.dead && e.state === 'recover').length;
  }

  /**
   * One fixed step. Returns the events worth a sound or a particle:
   * {kind:'telegraph'|'fire'|'hit'|'block'|'spark'|'kill'|'ram', ...}.
   */
  update(dt, t, ship) {
    const events = [];
    if (!this.enemies.length && !this.shots.length) return events;
    // Once the gear is down the fight is over: nothing shoots at a lander that
    // has already committed to the surface.
    const target = ship.alive && !ship.landed && !ship.touchdown ? ship : null;
    for (const e of this.enemies) {
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt);
      if (e.dead) this._stepWreck(e, dt);
      else this._stepEnemy(e, dt, t, target, events);
    }
    this._stepShots(dt, target, events);
    return events;
  }

  /**
   * Kill a machine. An air unit's wreck used to stay in the sky at the exact
   * point it died - Tom saw one hanging over Buried Array - so death now starts
   * a fall rather than freezing the thing in place.
   */
  _kill(e) {
    e.dead = true;
    e.state = 'dead';
    e.fallVy = 0;
    e.spinWreck = (e.dir || 1) * 1.4;
    e.tilt = 0;
    e.grounded = typeOf(e).kind !== 'air';
  }

  /** Wreckage falls, tumbles, and stops when it reaches the ground. */
  _stepWreck(e, dt) {
    if (e.grounded) return;
    e.fallVy = (e.fallVy || 0) + (this.level.gravity || 28) * dt;
    e.y += e.fallVy * dt;
    e.tilt = (e.tilt || 0) + (e.spinWreck || 0) * dt;
    const ground = this.terrain.heightAt(e.x) - typeOf(e).radius * 0.5;
    if (e.y >= ground) {
      e.y = ground;
      e.grounded = true;
      e.fallVy = 0;
    }
  }

  _stepEnemy(e, dt, t, ship, events) {
    const type = typeOf(e);
    // **A cloaked lander is, to a machine, no lander at all.** One predicate at
    // the top rather than a check in each branch: a drone that could not *see*
    // you but still chased and rammed you would be the module half-built, and
    // ramming does not go through `_sees` at all. With no target a drone goes
    // back to its patrol, a gun in `track` loses the lock after 1.2 s, and a
    // gun already in `telegraph` takes the same `!seen` path that cover takes -
    // it aborts the shot and says so.
    //
    // Shots already in the air are deliberately untouched. A cloak breaks
    // targeting; it does not erase a bullet that has left the barrel.
    //
    // **A flare is the other half of the same idea.** The cloak says "there is
    // no lander"; a decoy says "the lander is over there", and per the spec it
    // pulls *drones* only - a dug-in gun keeps shooting at you, which is what
    // stops the flare being a second cloak. So a drone flies at the decoy, is
    // blind to the lander while it burns, and cannot ram what it is not
    // chasing; `ram` is passed the real ship or nothing, never the decoy, so
    // there is no shape-guessing about what can be hit.
    const decoy = ship && ship.decoy ? ship.decoy : null;
    const pulled = type.kind === 'air' && !!decoy;
    const target = ship && !ship.cloaked && !pulled ? ship : null;
    if (type.kind === 'air') this._moveDrone(e, type, dt, pulled ? decoy : target, target, events);

    const seen = target ? this._sees(e, type, target) : null;
    e.alert = clamp(e.alert + (seen ? dt * 2.5 : -dt * 1.2), 0, 1);

    // Out of ammo is out of the fight, permanently. It still stands there and
    // still tracks nothing - drawn dark, so a player who counted the shots can
    // see they were right. This is the counterplay Tom asked for made visible:
    // spending a sniper's three is a thing you can *do* to it.
    if (e.ammo === 0) { e.state = 'idle'; e.alert = Math.max(0, e.alert - dt); return; }

    if (e.state === 'idle') {
      if (seen) { e.state = 'track'; e.timer = 0; }
      return;
    }

    if (e.state === 'track') {
      e.timer += dt;
      if (!seen) { if (e.timer > 1.2) { e.state = 'idle'; e.timer = 0; } return; }
      // Turn toward where the lander will be, at a rate slow enough to shake.
      const lead = this._leadPoint(e, type, target);
      const want = Math.atan2(lead.y - e.y, lead.x - e.x);
      const d = angleDelta(e.aim, want);
      const turn = Math.min(Math.abs(d), type.turnRate * dt) * Math.sign(d);
      e.aim += turn;
      if (Math.abs(d) <= type.aimTolerance) {
        // Lock: the aim freezes here, which is what makes moving a defence.
        e.state = 'telegraph';
        e.timer = type.telegraph;
        e.aimX = lead.x;
        e.aimY = lead.y;
        events.push({ kind: 'telegraph', enemy: e, x: e.x, y: e.y });
      }
      return;
    }

    if (e.state === 'telegraph') {
      e.timer -= dt;
      if (!seen) {                       // cover breaks the shot before it happens
        e.state = 'recover';
        e.timer = type.cooldown * 0.5;
        events.push({ kind: 'block', enemy: e, x: e.x, y: e.y });
        return;
      }
      if (e.timer <= 0) {
        this._fire(e, type, target, events);
        e.state = 'recover';
        e.timer = type.cooldown;
      }
      return;
    }

    if (e.state === 'recover') {
      e.timer -= dt;
      if (e.timer <= 0) { e.state = 'idle'; e.timer = 0; }
    }
  }

  /** Can this machine engage right now? Range, arc and clear air all count. */
  _sees(e, type, ship) {
    const d = Math.hypot(ship.x - e.x, ship.y - e.y);
    if (d > type.range || d < type.minRange) return false;
    // A ground gun cannot shoot through its own hill.
    return lineOfSight(this.terrain, e.x, e.y - type.radius, ship.x, ship.y);
  }

  _leadPoint(e, type, ship) {
    const d = Math.hypot(ship.x - e.x, ship.y - e.y);
    const flight = d / type.shot.speed;
    const f = type.leadFactor;
    return { x: ship.x + ship.vx * flight * f, y: ship.y + ship.vy * flight * f };
  }

  _fire(e, type, ship, events) {
    const dir = Math.atan2(e.aimY - e.y, e.aimX - e.x);
    const muzzle = type.radius + 10;
    const px = e.x + Math.cos(dir) * muzzle;
    const py = e.y + Math.sin(dir) * muzzle;
    // A shot may never appear already touching the lander. If the geometry says
    // it would, the machine holds fire instead - the player gets the tell and
    // no damage they could not have avoided.
    if (!muzzleIsSafe(px, py, ship)) {
      this.suppressed++;
      events.push({ kind: 'block', enemy: e, x: e.x, y: e.y });
      return;
    }
    this.shots.push({
      x: px, y: py,
      vx: Math.cos(dir) * type.shot.speed,
      vy: Math.sin(dir) * type.shot.speed,
      damage: type.shot.damage,
      lethal: !!type.shot.lethal,
      radius: type.shot.radius,
      drift: type.shot.drift,
      life: type.shot.life,
      from: e.id,
    });
    if (this.shots.length > COMBAT.maxShots) this.shots.shift();
    // Spent only on a shot that was really taken. A round suppressed by the
    // muzzle-safety rule above is not spent, or the safety rule would quietly
    // become a way to disarm a sniper by flying at it.
    if (e.ammo != null) e.ammo = Math.max(0, e.ammo - 1);
    if (!this._shotsBy) this._shotsBy = {};
    this._shotsBy[e.type] = (this._shotsBy[e.type] || 0) + 1;
    this.shotsFired++;
    events.push({ kind: 'fire', enemy: e, x: px, y: py, dir });
  }

  /**
   * `aim` is what the drone flies at - the lander, a decoy, or nothing at all.
   * `ship` is what it is allowed to ram, which is only ever the real lander:
   * ramming never went through the sight check, so a cloak or a flare wired
   * only into `_sees` would leave the most dangerous machine in the game
   * behaving exactly as before.
   */
  _moveDrone(e, type, dt, aim, ship, events) {
    const terrain = this.terrain;
    let tx;
    let ty;
    if (aim && Math.hypot(aim.x - e.x, aim.y - e.y) < type.range * 1.3) {
      // Hold a standoff ring around the lander rather than flying into it.
      const dx = e.x - aim.x;
      const dy = e.y - aim.y;
      const d = Math.hypot(dx, dy) || 1;
      tx = aim.x + (dx / d) * type.standoff;
      ty = aim.y + (dy / d) * type.standoff - 30;
    } else {
      e.beat += dt * 0.5;
      tx = e.homeX + Math.sin(e.beat) * type.patrol * e.dir;
      ty = terrain.heightAt(tx) - e.hover;
    }
    tx = clamp(tx, 60, this.level.width - 60);
    // Never fly into the scenery: hold clear air above the ground and below ice.
    const floor = terrain.heightAt(tx) - 90;
    const roof = terrain.ceiling ? terrain.ceilingAt(tx) + 80 : 60;
    ty = clamp(ty, roof, floor);

    const speed = aim ? type.chase : type.cruise;
    const dx = tx - e.x;
    const dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      const move = Math.min(d, speed * dt);
      e.x += (dx / d) * move;
      e.y += (dy / d) * move;
    }

    // A drone that gets close enough stops shooting and simply rams.
    if (ship && type.ram && Math.hypot(ship.x - e.x, ship.y - e.y) < type.ram.range) {
      const res = ship.damage(type.ram.damage, 'ram');
      this.hitsTaken++;
      this._kill(e);
      events.push({ kind: 'ram', enemy: e, x: e.x, y: e.y, destroyed: res.destroyed });
    }
  }

  _stepShots(dt, ship, events) {
    const level = this.level;
    const wind = ship ? (ship.windNow || 0) : 0;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const p = this.shots[i];
      p.life -= dt;
      // Fire obeys the local air where it is readable: in an atmosphere the
      // tracers drift downwind, which is a tell as much as a nuisance.
      if (p.drift && level.drag) p.vx += (wind - p.vx) * level.drag * p.drift * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (ship && Math.hypot(p.x - ship.x, p.y - ship.y) < COMBAT.shipRadius + p.radius) {
        const res = ship.damage(p.damage, 'shot', { lethal: p.lethal });
        this.hitsTaken++;
        events.push({
          kind: 'hit', x: p.x, y: p.y, damage: p.damage,
          absorbed: res.absorbed, destroyed: res.destroyed,
          // A shield that collapsed stopping a killing shot is worth its own
          // feedback: it is the loudest thing the module will ever do.
          shieldBroke: !!res.shieldBroke,
        });
        this.shots.splice(i, 1);
        continue;
      }
      const hitGround = p.y >= this.terrain.heightAt(p.x);
      const hitRoof = this.terrain.ceiling && p.y <= this.terrain.ceilingAt(p.x);
      if (p.life <= 0 || p.x < 0 || p.x > level.width || hitGround || hitRoof) {
        if (hitGround || hitRoof) events.push({ kind: 'spark', x: p.x, y: p.y });
        this.shots.splice(i, 1);
      }
    }
  }

  /** Nearest live machine the lander can actually see. Used by the laser. */
  target(ship, range) {
    let best = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - ship.x, e.y - ship.y);
      if (d > range || d >= bestD) continue;
      if (!lineOfSight(this.terrain, ship.x, ship.y, e.x, e.y)) continue;
      best = e;
      bestD = d;
    }
    return best;
  }

  /** Apply damage to a machine. Returns the reward if this killed it. */
  damageEnemy(e, amount) {
    if (!e || e.dead) return 0;
    e.hp -= amount;
    e.hitFlash = 0.25;
    if (e.hp > 0) return 0;
    this._kill(e);
    this.kills++;
    return typeOf(e).reward;
  }

  /** Everything the results screen needs, without exposing the live objects. */
  summary() {
    // Per-type shot counts and rounds left. A roster figure, not a total: with
    // more than one kind of machine on a map, "shots fired" stops answering the
    // question you actually have, which is whether a *particular* design is
    // doing anything. The Mast Sniper made that concrete - it carries three
    // rounds and had to be shown to spend them, since a lethal machine that
    // never fires is not a difficult machine, it is a decorative one.
    const shotsBy = {};
    const ammoLeft = {};
    for (const e of this.enemies) {
      if (e.ammo != null) ammoLeft[e.type] = (ammoLeft[e.type] || 0) + e.ammo;
    }
    for (const [id, n] of Object.entries(this._shotsBy || {})) shotsBy[id] = n;
    return {
      total: this.enemies.length,
      // **Hull left on the field, not just bodies counted.** A weapon that
      // wounds without killing changes nothing a kill count can see - the
      // Twin-Link arc fired for 1,662 substeps across 50 flights and was
      // invisible to the loadout gate, because chipping a second machine is not
      // a kill. Damage is the world's response to a flight; `kills` is one
      // threshold on it.
      hpLeft: +this.enemies.reduce((n, e) => n + Math.max(0, e.hp), 0).toFixed(3),
      kills: this.kills,
      shotsFired: this.shotsFired,
      hitsTaken: this.hitsTaken,
      suppressed: this.suppressed,
      shotsBy,
      ammoLeft,
    };
  }
}

/** What the briefing screen tells the player is waiting for them. */
export function describeThreats(level) {
  const budget = Math.max(0, (level && level.enemyBudget) | 0);
  const sets = ((level && level.enemySets) || []).filter((id) => ENEMY_TYPES[id]);
  if (!budget || !sets.length) return [];
  return sets.map((id) => {
    const t = ENEMY_TYPES[id];
    return { id, name: t.name, kind: t.kind, counterplay: t.counterplay };
  });
}
