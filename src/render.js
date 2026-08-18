// All drawing: parallax background, world, ship, and the flight HUD.

import { clamp, lerp, TAU, DEG, makeRng } from './util.js';
import { HULL, LEGS, ENVELOPE, normalizeAngle } from './ship.js';
import { WORLDS } from './levels.js';

const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const GREEN = '#4dff9f';
const RED = '#ff3b5c';
const CYAN = '#5ff5ff';
const MAG = '#ff4fd8';
const AMBER = '#ffb347';

export function buildBackdrop(level, terrain, seed) {
  const rng = makeRng(seed ^ 0x9e3779b9);
  const stars = [];
  for (let i = 0; i < 320; i++) {
    stars.push({
      x: rng.range(-200, level.width + 200),
      y: rng.range(0, level.height * 0.9),
      r: rng.range(0.4, 1.7),
      l: rng.int(0, 2),
      tw: rng.range(0, 6.28),
    });
  }
  const ranges = [];
  for (let k = 0; k < 2; k++) {
    const pts = [];
    const n = 34;
    const baseY = level.height - 240 + k * 90;
    let y = baseY;
    for (let i = 0; i <= n; i++) {
      y += rng.range(-1, 1) * (90 - k * 34);
      y = clamp(y, level.height * 0.52 + k * 60, level.height - 120 + k * 60);
      pts.push({ x: (level.width * 1.2 * i) / n - level.width * 0.1, y });
    }
    ranges.push(pts);
  }
  const planet = {
    x: rng.range(0.2, 0.8) * level.width,
    y: level.height * rng.range(0.16, 0.3),
    r: rng.range(120, 210),
  };
  return { stars, ranges, planet };
}

export function drawBackground(ctx, W, H, cam, level, backdrop, time) {
  const w = WORLDS[level.world];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, w.sky[0]);
  g.addColorStop(1, w.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Planet disc, nearly fixed.
  const px = W / 2 + (backdrop.planet.x - cam.x) * 0.06 * cam.scale;
  const py = H / 2 + (backdrop.planet.y - cam.y) * 0.06 * cam.scale;
  const pr = backdrop.planet.r * cam.scale;
  const pg = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr);
  pg.addColorStop(0, w.planet);
  pg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, TAU);
  ctx.fill();

  // Stars, three parallax layers.
  const depth = [0.12, 0.22, 0.36];
  for (const s of backdrop.stars) {
    const d = depth[s.l];
    const x = W / 2 + (s.x - cam.x) * d * cam.scale;
    const y = H / 2 + (s.y - cam.y) * d * cam.scale;
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    const tw = 0.55 + 0.45 * Math.sin(time * 1.6 + s.tw);
    ctx.fillStyle = `rgba(200,230,255,${(0.25 + s.l * 0.28) * tw})`;
    ctx.beginPath();
    ctx.arc(x, y, s.r, 0, TAU);
    ctx.fill();
  }

  // Silhouetted mountain ranges.
  backdrop.ranges.forEach((pts, k) => {
    const d = 0.3 + k * 0.18;
    ctx.beginPath();
    ctx.moveTo(-20, H + 20);
    for (const p of pts) {
      const x = W / 2 + (p.x - cam.x) * d * cam.scale;
      const y = H / 2 + (p.y - cam.y) * d * cam.scale;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W + 20, H + 20);
    ctx.closePath();
    ctx.fillStyle = k === 0 ? shade(w.hill, -0.35) : w.hill;
    ctx.fill();
  });
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) * (1 + amt), 0, 255) | 0;
  const g = clamp(((n >> 8) & 255) * (1 + amt), 0, 255) | 0;
  const b = clamp((n & 255) * (1 + amt), 0, 255) | 0;
  return `rgb(${r},${g},${b})`;
}

export function drawTerrain(ctx, cam, W, H, terrain, level, time) {
  const w = WORLDS[level.world];
  const half = W / 2 / cam.scale;
  const x0 = clamp(cam.x - half - 60, 0, terrain.width);
  const x1 = clamp(cam.x + half + 60, 0, terrain.width);
  const i0 = Math.max(0, Math.floor(x0 / terrain.step) - 1);
  const i1 = Math.min(terrain.n - 1, Math.ceil(x1 / terrain.step) + 1);

  // Ground body
  ctx.beginPath();
  ctx.moveTo(i0 * terrain.step, level.height + 400);
  for (let i = i0; i <= i1; i++) ctx.lineTo(i * terrain.step, terrain.h[i]);
  ctx.lineTo(i1 * terrain.step, level.height + 400);
  ctx.closePath();
  const gg = ctx.createLinearGradient(0, level.height * 0.5, 0, level.height);
  gg.addColorStop(0, shade(w.hill, 0.25));
  gg.addColorStop(1, '#04050a');
  ctx.fillStyle = gg;
  ctx.fill();

  // Glowing surface line
  ctx.save();
  ctx.strokeStyle = w.accent;
  ctx.lineWidth = 2 / cam.scale + 0.6;
  ctx.shadowColor = w.accent;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  for (let i = i0; i <= i1; i++) {
    const x = i * terrain.step;
    if (i === i0) ctx.moveTo(x, terrain.h[i]);
    else ctx.lineTo(x, terrain.h[i]);
  }
  ctx.stroke();
  ctx.restore();

  if (terrain.ceiling) {
    ctx.beginPath();
    ctx.moveTo(i0 * terrain.step, -400);
    for (let i = i0; i <= i1; i++) ctx.lineTo(i * terrain.step, terrain.ceiling[i]);
    ctx.lineTo(i1 * terrain.step, -400);
    ctx.closePath();
    const cg = ctx.createLinearGradient(0, 0, 0, level.height * 0.5);
    cg.addColorStop(0, '#04050a');
    cg.addColorStop(1, shade(w.hill, 0.35));
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.save();
    ctx.strokeStyle = '#9be8ff';
    ctx.lineWidth = 2 / cam.scale + 0.5;
    ctx.shadowColor = '#9be8ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      const x = i * terrain.step;
      if (i === i0) ctx.moveTo(x, terrain.ceiling[i]);
      else ctx.lineTo(x, terrain.ceiling[i]);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Micro detail: boulders and debris sitting on the surface.
  if (terrain.rocks && terrain.rocks.length) {
    ctx.save();
    ctx.fillStyle = 'rgba(4,7,14,0.92)';
    ctx.strokeStyle = shade(w.hill, 0.55);
    ctx.lineWidth = 1.1 / cam.scale + 0.3;
    for (const r of terrain.rocks) {
      if (r.x < x0 - 40 || r.x > x1 + 40) continue;
      ctx.save();
      ctx.translate(r.x, r.y - r.r * 0.42);
      ctx.rotate(r.tilt);
      ctx.beginPath();
      r.pts.forEach((pt, i) => (i ? ctx.lineTo(pt[0], pt[1]) : ctx.moveTo(pt[0], pt[1])));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // Pads
  for (const p of terrain.pads) {
    if (p.x2 < x0 - 200 || p.x1 > x1 + 200) continue;
    const pulse = 0.6 + 0.4 * Math.sin(time * 3.4 + p.x1 * 0.01);
    ctx.save();
    ctx.strokeStyle = p.used ? '#4dff9f' : MAG;
    ctx.shadowColor = p.used ? '#4dff9f' : MAG;
    ctx.shadowBlur = 18 * pulse;
    ctx.lineWidth = 4 / cam.scale + 1.4;
    const py1 = p.y1 != null ? p.y1 : p.y;
    const py2 = p.y2 != null ? p.y2 : p.y;
    ctx.beginPath();
    ctx.moveTo(p.x1, py1);
    ctx.lineTo(p.x2, py2);
    ctx.stroke();

    ctx.setLineDash([]);

    // Approach markers
    ctx.lineWidth = 1.5 / cam.scale + 0.5;
    ctx.globalAlpha = 0.35 + 0.35 * pulse;
    [[p.x1, py1], [p.x2, py2]].forEach(([ex, ey]) => {
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex, ey - 30 - 14 * pulse);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 10;
    ctx.fillStyle = p.used ? '#4dff9f' : MAG;
    ctx.font = `700 ${18}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(p.used ? 'SECURED' : `x${p.mult}`, (p.x1 + p.x2) / 2, p.y - 44);
    if (p.fragile && !p.used) {
      ctx.font = `600 11px ${FONT}`;
      ctx.fillText(`ICE · max ${(p.fragile / 6).toFixed(1)} m/s`, (p.x1 + p.x2) / 2, p.y - 28);
    }
    ctx.restore();
  }

  // Fuel cells
  for (const c of terrain.fuelCells) {
    if (c.taken) continue;
    const bob = Math.sin(time * 2 + c.phase) * 6;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    ctx.rotate(time * 0.8);
    ctx.strokeStyle = AMBER;
    ctx.shadowColor = AMBER;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const x = Math.cos(a) * 13;
      const y = Math.sin(a) * 13;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.rotate(-time * 0.8);
    ctx.fillStyle = AMBER;
    ctx.font = `700 12px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('F', 0, 0);
    ctx.restore();
  }
}

/**
 * Dust haze over the world. The pads are redrawn on top afterwards: the spec is
 * explicit that the safe pad must stay visually distinct even in low
 * visibility, so dust hides the terrain, not the target.
 */
export function drawDust(ctx, W, H, level, visibility, time) {
  const v = clamp(visibility, 0, 1);
  if (v > 0.985) return;
  const w = WORLDS[level.world];
  const density = 1 - v;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgba(${w.dustRGB || '150,90,60'},${(density * 0.5).toFixed(3)})`);
  g.addColorStop(1, `rgba(${w.dustRGB || '150,90,60'},${(density * 0.78).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // drifting streaks, so the front reads as moving rather than as a filter
  ctx.save();
  ctx.globalAlpha = density * 0.5;
  ctx.strokeStyle = `rgba(${w.dustRGB || '150,90,60'},0.8)`;
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    const y = ((i * 137 + time * 40 * (1 + (i % 3) * 0.4)) % (H + 60)) - 30;
    const x = ((i * 271 + time * 130 * (1 + (i % 4) * 0.3)) % (W + 220)) - 110;
    const len = 60 + (i % 5) * 34;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + 5);
    ctx.stroke();
  }
  ctx.restore();
}

/** Pad markers only, drawn above the dust so the target never disappears. */
export function drawPadBeacons(ctx, cam, W, H, terrain, level, time, strength) {
  if (strength <= 0.02) return;
  const half = W / 2 / cam.scale;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);
  for (const p of terrain.pads) {
    if (p.x2 < cam.x - half - 200 || p.x1 > cam.x + half + 200) continue;
    const pulse = 0.6 + 0.4 * Math.sin(time * 3.4 + p.x1 * 0.01);
    const py1 = p.y1 != null ? p.y1 : p.y;
    const py2 = p.y2 != null ? p.y2 : p.y;
    ctx.globalAlpha = clamp(strength, 0, 1) * (0.65 + 0.35 * pulse);
    ctx.strokeStyle = p.used ? '#4dff9f' : MAG;
    ctx.shadowColor = p.used ? '#4dff9f' : MAG;
    ctx.shadowBlur = 26 * pulse;
    ctx.lineWidth = 4 / cam.scale + 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x1, py1);
    ctx.lineTo(p.x2, py2);
    ctx.stroke();
    ctx.lineWidth = 2 / cam.scale;
    for (const [ex, ey] of [[p.x1, py1], [p.x2, py2]]) {
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex, ey - 46 - 16 * pulse);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawShip(ctx, ship, time, cam) {
  if (!ship.alive) return;
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  // Exhaust plume (drawn behind the hull, pointing down-local).
  if (ship.throttle > 0.02) {
    const t = ship.throttle;
    const flick = 0.75 + Math.random() * 0.5;
    const len = (26 + 30 * t) * flick;
    const wdt = 7 + 3 * t;
    const grad = ctx.createLinearGradient(0, 8, 0, 8 + len);
    grad.addColorStop(0, 'rgba(255,255,235,0.95)');
    grad.addColorStop(0.35, 'rgba(255,175,80,0.75)');
    grad.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-wdt, 8);
    ctx.lineTo(wdt, 8);
    ctx.lineTo(0, 8 + len);
    ctx.closePath();
    ctx.fill();
  }
  if (ship.rcsLeft || ship.rcsRight) {
    ctx.fillStyle = 'rgba(190,245,255,0.8)';
    const side = ship.rcsLeft ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(side * 11, -6);
    ctx.lineTo(side * 24, -9);
    ctx.lineTo(side * 11, -1);
    ctx.closePath();
    ctx.fill();
  }

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 16;

  // Hull fill + stroke
  ctx.beginPath();
  HULL.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fillStyle = 'rgba(10,26,40,0.92)';
  ctx.fill();
  ctx.strokeStyle = CYAN;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Window
  ctx.beginPath();
  ctx.arc(0, -6, 3.4, 0, TAU);
  ctx.fillStyle = ship.fuel > 0 ? '#bff8ff' : RED;
  ctx.fill();

  // Legs
  ctx.strokeStyle = '#9fe8ff';
  ctx.lineWidth = 2;
  for (const l of LEGS) {
    ctx.beginPath();
    ctx.moveTo(l[0][0], l[0][1]);
    ctx.lineTo(l[1][0], l[1][1]);
    ctx.stroke();
  }

  // Nozzle
  ctx.beginPath();
  ctx.moveTo(-5, 5);
  ctx.lineTo(-7, 9);
  ctx.lineTo(7, 9);
  ctx.lineTo(5, 5);
  ctx.strokeStyle = CYAN;
  ctx.stroke();

  // Low-fuel beacon
  if (ship.fuel / ship.maxFuel < 0.22 && Math.sin(time * 9) > 0) {
    ctx.beginPath();
    ctx.arc(0, -15, 2.6, 0, TAU);
    ctx.fillStyle = RED;
    ctx.shadowColor = RED;
    ctx.shadowBlur = 14;
    ctx.fill();
  }
  ctx.restore();
}

/** Dotted predicted path a couple of seconds ahead - a real pilot aid. */
export function drawTrajectory(ctx, ship, level, terrain, cam) {
  if (!ship.alive || ship.landed) return;
  let x = ship.x;
  let y = ship.y;
  let vx = ship.vx;
  let vy = ship.vy;
  const dt = 1 / 30;
  ctx.save();
  ctx.setLineDash([3, 9]);
  ctx.strokeStyle = 'rgba(95,245,255,0.4)';
  ctx.lineWidth = 1.6 / cam.scale + 0.4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < 70; i++) {
    vy += level.gravity * dt;
    const w = ship.windNow || 0;
    if (level.drag) {
      vx += (w - vx) * level.drag * dt;
      vy += -vy * level.drag * 0.5 * dt;
    } else if (level.wind) {
      vx += w * dt;
    }
    x += vx * dt;
    y += vy * dt;
    if (y > terrain.heightAt(x) || x < 0 || x > level.width) break;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ---------------------------------------------------------------- HUD

function panel(ctx, x, y, w, h, accent = 'rgba(95,245,255,0.25)') {
  ctx.fillStyle = 'rgba(5,10,20,0.55)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
}

function label(ctx, text, x, y, size = 10, color = 'rgba(160,190,215,0.75)') {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

function value(ctx, text, x, y, size = 20, color = '#dff6ff') {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

export function drawHUD(ctx, W, H, g) {
  const { ship, terrain, level, score, lives, combo, time, compact } = g;
  const s = compact ? 0.8 : 1;
  const alt = Math.max(0, (terrain.heightAt(ship.x) - ship.y - 16) / 6);
  const st = ship.status();
  const fuelPct = ship.fuel / ship.maxFuel;

  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // ---- left instrument stack
  const px = 16;
  const py = 16;
  const pw = 216 * s;
  const ph = 150 * s;
  panel(ctx, px, py, pw, ph);

  label(ctx, 'FUEL', px + 14, py + 22 * s, 10 * s);
  const bx = px + 14;
  const by = py + 30 * s;
  const bw = pw - 28;
  const bh = 12 * s;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(bx, by, bw, bh);
  const fc = fuelPct > 0.4 ? CYAN : fuelPct > 0.18 ? AMBER : RED;
  ctx.fillStyle = fc;
  ctx.shadowColor = fc;
  ctx.shadowBlur = fuelPct < 0.18 && Math.sin(time * 8) > 0 ? 18 : 8;
  ctx.fillRect(bx, by, bw * fuelPct, bh);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = '#dff6ff';
  ctx.font = `700 ${11 * s}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(fuelPct * 100)}%`, bx + bw, py + 22 * s);

  const rad = ship.statusLevels ? ship.statusLevels.radiation : 0;
  const noise = clamp(rad / 100, 0, 1) * (ship.env && ship.env.shielded ? 0.25 : 1);

  const rowY = py + 66 * s;
  const gap = 26 * s;
  // Radiation scrambles the instruments long before it does anything else -
  // a consequence the player can read without a damage model.
  const fuzz = (v, d = 1) => (noise > 0.25
    ? (v + (Math.random() - 0.5) * noise * (d === 0 ? 14 : 4)).toFixed(d)
    : v.toFixed(d));
  readout(ctx, 'ALT', `${fuzz(alt, 0)}m`, px + 14, rowY, s, '#dff6ff');
  readout(ctx, 'V-SPD', `${fuzz(Math.abs(ship.vy / 6))}`, px + 14, rowY + gap, s, st.vy ? GREEN : RED,
    ship.vy < 0 ? '↑' : '↓');
  readout(ctx, 'H-SPD', `${fuzz(Math.abs(ship.vx / 6))}`, px + 14, rowY + gap * 2, s, st.vx ? GREEN : RED,
    ship.vx < 0 ? '←' : '→');

  // tilt bubble on the right of the stack
  const tx = px + pw - 40 * s;
  const ty = rowY + gap * 0.6;
  drawTiltGauge(ctx, tx, ty, 26 * s, ship.angle, st.tilt);

  // ---- top-centre mission bar
  const label1 = `${level.world} · ${level.title}`;
  ctx.font = `700 ${13 * s}px ${FONT}`;
  const tw = ctx.measureText(label1).width;
  const mw = Math.max(tw + 40, 200);
  panel(ctx, W / 2 - mw / 2, py, mw, 30 * s);
  ctx.fillStyle = WORLDS[level.world].accent;
  ctx.textAlign = 'center';
  ctx.fillText(label1, W / 2, py + 20 * s);

  // ---- right score stack
  const rw = 190 * s;
  const rx = W - rw - 16;
  panel(ctx, rx, py, rw, 86 * s);
  label(ctx, 'SCORE', rx + 14, py + 22 * s, 10 * s);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#dff6ff';
  ctx.font = `700 ${24 * s}px ${FONT}`;
  ctx.fillText(Math.round(score).toLocaleString('en-US'), rx + rw - 14, py + 46 * s);
  ctx.textAlign = 'left';
  label(ctx, 'STREAK', rx + 14, py + 68 * s, 10 * s);
  ctx.textAlign = 'right';
  ctx.fillStyle = combo > 1 ? MAG : 'rgba(200,220,235,0.6)';
  ctx.font = `700 ${13 * s}px ${FONT}`;
  ctx.fillText(combo > 1 ? `x${(1 + 0.25 * (combo - 1)).toFixed(2)}` : '--', rx + rw - 14, py + 68 * s);

  // lives
  ctx.textAlign = 'left';
  for (let i = 0; i < 3; i++) {
    const cx = rx + 14 + i * 16;
    const cy = py + 96 * s + 8;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 5);
    ctx.lineTo(cx + 5, cy - 5);
    ctx.lineTo(cx + 10, cy + 5);
    ctx.closePath();
    ctx.strokeStyle = i < lives ? CYAN : 'rgba(120,140,160,0.35)';
    ctx.fillStyle = i < lives ? 'rgba(95,245,255,0.35)' : 'transparent';
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();
  }

  // ---- wind vane, tucked under the mission bar so it never sits over the pad
  if (level.wind || level.gust) {
    const wx = W / 2;
    const wy = py + 60 * s;
    const w = ship.windNow || 0;
    const mag = clamp(Math.abs(w) / 70, 0.12, 1);
    panel(ctx, wx - 80, wy - 22, 160, 44, 'rgba(255,179,71,0.3)');
    ctx.fillStyle = 'rgba(160,190,215,0.75)';
    ctx.font = `600 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('WIND', wx, wy - 8);
    ctx.strokeStyle = AMBER;
    ctx.shadowColor = AMBER;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 2.4;
    const dir = Math.sign(w) || 1;
    const len = 54 * mag;
    ctx.beginPath();
    ctx.moveTo(wx - dir * len * 0.5, wy + 8);
    ctx.lineTo(wx + dir * len * 0.5, wy + 8);
    ctx.lineTo(wx + dir * len * 0.5 - dir * 8, wy + 3);
    ctx.moveTo(wx + dir * len * 0.5, wy + 8);
    ctx.lineTo(wx + dir * len * 0.5 - dir * 8, wy + 13);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // ---- radiation state
  if (ship.env && (ship.env.radiationSweep > 0.02 || rad > 1)) {
    const rx = W / 2 - 80;
    const ry = py + (level.wind || level.gust ? 104 * s : 60 * s);
    panel(ctx, rx, ry - 22, 160, 44, 'rgba(126,242,208,0.35)');
    ctx.textAlign = 'center';
    ctx.font = `600 10px ${FONT}`;
    ctx.fillStyle = 'rgba(160,190,215,0.75)';
    ctx.fillText(ship.env.shielded ? 'RADIATION · SHIELDED' : 'RADIATION', W / 2, ry - 8);
    const bw = 132;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(W / 2 - bw / 2, ry + 2, bw, 8);
    const col = ship.env.shielded ? '#7ef2d0' : rad > 60 ? RED : AMBER;
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = ship.env.radiationSweep > 0.4 && !ship.env.shielded ? 14 : 4;
    ctx.fillRect(W / 2 - bw / 2, ry + 2, bw * clamp(rad / 100, 0, 1), 8);
    ctx.shadowBlur = 0;
  }

  // ---- off-screen pad chevrons
  drawPadPointers(ctx, W, H, g);

  // ---- proximity alarm vignette
  const danger = alt < 60 && ship.vy > ENVELOPE.GOOD.vy * 1.4 && ship.alive && !ship.landed;
  if (danger) {
    const a = 0.18 + 0.14 * Math.sin(time * 14);
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vg.addColorStop(0, 'rgba(255,59,92,0)');
    vg.addColorStop(1, `rgba(255,59,92,${a})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = RED;
    ctx.font = `700 ${16 * s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('PULL UP', W / 2, H - 96);
  }
  ctx.restore();
}

function readout(ctx, name, val, x, y, s, color, arrow = '') {
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(160,190,215,0.7)';
  ctx.font = `600 ${10 * s}px ${FONT}`;
  ctx.fillText(name, x, y - 12 * s);
  ctx.fillStyle = color;
  ctx.font = `700 ${17 * s}px ${FONT}`;
  ctx.fillText(`${arrow}${val}`, x, y + 4 * s);
}

function drawTiltGauge(ctx, cx, cy, r, angle, ok) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  // green safe arc
  ctx.strokeStyle = 'rgba(77,255,159,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2 - ENVELOPE.GOOD.tilt, -Math.PI / 2 + ENVELOPE.GOOD.tilt);
  ctx.stroke();
  ctx.rotate(normalizeAngle(angle));
  ctx.strokeStyle = ok ? GREEN : RED;
  ctx.shadowColor = ok ? GREEN : RED;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.lineTo(0, -r + 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-5, -r + 9);
  ctx.lineTo(5, -r + 9);
  ctx.stroke();
  ctx.restore();
}

function drawPadPointers(ctx, W, H, g) {
  const { ship, terrain, cam } = g;
  if (!ship.alive || ship.landed) return;
  for (const p of terrain.pads) {
    if (p.used) continue;
    const wx = (p.x1 + p.x2) / 2;
    const wy = p.y;
    const sx = W / 2 + (wx - cam.x) * cam.scale;
    const sy = H / 2 + (wy - cam.y) * cam.scale;
    const m = 26;
    if (sx > m && sx < W - m && sy > m && sy < H - m) continue;
    const ang = Math.atan2(sy - H / 2, sx - W / 2);
    const rx = Math.min(W / 2 - 44, Math.abs(Math.cos(ang)) > 0.001 ? Math.abs((W / 2 - 44) / Math.cos(ang)) : 1e9);
    const ry = Math.min(H / 2 - 44, Math.abs(Math.sin(ang)) > 0.001 ? Math.abs((H / 2 - 44) / Math.sin(ang)) : 1e9);
    const d = Math.min(rx, ry);
    const cx = W / 2 + Math.cos(ang) * d;
    const cy = H / 2 + Math.sin(ang) * d;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = MAG;
    ctx.shadowColor = MAG;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.lineTo(-6, -7);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const dist = Math.hypot(wx - ship.x, wy - ship.y) / 6;
    ctx.fillStyle = MAG;
    ctx.font = `700 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`x${p.mult} ${dist.toFixed(0)}m`, cx - Math.cos(ang) * 22, cy - Math.sin(ang) * 22 + 4);
  }
}
