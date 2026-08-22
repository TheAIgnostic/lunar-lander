// All drawing: parallax background, world, ship, and the flight HUD.

import { clamp, TAU, makeRng } from './util.js';
import { HULL, LEGS, normalizeAngle } from './ship.js';
import { WORLDS } from './levels.js';
import { FONT, throb, RED, CYAN, MAG, AMBER, VIOLET, shade, shadeA, label } from './drawkit.js';
import { nodeWorth } from './economy.js';

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

  // Structures: what somebody built here and left.
  //
  // Traced off the heightmap like everything else that is raised into it, so
  // the wall you fly into is the wall you can see. Drawn darker than the ground
  // with a lit roof edge, because the roof is the thing that matters - it is
  // flat, a machine is probably standing on it, and it reads as built rather
  // than grown from a distance.
  if (terrain.structures && terrain.structures.length) {
    ctx.save();
    for (const st of terrain.structures) {
      if (st.x + st.w < x0 - 60 || st.x - st.w > x1 + 60) continue;
      const left = st.i1 * terrain.step;
      const right = st.i2 * terrain.step;
      const foot = Math.max(terrain.h[st.i1], terrain.h[st.i2], st.base) + 60;
      ctx.beginPath();
      ctx.moveTo(left, foot);
      for (let j = st.i1; j <= st.i2; j++) ctx.lineTo(j * terrain.step, terrain.h[j]);
      ctx.lineTo(right, foot);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, st.top, 0, st.base);
      g.addColorStop(0, shade(w.hill, 0.32));
      g.addColorStop(0.55, shadeA(w.hill, -0.35, 0.97));
      g.addColorStop(1, shadeA(w.hill, -0.5, 0));
      ctx.fillStyle = g;
      ctx.fill();

      // The lit roof line and the two corners.
      ctx.strokeStyle = w.accent;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.6 / cam.scale + 0.4;
      ctx.beginPath();
      ctx.moveTo(left, terrain.h[st.i1]);
      for (let j = st.i1; j <= st.i2; j++) ctx.lineTo(j * terrain.step, terrain.h[j]);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // Windows on a hab, a mast and a warning light on a tower. Both are drawn
      // from the structure's own dimensions, so they scale with it.
      ctx.fillStyle = shade(w.hill, -0.55);
      if (st.kind === 'hab') {
        const rows = Math.max(1, Math.floor(st.rise / 26));
        const cols = Math.max(2, Math.floor(st.w / 30));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const bx = st.x - st.w / 2 + 10 + c * (st.w - 20) / cols;
            const by = st.top + 14 + r * 26;
            if (by > st.base - 8) continue;
            ctx.globalAlpha = (r + c) % 3 === 0 ? 0.5 : 0.85;
            ctx.fillRect(bx, by, Math.min(11, (st.w - 20) / cols - 5), 9);
          }
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = shade(w.hill, 0.5);
        ctx.lineWidth = 1.4 / cam.scale + 0.3;
        ctx.beginPath();
        ctx.moveTo(st.x, st.top);
        ctx.lineTo(st.x, st.top - 26 - st.rise * 0.12);
        ctx.stroke();
        // The accessibility flashing setting reaches this like every other
        // blinking thing: presentation only, never the simulation.
        const f = opts.flash != null ? opts.flash : 1;
        const blink = 0.45 + 0.55 * Math.abs(Math.sin(time * 1.1 + st.x));
        ctx.globalAlpha = 0.35 + 0.5 * blink * f;
        ctx.fillStyle = '#ff6b6b';
        ctx.beginPath();
        ctx.arc(st.x, st.top - 28 - st.rise * 0.12, 3.2, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
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

    // A crate on a hover cushion, not a shaft of light.
    //
    // The old marker was a 150 px light ray with a diamond at the bottom, which
    // told you *where* the reward was and nothing about what it was. A crate is
    // an object in the world: it hangs low over the ground, it throws a shadow
    // on the ground it hangs over, and the ore glowing in its slot is what you
    // are actually flying down to collect.
    const shadow = terrain.heightAt(m.x);
    if (shadow - m.y < 320) {
      ctx.save();
      ctx.globalAlpha = 0.28 * clamp(1 - (shadow - m.y) / 320, 0, 1);
      ctx.fillStyle = '#05030a';
      ctx.beginPath();
      ctx.ellipse(m.x, shadow - 2, (deep ? 22 : 18), 4.5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(m.x, m.y + bob);
    const halfW = deep ? 16 : 13;
    const halfH = deep ? 12 : 10;
    const chamfer = deep ? 5 : 4;

    // The cushion it rides on.
    ctx.globalAlpha = 0.45 * pulse;
    const cushion = ctx.createLinearGradient(0, halfH, 0, halfH + 16);
    cushion.addColorStop(0, VIOLET);
    cushion.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cushion;
    ctx.beginPath();
    ctx.moveTo(-halfW * 0.8, halfH);
    ctx.lineTo(halfW * 0.8, halfH);
    ctx.lineTo(halfW * 0.45, halfH + 15);
    ctx.lineTo(-halfW * 0.45, halfH + 15);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // The crate itself, tilting gently rather than spinning: a container that
    // rotates has nothing holding it up.
    ctx.rotate(Math.sin(time * 0.6 + m.phase) * 0.09);
    ctx.beginPath();
    ctx.moveTo(-halfW + chamfer, -halfH);
    ctx.lineTo(halfW - chamfer, -halfH);
    ctx.lineTo(halfW, -halfH + chamfer);
    ctx.lineTo(halfW, halfH - chamfer);
    ctx.lineTo(halfW - chamfer, halfH);
    ctx.lineTo(-halfW + chamfer, halfH);
    ctx.lineTo(-halfW, halfH - chamfer);
    ctx.lineTo(-halfW, -halfH + chamfer);
    ctx.closePath();
    ctx.fillStyle = 'rgba(9,6,18,0.92)';
    ctx.fill();
    ctx.strokeStyle = VIOLET;
    ctx.shadowColor = VIOLET;
    ctx.shadowBlur = 14 * pulse;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // The ore showing through the slot, and the strapping around it. A deep
    // crate carries two slots, because the far band is worth about double and
    // that has to read without a legend.
    ctx.shadowBlur = 16 * pulse;
    ctx.fillStyle = VIOLET;
    const slots = deep ? [-halfW * 0.42, halfW * 0.42] : [0];
    for (const sx of slots) {
      ctx.beginPath();
      ctx.moveTo(sx, -halfH * 0.52);
      ctx.lineTo(sx + halfW * 0.3, 0);
      ctx.lineTo(sx, halfH * 0.52);
      ctx.lineTo(sx - halfW * 0.3, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-halfW, -halfH * 0.42);
    ctx.lineTo(halfW, -halfH * 0.42);
    ctx.moveTo(-halfW, halfH * 0.42);
    ctx.lineTo(halfW, halfH * 0.42);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/**
 * **How far the beacons cut through the weather.**
 *
 * `beacon` is sold by the Hardened Radar passive (1.5) and by Sensors L2/L3
 * (1.3, 1.6), and `ship.beaconBoost` is what a raised Sensor Pulse writes (2.4).
 * All four were declared, folded into the spec and **read by nothing**: the two
 * beacon draws took the obscuration and no gain at all, so three separate
 * things the game sells for "you can still see the pad" did not exist. It is
 * `hazardLead` again, on a passive, an active and a component track at once -
 * and M30f's guard missed it because `abilities.js` contains the *string*
 * `beacon` while reading the module's own field rather than the loadout's key.
 *
 * One rule, both draws: the gain multiplies how much of the marker survives the
 * haze, so kit bought to see through weather brings the target back earlier and
 * brighter, and buys nothing at all in clear air - where there was never
 * anything to see through.
 */
export function beaconGain(ship) {
  return (((ship && ship.loadout && ship.loadout.beacon) || 1)
    * ((ship && ship.beaconBoost) || 1));
}

/**
 * Material markers that survive the weather, drawn with the pad beacons after
 * the dust. Mars mission 5 drops visibility to 22%, and a reward you cannot see
 * in the storm is the M14 fault again in a different costume.
 */
export function drawMaterialBeacons(ctx, cam, W, H, terrain, time, rawStrength, opts = {}) {
  const strength = rawStrength * (opts.beacon || 1);
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
    // The same silhouette the crate has, so what shows through the storm is the
    // thing you are looking for rather than a different symbol for it.
    const bw = m.tier >= 2 ? 17 : 14;
    const bh = m.tier >= 2 ? 13 : 11;
    ctx.beginPath();
    ctx.rect(m.x - bw, m.y - bh, bw * 2, bh * 2);
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

/**
 * **Night, which is not fog.**
 *
 * Pluto's darkness was `visibility: 0.45`, and `drawDust` is what draws
 * visibility - so the darkest body in the game rendered as pale blue haze,
 * which is what Tom found walking the ladder. The two are separate channels
 * since M29 and this is the other one.
 *
 * The difference that matters is *colour*: dust adds the body's dust tint and
 * lightens toward it, and darkness subtracts toward black. So the same 0.7 on
 * each channel reads as "there is something in the air" or "there is no light
 * here", and a body can have either, both or neither.
 *
 * It follows dust's structure otherwise, because that structure was measured
 * and works: a flat term plus a sight radius around the lander, with the pad
 * beacons and ore crates drawn *above* it. Blind is difficulty; targetless is a
 * coin toss (M18), and that line does not move because the cause changed.
 */
export function drawDarkness(ctx, W, H, level, darkness, time, focus = null) {
  const d = clamp(darkness, 0, 0.95);
  if (d <= 0.02) return;

  // The flat term. Kept well under the sight radius' peak so that the sky and
  // the far ground go deep while the lander's own surroundings stay readable.
  ctx.fillStyle = `rgba(2,4,10,${(d * 0.52).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);

  // The sight radius: what the lander's own lights reach. Anchored on the ship,
  // not the viewport, for the same reason the storm is.
  const cx = focus ? focus.x : W / 2;
  const cy = focus ? focus.y : H / 2;
  const reach = Math.hypot(W, H);
  const clear = reach * (0.34 - 0.26 * d);
  const gone = reach * (0.86 - 0.34 * d);
  const night = ctx.createRadialGradient(cx, cy, Math.max(40, clear), cx, cy, Math.max(90, gone));
  const peak = Math.min(0.95, d * 1.05);
  night.addColorStop(0, 'rgba(2,4,10,0)');
  night.addColorStop(0.5, `rgba(2,4,10,${(peak * 0.6).toFixed(3)})`);
  night.addColorStop(1, `rgba(2,4,10,${peak.toFixed(3)})`);
  ctx.fillStyle = night;
  ctx.fillRect(0, 0, W, H);

  // A cold cast over the lit part, so the near ground reads as lit rather than
  // as merely less dark. No streaks: still air, and nothing in it.
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgba(150,175,220,${(1 - d * 0.30).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/**
 * **The hazards that live somewhere**: vents, fountains, sinking air and
 * magnetic anomalies.
 *
 * M29a's rule, from radiation: *if a hazard has a boundary, draw the boundary*.
 * These four are the first hazards in the game with a **place** rather than a
 * global level, so the boundary is a position on the map, and all four publish
 * theirs on `ship.env` for exactly this.
 *
 * A fountain draws its telegraph before it fires, which is the M12 rule for
 * guns applied to weather - a hazard that arrives without warning is a dice
 * roll, not a difficulty.
 */
export function drawPlacedHazards(ctx, cam, W, H, terrain, ship, time) {
  const env = ship && ship.env;
  if (!env) return;
  const half = W / 2 / cam.scale + 240;
  const visible = (x) => x > cam.x - half && x < cam.x + half;
  const groundAt = (x) => terrain.heightAt(x);

  // --- Enceladus: vapour vents. They lift, so they are drawn rising.
  for (const v of env.plumes || []) {
    if (!visible(v.x) || v.strength <= 0.01) continue;
    const gy = groundAt(v.x);
    const h = 220 + 520 * v.strength;
    const g = ctx.createLinearGradient(0, gy, 0, gy - h);
    g.addColorStop(0, `rgba(190,235,255,${(0.34 * v.strength).toFixed(3)})`);
    g.addColorStop(0.5, `rgba(190,235,255,${(0.16 * v.strength).toFixed(3)})`);
    g.addColorStop(1, 'rgba(190,235,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(v.x - v.radius * 0.30, gy);
    ctx.lineTo(v.x - v.radius * 0.80, gy - h);
    ctx.lineTo(v.x + v.radius * 0.80, gy - h);
    ctx.lineTo(v.x + v.radius * 0.30, gy);
    ctx.closePath();
    ctx.fill();
  }

  // --- Io: lava fountains, with the swell before the throw.
  for (const e of env.eruptions || []) {
    if (!visible(e.x)) continue;
    const gy = groundAt(e.x);
    if (e.firing > 0.01) {
      const h = e.reach * e.firing;
      const g = ctx.createLinearGradient(0, gy, 0, gy - h);
      g.addColorStop(0, `rgba(255,214,120,${(0.85 * e.firing).toFixed(3)})`);
      g.addColorStop(0.45, `rgba(255,120,50,${(0.5 * e.firing).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255,80,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(e.x - e.radius * 0.4, gy);
      ctx.lineTo(e.x - e.radius * 0.75, gy - h);
      ctx.lineTo(e.x + e.radius * 0.75, gy - h);
      ctx.lineTo(e.x + e.radius * 0.4, gy);
      ctx.closePath();
      ctx.fill();
    } else if (e.warn > 0.02) {
      // The telegraph: the vent mouth glows and swells before it throws.
      const r = e.radius * (0.35 + 0.3 * e.warn);
      ctx.save();
      ctx.globalAlpha = 0.30 + 0.5 * e.warn;
      ctx.strokeStyle = '#ff8a3c';
      ctx.shadowColor = '#ff8a3c';
      ctx.shadowBlur = 20 * e.warn;
      ctx.lineWidth = 3 / cam.scale + 1;
      ctx.beginPath();
      ctx.ellipse(e.x, gy - 4, r, r * 0.30, 0, Math.PI, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  // --- Venus: sinking air. Drawn falling, which is the whole warning.
  for (const c of env.downColumns || []) {
    if (!visible(c.x)) continue;
    const r = c.radius || 190;
    const gy = groundAt(c.x);
    const top = gy - 1000;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = 'rgba(215,190,140,0.5)';
    ctx.lineWidth = 2 / cam.scale + 0.6;
    for (let i = -2; i <= 2; i++) {
      const x = c.x + (i / 2) * r * 0.8;
      // Chevrons falling down the column, so the direction is unmistakable.
      const drop = ((time * 210 + i * 90) % 300);
      for (let k = 0; k < 4; k++) {
        const y = top + ((k * 300 + drop) % 1000);
        if (y > gy - 20) continue;
        ctx.beginPath();
        ctx.moveTo(x - 13, y - 9);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 13, y - 9);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- Ganymede: the field. A ring on the ground where the anomaly sits, so
  // the instruments lying has a *location* the player can learn.
  for (const a of env.anomalies || []) {
    if (!visible(a.x)) continue;
    const gy = groundAt(a.x);
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.6 + a.x * 0.002);
    ctx.save();
    ctx.globalAlpha = 0.16 + 0.14 * pulse;
    ctx.strokeStyle = '#9db4ff';
    ctx.lineWidth = 2 / cam.scale + 0.8;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.ellipse(a.x, gy - 10, a.radius * (k / 3), a.radius * (k / 3) * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

/**
 * The radiation belt, drawn where it actually is.
 *
 * Tom: *"radiation ... is not visible on the screen (radiation should only be in
 * high altitude - around half of the top screen)"*. Both halves of that are the
 * same complaint - a hazard whose only expression is a rising gauge cannot be
 * learned, because nothing on screen tells you where it starts or which way to
 * go. So the belt is a band with a **visible lower edge**: cross it downward and
 * the sweep stops.
 *
 * It draws only while a sweep is running, and it fades with the sweep's own
 * envelope, so the sky is clear between fronts and the warning arrives before
 * the damage does.
 */
export function drawRadiation(ctx, cam, W, H, terrain, ship, time) {
  const env = ship.env;
  if (!env || !(env.radiationSweep > 0.02) || !env.radiationBand) return;
  const s = env.radiationSweep;
  ctx.save();
  // The edge follows the ground, because the belt is an altitude above terrain
  // rather than a line on the screen: over a ridge it rides up with the ridge.
  const step = 24;
  const edge = [];
  for (let sx = 0; sx <= W; sx += step) {
    const wx = cam.x + (sx - W / 2) / cam.scale;
    edge.push([sx, (terrain.heightAt(wx) - env.radiationBand - cam.y) * cam.scale + H / 2]);
  }
  // The gradient is anchored on the **edge**, not on the top of the screen. Draw
  // it from the screen top and the boundary is the faintest part of it - and the
  // boundary is the only thing the player needs to see, because crossing it
  // downward is the whole counterplay. It also has to read when the edge is off
  // the bottom of the view, which is exactly when you are deepest in the belt.
  const avgY = edge.reduce((a, [, y]) => a + y, 0) / edge.length;
  const grd = ctx.createLinearGradient(0, avgY - 340, 0, avgY);
  grd.addColorStop(0, `rgba(158,255,140,${0.07 * s})`);
  grd.addColorStop(0.72, `rgba(158,255,140,${0.16 * s})`);
  grd.addColorStop(1, `rgba(158,255,140,${0.30 * s})`);
  ctx.beginPath();
  ctx.moveTo(W, -H);
  ctx.lineTo(0, -H);
  for (const [x, y] of edge) ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = grd;
  ctx.fill();
  // The edge itself, which is the line the player is actually flying against.
  ctx.beginPath();
  edge.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.strokeStyle = `rgba(158,255,140,${0.4 + 0.5 * s})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(158,255,140,0.7)';
  ctx.shadowBlur = 12;
  ctx.setLineDash([14, 10]);
  ctx.lineDashOffset = -time * 26;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Pad markers only, drawn above the dust so the target never disappears. */
export function drawPadBeacons(ctx, cam, W, H, terrain, level, time, rawStrength, opts = {}) {
  const strength = rawStrength * (opts.beacon || 1);
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
  ctx.restore();}
