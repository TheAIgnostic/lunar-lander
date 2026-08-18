// Unit tests for the force/status interface:  node test/forces-tests.js
import { applyForces, forcesFor, freshStatus, STATUS_CHANNELS } from '../src/forces.js';
import { PLANETS, gravityFor, gravityPx } from '../src/planets.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) pass++; else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};
const mkShip = (o = {}) => ({ x: 100, y: 100, vx: 0, vy: 0, thrusting: false, windNow: 0, status: freshStatus(), ...o });

console.log('forces and planets');

// --- the ported atmosphere must reproduce the original arithmetic exactly
{
  const level = { wind: 30, gust: 12, drag: 0.16 };
  const ship = mkShip({ vx: 5, vy: 20 });
  const t = 3.4, dt = 1 / 120;
  // the formula this replaced, computed independently
  const w = 30 + Math.sin(t * 0.7) * 12 + Math.sin(t * 1.9 + 1.3) * 12 * 0.4;
  const expVx = 5 + (w - 5) * 0.16 * dt;
  const expVy = 20 + (0 - 20) * 0.16 * 0.5 * dt;
  applyForces(ship, level, t, dt);
  check('atmosphere reproduces the original vx', Math.abs(ship.vx - expVx) < 1e-12, `${ship.vx} vs ${expVx}`);
  check('atmosphere reproduces the original vy', Math.abs(ship.vy - expVy) < 1e-12);
  check('atmosphere exposes the current wind', Math.abs(ship.windNow - w) < 1e-12);
}

// --- vacuum: no forces, wind reported as zero
{
  const ship = mkShip({ vx: 7, vy: 9 });
  applyForces(ship, { }, 1, 1 / 120);
  check('vacuum leaves velocity alone', ship.vx === 7 && ship.vy === 9);
  check('vacuum reports no wind', ship.windNow === 0);
}

// --- windless drag still applies (dense atmosphere, still air)
{
  const ship = mkShip({ vx: 40 });
  applyForces(ship, { drag: 0.3 }, 0, 0.1);
  check('drag alone slows the ship', ship.vx < 40 && ship.vx > 0, String(ship.vx));
}

// --- determinism: same inputs, same result
{
  const a = mkShip({ vx: 3 }), b = mkShip({ vx: 3 });
  const level = { wind: 20, gust: 10, drag: 0.1 };
  for (let i = 0; i < 50; i++) { applyForces(a, level, i / 120, 1 / 120); applyForces(b, level, i / 120, 1 / 120); }
  check('forces are deterministic', a.vx === b.vx && a.vy === b.vy);
}

// --- status channels
{
  const ship = mkShip({ thrusting: true });
  const level = { hazards: ['thermal'] };
  for (let i = 0; i < 120; i++) applyForces(ship, level, i / 120, 1 / 120);
  check('burning raises heat', ship.status.heat > 0, String(ship.status.heat.toFixed(1)));
  ship.thrusting = false;
  const peak = ship.status.heat;
  for (let i = 0; i < 120; i++) applyForces(ship, level, i / 120, 1 / 120);
  check('coasting sheds heat', ship.status.heat < peak);
  check('heat cannot go negative', ship.status.heat >= 0);
}
{
  const ship = mkShip();
  const level = { hazards: ['cryo'] };
  for (let i = 0; i < 240; i++) applyForces(ship, level, i / 120, 1 / 120);
  check('cold builds while coasting', ship.status.cold > 0);
  check('cold is capped', ship.status.cold <= 100);
}
{
  const ship = mkShip({ x: 500, y: 400 });
  const level = { hazards: [{ type: 'plumes', vents: [{ x: 500, period: 4, offset: 0, duty: 0.5, radius: 200, force: 90 }] }] };
  const before = ship.vy;
  applyForces(ship, level, 0.2, 1 / 60);
  check('an active plume lifts the ship', ship.vy < before, String(ship.vy));
  const ship2 = mkShip({ x: 500, y: 400 });
  applyForces(ship2, level, 3.0, 1 / 60);      // vent quiet in this part of the cycle
  check('a quiet plume does nothing', ship2.vy === 0);
  const ship3 = mkShip({ x: 900, y: 400 });
  applyForces(ship3, level, 0.2, 1 / 60);
  check('a distant plume does nothing', ship3.vy === 0);
}

// --- force lists are built once and cached
{
  const level = { wind: 10 };
  check('force list is cached on the level', forcesFor(level) === forcesFor(level));
  check('cache is not enumerable', !Object.keys(level).includes('__forces'));
}

// --- planets
check('every status channel initialises to zero',
  STATUS_CHANNELS.every((c) => freshStatus()[c] === 0));
check('the Moon maps to the current tuning', gravityFor('LUNA') === 28);
check('gravity ordering follows the real bodies',
  gravityFor('ENCELADUS') < gravityFor('PLUTO') && gravityFor('PLUTO') < gravityFor('EUROPA') &&
  gravityFor('EUROPA') < gravityFor('LUNA') && gravityFor('LUNA') < gravityFor('MARS') &&
  gravityFor('MARS') < gravityFor('VENUS'));
check('every body stays inside a flyable range',
  Object.keys(PLANETS).every((id) => gravityFor(id) > 5 && gravityFor(id) < 90));
check('compression keeps the extremes playable',
  gravityPx(0.11) > 5 && gravityPx(8.87) < 70);
check('unknown planets fail loudly', (() => { try { gravityFor('NOPE'); return false; } catch { return true; } })());
check('difficulty cannot reach gravity',
  !JSON.stringify(PLANETS).includes('difficulty'));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
