// The instruments: the HUD and every pointer, panel and gauge on it.
// Split from render.js in M23. This reads `g` each frame and draws state; it
// owns no state of its own.

import { FONT, flashOf, throb, GREEN, RED, CYAN, MAG, AMBER, VIOLET, panel, label, value } from './drawkit.js';
import { clamp, TAU } from './util.js';
import { normalizeAngle, ENVELOPE } from './ship.js';
import { nodeWorth } from './economy.js';
import { WORLDS } from './levels.js';
import { keyLabel } from './input.js';

/**
 * **How wrong the instruments are allowed to be, and what a Hardened Radar buys.**
 *
 * Two channels, deliberately different: radiation *jitters* the needle (a
 * buzzing readout reads as broken, and you ignore it) and `falseRadar` *drifts*
 * it (a smooth, confident lie you have to fly around). `noiseResist` cuts both.
 *
 * Lifted out of `drawHUD` in M31 so the gate can **measure** the thing rather
 * than re-encode the expression beside it. A witness that reimplements the rule
 * it is testing agrees with itself and with nothing else - which is the shape of
 * every fault this project has recorded. Neither of these touches the
 * simulation; that is asserted separately.
 */
export function instrumentNoise(ship) {
  const rad = ship.statusLevels ? ship.statusLevels.radiation : 0;
  const resist = (ship.loadout && ship.loadout.noiseResist) || 1;
  return clamp(rad / 100, 0, 1) * (ship.env && ship.env.shielded ? 0.25 : 1) * resist;
}

/** The signed, swimming lie `falseRadar` puts on the readouts. */
export function instrumentDrift(ship) {
  return ((ship.env && ship.env.instrumentError) || 0)
    * ((ship.loadout && ship.loadout.noiseResist) || 1);
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
  const noise = instrumentNoise(ship);

  const rowY = py + 66 * s;
  const gap = 26 * s;
  // Radiation scrambles the instruments long before it does anything else -
  // a consequence the player can read without a damage model.
  //
  // **Ganymede lies differently, and the difference is the point.** Radiation
  // *jitters*: the number buzzes, and a buzzing needle reads as a broken
  // instrument you should ignore. `falseRadar` *drifts*: the number is wrong by
  // a smooth, slowly swimming amount, and a drifting needle reads as an
  // instrument that is confidently wrong - which is the thing you have to fly
  // around. `ship.env.instrumentError` is signed and swims, so it is added
  // rather than jittered.
  //
  // Neither touches the simulation. The lander flies true and only the readout
  // moves, which is the accessibility rule taken from the other side: there,
  // presentation may never reach the simulation; here, a hazard may never leave
  // presentation. It also means no autopilot in this project can measure it,
  // the same blind spot visibility has had since M24.
  const drift = instrumentDrift(ship);
  const fuzz = (v, d = 1) => {
    const shown = v + drift * (d === 0 ? 26 : 3.2);
    return (noise > 0.25
      ? (shown + (Math.random() - 0.5) * noise * (d === 0 ? 14 : 4)).toFixed(d)
      : shown.toFixed(d));
  };
  readout(ctx, 'ALT', `${fuzz(alt, 0)}m`, px + 14, rowY, s, '#dff6ff');
  readout(ctx, 'V-SPD', `${fuzz(Math.abs(ship.vy / 6))}`, px + 14, rowY + gap, s, st.vy ? GREEN : RED,
    ship.vy < 0 ? '↑' : '↓');
  readout(ctx, 'H-SPD', `${fuzz(Math.abs(ship.vx / 6))}`, px + 14, rowY + gap * 2, s, st.vx ? GREEN : RED,
    ship.vx < 0 ? '←' : '→');

  // tilt bubble on the right of the stack
  const tx = px + pw - 40 * s;
  const ty = rowY + gap * 0.6;
  // The safe cone is **this lander's**, so fitting landing gear visibly widens
  // the gauge it is judged by rather than being invisible until the debrief.
  // Passed in rather than reached for: the gauge is a drawing function and has
  // never had a ship, which is what the first version of this assumed.
  drawTiltGauge(ctx, tx, ty, 26 * s, ship.angle, st.tilt, (ship.envelope || ENVELOPE).GOOD.tilt);

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
  if (ship.arrestLeft > 0 || ship.arrestFired > 0) drawArrestCue(ctx, W, H, g, s);
  if (ship.overdriveLeft > 0 || ship.overdrive > 0 || ship.overheat > 0) {
    drawOverdriveCue(ctx, W, H, g, s);
  }

  // ---- off-screen pad chevrons
  drawPadPointers(ctx, W, H, g);
  drawMaterialPointers(ctx, W, H, g);
  if (threats) drawThreatPointers(ctx, W, H, g);

  // ---- proximity alarm vignette
  const danger = alt < 60 && ship.vy > (ship.envelope || ENVELOPE).GOOD.vy * 1.4 && ship.alive && !ship.landed;
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

function drawTiltGauge(ctx, cx, cy, r, angle, ok, safeTilt) {
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
  ctx.arc(0, 0, r, -Math.PI / 2 - safeTilt, -Math.PI / 2 + safeTilt);
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
/**
 * **Emergency Arrest, and whether it would fire right now.**
 *
 * A control that silently refuses three presses in four is the Pulse Laser's
 * dry press again (M30a), and the answer to that was to make the state
 * readable rather than to loosen the rule. So the cue is dim while the lander
 * is too high, too tilted or still climbing, and lights the moment all three
 * conditions are met — which is also the moment a player would think of it.
 *
 * It reads `ship.canArrest`, the same question `ship.step` asks, rather than
 * repeating the three conditions here: one rule, one implementation.
 */
function drawArrestCue(ctx, W, H, g, s) {
  const { ship, terrain, level } = g;
  const ready = ship.arrestLeft > 0 && ship.canArrest(level, terrain);
  const fired = ship.arrestFired > 0;
  const w = 118 * s;
  const h = 26 * s;
  const x = 16;
  const y = H - h - 16 - (g.abilities && g.abilities.equipped ? 58 * s : 0);
  panel(ctx, x, y, w, h, fired ? 'rgba(255,179,71,0.6)'
    : ready ? 'rgba(255,179,71,0.45)' : 'rgba(120,140,160,0.22)');
  ctx.font = `700 ${10 * s}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = fired ? '#fff2c4' : ready ? AMBER : 'rgba(150,168,185,0.6)';
  ctx.fillText(fired ? 'ARREST FIRED' : 'ARREST', x + 12, y + 17 * s);
  if (!fired) {
    ctx.textAlign = 'right';
    ctx.font = `600 ${9 * s}px ${FONT}`;
    ctx.fillStyle = ready ? 'rgba(255,179,71,0.8)' : 'rgba(150,168,185,0.45)';
    ctx.fillText(ready ? keyLabel(g.arrestKey || 'f') : '—', x + w - 12, y + 17 * s);
  }
  ctx.textAlign = 'left';
}

/**
 * **Combat Overdrive, and the bill.**
 *
 * The window and the penalty are the same control seen at three moments, so
 * they are one panel rather than two: READY while the charge is unspent,
 * OVERDRIVE with the seconds left while it runs, and ENGINE HOT with the
 * seconds owed afterwards. A capstone whose cost arrived invisibly would be a
 * trap, and the derate is the one thing here a player cannot feel directly -
 * the engine is simply weaker and nothing says why.
 *
 * Read straight off the ship's own timers, the same values `engineThrust` and
 * `Abilities` read, rather than a copy of the rule.
 */
function drawOverdriveCue(ctx, W, H, g, s) {
  const { ship } = g;
  const running = ship.overdrive > 0;
  const hot = !running && ship.overheat > 0;
  const w = 118 * s;
  const h = 26 * s;
  const x = 16;
  // Stacked above the arrest cue when both are carried, so neither is hidden.
  const arrestShown = ship.arrestLeft > 0 || ship.arrestFired > 0;
  const y = H - h - 16 - (g.abilities && g.abilities.equipped ? 58 * s : 0)
    - (arrestShown ? (h + 6) : 0);
  panel(ctx, x, y, w, h, running ? 'rgba(95,245,255,0.6)'
    : hot ? 'rgba(255,90,90,0.45)' : 'rgba(95,245,255,0.32)');
  ctx.font = `700 ${10 * s}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = running ? '#ccfbff' : hot ? RED : CYAN;
  ctx.fillText(running ? 'OVERDRIVE' : hot ? 'ENGINE HOT' : 'OVERDRIVE', x + 12, y + 17 * s);
  ctx.textAlign = 'right';
  ctx.font = `600 ${9 * s}px ${FONT}`;
  if (running || hot) {
    ctx.fillStyle = running ? 'rgba(204,251,255,0.85)' : 'rgba(255,90,90,0.8)';
    ctx.fillText(`${(running ? ship.overdrive : ship.overheat).toFixed(1)}s`, x + w - 12, y + 17 * s);
  } else {
    ctx.fillStyle = 'rgba(95,245,255,0.75)';
    ctx.fillText(keyLabel(g.overdriveKey || 'g'), x + w - 12, y + 17 * s);
  }
  ctx.textAlign = 'left';
}

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
  // Heat and cold have consequences since M29 - heat derates the engine, cold
  // stiffens the thrusters - so the label says what is being lost once it bites
  // rather than only how full the gauge is. Until M29 neither was ever raised
  // by anything: `'heat'` and `'cold'` were spelled against builders named
  // `thermal` and `cryo`, so these two lines had never once drawn.
  if (heat > 2) {
    entries.push({
      id: 'heat', label: heat > 60 ? 'ENGINE HEAT · THRUST DOWN' : 'ENGINE HEAT',
      urgency: heat / 100 + (heat > 60 ? 0.25 : 0), level: heat / 100, color: heat > 60 ? RED : AMBER,
    });
  }
  if (cold > 2) {
    entries.push({
      id: 'cold', label: cold > 55 ? 'COLD SOAK · THRUSTERS SLOW' : 'COLD SOAK',
      urgency: cold / 100 + (cold > 55 ? 0.25 : 0), level: cold / 100, color: cold > 60 ? RED : CYAN,
    });
  }
  const corrosion = ship.statusLevels ? ship.statusLevels.corrosion : 0;
  const charge = ship.statusLevels ? ship.statusLevels.charge : 0;
  if (corrosion > 2) {
    entries.push({
      id: 'acid', label: corrosion > 45 ? 'CORROSION · HULL' : 'CORROSION',
      urgency: corrosion / 100 + (corrosion > 45 ? 0.3 : 0), level: corrosion / 100,
      color: corrosion > 45 ? RED : AMBER,
    });
  }
  if (charge > 2) {
    entries.push({
      id: 'charge', label: charge > 50 ? 'MAGNETIC · PULLING DOWN' : 'MAGNETIC FIELD',
      urgency: charge / 100 + (charge > 50 ? 0.25 : 0), level: charge / 100,
      color: charge > 50 ? RED : '#9db4ff',
    });
  }
  // The two that are places rather than levels. They warn while you are *in*
  // them, which is the only time the warning is actionable.
  if (ship.env && ship.env.downdraft > 0.05) {
    entries.push({
      id: 'downdraft', label: 'SINKING AIR', urgency: 0.4 + ship.env.downdraft * 0.6,
      level: ship.env.downdraft, color: RED,
    });
  }
  if (ship.env && Math.abs(ship.env.instrumentError) > 0.25) {
    entries.push({
      id: 'radar', label: 'INSTRUMENTS UNRELIABLE', urgency: 0.5,
      level: Math.min(1, Math.abs(ship.env.instrumentError)), color: '#9db4ff',
    });
  }

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

