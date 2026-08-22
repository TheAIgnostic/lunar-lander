// Developer telemetry overlay. Off by default; F3 or ` toggles it.
// Exists so landing tuning is done from measured numbers rather than impressions
// (roadmap Phase 0). Draws in screen space, after the HUD.

import { clamp } from './util.js';
import { ENVELOPE, normalizeAngle } from './ship.js';

const DEBUG_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const PX_PER_M = 6;

export const Debug = {
  enabled: false,
  showEnvelope: true,
  showEnemyPaths: false,
  frames: [],
  lastTouchdown: null,

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  },

  /** Called every frame with the real delta so the overlay can report fps. */
  sample(dt) {
    this.frames.push(dt);
    if (this.frames.length > 60) this.frames.shift();
  },

  /** Recorded by main.js at every touchdown, crash or landing. */
  recordTouchdown(info) {
    this.lastTouchdown = info;
  },

  get fps() {
    if (!this.frames.length) return 0;
    const avg = this.frames.reduce((a, b) => a + b, 0) / this.frames.length;
    return avg > 0 ? 1 / avg : 0;
  },

  draw(ctx, W, H, g) {
    if (!this.enabled) return;
    const ship = g.ship;
    const t = g.terrain;
    const rows = [];

    rows.push(['fps', this.fps.toFixed(0)]);
    rows.push(['state', g.state]);
    if (g.level) {
      rows.push(['mission', `${g.level.world} ${g.level.id} ${g.level.title}`]);
      rows.push(['seed', String(g.seed)]);
      rows.push(['gravity', `${g.level.gravity} px/s² (${(g.level.gravity / PX_PER_M).toFixed(2)} m/s²)`]);
      if (g.level.wind || g.level.gust) {
        rows.push(['wind now', `${(ship.windNow || 0).toFixed(1)} px/s (base ${g.level.wind}, gust ${g.level.gust})`]);
        rows.push(['drag', String(g.level.drag)]);
      }
    }
    if (t && ship) {
      const ground = t.heightAt(ship.x);
      rows.push(['pos', `${ship.x.toFixed(1)}, ${ship.y.toFixed(1)}`]);
      rows.push(['vel', `${ship.vx.toFixed(2)}, ${ship.vy.toFixed(2)} px/s`]);
      rows.push(['speed', `${Math.hypot(ship.vx, ship.vy).toFixed(2)} px/s (${(Math.hypot(ship.vx, ship.vy) / PX_PER_M).toFixed(2)} m/s)`]);
      rows.push(['alt', `${(ground - ship.y - 16).toFixed(1)} px`]);
      rows.push(['angle', `${(normalizeAngle(ship.angle) * 57.2958).toFixed(2)}°  spin ${ship.spin.toFixed(3)} rad/s`]);
      rows.push(['slope@x', `${(t.slopeAt(ship.x) * 57.2958).toFixed(1)}°`]);
      rows.push(['fuel', `${ship.fuel.toFixed(1)} / ${ship.maxFuel} (${((ship.fuel / ship.maxFuel) * 100).toFixed(0)}%)`]);
      rows.push(['throttle', ship.throttle.toFixed(2)]);
      rows.push(['inputs', `${ship.thrusting ? 'B' : '-'}${ship.rcsLeft ? 'L' : '-'}${ship.rcsRight ? 'R' : '-'}${ship.holding ? 'H' : '-'}`]);
      rows.push(['steering', g.settings ? g.settings.steering + (g.settings.invertRotation ? '/inv' : '') : '?']);
      const v = ship.verdict();
      rows.push(['verdict now', v || 'CRASH']);
    }
    if (g.field && !g.field.empty) {
      const f = g.field;
      rows.push(['threats', `${f.live.length}/${f.enemies.length} live · ${f.engaged} engaged · ${f.kills} down`]);
      rows.push(['  fire', `${f.shotsFired} shots · ${f.hitsTaken} hits taken · ${f.suppressed} held`]);
      rows.push(['  shots live', String(f.shots.length)]);
      const near = f.live
        .map((e) => ({ e, d: Math.hypot(e.x - ship.x, e.y - ship.y) }))
        .sort((a, b) => a.d - b.d)[0];
      if (near) rows.push(['  nearest', `${near.e.type} ${near.e.state} ${near.d.toFixed(0)} px`]);
      rows.push(['hull', `${Math.round(ship.hull)} / ${ship.hullMax}${ship.shieldActive ? ` · shield ${ship.shieldHp.toFixed(0)}` : ''}`]);
    }
    for (const slot of (g.slots || [])) {
      if (!slot.equipped) continue;
      const a = slot.readout();
      rows.push(['module', `${a.name} ${a.charges}/${a.maxCharges}` +
        `${a.active ? ` active ${a.remaining.toFixed(1)}s` : a.cooldown > 0 ? ` cd ${a.cooldown.toFixed(1)}s` : ' ready'}`]);
    }
    if (this.lastTouchdown) {
      const d = this.lastTouchdown;
      rows.push(['last touchdown', `${d.result} ${d.quality || ''}`]);
      rows.push(['  at', `vy ${d.vy.toFixed(2)} vx ${d.vx.toFixed(2)} tilt ${d.tiltDeg.toFixed(2)}° pad ${d.onPad ? 'yes' : 'no'}`]);
    }

    const pad = 8;
    const lh = 14;
    const w = 340;
    const h = rows.length * lh + pad * 2;
    const x = 16;
    const y = H - h - 16;

    ctx.save();
    ctx.fillStyle = 'rgba(2,6,12,0.86)';
    ctx.strokeStyle = 'rgba(95,245,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6); else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();

    ctx.font = `500 11px ${DEBUG_FONT}`;
    ctx.textBaseline = 'top';
    rows.forEach((r, i) => {
      ctx.fillStyle = 'rgba(150,180,205,0.9)';
      ctx.textAlign = 'left';
      ctx.fillText(r[0], x + pad, y + pad + i * lh);
      ctx.fillStyle = '#dff6ff';
      ctx.textAlign = 'right';
      ctx.fillText(r[1], x + w - pad, y + pad + i * lh);
    });

    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(150,180,205,0.55)';
    ctx.fillText('F3 debug · F4 envelope · F5 enemy ranges', x, y - 14);
    ctx.restore();

    if (this.showEnvelope && g.state === 'play' && ship && ship.alive && !ship.landed) {
      this.drawEnvelope(ctx, W, H, ship);
    }
  },

  /** Three bars showing how close each landing criterion is to its limits. */
  drawEnvelope(ctx, W, H, ship) {
    const env = ship.envelope || ENVELOPE;
    const bars = [
      // **This lander's envelope, not the stock one.** Gear widens what the
      // grader accepts by up to 72%, and bars drawn against the stock figures
      // describe equipment the player has not got - or worse, hide the
      // equipment they bought.
      ['V-SPD', Math.abs(ship.vy), env.PERFECT.vy, env.GOOD.vy, env.HARD.vy],
      ['H-SPD', Math.abs(ship.vx), env.PERFECT.vx, env.GOOD.vx, env.HARD.vx],
      ['TILT', Math.abs(normalizeAngle(ship.angle)), env.PERFECT.tilt, env.GOOD.tilt, env.HARD.tilt],
    ];
    const w = 220;
    const x = W - w - 16;
    let y = H - 96;
    ctx.save();
    ctx.font = `600 10px ${DEBUG_FONT}`;
    for (const [name, value, p, gd, hard] of bars) {
      const frac = clamp(value / (hard * 1.25), 0, 1);
      ctx.fillStyle = 'rgba(2,6,12,0.8)';
      ctx.fillRect(x, y, w, 20);
      // zones: perfect | good | hard
      const zone = (from, to, color) => {
        ctx.fillStyle = color;
        const a = (from / (hard * 1.25)) * w;
        const b = (to / (hard * 1.25)) * w;
        ctx.fillRect(x + a, y + 13, b - a, 4);
      };
      zone(0, p, 'rgba(77,255,159,0.75)');
      zone(p, gd, 'rgba(95,245,255,0.6)');
      zone(gd, hard, 'rgba(255,179,71,0.55)');
      zone(hard, hard * 1.25, 'rgba(255,59,92,0.6)');
      ctx.fillStyle = value <= gd ? '#4dff9f' : value <= hard ? '#ffb347' : '#ff3b5c';
      ctx.fillRect(x + frac * w - 1, y + 9, 2, 12);
      ctx.fillStyle = 'rgba(200,225,240,0.9)';
      ctx.textAlign = 'left';
      ctx.fillText(name, x + 2, y + 9);
      ctx.textAlign = 'right';
      ctx.fillText(name === 'TILT' ? `${(value * 57.2958).toFixed(1)}°` : value.toFixed(1), x + w - 2, y + 9);
      y += 26;
    }
    ctx.restore();
  },
};
