// TERMINAL VELOCITY - state machine, camera, scoring, persistence.

import { clamp, lerp, approach, makeRng, formatScore } from './util.js';
import { keyLabel } from './input.js';
import { Terrain } from './terrain.js';
import { LEVELS, endlessLevel } from './levels.js';
import { CHAPTERS, chapterFor } from './missions.js';
import { normalizeAngle } from './ship.js';
import { LANDING } from './landing.js';

import * as Save from './save.js';
import * as Log from './gamelog.js';
import { worstVisibility } from './forces.js';
import { missionReward, addReward, scaleSalvage, settleHaul, nodeWorth, haulOf } from './economy.js';

import { isCheckpoint, isExpeditionComplete, PLANET_ORDER } from './route.js';
import { deriveFull } from './components.js';
import { deriveSkills } from './skills.js';
import { derivePassive, MOON_BLUEPRINTS, COMBAT_BLUEPRINT } from './modules.js';
import { EnemyField } from './enemies.js';
import { evaluateObjective } from './objectives.js';
import { Abilities, ABILITY } from './abilities.js';
import * as R from './render.js';
import { drawEnemies, drawBeam, drawShield } from './enemydraw.js';
import { drawHUD } from './hud.js';
import { Debug } from './debug.js';
import { spawnFor } from './spawn.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const touchbar = document.getElementById('touch');
import { audio, input, particles, ship, meta, setMeta, store, settings, saveSettings, g } from './state.js';
import { screenHTML, drawHangarPreview } from './screens.js';
import { act, wireFlow } from './actions.js';

let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = canvas.clientWidth || window.innerWidth;
  H = canvas.clientHeight || window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.compact = W < 760;
}

/** Layout can change without a resize event (device emulation, pane splits). */
function syncSize() {
  const cw = canvas.clientWidth || window.innerWidth;
  const ch = canvas.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cw !== W || ch !== H || dpr !== DPR) resize();
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ level setup

/** The mission list the current campaign draws from. */
function activeLevels() {
  if (g.chapter) return g.chapter.levels;
  const ch = CHAPTERS[g.campaign];
  return ch ? ch.levels : LEVELS;
}

/** Stable per-level salt, for numeric ids and string mission ids alike. */
function levelSeedSalt(level) {
  if (typeof level.id === 'number') return level.id * 2654435761;
  let h = 2166136261;
  for (const ch of String(level.id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h;
}

function levelFor(index) {
  if (g.chapter) return g.chapter.levels[clamp(index, 0, g.chapter.levels.length - 1)];
  const chapter = CHAPTERS[g.campaign];
  if (chapter) return chapter.levels[clamp(index, 0, chapter.levels.length - 1)];
  if (index < LEVELS.length) return LEVELS[index];
  g.endless = true;
  g.endlessN = index - LEVELS.length + 1;
  return endlessLevel(g.endlessN, makeRng(g.seed + index));
}

const FORCED_SEED = (() => {
  const m = /[?&]seed=(\d+)/.exec(location.search);
  return m ? (+m[1] | 0) : null;
})();

function startLevel(index, freshSeed = true) {
  g.token++;
  g.levelIndex = index;
  if (g.run) g.seed = g.run.seed;                 // an expedition keeps one seed
  else if (g.forcedSeed != null) g.seed = g.forcedSeed;
  else if (freshSeed) g.seed = (Math.random() * 1e9) | 0;
  const level = levelFor(index);
  g.level = level;
  g.terrain = new Terrain(level, g.seed ^ (levelSeedSalt(level) | 0));
  g.backdrop = R.buildBackdrop(level, g.terrain, g.seed);
  particles.clear();

  // Derived fresh from the saved component levels each time a mission starts,
  // so an upgrade can never be applied twice.
  const loadout = deriveFull(
    meta.componentLevels,
    deriveSkills(meta.purchasedSkills),
    derivePassive(meta.equipped && meta.equipped.passive),
  );
  ship.applyLoadout(loadout);
  g.loadout = loadout;

  // Enemies share the mission's seed, so a retry after a crash faces exactly
  // the same machines in exactly the same places.
  g.field = new EnemyField(level, g.terrain, g.seed ^ (levelSeedSalt(level) | 0));
  // A loaner, if the expedition has been given one, flies in place of whatever
  // is equipped - it is lent for the run, never added to the player's gear.
  const activeId = (g.run && g.run.loaner) || (meta.equipped && meta.equipped.active);
  g.abilities = new Abilities(activeId, loadout);
  if (g.run) {
    g.run.attempts = g.run.attempts || {};
    const key = level.missionId || level.id;
    g.run.attempts[key] = (g.run.attempts[key] || 0) + 1;
  }
  if (!g.field.empty) {
    // Counts missions flown against hostile systems. Its job is the Combat tree
    // gate - anything above zero means something has shot at this pilot.
    meta.stats.threatsSeen++;
    Save.saveMeta(meta);
  }

  const start = spawnFor(level, g.terrain);
  const sx = start.x;
  const sy = start.y;
  ship.reset(sx, sy, Math.round(level.fuel * (loadout.fuelCapacity || 1)));
  ship.vx = start.vx;
  ship.vy = start.vy;

  g.levelTime = 0;
  g.combatSalvage = 0;
  // What the hold is carrying. Material is picked up now rather than awarded,
  // so this is the mission's reward accumulating in the world, and it is lost
  // with the lander like any other cargo.
  g.carried = { material: 0, salvage: 0, nodes: 0 };
  g.gearCued = false;
  g.warn = { low: false, crit: false, dry: false, heat: false, cold: false, radiation: false, corrosion: false, charge: false };
  g.cam.x = sx;
  g.cam.y = sy;
  g.cam.scale = 0.8;
  g.cam.trauma = 0;
  g.freeze = 0;
  setState('brief');
}

/** Start a fresh expedition: three shuttles, one seed, five missions. */
function beginExpedition(startId = null) {
  // M25: the ladder is linear and a run always starts at its foot. Losing an
  // expedition puts you back here, at the Moon, with the hangar you built.
  //
  // God mode is the one exception, and the flag is re-read here rather than
  // trusted from the caller - the chapters screen only offers other bodies when
  // it is on, but a stale button or a console call must not be able to skip
  // eight bodies on a real save.
  const wanted = meta.godMode && startId && PLANET_ORDER.includes(startId) ? startId : PLANET_ORDER[0];
  const position = PLANET_ORDER.indexOf(wanted);
  const seed = g.forcedSeed != null ? g.forcedSeed : (Math.random() * 1e9) | 0;
  g.run = Save.newRun(wanted, seed);
  // Starting part-way down means the run has to *look* like it got there, or
  // the trail, the sector depth and the completion check all disagree with the
  // screen. The sector is the ladder position, and the chapter seed is the one
  // the route handler would have used arriving here normally, so a god-mode
  // Titan is the same Titan a real run would have been dealt.
  const sector = position + 1;
  if (position > 0) {
    g.run.cleared = PLANET_ORDER.slice(0, position);
    g.run.chaptersCleared = position;
    g.run.visited = [...g.run.cleared, wanted];
    g.run.sector = sector;
  }
  g.chapter = chapterFor(wanted, position > 0 ? seed + sector * 101 : seed, sector);
  g.campaign = wanted;
  g.endless = false;
  g.score = 0; g.combo = 0; g.newRecord = false;
  g.lives = g.run.shuttles;
  Save.saveRun(g.run);
  startLevel(0, false);
}

/**
 * The ladder is finished. Bank the last haul, record that the game has been
 * carried to its end (which is what opens mission select), and release the run.
 */
/**
 * Settle the haul into permanent banked resources and empty it. The `id` stamp
 * is what stops a reload between the write and the payout paying twice.
 * Returns what was settled, for the screen that reports it.
 */
function settleAndBank() {
  const run = g.run;
  const settled = settleHaul(run.haul, { completed: true });
  setMeta(Save.bankRun(meta, run, { completed: true, settled, id: `sector-${run.sector}` }));
  run.haul = { salvageSafe: 0, salvageCargo: 0, data: 0, cores: 0, materials: {} };
  Save.saveRun(run);
  Save.saveMeta(meta);
  Log.log('banked', {
    salvage: settled.salvage || 0, data: settled.data || 0, cores: settled.cores || 0,
    total: meta.banked.salvage, totalData: meta.banked.data,
  });
  // What was just settled, kept for the screen that reports it. The supply stop
  // cannot read `run.haul` for this: banking happens on the way *in* (M25b), so
  // by the time the checkpoint renders the haul is empty by design and a table
  // driven off it prints zeroes at a player who is holding thousands.
  g.lastSettled = settled;
  return settled;
}

function finishExpedition() {
  const run = g.run;
  const settled = settleAndBank();
  run.score = g.score;
  Save.saveRun(run);
  // The whole ladder, Moon to Venus. One diamond, kept for good - the first
  // thing in the game that is neither spent nor lost, and what the ship
  // cosmetics will be bought with when they arrive.
  meta.diamonds = (meta.diamonds || 0) + 1;
  g.lastRunSummary = {
    missions: run.missionsCleared, chapter: run.chapterId, settled, complete: true,
    bodies: (run.cleared || []).length, diamond: true, diamonds: meta.diamonds,
  };
  if (!meta.gameCompleted) meta.gameCompleted = true;
  Save.saveMeta(meta);
  Save.clearRun();
  g.run = null;
  g.loadoutWindow = false;
  Log.log('expedition-complete', {
    missions: run.missionsCleared, bodies: (run.cleared || []).length, diamonds: meta.diamonds,
  });
  setState('expedition-complete');
}

/** Pick an interrupted expedition back up exactly where it stopped. */
function resumeExpedition() {
  const run = Save.loadRun();
  if (!run) { setState('chapters'); return; }
  g.run = run;
  g.chapter = chapterFor(run.chapterId, run.seed, run.sector);
  g.campaign = run.chapterId;
  g.endless = false;
  g.score = run.score;
  g.combo = run.combo;
  g.lives = run.shuttles;
  // **Not `g.forcedSeed = run.seed`.** That line was redundant and leaky:
  // `startLevel` already prefers `g.run.seed` whenever a run is in flight, so it
  // bought nothing - and `g.forcedSeed` is the *debug* pin (`?seed=`,
  // `__setSeed`), which nothing ever clears. Resuming an expedition once
  // therefore pinned every later run in the session to that run's seed, so the
  // whole ladder replayed identical terrain until the page was reloaded. That is
  // the M26 complaint - "the terrain does not feel random" - surviving
  // underneath M26's fix.
  startLevel(run.missionIndex, false);
}

function persistRun() {
  // Stats belong to permanent progress, so they are written whether or not an
  // expedition is in flight - otherwise a reload loses them.
  Save.saveMeta(meta);
  if (!g.run) return;
  g.run.score = g.score;
  g.run.combo = g.combo;
  g.run.shuttles = g.lives;
  g.run.missionIndex = g.levelIndex;
  Save.saveRun(g.run);
}

function launch() {
  setState('play');
  audio.unlock();
  // An attempt is a mission actually flown, not a mission looked at.
  meta.stats.attempts++;
  const lv = g.level || {};
  Log.log('mission-start', {
    mission: lv.id, planet: lv.planet || g.campaign, seed: g.seed,
    sector: g.run ? g.run.sector : 0, shuttles: g.lives,
    fuel: ship.fuel, hull: ship.hull, gravity: lv.gravity,
    // The worst visibility this mission reaches, not the ship's current one:
    // no force has run at launch, so ship.env still reads the default 1.
    visWorst: worstVisibility(lv),
    machines: g.field && !g.field.empty ? g.field.summary().total : 0,
    active: (meta.equipped && meta.equipped.active) || '', passive: (meta.equipped && meta.equipped.passive) || '',
  });
  const active = meta.equipped && meta.equipped.active;
  if (active) meta.stats.moduleFlights[active] = (meta.stats.moduleFlights[active] || 0) + 1;
  const passive = meta.equipped && meta.equipped.passive;
  if (passive) meta.stats.moduleFlights[passive] = (meta.stats.moduleFlights[passive] || 0) + 1;
  Save.saveMeta(meta);
}

// ------------------------------------------------------------------ simulation

const FIXED = 1 / 120;
let acc = 0;

function simulate(dt) {
  g.levelTime += dt;
  acc += dt;
  let steps = 0;
  while (acc >= FIXED && steps < 8) {
    acc -= FIXED;
    steps++;
    const ev = ship.step(FIXED, input, g.level, g.terrain, g.levelTime, settings);
    // The legs touching is its own moment, and it happens before the grader has
    // decided anything - so it gets its own sound.
    if (ship.touchdown && !g.gearCued) {
      g.gearCued = true;
      audio.gearContact(Math.abs(ship.touchdown.vy) / 40);
      const feet = ship.feet();
      particles.dust(feet[0].x, g.terrain.heightAt(feet[0].x), 5, 0.5);
      particles.dust(feet[1].x, g.terrain.heightAt(feet[1].x), 5, 0.5);
    }
    if (ev === 'land') return onLand();
    if (ev === 'crash') return onCrash();
    if (combat(FIXED)) return onCrash();
    pickups();
  }
}

/**
 * Enemies and the active module, on the same fixed step as the physics. Returns
 * true if the lander was lost - hull damage is a crash like any other, and it
 * goes through the same path so shuttles, rewards and the save all agree.
 */
function combat(dt) {
  const events = [];
  if (g.field) events.push(...g.field.update(dt, g.levelTime, ship));
  if (g.abilities) events.push(...g.abilities.update(dt, { ship, field: g.field, terrain: g.terrain, level: g.level }));
  for (const e of events) combatEffect(e);
  if (ship.hull <= 0 && ship.alive && !ship.landed) {
    ship.alive = false;
    ship.contact = { x: ship.x, y: ship.y };
    return true;
  }
  return false;
}

/** Turn one combat event into light and noise. Nothing here changes the sim. */
function combatEffect(e) {
  switch (e.kind) {
    case 'telegraph':
      audio.warn('lock');
      break;
    case 'fire':
      audio.enemyShot();
      particles.sparks(e.x, e.y, 5, 0);
      break;
    case 'hit':
      if (e.absorbed > 0 && e.damage <= 0) {
        audio.shieldHit();
        particles.ring(e.x, e.y, 60, 0.25, '#7ef2d0');
      } else {
        audio.warn('hull');
        particles.sparks(e.x, e.y, 14, 0);
        particles.text(ship.x, ship.y - 44, `-${Math.round(e.damage)} HULL`, '#ff3b5c', 16);
        g.cam.trauma = Math.min(1, g.cam.trauma + 0.35);
        meta.stats.hitsTaken++;
        Log.log('hit', { damage: Math.round(e.damage), hull: ship.hull, alt: Math.round(g.terrain ? g.terrain.heightAt(ship.x) - ship.y : 0) });
      }
      break;
    case 'ram':
      audio.warn('hull');
      particles.explode(e.x, e.y, 0, 0, []);
      particles.sparks(e.x, e.y, 20, 0);
      g.cam.trauma = Math.min(1, g.cam.trauma + 0.5);
      meta.stats.hitsTaken++;
      Log.log('rammed', { hull: ship.hull });
      break;
    case 'spark':
      particles.sparks(e.x, e.y, 4, 0);
      break;
    case 'kill': {
      audio.enemyDown();
      particles.sparks(e.x, e.y, 26, 0);
      particles.ring(e.x, e.y, 150, 0.4, '#ffb347');
      // Destroying a machine pays salvage. It is never required, and never
      // enough on its own to replace a landing.
      const bonus = Math.round(e.reward * ((g.loadout && g.loadout.salvageBonus) || 1));
      particles.text(e.x, e.y - 24, `+${bonus} SALVAGE`, '#ffb347', 17);
      g.combatSalvage = (g.combatSalvage || 0) + bonus;
      meta.stats.threatsDestroyed++;
      Log.log('kill', { salvage: bonus });
      break;
    }
    case 'shield-down':
      audio.shieldHit();
      particles.ring(ship.x, ship.y, 90, 0.3, '#7ef2d0');
      break;
    default:
      break;
  }
}

function pickups() {
  // One rule, in the terrain, shared with the test pilot - it used to live here
  // where nothing could test it, and the fuel road depends on it being the same
  // rule in both places.
  for (const got of g.terrain.collect(ship.x, ship.y)) {
    if (got.kind === 'cargo') {
      particles.sparks(got.x, got.y, 26, 1);
      particles.ring(got.x, got.y, 180, 0.5, '#ff4fd8');
      particles.text(got.x, got.y - 24, `${got.label} RECOVERED`, '#ff4fd8', 19);
      audio.arpeggio([659.25, 880, 1046.5], 0.06);
      continue;
    }
    if (got.kind === 'material') {
      const worth = nodeWorth(got.tier);
      g.carried.material += worth.material;
      g.carried.salvage += worth.salvage;
      g.carried.nodes++;
      particles.sparks(got.x, got.y, 24, 1);
      particles.ring(got.x, got.y, 150, 0.45, MATERIAL_TINT);
      particles.text(got.x, got.y - 22, `+${nodeWorth(got.tier).material} MATERIAL`, MATERIAL_TINT, 19);
      audio.arpeggio([523.25, 698.46], 0.05);
      continue;
    }
    ship.fuel = Math.min(ship.maxFuel, ship.fuel + FUEL_CELL);
    particles.sparks(got.x, got.y, 22, 1);
    particles.ring(got.x, got.y, 140, 0.4, '#ffb347');
    particles.text(got.x, got.y - 20, `+${FUEL_CELL} FUEL`, '#ffb347', 18);
    audio.pickup();
  }
}

/** What one cell on the fuel road is worth. */
const FUEL_CELL = 22;

/** The one colour material is drawn and announced in, everywhere. */
export const MATERIAL_TINT = '#c9a4ff';

function effects(dt) {
  // Exhaust + ground interaction
  if (ship.alive && !ship.landed) {
    if (ship.thrusting) {
      const n = ship.nozzle();
      particles.exhaust(n.x, n.y, -ship.noseX, -ship.noseY, ship.throttle);
      const gy = g.terrain.heightAt(ship.x);
      const alt = gy - ship.y;
      if (alt < 130) {
        const amount = Math.round(lerp(4, 0, alt / 130));
        particles.dust(ship.x - ship.noseX * 20, gy, amount, 1);
      }
      g.cam.trauma = Math.min(1, g.cam.trauma + dt * 0.35);
    }
    if (ship.rcsLeft || ship.rcsRight) {
      const side = ship.rcsLeft ? 1 : -1;
      const p = ship.toWorld(side * 12, -6);
      particles.rcs(p.x, p.y, side * Math.cos(ship.angle), side * Math.sin(ship.angle));
    }
  }
  // Fuel callouts - the tank draining is the real clock, so it gets a voice.
  if (ship.alive && !ship.landed) {
    const f = ship.fuel / ship.maxFuel;
    const call = (key, at, text, color, warning) => {
      if (g.warn[key] || f > at) return;
      g.warn[key] = true;
      audio.warn(warning);
      particles.text(ship.x, ship.y - 46, text, color, 18);
    };
    call('low', 0.25, 'FUEL 25%', '#ffb347', 'fuel-low');
    call('crit', 0.1, 'FUEL CRITICAL', '#ff3b5c', 'fuel-critical');
    call('dry', 0, 'TANKS DRY', '#ff3b5c', 'dry');

    // Status warnings, once per crossing rather than once per frame.
    const st = ship.statusLevels || {};
    const status = (key, value, text, color) => {
      if (value < 60) { g.warn[key] = false; return; }
      if (g.warn[key]) return;
      g.warn[key] = true;
      audio.warn(key);
      particles.text(ship.x, ship.y - 62, text, color, 17);
    };
    status('heat', st.heat || 0, 'ENGINE HEAT', '#ff3b5c');
    status('cold', st.cold || 0, 'COLD SOAK', '#5ff5ff');
    status('radiation', st.radiation || 0, 'RADIATION', '#ffb347');
    status('corrosion', st.corrosion || 0, 'CORROSION', '#c8f04d');
    status('charge', st.charge || 0, 'MAGNETIC FIELD', '#9db4ff');
  }

  audio.engines(ship.thrusting && !ship.landed, (ship.rcsLeft || ship.rcsRight) && !ship.landed);
  audio.laser(!!(g.abilities && g.abilities.beam));
  if (g.level.wind || g.level.gust) audio.setWind(Math.abs(ship.windNow || 0) / 60);
  else audio.setWind(0);
}

function camera(dt) {
  const groundY = g.terrain.heightAt(ship.x);
  const alt = Math.max(0, groundY - ship.y);
  const targetScale = g.compact
    ? clamp(lerp(1.05, 0.62, clamp((alt - 120) / 620, 0, 1)), 0.62, 1.05)
    : clamp(lerp(1.35, 0.72, clamp((alt - 120) / 620, 0, 1)), 0.72, 1.35);
  g.cam.scale = approach(g.cam.scale, targetScale, 2.2, dt);

  const look = ship.landed ? 0 : 0.42;
  let tx = ship.x + ship.vx * look;
  let ty = ship.y + ship.vy * look - 40;

  const halfW = W / 2 / g.cam.scale;
  const halfH = H / 2 / g.cam.scale;
  if (g.level.width > halfW * 2) tx = clamp(tx, halfW, g.level.width - halfW);
  else tx = g.level.width / 2;
  const topLimit = -120;
  const botLimit = g.level.height - 40;
  if (botLimit - topLimit > halfH * 2) ty = clamp(ty, topLimit + halfH, botLimit - halfH);
  else ty = (topLimit + botLimit) / 2;

  g.cam.x = approach(g.cam.x, tx, 7, dt);
  g.cam.y = approach(g.cam.y, ty, 7, dt);
  g.cam.trauma = Math.max(0, g.cam.trauma - dt * 1.4);
}

// ------------------------------------------------------------------ outcomes

function onLand() {
  const q = ship.quality;
  Debug.recordTouchdown({
    result: 'LAND', quality: q, vy: ship.vy, vx: ship.vx,
    tiltDeg: normalizeAngle(ship.angle) * 57.2958, onPad: !ship.offPad, seed: g.seed,
  });
  const pad = ship.pad;
  const offPad = ship.offPad;
  const surfaceY = pad ? pad.y : g.terrain.heightAt(ship.x);
  const mult = pad ? pad.mult : 1;
  const feet = ship.feet();
  particles.dust(feet[0].x, surfaceY, 12, 0.7);
  particles.dust(feet[1].x, surfaceY, 12, 0.7);
  particles.ring(ship.x, surfaceY, 220, 0.45, '#5ff5ff');
  if (q === 'HARD') particles.sparks(ship.x, surfaceY, 16, 0);
  g.cam.trauma = Math.min(1, g.cam.trauma + (q === 'HARD' ? 0.6 : 0.28));
  ship.restOnPad(g.terrain);
  if (pad) pad.used = true;
  audio.silence();
  audio.touchdown(offPad ? 'HARD' : q);

  const qf = LANDING.quality[q];
  const landing = Math.round(100 * mult * qf);
  const fuelPts = Math.floor(ship.fuel) * 2;
  // Only a clean pad landing extends the streak.
  g.combo = q === 'HARD' || offPad ? Math.max(1, g.combo) : g.combo + 1;
  const comboMult = Math.min(3, 1 + 0.25 * Math.max(0, g.combo - 1));
  const total = Math.round((landing + fuelPts) * comboMult);
  g.score += total;

  particles.text(ship.x, surfaceY - 70, `${offPad ? 'OFF PAD' : q}  +${formatScore(total)}`,
    offPad ? '#ffb347' : q === 'PERFECT' ? '#4dff9f' : q === 'GOOD' ? '#5ff5ff' : '#ffb347', 26);

  // Judge the optional objective from a plain snapshot of the flight.
  const objective = evaluateObjective(g.level, {
    grade: q,
    onPad: !offPad,
    centreFrac: ship.landingResult ? ship.landingResult.centerFrac : 1,
    fuelFrac: ship.maxFuel > 0 ? ship.fuel / ship.maxFuel : 0,
    hullLost: ship.hullMax > 0 ? (ship.hullMax - ship.hull) / ship.hullMax : 0,
    abilityUses: g.abilities ? g.abilities.used : 0,
    // Every status channel, not just radiation. M29 authors objectives against
    // heat, cold, corrosion and charge, and a channel that is not in this
    // snapshot reads as 0 - which is an objective that is always met, the
    // quietest way for content to be wrong.
    radiation: ship.statusLevels ? ship.statusLevels.radiation : 0,
    heat: ship.statusLevels ? ship.statusLevels.heat : 0,
    cold: ship.statusLevels ? ship.statusLevels.cold : 0,
    corrosion: ship.statusLevels ? ship.statusLevels.corrosion : 0,
    charge: ship.statusLevels ? ship.statusLevels.charge : 0,
    elapsed: g.levelTime || 0,
    cargoTaken: g.terrain.cargoTaken,
  });
  g.lastObjective = objective;

  g.lastResult = {
    q, offPad, mult, qf, landing, fuelPts, comboMult, total, objective,
    fuel: ship.fuel, time: g.levelTime,
    detail: ship.landingResult || null,
    combat: g.field && !g.field.empty ? g.field.summary() : null,
    combatSalvage: g.combatSalvage || 0,
    carried: { ...g.carried },
    materialLeft: g.terrain.materialLeft ? haulOf(g.terrain.materialLeft()) : null,
    hull: Math.round(ship.hull), hullMax: ship.hullMax,
    abilityUsed: g.abilities ? g.abilities.used : 0,
  };
  store.setBest(g.level.id, total);
  if (g.score > store.high) { g.newRecord = true; store.high = g.score; }
  if (!g.endless && g.campaign === 'classic') store.unlocked = g.levelIndex + 2;

  if (g.run) {
    g.run.missionsCleared++;
    const left = haulOf(g.terrain.materialLeft ? g.terrain.materialLeft() : []);
    const reward = missionReward({
      grade: q, padMultiplier: mult, fuelLeft: ship.fuel, maxFuel: ship.maxFuel,
      rareMaterial: g.level.rareMaterial, offPad,
      // A first clear pays 24 research against 10 for a repeat, and this was
      // hardcoded `true`. Inside an expedition that is harmless - each mission
      // is flown once - but mission select, which `meta.gameCompleted` unlocks,
      // let the same mission pay first-clear research forever. `missionGrades`
      // is the existing record of what has been landed, and `recordFlight`
      // writes it *after* this, so it still reads the previous state here.
      firstClear: !meta.stats.missionGrades[g.level.missionId || g.level.id],
      coreDrought: g.run.coreDrought || 0,
      padTier: pad ? pad.tier || 0 : 0,
      // The hold, and what was left lying out there - the results screen shows
      // both, because "what you did not take" is the interesting half.
      carried: {
        ...g.carried,
        leftMaterial: left.material, leftSalvage: left.salvage, leftNodes: left.nodes,
      },
    });
    g.run.coreDrought = reward.cores ? 0 : (g.run.coreDrought || 0) + 1;
    if (reward.pityCore) particles.text(ship.x, ship.y - 92, 'TECH CORE RECOVERED', '#5ff5ff', 20);
    const bonus = (g.loadout && g.loadout.salvageBonus) || 1;
    reward.salvage = Math.round(reward.salvage * bonus) + (g.combatSalvage || 0);
    // The objective pays on top, and only when it was actually met.
    if (objective && objective.reward) {
      reward.salvage += objective.reward.salvage || 0;
      reward.data += objective.reward.data || 0;
      reward.cores += objective.reward.cores || 0;
    }
    // **Every source is summed by now** - the computed pay, the ore carried
    // home, the kill bonus and the objective - so the economy-wide scale goes
    // on here, once, rather than on each of the four. The results screen reads
    // `reward.salvage` too, so what is shown is what is banked.
    reward.salvage = scaleSalvage(reward.salvage);
    g.run.haul = addReward(g.run.haul, reward);
    g.lastReward = reward;
    persistRun();
  }
  meta.stats.landings++;
  if (q === 'PERFECT') meta.stats.perfect++;
  {
    const r = ship.landingResult || {};
    Log.log('landed', {
      mission: g.level && g.level.id, grade: q,
      vy: r.vy, vx: r.vx, tilt: r.tiltDeg != null ? r.tiltDeg : r.tilt,
      onPad: !!r.onPad, mult: r.mult, fuel: ship.fuel, hull: ship.hull,
      carried: g.carried ? g.carried.length : 0,
    });
  }
  // The weapon arrives once you have survived a mission that shot at you, not
  // a whole chapter later. M15 armed twelve of fifteen missions, so the old
  // timing meant meeting drones on Europa 2 with nothing to answer them and no
  // sign the game intended you to have anything - which is what Tom hit.
  if (g.field && !g.field.empty && g.field.summary().shotsFired > 0
      && !meta.unlockedBlueprints.includes(COMBAT_BLUEPRINT)) {
    meta.unlockedBlueprints = [...meta.unlockedBlueprints, COMBAT_BLUEPRINT];
    // **And it is fitted, not just filed** (M29, Tom's call).
    //
    // Both of his playtest crashes were on the Moon, body 1, flown stock and
    // unarmed - bodies 2, 3 and 4 cost him nothing at all. The blueprint timing
    // was not the problem: M16 already hands the weapon over the moment a
    // mission shoots at you, which on the Moon is after moon-2. The *loadout*
    // was. It is closed for the length of an expedition (M16) and opens only at
    // a supply stop, so the weapon recovered on moon-2 could not be equipped
    // until the Moon was already cleared - it arrived one whole body after the
    // three missions it was for.
    //
    // Fitting it here closes that gap without reopening the loadout mid-run,
    // which would undo M16's rule that an expedition is committed once begun.
    // It only ever fills an **empty** slot: a player who chose an active module
    // keeps the one they chose, because overwriting a deliberate choice with a
    // helpful default is worse than the gap this fixes.
    // It takes effect on the *next* mission, because `Abilities` is built once
    // per mission from `meta.equipped` and this runs at touchdown. That is the
    // right moment anyway - a lander does not grow a laser during a landing -
    // and it is what makes moon-3 the first mission flown armed.
    const fitted = !meta.equipped.active;
    if (fitted) meta.equipped = { ...meta.equipped, active: COMBAT_BLUEPRINT };
    Save.saveMeta(meta);
    particles.text(ship.x, ship.y - 128,
      fitted ? 'WEAPON RECOVERED AND FITTED' : 'WEAPON BLUEPRINT RECOVERED', '#5ff5ff', 20);
  }
  recordFlight(q);
  if (!g.run) Save.saveMeta(meta);

  g.freeze = 0.75;
  settleAfter(950, () => {
    const last = g.levelIndex >= activeLevels().length - 1;
    if (!g.endless && last) {
      if (g.run) {
        // **Shuttles attrit** (M27, Tom's decision 4). A cleared body returns
        // *one* shuttle, capped at the expedition maximum - it does not restore
        // the run to full. Over three bodies that distinction barely showed;
        // over ten it is the whole attrition curve, because a full restore at
        // every supply stop is effectively thirty lives.
        g.lives = Math.min(g.run.maxShuttles, g.lives + 1);
        // Blueprint guarantee: finishing a first chapter hands over an active
        // module, so no route can ever demand gear the player was never offered.
        if (!MOON_BLUEPRINTS.some((id) => meta.unlockedBlueprints.includes(id))) {
          const grant = MOON_BLUEPRINTS[0];
          meta.unlockedBlueprints = [...meta.unlockedBlueprints, grant];
          meta.equipped = { ...meta.equipped, active: meta.equipped.active || grant };
          Save.saveMeta(meta);
          particles.text(ship.x, ship.y - 110, 'BLUEPRINT RECOVERED', '#5ff5ff', 22);
        }
        // Clearing a body that had hostile systems on it hands over the weapon.
        // Surviving them is the requirement, not destroying them - the laser
        // cannot be the reward for owning a laser.
        if (meta.stats.threatsSeen > 0 && !meta.unlockedBlueprints.includes(COMBAT_BLUEPRINT)) {
          meta.unlockedBlueprints = [...meta.unlockedBlueprints, COMBAT_BLUEPRINT];
          Save.saveMeta(meta);
          particles.text(ship.x, ship.y - 140, 'WEAPON BLUEPRINT RECOVERED', '#ff4fd8', 20);
        }
        g.run.chaptersCleared++;
        const body = g.level.planet || g.campaign;
        // Farming a body again must not add it twice, or the ladder thinks it
        // is further along than it is.
        g.run.cleared = Array.isArray(g.run.cleared) ? g.run.cleared : [];
        if (!g.run.cleared.includes(body)) g.run.cleared.push(body);
        meta.stats.bodies[body] = (meta.stats.bodies[body] || 0) + 1;
        g.run.shuttles = g.lives;
        persistRun();
        // M25: the expedition ends *here*, where clearing the last body on the
        // ladder is actually known - not on the next route screen. Leaving it
        // to the route handler meant finishing Europa dropped you onto three
        // "replay to farm" cards with no next body, and the win only fired once
        // you clicked one of them.
        if (isExpeditionComplete(g.run.cleared)) { finishExpedition(); return; }
        // The supply stop after every body. **Bank on the way in.** M25a banked
        // in the route handler instead - that is, when the player *left* the
        // stop by choosing the next body - so the hangar and the loadout opened
        // on a pot that was still empty and filled up behind them once they had
        // gone. Tom cleared the Moon, opened the hangar, and it read 0 salvage
        // while his log header read 300. Pay first, then open the doors.
        if (isCheckpoint(g.run.chaptersCleared)) {
          settleAndBank();
          // The supply stop does *not* refill the rack. It used to set
          // `g.lives = maxShuttles` here, one line after the +1 above, which
          // made the +1 dead code and every stop a full restore. M27 removes
          // it: what you carry down the ladder is what you have left.
          g.run.shuttles = g.lives;
          g.loadoutWindow = true;
          persistRun();
          setState('checkpoint');
          return;
        }
        g.loadoutWindow = false;
        setState('route');
        return;
      }
      if (g.level && (g.chapter || CHAPTERS[g.campaign])) {
        const body = g.level.planet || g.campaign;
        meta.stats.bodies[body] = (meta.stats.bodies[body] || 0) + 1;
        Save.saveMeta(meta);
      }
      setState('victory');
    } else setState('result');
  });
}

/**
 * The pending settle: what a landing or a crash resolves into once its freeze
 * has played out. Held rather than fired-and-forgotten so that `__settleNow`
 * can run **the real thing** instead of a copy of it.
 *
 * That distinction cost this session an hour. `__settleNow` used to reimplement
 * the decision - `setState(g.levelIndex === LEVELS.length - 1 ? 'victory' :
 * 'result')` - and it had gone stale: `LEVELS` is the twelve *classic* missions,
 * so on an expedition it sent every landing to the result screen and silently
 * skipped banking, the blueprint grants and the whole chapter-clear branch. A
 * scripted five-mission Moon run landed all five and reported `cleared=[]`,
 * which reads exactly like a broken ladder and is not one.
 *
 * The same class of fault as M23's autopilot copy and M24's assertions that
 * encoded constants: a second implementation of a rule, drifting behind the
 * first. There is one settle now, and the hook runs it early rather than
 * imitating it.
 */
let pendingSettle = null;

function settleAfter(ms, work) {
  const tok = g.token;
  const run = () => {
    if (tok !== g.token) return;
    pendingSettle = null;
    work();
  };
  pendingSettle = run;
  setTimeout(() => { if (pendingSettle === run) run(); }, ms);
}

/**
 * The logbook. Everything the statistics screen shows is accumulated here, in
 * one place, so a new figure never means hunting through the state machine for
 * the four places a mission can end.
 */
function recordFlight(grade) {
  const st = meta.stats;
  st.fuelBurned += Math.max(0, ship.maxFuel - ship.fuel);
  st.fuelCarried += ship.maxFuel;
  st.flightSeconds += g.levelTime;
  const id = g.level.missionId || g.level.id;
  const order = { HARD: 1, GOOD: 2, PERFECT: 3 };
  if (grade && (order[grade] || 0) > (order[st.missionGrades[id]] || 0)) st.missionGrades[id] = grade;
  if (g.field && !g.field.empty) {
    // A threat left alive behind you was still beaten - flying past one is the
    // counterplay the design is built around, so it is counted like a kill.
    st.threatsPassed += g.field.live.length;
  }
  const active = meta.equipped && meta.equipped.active;
  if (active && g.abilities && g.abilities.used) {
    st.moduleUses[active] = (st.moduleUses[active] || 0) + g.abilities.used;
  }
}

function onCrash() {
  Debug.recordTouchdown({
    result: 'CRASH', quality: null, vy: ship.vy, vx: ship.vx,
    tiltDeg: normalizeAngle(ship.angle) * 57.2958, onPad: false, seed: g.seed,
  });
  const c = ship.contact || { x: ship.x, y: ship.y };
  particles.explode(c.x, c.y, ship.vx, ship.vy, ship.shards());
  g.cam.trauma = 1;
  ship.alive = false;
  g.combo = 0;
  audio.silence();
  audio.explosion();
  g.lives--;
  meta.stats.crashes++;
  Log.log('crash', {
    mission: g.level && g.level.id, reason: (ship.landingResult && ship.landingResult.blocker) || g.crashReason || 'impact',
    vy: ship.vy, vx: ship.vx, hull: ship.hull, fuel: ship.fuel, shuttles: g.lives,
  });
  recordFlight(null);
  if (g.run) persistRun(); else Save.saveMeta(meta);
  g.freeze = 0.12;
  settleAfter(1400, () => {
    if (g.lives <= 0 && g.run) {
      // Expedition over: bank what was gathered, then release the run.
      const settled = settleHaul(g.run.haul, { completed: false, recovered: (g.loadout && g.loadout.cargoRecovery) || 0 });
      g.lastRunSummary = { missions: g.run.missionsCleared, chapter: g.run.chapterId, settled };
      g.run.score = g.score;
      setMeta(Save.bankRun(meta, g.run, { completed: false, settled, id: 'final' }));
      // Persist the stamp before the payout, so a reload in between cannot pay
      // the same settlement a second time.
      Save.saveRun(g.run);
      Save.saveMeta(meta);
      // M24: the run is the roguelike unit. Banking above still records the
      // score and the bests - those are the logbook, not progress - and then
      // the death takes the skills, the resources and the opened map. What the
      // hangar built survives, which is the whole of the trade.
      g.lastRunSummary.wiped = true;
      Log.log('run-lost', { sector: g.run.sector, missions: g.run.missionsCleared, chapters: g.run.chaptersCleared });
      // **The debrief is paid on the way out, after the wipe.** M13 built it as
      // the anti-frustration floor - "a run that ends badly still ends with a
      // decision" - and M24 made death empty `meta.banked`. The two met and
      // nobody noticed: the floor was banked and then zeroed on the next line.
      // Measured at the top of M28: banked 60/40, then 0/0. It has not paid out
      // since M24, and M27 removed replay, so it is now the *only* income a run
      // that dies early leaves behind.
      setMeta(Save.wipeForDeath(meta, { debrief: settled.debrief }));
      if (settled.debrief) Log.log('debrief', { salvage: settled.debrief.salvage, data: settled.debrief.data });
      Save.saveMeta(meta);
      Save.clearRun();
      g.run = null;
      g.loadoutWindow = false;
      setState('expedition-over');
      return;
    }
    setState(g.lives <= 0 ? 'gameover' : 'crash');
  });
}

// ------------------------------------------------------------------ loop

/**
 * One simulation step, independent of rendering and of the clock. Split out of
 * the frame loop so tests can drive the game headlessly - requestAnimationFrame
 * does not fire in a hidden tab, and a tight loop runs a mission in
 * milliseconds instead of half a minute.
 */
function advance(dt) {
  g.time += dt;
  if (g.state === 'play') {
    if (g.freeze > 0) g.freeze = Math.max(0, g.freeze - dt);
    else simulate(dt);
    effects(dt);
  } else {
    audio.silence();
  }
  if (g.level) {
    particles.update(dt, g.terrain);
    if (g.state !== 'paused') camera(dt);
  }
}

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05);
  Debug.sample(dt);
  syncSize();
  advance(dt);
  draw();
  requestAnimationFrame(frame);
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!g.level) {
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, W, H);
    drawMenuBackdrop();
    return;
  }
  const cam = g.cam;
  R.drawBackground(ctx, W, H, cam, g.level, g.backdrop, g.time);

  // Screen shake is presentation, never simulation: turning it down changes
  // how the camera reports a hit, not what the hit did.
  const t2 = cam.trauma * cam.trauma * (settings.shake != null ? settings.shake : 1);
  const sx = (Math.random() - 0.5) * 26 * t2;
  const sy = (Math.random() - 0.5) * 26 * t2;

  ctx.save();
  ctx.translate(W / 2 + sx, H / 2 + sy);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);

  const present = { flash: settings.flash, contrast: !!settings.highContrast };
  R.drawTerrain(ctx, cam, W, H, g.terrain, g.level, g.time, present);
  // Wind, drawn between the ground and the ship so it reads as air moving
  // through the scene rather than as an overlay on top of it.
  if (g.level.wind || g.level.gust) R.drawWind(ctx, cam, W, H, g.level, ship.windNow, g.time, present);
  // The radiation belt sits between the ground and the ship for the same reason
  // the wind does: it is air, not an overlay.
  R.drawRadiation(ctx, cam, W, H, g.terrain, ship, g.time);
  // Vents, fountains, sinking air and magnetic anomalies. In the world with the
  // wind and the belt, for the same reason: they are things in the air, not an
  // overlay on it.
  R.drawPlacedHazards(ctx, cam, W, H, g.terrain, ship, g.time);
  if (g.state === 'play' && ship.alive && !ship.landed) R.drawTrajectory(ctx, ship, g.level, g.terrain, cam);
  particles.draw(ctx);
  drawEnemies(ctx, g.field, ship, g.time, {
    ...present,
    threatWarning: !!(g.loadout && g.loadout.threatWarning),
    showPaths: Debug.showEnemyPaths,
  });
  R.drawShip(ctx, ship, g.time, cam);
  if (g.abilities) drawBeam(ctx, g.abilities.beam, g.time);
  drawShield(ctx, ship, ABILITY.shieldPool * ((g.loadout && g.loadout.shieldCapacity) || 1), g.time);
  particles.drawTexts(ctx);
  ctx.restore();

  // Dust and darkness sit over the world but under the pad beacons and the HUD.
  // Two channels, deliberately: dust tints toward the body's own dust colour
  // and darkness subtracts toward black, so a body can be hazy, dark, both or
  // neither. Pluto was the case that forced them apart - it was drawn as fog
  // because low visibility was the only way to say "you cannot see".
  const vis = ship.env ? ship.env.visibility : 1;
  const dark = ship.env ? (ship.env.darkness || 0) : 0;
  const onScreen = {
    x: W / 2 + (ship.x - cam.x) * cam.scale,
    y: H / 2 + (ship.y - cam.y) * cam.scale,
  };
  if (dark > 0.02) R.drawDarkness(ctx, W, H, g.level, dark, g.time, onScreen);
  if (vis < 0.985 || dark > 0.02) {
    // The storm closes in around the lander, so it needs to know where the
    // lander is on screen rather than assuming the middle of the viewport.
    if (vis < 0.985) R.drawDust(ctx, W, H, g.level, vis, g.time, onScreen);
    // The beacons answer to whichever is hiding more of the world, so a dark
    // body gets the same "you always have a target" guarantee a stormy one has.
    const hidden = Math.max(1 - vis, dark);
    R.drawPadBeacons(ctx, cam, W, H, g.terrain, g.level, g.time, hidden, present);
    R.drawMaterialBeacons(ctx, cam, W, H, g.terrain, g.time, hidden, present);
  }

  if (g.state === 'play' || g.state === 'paused') {
    drawHUD(ctx, W, H, g);
  }
  Debug.draw(ctx, W, H, g);
  // Dim the world behind any overlay screen.
  if (g.state !== 'play') {
    ctx.fillStyle = 'rgba(3,5,10,0.62)';
    ctx.fillRect(0, 0, W, H);
  }
}

// Simple drifting starfield behind the main menu before a level exists.
const menuStars = Array.from({ length: 160 }, () => ({
  x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.3, s: Math.random() * 0.02 + 0.004,
}));
function drawMenuBackdrop() {
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#05060c');
  grd.addColorStop(1, '#0b1226');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
  for (const s of menuStars) {
    s.x -= s.s * 0.004;
    if (s.x < 0) s.x += 1;
    ctx.fillStyle = `rgba(190,225,255,${0.2 + s.r * 0.35})`;
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ------------------------------------------------------------------ screens

function setState(s) {
  g.state = s;
  renderOverlay();
  touchbar.classList.toggle('hidden', s !== 'play');
}

/**
 * Say no, out loud. Several actions are now refused rather than silently
 * ignored - the hangar during an expedition, a mid-mission restart - and a
 * button that does nothing when you press it reads as a broken button.
 */
function toast(message) {
  // In flight the overlay is hidden, so a refusal has to be said in the world
  // instead - otherwise pressing R mid-mission looks like a dead key.
  if (g.state === 'play' && ship.alive) {
    particles.text(ship.x, ship.y - 74, message.toUpperCase(), '#ffb347', 15);
    return;
  }
  g.notice = message;
  clearTimeout(g.noticeTimer);
  g.noticeTimer = setTimeout(() => { g.notice = null; renderOverlay(); }, 3200);
  renderOverlay();
}

function renderOverlay() {
  const s = g.state;
  if (s === 'play') {
    overlay.className = 'hidden';
    overlay.innerHTML = '';
    return;
  }
  overlay.className = '';
  // Several screens read `g.level`, and a timer can fire into a state where it
  // is already null: the settle timers guard against that with `g.token`, but
  // the 3.2 s toast timer re-renders whatever state is current when it expires
  // and has no such guard. Rather than add a fourth guard and hope it is the
  // last one, a screen that cannot render falls back to the menu - the same
  // rule the save loader follows, that the game must never present a blank
  // screen because of one bad value. It is logged rather than swallowed, so a
  // playtest still reports it instead of hiding it.
  let html;
  try {
    html = screenHTML(s);
  } catch (err) {
    Log.log('screen-failed', { screen: s, error: String(err && err.message) });
    g.level = null;
    g.state = 'menu';
    html = screenHTML('menu');
  }
  overlay.innerHTML = (g.notice ? `<div class="toast">${g.notice}</div>` : '') + html;
  if (g.state === 'hangar') drawHangarPreview();
}

/** The large lander in the hangar, redrawn whenever the selection changes. */

// ------------------------------------------------------------------ actions

overlay.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (b && !b.disabled) act(b.dataset.action);
});

// keyboard shortcuts per screen
input.bind(' ', () => {
  const s = g.state;
  if (s === 'menu') act(Save.loadRun() ? 'resume-run' : 'chapters');
  else if (s === 'brief') act('launch');
  else if (s === 'result' || s === 'victory') act('next');
  else if (s === 'crash') act('retry');
  else if (s === 'expedition-over') act('chapters');
  else if (s === 'gameover') act('restart');
  else if (s === 'help' || s === 'select' || s === 'chapters') act('back');
});
input.bind('enter', () => input.onPress.get(' ')());
input.bind('r', () => {
  if (['play', 'paused', 'result', 'crash'].includes(g.state)) act('retry');
});
const pause = () => {
  if (g.state === 'play') { audio.silence(); setState('paused'); }
  else if (g.state === 'paused') setState('play');
};
input.bind('p', pause);
input.bind('escape', () => {
  // While a control is listening for its new key, escape cancels the listening
  // rather than the screen - otherwise the one key everybody presses to back
  // out of a mistake throws away the whole rebinding session.
  if (g.state === 'keys' && g.rebinding) { g.rebinding = null; renderOverlay(); return; }
  if (g.state === 'play' || g.state === 'paused') pause();
  else if (g.state !== 'menu') act('menu');
});
input.bind('f3', () => { Debug.toggle(); });
input.bind('`', () => { Debug.toggle(); });
input.bind('f4', () => { Debug.showEnvelope = !Debug.showEnvelope; });
input.bind('f5', () => { Debug.showEnemyPaths = !Debug.showEnemyPaths; });
/** Fire the equipped active module. */
const useAbility = () => {
  if (g.state !== 'play' || !g.abilities) return;
  if (g.abilities.trigger(ship)) {
    audio.arpeggio([880, 1174.66], 0.05, 'triangle', 0.11);
    particles.ring(ship.x, ship.y, 120, 0.35, '#7ef2d0');
  } else if (g.abilities.equipped) {
    audio.blip(180, 0.06, 'square', 0.06);
  }
};
input.bindAction('ability', useAbility);
// While the CONTROLS screen is listening, the next key press lands on the
// selected control instead of doing whatever it normally does.
input.bind('*', (key) => {
  if (g.state !== 'keys' || !g.rebinding) return;
  const action = g.rebinding;
  const next = input.rebind(action, key);
  if (!next) {
    g.rebindNote = `${keyLabel(key)} is reserved for the interface. Pick another key.`;
  } else {
    settings.keys = next;
    g.rebindNote = null;
    saveSettings();
  }
  g.rebinding = null;
  renderOverlay();
});

input.bind('m', () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  if (g.state !== 'play') renderOverlay();
});

// touch controls
input.bindTouchButton(document.getElementById('t-left'), 'left');
input.bindTouchButton(document.getElementById('t-thrust'), 'thrust');
input.bindTouchButton(document.getElementById('t-right'), 'right');
document.getElementById('t-hold') && input.bindTouchButton(document.getElementById('t-hold'), 'hold');
const abilityBtn = document.getElementById('t-ability');
if (abilityBtn) abilityBtn.addEventListener('pointerdown', (ev) => { ev.preventDefault(); useAbility(); });

window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

wireFlow({ startLevel, launch, beginExpedition, resumeExpedition, persistRun, setState, toast, renderOverlay });

if (FORCED_SEED != null) g.forcedSeed = FORCED_SEED;
setState('menu');
requestAnimationFrame(frame);

// expose for debugging / automated tests
window.__game = g;
window.__ship = ship;
window.__act = act;
window.__input = input;
window.__settings = settings;
window.__debug = Debug;
/** Dev: rebuild the current mission with a given terrain archetype. */
window.__preview = (archetype, relief = 260, detail = 1) => {
  const lvl = g.level || LEVELS[0];
  g.level = { ...lvl, terrain: { archetype, relief, detail } };
  g.terrain = new Terrain(g.level, g.seed ^ (g.level.id * 2654435761));
  g.backdrop = R.buildBackdrop(g.level, g.terrain, g.seed);
  particles.clear();
  const best = g.terrain.pads.reduce((a, b) => (b.mult > a.mult ? b : a), g.terrain.pads[0]);
  const mid = (best.x1 + best.x2) / 2;
  ship.reset(clamp(mid - g.level.width * 0.18, 140, g.level.width - 140), g.level.height * 0.14, g.level.fuel);
  g.cam.x = ship.x; g.cam.y = ship.y; g.cam.scale = 0.62;
  setState('play');
  return { archetype, pads: g.terrain.pads.map((p) => [Math.round(p.x1), Math.round(p.x2), Math.round(p.y), p.kind, +p.slope.toFixed(3)]), rocks: g.terrain.rocks.length };
};

/** Dev: jump straight to any mission of any chapter, for testing content. */
// Mission *number*, 1-5, which is what the name says and what the architecture
// note documents. It took a 0-based index, so `__goMission('EUROPA', 2)` gave
// you Europa 3 and every hand-check aimed one mission past the target.
window.__goMission = (chapterId, mission = 1) => {
  const index = Math.max(0, (mission | 0) - 1);
  g.run = null;
  g.chapter = chapterFor(chapterId, g.forcedSeed != null ? g.forcedSeed : 1, 1);
  g.campaign = chapterId;
  g.endless = false;
  g.score = 0; g.lives = 3; g.combo = 0; g.newRecord = false;
  startLevel(index, g.forcedSeed == null);
  return { mission: g.level.id, enemies: g.field.enemies.length };
};

/** Dev: the live enemy field, and a way to fire the module from a test. */
window.__field = () => g.field;
// The playtest log as text, for pasting straight out of the console. The same
// trace the settings screen copies and exports.
window.__log = () => Log.asText(meta);
window.__logJSON = () => Log.asJSON(meta);
window.__logClear = () => Log.clearLog();
window.__setState = (name) => { setState(name); return g.state; };   // drive any screen in a test
window.__audio = audio;   // so a test can count what actually gets played
window.__useAbility = () => (g.abilities ? g.abilities.trigger(ship) : false);

window.__setSeed = (n) => { g.forcedSeed = n == null ? null : (n | 0); return g.forcedSeed; };
window.__advance = advance;
window.__draw = () => { syncSize(); draw(); return { w: W, h: H, state: g.state }; };

/** Resolve a pending landing/crash immediately, for headless tests. */
window.__settleNow = () => {
  // Runs the settle that is actually pending, immediately - it does not decide
  // anything itself. See `settleAfter` for why that matters.
  if (pendingSettle) pendingSettle();
  return g.state;
};

/** Opened by the macOS app's Settings menu item (Cmd-,). */
window.__openSettings = () => {
  if (g.state === 'play') { audio.silence(); g.settingsFrom = 'paused'; }
  else g.settingsFrom = g.state;
  setState('settings');
};
