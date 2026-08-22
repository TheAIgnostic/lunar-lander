// The autopilot control law, as a pure module. Shared by the browser harness
// and by node-side mission validation so both fly identically.

import { Ship } from '../src/ship.js';

/**
 * **The pilot flies `pro`**, which is the original rotation law.
 *
 * M29c split classic steering into `classic` (rotation settles on release) and
 * `pro` (the original, momentum is yours to cancel), and made the tuned one the
 * default for players. Taking that default here would silently re-point every
 * sweep and every recorded figure in `test/BASELINE.md` at a different flight
 * model - M19's terrain wall, M21's placement numbers, M24's 70% crossing, all
 * of it measured against `pro`.
 *
 * So the instrument keeps its own mode, and the numbers stay comparable across
 * milestones. It is also the conservative choice: `pro` is the harder of the
 * two, so every flight figure this pilot produces remains a **floor** for what
 * a player on the default meets - which is exactly how this project already
 * asks its autopilot numbers to be read.
 */
export const PILOT_SETTINGS = { steering: 'pro', invertRotation: false };
import { spawnFor } from '../src/spawn.js';
import { pickupRadius } from '../src/terrain.js';
import { EnemyField } from '../src/enemies.js';
import { Abilities } from '../src/abilities.js';
import { ACTIVE_MODULES } from '../src/modules.js';
import { nodeWorth } from '../src/economy.js';

const THRUST = 130;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const norm = (a) => {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
};

/**
 * Phased control law: build lateral speed, coast, brake, then descend.
 * Returns control(input) which mutates the input object for one step.
 */
export function makeControl(ship, terrain, level, opts = {}) {
  const pads = terrain.pads;
  const pad = opts.padIndex != null
    ? pads[clamp(opts.padIndex, 0, pads.length - 1)]
    : pads.reduce((a, b) => (b.mult > a.mult ? b : a), pads[0]);
  // A waypoint target flies the law to a point in the air instead of a landing
  // zone - that is how the fuel road gets flown. Everything below then reads
  // "altitude" as height above the target rather than above the ground.
  const way = opts.target || null;
  const tx = way ? way.x : (pad.x1 + pad.x2) / 2;
  const halfPad = way ? 30 : (pad.x2 - pad.x1) / 2;
  const grav = level.gravity;
  const aLat = THRUST * Math.sin(0.5) * 0.8;
  // Approach bias lets the validator try genuinely different routes.
  const bias = opts.approach === 'left' ? -1 : opts.approach === 'right' ? 1 : 0;
  const kP = opts.kP != null ? opts.kP : 0.0016;   // position hold, rad per px
  const kD = opts.kD != null ? opts.kD : 0.012;    // velocity damping, rad per px/s
  // Sink rate to hold while still off-target on final. This used to be -8, a
  // *climb*, and on a windy body it was the whole ball game: the pilot rose
  // away from the pad, corrected in a headwind, rose again, and landed on
  // fumes or not at all. Descending gently while correcting keeps the engine
  // doing useful work and ends the flight. Measured over 15 missions x 20
  // seeds: 254 -> 265 landings, 46 -> 35 crashes, Mars 60 -> 72 out of 100.
  // On an airless body, holding station is cheap and works, so the old rule
  // stands. In an atmosphere it is a losing game and the sink rate applies.
  const windy = !!(level.drag || level.wind || level.gust);
  const holdVy = opts.holdVy != null ? opts.holdVy : (windy ? 16 : -8);
  let phase = 'ACCEL';
  let staged = bias !== 0;

  return function control(input) {
    const ground = terrain.heightAt(ship.x);
    const alt = way ? way.y - ship.y : ground - ship.y;
    // With a bias, first fly to a staging point to one side of the pad, so the
    // final approach genuinely comes from that direction.
    const stageX = clamp(tx + bias * 420, 80, level.width - 80);
    const target = staged ? stageX : tx;
    const dx = target - ship.x;
    const adx = Math.abs(dx);
    if (staged && adx < 90) staged = false;

    const brakeDist = (ship.vx * ship.vx) / (2 * aLat) + 70;
    const aUp = Math.max(18, THRUST * 0.85 - grav);

    const vyMax = clamp(Math.sqrt(2 * aUp * Math.max(alt - 40, 0)) * 0.55, 6, 130);

    // A wall in the path: terrain along the ground track that rises to the
    // ship's own altitude. Only this counts as an obstacle - projecting a
    // normal descent into the ground is just landing, and treating that as a
    // hazard makes the pilot hover until the tank is empty.
    let wallAhead = false;
    for (const T of [0.3, 0.6, 1.0, 1.5]) {
      const fx = clamp(ship.x + ship.vx * T, 0, level.width);
      if (terrain.heightAt(fx) < ship.y + 30) { wallAhead = true; break; }
    }
    // Never fly the road into the floor: the ground is still the ground even
    // when the target is a point in the air.
    const trueAlt = ground - ship.y;

    // Ceiling guard scaled by how fast the ship is rising. A fixed 120 px is
    // under a second of climb at full thrust, which is not enough time to stop
    // - the pilot was flying into ice in corridors 700 px wide.
    const roofGap = terrain.ceiling ? ship.y - terrain.ceilingAt(ship.x) : Infinity;
    const climbing = Math.max(0, -ship.vy);
    const roofMargin = 90 + climbing * 1.5;
    const roofPush = roofGap < roofMargin;
    const roofNear = roofGap < roofMargin + 140;

    const wAcc = level.drag ? ((ship.windNow || 0) - ship.vx) * level.drag : 0;
    const ff = Math.asin(clamp(-wAcc / THRUST, -0.3, 0.3));

    let wantAngle = 0;
    let thrust = false;

    if (phase === 'ACCEL') {
      const vxTarget = clamp(Math.sqrt(2 * aLat * Math.max(adx - 60, 0)) * 0.6, 18, 110);
      wantAngle = ff + Math.sign(dx) * (roofNear ? 0.28 : 0.5);
      const aligned = Math.abs(norm(ship.angle - wantAngle)) < 0.14;
      const needSpeed = Math.abs(ship.vx) < vxTarget || Math.sign(ship.vx) !== Math.sign(dx);
      thrust = aligned && needSpeed;
      if (adx < brakeDist) phase = 'BRAKE';
      else if (Math.abs(ship.vx) >= vxTarget && Math.sign(ship.vx) === Math.sign(dx)) phase = 'COAST';
    } else if (phase === 'COAST') {
      wantAngle = 0;
      thrust = ship.vy > vyMax;
      const closing = ship.vx * Math.sign(dx);
      if (adx < brakeDist) phase = 'BRAKE';
      else if (closing < 35 && adx > 120) phase = 'ACCEL';   // drag eats the ground track
    } else if (phase === 'BRAKE') {
      const closing = ship.vx * Math.sign(dx);
      wantAngle = ff - Math.sign(ship.vx || dx) * (roofNear ? 0.28 : 0.5);
      thrust = Math.abs(ship.vx) > 9 && Math.abs(norm(ship.angle - wantAngle)) < 0.14;
      if ((Math.abs(ship.vx) <= 9 && closing <= 12) || adx < 26) phase = staged ? 'ACCEL' : 'DESCEND';
    } else {
      // Hold a position, not a velocity: under a steady crosswind a velocity
      // controller settles downwind of the pad and never returns.
      wantAngle = clamp(ff + dx * kP - ship.vx * kD, -0.4, 0.4);
      // Lining up means "over the pad", not "within 22 px of its centre".
      // Under crosswind the tight threshold was never satisfied, so the pilot
      // hovered off-target until the tank was empty.
      const lined = adx < Math.max(20, halfPad * 0.55);
      // Level out near the ground whatever else is happening. Carrying a big
      // correction angle into contact is how a good approach becomes a
      // rollover, and it is the first thing a human pilot stops doing.
      if (alt < 70) wantAngle = clamp(wantAngle, ff - 0.09, ff + 0.09);
      if (alt < 40) wantAngle = clamp(wantAngle, ff - 0.05, ff + 0.05);
      // Do not sink into the last stretch while off-target - but commit rather
      // than hover to death once fuel runs short.
      const desperate = ship.fuel < ship.maxFuel * 0.22;
      const holdAltitude = !lined && alt < 130 && !desperate;
      thrust = ship.vy > (holdAltitude ? holdVy : vyMax);
      if (adx > 60 && alt < 220) phase = 'ACCEL';
    }

    // Never arrive low and short: while the pad is still far away, keep some
    // altitude in hand whatever phase we are in. Drag makes this essential -
    // a coast that starts fast ends slow, and without this it lands short.
    if (adx > 150 && alt < 230 && ship.vy > -5 && Math.abs(ship.angle) < 0.7) thrust = true;
    if (way && trueAlt < 90 && ship.vy > -10) thrust = true;

    if (ship.vy > vyMax * 1.25 && Math.abs(ship.angle) < 0.6) thrust = true;
    // Climb over a wall in the path - but only while in transit and with room
    // below. Near the ground on final approach, terrain is always at ship
    // altitude and this would just hover.
    if (wallAhead && alt > 110 && phase !== 'DESCEND' && Math.abs(ship.angle) < 0.7) thrust = true;
    if (roofPush) { wantAngle = clamp(wantAngle, ff - 0.2, ff + 0.2); thrust = false; }
    else if (roofNear && ship.vy < 10) thrust = false;
    if (alt < 260 && phase !== 'DESCEND' && adx < 60 && !staged) phase = 'DESCEND';

    const aErr = norm(wantAngle - ship.angle);
    const cmd = aErr * 11 - ship.spin * 2.8;
    input.left = cmd < -0.35;
    input.right = cmd > 0.35;
    input.hold = Math.abs(aErr) < 0.05 && Math.abs(ship.spin) > 0.08;
    input.thrust = thrust && ship.fuel > 0;
    return phase;
  };
}

/**
 * A pass-through cruise toward a point in the air. Used for the fuel road: the
 * landing law wants to *arrive* somewhere and hold station, and holding station
 * at a fuel cell costs more than the cell is worth. This one just crosses.
 */
export function makeCruise(ship, terrain, level, target) {
  return function cruise(input) {
    const dx = target.x - ship.x;
    const ground = terrain.heightAt(ship.x);
    // Horizontal: tilt toward a speed proportional to the gap, then hold it.
    const wantVx = clamp(dx * 0.5, -120, 120);
    const wAcc = level.drag ? ((ship.windNow || 0) - ship.vx) * level.drag : 0;
    const ff = Math.asin(clamp(-wAcc / THRUST, -0.3, 0.3));
    const wantAngle = clamp(ff + (wantVx - ship.vx) * 0.010, -0.55, 0.55);

    // Vertical: ride the line to the cell, and never let the ground win.
    const below = ship.y - target.y;          // positive = we are under it
    const wantVy = clamp(-below * 0.9, -55, 70);
    let thrust = ship.vy > wantVy;
    if (ground - ship.y < 110) thrust = true;
    const roofGap = terrain.ceiling ? ship.y - terrain.ceilingAt(ship.x) : Infinity;
    if (roofGap < 110 + Math.max(0, -ship.vy) * 1.5) thrust = false;

    const aErr = norm(wantAngle - ship.angle);
    const cmd = aErr * 11 - ship.spin * 2.8;
    input.left = cmd < -0.35;
    input.right = cmd > 0.35;
    input.hold = Math.abs(aErr) < 0.05 && Math.abs(ship.spin) > 0.08;
    input.thrust = thrust && ship.fuel > 0 && Math.abs(ship.angle) < 0.8;
    return 'ROAD';
  };
}

/**
 * Fly a mission start to finish with no browser and no game loop.
 * Returns { outcome, grade, fuelLeft, simSecs, offPad }.
 *
 * Enemies are off unless `opts.enemies` asks for them. That is deliberate: the
 * terrain sweep and the flight fixture measure whether the *ground* can be
 * flown, and adding gunfire to those would turn a terrain regression into a
 * combat regression. The combat sweep turns them on explicitly, and it flies
 * with no weapon, because what it has to prove is that one is not needed.
 */
export const FUEL_CELL = 22;      // what one cell on the road is worth

/**
 * **When the pilot presses an active**, one predicate per `cue` a module
 * declares. M30a gave the pilot a single policy - fire when the HUD's threat
 * count says something is aiming at you - which is what a player does with a
 * weapon or a shield and is nothing like what they do with the rest. Under it,
 * the Magnetic Anchor and the Thermal Purge were provably identical to an empty
 * slot across a whole chapter: fitted, flown, and unmeasurable.
 *
 * Still the *player's* cue rather than the ceiling. `threat` is unchanged to
 * the line, so every figure M30a measured over 6,400 flights still describes
 * this policy. The new ones are the same shape of judgement: reach for the
 * anchor over the pad, the purge when a gauge starts to bite, the pulse when
 * you cannot see the ground. Deliberately not "fire when it would help most",
 * which measures the module rather than the experience.
 */
export const ABILITY_CUES = {
  threat: ({ field }) => !!field && field.engaged > 0,
  final: ({ ship, terrain, targetMid, halfPad }) =>
    terrain.heightAt(ship.x) - ship.y < 220
    && Math.abs(ship.x - targetMid) < halfPad + 140
    && ship.vy > 0,
  // 25, not the channel's bite point: a player reaches for the purge when the
  // gauge has visibly started to move, not once it is already costing them.
  // (And this pilot is thrifty - measured over the Mercury and Io chapters it
  // peaks at 10-31% heat, so a threshold set at the bite would never fire.)
  status: ({ ship }) => Object.values(ship.statusLevels || {}).some((v) => v >= 25),
  blind: ({ ship }) => (ship.env.visibility != null && ship.env.visibility < 0.5)
    || (ship.env.darkness || 0) > 0.5,
};

export function flyMission(level, terrain, opts = {}) {
  const ship = new Ship();
  // `opts.loadout` flies the mission with gear on. Without it there was no way
  // to ask whether a component, skill or passive changes a *flight* rather than
  // a number, which is the only question that matters for something like the
  // Gyro Stabilizer.
  if (opts.loadout) ship.applyLoadout(opts.loadout);
  const start = spawnFor(level, terrain);
  ship.reset(start.x, start.y, ship.tankFor(level.fuel));
  ship.vx = start.vx;
  ship.vy = start.vy;

  const field = opts.enemies ? new EnemyField(level, terrain, opts.enemySeed != null ? opts.enemySeed : 1) : null;

  // `opts.ability` flies the mission with an active module and *uses* it. Until
  // now the pilot could carry a module and never press it, so there was no way
  // to ask whether an active is any good - the same blind spot `opts.loadout`
  // was added to close for passives.
  //
  // **The firing policy is the player's cue, not a cheat.** It presses when the
  // module is ready and the HUD's own threat count says something is aiming at
  // the lander (`field.engaged`) - which is what a person does, and is
  // deliberately *not* "press when a target happens to be in range". The
  // difference between those two is the whole measurement: how often does the
  // thing do anything at the moment you would reach for it?
  const abilities = opts.ability ? new Abilities(opts.ability, opts.loadout || {}) : null;
  // The module says when a player would reach for it; `opts.abilityCue`
  // overrides that for a sweep that wants to ask a different question.
  const cueName = opts.abilityCue
    || (opts.ability && ACTIVE_MODULES[opts.ability] && ACTIVE_MODULES[opts.ability].cue)
    || 'threat';
  const abilityCue = ABILITY_CUES[cueName] || ABILITY_CUES.threat;
  const abilityStats = { fires: 0, hit: 0, dry: 0, kills: 0, beamSecs: 0 };
  let burstBeam = false;
  // The road: fly the cells in the order they lie between the entry and the
  // target, then land. This is what proves the deep pad is reachable at all -
  // without it the far half of every map is decoration.
  //
  // `viaMaterial` adds the ore to that route. It is the only way to measure the
  // claim M15 rests on - that a player who wants the reward can go and get it -
  // because the control law will never detour for something it is not told to
  // fly to, and "the pilot did not collect any" is not evidence about the map.
  const road = opts.viaCells || opts.viaMaterial
    ? [
      ...(opts.viaCells ? terrain.fuelCells : []),
      ...(opts.viaMaterial ? (terrain.materialNodes || []) : []),
    ].sort((a, b) => Math.abs(a.x - start.x) - Math.abs(b.x - start.x))
    : [];
  let leg = 0;
  let legStarted = 0;
  const landing = makeControl(ship, terrain, level, opts);
  let control = road.length ? makeCruise(ship, terrain, level, road[0]) : landing;
  const input = { thrust: false, left: false, right: false, hold: false };
  const pads = terrain.pads;
  const target = opts.padIndex != null ? pads[opts.padIndex]
    : pads.reduce((a, b) => (b.mult > a.mult ? b : a), pads[0]);
  const targetMid = (target.x1 + target.x2) / 2;
  const halfPad = (target.x2 - target.x1) / 2;
  let closest = Infinity;
  const settings = opts.settings || PILOT_SETTINGS;
  const step = 1 / 120;
  const maxT = opts.maxSeconds || 120;
  let t = 0;
  let event = null;
  const carried = { material: 0, salvage: 0, nodes: 0 };
  // How far each status channel actually climbed while the lander was flying.
  // A channel's *consequence* only starts at its bite point, so "did this
  // mission ever get hot" is a different question from "what is the gauge
  // reading now", and the second one was all this returned.
  const peakStatus = {};

  while (t < maxT) {
    control(input);
    event = ship.step(step, input, level, terrain, t, settings);
    const got = terrain.collect(ship.x, ship.y, pickupRadius(ship.loadout));
    // Only the road refuels. Cargo and material are payload - counting them as
    // fuel would have quietly handed the pilot a bigger tank on every mission
    // that had ore in it, and every flight number here would have been a lie.
    const cells = got.filter((c) => c.kind === 'fuel').length;
    if (cells) ship.fuel = Math.min(ship.maxFuel, ship.fuel + FUEL_CELL * cells);
    for (const m of got) {
      if (m.kind !== 'material') continue;
      const worth = nodeWorth(m.tier);
      carried.material += worth.material;
      carried.salvage += worth.salvage;
      carried.nodes++;
    }
    if (leg < road.length) {
      // Move on when the cell is taken, or when this leg has plainly failed -
      // a cell in a hole the pilot cannot reach must not strand the flight.
      const passed = Math.sign(road[leg].x - start.x) * (ship.x - road[leg].x) > 40;
      if (road[leg].taken || passed || t - legStarted > 18) {
        leg++;
        legStarted = t;
        control = leg < road.length ? makeCruise(ship, terrain, level, road[leg]) : landing;
      }
    }
    if (field) {
      field.update(step, t, ship);
      // Hull loss is a crash like any other: the run ends where it ends.
      if (ship.hull <= 0 && ship.alive) { ship.alive = false; event = 'crash'; }
    }
    if (abilities) {
      if (abilities.ready && abilityCue({ ship, field, terrain, level, targetMid, halfPad })) {
        if (abilities.trigger(ship)) { abilityStats.fires++; burstBeam = false; }
      }
      const wasActive = abilities.active;
      abilities.update(step, { ship, field, terrain, level });
      if (abilities.beam) { abilityStats.beamSecs += step; burstBeam = true; }
      // Counted when the burst *ends*, not when it starts: the question is
      // whether pressing it produced a laser at any point, which is what a
      // player sees. A burst that starts with nothing in reach and finds
      // something as the lander drifts still did its job.
      if (wasActive && !abilities.active) {
        if (burstBeam) abilityStats.hit++; else abilityStats.dry++;
      }
    }
    for (const [k, v] of Object.entries(ship.statusLevels || {})) {
      if (!(peakStatus[k] >= v)) peakStatus[k] = v;
    }
    t += step;
    // Reachability: how near the pad did it get, low and slow enough to land?
    const alt = terrain.heightAt(ship.x) - ship.y;
    if (alt < 130 && Math.abs(ship.vy) < 60) closest = Math.min(closest, Math.abs(ship.x - targetMid));
    if (event === 'land' || event === 'crash') break;
  }

  // **The pilot stopped measuring at the moment of contact**, and a module about
  // what happens *after* contact could not be seen at all: Ice Cleats change
  // nothing this function ever returned, because the slide begins on the step
  // the loop breaks on. `settleSecs` keeps stepping with the controls released
  // and reports how far the lander travelled after touching down.
  //
  // Opt-in, and off by default, because `simSecs` is a recorded fixture figure
  // and this must not move it. Nothing else in the return changes either.
  let slid = null;
  if (opts.settleSecs && (event === 'land' || event === 'crash')) {
    const idle = { thrust: false, left: false, right: false, hold: false };
    const x0 = ship.x;
    for (let i = 0; i < opts.settleSecs * 120; i++) ship.step(step, idle, level, terrain, t + i * step, settings);
    slid = +Math.abs(ship.x - x0).toFixed(3);
  }

  if (abilities && abilities.active) { if (burstBeam) abilityStats.hit++; else abilityStats.dry++; }

  return {
    // The pad counts as reached if the ship got over it low and controlled -
    // that is what "reachable from spawn" means. Whether the touchdown was
    // clean is the pilot's problem, not the mission's.
    reached: closest <= halfPad + 120,   // over the pad region at landing altitude
    closest: Number.isFinite(closest) ? Math.round(closest) : null,
    outcome: event === 'land' ? 'land' : event === 'crash' ? 'crash' : 'timeout',
    grade: ship.landingResult ? ship.landingResult.grade : null,
    offPad: !!ship.offPad,
    fuelLeft: +ship.fuel.toFixed(1),
    simSecs: +t.toFixed(1),
    x: Math.round(ship.x),
    hull: Math.round(ship.hull),
    lostToFire: !!ship.lostToFire,
    combat: field ? field.summary() : null,
    ability: abilities ? { ...abilityStats, kills: field ? field.kills : 0,
      spent: abilities.used, left: abilities.charges,
      beamSecs: +abilityStats.beamSecs.toFixed(2) } : null,
    slid,
    peakStatus,
    // **The flight at full precision.** Everything above is rounded for a
    // fixture or a printed table - `x` to the pixel, `fuelLeft` to a tenth -
    // and that is a tolerance, not the flight. A cold soak that took attitude
    // authority from 1.00 to 0.84 moved the lander by less than half a pixel on
    // the way home, so a rounded trace read the Thermal Purge as doing nothing
    // at all. Nothing consumes this but the loadout gate; adding it cannot move
    // a recorded figure.
    exact: { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy, fuel: ship.fuel, spin: ship.spin },
    cellsTaken: terrain.fuelCells.filter((c) => c.taken).length,
    cells: terrain.fuelCells.length,
    carried,
    nodes: (terrain.materialNodes || []).length,
  };
}
