# ROADMAP STATUS

Working document for the roguelite expansion.

- **Spec:** Tom's brief, now in the repo at `docs/Lunar_Landing_Roguelite_Roadmap_for_Claude.md`.
  Read it before starting a milestone — section 6 has the 50-mission table, 12 the enemy roster,
  18 the MVP scope.
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
- [x] **M12 — enemies and light combat** (this commit)
  - `src/enemies.js`: one shared system — deterministic placement, engagement, a telegraph that
    freezes the aim, projectiles that obey the local air, damage into the hull model M10 added,
    and a salvage reward
  - **Sentry Turret** (ground, 1.25 s locked arc, cannot depress inside 130 px) and **Seeker Drone**
    (air, approaches to a standoff, locks, fires — and rams if you let it close)
  - **the sanctuary rule**: every mission keeps its lowest-multiplier pad and the 420 px column above
    it outside every machine's reach, so a weapon is never the price of a landing. Placement and
    validation measure the same points — the first version did not, and a 20-seed sweep found two
    Europa seeds with a drone looking straight down the safe corridor
  - **proved, not asserted**: all 6 armed missions × 20 seeds flown by an autopilot with no weapon,
    no shield and no evasive logic. Nothing was lost to fire, and every seed that lands quiet also
    lands under fire — combat costs hull (down to 12% at worst), never the mission
  - `src/abilities.js`: the active-module runtime M11 was missing. Actives could be equipped and
    never fired — no trigger, no charges, no effect. Now `E` (or the on-screen button) fires one,
    and all five actives do what their blurb says
  - **Pulse Laser** added, auto-tracking and short-ranged, recovered from the first body that had
    hostile systems on it — surviving them is the requirement, not destroying them
  - Combat tree ungated on first contact, every node moving a value the simulation reads
  - enemy placement, telegraph timing, cover, muzzle safety, shields, kills and the module runtime
    under 67 unit tests; both fixtures byte-identical, so the flight model did not move
- [x] **M13 — balance, accessibility and the MVP regression** (this commit)
  - **the Mars balance problem was the pilot.** Every Mars mission landed on 0-10% fuel and mars-2
    crashed 15/20. A fuel sweep at five budgets proved more fuel changed nothing — the control law
    climbed away from the pad while correcting and burned whatever it had. One rule ("in an
    atmosphere, sink gently while off-target instead of climbing") took the 15 missions from
    254/300 landings to 266/300, crashes 46 to 34, and Mars fuel margins from 0-10% to 17-35%,
    with the Moon and Europa unchanged. No mission content was retuned
  - **landing bands deliberately left alone** — the only recorded data is an autopilot, which lands
    74% PERFECT and is not a proxy for a person. Recorded as awaiting human playtest data
  - **accessibility**: motion, flashing, instrument size, contrast and full key rebinding, all
    presentation-only — a test flies the same mission with every one of them changed and asserts a
    byte-identical result
  - **one hazard warning at a time**, ranked by urgency, the rest as quiet chips; and eight audio
    warning voices with right of way, so a charging turret and a low tank never shout together
  - **the logbook**: attempts, landings, losses, fuel efficiency, chapters cleared, best grade per
    mission, threats destroyed *and* flown past, most-flown gear
  - **anti-frustration, per section 13**: a failed expedition always files a debrief worth the
    cheapest skill rank; Tech Core bad-luck protection; three landers lost on the same ground offers
    a named tip and a loaner module for the expedition; no settlement can pay twice
  - **the route screen always offers four bodies** — it did not, and a sweep over every cleared-set
    and sector found it
  - `test/mvp-regression.js`: all 27 missions × 20 seeds, every one with a landable seed;
    performance under four machines firing (1.3 µs/step); a sixty-mission session; determinism
  - `test/autopilot.js` had drifted three milestones behind its own control law; it adapts the
    shared one now instead of reimplementing it
  - `serve.js`: a no-store dev server, so the module-caching gotcha that has cost time in three
    milestones is fixed rather than documented

- [x] **M14 — the map as a risk gradient** (this commit)
  - Tom playtested the MVP and reported two things: he met a turret once, and never found anything
    to pick up. Both were true, and measuring them found a third fault
  - **the optional objectives did not exist** — `optionalObjective` was read by the briefing screen,
    which printed it, and by nothing else. Moon 1 asked for a titanium sample the game did not have.
    All fifteen are implemented now in `src/objectives.js`: eleven conditions judged at touchdown,
    four as physical cargo in the world
  - **every mission was the same length** — `spawnFor` put the lander at exactly 30% of the map from
    the scoring pad, on every mission and every seed; and on moon-4 and mars-4 the *safe* pad was
    1-2 px from the spawn, so the optimal line was "descend and land" and no enemy was ever met
  - the terrain owns the entry point now and places pads in distance bands from it. The prize sits
    at 67-82% of the map (was a flat 30%), the safe zone at 19-30%, and reward follows distance —
    the deep zone pays roughly triple the rare material
  - **the fuel road**: cells are a route from the entry to the deep zone, on the glide line and a
    little under it. Flying the road turns marginal deep runs into comfortable ones — moon-5 13/20
    to 20/20, mars-5 1/20 to 10/20 — and it is the low, slow crossing the guns can see
  - **guards moved to the prize**: median distance from a machine to the zone it guards fell from
    595-1326 px to 378-413. The sanctuary rule is untouched, so the near zone stays safe
  - the validator proves **two routes** now, because the map has two: the near zone on the starting
    tank, and the deep zone by way of the road. 15 authored missions home 8/8 each; all ten
    generated survey chapters home 29-30/30
  - 114 new tests; the physics fixture is still unchanged since M0

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

**Playtest the gradient.** M14 rebuilt the shape of every map from a playtest report, and it wants
the same treatment back: does the deep run feel like a decision, is the fuel road readable in the
air, and do the guards now show up where they matter? After that, M15 is the Titan chapter and the
glide force it needs.

### Superseded

**The MVP was complete at M13.** M0-M13 delivers everything section 18 asks for: Moon, Mars and Europa at 15
missions, improved landing grades, the terrain grammar, the three-shuttle loop, salvage and research,
the hangar, three skill trees, five active and four passive modules, two enemies, and the four-choice
route screen — plus accessibility, a logbook and a regression that covers all 27 missions.

**M14+ is content**, and the spec's own production order (section 16, Phase 7) is: Titan and
Enceladus for atmosphere and plume contrast, then Mercury and Io for heat and timing, then Venus,
then Pluto, then Ganymede as the combined-systems finale. Each body is five authored missions
replacing its generated survey chapter, one rare-material loop, and planet-specific feedback. The
enemy roster's remaining six designs and the moving landing platforms are the two systems still
owed; everything else those chapters need already exists.

### Known findings

- **Mission fuel budgets predate the bigger maps.** They were authored for a 900 px traverse and are
  now flown across 2,000-2,600 px with a fuel road in between. Everything validates, but the numbers
  deserve a deliberate pass rather than continuing to work by accident.
- **Six of the eight enemies are deferred.** M12 ships the two the MVP asks for (section 18). Coil
  Cannon, Patrol Drone, Mortar Platform, Magnetic Mine, Solar Sentry and Shielded Guardian are
  roster entries only. Mission data that referenced two of them was pointed at what exists —
  IRON RAIN now fields a turret and a drone, and the Europa missions field buried nodes that lift
  off the ice instead of magnetic mines. Adding a design later is an `ENEMY_TYPES` entry, a draw
  function, and a line in `PlanetDefinition.eligibleEnemySets`.
- **M11 overstated the modules.** It recorded that every module had "a consumer already in the
  simulation". True of the four passives, false of the four actives: nothing could fire them. M12
  built the runtime and the trigger. Worth remembering as a class of error — a system that is only
  ever read by a *screen* has not been shown to work.
- **Moving landing platforms are deferred.** Europa 5 and Io 5 call for a pad that translates or
  rotates. Pads are static geometry in the heightmap, so this needs `padAt` and the landing check to
  become time-aware — a structural change, not content. DRIFTING PLATE ships as a fragile plate
  instead, which is honest but not the full brief.
- **europa-4 UNDER-ICE SIGNAL** — 17/20 seeds quiet, 14/20 under fire. Geometry sound; the pilot
  still clips ice on three, and the tight corridor keeps a drone in sight longer than anywhere else
  in the game (worst hull in the MVP, 12%).
- **Landing bands are untuned by choice.** Phase 8 asks for bands tuned from playtest data; the only
  recorded data is an autopilot that lands 74% PERFECT, and it is not a proxy for a person. The M1
  bands stand, their boundary tests still pass, and this waits on a human playtest.
- **No controller support.** Every flight control is rebindable from the keyboard, but there is no
  gamepad backend to remap. That is a missing input source, not a missing accessibility option.
- **No achievements.** The spec gates them behind stable progression, and the statistics they would
  be built on only started being recorded in M13.
- **Sustained crosswind is still the pilot's weak ground.** mars-2 VALLES CROSSWIND lands 7/20 and
  classic 11 CROSSWIND 12/20 — both reachable and structurally clean on every seed. The M13 sink
  rule traded some of the pilot's crosswind precision for far bigger fuel margins everywhere; a
  human with the fuel now available has a much easier time than the numbers suggest.
- **Sector checkpoints** — delivered in M9.

### Done, for reference

**M1 — landing grade rework.** Combined severity score (vy 45 / vx 25 / angle 20 / centre 10)
normalised against the body envelope, thresholds in config, 150-250 ms touchdown aggregation
window, settle-upright resolves upward, post-landing breakdown panel showing exact metrics and
what prevented the next grade. Verify against `test/BASELINE.md` — grades may change by design,
but fuel use and flight paths must not.
