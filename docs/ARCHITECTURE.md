# Architecture audit

Written for roadmap Phase 0. Records what exists *before* the roguelite expansion, so later
milestones can prove they did not disturb the flight model.

## Files and responsibilities

Everything under `src/` is a plain ES module, loaded directly in the browser and by the node tests.

| File | Owns | Added |
| --- | --- | --- |
| `src/main.js` | state machine, camera, run loop, every overlay screen, persistence glue | — |
| `src/ship.js` | integration, collision, the touchdown settling window, hull, per-run spec | — |
| `src/landing.js` | severity score, band thresholds, gear tier, every landing constant | M1 |
| `src/terrain.js` | heightmap, pad carving, cave ceilings, fuel cells, rocks, sanity assertions | — |
| `src/archetypes.js` | 7 macro silhouettes and their landing-zone anchors | M2 |
| `src/spawn.js` | the starting position and momentum rule | M3 |
| `src/validate.js` | structural mission checks: spawn clearance, approach corridors, delta-v bound | M3 |
| `src/planets.js` | 10 PlanetDefinitions and the gravity mapping | M4/M5 |
| `src/missions.js` | authored Moon/Mars/Europa chapters, survey-chapter generator, `chapterFor` | M4-M9 |
| `src/forces.js` | force/status interface: atmosphere, dust, wind channels, thermal, cryo, plumes, radiation | M5-M7 |
| `src/save.js` | versioned MetaSave + RunState, legacy migration, corruption recovery | M8 |
| `src/economy.js` | rewards, the transmitted/cargo split, settlement and banking | M9 |
| `src/route.js` | discovery tiers, four-card offers, checkpoint rule | M9 |
| `src/components.js` | 5 component tracks, `deriveLoadout` / `deriveFull`, purchase rules | M10/M11 |
| `src/skills.js` | 3 skill trees, `deriveSkills`, purchase and gating rules | M11 |
| `src/modules.js` | 4 active + 4 passive modules, blueprint guarantee list | M11 |
| `src/render.js` | background, world, ship, dust, pad beacons, hangar ship, HUD | — |
| `src/debug.js` | F3 telemetry overlay, F4 landing-envelope bars | M0 |
| `src/particles.js` | pooled particles, debris, rings, floating text | — |
| `src/audio.js` | synthesized engines, impacts, chimes | — |
| `src/input.js` | keyboard + touch into an intent object | — |
| `src/levels.js` | the original 12 classic missions, endless generator, world palettes | — |
| `src/util.js` | math, seeded RNG, `safeStore` | — |

**The rule that holds the upgrade system together:** components, skills and the equipped passive are
*derived* into a per-run ship spec at mission start (`deriveFull` then `ship.applyLoadout`). The
shared `SHIP` and `LANDING` constants are never mutated — that is what stops a reloaded save from
stacking an upgrade twice.

Physics does not import UI. Landing evaluation consumes a touchdown snapshot and returns a result
object. Hazards apply through the shared force interface, so a new body is data, not code.

## Tests

```bash
./test/run-all.sh 20                 # everything: 7 unit suites, 2 fixtures, validation, build
node test/validate-missions.js 20    # structural + flown validation of every mission family
node test/physics-fixture.js         # physics drift, no pilot in the loop
node test/flight-fixture.js          # mission outcomes flown by the autopilot
./macos/build.sh                     # bundles, then self-tests the app
```

`test/pilot.js` is the control law as a pure module, shared by the node validator and the browser
harness so both fly identically. `test/autopilot.js` is the browser wrapper.

Two fixtures, deliberately: the **physics** fixture replays a fixed input script and moves only when
the simulation moves; the **flight** fixture records autopilot outcomes and moves when either the
game or the pilot changes. Improving the pilot should move the second and leave the first alone.

## Dev hooks (on `window`)

| Hook | Use |
| --- | --- |
| `__game`, `__ship`, `__input`, `__settings`, `__debug` | live state |
| `__act('...')` | fire any UI action: `chapter:LUNA`, `buy:gear`, `skill:fuel-mix`, `route:0`, `equip:passive:ice-cleats` |
| `__advance(dt)` | step the simulation without rendering |
| `__draw()` | render one frame on demand |
| `__setSeed(n)` or `?seed=N` | pin every mission for reproducible runs |
| `__flyHeadless({padIndex, approach})` | fly the current mission instantly |
| `__runAllHeadless(12)` | fly the whole classic campaign in ~450 ms |
| `__preview(archetype, relief, detail)` | rebuild the current mission with another terrain shape |
| `__settleNow()` | resolve a pending landing or crash immediately |

## Environment notes that cost real time

- **`requestAnimationFrame` does not fire while the browser pane is hidden.** Timed test sweeps stall
  silently. Use `__advance` / `__flyHeadless`, and check `document.hidden` before blaming the game.
- **ES modules cache hard.** After editing `src/`, a reload may still serve the old file. Restart the
  static server on a **new port** to force a fresh load.
- **Screenshots misreport at emulated viewport sizes.** If one looks half-painted, re-issue
  `resize_window` (nudge the height by 1 px) and shoot again.
- **The macOS self-test is the bundling canary.** It has caught a duplicate `const` across modules, a
  module missing from the bundler list, and a namespace import that vanished from the bundle. Run it
  before calling any milestone done.

## For M12 (enemies)

The Combat skill tree already exists in `src/skills.js`, gated behind a feature flag. Turning it on
is one place: `main.js` passes `{ enemies: false }` into `skillCheck` and `buySkill`. Missions
already declare `enemyBudget` and `enemySets` — SILENT BATTERY, IRON RAIN, STORM EYE, UNDER-ICE
SIGNAL, DRIFTING PLATE — and nothing reads them yet. Hull damage lives in `ship.js` and is the
natural consumer for enemy fire. The enemy roster and its rules are in section 12 of the spec.

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
