# ROADMAP STATUS

Working document for the roguelite expansion.

- **Spec:** Tom's brief, now in the repo at `docs/Lunar_Landing_Roguelite_Roadmap_for_Claude.md`.
  Read it before starting a milestone — section 6 has the 50-mission table, 12 the enemy roster,
  18 the MVP scope.
- **Architecture, dev hooks, environment gotchas:** `docs/ARCHITECTURE.md`
- **How progression actually works, and where it is broken:** `docs/PROGRESSION.md`
- **Measured behaviour at every milestone:** `test/BASELINE.md`
- **Branch:** work on `v2`; `main` is what the world plays. See "Where it is published" below.
- **Run everything:** `./test/run-all.sh 20`

**Rule for every milestone:** ends with a playable build, a passing test pass, a commit, and this
file updated. **Commit before running `macos/build.sh`** — it revokes the agent's Desktop access on
this machine, and the fix needs an app relaunch; see the environment notes in `docs/ARCHITECTURE.md`.

### Where it is published

`v2` landed on `main` on 2026-08-20 and **`main` is now the live game**, served by GitHub Pages from
the repository root on two remotes:

| remote | repo | plays at |
| --- | --- | --- |
| `origin` | `TheAIgnostic/lunar-lander` | https://theaignostic.github.io/lunar-lander/ |
| `rogue` | `TheAIgnostic/lunar-lander-rogue` | https://theaignostic.github.io/lunar-lander-rogue/ |

Both carry the full history and the same content — Tom's decision, 2026-08-20: the roguelite
*replaces* the old lander rather than living beside it. The pre-roguelite game is not lost; it is
`snapshot-2026-08-16`, and `v1.0` / `v1.1` / `snapshot-2026-08-19-mvp` are also intact on both.

**To publish:** work on `v2`, then fast-forward and push.

```bash
git checkout main && git merge --ff-only v2 && git push origin main && git push rogue main && git checkout v2
```

Two things about the live build that do not apply locally: `dist/` is gitignored, so Pages serves
`index.html` + `src/` as real ES modules rather than the single-file bundle; and Pages does **not**
send `no-store` the way `serve.js` does, so a browser may hold old modules after a deploy. If an
update looks like it did not land, hard-reload before believing it.

---

## Current state (measured, not assumed)

> **This table records the state at M0, before the expansion.** For where the game actually is, read
> "Progress" below and the M27-M29a sections of `test/BASELINE.md`: it is one game mode, a fixed
> ten-body ladder, 15 authored missions plus 35 generated ones, and every body has its own palette,
> material and weather.

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

- [x] **M20 — Europa, properly icy** (this commit)
  - Europa measured as the **smoothest chapter in the game** after M19 roughened everything else:
    mean surface slope 0.618 against Luna's 0.717 and Mars' 0.742, and GLASS at 0.308 was the
    smoothest map anywhere. That is the number Tom's "it still has smooth basins" was about
  - **fragile pads are gone**, per Tom's decision. Removed at all seven sites, including `brokePad`,
    which had no producer left. A 15 px/s touchdown on THE FLOES' plate that used to split the ice
    now lands HARD and survives; 17 px/s crashes on the ordinary envelope. What kills you on Europa
    is the envelope every other body is judged by, not a hidden per-pad cap
  - **ice is geometry**: the shell fractures into plates that step against each other, and leaning
    blades stand between them. Both raised into the heightmap, so collision, line of sight, the fuel
    road and the ore clearances come free — M19's rule. A body opts in via
    `PlanetDefinition.terrainStyle`, so an icy world is data
  - measured per knob: **seams are free** (prize 78→79 of 100) and seracs are the entire cost
    (78→69), the same shape M19 found. Both are kept off the landing zones by construction, which is
    why the way home does not move at all
  - **Europa is now level with the other two** rather than the roughest: 40.1% of the surface steeper
    than 30°, against Luna's 38.5% and Mars' 40.0%. An earlier, blunter blade measured 45.5% for the
    same cost in landings — the sharper profile is both more like ice and cheaper
  - **THE CREVASSE is a cave you fly into**, using M19b's per-mission mouth: open sky at the mouth,
    ~70% shut by the time the bridge is under you. Closing it earlier is where the wall is — 0.20/0.52
    takes the way home from 20/20 seeds to 16/20 — and `clearance` changes nothing, because the
    corridor over a pad at the bottom of a canyon is 1,200+ px whatever the clamp asks for
  - across the MVP the way home is **identical**, 521/540 both sides. The prize costs 212→199 of 300,
    and all thirteen are Europa. The flight fixture moved on **exactly the five Europa missions**
  - `europa-3`'s deep route fell 10/20 → 5/20 and **it is not fuel** — mean fuel left went *up*,
    79.9 → 97.0, because the flights end early. The pilot is flying into blades, having no terrain
    lookahead, which is the same instrument weakness M19 recorded
  - two render faults, one older than this milestone: a raised shape closed its fill across the
    surface at a fixed height, which floats on a slope and drew a visible box beside every boulder
    on a hillside (there since M19, invisible until the ground got steep); and a recorded crest could
    be left underground by a later raising pass. Every crest is re-derived once, after all of them
  - 65 new terrain assertions, which is what found the second fault

- [x] **M21 — structures, and guards that belong somewhere** (this commit)
  - **turrets no longer stand on slopes.** The placement filter allowed ground up to 0.5 and was
    written before M19 roughened the world: 30% of ground guns stood on ground steeper than 0.30 and
    one in five was half-buried. Now 0% and none - mean slope under a gun 0.220 → **0.043**
  - the slope test gained a better companion: **the height across the machine's own footprint**. A
    slope test alone passes a gun standing across a 40 px *step*, which is exactly what M19's
    boulders and M20's seams put in the ground
  - **structures**: flat-topped towers and habs cut into the heightmap, following the boulder/serac
    rule so collision and line of sight come free. Terrain produces flat-topped geometry; `placeEnemies`
    chooses among what it finds, so the generator still does not know what a turret is. **73% of
    ground guns stand on a roof now**
  - **39 machines against 21, and less crowding per machine.** The spec's "1-3 at once, rarely 4"
    was being checked as a headcount on the *map*, which is a different claim and the one blocking
    Tom's ask. Machines take stations along the crossing, a machine's engagement disc may overlap at
    most three others, and the validator checks the same rule. Measured over every point of air a
    lander can fly through: **none 62%, one 26.5%, two 10.2%, three 1.2%, four 0.1%, five never**
  - **a budget is what the map fields.** Raising them alone did not work - at 6 a mission fielded 3.4
    - and no single constraint was to blame: removing *any* of them bought 3-5 points, and removing
    the at-once cap entirely still only reached 87%. Fixed by a broad fallback past 60% of the
    placement attempts (RADIATION PASS was placing *nothing* on one seed in five) and by setting
    every budget from a measured capacity sweep. Fill is **99%**, and the test asserts a 95% floor
  - **two missions cannot take more machines at all**, and it is structural: `europa-2` and
    `europa-4` are single-pad caves, so the sanctuary *is* the prize and the corridor is the only way
    in. Unarmed flights lost to fire over 40 seeds: THE CREVASSE 0 at one machine, 2 at two, 6 at
    three; UNDER THE ICE 0 at two, 1 at three, 5 at four. They hold at their pre-M21 numbers
  - **a drone-only chapter cannot absorb machines the way a mixed one can** - a turret is something
    you fly around, a drone follows you and rams. THE FLOES' deep route: 6/20 at two, 3/20 at three,
    1/20 at four
  - the way home is **untouched** (519/540 against 521/540); the prize costs 20 flights of 300, which
    is the price of the ask. Ore is properly contested now: the median deposit sits 247 px from a
    machine against 451 px before
  - the symmetric-overlap bug: counting overlaps only against machines *already placed* passes a
    candidate that pushes three others to four. The new validator rule caught it on its first run

- [x] **M22 — ore you can read** (this commit)
  - a deposit was a rotating diamond under a 150-210 px **shaft of light**, which solved M14's "you
    cannot find the ore" by pointing at it rather than by making it visible. It is a **crate** now:
    chamfered, strapped, ore glowing through a slot, a hover cushion under it and a shadow on the
    ground below. A deep-band crate carries two slots and is a size larger, so "worth about double"
    reads without a legend
  - the dust beacon - the marker drawn above Mars' storms so a target survives 22% visibility - is
    the crate's own silhouette now, so what shows through the weather is the thing you are looking for
  - **they hang low over the ground.** Crossing crates were positioned against the glide line, which
    put them a mean of 243 px up and as much as 718. Against the ground instead: mean **170 px**,
    max 240
  - lower is not free and the trade is monotonic - a collector sweep lands 85/300 at a mean of 215 px,
    82 at 170, 79 at 133, 75 at 106. The shipped band halves the hang height **and collects exactly
    as much as the glide-line rule did**
  - the flight fixture did not move at all, which is the right answer: the pilot only detours for ore
    when told to, so where the ore hangs cannot move a flight that was never going there

- [x] **M23 — the cleanup** (this commit)
  - executed in the plan's own order, and the plan's own warning held: **the state was the expensive
    part**. `screenHTML` closed over 26 module-scope bindings; `state.js` (96 lines) moved them
    once, and the screens and the dispatch simply followed their bindings out
  - `main.js` 1,866 → **942** (the loop, the outcomes, the wiring); `render.js` 1,892 → **992**
    (the world). New: `state.js`, `screens.js` (656), `actions.js` (244), `drawkit.js` (80),
    `enemydraw.js` (327), `hud.js` (524). 33 modules, 26 importing three things or fewer
  - `meta` is reassigned when a run banks, and an ES import cannot assign to what it imports:
    writers go through `setMeta`, readers get the live binding — verified live across modules in
    the playtest
  - `act()` needs eight loop verbs, and importing them back from main would be a cycle: main
    injects them once at startup (`wireFlow`), so the dispatch stays a leaf
  - `drawkit.js` exists because the bundle is one scope — a colour token can only be declared once.
    `enemydraw.js` is the seam that pays next: six enemy designs are still owed, each now a draw
    function in a 327-line file rather than a 1,900-line one
  - **the bundler derives its module order** from the import graph (topological sort, loud failure
    on a cycle); the hand-kept list had caught real faults but was itself the M17 trip hazard. Run
    first, out of plan order, so the five new modules never needed hand-listing
  - the surgery broke three braces and invented three imports from prose, and **the bundle build
    caught none of it** — one shared scope hides missing imports by construction. Real ES module
    loading caught every one. Recorded in the baseline as a rule for the next refactor
  - proved as prescribed: **both fixtures byte-identical**, full suite green, and a scripted
    playtest through every new boundary — classic campaign to VICTORY, two expedition chapters
    banked, hangar/skills/equip, settings to the DOM, pause and rebind, combat drawn — zero
    console errors

- [x] **M24 — a harder game, and one game** (this commit)
  - Tom's own list, eleven items, given in place of the four candidates that were queued
  - **two hits end you**: turret and drone shots both 50 damage on a 100 hull, ram 50, and three
    hits with a hull upgrade — the second number is what keeps the Hull track worth buying, and it
    is asserted
  - the turret's lock is **0.25 s** (was 1.25) and shots fly at **600/765 px/s** (was 200/255)
  - **this broke the M12 guarantee, and the break was measured before it was decided**: unarmed
    crossings of the safe route went 240/240 to **167/240**, and the deep route ~117/240 to 17/240.
    The *sanctuary* never moved — 20/20 everywhere, placement untouched, only lethality changed.
    What broke is the crossing, which the rule never covered
  - **Tom chose to accept it.** The promise is narrower and now stated exactly: *the sanctuary pad is
    unreachable, the crossing to it is not*. The validator was rewritten around that — geometry stays
    a hard gate, surviving the crossing became a printed campaign-wide measurement rather than being
    deleted. Read the 70% knowing the instrument has **no evasive logic at all**: it is the floor
  - **visibility is `v³`, not `1-(1-v)×3`.** The linear form saturates everything under 0.67 and
    flattened four of five Mars missions to one number — BURIED ARRAY and STORM EYE are authored two
    stops apart and measured identical. Exponentiating keeps the ordering and is the physically right
    answer: three times the dust in the air *is* v³. Airless bodies stay at exactly 1.0
  - **one game mode.** Classic and endless are gone from the menu; `levels.js` stays as the M0
    physics baseline that both fixtures regress against, reachable by no player
  - **no route choice**, mission select earned by finishing all five sectors, and losing the last
    shuttle takes skills, resources and the opened map while keeping the hangar, blueprints and
    equipped modules — which is what makes a permanent upgrade cost the next sector's loadout
  - **the hangar is readable always and takes salvage only at a checkpoint**, the same moment the
    loadout opens. NEW GAME in settings, arming on the first press
  - **`src/gamelog.js`**: an ordered playtest trace of one sitting — copy to clipboard, export .txt
    or .json, plus `__log()` / `__logJSON()`. Never read back by the game, so it cannot move a flight
  - **both fixtures byte-identical**, full suite green. Note that no automated test in this project
    can measure the visibility change at all — the autopilot flies on state, not on what is drawn
  - three faults found: the validator reported combat failures as *structural* ones; a phantom
    `obscure()` import in `main.js` that the bundle built clean through and the browser caught (the
    M23 lesson, holding); and three enemy assertions that encoded the old constants rather than the
    property behind them

- [x] **M25 — the ladder, and the money you never got to spend** (this commit)
  - Tom played two bodies of M24 and reported his salvage and research never became spendable. Real
    bug, three causes stacked: rewards land in `run.haul`, purchases spend from `meta.banked`, and
    only a **checkpoint** moves one to the other — and checkpoints fired every *second* body. M24
    then closed the hangar outside that same window, turning a delay into a wall
  - **every body is a supply stop now.** Verified live: clearing the Moon banks the lot, the haul
    resets, and a purchase goes through (1300 → 980 salvage, gear 1 → 2). Shut the window and the
    same purchase is refused
  - **the progression is a linear ladder** — Moon, Mars, Europa — with no forecast to choose
    between. What remains is the choice worth having: at every window, replay a cleared body to farm
    for the hangar, or take the next one. Going back is known and pays less
  - **on death you start at the Moon**, with whatever the hangar has bolted on
  - route cards are centred and flex-wrapped, so one sits in the middle and three sit evenly. Three
    at a 300 px basis wrapped Europa below the fold at 800 px; 200 px with a 320 px cap fits them
  - **the expedition ends where it is won**: clearing Europa used to drop you onto three "replay to
    farm" cards and only fire the win once you clicked one. Decided in `main.js` now, on the frame
    the last body is cleared
  - both fixtures byte-identical — nothing here touches the simulation
  - **left as a question:** `TIERS` / `eligibleBodies` / `routeOffers` / `SECTORS` are M9's
    discovery-tier machinery and are now called by nothing outside `route.js`. Marked unwired rather
    than deleted, because whether the remaining seven bodies join `PLANET_ORDER` or return as a
    tiered choice is Tom's design call. Dead code with passing tests until it is made

- [x] **M25b — pay before you open the shop** (this commit)
  - Tom cleared the Moon, opened the hangar, saw **0 salvage**; his log header read 300. Both true:
    M25 made every body a supply stop but left the banking in the *route handler*, which runs when
    the player **leaves** the stop. The money arrived immediately after the only window it could be
    spent in. Banking happens on the way **in** now
  - proved at runtime: at the moment the checkpoint opens, banked 994 salvage / 197 data, haul
    emptied, and the hangar buys gear 1 → 2 (994 → 674)
  - **loadout and hangar after every body**, per Tom, and **game over returns to the start screen**
  - the run-lost screen was reading out two numbers `wipeForDeath` had just zeroed, under the words
    "what you transmitted is still yours". It says what was lost and what the hangar kept now
  - the playtest log was silently dropping `machines=`: `summary()` has no `alive` key, it is
    `total`, and the flat-value filter discarded the undefined
  - the bundler's duplicate-declaration guard caught `bankHaul` colliding with `economy.js` on the
    first build — its fifth catch. Renamed `settleAndBank`
  - **a dead overlay is no longer possible**: the toast's 3.2 s timer re-renders whatever state is
    current and several screens read `g.level`, which the settle timers guard with `g.token` and the
    toast timer never did. A screen that cannot render falls back to the menu and is *logged*
  - **from Tom's log, recorded not acted on:** four landers lost to fire on moon-3/-4/-5 across two
    runs, each to two hits ~30 s apart, and a cleared Moon pays 300 against a cheapest hangar level
    of 320. M24's lethality and the stale M15-era budgets meeting on the introductory body

- [x] **M26 — the Moon stopped feeling random** (this commit)
  - Tom was right and it was not a bug: authored missions hardcode one archetype each, so moon-1 has
    been a crater in every run ever played. Invisible until **M25 made the campaign a fixed ladder** -
    you now replay the same fifteen maps forever, where before you routed between ten bodies
  - `chapterFor` rebuilds an authored chapter per run and deals fresh shapes to unpinned missions.
    Pinned = named for its shape (THE CRATER, THE TRENCH, THE CANYON, THE CREVASSE) or a **cave**
  - **1 → 24 distinct chapter layouts** per body. `MOON_LEVELS` and friends untouched, so both
    fixtures and every sweep still measure what they always did
  - dealing from the *whole* palette read worse than dealing from palette-minus-pinned (Europa came
    out with three canyons in five); the pool is palette ∪ what the content already wears, because
    Europa's authored ridge and caldera are not in its palette
  - **`mulberry32`'s first output correlates across nearby seeds** - a two-item pool rides on that
    value alone and Europa dealt an identical chapter on every seed until four draws were discarded

- [x] **M27 — the ten-body ladder** (this commit)
  - `PLANET_ORDER` is all ten, difficulty-sorted: Moon, Europa, Titan, Mars, Enceladus, Ganymede,
    Io, Mercury, Pluto, Venus. The inverted ramp is fixed for free - Europa teaches ice at position
    2 instead of being a finale with the weakest gravity in the game, and Venus is a real wall
  - **the hangar is unblocked, and by geometry rather than by repointing**: all five tracks reach L4
    where four were capped and Sensors could not be bought at all. Same costs, same materials, same
    "go there to build this" gate - the bodies are simply on the route again
  - `routeChoices` returns **only the next body**, which is what enforces no-replay: `route:N`
    indexes that array, so no index reaches a cleared body. The ladder behind the player is a
    non-interactive **trail** of ten rungs - ten route cards would have been nine unclickable
    buttons, which is a menu that lies
  - **shuttles attrit**: `+1` per body cleared, capped at 3. The `+1` already existed and one line
    later `g.lives = maxShuttles` overwrote it, so every stop was a full restore and the `+1` was
    dead code. Proved live: two lost on purpose, one returned, 2/3 at the stop
  - **the forecast saturated exactly the way M24's visibility did.** Sector ran to 3 under M25 and
    runs to 10 now, and both card figures were sector-bumped: six of ten cards printed an identical
    forecast. Difficulty drops the sector term (on a fixed ladder the sector *is* the position, and
    the position is already difficulty-sorted - adding both counts one axis twice) and resistance is
    read off the chapter the player will fly
  - reading resistance honestly immediately exposed what "heavy" was hiding: `lun 4 · eur 3 · tit 3 ·
    mar 5 · enc 0 · gan 3 · io 3 · mer 3 · plu 3 · ven 3`. Every survey body caps at 3, the authored
    Moon fields 4 and Mars 5, and **Enceladus has no eligible enemy sets at all**. Printed, not
    asserted - M28 balance and M29 content, not a formula bug
  - **the generator was producing missions its own validator rejects.** At depth 2 - sector 5 and
    beyond - mission 5 asked for a 50 px prize pad against a 56 px stance, so the last five bodies of
    the ladder each generated one impossible mission. Never seen because the sweep only flew sectors
    1 and 3, six seeds. Floored at `VALIDATION.minPadWidth + 8`, read from the validator so the two
    cannot drift
  - **the survey block gated on flight, against the file's own doctrine** - structural fails, flight
    warns. Venus failed the sweep on 2 seeds of 20 with geometry 100/100 and every failure a crash
    short of the pad. It warns now. Every body is structural 100/100 at both sectors
  - **the supply stop was printing zeroes at a player holding 2,329 salvage** - the M25b fault a
    third time. Banking moved to the way *in*, but the table still read the haul it had just emptied
  - **`__settleNow` did not run the settle**, it reimplemented it against `LEVELS.length` - the
    twelve classic missions - so a scripted expedition landed five missions and reported
    `cleared=[]`. One settle now, held by `settleAfter`, and the hook runs it early
  - `TIERS` / `eligibleBodies` / `routeOffers` / `MIN_OFFERS` / `SECTORS` **deleted**. M25 left them
    with a "delete it or wire it" note because it was still open whether the survey bodies would
    rejoin as a tiered choice; M27 answers that - they join `PLANET_ORDER`
  - **both fixtures byte-identical**, full suite green, and the whole ladder walked in the browser:
    Moon cleared, purchase at the stop, Europa taken at sector 2, a run lost and restarted at the
    Moon with the hangar intact, and Venus clearing to `expedition-complete`


- [x] **M28 — the material re-cut and the economy** (this commit)
  - the brief said *do the floor check first, before tuning anything*, and doing it in that order was
    the milestone: **two of its four items were based on figures that were no longer true**, and the
    floor check found the thing none of them had named
  - **M13's anti-frustration floor had not paid out since M24.** `settleHaul` computes 60/40 for a
    failed run, `bankRun` puts it in `meta.banked`, and `wipeForDeath` zeroed that pot on the very
    next line. M27 made it critical by removing replay - it is the only income a run that dies early
    leaves behind. `wipeForDeath(meta, { debrief })` wipes *then* credits. Proved by throwing all
    three landers away on moon-1: 0/0 before, **60 salvage / 40 research** after, worth one skill rank
  - **the payout was already fine.** Measured across three profiles: sloppy 300-361, normal 435-496,
    clean 563-711, against a cheapest rung of **260**. `docs/PROGRESSION.md` compared against Landing
    Gear at 320 rather than the cheapest thing on the board. Nothing was inflated
  - **Hull L2 already buys the third shot** - 112 survives two hits and dies on the third. The doc
    said it "still dies in two" because `enemies-tests.js` asserted against `Math.ceil(150/damage)`,
    and **150 is no hull any level produces** (100/112/125/140). The M24 fault again: a test encoding
    a figure instead of a property. Rewritten around the property; no game change needed
  - **the real blocker was material scale, and no item had named it.** Materials wipe on death and
    each body is visited once per run, so a rung is only buyable if one visit funds its whole cost.
    One visit yields ~50 normal / ~90 clean (the ~470 sweep-everything ceiling is reached 33 times in
    300). **Every L4 wanted 120-160 of one material** - all five unbuyable in one run, and the whole
    Landing Gear track wanted 290 Ilmenite out of a single Moon visit
  - **the re-cut**: ordering into the windows (Hull L2 Mars -> Titan, Sensors L2 body 5 -> body 2, so
    all five tracks are buyable by body 3 instead of body 5) and scale (every cost now 25-50). Salvage
    prices untouched. A run that dies at body 3 now leaves 5 upgrades rather than 4; a full ladder
    leaves 10 of 15 rather than 8
  - **a recommended tier per body**, printed at the supply stop where the hangar is open and the
    choice is still live. Measured, not aspirational - just under what one normal run can fund by
    that point, because a recommendation the economy cannot pay for teaches the player to ignore it
  - **deliberately not done: pad width and machine damage were not retuned** against that lander.
    That is a difficulty change, and *is it hard or is it unfair?* has been unanswered since M24.
    Tuning difficulty against an economy that has just moved, with no human data on either, is the
    exact failure mode recorded twice in this file
  - also fixed: the run-lost screen still said *"A body you have already cleared can be re-flown to
    pay for the hangar"* - M25 copy that M27 made false
  - **both fixtures byte-identical**, full suite green


- [x] **M28b — an external review, checked line by line** (this commit)
  - Tom brought a review from another model with "do not take the findings for granted". Every claim
    was verified against the code first; **four of them did not survive that check**, and those are
    recorded alongside the real ones
  - **every run after a resume flew identical terrain.** `resumeExpedition` set `g.forcedSeed`, which
    is the *debug* pin and which nothing clears, so `beginExpedition` reused it forever after. The
    line was also redundant - `startLevel` already prefers `g.run.seed` during a run. This is the M26
    complaint surviving underneath M26's fix, and M27 made it bite harder
  - **Mars flew at double drag** from M6 to now: `forcesFor` built `atmosphere` from the level's
    wind/drag *and* again from the `'atmosphere'` hazard string. **Four** of five missions, not all
    five - mars-2 declares `windChannels`. Removing it takes the autopilot from 17-19/20 to 20/20 on
    those four, so the bug had been making the hardest body harder; **Tom's call, taken with the
    number in front of him.** `forcesFor` dedupes by id now, so authored data cannot change physics
    by repeating itself
  - **the flight fixture moved and the shape of the move is the proof**: 12 differences, exactly the
    four affected missions x 3 seeds, every other mission byte-identical. Physics fixture unchanged
  - **abandoning was strictly better than dying, and the floor was farmable.** Abandon banked the
    haul, paid the debrief and never wiped; five start-then-abandon cycles banked 300 salvage and 200
    research for no risk. **Tom's ruling: ending a run is ending a run.** It wipes like a death now,
    arms on the first press, and the run-lost screen speaks for both endings
  - smaller, all verified and fixed: `settleHaul` rounded kept and lost independently (**live**, not
    latent - `cargoRecovery` is a real skill rank and the comment saying otherwise was stale);
    `firstClear: true` hardcoded, which made mission select a research farm; duplicated `saveMeta` /
    `clearRun` / `setBindings`; a victory screen still offering ENDLESS; stale `power`/`utility` keys
  - **the review caught an M28 error of mine**: `RECOMMENDED_TIER`'s comment quoted the *affordable*
    curve as though it were the table
  - where it was wrong: "all five Mars missions" (four); "Enceladus builds `plumes({})`" - it is
    spelled `'plume'` against a `'plumes'` builder, so it is never built at all, which **M29 needs to
    know**; and its income figures are roughly double the measured ones
  - Tech Cores having no sink is real and **left alone** - pricing something in cores is a design call


- [x] **M29a — Tom's playtest, acted on** (this commit)
  - the first human run since M24 and the first ever on the ten-body ladder: four bodies, 23
    attempts, 20 landings, 2 crashes, ~29 minutes. Both crashes on the **Moon**, body 1, flown stock
    and unarmed - bodies 2-4 cost nothing at all
  - **the payout was 3-4x what M28 modelled** (850/1496/1353/580 banked, average 1,070 against a
    modelled 300-711) because the model counted neither the kill bonus nor ore carried home. Tom's
    call: 70% less salvage, and L3/L4 should cost at least five good body clears. Both shipped -
    `SALVAGE_SCALE = 0.3` applied **once**, where every source has been summed, and L3/L4 repriced to
    ~5 and ~8-9 clears. Materials untouched, per his note. The M28 income floor still holds
  - **six of ten bodies wore another body's name.** `world` picks a palette and the palette carries
    the name: Mercury/Io/Venus announced themselves as MARS, Enceladus/Ganymede/Pluto as EUROPA -
    exactly what he reported. All six have their own world and accent; Enceladus, Ganymede and Pluto
    also stop generating rock, which is the "enceladus looks like the moon" half
  - **radiation had no shape.** x3 damage, gated to an altitude belt (nothing below 420 px, full
    above 580), and **drawn** - a glow and a moving dashed edge following the terrain, anchored on
    the boundary because the boundary is the only part the player needs
  - **Titan's sandstorm did not exist.** Its hazards were `['wind','glide']` and Venus's
    `['drag','acid','downdraft']`, and not one of those five has a builder. Both storm now, and dust
    gained **squalls**: 3-5 s near-zero phases, deterministic from a hashed time slot because a force
    may not call `Math.random()`, salted per mission. First tuning was wrong and the measurement
    caught it - a 0.3 front floor is already at the v³ clamp, so the front *was* the blackout
  - the hangar shows salvage only; the loadout explains where blueprints come from; clearing all ten
    bodies awards a **diamond**, kept on death, with a completion screen worth the rarest event in
    the game
  - **both fixtures byte-identical** - all of it is economy or presentation
  - **left for Tom:** Mars is now the *easiest* body two milestones after being the hardest; the Moon
    is where runs die because it is flown unarmed; Pluto's "darkness" renders as coloured fog because
    it is implemented as low visibility; and cores still do nothing

- [x] **M29 — the survey bodies become content** (this commit)
  - the brief was writing: 35 missions sharing five names and five briefs, 35 with
    `optionalObjective: null`, no set pieces, and a list of hollow hazards. The hazard audit ran
    first and found **more than the brief listed**
  - **four bodies had no working hazard at all.** `forcesFor` looks a hazard's name up in `BUILDERS`
    and a miss is silent, so `'heat'` (Mercury, Io) against a builder named `thermal`, `'cold'`
    (Pluto) against `cryo`, and `'plume'` (Enceladus) against `plumes` all resolved to nothing -
    Mercury, Io, Enceladus and Ganymede flew with no weather at all, at positions 5 to 8 of a ladder
    every run walks. M28b caught the `plume` spelling from a review; **`heat` and `cold` had never
    been noticed, and both this file and `docs/ARCHITECTURE.md` listed them as working**
  - the fix is aliases; the durable part is that `forces-tests.js` now asserts **every hazard string
    any planet or mission declares resolves to a builder**, with `ice` as the one stated exception
  - **seven new force builders**: `glide` (Titan's lift from horizontal speed), `acid` and
    `downdraft` (Venus), `eruption` (Io, telegraphed), `magnetic` and `falseRadar` (Ganymede),
    `darkness` (Pluto). Heat and cold gained consequences too - heat derates the engine, cold
    stiffens the thrusters, corrosion eats hull at the deck. Four channels, four different costs
  - **the first tuning walked straight into M18's radiation fault**: Mercury went clean to derated in
    **3.2 seconds**. Retuned against mission length and asserted with a 10 s floor, so mission 1 of a
    body barely bites and mission 5 bites mid-crossing
  - **the sanctuary rule now covers weather.** A vent over the safe pad took Enceladus 2 to 11/20
    home while the prize route held at 19/20 on every force setting tried - force barely moved it,
    which is what said the problem was *where* it was. Placed hazards call the same `sanctuaryPad`
    the machines do. 11/20 -> **20/20**
  - **Enceladus: the count did not matter, the type did.** At 7.3 px/s^2 a lander cannot decelerate,
    so drones at 2 machines gave 2-5/20 and turrets at 4 gave 17-20/20. It is a turret body that
    meets its first drone on mission 4, and it has resistance at last - the ladder's machine ramp
    goes `enc 0 -> 4` and the back half `3 -> 4/5`
  - **50 authored missions**, 50 distinct names, 50 distinct briefs, zero null objectives, seven new
    set pieces, and 26 objectives all of which content uses
  - the M26 shuffle test caught the seven new chapters dealing **4 layouts over 40 seeds** - three-shape
    palettes with one pinned. Widened to six, `pinShape` re-cut to "pin only where the name would
    lie"; they now deal 32-36, more than the three bodies authored before them
  - **Tom's four design calls, all taken:** Mars drag 0.15 -> **0.24** (measured over five values);
    the weapon **fitted** to an empty slot on recovery, so moon-3 is the first mission flown armed;
    Tech Cores buy the **L3 and L4** rungs; and **darkness is its own channel**, not low visibility
  - raising Mars' drag found a second-path bug: `windChannels` reads `level.drag`, so `mars-2` - the
    one Mars mission the double-apply never touched - fell 15/20 to 8/20. It pins its own drag now
  - **the physics fixture did not move**; the flight fixture moved by exactly mars-1/-3/-4/-5 x 3
    seeds, which is the containment proof, plus 35 new missions

- [x] **M29b — `generateChapter` deleted** (this commit)
  - Tom's call on the question M29 flagged rather than took. All ten bodies are authored, so the
    survey-chapter fallback was reachable by nothing a player flies
  - **what it was really providing was an invariant, not a code path** - *every body on the ladder
    has something to fly* - so that moved rather than vanishing: `chapterFor` throws naming the body,
    and `route-tests.js` and `validate-missions.js` both assert every `PLANET_ORDER` id has an
    authored chapter of five missions
  - the generator also read `VALIDATION.minPadWidth`, so a generated pad could never be narrower than
    the lander's stance (the M27 fault at depth 2). Authored pads are hand-typed, so that is a
    `route-tests.js` assertion now. **When a shared constant loses its sharer, move the check**
  - `chapterFor` and `peakMachines` lost their `sector` argument, which is right independently: on a
    fixed ladder a body is always flown at the same rung
  - 168 lines out of `src/`, both fixtures byte-identical, all ten bodies flown in the browser

- [x] **M29c — the steering split** (this commit)
  - Tom cannot hold an attitude in classic steering and his son Ian can. That is not something a
    difficulty number fixes - it is the control scheme, and one law was serving two very different
    pairs of hands
  - **CLASSIC is rate control now**: release both burners and the rotation settles in about half a
    second, so the nose stays where you put it. **PRO CLASSIC (IAN)** is the original law. Measured
    from a 0.4 s tap: pro never stops and is past inverted (-160deg) at two seconds; classic stops
    0.57 s after release at -38deg
  - **deliberately not an angle spring.** The attitude you set persists (-20.6deg at 4 s and at 8 s),
    so you still point the nose and choose the angle. Auto-levelling on release would be most of the
    way to DIRECT, which already exists
  - **`pro` is the original to the digit** - `{ spinCap: 1, idleDamp: null }` makes every line reduce
    to its pre-split arithmetic, and `settings-tests.js` reproduces that by hand to 1e-9. Both
    fixtures and `test/pilot.js` now name `pro` explicitly, so every figure in `test/BASELINE.md`
    still measures the model it was measured against - and stays a floor for the default mode
  - **the gyro went inert and a test caught it**: `Math.min` of the ship's damping and the new idle
    damping meant 0.90 beat the Gyro Stabilizer's 0.985, so on the default mode a module you bought
    and equipped did nothing. The `hazardLead` fault. Composed multiplicatively, asserted in both modes
  - **the physics fixture could silently not test**: it read `expected[name] || []`, so a newly added
    case compared against nothing and passed. Found because the new `classic-steering` case reported
    "unchanged" without ever running. NEW, MISSING and length mismatches are reported now - the M18
    `pipefail` fault in another costume

- [x] **M29d — where the skill tree went** (this commit)
  - Tom went looking for it mid-run and the menu button was gone. It lives on the **LOADOUT**
    screen, and the menu hid that button whenever an expedition was in progress - **since M24**,
    which un-hid HANGAR and left LOADOUT hidden. Not a regression from this session; an asymmetry
    that had been live for five milestones
  - the consequence was bigger than a missing button: for the length of a run there was nowhere to
    read the skill tree, and **nowhere to see research data at all**, because M29a had taken it off
    the hangar screen on the grounds that the hangar cannot spend it
  - **the rule has not moved** - skills and modules are still only *changed* at a supply stop, which
    is M16's "an expedition is committed once begun". What moved is where the refusal lives: off the
    button and onto the `skill:` and `equip:` actions, which now toast a reason, exactly as the
    hangar's `buy:` has since M24. God mode still holds the window open
  - the screen says so itself rather than presenting tiles that quietly refuse, which is the other
    half of the same M16 rule
  - `settings-tests.js` asserts the two menu buttons are offered **on the same terms as each other**,
    so the next divergence fails a test rather than waiting for someone to go looking

- [x] **M29e — the Casemate, and the Mast Sniper** (this commit)
  - Tom did not like the turret. Three redesigns drawn at **true game scale**; he took one as the new
    standard and promoted a second into a new machine - the first of the six roster designs M12 deferred
  - **the Sentry Turret is a casemate**: sloped glacis, bolt heads, a heavy barrel in a mantlet, the
    eye in an aperture slit. Drawing all three at radius 16 on a terrain line is what decided it -
    detail is worth nothing at 32 px and outline is worth everything. No change to radius, range or aim
  - **the Mast Sniper**, one number per clause of Tom's brief: `shot.lethal`, `maxPerMission: 1`,
    `turnRate` 0.42 against the turret's 1.15, `telegraph` 1.7 s with the aim frozen, `cooldown` 8 s,
    and `ammo: 3` that never reloads. Lethality is a **flag, not a big number** - `damage: 999` is a
    figure that stops being true the day a Hull L5 exists, which is the M24/M28 fault moved into content
  - **the first version was decorative and the measurement said so**: it could see the lander for
    0.5 s in a whole flight and fired on 8% of them. The M11 fault - a system never shown to work
  - **raising `range` made it worse**, which is the finding: 760 -> 1300 took visibility 0.5 s -> 0.0 s,
    because the sanctuary bubble scales with range and pushes a long reach away from where the player
    goes. **Reach is not vantage.** A `vantage` rule now requires line of sight to a share of the
    deep half of the crossing; at 0.20 it sees the lander 4.3 s and fires on 42% of deep runs while
    costing the way home 1 landing in 180
  - two placement faults it exposed: a type with a demanding rule **burned the whole attempt budget**
    and took campaign fill from 99% to 84-93% (a `givenUp` set retires a type the map cannot seat, and
    the budget fills with turrets); and a **long-range machine crowds out short-ranged ones** through
    the at-once rule, which is why range is 640 and not 760
  - nine missions of fifty, the last two of each of the five hardest bodies. **Deliberately not in any
    `eligibleEnemySets`** - since M29b that field is only a default, so it would have handed one to
    every armed mission including `pluto-4`, the single-pad cave with no route around a machine
  - **both fixtures byte-identical**, sanctuary 20/20 on all 40 armed missions, campaign fill 97%

- [x] **M29f — the space bed** (this commit)
  - a soundbed for the title screen, **synthesized like everything else in `audio.js`** - no audio
    files were added and none are going to be
  - four layers: a detuned drone (55 / 55.19 Hz plus a fifth, beating every ~7 s), filtered noise
    drifting on a 90 s cycle, two quiet high partials swelling against each other, and one sparse
    beacon ping 9-22 s apart. Peak 0.071 against the engines' 0.55
  - **all the movement is LFO nodes, not per-frame JavaScript**, because M16 found `engines` writing
    240 automation events a second forever and a bed that runs while somebody leaves the title screen
    up is where that would hurt most. One `setTimeout` per ping, and it stops rescheduling when the
    bed does
  - **the fault was two owners**: `silence()` was made to stop the bed too, and the frame loop calls
    `silence()` every frame the game is not in play - so the bed was killed on the one screen it
    exists for. The screen owns the ambience; `silence()` owns the flight voices
  - it plays across the front-of-house screens rather than only the menu, because cutting it when
    somebody opens SETTINGS reads as a fault; anything belonging to a mission is silent
  - **both fixtures byte-identical**, full suite green


- [x] **M29g — the sniper you can actually meet** (this commit)
  - Tom: *"did you add the sniper? i did not encounter it"*. It shipped and it worked, and it was
    effectively unreachable: M29e read "harder levels" as "the hardest bodies" and put the first one
    on **Ganymede mission 4, body 6 of 10** - about 28 missions in. His own M29a log cleared four
    bodies, and `docs/PROGRESSION.md` records a typical run dying at body 3 or 4
  - **a machine nobody meets is not a machine.** The M11 fault at the level of content: M29e proved
    the sniper engages and never asked whether anyone would be there to see it
  - it could not simply be moved forward, because the **telegraph is the counterplay** and machines
    are drawn *inside* the world with dust and darkness over the top - the bodies a run actually
    reaches bottom out at 0.05-0.20 visibility. A lethal machine's lock line is drawn **above the
    weather** now, exactly as the pad beacons and ore crates are: blind is difficulty, targetless is
    a lottery. Only the lock, and only while locked - the machine itself stays lost in the storm
  - first sighting is now **Titan mission 5, body 3**, present on 17/20 seeds
  - **a sniper substitutes for a drone rather than adding to the map**, because the at-once rule caps
    overlapping discs - and it displaces the drones the test pilot struggles with most, so a sniper on
    `mars-5` quietly took STORM EYE from 6/20 to 12/20. Mars meets it on `mars-4 IRON RAIN` instead,
    and mars-5 is back to its authored figure
  - **both fixtures byte-identical**, sanctuary 20/20 on all 40 armed missions, and the way home is
    unchanged on all three new placements

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

**Open.** M29 closed the content gap — all ten bodies are authored, every hazard a body declares now
does something, and the four design calls from Tom's playtest are shipped. What is left is either a
system the roadmap still owes, or a question only a person can answer.

**The two systems the spec still owes** (both recorded since M12/M13, neither blocked):

- **Five of the eight enemy designs.** Coil Cannon, Patrol Drone, Mortar Platform, Magnetic Mine and
  Shielded Guardian are roster entries with no implementation (the Mast Sniper was the sixth, built
  in M29e). Adding one is an
  `ENEMY_TYPES` entry, a draw function in `enemydraw.js`, and a line in
  `PlanetDefinition.eligibleEnemySets`. **M29 makes this the most valuable thing left**: Enceladus
  measured that on a low-gravity body the machine *type* decides everything and the count decides
  almost nothing, so more designs is the only real lever left on the combat ramp.
- **Moving landing platforms** (Europa 5, Io 5). Still structural: `padAt` and the landing check
  would have to become time-aware. `io-5 THE FOUNTAIN` ships the timing problem as telegraphed
  fountains around a static pad instead, which is honest but not the brief.

**The one deliberately outstanding tuning item**, unchanged since M28: pad width and machine damage
have not been tuned against the recommended lander, because that is a difficulty change and *is it
hard or is it unfair?* was unanswered. **Tom answered it on 2026-08-21 - "balance seems good" -
which unparks the item without demanding it be acted on.** See "Open with Tom".

**`generateChapter` is deleted** (Tom's call, 2026-08-21). It produced a five-mission survey chapter
for any body without authored content, and it earned its keep: it is what let the ladder go from
three bodies to ten in M27 without ten chapters having to exist first. M29 authored all ten, which
left it reachable by nothing a player flies.

The thing it was *really* providing was an invariant — **every body on the ladder has something to
fly** — and deleting a fallback without replacing that is how a body added later becomes a blank
screen. So the invariant moved rather than vanished:

- `chapterFor` throws, naming the body, instead of falling through
- `route-tests.js` asserts every id in `PLANET_ORDER` has an authored chapter, and that each is five
  missions
- `validate-missions.js` checks the same thing and that `chapterFor` fails loudly for an unknown body
- the generator also read `VALIDATION.minPadWidth` so a generated pad could never be narrower than
  the lander's stance (the fault M27 found at depth 2). Authored pads are hand-written, so that is a
  `route-tests.js` assertion now — cheaper than waiting for a structural failure 20 seeds into the
  sweep

`peakMachines` and `chapterFor` lost their `sector` argument with it, which is the right answer
anyway: on a fixed ladder a body is always flown at the same rung, so a figure that varied with the
sector was describing a situation no player can be in.

**The playtest that was:** M27 built the ladder and M28 made the economy under it work; both
were built and measured by an autopilot that does not dodge and cannot see the screen, and everything
still queued depends on answers only Tom can give.

**The three questions the code cannot answer**, all open since M24 and now more load-bearing:

1. ~~**Is it hard or is it unfair?**~~ **Answered 2026-08-21: "balance seems good."** Recorded
   against 80% unarmed crossings and Mars bottoming out at 0.05 visibility.
2. **Does the ladder ramp?** M27 measured that the machine count barely moves and moves the *wrong*
   way where it does — every survey body caps at 3 while the authored Moon fields 4 and Mars 5, and
   **Enceladus at position 5 has no eligible enemy sets at all**.
3. **Is Venus a wall or a brick?** 86/100 home and 36/100 on the prize route, geometry sound 100/100.

**God mode exists for exactly this** (Settings → GOD MODE): jump to any body with the hangar filled,
and the playtest log stamps its own header so a cheated run cannot be mistaken for a normal one.

The one M28 item left open — tuning pad width and machine damage against the recommended lander —
waits on question 1, and should not be attempted before it is answered.

### Tom's decisions (2026-08-20) — constraints, not options

Implemented in M27; kept here because they constrain everything after it too.

1. **Ten bodies, one fixed order, Moon first and Venus last.** The order never varies between runs.
2. **Every run starts at the Moon.** Never from the furthest body reached — that would remove the
   attrition curve the whole model rests on.
3. **No replay.** A cleared body cannot be re-flown. The supply stop is a supply stop, not a choice.
   This reverses the farming half of M25.
4. **Shuttles attrit** — `+1` per body cleared capped at 3, not a restore to full.

The reasoning is recorded in `docs/PROGRESSION.md` under "Decided". Worth knowing that the
recommendation there was *against* this shape and was wrong: it priced a run at 50 missions, which is
the length of a run that clears all ten bodies — the rarest outcome in a permadeath game. Tom's own
playtest log had the real figure, **~3 minutes per body**, so a run that dies at body 4 is about
twelve minutes. Measure before recommending.

### M27 — the ten-body ladder (done, this commit)

Shipped as planned, plus four things the plan did not anticipate: the route card's forecast
saturated the way M24's visibility formula did, the generator was producing sub-stance pads at
sectors the three-body ladder never reached, the supply stop printed zeroes at a player holding
thousands, and `__settleNow` turned out to be a stale copy of the settle rather than the settle. All
four are in the M27 section of `test/BASELINE.md`.

The trail assumption was taken as written — Tom asked to remove the replay **option**, not the
display — so the cleared bodies are still on screen, as ten non-interactive rungs rather than cards.

### M28 — the material re-cut and the economy (done, this commit)

Shipped, with two of its four items closing as "already true, the record was stale" and one new
blocker found by the floor check it insisted on doing first. See the M28 section of
`test/BASELINE.md` for every figure.

**One item is deliberately outstanding**: pad width and machine damage were not tuned against the
recommended lander, because that is a difficulty change and the M24 question is still open.

### M29 — the survey bodies become content (done, this commit)

Shipped as planned, plus one thing the plan did not anticipate and that changed the shape of the
milestone: **the plan's list of hollow hazards was itself incomplete.** It named five — `acid`,
`downdraft` (Venus), `eruption` (Io), `magnetic`, `falseRadar` (Ganymede) — and noted `plume`
(Enceladus) as a spelling fault from M28b. It also said, in as many words, *"`ice` and `darkness` are
implemented ... do not 'fix' them"*.

Both of those were partly wrong, and only the audit found it:

- **`heat` (Mercury, Io) and `cold` (Pluto) were hollow too**, by the same spelling fault as `plume` —
  builders named `thermal` and `cryo`. Neither this file nor `docs/ARCHITECTURE.md` listed them.
  With `plume` and Ganymede's pair, that is **four bodies with no working hazard at all**.
- **`darkness` was "implemented" in the sense that mattered least.** It was `visibility: 0.45`, and
  the renderer draws visibility as *dust*, so it rendered as coloured fog — which is precisely what
  Tom reported in M29a. Not fixing it would have been following the note off a cliff. `ice` genuinely
  is fine as `surfaceFriction`, and was left alone.

The other four items landed as written: 35 missions authored with distinct names, briefs and
objectives; a set piece per body; per-mission hazard tuning; and Ganymede is no longer the Moon with
a different colour. See the M29 section of `test/BASELINE.md` for every figure.

**One thing it deliberately did not do.** Pad width and machine damage are still not tuned against
the recommended lander, for the reason M28 recorded and M29 did not change: it is a difficulty change
and the M24 question is open.

**And `generateChapter` is gone.** It was flagged as Tom's call rather than taken quietly, and the
call was to delete it. The invariant it carried is now three assertions instead of a fallback — see
"Next task" for what moved where.

### M21 — structures, and guards that belong somewhere

- **turrets sit on flat, short ground or on towers**, never half-buried in a slope. M19 made the
  ground rougher, which made this worse, so it is more visible now than when Tom reported it
- **two to three times as many machines per mission.** Read as more machines *across the map*, so a
  player meets one to three at a time on a route rather than four at once in a fight. The sanctuary
  rule is not up for negotiation without Tom saying so
- **abandoned buildings and towers** where the mission fiction supports them, especially around the
  turrets. Note that M19 and M20 give a free precedent twice over: a boulder and a serac are both
  raised into the heightmap and collide for nothing, and a tower can be built the same way. Put any
  new raising pass *before* the crest re-sync in the terrain constructor, not after it
- **a single-pad mission has no unwatched way in.** M20's audit found `europa-2` and `europa-4` shot
  at on 20/20 seeds on the safe route, because with one pad the sanctuary *is* the prize.
  `sanctuaryClear` passes correctly — it measures the pad and the column above it, not the crossing
  — and every flight survives, but two of fifteen missions cannot keep the promise the other
  thirteen do. This is the milestone that places machines, so it belongs here
- re-run the encounter audit either side

### M23 — the cleanup (done, this commit; plan kept for the record)

Measured 2026-08-20, before the work:

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

*Rewritten 2026-08-21, after the session that ran **M29** — the seven survey bodies authored, every
hollow hazard implemented, and Tom's four playtest design calls taken.*

**The first prompt for a new session:**

> Read `ROADMAP_STATUS.md` and `docs/ARCHITECTURE.md`, then `docs/PROGRESSION.md`, then the M29
> section of `test/BASELINE.md`. Run `./test/run-all.sh 20` before writing anything. Then read "Open
> with Tom" — the four design calls there are answered and shipped, but **nothing M29 added has been
> flown by a human**, and two of its hazards cannot be measured by this project's instrument at all.

That shape matters more than the wording: read the state, then *measure* the state, then build. This
session proved it again in the most direct way available — the milestone opened with a hazard audit
instead of with content, and the audit found that **four bodies had no working weather**, which no
brief and neither document had said.

**Where the game is.** `main` is live on two GitHub Pages sites (see "Where it is published") and was
current as of `059bfcb` before this session. `v2` is ahead by M29. The tree is clean, the suite is
green, the physics fixture is byte-identical, and the flight fixture moved by exactly the four Mars
missions the drag change touches.

### Reading order

1. **this file** — what is done, what is next, and the decisions behind both
2. **`docs/ARCHITECTURE.md`** — what each module owns, which way the imports point, and the
   environment gotchas that have each cost real time at least once
3. **`docs/PROGRESSION.md`** — the hangar, the skills and the loadout as one system. Read it before
   touching economy, difficulty or the route. **Three of its figures were wrong when M28 re-measured
   them**; they are corrected in place and the header says so. Re-measure it anyway
4. **`test/BASELINE.md`** — **M29** for the ten authored bodies and the hazard audit, **M29a** for
   what a human actually found, **M28** for the economy, **M27** for the ladder, **M19/M20** for
   where the wall is on terrain

Then **measure before editing**: `./test/run-all.sh 20`. It ends with the encounter audit, so one
command tells you both that the game still works and what a player currently meets in it.

### What this session did

- **M29 — the survey bodies become content.** Seven chapters authored (35 missions), so all ten
  bodies now have names, briefs, objectives and a set piece each. 50 missions, 50 distinct names, 50
  distinct briefs, zero `optionalObjective: null`.
- **The hazard audit, which is the finding of the milestone.** `'heat'`, `'cold'` and `'plume'` were
  spelled against builders named `thermal`, `cryo` and `plumes`, and six other hazard names had no
  builder at all — **Mercury, Io, Enceladus and Ganymede flew with nothing**, at positions 5 to 8 of
  the ladder. Seven new builders, three aliases, and a test that asserts the property so it cannot
  recur.
- **Weather keeps off the safe pad.** M29 put hazards in *places* for the first time and immediately
  put a vent over a landing zone; the sanctuary rule the machines live under now covers them too.
- **Tom's four design calls**, all measured before being taken: Mars drag `0.24`, the weapon fitted
  on recovery, Tech Cores buying the L3/L4 rungs, and darkness as its own channel.

### The instrument, and five ways it has misled a session

- **The autopilot has no evasive logic, no terrain lookahead, and cannot see the screen.** It is
  still the only automated instrument. The 70% unarmed-crossing figure is a **floor** measured by a
  pilot that does not dodge, and **no automated test here can measure visibility at all** — which is
  why M29a's squalls and radiation belt were measured but never flown before shipping.
- **A document is an instrument too, and it drifts.** M28 opened with three figures from
  `docs/PROGRESSION.md` and all three were wrong when re-measured; two had already sent briefs off in
  the wrong direction. Re-measure a doc before building from it.
- **A debug hook that reimplements a rule will fall behind it.** `__settleNow` decided the
  post-landing state itself against `LEVELS.length` — the twelve *classic* missions — so a scripted
  expedition landed five missions and reported `cleared=[]`. Cost about an hour. Same class as M23's
  drifted autopilot copy. One settle now, held by `settleAfter`.
- **A silent lookup miss is the quietest bug this codebase can produce.** `BUILDERS[spec.type]`
  returning undefined costs nothing, throws nothing and logs nothing — the body simply flies with no
  weather while every screen describes some. It survived from M5 to M29 on three bodies, and the two
  documents whose job is to record exactly this both listed `heat` and `cold` as working. Anywhere a
  **name in authored data** is looked up in a **table in code**, assert that every name resolves.
- **A recommendation made from a guess, with the measurement already in the log.** The ten-body
  ladder was argued against at "50 missions a run" — the length of the *rarest* outcome. Tom's own
  log had ~3 minutes a body. Measure before recommending, not just before editing.

### Five things worth knowing before touching anything

- **The bundle cannot catch a missing import.** Only real module loading proves imports — `node
  build.js` passes through them and the browser does not.
- **The macOS self-test is the bundling canary and has caught five.** Run `./macos/build.sh` before
  calling a milestone done, and **commit first**, since it can revoke Desktop access to the repo.
- **`mulberry32`'s first output correlates across nearby seeds.** Anything reading one or two numbers
  from a fresh `makeRng` wants a warm-up.
- **A test can encode a decision rather than a property.** M24 found two, M28 found three more — one
  of which (`Math.ceil(150 / damage)`, against a hull no level produces) had escaped into the
  documentation and shaped a whole recommendation.
- **A named hazard is not an implemented one — and M29 is why this is now a test.** Until M29,
  `glide`, `acid`, `downdraft`, `eruption`, `magnetic` and `falseRadar` had no builder, and `heat`,
  `cold` and `plume` were spelled against builders named `thermal`, `cryo` and `plumes` so they never
  even reached a no-op. **Four bodies had no working hazard at all.** Every one of them is
  implemented now, and `forces-tests.js` asserts that every hazard string any planet or mission
  declares resolves to a builder, so this class of fault fails a test instead of shipping.

### Open with Tom

**The four design calls from his playtest were answered on 2026-08-21 and are shipped in M29.** For
the record, since every one of them is now a number somebody may want to move again:

1. **Mars** — raise the authored drag. `0.15 → 0.24`, chosen from a five-value sweep: the way home
   goes 95→94 of 100 and the prize route 76→62, so the cost lands where the reward is. Deliberately
   under the 0.30 the double-apply was worth, because Mars is position 4 of 10.
2. **The Moon** — fit the weapon on recovery rather than reopening the loadout. It fills an *empty*
   active slot only, so moon-3 is the first mission flown armed and a deliberate choice is never
   overwritten.
3. **Tech Cores** — price the L3 and L4 hangar rungs in them, 3 and 6. A core drops on a PERFECT
   landing on a small pad and nowhere else, so the deepest permanent upgrades now ask you to land
   well. L2 costs no cores, so M28's income floor is untouched.
4. **Pluto** — a real darkness channel, separate from visibility. Pluto's air is clear now and its
   night ramps 0.62 → 0.86 across the chapter.

**Still open, and still only answerable by a person:**

- **Which steering mode is right for you, and for Ian.** M29c split it: CLASSIC settles the rotation
  when you let go, PRO CLASSIC (IAN) is the law you have both been flying. The numbers say the tuned
  mode should feel like pointing the nose rather than fighting momentum, but a control scheme is the
  single least measurable thing in this project. If CLASSIC still gets away from you the lever is
  `STEERING.classic.idleDamp` (0.90 - lower settles harder) and `spinCap` (0.56 of the original
  183 deg/s cap).
- **Tom playtests continuously** (his words, 2026-08-21), so content does not sit unflown the way
  this file assumed for most of its history. What remains true is narrower and still worth knowing:
  **`falseRadar` and `darkness` are unmeasurable by this project's instrument**, because the
  autopilot flies on state and cannot see the screen. Ganymede's whole identity is one of them, so
  those two only ever get judged in the hand.
- **Is it hard or is it unfair?** Open since M24, and **Tom's first direct answer is "balance seems
  good" (2026-08-21)**, given after M29's content, the steering split and the sniper were all live.
  That is the answer four parked items were waiting on - pad width, machine damage, the landing bands
  and the fuel budgets. Read it for what it is: a judgement on the game as it stands, not a licence
  to start moving those numbers. **Nothing should be retuned without a specific complaint to aim at**,
  which is the same discipline that kept them parked. The campaign-wide unarmed crossing reads 80%
  against M24's 70%, but that is a wider sample over more turret bodies, not the game getting easier.
- **`pluto-4 UNDER THE PLAIN` lands 16/20 on the way home.** In family with the two shipped caves
  (18/20 and 17/20) and unmoved by every knob tried, so it is the single-pad cave geometry against a
  pilot with no terrain lookahead — but it is the weakest new mission and worth watching.
- **`titan-5 THE LONG GLIDE` takes the prize on 0-2/20.** It is authored to be flown *on the air* and
  the test pilot has no glide planning at all, so the number measures the instrument rather than the
  mission. Its way home is 20/20. A human is the only way to know.
- **The landing bands and the fuel budgets** have awaited human data since M13 and M15.
- **Half of M29a's session was menus** — 13.5 minutes at supply stops against 15.5 flying.
- **The clicking noise is not confirmed fixed** (open since M16).
- ~~**God mode is public.**~~ **Decided (Tom, 2026-08-21): it stays as it is.** It ships on both live
  sites as a visible settings button, and that is intended - gating it behind `?god=1` was offered
  twice and declined twice. Stop offering.

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
