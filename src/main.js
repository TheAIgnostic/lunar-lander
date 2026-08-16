// TERMINAL VELOCITY - state machine, camera, scoring, persistence.

import { clamp, lerp, approach, makeRng, formatScore, safeStore, DEG } from './util.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { Terrain } from './terrain.js';
import { LEVELS, endlessLevel, WORLDS } from './levels.js';
import { Particles } from './particles.js';
import { Ship, ENVELOPE, normalizeAngle, DEFAULT_SETTINGS } from './ship.js';
import * as R from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const touchbar = document.getElementById('touch');

const audio = new Audio();
const input = new Input();
const particles = new Particles();
const ship = new Ship();

const store = {
  get high() { return +(safeStore.get('tv_high') || 0); },
  set high(v) { safeStore.set('tv_high', String(v)); },
  get unlocked() { return +(safeStore.get('tv_unlocked') || 1); },
  set unlocked(v) { safeStore.set('tv_unlocked', String(Math.max(v, this.unlocked))); },
  get bests() { try { return JSON.parse(safeStore.get('tv_bests') || '{}'); } catch { return {}; } },
  setBest(id, v) {
    const b = this.bests;
    if (!b[id] || v > b[id]) { b[id] = v; safeStore.set('tv_bests', JSON.stringify(b)); }
  },
};

const settings = {
  ...DEFAULT_SETTINGS,
  ...(() => { try { return JSON.parse(safeStore.get('tv_settings') || '{}'); } catch { return {}; } })(),
};
function saveSettings() {
  safeStore.set('tv_settings', JSON.stringify(settings));
}

const g = {
  state: 'menu',           // menu | select | brief | play | result | crash | gameover | victory | paused | help | settings
  level: null,
  levelIndex: 0,
  endless: false,
  endlessN: 0,
  terrain: null,
  backdrop: null,
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

function levelFor(index) {
  if (index < LEVELS.length) return LEVELS[index];
  g.endless = true;
  g.endlessN = index - LEVELS.length + 1;
  return endlessLevel(g.endlessN, makeRng(g.seed + index));
}

function startLevel(index, freshSeed = true) {
  g.token++;
  g.levelIndex = index;
  if (freshSeed) g.seed = (Math.random() * 1e9) | 0;
  const level = levelFor(index);
  g.level = level;
  g.terrain = new Terrain(level, g.seed ^ (level.id * 2654435761));
  g.backdrop = R.buildBackdrop(level, g.terrain, g.seed);
  particles.clear();

  // Spawn a real flight away from the best-paying pad, but not so far that the
  // transit alone empties the tanks: about a third of the map, roomier side.
  const best = g.terrain.pads.reduce((a, b) => (b.mult > a.mult ? b : a), g.terrain.pads[0]);
  const bestMid = (best.x1 + best.x2) / 2;
  const dir = bestMid > level.width / 2 ? -1 : 1;
  const sx = clamp(bestMid + dir * level.width * 0.3, 140, level.width - 140);
  let sy = level.height * 0.14;
  if (g.terrain.ceiling) {
    sy = clamp((g.terrain.ceilingAt(sx) + g.terrain.heightAt(sx)) / 2, 0, level.height);
  }
  ship.reset(sx, sy, level.fuel);
  ship.vx = bestMid > sx ? 22 : -22;
  ship.vy = 6;

  g.levelTime = 0;
  g.warn = { low: false, crit: false, dry: false };
  g.cam.x = sx;
  g.cam.y = sy;
  g.cam.scale = 0.8;
  g.cam.trauma = 0;
  g.freeze = 0;
  setState('brief');
}

function launch() {
  setState('play');
  audio.unlock();
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
    if (ev === 'land') return onLand();
    if (ev === 'crash') return onCrash();
    pickups();
  }
}

function pickups() {
  for (const c of g.terrain.fuelCells) {
    if (c.taken) continue;
    if (Math.hypot(c.x - ship.x, c.y - ship.y) < 34) {
      c.taken = true;
      ship.fuel = Math.min(ship.maxFuel, ship.fuel + 22);
      particles.sparks(c.x, c.y, 22, 1);
      particles.ring(c.x, c.y, 140, 0.4, '#ffb347');
      particles.text(c.x, c.y - 20, '+22 FUEL', '#ffb347', 18);
      audio.pickup();
    }
  }
}

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
    const call = (key, at, text, color) => {
      if (g.warn[key] || f > at) return;
      g.warn[key] = true;
      audio.alarm();
      particles.text(ship.x, ship.y - 46, text, color, 18);
    };
    call('low', 0.25, 'FUEL 25%', '#ffb347');
    call('crit', 0.1, 'FUEL CRITICAL', '#ff3b5c');
    call('dry', 0, 'TANKS DRY', '#ff3b5c');
  }

  audio.engines(ship.thrusting && !ship.landed, (ship.rcsLeft || ship.rcsRight) && !ship.landed);
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
  ship.settle(g.terrain);
  if (pad) pad.used = true;
  audio.silence();
  audio.touchdown(offPad ? 'HARD' : q);

  const qf = ENVELOPE[q].q;
  const landing = Math.round(100 * mult * qf);
  const fuelPts = Math.floor(ship.fuel) * 2;
  // Only a clean pad landing extends the streak.
  g.combo = q === 'HARD' || offPad ? Math.max(1, g.combo) : g.combo + 1;
  const comboMult = Math.min(3, 1 + 0.25 * Math.max(0, g.combo - 1));
  const total = Math.round((landing + fuelPts) * comboMult);
  g.score += total;

  particles.text(ship.x, surfaceY - 70, `${offPad ? 'OFF PAD' : q}  +${formatScore(total)}`,
    offPad ? '#ffb347' : q === 'PERFECT' ? '#4dff9f' : q === 'GOOD' ? '#5ff5ff' : '#ffb347', 26);

  g.lastResult = { q, offPad, mult, qf, landing, fuelPts, comboMult, total, fuel: ship.fuel, time: g.levelTime };
  store.setBest(g.level.id, total);
  if (g.score > store.high) { g.newRecord = true; store.high = g.score; }
  if (!g.endless) store.unlocked = g.levelIndex + 2;

  g.freeze = 0.75;
  const tok = g.token;
  setTimeout(() => {
    if (tok !== g.token) return;
    if (!g.endless && g.levelIndex === LEVELS.length - 1) setState('victory');
    else setState('result');
  }, 950);
}

function onCrash() {
  const c = ship.contact || { x: ship.x, y: ship.y };
  particles.explode(c.x, c.y, ship.vx, ship.vy, ship.shards());
  g.cam.trauma = 1;
  ship.alive = false;
  g.combo = 0;
  audio.silence();
  audio.explosion();
  g.lives--;
  g.freeze = 0.12;
  const tok = g.token;
  setTimeout(() => {
    if (tok !== g.token) return;
    setState(g.lives <= 0 ? 'gameover' : 'crash');
  }, 1400);
}

// ------------------------------------------------------------------ loop

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  dt = Math.min(dt, 0.05);
  g.time += dt;
  syncSize();

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

  const t2 = cam.trauma * cam.trauma;
  const sx = (Math.random() - 0.5) * 26 * t2;
  const sy = (Math.random() - 0.5) * 26 * t2;

  ctx.save();
  ctx.translate(W / 2 + sx, H / 2 + sy);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);

  R.drawTerrain(ctx, cam, W, H, g.terrain, g.level, g.time);
  if (g.state === 'play' && ship.alive && !ship.landed) R.drawTrajectory(ctx, ship, g.level, g.terrain, cam);
  particles.draw(ctx);
  R.drawShip(ctx, ship, g.time, cam);
  particles.drawTexts(ctx);
  ctx.restore();

  if (g.state === 'play' || g.state === 'paused') {
    R.drawHUD(ctx, W, H, g);
  }
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

function renderOverlay() {
  const s = g.state;
  if (s === 'play') {
    overlay.className = 'hidden';
    overlay.innerHTML = '';
    return;
  }
  overlay.className = '';
  overlay.innerHTML = screenHTML(s);
}

function screenHTML(s) {
  switch (s) {
    case 'menu':
      return `<div class="screen menu">
        <h1 class="title">TERMINAL<span>VELOCITY</span></h1>
        <p class="tag">A vector lander. Finite fuel. One shot at the pad.</p>
        <div class="stats"><span>HIGH SCORE</span><b>${formatScore(store.high)}</b></div>
        <div class="btns">
          ${btn('campaign', 'FLY CAMPAIGN', true, 'SPACE')}
          ${btn('select', 'MISSIONS')}
          ${btn('endless', 'ENDLESS RUN')}
          ${btn('help', 'HOW TO FLY')}
          ${btn('settings', 'SETTINGS')}
        </div>
        <div class="foot">${audio.muted ? '🔇' : '🔊'} press M to ${audio.muted ? 'unmute' : 'mute'}</div>
      </div>`;

    case 'help':
      return `<div class="screen">
        <h2>HOW TO FLY</h2>
        <div class="keys">
          <div><kbd>SPACE</kbd><kbd>W</kbd><kbd>↑</kbd><span>Main booster — pushes along the nose</span></div>
          <div><kbd>A</kbd><kbd>←</kbd><span>Left attitude burner (rotates you)</span></div>
          <div><kbd>D</kbd><kbd>→</kbd><span>Right attitude burner</span></div>
          <div><kbd>S</kbd><kbd>↓</kbd><span>Attitude hold — burns fuel to kill spin</span></div>
          <div><kbd>R</kbd><span>Retry</span><kbd>P</kbd><span>Pause</span><kbd>M</kbd><span>Mute</span></div>
        </div>
        <p class="body">Prefer arrows that just move the lander? <b>Settings → Steering → Direct</b> turns the
        side burners into sideways thrusters and keeps the hull upright, so left means left with no attitude
        to manage. Classic rotation can also be inverted there.</p>
        <div class="keys">
        </div>
        <p class="body">Land with <b>both legs</b> inside a flashing pad. Keep descent under
        <b>${(ENVELOPE.GOOD.vy / 6).toFixed(1)}</b>, drift under <b>${(ENVELOPE.GOOD.vx / 6).toFixed(1)}</b>
        and tilt inside the green arc. Smaller pads pay bigger multipliers, and leftover fuel is worth points —
        so is a landing streak. Three lander losses ends the run.</p>
        <p class="body">Miss the pad and a clean touchdown on <b>level ground</b> still survives, at the base
        rate with the streak broken. Steep ground, a hard arrival, the hull touching first, or the ice
        ceiling on Europa — those are all wreckage.</p>
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
        <div class="btns">${btn('launch', 'LAUNCH', true, 'SPACE')}${btn('menu', 'ABORT')}</div>
      </div>`;
    }

    case 'result': {
      const r = g.lastResult;
      const color = r.offPad ? '#ffb347' : r.q === 'PERFECT' ? '#4dff9f' : r.q === 'GOOD' ? '#5ff5ff' : '#ffb347';
      const head = r.offPad ? 'DOWN SAFE — OFF PAD' : `${r.q} LANDING`;
      return `<div class="screen">
        <div class="verdict" style="color:${color};text-shadow:0 0 30px ${color}">${head}</div>
        ${r.offPad ? '<p class="body">Level ground held the legs, but there is no bonus off the pad — and the streak resets.</p>' : ''}
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

    case 'crash':
      return `<div class="screen">
        <div class="verdict bad">LANDER LOST</div>
        <p class="body">${crashReason()}</p>
        <div class="stats"><span>LANDERS LEFT</span><b>${g.lives}</b></div>
        <div class="btns">${btn('retry', 'TRY AGAIN', true, 'SPACE')}${btn('menu', 'MENU')}</div>
      </div>`;

    case 'gameover':
      return `<div class="screen">
        <div class="verdict bad">MISSION OVER</div>
        <div class="stats big"><span>FINAL SCORE</span><b>${formatScore(g.score)}</b></div>
        ${g.newRecord ? '<div class="record">NEW RECORD</div>' : `<div class="stats"><span>BEST</span><b>${formatScore(store.high)}</b></div>`}
        <div class="btns">${btn('restart', 'NEW RUN', true, 'SPACE')}${btn('menu', 'MENU')}</div>
      </div>`;

    case 'victory':
      return `<div class="screen">
        <div class="verdict" style="color:#4dff9f;text-shadow:0 0 30px #4dff9f">PROGRAM COMPLETE</div>
        <p class="body">All twelve missions flown. The unsurveyed sectors are open — they do not end.</p>
        <div class="stats big"><span>SCORE</span><b>${formatScore(g.score)}</b></div>
        <div class="btns">${btn('next', 'ENTER ENDLESS', true, 'SPACE')}${btn('menu', 'MENU')}</div>
      </div>`;

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
            ${opt('steering', 'classic', 'CLASSIC', 'Side burners rotate the lander. Point the nose, then burn — the 1969 problem, and the only way to fly the tight pads well.')}
            ${opt('steering', 'direct', 'DIRECT', 'Side burners push the lander sideways and the hull stays upright. Left means left on its own, no attitude to manage.')}
          </div>
        </div>
        <div class="setting${settings.steering === 'direct' ? ' dimmed' : ''}">
          <div class="setting-name">ROTATION${settings.steering === 'direct' ? ' — classic only' : ''}</div>
          <div class="opts">
            ${opt('invertRotation', false, 'NORMAL', 'Left burner tips the nose left, so left plus booster drifts you left.')}
            ${opt('invertRotation', true, 'INVERTED', 'Left burner tips the nose right. Some pilots read the stick the other way round.')}
          </div>
        </div>
        <div class="btns">${btn('back', 'DONE', true, 'SPACE')}</div>
      </div>`;
    }

    case 'paused':
      return `<div class="screen">
        <h2>PAUSED</h2>
        <div class="btns">${btn('resume', 'RESUME', true, 'P')}${btn('retry', 'RESTART MISSION', false, 'R')}${btn('settings', 'SETTINGS')}${btn('menu', 'MENU')}</div>
      </div>`;
  }
  return '';
}

function crashReason() {
  const tilt = Math.abs(normalizeAngle(ship.angle)) / DEG;
  if (g.terrain.ceiling && ship.contact && ship.contact.y < g.terrain.height * 0.5) return 'Struck the ice ceiling.';
  if (ship.fuel <= 0) return 'Tanks dry on final approach.';
  if (Math.abs(ship.vy) > ENVELOPE.HARD.vy) return `Descent rate ${(Math.abs(ship.vy) / 6).toFixed(1)} — far outside the envelope.`;
  if (Math.abs(ship.vx) > ENVELOPE.HARD.vx) return `Lateral drift ${(Math.abs(ship.vx) / 6).toFixed(1)} — the legs sheared off.`;
  if (tilt > 15) return `Attitude ${tilt.toFixed(0)}° off vertical at contact.`;
  return 'Touched down off the pad. The surface is not level enough to hold a lander.';
}

// ------------------------------------------------------------------ actions

function act(action) {
  audio.unlock();
  audio.ui();
  if (action.startsWith('set:')) {
    const [, key, raw] = action.split(':');
    settings[key] = raw === 'true' ? true : raw === 'false' ? false : raw;
    saveSettings();
    renderOverlay();
    return;
  }
  if (action.startsWith('go:')) {
    const i = +action.slice(3);
    g.endless = false;
    g.score = 0; g.lives = 3; g.combo = 0; g.newRecord = false;
    startLevel(i);
    return;
  }
  switch (action) {
    case 'campaign':
      g.endless = false;
      g.score = 0; g.lives = 3; g.combo = 0; g.newRecord = false;
      startLevel(Math.min(store.unlocked - 1, LEVELS.length - 1));
      break;
    case 'endless':
      g.endless = true;
      g.score = 0; g.lives = 3; g.combo = 0; g.newRecord = false;
      startLevel(LEVELS.length);
      break;
    case 'select': setState('select'); break;
    case 'settings': g.settingsFrom = g.state; setState('settings'); break;
    case 'help': setState('help'); break;
    case 'back': setState(g.settingsFrom === 'paused' ? 'paused' : 'menu'); g.settingsFrom = null; break;
    case 'launch': launch(); break;
    case 'next':
      if (g.state === 'victory') { g.endless = true; startLevel(LEVELS.length); }
      else startLevel(g.levelIndex + 1);
      break;
    case 'retry': startLevel(g.levelIndex, true); break;
    case 'menu': g.level = null; setState('menu'); break;
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
  if (s === 'menu') act('campaign');
  else if (s === 'brief') act('launch');
  else if (s === 'result' || s === 'victory') act('next');
  else if (s === 'crash') act('retry');
  else if (s === 'gameover') act('restart');
  else if (s === 'help' || s === 'select') act('back');
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
  if (g.state === 'play' || g.state === 'paused') pause();
  else if (g.state !== 'menu') act('menu');
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

window.addEventListener('pointerdown', () => audio.unlock(), { once: true });

setState('menu');
requestAnimationFrame(frame);

// expose for debugging / automated tests
window.__game = g;
window.__ship = ship;
window.__act = act;
window.__input = input;
window.__settings = settings;

/** Opened by the macOS app's Settings menu item (Cmd-,). */
window.__openSettings = () => {
  if (g.state === 'play') { audio.silence(); g.settingsFrom = 'paused'; }
  else g.settingsFrom = g.state;
  setState('settings');
};
