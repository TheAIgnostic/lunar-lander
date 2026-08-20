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

- [x] **M15 — reward you can see and have to take** (this commit)
  - Tom's two rules, from playing M14: arm the empty two thirds of the game, and make material
    something you pick up rather than something a screen tells you about afterwards
  - **the encounter audit is a script now** — `node test/encounter-audit.js [seeds]`, in
    `run-all.sh`. Re-run against M14 it reproduced the recorded numbers exactly, which is what made
    it usable as a before-and-after rather than a fresh opinion
  - **enemies on twelve of fifteen missions** (was six): one ramp — mission 1 quiet, then 1, 1-2, 2,
    2-3 — written into `missions.js` and into `generateChapter` so authored and survey chapters
    agree. Deep-route engagement went 40% to 77%, and 97% on the missions that have machines
  - **the sanctuary rule is untouched and re-proved**: all 12 armed missions at 40 seeds, sanctuary
    40/40 and survived-fire 40/40, flown with no weapon and no evasive logic. Arming six more
    missions cost three deep landings in 300 and nothing at all on the way home
  - **material is an object**. `missionReward` counts what was carried home; the landing grade
    multiplies that haul; what stays computed is a stipend, so a flight that collects nothing is
    still paid but is paid a quarter as much. On a deep Mars landing: 25 material collecting
    nothing, 97 with a full hold
  - deposits come in two kinds — floating *below* the fuel road's glide line, and on the seam around
    the deep zone, two thirds of them past it. Never in the near band, never within 150 px of a
    landing zone, never in the sanctuary corridor, never close enough to a fuel cell to be swept up
    with it. All four are enforced in `validate.js` on every seed
  - **ore lies where the guards do**: median 427 px to the nearest machine, 65% within 600 px
  - **Europa has recoveries at last** — it had none: `core-ice` on BLUE FRACTURE and `probe-lost`
    under the shelf on UNDER-ICE SIGNAL. Every mission now has something physical in it
  - the results screen shows what came home *and* what was left out there; the crash screen names
    what the lander was carrying when it was lost
  - **the first version of the ore was unreachable** and measuring it said so: resting on the
    surface, taking a deposit meant landing, lifting off and landing again — 158/300 landings, 0.4
    of 2 taken. Raised 60-130 px it is a low pass on the way in
  - **the test pilot had been refuelling on cargo** since M14 — `flyMission` added a fuel cell's
    worth for anything `collect` returned. That is the only reason the flight fixture moved; the
    physics fixture is still unchanged since M0
  - **the MVP's performance check was measuring the JIT**, not combat: `loaded < bare * 3` compares
    a fully-warm physics loop against the combat loop. Replaced with cost per machine as machines
    are added, which is the O(n^2) canary the comment always claimed — 0.56 µs each at one machine,
    0.48 at four


- [x] **M16 — the glitch sweep, and the rules of a run** (this commit)
  - **wrecks fall.** A dead drone stayed in the sky at the exact point it died, which is what Tom
    saw hanging over Buried Array. Death starts a fall now; the wreck tumbles, lands and stays put
  - **the Seeker Drone is a mine guard**, not a diamond: ducted rotor, squat armoured body, hazard
    stripe, landing skids and a caged sensor head that points where it is looking
  - **a fatal impact ends on the contact frame.** Measured: past the crash cap resolves in 0.000 s,
    while survivable landings keep their 0.35-0.75 s window, which is what stops a one-frame spike
    failing a good approach. Every flight-fixture change was a crash resolving *sooner* — no
    landing became a crash and no crash became a landing
  - **Europa's landings register.** `maxSettle` divided by Europa's 0.07 friction gave a **7.5
    second** pending touchdown, so a landing resolved long after the player had given up on it and
    flown away. The stretch is capped at 1.8x, and climbing away now cancels the touchdown outright
  - **the weapon arrives when you are shot at**, not a chapter later. M15 armed twelve of fifteen
    missions, so the old timing meant meeting drones on Europa 2 with nothing to answer them
  - **the hangar and the loadout are closed during an expedition**, and there is no mid-mission
    restart. Losing a lander replays the ground; losing all three ends the run
  - **switching modes mid-run was leaking state** — pressing CLASSIC CAMPAIGN left `g.run` and
    `g.chapter` set and kept flying the expedition's mission under a "classic" label. Found while
    testing the restart rule. Mode switches are refused now, with ABANDON EXPEDITION as the way out
  - **refusals are audible.** A blocked action says why, in the overlay or in the world — a button
    that silently does nothing reads as a broken button
  - **`audio.engines` wrote 240 automation events a second**, forever, including while silent. It
    only re-schedules on change now. Tom heard a click while holding a key; instrumentation found no
    repeated triggers, so this is the most likely cause rather than a confirmed one
  - **`__goMission('EUROPA', 2)` gave Europa 3** — the hook took a 0-based index while its name and
    the architecture note both say mission number

- [x] **M17 — what things are called** (this commit)
  - **OUTFIT is LOADOUT** on the menu and on the screen itself
  - **all fifteen mission names are plainer**: FIRST SCAR became THE CRATER, RILLE RUN became THE
    TRENCH, BLUE FRACTURE became THE CREVASSE, UNDER-ICE SIGNAL became UNDER THE ICE
  - **every brief rewritten** in spoken English with no dash-connectors, and the same pass run over
    the help screen, the results copy, the crash reasons and the briefing tips. `src/missions.js`
    now contains zero em dashes; what is left elsewhere is the "no value" glyph in a table
  - **the route screen offers two bodies, not four**, each led by its own icon. Ten icons in
    `src/planeticons.js`, drawn from what makes a body different to fly: Europa's cracks, Io's
    calderas, Enceladus venting from the south, Titan's haze standing well off the surface
  - with only two cards a random pair can read the same, so the second is swapped for the most
    *different* body still eligible. Two identical options is a choice in name only
  - **an expedition runs sectors 1 to 5** and finishing the fifth completes it, which is a win
    condition the run never had. `EXPEDITION COMPLETE` banks everything and offers the next one
  - **the loadout opens at a checkpoint**, every two bodies, and closes again the moment the next
    leg is chosen. That is the `g.loadoutWindow` the M16 guard was already checking for
  - the route tests were rewritten around the two-card rule rather than deleted: the guarantee that
    every screen offers a full set of *distinct* bodies at every stage still holds, and now catches
    a duplicate pair where it used to catch three-cards-instead-of-four

- [x] **M18 — hazards you can feel** (this commit)
  - **radiation takes hull** past 55% exposure, and stops at 35% of it. It softens you up; it never
    finishes you. Without that floor, Europa 5 lost more than a whole hull to sweep plus drones and
    the deep route became unsurvivable however well it was flown
  - exposure also builds far more slowly: it went clean to saturated in **three seconds**, which
    left no time to reach a shadow. Counterplay measured over 50 s of sweeps: 72 hull with nothing,
    **97 with Environmental Seals**, 94 with the Ray Shield, 100 with both. Europa's route card
    recommends the Ray Shield now, which it did not
  - **gusts fall off near the ground** (32% at the deck, full above 260 px). Scaling the gust until
    it could be felt made the crossing exciting and the touchdown a lottery; the last hundred pixels
    are where a metre per second decides the grade
  - **`windChannels` ignored `disturbanceResist`**, so THE CANYON, the mission built entirely around
    wind, was the one place the anti-wind gear did nothing. Found in the M15 loadout audit. Fixed,
    and it is what makes the Gyro Stabilizer matter: mars-2 goes 3/12 bare to **7/12** with gyro and
    dampers, which is *better than before this milestone* despite the stronger wind
  - **wind is visible**, as streaks moving through the air in world space at a speed and density
    that follow `windNow`
  - **Mars dust blinds.** It was a tint over a fully legible map; the far field closes in now, with
    a clear bubble that shrinks as the storm thickens. Pad beacons and ore markers still draw above
    it, so you lose the ground and not the target
  - **the hull bar is on every body**, since radiation can take hull anywhere
  - **`run-all.sh` printed "all checks passed" while the validator failed two families** — every
    line pipes through `tail`, so the pipeline reported tail's status. `set -o pipefail` now
  - **the combat proof flew the wrong route**: no `padIndex` targets the deep pad, so it was testing
    "you can take the prize unarmed" rather than the sanctuary guarantee the design actually makes.
    Verified before changing it — the safe route loses **0 of 20** to fire on every armed mission
  - **the physics fixture moved for the first time since M0**, because the boundary layer makes
    gusts altitude-dependent. A deliberate model change, not drift, and recorded as such

- [x] **M19 — terrain with teeth** (three commits)
  - Tom asked for three times bumpier and left the number to me. It is **2.2×**, and three was never
    available: the generator fits the silhouette to the world, and a canyon's legroom was 230 px, so
    every trench was already squashed to half depth and raising `relief` only deepened the
    compression. At relief ×3 the fit was 0.19 and the canyon came out *shallower* than at ×1
  - the lever was the vertical budget, so the world is taller: height 1400 → 1600, groundBase
    300 → 520. Free, and it improves the deep route because there is more air over the fuel road
  - measured per knob: **macro relief is nearly free** (1.8× costs one landing in ninety), while
    surface roughness and narrowing cost five to eight each, because they land on the pad approach
    rather than on the crossing. So relief 1.8, roughness 1.25, bite 0.25, features 15% narrower
  - **boulders are terrain now.** Rocks were 3-9 px with *no collision at all*; they are raised into
    the heightmap as jagged domes, so collision is free and exact and the fuel road sees the real
    surface. 6-12 per mission at 16-74 px. The cheapest bumpiness in the milestone, because they sit
    away from pads by construction: the way home went **up**, 93% → 95%
  - **a cave you fly into**: the roof is lifted clear of the world at the entry and comes down over
    the crossing, so the sky closes above you around a third of the way in. Still one array, so
    every consumer is untouched. Caves get smaller boulders — at full size they cost a lander to
    fire on the *safe* route, which is the one thing the design promises cannot happen
  - the classic twelve are untouched: the roughness multiplier is gated on having an archetype
  - three tests were passing for the wrong reason and this found all of them: the turret
    minimum-range check depended on a second turret being out of range; the muzzle-safety check
    measured a shot one frame after birth; and the way-home gate samples six seeds, which is ±4
    points of noise at these margins

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

Three content milestones remain from Tom's playtest, then a cleanup that is now overdue enough to
be scheduled rather than mentioned. **M20, M21 and M22 are unblocked** — M19 rebuilt the ground they
all stand on. M23 is a refactor with no behaviour change, which makes it the safest thing on this
list to hand to a cold session.

### M20 — Europa, properly icy

- spiky, fractured ice instead of the smooth basins it still has
- **fragile pads removed** (Tom's decision, 2026-08-20): Europa's difficulty comes from the surface
  and the slide, not a hidden speed cap that punishes a landing the player would call clean.
  Touches `europa-2 THE CREVASSE` and `europa-5 THE FLOES`, plus the `fragile` field in
  `terrain.js`, the fracture branch in `ship.finishTouchdown`, and the ICE approach text in
  `render.drawTerrain`
- M19b's cave mouth is per-mission (`caveMouth` / `caveShut`), so a second Europa mission could
  become a cave now without it feeling like a lid. THE CREVASSE is the obvious candidate

### M21 — structures, and guards that belong somewhere

- **turrets sit on flat, short ground or on towers**, never half-buried in a slope. M19 made the
  ground rougher, which made this worse, so it is more visible now than when Tom reported it
- **two to three times as many machines per mission.** Read as more machines *across the map*, so a
  player meets one to three at a time on a route rather than four at once in a fight. The sanctuary
  rule is not up for negotiation without Tom saying so
- **abandoned buildings and towers** where the mission fiction supports them, especially around the
  turrets. Note that M19 gives a free precedent: a boulder is raised into the heightmap and collides
  for nothing, and a tower can be built the same way
- re-run the encounter audit either side

### M22 — ore you can read

- material becomes **floating ore crates near the ground**; the light-ray marker goes
- the M23 import fix already separated placement from pricing, so this is a render change plus a
  placement tweak in `terrain._placeMaterial`

### M23 — the cleanup

Not urgent, and deliberately scheduled rather than done piecemeal. Measured 2026-08-20:

**The architecture is holding.** 9,187 lines over 26 modules, the dependency graph is a clean DAG,
and **24 of 26 modules import three things or fewer**. The data-driven layers keep proving
themselves: a chapter is data, an enemy is an `ENEMY_TYPES` entry plus a draw function, and M18's
radiation damage was ~35 lines across two files. Nothing here needs a framework, a build step,
TypeScript or an ECS, and the project's strength is that there is nothing between the code and the
thing it does.

Two files carry **39% of the codebase**, and that is the whole finding:

| | lines | what is in it |
| --- | ---: | --- |
| `main.js` | 1,866 | loop glue (~770), the UI layer (`screenHTML` is **492 lines over 42 screens**), and `act()` (**220**) |
| `render.js` | 1,686 | accumulation, not a monster: `drawTerrain` 288, `drawHUD` 179, `drawHangarShip` 116 |

**Do it in this order, and know that step one is the expensive part:**

1. **Extract the mutable state first.** `screenHTML` closes over **26 module-scope bindings** — `g`
   (35 references), `btn` (32), `formatScore` (29), `meta` (15), plus `store`, `settings`,
   `saveSource`, `pending`. Moving the screens without moving the state first means threading a
   26-field context object through everything, which is worse than what is there now. A `state.js`
   holding `g` / `meta` / `store` / `settings` is the real first commit.
2. **Then the screens**, into `screens.js` or one module per screen group.
3. **Then `act()`**, which is 220 lines of dispatch and mostly falls out once the state moved.
4. **Then split `render.js`** — enemy drawing and the HUD are the two natural seams, and this should
   happen *before* the remaining six enemy designs land, not after.
5. **Auto-derive the bundler's module order** from the import graph. `build.js` keeps a hand-written
   dependency-ordered `MODULES` list; it caught M8's vanished namespace import and M15's load-order
   crash, so keep the guard, but the ordering is a trip hazard (M17 hit it). About 20 lines.

**The refactor is proved by the fixtures.** A change with no behaviour change must leave both
`test/physics-fixture.js` and `test/flight-fixture.js` untouched, which is a complete verification
that needs none of the conversation that produced this plan.

### Handover

This session ran M15 through M19 plus the import fix. Start a new one by reading, in order:

1. **this file** — what is done, what is next, and the decisions behind both
2. **`docs/ARCHITECTURE.md`** — what each module owns, which way the imports point, and the
   environment gotchas that have each cost real time at least once
3. **`test/BASELINE.md`**, the M18 and M19 sections — the hazard tuning and the terrain sweep, both
   of which record *where the wall is* and not just where the setting landed

Then **measure before editing**: `./test/run-all.sh 20`. It ends with the encounter audit, so one
command tells you both that the game still works and what a player currently meets in it.

**Four things worth knowing before touching anything:**

- **The autopilot is the measuring instrument, and it is the weakest link in every difficulty
  decision.** It has no terrain lookahead and it is a poor crosswind pilot. In M18 the number that
  broke under stronger wind was the test pilot, not the mission, and M19 hit the same wall. When a
  landing rate falls, establish which one moved before tuning anything.
- **The way-home gate samples six seeds**, which is ±4 points of noise at current margins. It read
  79–84 out of 90 across settings that all measure 94–95% at twenty seeds. Do not tune against it;
  measure at twenty and use it only as a gate.
- **Three tests were passing for the wrong reason** and M19 found all three. If a test survives a
  large change untouched, that is worth a second look rather than relief.
- **The macOS self-test is the only thing that catches bundling faults.** Run `./macos/build.sh`
  before calling any milestone done. It has now caught four, most recently a module-level read of an
  imported config object that throws in the single-file build and nowhere else.

**Open with Tom:**

- He asked for wind he can feel and got a modest increase, because more broke the way-home
  guarantee *as the autopilot measures it*. The numbers and the wall are in `test/BASELINE.md`. If
  he still wants more weather, that is a human playtest decision, not a bigger number.
- He asked for terrain three times bumpier and got 2.2×, with the reason recorded: raising `relief`
  was cancelled by the fit clamp, and the real lever was the world's vertical budget.
- The clicking noise he reported is **not confirmed fixed**. Instrumentation found no repeated audio
  triggers while a key was held; the change made was to stop `audio.engines` writing 240 automation
  events a second, which is the likeliest cause rather than a diagnosis.

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

- **`hazardLead` is sold and not delivered.** The Sensors track's level 3 (700 salvage plus two
  materials) advertises "Hazard trajectory prediction", and `hazardLead` is folded into the ship
  spec and read by nothing — there is no hazard forecast in the game to scale. Every hazard warning
  is reactive: it reports the level now. Implementing it means exposing the *next* sweep or front
  from `forces.js` (both are periodic and deterministic, so the forecast is exact) and warning
  `hazardLead x` earlier. `test/loadout-tests.js` carries it as the single entry in `KNOWN_GAPS`
  and fails on any *other* dead effect key. Until it is built, level 3 sells only a beacon bump.

- **Mission fuel budgets predate the bigger maps, and M15 put a number on it.** They were authored
  for a 900 px traverse and are now flown across 2,000-2,600 px with a fuel road *and* an ore field
  in between. Taking the deposits on the road is affordable (236/300 landings, 27-55% fuel left);
  sweeping every deposit lands 156/300, and **0/20** on `mars-2` and `europa-4`. Everything
  validates and the shape is right — the numbers are stale. This is the next milestone's first job.
- **Greed is unaffordable on the two hardest maps.** `mars-2 VALLES CROSSWIND` and `europa-4
  UNDER-ICE SIGNAL` land 0/20 when every deposit is collected. Partly the fuel budgets above, partly
  the test pilot, which has no route planning and burns 18 s per missed leg. A human would do
  better; how much better is unknown, which is the same gap the landing bands are waiting on.
- **The deposits a mission offers vary with its shape.** A two-zone map carries 4-5 deposits and
  74-90 material; a single-zone map like `europa-2` or `europa-4` carries 2-3 and 42-49, because the
  seam and the crossing compete for the same stretch of ground. Every mission has something, and the
  spread is honest rather than intended — worth a look if single-zone missions start feeling thin.
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
