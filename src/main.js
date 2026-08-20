// TERMINAL VELOCITY - state machine, camera, scoring, persistence.

import { clamp, lerp, approach, makeRng, formatScore, DEG } from './util.js';
import { Audio } from './audio.js';
import { Input, ACTIONS, keyLabel } from './input.js';
import { Terrain } from './terrain.js';
import { LEVELS, endlessLevel, WORLDS } from './levels.js';
import { CHAPTERS, chapterFor, chapterTitle } from './missions.js';
import { Particles } from './particles.js';
import { Ship, ENVELOPE, normalizeAngle, DEFAULT_SETTINGS } from './ship.js';
import { LANDING, capsFor } from './landing.js';
import { PLANETS, gravityFor } from './planets.js';
import * as Save from './save.js';
import { missionReward, addReward, settleHaul } from './economy.js';
import { planetIcon } from './planeticons.js';
import { routeOffers, SECTORS, isExpeditionComplete, isCheckpoint } from './route.js';
import { COMPONENTS, COMPONENT_IDS, deriveFull, purchaseCheck, purchase } from './components.js';
import { TREES, TREE_IDS, deriveSkills, skillCheck, buySkill } from './skills.js';
import { ACTIVE_MODULES, PASSIVE_MODULES, derivePassive, recommendedFor, MOON_BLUEPRINTS, STARTER_PASSIVES, COMBAT_BLUEPRINT, moduleById } from './modules.js';
import { EnemyField, describeThreats } from './enemies.js';
import { evaluateObjective, cargoFor } from './objectives.js';
import { Abilities, ABILITY } from './abilities.js';
import * as R from './render.js';
import { Debug } from './debug.js';
import { spawnFor } from './spawn.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const touchbar = document.getElementById('touch');

const audio = new Audio();
const input = new Input();
const particles = new Particles();
const ship = new Ship();

const loaded = Save.loadMeta();
let meta = loaded.meta;
meta.equipped = meta.equipped || { active: null, passive: STARTER_PASSIVES[0] };
meta.unlockedBlueprints = meta.unlockedBlueprints && meta.unlockedBlueprints.length
  ? meta.unlockedBlueprints : [...STARTER_PASSIVES];
const saveSource = loaded.source;

const store = {
  get high() { return meta.classic.high; },
  set high(v) { meta.classic.high = v; Save.saveMeta(meta); },
  get unlocked() { return meta.classic.unlocked; },
  set unlocked(v) { meta.classic.unlocked = Math.max(v, meta.classic.unlocked); Save.saveMeta(meta); },
  get bests() { return meta.classic.bests; },
  setBest(id, v) {
    if (!meta.classic.bests[id] || v > meta.classic.bests[id]) {
      meta.classic.bests[id] = v;
      Save.saveMeta(meta);
    }
  },
};

const settings = { ...DEFAULT_SETTINGS, ...meta.settings };
input.setBindings(settings.keys);
function saveSettings() {
  meta.settings = { ...meta.settings, ...settings };
  Save.saveMeta(meta);
  applyPresentation();
}

/**
 * Push the presentation settings into the places that are not redrawn from `g`
 * every frame: the stylesheet, which sizes every overlay screen.
 */
function applyPresentation() {
  document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale || 1));
  document.documentElement.classList.toggle('high-contrast', !!settings.highContrast);
  document.documentElement.classList.toggle('reduce-motion', (settings.shake || 0) < 0.5);
}
applyPresentation();

const g = {
  settings,
  state: 'menu',           // menu | select | brief | play | result | crash | gameover | victory | paused | help | settings
  level: null,
  levelIndex: 0,
  endless: false,
  endlessN: 0,
  campaign: 'classic',      // 'classic' = the original 12 | a chapter id = expedition
  run: null,                // active expedition, persisted between sessions
  terrain: null,
  backdrop: null,
  field: null,             // enemies for the current mission, null when it has none
  abilities: null,         // the equipped active module, live for this mission
  cam: { x: 0, y: 0, scale: 1, trauma: 0, tx: 0, ty: 0 },
  score: 0,
  lives: 3,
  combo: 0,
  time: 0,
  levelTime: 0,
  ship,
  compact: false,
  lastResult: null,
  newRecord: false,
  freeze: 0,
  seed: 1,
  forcedSeed: null,   // pinned by ?seed= or __setSeed() so runs are reproducible
  warn: { low: false, crit: false, dry: false },
  token: 0,          // invalidates pending outcome timers when the level changes
};

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
  g.warn = { low: false, crit: false, dry: false, heat: false, cold: false, radiation: false };
  g.cam.x = sx;
  g.cam.y = sy;
  g.cam.scale = 0.8;
  g.cam.trauma = 0;
  g.freeze = 0;
  setState('brief');
}

/** Start a fresh expedition: three shuttles, one seed, five missions. */
function beginExpedition(planetId) {
  const seed = g.forcedSeed != null ? g.forcedSeed : (Math.random() * 1e9) | 0;
  g.run = Save.newRun(planetId, seed);
  g.chapter = chapterFor(planetId, seed, 1);
  g.campaign = planetId;
  g.endless = false;
  g.score = 0; g.combo = 0; g.newRecord = false;
  g.lives = g.run.shuttles;
  Save.saveRun(g.run);
  startLevel(0, false);
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
  g.forcedSeed = run.seed;
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
      }
      break;
    case 'ram':
      audio.warn('hull');
      particles.explode(e.x, e.y, 0, 0, []);
      particles.sparks(e.x, e.y, 20, 0);
      g.cam.trauma = Math.min(1, g.cam.trauma + 0.5);
      meta.stats.hitsTaken++;
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
      g.carried.material += got.material;
      g.carried.salvage += got.salvage;
      g.carried.nodes++;
      particles.sparks(got.x, got.y, 24, 1);
      particles.ring(got.x, got.y, 150, 0.45, MATERIAL_TINT);
      particles.text(got.x, got.y - 22, `+${got.material} MATERIAL`, MATERIAL_TINT, 19);
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
    radiation: ship.statusLevels ? ship.statusLevels.radiation : 0,
    brokePad: !!(ship.landingResult && ship.landingResult.brokePad),
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
    materialLeft: g.terrain.materialLeft ? g.terrain.materialLeft() : null,
    hull: Math.round(ship.hull), hullMax: ship.hullMax,
    abilityUsed: g.abilities ? g.abilities.used : 0,
  };
  store.setBest(g.level.id, total);
  if (g.score > store.high) { g.newRecord = true; store.high = g.score; }
  if (!g.endless && g.campaign === 'classic') store.unlocked = g.levelIndex + 2;

  if (g.run) {
    g.run.missionsCleared++;
    const left = g.terrain.materialLeft ? g.terrain.materialLeft() : { material: 0, salvage: 0, nodes: 0 };
    const reward = missionReward({
      grade: q, padMultiplier: mult, fuelLeft: ship.fuel, maxFuel: ship.maxFuel,
      rareMaterial: g.level.rareMaterial, firstClear: true, offPad,
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
    g.run.haul = addReward(g.run.haul, reward);
    g.lastReward = reward;
    persistRun();
  }
  meta.stats.landings++;
  if (q === 'PERFECT') meta.stats.perfect++;
  // The weapon arrives once you have survived a mission that shot at you, not
  // a whole chapter later. M15 armed twelve of fifteen missions, so the old
  // timing meant meeting drones on Europa 2 with nothing to answer them and no
  // sign the game intended you to have anything - which is what Tom hit.
  if (g.field && !g.field.empty && g.field.summary().shotsFired > 0
      && !meta.unlockedBlueprints.includes(COMBAT_BLUEPRINT)) {
    meta.unlockedBlueprints = [...meta.unlockedBlueprints, COMBAT_BLUEPRINT];
    particles.text(ship.x, ship.y - 128, 'WEAPON BLUEPRINT RECOVERED', '#5ff5ff', 20);
  }
  recordFlight(q);
  if (!g.run) Save.saveMeta(meta);

  g.freeze = 0.75;
  const tok = g.token;
  setTimeout(() => {
    if (tok !== g.token) return;
    const last = g.levelIndex >= activeLevels().length - 1;
    if (!g.endless && last) {
      if (g.run) {
        // A cleared chapter returns a shuttle, up to the expedition maximum.
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
        meta.stats.bodies[body] = (meta.stats.bodies[body] || 0) + 1;
        g.run.shuttles = g.lives;
        persistRun();
        // The checkpoint is the one place mid-expedition where the loadout
        // opens. It closes again as soon as the next leg is chosen.
        g.loadoutWindow = isCheckpoint(g.run.chaptersCleared);
        setState(g.loadoutWindow ? 'checkpoint' : 'route');
        return;
      }
      if (g.level && (g.chapter || CHAPTERS[g.campaign])) {
        const body = g.level.planet || g.campaign;
        meta.stats.bodies[body] = (meta.stats.bodies[body] || 0) + 1;
        Save.saveMeta(meta);
      }
      setState('victory');
    } else setState('result');
  }, 950);
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
  recordFlight(null);
  if (g.run) persistRun(); else Save.saveMeta(meta);
  g.freeze = 0.12;
  const tok = g.token;
  setTimeout(() => {
    if (tok !== g.token) return;
    if (g.lives <= 0 && g.run) {
      // Expedition over: bank what was gathered, then release the run.
      const settled = settleHaul(g.run.haul, { completed: false, recovered: (g.loadout && g.loadout.cargoRecovery) || 0 });
      g.lastRunSummary = { missions: g.run.missionsCleared, chapter: g.run.chapterId, settled };
      g.run.score = g.score;
      meta = Save.bankRun(meta, g.run, { completed: false, settled, id: 'final' });
      // Persist the stamp before the payout, so a reload in between cannot pay
      // the same settlement a second time.
      Save.saveRun(g.run);
      Save.saveMeta(meta);
      Save.clearRun();
      g.run = null;
      setState('expedition-over');
      return;
    }
    setState(g.lives <= 0 ? 'gameover' : 'crash');
  }, 1400);
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
  if (g.state === 'play' && ship.alive && !ship.landed) R.drawTrajectory(ctx, ship, g.level, g.terrain, cam);
  particles.draw(ctx);
  R.drawEnemies(ctx, g.field, ship, g.time, {
    ...present,
    threatWarning: !!(g.loadout && g.loadout.threatWarning),
    showPaths: Debug.showEnemyPaths,
  });
  R.drawShip(ctx, ship, g.time, cam);
  if (g.abilities) R.drawBeam(ctx, g.abilities.beam, g.time);
  R.drawShield(ctx, ship, ABILITY.shieldPool * ((g.loadout && g.loadout.shieldCapacity) || 1), g.time);
  particles.drawTexts(ctx);
  ctx.restore();

  // Dust sits over the world but under the pad beacons and the HUD.
  const vis = ship.env ? ship.env.visibility : 1;
  if (vis < 0.985) {
    // The storm closes in around the lander, so it needs to know where the
    // lander is on screen rather than assuming the middle of the viewport.
    R.drawDust(ctx, W, H, g.level, vis, g.time, {
      x: W / 2 + (ship.x - cam.x) * cam.scale,
      y: H / 2 + (ship.y - cam.y) * cam.scale,
    });
    R.drawPadBeacons(ctx, cam, W, H, g.terrain, g.level, g.time, 1 - vis, present);
    R.drawMaterialBeacons(ctx, cam, W, H, g.terrain, g.time, 1 - vis, present);
  }

  if (g.state === 'play' || g.state === 'paused') {
    R.drawHUD(ctx, W, H, g);
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

const btn = (action, text, primary = false, key = '') =>
  `<button class="btn${primary ? ' primary' : ''}" data-action="${action}">${text}${key ? `<span class="key">${key}</span>` : ''}</button>`;

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
  overlay.innerHTML = (g.notice ? `<div class="toast">${g.notice}</div>` : '') + screenHTML(s);
  if (s === 'hangar') drawHangarPreview();
}

/** The large lander in the hangar, redrawn whenever the selection changes. */
function drawHangarPreview() {
  const c = document.getElementById('hangar-view');
  if (!c) return;
  const cx = c.getContext('2d');
  const grd = cx.createLinearGradient(0, 0, 0, c.height);
  grd.addColorStop(0, '#070d1a');
  grd.addColorStop(1, '#05060c');
  cx.fillStyle = grd;
  cx.fillRect(0, 0, c.width, c.height);
  cx.strokeStyle = 'rgba(95,245,255,0.10)';
  cx.lineWidth = 1;
  for (let y = 40; y < c.height; y += 40) {
    cx.beginPath(); cx.moveTo(0, y); cx.lineTo(c.width, y); cx.stroke();
  }
  R.drawHangarShip(cx, c.width / 2, c.height / 2 + 10, 4.2, meta.componentLevels, g.hangarPick || 'gear', g.time);
}

function screenHTML(s) {
  switch (s) {
    case 'menu':
      const pending = Save.loadRun();
      const chapterName = pending ? chapterTitle(pending.chapterId) : null;
      return `<div class="screen menu">
        <h1 class="title">TERMINAL<span>VELOCITY</span></h1>
        <p class="tag">A vector lander. Finite fuel. One shot at the pad.</p>
        ${saveSource === 'corrupt' ? '<div class="notice">A damaged save was set aside and progress reset. The old data is kept under <b>tv_save_corrupt</b>.</div>' : ''}
        ${saveSource === 'newer' ? '<div class="notice">This save was written by a newer build, so it was left untouched.</div>' : ''}
        <div class="stats"><span>HIGH SCORE</span><b>${formatScore(store.high)}</b></div>
        ${chapterName ? `<div class="stats"><span>IN PROGRESS</span><b>${chapterName} · mission ${pending.missionIndex + 1} · ${pending.shuttles} left</b></div>` : ''}
        <div class="btns">
          ${chapterName ? btn('resume-run', 'RESUME EXPEDITION', true, 'SPACE') : ''}
          ${btn('chapters', 'EXPEDITION', !chapterName, chapterName ? '' : 'SPACE')}
          ${chapterName || g.run ? '' : btn('campaign', 'CLASSIC CAMPAIGN')}
          ${chapterName || g.run ? '' : btn('select', 'MISSIONS')}
          ${chapterName || g.run ? '' : btn('endless', 'ENDLESS RUN')}
          ${chapterName || g.run ? btn('abandon-run', 'ABANDON EXPEDITION') : ''}
          ${btn('help', 'HOW TO FLY')}
          ${chapterName || g.run ? '' : btn('hangar', 'HANGAR')}
          ${chapterName || g.run ? '' : btn('outfit', 'LOADOUT')}
          ${btn('stats', 'LOGBOOK')}
          ${btn('settings', 'SETTINGS')}
        </div>
        <div class="foot">${audio.muted ? '🔇' : '🔊'} press M to ${audio.muted ? 'unmute' : 'mute'}</div>
      </div>`;

    case 'help':
      return `<div class="screen">
        <h2>HOW TO FLY</h2>
        <div class="keys">
          <div><kbd>SPACE</kbd><kbd>W</kbd><kbd>↑</kbd><span>Main booster, pushes along the nose</span></div>
          <div><kbd>A</kbd><kbd>←</kbd><span>Left attitude burner (rotates you)</span></div>
          <div><kbd>D</kbd><kbd>→</kbd><span>Right attitude burner</span></div>
          <div><kbd>S</kbd><kbd>↓</kbd><span>Attitude hold, burns fuel to kill spin</span></div>
          <div><kbd>E</kbd><kbd>Q</kbd><span>Fire the equipped active module</span></div>
          <div><kbd>R</kbd><span>Retry</span><kbd>P</kbd><span>Pause</span><kbd>M</kbd><span>Mute</span></div>
        </div>
        <p class="body">Prefer arrows that just move the lander? <b>Settings → Steering → Direct</b> turns the
        side burners into sideways thrusters and keeps the hull upright, so left means left with no attitude
        to manage. Classic rotation can also be inverted there.</p>
        <div class="keys">
        </div>
        <p class="body">Land with <b>both legs</b> inside a flashing pad. Keep descent under
        <b>${(ENVELOPE.GOOD.vy / 6).toFixed(1)}</b>, drift under <b>${(ENVELOPE.GOOD.vx / 6).toFixed(1)}</b>
        and tilt inside the green arc. Smaller pads pay bigger multipliers, and leftover fuel is worth points, so
        so is a landing streak. Three lander losses ends the run.</p>
        <p class="body">Miss the pad and a clean touchdown on <b>level ground</b> still survives, at the base
        rate with the streak broken. Steep ground, a hard arrival, the hull touching first, or the ice
        ceiling on Europa. Those are all wreckage.</p>
        <p class="body">Some ground is defended. Old security machines <b>telegraph every shot</b>: a
        line locks on and a ring closes before anything is fired. Hits cost <b>hull</b>, not control.
        Terrain is cover, a turret cannot shoot at something sitting on top of it, and every mission
        keeps one pad no machine can reach. Destroying them pays, but it is never the way through.</p>
        <div class="btns">${btn('back', 'BACK', true, 'SPACE')}</div>
      </div>`;

    case 'select': {
      const bests = store.bests;
      const tiles = LEVELS.map((l, i) => {
        const locked = i + 1 > store.unlocked;
        const b = bests[l.id];
        return `<button class="tile${locked ? ' locked' : ''}" data-action="go:${i}" ${locked ? 'disabled' : ''}>
          <span class="num">${String(l.id).padStart(2, '0')}</span>
          <span class="world" style="color:${WORLDS[l.world].accent}">${l.world}</span>
          <span class="name">${locked ? 'LOCKED' : l.title}</span>
          <span class="best">${b ? formatScore(b) : '—'}</span>
        </button>`;
      }).join('');
      return `<div class="screen wide">
        <h2>MISSIONS</h2>
        <div class="grid">${tiles}</div>
        <div class="btns">${btn('endless', 'ENDLESS RUN')}${btn('back', 'BACK', true)}</div>
      </div>`;
    }

    case 'brief': {
      const l = g.level;
      const acc = WORLDS[l.world].accent;
      const padList = g.terrain.pads.map((p) => `x${p.mult}`).join(' · ');
      return `<div class="screen">
        <div class="eyebrow" style="color:${acc}">${l.world} · MISSION ${g.endless ? g.endlessN : l.id}</div>
        <h2>${l.title}</h2>
        <p class="body">${l.brief}</p>
        <div class="specs">
          <div><span>GRAVITY</span><b>${(l.gravity / 6).toFixed(1)} m/s²</b></div>
          <div><span>FUEL</span><b>${l.fuel}</b></div>
          <div><span>PADS</span><b>${padList}</b></div>
          <div><span>HAZARD</span><b>${l.cave ? 'ICE CEILING' : l.wind ? 'WIND ' + Math.abs(l.wind / 6).toFixed(0) : 'NONE'}</b></div>
        </div>
        ${cargoFor(l) ? `<div class="objective"><span>RECOVERY</span> The ${cargoFor(l).label.toLowerCase()}
          is out past the far landing zone. Nothing is stopping you landing short and going home instead.</div>` : ''}
        ${threatBrief()}
        ${l.optionalObjective ? `<div class="objective"><span>OPTIONAL</span> ${l.optionalObjective.text}</div>` : ''}
        <div class="btns">${btn('launch', 'LAUNCH', true, 'SPACE')}${btn('menu', 'ABORT')}</div>
      </div>`;
    }

    case 'result': {
      const r = g.lastResult;
      const color = r.offPad ? '#ffb347' : r.q === 'PERFECT' ? '#4dff9f' : r.q === 'GOOD' ? '#5ff5ff' : '#ffb347';
      const head = r.offPad ? 'DOWN SAFE, OFF PAD' : `${r.q} LANDING`;
      return `<div class="screen">
        <div class="verdict" style="color:${color};text-shadow:0 0 30px ${color}">${head}</div>
        ${r.offPad ? '<p class="body">Level ground held the legs. There is no bonus off the pad, and the streak resets.</p>' : ''}
        ${r.detail ? metricsTable(r.detail) : ''}
        ${r.objective ? `<div class="objective${r.objective.met ? ' met' : ''}">
          <span>${r.objective.met ? 'OBJECTIVE MET' : 'OBJECTIVE'}</span> ${r.objective.text}
          · <b>${r.objective.progress}</b>${r.objective.met && r.objective.reward
            ? ` · +${Object.entries(r.objective.reward).map(([k, v]) => `${v} ${k}`).join(', ')}` : ''}</div>` : ''}
        ${haulPanel(r)}
        ${r.combat ? `<div class="objective"><span>THREATS</span>
          ${r.combat.total} on this ground · ${r.combat.kills} destroyed ·
          ${r.combat.hitsTaken} hit${r.combat.hitsTaken === 1 ? '' : 's'} taken ·
          hull ${Math.round((r.hull / r.hullMax) * 100)}%${r.combatSalvage ? ` · +${r.combatSalvage} salvage` : ''}</div>` : ''}
        <table class="score">
          <tr><td>${r.offPad ? 'Open ground x1' : `Pad x${r.mult}`} · quality x${r.qf.toFixed(1)}</td><td>${formatScore(r.landing)}</td></tr>
          <tr><td>Fuel remaining ${r.fuel.toFixed(0)}</td><td>${formatScore(r.fuelPts)}</td></tr>
          <tr><td>Streak multiplier</td><td>x${r.comboMult.toFixed(2)}</td></tr>
          <tr class="tot"><td>MISSION TOTAL</td><td>${formatScore(r.total)}</td></tr>
          <tr class="run"><td>RUN SCORE</td><td>${formatScore(g.score)}</td></tr>
        </table>
        <div class="btns">${btn('next', 'NEXT MISSION', true, 'SPACE')}${btn('retry', 'REPLAY', false, 'R')}${btn('menu', 'MENU')}</div>
      </div>`;
    }

    case 'crash': {
      const assist = flightAssist();
      return `<div class="screen">
        <div class="verdict bad">LANDER LOST</div>
        <p class="body">${crashReason()}</p>
        <div class="stats"><span>SHUTTLES LEFT</span><b>${g.lives}</b></div>
        ${g.carried && g.carried.nodes ? `<div class="stats lost"><span>CARGO LOST</span><b>${g.carried.material} MATERIAL · ${g.carried.salvage} SALVAGE</b></div>` : ''}
        ${g.run ? '<p class="body">The same ground, the same seed. Fly it again knowing what it does.</p>' : ''}
        ${assist ? `<div class="objective assist"><span>FLIGHT ASSIST</span> ${assist.tip}</div>` : ''}
        <div class="btns">${btn('retry', 'TRY AGAIN', true, 'SPACE')}${
          assist && assist.loaner ? btn('loan', `TAKE THE ${assist.loaner.name}`) : ''
        }${btn(g.run ? 'abandon-run' : 'menu', g.run ? 'ABANDON' : 'MENU')}</div>
      </div>`;
    }

    case 'gameover':
      return `<div class="screen">
        <div class="verdict bad">MISSION OVER</div>
        <div class="stats big"><span>FINAL SCORE</span><b>${formatScore(g.score)}</b></div>
        ${g.newRecord ? '<div class="record">NEW RECORD</div>' : `<div class="stats"><span>BEST</span><b>${formatScore(store.high)}</b></div>`}
        <div class="btns">${btn('restart', 'NEW RUN', true, 'SPACE')}${btn('menu', 'MENU')}</div>
      </div>`;

    case 'victory':
      return `<div class="screen">
        <div class="verdict" style="color:#4dff9f;text-shadow:0 0 30px #4dff9f">${g.chapter ? 'CHAPTER COMPLETE' : 'PROGRAM COMPLETE'}</div>
        <p class="body">${g.chapter
          ? `${chapterTitle(g.campaign)} is surveyed. Five landings, and the lander still flies.`
          : 'All twelve missions flown. The unsurveyed sectors are open, and they do not end.'}</p>
        <div class="stats big"><span>SCORE</span><b>${formatScore(g.score)}</b></div>
        <div class="btns">${btn('next', 'ENTER ENDLESS', true, 'SPACE')}${btn('menu', 'MENU')}</div>
      </div>`;

    case 'chapters': {
      const cards = Object.values(CHAPTERS).map((ch) => {
        const p = PLANETS[ch.planet];
        const acc = WORLDS[p.world].accent;
        return `<button class="tile chapter" data-action="chapter:${ch.planet}">
          <span class="world" style="color:${acc}">${p.displayName}</span>
          <span class="name">${ch.levels.length} MISSIONS</span>
          <span class="best">${p.summary}</span>
          <span class="best">gravity ${(gravityFor(ch.planet) / 6).toFixed(2)} m/s² · ${p.atmosphere} atmosphere${p.hazards.length ? ' · ' + p.hazards.join(', ') : ''}</span>
        </button>`;
      }).join('');
      return `<div class="screen wide">
        <h2>EXPEDITION</h2>
        <p class="tag">Choose a body. Five missions, escalating from introduction to mastery.</p>
        <div class="grid chapters">${cards}</div>
        <div class="btns">${btn('back', 'BACK', true, 'SPACE')}</div>
      </div>`;
    }

    case 'settings': {
      const opt = (key, value, title, blurb) => `
        <button class="opt${settings[key] === value ? ' on' : ''}" data-action="set:${key}:${value}">
          <span class="opt-title">${title}</span>
          <span class="opt-blurb">${blurb}</span>
        </button>`;
      return `<div class="screen">
        <h2>SETTINGS</h2>
        <div class="setting">
          <div class="setting-name">STEERING</div>
          <div class="opts">
            ${opt('steering', 'classic', 'CLASSIC', 'Side burners rotate the lander. Point the nose, then burn. The 1969 problem, and the only way to fly the tight pads well.')}
            ${opt('steering', 'direct', 'DIRECT', 'Side burners push the lander sideways and the hull stays upright. Left means left on its own, no attitude to manage.')}
          </div>
        </div>
        <div class="setting${settings.steering === 'direct' ? ' dimmed' : ''}">
          <div class="setting-name">ROTATION${settings.steering === 'direct' ? ' (classic only)' : ''}</div>
          <div class="opts">
            ${opt('invertRotation', false, 'NORMAL', 'Left burner tips the nose left, so left plus booster drifts you left.')}
            ${opt('invertRotation', true, 'INVERTED', 'Left burner tips the nose right. Some pilots read the stick the other way round.')}
          </div>
        </div>
        <div class="setting">
          <div class="setting-name">MOTION</div>
          <div class="opts">
            ${opt('shake', 1, 'FULL SHAKE', 'The camera kicks on impacts, hard burns and hits.')}
            ${opt('shake', 0.5, 'REDUCED', 'Half the movement. Still readable as force, far less motion.')}
            ${opt('shake', 0, 'NONE', 'The camera never shakes. Nothing else changes.')}
          </div>
        </div>
        <div class="setting">
          <div class="setting-name">FLASHING</div>
          <div class="opts">
            ${opt('flash', 1, 'FULL', 'Alarms pulse, beacons strobe, telegraphs throb.')}
            ${opt('flash', 0.35, 'REDUCED', 'The same warnings, held much steadier.')}
            ${opt('flash', 0, 'STEADY', 'No pulsing at all. Warnings stay lit instead.')}
          </div>
        </div>
        <div class="setting">
          <div class="setting-name">INSTRUMENT SIZE</div>
          <div class="opts">
            ${opt('uiScale', 0.85, 'COMPACT', 'Smaller panels, more sky.')}
            ${opt('uiScale', 1, 'NORMAL', 'The standard instrument panel.')}
            ${opt('uiScale', 1.25, 'LARGE', 'Bigger readouts and bigger text everywhere.')}
          </div>
        </div>
        <div class="setting">
          <div class="setting-name">CONTRAST</div>
          <div class="opts">
            ${opt('highContrast', false, 'STANDARD', 'Pads and threats in their usual colours.')}
            ${opt('highContrast', true, 'HIGH', 'Pads outlined and labelled, threats ringed and lettered, so every marker reads without relying on colour.')}
          </div>
        </div>
        <div class="setting">
          <div class="setting-name">CONTROLS</div>
          <div class="opts">
            <button class="opt" data-action="keys">
              <span class="opt-title">REBIND KEYS</span>
              <span class="opt-blurb">${ACTIONS.map((a) => keyLabel(input.bindings[a][0])).join(' · ')}</span>
            </button>
          </div>
        </div>
        <div class="btns">${btn('back', 'DONE', true, 'SPACE')}</div>
      </div>`;
    }

    case 'keys': {
      const names = {
        thrust: 'MAIN BOOSTER', left: 'LEFT BURNER', right: 'RIGHT BURNER',
        hold: 'ATTITUDE HOLD', ability: 'ACTIVE MODULE',
      };
      const rows = ACTIONS.map((a) => {
        const listening = g.rebinding === a;
        return `<button class="opt keyrow${listening ? ' on' : ''}" data-action="rebind:${a}">
          <span class="opt-title">${names[a]}</span>
          <span class="opt-blurb">${listening ? 'press any key…' : input.bindings[a].map(keyLabel).map((k) => `<kbd>${k}</kbd>`).join(' ')}</span>
        </button>`;
      }).join('');
      return `<div class="screen">
        <h2>CONTROLS</h2>
        <p class="body">Pick a control, then press the key you want on it. Retry, pause, mute and
        escape stay where they are, so the menu is always reachable.</p>
        <div class="setting"><div class="opts keys-list">${rows}</div></div>
        ${g.rebindNote ? `<div class="notice">${g.rebindNote}</div>` : ''}
        <div class="btns">${btn('keys-reset', 'RESET TO DEFAULT')}${btn('settings', 'DONE', true, 'SPACE')}</div>
      </div>`;
    }

    case 'stats': {
      const st = meta.stats;
      const pct = (n, d) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
      const flights = st.attempts || (st.landings + st.crashes);
      const efficiency = st.fuelCarried > 0
        ? `${Math.round((1 - st.fuelBurned / st.fuelCarried) * 100)}% left on average` : '—';

      const row = (name, value, note = '') =>
        `<tr><td>${name}</td><td class="m-val">${value}</td><td class="m-w">${note}</td></tr>`;

      const bodies = Object.entries(st.bodies || {})
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `${chapterTitle(id)} ×${n}`).join(' · ') || 'none yet';

      const graded = Object.entries(st.missionGrades || {});
      const perfectRuns = graded.filter(([, v]) => v === 'PERFECT').length;

      const modules = Object.entries(st.moduleFlights || {})
        .sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([id, n]) => {
          const m = moduleById(id);
          const used = (st.moduleUses || {})[id];
          return `${m ? m.name : id} ×${n}${used ? ` (fired ${used})` : ''}`;
        }).join(' · ') || 'none yet';

      const threatTotal = st.threatsDestroyed + st.threatsPassed;

      return `<div class="screen wide">
        <div class="eyebrow" style="color:#5ff5ff">LOGBOOK</div>
        <h2>STATISTICS</h2>
        <table class="metrics stats-table">
          ${row('Missions flown', formatScore(flights))}
          ${row('Landed', formatScore(st.landings), pct(st.landings, flights))}
          ${row('Lost', formatScore(st.crashes), pct(st.crashes, flights))}
          ${row('Perfect landings', formatScore(st.perfect), pct(st.perfect, st.landings))}
          ${row('Fuel efficiency', efficiency)}
          ${row('Time flown', `${Math.round(st.flightSeconds / 60)} min`)}
          ${row('Chapters cleared', bodies)}
          ${row('Missions at PERFECT', `${perfectRuns} of ${graded.length} flown`)}
          ${row('Best score', formatScore(Math.max(st.bestScore, meta.classic.high)))}
          ${row('Threats met', formatScore(st.threatsSeen), st.threatsSeen ? 'under fire' : '')}
          ${row('Threats destroyed', formatScore(st.threatsDestroyed), pct(st.threatsDestroyed, threatTotal))}
          ${row('Threats flown past', formatScore(st.threatsPassed), pct(st.threatsPassed, threatTotal))}
          ${row('Hits taken', formatScore(st.hitsTaken))}
          ${row('Most-flown gear', modules)}
        </table>
        <div class="btns">${btn('back', 'DONE', true, 'SPACE')}</div>
      </div>`;
    }

    case 'outfit': {
      const data = meta.banked.data;
      // The tree opens once something has actually shot at you.
      const features = { enemies: meta.stats.threatsSeen > 0 };
      const trees = TREE_IDS.map((tid) => {
        const tree = TREES[tid];
        const nodes = tree.nodes.map((n) => {
          const rank = meta.purchasedSkills[n.id] || 0;
          const chk = skillCheck(n.id, meta.purchasedSkills, data, features);
          const cls = rank >= n.ranks ? ' maxed' : chk.ok ? ' can' : '';
          return `<button class="node${cls}" data-action="skill:${n.id}" ${chk.ok ? '' : 'disabled'}>
            <span class="node-name">${n.name} <i>${rank}/${n.ranks}</i></span>
            <span class="node-eff">${n.describe(Math.max(1, rank))}</span>
            <span class="node-cost">${rank >= n.ranks ? 'complete' : chk.ok ? `${chk.cost} data` : chk.reason}</span>
          </button>`;
        }).join('');
        // A tree is only dimmed while its feature is genuinely locked. Once
        // something has shot at you, Combat Systems reads like any other tree.
        const locked = tree.nodes.some((n) => n.requiresFeature && !features[n.requiresFeature]);
        return `<div class="tree${locked ? ' gated' : ''}">
          <div class="tree-name">${tree.name}</div>
          <div class="tree-blurb">${locked ? tree.gated : tree.blurb}</div>
          ${nodes}
        </div>`;
      }).join('');

      const slot = (map, kind) => Object.values(map).map((mod) => {
        const owned = meta.unlockedBlueprints.includes(mod.id);
        const on = (meta.equipped[kind] === mod.id);
        return `<button class="tile mod${on ? ' on' : ''}${owned ? '' : ' locked'}"
            data-action="${owned ? `equip:${kind}:${mod.id}` : 'noop'}" ${owned ? '' : 'disabled'}>
          <span class="world">${mod.name}</span>
          <span class="best">${owned ? mod.blurb : 'Blueprint not yet recovered.'}</span>
        </button>`;
      }).join('');

      return `<div class="screen wide">
        <div class="eyebrow" style="color:#5ff5ff">LOADOUT</div>
        <h2>SKILLS AND MODULES</h2>
        <div class="stats"><span>RESEARCH DATA</span><b>${formatScore(data)}</b></div>
        <div class="trees">${trees}</div>
        <div class="setting"><div class="setting-name">ACTIVE MODULE</div><div class="grid comps">${slot(ACTIVE_MODULES, 'active')}</div></div>
        <div class="setting"><div class="setting-name">PASSIVE MODULE</div><div class="grid comps">${slot(PASSIVE_MODULES, 'passive')}</div></div>
        <div class="btns">${btn('back', 'DONE', true, 'SPACE')}</div>
      </div>`;
    }

    case 'hangar': {
      const b = meta.banked;
      const sel = g.hangarPick || 'gear';
      const comp = COMPONENTS[sel];
      const level = Math.max(1, meta.componentLevels[sel] || 1);
      const check = purchaseCheck(sel, meta.componentLevels, b);
      const cur = comp.levels[level - 1];
      const next = level < 4 ? comp.levels[level] : null;
      const mats = Object.entries(b.materials || {}).filter(([, v]) => v > 0);

      const tabs = COMPONENT_IDS.map((id) => {
        const lv = Math.max(1, meta.componentLevels[id] || 1);
        return `<button class="tile comp${id === sel ? ' on' : ''}" data-action="pick:${id}">
          <span class="world">${COMPONENTS[id].name}</span>
          <span class="pips">${'▮'.repeat(lv)}${'▯'.repeat(4 - lv)}</span>
        </button>`;
      }).join('');

      return `<div class="screen wide hangar">
        <div class="eyebrow" style="color:#5ff5ff">HANGAR</div>
        <h2>${comp.name} · LEVEL ${level}</h2>
        <div class="hangar-grid">
          <canvas id="hangar-view" width="340" height="300"></canvas>
          <div class="hangar-detail">
            <p class="body">${comp.blurb}</p>
            <table class="score">
              <tr><td>Now</td><td>${cur.describe}</td></tr>
              ${next ? `<tr class="tot"><td>Next</td><td>${next.describe}</td></tr>` : '<tr class="tot"><td>Next</td><td>—</td></tr>'}
            </table>
            ${next ? `<div class="cost">
              <span>COST</span> ${next.cost.salvage} salvage${Object.entries(next.cost.materials || {}).map(([m, v]) => ` · ${v} ${m}`).join('')}
            </div>` : ''}
            ${check.ok
              ? btn(`buy:${sel}`, 'INSTALL', true)
              : `<div class="notice">${check.reason}</div>`}
          </div>
        </div>
        <div class="grid comps">${tabs}</div>
        <div class="stats"><span>BANKED</span><b>${formatScore(b.salvage)} salvage · ${formatScore(b.data)} data · ${b.cores} cores</b></div>
        ${mats.length ? `<div class="mats">${mats.map(([m, v]) => `<span>${v} <i>${m}</i></span>`).join('')}</div>` : ''}
        <div class="btns">${btn('back', 'LEAVE HANGAR', true, 'SPACE')}</div>
      </div>`;
    }

    case 'route':
    case 'checkpoint': {
      const run = g.run;
      const checkpoint = g.state === 'checkpoint';
      const offers = routeOffers(
        [...meta.clearedChapters, ...(run.visited || [])],
        run.seed, run.sector,
      );
      g.routeOffers = offers;
      const cards = offers.map((c, i) => {
        const accent = WORLDS[PLANETS[c.planet].world].accent;
        return `
        <button class="tile route" data-action="route:${i}">
          <span class="planet-mark" style="color:${accent}">${planetIcon(c.planet, accent, 62)}</span>
          <span class="world" style="color:${accent}">${c.name}</span>
          <span class="name">${'▮'.repeat(c.difficulty)}${'▯'.repeat(5 - c.difficulty)} · ${c.atmosphere === 'none' ? 'no air' : `${c.atmosphere} air`}</span>
          <span class="best">gravity ${(c.gravity / 6).toFixed(2)} m/s² · ${c.enemyIntensity} resistance</span>
          <span class="best">weather: ${c.hazards.join(', ') || 'nothing reported'}${c.incomplete ? ' <i>· forecast incomplete</i>' : ''}</span>
          <span class="best haul">brings home: ${c.rareMaterial}</span>
          <span class="best rec">take: ${c.recommended.join(', ')}</span>
        </button>`;
      }).join('');
      const h = run.haul;
      return `<div class="screen wide">
        <div class="eyebrow" style="color:#4dff9f">SECTOR ${run.sector} OF ${SECTORS}${checkpoint ? ' · CHECKPOINT' : ''}</div>
        <h2>${checkpoint ? 'CARGO BANKED. SHUTTLES BACK.' : 'WHERE NEXT?'}</h2>
        ${checkpoint ? '<p class="body">Supply stop. Change your loadout here if you want to, then pick the next world.</p>' : ''}
        <table class="score">
          <tr><td>Transmitted salvage</td><td>${formatScore(h.salvageSafe)}</td></tr>
          <tr><td>Physical cargo ${checkpoint ? '(banking now)' : '(at risk until the next checkpoint)'}</td><td>${formatScore(h.salvageCargo)}</td></tr>
          <tr><td>Research data</td><td>${formatScore(h.data)}</td></tr>
          <tr class="tot"><td>SHUTTLES</td><td>${g.lives} / ${run.maxShuttles}</td></tr>
        </table>
        <div class="grid routes">${cards}</div>
        <div class="btns">${checkpoint ? btn('outfit', 'CHANGE LOADOUT') : ''}${btn('abandon-run', 'END EXPEDITION')}</div>
      </div>`;
    }

    case 'expedition-complete': {
      const b = meta.banked;
      const sum = g.lastRunSummary || { missions: 0 };
      return `<div class="screen">
        <div class="verdict" style="color:#4dff9f;text-shadow:0 0 30px #4dff9f">EXPEDITION COMPLETE</div>
        <p class="body">Five sectors, and the lander came home. Everything you carried is banked.
        The next expedition starts wherever you want it to.</p>
        <table class="score">
          <tr><td>Missions flown</td><td>${sum.missions}</td></tr>
          <tr><td>Run score</td><td>${formatScore(g.score)}</td></tr>
          <tr class="tot"><td>BANKED SALVAGE</td><td>${formatScore(b.salvage)}</td></tr>
          <tr class="run"><td>BANKED RESEARCH</td><td>${formatScore(b.data)}</td></tr>
        </table>
        <div class="btns">${btn('chapters', 'NEW EXPEDITION', true, 'SPACE')}${btn('hangar', 'HANGAR')}${btn('menu', 'MENU')}</div>
      </div>`;
    }

    case 'expedition-over': {
      const b = meta.banked;
      return `<div class="screen">
        <div class="verdict bad">EXPEDITION LOST</div>
        <p class="body">All three shuttles are gone. What you transmitted is still yours.
        The expedition ends. The programme does not.</p>
        <table class="score">
          <tr><td>Missions cleared</td><td>${g.lastRunSummary ? g.lastRunSummary.missions : 0}</td></tr>
          <tr><td>Run score</td><td>${formatScore(g.score)}</td></tr>
          <tr class="tot"><td>BANKED SALVAGE</td><td>${formatScore(b.salvage)}</td></tr>
          <tr class="run"><td>BANKED RESEARCH</td><td>${formatScore(b.data)}</td></tr>
        </table>
        ${g.lastRunSummary && g.lastRunSummary.settled && g.lastRunSummary.settled.debrief
          ? `<div class="objective"><span>DEBRIEF</span> The flight recorders came home:
             +${g.lastRunSummary.settled.debrief.salvage} salvage, +${g.lastRunSummary.settled.debrief.data} research.
             Enough to change something before the next attempt.</div>` : ''}
        <div class="btns">${btn('chapters', 'NEW EXPEDITION', true, 'SPACE')}${btn('menu', 'MENU')}</div>
      </div>`;
    }

    case 'paused':
      return `<div class="screen">
        <h2>PAUSED</h2>
        <div class="btns">${btn('resume', 'RESUME', true, 'P')}${
          g.run ? '' : btn('retry', 'RESTART MISSION', false, 'R')}${btn('settings', 'SETTINGS')}${btn('menu', 'MENU')}</div>
      </div>`;
  }
  return '';
}

/** Post-landing breakdown: every number the grade was made of. */
/**
 * What is waiting on this ground, and how to beat it without a weapon. The
 * counterplay is printed because an untelegraphed threat and an unexplained one
 * cost the player the same thing: a lander they had no way to save.
 */
function threatBrief() {
  const threats = describeThreats(g.level);
  if (!threats.length) return '';
  const rows = threats.map((t) =>
    `<div><b>${t.name}</b> <i>${t.kind === 'air' ? 'airborne' : 'ground'}</i> · ${t.counterplay}</div>`).join('');
  return `<div class="threats"><span>HOSTILE SYSTEMS</span>${rows}</div>`;
}

/**
 * The hold, on the results screen. The point of M15 is that the reward is a
 * thing you went and got, so what came home is shown next to what was left
 * lying out there - that gap is the whole invitation to fly it again.
 */
function haulPanel(r) {
  const c = r.carried || { material: 0, salvage: 0, nodes: 0 };
  const left = r.materialLeft || { material: 0, salvage: 0, nodes: 0 };
  if (!c.nodes && !left.nodes) return '';
  const rw = g.lastReward;
  const mult = rw && rw.haulMult != null ? rw.haulMult : 1;
  return `<div class="objective haul${c.nodes ? ' met' : ''}">
    <span>${c.nodes ? 'RECOVERED' : 'NOTHING RECOVERED'}</span>
    ${c.nodes} of ${c.nodes + left.nodes} deposit${c.nodes + left.nodes === 1 ? '' : 's'} ·
    <b>${c.material} material · ${c.salvage} salvage</b>${mult !== 1 ? ` × ${mult.toFixed(2)} landing` : ''}${
    left.nodes ? ` · <i>${left.material} material still out there</i>` : ''}</div>`;
}

function metricsTable(d) {
  const rows = [
    ['DESCENT', `${(d.parts.vy.value / 6).toFixed(2)} m/s`, d.parts.vy, 'vy'],
    ['DRIFT', `${(d.parts.vx.value / 6).toFixed(2)} m/s`, d.parts.vx, 'vx'],
    ['TILT', `${(d.parts.tilt.value / DEG).toFixed(1)}°`, d.parts.tilt, 'tilt'],
    ['PAD CENTRE', d.onPad ? `${Math.round(d.parts.center.value * 100)}% off` : 'off pad', d.parts.center, 'center'],
  ].map(([name, shown, part, axis]) => {
    const caps = capsFor(axis);
    const band = part.value <= caps.perfect ? 'perfect' : part.value <= caps.safe ? 'good' : 'hard';
    const pct = Math.min(100, (part.value / (caps.crash || 1)) * 100);
    return `<tr class="m-${band}">
      <td>${name}</td>
      <td class="m-val">${shown}</td>
      <td class="m-bar"><span style="width:${pct.toFixed(0)}%"></span></td>
      <td class="m-w">+${part.weighted.toFixed(2)}</td>
    </tr>`;
  }).join('');
  return `<table class="metrics">
    ${rows}
    <tr class="m-total"><td>SEVERITY</td><td class="m-val">${d.score.toFixed(2)}</td><td colspan="2">
      ${d.blocker ? d.blocker : 'Textbook.'}${d.bounces > 1 ? ` ${d.bounces} bounces.` : ''}</td></tr>
  </table>`;
}

/**
 * Offered after a mission has cost three landers (roadmap section 13: "if the
 * player fails the same mission repeatedly, offer an optional forecast tip,
 * practice mode, or temporary loaner module - not an invisible difficulty
 * reduction"). Nothing here changes the mission. It names what is killing you,
 * and offers to lend the tool for it.
 */
function flightAssist() {
  if (!g.run || !g.level) return null;
  const key = g.level.missionId || g.level.id;
  const tries = (g.run.attempts && g.run.attempts[key]) || 0;
  if (tries < 3) return null;

  const planet = PLANETS[g.level.planet] || null;
  const hazard = (g.level.hazards || []).map((h) => (typeof h === 'string' ? h : h.type))[0];
  const TIPS = {
    dust: 'the storm runs on a cycle, so learn the ground in a clear window and commit during the next one',
    windChannels: 'the wind reverses between altitude bands, so drop through them one at a time instead of straight down',
    atmosphere: 'the air answers late here, so start braking earlier than feels right and trim into the gust',
    radiation: 'ridges throw a shadow, and the sheltered route is slower but keeps you alive',
    thermal: 'heat builds while you burn, so use short bursts rather than a long hold',
    cryo: 'the cold builds while you coast, and a little thrust keeps it back',
    plumes: 'the vents fire on a cycle, so cross the field between them',
  };
  const tips = [];
  if (TIPS[hazard]) tips.push(TIPS[hazard]);
  if (g.level.surfaceFriction != null && g.level.surfaceFriction < 0.3) {
    tips.push('this surface barely holds you, so arrive slow and straight and expect to slide');
  }
  if (g.level.cave) tips.push('the ceiling is as fatal as the floor, so climb in small steps');
  if (g.field && !g.field.empty) tips.push('the safe pad is out of every gun\'s reach. The small pad is the one being watched');
  if (!tips.length) tips.push(planet ? planet.summary.toLowerCase() : 'take the wide pad and the base rate. A landing beats a multiplier');

  // A loaner only when the player has nothing equipped for this body.
  const rec = recommendedFor(g.level.planet);
  const owned = meta.equipped && meta.equipped.active;
  const wanted = rec.active && rec.active !== owned ? rec.active : null;
  const loaner = wanted && !g.run.loaner ? ACTIVE_MODULES[wanted] : null;

  return {
    tip: `This ground has cost you ${tries} landers. ${tips[0].charAt(0).toUpperCase()}${tips[0].slice(1)}.`,
    loaner,
  };
}

function crashReason() {
  if (ship.lostToFire) {
    return ship.damageSource === 'ram'
      ? 'A drone rammed the hull and it came apart.'
      : 'The hull failed under fire. Nothing left to absorb the next hit.';
  }
  if (ship.landingResult && ship.landingResult.blocker && ship.landingResult.grade === 'CRASH') {
    return ship.landingResult.blocker;
  }
  const tilt = Math.abs(normalizeAngle(ship.angle)) / DEG;
  if (g.terrain.ceiling && ship.contact && ship.contact.y < g.terrain.height * 0.5) return 'Struck the ice ceiling.';
  if (ship.fuel <= 0) return 'Tanks dry on final approach.';
  if (Math.abs(ship.vy) > ENVELOPE.HARD.vy) return `Descent rate ${(Math.abs(ship.vy) / 6).toFixed(1)}, far outside the envelope.`;
  if (Math.abs(ship.vx) > ENVELOPE.HARD.vx) return `Lateral drift ${(Math.abs(ship.vx) / 6).toFixed(1)}. The legs sheared off.`;
  if (tilt > 15) return `Attitude ${tilt.toFixed(0)}° off vertical at contact.`;
  return 'Touched down off the pad. The surface is not level enough to hold a lander.';
}

// ------------------------------------------------------------------ actions

function act(action) {
  audio.unlock();
  audio.ui();
  if (action.startsWith('chapter:')) {
    beginExpedition(action.slice(8));
    return;
  }
  if (action === 'noop') return;
  if (action.startsWith('skill:')) {
    const res = buySkill(action.slice(6), meta.purchasedSkills, meta.banked.data,
      { enemies: meta.stats.threatsSeen > 0 });
    if (res) {
      meta.purchasedSkills = res.purchased;
      meta.banked.data = res.researchData;
      Save.saveMeta(meta);
      audio.arpeggio([659.25, 880], 0.06);
    }
    renderOverlay();
    return;
  }
  if (action.startsWith('equip:')) {
    const [, kind, id] = action.split(':');
    meta.equipped = { ...meta.equipped, [kind]: meta.equipped[kind] === id ? null : id };
    Save.saveMeta(meta);
    renderOverlay();
    return;
  }
  if (action === 'loan') {
    const assist = flightAssist();
    if (assist && assist.loaner && g.run) {
      g.run.loaner = assist.loaner.id;
      persistRun();
      audio.arpeggio([523.25, 784], 0.07);
    }
    act('retry');
    return;
  }
  if (action === 'keys') { g.rebinding = null; g.rebindNote = null; setState('keys'); return; }
  if (action === 'keys-reset') {
    settings.keys = null;
    input.setBindings(null);
    g.rebinding = null;
    g.rebindNote = 'Every control is back to its default key.';
    saveSettings();
    renderOverlay();
    return;
  }
  if (action.startsWith('rebind:')) {
    g.rebinding = action.slice(7);
    g.rebindNote = null;
    renderOverlay();
    return;
  }
  if (action.startsWith('pick:')) { g.hangarPick = action.slice(5); renderOverlay(); return; }
  if (action.startsWith('buy:')) {
    const id = action.slice(4);
    const result = purchase(id, meta.componentLevels, meta.banked);
    if (result) {
      meta.banked = result.banked;
      meta.componentLevels = result.componentLevels;
      Save.saveMeta(meta);
      audio.arpeggio([523.25, 659.25, 880], 0.07);
    }
    renderOverlay();
    return;
  }
  if (action.startsWith('route:')) {
    const card = (g.routeOffers || [])[+action.slice(6)];
    if (!card || !g.run) return;
    const run = g.run;
    if (g.state === 'checkpoint') {
      // A checkpoint banks everything and restores the expedition. It is also
      // the only place mid-run where the loadout may be changed, so the window
      // closes again the moment the next leg is chosen.
      const settled = settleHaul(run.haul, { completed: true });
      meta = Save.bankRun(meta, run, { completed: true, settled, id: `sector-${run.sector}` });
      Save.saveRun(run);
      Save.saveMeta(meta);
      run.haul = { salvageSafe: 0, salvageCargo: 0, data: 0, cores: 0, materials: {} };
      run.sector++;
      g.lives = run.maxShuttles;
      // Five sectors is an expedition. Reaching the end of the fifth is the
      // win condition the run never had.
      if (isExpeditionComplete(run.sector)) {
        g.lastRunSummary = { missions: run.missionsCleared, chapter: run.chapterId, settled, complete: true };
        run.score = g.score;
        Save.clearRun();
        g.run = null;
        g.loadoutWindow = false;
        setState('expedition-complete');
        return;
      }
    }
    g.loadoutWindow = false;
    run.chapterId = card.planet;
    run.missionIndex = 0;
    run.shuttles = g.lives;
    if (!run.visited.includes(card.planet)) run.visited.push(card.planet);
    g.chapter = chapterFor(card.planet, run.seed + run.sector * 101, run.sector);
    g.campaign = card.planet;
    Save.saveRun(run);
    startLevel(0, false);
    return;
  }
  if (action === 'resume-run') { resumeExpedition(); return; }
  if (action === 'abandon-run') {
    if (g.run) {
      const settled = settleHaul(g.run.haul, { completed: false });
      meta = Save.bankRun(meta, g.run, { completed: false, settled, id: 'final' });
      Save.saveRun(g.run);
    }
    Save.saveMeta(meta);
    Save.clearRun();
    Save.saveMeta(meta);
    Save.clearRun();
    g.run = null; g.chapter = null; g.level = null; g.campaign = 'classic';
    setState('menu');
    return;
  }
  if (action.startsWith('set:')) {
    const [, key, raw] = action.split(':');
    // Numeric settings have to come back as numbers: the option buttons compare
    // against the value with ===, and "0.5" is not 0.5.
    const numeric = raw !== '' && !Number.isNaN(Number(raw));
    settings[key] = raw === 'true' ? true : raw === 'false' ? false : numeric ? Number(raw) : raw;
    saveSettings();
    renderOverlay();
    return;
  }
  if (action.startsWith('go:')) {
    const i = +action.slice(3);
    g.campaign = 'classic';
    g.endless = false;
    g.score = 0; g.lives = 3; g.combo = 0; g.newRecord = false;
    startLevel(i);
    return;
  }
  switch (action) {
    case 'chapters': setState('chapters'); break;
    case 'campaign':
      // Switching modes used to leave the expedition running underneath: the
      // campaign started, `g.run` and `g.chapter` stayed set, and the "classic"
      // mission you were flying was still mars-1. An expedition is left
      // deliberately, through RESUME or ABANDON, or not at all.
      if (g.run) { toast('Finish or abandon the expedition first.'); break; }
      g.campaign = 'classic';
      g.chapter = null;
      g.endless = false;
      g.score = 0; g.lives = 3; g.combo = 0; g.newRecord = false;
      startLevel(Math.min(store.unlocked - 1, LEVELS.length - 1));
      break;
    case 'endless':
      if (g.run) { toast('Finish or abandon the expedition first.'); break; }
      g.campaign = 'classic';
      g.chapter = null;
      g.endless = true;
      g.score = 0; g.lives = 3; g.combo = 0; g.newRecord = false;
      startLevel(LEVELS.length);
      break;
    case 'select':
      if (g.run) { toast('Finish or abandon the expedition first.'); break; }
      setState('select');
      break;
    // Permanent upgrades belong between expeditions. Refitting mid-run turns a
    // lost lander into a shopping trip, which is the opposite of a roguelite.
    // The one exception is the sector checkpoint, which opens the loadout.
    case 'hangar':
      if (g.run) { toast('The hangar is closed while an expedition is under way.'); break; }
      setState('hangar');
      break;
    case 'outfit':
      if (g.run && !g.loadoutWindow) { toast('Loadout is locked until the next sector checkpoint.'); break; }
      setState('outfit');
      break;
    case 'settings':
      if (g.state !== 'keys') g.settingsFrom = g.state;
      g.rebinding = null;
      setState('settings');
      break;
    case 'help': setState('help'); break;
    case 'stats': setState('stats'); break;
    case 'back':
      // Coming out of the loadout during a supply stop returns to the stop,
      // not to the main menu - the expedition is still running.
      if (g.loadoutWindow && g.run) { setState('checkpoint'); break; }
      setState(g.settingsFrom === 'paused' ? 'paused' : 'menu');
      g.settingsFrom = null;
      break;
    case 'launch': launch(); break;
    case 'next':
      if (g.state === 'victory') {
        if (g.chapter) { g.campaign = 'classic'; g.chapter = null; g.level = null; setState('menu'); break; }
        g.endless = true; startLevel(LEVELS.length);
      }
      else startLevel(g.levelIndex + 1);
      break;
    case 'retry':
      // In an expedition you do not get to rewind. Losing the lander replays
      // the mission on the same ground; anything else is a fresh attempt you
      // have to earn. Outside a run, retry is just a retry.
      if (g.run && ship.alive && g.state !== 'crash') {
        toast('No restarts on an expedition. Fly it, or lose the lander.');
        break;
      }
      startLevel(g.levelIndex, !g.run);
      break;
    case 'menu':
      // Bump the token: a landing or a crash may still have a settle timer in
      // flight, and it must not fire into a menu with no level under it.
      g.token++;
      g.level = null;
      setState('menu');
      break;
    case 'restart':
      g.score = 0; g.lives = 3; g.combo = 0; g.newRecord = false;
      startLevel(g.endless ? LEVELS.length : 0);
      break;
    case 'resume': setState('play'); break;
  }
}

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
window.__setState = (name) => { setState(name); return g.state; };   // drive any screen in a test
window.__audio = audio;   // so a test can count what actually gets played
window.__useAbility = () => (g.abilities ? g.abilities.trigger(ship) : false);

window.__setSeed = (n) => { g.forcedSeed = n == null ? null : (n | 0); return g.forcedSeed; };
window.__advance = advance;
window.__draw = () => { syncSize(); draw(); return { w: W, h: H, state: g.state }; };

/** Resolve a pending landing/crash immediately, for headless tests. */
window.__settleNow = () => {
  if (ship.landed) { setState(!g.endless && g.levelIndex === LEVELS.length - 1 ? 'victory' : 'result'); return g.state; }
  if (!ship.alive) { setState(g.lives <= 0 ? 'gameover' : 'crash'); return g.state; }
  return g.state;
};

/** Opened by the macOS app's Settings menu item (Cmd-,). */
window.__openSettings = () => {
  if (g.state === 'play') { audio.silence(); g.settingsFrom = 'paused'; }
  else g.settingsFrom = g.state;
  setState('settings');
};
