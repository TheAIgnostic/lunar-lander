# ROADMAP STATUS

Working document for the roguelite expansion.

- **Spec:** Tom's brief, `~/Downloads/Lunar_Landing_Roguelite_Roadmap_for_Claude.md`. Read it before
  starting a milestone — section 6 has the 50-mission table, 12 the enemy roster, 18 the MVP scope.
  It lives outside the repo and this environment cannot copy it in; ask Tom to move it into `docs/`
  if it ever goes missing.
- **Architecture, dev hooks, environment gotchas:** `docs/ARCHITECTURE.md`
- **Measured behaviour at every milestone:** `test/BASELINE.md`
- **Branch:** `v2`, cut from the tag `snapshot-2026-08-16`. `main` stays playable and untouched.
- **Run everything:** `./test/run-all.sh 20`

**Rule for every milestone:** ends with a playable build, a passing test pass, a commit, and this
file updated. `main` stays untouched and playable throughout.

---

## Current state (measured, not assumed)

| Spec assumption | Reality in this codebase |
| --- | --- |
| "approximately 15 levels" | 12 campaign missions (4 worlds x 3) + endless mode |
| bodies | LUNA, MARS, EUROPA (cave), TITAN (wind+drag) |
| save system to migrate | 5 localStorage keys: `tv_high`, `tv_unlocked`, `tv_bests`, `tv_muted`, `tv_settings` |
| landing grades | hard per-band cutoffs in `ENVELOPE` (ship.js), evaluated on the first contact frame |
| terrain | midpoint-displacement heightmap + carved flat pads + optional cave ceiling |
| ~2600 lines | src/{util,audio,input,terrain,levels,particles,ship,render,main}.js |

Scale: **6 px = 1 m**. Thrust 130 px/s^2 (21.7 m/s^2). Gravity 28-66 px/s^2 (4.7-11 m/s^2).

---

## Gravity: recommended mapping

Literal m/s^2 values break the game — real Moon gravity (1.62) at this scale is 9.7 px/s^2, a
thrust-to-weight of 13, and Enceladus (0.11) would be 0.7 px/s^2, effectively weightless. That
violates pillar 1 (preserve the flight feel).

Adopted: compress with `g_px = 28 * sqrt(g_real / 1.62)`, anchored on the Moon, then apply a
per-body `feelOffset` (hand-tuned, roughly +/-12%) so neighbouring bodies are distinguishable in
the hand rather than only on paper. The compressed value preserves ordering and relative
character while landing almost exactly on the existing tuning:

| Body | Real m/s^2 | Mapped px/s^2 | Note |
| --- | ---: | ---: | --- |
| Enceladus | 0.11 | 7.3 | floaty by design |
| Pluto | 0.62 | 17.3 | |
| Europa | 1.31 | 25.2 | |
| Titan | 1.35 | 25.6 | |
| Ganymede | 1.43 | 26.3 | |
| Moon | 1.62 | 28.0 | = current LUNA 1 exactly |
| Io | 1.80 | 29.5 | |
| Mercury | 3.70 | 42.3 | |
| Mars | 3.71 | 42.4 | = current MARS 4 (42) |
| Venus | 8.87 | 65.5 | = current TITAN 12 (66) |

Real values stay in the UI for flavour; the mapped value drives physics. Both live in
`PlanetDefinition`.

---

## Milestones

Sized to fit inside a single 5-hour usage window. Each is independently useful and leaves the
game coherent. Spec phases in brackets.

| # | Milestone | Contains | Risk |
| --- | --- | --- | --- |
| M0 | Audit + rails [P0] | architecture note, debug overlay (velocity/angle/fuel/impulse/seed/grade), baseline physics constants recorded, this file | low |
| M1 | Landing grade rework [P1a] | combined severity score (vy 45 / vx 25 / angle 20 / centre 10), config thresholds, 150-250 ms aggregation window, settle-upright rule, post-landing breakdown panel | low |
| M2 | Terrain grammar [P1b] | macro archetypes (crater/canyon/ridge/basin/shelf), approach constraints, landing-zone geometry, micro detail | **high** |
| M3 | Terrain validation [P1b] | autopilot-driven reachability proof, >=2 approach paths, no hidden lethality, deterministic seeds | medium |
| M4 | Moon chapter [P1] | Moon 1-5 on the new grammar, data-driven MissionDefinition | medium |
| M5 | Planet data model [P2] | PlanetDefinition/MissionDefinition/hazard+force interface; port existing wind/drag/cave into it | medium |
| M6 | Mars chapter [P2] | Mars 1-5: drag, gusts, dust visibility | low |
| M7 | Europa chapter [P2] | Europa 1-5: low friction, cracking ice, radiation timing | medium |
| M8 | Run loop + save v2 [P3a] | 3 shuttles, seed retention on retry, 5-mission chapters, sector checkpoints, versioned save + migration from tv_* | **high** |
| M9 | Route + economy [P3b] | 4-choice route cards, eligibility tiers, salvage/research/tech cores/materials, banking + crash recovery | medium |
| M10 | Hangar [P4] | close-up ship scene, 4 component tracks x 4 levels (Hull, Gear, Engine/Fuel, Sensors), visible ship changes, costs | medium |
| M11 | Skills + loadout [P5] | 3 trees x 4 nodes, 1 active + 1 passive slot, Laser/Shield/Sensor Pulse, Fuel Recycler/Gyro/Ice Cleats | medium |
| M12 | Enemies [P6] | shared telegraph/projectile/damage system, Sentry Turret + Seeker Drone, non-combat path validation | medium |
| M13 | MVP polish [P8] | balance from recorded data, accessibility, stats, full autopilot regression over all 15 missions | low |

M0-M13 delivers the spec's own MVP (section 18): Moon + Mars + Europa, 15 missions, roguelite
loop, hangar, skills, two enemies. The remaining 7 bodies (35 missions) are M14+ and are not
scheduled until the MVP is stable — the spec says the same.

---

## Progress

- [x] **M0 — audit + rails** (commit `d56726e`)
  - `docs/ARCHITECTURE.md`: file ownership, every physics constant, mission->chapter mapping
  - `src/debug.js`: F3 telemetry overlay, F4 landing-envelope bars
  - deterministic seeds (`?seed=N` / `__setSeed`) — verified reproducible and seed-sensitive
  - frame loop split into `advance(dt)` + `draw()`; headless harness runs 12 missions in 437 ms
    (rAF does not fire in a hidden tab, which had been stalling every test sweep)
  - `test/BASELINE.md`: reference sweep at seed 12345 — 10/12 landed, 9 PERFECT
  - acceptance: controls untouched, no new errors, macOS self-test passes
- [x] **M1 — landing grade rework** (this commit)
  - `src/landing.js`: every threshold, weight and band in one config object
  - combined severity score, vy 45 / vx 25 / tilt 20 / centre 10, normalised against each body's
    safe envelope and multiplied by the landing-gear tier (ready for M10)
  - per-axis crash caps so one bad axis cannot hide inside a good average; centre gates PERFECT
    only and can never fail a landing
  - 150-250 ms aggregation window with real gear response: compression, bounce, friction, spin
    damping, self-righting on two feet, pivoting on one
  - impacts graded on the median of the last five pre-contact samples — a one- or two-frame spike
    of 220 px/s is rejected, a sustained 60 px/s still crashes
  - borderline results promoted one band when the ship settles stable
  - post-landing panel: every metric, its weighted contribution, and what cost the better grade
  - 28 unit tests (`node test/landing-tests.js`), fuel identical to baseline on all 12 missions
- [x] **M2 — terrain grammar** (this commit)
  - `src/archetypes.js`: 7 macro silhouettes — crater, canyon, ridge, mesa, caldera, dunes, basin —
    each supplying an elevation profile, a noise-damping mask and landing-zone anchors
  - the existing midpoint noise now rides *on top of* the silhouette, damped where the shape must
    stay readable (0.25 inside a canyon, 0.35 inside a crater bowl)
  - relief is scaled to fit the world, so a canyon deeper than the level bends instead of clipping
    flat against the floor
  - pads are placed at shape anchors (inner shelf, canyon floor, ridge terrace) and support slope;
    extra pads beyond the available anchors go to the flattest free ground, never on top of another
  - layer-4 micro detail: boulders scattered on the surface, off the pads and off cliffs
  - `_assertSane()` refuses to return a NaN world — a pad spec without a width used to produce one
    silently, which would have been brutal to debug across 50 authored missions
  - 147 structural tests (`node test/terrain-tests.js`)
  - **classic 12 missions are byte-identical**: they stay on the `legacy` path, fuel and grades
    match `test/BASELINE.md` exactly
- [x] **M3 — terrain validation** (this commit)
  - `src/spawn.js`: the spawn rule extracted from the game loop, so validation tests the *real*
    starting position and momentum rather than an assumed one
  - `src/validate.js`: structural checks — spawn clearance, pad width and slope, a clear approach
    corridor above every pad, cave corridor pinch points, unavoidable overhangs, and a delta-v
    lower bound against the fuel budget
  - `test/pilot.js`: the control law as a pure module, so missions fly in node with no browser
  - `test/validate-missions.js`: structural + three real flights (direct, from the left, from the
    right) across N seeds for every archetype, cave variant and classic mission
  - the sweep separates what it can prove from what it can only evidence: structural problems fail
    the run, flight failures are reported as warnings, because a failed flight may be the test
    pilot's fault rather than the mission's
  - pilot improvements found by the sweep: position-hold trim instead of velocity-hold, hold
    altitude while off-target, and a wall-ahead guard gated to transit
  - result: **all 7 archetypes and 3 cave variants 10/10 structurally valid and 10/10 landed**;
    classic 1-10 clean; 11-12 reachable on every seed but pilot-limited under crosswind;
    one warning — ICE CORRIDOR seed 1274, where geometry is sound (603 px corridor, 609 px
    headroom) but the pilot strikes the ceiling
- [x] **M4 — Moon chapter** (this commit)
  - `src/planets.js`: PlanetDefinition shape with the agreed gravity mapping —
    `gravityPx = 28 × √(g_real/1.62) × feelOffset`, Moon at 28.0 px/s²
  - `src/missions.js`: Moon 1-5 authored as data (MissionDefinition), with an adapter that turns a
    mission into the level config the generator already consumes — content never touches engine shape
  - FIRST SCAR (crater), RILLE RUN (canyon), FAR-SIDE RELAY (ridge), SILENT BATTERY (mesa),
    TYCHO DESCENT (caldera, ×5 sliver beside the central peak)
  - optional objectives and enemy budgets carried as data now, so M12 does not rewrite the content
  - playable from the menu as MOON EXPEDITION, beside CLASSIC CAMPAIGN and ENDLESS
  - validated 20/20 on every mission: structural, reachable, landed, zero single-path;
    41-49% fuel left on a competent flight
- [x] **M5 — planet data model** (this commit)
  - `src/planets.js`: all ten bodies as PlanetDefinitions — real gravity, mapped gravity,
    atmosphere, drag, wind, surface friction, visibility, hazards, rare material, terrain palette
  - `src/forces.js`: the shared force/status interface. Wind and drag moved behind it **unchanged**;
    thermal, cryo and plume forces added; five status channels (heat, cold, corrosion, radiation,
    charge) ready for the damage model
  - missions inherit their planet's environment, so a MissionDefinition stays pure content
  - surface friction is planet data now, which is what Europa's ice will use in M7
  - `test/flight-fixture.js`: a durable flight regression — 17 missions × 3 seeds recorded, so any
    future change that alters how the lander flies shows up as a diff
  - `test/run-all.sh`: one command for every check
  - verified physics-neutral by diffing flight results across the refactor: **identical**
- [x] **M6 — Mars chapter** (this commit)
  - Mars 1-5 authored as data: RED VEIL (basin), VALLES CROSSWIND (canyon), BURIED ARRAY (dunes),
    IRON RAIN (mesa), STORM EYE (caldera)
  - two new forces, both data-driven: `dust` (cycling visibility, readable fronts) and
    `windChannels` (alternating bands by altitude — the Valles mechanic)
  - dust rendering with the pad beacons redrawn **above** the haze, per the spec's rule that the
    safe pad must stay distinct in low visibility
  - EXPEDITION chapter picker: Moon and Mars, showing gravity, atmosphere and hazards
  - **acceptance test for M5 passed**: the chapter needed no flight-loop changes, only data plus
    two force definitions
  - caught a real regression by rendering: M5's `status` field shadowed the ship's `status()`
    method, so the HUD had been throwing since then. Fixed, with a test that makes the class of
    shadowing bug impossible to reintroduce
  - `test/physics-fixture.js` added: a pilot-independent physics regression
- [x] **M7 — Europa chapter** (this commit)
  - GLASS LANDING, BLUE FRACTURE, RADIATION PASS, UNDER-ICE SIGNAL, DRIFTING PLATE
  - **ice that slides**: friction was applied per frame and decayed to nothing regardless of planet;
    it is retention per second now, so Europa slides 90 px at 30 px/s drift where the Moon slides 10
  - control returns to the player during a slide — arresting it is the mechanic, not a cutscene
  - **fragile pads**: a fracture limit printed on the approach, drawn as a broken line, and a
    distinct failure when exceeded
  - **radiation**: cyclic sweeps, shielded by terrain, with instrument noise as the consequence
    until the damage model lands
  - ceiling guard now scales with climb rate — closes the ICE CORRIDOR warning open since M3
- [x] **M8 — run loop and save v2** (this commit)
  - `src/save.js`: versioned MetaSave (permanent) and RunState (disposable), each behind a storage
    adapter so neither can throw into the game
  - migration from the five legacy `tv_*` keys, verified live: an existing player keeps high score,
    unlocks, per-mission bests, mute and steering choice; the legacy keys are left intact
  - three-shuttle expeditions, a crash replaying the same mission on the same seed, a cleared
    chapter returning a shuttle, and banking on both success and failure
  - an interrupted expedition survives a full reload and offers RESUME from the menu
  - corrupt saves are set aside under `tv_save_corrupt` and reported, never a blank screen
  - 40 save unit tests, including a storage adapter that throws on every call
  - `build.js` now derives namespace objects from module exports — the hand-listed version silently
    missed `import * as Save` and shipped a bundle that threw on load
- [x] **M9 — route and economy** (this commit)
  - `src/route.js`: discovery tiers (A now, B after two non-Moon chapters, C after five), four
    deterministic offers with gravity, atmosphere, hazards, enemy intensity, rare material,
    recommended counters and difficulty — one hazard withheld, so the forecast is useful but
    incomplete, as the spec asks
  - `src/economy.js`: salvage split half-transmitted half-cargo, research never lost, cores only on
    a safe landing, one rare material per body
  - **generated survey chapters for every body without authored missions**, so every route card
    leads somewhere real — all ten bodies validate structural 30/30 and reachable 30/30
  - sector checkpoint every two chapters: banks the haul, restores shuttles, advances the sector
  - the run now spans bodies: clear a chapter, choose the next leg, keep your shuttles and your haul
- [x] **M10 — hangar and components** (this commit)
  - five four-level tracks — gear, engine, RCS, hull, sensors — each changing a value the
    simulation reads, with salvage and planetary-material costs
  - the lander drawn at scale in the hangar, with the selected component highlighted **on the ship**:
    struts thicken, tanks multiply, nozzles appear, plating layers, the sensor mast grows a dish
  - hull damage implemented, so the Hull track has a consumer and a hard landing costs something
    that persists
  - upgrades are derived per mission from the saved levels onto a per-run ship spec, never mutated
    onto the shared constants — the "cannot stack twice after loading" criterion, with a test
  - a refused purchase names exactly what is missing
- [x] **M11 — skills and loadout** (this commit)
  - Technician and Flight & Survival trees live, four nodes each with ranks, prerequisites, costs
    and effects the simulation reads; Combat defined but gated with the reason
  - four active and four passive modules, each with an existing consumer — weapons deliberately
    wait for M12's targets
  - one active and one passive slot, equipped from the OUTFIT screen
  - components × skills × passive fold into a single derived spec, so nothing stacks twice
  - blueprint guarantee on the first chapter clear
- [ ] M12 — enemies

## Decisions (Tom, 2026-08-16)

1. **Gravity** — compressed mapping is the *baseline*, then a per-body hand-tuned offset so each
   body has a slight but noticeable difference in feel. Both the compressed value and the tuning
   offset live in `PlanetDefinition`; nothing is hardcoded in the loop.
2. **Old content stays** — the new roguelite campaign runs *side by side* with the existing
   12-mission campaign (kept as CLASSIC) and ENDLESS. Two progression systems must both keep
   working; the classic save keys stay readable.
3. **Terrain** — extend the existing midpoint-displacement generator with an archetype shaping
   pass rather than replacing it.

## Blockers / open questions

None.

## Next task

**M12 — enemies.** Sentry Turret and Seeker Drone on a shared telegraph, projectile and damage
system, wired to the hull model M10 added. Every enemy needs an evasive path that does not require
a weapon, and turning on the `enemies` feature flag opens the Combat tree that M11 left gated.

### Known findings

- **Moving landing platforms are deferred.** Europa 5 and Io 5 call for a pad that translates or
  rotates. Pads are static geometry in the heightmap, so this needs `padAt` and the landing check to
  become time-aware — a structural change, not content. DRIFTING PLATE ships as a fragile plate
  instead, which is honest but not the full brief.
- **europa-4 UNDER-ICE SIGNAL** — 17/20 seeds. Geometry sound; the pilot still clips ice on three.
- **Sector checkpoints** — delivered in M9.
- **Crosswind (missions 11-12)** — resolved in M6. The pilot now lands 18/20 and 19/20.

### Done, for reference

**M1 — landing grade rework.** Combined severity score (vy 45 / vx 25 / angle 20 / centre 10)
normalised against the body envelope, thresholds in config, 150-250 ms touchdown aggregation
window, settle-upright resolves upward, post-landing breakdown panel showing exact metrics and
what prevented the next grade. Verify against `test/BASELINE.md` — grades may change by design,
but fuel use and flight paths must not.
