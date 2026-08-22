// Two active modules, and whether the slot decides the mission:
//   node test/slot-order.js
//
// AUDIT.md lead 2. M37 gave the lander two active slots and the first audit
// found the obvious consequence: `sensor-pulse` wrote visibility as a **max**
// and `thermal-purge` as a **min**, applied in slot order, so which slot each
// module sat in decided the sky - measured at 0.35 against 1.0. Two of the
// forty-five pairs were checked, because those two were the ones found.
//
// This asks the other forty-three the same question.
//
// **It is a rule measurement, not a world measurement** (AUDIT.md section 4).
// It does not fly a mission and diff the outcome: four flights in five to the
// deep pad end as a crash, and a crash is insensitive to almost everything -
// that is exactly how the route rig lied. Instead it replicates `simulate`'s
// per-step order exactly (`ship.step`, which runs `applyForces`; then each
// slot's `update` in slot order), holds the lander somewhere both modules can
// register, and diffs **every observable field**, discovered by walking the
// objects rather than from a list somebody wrote by reading the code.
//
// **And it proves it can see, every run.** A sweep that reports "no collisions"
// is worth nothing unless it is known to be sensitive to one - the first cut of
// this rig reported a clean 90 comparisons while `pulse-laser` was firing at
// nothing, because the lander was parked outside its 520 px reach, and a later
// cut reported a fault measured at x = -7 on a 3,000 px map. So the last block
// builds a pair that *is* order-dependent, in the shape of the M37 fault, and
// fails if the sweep does not catch it.
import { CHAPTERS } from '../src/missions.js';
import { Terrain } from '../src/terrain.js';
import { Ship } from '../src/ship.js';
import { Abilities } from '../src/abilities.js';
import { ACTIVE_MODULES } from '../src/modules.js';
import { EnemyField } from '../src/enemies.js';
import { deriveFull } from '../src/components.js';
import { deriveSkills, TREES, TREE_IDS } from '../src/skills.js';
import { derivePassive } from '../src/modules.js';

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${e}`); } };

console.log('slot order: does the slot a module sits in change the mission?');

const IDS = Object.keys(ACTIVE_MODULES);
const DT = 1 / 120;

// Determinism: anything reading Math.random must read the same stream in both
// orders, or the diff reports the PRNG rather than the slot order.
const realRandom = Math.random;
function pinRandom() {
  let s = 0x2545f491;
  Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); };
}

/** Every number, boolean and string reachable on the shared state, flattened. */
function snap(ship, slots) {
  const out = {};
  const walk = (obj, prefix, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 2) return;
    for (const k of Object.keys(obj)) {
      // Static definitions and the loadout are shared and identical by
      // construction; walking them would only add noise.
      if (k === 'spec' || k === 'loadout' || k === 'envelope' || k === 'mod') continue;
      const v = obj[k];
      if (typeof v === 'function') continue;
      if (v == null) { out[prefix + k] = null; continue; }
      if (typeof v === 'number') { out[prefix + k] = Math.round(v * 1e6) / 1e6; continue; }
      if (typeof v === 'boolean' || typeof v === 'string') { out[prefix + k] = v; continue; }
      if (ArrayBuffer.isView(v)) continue;
      if (Array.isArray(v)) {
        out[prefix + k + '.length'] = v.length;
        v.forEach((e, i) => walk(e, `${prefix}${k}[${i}].`, depth + 1));
        continue;
      }
      walk(v, prefix + k + '.', depth + 1);
    }
  };
  walk(ship, 'ship.');
  // **Keyed by module, not by slot.** In the reversed run slot 0 holds the other
  // module, so comparing "slot 0 against slot 0" compares two different things
  // and reports a difference on every pair.
  for (const a of slots) if (a.id) walk(a, `mod<${a.id}>.`);
  return out;
}

function run(level, terrain, station, order, schedule, loadout, make, secs = 22) {
  pinRandom();
  const ship = new Ship();
  ship.applyLoadout(loadout);
  ship.reset(station.x, station.y, 120);
  ship.hull = ship.hullMax * 0.6;      // so repair-nanites has room to work
  ship.statusLevels.heat = 40;          // and thermal-purge has something to dump
  ship.statusLevels.cold = 40;
  ship.statusLevels.corrosion = 40;
  const field = new EnemyField(level, terrain, 7);
  const slots = order.map((id) => make(id, loadout));
  const input = { thrust: false, left: false, right: false, hold: false };
  const trace = [];
  for (let i = 0, steps = Math.round(secs / DT); i < steps; i++) {
    const t = i * DT;
    // Held on station: the claim is about the modules, not about where the
    // lander drifted to. A pair that pushes the ship differently would diverge
    // through the terrain and drown the field under test in position noise.
    // Every field either module writes is compared directly, so nothing that
    // could show up in the motion is invisible here.
    ship.x = station.x;
    ship.y = station.y;
    ship.vx = 0; ship.vy = 0;
    ship.step(DT, input, level, terrain, t, { steering: 'pro', invertRotation: false });
    field.update(DT, t, ship);
    // **Keyed on the module, not the slot.** Staggering by slot index would
    // confound "which module fired first" with "which slot it is in", and the
    // only difference between the two runs has to be the slot order.
    for (const a of slots) if (a.id && schedule[a.id].includes(i)) a.trigger(ship);
    for (const a of slots) a.update(DT, { ship, field, terrain, level });
    if (i % 30 === 0 || i === 61 || i === 181) trace.push([t.toFixed(2), snap(ship, slots)]);
  }
  trace.push(['end', snap(ship, slots)]);
  Math.random = realRandom;
  return { trace, fired: slots.map((a) => a.used) };
}

function compare(level, terrain, station, a, b, schedule, loadout, make = (id, l) => new Abilities(id, l)) {
  const fwd = run(level, terrain, station, [a, b], schedule, loadout, make);
  const rev = run(level, terrain, station, [b, a], schedule, loadout, make);
  const diffs = [];
  for (let i = 0; i < fwd.trace.length; i++) {
    const [t, A] = fwd.trace[i];
    const B = rev.trace[i][1];
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      if (A[k] !== B[k]) diffs.push({ t, key: k, a: A[k], b: B[k] });
    }
  }
  return { diffs, fired: fwd.fired };
}

/**
 * Where the lander stands: **placed, not found**.
 *
 * The first cut took `width * 0.3` and 300 px up - wherever that happened to be -
 * and the nearest machine was outside `ABILITY.laserRange`, so `pulse-laser`
 * fired, acquired nothing, and all nine of its pairs measured one live module
 * against an inert slot. The cut after that took `enemies[0].x - 200`
 * unconditionally and put the Titan station at **x = -7 on a 3,000 px map**,
 * which reported a fault about nowhere. Both are the section 4 shape.
 */
function stationFor(level, terrain) {
  const machines = new EnemyField(level, terrain, 7).enemies;
  const machine = machines.find((e) => e.x > 400 && e.x < level.width - 400) || machines[0];
  const mx = machine ? machine.x : level.width * 0.5;
  const x = Math.min(Math.max(mx - 200, 250), level.width - 250);
  return { x, y: terrain.heightAt(x) - 150, machine };
}

// **Bare and fully researched.** Several actives read the loadout rather than
// only their own declared effect - `shieldCapacity` and `shieldHazard` on the
// shield, `repairRate` on the nanites, `twinLink` and `weaponPower` on the laser
// - so a pair that commutes with nothing fitted is not the same claim as a pair
// that commutes on a finished ship.
const maxSkills = {};
for (const tid of TREE_IDS) for (const n of TREES[tid].nodes) maxSkills[n.id] = n.ranks;
const LOADOUTS = [
  ['bare', deriveFull({}, deriveSkills({}), {})],
  ['fully researched', deriveFull({ gear: 4, tank: 4, engine: 4, hull: 4, sensors: 4, rcs: 4 },
    deriveSkills(maxSkills), derivePassive('hardened-radar'))],
];

const BEDS = [
  ['venus-4', 'venus'],   // drag, acid, downdraft, dust - visibility, a status channel and hull all live
  ['titan-4', 'titan'],   // wind, glide - the aero foil's second reader
];

/**
 * Four firing schedules, because "two modules at once" is four questions.
 * Simultaneous is where the M37 fault lived; the two staggers put one module's
 * *teardown* inside the other's active window, which is the third shape the
 * lead names; the last asks whether anything either left behind changes a
 * second firing.
 */
function schedulesFor(A, B) {
  return {
    'both at once': { [A]: [60], [B]: [60] },
    [`${A} first`]: { [A]: [60], [B]: [180] },
    [`${B} first`]: { [A]: [180], [B]: [60] },
    'both, twice': { [A]: [60, 1560], [B]: [60, 1560] },
  };
}

// --- the sweep ---------------------------------------------------------------

{
  let comparisons = 0;
  const offenders = [];
  for (const [bedId, chapter] of BEDS) {
    const lv = CHAPTERS[chapter].levels.find((l) => l.id === bedId);
    const level = { ...lv };
    const terrain = new Terrain(level, 4242);
    const station = stationFor(level, terrain);
    check(`${bedId}: the station is on the map`,
      station.x > 0 && station.x < level.width && Number.isFinite(station.y));
    check(`${bedId}: and inside the beam's reach of a machine`,
      !!station.machine && Math.hypot(station.machine.x - station.x, station.machine.y - station.y) < 520,
      'a laser that acquires nothing makes nine pairs measure one module');

    for (let i = 0; i < IDS.length; i++) {
      for (let j = i + 1; j < IDS.length; j++) {
        const [A, B] = [IDS[i], IDS[j]];
        for (const [name, schedule] of Object.entries(schedulesFor(A, B))) {
          for (const [kit, loadout] of LOADOUTS) {
            comparisons++;
            const r = compare(level, terrain, station, A, B, schedule, loadout);
            if (r.diffs.length) offenders.push(`${A}+${B} [${name}, ${kit}, ${bedId}] `
              + r.diffs.slice(0, 3).map((d) => `${d.key} ${d.a}/${d.b}`).join('; '));
          }
        }
      }
    }
  }
  console.log(`  ${comparisons} ordered comparisons `
    + `(${IDS.length * (IDS.length - 1) / 2} pairs x 4 schedules x ${LOADOUTS.length} loadouts x ${BEDS.length} beds)`);
  check('the slot a module sits in changes nothing', offenders.length === 0, offenders.slice(0, 4).join(' | '));
}

// --- the one asymmetry that is structural, and its bound ---------------------

{
  // `field.update` runs before *both* slots, so enemy damage lands identically
  // either way. **The bomb rack is the only thing in the game that wounds the
  // lander from inside a slot's own update**, so it is the only damage that can
  // land between slot 0 and slot 1 - and `repair-nanites` interrupts on
  // `ship.hull < this.watchHull`. So whether the blast is seen this tick or the
  // next depends on which slot each module is fitted into.
  //
  // Placed rather than hunted: no machines on this bed, the lander held 100 px
  // up so the charge detonates well inside its 150 px radius, nothing else
  // allowed near the hull. It is real, and it is **exactly one tick** - the
  // interrupt fires in both orders, one step apart, and the hull differs by one
  // step of the module's own repair rate. Left alone rather than fixed:
  // restructuring the step order for 0.075 hull would be a change to the loop
  // every fixture regresses against, for an effect a player cannot perceive.
  // Asserted so it can never quietly grow.
  const lv = CHAPTERS.titan.levels.find((l) => l.id === 'titan-1');
  const level = { ...lv };
  const terrain = new Terrain(level, 4242);
  const ALT = 100;

  const fly = (order, loadout) => {
    const ship = new Ship();
    ship.applyLoadout(loadout);
    const x = level.width * 0.5;
    ship.reset(x, terrain.heightAt(x) - ALT, 200);
    ship.hull = ship.hullMax * 0.5;
    const slots = order.map((id) => new Abilities(id, loadout));
    const input = { thrust: false, left: false, right: false, hold: false };
    const out = { interruptedAt: null, blastAt: null, selfHarm: 0 };
    for (let i = 0; i < 120 * 8; i++) {
      const t = i * DT;
      ship.x = x; ship.y = terrain.heightAt(x) - ALT; ship.vx = 0; ship.vy = 0;
      ship.step(DT, input, level, terrain, t, { steering: 'pro', invertRotation: false });
      if (i === 60) for (const a of slots) if (a.id === 'repair-nanites') a.trigger(ship);
      if (i === 120) for (const a of slots) if (a.id === 'bomb-rack') a.trigger(ship);
      for (const a of slots) {
        for (const e of a.update(DT, { ship, field: null, terrain, level })) {
          if (e.kind === 'repair-interrupted' && out.interruptedAt == null) out.interruptedAt = t;
          if (e.kind === 'blast') { out.blastAt = t; out.selfHarm = e.selfHarm; }
        }
      }
    }
    out.hull = ship.hull;
    return out;
  };

  for (const [kit, loadout] of LOADOUTS) {
    const first = fly(['repair-nanites', 'bomb-rack'], loadout);
    const second = fly(['bomb-rack', 'repair-nanites'], loadout);
    const perTick = (ACTIVE_MODULES['repair-nanites'].effect.repairPerSecond || 0) * (loadout.repairRate || 1) * DT;
    check(`${kit}: the charge actually reaches the lander`, first.selfHarm > 1 && second.selfHarm > 1,
      `self-harm ${first.selfHarm.toFixed(2)}/${second.selfHarm.toFixed(2)} - a blast that misses measures nothing`);
    check(`${kit}: the repair is interrupted whichever slot it is in`,
      first.interruptedAt != null && second.interruptedAt != null,
      'the outcome must not depend on the slot, only the tick it lands on');
    check(`${kit}: and the interrupt is at most one step apart`,
      Math.abs(first.interruptedAt - second.interruptedAt) <= DT * 1.01,
      `${(first.interruptedAt - second.interruptedAt).toFixed(5)}s against a step of ${DT.toFixed(5)}s`);
    check(`${kit}: the hull differs by at most one tick of repair`,
      Math.abs(first.hull - second.hull) <= perTick * 1.01,
      `${Math.abs(first.hull - second.hull).toFixed(5)} against ${perTick.toFixed(5)}`);
  }
}

// --- the positive control ----------------------------------------------------

{
  // **Can this rig see a collision at all?**
  //
  // Everything above reports zero, and a rig that reports zero is
  // indistinguishable from a rig that is not looking - which is the failure this
  // file has already had twice. So: two probes in the shape of the M37 fault, one writing
  // `visibility` as a max and one as a min, straight in, in slot order. They
  // wrap real `Abilities` so every other part of the machinery is the one under
  // test. If the sweep cannot catch this, the sweep's zero means nothing.
  // `super('ray-shield', …)` only borrows a real module's charges, duration and
  // cooldown; `this.id` is overwritten straight after, so neither the trigger
  // branch nor the teardown branch for the shield can fire. Everything else -
  // trigger, the cooldown, the expiry, the teardown - is the real class.
  class Probe extends Abilities {
    constructor(id, loadout, apply) { super('ray-shield', loadout); this.id = id; this._apply = apply; }
    _applyWhileActive(dt, ctx) { this._apply(ctx.ship); }
  }
  const lv = CHAPTERS.venus.levels.find((l) => l.id === 'venus-4');
  const level = { ...lv };
  const terrain = new Terrain(level, 4242);
  const station = stationFor(level, terrain);
  const make = (id, loadout) => new Probe(id, loadout,
    id === 'probe-max'
      ? (ship) => { ship.env.visibility = Math.max(ship.env.visibility, 1); }
      : (ship) => { ship.env.visibility = Math.min(ship.env.visibility, 0.35); });

  const r = compare(level, terrain, station, 'probe-max', 'probe-min',
    { 'probe-max': [60], 'probe-min': [60] }, LOADOUTS[0][1], make);
  check('the rig catches a max and a min written in slot order', r.diffs.length > 0,
    'if this passes silently, every zero above is meaningless');
  check('and it names the field that diverged',
    r.diffs.some((d) => d.key === 'ship.env.visibility' && d.a !== d.b),
    r.diffs.slice(0, 3).map((d) => d.key).join(', '));
  const vis = r.diffs.find((d) => d.key === 'ship.env.visibility');
  if (vis) console.log(`  positive control: visibility ${vis.a} against ${vis.b}, by slot order alone`);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
