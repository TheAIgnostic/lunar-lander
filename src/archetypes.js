// Macro terrain silhouettes (roadmap section 5, layer 1).
//
// Each archetype describes an elevation profile in world space plus the places
// a landing zone can sensibly sit. The generator lays this under the existing
// midpoint-displacement noise, so the terrain keeps its familiar texture while
// gaining a deliberate shape: a bowl, a trench, a ridge with a terrace.
//
// Elevation is "up positive". The generator converts it to canvas y.

import { clamp, smoothstep, TAU } from './util.js';

const bump = (d, w) => Math.exp(-(d / w) * (d / w));          // gaussian in normalised units
const plateau = (d, w, sharp = 6) => clamp(1 - Math.pow(Math.abs(d) / w, sharp), 0, 1);

/**
 * Every archetype builds from a normalised x (0..1 across the level) and
 * returns:
 *   elevation(nx) -> world px above the base line (may be negative)
 *   anchors[]     -> candidate landing zones { nx, kind, width, slope }
 *   noise(nx)     -> 0..1 multiplier for how much random relief to allow here
 */
export const ARCHETYPES = {
  /** Bowl with a raised rim and a pad on an offset inner shelf. */
  crater(rng, cfg) {
    const cx = rng.range(0.38, 0.62);
    const R = rng.range(0.26, 0.34);
    const depth = cfg.relief * rng.range(0.9, 1.25);
    const rim = cfg.relief * rng.range(0.28, 0.45);
    const shelfSide = rng() < 0.5 ? -1 : 1;
    const shelfNx = cx + shelfSide * R * rng.range(0.42, 0.6);
    const shelfE = -depth * 0.42;
    return {
      elevation(nx) {
        const d = Math.abs(nx - cx) / R;
        let e = 0;
        if (d < 1) e -= depth * (1 - d * d);
        e += rim * bump(d - 1, 0.13);
        // the shelf itself: a flat step part-way down the inner wall
        e += (shelfE - e) * plateau(nx - shelfNx, 0.055, 4) * 0.9;
        return e;
      },
      noise: (nx) => (Math.abs(nx - cx) / R < 1 ? 0.35 : 0.9),
      anchors: [
        { nx: shelfNx, kind: 'shelf', width: rng.range(90, 150), slope: rng.range(-0.03, 0.03) },
        { nx: cx, kind: 'floor', width: rng.range(150, 230), slope: 0 },
      ],
    };
  },

  /** Steep-walled trench; the pad sits on the floor, out of sight from above. */
  canyon(rng, cfg) {
    const cx = rng.range(0.35, 0.65);
    const halfW = rng.range(0.1, 0.16);
    const depth = cfg.relief * rng.range(1.1, 1.5);
    const floorOffset = rng.range(-0.5, 0.5) * halfW;
    return {
      elevation(nx) {
        return -depth * plateau(nx - cx, halfW, 8);
      },
      noise: (nx) => (Math.abs(nx - cx) < halfW ? 0.25 : 1),
      anchors: [
        { nx: cx + floorOffset, kind: 'floor', width: rng.range(90, 140), slope: 0 },
      ],
    };
  },

  /** A tall ridge with a terrace cut into one flank. */
  ridge(rng, cfg) {
    const cx = rng.range(0.35, 0.65);
    const w = rng.range(0.1, 0.16);
    const height = cfg.relief * rng.range(1.0, 1.4);
    const side = rng() < 0.5 ? -1 : 1;
    const terraceNx = cx + side * w * rng.range(0.7, 1.1);
    return {
      elevation(nx) {
        let e = height * bump(nx - cx, w);
        const t = plateau(nx - terraceNx, 0.05, 4);
        e += (height * 0.55 - e) * t * 0.95;
        return e;
      },
      noise: () => 0.7,
      anchors: [
        { nx: terraceNx, kind: 'terrace', width: rng.range(80, 130), slope: rng.range(-0.04, 0.04) },
      ],
    };
  },

  /** Flat-topped plateau beside lower ground: land high or low. */
  mesa(rng, cfg) {
    const edge = rng.range(0.4, 0.6);
    const step = cfg.relief * rng.range(0.8, 1.2);
    const dir = rng() < 0.5 ? 1 : -1;
    return {
      elevation(nx) {
        return step * smoothstep(clamp((dir * (nx - edge)) / 0.06 + 0.5, 0, 1));
      },
      noise: () => 0.75,
      anchors: [
        { nx: edge + dir * 0.12, kind: 'plateau', width: rng.range(100, 160), slope: 0 },
        { nx: edge - dir * 0.18, kind: 'floor', width: rng.range(140, 200), slope: rng.range(-0.05, 0.05) },
      ],
    };
  },

  /** Crater with a central peak - the pad hides on a terrace beside it. */
  caldera(rng, cfg) {
    const cx = rng.range(0.42, 0.58);
    const R = rng.range(0.28, 0.36);
    const depth = cfg.relief * rng.range(1.0, 1.3);
    const peak = cfg.relief * rng.range(0.9, 1.3);
    const side = rng() < 0.5 ? -1 : 1;
    const shelfNx = cx + side * R * rng.range(0.5, 0.68);
    return {
      elevation(nx) {
        const d = Math.abs(nx - cx) / R;
        let e = 0;
        if (d < 1) e -= depth * (1 - d * d);
        e += cfg.relief * 0.35 * bump(d - 1, 0.12);
        e += peak * bump(nx - cx, 0.045);
        e += (-depth * 0.35 - e) * plateau(nx - shelfNx, 0.05, 4) * 0.9;
        return e;
      },
      noise: (nx) => (Math.abs(nx - cx) / R < 1 ? 0.3 : 0.85),
      anchors: [
        { nx: shelfNx, kind: 'shelf', width: rng.range(80, 120), slope: rng.range(-0.03, 0.03) },
      ],
    };
  },

  /** Rolling dunes; the pad sits in a trough between crests. */
  dunes(rng, cfg) {
    const k1 = rng.range(2.5, 4.5);
    const k2 = rng.range(6, 9);
    const ph1 = rng.range(0, TAU);
    const ph2 = rng.range(0, TAU);
    const amp = cfg.relief * rng.range(0.5, 0.8);
    // a trough is where the primary sine is at its minimum
    const troughNx = clamp(((1.5 * Math.PI - ph1) / (k1 * TAU)) % 1, 0.2, 0.8);
    return {
      elevation(nx) {
        return amp * (Math.sin(nx * k1 * TAU + ph1) * 0.7 + Math.sin(nx * k2 * TAU + ph2) * 0.3);
      },
      noise: () => 0.5,
      anchors: [
        { nx: troughNx, kind: 'trough', width: rng.range(100, 150), slope: 0 },
      ],
    };
  },

  /** Broad shallow depression - the gentlest shape, for opening missions. */
  basin(rng, cfg) {
    const cx = rng.range(0.4, 0.6);
    const R = rng.range(0.34, 0.46);
    const depth = cfg.relief * rng.range(0.45, 0.7);
    return {
      elevation(nx) {
        const d = clamp(Math.abs(nx - cx) / R, 0, 1);
        return -depth * (1 - d * d);
      },
      noise: () => 0.8,
      anchors: [
        { nx: cx + rng.range(-0.12, 0.12), kind: 'floor', width: rng.range(160, 240), slope: 0 },
      ],
    };
  },
};

export const ARCHETYPE_NAMES = Object.keys(ARCHETYPES);

/** Build an archetype instance, or null for the legacy noise-only terrain. */
export function buildArchetype(name, rng, cfg) {
  if (!name || name === 'legacy') return null;
  const make = ARCHETYPES[name];
  if (!make) throw new Error(`unknown terrain archetype: ${name}`);
  return make(rng, cfg);
}
