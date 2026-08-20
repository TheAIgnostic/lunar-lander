// Drawing the machines: every enemy, its telegraph, its wreck, its shots, and
// the two combat visuals the lander itself owns (the laser and the shield).
// Split from render.js in M23, before the six remaining enemy designs land -
// each new design is an ENEMY_TYPES entry plus a draw function here.

import { FONT, GREEN, RED, CYAN, AMBER } from './drawkit.js';
import { ENEMY_TYPES } from './enemies.js';
import { clamp, TAU } from './util.js';

export function drawEnemies(ctx, field, ship, time, opts = {}) {
  if (!field) return;
  for (const e of field.enemies) {
    const type = ENEMY_TYPES[e.type];
    if (e.dead) { drawWreck(ctx, e, type); continue; }
    if (type.kind === 'ground') drawTurret(ctx, e, type, time, opts);
    else drawDrone(ctx, e, type, time, opts);
    drawTelegraph(ctx, e, type, time, opts);
    if (e.hp < e.maxHp) drawEnemyHealth(ctx, e, type);
    if (opts.contrast) drawThreatMark(ctx, e, type);
    if (opts.showPaths) drawEnemyRange(ctx, e, type);
  }
  for (const p of field.shots) drawShot(ctx, p, time);
}

function threatAlpha(e) {
  return e.hitFlash > 0 ? 1 : 0.85;
}

function drawTurret(ctx, e, type, time, opts = {}) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const hot = e.state === 'telegraph';
  const col = e.hitFlash > 0 ? '#ffffff' : hot ? RED : e.state === 'idle' ? 'rgba(190,205,220,0.75)' : AMBER;
  ctx.strokeStyle = col;
  ctx.fillStyle = 'rgba(10,14,22,0.9)';
  ctx.lineWidth = 2;
  ctx.globalAlpha = threatAlpha(e);
  // barrel first, so the base caps it
  ctx.save();
  ctx.rotate(e.aim);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(type.radius + 12, 0);
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-type.radius, type.radius);
  ctx.lineTo(-type.radius * 0.7, -type.radius * 0.3);
  ctx.lineTo(type.radius * 0.7, -type.radius * 0.3);
  ctx.lineTo(type.radius, type.radius);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // the eye: dark asleep, lit awake, pulsing while it charges
  const eye = hot ? 1 : e.alert;
  if (eye > 0.05) {
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    const f = opts.flash != null ? opts.flash : 1;
    ctx.shadowBlur = 10 * eye * (hot ? 1.4 + Math.sin(time * 18) * 0.4 * f : 1);
    ctx.beginPath();
    ctx.arc(0, -type.radius * 0.55, 3.2, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

/**
 * The Seeker Drone: a mine-site guard, not a spaceship.
 *
 * It was a plain diamond, which read as "generic enemy" rather than as a thing
 * that used to patrol these workings. Now it is a squat armoured body slung
 * under a ducted rotor, with a caged sensor head and a hazard stripe - the
 * shape of equipment somebody bolted together to watch a mine, and still
 * unmistakable at a glance from the ground gun.
 */
function drawDrone(ctx, e, type, time, opts = {}) {
  ctx.save();
  ctx.translate(e.x, e.y);
  const hot = e.state === 'telegraph';
  const col = e.hitFlash > 0 ? '#ffffff' : hot ? RED : e.state === 'idle' ? 'rgba(190,205,220,0.8)' : AMBER;
  const bob = Math.sin(time * 3 + e.beat) * 2.4;
  ctx.translate(0, bob);
  ctx.strokeStyle = col;
  ctx.fillStyle = 'rgba(10,14,22,0.92)';
  ctx.lineWidth = 2;
  ctx.globalAlpha = threatAlpha(e);
  const r = type.radius;

  // Rotor duct above the hull, and the blade blur inside it.
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.86, r * 0.95, r * 0.26, 0, 0, TAU);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = threatAlpha(e) * 0.55;
  const blade = time * (hot ? 26 : 15) + e.beat;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.86, r * 0.8 * Math.abs(Math.cos(blade)) + 1.5, r * 0.16, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
  // Mast joining the duct to the body.
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.86);
  ctx.lineTo(0, -r * 0.42);
  ctx.stroke();

  // Squat armoured body with a chamfered underside.
  ctx.beginPath();
  ctx.moveTo(-r * 0.82, -r * 0.40);
  ctx.lineTo(r * 0.82, -r * 0.40);
  ctx.lineTo(r * 0.60, r * 0.34);
  ctx.lineTo(-r * 0.60, r * 0.34);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Hazard stripe along the flank - mine equipment, painted to be seen.
  ctx.save();
  ctx.globalAlpha = threatAlpha(e) * 0.7;
  ctx.lineWidth = 1.2;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * r * 0.28 - 3, -r * 0.36);
    ctx.lineTo(i * r * 0.28 + 3, -r * 0.06);
    ctx.stroke();
  }
  ctx.restore();

  // Landing skids, so it reads as something that sets down between patrols.
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-r * 0.66, r * 0.34);
  ctx.lineTo(-r * 0.80, r * 0.72);
  ctx.moveTo(r * 0.66, r * 0.34);
  ctx.lineTo(r * 0.80, r * 0.72);
  ctx.moveTo(-r * 1.0, r * 0.72);
  ctx.lineTo(-r * 0.55, r * 0.72);
  ctx.moveTo(r * 0.55, r * 0.72);
  ctx.lineTo(r * 1.0, r * 0.72);
  ctx.stroke();

  // Caged sensor head, aimed where the drone is looking.
  const eye = hot ? 1 : Math.max(0.2, e.alert);
  ctx.save();
  ctx.translate(0, r * 0.02);
  ctx.rotate(e.aim || 0);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.30, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 12 * eye;
  ctx.beginPath();
  ctx.arc(r * 0.10, 0, 2.4, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.restore();
}

/**
 * High contrast: a white ring and a letter, so a threat is identifiable by
 * shape and glyph with no colour perception at all. T for the ground gun, D for
 * the drone - the same letters the briefing uses.
 */
function drawThreatMark(ctx, e, type) {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(e.x, e.y, type.radius + 8, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(type.kind === 'ground' ? 'T' : 'D', e.x, e.y - type.radius - 14);
  ctx.restore();
}

function drawWreck(ctx, e, type) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.tilt || 0);
  ctx.globalAlpha = e.grounded ? 0.45 : 0.7;
  ctx.strokeStyle = 'rgba(120,135,150,0.7)';
  ctx.lineWidth = 1.6;
  const r = type.radius;
  // A broken hull, plus a snapped strut - readable as debris rather than as a
  // shape hanging in the air, which is what it used to look like.
  ctx.beginPath();
  ctx.moveTo(-r * 0.8, r * 0.3);
  ctx.lineTo(-r * 0.25, -r * 0.25);
  ctx.lineTo(r * 0.45, r * 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, r * 0.35);
  ctx.lineTo(r * 0.7, -r * 0.1);
  ctx.stroke();
  ctx.restore();
}

/** The locked aim line and the closing ring: everything the player gets to react to. */
function drawTelegraph(ctx, e, type, time, opts) {
  const tracking = e.state === 'track';
  const charging = e.state === 'telegraph';
  // Threat Analysis is what turns the tracking phase visible; without it the
  // warning starts when the aim locks, which is still a full second of notice.
  if (!charging && !(tracking && opts.threatWarning)) return;

  const frac = charging ? 1 - clamp(e.timer / type.telegraph, 0, 1) : 0.25;
  const dir = charging ? Math.atan2(e.aimY - e.y, e.aimX - e.x) : e.aim;
  const len = type.range * (charging ? 0.35 + 0.65 * frac : 0.3);

  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(dir);
  ctx.strokeStyle = charging ? RED : 'rgba(255,179,71,0.55)';
  ctx.globalAlpha = charging ? 0.35 + 0.4 * frac : 0.4;
  ctx.lineWidth = charging ? 1.4 + frac * 1.8 : 1;
  ctx.setLineDash(charging ? [] : [6, 9]);
  ctx.beginPath();
  ctx.moveTo(type.radius, 0);
  ctx.lineTo(len, 0);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  if (!charging) return;
  // The ring closes on the muzzle: shape carries the timing, not just colour.
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.strokeStyle = RED;
  ctx.globalAlpha = 0.5 + 0.4 * frac;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, type.radius + 26 * (1 - frac) + 6, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawEnemyHealth(ctx, e, type) {
  const w = type.radius * 2;
  const x = e.x - w / 2;
  const y = e.y - type.radius - 12;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = GREEN;
  ctx.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), 3);
  ctx.restore();
}

/** Debug only: how far this machine can actually reach. */
function drawEnemyRange(ctx, e, type) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,59,92,0.22)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 8]);
  ctx.beginPath();
  ctx.arc(e.x, e.y, type.range, 0, TAU);
  ctx.stroke();
  if (type.minRange) {
    ctx.strokeStyle = 'rgba(77,255,159,0.22)';
    ctx.beginPath();
    ctx.arc(e.x, e.y, type.minRange, 0, TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawShot(ctx, p, time) {
  const sp = Math.hypot(p.vx, p.vy) || 1;
  const tail = 14;
  ctx.save();
  ctx.strokeStyle = RED;
  ctx.shadowColor = RED;
  ctx.shadowBlur = 10;
  ctx.lineWidth = p.radius;
  ctx.beginPath();
  ctx.moveTo(p.x - (p.vx / sp) * tail, p.y - (p.vy / sp) * tail);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** The laser beam, drawn from the lander to whatever it is burning. */
export function drawBeam(ctx, beam, time) {
  if (!beam) return;
  ctx.save();
  const flicker = 0.7 + Math.sin(time * 40) * 0.3;
  ctx.strokeStyle = CYAN;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 16;
  ctx.globalAlpha = 0.55 + 0.3 * flicker;
  ctx.lineWidth = 2 + flicker * 2;
  ctx.beginPath();
  ctx.moveTo(beam.x1, beam.y1);
  ctx.lineTo(beam.x2, beam.y2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.restore();
}

/** A raised shield, drawn as a bubble that thins as its pool is spent. */
export function drawShield(ctx, ship, pool, time) {
  if (!ship.shieldActive || ship.shieldHp <= 0) return;
  const f = clamp(ship.shieldHp / Math.max(1, pool), 0, 1);
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.strokeStyle = '#7ef2d0';
  ctx.shadowColor = '#7ef2d0';
  ctx.shadowBlur = 14;
  ctx.globalAlpha = 0.25 + 0.45 * f;
  ctx.lineWidth = 1 + 2 * f;
  ctx.beginPath();
  ctx.arc(0, 0, 30 + Math.sin(time * 6) * 1.5, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

