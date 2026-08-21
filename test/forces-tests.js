// Unit tests for the force/status interface:  node test/forces-tests.js
import { applyForces, forcesFor, freshStatus, freshEnv, RADIATION, STATUS_CHANNELS } from '../src/forces.js';
import { PLANETS, gravityFor, gravityPx } from '../src/planets.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) pass++; else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};
const mkShip = (o = {}) => ({ x: 100, y: 100, vx: 0, vy: 0, thrusting: false, windNow: 0, statusLevels: freshStatus(), env: freshEnv(), ...o });

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
  check('burning raises heat', ship.statusLevels.heat > 0, String(ship.statusLevels.heat.toFixed(1)));
  ship.thrusting = false;
  const peak = ship.statusLevels.heat;
  for (let i = 0; i < 120; i++) applyForces(ship, level, i / 120, 1 / 120);
  check('coasting sheds heat', ship.statusLevels.heat < peak);
  check('heat cannot go negative', ship.statusLevels.heat >= 0);
}
{
  const ship = mkShip();
  const level = { hazards: ['cryo'] };
  for (let i = 0; i < 240; i++) applyForces(ship, level, i / 120, 1 / 120);
  check('cold builds while coasting', ship.statusLevels.cold > 0);
  check('cold is capped', ship.statusLevels.cold <= 100);
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

// --- dust cycles visibility and always recovers
{
  const level = { hazards: [{ type: 'dust', period: 10, minVisibility: 0.3, duty: 0.5 }] };
  const ship = mkShip();
  const samples = [];
  for (let i = 0; i <= 100; i++) { applyForces(ship, level, i / 10, 1 / 120); samples.push(ship.env.visibility); }
  check('dust reduces visibility at some point', Math.min(...samples) < 0.4, Math.min(...samples).toFixed(2));
  check('dust clears completely at some point', Math.max(...samples) > 0.99);
  check('visibility never leaves 0..1', samples.every((v) => v >= 0 && v <= 1));
  const a = mkShip(), b = mkShip();
  applyForces(a, level, 3.3, 1 / 120); applyForces(b, level, 3.3, 1 / 120);
  check('dust is deterministic', a.env.visibility === b.env.visibility);
}

// --- wind channels reverse with altitude
{
  const level = { drag: 0.14, hazards: [{ type: 'windChannels', bandHeight: 200, strength: 50 }] };
  const high = mkShip({ y: 100 });
  const low = mkShip({ y: 300 });
  applyForces(high, level, 0, 1 / 60);
  applyForces(low, level, 0, 1 / 60);
  check('adjacent bands push opposite ways', Math.sign(high.windNow) === -Math.sign(low.windNow),
    `${high.windNow.toFixed(1)} vs ${low.windNow.toFixed(1)}`);
  check('the band actually moves the ship', high.vx !== 0);
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

// --- the ship's public surface must not be shadowed by state fields. The HUD
// calls ship.status(); a hazard field of the same name silently broke every
// render until a screenshot caught it.
{
  const { Ship } = await import('../src/ship.js');
  const s = new Ship();
  check('ship.status() is still a method', typeof s.status === 'function');
  check('ship.verdict() is still a method', typeof s.verdict === 'function');
  check('hazard levels live under statusLevels', typeof s.statusLevels === 'object');
  check('status() returns the envelope flags',
    ['vy', 'vx', 'tilt'].every((k) => typeof s.status()[k] === 'boolean'));
}

// --- M29: the radiation belt has a floor you can drop below
{
  const lvl = { hazards: [{ type: 'radiation', period: 10, duty: 1, rate: 40 }], width: 3000 };
  const terrain = { heightAt: () => 1000 };
  const at = (alt, secs = 20) => {
    const ship = {
      env: freshEnv(), statusLevels: freshStatus(), loadout: {}, hull: 100, hullMax: 100,
      x: 1500, y: 1000 - alt, damageOverTime(n) { this.hull -= n; },
    };
    for (let t = 0; t < secs; t += 0.05) applyForces(ship, lvl, t, 0.05, terrain);
    return ship;
  };
  const low = at(RADIATION.minAltitude - 120);
  const high = at(RADIATION.minAltitude + RADIATION.falloff + 200);
  check('below the belt, radiation does not reach you', low.statusLevels.radiation === 0 && low.hull === 100);
  check('above it, it does', high.statusLevels.radiation > 0 && high.hull < 100);
  check('the belt edge is published for the renderer', high.env.radiationBand === RADIATION.minAltitude);
  check('and how deep into it you are', high.env.radiationReach === 1 && low.env.radiationReach === 0);
  // The floor is what stops it finishing you on its own (M18).
  const parked = at(RADIATION.minAltitude + 400, 400);
  check('radiation never takes you past its floor',
    parked.hull >= 100 * RADIATION.floor - 0.01, parked.hull.toFixed(1));
}

// --- M29: dust squalls are random to the player and identical on replay
{
  const lvl = { id: 'squall-test', hazards: [{ type: 'dust', period: 14, minVisibility: 0.6, duty: 0.5 }] };
  const fly = () => {
    const ship = { env: freshEnv(), statusLevels: freshStatus(), loadout: {} };
    const trace = [];
    for (let t = 0; t < 180; t += 0.05) {
      applyForces(ship, lvl, t, 0.05, null);
      trace.push(ship.env.visibility);
    }
    return trace;
  };
  const a = fly();
  const b = fly();
  check('the same mission replays the same weather', JSON.stringify(a) === JSON.stringify(b));

  // Spans at the visibility floor: these are the squalls.
  const spans = [];
  let start = -1;
  a.forEach((v, i) => {
    const blind = v <= 0.06;
    if (blind && start < 0) start = i;
    else if (!blind && start >= 0) { spans.push((i - start) * 0.05); start = -1; }
  });
  check('a storm body gets squalls at all', spans.length > 0, String(spans.length));
  check('each one runs about 3-5 seconds',
    spans.every((d) => d >= 2.5 && d <= 5.6), spans.map((d) => d.toFixed(1)).join(','));
  const blindFrac = spans.reduce((n, d) => n + d, 0) / 180;
  check('but they are the exception, not the weather',
    blindFrac > 0.01 && blindFrac < 0.25, (blindFrac * 100).toFixed(0) + '%');

  // A different mission must not storm in lockstep with this one.
  const other = { id: 'squall-test-2', hazards: lvl.hazards };
  const ship2 = { env: freshEnv(), statusLevels: freshStatus(), loadout: {} };
  const t2 = [];
  for (let t = 0; t < 180; t += 0.05) { applyForces(ship2, other, t, 0.05, null); t2.push(ship2.env.visibility); }
  check('two missions do not squall in lockstep', JSON.stringify(a) !== JSON.stringify(t2));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
