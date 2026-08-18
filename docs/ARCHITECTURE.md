# Architecture audit

Written for roadmap Phase 0. Records what exists *before* the roguelite expansion, so later
milestones can prove they did not disturb the flight model.

## Files and responsibilities

| File | Owns | Touched by which milestone |
| --- | --- | --- |
| `src/main.js` | state machine, camera, scoring, persistence, overlay screens, settings | most |
| `src/ship.js` | integration, collision, landing verdict, ship geometry | M1 (grade rework) |
| `src/terrain.js` | midpoint-displacement heightmap, pad carving, cave ceiling, fuel cells | M2, M3 |
| `src/levels.js` | 12 mission configs + endless generator + world palettes | M5 (becomes PlanetDefinition) |
| `src/render.js` | parallax background, world, ship, HUD | M1 (post-landing panel), M10 (hangar) |
| `src/particles.js` | pooled particles, debris, rings, floating text | — |
| `src/audio.js` | synthesized engines, impacts, chimes | — |
| `src/input.js` | keyboard + touch -> intent object | — |
| `src/util.js` | math, seeded RNG (mulberry32), safeStore | — |
| `src/debug.js` | telemetry overlay, landing-envelope bars (F3 / F4) | added by M0 |
| `test/autopilot.js` | phased autopilot; the regression harness | every milestone |

Physics does not import UI. Landing evaluation already returns a verdict string from a touchdown
snapshot, which is the seam the M1 severity score plugs into.

## Baseline physics constants (do not drift without a measured reason)

Scale: **6 px = 1 m**.

| Constant | Value | Source |
| --- | --- | --- |
| main thrust | 130 px/s² (21.7 m/s²) | `SHIP.thrust` |
| RCS angular accel | 5.0 rad/s² | `SHIP.rcsAccel` |
| max spin | 3.2 rad/s | `SHIP.maxSpin` |
| spin damping | 0.995 per 1/60 s | `SHIP.spinDamp` |
| side thrust (direct mode) | 62 px/s² | `SHIP.sideThrust` |
| fuel burn | main 9/s, RCS 3.2/s, hold 5/s, side 5.5/s | `SHIP` |
| gravity range | 28–66 px/s² (4.7–11 m/s²) | `levels.js` |
| fixed timestep | 1/120 s, max 8 substeps per frame | `main.js` |
| landing envelope | PERFECT vy 11 / vx 7 / 3.5° · GOOD 20 / 13 / 8° · HARD 34 / 22 / 15° | `ENVELOPE` |
| off-pad rule | PERFECT or GOOD on ground shallower than 10° survives at ×1 | `ship.collide` |

Collision uses three hull points plus two feet, tested against the heightmap each substep. At the
fastest observed speeds (~480 px/s) a substep advances 4 px, so tunnelling is not possible — the
test is "below the surface", not a swept intersection.

## Current 12 missions -> mission templates

| Current | Reusable as | Note |
| --- | --- | --- |
| LUNA 1–3 | Moon 1, 2, 5 | already crater/ridge-ish; needs the archetype pass for shelves |
| MARS 4–6 | Mars 1, 2, 4 | wind is absent today; Mars gusts arrive in M6 |
| EUROPA 7–9 | Europa 2, 3 | cave ceiling maps onto "crevasse / ice bridge" |
| TITAN 10–12 | Titan 1, 2, 5 | wind+drag already implemented; kept for the later Titan chapter |
| endless | side mode | stays as-is, per Tom's decision to keep old content |

## Determinism

`?seed=N` (or `__setSeed(n)`) pins every mission; terrain seed is `g.seed ^ (level.id * 2654435761)`.
Verified: the same seed reproduces heightmap, pads and fuel cells exactly; a different seed differs.
This is a precondition for every later validation test.

## Debug controls

- `F3` or `` ` `` — telemetry overlay (fps, seed, gravity, position, velocity, altitude, angle,
  spin, surface slope, fuel, throttle, live inputs, steering mode, current verdict, last touchdown)
- `F4` — landing-envelope bars showing each criterion against its perfect/good/hard/crash zones
