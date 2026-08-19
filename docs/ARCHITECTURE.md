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
| `src/terrain.js` | heightmap, the entry point, distance-banded pads, the fuel road, cargo, material deposits, ceilings, rocks | —/M14/M15 |
| `src/archetypes.js` | 7 macro silhouettes and their landing-zone anchors | M2 |
| `src/spawn.js` | the starting position and momentum rule (the terrain owns the entry since M14) | M3/M14 |
| `src/validate.js` | structural mission checks: spawn clearance, approach corridors, delta-v bound | M3 |
| `src/planets.js` | 10 PlanetDefinitions and the gravity mapping | M4/M5 |
| `src/missions.js` | authored Moon/Mars/Europa chapters, survey-chapter generator, `chapterFor` | M4-M9 |
| `src/forces.js` | force/status interface: atmosphere, dust, wind channels, thermal, cryo, plumes, radiation | M5-M7 |
| `src/save.js` | versioned MetaSave + RunState, legacy migration, corruption recovery | M8 |
| `src/economy.js` | rewards, the carried haul, deposit worth, the transmitted/cargo split, settlement and banking | M9/M15 |
| `src/route.js` | discovery tiers, four-card offers, checkpoint rule | M9 |
| `src/components.js` | 5 component tracks, `deriveLoadout` / `deriveFull`, purchase rules | M10/M11 |
| `src/skills.js` | 3 skill trees, `deriveSkills`, purchase and gating rules | M11 |
| `src/modules.js` | 5 active + 4 passive modules, blueprint guarantee list | M11/M12 |
| `src/enemies.js` | enemy roster, placement around the prize, telegraphs, projectiles, damage, rewards | M12/M14 |
| `src/objectives.js` | the optional objectives: conditions judged at touchdown, and six cargo recoveries | M14/M15 |
| `src/abilities.js` | the active-module runtime: charges, duration, cooldown, effects | M12 |
| `src/render.js` | background, world, ship, dust, pad and material beacons, enemies, hangar ship, HUD | —/M12/M15 |
| `src/debug.js` | F3 telemetry overlay, F4 landing-envelope bars, F5 enemy ranges | M0/M12 |
| `src/particles.js` | pooled particles, debris, rings, floating text | — |
| `src/audio.js` | synthesized engines, impacts, chimes | — |
| `src/input.js` | rebindable key map, touch, and the intent object the sim reads | —/M13 |
| `src/levels.js` | the original 12 classic missions, endless generator, world palettes | — |
| `src/util.js` | math, seeded RNG, `safeStore` | — |
| `serve.js` | the dev server, `no-store` so an edit always reaches the browser | M13 |

**The axis the map is built on:** distance from the entry. The terrain picks where the lander comes
in *before* it places pads, then places them in bands measured from there — near, mid, deep. Content
is authored **prize-first**: `pads[0]` goes in the deepest band and the last entry in the nearest, so
swapping two entries in a mission's `pads` array moves them across the map. Reward follows distance
(`padTier` into `missionReward`), the fuel road is a line of cells from the entry to the deep zone,
and enemies are placed around the prize rather than scattered. The near zone is always reachable on
the starting tank; the deep one is deliberately not.

**The rule that holds accessibility honest:** every accessibility setting changes *presentation*
only — shake, flashing, instrument size, contrast and key bindings never reach the simulation.
`test/settings-tests.js` flies the same mission with all of them changed and asserts the result is
byte-identical, so a player who needs the motion turned off is flying the same game as everyone else.

**The rule that makes reward a decision:** material is a physical deposit in the world, not a figure
computed at touchdown. `missionReward` counts what the lander carried home and the landing grade
*multiplies* that haul; what stays computed is a stipend, so a flight that collects nothing is still
paid and is paid about a quarter as much. Deposits are placed by the same rule that places the
guards — around the deep landing zone and back along the fuel road — and never in the near band,
never within 150 px of a landing zone, never in the sanctuary approach corridor, and never close
enough to a fuel cell to be swept up with it. `validate.js` enforces all four, which is what keeps
"a mission is always completable while collecting nothing" a statement about geometry.

**The rule that holds combat fair:** every mission keeps a *sanctuary* — its lowest-multiplier pad
and the 420 px column above it — outside every machine's engagement range. `placeEnemies` and
`validateEnemies` measure against the same points (`sanctuaryGates`), so the rule cannot drift
between what is generated and what is checked. That is what makes "a weapon is never required" a
statement about geometry rather than about skill.

**The rule that holds the upgrade system together:** components, skills and the equipped passive are
*derived* into a per-run ship spec at mission start (`deriveFull` then `ship.applyLoadout`). The
shared `SHIP` and `LANDING` constants are never mutated — that is what stops a reloaded save from
stacking an upgrade twice.

Physics does not import UI. Landing evaluation consumes a touchdown snapshot and returns a result
object. Hazards apply through the shared force interface, so a new body is data, not code.

## Tests

```bash
./test/run-all.sh 20                 # everything: 10 unit suites, 2 fixtures, 2 sweeps, the audit, build
node test/validate-missions.js 20    # structural + flown validation of every mission family
node test/mvp-regression.js 20       # all 27 missions, performance, long session, determinism
node test/enemies-tests.js           # enemies, combat rules, the active-module runtime
node test/settings-tests.js          # key bindings, accessibility, presentation neutrality
node test/objectives-tests.js        # objectives, distance tiers, the fuel road, cargo, deposits
node test/encounter-audit.js 20      # what a player actually meets: enemies, ore, both routes
node test/physics-fixture.js         # physics drift, no pilot in the loop
node test/flight-fixture.js          # mission outcomes flown by the autopilot
./macos/build.sh                     # bundles, then self-tests the app
```

`test/pilot.js` is the control law as a pure module, shared by the node validator and the browser
harness so both fly identically. `test/autopilot.js` is the browser wrapper — it *adapts* the shared
law rather than reimplementing it, which it used to, having quietly drifted three milestones behind.
Load it with `await __autopilotReady` before flying, since it imports the law as a module.

`flyMission` takes `{ padIndex }` to choose a landing zone and `{ viaCells: true }` to fly the fuel
road — the two routes every tiered mission has, and both sweeps check both. `{ viaMaterial: true }`
adds the ore to that route: the control law never detours for something it was not told to fly to,
so "the autopilot collected nothing" is evidence about the pilot and not about the map. The
encounter audit flies all three. It keeps enemies **off** unless `{ enemies: true }` asks for them:
the terrain sweep and the flight fixture measure whether the ground can be flown; mixing gunfire into them would turn a
terrain regression into a combat regression. The combat section of `validate-missions.js` turns them
on and flies with nothing equipped, because what it has to prove is that nothing is needed.

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
| `__goMission('LUNA', 3)` | jump straight to any mission of any chapter |
| `__field()` | the live enemy field: machines, shots, kills, suppressed shots |
| `__game.carried` | what the hold has picked up this mission; `__game.terrain.materialLeft()` is what is still out there |
| `__useAbility()` | fire the equipped active module |
| `__runChapter('MARS')` | fly a whole chapter headlessly (after `await __autopilotReady`) |
| `__settleNow()` | resolve a pending landing or crash immediately |

## Environment notes that cost real time

- **`requestAnimationFrame` does not fire while the browser pane is hidden.** Timed test sweeps stall
  silently. Use `__advance` / `__flyHeadless`, and check `document.hidden` before blaming the game.
- **ES modules cache hard**, which is why `serve.js` exists: it is a 40-line static server that sends
  everything `no-store`, so a reload after editing `src/` always lands. `.claude/launch.json` runs
  it. Reaching for `python3 -m http.server` again means reaching for the old bug, where the fix was
  restarting on a new port every time.
- **Screenshots misreport at emulated viewport sizes.** If one looks half-painted, re-issue
  `resize_window` (nudge the height by 1 px) and shoot again.
- **The macOS self-test is the bundling canary.** It has caught a duplicate `const` across modules, a
  module missing from the bundler list, a namespace import that vanished from the bundle, and (M15)
  a module-level `const X = SOME_IMPORT.field` that throws "cannot access before initialization"
  because the bundler emits that module first. Read imported config **inside** functions, not at
  module load. Run the self-test before calling any milestone done.
- **Ratio-based performance checks measure the JIT.** The MVP regression compared the combat loop
  against a physics-only loop that runs after the whole mission sweep has warmed it; the denominator
  tracked warm-up history rather than cost. Measure the property you mean — for combat, cost *per
  machine* as machines are added.

## Reading order for a new session

1. `ROADMAP_STATUS.md` — what is done, what is next, and the decisions behind both.
2. This file — what each module owns and the rules that hold the design together.
3. `test/BASELINE.md` — the measurements, milestone by milestone, ending with the encounter audit.

Then **measure before editing**: `./test/run-all.sh 20` for the suites, and the encounter audit
described at the end of `test/BASELINE.md` for what a player actually meets in the world. Every
milestone in this project that went well started from a number, and both of the ones that went
badly started from an assumption.

## After the MVP (M14+)

The MVP is complete and measured (`test/BASELINE.md`, M13 section). What the next milestones inherit:

- **Two of eight enemies exist.** Coil Cannon, Patrol Drone, Mortar Platform, Magnetic Mine, Solar
  Sentry and Shielded Guardian are roster entries with no implementation. Adding one is an
  `ENEMY_TYPES` entry plus a draw function; the field, telegraph, projectile, damage and reward
  systems are shared. `PlanetDefinition.eligibleEnemySets` is where a new design joins the bodies
  that should field it.
- **Seven bodies still fly generated survey chapters** rather than authored missions: Mercury,
  Venus, Titan, Enceladus, Io, Pluto, Ganymede. `src/missions.js` is where authored content goes,
  and `generateChapter` is what it replaces.
- **Landing bands await human playtest data.** They were deliberately not retuned in M13 — the only
  recorded data is an autopilot, which is not a proxy for a person.
- **Moving landing platforms** are still deferred (Europa 5, Io 5): `padAt` and the landing check
  would have to become time-aware.
- **Mission fuel budgets have not been re-authored** since the map grew, and M15 gave the gap a
  number: taking the deposits that lie on the fuel road is comfortable (236/300 landings, 27–55%
  left), but sweeping every deposit lands 156/300 and 0/20 on `mars-2` and `europa-4`. Written for a
  900 px traverse, now flown across 2,000–2,600 px with a road and an ore field in between.
- **Controller support does not exist.** Keyboard remapping does, and every flight control is
  rebindable, but there is no gamepad backend to remap.
- **Achievements** are deliberately not built. The spec gates them behind stable progression, and
  the statistics they would be built on only started being recorded in M13.
- **The numbers to tune** live in config objects: `COMBAT` in `enemies.js`, `ABILITY` in
  `abilities.js`, `LANDING` in `landing.js`, `CORE_PITY`/`DEBRIEF` in `economy.js`.

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
  spin, surface slope, fuel, throttle, live inputs, steering mode, current verdict, last touchdown,
  and — when the mission has any — threat states, shots fired, hits taken, hull and module state)
- `F4` — landing-envelope bars showing each criterion against its perfect/good/hard/crash zones
- `F5` — enemy engagement rings: outer range in red, the minimum range a ground gun cannot shoot
  inside in green

Accessibility settings live on the settings screen, not behind a debug key: motion, flashing,
instrument size, contrast and key bindings. They are stored in `meta.settings` and applied by
`applyPresentation()` in `main.js` (a CSS variable and two root classes) plus the `flash`/`contrast`
options passed into the renderer.
