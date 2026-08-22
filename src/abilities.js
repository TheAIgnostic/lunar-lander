// The active-module runtime (roadmap section 11).
//
// Until now an active module was something you equipped and never used: the
// data existed, the trigger did not. Enemies are what forced the issue - a
// counterplay you cannot press is not counterplay - so this milestone gives
// every active the same shape: charges, a duration, a cooldown, and an effect
// the simulation reads while it runs.
//
// Nothing here draws or plays anything. It reports what it did and the game
// decides how that looks and sounds.

import { clamp } from './util.js';
import { ACTIVE_MODULES } from './modules.js';

export const ABILITY = {
  // px. **Read against what it has to answer, not on its own.** At 430 every
  // machine in the game outranged it - drone 520, turret 560, sniper 640 - so
  // the moment one was shooting at you the counterplay was out of reach, and
  // pressing it spent a charge, played the success chime and did nothing. Tom
  // met that as "a green circle but no laser" and it was not a controller bug.
  // 520 is the drone's own commitment range: you can answer the machine that
  // closes on you, and the turret and the sniper still outreach you, so closing
  // the distance stays the price of using it. Measured over 6,400 flights - dry
  // presses 20% -> 8%, the way home +3 of 800, the prize route +17. Asserted
  // against the machine ranges in `enemies-tests.js`, so it cannot drift back.
  laserRange: 520,
  laserDps: 26,
  shieldPool: 26,       // damage a raised shield absorbs before it collapses
  purgeBlind: 0.35,     // how far visibility drops while the vents are open
  // How far the Twin-Link arc reaches from the machine it is already burning.
  //
  // **Set from a measurement, the way `laserRange` had to be after M30a.** The
  // first cut was 260 - half the beam's own reach, which sounded like "nearby"
  // and was not: measured over 664 machines across every mission, the distance
  // to the *nearest* other machine has a median of 455 px, and a 260 px arc
  // finds a second target for only **12%** of them. It changed nothing in any
  // flown mission on any body, which is how the number was caught.
  //
  // 460 is the median. It chains about half the time, which is the spec's "can
  // chain to a nearby machine" rather than "always hits two" - and it stays
  // well inside the beam's own 520 px reach, so the arc can never find
  // something the laser could not simply have targeted instead. Both bounds are
  // asserted in `enemies-tests.js` against the constants they answer.
  twinLinkReach: 460,
};

/**
 * One equipped active module, for the length of one mission. Charges do not
 * regenerate: the decision is when to spend them, not whether to hold them.
 */
export class Abilities {
  constructor(activeId, loadout = {}) {
    const mod = ACTIVE_MODULES[activeId] || null;
    this.id = mod ? mod.id : null;
    this.mod = mod;
    this.charges = mod ? mod.charges : 0;
    this.maxCharges = this.charges;
    this.duration = mod ? mod.duration : 0;
    this.cooldownLength = mod ? mod.cooldown : 0;
    this.remaining = 0;
    this.cooldown = 0;
    this.active = false;
    this.used = 0;
    this.loadout = loadout;
    this.target = null;      // what the laser is burning, for the renderer
    this.beam = null;
    this.arc = null;         // and where Twin-Link carried it on to
    // **Ordnance outlives the module that released it.** A bomb in the air and
    // a flare on the ground are world objects, so they are stepped whether or
    // not the module is still `active` - the rack is empty the instant you
    // press it and the charge has a whole second of falling still to do. Held
    // here rather than in the enemy field for the same reason the beam is: the
    // thing that fired it owns it, and `render.js` draws it off this object.
    this.bombs = [];
    this.flare = null;
  }

  get equipped() { return !!this.mod; }
  get name() { return this.mod ? this.mod.name : ''; }
  get ready() { return !!this.mod && !this.active && this.cooldown <= 0 && this.charges > 0; }

  /** Why the module will not fire - so the HUD can say so rather than sit dead. */
  get blocker() {
    if (!this.mod) return 'NO MODULE';
    if (this.active) return null;
    if (this.charges <= 0) return 'SPENT';
    if (this.cooldown > 0) return 'CHARGING';
    return null;
  }

  /** Spend a charge. Returns true if the module actually came on. */
  trigger(ship) {
    if (!this.ready || !ship || !ship.alive || ship.landed) return false;
    this.charges--;
    this.used++;
    this.active = true;
    this.remaining = this.duration;
    // A shield is a pool, not a timer: the duration caps it, damage empties it.
    if (this.id === 'ray-shield') {
      ship.shieldHp = ABILITY.shieldPool * (this.loadout.shieldCapacity || 1);
      ship.shieldActive = true;
      ship.shieldFactor = this.mod.effect.hazardShield || 0.15;
      // Shield Harmonics is what widens the barrier from radiation alone to
      // heat and cold as well; without it the shield is a radiation answer.
      ship.shieldHazard = (this.loadout.shieldHazard || 0) > 0;
    }
    // A rack drops the moment it is pressed; the charge does the rest on its own.
    // Released below the hull and carrying the lander's own momentum, because a
    // bomb that ignored the velocity it was dropped at would land somewhere the
    // player had no way to predict.
    if (this.id === 'bomb-rack') {
      const e = this.mod.effect;
      this.bombs.push({
        x: ship.x, y: ship.y + 18,
        vx: ship.vx, vy: ship.vy + 40,
        fuse: e.bombFuse != null ? e.bombFuse : 2.4,
        arm: e.bombArm != null ? e.bombArm : 0.35,
        radius: e.bombRadius || 150,
        damage: e.bombDamage || 0,
        age: 0,
      });
    }
    // A flare is dropped the same way and burns for the module's duration.
    if (this.id === 'countermeasure-flare') {
      this.flare = { x: ship.x, y: ship.y + 16, vx: ship.vx * 0.4, vy: ship.vy + 30,
        life: this.duration, grounded: false };
    }
    // Nanites are interrupted by a fresh wound, so they have to know what the
    // hull was when they started. Read at the trigger rather than each step,
    // because the thing being watched for is damage *since you pressed it*.
    if (this.id === 'repair-nanites') this.watchHull = ship.hull;
    // A purge is instantaneous: it dumps heat and cold the moment it fires.
    if (this.id === 'thermal-purge') {
      const f = this.mod.effect.purgeStatus || 0.7;
      for (const k of Object.keys(ship.statusLevels || {})) {
        ship.statusLevels[k] = ship.statusLevels[k] * (1 - f);
      }
    }
    return true;
  }

  /**
   * One fixed step. `ctx` carries the ship and, when the mission has any, the
   * enemy field. Returns events the game can turn into light and sound.
   */
  update(dt, ctx) {
    const events = [];
    if (!this.mod) return events;
    const ship = ctx.ship;
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    // Ordnance first, and outside the `active` branch: a charge already falling
    // must keep falling after the rack has closed.
    if (this.bombs.length) this._stepBombs(dt, ctx, events);
    if (this.flare) this._stepFlare(dt, ctx, events);

    if (this.active) {
      this.remaining -= dt;
      // A shield that has absorbed its pool drops early, and says so.
      if (this.id === 'ray-shield' && ship.shieldHp <= 0) {
        this.remaining = 0;
        events.push({ kind: 'shield-down' });
      }
      if (this.remaining <= 0) {
        this.active = false;
        this.remaining = 0;
        this.cooldown = this.cooldownLength;
        this.target = null;
        this.beam = null;
        this.arc = null;
        if (this.id === 'ray-shield') {
          ship.shieldActive = false;
          ship.shieldHp = 0;
          ship.shieldHazard = false;
          ship.shieldFactor = 1;
        }
        if (this.id === 'magnetic-anchor') ship.anchor = 1;
        // **Every field an active writes has to fall away with it**, and the
        // M31 beacon leak is why this is a list rather than a habit: a channel
        // that is written and never read cannot be seen to leak, so the moment
        // one gets a reader the leak becomes a bug. `airBrake` is read by two
        // forces and `cloaked` by every machine on the map.
        if (this.id === 'aero-brake') ship.airBrake = 1;
        if (this.id === 'optical-cloak') ship.cloaked = false;
        // The flare keeps burning past the module's own window only if it is
        // still alight; `_stepFlare` owns `ship.decoy` and clears it when the
        // light goes out. Nothing to undo here, and saying so is the point -
        // the teardown list is read as the complete answer to "what did this
        // module leave on the lander".

        // The pulse's beacon gain has to fall away with it. It never did,
        // because until M31 nothing read `beaconBoost` at all - a channel that
        // is written and never read cannot be seen to leak. Now that the pad
        // markers cash it in, a fired pulse would otherwise light the beacons
        // for the rest of the mission on one charge.
        if (this.id === 'sensor-pulse') { ship.beaconBoost = 1; ship.revealed = false; }
        events.push({ kind: 'ability-off', id: this.id });
        return events;
      }
      this._applyWhileActive(dt, ctx, events);
    }
    return events;
  }

  _applyWhileActive(dt, ctx, events) {
    const { ship, field } = ctx;
    switch (this.id) {
      case 'sensor-pulse':
        // Burns through dust and darkness, and paints anything hostile. The
        // reveal level is the module's own declared effect rather than a 1
        // written here, so the data and the behaviour cannot drift apart.
        ship.env.visibility = Math.max(ship.env.visibility, this.mod.effect.revealVisibility || 1);
        ship.beaconBoost = this.mod.effect.beacon || 1;
        ship.revealed = true;
        break;
      case 'thermal-purge':
        ship.env.visibility = Math.min(ship.env.visibility, ABILITY.purgeBlind);
        break;
      case 'magnetic-anchor':
        ship.anchor = this.mod.effect.anchorGrip || 1;
        break;
      case 'ray-shield':
        ship.shieldActive = true;
        break;
      case 'aero-brake':
        // The atmosphere and the glide both read this. In a vacuum both are
        // zero already, so the foil is exactly as useless as the spec says.
        ship.airBrake = this.mod.effect.brakeDrag || 1;
        break;
      case 'repair-nanites': {
        // Interrupted by a fresh wound, per the spec: the nanites are knitting
        // plate and a new hole stops them. Everything already lost stays
        // repaired - it ends the burst, it does not undo it.
        if (ship.hull < (this.watchHull != null ? this.watchHull : ship.hull)) {
          this.remaining = 0;
          events.push({ kind: 'repair-interrupted' });
          break;
        }
        const before = ship.hull;
        ship.hull = Math.min(ship.hullMax, ship.hull + (this.mod.effect.repairPerSecond || 0) * dt);
        this.watchHull = ship.hull;
        if (ship.hull > before) events.push({ kind: 'repairing', amount: ship.hull - before });
        break;
      }
      case 'optical-cloak':
        ship.cloaked = true;
        // Burning gives you away. Charged against the *throttle* rather than
        // switched on `thrusting`, so a key and a trigger cost what they
        // actually command instead of the module being a pad-only feature.
        this.remaining -= (this.mod.effect.cloakDrain || 0) * (ship.throttle || 0) * dt;
        break;
      case 'pulse-laser': {
        // Auto-tracking, short-ranged and time-limited: it answers a threat
        // without turning the lander into a gunship.
        this.beam = null;
        this.target = null;
        this.arc = null;
        if (!field) break;
        const range = (this.mod.effect.laserRange || ABILITY.laserRange);
        const t = field.target(ship, range);
        if (!t) break;
        this.target = t;
        this.beam = { x1: ship.x, y1: ship.y, x2: t.x, y2: t.y };
        const dps = (this.mod.effect.laserDps || ABILITY.laserDps) * (this.loadout.weaponPower || 1);
        const reward = field.damageEnemy(t, dps * dt);
        // Twin-Link Control. The arc is found from the *target* rather than
        // from the lander, because what the skill describes is the beam jumping
        // between two machines that are near each other - not the weapon
        // acquiring a second one of its own.
        const link = this.loadout.twinLink || 0;
        if (link > 0) {
          let second = null;
          let best = ABILITY.twinLinkReach;
          for (const other of field.enemies) {
            if (other === t || other.dead) continue;
            const d = Math.hypot(other.x - t.x, other.y - t.y);
            if (d < best) { best = d; second = other; }
          }
          if (second) {
            this.arc = { x1: t.x, y1: t.y, x2: second.x, y2: second.y };
            const chained = field.damageEnemy(second, dps * link * dt);
            if (chained) events.push({ kind: 'kill', enemy: second, reward: chained, x: second.x, y: second.y });
          } else {
            this.arc = null;
          }
        }
        if (reward) {
          events.push({ kind: 'kill', enemy: t, reward, x: t.x, y: t.y });
          // Energy on Kill returns the charge, so clearing a threat pays for
          // the tool that cleared it.
          if ((this.loadout.energyOnKill || 0) > 0) {
            this.charges = Math.min(this.maxCharges, this.charges + 1);
            events.push({ kind: 'charge-returned' });
          }
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * **Player ordnance, under the M12 telegraph discipline.**
   *
   * That rule says a machine must show you the shot before it takes it, and
   * `muzzleIsSafe` says a shot may never appear already touching the lander.
   * Turned on the player's own weapon it means three things, and all three are
   * here rather than in the renderer, because a rule drawn but not enforced is
   * decoration:
   *
   *  1. **It cannot go off inside you.** For `arm` seconds the charge is inert:
   *     it does not detonate on contact and it damages nothing. That is the
   *     whole of `muzzleIsSafe` from the other side.
   *  2. **It goes off where you can see it will.** The blast is a circle at the
   *     charge's own position, and `render.js` draws that circle growing as the
   *     fuse burns - so "am I clear of it" is a question with an answer on the
   *     screen rather than a number in a file.
   *  3. **It does not care whose lander it is.** The same falloff applies to
   *     the ship as to a machine. A weapon that is safe to stand next to is not
   *     a decision, and the spec asks for one that is dangerous near a pad.
   */
  _stepBombs(dt, ctx, events) {
    const { ship, field, terrain, level } = ctx;
    const gravity = (level && level.gravity) || 0;
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.age += dt;
      b.vy += gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const armed = b.age >= b.arm;
      b.armed = armed;
      const ground = terrain ? terrain.heightAt(b.x) : Infinity;
      const hitGround = b.y >= ground;
      const outside = level && (b.x < 0 || b.x > level.width);
      // An unarmed charge that reaches the ground is simply gone - it never
      // becomes a blast the player had no time to read.
      if (!armed) { if (hitGround || outside) this.bombs.splice(i, 1); continue; }
      let boom = hitGround || outside || b.age >= b.fuse + b.arm;
      if (!boom && field) {
        for (const e of field.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - b.x, e.y - b.y) < 26) { boom = true; break; }
        }
      }
      if (!boom) continue;
      this.bombs.splice(i, 1);
      const hits = [];
      if (field) {
        for (const e of field.enemies) {
          if (e.dead) continue;
          const d = Math.hypot(e.x - b.x, e.y - b.y);
          if (d > b.radius) continue;
          const reward = field.damageEnemy(e, b.damage * (1 - d / b.radius));
          if (reward) {
            events.push({ kind: 'kill', enemy: e, reward, x: e.x, y: e.y });
            if ((this.loadout.energyOnKill || 0) > 0) {
              this.charges = Math.min(this.maxCharges, this.charges + 1);
              events.push({ kind: 'charge-returned' });
            }
          }
          hits.push(e);
        }
      }
      let selfHarm = 0;
      if (ship && ship.alive) {
        const d = Math.hypot(ship.x - b.x, ship.y - b.y);
        if (d < b.radius) {
          selfHarm = b.damage * (1 - d / b.radius);
          ship.damage(selfHarm, 'blast');
        }
      }
      events.push({ kind: 'blast', x: b.x, y: b.y, radius: b.radius,
        hits: hits.length, selfHarm });
    }
  }

  /**
   * The flare. It falls, it sticks where it lands, and while it burns it is
   * what a drone flies at instead of you - published on `ship.decoy`, which is
   * the same channel `ship.cloaked` uses: a field on the lander that the
   * machines read, so `enemies.js` learns nothing about modules.
   */
  _stepFlare(dt, ctx, events) {
    const { ship, terrain, level } = ctx;
    const f = this.flare;
    f.life -= dt;
    if (!f.grounded) {
      f.vy += ((level && level.gravity) || 0) * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const ground = terrain ? terrain.heightAt(f.x) : Infinity;
      if (f.y >= ground) { f.y = ground; f.grounded = true; f.vx = 0; f.vy = 0; }
    }
    if (f.life <= 0) {
      this.flare = null;
      if (ship) ship.decoy = null;
      events.push({ kind: 'flare-out' });
      return;
    }
    if (ship) {
      ship.decoy = { x: f.x, y: f.y };
      // And it lights the ground it is lying on. Presentation only, and the one
      // half of this module no autopilot in this project can measure.
      const lit = this.mod.effect.flareLight || 0;
      if (lit && ship.env) ship.env.darkness = Math.max(0, (ship.env.darkness || 0) - lit);
    }
  }

  /** Everything the HUD needs, as plain numbers. */
  readout() {
    return {
      id: this.id,
      name: this.name,
      charges: this.charges,
      maxCharges: this.maxCharges,
      active: this.active,
      remaining: this.remaining,
      duration: this.duration,
      cooldown: this.cooldown,
      cooldownLength: this.cooldownLength,
      fraction: this.active
        ? clamp(this.remaining / Math.max(0.001, this.duration), 0, 1)
        : (this.cooldown > 0 ? 1 - clamp(this.cooldown / Math.max(0.001, this.cooldownLength), 0, 1) : 1),
      blocker: this.blocker,
    };
  }
}
