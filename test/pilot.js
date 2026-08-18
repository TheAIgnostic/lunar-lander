// The autopilot control law, as a pure module. Shared by the browser harness
// and by node-side mission validation so both fly identically.

import { Ship, DEFAULT_SETTINGS } from '../src/ship.js';
import { spawnFor } from '../src/spawn.js';

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
  const tx = (pad.x1 + pad.x2) / 2;
  const grav = level.gravity;
  const aLat = THRUST * Math.sin(0.5) * 0.8;
  // Approach bias lets the validator try genuinely different routes.
  const bias = opts.approach === 'left' ? -1 : opts.approach === 'right' ? 1 : 0;
  const kP = opts.kP != null ? opts.kP : 0.0016;   // position hold, rad per px
  const kD = opts.kD != null ? opts.kD : 0.012;    // velocity damping, rad per px/s
  let phase = 'ACCEL';
  let staged = bias !== 0;

  return function control(input) {
    const ground = terrain.heightAt(ship.x);
    const alt = ground - ship.y;
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

    const roofGap = terrain.ceiling ? ship.y - terrain.ceilingAt(ship.x) : Infinity;
    const roofPush = roofGap < 120;
    const roofNear = roofGap < 220;

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
      else if (closing < 22 && adx > 120) phase = 'ACCEL';
    } else if (phase === 'BRAKE') {
      const closing = ship.vx * Math.sign(dx);
      wantAngle = ff - Math.sign(ship.vx || dx) * (roofNear ? 0.28 : 0.5);
      thrust = Math.abs(ship.vx) > 9 && Math.abs(norm(ship.angle - wantAngle)) < 0.14;
      if ((Math.abs(ship.vx) <= 9 && closing <= 12) || adx < 26) phase = staged ? 'ACCEL' : 'DESCEND';
    } else {
      // Hold a position, not a velocity: under a steady crosswind a velocity
      // controller settles downwind of the pad and never returns.
      wantAngle = clamp(ff + dx * kP - ship.vx * kD, -0.4, 0.4);
      const lined = adx < 22;
      if (alt < 55 && lined) wantAngle = clamp(wantAngle, ff - 0.06, ff + 0.06);
      // Never sink into the last 130 px while still off-target: under crosswind
      // that is exactly how a descent ends short of the pad.
      const holdAltitude = !lined && alt < 130;
      thrust = ship.vy > (holdAltitude ? -8 : vyMax);
      if (adx > 60 && alt < 220) phase = 'ACCEL';
    }

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
 * Fly a mission start to finish with no browser and no game loop.
 * Returns { outcome, grade, fuelLeft, simSecs, offPad }.
 */
export function flyMission(level, terrain, opts = {}) {
  const ship = new Ship();
  const start = spawnFor(level, terrain);
  ship.reset(start.x, start.y, level.fuel);
  ship.vx = start.vx;
  ship.vy = start.vy;

  const control = makeControl(ship, terrain, level, opts);
  const input = { thrust: false, left: false, right: false, hold: false };
  const pads = terrain.pads;
  const target = opts.padIndex != null ? pads[opts.padIndex]
    : pads.reduce((a, b) => (b.mult > a.mult ? b : a), pads[0]);
  const targetMid = (target.x1 + target.x2) / 2;
  const halfPad = (target.x2 - target.x1) / 2;
  let closest = Infinity;
  const settings = opts.settings || DEFAULT_SETTINGS;
  const step = 1 / 120;
  const maxT = opts.maxSeconds || 120;
  let t = 0;
  let event = null;

  while (t < maxT) {
    control(input);
    event = ship.step(step, input, level, terrain, t, settings);
    t += step;
    // Reachability: how near the pad did it get, low and slow enough to land?
    const alt = terrain.heightAt(ship.x) - ship.y;
    if (alt < 130 && Math.abs(ship.vy) < 60) closest = Math.min(closest, Math.abs(ship.x - targetMid));
    if (event === 'land' || event === 'crash') break;
  }

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
  };
}
