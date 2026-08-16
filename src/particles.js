// Pooled particle system: exhaust, dust, sparks, smoke + debris lines,
// shockwave rings and floating score text.

import { clamp, TAU } from './util.js';

const MAX = 900;

export class Particles {
  constructor() {
    this.p = new Array(MAX);
    for (let i = 0; i < MAX; i++) {
      this.p[i] = { life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, r: 1, kind: 0, hue: 0, drag: 0.98, grav: 0 };
    }
    this.next = 0;
    this.debris = [];
    this.rings = [];
    this.texts = [];
  }

  clear() {
    for (const q of this.p) q.life = 0;
    this.debris.length = 0;
    this.rings.length = 0;
    this.texts.length = 0;
  }

  spawn(x, y, vx, vy, life, r, kind, hue, drag = 0.985, grav = 0) {
    const q = this.p[this.next];
    this.next = (this.next + 1) % MAX;
    q.x = x; q.y = y; q.vx = vx; q.vy = vy;
    q.life = life; q.max = life; q.r = r; q.kind = kind; q.hue = hue;
    q.drag = drag; q.grav = grav;
  }

  /** Rocket exhaust cone. dirX/dirY is the exhaust direction (unit). */
  exhaust(x, y, dirX, dirY, power, spread = 0.34) {
    const n = power > 0.6 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * spread;
      const s = 150 + Math.random() * 220 * power;
      this.spawn(
        x + (Math.random() - 0.5) * 4,
        y + (Math.random() - 0.5) * 4,
        Math.cos(a) * s,
        Math.sin(a) * s,
        0.28 + Math.random() * 0.3,
        2.4 + Math.random() * 2.6,
        0, // flame
        Math.random() < 0.35 ? 1 : 0,
        0.94,
        0
      );
    }
    if (Math.random() < 0.5) {
      const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 0.9;
      const s = 40 + Math.random() * 60;
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.7 + Math.random() * 0.6, 5 + Math.random() * 6, 2, 0, 0.97, -6);
    }
  }

  rcs(x, y, dirX, dirY) {
    for (let i = 0; i < 2; i++) {
      const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 0.7;
      const s = 60 + Math.random() * 90;
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.16 + Math.random() * 0.14, 1.6 + Math.random() * 1.6, 1, 0, 0.9);
    }
  }

  /** Ground dust kicked up when the exhaust hits terrain, or on touchdown. */
  dust(x, y, amount, spread = 1) {
    for (let i = 0; i < amount; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6 * spread;
      const s = 40 + Math.random() * 190;
      this.spawn(x + (Math.random() - 0.5) * 20, y, Math.cos(a) * s, Math.sin(a) * s * 0.5,
        0.6 + Math.random() * 0.8, 4 + Math.random() * 8, 2, 0, 0.955, 26);
    }
  }

  sparks(x, y, amount, hue = 0) {
    for (let i = 0; i < amount; i++) {
      const a = Math.random() * TAU;
      const s = 90 + Math.random() * 340;
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.35 + Math.random() * 0.55,
        1.6 + Math.random() * 2.4, 1, hue, 0.93, 60);
    }
  }

  explode(x, y, vx, vy, shards) {
    for (const s of shards) {
      const a = Math.random() * TAU;
      const sp = 60 + Math.random() * 260;
      this.debris.push({
        x, y,
        vx: vx * 0.4 + Math.cos(a) * sp,
        vy: vy * 0.4 + Math.sin(a) * sp,
        a: Math.random() * TAU,
        av: (Math.random() - 0.5) * 12,
        seg: s,
        life: 2.6 + Math.random() * 1.4,
        max: 4,
      });
    }
    this.sparks(x, y, 46, 0);
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * TAU;
      const s = 20 + Math.random() * 140;
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 1.2 + Math.random(), 8 + Math.random() * 14, 2, 0, 0.96, -10);
    }
    this.ring(x, y, 460, 0.55, '#ff6b3d');
  }

  ring(x, y, r, life, color) {
    this.rings.push({ x, y, r, life, max: life, color });
  }

  text(x, y, str, color = '#5ff5ff', size = 22) {
    this.texts.push({ x, y, str, color, size, life: 1.6, max: 1.6 });
  }

  update(dt, terrain) {
    for (const q of this.p) {
      if (q.life <= 0) continue;
      q.life -= dt;
      q.vy += q.grav * dt;
      const d = Math.pow(q.drag, dt * 60);
      q.vx *= d;
      q.vy *= d;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const b = this.debris[i];
      b.life -= dt;
      b.vy += 90 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.a += b.av * dt;
      b.av *= 0.99;
      if (terrain) {
        const g = terrain.heightAt(b.x);
        if (b.y > g) {
          b.y = g;
          b.vy *= -0.32;
          b.vx *= 0.6;
          b.av *= 0.5;
          if (Math.abs(b.vy) < 12) { b.vy = 0; b.vx *= 0.7; }
        }
      }
      if (b.life <= 0) this.debris.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y -= 34 * dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const q of this.p) {
      if (q.life <= 0) continue;
      const t = clamp(q.life / q.max, 0, 1);
      let color;
      if (q.kind === 0) {
        // flame: white-hot -> amber -> deep red
        color = t > 0.72 ? '#fff6d8' : t > 0.42 ? (q.hue ? '#ffd166' : '#ff9d3d') : '#ff4a2b';
      } else if (q.kind === 1) {
        color = q.hue ? '#ff4fd8' : '#bff8ff';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        color = `rgba(150,160,190,${0.24 * t})`;
      }
      ctx.fillStyle = color;
      ctx.globalAlpha = q.kind === 2 ? 1 : t;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * (q.kind === 2 ? 1 + (1 - t) * 1.6 : t * 0.6 + 0.4), 0, TAU);
      ctx.fill();
      if (q.kind === 2) ctx.globalCompositeOperation = 'lighter';
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    for (const b of this.debris) {
      const t = clamp(b.life / b.max, 0, 1);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      ctx.strokeStyle = `rgba(120,220,255,${0.15 + t * 0.75})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.seg[0], b.seg[1]);
      ctx.lineTo(b.seg[2], b.seg[3]);
      ctx.stroke();
      ctx.restore();
    }

    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      ctx.strokeStyle = r.color;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.lineWidth = 3 * (1 - t) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * t, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawTexts(ctx) {
    for (const t of this.texts) {
      const k = clamp(t.life / t.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = k;
      ctx.fillStyle = t.color;
      ctx.font = `700 ${t.size}px ui-monospace, "SF Mono", Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 16;
      ctx.fillText(t.str, t.x, t.y);
      ctx.restore();
    }
  }
}
