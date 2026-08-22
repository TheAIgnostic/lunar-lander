// Unit tests for the force/status interface:  node test/forces-tests.js
import { readFileSync } from 'node:fs';
import { applyForces, forcesFor, freshStatus, freshEnv, RADIATION, STATUS_CHANNELS, CHANNEL_RESIST, NON_FORCE_HAZARDS, HEAT, COLD, ACID, MAGNETIC, hazardName } from '../src/forces.js';
import { PLANETS, PLANET_IDS, gravityFor, gravityPx } from '../src/planets.js';
import { CHAPTERS } from '../src/missions.js';

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

// --- a mitigation slot for every channel, and each one has to work
//
// The M29 rule - a name in content indexing a table in code must resolve -
// applied to a table that is indexed by code rather than by content. The
// per-channel resist keys were briefly built as `channel + 'Resist'`, which
// works and is invisible: the loadout guard greps the source for every key the
// game sells, and an assembled name is in no file. Named in `CHANNEL_RESIST`
// now, so the guard can see them and this can require the set to be complete.
{
  for (const channel of STATUS_CHANNELS) {
    check(`${channel} has a mitigation key`, !!CHANNEL_RESIST[channel]);
  }
  for (const key of Object.keys(CHANNEL_RESIST)) {
    check(`CHANNEL_RESIST names a real channel: ${key}`, STATUS_CHANNELS.includes(key));
  }
  // And the key has to bite: raising the same hazard with and without it.
  const RIGS = {
    heat: [{ type: 'heat', heatRise: 30 }, true],
    cold: [{ type: 'cold', coldRate: 30 }, false],
    corrosion: [{ type: 'acid', acidRate: 30 }, false],
    radiation: [{ type: 'radiation', period: 20, duty: 0.9, rate: 40 }, false],
  };
  // High enough that the radiation belt reaches, low enough that acid is thick.
  const ground = { heightAt: () => 1400 };
  for (const [channel, [hazard, thrusting]] of Object.entries(RIGS)) {
    const level = { id: `resist-${channel}`, width: 2000, hazards: [hazard] };
    // **Time to a threshold, not the level at the end.** Every channel caps at
    // 100 and then holds, so a long enough run has each loadout converging on
    // the same number whatever the resistance was - the same trap the
    // `hazardResist` measurement in `loadout-tests.js` records.
    const run = (loadout) => {
      const ship = mkShip({ y: 200, thrusting, loadout });
      ship.damageOverTime = () => {};
      for (let i = 0; i < 300 * 60; i++) {
        applyForces(ship, level, i / 60, 1 / 60, ground);
        if (ship.statusLevels[channel] >= 40) return i / 60;
      }
      return Infinity;
    };
    const bare = run({});
    const sealed = run({ [CHANNEL_RESIST[channel]]: 0.4 });
    check(`${CHANNEL_RESIST[channel]} slows ${channel}`, Number.isFinite(bare) && sealed > bare,
      `${bare.toFixed(1)}s -> ${sealed === Infinity ? 'never' : sealed.toFixed(1) + 's'} to 40%`);
  }
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

// --- **Every declared hazard must resolve to a builder.**
//
// This is the single most valuable assertion in the file and it is here because
// of what M29 found. `forcesFor` looks a hazard's name up in `BUILDERS`, and a
// miss is completely silent: the force is never built, and the body flies with
// nothing while its route card, its summary and its brief all describe weather.
//
// Audited across every planet and every authored mission, four bodies were in
// that state - **Mercury, Io, Enceladus and Ganymede had no working hazard at
// all**, halfway down a ladder every run walks. Three were spelling: `'heat'`
// against a builder named `thermal`, `'cold'` against `cryo`, `'plume'` against
// `plumes`. M28b's review caught the `plume` one; `heat` and `cold` had never
// been noticed, and both `ROADMAP_STATUS.md` and `docs/ARCHITECTURE.md` listed
// them as working.
//
// So the test asserts the *property* rather than a list of known-good names,
// which is the lesson M24 and M28 both recorded about assertions that encode a
// decision instead of a rule.
{
  const declared = new Map();
  const note = (h, where) => {
    const t = hazardName(h);
    if (!declared.has(t)) declared.set(t, new Set());
    declared.get(t).add(where);
  };
  for (const id of PLANET_IDS) for (const h of PLANETS[id].hazards || []) note(h, id);
  for (const c of Object.values(CHAPTERS)) {
    for (const m of c.missions) for (const h of m.hazards || []) note(h, m.id);
  }
  const hollow = [...declared.keys()].filter((t) => !NON_FORCE_HAZARDS.includes(t));
  for (const t of hollow) {
    // A hazard resolves if declaring it alone builds at least one force.
    const built = forcesFor({ id: `probe-${t}`, width: 3000, hazards: [t] });
    check(`the hazard '${t}' builds a force`, built.length > 0,
      `declared by ${[...declared.get(t)].slice(0, 3).join(', ')}`);
  }
  check('every hazard name in the game was checked', declared.size >= 12, String(declared.size));

  // **And the same question of the *other* table keyed on these names.**
  //
  // M29 fixed `BUILDERS` and asserted every hazard name resolves to a builder.
  // It never asked whether anything *else* was keyed on the same names - and
  // `flightAssist`'s tips table was, on the builder names (`thermal`, `cryo`,
  // `plumes`) while content declares `heat`, `cold`, `plume`. **8 of 50
  // missions got a hazard tip**, in the one feature that exists for a player
  // who has already lost three landers to that weather.
  //
  // So the rule generalises rather than being re-learned per table: wherever a
  // name in content indexes a table in code, assert that every name resolves.
  {
    const src = readFileSync(new URL('../src/screens.js', import.meta.url), 'utf8');
    const from = src.indexOf('const HAZARD_TIPS = {');
    const to = src.indexOf('export const TIPLESS_HAZARDS');
    check('the tips table is findable', from > 0 && to > from);
    const keys = [...src.slice(from, to).matchAll(/^ {2}([a-zA-Z]+):/gm)].map((m) => m[1]);
    const tipless = (src.match(/export const TIPLESS_HAZARDS = \[([^\]]*)\]/) || [, ''])[1]
      .split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    for (const t of declared.keys()) {
      check(`the hazard '${t}' has advice for a stuck player`,
        keys.includes(t) || tipless.includes(t),
        `declared by ${[...declared.get(t)].slice(0, 3).join(', ')}`);
    }
    // And the table has nothing in it that no content declares, which is the
    // other half: a tip for a hazard that does not exist is a tip nobody sees.
    for (const k of keys) {
      check(`the tip for '${k}' is for a hazard something declares`, declared.has(k), k);
    }
  }
}

// --- **Every body on the ladder has weather that does something.**
// The count above proves a *name* resolves; this proves each body ends up with
// forces. Luna is the deliberate exception: airless, hazardless, and the place
// the player learns to fly.
{
  for (const id of PLANET_IDS) {
    const built = forcesFor({ ...PLANETS[id], id: `body-${id}`, width: 3000 });
    if (id === 'LUNA') check('the Moon is deliberately empty', built.length === 0, built.map((f) => f.id).join(','));
    else check(`${id} builds at least one force`, built.length > 0);
  }
}

// --- Heat, cold, acid and charge: a consequence, and a rate a player can act on
//
// Both halves matter. A status that only fills a gauge is the fault M29a named
// on radiation ("it had no shape"), and a status that saturates in three
// seconds is the fault M18 fixed on radiation ("no time to reach a shadow").
// The first tuning of these four reproduced the second fault exactly - Mercury
// went clean to derated in 3.2 s - so the timing is asserted, not just the
// effect.
{
  const terrain = { heightAt: () => 1100 };
  const run = (level, duty, seconds) => {
    const ship = mkShip({ x: 1500, y: 800, hull: 100, hullMax: 100, damageOverTime() {}, loadout: {} });
    for (let i = 0; i < seconds * 60; i++) {
      ship.thrusting = (i % 100) < duty * 100;
      applyForces(ship, level, i / 60, 1 / 60, terrain);
    }
    return ship;
  };
  // Long enough to pass HEAT.bite at this rise rate - 11/s from clean needs
  // more than 5 s to reach 60, which is the point of the rate rule below.
  const heat = run({ id: 'h', width: 3000, hazards: [{ type: 'heat', heatRise: 11, heatFall: 4 }] }, 1, 12);
  check('heat derates the engine once it bites', heat.thermalDerate < 1 && heat.thermalDerate >= HEAT.minThrust - 1e-9,
    heat.thermalDerate.toFixed(2));
  const cool = run({ id: 'h2', width: 3000, hazards: [{ type: 'heat', heatRise: 11, heatFall: 4 }] }, 0, 30);
  check('and lets go again when you stop burning', cool.thermalDerate === 1);

  const cold = run({ id: 'c', width: 3000, hazards: [{ type: 'cold', coldRate: 2.5 }] }, 0, 60);
  check('cold stiffens the thrusters', cold.rcsStiffness < 1 && cold.rcsStiffness >= COLD.minRcs - 1e-9,
    cold.rcsStiffness.toFixed(2));

  // The rate rule: nothing may go from clean to bitten inside a few seconds.
  const bitesAt = (level, duty, read) => {
    const ship = mkShip({ x: 1500, y: 800, hull: 100, hullMax: 100, damageOverTime() {}, loadout: {} });
    for (let i = 0; i < 120 * 60; i++) {
      ship.thrusting = (i % 100) < duty * 100;
      applyForces(ship, level, i / 60, 1 / 60, terrain);
      if (read(ship) >= 55) return i / 60;
    }
    return Infinity;
  };
  for (const c of Object.values(CHAPTERS)) {
    for (const lvl of c.levels) {
      const kinds = (lvl.hazards || []).map((h) => (typeof h === 'string' ? h : h.type));
      if (kinds.includes('heat')) {
        const t = bitesAt(lvl, 0.5, (s) => s.statusLevels.heat);
        check(`${lvl.id}: heat takes more than 10 s to bite`, t > 10, `${t.toFixed(1)}s`);
      }
      if (kinds.includes('cold')) {
        const t = bitesAt(lvl, 0.3, (s) => s.statusLevels.cold);
        check(`${lvl.id}: cold takes more than 10 s to bite`, t > 10, `${t.toFixed(1)}s`);
      }
      if (kinds.includes('acid')) {
        const t = bitesAt(lvl, 0.4, (s) => s.statusLevels.corrosion);
        check(`${lvl.id}: corrosion takes more than 10 s to bite`, t > 10, `${t.toFixed(1)}s`);
      }
    }
  }

  // Acid eats hull, and stops. The floor is the M18 rule: a hazard softens you
  // up, it never finishes you.
  const sour = { id: 'a', width: 3000, hazards: [{ type: 'acid', acidRate: 30 }] };
  const ship = mkShip({ x: 1500, y: 1090, hull: 100, hullMax: 100, loadout: {} });
  ship.damageOverTime = (n) => { ship.hull = Math.max(0, ship.hull - n); };
  for (let i = 0; i < 300 * 60; i++) applyForces(ship, sour, i / 60, 1 / 60, terrain);
  check('corrosion costs hull', ship.hull < 100, ship.hull.toFixed(1));
  check('and never takes the last of it', ship.hull >= 100 * ACID.floor - 0.5, ship.hull.toFixed(1));
}

// --- `falseRadar` may never touch the simulation
//
// The rule this hazard lives or dies by, and the inverse of the accessibility
// rule: there, presentation may never reach the simulation; here, a hazard may
// never leave presentation. Flown twice from the same state, with and without
// the lie, the lander must end in exactly the same place.
{
  const terrain = { heightAt: () => 1400 };
  const fly = (hazards) => {
    const ship = mkShip({ x: 1500, y: 900, vx: 40, vy: -10, spin: 0, loadout: {} });
    const lvl = { id: 'radar-test', width: 3000, gravity: 26, hazards };
    for (let i = 0; i < 60 * 30; i++) applyForces(ship, lvl, i / 60, 1 / 60, terrain);
    return `${ship.x.toFixed(6)}/${ship.y.toFixed(6)}/${ship.vx.toFixed(6)}/${ship.vy.toFixed(6)}/${ship.spin.toFixed(6)}`;
  };
  check('a lying instrument does not move the lander',
    fly([]) === fly([{ type: 'falseRadar', radarError: 2 }]), `${fly([])} vs ${fly([{ type: 'falseRadar', radarError: 2 }])}`);
  const lying = mkShip({ x: 1500, y: 900, loadout: {} });
  applyForces(lying, { id: 'r2', width: 3000, hazards: [{ type: 'falseRadar', radarError: 1 }] }, 3.1, 1 / 60, terrain);
  check('...but it does move the readout', Math.abs(lying.env.instrumentError) > 0.01,
    String(lying.env.instrumentError));
}

// --- The sanctuary rule covers placed weather too
//
// M29 put hazards in *places* for the first time, and the first tuning had an
// Enceladus vent over the safe pad: the way home fell to 11/20 while the deep
// route held at 19/20 on every force setting tried. A machine may not reach the
// safe pad and neither may the weather, for exactly the same reason.
{
  const pads = [
    { x1: 400, x2: 560, tier: 0, mult: 2 },
    { x1: 2400, x2: 2500, tier: 2, mult: 5 },
  ];
  const terrain = { pads, heightAt: () => 1100 };
  const at = (x) => {
    const ship = mkShip({ x, y: 700, hull: 100, hullMax: 100, damageOverTime() {}, loadout: {} });
    const lvl = { id: 'sanct', width: 3000, hazards: [{ type: 'plume', vents: [{ x, period: 8, duty: 0.9, radius: 200, force: 60 }] }] };
    let moved = 0;
    for (let i = 0; i < 60 * 4; i++) { const before = ship.vy; applyForces(ship, lvl, i / 60, 1 / 60, terrain); moved += Math.abs(ship.vy - before); }
    return moved;
  };
  check('a vent over the safe pad does nothing', at(480) < 1e-9, String(at(480)));
  check('a vent over the prize pad works normally', at(2450) > 0.1, String(at(2450)));
  check('and a vent out on the crossing works normally', at(1500) > 0.1, String(at(1500)));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
