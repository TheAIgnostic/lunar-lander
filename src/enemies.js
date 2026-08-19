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
  losSamples: 26,
  hoverMin: 170,           // drone patrol altitude above the surface
  hoverMax: 300,
  maxShots: 24,            // hard cap; old shots are culled first
  placementTries: 260,
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
    telegraph: 1.25,       // aim locks and is drawn for this long before firing
    cooldown: 3.0,
    leadFactor: 0.75,      // deliberately imperfect prediction
    shot: { speed: 200, damage: 10, radius: 5, life: 5.5, drift: 0.5 },
    reward: 26,
    counterplay: 'Put terrain between you, or fly inside its arc.',
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
    telegraph: 1.0,
    cooldown: 2.6,
    leadFactor: 0.6,
    ram: { range: 44, damage: 16 },
    shot: { speed: 255, damage: 8, radius: 4, life: 4, drift: 0.35 },
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
  return pads.reduce((a, b) => {
    if (b.mult !== a.mult) return b.mult < a.mult ? b : a;
    return (b.x2 - b.x1) > (a.x2 - a.x1) ? b : a;
  }, pads[0]);
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
  const safe = sanctuaryPad(terrain);
  const gates = safe ? sanctuaryGates(safe) : null;
  const margin = 180;
  const out = [];

  for (let tries = 0; tries < COMBAT.placementTries && out.length < budget; tries++) {
    const type = ENEMY_TYPES[sets[out.length % sets.length]];
    const x = rng.range(margin, level.width - margin);
    const ground = terrain.heightAt(x);
    const roof = terrain.ceiling ? terrain.ceilingAt(x) : -Infinity;

    let y;
    if (type.kind === 'ground') {
      if (Math.abs(terrain.slopeAt(x)) > 0.5) continue;             // no gun on a cliff face
      if (terrain.padAt(x)) continue;
      y = ground - type.radius;
      if (terrain.ceiling && y - roof < 120) continue;              // no room to stand
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
    if (!clear) continue;
    if (Math.hypot(x - start.x, y - start.y) < COMBAT.spawnSafeRadius) continue;

    // The sanctuary must stay out of reach: no point in the corridor a lander
    // descends through may sit inside this machine's engagement range.
    if (gates) {
      const reach = type.range + COMBAT.sanctuaryMargin;
      if (gates.some((p) => Math.hypot(x - p.x, y - p.y) < reach)) continue;
    }
    if (out.some((e) => Math.hypot(e.x - x, e.y - y) < COMBAT.minSpacing)) continue;

    const e = makeEnemy(type, x, y, out.length, rng);
    if (type.kind === 'air') e.hover = ground - y;
    out.push(e);
  }
  return out;
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
      if (!e.dead) this._stepEnemy(e, dt, t, target, events);
    }
    this._stepShots(dt, target, events);
    return events;
  }

  _stepEnemy(e, dt, t, ship, events) {
    const type = typeOf(e);
    if (type.kind === 'air') this._moveDrone(e, type, dt, ship, events);

    const seen = ship ? this._sees(e, type, ship) : null;
    e.alert = clamp(e.alert + (seen ? dt * 2.5 : -dt * 1.2), 0, 1);

    if (e.state === 'idle') {
      if (seen) { e.state = 'track'; e.timer = 0; }
      return;
    }

    if (e.state === 'track') {
      e.timer += dt;
      if (!seen) { if (e.timer > 1.2) { e.state = 'idle'; e.timer = 0; } return; }
      // Turn toward where the lander will be, at a rate slow enough to shake.
      const lead = this._leadPoint(e, type, ship);
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
        this._fire(e, type, ship, events);
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
      radius: type.shot.radius,
      drift: type.shot.drift,
      life: type.shot.life,
      from: e.id,
    });
    if (this.shots.length > COMBAT.maxShots) this.shots.shift();
    this.shotsFired++;
    events.push({ kind: 'fire', enemy: e, x: px, y: py, dir });
  }

  _moveDrone(e, type, dt, ship, events) {
    const terrain = this.terrain;
    let tx;
    let ty;
    if (ship && Math.hypot(ship.x - e.x, ship.y - e.y) < type.range * 1.3) {
      // Hold a standoff ring around the lander rather than flying into it.
      const dx = e.x - ship.x;
      const dy = e.y - ship.y;
      const d = Math.hypot(dx, dy) || 1;
      tx = ship.x + (dx / d) * type.standoff;
      ty = ship.y + (dy / d) * type.standoff - 30;
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

    const speed = ship ? type.chase : type.cruise;
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
      e.dead = true;
      e.state = 'dead';
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
        const res = ship.damage(p.damage, 'shot');
        this.hitsTaken++;
        events.push({ kind: 'hit', x: p.x, y: p.y, damage: p.damage, absorbed: res.absorbed, destroyed: res.destroyed });
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
    e.dead = true;
    e.state = 'dead';
    this.kills++;
    return typeOf(e).reward;
  }

  /** Everything the results screen needs, without exposing the live objects. */
  summary() {
    return {
      total: this.enemies.length,
      kills: this.kills,
      shotsFired: this.shotsFired,
      hitsTaken: this.hitsTaken,
      suppressed: this.suppressed,
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
