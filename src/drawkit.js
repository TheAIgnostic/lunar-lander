// The shared drawing vocabulary: the palette, the type, the pulse that every
// blinking thing asks about, and the tint helpers. Split from render.js in M23
// so the world, the machines and the instruments could live in their own files
// without re-declaring what they share - the bundle is one scope, so a token
// can only be declared once.

import { clamp } from './util.js';

export const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/**
 * How much a warning is allowed to pulse, from the player's flashing setting.
 * Everything that blinks asks this first, so "reduced" is one switch rather
 * than a dozen forgotten special cases.
 */
export function flashOf(g) {
  const f = g && g.settings && g.settings.flash;
  return f == null ? 1 : f;
}

/**
 * A 0..1 throb for markers that breathe. `flash` scales how deep the breath is
 * and 0 holds it steady at full brightness, so a warning never disappears -
 * reducing flashing must never reduce information.
 */
export function throb(t, speed, flash = 1, low = 0.6) {
  if (flash <= 0) return 1;
  return low + (1 - low) * (0.5 + 0.5 * Math.sin(t * speed)) * flash + (1 - flash) * (1 - low);
}

export const GREEN = '#4dff9f';
export const RED = '#ff3b5c';
export const CYAN = '#5ff5ff';
export const MAG = '#ff4fd8';
export const AMBER = '#ffb347';
export const VIOLET = '#c9a4ff';        // material: the one colour ore is drawn in

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) * (1 + amt), 0, 255) | 0;
  const g = clamp(((n >> 8) & 255) * (1 + amt), 0, 255) | 0;
  const b = clamp((n & 255) * (1 + amt), 0, 255) | 0;
  return `rgb(${r},${g},${b})`;
}

/** The same, with an alpha - so a raised shape can fade into the ground body. */
export function shadeA(hex, amt, a) {
  return shade(hex, amt).replace('rgb(', 'rgba(').replace(')', `,${a})`);
}

// ---------------------------------------------------------------- HUD

/** A translucent HUD panel with an accent edge. */
export function panel(ctx, x, y, w, h, accent = 'rgba(95,245,255,0.25)') {
  ctx.fillStyle = 'rgba(5,10,20,0.55)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8);
  else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
}

export function label(ctx, text, x, y, size = 10, color = 'rgba(160,190,215,0.75)') {
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
}

export function value(ctx, text, x, y, size = 20, color = '#dff6ff') {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText(text, x, y);
}

