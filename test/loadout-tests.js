// Skills, components and modules: does any of it reach the simulation?
//
//   node test/loadout-tests.js
//
// M11 recorded that every module had "a consumer already in the simulation".
// That was true of the four passives and false of the four actives - nothing
// could fire them - and it went unnoticed because the only thing reading them
// was a *screen*. This suite exists so that cannot happen twice. It asks three
// separate questions, and the third is the one M11 got wrong:
//
//   1. does the derivation fold the numbers correctly?
//   2. does every declared effect key have a reader outside its own file?
//   3. does turning the effect on actually move the simulation?
//
// Question 3 is answered by running the physics, never by reading the spec.
import { readFileSync, readdirSync } from 'node:fs';
import { Ship, SHIP, ENVELOPE } from '../src/ship.js';
import { Terrain } from '../src/terrain.js';
import { drawTrajectory } from '../src/render.js';
import { spawnFor } from '../src/spawn.js';
import { Abilities } from '../src/abilities.js';
import { EnemyField } from '../src/enemies.js';
import { applyForces } from '../src/forces.js';
import { deriveFull, deriveLoadout, COMPONENTS, COMPONENT_IDS, purchaseCheck, purchase } from '../src/components.js';
import { TREES, ALL_NODES, deriveSkills, skillCheck, buySkill, findNode } from '../src/skills.js';
import { ACTIVE_MODULES, PASSIVE_MODULES, derivePassive } from '../src/modules.js';
import { missionReward, settleHaul, freshHaul } from '../src/economy.js';
import { LANDING, capsFor, evaluateLanding } from '../src/landing.js';
import { MOON_LEVELS, MARS_LEVELS, EUROPA_LEVELS } from '../src/missions.js';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; return true; }
  fail++;
  console.log(`  FAIL  ${name}${extra ? `  ${extra}` : ''}`);
  return false;
};
const section = (s) => console.log(`\n${s}\n`);

/** A ship with a given loadout, parked in open air on a real mission. */
function rig(loadout, levelIndex = 0, levels = MOON_LEVELS) {
  const level = levels[levelIndex];
  const terrain = new Terrain(level, 4242);
  const ship = new Ship();
  ship.applyLoadout(loadout);
  const start = spawnFor(level, terrain);
  ship.reset(start.x, start.y, Math.round(level.fuel * (loadout.fuelCapacity || 1)));
  return { ship, terrain, level };
}

/**
 * Hold an input for `secs` and report what it cost and what it did.
 *
 * Kept short and started mid-map on purpose: thrusting straight up for two
 * seconds pins the lander against the top of the world and every engine reads
 * the same, and a quarter-turn of RCS saturates `maxSpin`. Both of those are
 * the harness lying, not the upgrade failing.
 */
function burn(loadout, input, secs = 0.5, levelIndex = 0) {
  const { ship, terrain, level } = rig(loadout, levelIndex);
  ship.y = terrain.heightAt(ship.x) - 520;      // room to move in both directions
  const startFuel = ship.fuel;
  const x0 = ship.x;
  const y0 = ship.y;
  for (let i = 0; i < secs * 120; i++) ship.step(1 / 120, input, level, terrain, i / 120);
  return {
    used: startFuel - ship.fuel,
    vx: ship.vx, vy: ship.vy, spin: ship.spin, angle: ship.angle,
    dx: ship.x - x0, dy: ship.y - y0, fuel: ship.fuel, maxFuel: ship.maxFuel,
  };
}

const THRUST = { thrust: true, left: false, right: false, hold: false };
const SPIN = { thrust: false, left: false, right: true, hold: false };

// ---------------------------------------------------------------------------
section('1. the derivation folds correctly');

{
  // Shared constants must never be touched - the "cannot stack twice after a
  // reload" rule from M10.
  const before = JSON.stringify(SHIP);
  const s = new Ship();
  s.applyLoadout(deriveFull({ engine: 4 }, deriveSkills({ 'fuel-mix': 3 }), derivePassive('fuel-recycler')));
  s.applyLoadout(deriveFull({ engine: 4 }, deriveSkills({ 'fuel-mix': 3 }), derivePassive('fuel-recycler')));
  check('applying a loadout twice never mutates SHIP', JSON.stringify(SHIP) === before);
  const twice = s.spec.burnMain;
  const once = new Ship();
  once.applyLoadout(deriveFull({ engine: 4 }, deriveSkills({ 'fuel-mix': 3 }), derivePassive('fuel-recycler')));
  check('and never stacks the same upgrade twice', Math.abs(twice - once.spec.burnMain) < 1e-9,
    `${once.spec.burnMain} vs ${twice}`);
}

{
  // Every node, at every rank, must move its own numbers and nothing else's.
  const base = deriveSkills({});
  for (const node of ALL_NODES) {
    for (let r = 1; r <= node.ranks; r++) {
      const got = deriveSkills({ [node.id]: r });
      const declared = node.effect(r);
      const moved = Object.keys(got).filter((k) => got[k] !== base[k]);
      check(`${node.id} rank ${r} moves exactly what it declares`,
        moved.length === Object.keys(declared).length && moved.every((k) => k in declared),
        `moved ${moved.join()} declared ${Object.keys(declared).join()}`);
    }
    // Buying past the last rank must be refused, and rank is capped.
    const maxed = deriveSkills({ [node.id]: node.ranks + 5 });
    const atMax = deriveSkills({ [node.id]: node.ranks });
    check(`${node.id} cannot be pushed past its last rank`,
      JSON.stringify(maxed) === JSON.stringify(atMax));
  }
}

{
  // Prerequisites, cost curve and the feature gate.
  const feat = { enemies: true };
  check('a tier-2 node is refused without its prerequisite',
    skillCheck('black-box', {}, 9999, feat).locked === true);
  check('and allowed once the prerequisite is held',
    skillCheck('black-box', { 'field-patching': 1 }, 9999, feat).ok === true);
  check('the combat tree is gated when a body has no hostiles',
    skillCheck('capacitor', {}, 9999, {}).gated === true);
  check('and open once it does', skillCheck('capacitor', {}, 9999, feat).ok === true);
  check('rank 2 costs twice rank 1',
    skillCheck('fuel-mix', { 'fuel-mix': 1 }, 9999, feat).cost === findNode('fuel-mix').cost * 2);
  check('a purchase you cannot afford is refused with a reason',
    /more research data/.test(skillCheck('fuel-mix', {}, 0, feat).reason));
  const before = { 'fuel-mix': 1 };
  const after = buySkill('fuel-mix', before, 9999, feat);
  check('buying never mutates the record it was given', before['fuel-mix'] === 1 && after.purchased['fuel-mix'] === 2);
  check('and it charges for the rank', after.researchData === 9999 - findNode('fuel-mix').cost * 2);
}

{
  // Two sources of one effect must never combine into something worse than
  // either source alone. This is the whole reason the rule is tested rather
  // than assumed: `deriveFull` adds where it should multiply, and equipping
  // the Gyro Stabilizer used to make gusts *stronger*.
  const sources = [
    { key: 'disturbanceResist', skills: { 'inertial-dampers': 2 }, passive: 'gyro-stabilizer', better: 'lower' },
    { key: 'burnMain', skills: { 'fuel-mix': 3 }, passive: 'fuel-recycler', better: 'lower' },
    { key: 'noiseResist', skills: {}, passive: 'hardened-radar', better: 'lower' },
  ];
  for (const s of sources) {
    const none = deriveFull({}, deriveSkills({}), {});
    const skillOnly = deriveFull({}, deriveSkills(s.skills), {});
    const passiveOnly = deriveFull({}, deriveSkills({}), derivePassive(s.passive));
    const both = deriveFull({}, deriveSkills(s.skills), derivePassive(s.passive));
    const cmp = (a, b) => (s.better === 'lower' ? a <= b : a >= b);
    check(`${s.key}: the passive alone is an improvement`, cmp(passiveOnly[s.key], none[s.key]),
      `none ${none[s.key]} -> passive ${passiveOnly[s.key]}`);
    check(`${s.key}: both together beat either alone`,
      cmp(both[s.key], skillOnly[s.key]) && cmp(both[s.key], passiveOnly[s.key]),
      `skill ${skillOnly[s.key]} passive ${passiveOnly[s.key]} both ${both[s.key]}`);
  }
}

{
  // Components: each track must climb, and a refusal must name what is missing.
  for (const id of COMPONENT_IDS) {
    const l1 = deriveLoadout({ [id]: 1 });
    const l4 = deriveLoadout({ [id]: 4 });
    check(`${id} level 4 differs from level 1`, JSON.stringify(l1) !== JSON.stringify(l4));
  }
  const broke = { salvage: 0, materials: {} };
  const refusal = purchaseCheck('engine', {}, broke);
  check('a purchase you cannot afford names what is missing',
    !refusal.ok && /more salvage|more /.test(refusal.reason), refusal.reason);
  const rich = { salvage: 99999, materials: Object.fromEntries(
    COMPONENT_IDS.flatMap((c) => COMPONENTS[c].levels.flatMap((l) => Object.keys((l.cost || {}).materials || {}))).map((m) => [m, 9999])) };
  const bought = purchase('engine', {}, rich);
  check('a purchase spends and levels up',
    bought && bought.componentLevels.engine === 2 && bought.banked.salvage < rich.salvage);
  check('and never mutates the bank it was given', rich.salvage === 99999);
}

// ---------------------------------------------------------------------------
section('2. every declared effect has a reader outside its own file');

{
  // The M11 guard, automated. A key that only its definition file mentions is
  // a number on a screen, whatever the blurb says about it.
  const DEFINING = new Set(['skills.js', 'modules.js', 'components.js']);
  // **Comments are not readers, and this check counted them.** `hazardLead` is
  // sold by Sensors L3 and read by nothing; it sat on KNOWN_GAPS and was
  // reported every run - until a *comment* elsewhere mentioned it by name, at
  // which point the guard decided it was delivered and went quiet. Two comments
  // mention it today and neither is code.
  //
  // That is the fault this very check exists to catch, occurring inside the
  // check: a thing that looks like it is working and is not. Strip comments
  // before asking who reads a key.
  const stripComments = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
    .replace(/\/\/.*$/gm, '');
  const src = readdirSync(new URL('../src/', import.meta.url))
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ f, text: stripComments(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')) }));

  const declared = new Map();
  const note = (key, where) => { if (!declared.has(key)) declared.set(key, where); };
  for (const n of ALL_NODES) for (const k of Object.keys(n.effect(n.ranks))) note(k, `skill ${n.id}`);
  for (const m of Object.values(PASSIVE_MODULES)) for (const k of Object.keys(m.effect)) note(k, `passive ${m.id}`);
  for (const m of Object.values(ACTIVE_MODULES)) for (const k of Object.keys(m.effect)) note(k, `active ${m.id}`);
  for (const c of COMPONENT_IDS) {
    for (const lvl of COMPONENTS[c].levels) for (const k of Object.keys(lvl.effect || {})) note(k, `component ${c}`);
  }

  // Keys known to be sold and not yet delivered, tracked in ROADMAP_STATUS.md.
  // Anything *not* on this list that has no reader is a hard failure - that is
  // the M11 regression guard. Shrinking this list is the point; growing it
  // should take an argument.
  const KNOWN_GAPS = new Set(['hazardLead']);
  const gaps = [];
  for (const [key, where] of declared) {
    const readers = src
      .filter(({ f }) => !DEFINING.has(f))
      .filter(({ text }) => new RegExp(`\\b${key}\\b`).test(text))
      .map(({ f }) => f);
    if (!readers.length && KNOWN_GAPS.has(key)) { gaps.push(`${key} (${where})`); continue; }
    check(`${key} (${where}) is read by the game`, readers.length > 0,
      'declared, folded into the spec, and never read by anything');
  }
  for (const g of gaps) console.log(`  GAP   ${g} - sold to the player, not yet delivered`);
}

// ---------------------------------------------------------------------------
section('3. turning it on moves the simulation');

{
  // --- fuel: burnMain / burnRcs, from both a skill and a passive
  const plain = burn(deriveFull({}, deriveSkills({}), {}), THRUST);
  const skill = burn(deriveFull({}, deriveSkills({ 'fuel-mix': 3 }), {}), THRUST);
  const pass2 = burn(deriveFull({}, deriveSkills({}), derivePassive('fuel-recycler')), THRUST);
  check('fuel-mix burns less main fuel in flight', skill.used < plain.used * 0.9,
    `${plain.used.toFixed(1)} -> ${skill.used.toFixed(1)}`);
  check('fuel-recycler burns less main fuel in flight', pass2.used < plain.used * 0.9,
    `${plain.used.toFixed(1)} -> ${pass2.used.toFixed(1)}`);
  const rcsPlain = burn(deriveFull({}, deriveSkills({}), {}), SPIN, 0.25);
  const rcsSkill = burn(deriveFull({}, deriveSkills({ 'fuel-mix': 3 }), {}), SPIN, 0.25);
  check('fuel-mix burns less RCS fuel too', rcsSkill.used < rcsPlain.used * 0.95,
    `${rcsPlain.used.toFixed(1)} -> ${rcsSkill.used.toFixed(1)}`);

  // --- fuelCapacity: a bigger tank at mission start
  const tank = burn(deriveFull({}, deriveSkills({ 'reserve-tank': 2 }), {}), THRUST);
  check('reserve-tank starts the mission with a bigger tank', tank.maxFuel > plain.maxFuel * 1.15,
    `${plain.maxFuel} -> ${tank.maxFuel}`);

  // --- thrust / rcsAccel / sideThrust, from components
  const engine = burn(deriveFull({ engine: 4 }, deriveSkills({}), {}), THRUST);
  check('the engine track accelerates the lander harder', engine.vy < plain.vy - 1,
    `vy ${plain.vy.toFixed(1)} -> ${engine.vy.toFixed(1)}`);
  const rcs = burn(deriveFull({ rcs: 4 }, deriveSkills({}), {}), SPIN, 0.25);
  check('the RCS track spins the lander faster', Math.abs(rcs.spin) > Math.abs(rcsPlain.spin) * 1.05,
    `${rcsPlain.spin.toFixed(2)} -> ${rcs.spin.toFixed(2)}`);
}

{
  // --- gearTier and restitution: the same impact, graded differently
  const land = (loadout, vy) => {
    const { ship, terrain, level } = rig(loadout);
    const pad = terrain.pads[terrain.pads.length - 1];
    ship.x = (pad.x1 + pad.x2) / 2;
    ship.y = pad.y - 30;
    ship.vx = 0; ship.vy = vy; ship.angle = 0; ship.spin = 0;
    const idle = { thrust: false, left: false, right: false, hold: false };
    let ev = null;
    for (let i = 0; i < 900 && !ev; i++) {
      const e = ship.step(1 / 120, idle, level, terrain, i / 120);
      if (e === 'land' || e === 'crash') ev = e;
    }
    return { ev, grade: ship.landingResult ? ship.landingResult.grade : null, hull: ship.hull, hullMax: ship.hullMax };
  };
  const RANK = { PERFECT: 3, GOOD: 2, HARD: 1 };
  const bare = land(deriveFull({}, deriveSkills({}), {}), 26);
  const strut = land(deriveFull({}, deriveSkills({ 'reinforced-struts': 3 }), {}), 26);
  check('reinforced-struts grades the same impact better',
    bare.ev === 'land' && strut.ev === 'land' && RANK[strut.grade] >= RANK[bare.grade]
      && (RANK[strut.grade] > RANK[bare.grade] || strut.hull >= bare.hull),
    `${bare.grade} -> ${strut.grade}`);
  const gear = land(deriveFull({ gear: 4 }, deriveSkills({}), {}), 30);
  const noGear = land(deriveFull({}, deriveSkills({}), {}), 30);
  check('the gear track survives an impact the stock legs grade worse',
    RANK[gear.grade] >= RANK[noGear.grade] || (noGear.ev === 'crash' && gear.ev === 'land'),
    `${noGear.ev}/${noGear.grade} -> ${gear.ev}/${gear.grade}`);

  // --- hullMax and impactResist, from the hull track
  const stock = new Ship(); stock.applyLoadout(deriveFull({}, deriveSkills({}), {})); stock.reset(0, 0, 100);
  const armoured = new Ship(); armoured.applyLoadout(deriveFull({ hull: 4 }, deriveSkills({}), {})); armoured.reset(0, 0, 100);
  check('the hull track raises maximum hull', armoured.hullMax > stock.hullMax,
    `${stock.hullMax} -> ${armoured.hullMax}`);
  stock.damage(20); armoured.damage(20);
  check('and takes less from the same hit',
    (armoured.hullMax - armoured.hull) <= (stock.hullMax - stock.hull),
    `${stock.hullMax - stock.hull} vs ${armoured.hullMax - armoured.hull}`);

  // --- repairOnLanding: hull back after a landing
  const patched = (() => {
    const { ship, terrain, level } = rig(deriveFull({}, deriveSkills({ 'field-patching': 2 }), {}));
    ship.hull = Math.round(ship.hullMax * 0.5);
    const pad = terrain.pads[terrain.pads.length - 1];
    ship.x = (pad.x1 + pad.x2) / 2; ship.y = pad.y - 24; ship.vy = 8;
    const idle = { thrust: false, left: false, right: false, hold: false };
    for (let i = 0; i < 900 && !ship.landed; i++) ship.step(1 / 120, idle, level, terrain, i / 120);
    return ship.hull / ship.hullMax;
  })();
  check('field-patching returns hull after a landing', patched > 0.5, `${(patched * 100).toFixed(0)}%`);
}

{
  // --- disturbanceResist: does a gust actually get smaller?
  // A bare atmosphere with a gust in it and nothing else. Using a real Mars
  // mission hid this: `windChannels` overwrites `ship.windNow` after the
  // atmosphere sets it, so every loadout measured identically.
  const gustAfter = (loadout) => {
    const level = { id: 'gust-rig', width: 2600, height: 1400, groundBase: 300, rough: 150,
      gravity: 42, fuel: 120, pads: [{ mult: 2, width: 200 }], wind: 0, gust: 60, drag: 0, hazards: [] };
    const terrain = new Terrain(level, 4242);
    const ship = new Ship();
    ship.applyLoadout(loadout);
    const start = spawnFor(level, terrain);
    ship.reset(start.x, start.y, level.fuel);
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      applyForces(ship, level, i / 120, 1 / 120);
      peak = Math.max(peak, Math.abs(ship.windNow || 0));
    }
    return peak;
  };
  const noDamp = gustAfter(deriveFull({}, deriveSkills({}), {}));
  const skillDamp = gustAfter(deriveFull({}, deriveSkills({ 'inertial-dampers': 2 }), {}));
  const gyro = gustAfter(deriveFull({}, deriveSkills({}), derivePassive('gyro-stabilizer')));
  const both = gustAfter(deriveFull({}, deriveSkills({ 'inertial-dampers': 2 }), derivePassive('gyro-stabilizer')));
  check('inertial-dampers shrinks the gust', skillDamp < noDamp * 0.95, `${noDamp.toFixed(1)} -> ${skillDamp.toFixed(1)}`);
  check('the gyro passive shrinks the gust', gyro < noDamp * 0.95, `${noDamp.toFixed(1)} -> ${gyro.toFixed(1)}`);
  check('and the two together shrink it further still', both <= Math.min(skillDamp, gyro) + 0.01,
    `skill ${skillDamp.toFixed(1)} gyro ${gyro.toFixed(1)} both ${both.toFixed(1)}`);

  // --- hazardResist: does exposure build more slowly?
  //
  // Measured as time-to-threshold, not exposure-at-the-end: the channel caps at
  // 100 and then decays at a fixed rate, so a long enough run has every loadout
  // converging on the same number whatever the resistance was.
  const timeToRads = (loadout, target = 40) => {
    const level = { id: 'rad-rig', width: 2000, height: 1400, groundBase: 300, rough: 150,
      gravity: 25, fuel: 120, pads: [{ mult: 2, width: 200 }],
      hazards: [{ type: 'radiation', period: 15, duty: 0.45, rate: 30 }] };
    const ship = new Ship();
    ship.applyLoadout(loadout);
    ship.reset(500, 300, level.fuel);
    for (let i = 0; i < 12000; i++) {
      applyForces(ship, level, i / 120, 1 / 120);
      if (ship.statusLevels.radiation >= target) return i / 120;
    }
    return Infinity;
  };
  const rawRads = timeToRads(deriveFull({}, deriveSkills({}), {}));
  const sealed = timeToRads(deriveFull({}, deriveSkills({ 'env-seals': 2 }), {}));
  check('env-seals slows hazard build-up', Number.isFinite(rawRads) && sealed > rawRads * 1.1,
    `${rawRads.toFixed(1)}s -> ${sealed.toFixed(1)}s to 40% exposure`);

  // And a raised Ray Shield should slow it far harder than the skill does.
  const shielded = (() => {
    const lo = deriveFull({}, deriveSkills({}), {});
    const ship = new Ship();
    ship.applyLoadout(lo);
    ship.reset(500, 300, 120);
    ship.shieldActive = true;
    ship.shieldFactor = 0.15;
    const level = { id: 'rad-rig2', width: 2000, height: 1400, groundBase: 300, rough: 150,
      gravity: 25, fuel: 120, pads: [{ mult: 2, width: 200 }],
      hazards: [{ type: 'radiation', period: 15, duty: 0.45, rate: 30 }] };
    for (let i = 0; i < 12000; i++) {
      applyForces(ship, level, i / 120, 1 / 120);
      if (ship.statusLevels.radiation >= 40) return i / 120;
    }
    return Infinity;
  })();
  check('a raised Ray Shield holds off radiation harder than the skill',
    shielded > sealed, `skill ${sealed.toFixed(1)}s vs shield ${shielded === Infinity ? 'never' : shielded.toFixed(1) + 's'}`);

  // --- gripBonus: does the lander slide less on ice?
  const slide = (loadout) => {
    const level = EUROPA_LEVELS[0];
    const terrain = new Terrain(level, 4242);
    const ship = new Ship();
    ship.applyLoadout(loadout);
    const pad = terrain.pads[terrain.pads.length - 1];
    ship.reset((pad.x1 + pad.x2) / 2, pad.y - 20, level.fuel);
    ship.vx = 30; ship.vy = 6;
    const x0 = ship.x;
    const idle = { thrust: false, left: false, right: false, hold: false };
    for (let i = 0; i < 900; i++) ship.step(1 / 120, idle, level, terrain, i / 120);
    return Math.abs(ship.x - x0);
  };
  const bare = slide(deriveFull({}, deriveSkills({}), {}));
  const cleats = slide(deriveFull({}, deriveSkills({}), derivePassive('ice-cleats')));
  check('ice-cleats shortens the slide on Europa', cleats < bare * 0.95,
    `${bare.toFixed(0)} px -> ${cleats.toFixed(0)} px`);
}

{
  // --- salvageBonus and cargoRecovery reach the economy
  const paid = (bonus) => Math.round(missionReward({
    grade: 'PERFECT', padMultiplier: 3, fuelLeft: 50, maxFuel: 100,
    rareMaterial: 'Ore', firstClear: true, padTier: 1,
  }).salvage * bonus);
  const eff = deriveSkills({ 'salvage-drone': 2 });
  check('salvage-drone raises what a mission pays', paid(eff.salvageBonus) > paid(1),
    `${paid(1)} -> ${paid(eff.salvageBonus)}`);
  const haul = { ...freshHaul(), salvageSafe: 100, salvageCargo: 100, materials: { Ore: 40 } };
  const lostBare = settleHaul(haul, { completed: false, recovered: 0 });
  const lostBox = settleHaul(haul, { completed: false, recovered: deriveSkills({ 'black-box': 2 }).cargoRecovery });
  check('black-box recovers cargo from a failed expedition',
    lostBox.salvage > lostBare.salvage && (lostBox.materials.Ore || 0) > (lostBare.materials.Ore || 0),
    `${lostBare.salvage}/${lostBare.materials.Ore || 0} -> ${lostBox.salvage}/${lostBox.materials.Ore}`);
}

{
  // --- the actives, each fired and measured
  const field = (level, terrain) => new EnemyField(level, terrain, 4242);

  // pulse-laser: damages a real machine, and weaponPower makes it hurt more
  const laserBurn = (loadout) => {
    const level = { ...MOON_LEVELS[3], enemyBudget: 2, enemySets: ['sentry-turret'] };
    const terrain = new Terrain(level, 4242);
    const ship = new Ship();
    ship.applyLoadout(loadout);
    ship.reset(0, 0, level.fuel);
    const f = field(level, terrain);
    if (!f.enemies.length) return null;
    const e = f.enemies[0];
    ship.x = e.x + 80; ship.y = e.y - 60;
    const a = new Abilities('pulse-laser', loadout);
    a.trigger(ship);
    for (let i = 0; i < 60; i++) a.update(1 / 120, { ship, field: f });
    return e.maxHp - e.hp;
  };
  const dmg = laserBurn(deriveFull({}, deriveSkills({}), {}));
  const dmgUp = laserBurn(deriveFull({}, deriveSkills({ capacitor: 3 }), {}));
  check('pulse-laser damages a machine when fired', dmg > 0, `${dmg}`);
  check('capacitor makes the weapon hurt more', dmgUp > dmg, `${dmg} -> ${dmgUp}`);

  // ray-shield: raises a pool, absorbs, and shieldCapacity enlarges it
  const shieldPool = (loadout) => {
    const ship = new Ship();
    ship.applyLoadout(loadout);
    ship.reset(0, 0, 100);
    const a = new Abilities('ray-shield', loadout);
    a.trigger(ship);
    return { pool: ship.shieldHp, hazard: ship.shieldHazard };
  };
  const s1 = shieldPool(deriveFull({}, deriveSkills({}), {}));
  const s2 = shieldPool(deriveFull({}, deriveSkills({ capacitor: 3 }), {}));
  const s3 = shieldPool(deriveFull({}, deriveSkills({ capacitor: 1, 'shield-harmonics': 1 }), {}));
  check('ray-shield raises a shield pool', s1.pool > 0, `${s1.pool}`);
  check('capacitor enlarges the shield pool', s2.pool > s1.pool, `${s1.pool} -> ${s2.pool}`);
  check('shield-harmonics widens the shield to heat and cold', s3.hazard === true && s1.hazard === false);
  {
    // and the pool actually absorbs damage before the hull does
    const ship = new Ship();
    ship.applyLoadout(deriveFull({}, deriveSkills({}), {}));
    ship.reset(0, 0, 100);
    const a = new Abilities('ray-shield', deriveFull({}, deriveSkills({}), {}));
    a.trigger(ship);
    const hull0 = ship.hull;
    ship.damage(10);
    check('a raised shield takes the hit instead of the hull', ship.hull === hull0 && ship.shieldHp < s1.pool,
      `hull ${hull0} -> ${ship.hull}, pool ${s1.pool} -> ${ship.shieldHp}`);
  }

  // magnetic-anchor: grips on contact
  {
    const loadout = deriveFull({}, deriveSkills({}), {});
    const ship = new Ship();
    ship.applyLoadout(loadout);
    ship.reset(0, 0, 100);
    const a = new Abilities('magnetic-anchor', loadout);
    const before = ship.anchor;
    a.trigger(ship);
    a.update(1 / 120, { ship });
    check('magnetic-anchor raises the grip while it runs', ship.anchor > before, `${before} -> ${ship.anchor}`);
  }

  // thermal-purge: dumps status the moment it fires
  {
    const loadout = deriveFull({}, deriveSkills({}), {});
    const ship = new Ship();
    ship.applyLoadout(loadout);
    ship.reset(0, 0, 100);
    ship.statusLevels.heat = 80;
    const a = new Abilities('thermal-purge', loadout);
    a.trigger(ship);
    check('thermal-purge sheds accumulated heat', ship.statusLevels.heat < 80 * 0.5, `80 -> ${ship.statusLevels.heat}`);
    a.update(1 / 120, { ship });
    check('and blinds you while the vents are open', ship.env.visibility <= 0.35, `${ship.env.visibility}`);
  }

  // sensor-pulse: burns through dust
  {
    const loadout = deriveFull({}, deriveSkills({}), {});
    const ship = new Ship();
    ship.applyLoadout(loadout);
    ship.reset(0, 0, 100);
    ship.env.visibility = 0.2;
    const a = new Abilities('sensor-pulse', loadout);
    a.trigger(ship);
    a.update(1 / 120, { ship });
    check('sensor-pulse clears the weather while it runs', ship.env.visibility === 1, `${ship.env.visibility}`);
    check('and boosts the pad beacon', ship.beaconBoost > 1, `${ship.beaconBoost}`);
  }

  // charges, cooldown and the refusal to fire when spent
  {
    const loadout = deriveFull({}, deriveSkills({}), {});
    const ship = new Ship();
    ship.applyLoadout(loadout);
    ship.reset(0, 0, 100);
    const a = new Abilities('sensor-pulse', loadout);
    const start = a.charges;
    check('an active starts with its charges', start === ACTIVE_MODULES['sensor-pulse'].charges);
    a.trigger(ship);
    check('firing spends one', a.charges === start - 1);
    check('and it cannot be fired again while it is running', a.trigger(ship) === false);
    for (let i = 0; i < a.duration * 120 + 2; i++) a.update(1 / 120, { ship });
    check('it goes on cooldown when it ends', a.cooldown > 0 && a.blocker === 'CHARGING');
    for (let i = 0; i < a.cooldownLength * 120 + 2; i++) a.update(1 / 120, { ship });
    check('and comes back ready', a.ready === true);
    a.charges = 0;
    check('a spent module says so rather than sitting dead', a.blocker === 'SPENT' && a.trigger(ship) === false);
  }

  // energy-on-kill returns the charge
  {
    const loadout = deriveFull({}, deriveSkills({ capacitor: 3, 'threat-analysis': 1, 'energy-on-kill': 1 }), {});
    const level = { ...MOON_LEVELS[3], enemyBudget: 1, enemySets: ['sentry-turret'] };
    const terrain = new Terrain(level, 4242);
    const f = new EnemyField(level, terrain, 4242);
    const ship = new Ship();
    ship.applyLoadout(loadout);
    ship.reset(0, 0, level.fuel);
    if (f.enemies.length) {
      const e = f.enemies[0];
      ship.x = e.x + 80; ship.y = e.y - 60;
      const a = new Abilities('pulse-laser', loadout);
      a.trigger(ship);
      const after = a.charges;
      let returned = false;
      for (let i = 0; i < 1200 && !returned; i++) {
        for (const ev of a.update(1 / 120, { ship, field: f })) if (ev.kind === 'charge-returned') returned = true;
        if (!a.active && a.ready) { a.trigger(ship); }
      }
      check('energy-on-kill returns a charge when a threat dies', returned && a.charges >= after);
    }
  }
}

{
  // --- spinDampBonus: the gyro settles rotation in flight
  const spinDecay = (loadout, settings) => {
    const { ship, terrain, level } = rig(loadout);
    ship.y = terrain.heightAt(ship.x) - 520;
    ship.spin = 2.0;
    const idle = { thrust: false, left: false, right: false, hold: false };
    for (let i = 0; i < 240; i++) ship.step(1 / 120, idle, level, terrain, i / 120, settings);
    return Math.abs(ship.spin);
  };
  const spinBare = spinDecay(deriveFull({}, deriveSkills({}), {}));
  const spinGyro = spinDecay(deriveFull({}, deriveSkills({}), derivePassive('gyro-stabilizer')));
  // **In both steering modes.** M29c's first cut took `Math.min` of the ship's
  // spin damping and the new idle damping, and 0.90 beats the gyro's 0.985 - so
  // on the default mode the module was inert and this check failed with
  // `0.000 -> 0.000`. A passive that does nothing on the mode most players use
  // is the `hazardLead` fault, so the modes are named explicitly here rather
  // than left to whatever the default happens to be.
  for (const steering of ['classic', 'pro']) {
    const set = { steering, invertRotation: false };
    const bare = spinDecay(deriveFull({}, deriveSkills({}), {}), set);
    const gyro = spinDecay(deriveFull({}, deriveSkills({}), derivePassive('gyro-stabilizer')), set);
    check(`the gyro is worth fitting in ${steering} steering`, gyro < bare * 0.98,
      `${bare.toFixed(4)} -> ${gyro.toFixed(4)} rad/s after 2 s`);
  }
  check('the gyro passive settles rotation faster', spinGyro < spinBare * 0.98,
    `${spinBare.toFixed(3)} -> ${spinGyro.toFixed(3)} rad/s after 2 s`);

  // --- predict: the dotted path actually gets longer
  const pathLength = (loadout) => {
    let points = 0;
    const ctx = new Proxy({}, {
      get: (_, k) => {
        if (k === 'lineTo') return () => { points++; };
        if (k === 'setLineDash') return () => {};
        return () => {};
      },
      set: () => true,
    });
    const { ship, terrain, level } = rig(loadout);
    ship.y = terrain.heightAt(ship.x) - 700;
    ship.vx = 0; ship.vy = 0;
    drawTrajectory(ctx, ship, level, terrain, { scale: 1 });
    return points;
  };
  const shortPath = pathLength(deriveFull({ sensors: 1 }, deriveSkills({}), {}));
  const longPath = pathLength(deriveFull({ sensors: 4 }, deriveSkills({}), {}));
  check('the sensors track draws a longer predicted path', longPath > shortPath,
    `${shortPath} -> ${longPath} points`);

  // --- slopeGrip: better hold where the ground is not level
  const slideOnSlope = (loadout) => {
    const level = MOON_LEVELS[2];
    const terrain = new Terrain(level, 4242);
    // Find the steepest ground the lander could still sit on.
    let bestX = 0, bestSlope = 0;
    for (let x = 200; x < level.width - 200; x += 20) {
      const sl = Math.abs(terrain.slopeAt(x));
      if (sl > bestSlope && sl < 0.30) { bestSlope = sl; bestX = x; }
    }
    const ship = new Ship();
    ship.applyLoadout(loadout);
    ship.reset(bestX, terrain.heightAt(bestX) - 18, level.fuel);
    ship.vx = 26; ship.vy = 4;
    const x0 = ship.x;
    const idle = { thrust: false, left: false, right: false, hold: false };
    for (let i = 0; i < 600; i++) ship.step(1 / 120, idle, level, terrain, i / 120);
    return Math.abs(ship.x - x0);
  };
  const slideBare = slideOnSlope(deriveFull({ gear: 1 }, deriveSkills({}), {}));
  const slideGrip = slideOnSlope(deriveFull({ gear: 4 }, deriveSkills({}), {}));
  check('the gear track holds better on a slope', slideGrip < slideBare,
    `${slideBare.toFixed(1)} px -> ${slideGrip.toFixed(1)} px`);

  // --- revealVisibility now drives the pulse rather than a literal
  const lo = deriveFull({}, deriveSkills({}), {});
  const ship = new Ship();
  ship.applyLoadout(lo);
  ship.reset(0, 0, 100);
  ship.env.visibility = 0.15;
  const a = new Abilities('sensor-pulse', lo);
  a.trigger(ship);
  a.update(1 / 120, { ship });
  check('sensor-pulse reveals to its own declared level',
    ship.env.visibility === ACTIVE_MODULES['sensor-pulse'].effect.revealVisibility,
    `${ship.env.visibility}`);
}

// --- the instruments describe *this* lander, not a stock one
//
// `ENVELOPE` was a module-level constant baked at `gearTier: 1`, and the F4
// bars, the tilt cone, the sink-rate warning, the briefing copy and the crash
// text all read it. The grader does not: it evaluates against
// `capsFor(axis, { ...LANDING, gearTier })`, and gear runs to 1.40 with another
// 0.32 from the skill tree. **A player in full landing gear was graded GOOD at
// 37.8 px/s while every readout drew 22.0** - a 72% understatement of the
// equipment they had bought, which is the Gyro Stabilizer fault wearing a
// different hat: a thing sold and not delivered.
{
  const stock = new Ship();
  check('a lander with no loadout carries the stock envelope',
    stock.envelope.GOOD.vy === ENVELOPE.GOOD.vy && stock.gearTier === 1,
    `${stock.envelope.GOOD.vy} vs ${ENVELOPE.GOOD.vy}`);

  // Every gear level the hangar sells must visibly widen it.
  const gearLevels = COMPONENTS['gear'].levels.map((_, i) => i + 1);
  let last = 0;
  for (const lvl of gearLevels) {
    const loadout = deriveLoadout({ gear: lvl });
    const s2 = new Ship();
    s2.applyLoadout(loadout);
    check(`gear L${lvl}: the envelope the instruments show matches the grader`,
      s2.envelope.GOOD.vy === capsFor('vy', { ...LANDING, gearTier: s2.gearTier }).safe,
      `${s2.envelope.GOOD.vy} vs ${capsFor('vy', { ...LANDING, gearTier: s2.gearTier }).safe}`);
    check(`gear L${lvl}: it is no narrower than the level below`,
      s2.envelope.GOOD.vy >= last, `${s2.envelope.GOOD.vy} after ${last}`);
    last = s2.envelope.GOOD.vy;
  }
  check('the top gear level widens the envelope at all', last > ENVELOPE.GOOD.vy,
    `${last} vs stock ${ENVELOPE.GOOD.vy}`);

  // And the property that actually matters: whatever the instruments draw, a
  // touchdown at exactly that figure must be graded the way they promise.
  {
    const s3 = new Ship();
    s3.applyLoadout(deriveLoadout({ gear: 4 }));
    const cfg = { ...LANDING, gearTier: s3.gearTier };
    const atLimit = evaluateLanding({
      vy: s3.envelope.GOOD.vy - 0.01, vx: 0, tilt: 0, centerFrac: 0,
      onPad: true, hullContact: false, stable: true,
    }, cfg);
    check('a touchdown just inside the drawn GOOD line is not a crash',
      atLimit.grade !== 'CRASH', `${atLimit.grade} at vy ${s3.envelope.GOOD.vy - 0.01}`);
    const past = evaluateLanding({
      vy: s3.envelope.HARD.vy + 1, vx: 0, tilt: 0, centerFrac: 0,
      onPad: true, hullContact: false, stable: true,
    }, cfg);
    check('a touchdown past the drawn HARD line is a crash',
      past.grade === 'CRASH', `${past.grade} at vy ${s3.envelope.HARD.vy + 1}`);
  }

  // No instrument may still be reading the module-level constant. Stated as
  // "every mention of ENVELOPE also mentions ship.envelope" rather than
  // "ENVELOPE." - the first version required a dot after it, so `const env =
  // ENVELOPE;` reintroduced the whole bug and passed. A source check is only as
  // good as the mutation you tried against it.
  for (const f of ['debug.js', 'hud.js', 'screens.js']) {
    const src = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    const bare = src.split('\n').filter((l) => /\bENVELOPE\b/.test(l)
      && !/^\s*(\/\/|\*)/.test(l)
      && !/^import\b/.test(l.trim())
      && !/ship\.envelope/.test(l));
    check(`${f} reads the lander's envelope, not the stock constant`, bare.length === 0,
      bare.map((l) => l.trim()).join(' | ').slice(0, 140));
  }
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
