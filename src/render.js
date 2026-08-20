// All drawing: parallax background, world, ship, and the flight HUD.

import { clamp, TAU, makeRng } from './util.js';
import { HULL, LEGS, ENVELOPE, normalizeAngle } from './ship.js';
import { WORLDS } from './levels.js';
import { ENEMY_TYPES } from './enemies.js';
import { nodeWorth } from './economy.js';

const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * How much a warning is allowed to pulse, from the player's flashing setting.
 * Everything that blinks asks this first, so "reduced" is one switch rather
 * than a dozen forgotten special cases.
 */
function flashOf(g) {
  const f = g && g.settings && g.settings.flash;
  return f == null ? 1 : f;
}

/**
 * A 0..1 throb for markers that breathe. `flash` scales how deep the breath is
 * and 0 holds it steady at full brightness, so a warning never disappears -
 * reducing flashing must never reduce information.
 */
function throb(t, speed, flash = 1, low = 0.6) {
  if (flash <= 0) return 1;
  return low + (1 - low) * (0.5 + 0.5 * Math.sin(t * speed)) * flash + (1 - flash) * (1 - low);
}
const GREEN = '#4dff9f';
const RED = '#ff3b5c';
const CYAN = '#5ff5ff';
const MAG = '#ff4fd8';
const AMBER = '#ffb347';
const VIOLET = '#c9a4ff';        // material: the one colour ore is drawn in

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

/** The same, with an alpha - so a raised shape can fade into the ground body. */
function shadeA(hex, amt, a) {
  return shade(hex, amt).replace('rgb(', 'rgba(').replace(')', `,${a})`);
}

export function drawTerrain(ctx, cam, W, H, terrain, level, time, opts = {}) {
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

  // Boulders. These are raised into the heightmap, so the shape drawn here is
  // the exact surface the lander collides with - traced off `terrain.h` rather
  // than approximated. Filled a shade lighter than the ground body and given a
  // shadowed underside so a boulder reads as a rock embedded in the surface
  // rather than as a smooth rise in the ground.
  if (terrain.boulders && terrain.boulders.length) {
    ctx.save();
    for (const b of terrain.boulders) {
      if (b.x + b.r < x0 - 40 || b.x - b.r > x1 + 40) continue;
      const j1 = Math.max(0, Math.floor((b.x - b.r) / terrain.step));
      const j2 = Math.min(terrain.n - 1, Math.ceil((b.x + b.r) / terrain.step));
      // Closed *below* the ground, not across the rock at a fixed skirt height.
      // A skirt only meets the surface on level ground: on a slope the closing
      // edge hangs in the air, and M20's ice - which is far steeper than
      // anything M19 measured this on - drew it as a visible box beside every
      // boulder on a hillside.
      const skirt = Math.max(terrain.h[j1], terrain.h[j2]) + 40;
      ctx.beginPath();
      ctx.moveTo(j1 * terrain.step, terrain.h[j1]);
      for (let j = j1; j <= j2; j++) ctx.lineTo(j * terrain.step, terrain.h[j]);
      ctx.lineTo(j2 * terrain.step, skirt);
      ctx.lineTo(j1 * terrain.step, skirt);
      ctx.closePath();
      const bg = ctx.createLinearGradient(0, b.top, 0, b.top + b.rise);
      bg.addColorStop(0, shade(w.hill, 0.5));
      bg.addColorStop(0.75, shadeA(w.hill, 0.16, 0.95));
      bg.addColorStop(1, shadeA(w.hill, 0.16, 0));
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = shade(w.hill, 0.85);
      ctx.lineWidth = 1.3 / cam.scale + 0.35;
      ctx.beginPath();
      for (let j = j1; j <= j2; j++) {
        const x = j * terrain.step;
        if (j === j1) ctx.moveTo(x, terrain.h[j]);
        else ctx.lineTo(x, terrain.h[j]);
      }
      ctx.stroke();
      // A crack or two, so the bigger ones have some texture at range.
      if (b.r > 34) {
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(b.x - b.r * 0.30, b.top + b.rise * 0.18);
        ctx.lineTo(b.x + b.r * 0.06, b.top + b.rise * 0.05);
        ctx.lineTo(b.x + b.r * 0.34, b.top + b.rise * 0.34);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  // Ice, when the body has any.
  //
  // Both of these are *in* the heightmap, so what is drawn traces `terrain.h`
  // rather than approximating it: the spike you fly around on screen is the one
  // the hull points test against. Seams first, since a serac may stand on one.
  if (terrain.surface === 'ice') {
    ctx.save();
    for (const s of terrain.seams || []) {
      if (s.x < x0 - 40 || s.x > x1 + 40) continue;
      const i = clamp(Math.round(s.x / terrain.step), 1, terrain.n - 1);
      const a = terrain.h[i - 1];
      const b = terrain.h[i];
      const top = Math.min(a, b);
      const bottom = Math.max(a, b);
      // The crack running on down into the shell, fading out rather than
      // ending, because nobody has seen the bottom of one.
      const depth = 30 + Math.abs(s.drop) * 1.8;
      const cg = ctx.createLinearGradient(0, bottom, 0, bottom + depth);
      cg.addColorStop(0, 'rgba(5,14,22,0.95)');
      cg.addColorStop(1, 'rgba(5,14,22,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(s.x - 2.5, bottom, 5, depth);
      // The lit face of the upper plate.
      ctx.strokeStyle = 'rgba(190,242,255,0.7)';
      ctx.lineWidth = 1.6 / cam.scale + 0.4;
      ctx.beginPath();
      ctx.moveTo(s.x, top);
      ctx.lineTo(s.x, bottom);
      ctx.stroke();
    }
    for (const s of terrain.seracs || []) {
      if (s.x + s.r < x0 - 40 || s.x - s.r > x1 + 40) continue;
      const j1 = Math.max(0, Math.floor((s.x - s.r) / terrain.step));
      const j2 = Math.min(terrain.n - 1, Math.ceil((s.x + s.r) / terrain.step));
      // Close the fill *below* the ground rather than across the blade: the
      // profile already returns to the surrounding surface at both feet, so a
      // skirt drawn at any other height hangs in the air.
      const foot = Math.max(terrain.h[j1], terrain.h[j2]) + 40;
      ctx.beginPath();
      ctx.moveTo(j1 * terrain.step, terrain.h[j1]);
      for (let j = j1; j <= j2; j++) ctx.lineTo(j * terrain.step, terrain.h[j]);
      ctx.lineTo(j2 * terrain.step, foot);
      ctx.lineTo(j1 * terrain.step, foot);
      ctx.closePath();
      // Fading to nothing at the foot is what makes a blade grow *out of* the
      // ground: an opaque fill leaves the closing rectangle visible against the
      // ground body, which is darker down there than any shade of the surface.
      const sg = ctx.createLinearGradient(0, s.top, 0, s.top + s.rise);
      sg.addColorStop(0, 'rgba(186,236,255,0.85)');
      sg.addColorStop(0.35, shadeA(w.hill, 0.55, 0.95));
      sg.addColorStop(1, shadeA(w.hill, 0.1, 0));
      ctx.fillStyle = sg;
      ctx.fill();
      // Only the silhouette is stroked - the closing edge is underground.
      ctx.strokeStyle = 'rgba(206,248,255,0.75)';
      ctx.lineWidth = 1.2 / cam.scale + 0.3;
      ctx.beginPath();
      for (let j = j1; j <= j2; j++) {
        const x = j * terrain.step;
        if (j === j1) ctx.moveTo(x, terrain.h[j]);
        else ctx.lineTo(x, terrain.h[j]);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Micro detail: loose debris sitting on the surface.
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
    const pulse = throb(time + p.x1 * 0.003, 3.4, opts.flash != null ? opts.flash : 1);
    ctx.save();
    const py1 = p.y1 != null ? p.y1 : p.y;
    const py2 = p.y2 != null ? p.y2 : p.y;
    // High contrast lays a white bar under the pad and squares off its ends, so
    // the landing zone reads as a shape rather than as a colour.
    if (opts.contrast) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 8 / cam.scale + 3;
      ctx.beginPath();
      ctx.moveTo(p.x1, py1);
      ctx.lineTo(p.x2, py2);
      ctx.stroke();
      ctx.lineWidth = 3 / cam.scale + 1;
      for (const [ex, ey] of [[p.x1, py1], [p.x2, py2]]) {
        ctx.beginPath();
        ctx.moveTo(ex, ey + 6);
        ctx.lineTo(ex, ey - 22);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = p.used ? '#4dff9f' : MAG;
    ctx.shadowColor = p.used ? '#4dff9f' : MAG;
    ctx.shadowBlur = 18 * pulse;
    ctx.lineWidth = 4 / cam.scale + 1.4;
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

  // Objective cargo: a crate that has to be flown to and taken, drawn in the
  // pad colour so it reads as "worth something" rather than "hazard".
  for (const c of terrain.cargo || []) {
    if (c.taken) continue;
    const bob = Math.sin(time * 1.6 + c.phase) * 5;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    ctx.strokeStyle = MAG;
    ctx.shadowColor = MAG;
    ctx.shadowBlur = 16;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.rect(-12, -12, 24, 24);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-12, -4);
    ctx.lineTo(12, -4);
    ctx.stroke();
    ctx.fillStyle = MAG;
    ctx.font = `700 9px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.label, 0, 22);
    ctx.restore();
  }

  // Material deposits. The reward used to be a figure computed at touchdown,
  // which the player could not see, could not reach for and could not lose.
  // These are the same reward as an object, so they are drawn to be spotted
  // from altitude: a crystal at the size of the pickup, a shaft of light on the
  // ones sitting on the ground, and a heavier facet on the deep ones.
  for (const m of terrain.materialNodes || []) {
    if (m.taken) continue;
    if (m.x < cam.x - half - 200 || m.x > cam.x + half + 200) continue;
    const deep = m.tier >= 2;
    const bob = Math.sin(time * 1.7 + m.phase) * (m.kind === 'float' ? 7 : 3);
    const pulse = throb(time * 0.9 + m.x * 0.004, 2.6, opts.flash != null ? opts.flash : 1, 0.7);
    ctx.save();
    ctx.translate(m.x, m.y + bob);
    // A shaft of light, so a deposit on the ground reads from a long way up.
    ctx.globalAlpha = 0.30 * pulse;
    ctx.fillStyle = VIOLET;
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(9, 0);
    ctx.lineTo(4, -150 - (deep ? 60 : 0));
    ctx.lineTo(-4, -150 - (deep ? 60 : 0));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    const r = deep ? 15 : 12;
    ctx.rotate(Math.sin(time * 0.5 + m.phase) * 0.25);
    ctx.strokeStyle = VIOLET;
    ctx.shadowColor = VIOLET;
    ctx.shadowBlur = 18 * pulse;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.78, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r * 0.78, 0);
    ctx.closePath();
    ctx.stroke();
    if (deep) {                       // the far band is worth about double
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(0, r);
      ctx.moveTo(-r * 0.78, 0);
      ctx.lineTo(r * 0.78, 0);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * Material markers that survive the weather, drawn with the pad beacons after
 * the dust. Mars mission 5 drops visibility to 22%, and a reward you cannot see
 * in the storm is the M14 fault again in a different costume.
 */
export function drawMaterialBeacons(ctx, cam, W, H, terrain, time, strength, opts = {}) {
  if (strength <= 0.02) return;
  const half = W / 2 / cam.scale;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);
  for (const m of terrain.materialNodes || []) {
    if (m.taken) continue;
    if (m.x < cam.x - half - 200 || m.x > cam.x + half + 200) continue;
    const pulse = throb(time + m.x * 0.003, 3.0, opts.flash != null ? opts.flash : 1);
    ctx.globalAlpha = clamp(strength, 0, 1) * (0.6 + 0.4 * pulse);
    ctx.strokeStyle = VIOLET;
    ctx.shadowColor = VIOLET;
    ctx.shadowBlur = 22 * pulse;
    ctx.lineWidth = 3 / cam.scale + 1;
    const r = 16;
    ctx.beginPath();
    ctx.moveTo(m.x, m.y - r);
    ctx.lineTo(m.x + r * 0.78, m.y);
    ctx.lineTo(m.x, m.y + r);
    ctx.lineTo(m.x - r * 0.78, m.y);
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Wind you can see.
 *
 * The physics has always known about the wind; the screen did not, so the only
 * evidence was the lander drifting and a bar in the corner. These are streaks
 * blowing through the flyable air, drawn in world space so they move past the
 * lander rather than with it, and their speed and density follow `windNow` -
 * which means the gusts are visible as gusts and a Gyro Stabilizer visibly
 * calms the air.
 */
export function drawWind(ctx, cam, W, H, level, wind, time, opts = {}) {
  const speed = Math.abs(wind || 0);
  if (speed < 4) return;
  const strength = clamp(speed / 60, 0, 1);
  const dir = Math.sign(wind || 1);
  const half = W / 2 / cam.scale;
  const top = H / 2 / cam.scale;
  const w = WORLDS[level.world];
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);
  ctx.globalAlpha = 0.10 + 0.30 * strength * (opts.flash != null ? Math.max(0.4, opts.flash) : 1);
  ctx.strokeStyle = `rgba(${w.dustRGB || '150,90,60'},0.9)`;
  ctx.lineWidth = 1.2 / cam.scale;
  const count = Math.round(18 + strength * 34);
  const span = half * 2.4;
  for (let i = 0; i < count; i++) {
    // Each streak runs on its own loop so the field never pulses in step.
    const drift = (time * (60 + speed * 3.2) * (0.7 + (i % 5) * 0.12)) % span;
    const x = cam.x - half * 1.2 + ((i * 977) % span + dir * drift + span) % span;
    const y = cam.y - top + ((i * 613) % (top * 2));
    const len = (26 + (i % 6) * 22) * (0.5 + strength);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * len, y + ((i % 3) - 1) * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Dust haze over the world. The pads are redrawn on top afterwards: the spec is
 * explicit that the safe pad must stay visually distinct even in low
 * visibility, so dust hides the terrain, not the target.
 */
export function drawDust(ctx, W, H, level, visibility, time, focus = null) {
  const v = clamp(visibility, 0, 1);
  if (v > 0.985) return;
  const w = WORLDS[level.world];
  const density = 1 - v;
  const rgb = w.dustRGB || '150,90,60';

  // A flat tint over everything. This used to be the whole effect, which is why
  // Mars at 22% visibility still showed you the entire map through a filter:
  // the terrain never went anywhere, so the storm cost nothing.
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgba(${rgb},${(density * 0.55).toFixed(3)})`);
  g.addColorStop(1, `rgba(${rgb},${(density * 0.72).toFixed(3)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // And the part that actually blinds you: the far field closes in. You keep a
  // clear bubble around the lander and lose the rest, which is what flying in a
  // storm is - the pad beacons are drawn *above* this, so the target you are
  // aiming at never disappears even when the ground it sits on does.
  if (density > 0.15) {
    const cx = focus ? focus.x : W / 2;
    const cy = focus ? focus.y : H / 2;
    const reach = Math.hypot(W, H);
    // At full density the clear bubble is barely wider than the lander.
    const clear = reach * (0.30 - 0.24 * density);
    const gone = reach * (0.82 - 0.36 * density);
    const fog = ctx.createRadialGradient(cx, cy, Math.max(40, clear), cx, cy, Math.max(80, gone));
    const peak = Math.min(0.97, density * 1.25);
    fog.addColorStop(0, `rgba(${rgb},0)`);
    fog.addColorStop(0.55, `rgba(${rgb},${(peak * 0.55).toFixed(3)})`);
    fog.addColorStop(1, `rgba(${rgb},${peak.toFixed(3)})`);
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, W, H);
  }

  // Drifting streaks, so the front reads as moving rather than as a filter.
  ctx.save();
  ctx.globalAlpha = density * 0.55;
  ctx.strokeStyle = `rgba(${rgb},0.85)`;
  ctx.lineWidth = 1.4;
  const streaks = Math.round(26 + density * 44);
  for (let i = 0; i < streaks; i++) {
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
export function drawPadBeacons(ctx, cam, W, H, terrain, level, time, strength, opts = {}) {
  if (strength <= 0.02) return;
  const half = W / 2 / cam.scale;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);
  for (const p of terrain.pads) {
    if (p.x2 < cam.x - half - 200 || p.x1 > cam.x + half + 200) continue;
    const pulse = throb(time + p.x1 * 0.003, 3.4, opts.flash != null ? opts.flash : 1);
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
/**
 * Enemies, their telegraphs and their fire, in world space.
 *
 * The telegraph is the whole design: a locked line that grows toward the point
 * the shot will pass through, and a ring that closes as the timer runs out. It
 * is deliberately readable without colour - a player who cannot separate red
 * from amber still sees a line appear and a ring shrink.
 */
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
  // How far ahead the dotted path runs. The Sensors track sells exactly this
  // and `predict` was never read, so every level of it drew the same line.
  const steps = Math.round(70 * ((ship.loadout && ship.loadout.predict) || 1));
  for (let i = 0; i < steps; i++) {
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

/**
 * The lander drawn large, with the upgrades visible on the hull. Selecting a
 * component highlights the physical part it is - the roadmap's requirement that
 * an upgrade shows on the ship, not only in a number.
 */
export function drawHangarShip(ctx, cx, cy, scale, levels, highlight, time) {
  const L = (id) => Math.max(1, Math.min(4, (levels || {})[id] || 1));
  const lit = (id) => (highlight === id ? '#ffffff' : null);
  const pulse = 0.65 + 0.35 * Math.sin(time * 3);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const glow = (color, blur) => { ctx.shadowColor = color; ctx.shadowBlur = blur; };

  // --- engine bell and tanks grow with the engine track
  const eng = L('engine');
  glow(highlight === 'engine' ? '#ffffff' : AMBER, highlight === 'engine' ? 26 * pulse : 12);
  ctx.strokeStyle = lit('engine') || AMBER;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-5, 5); ctx.lineTo(-7 - eng, 11 + eng * 1.6);
  ctx.lineTo(7 + eng, 11 + eng * 1.6); ctx.lineTo(5, 5);
  ctx.stroke();
  for (let i = 0; i < eng - 1; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    ctx.beginPath();
    ctx.ellipse(side * (13 + row * 4), 0 + row * 2, 3.4, 7, 0, 0, TAU);
    ctx.stroke();
  }

  // --- gear: struts thicken, footpads widen
  const gear = L('gear');
  glow(highlight === 'gear' ? '#ffffff' : '#9fe8ff', highlight === 'gear' ? 26 * pulse : 10);
  ctx.strokeStyle = lit('gear') || '#9fe8ff';
  ctx.lineWidth = 1.6 + gear * 0.5;
  const spread = 16 + gear * 1.6;
  const foot = 8 + gear * 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 9, 5);
    ctx.lineTo(side * spread, 16);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(side * (spread - foot / 2), 16);
    ctx.lineTo(side * (spread + foot / 2), 16);
    ctx.stroke();
    if (gear >= 3) {   // damper strut
      ctx.beginPath();
      ctx.moveTo(side * 11, -1);
      ctx.lineTo(side * (spread - 2), 12);
      ctx.stroke();
    }
  }

  // --- hull: plating layers
  const hull = L('hull');
  glow(highlight === 'hull' ? '#ffffff' : CYAN, highlight === 'hull' ? 30 * pulse : 16);
  ctx.beginPath();
  HULL.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  ctx.closePath();
  ctx.fillStyle = 'rgba(10,26,40,0.95)';
  ctx.fill();
  ctx.strokeStyle = lit('hull') || CYAN;
  ctx.lineWidth = 1.6 + hull * 0.45;
  ctx.stroke();
  for (let i = 1; i < hull; i++) {
    ctx.beginPath();
    ctx.moveTo(-11 + i * 1.5, -1 + i * 1.6);
    ctx.lineTo(11 - i * 1.5, -1 + i * 1.6);
    ctx.stroke();
  }

  // --- rcs nozzles
  const rcs = L('rcs');
  glow(highlight === 'rcs' ? '#ffffff' : '#bff8ff', highlight === 'rcs' ? 26 * pulse : 8);
  ctx.strokeStyle = lit('rcs') || '#bff8ff';
  ctx.lineWidth = 1.6;
  for (const side of [-1, 1]) {
    for (let i = 0; i < rcs; i++) {
      ctx.beginPath();
      ctx.moveTo(side * 11, -6 + i * 3.5);
      ctx.lineTo(side * (14 + rcs), -7 + i * 3.5);
      ctx.stroke();
    }
  }

  // --- sensors: antenna and dish
  const sen = L('sensors');
  glow(highlight === 'sensors' ? '#ffffff' : '#7ef2d0', highlight === 'sensors' ? 26 * pulse : 10);
  ctx.strokeStyle = lit('sensors') || '#7ef2d0';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(0, -15);
  ctx.lineTo(0, -18 - sen * 3);
  ctx.stroke();
  if (sen >= 2) {
    ctx.beginPath();
    ctx.arc(0, -19 - sen * 3, 2 + sen * 0.7, Math.PI, 0);
    ctx.stroke();
  }
  if (sen >= 4) {
    ctx.beginPath();
    ctx.arc(0, -19 - sen * 3, 5 + sen, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(0, -6, 3.4, 0, TAU);
  ctx.fillStyle = '#bff8ff';
  ctx.fill();
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
  const uiScale = (g.settings && g.settings.uiScale) || 1;
  const s = (compact ? 0.8 : 1) * uiScale;
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
  ctx.shadowBlur = fuelPct < 0.18 ? 8 + 10 * (flashOf(g) > 0 ? (Math.sin(time * 8) > 0 ? 1 : 0) : 1) : 8;
  ctx.fillRect(bx, by, bw * fuelPct, bh);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = '#dff6ff';
  ctx.font = `700 ${11 * s}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(fuelPct * 100)}%`, bx + bw, py + 22 * s);

  const rad = ship.statusLevels ? ship.statusLevels.radiation : 0;
  const resist = (ship.loadout && ship.loadout.noiseResist) || 1;
  const noise = clamp(rad / 100, 0, 1) * (ship.env && ship.env.shielded ? 0.25 : 1) * resist;

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

  // ---- the hold: what has actually been picked up, and what is still out there
  const nodes = terrain.materialNodes || [];
  const armed = g.field && !g.field.empty;
  if (nodes.length) {
    const carried = g.carried || { material: 0, salvage: 0, nodes: 0 };
    const left = nodes.filter((m) => !m.taken).length;
    // Below the threat slot, whether or not a machine has been seen yet: a
    // panel that jumps when the first turret wakes up is worse than one that
    // sits a little lower all mission.
    const hy2 = py + 92 * s + 26 + (armed ? 44 * s + 10 : 0);
    panel(ctx, rx, hy2, rw, 40 * s, carried.nodes ? 'rgba(201,164,255,0.35)' : 'rgba(95,245,255,0.18)');
    label(ctx, 'HOLD', rx + 14, hy2 + 18 * s, 10 * s);
    ctx.textAlign = 'right';
    ctx.fillStyle = carried.material ? VIOLET : 'rgba(200,220,235,0.6)';
    ctx.font = `700 ${15 * s}px ${FONT}`;
    ctx.fillText(`${carried.material}`, rx + rw - 14, hy2 + 20 * s);
    ctx.fillStyle = 'rgba(200,220,235,0.55)';
    ctx.font = `600 ${10 * s}px ${FONT}`;
    ctx.fillText(`${left} deposit${left === 1 ? '' : 's'} left`, rx + rw - 14, hy2 + 33 * s);
    ctx.textAlign = 'left';
  }

  // ---- hazards: one loud warning, the rest quiet
  drawHazardStack(ctx, W, H, g, s, py, rad);

  // ---- hull. Always shown now: since radiation eats hull, every body can take
  //      it, and a bar that only appears once you are already losing is a bar
  //      you learn to read too late.
  const threats = armed;
  if (ship.hullMax) {
    const hy = py + ph + 8;
    panel(ctx, px, hy, pw, 40 * s, ship.hull < ship.hullMax * 0.35 ? 'rgba(255,59,92,0.4)' : 'rgba(95,245,255,0.25)');
    label(ctx, 'HULL', px + 14, hy + 18 * s, 10 * s);
    const hf = clamp(ship.hull / ship.hullMax, 0, 1);
    const hbw = pw - 28;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(px + 14, hy + 24 * s, hbw, 8 * s);
    const hc = hf > 0.55 ? GREEN : hf > 0.25 ? AMBER : RED;
    ctx.fillStyle = hc;
    ctx.shadowColor = hc;
    ctx.shadowBlur = ship.hitFlash > 0 ? 18 : ship.hullBurn > 0 ? 14 : 6;
    ctx.fillRect(px + 14, hy + 24 * s, hbw * hf, 8 * s);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#dff6ff';
    ctx.font = `700 ${11 * s}px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(hf * 100)}%`, px + pw - 14, hy + 18 * s);
    ctx.textAlign = 'left';
  }

  // ---- threats, and the module that answers them
  if (threats) drawThreatPanel(ctx, W, H, g, s);
  if (g.abilities && g.abilities.equipped) drawAbilityPanel(ctx, W, H, g, s);

  // ---- off-screen pad chevrons
  drawPadPointers(ctx, W, H, g);
  drawMaterialPointers(ctx, W, H, g);
  if (threats) drawThreatPointers(ctx, W, H, g);

  // ---- proximity alarm vignette
  const danger = alt < 60 && ship.vy > ENVELOPE.GOOD.vy * 1.4 && ship.alive && !ship.landed;
  if (danger) {
    const a = 0.18 + 0.14 * (flashOf(g) > 0 ? Math.sin(time * 14) * flashOf(g) : 1);
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

/**
 * Where the ore is, when it is off the edge of the screen. A deposit you cannot
 * see is a deposit you will not go and get, and the whole of M15 is the claim
 * that the reward should be somewhere you decided to fly to. Only the nearest
 * three are pointed at, so the rim does not become a fence.
 */
function drawMaterialPointers(ctx, W, H, g) {
  const { ship, terrain, cam } = g;
  if (!ship.alive || ship.landed) return;
  const nodes = (terrain.materialNodes || [])
    .filter((m) => !m.taken)
    .sort((a, b) => Math.hypot(a.x - ship.x, a.y - ship.y) - Math.hypot(b.x - ship.x, b.y - ship.y))
    .slice(0, 3);
  for (const m of nodes) {
    const sx = W / 2 + (m.x - cam.x) * cam.scale;
    const sy = H / 2 + (m.y - cam.y) * cam.scale;
    const edge = 26;
    if (sx > edge && sx < W - edge && sy > edge && sy < H - edge) continue;
    const ang = Math.atan2(sy - H / 2, sx - W / 2);
    const rx = Math.min(W / 2 - 70, Math.abs(Math.cos(ang)) > 0.001 ? Math.abs((W / 2 - 70) / Math.cos(ang)) : 1e9);
    const ry = Math.min(H / 2 - 70, Math.abs(Math.sin(ang)) > 0.001 ? Math.abs((H / 2 - 70) / Math.sin(ang)) : 1e9);
    const d = Math.min(rx, ry);
    const cx = W / 2 + Math.cos(ang) * d;
    const cy = H / 2 + Math.sin(ang) * d;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = VIOLET;
    ctx.shadowColor = VIOLET;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(0, -6);
    ctx.lineTo(-8, 0);
    ctx.lineTo(0, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = VIOLET;
    ctx.font = `700 10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${nodeWorth(m.tier).material}`, cx - Math.cos(ang) * 20, cy - Math.sin(ang) * 20 + 4);
  }
}

/**
 * How many machines are awake, and how close the nearest one is. A count is
 * enough: the world itself shows where they are, and a busy radar would take
 * attention away from the landing, which is the thing that must stay in front.
 */
function drawThreatPanel(ctx, W, H, g, s) {
  const { ship, field, compact } = g;
  const live = field.live;
  if (!live.length && !field.kills) return;
  const w = 190 * s;
  const x = W - w - 16;
  const y = 16 + 92 * s + 26;
  const engaged = field.engaged;
  panel(ctx, x, y, w, 44 * s, engaged ? 'rgba(255,59,92,0.45)' : 'rgba(255,179,71,0.28)');
  label(ctx, 'THREATS', x + 14, y + 20 * s, 10 * s);
  ctx.textAlign = 'right';
  ctx.font = `700 ${16 * s}px ${FONT}`;
  ctx.fillStyle = engaged ? RED : live.length ? AMBER : 'rgba(200,220,235,0.6)';
  ctx.fillText(live.length ? `${live.length}` : 'CLEAR', x + w - 14, y + 20 * s);
  ctx.textAlign = 'left';
  let nearest = Infinity;
  for (const e of live) nearest = Math.min(nearest, Math.hypot(e.x - ship.x, e.y - ship.y));
  ctx.font = `600 ${10 * s}px ${FONT}`;
  ctx.fillStyle = 'rgba(160,190,215,0.75)';
  const status = engaged ? 'TRACKING YOU'
    : field.reloading ? 'RELOADING'
      : live.length ? 'IDLE' : 'AREA CLEAR';
  ctx.fillText(status, x + 14, y + 36 * s);
  if (Number.isFinite(nearest)) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(200,220,235,0.7)';
    ctx.fillText(`${(nearest / 6).toFixed(0)}m`, x + w - 14, y + 36 * s);
    ctx.textAlign = 'left';
  }
}

/** The equipped active: what it is, how many charges are left, and its state. */
function drawAbilityPanel(ctx, W, H, g, s) {
  const a = g.abilities.readout();
  const w = 210 * s;
  const h = 46 * s;
  const x = 16;
  const y = H - h - 16;
  const accent = a.active ? 'rgba(126,242,208,0.5)' : a.blocker ? 'rgba(120,140,160,0.3)' : 'rgba(95,245,255,0.3)';
  panel(ctx, x, y, w, h, accent);
  ctx.font = `700 ${11 * s}px ${FONT}`;
  ctx.fillStyle = a.active ? '#7ef2d0' : a.blocker ? 'rgba(170,185,200,0.7)' : '#dff6ff';
  ctx.textAlign = 'left';
  ctx.fillText(a.name, x + 12, y + 18 * s);
  ctx.textAlign = 'right';
  ctx.font = `600 ${10 * s}px ${FONT}`;
  ctx.fillStyle = 'rgba(160,190,215,0.75)';
  ctx.fillText(a.blocker ? a.blocker : a.active ? 'ACTIVE' : 'E', x + w - 12, y + 18 * s);
  ctx.textAlign = 'left';

  // charge pips, then a bar that fills while it recharges and drains while it runs
  const pipY = y + 28 * s;
  for (let i = 0; i < a.maxCharges; i++) {
    const cx = x + 12 + i * 12;
    ctx.fillStyle = i < a.charges ? (a.active ? '#7ef2d0' : CYAN) : 'rgba(255,255,255,0.14)';
    ctx.fillRect(cx, pipY, 8, 8 * s);
  }
  const bx = x + 12 + a.maxCharges * 12 + 8;
  const bw = w - (bx - x) - 12;
  if (bw > 20) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(bx, pipY, bw, 8 * s);
    const f = a.active ? clamp(a.remaining / Math.max(0.001, a.duration), 0, 1) : a.fraction;
    ctx.fillStyle = a.active ? '#7ef2d0' : a.cooldown > 0 ? AMBER : 'rgba(95,245,255,0.5)';
    ctx.fillRect(bx, pipY, bw * f, 8 * s);
  }
}

/** A chevron for anything that has locked on from outside the view. */
function drawThreatPointers(ctx, W, H, g) {
  const { ship, field, cam } = g;
  if (!ship.alive || ship.landed) return;
  for (const e of field.enemies) {
    if (e.dead || e.state !== 'telegraph') continue;
    const sx = W / 2 + (e.x - cam.x) * cam.scale;
    const sy = H / 2 + (e.y - cam.y) * cam.scale;
    const m = 30;
    if (sx > m && sx < W - m && sy > m && sy < H - m) continue;
    const ang = Math.atan2(sy - H / 2, sx - W / 2);
    const rx = Math.abs(Math.cos(ang)) > 0.001 ? Math.abs((W / 2 - 52) / Math.cos(ang)) : 1e9;
    const ry = Math.abs(Math.sin(ang)) > 0.001 ? Math.abs((H / 2 - 52) / Math.sin(ang)) : 1e9;
    const d = Math.min(rx, ry, Math.min(W, H) / 2);
    const cx = W / 2 + Math.cos(ang) * d;
    const cy = H / 2 + Math.sin(ang) * d;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.strokeStyle = RED;
    ctx.shadowColor = RED;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-6, -8);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Hazard warnings, ranked. The spec asks for "one readable hazard warning at a
 * time, with secondary warnings visually quieter", and on Mars under a dust
 * front with the wind up that used to mean three full-size panels stacked over
 * the sky. The most urgent one keeps its instrument; everything else collapses
 * to a labelled chip that still shows its level.
 */
function drawHazardStack(ctx, W, H, g, s, py, rad) {
  const { ship, level, time } = g;
  const flash = flashOf(g);
  const entries = [];

  if (level.wind || level.gust) {
    const w = ship.windNow || 0;
    entries.push({
      id: 'wind', label: 'WIND', urgency: clamp(Math.abs(w) / 70, 0, 1),
      level: clamp(Math.abs(w) / 70, 0, 1), color: AMBER, value: w,
    });
  }
  if (ship.env && ship.env.visibility < 0.985) {
    const d = 1 - ship.env.visibility;
    entries.push({ id: 'dust', label: 'VISIBILITY', urgency: d, level: d, color: AMBER });
  }
  if (ship.env && (ship.env.radiationSweep > 0.02 || rad > 1)) {
    entries.push({
      id: 'rad', label: ship.env.shielded ? 'RADIATION · SHIELDED' : 'RADIATION',
      urgency: clamp(rad / 100, 0, 1) + (ship.env.radiationSweep > 0.4 && !ship.env.shielded ? 0.3 : 0),
      level: clamp(rad / 100, 0, 1),
      color: ship.env.shielded ? '#7ef2d0' : rad > 60 ? RED : AMBER,
    });
  }
  const heat = ship.statusLevels ? ship.statusLevels.heat : 0;
  const cold = ship.statusLevels ? ship.statusLevels.cold : 0;
  if (heat > 2) entries.push({ id: 'heat', label: 'ENGINE HEAT', urgency: heat / 100, level: heat / 100, color: heat > 60 ? RED : AMBER });
  if (cold > 2) entries.push({ id: 'cold', label: 'COLD SOAK', urgency: cold / 100, level: cold / 100, color: cold > 60 ? RED : CYAN });

  if (!entries.length) return;
  entries.sort((a, b) => b.urgency - a.urgency);
  const primary = entries[0];
  let y = py + 60 * s;

  // The loud one.
  panel(ctx, W / 2 - 80, y - 22, 160, 44, `rgba(255,255,255,0.18)`);
  ctx.textAlign = 'center';
  ctx.font = `600 ${10 * s}px ${FONT}`;
  ctx.fillStyle = 'rgba(160,190,215,0.75)';
  ctx.fillText(primary.label, W / 2, y - 8);
  if (primary.id === 'wind') {
    drawWindArrow(ctx, W / 2, y + 8, primary.value);
  } else {
    const bw = 132;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(W / 2 - bw / 2, y + 2, bw, 8);
    ctx.fillStyle = primary.color;
    ctx.shadowColor = primary.color;
    ctx.shadowBlur = primary.urgency > 0.6 ? 6 + 8 * throb(time, 6, flash, 0.4) : 4;
    ctx.fillRect(W / 2 - bw / 2, y + 2, bw * primary.level, 8);
    ctx.shadowBlur = 0;
  }

  // The quiet ones: a row of chips, half the height and no glow.
  const rest = entries.slice(1);
  if (!rest.length) return;
  y += 34;
  const cw = 96;
  let x = W / 2 - (rest.length * (cw + 6) - 6) / 2;
  for (const e of rest) {
    ctx.fillStyle = 'rgba(6,10,18,0.7)';
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, cw, 18, 5); else ctx.rect(x, y, cw, 18);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = `600 9px ${FONT}`;
    ctx.fillStyle = 'rgba(150,175,195,0.8)';
    ctx.fillText(e.label.split(' ')[0], x + 7, y + 12);
    ctx.fillStyle = e.color;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x + cw - 34, y + 7, 27 * e.level, 4);
    ctx.globalAlpha = 1;
    x += cw + 6;
  }
  ctx.textAlign = 'left';
}

/** The wind vane, as its own piece so the hazard stack can place it. */
function drawWindArrow(ctx, wx, wy, w) {
  const mag = clamp(Math.abs(w) / 70, 0.12, 1);
  ctx.save();
  ctx.strokeStyle = AMBER;
  ctx.shadowColor = AMBER;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2.4;
  const dir = Math.sign(w) || 1;
  const len = 54 * mag;
  ctx.beginPath();
  ctx.moveTo(wx - dir * len * 0.5, wy);
  ctx.lineTo(wx + dir * len * 0.5, wy);
  ctx.lineTo(wx + dir * len * 0.5 - dir * 8, wy - 5);
  ctx.moveTo(wx + dir * len * 0.5, wy);
  ctx.lineTo(wx + dir * len * 0.5 - dir * 8, wy + 5);
  ctx.stroke();
  ctx.restore();
}
