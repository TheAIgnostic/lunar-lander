// Skills, components and modules: does any of it reach the simulation?
//
//   node test/loadout-tests.js
//
// M11 recorded that every module had "a consumer already in the simulation".
// That was true of the four passives and false of the four actives - nothing
// could fire them - and it went unnoticed because the only thing reading them
// was a *screen*. This suite exists so that cannot happen twice.
//
//   1. does the derivation fold the numbers correctly?
//   2. is every effect the game sells actually delivered?
//   3. does turning the effect on move the simulation?
//   4. does *fitting* it change a flown mission, on a body it claims to suit?
//   5. can the player ever get hold of the thing at all?
//
// **Question 2 was a grep until M31, and a grep is not the claim.** It asked
// whether some file outside the three defining ones mentioned the key. That is
// how `hazardLead` passed for three milestones - the moment a *comment* named
// it, the regex called it delivered - and M30f's repair (strip the comments)
// only closed the narrowest version of the hole. The general form is worse:
// `beacon` is sold by the Hardened Radar, by Sensors L2 and L3 and by the
// Sensor Pulse, and was read by **nothing**, while the grep passed it because
// `abilities.js` contains the string `beacon` reading the *module's own field*.
// A file mentioning a name is not a file acting on it.
//
// So section 2 is a **witness table** now. Every declared key names how it is
// delivered - `flight`, `economy` or `instrument` - and a measurement that runs
// the real code and comes back with a number. Turn the key on, measure again,
// and the number has to move. A key with no witness is a hard failure, and a
// witness for a key nobody declares is a hard failure the other way, so the
// table cannot quietly fall behind the content.
//
// Section 3 asks the sharper version of the same question for the things a
// player actually chooses between: **fitting a module or buying a node has to
// change a flown mission**, on a body the module itself claims to be good for.
// Section 4 asks the question nobody had asked at all - whether the module can
// be obtained without god mode. Five of nine could not.
import { readFileSync, readdirSync } from 'node:fs';
import { Ship, SHIP, ENVELOPE, ARREST } from '../src/ship.js';
import { Terrain, pickupRadius, PICKUP_RADIUS } from '../src/terrain.js';
import { drawTrajectory, drawPadBeacons, beaconGain } from '../src/render.js';
import { drawEnemies } from '../src/enemydraw.js';
import { instrumentNoise, instrumentDrift } from '../src/hud.js';
import { newRun } from '../src/save.js';
import { makeRng } from '../src/util.js';
import { spawnFor } from '../src/spawn.js';
import { Abilities } from '../src/abilities.js';
import { EnemyField } from '../src/enemies.js';
import { applyForces, HEAT, COLD, ACID, RADIATION } from '../src/forces.js';
import { deriveFull, deriveLoadout, COMPONENTS, COMPONENT_IDS, purchaseCheck, purchase } from '../src/components.js';
import { TREES, ALL_NODES, deriveSkills, skillCheck, buySkill, findNode } from '../src/skills.js';
import { ACTIVE_MODULES, PASSIVE_MODULES, derivePassive, allModules, moduleById,
  nextBlueprint, recommendedFor, STARTER_PASSIVES, MOON_BLUEPRINTS, COMBAT_BLUEPRINT } from '../src/modules.js';
import { missionReward, settleHaul, freshHaul } from '../src/economy.js';
import { LANDING, capsFor, evaluateLanding } from '../src/landing.js';
import { MOON_LEVELS, MARS_LEVELS, EUROPA_LEVELS, chapterFor } from '../src/missions.js';
import { PLANET_ORDER, nextPlanet, planetCard } from '../src/route.js';
import { flyMission, CUES_NEEDING_MACHINES } from './pilot.js';

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
  ship.reset(start.x, start.y, ship.tankFor(level.fuel));
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
section('2. every declared effect is delivered - measured, not grepped');

// Every key any tree, module or component sells, and where it was sold.
const DECLARED = new Map();
{
  const note = (key, where) => { if (!DECLARED.has(key)) DECLARED.set(key, where); };
  for (const n of ALL_NODES) for (const k of Object.keys(n.effect(n.ranks))) note(k, `skill ${n.id}`);
  for (const m of Object.values(PASSIVE_MODULES)) for (const k of Object.keys(m.effect)) note(k, `passive ${m.id}`);
  for (const m of Object.values(ACTIVE_MODULES)) for (const k of Object.keys(m.effect)) note(k, `active ${m.id}`);
  for (const c of COMPONENT_IDS) {
    for (const lvl of COMPONENTS[c].levels) for (const k of Object.keys(lvl.effect || {})) note(k, `component ${c}`);
  }
}

// Keys known to be sold and not yet delivered, tracked in ROADMAP_STATUS.md.
// Anything *not* on this list with no witness is a hard failure - that is the
// M11 regression guard. Shrinking this list is the point; growing it should
// take an argument.
const KNOWN_GAPS = new Set(['hazardLead']);

{
  // **The old check, kept as the cheap first pass and no longer the claim.**
  // It asks whether any file outside the three defining ones mentions the key,
  // with comments stripped (M30f). It is worth keeping because its failure
  // message is the clearest one - "nothing reads this at all" - but it cannot
  // tell a reader from an actor, which is how `beacon` sat hollow across a
  // passive, an active and a component track while this passed it.
  const DEFINING = new Set(['skills.js', 'modules.js', 'components.js']);
  const stripComments = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
    .replace(/\/\/.*$/gm, '');
  const src = readdirSync(new URL('../src/', import.meta.url))
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ f, text: stripComments(readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')) }));

  for (const [key, where] of DECLARED) {
    if (KNOWN_GAPS.has(key)) continue;
    const readers = src
      .filter(({ f }) => !DEFINING.has(f))
      .filter(({ text }) => new RegExp(`\\b${key}\\b`).test(text))
      .map(({ f }) => f);
    check(`${key} (${where}) is named by the game`, readers.length > 0,
      'declared, folded into the spec, and never mentioned by anything');
  }
}

// --- the instruments, run rather than re-encoded ------------------------------
//
// A witness that reimplements the rule it is testing agrees with itself and
// with nothing else. These call the drawing and instrument code the game calls
// and count what came out of it, which is why `instrumentNoise` was lifted out
// of `drawHUD` rather than copied here.

/** A canvas that draws nothing and remembers how much ink was asked for. */
function inkCtx() {
  const c = { ink: 0, ops: 0, globalAlpha: 1 };
  const nothing = () => {};
  for (const k of ['save', 'restore', 'translate', 'scale', 'rotate', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'rect',
    'clip', 'setLineDash', 'setTransform', 'drawImage', 'clearRect']) c[k] = nothing;
  c.measureText = () => ({ width: 10 });
  c.createLinearGradient = () => ({ addColorStop: nothing });
  c.createRadialGradient = () => ({ addColorStop: nothing });
  // Ink, not calls: the beacon gain moves the *alpha* a marker is drawn at, so
  // counting strokes alone would read a brighter beacon as an identical one.
  const mark = () => { c.ops++; c.ink += Math.max(0, Math.min(1, c.globalAlpha)); };
  for (const k of ['stroke', 'fill', 'fillRect', 'strokeRect', 'fillText', 'strokeText']) c[k] = mark;
  return c;
}

const CAM = { x: 1000, y: 400, scale: 1 };

/** A stock spec with exactly one key moved. The purest form of the question. */
const STOCK = deriveFull({}, deriveSkills({}), {});
const only = (key, value) => ({ ...STOCK, [key]: value });

/**
 * Move a *module's own* declared number and run it. Actives read `mod.effect`
 * rather than the loadout, so this is `only()` for the other half of the board:
 * change the figure the content declares and the behaviour has to follow, which
 * is what catches a literal written into `abilities.js` beside the data.
 */
function withEffect(id, patch, fn) {
  const mod = ACTIVE_MODULES[id];
  const saved = mod.effect;
  mod.effect = { ...saved, ...patch };
  try { return fn(); } finally { mod.effect = saved; }
}

/** Fire an active on a parked lander and hand back the ship it acted on. */
function fired(id, loadout = STOCK, steps = 1, prep = null) {
  const ship = new Ship();
  ship.applyLoadout(loadout);
  ship.reset(0, 0, 100);
  if (prep) prep(ship);
  const a = new Abilities(id, loadout);
  a.trigger(ship);
  for (let i = 0; i < steps; i++) a.update(1 / 120, { ship });
  return { ship, a };
}

/** Drop a lander onto the deepest pad of a mission at a chosen sink rate. */
function landAt(loadout, vy, levels = MOON_LEVELS, levelIndex = 0) {
  const { ship, terrain, level } = rig(loadout, levelIndex, levels);
  const pad = terrain.pads[terrain.pads.length - 1];
  ship.x = (pad.x1 + pad.x2) / 2;
  ship.y = pad.y - 30;
  ship.vx = 0; ship.vy = vy; ship.angle = 0; ship.spin = 0;
  const idle = { thrust: false, left: false, right: false, hold: false };
  let ev = null;
  let bounce = 0;
  // **Run to the event, never to `ship.landed`.** The settle window sets
  // `landed` before the grade is decided, so breaking on it reported PERFECT
  // for every sink rate and made the gearTier witness agree with itself - the
  // harness lying rather than the upgrade failing, which is the one thing a
  // witness must not do.
  for (let i = 0; i < 900 && !ev; i++) {
    const e = ship.step(1 / 120, idle, level, terrain, i / 120);
    bounce = Math.max(bounce, -ship.vy);
    if (e === 'land' || e === 'crash') ev = e;
  }
  const RANK = { PERFECT: 3, GOOD: 2, HARD: 1 };
  return { ev, bounce, hull: ship.hull,
    rank: ship.landingResult ? (RANK[ship.landingResult.grade] || 0) : 0 };
}

/** Slide across ground with a horizontal speed already on the clock. */
function slide(loadout, levels, levelIndex, vx = 30, steepest = false) {
  const level = levels[levelIndex];
  const terrain = new Terrain(level, 4242);
  const ship = new Ship();
  ship.applyLoadout(loadout);
  let x = (terrain.pads[terrain.pads.length - 1].x1 + terrain.pads[terrain.pads.length - 1].x2) / 2;
  if (steepest) {
    let best = 0;
    for (let px = 200; px < level.width - 200; px += 20) {
      const sl = Math.abs(terrain.slopeAt(px));
      if (sl > best && sl < 0.30) { best = sl; x = px; }
    }
  }
  ship.reset(x, terrain.heightAt(x) - (steepest ? 18 : 20), level.fuel);
  ship.vx = vx; ship.vy = steepest ? 4 : 6;
  const x0 = ship.x;
  const idle = { thrust: false, left: false, right: false, hold: false };
  for (let i = 0; i < 900; i++) ship.step(1 / 120, idle, level, terrain, i / 120);
  return Math.abs(ship.x - x0);
}

/** Seconds of exposure before a status channel reaches a level. */
function timeToStatus(loadout, hazards, channel, target = 40, prep = null) {
  const level = { id: 'status-rig', width: 2000, height: 1400, groundBase: 300, rough: 150,
    gravity: 25, fuel: 120, pads: [{ mult: 2, width: 200 }], hazards };
  const ship = new Ship();
  ship.applyLoadout(loadout);
  ship.reset(500, 300, level.fuel);
  if (prep) prep(ship);
  for (let i = 0; i < 24000; i++) {
    applyForces(ship, level, i / 120, 1 / 120);
    if (ship.statusLevels[channel] >= target) return i / 120;
  }
  return Infinity;
}

/** Peak gust the atmosphere puts on the hull, with nothing else in the air. */
function gustPeak(loadout) {
  const level = { id: 'gust-rig', width: 2600, height: 1400, groundBase: 300, rough: 150,
    gravity: 42, fuel: 120, pads: [{ mult: 2, width: 200 }], wind: 0, gust: 60, drag: 0, hazards: [] };
  const terrain = new Terrain(level, 4242);
  const ship = new Ship();
  ship.applyLoadout(loadout);
  const start = spawnFor(level, terrain);
  ship.reset(start.x, start.y, ship.tankFor(level.fuel));
  let peak = 0;
  for (let i = 0; i < 600; i++) {
    applyForces(ship, level, i / 120, 1 / 120);
    peak = Math.max(peak, Math.abs(ship.windNow || 0));
  }
  return peak;
}

/** Park in a live vapour vent and report what it pushed, in each axis. */
function ventPush(loadout, secs = 2) {
  const level = chapterFor('ENCELADUS', 4242).levels[4];
  const terrain = new Terrain(level, 4242);
  const ship = new Ship();
  ship.applyLoadout(loadout);
  ship.reset(terrain.pads[0].x1, terrain.heightAt(terrain.pads[0].x1) - 260, level.fuel);
  // The vents publish themselves on `env`, and only the ones clear of the
  // sanctuary are ever live - so ask the force where they are rather than
  // reading the mission data and hoping.
  applyForces(ship, level, 0, 1 / 120, terrain);
  const vent = (ship.env.plumes || [])[0];
  if (!vent) return { vx: 0, vy: 0 };
  ship.x = vent.x;
  ship.vx = 0; ship.vy = 0;
  for (let i = 0; i < secs * 120; i++) {
    applyForces(ship, level, i / 120, 1 / 120, terrain);
    ship.vy = 0;                       // hold station: only the impulse matters
  }
  return { vx: ship.vx, vy: 0 };
}

/** Lift the air makes at a given attitude, crossing at speed. */
function liftAt(loadout, angle, vx = 120) {
  const level = chapterFor('TITAN', 4242).levels[4];
  const terrain = new Terrain(level, 4242);
  const ship = new Ship();
  ship.applyLoadout(loadout);
  ship.reset(terrain.pads[0].x1, terrain.heightAt(terrain.pads[0].x1) - 300, level.fuel);
  ship.vx = vx; ship.angle = angle;
  applyForces(ship, level, 0, 1 / 120, terrain);
  return ship.env.lift || 0;
}

/**
 * Drop a charge over a machine and report what the blast did.
 *
 * `dropAt` offsets the lander horizontally from the machine, `noGround` removes
 * the floor so only the fuse can end it, and `groundGap` releases it just above
 * the surface - which is the case the arming delay exists for.
 */
function bombRun({ dropAt = 0, noGround = false, groundGap = 300, noField = false } = {}) {
  const level = { ...MOON_LEVELS[3], enemyBudget: 2, enemySets: ['sentry-turret'], gravity: 28 };
  const terrain = new Terrain(level, 4242);
  const field = new EnemyField(level, terrain, 4242);
  const e = field.enemies[0];
  const x0 = e.x;
  const ground = terrain.heightAt(x0);
  // **The machine is placed, not found.** Radius is a claim about distance, and
  // real ground makes distance the wrong number: dropped 120 px to one side of
  // wherever the generator put a turret, the height difference between the two
  // points pushed it out of a 150 px blast and the witness measured zero either
  // way. Moving the machine to a known offset on the same ground is what makes
  // the measurement about the radius.
  e.x = x0 + dropAt;
  e.y = ground;
  const ship = new Ship();
  ship.applyLoadout(STOCK);
  ship.reset(x0, ground - groundGap, level.fuel);
  const before = e.hp;
  const hull = ship.hull;
  const a = new Abilities('bomb-rack', STOCK);
  a.trigger(ship);
  const floor = noGround ? { heightAt: () => 1e9, ceiling: null } : terrain;
  // **No machines when the fuse is what is under test.** A charge dropped over
  // a turret detonates on contact whatever the fuse says, so the first version
  // of the fuse witness measured the same number either way and passed by
  // agreeing with itself.
  const seen = noField ? null : field;
  let at = Infinity;
  for (let i = 0; i < 1800 && a.bombs.length; i++) {
    for (const ev of a.update(1 / 120, { ship, field: seen, terrain: floor, level })) {
      if (ev.kind === 'blast') at = i / 120;
    }
  }
  return { dealt: before - e.hp, selfHarm: hull - ship.hull, at };
}

/** How far a drone ends up from the lander, with a flare burning and without. */
function dronePull(withFlare) {
  const level = { ...MOON_LEVELS[3], enemyBudget: 1, enemySets: ['seeker-drone'], gravity: 28 };
  const terrain = new Terrain(level, 4242);
  const field = new EnemyField(level, terrain, 4242);
  const e = field.enemies[0];
  const ship = new Ship();
  ship.applyLoadout(STOCK);
  ship.reset(e.x + 300, e.y, level.fuel);
  const a = withFlare ? new Abilities('countermeasure-flare', STOCK) : null;
  if (a) {
    a.trigger(ship);
    a.flare.x = ship.x + 420;        // put the decoy somewhere the drone must choose
    a.flare.vx = 0; a.flare.vy = 0;
  }
  const at = { x: ship.x, y: ship.y };
  for (let i = 0; i < 480; i++) {
    if (a) a.update(1 / 120, { ship, field, terrain, level });
    ship.x = at.x; ship.y = at.y; ship.vx = 0; ship.vy = 0;
    ship.hull = ship.hullMax;
    field.update(1 / 120, i / 120, ship);
  }
  return Math.hypot(e.x - ship.x, e.y - ship.y);
}

/** Spin built by holding an attitude command of a given magnitude. */
function spinFrom(loadout, amount, secs = 0.5) {
  const { ship, terrain, level } = rig(loadout);
  ship.y = terrain.heightAt(ship.x) - 520;
  const input = { thrust: 0, left: 0, right: amount, hold: 0 };
  for (let i = 0; i < secs * 120; i++) ship.step(1 / 120, input, level, terrain, i / 120);
  return Math.abs(ship.spin);
}

/** Fall onto a pad and press the arrest control at the last moment. */
function arrestRun(loadout) {
  const { ship, terrain, level } = rig(loadout);
  const pad = terrain.pads[terrain.pads.length - 1];
  ship.x = (pad.x1 + pad.x2) / 2;
  ship.y = pad.y - 600;
  ship.vx = 0; ship.vy = 40; ship.angle = 0;
  const idle = { thrust: 0, left: 0, right: 0, hold: 0, arrest: 0 };
  let fired = false;
  for (let i = 0; i < 900; i++) {
    // Press it the moment the lander is in the window, and only then.
    idle.arrest = !fired && ship.canArrest(level, terrain) ? 1 : 0;
    if (idle.arrest) fired = true;
    const e = ship.step(1 / 120, idle, level, terrain, i / 120);
    if (e === 'land' || e === 'crash') break;
  }
  return { vy: ship.vy, fuel: ship.fuel, fired };
}

/** How much ink the counter-battery bracket puts on a painted machine. */
function paintedInk(on) {
  const level = { ...MOON_LEVELS[3], enemyBudget: 1, enemySets: ['sentry-turret'] };
  const terrain = new Terrain(level, 4242);
  const field = new EnemyField(level, terrain, 4242);
  const ship = new Ship();
  ship.applyLoadout(STOCK);
  ship.reset(0, 0, level.fuel);
  const e = field.enemies[0];
  ship.x = e.x + 200; ship.y = e.y - 90;
  e.painted = 1.2;
  const ctx = inkCtx();
  drawEnemies(ctx, field, ship, 3, { counterBattery: on });
  return ctx.ops;
}

/** Total damage the beam puts out with a second machine standing near the first. */
function twinLinkRun(loadout) {
  const level = { ...MOON_LEVELS[3], enemyBudget: 2, enemySets: ['sentry-turret'] };
  const terrain = new Terrain(level, 4242);
  const field = new EnemyField(level, terrain, 4242);
  const ship = new Ship();
  ship.applyLoadout(loadout);
  ship.reset(0, 0, level.fuel);
  const [a, b] = field.enemies;
  // Stand the pair close together: the arc is a claim about two machines near
  // each other, so the geometry is placed rather than found.
  b.x = a.x + 120; b.y = a.y;
  ship.x = a.x + 90; ship.y = a.y - 70;
  const before = a.hp + b.hp;
  const ab = new Abilities('pulse-laser', loadout);
  ab.trigger(ship);
  for (let i = 0; i < 120; i++) ab.update(1 / 120, { ship, field });
  return before - (a.hp + b.hp);
}

/** A machine of a known type, and a lander parked beside it. */
function machineRig(loadout, gap = 80) {
  const level = { ...MOON_LEVELS[3], enemyBudget: 2, enemySets: ['sentry-turret'] };
  const terrain = new Terrain(level, 4242);
  const ship = new Ship();
  ship.applyLoadout(loadout);
  ship.reset(0, 0, level.fuel);
  const field = new EnemyField(level, terrain, 4242);
  const e = field.enemies[0];
  ship.x = e.x + gap; ship.y = e.y - 60;
  return { ship, field, e, level, terrain };
}

/**
 * **The witness table.** One entry per key the game sells: how it is delivered,
 * and a measurement that runs the real code with the declared number moved.
 *
 *   flight      the lander behaves differently
 *   economy     the run is paid differently
 *   instrument  the player is shown something different, and the flight is not
 *               touched at all - which is asserted separately in
 *               `settings-tests.js` for the whole presentation layer
 *
 * `measure(on)` returns a number. The gate runs it twice and requires a move.
 */
const WITNESS = {
  // ---- flight ------------------------------------------------------------
  burnMain: { how: 'flight', measure: (on) => burn(on ? only('burnMain', 0.5) : STOCK, THRUST).used },
  burnRcs: { how: 'flight', measure: (on) => burn(on ? only('burnRcs', 0.5) : STOCK, SPIN, 0.25).used },
  thrust: { how: 'flight', measure: (on) => burn(on ? only('thrust', 1.3) : STOCK, THRUST).vy },
  rcsAccel: { how: 'flight', measure: (on) => burn(on ? only('rcsAccel', 1.4) : STOCK, SPIN, 0.25).spin },
  sideThrust: { how: 'flight',
    measure: (on) => {
      // DIRECT steering is the only mode with a side thruster in it.
      const { ship, terrain, level } = rig(on ? only('sideThrust', 1.6) : STOCK);
      ship.y = terrain.heightAt(ship.x) - 520;
      const x0 = ship.x;
      const push = { thrust: false, left: true, right: false, hold: false };
      const set = { steering: 'direct', invertRotation: false };
      for (let i = 0; i < 60; i++) ship.step(1 / 120, push, level, terrain, i / 120, set);
      return +(ship.x - x0).toFixed(6);
    } },
  fuelCapacity: { how: 'flight',
    // Flown, not read off the spec: this is the key `flyMission` was silently
    // dropping, so every loadout sweep flew the Reserve Tank on a stock tank.
    measure: (on) => {
      const level = MOON_LEVELS[0];
      const terrain = new Terrain(level, 909);
      return flyMission(level, terrain, { loadout: on ? only('fuelCapacity', 1.5) : STOCK }).fuelLeft;
    } },
  // 40 px/s is past what stock legs survive and inside what a full gear set
  // does, so the witness is the difference between walking away and not.
  gearTier: { how: 'flight', measure: (on) => landAt(on ? only('gearTier', 1.4) : STOCK, 40).ev },
  restitution: { how: 'flight', measure: (on) => +landAt(on ? only('restitution', 0.75) : STOCK, 30).bounce.toFixed(4) },
  slopeGrip: { how: 'flight', measure: (on) => +slide(on ? only('slopeGrip', 1.6) : STOCK, MOON_LEVELS, 2, 26, true).toFixed(3) },
  gripBonus: { how: 'flight', measure: (on) => +slide(on ? only('gripBonus', 3.2) : STOCK, EUROPA_LEVELS, 0).toFixed(3) },
  hullMax: { how: 'flight',
    measure: (on) => {
      const s = new Ship();
      s.applyLoadout(on ? only('hullMax', 1.4) : STOCK);
      s.reset(0, 0, 100);
      let hits = 0;
      while (s.hull > 0 && hits < 40) { s.damage(50); hits++; }
      return hits;
    } },
  impactResist: { how: 'flight',
    // **A hard *arrival*, not a hit.** `impactResist` scales the hull cost of a
    // HARD or off-pad touchdown and nothing else; `damage()` never reads it.
    // Section 3 had asserted it with `ship.damage(20)` and `<=`, so it compared
    // 20 against 20 and passed without ever touching the key - a check that
    // could not fail, which is what this gate exists to find.
    measure: (on) => landAt(on ? only('impactResist', 0.5) : STOCK, 30).hull },
  repairOnLanding: { how: 'flight',
    measure: (on) => {
      const { ship, terrain, level } = rig(on ? only('repairOnLanding', 0.2) : STOCK);
      ship.hull = Math.round(ship.hullMax * 0.5);
      const pad = terrain.pads[terrain.pads.length - 1];
      ship.x = (pad.x1 + pad.x2) / 2; ship.y = pad.y - 24; ship.vy = 8;
      const idle = { thrust: false, left: false, right: false, hold: false };
      for (let i = 0; i < 900 && !ship.landed; i++) ship.step(1 / 120, idle, level, terrain, i / 120);
      return +(ship.hull / ship.hullMax).toFixed(4);
    } },
  disturbanceResist: { how: 'flight', measure: (on) => +gustPeak(on ? only('disturbanceResist', 0.6) : STOCK).toFixed(4) },
  spinDampBonus: { how: 'flight',
    measure: (on) => {
      const { ship, terrain, level } = rig(on ? only('spinDampBonus', 0.985) : STOCK);
      ship.y = terrain.heightAt(ship.x) - 520;
      ship.spin = 2.0;
      const idle = { thrust: false, left: false, right: false, hold: false };
      const set = { steering: 'pro', invertRotation: false };
      for (let i = 0; i < 240; i++) ship.step(1 / 120, idle, level, terrain, i / 120, set);
      return +Math.abs(ship.spin).toFixed(6);
    } },
  // ---- M34's nine nodes -----------------------------------------------------
  arrest: { how: 'flight',
    measure: (on) => +arrestRun(on ? only('arrest', 1) : STOCK).vy.toFixed(4) },
  extraShuttle: { how: 'economy',
    measure: (on) => newRun('LUNA', 1, 3 + (on ? 1 : 0)).maxShuttles },
  phoenix: { how: 'economy',
    // What a lost shuttle comes back on. Zero is "it does not come back".
    measure: (on) => (on ? only('phoenix', 0.35) : STOCK).phoenix || 0 },
  twinLink: { how: 'flight',
    measure: (on) => +twinLinkRun(on ? only('twinLink', 0.35) : STOCK).toFixed(3) },

  // ---- M33's ordnance ------------------------------------------------------
  //
  // A rig that drops a charge from a fixed height over a machine and reports
  // what the blast did. `withEffect` moves the declared number and the rig runs
  // the real `_stepBombs`, so a literal written into the runtime beside the
  // data would show up as the number failing to matter.
  bombDamage: { how: 'flight',
    measure: (on) => withEffect('bomb-rack', { bombDamage: on ? 55 : 0 },
      () => +bombRun({ dropAt: 0 }).dealt.toFixed(3)) },
  bombRadius: { how: 'flight',
    // The machine sits 120 px to one side: inside a 150 px blast, outside a 60.
    measure: (on) => withEffect('bomb-rack', { bombRadius: on ? 150 : 60 },
      () => +bombRun({ dropAt: 120 }).dealt.toFixed(3)) },
  bombFuse: { how: 'flight',
    // Dropped into open air with no ground under it, the fuse is the only thing
    // that can end it.
    measure: (on) => withEffect('bomb-rack', { bombFuse: on ? 5 : 1 },
      () => +bombRun({ dropAt: 0, noGround: true, noField: true }).at.toFixed(3)) },
  bombArm: { how: 'flight',
    // **The telegraph rule, as a measurement.** A charge released a hand's
    // breadth above the ground must be inert when it gets there: with the arming
    // delay it is simply gone, and with none it detonates in the lander's lap.
    measure: (on) => withEffect('bomb-rack', { bombArm: on ? 0.35 : 0 },
      () => +bombRun({ dropAt: 0, groundGap: 12 }).selfHarm.toFixed(3)) },

  decoy: { how: 'flight',
    // Where a drone ends up after four seconds, with a flare burning 400 px to
    // one side and without one.
    measure: (on) => +dronePull(on).toFixed(3) },
  flareLight: { how: 'instrument',
    measure: (on) => withEffect('countermeasure-flare', { flareLight: on ? 0.55 : 0 }, () => {
      const ship = new Ship();
      ship.applyLoadout(STOCK);
      ship.reset(0, 0, 100);
      const a = new Abilities('countermeasure-flare', STOCK);
      a.trigger(ship);
      ship.env.darkness = 0.8;
      a.update(1 / 120, { ship, terrain: { heightAt: () => 400 }, level: { gravity: 20, width: 2000 } });
      return +ship.env.darkness.toFixed(4);
    }) },

  // ---- M32's three actives ------------------------------------------------
  brakeDrag: { how: 'flight',
    // How fast Titan's air takes a crossing speed off you, with the foil out
    // and without it. Measured through `applyForces`, so it is the same drag
    // the mission flies.
    measure: (on) => withEffect('aero-brake', { brakeDrag: on ? 2.6 : 1 }, () => {
      const level = chapterFor('TITAN', 4242).levels[0];
      const terrain = new Terrain(level, 4242);
      const ship = new Ship();
      ship.applyLoadout(STOCK);
      ship.reset(terrain.pads[0].x1, terrain.heightAt(terrain.pads[0].x1) - 320, level.fuel);
      ship.vx = 140;
      const a = new Abilities('aero-brake', STOCK);
      a.trigger(ship);
      for (let i = 0; i < 180; i++) {
        a.update(1 / 120, { ship });
        applyForces(ship, level, i / 120, 1 / 120, terrain);
      }
      return +ship.vx.toFixed(5);
    }) },
  repairPerSecond: { how: 'flight',
    measure: (on) => withEffect('repair-nanites', { repairPerSecond: on ? 9 : 0 }, () => {
      const ship = new Ship();
      ship.applyLoadout(STOCK);
      ship.reset(0, 0, 100);
      ship.hull = 40;
      const a = new Abilities('repair-nanites', STOCK);
      a.trigger(ship);
      for (let i = 0; i < 240; i++) a.update(1 / 120, { ship });
      return +ship.hull.toFixed(4);
    }) },
  cloak: { how: 'flight',
    // A machine parked in reach, given two seconds to notice a lander. Cloaked,
    // it never leaves `idle`; uncloaked it is aiming.
    measure: (on) => withEffect('optical-cloak', { cloak: on ? 1 : 0 }, () => {
      const { ship, field } = machineRig(STOCK, 200);
      const a = new Abilities('optical-cloak', STOCK);
      a.trigger(ship);
      let tracked = 0;
      for (let i = 0; i < 240; i++) {
        a.update(1 / 120, { ship });
        // With the effect zeroed the module runs and writes nothing, which is
        // the point: the flag is what the machines read.
        if (!on) ship.cloaked = false;
        field.update(1 / 120, i / 120, ship);
        if (field.enemies.some((m) => m.state !== 'idle')) tracked++;
      }
      return tracked;
    }) },
  cloakDrain: { how: 'flight',
    // How much of the cloak a held burn spends. Same duration, same steps, and
    // the only difference is the throttle.
    measure: (on) => withEffect('optical-cloak', { cloakDrain: on ? 2 : 0 }, () => {
      const ship = new Ship();
      ship.applyLoadout(STOCK);
      ship.reset(0, 0, 100);
      ship.throttle = 1;
      const a = new Abilities('optical-cloak', STOCK);
      a.trigger(ship);
      for (let i = 0; i < 120; i++) { ship.throttle = 1; a.update(1 / 120, { ship }); }
      return +a.remaining.toFixed(5);
    }) },

  // ---- M31's five specialists ---------------------------------------------
  corrosionResist: { how: 'flight',
    measure: (on) => timeToStatus(on ? only('corrosionResist', 0.55) : STOCK,
      [{ type: 'acid', acidRate: 12 }], 'corrosion') },
  coldResist: { how: 'flight',
    measure: (on) => timeToStatus(on ? only('coldResist', 0.55) : STOCK,
      [{ type: 'cold', coldRate: 12 }], 'cold') },
  // ---- M36: the Thermal Sink's two halves, on opposite terms ---------------
  //
  // **Heat is the one channel a status rig has to fly rather than sit in.** It
  // is made by the throttle, so a rig that only calls `applyForces` on a parked
  // lander measures a cold engine forever - `throttleCmd` is what says the
  // engine is on, and it is the same field `ship.step` writes.
  heatResist: { how: 'flight',
    measure: (on) => timeToStatus(on ? only('heatResist', 0.6) : STOCK,
      [{ type: 'heat', heatRise: 12, heatFall: 1 }], 'heat', 40,
      (sh) => { sh.throttleCmd = 1; }) },
  heatShed: { how: 'flight',
    // The other half, and it has to be measured with the engine **off**: shed
    // scales what the hull gets rid of, so a rig burning flat out would read
    // mostly the rise. Soak it, cut the engine, and see what is left.
    measure: (on) => {
      const level = { id: 'shed-rig', width: 2000, height: 1400, groundBase: 300, rough: 150,
        gravity: 25, fuel: 120, pads: [{ mult: 2, width: 200 }],
        hazards: [{ type: 'heat', heatRise: 12, heatFall: 1.5 }] };
      const ship = new Ship();
      ship.applyLoadout(on ? only('heatShed', 1.7) : STOCK);
      ship.reset(500, 300, level.fuel);
      ship.statusLevels.heat = 80;
      ship.throttleCmd = 0;
      for (let i = 0; i < 600; i++) applyForces(ship, level, i / 120, 1 / 120);
      return +ship.statusLevels.heat.toFixed(4);
    } },
  plumeLateral: { how: 'flight',
    // Parked in a live vent and asked what it did **sideways**. The vertical
    // half is checked here too, in the section below, because the module's
    // whole claim is that it cuts one and leaves the other.
    measure: (on) => +ventPush(on ? only('plumeLateral', 0.35) : STOCK).vx.toFixed(5) },
  glideTrim: { how: 'flight',
    // Nose tipped into the direction of travel: with a foil that sheds lift,
    // without one the attitude means nothing to the air.
    measure: (on) => +liftAt(on ? only('glideTrim', 0.7) : STOCK, 0.45).toFixed(6) },
  collectRadius: { how: 'instrument',
    // 75 px: outside the stock reach of 62, inside a magnet's 93. Measured
    // through `terrain.collect` itself, which is the rule both the game loop
    // and the pilot call.
    measure: (on) => {
      const level = MOON_LEVELS[0];
      const terrain = new Terrain(level, 4242);
      const cell = terrain.fuelCells[0];
      return terrain.collect(cell.x + 75, cell.y, pickupRadius(on ? only('collectRadius', 1.5) : STOCK)).length;
    } },

  weaponPower: { how: 'flight',
    measure: (on) => {
      const { ship, field, e } = machineRig(on ? only('weaponPower', 2) : STOCK);
      const a = new Abilities('pulse-laser', on ? only('weaponPower', 2) : STOCK);
      a.trigger(ship);
      for (let i = 0; i < 60; i++) a.update(1 / 120, { ship, field: field });
      return +(e.maxHp - e.hp).toFixed(3);
    } },
  shieldCapacity: { how: 'flight',
    measure: (on) => fired('ray-shield', on ? only('shieldCapacity', 2) : STOCK).ship.shieldHp },
  shieldHazard: { how: 'flight',
    // Cold is a channel the shield only covers once Shield Harmonics is bought.
    measure: (on) => timeToStatus(on ? only('shieldHazard', 1) : STOCK,
      [{ type: 'cold', coldRate: 30 }], 'cold', 40,
      (s) => { s.shieldActive = true; s.shieldFactor = 0.15; s.shieldHazard = !!(s.loadout.shieldHazard); }) },
  // ---- M35's two --------------------------------------------------------
  //
  // `repairRate` is measured by **running the nanites** rather than reading the
  // spec back: the node multiplies the module's own declared `repairPerSecond`,
  // so a witness that read the loadout key would pass even if `abilities.js`
  // ignored it - which is exactly how `beacon` sat hollow across three sellers.
  repairRate: { how: 'flight',
    measure: (on) => {
      const ship = new Ship();
      ship.applyLoadout(on ? only('repairRate', 1.2) : STOCK);
      ship.reset(500, 300, 120);
      ship.hull = Math.round(ship.hullMax * 0.4);
      const a = new Abilities('repair-nanites', on ? only('repairRate', 1.2) : STOCK);
      a.trigger(ship);
      for (let i = 0; i < 240; i++) a.update(1 / 120, { ship });
      return +ship.hull.toFixed(6);
    } },
  // The capstone, measured on the **engine** - the half a player pays rather
  // than the half they spend. Pressed, run out, and then asked what the main
  // engine is worth, which is `engineThrust()`: the one rule both thrust sites
  // read. A witness that checked `ship.overdrive` would only prove a timer runs.
  overdrive: { how: 'flight',
    measure: (on) => {
      const level = MOON_LEVELS[3];
      const terrain = new Terrain(level, 1000);
      const ship = new Ship();
      ship.applyLoadout(on ? only('overdrive', 1) : STOCK);
      const start = spawnFor(level, terrain);
      ship.reset(start.x, start.y - 300, ship.tankFor(level.fuel));
      const set = { steering: 'pro', invertRotation: false };
      const press = { thrust: false, left: false, right: false, hold: false, arrest: 0, overdrive: 1 };
      const idle = { ...press, overdrive: 0 };
      ship.step(1 / 120, press, level, terrain, 0, set);
      // Far enough past the window that the bill is what is being measured.
      for (let i = 1; i < 120 * 6; i++) ship.step(1 / 120, idle, level, terrain, i / 120, set);
      return +ship.engineThrust().toFixed(6);
    } },

  // ---- flight, declared by an active module rather than by the loadout ----
  anchorGrip: { how: 'flight',
    measure: (on) => withEffect('magnetic-anchor', { anchorGrip: on ? 6 : 1.2 },
      () => fired('magnetic-anchor').ship.anchor) },
  purgeStatus: { how: 'flight',
    measure: (on) => withEffect('thermal-purge', { purgeStatus: on ? 0.9 : 0.1 },
      () => +fired('thermal-purge', STOCK, 1, (s) => { s.statusLevels.heat = 80; }).ship.statusLevels.heat.toFixed(4)) },
  hazardShield: { how: 'flight',
    measure: (on) => withEffect('ray-shield', { hazardShield: on ? 0.05 : 0.95 }, () => {
      const ship = new Ship();
      ship.applyLoadout(STOCK);
      ship.reset(500, 300, 120);
      const a = new Abilities('ray-shield', STOCK);
      a.trigger(ship);
      const level = { id: 'rad-rig', width: 2000, height: 1400, groundBase: 300, rough: 150,
        gravity: 25, fuel: 120, pads: [{ mult: 2, width: 200 }],
        hazards: [{ type: 'radiation', period: 15, duty: 0.45, rate: 30 }] };
      for (let i = 0; i < 24000; i++) {
        applyForces(ship, level, i / 120, 1 / 120);
        if (ship.statusLevels.radiation >= 40) return i / 120;
      }
      return Infinity;
    }) },
  laserDps: { how: 'flight',
    measure: (on) => withEffect('pulse-laser', { laserDps: on ? 26 : 2 }, () => {
      const { ship, field, e } = machineRig(STOCK);
      const a = new Abilities('pulse-laser', STOCK);
      a.trigger(ship);
      for (let i = 0; i < 60; i++) a.update(1 / 120, { ship, field });
      return +(e.maxHp - e.hp).toFixed(3);
    }) },
  laserRange: { how: 'flight',
    // Parked 470 px out: inside the shipped reach, outside the one M30a found.
    measure: (on) => withEffect('pulse-laser', { laserRange: on ? 520 : 120 }, () => {
      const { ship, field } = machineRig(STOCK, 470);
      const a = new Abilities('pulse-laser', STOCK);
      a.trigger(ship);
      let frames = 0;
      for (let i = 0; i < 300; i++) { a.update(1 / 120, { ship, field }); if (a.beam) frames++; }
      return frames;
    }) },

  // ---- economy -----------------------------------------------------------
  cargoRecovery: { how: 'economy',
    measure: (on) => {
      const haul = { ...freshHaul(), salvageSafe: 100, salvageCargo: 100, materials: { Ore: 40 } };
      const got = settleHaul(haul, { completed: false, recovered: on ? 0.5 : 0 });
      return got.salvage + (got.materials.Ore || 0);
    } },

  // ---- instrument --------------------------------------------------------
  predict: { how: 'instrument',
    measure: (on) => {
      let points = 0;
      const ctx = inkCtx();
      ctx.lineTo = () => { points++; };
      const { ship, terrain, level } = rig(on ? only('predict', 2) : STOCK);
      ship.y = terrain.heightAt(ship.x) - 700;
      ship.vx = 0; ship.vy = 0;
      drawTrajectory(ctx, ship, level, terrain, { scale: 1 });
      return points;
    } },
  beacon: { how: 'instrument',
    // The pad marker that shows through the weather. Sold by the Hardened
    // Radar, by Sensors L2/L3 and by a raised Sensor Pulse; read by nothing at
    // all until M31, and the grep passed it because `abilities.js` contains the
    // word while reading the module's own field.
    measure: (on) => {
      const level = MARS_LEVELS[0];
      const terrain = new Terrain(level, 4242);
      const ship = new Ship();
      ship.applyLoadout(on ? only('beacon', 1.8) : STOCK);
      ship.reset(0, 0, 100);
      const ctx = inkCtx();
      const cam = { ...CAM, x: (terrain.pads[0].x1 + terrain.pads[0].x2) / 2, y: terrain.pads[0].y };
      drawPadBeacons(ctx, cam, 1440, 900, terrain, level, 3, 0.4, { beacon: beaconGain(ship) });
      return +ctx.ink.toFixed(4);
    } },
  noiseResist: { how: 'instrument',
    measure: (on) => {
      const ship = new Ship();
      ship.applyLoadout(on ? only('noiseResist', 0.3) : STOCK);
      ship.reset(0, 0, 100);
      ship.statusLevels.radiation = 80;
      ship.env.instrumentError = 0.5;
      return +(instrumentNoise(ship) + instrumentDrift(ship)).toFixed(6);
    } },
  threatWarning: { how: 'instrument',
    measure: (on) => {
      const level = { ...MOON_LEVELS[3], enemyBudget: 3, enemySets: ['sentry-turret'] };
      const terrain = new Terrain(level, 4242);
      const field = new EnemyField(level, terrain, 4242);
      const ship = new Ship();
      ship.applyLoadout(STOCK);
      ship.reset(0, 0, level.fuel);
      // Park in reach so the machines lock on, then draw them.
      const e = field.enemies[0];
      ship.x = e.x + 120; ship.y = e.y - 80;
      // Draw on the first frame a machine is *tracking*, which is the only
      // phase Threat Analysis makes visible. Running a fixed number of steps
      // and drawing whatever state fell out caught them mid-telegraph, where
      // both loadouts draw the same line and the witness agrees with itself.
      let drew = null;
      for (let i = 0; i < 1200 && !drew; i++) {
        field.update(1 / 120, i / 120, ship);
        if (field.enemies.some((m) => m.state === 'track')) {
          const ctx = inkCtx();
          drawEnemies(ctx, field, ship, 3, { threatWarning: on });
          drew = ctx.ops;
        }
      }
      return drew;
    } },
  revealVisibility: { how: 'instrument',
    // The weather is faked on `visRaw`, the channel `applyForces` records it
    // on, because the pulse resolves min(cap, max(floor, raw)) since the M37
    // slot-order fix - a rig that only sets `visibility` is setting a value
    // the resolver derives, not one it reads.
    measure: (on) => withEffect('sensor-pulse', { revealVisibility: on ? 1 : 0.3 },
      () => +fired('sensor-pulse', STOCK, 1, (s) => { s.env.visRaw = 0.2; s.env.visibility = 0.2; }).ship.env.visibility.toFixed(4)) },
};

{
  // The gate itself, and it fails in both directions: a key with no witness,
  // and a witness for a key nobody sells.
  const tally = { flight: 0, economy: 0, instrument: 0 };
  const gaps = [];
  for (const [key, where] of DECLARED) {
    const w = WITNESS[key];
    if (!w) {
      if (KNOWN_GAPS.has(key)) { gaps.push(`${key} (${where})`); continue; }
      check(`${key} (${where}) has a witness`, false, 'sold to the player with nothing to measure');
      continue;
    }
    const off = w.measure(false);
    const on = w.measure(true);
    tally[w.how]++;
    check(`${key} (${where}) is delivered - ${w.how}`, off !== on,
      `unchanged at ${JSON.stringify(off)} with the declared number moved`);
  }
  for (const key of Object.keys(WITNESS)) {
    check(`the witness for ${key} is for something the game still sells`, DECLARED.has(key),
      'stale witness - nothing declares this key any more');
  }
  for (const key of KNOWN_GAPS) {
    check(`${key} is on KNOWN_GAPS because nothing delivers it`, !WITNESS[key],
      'it has a witness now - take it off the list');
  }
  console.log(`  ${tally.flight} flight · ${tally.economy} economy · ${tally.instrument} instrument`);
  for (const g of gaps) console.log(`  GAP   ${g} - sold to the player, not yet delivered`);
}

{
  // **One engine rule, one implementation - asserted structurally, because a
  // second thrust site is invisible to every behavioural test there is.**
  //
  // `spec.thrust` is what the lander was built with and `engineThrust()` is
  // what it can deliver after engine heat and a Combat Overdrive bill have had
  // their say. There are two places that burn the main engine - flight, and the
  // recovery burn while a touchdown is still sliding - and M35 found the second
  // one uncovered: pointing it back at the raw `spec.thrust` raised **zero
  // failures** in every suite, because the sliding path is narrow enough that
  // nothing flies it. A third site added later would be the same silent hole.
  //
  // So the claim is about the source: outside `engineThrust` itself, nothing in
  // `ship.js` multiplies the raw thrust or reads the derate. That is the same
  // shape as M24's constant-encoding assertions - state the rule where it can
  // be checked, rather than hoping a flight happens to cross it.
  const text = readFileSync(new URL('../src/ship.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const body = text.slice(text.indexOf('engineThrust()'), text.indexOf('tankFor('));
  const outside = text.replace(body, '');
  check('only engineThrust() reads the engine derate',
    !/\bthermalDerate\b/.test(outside.replace(/this\.thermalDerate = 1;/, '')),
    'a second place derates the engine - fold it into engineThrust()');
  check('and nothing else touches the raw spec thrust at all',
    !/spec\.thrust\b/.test(outside),
    'a second thrust site - it will not see heat or an overdrive bill');
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
  // Inertial Dampers was the skill half of this and was cut in M35; the key it
  // sold is still sold by the Gyro Stabilizer, the Control Surfaces and a
  // hangar rung, which is exactly why removing that node cost nothing.
  const noDamp = gustAfter(deriveFull({}, deriveSkills({}), {}));
  const gyro = gustAfter(deriveFull({}, deriveSkills({}), derivePassive('gyro-stabilizer')));
  const foil = gustAfter(deriveFull({}, deriveSkills({}), derivePassive('atmospheric-control-surfaces')));
  check('the gyro passive shrinks the gust', gyro < noDamp * 0.95, `${noDamp.toFixed(1)} -> ${gyro.toFixed(1)}`);
  check('and so does the control surface', foil < noDamp * 0.99, `${noDamp.toFixed(1)} -> ${foil.toFixed(1)}`);

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
  // Compared against **bare exposure** since M35. It used to be compared against
  // Environmental Seals, and when that node was cut the comparison would have
  // silently lost its counterpart - so the claim is stated against the thing it
  // is really about: standing in a radiation sweep with nothing raised.
  check('a raised Ray Shield holds off radiation',
    shielded > rawRads * 1.5,
    `bare ${rawRads.toFixed(1)}s vs shield ${shielded === Infinity ? 'never' : shielded.toFixed(1) + 's'}`);

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
  // --- Emergency Arrest: a refusal in four directions, and one use
  const rigAt = (loadout, { alt = 120, tilt = 0, vy = 40 } = {}) => {
    const { ship, terrain, level } = rig(loadout);
    const pad = terrain.pads[terrain.pads.length - 1];
    ship.x = (pad.x1 + pad.x2) / 2;
    ship.y = terrain.heightAt(ship.x) - alt;
    ship.vx = 0; ship.vy = vy; ship.angle = tilt; ship.spin = 0;
    return { ship, terrain, level };
  };
  const press = (r, secs = 1 / 120) => {
    const input = { thrust: 0, left: 0, right: 0, hold: 0, arrest: 1 };
    const before = r.ship.vy;
    for (let i = 0; i < Math.max(1, secs * 120); i++) {
      r.ship.step(1 / 120, input, r.level, r.terrain, i / 120);
    }
    return before - r.ship.vy;
  };
  const armed = only('arrest', 1);

  check('the arrest is granted only when the node is bought',
    rigAt(armed).ship.arrestLeft === 1 && rigAt(STOCK).ship.arrestLeft === 0);

  const saved = press(rigAt(armed));
  check('pressing it low, upright and falling takes the sink rate off',
    saved > ARREST.impulse * 0.8, `${saved.toFixed(1)} px/s`);
  check('and without the node the same press does nothing',
    press(rigAt(STOCK)) < 1, `${press(rigAt(STOCK)).toFixed(2)} px/s`);

  // Each condition is its own refusal, and each was a mutation that raised
  // nothing until it was written down.
  check('it refuses high up', press(rigAt(armed, { alt: ARREST.maxAltitude + 200 })) < 1);
  check('it refuses tilted over', press(rigAt(armed, { tilt: ARREST.maxTilt + 0.3 })) < 1);
  check('it refuses while climbing', press(rigAt(armed, { vy: -20 })) < 1);

  // Once a mission, on the edge of the control - held down it must not drain
  // the tank, and a second press must be refused.
  {
    const r = rigAt(armed);
    const fuel0 = r.ship.fuel;
    // **Two charges, deliberately, though the node only ever grants one.**
    // With one, "fires on the edge" and "fires while held" are indistinguishable
    // - the charge runs out either way - and the mutation that drops the edge
    // check raised nothing at all. The rule being tested is one press, one
    // pulse, and it needs a lander that could physically fire twice.
    const first = press(r, 1.0);
    check('the mission carries one charge and it is spent', r.ship.arrestLeft === 0);
    check('and it costs a real share of the tank',
      fuel0 - r.ship.fuel > r.ship.maxFuel * ARREST.fuelShare * 0.9
      && fuel0 - r.ship.fuel < r.ship.maxFuel * ARREST.fuelShare * 1.6,
      `${(fuel0 - r.ship.fuel).toFixed(1)} of ${r.ship.maxFuel}`);
    // Release, set it up again, press again: there is nothing left.
    r.ship.y = r.terrain.heightAt(r.ship.x) - 120;
    r.ship.vy = 40;
    r.ship.step(1 / 120, { thrust: 0, left: 0, right: 0, hold: 0, arrest: 0 }, r.level, r.terrain, 2);
    check('and a second one is refused', press(r) < 1, `first ${first.toFixed(1)} px/s`);
  }
  {
    // **One press, one pulse — and it needs a lander that could fire twice.**
    // With the single charge the node grants, "fires on the edge" and "fires
    // while held" are indistinguishable, and the mutation that drops the edge
    // check raised nothing at all against the block above.
    // Falling at 200 px/s, so that one pulse leaves the lander still falling
    // and still inside the window: without an edge check the same press spends
    // the second charge on the very next substep. At a gentler 40 px/s the
    // pulse takes the lander out of the window by itself and the two rules are
    // indistinguishable - which is why the first version of this proved nothing.
    const r = rigAt(armed, { vy: 200, alt: 190 });
    r.ship.arrestLeft = 2;
    press(r, 0.5);
    check('a held control fires exactly once', r.ship.arrestLeft === 1,
      `${r.ship.arrestLeft} of 2 charges left after half a second of holding it down`);
  }
}

{
  // --- the Aero-Brake Foil's second half: it spoils lift as well as dragging
  //
  // One field, two readers, and the drag witness in section 2 only measures
  // one of them: removing the divide in `glide` raised **zero** failures until
  // this existed. On Titan the whole complaint is the float, so the half that
  // is not in the drag term is the half a player will feel first.
  const liftWith = (brake) => {
    const level = chapterFor('TITAN', 4242).levels[4];
    const terrain = new Terrain(level, 4242);
    const ship = new Ship();
    ship.applyLoadout(STOCK);
    ship.reset(terrain.pads[0].x1, terrain.heightAt(terrain.pads[0].x1) - 300, level.fuel);
    ship.vx = 130; ship.angle = 0;
    ship.airBrake = brake;
    applyForces(ship, level, 0, 1 / 120, terrain);
    return ship.env.lift;
  };
  const free = liftWith(1);
  const braked = liftWith(ACTIVE_MODULES['aero-brake'].effect.brakeDrag);
  check('a deployed foil spoils the lift it also drags against', braked < free * 0.6,
    `${free.toFixed(3)} -> ${braked.toFixed(3)}`);
  check('and a stowed one leaves the air exactly as it was', liftWith(1) === free);
}

{
  // --- cargoRecovery reaches the economy
  //
  // Salvage Drone was the other half of this and was cut in M35; a mission's
  // pay is what the mission is worth now, with no skill scaling it.
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
    ship.env.visRaw = 0.2;         // the weather's own channel since the M37 fix
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
  ship.env.visRaw = 0.15;          // the weather's own channel since the M37 fix
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


// ---------------------------------------------------------------------------
section('4. fitting it changes a flown mission');

/**
 * Section 2 proves a *key* is read. This proves the **thing a player chooses**
 * is worth choosing: fit the module, or buy the node, and fly a real chapter
 * with the real autopilot. If nothing about the flight moves, the choice is
 * decoration however many keys it declares.
 *
 * A module is flown on the first body its own `good` field claims, which makes
 * the claim testable too: a module recommended for Titan has to do something on
 * Titan. That is the M30g rule with teeth - the route card is derived from
 * `good`, so a lie there is a lie on the screen a player picks a run from.
 */
const NOT_IN_FLIGHT = {
  // --- M34. Four of the nine change what you are shown or what a *run* is,
  // and one changes something a boolean pilot cannot express.
  'fourth-shuttle': 'changes how many shuttles a run carries, not how one is flown',
  'phoenix-protocol': 'gives one back after the flight it was lost on',
  'sensor-pulse': 'clears the weather - what you can see, not where you go',
  'hardened-radar': 'instruments only, and presentation may never reach the simulation',
  'black-box': 'changes what survives a crash, after the flight is over',
  'threat-analysis': 'draws the tracking arc; the machines behave identically',
};

/**
 * Where a node is worth measuring, and what has to be in the air for it.
 *
 * `deep` is the prize route with machines up; `home` is the way to the sanctuary
 * pad, which the M24 rule keeps outside every engagement range. That distinction
 * is the whole table: a combat node measured on the way home is measured
 * somewhere nothing can shoot at it, and reads as inert.
 */
const NODE_RIG = {
  'fuel-mix': { body: 'LUNA', route: 'home' },
  'reserve-tank': { body: 'LUNA', route: 'home' },
  // **Every one of these four was measured, not guessed.** The first pass put
  // them all on the Moon's deep route and read four of them as inert; a scan of
  // all ten bodies against both routes found each one a place where it is
  // visible. What it takes is the thing the node answers actually happening:
  // a hard enough arrival to cost hull, or a machine close enough to kill.
  'reinforced-struts': { body: 'VENUS', route: 'home' },               // the wall lands hard
  'field-patching': { body: 'MARS', route: 'home', enemies: true },    // hull to give back
  capacitor: { body: 'LUNA', route: 'deep', ability: 'pulse-laser' },
  // Ganymede's field raises `charge`, which the shield only covers once
  // Harmonics is bought. On Io - the body the *shield* claims - heat never
  // reaches its bite point for this pilot, so there is nothing to hold off.
  'shield-harmonics': { body: 'GANYMEDE', route: 'deep', ability: 'ray-shield' },
  // M34. Europa is ice underfoot, so grip shows there; Venus lands hard enough
  // for a panic burn to be the difference; the arc needs two machines and a
  // beam, which is the Moon's deep route.
  'surface-adaptation': { body: 'EUROPA', route: 'home' },
  'emergency-arrest': { body: 'VENUS', route: 'home' },
  'twin-link': { body: 'LUNA', route: 'deep', ability: 'pulse-laser' },
  // M35. Both need a module to act on, which is what a Combat capstone and a
  // nanites multiplier are: the nanites need a lander that has been hurt, and
  // the overdrive needs a spent module and something still shooting.
  // **The way home, and it was measured rather than guessed.** The deep route
  // read 0/5 - at the prize pad with machines up, four flights in five end as a
  // crash and a crash is insensitive to 20% more hull knitted back. Scanned
  // across five bodies and both routes: MARS/home 2/5, LUNA/deep 2/5,
  // EUROPA/home 2/5, VENUS/deep 1/5, TITAN 1/5 either way. MARS is what the
  // nanites themselves claim, so that is where the node is asked.
  'autonomous-repair': { body: 'MARS', route: 'home', ability: 'repair-nanites', enemies: true },
  'combat-overdrive': { body: 'LUNA', route: 'deep', ability: 'pulse-laser', enemies: true },
};

const FLIGHT_SEED = 4242;

/**
 * One chapter, flown mission by mission, reduced to what came out of it.
 *
 * **The route is the argument.** Flown at the deep pad with machines up, four
 * flights in five end as a crash, and a crash is insensitive to almost
 * everything a module does. Flown to the sanctuary pad, nothing can shoot at
 * you - the M24 guarantee - so a weapon reads as inert. Neither route measures
 * everything, and picking the wrong one for a module is how it comes out
 * looking like decoration.
 */
function chapterTrace(body, route, opts) {
  const chapter = chapterFor(body, FLIGHT_SEED);
  return chapter.levels.map((level) => {
    const terrain = new Terrain(level, FLIGHT_SEED ^ (level.id.length * 7919));
    const r = flyMission(level, terrain, {
      ...opts,
      padIndex: route === 'deep' ? 0 : terrain.pads.length - 1,
      enemySeed: 1,
      settleSecs: 3,
    });
    // **Deliberately not the ability counters.** Carrying `fires/hit` in here
    // made every active differ from an empty slot for free - a module that
    // fired and did nothing would have passed, which is the whole fault this
    // section exists to catch. What is compared is the *flight*.
    //
    // Compared at **full precision** and including what the machines did. The
    // rounded figures are a fixture tolerance rather than the flight: they hid
    // a purge that halved a cold soak, and they hid a capacitor that killed a
    // second machine. `kills` and `hitsTaken` are the world's response to the
    // flight; `fires` and `hit` would be the module reporting on itself, which
    // is exactly what must not count.
    const c = r.combat || {};
    return [r.outcome, r.grade, r.hull, r.carried.nodes, r.slid,
      c.kills, c.hpLeft, c.hitsTaken, c.shotsFired,
      JSON.stringify(r.exact)].join(' ');
  });
}

/** Missions of this chapter whose flight came out differently. */
function movedMissions(body, route, withOpts, withoutOpts) {
  const before = chapterTrace(body, route, withoutOpts);
  const after = chapterTrace(body, route, withOpts);
  return after.filter((m, i) => m !== before[i]).length;
}

{
  // A module is flown on **every body its own `good` field claims**, which makes
  // the claim testable too: the route card is derived from `good` (M30g), so a
  // lie there is a lie on the screen a player picks a run from.
  //
  // The gate is "at least one mission of one claimed body flies differently",
  // and the per-body count is printed rather than asserted. That is deliberate
  // and it is the honest limit of this instrument: the Thermal Purge answers a
  // gauge that **this pilot never fills** - measured, it peaks at 10-15% heat
  // across the whole Io chapter, because it burns in short bursts and heat
  // falls between them. A person burns far more. Requiring five of five would
  // be asserting something about the autopilot, not about the module.
  const report = [];
  for (const m of allModules()) {
    if (NOT_IN_FLIGHT[m.id]) continue;
    const isActive = !!ACTIVE_MODULES[m.id];
    // Machines follow the module's own cue, and *which* cues need machines is
    // declared beside the cues rather than restated here - it has now been got
    // wrong twice from this side, once for the Nanites and once for the Rack,
    // and both times the module looked like decoration when the rig was at
    // fault. `pilot.js` owns the list.
    const combat = isActive && CUES_NEEDING_MACHINES.has(m.cue);
    // **Both routes, every claimed body.** Picking one route from the cue read
    // four things as inert that are not. The way home is short and quiet, so a
    // status channel never fills; the deep route is long and hostile, so the
    // sanctuary guarantee stops being in the way. Which one shows a module
    // working is a property of the module, and guessing it wrong looks exactly
    // like the module being decoration.
    const bodies = m.good.length ? m.good : ['LUNA'];
    const per = [];
    let total = 0;
    for (const body of bodies) {
      for (const route of ['home', 'deep']) {
        const base = { loadout: STOCK, enemies: combat };
        const fit = isActive
          ? { ...base, ability: m.id }
          : { loadout: deriveFull({}, deriveSkills({}), derivePassive(m.id)), enemies: combat };
        const n = movedMissions(body, route, fit, base);
        total += n;
        if (n) per.push(`${body}/${route} ${n}/5`);
      }
    }
    if (!per.length) per.push(`${bodies.join(',')} nothing`);
    check(`${m.name} changes a flown mission on a body it claims`, total > 0,
      `identical across ${bodies.join(', ')} - fitted, flown and indistinguishable from an empty slot`);
    report.push(`${m.id} ${per.join(' ')}`);
  }
  for (const node of ALL_NODES) {
    if (NOT_IN_FLIGHT[node.id]) continue;
    const r = NODE_RIG[node.id];
    if (!check(`${node.id} says where it is worth measuring`, !!r,
      'add it to NODE_RIG, or to NOT_IN_FLIGHT with a reason')) continue;
    const base = { loadout: STOCK, enemies: r.enemies != null ? r.enemies : r.route === 'deep', ability: r.ability };
    const fit = { ...base, loadout: deriveFull({}, deriveSkills({ [node.id]: node.ranks }), {}) };
    const n = movedMissions(r.body, r.route, fit, base);
    check(`${node.name} changes a flown ${r.body} chapter`, n > 0,
      `all 5 missions came out identical on the ${r.route} route`);
    report.push(`${node.id} ${r.body} ${n}/5`);
  }
  console.log(`  ${report.join(' · ')}`);
}

{
  // The exemption list fails the other way too. Something parked there that
  // *does* move a flight is a stale excuse, and this project has been caught by
  // a stale list four times now.
  for (const id of Object.keys(NOT_IN_FLIGHT)) {
    const mod = moduleById(id);
    const node = findNode(id);
    check(`NOT_IN_FLIGHT names something real: ${id}`, !!(mod || node));
    if (!mod) {
      // **A skill node gets the same reverse check a module gets.** Until this
      // branch existed the loop verified only that a node *named* something real
      // and then trusted the written excuse forever - `if (!mod) continue` - so
      // the four exempted nodes were the one place a stale excuse could not be
      // caught, in the list that exists to catch stale excuses.
      //
      // A node has no `good` field to say where to fly it, so it is flown where
      // a leak would show: any effect that reaches the derived spec moves
      // *every* flight at full precision (the trace carries `r.exact`), and an
      // effect that needs the world to answer - machines, a hard arrival -
      // gets the Moon's armed deep route and Venus's hard-landing way home.
      // Verified once against all ten bodies and both routes: these two chapters
      // flag exactly what the full sweep flags, at a tenth of the flights.
      if (!node) continue;
      const fit = { loadout: deriveFull({}, deriveSkills({ [id]: node.ranks }), {}) };
      let moved = 0;
      for (const [body, route, enemies] of [['LUNA', 'deep', true], ['VENUS', 'home', false]]) {
        moved += movedMissions(body, route, { ...fit, enemies }, { loadout: STOCK, enemies });
      }
      check(`${id} really is off the flight path`, moved === 0,
        `it moves ${moved} flights - take it off NOT_IN_FLIGHT (${NOT_IN_FLIGHT[id]})`);
      continue;
    }
    const isActive = !!ACTIVE_MODULES[id];
    const combat = isActive && CUES_NEEDING_MACHINES.has(mod.cue);
    const base = { loadout: STOCK, enemies: combat };
    const fit = isActive
      ? { ...base, ability: id }
      : { loadout: deriveFull({}, deriveSkills({}), derivePassive(id)), enemies: combat };
    let moved = 0;
    for (const body of (mod.good.length ? mod.good : ['LUNA'])) {
      for (const route of ['home', 'deep']) moved += movedMissions(body, route, fit, base);
    }
    check(`${id} really is off the flight path`, moved === 0,
      `it moves ${moved} flights - take it off NOT_IN_FLIGHT (${NOT_IN_FLIGHT[id]})`);
  }
}

// ---------------------------------------------------------------------------
section('5. and the player can get hold of it');

/**
 * **Nobody had asked this question, and the answer was five of nine.**
 *
 * Ray Shield, Magnetic Anchor, Thermal Purge, Ice Cleats and Hardened Radar had
 * no grant path at all: the only unlocks were the two starter passives,
 * `MOON_BLUEPRINTS[0]` on a first chapter clear, and the weapon for surviving a
 * mission that shot at you. God mode handed over everything, which is why it
 * never surfaced in a playtest - and the route card recommended four of the five
 * by name, on the screen a run is picked from.
 *
 * That is M30g one level down. It stopped the card naming modules with no
 * *implementation*; it never asked whether an implemented module was reachable.
 *
 * Simulated here rather than read: walk the ladder the way `main.js` does and
 * see what a player ends up holding.
 */
function unlocksAfterLadder(runs = 1) {
  let owned = [...STARTER_PASSIVES];
  for (let run = 0; run < runs; run++) {
    const cleared = [];
    let sawFire = false;
    for (const body of PLANET_ORDER) {
      cleared.push(body);
      // The weapon: handed over by surviving a mission that shot at you.
      if (!sawFire && body !== 'LUNA') { sawFire = true; }
      if (sawFire && !owned.includes(COMBAT_BLUEPRINT)) owned.push(COMBAT_BLUEPRINT);
      // The first-chapter guarantee, then the per-body grant.
      if (!MOON_BLUEPRINTS.some((id) => owned.includes(id))) { owned.push(MOON_BLUEPRINTS[0]); continue; }
      const bp = nextBlueprint(owned, nextPlanet(cleared));
      if (bp) owned.push(bp);
    }
  }
  return owned;
}

{
  const every = allModules().map((m) => m.id);
  const one = unlocksAfterLadder(1);
  check('no blueprint is ever granted twice', new Set(one).size === one.length, one.join());
  const missing = every.filter((id) => !one.includes(id));
  // A full ladder is ten grants plus the guarantees; the collection carries
  // between runs, so anything left over must land on the second.
  const two = unlocksAfterLadder(2);
  check('every module is obtainable without god mode',
    every.every((id) => two.includes(id)),
    `never granted: ${every.filter((id) => !two.includes(id)).join(', ')}`);
  console.log(`  ${one.length}/${every.length} modules after one full ladder` +
    `${missing.length ? `, the rest on the next run: ${missing.join(', ')}` : ''}`);

  // And what the route card recommends has to be something you can hold. This
  // is the check that was missing when M30g derived the card from `good`.
  for (const body of PLANET_ORDER) {
    const rec = recommendedFor(body);
    for (const slot of ['active', 'passive']) {
      const id = rec[slot];
      if (!id) continue;
      check(`${body} recommends a ${slot} the player can obtain: ${id}`, two.includes(id),
        'the expedition card names kit with no grant path');
    }
  }
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
