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
        if (!field) break;
        const range = (this.mod.effect.laserRange || ABILITY.laserRange);
        const t = field.target(ship, range);
        if (!t) break;
        this.target = t;
        this.beam = { x1: ship.x, y1: ship.y, x2: t.x, y2: t.y };
        const dps = (this.mod.effect.laserDps || ABILITY.laserDps) * (this.loadout.weaponPower || 1);
        const reward = field.damageEnemy(t, dps * dt);
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
