// Enemies, the shared combat system and the active-module runtime:
//   node test/enemies-tests.js
import { COMBAT, ENEMY_TYPES, ENEMY_IDS, EnemyField, placeEnemies, lineOfSight, muzzleIsSafe, describeThreats } from '../src/enemies.js';
import { Abilities, ABILITY } from '../src/abilities.js';
import { ACTIVE_MODULES } from '../src/modules.js';
import { validateEnemies, sanctuaryClear } from '../src/validate.js';
import { Terrain } from '../src/terrain.js';
import { applyForces } from '../src/forces.js';
import { Ship } from '../src/ship.js';
import { spawnFor } from '../src/spawn.js';
import { MOON_LEVELS, MARS_LEVELS, EUROPA_LEVELS } from '../src/missions.js';
import { deriveSkills } from '../src/skills.js';
import { deriveFull, deriveLoadout } from '../src/components.js';
import { derivePassive } from '../src/modules.js';

let pass = 0, fail = 0;
const check = (n, c, e = '') => { if (c) pass++; else { fail++; console.log(`  FAIL  ${n}  ${e}`); } };

console.log('enemies and combat');

const ARMED = [...MOON_LEVELS, ...MARS_LEVELS, ...EUROPA_LEVELS].filter((l) => l.enemyBudget > 0);
const SEEDS = [1000, 1137, 1274, 1411, 1548, 1685];

// --- the roster is complete enough to be fair
for (const id of ENEMY_IDS) {
  const t = ENEMY_TYPES[id];
  check(`${id}: telegraphs before it fires`, t.telegraph > 0, String(t.telegraph));
  check(`${id}: recovers between shots`, t.cooldown >= t.telegraph);
  check(`${id}: has a range`, t.range > 100);
  check(`${id}: can be destroyed`, t.hp > 0);
  check(`${id}: pays out`, t.reward > 0);
  check(`${id}: states its counterplay`, typeof t.counterplay === 'string' && t.counterplay.length > 12);
  // M24 replaced two assertions here, and it is worth saying why rather than
  // just changing the numbers. They used to be `telegraph >= 0.8` and
  // `shot.speed < 400`, which encoded the M12 design: a slow, readable gun you
  // could out-turn. Tom asked for the opposite - an 80% shorter turret lock and
  // shots three times faster - so the old constants are not a contract any
  // more, they are the previous decision.
  //
  // What survives the change is the *property* those numbers were protecting:
  // there is a moment between being locked and being hit, and it is long enough
  // to move. So the rule is now stated as the thing it always meant - the
  // reaction window, measured at the machine's own range - instead of as two
  // constants that happened to produce one.
  const reaction = t.telegraph + t.range / t.shot.speed;
  check(`${id}: leaves a second between the lock and the hit`, reaction >= 1.0, `${reaction.toFixed(2)}s`);
}

// --- M24: what a hit costs. Tom's rule is "two shots, with no upgrades".
{
  const BASE_HULL = 100;   // ship.js: hullMax = 100 * (level.hullMax || 1)
  for (const id of ENEMY_IDS) {
    const t = ENEMY_TYPES[id];
    // **A lethal machine is exempt, and says so.** The Mast Sniper is "one shot
    // one kill" by design (Tom, M29e), so asserting two shots against it would
    // be asserting the absence of the feature. The rule it *does* have to obey
    // is the one below: a machine that cannot be survived has to be avoidable,
    // and that is checked as a longer reaction window and finite ammo.
    if (t.shot.lethal) {
      check(`${id}: is lethal on purpose, and pays for it in warning`,
        t.telegraph >= 1.5 && t.ammo > 0 && t.maxPerMission === 1,
        `telegraph ${t.telegraph}s, ammo ${t.ammo}, cap ${t.maxPerMission}`);
      // **A raised Ray Shield stops it, once** (Tom, M29h). It shipped blowing
      // straight through - which followed from "one shot one kill" read
      // literally, and made the shield worthless against the only thing in the
      // game worth raising it for. Both halves are asserted: it saves you, and
      // it is spent doing so.
      const rig = () => { const sh = new Ship(); sh.reset(100, 100, 100); sh.applyLoadout(null); sh.alive = true; return sh; };
      const bare = rig();
      bare.damage(t.shot.damage, 'shot', { lethal: true });
      check(`${id}: kills an unshielded lander outright`, bare.hull === 0);

      const shielded = rig();
      shielded.shieldActive = true;
      shielded.shieldHp = ABILITY.shieldPool;
      const saved = shielded.damage(t.shot.damage, 'shot', { lethal: true });
      check(`${id}: a raised shield stops it`, !saved.destroyed && shielded.hull === shielded.hullMax,
        `hull ${shielded.hull}`);
      check(`${id}: ...and the shield is spent doing it`,
        !!saved.shieldBroke && shielded.shieldHp === 0 && !shielded.shieldActive);
      const again = shielded.damage(t.shot.damage, 'shot', { lethal: true });
      check(`${id}: the next one kills`, again.destroyed && shielded.hull === 0);
      continue;
    }
    const shots = Math.ceil(BASE_HULL / t.shot.damage);
    check(`${id}: kills an unupgraded lander in two shots`, shots === 2, `${shots} shots`);
  }
  // ...and the hull track has to be worth buying, so an upgraded hull survives
  // a third. This is the consumer that stops "2 shots" becoming "always 2".
  //
  // **This used to read `Math.ceil(150 / damage)`**, and 150 is not a hull any
  // level produces: the track runs 100 / 112 / 125 / 140. It encoded a figure
  // instead of the property, exactly the fault M24 found in two other
  // assertions here, and it sent `docs/PROGRESSION.md` off with the claim that
  // "112 hull still dies in two" - which is false, 112 survives two and dies on
  // the third. M28 measured it and rewrote the check around the thing that
  // actually matters: **the cheapest hull the player can buy must buy a third
  // shot**, derived from the real component table.
  const hullShots = (level) => {
    const hullMax = Math.round(100 * (deriveLoadout({ hull: level }).hullMax || 1));
    return Math.ceil(hullMax / ENEMY_TYPES['sentry-turret'].shot.damage);
  };
  check('a stock hull dies in two', hullShots(1) === 2, `${hullShots(1)} shots`);
  check('the cheapest hull upgrade buys a third shot', hullShots(2) >= 3, `L2 = ${hullShots(2)} shots`);
  check('and every level above it keeps that',
    [3, 4].every((l) => hullShots(l) >= 3), [3, 4].map(hullShots).join('/'));
}

// --- placement is deterministic, and obeys every fairness rule
{
  const lvl = MOON_LEVELS[3];
  const terrain = new Terrain(lvl, 4242);
  const a = placeEnemies(lvl, terrain, 4242);
  const b = placeEnemies(lvl, terrain, 4242);
  const c = placeEnemies(lvl, terrain, 99);
  check('the same seed places the same machines', JSON.stringify(a) === JSON.stringify(b));
  check('a different seed places them elsewhere', JSON.stringify(a) !== JSON.stringify(c));
  check('the budget is never exceeded', a.length <= lvl.enemyBudget);
}

// --- every armed mission, over many seeds: the structural promises
{
  let problems = 0, exposed = 0, placed = 0, total = 0, empty = 0, over = 0;
  for (const lvl of ARMED) {
    for (const seed of SEEDS) {
      const terrain = new Terrain(lvl, seed);
      const v = validateEnemies(lvl, terrain, seed);
      problems += v.problems.length;
      if (v.problems.length) console.log(`  ...  ${lvl.id} seed ${seed}: ${v.problems.join('; ')}`);
      placed += v.enemies.length;
      total += lvl.enemyBudget;
      if (v.enemies.length === 0) empty++;
      if (v.enemies.length > lvl.enemyBudget) over++;
      exposed += sanctuaryClear(lvl, terrain, v.enemies).exposed;
    }
  }
  check('no armed mission breaks a placement rule', problems === 0, `${problems} problems`);
  // M21: a gun stands on flat, short ground or on a roof, never half-buried in
  // a slope. Before it, 30% of ground guns stood on ground steeper than 0.30
  // and one in five had more than its own radius of height across its base.
  {
    let steep = 0, uneven = 0, guns = 0, perched = 0;
    for (const lvl of ARMED) {
      for (const seed of SEEDS) {
        const terrain = new Terrain(lvl, seed);
        for (const e of validateEnemies(lvl, terrain, seed).enemies) {
          const type = ENEMY_TYPES[e.type];
          if (type.kind !== 'ground') continue;
          guns++;
          if (e.perch) perched++;
          if (Math.abs(terrain.slopeAt(e.x)) > COMBAT.groundSlope + 0.02) steep++;
          let lo = Infinity, hi = -Infinity;
          for (let d = -type.radius; d <= type.radius; d += 2) {
            const h = terrain.heightAt(e.x + d);
            if (h < lo) lo = h;
            if (h > hi) hi = h;
          }
          if (hi - lo > COMBAT.footSpan + 1) uneven++;
        }
      }
    }
    check('no ground gun stands on a slope', steep === 0, `${steep} of ${guns}`);
    check('no ground gun is half-buried', uneven === 0, `${uneven} of ${guns}`);
    check('guns do use the roofs built for them', perched > guns * 0.3, `${perched}/${guns} perched`);
  }
  check('the sanctuary pad is never in anyone’s sight line', exposed === 0, `${exposed} exposed samples`);
  // A budget is a target the map has to have room for, not a guarantee it can
  // always meet: the countability rule, the sanctuary and the flat-footing rule
  // all take ground away, and past a point a map simply has nowhere to put
  // another machine. M21 set every budget from a measured capacity sweep so
  // that this stays at or above 95% - if it drops, a budget was raised past
  // what its map can hold and the number in the mission has become a lie.
  check('missions field the machines they asked for', placed >= total * 0.95, `${placed}/${total}`);
  check('a budget is never exceeded', over === 0, `${over} seeds over budget`);
  check('an armed mission is never empty', empty === 0, `${empty} seeds with nothing placed`);
}

/** A ship parked at a spot, with a full loadout, ready to be shot at. */
function shipAt(x, y, loadout = {}) {
  const s = new Ship();
  s.applyLoadout(loadout);
  s.reset(x, y, 100);
  return s;
}

// --- inside the minimum range, a ground gun cannot bring the barrel to bear
{
  // One gun on the map, deliberately. This used to fly at `enemies[0]` on a
  // two-turret mission and assert that *nothing* fired, which quietly depended
  // on the second turret being out of range - true until M19's terrain moved
  // them 253 px apart, at which point the far gun did the shooting and the
  // rule under test was never exercised at all.
  const lvl = { ...MOON_LEVELS[3], enemyBudget: 1 };
  const terrain = new Terrain(lvl, 1000);
  const field = new EnemyField(lvl, terrain, 1000);
  const e = field.enemies[0];
  const ship = shipAt(e.x + 20, e.y - 30);   // right on top of it
  for (let i = 0; i < 1200; i++) field.update(1 / 120, i / 120, ship);
  check('flying inside a turret’s arc silences it', field.shotsFired === 0 && ship.hull === ship.hullMax,
    `${field.shotsFired} shots, hull ${ship.hull}`);
}

// --- a shot is never born already touching the lander
{
  const ship = shipAt(500, 300);
  check('the muzzle rule refuses a shot inside the hull', !muzzleIsSafe(510, 305, ship));
  check('the muzzle rule allows one at a fair distance', muzzleIsSafe(500 + COMBAT.muzzleSafe + 1, 300, ship));

  // And the invariant itself, over every armed mission: across long exposures
  // at every distance, nothing is ever born on top of the lander.
  let born = 0;
  let minBirth = Infinity;
  for (const lvl of ARMED) {
    for (const seed of SEEDS) {
      const terrain = new Terrain(lvl, seed);
      const field = new EnemyField(lvl, terrain, seed);
      if (!field.enemies.length) continue;
      const e = field.enemies[0];
      const target = shipAt(e.x, e.y - 40);
      for (let i = 0; i < 3600; i++) {
        // Walk the lander in and out through every range band, including the
        // ones a pilot would only reach by flying straight at the gun.
        const r = 40 + 520 * (0.5 + 0.5 * Math.sin(i / 420));
        const a = i / 1100;
        target.x = e.x + Math.cos(a) * r;
        target.y = e.y - Math.abs(Math.sin(a)) * r - 20;
        // Measure the *birth*, which the fire event reports, not the shot's
        // position after the update. `field.update` fires and then steps every
        // projectile in the same call, so reading `shots[k].x` afterwards is
        // already one frame of travel late - at 255 px/s that is 2.1 px, and it
        // reported a shot born at a legal 57.1 px as an illegal 55.0. The rule
        // was never broken; the ruler was.
        for (const ev of field.update(1 / 120, i / 120, target)) {
          if (ev.kind !== 'fire') continue;
          born++;
          minBirth = Math.min(minBirth, Math.hypot(ev.x - target.x, ev.y - target.y));
        }
        if (target.hull <= 0) target.hull = target.hullMax;
      }
    }
  }
  check('fire was actually exchanged in that sweep', born > 20, `${born} shots`);
  check('no shot is ever born inside the lander', minBirth >= COMBAT.muzzleSafe,
    `${born} shots, closest birth ${minBirth.toFixed(0)}`);
}

// --- terrain is cover: a machine will not shoot through a hill
{
  const lvl = MOON_LEVELS[4];
  const terrain = new Terrain(lvl, 1274);
  const field = new EnemyField(lvl, terrain, 1274);
  const e = field.enemies[0];
  // A point just under the surface on the far side of the world is never visible.
  const buriedY = terrain.heightAt(50) + 60;
  check('nothing has line of sight through the ground',
    !lineOfSight(terrain, e.x, e.y, 50, buriedY));
  const ship = shipAt(50, buriedY);
  for (let i = 0; i < 600; i++) field.update(1 / 120, i / 120, ship);
  check('an unseen lander is never fired at', field.shotsFired === 0, `${field.shotsFired} shots`);
}

// --- damage, shields and the hull
{
  const ship = shipAt(500, 300);
  const r1 = ship.damage(10, 'shot');
  check('a hit costs hull', ship.hull === ship.hullMax - 10 && r1.damage === 10);
  ship.shieldActive = true;
  ship.shieldHp = 12;
  const r2 = ship.damage(10, 'shot');
  check('a shield absorbs first', r2.absorbed === 10 && r2.damage === 0 && ship.hull === ship.hullMax - 10);
  const r3 = ship.damage(10, 'shot');
  check('a shield collapses when its pool is spent', r3.absorbed === 2 && r3.damage === 8 && !ship.shieldActive);
  const dead = ship.damage(999, 'shot');
  check('enough damage destroys the lander', dead.destroyed && ship.hull === 0);
  check('the cause of loss is recorded', ship.lostToFire === true && ship.damageSource === 'shot');
  const after = ship.damage(10, 'shot');
  check('a destroyed lander takes no further damage', after.damage === 0);
}

// --- a landed lander is left alone
{
  const lvl = MOON_LEVELS[3];
  const terrain = new Terrain(lvl, 1137);
  const field = new EnemyField(lvl, terrain, 1137);
  const e = field.enemies[0];
  const ship = shipAt(e.x + 260, e.y - 120);
  ship.landed = true;
  for (let i = 0; i < 900; i++) field.update(1 / 120, i / 120, ship);
  check('nothing fires at a lander that is already down', field.shotsFired === 0 && ship.hull === ship.hullMax);
}

// --- a destroyed machine stops fighting
{
  const lvl = MOON_LEVELS[3];
  const terrain = new Terrain(lvl, 1411);
  const field = new EnemyField(lvl, terrain, 1411);
  const e = field.enemies[0];
  const reward = field.damageEnemy(e, 999);
  check('destroying a machine pays its reward', reward === ENEMY_TYPES[e.type].reward);
  check('a destroyed machine is out of the live list', !field.live.includes(e));
  const ship = shipAt(e.x + 200, e.y - 100);
  const before = field.shotsFired;
  for (let i = 0; i < 900; i++) field.update(1 / 120, i / 120, ship);
  const stillLive = field.live.length;
  check('a dead machine never fires again',
    stillLive > 0 || field.shotsFired === before, `${field.shotsFired - before} shots from ${stillLive} live`);
  check('damaging a corpse pays nothing', field.damageEnemy(e, 999) === 0);
}

// --- projectiles are cleaned up rather than accumulating
{
  const lvl = MARS_LEVELS[3];
  const terrain = new Terrain(lvl, 1000);
  const field = new EnemyField(lvl, terrain, 1000);
  const start = spawnFor(lvl, terrain);
  const ship = shipAt(start.x, start.y);
  let peak = 0;
  for (let i = 0; i < 7200; i++) {          // a full minute of being shot at
    field.update(1 / 120, i / 120, ship);
    peak = Math.max(peak, field.shots.length);
    if (ship.hull <= 0) { ship.hull = ship.hullMax; }   // keep it alive to keep shooting
  }
  check('live projectiles stay bounded', peak <= COMBAT.maxShots, `peak ${peak}`);
  check('shots do not leak', field.shots.length < COMBAT.maxShots);
}

// --- the laser's reach, against what it has to answer
//
// **This is a relationship, not a number**, and it was nobody's until a player
// hit it. At 430 px every machine in the game outranged the Pulse Laser - drone
// 520, turret 560, sniper 640 - so at the moment one was shooting at you the
// counterplay was out of reach by 90 to 210 px. Pressing it then spent a
// charge, drew the success ring, played the success chime and did nothing.
// Measured over 6,400 flights: **one press in five produced no laser at all.**
//
// Nothing asserted the reach against the ranges it exists to answer, which is
// why it could sit there. It does now: the module's own effect is read rather
// than a figure repeated here, which is the rule this file has already been
// caught breaking twice (M24 twice, M28 three times - a test encoding a
// decision instead of a property).
{
  const reach = ACTIVE_MODULES['pulse-laser'].effect.laserRange || ABILITY.laserRange;
  const rangeOf = (id) => ENEMY_TYPES[id].range;

  check('the laser answers the machine that closes on you',
    reach >= rangeOf('seeker-drone'),
    `laser ${reach} vs seeker-drone ${rangeOf('seeker-drone')}`);

  // And the other half, which is what stops it becoming the whole game. A
  // laser that reaches everything removes the decision about when to spend a
  // charge, and answering a Mast Sniper at its own range is most of what makes
  // a sniper a sniper.
  for (const id of ['sentry-turret', 'mast-sniper']) {
    check(`${id} still outranges the laser`, rangeOf(id) > reach,
      `laser ${reach} vs ${id} ${rangeOf(id)}`);
  }

  check('the fallback reach and the module agree', ABILITY.laserRange === ACTIVE_MODULES['pulse-laser'].effect.laserRange,
    `${ABILITY.laserRange} vs ${ACTIVE_MODULES['pulse-laser'].effect.laserRange}`);
}

// --- the active-module runtime
{
  const laser = new Abilities('pulse-laser', {});
  const ship = shipAt(500, 300);
  check('an equipped module starts ready', laser.ready && laser.charges === 3);
  check('an empty slot is honest about it', !new Abilities(null, {}).equipped);
  laser.trigger(ship);
  check('triggering spends a charge', laser.charges === 2 && laser.active);
  check('it cannot be triggered while it is running', laser.trigger(ship) === false);
  laser.update(3, { ship, field: null });
  check('it expires and goes to cooldown', !laser.active && laser.cooldown > 0);
  check('it cannot be re-triggered while charging', laser.trigger(ship) === false && laser.blocker === 'CHARGING');
  laser.update(laser.cooldownLength, { ship, field: null });
  check('it comes back after the cooldown', laser.ready);
  laser.trigger(ship); laser.update(99, { ship, field: null });
  laser.update(99, { ship, field: null });
  laser.trigger(ship); laser.update(99, { ship, field: null });
  laser.update(99, { ship, field: null });
  check('charges run out and stay out', laser.charges === 0 && !laser.ready && laser.blocker === 'SPENT');
}

// --- the laser kills what it can see, and only that
{
  const lvl = MOON_LEVELS[3];
  const terrain = new Terrain(lvl, 1000);
  const field = new EnemyField(lvl, terrain, 1000);
  const e = field.enemies[0];
  const ship = shipAt(e.x + 120, e.y - 90);
  const laser = new Abilities('pulse-laser', {});
  laser.trigger(ship);
  let events = [];
  for (let i = 0; i < 300; i++) events.push(...laser.update(1 / 120, { ship, field }));
  check('the laser destroys a machine in range', e.dead, `hp ${e.hp.toFixed(1)}`);
  check('the kill is reported', events.some((x) => x.kind === 'kill'));

  // Out of range, nothing happens at all.
  const far = new EnemyField(lvl, terrain, 1000);
  const farShip = shipAt(far.enemies[0].x + 900, far.enemies[0].y - 200);
  const laser2 = new Abilities('pulse-laser', {});
  laser2.trigger(farShip);
  for (let i = 0; i < 300; i++) laser2.update(1 / 120, { ship: farShip, field: far });
  check('out of range it burns nothing', !far.enemies[0].dead && laser2.beam === null);
}

// --- the combat tree changes what the simulation does
{
  const loadout = deriveFull({}, deriveSkills({ capacitor: 3, 'threat-analysis': 1, 'energy-on-kill': 1 }), derivePassive(null));
  check('Capacitor Bank raises weapon power', loadout.weaponPower > 1.2);
  check('Capacitor Bank raises shield capacity', loadout.shieldCapacity > 1.2);
  check('Threat Analysis is readable by the renderer', loadout.threatWarning === 1);

  const lvl = MOON_LEVELS[3];
  const terrain = new Terrain(lvl, 1000);
  const plain = new EnemyField(lvl, terrain, 1000);
  const armed = new EnemyField(lvl, terrain, 1000);
  const burn = (field, l) => {
    const ship = shipAt(field.enemies[0].x + 120, field.enemies[0].y - 90, l);
    const ab = new Abilities('pulse-laser', l);
    ab.trigger(ship);
    let t = 0;
    while (!field.enemies[0].dead && t < 5) { ab.update(1 / 120, { ship, field }); t += 1 / 120; }
    return t;
  };
  check('a stronger capacitor kills faster', burn(armed, loadout) < burn(plain, {}));

  // Energy on Kill hands the charge back.
  const field = new EnemyField(lvl, terrain, 1000);
  const ship = shipAt(field.enemies[0].x + 120, field.enemies[0].y - 90, loadout);
  const ab = new Abilities('pulse-laser', loadout);
  ab.trigger(ship);
  for (let i = 0; i < 300; i++) ab.update(1 / 120, { ship, field });
  check('Energy on Kill returns the charge', ab.charges === ab.maxCharges);
}

// --- a raised shield is worth something against fire and against hazards
{
  const shield = new Abilities('ray-shield', { shieldCapacity: 1, shieldHazard: 1 });
  const ship = shipAt(500, 300);
  shield.trigger(ship);
  check('the shield raises a pool', ship.shieldActive && ship.shieldHp === ABILITY.shieldPool);
  check('harmonics widens it past radiation', ship.shieldHazard === true);
  ship.damage(10, 'shot');
  check('the pool takes the damage, not the hull', ship.hull === ship.hullMax);
  shield.update(99, { ship, field: null });
  check('it lets go cleanly', !ship.shieldActive && ship.shieldHp === 0 && ship.shieldFactor === 1);
}

// --- every active leaves the ship the way it found it
//
// **The general form of the M31 beacon leak.** A raised Sensor Pulse set
// `beaconBoost` and never put it back, and nothing had noticed because until
// M31 nothing read the field - a channel that is written and never read cannot
// be *seen* to leak, so the leak becomes a bug on the day it gets a reader.
//
// Written per-module first, which mutation-testing showed was worth nothing:
// leaving `airBrake` at 2.6 or `cloaked` at true for the rest of the mission
// raised **zero** failures. Stated as a property of every active instead, so a
// module built later is covered by a test written before it existed.
{
  // What a module is *meant* to leave behind. Everything else must come back.
  //
  // `env` is deliberately **not** on this list even though two modules write it.
  // `applyForces` owns that object and resets every channel it can produce at
  // the top of each step, so the honest test is to run one step of physics
  // after the module ends and require the ship to be back - which exercises the
  // real restoration path rather than exempting it. The first version of this
  // block exempted `env` wholesale and would have missed a module leaking a
  // channel `applyForces` does not reset.
  const KEEPS = {
    'repair-nanites': ['hull'],           // it heals; that is the whole point
    'thermal-purge': ['statusLevels'],    // it dumps the gauges and they stay dumped
  };
  const QUIET = { id: 'teardown-rig', width: 2000, hazards: [] };
  // **`null` has to be in the snapshot, and the comparison has to be over the
  // union of both sides.** The first version skipped falsy values and walked
  // only the keys it saw *before* - so a field that starts `null` and is left
  // holding an object was invisible to it, which is precisely the shape of the
  // flare's `ship.decoy`. The mutation that never lets go of a decoy raised
  // zero failures against it.
  const snapshot = (ship) => {
    const out = {};
    for (const [k, v] of Object.entries(ship)) {
      if (v === null || v === undefined) out[k] = String(v);
      else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
      else if (typeof v === 'object' && !Array.isArray(v)) out[k] = JSON.stringify(v);
    }
    return out;
  };
  for (const id of Object.keys(ACTIVE_MODULES)) {
    const mod = ACTIVE_MODULES[id];
    const ship = shipAt(500, 300);
    ship.statusLevels.heat = 40;
    ship.hull = ship.hullMax - 20;
    applyForces(ship, QUIET, 0, 1 / 120);
    const before = snapshot(ship);
    const a = new Abilities(id, { shieldCapacity: 1 });
    a.trigger(ship);
    // Run past the whole duration, one substep at a time, with nothing else in
    // the world - so anything different at the end is the module's doing.
    // Long enough for the module *and* anything it released: a flare burns for
    // the whole duration and a charge is still falling after the rack shuts.
    const world = { heightAt: () => 900, ceiling: null };
    const level = { id: 'teardown', width: 3000, gravity: 28 };
    for (let i = 0; i < (mod.duration + 6) * 120 && (a.active || a.bombs.length || a.flare); i++) {
      a.update(1 / 120, { ship, field: null, terrain: world, level });
    }
    check(`${id}: it lets go of the lander when it ends`,
      !a.active && !a.bombs.length && !a.flare);
    applyForces(ship, QUIET, 1, 1 / 120);
    const after = snapshot(ship);
    const keeps = new Set(KEEPS[id] || []);
    const stuck = [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter((k) => !keeps.has(k) && before[k] !== after[k]);
    check(`${id}: every field it wrote falls away with it`, stuck.length === 0,
      stuck.map((k) => `${k} ${before[k]} -> ${after[k]}`).join(', '));
  }
}

// --- the Optical Cloak, and the two things it has to reach
{
  const lvl = { ...MOON_LEVELS[3], enemyBudget: 1, enemySets: ['sentry-turret'] };
  const terrain = new Terrain(lvl, 1000);

  // A gun that is aiming at you stops aiming - the same path cover takes.
  {
    const field = new EnemyField(lvl, terrain, 1000);
    const e = field.enemies[0];
    const ship = shipAt(e.x + 220, e.y - 90);
    for (let i = 0; i < 600 && e.state === 'idle'; i++) field.update(1 / 120, i / 120, ship);
    check('a machine notices an uncloaked lander', e.state !== 'idle', e.state);
    const cloak = new Abilities('optical-cloak', {});
    cloak.trigger(ship);
    cloak.update(1 / 120, { ship });
    for (let i = 0; i < 300; i++) field.update(1 / 120, i / 120, ship);
    check('and loses it once the cloak is up', e.state === 'idle', e.state);
  }

  // **A drone that cannot see you must not ram you either.** Ramming never went
  // through `_sees` at all, so a cloak wired only into the sight check would
  // have left the most dangerous machine in the game behaving exactly as
  // before - the module half-built, and the mutation that proves it raised
  // zero failures until this existed.
  {
    const air = { ...MOON_LEVELS[3], enemyBudget: 1, enemySets: ['seeker-drone'] };
    const t2 = new Terrain(air, 1000);
    const droneType = ENEMY_TYPES['seeker-drone'];
    const fly = (cloaked, offset, steps) => {
      const field = new EnemyField(air, t2, 1000);
      const e = field.enemies[0];
      const homeX = e.homeX;
      const ship = shipAt(e.x + offset, e.y);
      for (let i = 0; i < steps; i++) {
        ship.cloaked = cloaked;                       // held, the way a running module holds it
        field.update(1 / 120, i / 120, ship);
      }
      return { hull: ship.hull, gap: Math.hypot(ship.x - e.x, ship.y - e.y),
        wander: Math.abs(e.x - homeX), hits: field.hitsTaken };
    };

    // **Ram range is 44 px and a drone's standoff ring is 195**, so a drone only
    // ever rams a lander that came to *it*. Parked right on top of one is the
    // only rig that exercises the path at all - the first version of this check
    // sat 60 px away, watched the drone back off to its ring, and proved
    // nothing: the mutation that lets a drone chase a cloaked lander raised
    // zero failures against it.
    const onTop = fly(false, 4, 4);
    const onTopHidden = fly(true, 4, 4);
    check('a drone rams a lander that flies into it', onTop.hull < 100, `hull ${onTop.hull}`);
    check('and never touches a cloaked one', onTopHidden.hull === 100, `hull ${onTopHidden.hull}`);

    // And the other half: it must not *shadow* you either. Ramming is the
    // consequence; being followed is the behaviour.
    const shadowed = fly(false, 420, 900);
    const unseen = fly(true, 420, 900);
    check('a drone closes on an uncloaked lander', shadowed.gap < droneType.standoff + 60,
      `${shadowed.gap.toFixed(0)} px against a ${droneType.standoff} px ring`);
    check('and goes back to its patrol against a cloaked one', unseen.gap > droneType.standoff + 120,
      `${unseen.gap.toFixed(0)} px`);
  }
}

// --- the Kinetic Bomb Rack: the three things that make it a decision
{
  const lvl = { ...MOON_LEVELS[3], enemyBudget: 2, enemySets: ['sentry-turret'], gravity: 28 };
  const terrain = new Terrain(lvl, 4242);
  const eff = ACTIVE_MODULES['bomb-rack'].effect;

  /**
   * Drop a charge from `up` px above a flat spot, with the machine moved `off`
   * px to one side of the impact point.
   *
   * **The machine is placed rather than found**, because falloff is a claim
   * about distance and real terrain makes distance the wrong number: the first
   * version dropped beside a turret wherever the generator had put it, the
   * ground under the two points differed by more than the offset, and a charge
   * that should have clipped the edge of the blast measured zero.
   */
  const drop = (off, up = 300) => {
    const field = new EnemyField(lvl, terrain, 4242);
    const e = field.enemies[0];
    const x0 = e.x;
    const groundY = terrain.heightAt(x0);
    e.x = x0 + off;
    e.y = groundY;
    const ship = shipAt(x0, groundY - up);
    const hp = e.hp;
    const hull = ship.hull;
    const a = new Abilities('bomb-rack', {});
    a.trigger(ship);
    let blast = null;
    for (let i = 0; i < 1200 && a.bombs.length; i++) {
      for (const ev of a.update(1 / 120, { ship, field, terrain, level: lvl })) {
        if (ev.kind === 'blast') blast = ev;
      }
    }
    return { dealt: hp - e.hp, selfHarm: hull - ship.hull, blast, at: { x: e.x, y: e.y } };
  };

  // **Falloff.** A blast that does full damage to the edge of its circle is a
  // radius nobody has to think about, and this raised zero failures until it
  // existed - the witness in `loadout-tests.js` only ever measured the centre.
  const centre = drop(0);
  const edge = drop(Math.round(eff.bombRadius * 0.75));
  check('a charge hurts a machine it lands on', centre.dealt > 0, `${centre.dealt.toFixed(1)}`);
  check('and hurts one at the edge of the blast far less',
    edge.dealt > 0 && edge.dealt < centre.dealt * 0.6,
    `${centre.dealt.toFixed(1)} at the centre vs ${edge.dealt.toFixed(1)} at ${Math.round(eff.bombRadius * 0.75)} px`);
  check('and nothing at all outside it', drop(eff.bombRadius + 40).dealt === 0);

  // **It goes off where it lands**, not merely when the fuse runs out. Dropped
  // from height the ground arrives long before the fuse, and a charge that fell
  // through the world and detonated on a timer would be a weapon you could not
  // aim at anything on the surface.
  //
  // Measured as "near the surface", not "on it": a charge that reaches a machine
  // first goes off on the machine, which is 65 px up on a turret and is the
  // right answer. What the check is for is a charge that fell 300 px, passed
  // everything and went off on a timer somewhere in the air.
  const drop300 = 300;
  const above = centre.blast ? centre.blast.y - terrain.heightAt(centre.blast.x) : -Infinity;
  check('a charge goes off where it arrives, not on a timer in mid-air',
    centre.blast && Math.abs(above) < drop300 * 0.4,
    centre.blast ? `${Math.abs(above).toFixed(0)} px off the surface after a ${drop300} px fall` : 'never went off');

  // The two ways a charge can arrive are separately load-bearing, and in the rig
  // above they cover for each other: over a turret standing on the ground,
  // removing *either* trigger leaves the other to catch it and the blast lands
  // in the same place. Both mutations raised zero failures until these existed.
  {
    // Empty ground, no machine anywhere near: only the surface can stop it, and
    // a charge that fell through it would go off underground and hit nothing.
    const field = new EnemyField(lvl, terrain, 4242);
    const far = field.enemies.reduce((acc, e) => Math.max(acc, e.x), 0) + 900;
    const x = Math.min(far, lvl.width - 200);
    const ship = shipAt(x, terrain.heightAt(x) - 320);
    const a = new Abilities('bomb-rack', {});
    a.trigger(ship);
    let blast = null;
    for (let i = 0; i < 1800 && a.bombs.length; i++) {
      for (const ev of a.update(1 / 120, { ship, field, terrain, level: lvl })) {
        if (ev.kind === 'blast') blast = ev;
      }
    }
    check('a charge over empty ground goes off at the surface',
      blast && blast.y - terrain.heightAt(blast.x) < 20 && blast.y - terrain.heightAt(blast.x) > -60,
      blast ? `${(blast.y - terrain.heightAt(blast.x)).toFixed(0)} px relative to the ground` : 'never went off');
  }
  {
    // And a machine in the air stops it where *it* is, hundreds of pixels above
    // any ground - which is the only rig where the contact trigger is the one
    // doing the work.
    const air = { ...MOON_LEVELS[3], enemyBudget: 1, enemySets: ['seeker-drone'], gravity: 28 };
    const t = new Terrain(air, 4242);
    const field = new EnemyField(air, t, 4242);
    const e = field.enemies[0];
    const ship = shipAt(e.x, e.y - 260);
    const a = new Abilities('bomb-rack', {});
    a.trigger(ship);
    let blast = null;
    for (let i = 0; i < 1800 && a.bombs.length; i++) {
      // Hold the drone still: what is under test is the charge, not the chase.
      e.x = ship.x; e.y = ship.y + 260;
      for (const ev of a.update(1 / 120, { ship, field, terrain: t, level: air })) {
        if (ev.kind === 'blast') blast = ev;
      }
    }
    check('and a machine in the air stops it where that machine is',
      blast && Math.abs(blast.y - e.y) < 40 && t.heightAt(blast.x) - blast.y > 120,
      blast ? `${Math.abs(blast.y - e.y).toFixed(0)} px from the drone, ${(t.heightAt(blast.x) - blast.y).toFixed(0)} px above the ground` : 'never went off');
  }

  // **It does not care whose lander it is.** The spec asks for a weapon that is
  // dangerous near a landing zone, and one that is safe to stand next to is not
  // a decision at all.
  const onTopOfIt = drop(0, 90);
  check('and it hurts the lander that dropped it, if that lander stayed put',
    onTopOfIt.selfHarm > 0, `${onTopOfIt.selfHarm.toFixed(1)} hull`);

  // The M12 muzzle rule, from the player's side: released a hand's breadth off
  // the deck, the charge is still inert when it gets there and simply goes.
  const scraped = drop(0, 12);
  check('a charge released against the ground never goes off in your lap',
    scraped.selfHarm === 0, `${scraped.selfHarm.toFixed(1)} hull`);
}

// --- the Countermeasure Flare pulls drones, and only drones
{
  const decoyAt = (e, ship) => ({ x: ship.x + 420, y: ship.y });
  // A drone leaves you for the flare...
  {
    const air = { ...MOON_LEVELS[3], enemyBudget: 1, enemySets: ['seeker-drone'] };
    const t = new Terrain(air, 1000);
    const run = (withFlare) => {
      const field = new EnemyField(air, t, 1000);
      const e = field.enemies[0];
      const ship = shipAt(e.x + 300, e.y);
      for (let i = 0; i < 480; i++) {
        ship.decoy = withFlare ? decoyAt(e, ship) : null;
        ship.hull = ship.hullMax;
        field.update(1 / 120, i / 120, ship);
      }
      return Math.hypot(e.x - ship.x, e.y - ship.y);
    };
    const chased = run(false);
    const pulled = run(true);
    check('a drone closes on a lander with no flare out', chased < 260, `${chased.toFixed(0)} px`);
    check('and goes to the flare instead when there is one', pulled > chased + 150,
      `${chased.toFixed(0)} -> ${pulled.toFixed(0)} px`);
  }
  // ...and a dug-in gun does not, which is what stops the flare being a second
  // cloak. Per the spec, it redirects drones; it does not blind a turret.
  {
    const ground = { ...MOON_LEVELS[3], enemyBudget: 1, enemySets: ['sentry-turret'] };
    const t = new Terrain(ground, 1000);
    const field = new EnemyField(ground, t, 1000);
    const e = field.enemies[0];
    const ship = shipAt(e.x + 220, e.y - 90);
    let engaged = false;
    for (let i = 0; i < 900; i++) {
      ship.decoy = { x: ship.x + 420, y: ship.y };
      ship.hull = ship.hullMax;
      field.update(1 / 120, i / 120, ship);
      if (e.state !== 'idle') engaged = true;
    }
    check('a ground gun keeps shooting at you through a flare', engaged, e.state);
  }
}

// --- the Repair Nanites, and the limitation that is half the module
{
  const ship = shipAt(500, 300);
  ship.hull = 50;
  const a = new Abilities('repair-nanites', {});
  a.trigger(ship);
  for (let i = 0; i < 120; i++) a.update(1 / 120, { ship, field: null });
  const healed = ship.hull;
  check('nanites rebuild hull while they run', healed > 50, `50 -> ${healed.toFixed(1)}`);
  // A fresh wound stops them dead, and does not undo what they already did.
  ship.damage(10, 'shot');
  const afterHit = ship.hull;
  a.update(1 / 120, { ship, field: null });
  a.update(1 / 120, { ship, field: null });
  check('a fresh hit stops them', !a.active);
  check('and what they already repaired stays repaired', ship.hull >= afterHit,
    `${afterHit} -> ${ship.hull}`);
  // And they never overfill the tank.
  const full = shipAt(500, 300);
  const b = new Abilities('repair-nanites', {});
  b.trigger(full);
  for (let i = 0; i < 600; i++) b.update(1 / 120, { ship: full, field: null });
  check('and never push past the hull maximum', full.hull === full.hullMax);
}

// --- the briefing tells the player what is out there
{
  for (const lvl of ARMED) {
    const t = describeThreats(lvl);
    check(`${lvl.id}: the briefing names its threats`, t.length > 0 && t.every((x) => x.counterplay));
  }
  check('a quiet mission briefs nothing', describeThreats(MOON_LEVELS[0]).length === 0);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
