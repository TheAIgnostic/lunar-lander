# Flight baseline — recorded at M0, before any roguelite change

The acceptance criterion "existing controls feel indistinguishable from before" needs numbers, not
impressions. This is the reference. Re-run it after any change that touches physics, input,
terrain or fuel, and diff.

## How to reproduce

Serve the repo, open with `?seed=12345`, then in the console:

```js
const s = document.createElement('script'); s.src = '/test/autopilot.js'; document.head.appendChild(s);
// then
__setSeed(12345); __runAllHeadless(12)
```

Runs in ~450 ms total, works in a hidden tab, and is deterministic: the same seed produces
byte-identical results, a different seed produces different ones (both verified).

## Baseline — seed 12345, autopilot targeting the highest-multiplier pad

| # | Mission | Outcome | Grade | Fuel left | Sim secs |
| ---: | --- | --- | --- | ---: | ---: |
| 1 | FIRST CONTACT | result | PERFECT | 49.1 | 23.4 |
| 2 | MARE SERENITY | result | PERFECT | 36.5 | 23.5 |
| 3 | THE NEEDLE | result | PERFECT | 28.8 | 22.3 |
| 4 | DUST BASIN | result | PERFECT | 54.2 | 22.7 |
| 5 | RILLE RUN | result | PERFECT | 48.0 | 20.6 |
| 6 | OLYMPUS SHELF | result | PERFECT | 44.8 | 18.6 |
| 7 | ICE CORRIDOR | result | PERFECT | 63.4 | 24.3 |
| 8 | CRYO VENTS | result | PERFECT | 53.3 | 24.1 |
| 9 | DEEP SHAFT | result | PERFECT | 54.2 | 20.2 |
| 10 | METHANE GALE | result | GOOD | 70.1 | 22.4 |
| 11 | CROSSWIND | crash | — | 0.0 | 38.1 |
| 12 | TERMINAL VELOCITY | crash | — | 0.0 | 37.7 |

**10/12 landed, 9 PERFECT.** Missions 11 and 12 are a known harness limitation, not a game defect:
the autopilot has no terrain lookahead and hunts under crosswind, so on Titan it burns roughly
twice what a human needs and runs dry chasing the ×5 pad. Both were landed individually in
earlier real-time testing. Treat any *new* failure outside 11/12 as a regression.

At seed 777 the same sweep also lands 10/12, so the result is not a property of one lucky map.

## Physics constants at the time of recording

See `docs/ARCHITECTURE.md`. In short: thrust 130 px/s², RCS 5.0 rad/s², burn 9/3.2/5 per second,
gravity 28–66 px/s², fixed 1/120 s timestep, envelope 11/7/3.5° · 20/13/8° · 34/22/15°.


---

## M1 verification (landing grade rework)

Re-run after replacing the first-contact cutoffs with the combined severity score:

- **Fuel left is identical to the baseline on all 12 missions** (checked to 0.05), and outcomes and
  grades are unchanged. The grader changed; the flight model did not.
- Unit tests: `node test/landing-tests.js` — 28 assertions covering every band boundary exactly on,
  just under and just over, per-axis crash caps, the centre rule, the stable-settle promotion and
  the gear-tier multiplier.
- Anti-spike, measured in the running game by injecting a velocity spike one frame before contact:

| Case | Instantaneous vy at contact | Graded on | Result |
| --- | ---: | ---: | --- |
| clean approach | 9.6 | 9.3 | PERFECT |
| one-frame spike | **220.2** | 8.0 | **PERFECT** — spike rejected |
| two-frame spike | **220.2** | 8.0 | **PERFECT** — spike rejected |
| sustained fast descent | 60.2 | 60.0 | CRASH — genuine speed still kills |
| off-centre at pad edge | 9.6 | 9.3 | completes (centre never fails a landing) |
| 17° tilt | 8.2 | 8.0 | HARD |

The impact figure is the median of the last five pre-contact samples, so one or two anomalous
frames cannot manufacture a crash while a real descent rate still does.


---

## M4 — Moon chapter baseline

Authored missions, validated over 20 seeds each (`node test/validate-missions.js 20`):

| Mission | Archetype | Pads | Fuel | Structural | Reachable | Landed | Fuel left |
| --- | --- | --- | ---: | :---: | :---: | :---: | ---: |
| FIRST SCAR | crater | ×3 shelf, ×2 floor | 124 | 20/20 | 20/20 | 20/20 | 48% |
| RILLE RUN | canyon | ×3 floor | 116 | 20/20 | 20/20 | 20/20 | 44% |
| FAR-SIDE RELAY | ridge | ×3 terrace, ×2 | 112 | 20/20 | 20/20 | 20/20 | 49% |
| SILENT BATTERY | mesa | ×3, ×2 | 108 | 20/20 | 20/20 | 20/20 | 45% |
| TYCHO DESCENT | caldera | ×5 shelf, ×2 | 104 | 20/20 | 20/20 | 20/20 | 41% |

Every mission is landable on every seed with at least two viable approaches (single-path count 0),
and a competent flight ends with 41–49% of the tank — the same margin the classic campaign targets.
The classic 12 remain byte-identical alongside it.


---

## M6 — Mars chapter, and the pilot rebuild

Mars exposed three real faults in the test pilot, all found by validation rather than by eye:

1. It waited to be within **22 px** of the pad centre before descending. Under crosswind that never
   happened, so it hovered until the tank was dry. The threshold now scales with the pad.
2. It carried a large correction angle into contact, arriving at 11–16° of tilt. It now levels out
   below 70 px whatever else is happening.
3. Under drag a coast that starts at 103 px/s ends at 29 px/s, and the re-accelerate threshold sat
   just below that — so it glided into the ground **360 px short**. It now keeps altitude in hand
   while the pad is far away.

Effect on the whole suite (20 seeds per mission, landed counts):

| | before | after |
| --- | --- | --- |
| Classic 11 CROSSWIND | 1/10 | **18/20** |
| Classic 12 TERMINAL VELOCITY | 3/10 | **19/20** |
| Mars chapter | 0–3/20 | 10–20/20 |
| Archetypes, cave variants, Moon | 20/20 | 20/20 |

The long-standing "pilot-limited" caveat on the Titan missions is effectively closed.

## Two fixtures, deliberately

- `test/physics-fixture.js` replays a **fixed input script** against fixed levels and hashes the
  trajectory. No pilot involved, so it moves only when the physics moves.
- `test/flight-fixture.js` records mission *outcomes* flown by the autopilot. It moves when either
  the game or the pilot changes — useful, but not proof on its own.

The M6 pilot work moved the flight fixture and left the physics fixture untouched, which is exactly
the separation the two are for.


---

## M7 — Europa

Three mechanics, and one measurement that mattered.

**Ice actually slides now.** The friction constant was applied per *frame*, so it decayed to nothing
within a fraction of a second regardless of the planet — Europa slid 5 px where the Moon slid 4.
Friction is now retention *per second* with the planet's `surfaceFriction` as the exponent:

| Arrival drift | Moon slide | Europa slide |
| ---: | ---: | ---: |
| 8 px/s | 2 px | 8 px |
| 18 px/s | 5 px | 45 px |
| 30 px/s | 10 px | **90 px** |

90 px is most of a pad. Arriving with drift on Europa now carries you out of the zone, which is the
whole point of the body — and control returns during the slide, so arresting it is the player's job.

**Fragile ice.** A pad can declare a fracture limit; the approach prints it (`ICE · max 2.7 m/s`)
and the pad is drawn as a broken line. Exceed it and the bridge splits instead of holding.

**Radiation.** Sweeps on a cycle, shielded by terrain higher than the lander within 220 px. With no
damage model yet, the consequence is instrument noise: the readouts start lying as exposure climbs.

## The ceiling guard, and a warning that closes

The pilot reacted to ice ceilings at a fixed 120 px, which at climb speed is under a second — it was
flying into ice inside corridors 700–800 px wide. The guard now scales with climb rate. Effect:

| | before | after |
| --- | --- | --- |
| Classic 7 ICE CORRIDOR | 17/20 | **20/20** |
| europa-4 UNDER-ICE SIGNAL | 9/20 | 17/20 |

**ICE CORRIDOR seed 1274 is resolved** — open since M3, and the validator was right all along that
the geometry was sound and the pilot was at fault.


---

## M8 — run loop and save v2

Verified in the running game, not just in unit tests:

| Claim | How it was checked | Result |
| --- | --- | --- |
| An existing player keeps everything | seeded the five legacy `tv_*` keys, reloaded | high score 5,312, unlock 7, per-mission bests, mute and DIRECT steering all carried over; legacy keys left intact |
| A crash costs one shuttle | crashed on purpose mid-mission | 3 → 2 |
| A retry replays the same ground | compared the heightmap across a retry | identical, same seed held |
| An expedition survives being closed | full page reload mid-run | menu offered RESUME, Space resumed the same chapter, mission and seed with 2 shuttles |
| Losing all shuttles ends the expedition | crashed three times | expedition-over screen, run record released, permanent progress untouched |
| A finished chapter banks its haul | flew all five Moon missions | 614 salvage, 72 research banked, `clearedChapters: ["moon"]` |

Unit coverage is `node test/save-tests.js` — 40 assertions over migration, round trips, corrupt
saves, saves from a newer build, saves missing fields, malformed run records, banking arithmetic,
and a storage adapter that throws on every call.

**A corrupt save never blanks the game.** The bad bytes are moved to `tv_save_corrupt`, defaults
load, and the menu says so.


---

## M9 — route and economy

**Every body is playable.** Route cards would be a lie if half of them led nowhere, so bodies
without authored missions get a five-mission survey chapter generated from their PlanetDefinition —
same systems, same validator. All ten bodies, at two sector depths, six seeds per mission:

- **structural 30/30 and reachable 30/30 on every body**, both depths
- landed 30/30 on seven bodies; Titan 22–24/30, Venus 26–28/30, Mars s3 28/30 — the three thickest
  atmospheres, and the pilot's weakest ground

Generating them exposed a fuel bug worth recording: the formula priced gravity and hazards but not
the *atmosphere*, so every Titan survey ran the tank dry at ~40 s with the pad in sight. Fuel now
pays for hovering, fighting the air, and hazards. Titan's planet drag also sat at 0.30 against the
0.14–0.18 the authored Titan missions use; it is 0.20 now.

**The run loop, verified end to end in the game:**

| Step | Result |
| --- | --- |
| Clear a chapter | route screen, four offers, easiest first, some forecasts marked incomplete |
| Pick a body | the same expedition continues there; authored chapter if one exists, generated otherwise |
| Clear a second chapter | sector checkpoint |
| Checkpoint | 1,156 salvage banked, sector → 2, shuttles restored to 3/3, haul reset |

**The risk split works as specified:** half of salvage is transmitted on pickup and half rides as
cargo; research data is never lost; tech cores need the lander down safely. A lost expedition keeps
the transmitted half and the research, and loses the cargo — 34 assertions cover it.


---

## M10 — hangar and permanent components

Five tracks at four levels, each wired to something the simulation already reads — no cosmetic
percentages:

| Track | What it actually changes |
| --- | --- |
| Landing Gear | `LANDING.gearTier` (the whole landing envelope), rebound, slope hold |
| Engine & Tanks | fuel capacity, burn per second, thrust |
| Attitude Thrusters | RCS authority, RCS burn, direct-mode side thrust |
| Hull | integrity, and how much a hard landing takes off it |
| Sensors | prediction length, beacon strength, hazard lead, instrument noise resistance |

**Hull damage is now real.** A HARD or off-pad landing costs integrity scaled by how far past the
safe descent rate it arrived; run it to zero and the lander is lost on touchdown. That gives the
Hull track a consumer and makes a hard landing cost something beyond a smaller payout.

**Upgrades cannot stack twice**, which is the acceptance criterion that matters for a save system.
The loadout is *derived* from the stored levels each time a mission starts and applied to a per-run
ship spec; the shared `SHIP` constants are never mutated. Verified: applying the same loadout twice
leaves `spec.thrust` identical, and `SHIP.thrust` is untouched after a level-4 install.

Verified in the game: two gear installs plus one engine install spent 1,400 salvage and 165
Ilmenite exactly, and the next mission started with gear tier 1.25 and a 143-unit tank against the
mission's base 124.

**A refused purchase says why**: *"Needs 600 more salvage, 105 more Ilmenite alloy stock."*


---

## M11 — skills and loadout

Two trees are live and one is honestly gated.

| Tree | State |
| --- | --- |
| Technician | live — fuel efficiency, hull patching, cargo recovery, salvage yield |
| Flight & Survival | live — reserve fuel, wider landing envelope, hazard resistance, gust damping |
| Combat Systems | **gated**: *"Nothing out here is shooting at you yet. This tree opens with hostile systems."* |

The acceptance criterion is that every node has a testable effect. Rather than ship four combat
nodes whose effects act on enemies that do not exist until M12, the tree is defined, visible, and
refuses purchase with that reason. The same node passes `skillCheck` the moment the feature flag
turns on — tested both ways.

**Modules** are four active and four passive, each with a consumer already in the simulation:
Sensor Pulse (visibility, beacon), Ray Shield (hazard exposure), Magnetic Anchor and Ice Cleats
(post-touchdown grip), Thermal Purge (status), Fuel Recycler (burn), Gyro Stabilizer (gust
rotation), Hardened Radar (instrument noise). Weapons wait for targets.

**Everything folds into one derived spec.** Components × skills × equipped passive → `deriveFull` →
a per-run ship spec. Verified live: fuel-mix rank 2 plus a reserve tank produced burn 9 → 8.1 and a
122-unit mission tank → 134, with ice cleats' grip reaching the ship. Applying the folded spec twice
leaves it identical, and `SHIP` is never mutated.

**The blueprint guarantee** hands over an active module on the first chapter clear, so no route can
demand gear the player was never offered.

---

## M12 — enemies and light combat

Two machines, one shared system, and one promise: a weapon is never the price of a landing.

### The promise, measured

Every armed mission, 20 seeds, flown by the same autopilot with **no weapon, no shield and no
evasive logic at all** — it does not know the enemies exist. `node test/validate-missions.js 20`:

| Mission | placed | sanctuary clear | survived fire | landed | worst hull | hits/flight |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| moon-4 SILENT BATTERY | 2/2 | 20/20 | 20/20 | 20/20 | 40% | 1.5 |
| moon-5 TYCHO DESCENT | 1/1 | 20/20 | 20/20 | 20/20 | 90% | 0.1 |
| mars-4 IRON RAIN | 2/2 | 20/20 | 20/20 | 12/20 | 12% | 3.5 |
| mars-5 STORM EYE | 1/1 | 20/20 | 20/20 | 14/20 | 52% | 2.1 |
| europa-4 UNDER-ICE SIGNAL | 2/2 | 20/20 | 20/20 | 14/20 | 12% | 4.7 |
| europa-5 DRIFTING PLATE | 1/1 | 20/20 | 20/20 | 20/20 | 76% | 1.0 |

**Nothing was ever lost to enemy fire, and the enemies cost zero landings.** The same sweep flies
each seed twice, armed and quiet, and compares: every seed that lands without enemies also lands
with them. mars-4 and mars-5 at 12/20 and 14/20 are the pilot's known crosswind precision, identical
in both columns. What combat actually costs is hull — down to 12% at worst — which is exactly the
intended pressure: you arrive with less margin, not with fewer options.

### What makes that true

- **The sanctuary rule.** Every mission keeps its lowest-multiplier pad, and the whole 420 px column
  above it, outside every machine's engagement range. Placement and validation measure the *same*
  points; the first version cleared two points while the validator swept the column, and two Europa
  seeds put a drone high above the safe pad with a clear sight line. Caught by the sweep at 20 seeds,
  not at 8.
- **The aim freezes when the telegraph starts** — 1.25 s for a turret, 1.0 s for a drone — so lateral
  movement always beats standing still. A ground gun also cannot depress its barrel inside 130 px:
  flying at it is a real answer.
- **Terrain is cover.** Line of sight is sampled against the heightmap and the ice ceiling; losing
  sight during a telegraph aborts the shot rather than delaying it.
- **Fire never spawns on the hull.** If the muzzle point would be within 56 px of the lander, the
  machine holds fire and records it. Verified over a sweep that walks a target through every range
  band of every armed mission: 0 shots born inside the lander.
- **Nothing shoots at a lander that is already down.** Engagement ends at first contact.

### Physics is untouched

Both fixtures are byte-identical across this milestone: `physics fixture: unchanged`,
`flight fixture: unchanged`. Enemies are off by default in `flyMission`, deliberately — the terrain
sweep and the flight fixture measure whether the *ground* can be flown, and mixing gunfire into them
would turn a terrain regression into a combat regression. The combat sweep turns them on explicitly.

### The gap M11 left, closed

M11 recorded that every module had "a consumer already in the simulation". That was true of the four
passives and false of the four actives: they could be equipped, and nothing could fire them. There
was no trigger, no charge, no cooldown and no effect. `src/abilities.js` is that runtime — charges,
duration, cooldown, and an effect the simulation reads — and `E` (or the on-screen module button)
fires it. Sensor Pulse now clears visibility, Ray Shield raises a real 26-point pool that absorbs
fire before hull, Magnetic Anchor multiplies post-touchdown grip, Thermal Purge dumps status and
blinds you for a second, and Pulse Laser burns the nearest thing in line of sight.

The Combat tree opens on first contact (`stats.threatsSeen > 0`) and every node now moves a number
the simulation reads: Capacitor Bank ×1.24 weapon damage and shield pool at rank 3, Threat Analysis
draws the tracking arc a phase early, Shield Harmonics widens the shield from radiation to heat and
cold, Energy on Kill returns the spent charge.

### Balance notes for M13

- Turret damage 10, drone shot 8, drone ram 16, against a 100-point hull. Worst observed loss over
  120 flights was 88% of the hull, on europa-4, where a tight ice corridor keeps a drone in sight.
- europa-4 remains the hardest ground in the game: 14/20 landed under fire, 17/20 quiet.
- The reward is 26 salvage for a turret and 34 for a drone — a nudge, not a living. A cleared
  mission pays roughly 50-325 depending on pad and grade.

---

## M13 — balance, accessibility and the MVP regression

### The pilot was the balance problem, not the fuel

Mars looked badly tuned: every Mars mission landed with **0–10% fuel left** where the Moon and
Europa landed with 41–53%, and mars-2 crashed on 15 of 20 seeds. The obvious reading was that the
Mars fuel budgets were too tight, so the first thing measured was a fuel sweep — every mission at
×1, ×1.15, ×1.3, ×1.45 and ×1.6:

| | ×1 | ×1.15 | ×1.3 | ×1.45 | ×1.6 |
| --- | ---: | ---: | ---: | ---: | ---: |
| moon-1 | 20/20, 48% | 20/20, 55% | 20/20, 60% | 20/20, 64% | 20/20, 68% |
| mars-1 | 20/20, **1%** | 2/20, 5% | 20/20, 5% | 5/20, 7% | 18/20, **9%** |
| mars-4 | 12/20, 1% | 14/20, 2% | 8/20, 4% | 12/20, 5% | 11/20, 7% |

More fuel changed nothing: Mars flights landed on fumes at *every* budget, and the landing rate
wobbled at random. The pilot was **spending whatever it had**. A trace showed why — on final
approach the control law held station 50–60 px downwind of the pad and *climbed* (`vy` target −8)
while it tried to correct, burning 50 units over twelve seconds, and only committed once fuel fell
under 22%. On an airless body that is nearly free. In an atmosphere it is the whole tank.

The fix is one line: while off-target on final in an atmosphere, **sink gently instead of climbing**.
An integral term was tried first and rejected — it converged the offset but arrived with a standing
tilt, trading 16 PERFECT landings for 11 GOOD ones. Measured over 15 missions × 20 seeds:

| | before | after |
| --- | ---: | ---: |
| landed | 254/300 | **266/300** |
| crashes | 46 | **34** |
| Mars landings | 60/100 | **72/100** |
| Mars fuel left | 0–10% | **17–35%** |
| Moon and Europa | unchanged | unchanged |
| classic campaign crashes | 9/240 | **8/240** |

The sink rule is gated on `level.drag || level.wind || level.gust`, because holding station *does*
work where there is no air, and applying it everywhere cost the Moon and Europa 12 perfect landings.

**No mission content was retuned.** The numbers that looked like a content problem were a pilot
problem, and changing the fuel budgets would have hidden it.

### Landing bands: deliberately not retuned

Phase 8 asks for landing bands tuned from recorded playtest data. The recorded data available here
is an autopilot, which lands 74% PERFECT — and an autopilot is not a proxy for a human: it descends
slowly, arrives level, and never panics. Tightening the bands against it would punish players for a
precision the test pilot has and they do not. The bands stay as M1 set them, their boundary tests
still pass, and this is recorded as *awaiting human playtest data* rather than done.

### The MVP regression

`node test/mvp-regression.js 20` — all 27 missions, 20 seeds each, enemies live where the mission
has them, flown with nothing equipped:

- **every mission has a successful automated seed** — the Phase 8 acceptance criterion
- 498/540 flights landed (92%): PERFECT 74%, GOOD 23%, HARD 3%
- weakest ground: mars-2 VALLES CROSSWIND 7/20 and classic 11 CROSSWIND 12/20, both sustained
  crosswind, both long-standing pilot limits rather than mission defects
- **performance**: 0.6 µs per physics step, 1.3 µs with four machines firing and a laser burning —
  0.016% of a 120 Hz budget, and projectiles stay capped at 24
- **long session**: sixty missions back to back, last ten as fast as the first ten
- **determinism**: the same seed reproduces the same flight, enemies included

### Accessibility

Every one of these changes presentation only, and there is a test that says so: the same flight flown
with shake off, flashing off, high contrast on and text at 125% produces a byte-identical result.

| Setting | What it does |
| --- | --- |
| Motion | screen shake at full, half, or off |
| Flashing | pulsing and strobing at full, reduced, or held steady — a warning never *disappears*, it stops moving |
| Instrument size | HUD and every overlay at 85%, 100% or 125% |
| Contrast | pads get a white bar and squared ends, threats get a white ring and a letter (T/D) — every marker readable without colour |
| Controls | all five flight controls rebindable; retry, pause, mute and escape are reserved so the menu is always reachable |

Also here: **one hazard warning at a time**. Mars under a dust front with the wind up and the heat
building used to stack three full-size panels over the sky; hazards are now ranked by urgency, the
most urgent keeps its instrument and the rest collapse into quiet chips. And **ranked audio**: eight
warning voices with right of way, so a turret charging, a low tank and a heat build do not all shout
at once.

### Anti-frustration, measured against section 13

- **A failed expedition always files a debrief** — a floor of 60 salvage and 40 research, the price
  of the cheapest skill rank. A run that ends badly still ends with a decision. A good run is never
  topped up.
- **Tech Core bad-luck protection** — cores normally need a perfect landing on a small pad; eight
  missions without one and the next clear pays anyway.
- **The route always offers four bodies.** It did not: clearing Mars early left only three tier-A
  bodies and the route screen silently shrank to three cards. Found by a test that sweeps every
  cleared-set and sector.
- **Repeated failure offers help, never a secret discount.** Three landers lost on the same ground
  and the crash screen names what is killing you and offers to lend the module for it. The loaner
  lasts the expedition and never touches permanent gear.
- **No settlement pays twice.** Each payout carries an id the run records, so a reload between the
  payout and the run being cleared cannot bank it again.

### The autopilot, unified

`test/autopilot.js` carried its own copy of the control law, and it had drifted: no position hold,
no wall guard, no scaled ceiling guard. The browser and the node validator had been flying
differently for several milestones. There is one law now, in `test/pilot.js`, and the browser file
only adapts it to the live game objects.

---

## M14 — the map as a risk gradient

Tom played the MVP and reported two things: he met a turret exactly once, and he never saw any
material to pick up. Both were true, and measuring them turned up a third fault neither of us had
noticed.

### What the measurements said

**The optional objectives did not exist.** `optionalObjective` was read in exactly one place in the
codebase — the briefing screen, which printed it. Nothing evaluated it and nothing paid it. Moon 1
told the player to recover a titanium sample; there was no sample, no way to recover one, and no
reward. The field had been carried as data since M4 "for a later milestone" and no milestone ever
consumed it.

**Every mission was the same length.** `spawnFor` placed the lander at `bestPad ± width × 0.3`, so
the traverse to the scoring pad was *exactly 30% of the map* in all fifteen missions, on every seed.

**On the combat missions the safe pad was under your feet.** Distance from spawn to the second pad,
median over eight seeds: moon-4 **2 px**, mars-4 **1 px**. The optimal line on the two missions
designed to introduce enemies was "descend 900 px and land" — which is why no turret was ever met.

| | spawn → prize | spawn → safe pad |
| --- | ---: | ---: |
| moon-1 | 810 (30%) | 404 |
| moon-4 | 930 (30%) | **2** |
| mars-4 | 990 (30%) | **1** |

### The gradient

The terrain owns the entry point now, chosen before the pads, and pads are placed in distance bands
measured from it — near 14–34% of the run, mid 38–62%, deep 66–94%. Content is authored prize-first:
pad 0 goes in the deepest band, the last pad in the nearest. Reward follows distance: the deep zone
pays roughly **triple the rare material** and 50% more salvage.

| | before | after |
| --- | ---: | ---: |
| prize distance | 810–1020 px, always 30% | **2010–2638 px, 67–82%** |
| safe pad distance | 1–1586 px, unpredictable | **589–1001 px, 19–30%** |

### The fuel road

The prize is deliberately out of range of the starting tank. Fuel cells were scattered anywhere,
which made them a lottery; they are a *route* now — a line of them from the entry to the deep zone,
placed on the glide line and a little under it, so taking them means committing to a lower, slower
crossing. That is also the ground the guns can see.

Measured over 20 seeds per mission, flying straight at the prize versus flying the road:

| | direct | via the road |
| --- | --- | --- |
| moon-5 TYCHO DESCENT | 13/20, 7% fuel left | **20/20, 30%** |
| mars-4 IRON RAIN | 5/20, 14% | **14/20, 32%** |
| mars-5 STORM EYE | 1/20, 8% | **10/20, 36%** |
| europa-5 DRIFTING PLATE | 14/20, 20% | **20/20, 46%** |

The first attempt at this failed instructively: cells were placed low in the flyable column, and the
pilot had to *stop and hover* to reach each one. Landings went to 0/20 — a cell you have to hover for
costs more fuel than it carries. Putting them on the glide line and widening the pickup from 34 px to
62 px turned the road from a tax into a route.

### Two routes, proved separately

The validator used to prove one thing: delta-v to the highest-multiplier pad. That pad is now
deliberately unreachable on the tank, so the check would have failed the entire game. It proves two
claims instead, and the mission sweep flies both:

- **home** — the near zone, on the starting tank, straight in and from each side
- **prize** — the deep zone, by way of the fuel road

Across the 15 authored missions at 20 seeds: **home 8/8 on every mission**, prize 5–8/8. Across all
ten generated survey chapters at two sectors each: home 29–30/30, prize 15–30/30, with Titan's thick
atmosphere the hardest deep run in the game.

### The guards moved to the prize

Enemies were scattered uniformly across the map subject to the safety rules, which put half of them
nowhere near anything. Median distance from a machine to the pad it was supposedly guarding:

| | before | after |
| --- | ---: | ---: |
| moon-4 | 595 px | **386** |
| moon-5 | 865 px (max 1989) | **378** |
| mars-5 | 1326 px | **413** |

Nine times in ten a machine is now placed around the prize or back along the fuel road. The
sanctuary rule is untouched: the near zone and the whole column above it stay outside every
machine's reach, which is what keeps the safe landing safe.

### The objectives, finally

`src/objectives.js` implements all fifteen: eleven conditions judged from a plain flight report at
touchdown, and four that need a physical thing in the world — the titanium sample, the relay, the
sensor array and the iron salvage. Those are objects with a position, a marker and a pickup, placed
230–350 px past the deep landing zone at 80–130 px altitude, so recovering one is a route decision
rather than a line of text.

### What did not move

The physics fixture is unchanged: **the flight model has not drifted since M0**. The classic campaign
keeps the old spawn rule and the old pad carver, and its layout is untouched; the five classic
entries that moved in the flight fixture moved because the test pilot now collects fuel cells the way
the game always has — the harness got more faithful, not the game less stable.

---

## Encounter audit — what a player actually meets (2026-08-19, after M14)

Tom played M14 and reported meeting no enemies and finding no material on Europa. This is the
measurement behind that report: all 15 missions, 20 seeds each, flown twice — the safe route to the
near zone, and the deep route by way of the fuel road.

```
                       SAFE ROUTE                  DEEP ROUTE
mission             land  secs  shot-at     land  secs  shot-at  cells  cargo
moon-1 FIRST SCAR   20/20  25s    0/20      20/20  45s    0/20    2.9    yes
moon-4 SILENT BATT  20/20  24s    0/20      20/20  49s   20/20    3.1     no
mars-4 IRON RAIN    20/20  22s    1/20      14/20  46s   20/20    3.3    yes
europa-1 GLASS LAN  20/20  26s    0/20      20/20  49s    0/20    2.9     no
europa-3 RADIATION  20/20  24s    0/20      20/20  52s    0/20    2.6     no
europa-5 DRIFTING   20/20  26s    3/20      20/20  53s   20/20    3.6     no

flights that were shot at:  safe route 27/300 (9%)   deep route 119/300 (40%)
```

**The systems work; the content distribution does not.** On a mission that has enemies, flying the
deep route means being engaged **20 times out of 20** — M14's guard placement does exactly what it
was built to do. The problem is upstream of it:

| | count |
| --- | --- |
| missions with no enemies at all | **9 of 15** — every chapter arms only missions 4 and 5 |
| missions with nothing to recover | **11 of 15** |
| Europa missions with anything to recover | **0 of 5** |
| flights on the safe route that met anything hostile | 27 of 300 |

The deep route also costs roughly double the flight time — 42–53 s against 22–35 s — so the
commitment is real when there is a reason to make it. On two thirds of the game there is not.

### The deeper mismatch

Rare material is not an object. It is a number computed at touchdown from grade and pad tier, and
M14 made that number scale with distance — which is invisible. A player who flies further sees a
bigger figure on the results screen and nothing at all in the world. Tom's report was not "the
numbers are wrong", it was "I never saw any material to pick up", twice. That is a design fault,
not a content gap, and M15 is the fix.

---

## M15 — reward you can see and have to take (2026-08-19)

Tom's two rules, from playing M14: every mission except a chapter's first should have enemies, and
**material should be picked up, not awarded**. The encounter audit is the measurement both came from
and the measurement both are checked against, so it is a script now — `node test/encounter-audit.js
[seeds]`, part of `run-all.sh`. Re-running it against the M14 build reproduced the recorded numbers
exactly (safe 27/300, deep 119/300, nine unarmed missions, Europa 0/5), which is what made it
trustworthy as a before-and-after.

### Before and after

|  | M14 | M15 |
| --- | ---: | ---: |
| missions with no enemies at all | 9 of 15 | **3 of 15** (each chapter's first, by design) |
| missions with nothing to recover | 11 of 15 | **0 of 15** |
| Europa missions with anything to recover | 0 of 5 | **5 of 5** |
| flights shot at, safe route | 27/300 (9%) | 62/300 (21%) |
| flights shot at, deep route | 119/300 (40%) | **232/300 (77%)** |
| engaged on the deep route, armed missions only | — | **232/240 (97%)** |

The enemy ramp is one rule, written into `missions.js` and into `generateChapter` so authored and
survey chapters agree: mission 1 quiet, then 1, 1–2, 2, 2–3. Europa 5 takes 2 rather than the 3 the
ramp allows — its drones ram, its plate is fragile, and at 3 an unarmed flight to the prize fell
from 20/20 to 5/20. The ramp is a shape, not a quota.

The sanctuary rule is untouched and still proved the same way: **all 12 armed missions, 40 seeds,
sanctuary 40/40 and survived-fire 40/40**, flown with no weapon, no shield and no evasive logic.
Arming six more missions cost three deep landings across 300 flights (prize 259/300 → 256/300) and
nothing on the way home (521/540, unchanged).

### Material is an object now

`missionReward` used to compute material from grade and pad tier. It counts what was carried home
instead, the grade multiplies that haul (`HAUL_GRADE`: PERFECT 1, GOOD 0.9, HARD 0.75), and what
remains computed is a stipend — enough that a flight which collects nothing is still paid, never
enough to be the point. Salvage moved the same way, less far: the computed part keeps 65% of its old
value and loses its depth bonus, because depth is expressed by where the ore lies now.

Measured on a deep ×3 landing at Mars, PERFECT, in the live game:

| | collects nothing | full deep hold |
| --- | ---: | ---: |
| material | 25 (stipend only) | **97** (25 stipend + 72 carried) |
| salvage | 196 | **456** |

Deposits come in two kinds, both drawn in violet with a light shaft so they read from altitude and
through Mars dust at 22% visibility:

- **the crossing** — floating 90–170 px *below* the fuel road's glide line, so reaching one costs
  altitude on the leg where altitude is what keeps you out of reach
- **the seam** — 60–130 px above the ground around the deep landing zone, two of three past it, on
  the ground the machines are placed to cover

Never in the near band, never within 150 px of a landing zone, never in the sanctuary approach
corridor, and never within 150 px of a fuel cell or a cargo crate — two pickups on one pass is one
decision, and the ore is meant to be its own. All four rules are enforced in `validate.js` and hold
on every seed of every mission family.

**Ore to the nearest machine: median 427 px, 65% within 600 px.** One rule serves both — guards on
the prize, ore on the prize.

### What collecting costs

| route | lands | deposits taken | material home |
| --- | ---: | ---: | ---: |
| safe, near zone on the tank | 300/300 | 0 | 0 |
| deep, by way of the road | 256/300 | 0.4 of 3.8 | 5 |
| deep, detouring to every deposit | **156/300** | 2.8 of 3.8 | **50** |

The middle row is the honest one: the autopilot has no reason to detour, so it flies past the ore.
The third row is what a player who wants all of it is signing up for — and on `mars-2` and
`europa-4` it lands **0/20**, because sweeping a crosswind canyon or a tight ice corridor costs more
fuel than either mission carries. Taking only the deposits that lie on the road is the affordable
middle: **236/300 landings with 27–55% fuel left**. Mission fuel budgets were deliberately not
re-authored here — they are a known finding of their own, and moving them would have moved every
number above.

### Two faults this found in its own first version

- **Ore resting on the surface was unreachable.** At `ground - 18` px, taking a deposit meant
  landing, lifting off and landing again; a collector sweep managed 158/300 landings and 0.4 of 2
  deposits. Raised to 60–130 px it became a low pass on the way in: 2.8 of 3.8 taken.
- **Seam-before-crossing starved the short maps.** Placed first, the seam took the ground the
  crossing needed, and `moon-2`, `mars-2`, `europa-2` and `europa-4` shipped 0.1–0.2 floating
  deposits apiece. Crossing first fixed it.

### Two faults this found elsewhere

- **The test pilot was refuelling on cargo.** `flyMission` added a fuel cell's worth for *anything*
  `terrain.collect` returned, so every mission with a crate quietly handed the pilot 22 extra fuel.
  Fixed, and it is the only reason the flight fixture moved: `moon-1` seed 12345 and `moon-3` seed
  777 land exactly as before, with 16–18 less fuel in the tank. **The physics fixture is still
  unchanged since M0.**
- **The bundler boots terrain before economy.** A module-level `const X = MATERIAL_NODE.padGuard` in
  `terrain.js` throws "cannot access before initialization" in the single-file build and nowhere
  else. The macOS self-test caught it, as it has caught every bundling fault in this project;
  the config is read inside the methods now.

### The performance check was measuring the wrong thing

`node test/mvp-regression.js` failed on `combat costs less than the physics it rides on`
(`loaded < bare * 3`), reporting 2.3 µs against 0.6. It was not a combat regression: material
placement runs once per level, adds nothing to any per-step path, and in a cold process the loaded
loop moved 1.73 → 1.78 µs. `bare` runs after the whole mission sweep has thoroughly warmed
`ship.step`, so the denominator tracks the JIT's history rather than the engine's cost.

Replaced with the check the comment always claimed: cost per machine as machines are added, which is
what an accidental all-pairs loop would actually show.

| machines | µs/step | per machine |
| ---: | ---: | ---: |
| 1 | 0.56 | 0.56 |
| 4 | 1.94 | 0.48 |

Linear, and the absolute budget check still passes with 3,500× headroom.

### The audit, after

```
                       SAFE ROUTE                  DEEP ROUTE                        COLLECTING
mission             land  secs  shot-at  mat     land  secs  shot-at  cells  nodes   mat  cargo  land  nodes   mat
moon-1 FIRST SCAR   20/20   25s     0/20    0    20/20   45s     0/20    2.9 0.3/2.7     4  yes   19/20 1.7/2.7   31
moon-2 RILLE RUN    19/20   27s     1/20    1    20/20   35s    13/20    1.8 0.0/2.8     0   no   12/20 1.8/2.8   31
moon-3 FAR-SIDE REL 20/20   24s     0/20    0    20/20   49s    20/20    2.6 0.3/3.4     5  yes   18/20 1.8/3.4   34
moon-4 SILENT BATTE 20/20   24s     0/20    0    20/20   49s    20/20    3.1 0.3/4.4     4   no   14/20 3.3/4.4   62
moon-5 TYCHO DESCEN 20/20   25s     0/20    0    20/20   51s    20/20    3.5 0.6/4.6    10   no   11/20 3.2/4.6   59
mars-1 RED VEIL     16/20   23s     0/20    0    17/20   42s     0/20    3.1 0.5/4.5     7   no    4/20 4.5/4.5   82
mars-2 VALLES CROSS 11/20   28s     5/20    1     9/20   33s    19/20    2.0 0.0/3.0     0   no    0/20 2.5/3.0   39
mars-3 BURIED ARRAY 20/20   23s     2/20    0    15/20   45s    20/20    3.1 0.3/3.9     5  yes    2/20 3.1/3.9   55
mars-4 IRON RAIN    20/20   22s     1/20    0    14/20   46s    20/20    3.3 0.5/4.2     7  yes    4/20 3.9/4.2   68
mars-5 STORM EYE    19/20   26s     7/20    0    10/20   50s    20/20    3.6 0.8/4.8    10   no    2/20 4.1/4.8   74
europa-1 GLASS LAND 20/20   26s     0/20    0    20/20   49s     0/20    2.9 0.1/4.5     1   no   20/20 3.5/4.5   65
europa-2 BLUE FRACT 19/20   30s    17/20    1    20/20   39s    20/20    1.9 0.0/2.5     0  yes   16/20 1.4/2.5   23
europa-3 RADIATION  20/20   24s     4/20    0    20/20   52s    20/20    2.6 0.3/4.2     5   no   19/20 2.4/4.2   48
europa-4 UNDER-ICE  19/20   35s    20/20    1    14/20   42s    20/20    2.0 0.1/2.6     3  yes    0/20 1.3/2.6   20
europa-5 DRIFTING P 20/20   26s     5/20    0    17/20   52s    20/20    3.6 0.6/4.7     9   no   15/20 3.3/4.7   61
```

### Verified in the running game, not only in node

A live expedition on Mars: two deposits taken, a HARD landing, and the results screen reading
*"RECOVERED 2 of 4 deposits — 26 material · 68 salvage × 0.75 landing · 48 material still out
there"* — 20 of the 24 material banked came from the hold, 4 from the stipend. Crashing the next
lander with the same hold aboard printed *"CARGO LOST — 26 MATERIAL · 68 SALVAGE"* and banked
nothing, per the existing cargo rules. The HOLD instrument sits below the threat panel whether or
not a machine has woken yet, so it never jumps mid-flight.

---

## M18 — hazards you can feel (2026-08-20)

Tom's note was that the effects are not noticeable enough: the wind should be strong enough to feel,
the Gyro Stabilizer should be worth its slot, Mars dust should make a difference, and radiation
should mean something. Every item here was a number too small to reach the hand, and the honest
difficulty is that the **autopilot is the measuring instrument and it is a poor crosswind pilot** —
recorded as such since M13. Raising a hazard costs measured landings faster than it costs a human.

### Radiation now takes hull

It raised instrument noise and nothing else, which is why it read as meaningless. Past 55% exposure
it eats hull, at a rate that climbs with exposure, and **it stops at 35% of the hull**: radiation
softens you up, it never finishes you. Without the floor, Europa 5 (a 48 second deep run with two
drones on it) lost more than a full hull to sweep plus fire, and the route the map is built to tempt
you down became the route that killed you regardless of how well you flew.

Exposure also builds far more slowly than it did. At the old rate a lander went from clean to
saturated in **three seconds**, which left no room to reach a shadow; the sweep is a warning before
it is a wound now.

Counterplay, measured over 50 s of unsheltered sweeps:

| | hull left |
| --- | ---: |
| nothing equipped | 72 / 100 |
| Environmental Seals ×2 | **97 / 100** |
| Ray Shield, used on cooldown | **94 / 100** |
| both | **100 / 100** |

The route screen now recommends the Ray Shield for Europa, which it did not.

What it costs an autopilot that uses none of that, over 12 seeds:

| | deep route, radiation off | radiation on |
| --- | ---: | ---: |
| europa-3 RADIATION PASS | 12/12 | 9/12 |
| europa-5 THE FLOES | 10/12 | 5/12 |

### Wind, and the boundary layer

Wind went up on the three atmospheric bodies, but the interesting change is shape rather than size.
**Gusts now fall off near the ground** (32% at the deck, full strength above 260 px): the crossing
keeps the whole gust, and the last hundred pixels, where a metre per second decides the grade, stay
flyable. A full-strength gust at touchdown is not difficulty, it is noise.

| | before | after |
| --- | --- | --- |
| Mars | wind 22, gust 16, drag 0.14 | **24 / 20 / 0.15** |
| Titan | wind 26, gust 20, drag 0.20 | **30 / 26 / 0.22** |
| Venus | wind 18, gust 24, drag 0.30 | **22 / 30 / 0.32** |

**`windChannels` ignored `disturbanceResist` entirely.** THE CANYON is the mission built around wind
and it was the one place where the gear sold to answer wind did nothing. Found in the M15 loadout
audit, fixed here, and it is what makes the Gyro Stabilizer matter:

| mission | bare hull | gyro | gyro + dampers |
| --- | ---: | ---: | ---: |
| mars-2 THE CANYON | 3/12 | 5/12 | **7/12** |
| mars-5 STORM EYE | 6/12 | 8/12 | 8/12 |
| mars-3 BURIED ARRAY | 8/12 | 10/12 | **11/12** |

Wind is also *visible* now, as streaks blowing through the flyable air in world space, with speed and
density following `windNow`. The physics always knew about the wind; the screen did not.

### How far the wind could be pushed

Measured against the project's own "the way home is always there" bar (90% of near-zone landings):

| Mars wind / gust / drag | way home | mars-2 |
| --- | ---: | ---: |
| 22 / 16 / 0.14 (before) | 95% | 5/12 |
| **24 / 20 / 0.15 (shipped)** | **93%** | **7/12** |
| 26 / 24 / 0.16 | 87% | 4/12 |
| 28 / 30 / 0.17 | 84% | 2/12 |
| 30 / 34 / 0.18 | 81% | 1/12 |

Anything past the shipped value breaks the guarantee *as the autopilot measures it*. Note that
mars-2 is **better** than before at the shipped setting, because the gyro fix outweighs the stronger
wind. If Tom still wants more weather, the honest next step is a human playtest rather than a bigger
number, because the number that breaks is the test pilot rather than the mission.

### Mars dust actually blinds

It was a translucent tint: at 22% visibility the whole map was still legible through a filter, so the
storm cost nothing. The far field closes in now, with a clear bubble around the lander that shrinks
as the storm thickens. The pad beacons and the ore markers are still drawn *above* it, per the
spec's rule that the target must stay distinct in low visibility, so what you lose is the ground,
not the thing you are aiming at.

### The hull bar is on every body

It only appeared once something could shoot at you. Radiation can take hull anywhere now, and a bar
that appears once you are already losing is a bar you learn to read too late.

### Two faults in the tests themselves

- **`run-all.sh` reported "all checks passed" while the mission validator was failing two families.**
  Every line pipes through `tail`, so the pipeline reported *tail's* exit status. `set -o pipefail`
  now. This is the one thing a test runner must never do, and it had been true for some time.
- **The combat proof was flying the wrong route.** It flew with no `padIndex`, which targets the
  highest-multiplier pad: the deep zone, past the fuel road, with the guards on it. The guarantee
  the design actually makes is about the *sanctuary* — the near zone and the column above it. The
  proof flies that now, and "you can take the prize unarmed" is still measured and printed, as
  evidence rather than as the promise. Verified before changing it: the safe route loses **0 of 20**
  flights to fire on every armed mission, so the guarantee holds; every failure was on the prize.

### The physics fixture moved, for the first time since M0

The gust boundary layer makes gusts depend on altitude, which is a deliberate change to the flight
model rather than drift. One case moved by fractions of a pixel at step 7, where the lander is high
enough that the shear is near 1. Re-recorded with that reason. Everything else about the flight
model is untouched.

---

## M19 — terrain with teeth (2026-08-20)

Tom asked for three times bumpier and said to pick what is manageable. It came out at about **2.2×**,
and the reason three was never on the table is more interesting than the number.

### Raising `relief` did almost nothing

The generator fits the silhouette to the world, and the space a canyon has to sink into is
`groundBase - 70`, which was **230 px**. Every trench was already compressed to roughly half its
intended depth, so multiplying relief only made the compression worse:

| relief multiplier | fit on moon-2 (a canyon) | effective depth |
| --- | ---: | ---: |
| ×1 | 0.56 | 0.56 |
| ×1.5 | 0.37 | 0.56 |
| ×2 | 0.28 | 0.56 |
| ×3 | **0.19** | 0.57 |

The lever was never the multiplier. It was the vertical budget, so the world is taller: height
1400 → 1600, groundBase 300 → 520. That nearly doubles canyon depth capacity, and it is **free** —
86/90 on the way-home measure, identical to before, and it slightly *improves* the deep route
because there is more air to fly the fuel road through.

### Which knob costs what

Measured one at a time against the project's own "the way home is always there" bar:

| change | way home |
| --- | ---: |
| nothing (before M19) | 86/90 |
| macro relief ×1.8 alone | **89/90** |
| surface roughness ×1.7 + bite 0.5 alone | 83/90 |
| narrowing to 0.75 alone | 84/90 |
| all three together | 81/90 |

Macro relief is nearly free; surface texture and narrowing are what cost landings, because they
land on the pad approach rather than on the crossing. So relief went to 1.8, roughness and bite
stayed modest at 1.25 / 0.25, and macro features narrowed 15%.

### Boulders are terrain, not decoration

Rocks were 3–9 px and drawn on top of the heightmap with **no collision at all** — a boulder was
something you flew through. Making them large would have meant either obvious fakery or a whole
second collision system for free-standing bodies.

They are raised into the heightmap instead, as jagged domes. Collision comes free, because the same
three hull points and two feet already test against the ground, and everything placed afterwards —
the fuel road included — sees the real surface. 6–12 per mission at 16–74 px radius, against the
old flat 3–9.

That turned out to be the cheapest bumpiness in the milestone, because boulders sit **away** from
the pads by construction: the way home went *up*.

### Where it landed

| | before | after |
| --- | ---: | ---: |
| mean surface slope | 0.331 | **0.719** (2.17×) |
| share of surface steeper than 30° | 16.7% | **38.3%** (2.29×) |
| relief span | 330 px | **597 px** (1.81×) |
| way home | 93% | **95%** |
| deep route | 83% | 75% |

The classic twelve are untouched. The roughness multiplier is gated on having an archetype, so the
legacy path cannot be roughened by accident; confirmed by the flight fixture, where all 45 moved
entries were authored missions and zero were classic.

### A cave you fly into

A cave was a lid over the whole level, so a cave mission began already indoors and the ceiling was a
fact rather than an event. The roof is lifted clear of the world at the entry and comes down across
the crossing. On UNDER THE ICE:

| distance from the entry | roof | corridor |
| ---: | ---: | ---: |
| 0% | −120 (above the world) | 1165 px |
| 25% | −93 | 1578 px |
| 35% | 60 | 1422 px |
| 60% | 268 | 649 px |

Still one array over the whole level, so every consumer keeps working untouched: hull collision,
line of sight, the fuel, cargo and ore placement clearances, the corridor validator and the pilot's
ceiling guard. Near the entry the roof is simply out of reach.

**Caves get smaller boulders.** At full size they cost a lander to enemy fire on the *safe* route on
europa-4 — the one thing the design promises cannot happen. A roofed level gets 55% as many at half
the radius, and the guarantee is back to 20/20.

### Three tests that were passing for the wrong reason

Terrain this different is a good way to find tests that were relying on scenery.

- **The turret minimum-range check** flew at `enemies[0]` on a *two*-turret mission and asserted
  nothing fired, which silently depended on the second turret being out of range. M19 moved them
  253 px apart, the far gun did the shooting, and the rule under test was never exercised. It uses
  a one-turret field now.
- **The muzzle-safety invariant** read `shots[k].x` after `field.update`, but that call fires the
  shot *and* steps every projectile in the same pass. At 255 px/s that is 2.1 px of travel, and it
  reported a shot born at a legal 57.1 px as an illegal 55.0. It reads the fire event now, which is
  the birth position. The rule was never broken; the ruler was.
- **The way-home gate samples 6 seeds**, which at these margins is ±4 points of noise — it read
  79–84 out of 90 across settings that all measure 94–95% at 20 seeds. Worth remembering before
  tuning against it again.

---

## M20 — Europa, properly icy (2026-08-20)

Tom's note was that Europa still has smooth basins, and that the fragile pads should go. The first
half of that had a number behind it: after M19 roughened the whole game, **Europa was the smoothest
chapter in it**.

| chapter | mean surface slope | steeper than 30° |
| --- | ---: | ---: |
| **EUROPA** | **0.618** | **29.6%** |
| LUNA | 0.717 | 38.5% |
| MARS | 0.742 | 40.0% |

`europa-1 GLASS` was 0.308 and 13.7%, the smoothest map anywhere in the game.

### Fragile pads are gone

Removed at all seven sites: the two pads (`europa-2`, `europa-5`), the `fragile` field in
`terrain.js`, the fracture branch in `ship.finishTouchdown`, the `ICE · max N m/s` label in
`render.drawTerrain`, and `brokePad` — which had no producer left — from the flight report and the
`perfect` objective. THE FLOES' objective read "Set down on the plate without cracking it" and reads
"Set down on the plate at PERFECT" now.

Verified in the running game rather than only in node. On THE FLOES' prize pad:

| touchdown | before | now |
| --- | --- | --- |
| 15 px/s (2.5 m/s) | ice splits — CRASH | **HARD, survived** |
| 17 px/s (2.8 m/s) | ice splits — CRASH | CRASH, "descent rate 8.2 m/s, past the 7.3 the gear can absorb" |

That is the whole point of the decision: what kills you is the envelope every other body is judged
by, not a hidden per-pad cap that fails a landing the player would call clean.

### Ice is geometry now, not a palette

Two passes, both **raised into the heightmap** so collision, line of sight, the fuel road and the
ore clearances see the real surface for nothing — the rule M19's boulders established.

- **seams.** The shell fractures into plates that *step* against each other. A seam shifts every
  sample beyond it, so the joint is a hard cliff rather than a steep piece of noise, and the running
  offset is bounded and reversed rather than accumulated, so the plates step without walking the far
  end of the map off the bottom of the world. 5 per mission, throws of 9–30 px.
- **seracs.** Leaning blades, 1.5–3.2× as tall as they are wide, at a profile exponent of 1.3 so
  they come to a point instead of swelling out of the ground. 12 per mission at 24–52 px radius.
  The heightmap samples every ~12 px, and that is what sets the minimum radius: anything narrower
  than two samples cannot exist in the ground, only in a drawing of it.

A body opts in through `PlanetDefinition.terrainStyle`, so an icy world is data. Only EUROPA is set;
Enceladus, Pluto and Ganymede are still rock, and stay that way until their chapters are authored.

### Which knob costs what

Measured over 20 seeds, the whole chapter, with the crevasse already a cave so the two changes do
not contaminate each other:

| | way home | prize via the road | mean slope | steeper than 30° |
| --- | ---: | ---: | ---: | ---: |
| no ice | 99/100 | 78/100 | 0.593 | 27.4% |
| seams only | 100/100 | **79/100** | 0.612 | 28.4% |
| seracs only | 99/100 | 69/100 | 0.949 | 39.6% |
| **both (shipped)** | **100/100** | **68/100** | **0.964** | **40.1%** |

**Seams are free** and seracs are the entire cost — the same shape M19 found, where macro structure
away from the pads costs nothing and anything landing on a pad approach costs landings. Both are
kept off the landing zones by construction (170 px for a seam, 110 px plus the blade's own radius
for a serac), which is why the way home does not move.

### Where it landed

| | before | after |
| --- | ---: | ---: |
| mean surface slope | 0.618 | **0.964** (1.56×) |
| share steeper than 30° | 29.6% | **40.1%** |
| relief span | 554 px | 595 px |
| way home | 100/100 | **100/100** |
| prize via the road | 82/100 | 68/100 |

Europa was the smoothest chapter and is now level with the other two — 40.1% steep against Luna's
38.5% and Mars' 40.0% — rather than the roughest. An earlier blade profile (exponent 0.8) measured
1.079 and 45.5%, which made Europa the roughest body in the game for the same cost in landings; the
sharper, narrower blade is both more like ice and cheaper.

Luna and Mars re-measured **bit-identical** to their pre-M20 numbers, which is the check that the
ice pass runs on its own seed streams and reaches nothing else.

### THE CREVASSE is a cave you fly into

M19b made the cave mouth per-mission, and a crevasse is the obvious second candidate: open sky at
the mouth, the roof coming down across the crossing, and the bridge of ice at the end of it. It also
needed a fiction that was not the fragile pad, which had just been removed.

Where the wall is, over 20 seeds and the validator's own three approaches:

| mouth / shut | way home | of 60 runs |
| --- | ---: | ---: |
| 0.32 / 0.66 | 20/20 | 44 |
| **0.26 / 0.58 (shipped)** | **20/20** | **40** |
| 0.20 / 0.52 | 16/20 | 28 |
| 0.14 / 0.40 | 12/20 | 17 |

At 0.26/0.58 the roof is about 70% shut by the time the pad is under you. Closing it earlier breaks
the way-home guarantee, and **`clearance` changes nothing** — 300, 380, 460 and 540 all measure the
same, because the corridor over a pad at the bottom of a canyon is 1,200+ px whatever the clamp
asks for. The wall is the pilot's ceiling guard on the crossing, not headroom at the pad.

What each half of the mission's change costs, separated:

| europa-2 | way home | prize via the road |
| --- | ---: | ---: |
| neither | 20/20 | 20/20 |
| cave only | 19/20 | 16/20 |
| ice only | 20/20 | 19/20 |
| **both (shipped)** | **20/20** | **15/20** |

### What it cost across the MVP

| | before | after |
| --- | ---: | ---: |
| way home | 521/540 (96%) | **521/540 (96%)** |
| the prize | 212/300 (71%) | 199/300 (66%) |

The way home is **identical**, which is the guarantee. Every one of the thirteen lost prize flights
is on Europa: `europa-2` 20→13 (mostly the cave), `europa-3` 10→5, `europa-5` 5→4, with `europa-1`
and `europa-4` unmoved.

`europa-3 RADIATION PASS` is the biggest single drop, and **it is not fuel** — mean fuel left went
*up*, from 79.9 to 97.0, because the flights end early. The pilot is flying into blades. It has no
terrain lookahead, which M19 recorded as the measuring instrument's weakness, and 5/20 on a deep
route sits inside the band the game already ships (`mars-5` 5/20, classic DEEP SHAFT 4/20).

The flight fixture moved on **exactly the five Europa missions and nothing else**, which is the
cleanest available proof that the change is contained. Re-recorded with that reason.

### Two render faults, one of them older than this milestone

- **Boulders drew a closing skirt that hangs in the air.** A raised shape was filled by tracing the
  heightmap and closing the path across it at a fixed height — which meets the surface only on level
  ground. On a slope the closing edge floats, and the fill and stroke draw a visible box beside the
  rock. It has been there since M19 and was invisible until ice made the ground steep enough to
  show it. Both boulders and seracs close *below* the ground now and stroke only the silhouette.
- **A recorded crest could be invalidated by a later pass.** Each raising pass records the crest it
  produced, and a boulder standing where a serac already stood left the blade's recorded crest 40 px
  underground — which the renderer reads to place its gradient. Every crest is re-derived once, in
  the constructor, after all raising is done. Any future raising pass goes *before* that line.

The new terrain tests found the second one. The ice section is 65 assertions covering determinism,
the seed-stream isolation, that a seam is a real bounded step on a sample boundary, that a serac
actually stands above the ground beside it, that a pad still sits on the plate it moved with, and
that nothing icy comes near a landing zone or closes a cave corridor.

### For M21

On a **single-pad mission the sanctuary is the prize**, so "the safe route is never fired on" cannot
hold there: `europa-2` and `europa-4` are shot at on 20/20 seeds. `sanctuaryClear` still passes,
correctly — it measures the pad and the column above it, not the crossing — and every flight
survives. But it means two of fifteen missions have no unwatched way in, and M21 is the milestone
that places machines.

The encounter audit's greed measure fell 108/300 → 85/300, all of it Europa, with `europa-2` going
15/20 → 0/20. That is the cave plus the known-stale fuel budgets, which are already recorded as
the finding they are.

---

## M21 — structures, and guards that belong somewhere (2026-08-20)

Three asks from Tom's playtest: turrets half-buried in slopes, too few machines, and nothing built
in a world whose fiction is full of abandoned installations. All three measured first.

### Turrets stood on slopes because nobody re-checked after M19

The placement filter allowed ground up to a slope of 0.5, written when the ground was smooth. M19
roughened everything and the filter never moved:

| | before | after |
| --- | ---: | ---: |
| mean \|slope\| under a ground gun | 0.220 | **0.043** |
| guns on ground steeper than 0.30 | 30% | **0%** |
| height across the gun's own base | 9.8 px | **2.3 px** |
| guns with more than a radius of it (half-buried) | 36 of 199 | **0** |

Two changes. The slope limit came down to 0.28, and a **second, better test** joined it: the height
across the machine's own footprint. A slope test alone passes a gun standing across a 40 px step,
because a step between two heightmap samples is not a slope — which is exactly what M19's boulders
and M20's seams put into the ground.

### Structures, and why terrain does not know what a turret is

The other half of the fix is that there is now somewhere to stand. A **structure** is a flat-topped
block cut into the heightmap — a tower or a low hab — with vertical sides, because a building with
sloped sides reads as a hill. It follows the same rule as a boulder or a serac: raised into the
ground, so collision, line of sight and every placement clearance come free.

Terrain produces flat-topped geometry and records it; `placeEnemies` chooses among what it finds.
The generator never learns what a turret is, which is the import rule the project has held since
M19. **73% of ground guns now stand on a roof.**

One fault found by its own test: the roof was derived from the ground height at the structure's
*centre* and cut with `Math.min`, which leaves the high end of a slope standing proud **through** the
roof — an 87 px step across a 183 px hab. It is derived from the highest ground under the whole
footprint now, and the roofs measure flat to under 2 px.

### More machines is not more of a fight

Before: **21 machines across 15 missions**, and 71% of the deep route had nothing on it at all.

The spec's rule is "1-3 at once, rarely 4", and until M21 the validator checked that as a headcount
on the *map* — a different claim, and the one that blocked the ask. What matters is how many can
engage the lander at the same moment. So:

- machines take **stations strung along the crossing** rather than ringing the prize
- a machine's engagement disc may overlap at most **3 others**, which makes "no more than 4 at once"
  a cheap local test instead of a sweep of the world
- the validator checks that same rule, sharing the constant — the M12 lesson about placement and
  validation drifting apart

| machines that can engage you at once | share of all the air a lander can fly through |
| --- | ---: |
| none | 62.0% |
| 1 | 26.5% |
| 2 | 10.2% |
| 3 | 1.2% |
| 4 | 0.1% |
| 5 | **never** |

**39 machines now, against 21 — 1.86×**, with the crowding *lower* than before per machine. The
audit reports this distribution now, because it is the property the design claims.

### The overlap rule had to be symmetric, and the validator caught it

Counting overlaps only against machines *already placed* passes a candidate that overlaps three
while pushing each of those three to four. Placement said fine; the validator failed OLD BATTERY and
IRON RAIN on eleven seeds between them. The test caught a real bug in the code it was written
against, on its first run.

### A budget is what the map fields, not an aspiration

Raising budgets alone did not work: at 6 machines a mission fielded 3.4. The obvious suspects were
all wrong — removing *any single* constraint bought 3-5 points, and removing the at-once cap
entirely still only reached 87%:

| | fill |
| --- | ---: |
| as shipped then | 83% |
| no at-once cap | 87% |
| no sanctuary margin | 88% |
| the old loose footing rules | 86% |
| 4× the placement attempts | 84% |

A map has room for a finite number of non-overlapping engagements, and past that the number in the
mission file is a lie. Two things fixed it:

- **a broad fallback.** Past 60% of its attempts a machine abandons its station and searches the
  whole map. Without it, RADIATION PASS placed *nothing* on one seed in five — the same "declared
  enemies, empty mission" the M15 audit exists to catch.
- **budgets set from a measured capacity sweep.** Every budget now fills to **99%** (810/820 over 20
  seeds), no armed mission is ever empty, and the test asserts a 95% floor rather than exact
  equality — if it drops, a budget was raised past what its map can hold.

### Two missions cannot have more machines at all, and the reason is structural

`europa-2 THE CREVASSE` and `europa-4 UNDER THE ICE` are single-pad caves. With one landing zone the
sanctuary **is** the prize, and the corridor is the only way in — there is no route around a machine
the way there is on a two-zone map. Unarmed flights lost to enemy fire, over 40 seeds:

| machines | THE CREVASSE | UNDER THE ICE |
| ---: | ---: | ---: |
| 1 | **0/40** | 0/40 |
| 2 | 2/40 | **0/40** |
| 3 | 6/40 | 1/40 |
| 4 | 8/40 | 5/40 |

"You can cross this unarmed" is a promise, so they hold at 1 and 2 — their pre-M21 numbers. This is
the single-pad finding M20 raised, and it now has a number attached: it does not just make those
missions watched, it caps what they can carry.

### A drone-only chapter cannot absorb machines the way a mixed one can

A turret is something you fly around; a drone follows you and rams. On THE FLOES' deep route,
unarmed flights land 6/20 at two machines, 3/20 at three, 1/20 at four. Europa's budgets are below
Luna's and Mars' for that reason, not by oversight.

Worth separating from it: `europa-3 RADIATION PASS`'s deep route is **4/20 with no machines on the
map at all**. That collapse is M20's ice, not M21's guards, and no combat tuning will move it.

### Where it landed

| | before | after |
| --- | ---: | ---: |
| machines across the campaign | 21 | **39** |
| budget fill | — | **99%** |
| ground guns on a slope | 30% | **0%** |
| guns standing on a built roof | — | **73%** |
| way home | 521/540 (96%) | **519/540 (96%)** |
| the prize | 199/300 | 179/300 |
| deep route engaged | 86% | 93% |
| ore within 600 px of a machine | 61% | 79% |

The way home is untouched, which is the guarantee. The prize costs 20 flights of 300 — the intended
price of the ask — and the ore is genuinely contested now, since machines and deposits are both
placed along the road: the median deposit sits 247 px from a machine, against 451 px before.

The flight fixture moved on the armed authored missions only. No classic mission and none of the
three quiet chapter-openers moved, which is the containment check.

---

## M22 — ore you can read (2026-08-20)

Two changes, both Tom's: the reward should be a crate you recognise, and the shaft of light marking
it should go.

### The marker told you where, and nothing else

A deposit was a rotating violet diamond under a 150-210 px column of light. It solved the M14
problem — you could not find the ore — by pointing at it, which is a different thing from making the
ore visible. What is drawn now is a **crate**: a chamfered container with strapping, ore glowing
through a slot, a hover cushion under it and a shadow on the ground it hangs over. A deep-band crate
carries **two** slots and is a size larger, so "worth about double" reads without a legend.

The dust beacon — the marker drawn *above* Mars' storms so a target stays distinct at 22% visibility
— is the crate's own silhouette now rather than a diamond, so what shows through the weather is the
thing you are looking for.

### They hang low over the ground now

Crossing deposits were positioned against the *glide line*, which put them a mean of **243 px** above
the ground and as much as **718** — high enough to read as a marker floating in the sky rather than
as cargo somebody left. They are placed against the ground itself now, in the same band the seam
crates already used.

Lower is not free, and the trade is monotonic — a crate nearer the ground costs a deeper descent and
a longer climb:

| band above ground | mean height | collector sweep lands | deposits taken |
| --- | ---: | ---: | ---: |
| 70-150 | 106 px | 75/300 | 1.30 |
| 85-190 | 133 px | 79/300 | 1.47 |
| **110-240 (shipped)** | **170 px** | **82/300** | **1.62** |
| 140-300 | 215 px | 85/300 | 1.76 |
| the glide line (before) | 243 px | 82/300 | 1.80 |

The shipped band **halves the hang height and caps the worst case at 240 px against 718, while
collecting as much as the glide-line rule did**. Seam crates are unchanged at a mean of 93 px.

| | before | after |
| --- | ---: | ---: |
| crossing crate height | mean 243 px, max 718 | **mean 170 px, max 240** |
| seam crate height | mean 94 px | 93 px |
| collector sweep | 82/300 | 82/300 |

The flight fixture did not move at all, which is the right answer: the pilot only detours for ore
when it is told to, so a change to where the ore hangs cannot move a flight that was never going
there.

---

## M23 — the cleanup (2026-08-20)

A refactor with no behaviour change, executed in the order the M23 plan prescribed and proved the
way it prescribed: **both fixtures byte-identical**, the full suite green, and a scripted playtest
of the running game at every seam.

### What moved

Two files carried 39% of the codebase. `main.js` was loop glue plus a 492-line `screenHTML` over
42 screens plus a 220-line `act()`; `render.js` was every draw call in the game in one file.

| | before | after |
| --- | ---: | ---: |
| `main.js` | 1,866 | **942** — the loop, the outcomes, the wiring |
| `render.js` | 1,892 | **992** — the world: backdrop, terrain, ship, beacons |
| `state.js` | — | 96 — `g`, `meta`, `store`, `settings`, the device singletons |
| `screens.js` | — | 656 — every overlay screen, as HTML |
| `actions.js` | — | 244 — the dispatch: what every button does |
| `drawkit.js` | — | 80 — palette, type, `throb`, tint helpers, HUD panels |
| `enemydraw.js` | — | 327 — machines, telegraphs, wrecks, shots, laser, shield |
| `hud.js` | — | 524 — the instruments |

33 modules, **26 importing three things or fewer**, and the graph is still a DAG — enforced now
rather than promised, because the bundler fails on a cycle.

### The state moved first, and that is why the rest was cheap

`screenHTML` closed over 26 module-scope bindings. Moving the screens without moving the state
would have meant threading a 26-field context object through everything — the plan called this the
expensive part, and it was: the extraction itself is `state.js`, 96 lines, and after it the screens
and the dispatch simply followed their bindings out.

`meta` is the one binding that is *reassigned* (banking a run replaces it), and an ES import cannot
assign to what it imports — so writers go through `setMeta` and readers get the live binding. The
playtest verified the live binding across modules: equipping a module through `act()` in
`actions.js` was read back changed from `state.js`.

### The dispatch is a leaf, not a hub

`act()` needs eight verbs that belong to the loop — `startLevel`, `launch`, `beginExpedition`,
`resumeExpedition`, `persistRun`, `setState`, `toast`, `renderOverlay` — and importing them back
from main would put a cycle in the graph. Main injects them once at startup (`wireFlow`), so main
knows about actions and actions never knows about main.

### The render split pays before the roster grows

`drawkit.js` exists because the bundle is one scope: a colour token can only be *declared* once, so
the shared vocabulary had to live somewhere all three drawing modules could import it from.
`enemydraw.js` is the seam that matters for what comes next — six enemy designs are still owed, and
each is now an `ENEMY_TYPES` entry plus a draw function in a 327-line file rather than in a
1,900-line one.

### The bundler derives its order now

The hand-kept `MODULES` list caught real faults (M8, M15) but was itself a trip hazard (M17), and a
file missing from it silently vanished from the bundle. The order is a topological sort of the
import graph now: every file on disk is bundled, each after everything it imports, and a cycle
fails the build loudly. The duplicate-declaration guard and the self-test both stay. This step ran
*first*, out of the plan's order, so the five new modules never needed hand-listing.

### What the surgery cost, honestly

The line-based extraction broke braces in three places — a `throb` cut one line short, an orphan
`}` carried into `drawkit`, `drawHangarShip` left unclosed — and produced three phantom imports
from prose ("Terrain is cover", "final approach") plus two real missing ones (`ENVELOPE`, `WORLDS`
in `hud.js`). **The bundle build caught none of them** — one shared scope hides missing imports by
construction. Real ES module loading caught every one: node import for syntax, the browser for
bindings. The lesson stands for the next refactor: the bundle canary proves load order and name
collisions, only the module loader proves the imports.

And the canary then caught its **fifth** fault, right on cue: the bundler rebuilt each `import * as
Save` namespace as a `const Save = {...}` once per *importing module*, which was fine for the three
milestones in which exactly one module imported Save — and a duplicate-const crash the day
`actions.js` became the second. Aliases are deduplicated per module now. Every check in
`node build.js` passed over this, because the duplicate lived in *generated* code, past the
declaration guard: only booting the bundle finds this class.

### The playtest

Scripted against the running game, all through the new boundaries: the single-file bundle boots on
the derived order; every menu screen renders with content; the classic twelve flown to VICTORY
through the real loop; the LUNA and EUROPA chapters flown as expeditions with hauls banked;
equip/skills/hangar exercised through `act()`; `uiScale` and `highContrast` reach the DOM through
`saveSettings`; pause via the real P-key path and resume; the keys screen; a combat mission drawing
machines, telegraphs, HUD, crates, seracs and a hab in one frame. **Zero console errors across the
entire pass.**

### What did not move

Both fixtures, byte-for-byte — which is the entire claim. Physics, terrain, enemies, economy,
missions: untouched. Every number in the M20–M22 sections still stands.

---

## M24 — a harder game, and one game (2026-08-20)

Eleven asks from Tom, given as one list. Four of them are combat and visibility numbers, five are
the shape of a run, two are tooling. The combat numbers turned out to interact with a guarantee the
project had held since M12, which is the only part of this milestone that needed a decision rather
than an implementation.

### What a machine costs you now

| | before | after |
| --- | ---: | ---: |
| turret shot | 10 damage, 200 px/s | **50 damage, 600 px/s** |
| drone shot | 8 damage, 255 px/s | **50 damage, 765 px/s** |
| drone ram | 16 damage | **50 damage** |
| turret telegraph | 1.25 s | **0.25 s** |

Two hits end an unupgraded lander, which is what was asked for, and three end an upgraded one —
that second number matters, because it is what stops "two shots" from making the Hull track
pointless. Both are asserted now.

### The guarantee this broke, measured before it was decided

The M12 promise was enforced as: an unarmed autopilot survives the safe route on every seed of every
armed mission. It did, 240/240. Under the new numbers:

| | before | after |
| --- | ---: | ---: |
| armed missions whose safe route survives 20/20 | **12 / 12** | **5 / 12** |
| unarmed crossings survived, campaign-wide | 240/240 | **167/240 (70%)** |
| the deep route, all armed missions | ~117/240 | **17/240** |
| europa-2 THE CREVASSE, safe route | 20/20 | 2/20 |
| mars-5 STORM EYE, safe route | 20/20 | 7/20 |

The *sanctuary* never moved: 20/20 on every mission, every seed. The pad and the 420 px column above
it are still outside every machine's engagement disc, because placement did not change — only
lethality did. What broke was the **crossing**, which the rule never covered and which used to cost
hull instead of the lander. `europa-4` had been arriving with 3 hull of 100; at 50 a hit the same
one-and-a-half hits kill.

**Tom took option 1: accept it.** The promise is narrower now and stated exactly — *the sanctuary pad
is unreachable, the crossing to it is not* — and `validate-missions.js` was rewritten around that:
the geometry stays a hard gate, surviving the crossing became a printed measurement with a
campaign-wide headline. It was not deleted, because a number nobody watches rots.

**Read that 70% knowing what produced it.** The instrument is an autopilot with no weapon, no shield
and no evasive logic whatsoever — it does not dodge, and it does not use cover on purpose. It
measures the floor, not what a person meets. This is the same instrument weakness recorded since
M13, and it is more load-bearing here than it has ever been.

### Visibility, and why the obvious formula was wrong

"300% more challenging" was first implemented as tripling the *obscured* fraction, `1 - (1-v)*3`.
That saturates: anything already below 0.67 clamps to the floor, and **four of five Mars missions
came out at the same near-blind number**. BURIED ARRAY and STORM EYE were authored two stops apart
and measured identical, which throws the content away.

It is `v ** 3` instead — monotonic, so the authored ordering survives, and it is also the physically
right answer, since transmission through a medium falls exponentially with its depth. Three times the
dust in the air *is* v³.

| worst visibility | before | linear ×3 | shipped (v³) |
| --- | ---: | ---: | ---: |
| mars-1 | 0.55 | 0.08 | **0.166** |
| mars-2 THE CANYON | 0.85 | 0.55 | **0.614** |
| mars-3 BURIED ARRAY | 0.32 | 0.08 | **0.050** |
| mars-4 | 0.50 | 0.08 | **0.125** |
| mars-5 STORM EYE | 0.22 | 0.08 | **0.050** |
| every Moon and Europa mission | 1.00 | 1.00 | **1.00** |

Airless bodies stay at exactly 1.0, which is the check that the formula is weather and not a filter.

Worth recording as a finding in its own right: **`dust` overwrites visibility rather than combining
with the planet's**, so on a body with weather the planet's own figure never applies and the air goes
fully clear between fronts. Longstanding, left alone, and now visible because `worstVisibility()`
had to account for it to log an honest number.

### What a run is now

One game mode. The classic campaign and the endless run are gone from the menu — the twelve legacy
missions stay in `levels.js` because they are the M0 physics baseline and both fixtures regress
against them, so deleting the content would delete the only proof the flight model has not drifted.
No route choice: the seed and the sector decide. Losing the last shuttle takes the skills, every
banked resource and the opened map, and keeps the hangar, the blueprints and the equipped modules.

That split is the economy: salvage spent on a permanent upgrade is the only thing that survives a
run, and it can only be spent at a sector checkpoint — the same moment, and the only moment, the
loadout opens. So a permanent upgrade always costs the loadout you would otherwise have carried.

### What the greed loop costs now

| | M23 | M24 |
| --- | ---: | ---: |
| collecting every deposit, landings | 61/300 | **33/300** |
| deposits taken | 1.5 of 3.9 | **0.8 of 3.9** |
| material carried home, deep route | 5 | **3** |
| deep-route flight time | 38 s (1.45×) | 26 s (1.10×) |
| deep route engaged | 93% | 93% |
| machines engaging at once | 0:62% 1:26.5% 2:10.2% 3:1.2% 4:0.1% | **unchanged** |

The at-once distribution is untouched because placement is untouched. The flight-time ratio
collapsed for an unhappy reason: the deep flights now end early because they end.

### What did not move

**Both fixtures, byte-identical.** Physics and flight both unchanged, which is the containment proof
that none of the above reached the flight model. Visibility is presentation-only — the autopilot
flies on state, not on what is drawn — so no automated test in this project can measure item 2 at
all. That one is entirely on the human playtest.

### Faults found on the way

- **`validate-missions.js` reported combat failures as structural ones.** `hardFail` was incremented
  by the combat block, so the summary announced "7 mission families STRUCTURALLY INVALID" when no
  structural check had failed. It sent this milestone looking for terrain damage that did not exist.
  Counted separately now.
- **A phantom import, exactly the M23 class.** `obscure()` was called in `main.js`, which does not
  import `forces.js`. The bundle built clean through it — one shared scope hides missing imports by
  construction — and the browser caught it on the first load. The M23 lesson held: only the module
  loader proves the imports.
- **Three enemy assertions encoded the old design**, not a property: `telegraph >= 0.8` and
  `shot.speed < 400`. They were rewritten around what those constants were protecting — a reaction
  window of at least a second between the lock and the hit, measured at the machine's own range —
  rather than deleted. Turret 1.18 s, drone 1.68 s.

---

## M25 — the ladder, and the money you never got to spend (2026-08-20)

Tom played two bodies of the M24 build and reported that his salvage and research never became
spendable. That is a real bug with three causes stacked on top of each other, and the rest of the
milestone is the run shape he asked for around it.

### The bug: a whole chapter's pay, banked nowhere

Mission rewards accumulate in `run.haul`. `purchase()` and `buySkill()` spend from `meta.banked`.
The only thing that moves one to the other is a **checkpoint** — and `isCheckpoint` fired every
*second* body:

```
isCheckpoint(chaptersCleared) => chaptersCleared > 0 && chaptersCleared % 2 === 0
```

So clearing the Moon banked nothing. M24 then closed the hangar and the loadout outside that same
window, which turned a one-body delay into a wall: two bodies in, with a full haul sitting in the run
and no screen that would take it.

**Every body is a supply stop now.** Verified live: a run carrying 900 transmitted + 400 cargo
salvage, 250 data, 2 cores and 6 ore banked all of it on clearing the Moon, the haul reset to zero,
and a gear purchase then went through — 1300 → 980 salvage, ilmenite 60 → 20, gear 1 → 2. With the
window shut the same purchase is refused.

Worth keeping: the refusal that looked like a second bug was correct. Buying gear with the wrong
material named exactly what was missing ("Needs 40 more Ilmenite alloy stock"), which is M10's
refusal rule doing its job.

### The ladder

| | before | after |
| --- | --- | --- |
| progression | two-card forecast, tier-gated, seeded | **Moon → Mars → Europa, fixed** |
| after a body | pick one of two offered bodies | **replay any cleared body, or take the next** |
| supply stop | every second body | **every body** |
| completion | five sectors | **every body on the ladder cleared** |
| on death | back to a menu with progress intact | **back to the Moon** |

The choice that remains is the one worth having: at every window you can go back to ground you have
already cleared and farm it for the hangar, or press on. Going back is known, safe and pays less;
going on is the other thing. That is a decision about risk and money, which two forecast cards never
were.

Cards are laid out with flex-wrap and centred justification rather than a fixed two-column grid, so
one card sits in the middle and three sit evenly. Three cards at a 300 px basis wrapped and pushed
Europa below the fold at 800 px wide; the basis is 200 px with a 320 px cap now, which fits three on
one row and still fills the width when there are two.

### The expedition now ends where it is won

Completion was decided in the route handler, so clearing Europa dropped the player onto three
"replay to farm" cards with no next body, and the win only fired once one of them was clicked. It is
decided in `main.js` on the frame the last body is cleared. By the time the route screen is
reachable there is always somewhere left to go.

### What did not move

Both fixtures byte-identical again. Nothing here touches the simulation — it is banking cadence,
screen composition and run bookkeeping.

### Left as a question, not a decision

`TIERS`, `eligibleBodies`, `routeOffers`, `MIN_OFFERS` and `SECTORS` are M9's discovery-tier
machinery and are now **called by nothing outside `route.js`**. They are marked as unwired rather
than deleted, because the question they answer is still open: when the remaining seven bodies are
authored, do they join `PLANET_ORDER` or come back as a tiered choice after the ladder? That is a
design call. Until it is made this is dead code with passing tests — the exact state the M11 note
warns about.

---

## M25b — pay before you open the shop (2026-08-20)

Tom cleared the Moon, opened the hangar, and it read **0 salvage**. His playtest log header, copied
minutes later, read `banked salvage 300 · data 112`. Both were true, and the gap between them is the
bug.

### The order was inverted

M25 made every body a supply stop, but the banking itself still lived in the **route handler** — the
code that runs when a card is clicked, which is when the player *leaves* the stop. So the sequence
was:

1. clear a body → checkpoint screen opens, hangar and loadout unlocked
2. player spends... nothing. `meta.banked` is still empty; the haul is still in `run.haul`
3. player gives up, clicks the next body
4. **now** the haul is banked

The money arrived immediately after the only window in which it could be spent. M25 fixed *when the
window opens*; it did not fix *when the money lands*, and the second bug was hidden by the first.

Banking happens on the way **in** now, in `main.js`, before `setState('checkpoint')`. Proved at
runtime by flying the last Moon mission to a landing:

| at the moment the checkpoint screen opens | |
| --- | ---: |
| `state` | `checkpoint` |
| `loadoutWindow` | `true` |
| banked salvage | **994** |
| banked data | **197** |
| `run.haul` | **emptied** |

...and the hangar screen then reads `994 salvage · 197 data · 1 cores`, with a gear purchase taking
it to 674 and gear level 1 → 2. That is the exact screen from Tom's report, working.

### Three faults found alongside it

- **the log was dropping its machine count.** `summary()` has no `alive` key — it is `total` — so
  `machines=` was `undefined` and the flat-value filter dropped the line silently. Every
  `mission-start` after moon-1 was missing it, which is visible in Tom's log and is why moon-1 is the
  only mission that reports a number.
- **`bankHaul` already existed in `economy.js`.** The bundler's duplicate-declaration guard caught
  the collision on the first build — the bundle is one scope, and this is the guard's fifth catch.
  Renamed `settleAndBank`.
- **the run-lost screen was reading out two numbers it had just zeroed.** It promised "what you
  transmitted is still yours" above BANKED SALVAGE and BANKED RESEARCH, both of which `wipeForDeath`
  empties on the way past. It now says what the run actually cost and lists what the hangar kept,
  and its only exit is back to the start screen.

### A dead overlay is no longer possible

The toast's 3.2 s timer re-renders whatever state is current when it expires, and several screens
read `g.level`. The settle timers guard against exactly this with `g.token`; the toast timer never
did, and a `brief` screen with a null level threw during scripted testing.

Rather than add a fourth guard, `renderOverlay` now falls back to the menu when a screen cannot
render — the same rule the save loader follows, that the game must never present a blank screen
because of one bad value. It is **logged, not swallowed**: `screen-failed screen=brief error=...`
appears in the playtest log, so this hides nothing from a test session.

### From Tom's log, not yet acted on

The Moon is expensive now. Across his two runs he lost **four landers to enemy fire on moon-3, -4
and -5**, each to two hits about thirty seconds apart, and the first run ended on moon-5 without
clearing the chapter. A cleared Moon paid 300 salvage; the cheapest hangar level costs 320. Both are
the M24 lethality and the stale M15-era budgets meeting on the introductory body. Recorded as
measurement, not changed — the damage figure is Tom's, and the budgets are a separate decision.

---

## M26 — the Moon stopped feeling random (2026-08-20)

Tom, after several runs: "terrain on moon does not feel random anymore. why is the shape of
environment always the same. or am I mistaken."

Not mistaken, and not a bug. Measured across four seeds, moon-1's heightmap hash, pads, entry side
and boulder count all change — and its archetype is `crater` every time, because `missions.js`
hardcodes one archetype per authored mission. Fifteen missions, fifteen permanent silhouettes.

It only became a problem when **M25 made the campaign a fixed ladder**. Before that you routed
between ten bodies; now you replay these same fifteen maps every run, forever. `generateChapter` has
dealt shapes from the body's palette since M9 — the authored chapters, the only ones on the ladder,
never did.

### What changed

`chapterFor` rebuilds an authored chapter per run and deals fresh shapes to its **unpinned**
missions. Pinned means named for its shape (THE CRATER, THE TRENCH, THE CANYON, THE CREVASSE) or a
**cave** — europa-2 and europa-4 drop a roof over a canyon corridor, and that roof over dunes is not
a variation, it is a geometry the validator has never seen.

| distinct chapter layouts | before | after |
| --- | ---: | ---: |
| Moon | **1** | **24** |
| Mars | **1** | **24** |
| Europa | **1** | **24** |

The module-level `MOON_LEVELS` / `MARS_LEVELS` / `EUROPA_LEVELS` are untouched, which is why both
fixtures and every sweep still measure exactly what they measured before.

### Three things the measurement forced

- **Deal from the palette minus the pinned shapes.** Dealing from the whole palette scored better
  per slot and read worse: Europa came out basin/canyon/mesa/canyon/**canyon**, three canyons in
  five, a duller chapter than the fixed shapes it replaced.
- **The pool is the palette *plus* what the content already wears.** Europa's palette is
  basin/canyon/mesa, but THE FLOES is authored as a caldera and RADIATION PASS as a ridge. Dealing
  from the palette alone would have quietly retired two shapes the body demonstrably uses — and
  Europa's double ridges are the most recognisable landform on the real moon.
- **`mulberry32`'s first output correlates across nearby seeds.** A two-item pool rides entirely on
  that first value, and Europa dealt an identical chapter on every seed tried until four draws were
  discarded. Anything reading only one or two numbers from a fresh `makeRng` wants a warm-up.

`LUNA.terrainPalette` gained `basin` — a lunar mare *is* an impact basin, and without it the Moon had
only three unpinned shapes to deal from, capping it at 6 layouts instead of 24.

---

## M27 — the ten-body ladder (2026-08-20)

The blocker `docs/PROGRESSION.md` was written for: M25 cut the campaign to Moon/Mars/Europa, every
hangar level costs salvage **plus a material only one body produces**, and seven of those ten bodies
stopped being reachable. This puts them back — as a fixed, difficulty-sorted ladder rather than a
choice, per Tom's four decisions.

### The ladder

| # | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| body | Moon | Europa | Titan | Mars | Enceladus | Ganymede | Io | Mercury | Pluto | Venus |
| gravity m/s² | 4.67 | 4.11 | 4.47 | 7.06 | 1.40 | 4.38 | 4.92 | 7.19 | 3.12 | 10.48 |

The order never varies between runs, every run starts at the Moon, and a cleared body cannot be
re-flown. **The inverted ramp is fixed for free**: Europa was the finale with the weakest gravity in
the game and is now the body that teaches ice at position 2, and Venus — heaviest, dense drag — is
the wall to end on.

Worth recording: the `DIFFICULTY` table in `route.js` predates the ladder and **agrees with it**.
Read in `PLANET_ORDER` it is non-decreasing, 1 at the Moon and 5 at Venus, which is a good sign that
the order Tom chose and the difficulty recorded in M9 were measuring the same thing.

### The hangar, before and after

This is the headline. Same costs, same materials, same "go there to build this" gate — the tracks
open because the bodies are on the route, not because anything was repointed.

| track | M25 ceiling | M27 ceiling |
| --- | --- | --- |
| Landing gear | L4 | L4 |
| Engine & tanks | L3 — blocked by Mercury | **L4** |
| Attitude thrusters | L2 — blocked by Titan | **L4** |
| Hull | L2 — blocked by Venus | **L4** |
| Sensors | **L1 — unbuyable at all** | **L4** |

The refusals now name a body the player is going to visit. Measured live at the first supply stop:
*"Needs 40 more Conductive ice salts"* (Europa, body 2), *"Needs 45 more Iron-oxide ceramic"* (Mars,
body 4), *"Needs 35 more Silica nanograins"* (Enceladus, body 5).

### ...and the ordering problem M28 inherits, now as numbers

Reachable is not well-ordered. The body each level's material first becomes available on:

| track | L2 | L3 | L4 |
| --- | ---: | ---: | ---: |
| Landing gear | body 1 | body 2 | body 4 |
| Engine & tanks | body 1 | body 4 | body 8 |
| Attitude thrusters | body 1 | body 3 | body 6 |
| **Hull** | **body 4** | **body 10** | **body 10** |
| **Sensors** | **body 5** | body 6 | body 9 |

Against M28's rule (L2 from bodies 1–3, L3 from 3–6, L4 from 6–10, Hull's L2 earlier than Mars):
three tracks already comply, **Hull and Sensors do not**. Hull is the one that matters, because it
is the track that answers M24's two-shot machines and both its upper levels sit on the last body of
the run.

### Shuttles attrit

`+1` per body cleared, capped at 3 — not a restore to full. The `+1` was already there; one line
later at the checkpoint `g.lives = g.run.maxShuttles` overwrote it, which made the `+1` dead code
and every supply stop a full restore. Over three bodies that barely showed. Over ten it is thirty
lives.

Proved live, losing two landers on the Moon on purpose and then clearing it:

```
run begins with 3 shuttles
  deliberate crash: lives=2
  deliberate crash: lives=1
  moon-1..moon-4 landed, lives=1
  moon-5 landed -> state=checkpoint lives=2
AT THE SUPPLY STOP: 2/3   (a full restore would read 3)
```

### The route window: one card, and a trail

`routeChoices` returns **only the next body**, which is what enforces "no replay" — `route:N` indexes
that array, so there is no index a cleared body can be reached through. `actions.js` refuses a
non-`isNext` card as well, against a stale `g.routeOffers` left on a previous screen.

Ten route cards would have been a wall of which nine were unclickable, which is a menu that lies. The
ladder behind the player is a **non-interactive trail** instead: ten rungs, cleared / next / ahead,
which fits on one row at 800 px and wraps rather than scrolls, because the end of the ladder is the
point. Verified live at nine cleared:

```
d:THE MOON d:EUROPA d:TITAN d:MARS d:ENCELADUS d:GANYMEDE d:IO d:MERCURY d:PLUTO n:VENUS
offers = ["VENUS(next)"]
```

...and clearing Venus fired `expedition-complete`, released the run and set `gameCompleted`.

### The forecast saturated, exactly the way M24's visibility did

`difficulty` and `enemyIntensity` were both bumped by the sector. The sector ran to 3 under M25 and
runs to **10** now, so both pinned:

| | M25 range (3 bodies) | at 10 bodies, before | after |
| --- | --- | --- | --- |
| difficulty | 1–3 | **5 for bodies 5–10** | 1–5, non-decreasing |
| resistance | light–heavy | **"heavy" for bodies 4–10** | measured per body |

Six of ten cards printed an identical forecast. That is the M24 lesson repeating — a formula that
saturates destroys the ordering the content was authored with — and the fix is the same shape.
Difficulty drops the sector term, because on a fixed ladder **the sector is the position and the
position is already sorted by difficulty**, so adding both counts one axis twice. Resistance is read
off the chapter the player will actually fly (`peakMachines`), which is the honest number.

**And reading it honestly immediately exposed what the saturated "heavy" was hiding:**

```
machines down the ladder: lun 4 · eur 3 · tit 3 · mar 5 · enc 0 · gan 3 · io 3 · mer 3 · plu 3 · ven 3
```

The machine count barely moves, and where it moves it moves the wrong way. Every survey body caps at
3 because `generateChapter`'s budget is `min(3, ...)`, while the authored introductory Moon fields 4
and Mars fields 5. **Enceladus, at position 5, has no `eligibleEnemySets` at all** — a body with
nothing hostile on it, halfway down the ladder. Printed as a measurement in `route-tests.js` rather
than asserted: it is an M28 balance finding and an M29 content one, not a formula bug.

### Two faults the validator found once it flew where the ladder goes

The sweep used to fly generated chapters at sectors 1 and 3, six seeds. On the ladder the sector
*is* the position, so it flies each body at the sector it actually occupies, over the full 20.

- **The generator was producing missions its own validator rejects.** The prize pad narrows with the
  mission and again with the sector's depth: at depth 2 — sector 5 and beyond — mission 5 asked for
  a 50 px pad against a 56 px stance. M25's three-body ladder never reached sector 5 and this sweep
  never looked there, so **the last five bodies of the ladder each generated one impossible mission
  and nothing said so**. Floored at `VALIDATION.minPadWidth + 8`, read from the validator so the two
  cannot drift, and read *inside* the function per the M15 rule. The margin is a terrain cell: a pad
  is carved to whole cells (~7 px), so a request of exactly the minimum quantises down through it —
  measured, 60 requested carves to 54.7, 62 carves to 61.5.
- **The survey block gated on flight, against the file's own doctrine.** `assess()` says it plainly:
  structural problems fail the sweep, flight problems are reported but never treated as proof a
  mission is impossible. The survey block, written in M9, hard-failed when the pilot never reached a
  pad. At 20 seeds Venus — the heaviest body in the game, flown by a pilot with a known weakness for
  weight and drag — failed on 2 seeds of 20 with geometry sound at 100/100 and every failure a crash
  short of the pad. It warns now, in the same words and the same summary as everywhere else.

After both: **every body structural 100/100 at both sectors.** The flight warnings that remain:

| | never reached | home |
| --- | ---: | ---: |
| Mars s4 (body 4) | 1/100 | 99/100 |
| Mercury s8 (body 8) | 1/100 | 96/100 |
| **Venus s1** | 5/100 | 86/100 |
| **Venus s10 (body 10)** | 6/100 | 87/100 |

Venus is the outlier by a factor of five, and the prize route on it lands 36/100. That is the wall
body behaving like a wall, measured by an instrument that does not dodge — an M28 input, not a
defect.

### The M26 shuffle, re-checked at ten bodies

M26 exists because a fixed ladder means re-flying the same maps every run. Ten bodies makes that
argument stronger, not weaker, so it is measured across the whole ladder now (40 seeds):

```
chapter layouts: lun 20 · eur 18 · tit 36 · mar 20 · enc 37 · gan 36 · io 33 · mer 38 · plu 36 · ven 36
```

The authored bodies sit lower because their pinned missions — named for their shape, or caves — do
not move; that is M26's design, and 18–20 distinct layouts over 40 seeds is consistent with the
~24-layout ceiling it recorded. The survey bodies deal 33–38. `generateChapter` draws a fresh
`rng.int` per mission and did **not** need M26's warm-up, which was checked rather than assumed.

### The supply stop was printing zeroes at a player holding thousands

Found while verifying the new screen, and it is the M25b fault a third time. M25b moved banking to
the way *in* to the checkpoint so the hangar opens on money that is actually there — but the table on
that screen still read `run.haul`, which banking has just emptied. Measured at the first checkpoint
of a run: haul `0/0/0`, `meta.banked` **2,329 salvage**. The one screen where spending is decided
told the player they had nothing.

The stop reports what it banked and what is on hand now; the route screen, which opens before any
banking, still reports the haul it is carrying and what is at risk. Verified: 661 banked at the stop,
2,990 on hand, and a hangar purchase at that window took 3,651 → 3,351 with engine 1 → 2.

### The instrument lied, and it was the hook this time

`__settleNow` did not run the pending settle — it reimplemented the decision, and the copy had gone
stale:

```js
setState(!g.endless && g.levelIndex === LEVELS.length - 1 ? 'victory' : 'result')
```

`LEVELS` is the twelve **classic** missions. On an expedition that sent every landing to the result
screen and silently skipped banking, the blueprint grants and the entire chapter-clear branch. A
scripted five-mission Moon run landed all five and reported `cleared=[]`, `chaptersCleared=0` — which
reads exactly like a broken ladder and was not one. It cost about an hour.

Same class as M23's drifted autopilot copy and M24's assertions that encoded constants rather than
the property behind them: **a second implementation of a rule, quietly falling behind the first.**
Both settle timers go through `settleAfter(ms, work)` now, which holds the pending work, and the hook
runs it early instead of imitating it. Re-verified with the exact script that was misled: it reaches
the checkpoint, and the crash path still walks 3 → 2 → 1 → `expedition-over`.

### The expedition start screen, after Tom looked at it

The first draft reduced the start screen to one plain tile and a row of nine names, on the reasoning
that ten route cards would be a wall of unclickable buttons. Tom's call, with both screens in front
of him: it read like a different game from the supply stop two clicks later.

It deals **the whole ladder as the same card**, five and five — `bodyCardHTML` is one renderer used
by both screens, so a body reads the same on the way in as it does when you arrive. The nine ahead
are `div`s with no action rather than disabled buttons: they are a forecast, not a menu. The panel
goes to 1180 px for this screen alone, because at the standard 880 the cards fall three to a row and
a ten-body ladder becomes four ragged rows.

The trail stays where it earns its place — the supply stop, where the question is how far this run
has got, not what the run is.

### What did not move

**Both fixtures byte-identical.** Nothing in this milestone touches the simulation — it is the run's
shape, the screens, a generated pad floor and a debug hook. The crossing measurement is unchanged at
167/240 (70%), the sanctuary holds 20/20 everywhere, and the encounter audit reports the same
distribution it did at M24.

---

## M28 — the material re-cut and the economy (2026-08-21)

The brief had four items and an instruction: **do the floor check first, before tuning anything.**
Doing it in that order was the whole milestone — two of the four items turned out to be based on
figures that were no longer true, and the floor check found something none of them had named.

### The floor check: M13's anti-frustration floor had not paid out since M24

`DEBRIEF` guarantees that a failed run still transmits 60 salvage and 40 research, so it "always ends
with a decision". M24 made death empty `meta.banked`. The two met:

```
settleHaul on an empty haul pays      60 salvage / 40 data
after bankRun, meta.banked reads      60 salvage / 40 data
after wipeForDeath, meta.banked reads  0 salvage /  0 data
```

The floor was banked and then zeroed **on the next line**. Every run that ended in a loss had ended
with nothing since M24 — and M27 made that far worse by removing replay, because this is now the
only income a run that dies early can leave behind.

The order is the fix: `wipeForDeath(meta, { debrief })` wipes and then credits, so "what a death
costs" stays the answer of one function. Proved at runtime by throwing all three landers away on
moon-1 — the worst run the game allows, zero missions cleared:

| | before | after |
| --- | ---: | ---: |
| banked after the run is lost | 0 / 0 | **60 salvage / 40 research** |
| skill ranks affordable next run | 0 | **1** |

### Two of the brief's four items were already true

**The payout is not an order of magnitude short.** `docs/PROGRESSION.md` said a perfect Moon chapter
pays 300 against a 320 cheapest upgrade and so "buys nothing". Measured across three play profiles —
sloppy is the near pad with mixed grades and no ore, clean is the deep pad every time:

| body | sloppy | normal | clean |
| --- | ---: | ---: | ---: |
| Moon / Mars | 300 | 435 | 563 |
| Europa | 361 | 496 | 603 |
| every survey body | 314 | 469 | 711 |

The cheapest rung is **260**, not 320 — the doc compared against Landing Gear rather than the
cheapest thing on the board. **Every profile on every body clears it**, including the sloppy one,
which is the figure from Tom's own playtest. Nothing was inflated; the number was already right and
the record was stale.

**Hull L2 already buys the third shot.** The doc said "capped at L2 (+12%), 112 hull still dies in
two". It does not: 112 − 50 − 50 = 12, alive, and the third shot kills.

| hull | max | dies on hit |
| --- | ---: | ---: |
| L1 stock | 100 | **2** |
| L2 | 112 | **3** |
| L3 / L4 | 125 / 140 | 3 |

`enemies-tests.js` was asserting this against `Math.ceil(150 / damage)`, and **150 is not a hull any
level produces** — the track runs 100/112/125/140. It encoded a figure rather than the property, the
same fault M24 found in two other assertions in that same file, and it is where the doc's wrong claim
came from. Rewritten to derive the hull from the component table and assert what matters: *the
cheapest hull the player can buy must buy a third shot.* No game change was needed.

### The real blocker was material scale, and no item had named it

Every rung costs salvage plus a body-specific material. Materials are **wiped on death** like every
other banked resource, and each body is visited **once per run**. So a rung is only ever buyable if
one visit can produce its whole material cost. Measured yield per body, per run:

| | sweeping every deposit | clean run | normal run | sloppy run |
| --- | ---: | ---: | ---: | ---: |
| material from one body | ~470 | **~90** | **~50** | **~25** |

The theoretical ceiling is irrelevant: the encounter audit lands a full sweep **33 times in 300**.
Against the realistic 50–90, the old costs:

| rung | wanted | one visit yields |
| --- | ---: | ---: |
| Landing gear L4 | 160 Ilmenite | 90 |
| Engine & tanks L4 | 140 Iron-oxide | 90 |
| Hull L4 | 130 Sulfur-resistant | 107 |
| Attitude thrusters L4 | 120 Hydrocarbon | 107 |
| Sensors L4 | 120 Magnetite | 107 |

**Every single L4 was unbuyable in one run**, and since materials do not survive a death there is no
second run to save up in. The only path to an L4 was to clear all ten bodies — which banks rather
than wipes — and then play again, the rarest outcome in the game. Worse at the track level: the whole
Landing Gear track wanted 40 + 90 + 160 = **290 Ilmenite** out of a single Moon visit.

### The re-cut

Two rules, both now asserted in `components-tests.js` against `PLANET_ORDER` rather than against a
list of bodies, so a change to the ladder fails there rather than quietly nailing a track shut again.

**Ordering** — every track's L2 from bodies 1–3, L3 from 3–6, L4 from 6–10, Hull's L2 before Mars:

| track | L2 | L3 | L4 |
| --- | ---: | ---: | ---: |
| Landing gear | body 1 | body 3 | body 6 |
| Engine & tanks | body 1 | body 4 | body 8 |
| Attitude thrusters | body 2 | body 3 | body 7 |
| Hull | **body 3** | body 4 | body 10 |
| Sensors | **body 2** | body 5 | body 9 |

Hull L2 moved from Mars to Titan and Sensors L2 from Enceladus (body 5) to Europa. What is buyable at
each supply stop:

| after body | before | after |
| --- | --- | --- |
| 1 Moon | gear, engine, rcs | gear, engine |
| 2 Europa | gear, engine, rcs | gear, engine, rcs, sensors |
| **3 Titan** | gear, engine, rcs | **all five** |
| 4 Mars | + hull | all five |
| 5 Enceladus | all five | all five |

**Scale** — no rung asks for more of one material than a normal run's visit produces. Every cost is
now 25–50, against a normal yield of ~50 and a clean one of ~90. Salvage prices are untouched, since
the measurement said they were already right.

What one run leaves behind, permanently — the number the whole ladder model rests on:

| dies after | upgrades bought, before | after |
| --- | ---: | ---: |
| body 1 | 1 | 1 |
| body 2 | 3 | 3 |
| body 3 | 4 | **5** |
| body 5 | 7 | **7** |
| all ten | 8 | **10** of 15 |

### A recommended tier, printed where it can still be acted on

Nothing told the player what the next body expected them to be flying, which is what kept upgrades
feeling optional. `RECOMMENDED_TIER` is a count of upgrade levels fitted above stock, by ladder
position, and it is printed at the supply stop — the only screen where the hangar is open, the
salvage is banked and the choice is still live.

The figures are **measured, not aspirational**: they sit just under what one normal run can fund by
that point. A recommendation the economy cannot pay for is worse than none, because it teaches the
player to ignore it. Verified live at the first stop: *"Recommended lander for EUROPA — 1 upgrade
fitted · you have 0 · 1 short"*, 661 salvage and 59 Ilmenite banked, gear L2 bought for 320 + 30, and
the line flips to *"you have 1"*.

### What this milestone deliberately did not do

**Pad width and machine damage were not retuned against the recommended lander.** That half of the
brief's third item is a difficulty change, and the open question since M24 — *is it hard or is it
unfair?* — is still unanswered, because the only instrument here is an autopilot that does not dodge
and cannot see the screen. Tuning difficulty against an economy that has itself just moved, with no
human data on either, is the exact failure mode this project has recorded twice. It waits on a
playtest.

Also found and fixed: the run-lost screen still told the player *"A body you have already cleared can
be re-flown to pay for the hangar"* — M25 copy that M27 made false.

### What did not move

**Both fixtures byte-identical.** Nothing here touches the simulation: it is costs, a settlement
order, a printed recommendation and screen copy.

### How to re-measure

```bash
node -e "Promise.all([import('./src/save.js'),import('./src/economy.js')]).then(([S,E])=>{const d=E.settleHaul(E.freshHaul(),{completed:false});console.log('debrief through the wipe:',S.wipeForDeath(S.defaultMeta(),{debrief:d.debrief}).banked);});"
```

```bash
node -e "Promise.all([import('./src/components.js'),import('./src/planets.js'),import('./src/route.js')]).then(([C,P,R])=>{const pos={};R.PLANET_ORDER.forEach((id,i)=>{pos[P.PLANETS[id].rareMaterial]=i+1;});for(const id of C.COMPONENT_IDS){const t=C.COMPONENTS[id];console.log(t.name.padEnd(20)+t.levels.slice(1).map(l=>'body '+Math.max(...Object.keys(l.cost.materials||{}).map(m=>pos[m]||99))).join('  '));}});"
```

---

## M28b — an external review, checked line by line (2026-08-21)

Tom brought a code review from another model with the instruction not to take it on faith. Every
claim below was verified against the code before anything was changed; the ones that did not survive
that check are recorded too, because "which findings were wrong" is the useful half of reading a
review.

### The one that mattered most: every run after a resume flew identical terrain

`resumeExpedition` set `g.forcedSeed = run.seed`. Nothing ever clears `g.forcedSeed` — it is the
*debug* pin behind `?seed=` and `__setSeed` — and `beginExpedition` reads it when choosing a seed for
a **new** run. So resuming an expedition once pinned every later run in the session to that run's
seed. Measured live:

```
two fresh runs, no resume:        462877581 vs 322140684   different (correct)
after resume-run: g.forcedSeed =  322140684
three new runs after one resume:  322140684, 322140684, 322140684
```

This is the M26 complaint — *"terrain on moon does not feel random anymore"* — surviving underneath
M26's own fix, and M27 made it bite harder by making the ladder ten fixed bodies. The line was also
**redundant**: `startLevel` already prefers `g.run.seed` whenever a run is in flight, so it bought
nothing and leaked everything. Deleted. Verified: three runs after a resume now draw three seeds.

### Mars flew at double drag for twenty-two milestones

`forcesFor` pushed `atmosphere` for `level.wind/gust/drag`, then pushed it **again** for the
`'atmosphere'` string in the mission's hazard list. Both instances are built from the same config, so
the force applied twice per step.

Scope, measured rather than assumed — the review said "all five Mars missions", and it is **four**:

| | forces built |
| --- | --- |
| mars-1, mars-3, mars-4, mars-5 | `atmosphere, atmosphere, dust` |
| mars-2 | `atmosphere, windChannels` (declares `windChannels`, never doubled) |

No other body, authored or generated, and no classic level. Flight impact of removing it, autopilot
on the safe route over 20 seeds:

| | before | after |
| --- | ---: | ---: |
| mars-1 | 19/20 | 20/20 |
| mars-3 | 18/20 | 20/20 |
| mars-4 | 19/20 | 20/20 |
| mars-5 | 17/20 | 20/20 |
| mars-2 | 15/20 | 15/20 (untouched) |

So the bug had been making the hardest body harder, and fixing it is a real difficulty change on
hand-authored content that was tuned while it was live. Tom's call, taken with the number in front of
him. **If Mars wants its bite back, the honest way is raising the authored drag, not restoring the
double-apply.**

Both halves shipped: the redundant `'atmosphere'` strings are gone from the four missions, and
`forcesFor` now **dedupes by force id** so that declaring the weather twice is harmless rather than a
physics bug. The guard is the part that matters — a hazard list is authored data.

**The flight fixture moved, and the shape of the move is the containment proof**: 12 differences,
exactly the four affected missions × 3 seeds, with mars-2 and all 23 other missions byte-identical.
Re-recorded. The **physics fixture did not move**, because the classic levels never had the
duplication. The campaign-wide crossing measurement is unchanged at 167/240.

### Abandoning a run was strictly better than losing one, and the floor was farmable

`abandon-run` banked the haul, paid M13's debrief floor, and **never wiped** — where a death pays the
floor and takes the skills, the resources and the opened map:

| | salvage | research | skills |
| --- | ---: | ---: | --- |
| abandon | 560 | 340 | kept |
| death | 60 | 40 | wiped |

And because each run carries a fresh `banked[]` settlement list, the floor paid **every time**: five
start-then-abandon cycles from a clean save banked 300 salvage and 200 research for no risk at all,
and 40 research is the cheapest skill rank. This predates M28 — M28 neither caused it nor fixed it.

Tom's ruling: *ending a run is ending a run*. Abandon goes through the same door as a death now,
arms on the first press like NEW GAME does, and lands on the run-lost screen, which grew a second
sentence for the case where the player called it rather than ran out of shuttles. Verified: 500
salvage / 300 research / 1 skill → **60 / 40 / none**, and five cycles now read `60/40` flat instead
of climbing.

### Real, smaller, all verified and all fixed

- **`settleHaul` rounded kept and lost independently**, so at a half-unit boundary both rounded up and
  the two halves reported more cargo than the run carried (101 → 51 + 51). Kept is rounded, lost is
  derived. Worth noting the review called this latent and it is **live**: `cargoRecovery: 0.25 * r` is
  a real Technician rank, and economy.js's "zero until the Technician tree exists" comment was stale.
- **`firstClear: true` was hardcoded** in the reward call. Harmless inside an expedition, where each
  mission is flown once — but mission select, which `meta.gameCompleted` unlocks, paid first-clear
  research forever. It reads `meta.stats.missionGrades` now, which `recordFlight` writes *after* the
  reward is computed, so the previous state is still there to read.
- `abandon-run` called `saveMeta` and `clearRun` twice each, and banked without syncing `g.score`, so
  a career best could be missed.
- `state.js` called `input.setBindings` twice.
- The victory screen still offered **ENTER ENDLESS**, a mode M24 removed.
- `defaultMeta` carried `power` and `utility` component keys that no component has ever used.
- `RECOMMENDED_TIER`'s comment quoted the *affordable* curve (1, 3, 5) as though it were the table
  (1, 2, 3). The table is right and deliberately conservative; the comment was wrong. **That one was
  M28's own error**, found by the review.

### Where the review was wrong, and why it is worth writing down

- **"All five Mars missions"** — four. mars-2 declares `windChannels` and was never doubled.
- **"Enceladus builds `plumes({})` with no vents: a no-op."** Right conclusion, wrong mechanism, and
  the mechanism is the useful part: the hazard is spelled `'plume'` and the builder key is `'plumes'`,
  so **it is never built at all**. M29 cannot switch Enceladus's plumes on by authoring vents alone —
  the name has to match first.
- **Its income figures** (90–210 salvage per mission, 10–14k per full run) disagree with M28's
  measurement (~60–142 per mission, ~3–7k per run), and M28's has a reproducible script behind it.
  The conclusion it drew from them — that the economy is sensibly tuned — happens to agree anyway.
- **Tech Cores have no sink.** True, verified: nothing in `components.js`, `skills.js` or
  `modules.js` costs a core. Left alone deliberately — pricing something in cores is a design
  decision, not a bug fix.

### What did not move

The **physics fixture**, every non-Mars mission in the flight fixture, the sanctuary guarantee
(20/20 everywhere) and the campaign crossing figure (167/240).

---

## M29a — Tom's playtest, acted on (2026-08-21)

The first human run since M24, and the first ever on the ten-body ladder: four bodies cleared in one
sitting, 23 attempts, 20 landings, 2 crashes, ~29 minutes. Everything below comes from that log or
from the notes he wrote against it.

### What the log said before he did

Read on its own, the trace already carried three findings:

| | Moon | Europa | Titan | Mars |
| --- | ---: | ---: | ---: | ---: |
| flight time | 283 s | 247 s | 214 s | **120 s** |
| crashes | **2** | 0 | 0 | 0 |
| banked salvage | 850 | 1496 | 1353 | 580 |

- **The ramp is inverted in the hand.** Both crashes are on the Moon, body 1, flown stock and
  *unarmed* — the weapon blueprint only arrives after a body has shot at you. Bodies 2, 3 and 4 cost
  nothing at all.
- **Mars took two minutes.** mars-5 was flown in **10 seconds**, landing with 129 of 138 fuel. That is
  the body M28b just took off double drag, and it is now the fastest on the ladder.
- **Half the session was menus.** The four supply stops took 65 s, 272 s, 461 s and 14 s — 13.5
  minutes against 15.5 minutes of flying.

### The payout was three to four times what M28 modelled

M28 modelled a body clear at 300–711 salvage. Tom banked **850 / 1496 / 1353 / 580**, averaging
1,070, because the model counted neither the kill bonus (34 a machine, and he killed 14) nor ore
carried home. Against a cheapest rung of 260, one body clear bought three or four upgrades.

His call: *"Receive 70% less salvage ... a level 3-4 upgrade should cost at least 5 good body runs in
one expedition (since these upgrades are permanent)"*. Both halves shipped.

**`SALVAGE_SCALE = 0.3`, applied once**, at the point every source has been summed — computed pay,
ore carried home, kill bonus, objective. Four separate multipliers would have been four things to
forget, and the results screen reads the same figure that is banked.

| | before | after |
| --- | ---: | ---: |
| a good body clear | ~1,070 | **~321** |
| L2 rung | 260–340 | unchanged — **~1 body clear** |
| L3 rung | 640–800 | **1,650–1,750 · ~5 clears** |
| L4 rung | 1,400–1,700 | **2,500–3,050 · ~8–9 clears** |

Materials are untouched, per *"materials seem fine but on the salvage side"*. The M28 floor still
holds — a run that dies at body 1 still buys one upgrade, at body 5 five, at body 10 six — so the
tail got much longer without the loop deadlocking.

### Six of the ten bodies were wearing another body's name

This was the sharpest thing in the notes, and it is one field. `PlanetDefinition.world` picks a
palette, and the palette carries **the name drawn over the mission**:

| body | announced itself as |
| --- | --- |
| Mercury, Io, Venus | **MARS** |
| Enceladus, Ganymede, Pluto | **EUROPA** |

Which is exactly what he reported — *"when I click mercury, levels for mars come"*, *"when I click
Pluto, levels for Europa come with visibility in light blue"*. The terrain underneath was always the
right body's; the label and the paint were not. All six have their own world and accent now, and
`route-tests.js` asserts no two bodies share either, and that **no body draws a name belonging to a
different body** — not "the world name equals the display name", because the Moon is deliberately
THE MOON on a world called LUNA.

**And Enceladus "looks like the moon"** was the second half of the same note: it, Ganymede and Pluto
are ice bodies that generated rock, flagged in `docs/ARCHITECTURE.md` since M20. They carry
`terrainStyle: 'ice'` now, with friction to match — Ganymede 0.5, Pluto 0.25, against Europa's 0.07 —
because ice that is not slippery is a texture rather than a hazard.

### Radiation had no shape, so it could not be learned

*"Radiation does 3x more damage and is not visible on the screen (radiation should only be in high
altitude — around half of the top screen)"*. Three asks, one cause: the only expression of the hazard
was a rising gauge, so nothing on screen said where it was or which way to go.

- **Damage ×3**: `hullPerSecond` 2.5 → **7.5**. At 2.5 it was survivable by ignoring it, which made
  both the terrain shadow and the Ray Shield optional.
- **It lives in the sky**: exposure only accrues above `minAltitude` 420 px, ramping to full over 160
  px. Measured, parked for 30 s: at 200/380/460 px altitude, 0% exposure and full hull; at 600 px and
  above, 51% and 100 → **84.1 hull**. Getting low is now the answer, which makes the sweep a descent
  problem rather than a number.
- **It is drawn**: `drawRadiation` puts a glow and a moving dashed edge at the belt's lower boundary,
  following the terrain contour, fading with the sweep's own envelope. The gradient is anchored on
  the *edge* rather than the top of the screen — draw it from the top and the boundary is the
  faintest part of it, and the boundary is the only thing the player needs.

The `RADIATION.floor` still stands: it softens you, it never finishes you.

### Titan had a sandstorm in its flavour text and none in its physics

*"Visibility is still too high on planets like on titan with sandstorm / wind."* Titan's hazards were
`['wind', 'glide']` and Venus's `['drag', 'acid', 'downdraft']` — **not one of those five has a
builder**, so both bodies flew at a flat planet visibility with nothing moving. Both have a real dust
front now.

And the second half: *"there should be random phases with close to zero visibility for 3-5 seconds"*.
The slow front is readable by design — you can watch it coming and wait it out — so the squall is a
separate mechanic layered on it. One roll per 9 s slot, most slots empty, 3.5–6 s nominal with a
half-second ramp at each end so the fully blind stretch lands on 3–5 s.

It cannot use `Math.random()`: forces are pure functions of `(ship, level, t)`, which is what makes a
seed reproduce a flight. It hashes the time slot instead — unpredictable to the player, identical on
every replay, and salted per mission so two missions do not squall in lockstep. All asserted.

| | blackouts / 180 s | length | blind |
| --- | ---: | --- | ---: |
| Titan | 3 | 3.1 / 3.4 / 5.0 s | 6% |
| Venus | 5 | 3.0–4.3 s | 10% |

**The first tuning was wrong and the measurement caught it**: Titan's front floor was set to 0.3, and
`obscure` (v³) takes that to the 0.05 clamp — so the front *was* a blackout and the squall added
nothing, at 43% blind. The front is a haze you can fly in (0.62) and the squall is the blackout.

### Smaller notes

- **The hangar shows salvage only.** *"Remove the display number for data"* — and cores went with it,
  because they are the other thing that screen cannot spend, and showing them is what invites the
  next question.
- **"How do you unlock blueprints?"** Nothing said. The loadout screen now does: found, not bought —
  clearing your first body hands one over, surviving a mission that shot at you hands over the
  weapon, and a lost expedition never takes them back.
- **"What do cores do?"** Nothing, still. Verified again: no component, skill or module costs one.
  Left as a design decision rather than invented.
- **Clearing all ten bodies awards a diamond.** Kept on death like the hangar, spent on nothing by
  design — the hook for the ship cosmetics Tom wants later. The completion screen was the plainest in
  the game for the rarest event in it; it has the stone, the ten bodies rolled out in their own
  colours, and one way out.

### What did not move

**Both fixtures byte-identical.** The salvage scale, the palettes, the belt and the squalls are all
either presentation or economy; the flight model is untouched. Every mission family still validates
and every armed mission still keeps its sanctuary.

### Left for Tom

- **Mars is now the easiest body on the ladder**, two milestones after being the hardest. M28b took
  the double drag off and this log is what that looks like in the hand. The fix is one authored
  number, not code.
- **The Moon is where the run dies**, because it is flown stock and unarmed. Whether the first body
  should hand over a weapon earlier is a design call.
- **Pluto's "darkness" renders as coloured fog**, because it is implemented as low `visibility` and
  the renderer draws visibility as dust. It reads as haze rather than night.
- **Cores.**

---

## M29 — the survey bodies become content (2026-08-21)

Seven bodies were systemically complete and narratively empty: 35 missions sharing five names and
five briefs, all 35 with `optionalObjective: null`, no set pieces, and a list of hazards that were
words. This is the milestone that authored them — plus the four design calls Tom answered from his
M29a playtest.

**The audit came first, and it found more than the brief listed.**

### Four bodies had no working hazard at all

`forcesFor` looks a hazard's name up in `BUILDERS`, and a miss is completely silent: the force is
never built and the body flies with nothing, while its route card, its summary and its briefing all
describe weather. Audited across every planet and every authored mission:

| declared | wanted | state before M29 |
| --- | --- | --- |
| `heat` (Mercury, Io) | `thermal` | **never built** |
| `cold` (Pluto) | `cryo` | **never built** |
| `plume` (Enceladus) | `plumes` | **never built** |
| `magnetic`, `falseRadar` (Ganymede) | — | no builder existed |
| `acid`, `downdraft` (Venus) | — | no builder existed |
| `eruption` (Io) | — | no builder existed |
| `glide` (Titan) | — | no builder existed |
| `wind` (Mars, Titan), `drag` (Venus) | `atmosphere` | built anyway, via the wind/gust/drag fields |
| `ice` (Europa) | none — `surfaceFriction` | correct; not a force |

So **Mercury, Io, Enceladus and Ganymede had no hazard whatsoever**, at positions 5 to 8 of a ladder
every run walks. M28b caught the `plume` spelling from an external review. **`heat` and `cold` had
never been noticed, and both `ROADMAP_STATUS.md` and `docs/ARCHITECTURE.md` listed them as working** —
the "a document is an instrument too, and it drifts" lesson, for the third time.

The fix is aliases in `BUILDERS`, but the durable part is the test: `forces-tests.js` now asserts
that **every hazard string any planet or mission declares resolves to a builder**, with `ice` as the
one declared exception. A property, not a list of known-good names.

### Heat, cold, acid and charge: a consequence each, deliberately different

Three status channels existed and did nothing but fill a gauge, which is the fault M29a named on
radiation. Each now costs something different, so they are not one hazard in three costumes:

| channel | body | what it costs |
| --- | --- | --- |
| heat | Mercury, Io | **thrust** — the engine derates past 60%, and recovers when you stop burning |
| cold | Pluto | **control** — the attitude thrusters stiffen to 45% authority past 55% |
| corrosion | Venus | **hull**, thickest at the deck, with the M18 floor at 50% |
| charge | Ganymede | a torque, and a downward pull past 50% |

Radiation eats hull *high* and in sweeps; acid eats hull *low* and never stops. The two sit at
opposite ends of the ladder on purpose, and they teach opposite instincts.

### The first tuning reproduced M18's radiation fault exactly

Measured before shipping, and it was wrong:

```
mercury-1  heat reaches 55% at 3.2s
mercury-5  heat reaches 55% at 2.5s
pluto-4    cold reaches 55% at 6.9s
```

M18 slowed radiation for this precise reason — *"it went clean to saturated in three seconds, which
left no room to reach a shadow"* — and the first pass at four new hazards walked straight back into
it. Retuned against mission length (25–45 s), and asserted, so it cannot drift back:

| | bites at | at 90 s |
| --- | ---: | ---: |
| mercury-1 | never | 36% |
| mercury-5 | 19 s | 96% |
| io-5 | 27 s | 96% |
| pluto-1 | 44 s | 100% |
| pluto-5 | 28 s | 100% |
| venus-1 | 41 s | 99% |
| venus-5 | 25 s | 100% |

Mission 1 of a body barely bites; mission 5 bites mid-crossing. `forces-tests.js` asserts a 10 s
floor on every authored mission that declares heat, cold or acid.

### The sanctuary rule now covers weather, and measuring is what found it

M29 put hazards in **places** for the first time — vents, fountains, sinking air, anomalies. The
first Enceladus tuning had a vent sitting over the safe pad:

| vent force | radius | way home | prize route |
| ---: | ---: | ---: | ---: |
| 15 | 200 | 11/20 | 19/20 |
| 12 | 200 | 13/20 | 19/20 |
| 8 | 200 | 13/20 | 19/20 |
| 12 | 110 | 16/20 | 19/20 |

**Force barely moved it and the prize route never moved at all**, which is what said the problem was
*where* the vent was, not how hard it blew. A machine may not reach the safe pad; neither may the
weather, for the same reason and by the same rule. `plumes`, `downdraft` and `eruption` all call
`offSanctuary`, which reads `sanctuaryPad` from `enemies.js` rather than reimplementing "the nearest
zone" — one rule, one implementation. Enceladus 2 went **11/20 → 20/20**.

### Enceladus: the count did not matter, the type decided everything

The body has 7.3 px/s² of gravity, so a lander cannot decelerate, and it had `eligibleEnemySets: []`
— nothing hostile at all, at position 5. Drones were the obvious answer. Measured unarmed over 20
seeds on the way home:

| machines | drones only | turrets only | mixed |
| ---: | ---: | ---: | ---: |
| 2 | 2–5/20 | 17–20/20 | 17–20/20 |
| 3 | 2–5/20 | 17–20/20 | 15–16/20 |
| 4 | 0–4/20 | 17–20/20 | 8–13/20 |

M21's *"a turret is something you fly around, a drone follows you and rams"* in its sharpest form.
Enceladus is a turret body that meets its first drone on mission 4. The chapter now reads
**20/20 · 20/20 · 19/20 · 15/20 · 14/20** under fire, with a peak budget of 4.

### Mars: the authored drag, and a second path nobody had in mind

Tom's call — Mars was the easiest body on the ladder two milestones after being the hardest.
Measured over 5 missions × 20 seeds before choosing:

| drag | way home | prize route | fuel left |
| ---: | ---: | ---: | ---: |
| 0.15 (was) | 95/100 | 76/100 | 58.8 |
| 0.20 | 95/100 | 71/100 | 56.6 |
| **0.24** | **94/100** | **62/100** | **53.9** |
| 0.28 | 93/100 | 61/100 | 49.3 |
| 0.32 | 92/100 | 49/100 | 45.7 |

The way home is nearly free and the prize route carries the whole cost — the shape M19 and M20 both
found for a difficulty knob. **0.24 and not 0.30**: 0.30 is what the double-apply was worth, and Mars
sits at position 4 of 10, so restoring the accidental figure would re-invert the ramp M27 sorted the
ladder to fix.

**And it caught a second-path bug on the way.** `mars-2 THE CANYON` fell **15/20 → 8/20**, and it is
the one Mars mission that does *not* use the `atmosphere` force — it declares `windChannels`, which
is why M28b's double-drag fix left it alone. But `windChannels` reads `level.drag` for how hard a
band couples to the hull, so raising the *planet's* drag reached it anyway. That is the same shape as
the double-apply itself: an authored number arriving at the physics by a route the author was not
thinking about. `mars-2` pins `drag: 0.15` and is back to exactly 15/20 and 13/20.

**The flight fixture's move is the containment proof**: 12 differences, exactly mars-1/-3/-4/-5 × 3
seeds — the four missions that use `atmosphere` — with mars-2 and all 22 other pre-existing missions
byte-identical, plus 35 new entries. **The physics fixture did not move.**

### The other three design calls

**The weapon is fitted, not just filed.** Both of Tom's crashes were on body 1, flown unarmed. The
blueprint timing was never the problem — M16 hands the weapon over the moment a mission shoots at
you, which on the Moon is after moon-2. The **loadout** was: it is closed for the length of an
expedition, so the weapon recovered on moon-2 could not be equipped until the Moon was already
cleared. It now fills an **empty** active slot on recovery, so moon-3 is the first mission flown
armed. It never overwrites a module the player chose.

**Tech Cores buy the L3 and L4 rungs.** A core drops on a PERFECT landing on a small pad and nowhere
else, so salvage measures how much you flew, materials measure where you went, and a core measures
how well you put the lander down. Cores wipe on death, so M28's affordability rule applies unchanged
— measured over the full ladder, cores banked by ladder position:

| profile | body 3 | body 6 | body 8 | body 10 |
| --- | ---: | ---: | ---: | ---: |
| sloppy | 1 | 3 | 4 | 5 |
| normal | 3.5 | 8 | 11.5 | 16 |
| clean | 10 | 20 | 29 | 40 |

L3 gates from body 3 and costs 3; L4 gates from body 6 and costs 6. L2 costs no cores, so M28's
income floor is untouched. Cores are back on the hangar screen — M29a took them off *because* they
could not be spent, and that reason is gone.

**Darkness is not fog.** Pluto was `visibility: 0.45`, and the renderer draws visibility as dust, so
the darkest body in the game rendered as pale blue haze. Darkness is its own channel: dust tints
toward the body's dust colour and lightens, darkness subtracts toward black and closes a sight
radius. Pluto's air is now perfectly clear (`visibility: 1`) and its night ramps 0.62 → 0.72 → 0.86
across the chapter. Beacons and ore still draw above both, so blind is never targetless (M18).

### What the ladder looks like now

```
machines down the ladder:  lun 4 · eur 3 · tit 3 · mar 5 · enc 4 · gan 5 · io 5 · mer 5 · plu 4 · ven 5
                  (M27):   lun 4 · eur 3 · tit 3 · mar 5 · enc 0 · gan 3 · io 3 · mer 3 · plu 3 · ven 3
```

| body | forces actually built | set piece |
| --- | --- | --- |
| Titan | atmosphere, glide, dust | `titan-5` THE LONG GLIDE — a crossing you cannot afford to power |
| Enceladus | plumes | `enceladus-5` THE GEYSER FIELD — five vents, the cheapest way to move |
| Ganymede | magnetic, falseRadar | `ganymede-5` THE BLIND CROSSING — one wide anomaly over the middle |
| Io | thermal, eruption | `io-5` THE FOUNTAIN — four telegraphed vents on different clocks |
| Mercury | thermal | `mercury-5` THE TERMINATOR — heat as geography |
| Pluto | cryo, darkness | `pluto-4` UNDER THE PLAIN — the only cave outside Europa |
| Venus | atmosphere, acid, dust, downdraft | `venus-5` THE DESCENT — three sinking columns and acid |

50 authored missions, 50 distinct names, 50 distinct briefs, **zero `optionalObjective: null`**, and
26 objectives all of which are used by content.

### Chapter variety, and what the M26 test caught

The seven new chapters first dealt **4 layouts over 40 seeds** — the palettes are three shapes deep,
and one pinned shape leaves a pool of two. `route-tests.js` asserts a floor of ten and failed, which
is exactly the "the Moon stopped feeling random" complaint waiting on seven more bodies. Palettes
widened to six, and `pinShape` re-cut to the M26 rule — pin only where the *name* would lie:

```
chapter layouts over 40 seeds:
  lun 20 · eur 18 · tit 34 · mar 20 · enc 36 · gan 32 · io 34 · mer 32 · plu 34 · ven 34
```

### The full sweep

| | |
| --- | --- |
| structural, all 50 authored missions × 20 seeds | **valid on every seed** |
| sanctuary, every armed mission | **20/20 everywhere** |
| placement fill | 90–100% of every budget |
| machines that can engage at once | 0: 62.3% · 1: 26.1% · 2: 10.1% · 3: 1.5% · 4: 0.1% (was 62.0/26.5/10.2/1.2/0.1) |
| unarmed crossing, campaign-wide | **643/800 (80%)**, against M24's 167/240 (70%) on 12 missions |
| physics fixture | **unchanged** |
| flight fixture | 12 deliberate Mars differences + 35 new missions, re-recorded |

The crossing figure rose because the new bodies are mostly turret bodies, which are more survivable
than drone bodies — read it as a wider sample, not as the game getting easier. It is still a floor
measured by a pilot with no evasive logic.

### Flight warnings worth knowing

- **`pluto-4 UNDER THE PLAIN` lands 16/20 on the way home**, and it is in family rather than broken:
  the two caves that have shipped since M7 and M20 measure 18/20 (`europa-2`) and 17/20 (`europa-4`)
  at the same seed count. Knob sweeps moved it not at all — clearance, cave mouth, hazards and +20
  fuel all returned 16/20 — which says it is the single-pad cave geometry against a pilot with no
  terrain lookahead, the weakness recorded since M19.
- **`venus-3 THE SINK` is the weakest new mission at 16/20 home.** Venus is the wall and was already
  the outlier before M29 (86/100 home as a survey chapter).
- **`titan-5 THE LONG GLIDE` takes the prize on 0–2/20.** It is authored to be flown on the air and
  the test pilot has no glide planning at all, so this measures the instrument. Its way home is 20/20.

### What no test here can measure

`falseRadar` moves the **readout and nothing else** — asserted by flying the same 30 seconds with and
without it and comparing position, velocity and spin to six decimal places. That is the
accessibility rule taken from the other side: there, presentation may never reach the simulation;
here, a hazard may never leave it. It also means **no autopilot in this project can measure whether
Ganymede is any good**, the same blind spot visibility has had since M24. Darkness is in the same
position. Both shipped on screenshots and numbers.

### M29b — `generateChapter` deleted

Tom's call, taken after M29 shipped. The generator produced a five-mission survey chapter for any
body without authored content, and it earned its keep: it is what let the ladder go from three bodies
to ten in M27 without ten chapters having to exist first. M29 authored all ten, which left it
reachable by nothing a player flies.

**What it was really providing was an invariant**, not a code path: *every body on the ladder has
something to fly*. Deleting a fallback without replacing that is how a body added later becomes a
blank screen, so the invariant moved rather than vanished.

| the fallback used to | now |
| --- | --- |
| generate a chapter for a body with none | `chapterFor` **throws**, naming the body |
| — | `route-tests.js`: every `PLANET_ORDER` id has an authored chapter, each five missions |
| — | `validate-missions.js`: the same check, plus `chapterFor` throwing for an unknown body |
| read `VALIDATION.minPadWidth` so a pad could never be narrower than the stance | `route-tests.js` asserts it over **authored** pads, reading the validator's own constant |

The last row is the one worth remembering: when a shared constant loses its sharer, **move the check
rather than letting it lapse**. `VALIDATION.minPadWidth` existed in two places because a generator
and its checker both encoded the limit (the M27 fault, where depth 2 asked for a 50 px pad against a
56 px stance). With the generator gone the limit had exactly one encoder and no cross-check at all,
and pad widths are now hand-typed — which is precisely when a typo gets through.

`chapterFor` and `peakMachines` also lost their `sector` argument, which is the right answer
independently: on a fixed ladder a body is always flown at the same rung, so a figure that varied
with the sector was describing a situation no player can be in.

**Nothing moved.** Both fixtures byte-identical, full suite green, and all ten bodies flown in the
browser with no console errors — 168 lines removed from `src/`, and 69 route assertions where there
were 65.

### How to re-measure

```bash
node -e "Promise.all([import('./src/planets.js'),import('./src/missions.js'),import('./src/forces.js')]).then(([P,M,F])=>{for(const id of P.PLANET_IDS){const ch=Object.values(M.CHAPTERS).find(c=>c.planet===id);const fs=new Set();for(const l of ch.levels)for(const f of F.forcesFor(l))fs.add(f.id);console.log(id.padEnd(10)+([...fs].join(', ')||'(none - the Moon, deliberately)'));}});"
```

```bash
node -e "Promise.all([import('./src/missions.js'),import('./src/route.js')]).then(([M,R])=>console.log(R.PLANET_ORDER.map((id,i)=>id.slice(0,3).toLowerCase()+' '+M.peakMachines(id,i+1)).join(' · ')));"
```

---

## M29c — the steering split (2026-08-21)

Tom cannot hold an attitude in classic steering; his son Ian, who flew several of the missions in the
M29a log, can. That is the clearest signal this project has had that **one control law was serving two
very different pairs of hands**, and it is not something a difficulty number can fix — it is the
control scheme itself.

Classic steering is *acceleration* control: a burner adds angular momentum, and stopping a rotation
means counter-burning for as long as you started it for. Measured, from a 0.4 s tap and then hands
off:

| | peak spin | rotation stops | angle at t=2 s | held-burner cap |
| --- | ---: | --- | ---: | ---: |
| **PRO CLASSIC (IAN)** — the original | 1.88 rad/s | never (>5.6 s) | **−160°** | 183°/s |
| **CLASSIC** — tuned | 1.79 rad/s | **0.57 s after release** | −38° | 102°/s |

The original law turns you past inverted and keeps going. That is the complaint, exactly.

### What the tuned mode is, and what it deliberately is not

`classic` is **rate** control: `spinCap: 0.56` on the rotation cap, and an `idleDamp` of 0.90 per
1/60 s applied **only while neither burner is held**. Release and the lander stops turning; the
attitude you left it at stays.

It is deliberately **not an angle spring**. Auto-levelling to upright on release would mean holding a
burner and the booster together to translate at all, which is a different game and is most of the way
to DIRECT — and DIRECT already exists for players who want it. Attitude persists; only the *rate* is
tamed. Asserted:

| | angle at 1 s | at 4 s | at 8 s |
| --- | ---: | ---: | ---: |
| pro | −57° | −169° | −223° |
| **classic** | −20.5° | **−20.6°** | **−20.6°** |
| direct | — | — | ~0° (returns upright) |

A small correction reads the same way: a 0.12 s nudge moves the nose 7.7° and stops, where the same
nudge in pro is still turning at −70° three seconds later.

### PRO is the original law, and that is what protects everything else in the repo

`STEERING.pro` is `{ spinCap: 1, idleDamp: null }` **precisely so that every line of the classic
branch reduces to the arithmetic it had before the split**. `settings-tests.js` reproduces that
arithmetic by hand and requires a match to **1e-9**.

This matters far beyond the setting. Every flight figure in this document — M19's terrain wall, M21's
placement sweep, M24's 70% crossing, M29's 643/800 — was measured against that law. So:

- **both fixtures pin `pro` explicitly** rather than taking the default, which had silently become
  the new mode (21 physics and 183 flight differences, all of them the default changing meaning)
- **`test/pilot.js` pins `pro`** for the same reason, with the conservative reading: pro is the
  harder mode, so every autopilot figure stays a *floor* for what a player on the default meets

A `classic-steering` case was added to the physics fixture so the new mode is regressed too. Net
change to `physics-fixture.json`: **+10 lines, nothing rewritten.**

### Two faults found on the way

**The gyro went inert on the default mode.** The first cut took `Math.min(spec.spinDamp,
mode.idleDamp)`, and 0.90 is stronger than the Gyro Stabilizer's 0.985 — so on the mode most players
use, the module's entire spin-damping half did nothing. A passive bought, equipped and silently
useless is the `hazardLead` fault (sold and not delivered), and `loadout-tests.js` caught it on the
first run with `0.000 -> 0.000`. Composed multiplicatively instead, and the test now names both modes
rather than trusting whichever is default.

**The physics fixture could silently not test.** It iterated `Object.keys(now)` and read
`expected[name] || []`, so a **newly added case compared against nothing and passed**, and a case
deleted from the fixture was never noticed at all. Found because the new `classic-steering` case
reported "unchanged" without ever having run. It reports NEW, MISSING and length mismatches now —
the M18 `pipefail` fault in another costume, and the second time a regression harness in this project
has been able to report success while checking nothing.

### What did not move

Every pre-existing physics case, the whole flight fixture, and every sweep — because all three name
`pro`. Full suite green. The only content change is one more button on the settings screen.

---

## M29e — the Casemate, and the Mast Sniper (2026-08-21)

Tom did not like the turret. Three redesigns were drawn at true game scale and he picked one as the
new standard and promoted a second into a **new machine** — the first of the six roster designs the
MVP deferred in M12.

### The Sentry Turret is a casemate

It was a four-point trapezoid, a 4 px line for a barrel and one dot: the one machine that never got
the pass M16 gave the drone. It is a low sloped glacis with bolt heads, a heavy barrel in a mantlet,
and the eye set back in an aperture slit.

Drawing all three candidates at radius 16 on a terrain line — the size they are actually seen at — is
what decided it. Detail is worth nothing at 32 px and outline is worth everything, and the wide low
block with one unmistakable barrel was the one that still read as a gun. Nothing about `radius`,
`range` or `aim` moved, so placement, the sanctuary rule and every measured figure are untouched.

### The Mast Sniper

Tom's brief: *"it should be a sniper, one shot one kill. no more than 1 per level, it should take
longer to aim and then keep aim for some amount that players can avoid and take longer to reload.
max 3 shots."* Every clause is a number:

| clause | number |
| --- | --- |
| one shot one kill | `shot.lethal` |
| no more than 1 per level | `maxPerMission: 1` |
| longer to aim | `turnRate` 0.42 against the turret's 1.15 |
| keep aim so players can avoid | `telegraph` 1.7 s, aim frozen (the M12 rule) |
| longer to reload | `cooldown` 8.0 s against 3.0 |
| max 3 shots | `ammo: 3`, per mission, never reloads |

**Lethality is a flag, not a big number.** `damage: 999` would be a figure that silently stops being
true the day a Hull L5 exists — the fault M24 and M28 each found in an assertion, moved into content.
`ship.damage(..., { lethal: true })` costs the hit against whatever is actually in the way, hull plus
a raised shield. It follows that **the Ray Shield does not save you from a sniper round**, which is a
consequence worth Tom's eye rather than mine.

Three things the field could not do before: finite ammo, a per-type placement cap, and lethal damage.

### The finding: it was decorative, and range made it worse

Measured before shipping, over 9 missions × 20 seeds — and the first version was a machine that did
nothing at all:

```
substeps it could see the lander   0.5 s per flight
locks                              0.13 per flight
fired                              0.08 per flight   (8% of flights)
rounds spent, of 3                 0.08
```

A lethal machine that never fires is not difficult, it is decorative — the M11 fault, where a system
only ever read by a screen had never been shown to work. Loosening the aim did nothing (8% → 11%
across every combination of `turnRate`, `aimTolerance` and `minRange`), because **aiming was never
the problem: line of sight was.**

**Raising `range` made it strictly worse, and that is the finding worth keeping:**

| range | sees the lander | fires in |
| ---: | ---: | ---: |
| 760 | 0.5 s | 8% |
| 1000 | 0.4 s | 5% |
| 1300 | **0.0 s** | **0%** |

The sanctuary bubble scales with `range`, so the further a machine reaches the further it is pushed
from the one place the player reliably goes. **Reach is not vantage.**

### The vantage rule

A type may now demand line of sight to a share of the crossing it is meant to cover, sampled along
the **deep half** at the altitude a lander actually flies. Asking for the whole crossing was both
unplaceable (2 seeds in 180) and wrong — the near end is inside the sanctuary bubble by construction.

| vantage | placed | sees | fires in | way home |
| ---: | ---: | ---: | ---: | ---: |
| 0.45 | 33/180 | 0.9 s | 8% | 154/180 |
| 0.30 | 104/180 | 3.3 s | 30% | 152/180 |
| **0.20** | **128/180** | **4.3 s** | **42%** | **150/180** |

Read the last column: it threatens the **prize** route and costs the way home almost nothing, which
is the shape a sniper should have.

### Two placement faults it exposed

**A type with a demanding rule burns the whole attempt budget.** The round-robin kept re-offering the
sniper for the same slot, so campaign fill fell from 99% to 84–93% — M21's "a budget is what the map
fields" broken by a machine that could not be seated. A `givenUp` set retires a type this map has
proved it cannot seat, and the budget fills with turrets instead. Giving up rather than relaxing the
rule is deliberate: a sniper with no line of sight is exactly the decorative machine the rule exists
to prevent.

| give up after | campaign fill | sniper present |
| ---: | ---: | ---: |
| 0.35 of tries | 93% | 71% |
| 0.08 | 94% | 71% |
| **0.05** | **95%** | **70%** |

The decision was always made in the first few dozen attempts; everything after that was spent proving
it again, at the cost of the machines that could have taken the slot.

**A long-range machine crowds out the short-ranged ones.** The at-once rule counts overlapping
engagement discs, so a big disc eats the budget. Range pays for itself twice, and 640 is where both
constraints are satisfied:

| range | campaign fill | fill on its own missions | present | fires (deep) |
| ---: | ---: | ---: | ---: | ---: |
| 760 | 95% | 84% | 70% | 41% |
| **640** | **97%** | **91%** | **77%** | **33%** |
| 560 | 97% | 90% | 73% | 18% |

Still the longest reach in the game — the turret is 560.

### Where it stands

Nine missions of fifty: the last two of each of the five hardest bodies (Ganymede, Io, Mercury,
Venus) plus `pluto-5`. **Deliberately not in any `eligibleEnemySets`** — since M29b deleted
`generateChapter`, that field is only the default for a mission with no `enemySets` of its own, so
putting a lethal machine there would hand one to every armed mission on the body, including a
mission 2 and including `pluto-4`, a single-pad cave where M21 measured there is no route around a
machine at all.

### What did not move

**Both fixtures byte-identical** — the fixtures fly with enemies off, which is the M12 rule that
keeps a terrain regression from becoming a combat regression. **Sanctuary 20/20 on all 40 armed
missions.** At-once distribution 0: 62.8% · 1: 26.1% · 2: 9.7% · 3: 1.4% · 4: 0.1%, against
62.3/26.1/10.1/1.5/0.1 before. Campaign fill 97%.

### Left for Tom

- **The Ray Shield does not stop a sniper round.** That follows from "one shot one kill" taken
  literally. Making the shield absorb one — and be destroyed doing it — is the obvious alternative
  and is a design call, not a fix.
- **It is absent on about one seed in four**, on maps with no vantage. Left alone deliberately, but
  it does mean the machine is a surprise rather than a fixture.
- **The instrument cannot judge whether it feels like a sniper.** 33% engagement on the deep route is
  measured by a pilot with no evasive logic that never loiters. A human lining up a landing is far
  more exposed than that number suggests.

---

## M29f — the space bed (2026-08-21)

A soundbed for the title screen. **Synthesized, like everything else in `audio.js`** — there are no
audio files in this project and this did not add one.

Four layers, each doing a job:

| layer | what it is | why |
| --- | --- | --- |
| drone | two sines at 55 Hz / 55.19 Hz plus a triangle a fifth above | the detune beats about every 7 s, so the bed moves without anything moving it |
| wind | looped noise through a narrow bandpass, band drifting on a 90 s cycle | reads as distance rather than as weather |
| shimmer | two quiet high partials swelling against each other | keeps the top of the mix breathing instead of hissing |
| beacon | one ping, 9–22 s apart, lowpass closing as it decays | stops the bed being wallpaper: something out there is still transmitting |

Measured at the bed's own output, three seconds after it fades in:

```
peak 0.0711   rms 0.0329        (the engines peak at 0.55)
drone    40-90 Hz    -54.6 dB
wind    200-400 Hz   -84.3 dB
shimmer 1.2-2.1 kHz  -76.1 dB
        5-8 kHz     -118.1 dB   (nothing harsh up top)
```

**All movement is LFO nodes, not per-frame JavaScript.** M16 found `engines` writing 240 automation
events a second forever, and a bed that runs for as long as somebody leaves the title screen up is
exactly where that fault would be worst. The graph is built once and the oscillators run themselves;
the only JavaScript afterwards is one `setTimeout` per beacon ping, which stops rescheduling the
moment the bed is switched off.

### The fault: it had two owners

First version was silent, and the reason is worth keeping. `silence()` was made to stop the bed "for
safety" — and the frame loop calls `silence()` **every frame the game is not in play**, so the bed
was switched off on the one screen it was written for. Built, then killed, sixty times a second.

`silence()` stops the *flight* voices. The bed is owned by `setState` and nothing else. One rule, one
implementation — the same lesson `__settleNow` cost M27 an hour over.

### Verified live

| | |
| --- | --- |
| on the menu | on, gain 1, beacon scheduled |
| in flight | off, fading out, **beacon timer cleared** |
| back on the menu | on again |
| in SETTINGS | still on — cutting it there would read as a fault |
| muted | master 0; the bed keeps its state, so unmuting restores it |
| beacon ping | fires audibly, peak 0.155 |

WebAudio will not sound before a user gesture and the title screen is already up by then, so
`unlockAudio` re-applies whatever the current screen asked for. Without it the bed never starts on
the one screen it is for.

### Left for Tom

- **There is no separate control for it** — mute takes everything. A player who wants the effects but
  not the ambience has no switch, which is a fair thing to want and a five-line setting if you do.
- **It plays on the front-of-house screens**, not just the menu: help, settings, keys, logbook and the
  expedition picker. Anything belonging to a mission is silent.

---

## M29g — the sniper you can actually meet (2026-08-21)

Tom: *"did you add the sniper? i did not encounter it"*. It shipped, it worked, and it was
effectively unreachable.

### The mistake

M29e read "harder levels" as "the hardest bodies" and put the first Mast Sniper on **Ganymede
mission 4 — body 6 of 10**, about 28 missions into a run. Tom's own M29a log cleared four bodies in
29 minutes, and `docs/PROGRESSION.md` records the typical run as dying at body 3 or 4. So the newest
and most distinctive machine in the game sat past the point almost every run ends.

A machine nobody meets is not a machine. This is the M11 fault at the level of *content* rather than
code: M29e proved the sniper engages, and never asked whether anyone would be there to see it.

### Why it could not simply be moved forward

The telegraph is the counterplay — a frozen aim you move out of — and machines are drawn **inside**
the world, with dust and darkness painted over the top. Measured worst visibility on the bodies a run
actually reaches:

| | worst visibility |
| --- | ---: |
| titan-3 / -4 / -5 | 0.13 / 0.20 / 0.17 |
| mars-3 / -4 / -5 | 0.05 / 0.13 / 0.05 |
| enceladus-3 / -4 / -5 | 1.00 |

For a turret at 50 damage, an unseen lock is harsh and survivable. For a machine that kills outright
it is a coin toss. So a lethal machine's lock line is now redrawn **above the weather**, exactly as
the pad beacons (M18) and the ore crates (M22) are — the same rule those came from, blind is
difficulty and targetless is a lottery, pointed at the one thing that can kill you in one shot.

Only the lock, and only while locked: the machine itself stays lost in the storm, which is correct.
Verified at 0.06 visibility on `titan-5` — terrain and sniper both invisible, lock line and closing
ring fully legible.

### Where it is now

| body | | missions | present on |
| ---: | --- | --- | --- |
| 3 | Titan | **5** | 17/20 seeds |
| 4 | Mars | **4** | — |
| 5 | Enceladus | **5** | 15/20 |
| 6 | Ganymede | 4, 5 | 14/20 · 17/20 |
| 7 | Io | 4, 5 | 13/20 · 16/20 |
| 8 | Mercury | 4, 5 | 14/20 · 19/20 |
| 9 | Pluto | 5 | 12/20 |
| 10 | Venus | 4, 5 | 15/20 · 18/20 |

First sighting is the exam mission of body 3 — reachable on a normal run.

### A sniper substitutes for a drone, it does not add to the map

The at-once rule caps overlapping engagement discs, so putting a sniper on a mission **displaces**
other machines rather than adding one. Measured over 20 seeds:

| mission | without | with |
| --- | --- | --- |
| titan-5 | 60 drones | 39 drones + 17 snipers |
| mars-5 | 59 drones, 40 turrets | 43 drones, 35 turrets, 13 snipers |
| enceladus-5 | 40 drones, 40 turrets | 20 drones, 43 turrets, 15 snipers |

It displaces **drones** in particular, which are the machines the test pilot struggles with most — so
`mars-5 STORM EYE` went **6/20 → 12/20** on the way home. A large, silent difficulty *reduction* on
hand-balanced content, and the reason Mars meets the sniper on `mars-4 IRON RAIN` instead. With that
move: mars-4 17/20 with and without, mars-5 back to its authored 6/20.

The substitution itself is left as designed and is arguably right — a mission gets a *different* kind
of threat, not more threat. It is recorded here because it is not obvious from the budgets.

### What did not move

Both fixtures byte-identical. Sanctuary **20/20 on all 40 armed missions**. Full suite green. On the
three new placements the way home is unchanged: titan-5 13/20, mars-4 17/20, enceladus-5 14/20, each
identical with and without.

### Left for Tom

- **It is still absent on about one seed in four** on maps with no vantage, so it is a surprise
  rather than a fixture. Deliberate, and worth knowing when it does not turn up.
- **Whether body 3 is early enough.** It is one authored line per mission to pull it earlier still.

---

## M30 stage 1 — the input contract widens (2026-08-21)

Analog controller support, staged so that the first step is *provable*. The simulation used to read
booleans — `input.thrust` on or off. It now reads a **0..1 magnitude**, with the keyboard as the
degenerate case. The flight model does not fork, and this section is the measurement that says so.

**Nothing about the game changed in this step, and that is the whole point.** Stage 1 ships no
gamepad, no new setting and no new behaviour. It moves the contract so that stage 2 can plug a
trigger into it without touching `ship.js` again.

### The arithmetic the design rests on

The keyboard produces **exactly** 1.0 and **exactly** 0.0, so every multiplication it causes is
`x * 1.0`. Re-measured here against this codebase's own constants rather than taken from the plan —
real nose vectors across the full angle range, every thrust and derate combination, the RCS and side
authorities, both timesteps, plus a random sweep over twenty-four orders of magnitude and the
IEEE-754 edge cases:

| checked | changed by `* 1.0` |
| ---: | ---: |
| **6,633,498** multiplications | **0** |
| 1,000,000 additions of `0` | 0 |

### The gate: bit-identical, not fixture-identical

Both fixtures read **unchanged**, but that is a weaker statement than the claim and it is worth being
precise about why. **The physics fixture compares to four decimal places** (`toFixed(4)`) and the
flight fixture to `outcome/grade/fuelLeft/simSecs`. Those are tolerances, not identity.

Proved directly instead, by flying both trees — `HEAD` and the widened one — and comparing **raw
64-bit doubles**:

| check | flights | 64-bit values | differences |
| --- | ---: | ---: | ---: |
| scripted input, 5 level types × 3 steering modes × both invert settings × 3 seeds | 90 | 1,840,320 | **0** |
| **every mission through the real autopilot**, 3 seeds × 3 routes | 558 | 29,505,039 | **0** |

Per substep, not per phase — a difference that cancels before the next sample is still a difference.

**The first attempt at this proof was wrong, and the way it was wrong is the finding.** A scripted
harness that drops the lander onto the ground never reaches `settle()` at all: nothing in it acts on
the `'crash'`/`'land'` event `step()` returns, so the lander falls *through* the surface and
`touchdown` is never opened. It reported 90 clean cases while covering **zero settle substeps** — and
`settle()` is half of what stage 1 changed. The physics fixture's own script does not land either.
Only the real autopilot does. The second table above is the one that counts: **295 landings and 8,629
settle substeps** exercised.

### What the fixtures would not have caught

Mutation-tested rather than assumed. With `Input.amount()` returning `0.9999999` for a held key —
a smoothed throttle, the single most likely way this design gets broken later:

| | verdict |
| --- | --- |
| `node test/physics-fixture.js` | **"unchanged"** |
| `node test/settings-tests.js` | 5 failures |

The 4-decimal fixture cannot see it. That is why the *exactness* is asserted in `settings-tests.js`
rather than left to the fixtures: the day a held key stops answering exactly 1.0, every figure
recorded in this file quietly stops measuring the game it was measured against, and no rounded
fixture says a word.

The other mutation — `ship.js` taking the amount and then ignoring it, which is a contract that does
nothing — fails 2 assertions. A widening that silently dropped the number would otherwise pass every
fixture in the repo, because the keyboard's number is 1.

### What changed, in code

Nine expressions in `ship.js`, in `step()` and `settle()`, each an inserted `* amount`. Plus
`Input.amount()` and a free `amountOf(input, action)` — because the simulation is flown by three
different things and only one of them is an `Input`: the browser passes the real device, `pilot.js`
passes a plain boolean object, and a test may now pass a number. `ship.js` asks one question and
never learns which answered.

`this.thrusting` / `rcsLeft` / `rcsRight` **stay booleans** derived from the magnitudes. A dozen
consumers read them — audio, particles, the HUD, `thermal`, the gear cue, the debug overlay — and not
one wants a float.

### Verified in the browser too, which is the only place the device path runs

Every node test passes a plain object, so `amountOf`'s *device* branch — the one real players use —
runs nowhere in the suite. Flown at `localhost` against the real `Input`: a real `keydown` on SPACE
reads exactly 1, one second of burn spends exactly 9.0 fuel (`burnMain`), release reads exactly 0 and
coasting spends nothing. Seven missions flown through the browser autopilot came back **identical
line for line to the same seven flown at `HEAD`**, checked by stashing the change and re-running.

### What did not move

Both fixtures unchanged. Full suite green: 10 unit suites, both sweeps, the build. Campaign crossing
**642/800 (80%)**, at-once distribution 0: 63.1% · 1: 25.9% · 2: 9.5% · 3: 1.4% · 4: 0.1%, deep-route
engagement 751/800 — every audit figure identical to the run taken before the first edit.

`settings-tests.js` 50 → 82 assertions.

### Open for Tom, and stage 2 does not start until they are answered

Both are balance decisions rather than code, and both follow from the widening rather than from
anything a gamepad adds:

- **Analog is strictly more precise than binary**, so a controller player will land better than a
  keyboard player on the same mission. Precedent says this is fine — the game already ships three
  steering modes of different difficulty and lets the player choose — but it should be a decision.
- **Partial throttle costs proportionally less fuel**, so hovering is cheaper on budgets authored for
  full-or-nothing burns. Measured here: half throttle burns exactly half. Worth watching on
  `mars-2` and `europa-4`, the two tightest, rather than pre-emptively retuned.

---

## M30 stages 2-5 — the gamepad backend (2026-08-21)

The pad itself, on top of the contract stage 1 widened. Nothing in `ship.js` changed: a trigger fills
the same 0..1 amount the keyboard fills with 1, which is what the staging was for.

**Tom's two calls, taken before this was built:** analog is *accepted* as strictly more precise, like
the three steering modes — no compensation, no second balance pass. And the fuel budgets are **left
alone** and watched on `mars-2` and `europa-4`, rather than pre-emptively retuned.

### Where the response curve came from, since feel cannot be measured

A throttle curve is the M29c steering problem again — the least measurable thing in the project. But
*where it puts the hover point* is arithmetic, and that is where a player's thumb lives for the whole
of a landing. Thrust is 130 px/s², gravity runs 8.4 to 62.9:

| body | g px/s² | throttle that holds a hover | trigger travel, linear | trigger travel, curve 1.5 |
| --- | ---: | ---: | ---: | ---: |
| Enceladus | 8.4 | 6% | 6% | **20%** |
| Pluto | 18.7 | 14% | 14% | 30% |
| Europa | 24.7 | 19% | 19% | 35% |
| Moon | 28.0 | 22% | 22% | 38% |
| Mars | 42.4 | 33% | 33% | 48% |
| Mercury | 43.2 | 33% | 33% | 49% |
| Venus | 62.9 | 48% | 48% | **61%** |

**Linear would fly the entire ladder in the bottom third of the trigger**, which is where a trigger
has the least resolution and the most stiction. At 1.5 the hover band is 20-61%, the eight ordinary
bodies between 30% and 49% — the middle of the travel. Raise the curve and the top goes numb, lower
it and the bottom does. That is the lever, and it is `PAD.curve`.

### The endpoints are exact, and that is the same property stage 1 rests on

Below `PAD.deadzone` a stick reads **exactly 0**; above `PAD.saturate` (0.95) a trigger reads
**exactly 1**. So a pad at rest and a pad at the stop produce the two values the keyboard produces,
and a full burn is a full burn whatever it was held with. Measured in the browser against the real
`Input`: a trigger at the stop spends **exactly 9.0 fuel/s** and reaches **vy −96.0** over one
second — the same two figures a held space bar produces, to the digit.

`saturate: 0.95` is not cosmetic. Most triggers never report a clean 1.0 at the stop, and without it
a pad player would fly the whole game at 99% throttle and never match a recorded figure.

### Two guards against NaN, and neither is decoration

Found by mutation-testing rather than by reading. `shape()` subtracts the floor before raising to a
power, so a reading *below* the floor with no guard is `Math.pow(negative, 1.5)` — **NaN** — and a NaN
amount multiplies straight into `vx`/`vy` and puts the lander nowhere at all.

Two things refuse it: `shape()` itself (`!(NaN > floor)` is true) and the fold in `pollGamepad`
(`NaN > 0` is false). **The fold is deliberately not `Math.max`**, because `Math.max(0, NaN)` is NaN.
That is now a comment in the code and an assertion in the tests, because it is exactly the kind of
line a later cleanup tidies into `Math.max` without knowing what it was doing.

A property test sweeps every raw reading from −1.5 to 1.5 and requires a finite 0..1 out, plus
explicit NaN and Infinity cases.

### The rebinding rule had to change, and the fixtures could not have told me

Pad controls live in the **same string binding map** as keys (`pad:7`, `axis:0-`), so `rebind()`,
`setBindings()`, the save format and the settings screen all keep working. But `rebind()` used to set
`next[action] = [key]`, which was right when every binding was a key and is wrong now: **binding the
booster to a trigger would silently unbind the space bar.** It replaces within a family and leaves the
other alone.

**And the "never left with nothing" rule is asked per family now**, because an action holding only
`pad:7` is unreachable for a player with no pad — the exact lockout the rule exists to prevent. An
action with no *pad* control is allowed; that is a choice, not a lockout.

This one survived the first mutation pass. `next[action] = [key]` still passed every test I had
written, because the restore rule patched the missing family back in **from the defaults** — so it
only differs for a player who has customised *both* families, and it looks perfect on a fresh
install. Now asserted directly.

### Mutation-tested, because a passing test is not evidence that it bites

| mutation | failures raised |
| --- | ---: |
| `amount()` returns 0.9999999 for a held key | 5 |
| `ship.js` takes the amount and ignores it | 2 |
| axis sign flipped (left drives right) | 5 |
| trigger never reaches exactly 1 | 9 |
| `ability` fires every poll instead of on the edge | 2 |
| `rebind` replaces across families | 3 |

The dead-band mutation raised **0** and turned out not to be a bug: the max-fold drops the NaN it
produces. That is what surfaced the guard above, which was undocumented and one cleanup away from
being deleted.

### What did not move

**Both fixtures unchanged.** Full suite green — every audit figure identical to the run taken before
the first edit of this milestone: crossing 642/800 (80%), at-once 0: 63.1% · 1: 25.9% · 2: 9.5% ·
3: 1.4% · 4: 0.1%, deep-route engagement 751/800. `settings-tests.js` 50 → **167** assertions.

`pollGamepad()` is called from `frame()` and **deliberately not from `advance()`**, which is what the
headless drivers call — a sweep must not change its answer because somebody left a controller plugged
into the machine running it.

### Verified in the browser, and the one line that could not be

Driven against the real `Input` and a synthetic Standard Gamepad injected into `navigator.getGamepads`:
full trigger → exactly 1, 9.0 fuel/s, vy −96.0; trigger at 0.55 → amount 0.409, 3.68 fuel/s, partial
acceleration; stick left → `rcsLeft` only, spin −1.79, and half-stick −0.50; keyboard with a pad
connected and idle → still exactly 1 and 0. Rebinding a pad control through the CONTROLS screen
binds, flies on the new control, kills the old one and leaves the space bar working; START and HOME
are refused by name.

**`requestAnimationFrame` never fires in this browser pane** — `document.hidden` is true even with the
tab fronted, the gotcha `docs/ARCHITECTURE.md` already records — so the poll and the sim were driven
directly. That leaves exactly one line unexercised: the `input.pollGamepad()` call inside `frame()`.
It is present in the served source and sits immediately before `advance(dt)`. **A real pad on a real
machine is still the only way to close that**, and to answer whether the curve feels right.

### Left for Tom

- **The curve is reasoned, not tuned.** `PAD.curve`, `PAD.deadzone`, `PAD.saturate` and
  `PAD.triggerFloor` are the four levers, and the hover table above is the argument for 1.5. A
  controller in a hand is the only thing that can say whether it is right.
- **A pad cannot work the menus.** The five stages cover the flight controls and the module button;
  pausing, confirming and backing out are still keyboard or mouse. START and HOME are **reserved**
  against a flight binding so the buttons are free for it, but nothing is wired to them yet. This is
  a real gap in "controller support" and it is deliberately outside the decided plan rather than
  quietly bolted on — it needs a design call about what confirms and what moves a selection.
- **The bindings are the Standard Gamepad mapping.** A pad the browser does not normalise reports raw
  indices and the labels will read `PAD 12`. Nothing breaks; it just stops being readable.

---

## M30a — the laser that could not reach (2026-08-21)

Tom, on the first controller playtest: *"my pulse laser did not fire on the controller. i saw the
green circle but no laser was triggered."*

**It was not the controller.** Measured first, because a bug report names a symptom and not a cause.
On the same seed and mission, parked 120 px from a machine, keyboard and pad are identical: both
fire, both draw the beam for 139 frames, both deal 30.1 damage and kill it. What the report had
found was a real fault the pad only happened to be holding at the time.

### What the green ring means, and what it does not

`useAbility` draws the ring and plays the chime **when `trigger()` returns true**, which only means a
charge was spent and the module came on. The Pulse Laser's beam is separate: it exists only while
`field.target(ship, range)` finds a machine in reach with line of sight. Reproduced exactly — parked
997 px from the nearest machine:

```
chargeSpent 1   active true   targetFound false   beamFrames 0
```

Green ring, success chime, charge gone, nothing else. Identical on the keyboard.

### The fault: every machine outranged the counterplay

| machine | engages from | laser reached | |
| --- | ---: | ---: | --- |
| Seeker Drone | 520 | 430 | **90 px short** |
| Sentry Turret | 560 | 430 | **130 px short** |
| Mast Sniper | 640 | 430 | **210 px short** |

So at the moment a machine was shooting at you, the answer to it was out of reach by construction.
The short range was deliberate — `laserRange` is commented *"short enough that it never becomes the
whole game"* — but "shorter than everything it exists to answer" was not a decision anyone took.

### The sweep, and a new thing the instrument can do

The autopilot could carry an active module and never press it, so there was no way to ask whether an
active is any good — the same blind spot `opts.loadout` was added to close for passives. `flyMission`
takes `opts.ability` now, and **the firing policy is the player's cue**: press when the module is
ready and the HUD's own threat count says something is aiming at you (`field.engaged`). Deliberately
*not* "press when a target happens to be in range", which would measure the ceiling rather than the
experience — the gap between those two is the whole measurement.

40 armed missions × 20 seeds × both routes × 4 reaches = **6,400 flights**:

| reach | press produces a laser | dry press | kills | beam s | way home | prize route |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| **430** (was) | 1099 (**80%**) | 275 (**20%**) | 996 | 921 | 753/800 | 116/800 |
| **520** (now) | 1227 (**92%**) | 108 (8%) | 1228 | 1169 | 756/800 | **133/800** |
| 560 | 1279 (96%) | 52 (4%) | 1348 | 1283 | 757/800 | 140/800 |
| 640 | 1317 (99%) | 12 (1%) | 1465 | 1379 | 757/800 | 146/800 |

**One press in five did nothing**, which is the number Tom's complaint reduces to.

The shape is the one M19, M20 and M29 all found for a good knob: **the way home barely moves** — +4
of 800 across the entire range — and **the prize route carries it**, 116 → 146. Help lands where the
risk is and the safe route is untouched.

**520, and not 640.** It is the drone's own commitment range, so you can answer the machine that
closes on you; the turret and the sniper still outreach you, so closing the distance stays the price
of using it. 640 makes the laser always work, which removes the decision about when to spend a
charge and lets you answer a Mast Sniper at its own range — most of what makes a sniper a sniper.

### The caveat runs the opposite way to usual here

**The autopilot has no evasive logic** and never keeps its distance from a machine, so it ends up
closer to them than a person does. So **80% is a ceiling** on how often the laser worked for a real
player, not a floor. Nearly every autopilot figure in this file understates the *difficulty*; this
one understated the *problem*, and a human found it first.

### The feedback was left alone, deliberately

Offered and declined (Tom, 2026-08-21): pressing with nothing in reach still spends the charge, still
draws the ring and still plays the chime. Now that the reach covers the machine that commits to you,
the remaining dry presses are a judgement the player got wrong rather than a rule they could not see.

### The rule, because a number nobody asserted is a number that drifts

Nothing tied the laser's reach to the ranges it exists to answer, which is exactly why it could sit
there through M12, M24, M28 and M29. `enemies-tests.js` asserts the **relationship** now, reading the
module's own effect rather than repeating a figure — this file has been caught encoding a decision
instead of a property five times:

- the laser reaches the machine that closes on you (`>= seeker-drone`)
- the turret and the sniper still outrange it (`> laser`)
- `ABILITY.laserRange` and the module's effect agree, so there is no stale second copy

Mutation-tested: 430 raises 2 failures, 640 raises 3, 900 raises 4.

### What did not move

Both fixtures unchanged — they fly with enemies off, the M12 rule. The unarmed crossing is **642/800
(80%), unchanged**, and must be: it is flown with nothing equipped, so a module cannot reach it.
`enemies-tests.js` 95 → 99.

### Verified in the browser, on the pad

Reproduced at the distances that used to fail: **470 px and 505 px now fire a full 139-frame burst**
where they were previously silent; 560 px catches the machine partway through as the lander drifts in
(98 frames); 700 px is still dry, which is the design.

---

## M30b — the pad can work the interface (2026-08-21)

Tom: *"space in the menu needs to be bound to a button."* This is the gap M30 shipped with and named
— a pad that flies the lander and cannot get past the brief that launches it.

### The pad presses interface keys; it does not get a menu layer

`PAD_UI` maps three controls onto keys the interface already listens on:

| control | key | what it does |
| --- | --- | --- |
| **A** | `SPACE` | confirm — the universal per-screen primary action |
| **B** | `Escape` | back, cancel a listening rebind, pause |
| **START** | `Escape` | pause in flight, back out everywhere else |

`pollGamepad` fires the same `onPress` handler a `keydown` fires, so every screen, every
`input.bind(...)` and every shortcut works with nothing added. **A doubles as the booster exactly as
SPACE does**, which is harmless because that handler has no `play` case — measured: A held for one
second in flight spends 9.0 fuel and leaves the state at `play`.

Deliberately **not** in the rebindable map, the same way `input.bind('escape')` is independent of
`DEFAULT_KEYS`. These are the interface's.

### Parity is the claim, and it is measured

Driven from the menu with confirm and back, the pad and the keyboard produce the **identical state
trail**: `menu -> chapters -> menu -> chapters -> menu`. Where SPACE backs out of the chapters screen,
so does A — because that is what the *keyboard* does there, not because the pad is limited.

That is the scope on purpose: **parity with the keyboard, not a new navigation system.** There is no
d-pad cursor because there is no keyboard cursor — the menus are clickable HTML with one primary
action on SPACE, and that is now what a pad reaches.

### The ordering that stops the back button binding itself

Inside `pollGamepad` the interface keys fire **before** the rebinding capture, and that is the
mechanism rather than tidiness. B is Escape; Escape cancels a listening rebind by clearing
`g.rebinding`; the capture reads that same flag. Reversed, pressing B on the CONTROLS screen binds B
to whatever was listening and **the player can no longer back out of anything**. It is the order a
`keydown` already has, and it is matched deliberately. B is in `RESERVED` for the same reason Escape
is; A is not, because SPACE is not.

Mutation-tested, since an ordering nobody asserts is an ordering that gets refactored:

| mutation | failures |
| --- | ---: |
| interface keys fire *after* the rebind capture | 1 — B binds itself |
| no edge detection (fires every poll) | 3 |
| A no longer mapped to SPACE | 7 |

Also asserted: every `PAD_UI` control maps to a key something is actually bound to — the M29 rule
about a name in content indexing a table in code, where the failure mode here is a button that
silently does nothing. And an interface control held across a focus loss re-fires on the way back
rather than sticking down and eating the next real press.

### What did not move

Both fixtures unchanged. Full suite green. `settings-tests.js` 167 → **178**.

### Still open

**Picking an item from a list needs a click** — a chapter, a route card, a hangar rung. Neither
device can do it: the keyboard cannot either. Closing it means a selection cursor that serves both,
which is a design call about what moves the selection and how a screen says what is selected.

---

## M30c — the selection cursor, and the forecast nobody could read (2026-08-21)

Tom: *"in expedition menu b should bring you back and a for selecting the active mission, joystick to
select a mission."* This is the last of the three gaps M30 named — list selection — and **neither
device could do it**: the menus are clickable HTML with one primary action on SPACE, so the keyboard
had no cursor either.

### General on purpose, not a case for one screen

The cursor knows nothing about cards. It walks `[data-action]` elements by their **geometry**, so it
follows whatever a screen's CSS actually laid out and every screen gets it for free. A cursor that
knew about the expedition screen would need a second implementation for the hangar, which is the
fault this project keeps paying for.

Measured on the real ladder at 1440×900, a 5×2 grid:

```
land -> LUNA      right -> EUROPA   right -> TITAN
down -> MERCURY   (row 2, same column as TITAN)
left -> IO        left  -> GANYMEDE (row start)
left -> GANYMEDE  (edge: stays put, no wrap)
up   -> LUNA      (row 1, same column)
```

At 800 px the grid collapses to one column and the cursor walks it vertically, because that is what
the layout became. **No wrapping at edges** — in a grid, wrapping means pushing right at the end of a
row lands you somewhere unrelated.

The off-axis distance is weighted ×2.5 so a push steps to the *neighbour* rather than to whatever is
nearest in a straight line: without it, pushing right on a ladder card reaches the card below and
three columns over, because it is technically closer.

### The focus is an action string, not an element

`renderOverlay` rebuilds the whole overlay, and the toast timer alone re-renders mid-screen — an
element reference goes stale on every one of those. An action string survives a re-render, and when
it stops existing the cursor *should* drop, which is what happens.

The cursor only appears once the pad is used, so a mouse or keyboard player never sees it.

### Steps, not a held direction

One push moves one item; holding repeats after 0.42 s, then every 0.13 s. Without the pause a single
flick crosses the ten-card ladder before you let go.

`press` 0.55 and `release` 0.35 are far apart on purpose, and the case that justifies it is **not**
"the stick eases back to centre" — that emits nothing either way. It is a stick **wobbling across the
threshold**, which is what a thumb resting on one does: without the band, each dip below `press` is a
release and each rise a fresh push. Measured on a 0.62/0.40 wobble: **1 step with the band, 6
without.** The first version of this test used the easing case, passed against the broken code, and
proved nothing.

Navigation reads the axis **raw**, not through `shape()`. That curve exists to put a throttle's hover
point mid-travel, which is exactly the wrong question for "did they push it far enough to mean it".

### The whole chain, on the pad

Verified end to end with no god mode: expedition → stick to a body → **A** → brief → stick to LAUNCH
→ **A** → flying. B backs out at every step.

### And the thing the screenshot found

Six of the ten expedition cards read **`weather: [object Object]`**.

`PlanetDefinition.hazards` mixes bare names with tuned spec objects — Venus declares one of each —
and the card did `c.hazards.join(', ')`. Every body M29 authored with a tuned hazard printed garbage,
on the screen a player picks a run from:

| before | after |
| --- | --- |
| `weather: [object Object], [object Object]` | `weather: heat, eruption` |
| `weather: [object Object], [object Object], [object Object]` | `weather: cold, darkness` |
| `weather: drag, [object Object], [object Object], [object Object]` | `weather: drag, acid, downdraft, dust` |

`typeof h === 'string' ? { type: h } : h` was already open-coded in **three** places, and the fourth
reader — the one that printed rather than resolved — did not know the rule existed. It is
`hazardName()` / `hazardSpec()` in `forces.js` now, read by all of them.

`route-tests.js` asserts that a card's forecast is **strings**, that every name it prints resolves to
a real hazard, and that nothing renders as `[object ...]`. Reintroducing the bug raises 8 failures.

**This is the M29 lesson from the presentation side.** That milestone made a hazard *name* resolve to
a builder. Nobody asked whether a hazard *entry* could be printed — and a route card, a summary and a
briefing all print one.

### Mutation-tested

| mutation | failures |
| --- | ---: |
| no edge detection (steps every frame) | 2 |
| no repeat delay | 1 |
| navigation deadzone 0.55 → 0.15 | 2 |
| no hysteresis band | 1 (6 steps from one held direction) |
| hazards printed raw again | 8 |

### What did not move

Both fixtures unchanged. Full suite green. `settings-tests.js` 178 → **188**, `route-tests.js`
69 → **99**.

`__padFrame(dt)` is a new dev hook, split out of `frame()` for the same reason `__advance` was:
`requestAnimationFrame` does not fire in a hidden tab, so without it there is no way to exercise the
pad without a visible window and a physical controller.

---

## M30d — the cursor stops belonging to the gamepad (2026-08-22)

Tom: *"bind arrow keys to the cursor too."* One line of wiring and a rename.

The arrow keys are flight controls in the air — thrust, hold and the two burners — and **inert on
every overlay screen**, which is precisely the gap the cursor fills. So this costs the keyboard
nothing it was using, and closes the half of M30c I had left as "a decision rather than a side
effect".

`g.padFocus` → `g.uiFocus`, `movePadFocus` → `moveUiFocus`, `.pad-focus` → `.ui-focus`. A cursor two
devices drive should not be named for one of them; that is how the next reader learns the wrong thing
about it.

**One press, one step**, because `keydown` drops `e.repeat`. The pad repeats when held and the
keyboard does not, and that asymmetry is right: the pad has no key-repeat of its own and needs one
synthesised, while the keyboard's would fight the browser's.

Verified in the browser: Down/Up/Right walk the cards, the ring shows, SPACE activates what the
cursor is on. **In flight, ArrowUp still burns 9.0 fuel/s and no cursor appears** — the guard is
`g.state !== 'play'`, the same one the stick uses.

---

## M30e — the audit before the demo (2026-08-22)

Tom: *"audit the whole code base for unused code, bugs and clean up if necessary so everything is
ready for tomorrow."* Measured rather than read: scripts over the import graph, the CSS, the
content→table lookups and the documented dev hooks.

**Three real bugs, all live and shipping.** Two are this project's oldest fault in new places.

### 1. Flight assist was silent on 42 of 50 missions

`flightAssist` fires after a mission has cost three landers — the anti-frustration feature, aimed at
a player who is already stuck. Its tips table was keyed on the **builder** names (`thermal`, `cryo`,
`plumes`) while every planet and mission declares `heat`, `cold`, `plume`.

**That is the M29 fault exactly, in a second table nobody audited.** M29 fixed `BUILDERS` and
asserted that every hazard name resolves to a builder; it never asked what *else* was keyed on those
same names.

| | missions given a hazard tip |
| --- | ---: |
| before | **8 / 50** |
| after | **45 / 50** |

The five without are the Moon, which has no weather at all. Titan, Enceladus, Ganymede, Io, Mercury,
Pluto and Venus were silent on every mission.

Two separate faults in one line, and only one was the names: `hazards[0]` took the **first** hazard
blindly, so Titan (`wind`, then `glide`, then `dust`) and Venus (`drag` first, `dust` last) threw
away a tip they already had. It takes the first hazard that *has* something to say now.

Seven hazards had no tip written at all — `glide`, `acid`, `downdraft`, `eruption`, `magnetic`,
`falseRadar`, `darkness`. All sixteen do now, and `forces-tests.js` asserts **both directions**:
every declared hazard has a tip, and every tip is for a hazard something declares. Mutation-tested —
reverting the three names raises 6 failures, deleting one tip raises 1.

### 2. Every instrument understated the gear the player bought, by up to 72%

`ENVELOPE` was a module-level constant baked at `gearTier: 1`. The **grader** is not: it evaluates
against `capsFor(axis, { ...LANDING, gearTier })`, and gear runs to 1.40 with another 0.32 from the
skill tree.

| lander | GOOD vy the grader uses | GOOD vy every readout drew |
| --- | ---: | ---: |
| stock | 22.0 | 22.0 |
| Landing Gear L4 | 30.8 | **22.0** |
| L4 + skill rank 4 | 37.8 | **22.0** |

The F4 envelope bars, the tilt safe-cone, the sink-rate warning, the briefing copy and the crash text
all described a lander with no gear on it. **A player who spent 12,840 salvage on landing gear could
not see any of it** until the debrief — the Gyro Stabilizer fault wearing a different hat, a thing
sold and not delivered.

And the comment directly above it read *"so the HUD, the tilt gauge and the debug overlay always
describe the same thresholds the grader actually uses"*. It had been false since gear existed.

`envelopeFor(gearTier)` now, cached on the lander in `applyLoadout`, and `ENVELOPE` is what a *stock*
lander is graded against — which is all the fixtures and the briefing copy ever wanted. **No flight
behaviour changed**: the grader always used the right caps, only the instruments lied. Both fixtures
byte-identical, which is the proof.

`loadout-tests.js` asserts the drawn envelope equals the grader's for every gear level, that a
touchdown just inside the drawn GOOD line is not a crash, and — by reading the source — that no
instrument still reaches for the constant.

**The first version of that source check required a dot after `ENVELOPE`**, so `const env = ENVELOPE;`
reintroduced the entire bug and passed. A source check is worth exactly what you mutated against it.

### 3. A fifth open-coded copy of the hazard shape rule

M30c found `typeof h === 'string' ? { type: h } : h` open-coded in three places and fixed four. It
missed the fifth, in `flightAssist` — the same file it had just fixed. All five read `hazardName()`
now.

### Dead code removed, all verified by hand first

| | why it was dead |
| --- | --- |
| `util.js` `fmt`, `pad` | helpers nothing has ever called; the codebase uses `toFixed` inline |
| `economy.js` `RESOURCES` | a currency list nothing iterates — the three names appear as object literals, not a loop |
| `landing.js` `severityNow` | a wrapper whose doc said *"for the HUD and the debug overlay"*; neither calls it |
| `missions.js` `AUTHORED_MISSIONS` | an index map nothing reads — `CHAPTERS` is the one in use |
| `planeticons.js` `PLANET_ICON_IDS` | an id list nothing reads |
| `render.js` `ENVELOPE` import | imported, never referenced |
| `style.css` `.is-done` | a route-card state class **M27 stopped emitting when it removed replay** |

**46 more exports are used only inside their own file** and were deliberately left. Stripping an
`export` keyword is churn with no behavioural gain, and `missions.js` exporting each chapter by name
is legible documentation of what is in there.

### The doc that cost this session a detour

`docs/ARCHITECTURE.md`'s dev-hook table listed `__flyHeadless`, `__runAllHeadless` and `__runChapter`
beside the always-present hooks. They live in `test/autopilot.js` and **do not exist until it is
injected** — which cost about twenty minutes of hunting a bug that was a missing script tag. They are
in their own section now, with the injection snippet.

It also now records that **`__goMission` does not launch**: without a following `__act('launch')` the
state never reaches `play`, `__advance` does nothing, and a scripted flight reports a timeout with a
full tank — which reads exactly like a broken autopilot, and did.

Three hooks that exist and were undocumented — `__setState`, `__openSettings`, `__audio` — are listed.

### One bug I introduced, and what caught it

Pointing the tilt gauge at `ship.envelope` reached for a `ship` that `drawTiltGauge` has never had.
**Every node test passed** — they never render. The browser threw on the first `__draw()`. The safe
angle is a parameter now.

`node test/run-all.sh` cannot see a rendering fault. That is not new, but it is worth writing down
next to the reminder that a screenshot found the `[object Object]` forecast a day earlier.

### Audited and found clean

- **Every other content→table lookup is complete**: planet icons, `WORLDS`, `chapterFor`,
  `RECOMMENDED`, summaries, display names, and every rare material is spent by some hangar rung.
- **No other module-level constant is baked from tunable config** — the envelope was the only one.
- **Nothing outside `ship.js` reads raw `SHIP.*`** except `validate.js`, which uses it deliberately:
  a mission is validated against a *stock* lander, which is the conservative direction.
- No `TODO`/`FIXME`, no stray `console.log`, and every `==` is an intentional null check.

### What did not move

Both fixtures byte-identical. Full suite green — the campaign crossing is **642/800 (80%)** and every
encounter-audit figure is identical to the run before the audit started. `forces-tests.js` 100 →
**133**, `loadout-tests.js` 136 → **151**.

---

## Where 1.0 stands (measured 2026-08-22, after M30e)

Counted against the spec's own "Full 1.0 target" (section 18), not against intent.

| 1.0 target | built | short by |
| --- | ---: | ---: |
| 10 bodies | **10** | — |
| 50 missions | **50** | — |
| seven component tracks at four levels | 5 tracks (all reach L4) | **2 tracks** |
| all 30 skill nodes | 12 (3 trees × 4) | **18 nodes** |   ← 21 / **9** after M34
| ten active modules | 5 | **5** |   ← 8 / 2 after M32, **10 / 0 after M33**
| ten passive modules | 4 | **6** |   ← 9 / **1** after M31
| full eight-enemy roster | 2 of the roster, + 1 original | **6 designs** |
| materials, blueprints, checkpoints, save migration, accessibility | done | — |

**The enemy count in both documents was wrong** and this is where it surfaced. They said "three of
eight exist" and then named **six** remaining, which does not add up. The Mast Sniper is Tom's own
design (M29e) and is **not** on the spec's roster, so the roster still owes six, not five. Corrected
in `ROADMAP_STATUS.md` and `docs/ARCHITECTURE.md`.

### Phase 8 acceptance criteria

| criterion | state |
| --- | --- |
| no route softlocks | `route-tests.js` 99/99, every ladder id has an authored chapter |
| no save loss across the upgrade path | `save-tests.js` 83/83, versioned migration from the `tv_*` keys |
| all 50 missions validate on an automated seed | 50/50 structural, sanctuary 20/20 on all 40 armed |
| no unavoidable damage from untelegraphed hazards | every hazard with a boundary draws it; `falseRadar` is asserted presentation-only |
| controls retain the original feel | both fixtures byte-identical since M0; `pro` is the original law to 1e-9 |
| **human playtest completion of all 50** | **not done — the one criterion no test can close** |

Accessibility is complete against the Phase 8 list: shake, flash, `highContrast`, `uiScale`, keyboard
remapping, three steering modes, and controller remapping since M30. **Achievements are the one
Phase 8 line deliberately not built** — the spec gates them behind stable progression.

### Codebase health

| | |
| --- | ---: |
| src | 14,060 lines, 34 modules |
| …of which comment | 3,617 (0.38 per code line) |
| …executable | 9,625 |
| content-shaped modules | 2,104 lines |
| tests | 5,447 lines, 18 files (0.57 per code line) |

**Module count has not moved since M27** — 34 then, 34 now. Growth since is content and prose:
of the 3,391 lines added, **1,557 (46%) are comments**.

25 of 34 modules import three things or fewer, the graph is a DAG the bundler enforces by
topological sort, and `util.js` is the only widely-shared module at 22 importers — a pure-helper leaf,
which is the right thing to be shared.

**Three hot spots, and they are the honest answer to "is it still manageable":**

| | lines |
| --- | ---: |
| `screens.js:screenHTML` | **627** (a 624-line `switch`) |
| `render.js:drawTerrain` | **483** |
| `actions.js:act` | **365** |

Eight functions exceed 150 lines. All three are flat dispatch or flat drawing rather than deep logic —
`screenHTML` is one case per screen and `act` one case per verb — so they are long rather than
complex, and splitting them would trade one long file for a directory. Worth knowing before the next
screen or verb is added: **that is where the friction will be.**

The drawing layer is the least explained part of the tree — `hud.js` 14% comment, `debug.js` 7%,
`particles.js` 2%, against `route.js` 110% and `economy.js` 99%. Every fault this project has recorded
came out of the rules layer, which is the annotated half; the drawing half has been quiet, but M30e's
one self-inflicted bug (`drawTiltGauge` reaching for a `ship` it never had) came from exactly there,
and **no node test renders**.

---

## M30f — the skills all work; one component rung does not (2026-08-22)

Tom, on the 1.0 count: *"so some skills are not yet implemented?"* Two different things could have
been true and only one of them is, so it was worth measuring rather than answering.

### Every skill node works

All **12** authored nodes are live. Measured three ways:

- Each of the **14 effect keys** the trees produce is read by code outside the file that declares it.
- Each node, at **every rank**, moves exactly the values it declares and nothing else
  (`loadout-tests.js`, already in place).
- Every node is named in at least one test.

The 30-node figure is the spec's *target*: **18 nodes are not authored**. They are absent, not
broken, which is a different and much cheaper problem.

### But one thing is sold and not delivered, and the guard had stopped saying so

Of **33 effect keys** the game sells across skills, modules and components, **32 reach the
simulation. One does not:**

| | |
| --- | --- |
| key | `hazardLead` |
| sold by | **Sensors L3** (1.4) and **L4** (1.8) |
| L3 costs | **1,650 salvage + 3 tech cores + 40 Silica nanograins** |
| L3's blurb | *"Hazard trajectory prediction"* |
| read by | **nothing** |

L3's other effects — `predict` 1.4→1.9 and `beacon` 1.3→1.6 — do work, so the rung is not entirely
inert. But the feature it is *named for* does not exist, and tech cores only drop on a PERFECT
landing on a small pad, which makes this the most expensive hollow thing in the game.

### The guard that exists to catch this had gone quiet, in the way it exists to catch

`loadout-tests.js` has carried an M11 regression guard since M11: every declared effect key must be
read by some file outside the three that define them, with a `KNOWN_GAPS` list for anything
deliberately outstanding. `hazardLead` is on that list and used to print a `GAP` line every run.

It stopped, because **the check counted comments as readers**. Two comments name `hazardLead` — one
in `ship.js` explaining the fault it is the namesake of, and one I added earlier today in
`envelopeFor`'s doc — and a regex over raw source cannot tell prose from code. The moment the fault
was *documented*, the guard reported it as fixed.

That is precisely the fault the check exists to detect, occurring inside the check. It strips
comments before asking who reads a key now, and prints the gap again.

Mutation-tested: a comment naming a hollow key no longer silences it, and a newly-invented effect
with no reader still hard-fails.

### Left for Tom

**`hazardLead` is a design decision, not a repair.** Making Sensors L3 deliver what it advertises
means drawing where a hazard is *going* — the vents, the plumes, the sinking-air columns and the
radiation sweeps all move on a cycle already, so the data exists. The alternative is to re-describe
the rung around what it does deliver, which is cheaper and honest. It should not be quietly deleted:
it is the only rung on the Sensors track between L2 and L4.

---

## M30g — what 1.0 still owes, and the cards that recommended kit you cannot get (2026-08-22)

Tom: *"so what is still missing from the table above. leave more enemies for v1."* Enemies are
deferred by that decision. Counting what remains against the spec's named items — not counts — turned
up a live bug on the route screen.

### The route cards recommended 10 modules that do not exist

`RECOMMENDED` in `route.js` was a hand-written table of prose names listing the roster the spec
**plans**, beside a game that has 9 of the 20. **10 of its 20 entries named modules with no
implementation:**

| body | recommended | obtainable |
| --- | --- | --- |
| **Titan** | Atmospheric Control Surfaces, Aero-Brake Foil | **neither** |
| **Venus** | Ablative Acid Skin, Aero-Brake Foil | **neither** |
| Enceladus | Plume Vanes, Gyro Stabilizer | one |
| Io | Thermal Sink, Kinetic Bomb Rack | neither |
| Mercury | Thermal Sink, Thermal Purge | one |
| Pluto | Cryo Insulation, Countermeasure Flare | neither |

This is the expedition screen — where a player picks a body, reads *take: Ablative Acid Skin*, goes
to the loadout and finds nothing of the sort. **Four bodies recommended two unobtainable modules
each.**

**It was a second source of truth.** A module already declares which bodies it suits
(`good: ['VENUS']`) and `modules.recommendedFor` already reads that field — for the flight-assist
loaner, which is why *that* path never lied. The card had its own list, and the list drifted.

Derived from the same field now: one active and one passive, so it cannot name something
unobtainable, and a module added later appears on the right cards with no list to edit. Titan and
Venus honestly print *"nothing specialised yet"* — no built module is for thick air or acid, and
saying so beats naming two that do not exist. Asserted in `route-tests.js`; restoring the old table
raises **20 failures**.

**The near-miss worth recording:** the first version of that check compared `m.name` against the
recommendation and reported **20 of 20 missing**, including modules that plainly exist. Module names
are uppercase and the table was title case. A check that says *everything* is broken is usually the
check.

### What 1.0 still owes, by name

Enemies excluded per Tom's call. Against the spec's own section 18:

**Component tracks — 2 of 7 missing:** Power Core (module energy, recharge, one free activation) and
Utility Hardpoint (unlock the active slot, reduce cooldown, ordnance support).

**Skill nodes — 18 of 30 missing, six per tree.** Every built node works; these are unwritten, not
broken.  *(**9 of 30 after M34**, and Flight & Survival is complete at 10.)*

| tree | missing |
| --- | --- |
| Technician | Thermal Reclaimer, Redundant Feed Lines, Rapid Refit, Autonomous Repair, Universal Couplings, Phoenix Protocol |
| Combat | Hardpoint Calibration, Shaped Charges, Counter-Battery Logic, Ordnance Fabricator, Twin-Link Control, Combat Overdrive |
| Flight | RCS Finesse, Surface Adaptation, Emergency Arrest, Navigation Forecast, Steady Hands, Fourth Shuttle |

**Active modules — 5 of 10 missing:** Kinetic Bomb Rack, Optical Cloak, Repair Nanites,
Countermeasure Flare, Aero-Brake Foil.  *(2 of 10 after M32; **0 of 10 after M33** — all ten
actives exist.)*

**Passive modules — 6 of 10 missing:** Ablative Acid Skin, Thermal Sink, Cryo Insulation, Plume
Vanes, Atmospheric Control Surfaces, Salvage Magnet.  *(**1 of 10 after M31** — only the Thermal
Sink, and it is blocked on a number rather than on work. See the M31 section.)*

**Two bodies have no specialist module at all** — Titan (thick air, gliding) and Venus (dense drag,
acid), the two whose whole identity is the thing no module answers. *(Both answered in M31: Control
Surfaces and the Ablative Acid Skin.)* Titan is body 3 and Venus is the
finale. Of the eleven unbuilt modules, **Aero-Brake Foil serves both**, which makes it the single
highest-value one to build.

**Plus:** `hazardLead` sold and not delivered (M30f), and achievements, which the spec gates behind
stable progression.

### What did not move

Both fixtures unchanged. Full suite green. `route-tests.js` 99 → **124**.

## M31 — the gate, then five specialists (2026-08-22)

The first of the M31-M36 plan. **The gate goes in before the content**, because the plan adds eleven
modules and eighteen nodes on top of a check that had already been fooled once.

### What the old check claimed, and why it was not the claim

`loadout-tests.js` asked whether a declared effect key was **mentioned** by some file outside the
three that define them. That is how `hazardLead` passed for three milestones — the moment a *comment*
named it, the regex called it delivered — and M30f's repair (strip comments before searching) closed
only the narrowest version of the hole.

The general form is worse, and building the gate found it:

| | |
| --- | --- |
| key | `beacon` |
| sold by | Hardened Radar (1.5), **Sensors L2** (1.3), **Sensors L3** (1.6), Sensor Pulse (2.4) |
| read by | **nothing** |
| why the grep passed it | `abilities.js` contains the string `beacon`, reading `this.mod.effect.beacon` — the *module's own field*, never the loadout key |

M30f measured "32 of 33 keys reach the simulation". It was **31 of 33**. A file mentioning a name is
not a file acting on it, and that is the whole difference between the old check and this one.

### The gate: a witness per key, measured by running the code

Every key the game sells now names **how** it is delivered and **a measurement that runs the real
code with the declared number moved**. Turn the key on, measure again, and the number has to move.

| category | keys | what "delivered" means |
| --- | ---: | --- |
| flight | 29 | the lander behaves differently |
| economy | 2 | the run is paid differently |
| instrument | 6 | the player is shown something different, and the flight is untouched |
| **gap** | **1** | `hazardLead` — no witness exists, and it prints `GAP` every run |

It fails in both directions: a key with no witness is a hard failure, and a witness for a key nobody
sells is a hard failure the other way, so the table cannot fall behind the content. Two things were
found by writing it rather than by reading:

- **`impactResist` had a check that could not fail.** It scales the hull cost of a HARD or off-pad
  *touchdown* and nothing else; `ship.damage()` never reads it. The existing assertion was
  `stock.damage(20)` against `armoured.damage(20)` with `<=`, comparing 20 to 20. Its witness is a
  30 px/s arrival now: hull 75 stock, 88 with the key.
- **`fuelCapacity` never reached `flyMission`.** `main.js` multiplied `level.fuel` by it and the test
  rig did too; the pilot did not. **Every sweep ever flown with `opts.loadout` flew the engine track
  and the Reserve Tank on a stock tank.** `Ship.tankFor` is one rule with three callers now.

### And the sharper question: does *fitting* it change a flown mission?

Section 2 proves a key is read. Section 4 proves the thing a player chooses is worth choosing — fit
the module or buy the node, fly a real chapter with the real autopilot, and compare the flights.

**Every module is flown on every body its own `good` field claims**, which makes the claim testable
too: the route card is derived from `good` since M30g, so a lie there is a lie on the screen a run is
picked from.

| | missions of five that flew differently |
| --- | --- |
| ray-shield | EUROPA 3/5 home, 3/5 deep · GANYMEDE 1/5 · IO 3/5 home, 2/5 deep |
| magnetic-anchor | EUROPA 1/5 · ENCELADUS 3/5 |
| thermal-purge | PLUTO 1/5 deep |
| pulse-laser | LUNA 3/5 deep |
| fuel-recycler | LUNA 5/5, PLUTO 5/5, both routes |
| gyro-stabilizer | ENCELADUS 5/5, GANYMEDE 5/5, both routes |
| ice-cleats | EUROPA 5/5 home, 3/5 deep |
| **ablative-acid-skin** | VENUS 1/5 deep |
| **cryo-insulation** | PLUTO 1/5 deep |
| **plume-vanes** | ENCELADUS 4/5 deep |
| **control surfaces** | TITAN 5/5 and VENUS 5/5, both routes |
| **salvage-magnet** | LUNA 1/5 home, 2/5 deep |
| fuel-mix · reserve-tank · env-seals · inertial-dampers | 5/5 each |
| field-patching 2/5 · capacitor 2/5 · shield-harmonics 2/5 · reinforced-struts 1/5 · energy-on-kill 1/5 | |

Five things are declared off the flight path with a reason, and **the list fails the other way too** —
anything parked there that does move a flight is reported as a stale excuse. Sensor Pulse (what you
see), Hardened Radar (instruments), Salvage Drone and Black-Box (money), Threat Analysis (the arc).

### Three things the first version of section 4 got wrong, and each is the finding

**It read four things as inert that are not.** The first rigs put everything on the Moon's deep route.
A scan of all ten bodies against both routes found each one a place where it is visible:

```
field-patching     EUROPA/home 1/5  TITAN/deep 1/5  MARS/home 2/5  ENCELADUS 1/5  IO/home 1/5  VENUS/home 2/5
reinforced-struts  TITAN/home 1/5   TITAN/deep 1/5  VENUS/home 1/5
energy-on-kill     ENCELADUS/deep 1/5
shield-harmonics   GANYMEDE/deep 2/5  PLUTO/deep 1/5
```

The route is the argument. At the deep pad with machines up, four flights in five end as a crash and
a crash is insensitive to almost everything a module does; at the sanctuary pad **nothing can shoot
at you**, which is the M24 guarantee, so a weapon reads as decoration. Guessing the rig wrong looks
exactly like the module being decoration.

**The pilot only pressed an active when something was aiming at it.** M30a's firing policy is right
for a weapon and a shield and is nothing like what a player does with the rest, so the Magnetic
Anchor and the Thermal Purge were fitted, fired and **provably identical to an empty slot** across
whole chapters. Each active declares a `cue` now — `threat`, `final`, `status`, `blind` — and the
pilot presses on it. **`threat` is unchanged to the line**, so M30a's figures over 6,400 flights
still describe this policy.

**And the trace was rounded, which is a tolerance rather than a flight.** `x` to the pixel and
`fuelLeft` to a tenth. A Thermal Purge on pluto-5 cut peak cold from **68% to 32%** and restored
attitude authority from **0.838 to 1.000**, and the rounded trace read it as byte-identical. Compared
at full precision now — and deliberately **not** including the ability's own `fires`/`hit` counters,
because carrying those made every active differ from an empty slot for free, which is exactly the
fault the section exists to catch.

### The question nobody had asked: can the player get hold of it?

**Five of nine modules had no grant path at all.** The only unlocks were the two starter passives,
`MOON_BLUEPRINTS[0]` on a first chapter clear, and the weapon for surviving a mission that shot at
you. Ray Shield, Magnetic Anchor, Thermal Purge, Ice Cleats and Hardened Radar were reachable **only
under god mode** — which is exactly why it never showed in a playtest.

```
modules total        9
obtainable normally  fuel-recycler, gyro-stabilizer, sensor-pulse, pulse-laser
NEVER obtainable     ray-shield, magnetic-anchor, thermal-purge, ice-cleats, hardened-radar

EUROPA     active: ray-shield  <-- UNOBTAINABLE     passive: ice-cleats  <-- UNOBTAINABLE
MARS       active: sensor-pulse                     passive: hardened-radar  <-- UNOBTAINABLE
ENCELADUS  active: magnetic-anchor  <-- UNOBTAINABLE
MERCURY    active: thermal-purge  <-- UNOBTAINABLE
```

**This is M30g one level down.** That milestone stopped the route card naming modules with no
*implementation*, by deriving the advice from each module's own `good` field. Nobody then asked
whether an implemented module was **reachable** — so Europa's card honestly recommended Ice Cleats
and Ray Shield, and the player could never own either.

A cleared body hands over a blueprint for **the body you are about to fly**, derived from `good`
rather than from a second table — the same reason M30g gave for deleting `RECOMMENDED`. It never
grants a duplicate, and falls through to whatever is still missing so nothing is stranded. 13 of 14
modules after one full ladder; blueprints survive death, so the rest arrive on the next run.

Verified in the real game rather than only in node: a fresh save cleared the Moon through the real
settle closure and was handed the **RAY SHIELD** — Europa's recommended active, the body it is about
to fly.

### Mutation-tested, because a passing test is not a test that bites

| mutation | failures raised |
| --- | ---: |
| the blueprint grant removed | **7** |
| the gyro's spin damping made inert | 5 |
| the Thermal Purge stops purging | 3 |
| `flyMission` drops `fuelCapacity` again | 2 |
| Ice Cleats' grip does nothing | 2 |
| a new effect key nobody delivers | 2 |
| `beacon` read by nothing again | 1 |
| a comment naming `hazardLead` | 0 — and the `GAP` line still prints (the M30f regression) |
| the laser's reach cut back to 430 | 0 here, **2 in `enemies-tests.js`**, which owns that relationship |

### The five specialists

Each scales a channel that already exists, and each is proved above to change a flown mission on a
body it claims.

| module | what it does | why it is not just a resistance number |
| --- | --- | --- |
| **Ablative Acid Skin** | `corrosionResist` 0.55, Venus | the hull cost is driven by how far corrosion is past its bite, so one lever is both halves of "reduces acid and corrosion damage" |
| **Cryo Insulation** | `coldResist` 0.55, Pluto | — |
| **Plume Vanes** | `plumeLateral` 0.35, Enceladus | cuts the **sideways** shove and leaves the lift, per the spec. At 1.4 m/s² the column is free altitude; being thrown off the pad is what loses the mission |
| **Control Surfaces** | `glideTrim` 0.7 + `disturbanceResist` 0.85, Titan and Venus | attitude starts to mean something to the air |
| **Salvage Magnet** | `collectRadius` 1.5 | reaches cells, cargo **and ore** — a magnet that widened the reach for fuel and not for salvage would miss the thing it is named after |

**Control Surfaces measured live on titan-5 at 120 px/s**, against the real modules in the browser:

| nose | stock lift | with the foil |
| --- | ---: | ---: |
| flared away from travel (−0.45 rad) | 4.60 | **5.10** |
| level | 4.60 | 3.91 |
| tipped into the crossing (+0.45 rad) | 4.60 | **2.72** |

Stock, the only thing that decides how much the air holds you up is how fast you are going. The trim
term is zero at a level nose, so it is *authority*: what it is worth depends entirely on how you fly
it. Note the level row — the foil's `disturbanceResist` scales the raw lift too, so it trims about
15% off the float before the attitude term does anything. **That is stated on the module**; the first
version of the comment claimed the level case was identical to stock, and the browser said otherwise.

**Titan and Venus stop printing "nothing specialised yet"** on the expedition card, which is the
visible half of M30g:

```
TITAN      take: CONTROL SURFACES
VENUS      take: ABLATIVE ACID SKIN
```

### The sixth is not built, and the reason is arithmetic

**Thermal Sink is deliberately absent.** Heat rises only while thrusting and falls otherwise, so
whether it can ever bite is a question about burn *duty*, not about mission length:

| body | mission | rise | fall | bite | duty needed | duty a hover costs |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Mercury | 1–5 | 7–11 | 4–7 | 55–60 | 27–50% | **33%** |
| Io | 1–5 | 7–9 | 4.5–5 | 60 | 33–42% | **23%** |

And measured, flying every mission of both chapters:

```
MERCURY  heat 10  13  12  15  31      (bite 60/55)
IO       heat 12  12  13  13  15      (bite 60)
PLUTO    cold 32  53  47  48  68!     (bite 55)
VENUS    corrosion 31 36 33 41 42     (bite 45)
EUROPA   radiation 77 75 88 69 94!    (bite 55)
```

**On the two bodies that declare heat, heat never bites.** The autopilot's own thrust duty is 34–37%
on Mercury and 26% on Io, against a break-even of 33–50% — and `forces-tests.js` tunes these channels
at **50%** duty, which is a burn profile neither this pilot nor a hovering player has. A passive that
scales a channel with no consequence is a thing sold and not delivered, which is the one thing this
milestone exists to prevent. The number is M36's or Tom's; the module waits for it.

Worth reading beside it: **corrosion on Venus never bites either** (peaks 42 against 45), and cold
crosses on one Pluto mission out of five. Only Europa's radiation bites reliably. Four of the five
status channels are, in practice, gauges.

**Cryo Insulation claims Pluto only.** The spec lists Europa too, and Europa declares no `cold` at
all — its weather is ice underfoot and radiation overhead — so claiming it would be a route card
recommending kit that does nothing there, and the gate would have failed it.

### One bug introduced, and what caught it

Lifting `instrumentNoise` out of `drawHUD` orphaned the `rad` the hazard stack reads. **Every node
test passed**; the browser threw `ReferenceError: rad is not defined` on the first `__draw()`.

That is M30e's self-inflicted bug in the same place for the same reason — `./test/run-all.sh` cannot
see a rendering fault, because no node test draws — and it is the second milestone running in which
the only way it was going to be found was by looking at the screen.

The `beacon` delivery was checked the same way rather than trusted, sampling real pixels with the
throb pinned so the pulse could not confound it:

| gain | ink over the pad marker |
| --- | ---: |
| stock 1.0 | 1,441,121 |
| Hardened Radar 1.5 | 1,457,896 |
| Sensors L3 1.6 | 1,461,843 |
| Sensor Pulse 2.4 | **1,491,144** |

Monotonic in the gain. A fired pulse also had to be made to *stop* boosting when it ends — it never
did, and nothing had noticed because until this milestone nothing read `beaconBoost` at all. A
channel that is written and never read cannot be seen to leak.

### What did not move

**Both fixtures byte-identical.** Full suite green, and every encounter-audit figure identical to the
run taken before the first edit: campaign crossing **642/800 (80%)**, at-once distribution
0: 63.1% · 1: 25.9% · 2: 9.5% · 3: 1.4% · 4: 0.1%, deep-route engagement 751/800. The new modules are
optional kit and nothing baseline could move.

`loadout-tests.js` 150 → **285**, `forces-tests.js` 133 → **147**, `route-tests.js` 124 → **126**.

## M32 — the aero-brake, the nanites and the cloak (2026-08-22)

Three actives that needed no new system, built against the M31 gate. Every one had to change a flown
mission on a body its own `good` field claims before it counted as built.

| module | what it reads | flown |
| --- | --- | --- |
| **Aero-Brake Foil** | `ship.airBrake`, in `atmosphere` *and* `glide` | TITAN 5/5 home, 2/5 deep · VENUS 5/5 home, 1/5 deep |
| **Repair Nanites** | hull, over five seconds | MARS 2/5 home, 2/5 deep · VENUS 1/5 deep |
| **Optical Cloak** | `ship.cloaked`, at one predicate in `_stepEnemy` | TITAN 4/5 both · PLUTO 2/5 · GANYMEDE 1/5 home, 3/5 deep |

**Every body on the ladder now has an active it can be told to take.** Titan and Venus had neither
slot filled before M31 and have both after M32:

```
LUNA       PULSE LASER      / FUEL RECYCLER        GANYMEDE   SENSOR PULSE     / GYRO STABILIZER
EUROPA     RAY SHIELD       / ICE CLEATS           IO         RAY SHIELD       / (none)
TITAN      AERO-BRAKE FOIL  / CONTROL SURFACES     MERCURY    THERMAL PURGE    / (none)
MARS       SENSOR PULSE     / HARDENED RADAR       PLUTO      SENSOR PULSE     / FUEL RECYCLER
ENCELADUS  MAGNETIC ANCHOR  / GYRO STABILIZER      VENUS      AERO-BRAKE FOIL  / ABLATIVE ACID SKIN
```

Io and Mercury are the two left without a passive, and both are waiting on the same thing: the
Thermal Sink, held since M31 because heat does not bite on either of them.

### One field, two readers, because that is what a surface does

`ship.airBrake` multiplies drag in `atmosphere` and divides lift in `glide`. It **multiplies**
`level.drag` rather than adding to it, so the spec's *"poor in vacuum"* falls out of the arithmetic —
`0 × 2.6` is 0 — instead of being a special case somebody has to remember to write.

Measured live in the browser on titan-3, deployed at 130 px/s:

| | before | after 0.5 s |
| --- | ---: | ---: |
| ground speed | 129.8 | **108.8** |
| lift | 4.21 | **1.14** |

### The cloak is one predicate, and the reason it is one predicate

```js
const target = ship && !ship.cloaked ? ship : null;
```

At the top of `_stepEnemy`, so a drone's movement, a gun's sight check, its lead point and its shot
all see the same nothing. Wired only into `_sees` it would have left the most dangerous machine in
the game behaving exactly as before, because **ramming never goes through the sight check at all**.

Verified in the real game on ganymede-5, parked 240 px from a turret with two machines engaging:

```
before the cloak   recover, recover, idle, idle, idle
+1 s               recover, recover, idle, idle, idle
+3 s               recover, idle,    idle, idle, idle
+4 s               idle,    idle,    idle, idle, idle
```

Shots already in the air are deliberately untouched. A cloak breaks targeting; it does not erase a
bullet that has left the barrel.

**`cloakDrain` is the spec's "strong thrust disrupts it" as a cost rather than a switch**, and that
is a device-parity decision rather than a taste one. The keyboard answers exactly 1.0 or 0.0, so
"strong thrust" tested as a threshold means *any* thrust on a key — the module would work on a pad
and be useless without one. Draining the timer with the throttle scales with whatever the player is
actually holding and reads the same on both: about 6 s coasting, about 2 s under a full burn.

### Both are on screen, because an absence is not feedback

The whole of the cloak is that the machines stop reacting, and *nothing happening* is
indistinguishable from the module having failed. So the lander goes translucent and breathes, and
burning brings it back toward solid — the same thing the drain is doing to the timer, said in the
one place the player is already looking.

Measured on the hull region, in pixels:

| | ink | of solid |
| --- | ---: | ---: |
| uncloaked | 3,389,854 | 100% |
| cloaked, coasting | 2,283,162 | **67%** |
| cloaked, full burn | 3,916,290 | 116% — the exhaust plume *is* the give-away |

It never goes fully invisible: you still have to fly it. The foil draws as two swept surfaces off the
hull, and only while `airBrake > 1`, which is the same value the forces read.

### Five mutations raised zero failures, and every one was a real hole

This is the whole reason for doing it, and it is the second milestone running in which the first
pass of a test suite proved less than it looked like it proved.

| mutation | before | after |
| --- | ---: | ---: |
| the foil never falls away when it ends | **0** | 1 |
| the cloak never falls away when it ends | **0** | 1 |
| a drone rams you through the cloak | **0** | 2 |
| nanites are never interrupted by a hit | **0** | 1 |
| the foil's lift half removed | **0** | 1 |
| nanites heal past the hull maximum | 0 | 1 |
| the atmosphere ignores the foil | 1 | 1 |
| machines see through the cloak | 2 | 4 |
| burning no longer spends the cloak | 2 | 2 |
| nanites heal nothing | 1 | 2 |
| **the anchor leaks** (an M12 module) | 0 | 1 |
| **the pulse's beacon gain leaks** (the M31 bug) | 0 | 1 |

**The teardown check is stated as a property of every active, not per module.** Snapshot the lander,
run the module out, run one step of physics, and require the ship back — with an explicit list of
what each module is *meant* to leave behind (the nanites' hull, the purge's gauges). Written that way
it covers the anchor and the M31 beacon leak as well, and it covers a module built next year that
nobody has written a test for yet.

`env` is deliberately **not** exempted even though two modules write it. `applyForces` owns that
object and resets every channel at the top of each step, so the honest test is to run the step that
restores it. The first version exempted `env` wholesale and would have missed a module leaking a
channel `applyForces` does not reset.

### And the drone rig had to be rebuilt before it measured anything

A seeker drone holds a **195 px** standoff ring and rams at **44 px**, so a drone only ever rams a
lander that flew into *it*. The first version of the ram test sat 60 px away, watched the drone back
off to its ring, and proved nothing — the mutation that lets a drone chase a cloaked lander raised
zero failures against it. It is two checks now: parked on top of a machine for the ram path, and
420 px out for the shadowing, which is the behaviour the ram is only a consequence of.

### What did not move

**Both fixtures byte-identical.** Full suite green, every encounter-audit figure identical: campaign
crossing **642/800 (80%)**, at-once distribution 0: 63.1% · 1: 25.9% · 2: 9.5% · 3: 1.4% · 4: 0.1%,
deep-route engagement 751/800.

`loadout-tests.js` 285 → **304**, `enemies-tests.js` 99 → **125**.

**17 modules now, against one blueprint per body cleared.** 13 of 17 after a full ladder and the rest
on the next run, which the gate asserts. Worth watching rather than changing: a typical run reaches
body 3–4, so it is three or four blueprints a run and roughly five runs to hold everything. That is
the only progression that compounds across deaths, so a slow drip is the design — but it is now slow
enough to be a decision somebody should take deliberately.

## M33 — the bomb rack and the flare (2026-08-22)

The two actives the plan called *real features*: the first with physics of its own, the second with a
hand in the enemy field. Both had to change a flown mission on a body they claim before they counted
as built.

| module | flown |
| --- | --- |
| **Kinetic Bomb Rack** | IO 1/5 home, 2/5 deep · PLUTO 1/5 deep |
| **Countermeasure Flare** | EUROPA 4/5 both routes · TITAN 4/5 both · GANYMEDE 1/5 home, 3/5 deep |

### The M12 telegraph discipline, turned on the player's own weapon

M12 says a machine shows you the shot before it takes it, and `muzzleIsSafe` says a shot may never
appear already touching the lander. Turned around, that is three rules, and all three are **enforced**
rather than merely drawn:

1. **It cannot go off inside you.** A charge is inert for its first 0.35 s — it does not detonate on
   contact and damages nothing. Released a hand's breadth off the deck it is simply gone.
2. **It goes off where you can see it will.** The blast circle is on screen *while the fuse burns*,
   at the radius the charge will actually use. The ring appearing is itself the tell that the thing
   is now live.
3. **It does not care whose lander it is.** The same falloff applies to the ship as to a machine.

Verified in the game rather than argued: dropped over an Io turret from 300 px and left to sit, the
blast **killed the turret and killed the lander** — from a hull already at 50 after enemy fire. The
screenshot taken a second earlier shows the lander plainly inside its own dashed circle. That is the
decision the module exists to create, and a weapon that is safe to stand next to would not be one.

### Two numbers authored from measurement

**`bombFuse` is 5 s because of how far a charge falls.** Released with 40 px/s of separation at the
Moon's 28 px/s², a 2.4 s fuse covers **215 px** — so a charge dropped from a normal crossing altitude
expired in mid-air over empty ground and the weapon quietly did nothing. At 5 s it covers about
550 px there and 290 on Enceladus.

**`good` claims Io and Pluto.** Mercury was the obvious third on the design reasoning — a bomb
answers a thing that cannot move, and Mercury is a turret-and-sniper body — and was **measured and
dropped**. Across every body, flying the rack with the `overhead` cue:

```
           home            deep
LUNA       0 fires         2 fires,  0 kills
EUROPA     3 fires         3 fires,  0 kills
TITAN      3 fires, 1 kill 3 fires,  1 kill
MARS       0 fires         2 fires,  0 kills
ENCELADUS  1 fire          6 fires,  0 kills
GANYMEDE   0 fires         0 fires
IO         1 fire,  1 kill 3 fires,  2 kills
MERCURY    0 fires         1 fire,   0 kills
PLUTO      0 fires         2 fires,  1 kill
VENUS      0 fires         0 fires
```

Read it as a floor, not a verdict: `overhead` is opportunistic — it fires when the pilot *happens* to
be above a machine — and a person who decides to overfly a gun will connect far more often than a
pilot that never detours. But a claim nothing can show is exactly what `good` is not allowed to be.

### The flare is the cloak's other half

The cloak says *there is no lander*; a decoy says *the lander is over there*. It pulls **drones
only** — a dug-in gun keeps shooting at you, which is what stops it being a second cloak and is what
the spec asks for. `_moveDrone` takes what it flies at and what it may ram as **separate arguments**,
so a decoyed drone cannot ram a lander it is not chasing.

`ship.decoy` is the same channel `ship.cloaked` uses: a field on the lander that the machines read,
so `enemies.js` still knows nothing about modules.

**Pluto is deliberately not claimed.** The flare does two things and this project can measure one:
pulling drones moves a flown mission, and lighting the ground is presentation, which no autopilot
here can see — the blind spot `falseRadar` and `darkness` have had since M24. Pluto is the body the
light would matter most on and **the one body with no drones at all**, so claiming it would be a
route card recommending kit on a promise nothing can check. The light is real; the claim is only what
can be shown.

### Nine mutations raised zero failures on the first pass

| mutation | before | after |
| --- | ---: | ---: |
| the blast has no falloff | **0** | 1 |
| a charge never detonates on the ground | **0** | 3 |
| a charge never detonates on a machine | **0** | 1 |
| the fuse never expires | **0** | 1 |
| the flare pulls turrets too | **0** | 1 |
| the flare never lets go of the decoy | **0** | 1 |
| a drone rams a decoyed lander anyway | **0** | 1 |
| a charge arms instantly | 1 | 2 |
| the blast does not hurt the player | 1 | 2 |
| ordnance stops when the module closes | 4 | 11 |

**The two detonation triggers cover for each other.** Over a turret standing on the ground, removing
either one leaves the other to catch the charge and the blast lands in the same place. Each needed
its own rig: empty ground for the surface trigger, and a drone held still in mid-air for contact —
the only case where the ground is hundreds of pixels away.

**And the M32 teardown check should have caught the decoy leak and could not.** Its snapshot skipped
falsy values and walked only the keys it saw *before*, so a field that starts `null` and is left
holding an object was invisible to it — which is exactly the shape of `ship.decoy`. It compares the
**union** of both sides now, and the first thing the repair found was that `ship.shieldFactor` is
written by the Ray Shield and reset by its teardown while never being declared in `reset()`: a lander
that had raised the shield once carried a field a fresh one did not have. Harmless as it stood, and
the same rule as `beaconBoost` — a field the ship uses belongs in `reset`, or *"the ship is back as
it was"* stops being a statement anything can check.

### Two rigs measured nothing until they were rebuilt

**Falloff is a claim about distance**, and on real terrain distance is the wrong number: dropped
120 px to one side of wherever the generator had put a turret, the ground height between the two
points differed by more than the offset and a charge that should have clipped the edge of the blast
measured **zero at both radii**. The machine is *placed* now, not found — same fix in both suites.

That is the third milestone running where the first version of a rig proved less than it looked like
it proved (M31's routes, M32's drone standoff, M33's terrain). The pattern is worth naming: **a rig
built from whatever the world happened to generate is measuring the world, not the rule.**

### What did not move

**Both fixtures byte-identical.** Full suite green, every encounter-audit figure identical: campaign
crossing **642/800 (80%)**, at-once 0: 63.1% · 1: 25.9% · 2: 9.5% · 3: 1.4% · 4: 0.1%, deep-route
engagement 751/800. The recommendation table is unchanged — the new actives are declared **after** the
Pulse Laser precisely so they can only fill an empty slot, never displace a decision somebody took.

`loadout-tests.js` 304 → **324**, `enemies-tests.js` 125 → **140**.

**19 modules now**, 13 of them after one full ladder. The blueprint drip is the thing to watch: see
the note at the end of the M32 section.

## M34 — nine skill nodes, and the first finished tree (2026-08-22)

Nine of the eighteen missing nodes, all needing no system this build does not already have.
**Flight & Survival is complete at 10 of 10** — the first of the three trees finished. Technician
goes to 5, Combat to 6; **21 of the spec's 30**.

| tree | added |
| --- | --- |
| Flight & Survival | RCS Finesse · Surface Adaptation · Emergency Arrest · Navigation Forecast · Steady Hands · Fourth Shuttle |
| Technician | Phoenix Protocol |
| Combat | Counter-Battery Logic · Twin-Link Control |

Four are proved by the flown gate — Surface Adaptation EUROPA 5/5, Emergency Arrest VENUS 5/5,
Twin-Link LUNA 3/5, and the existing rigs unchanged. The other five change what a player is *shown*
or what a **run** is rather than how a mission flies, and are declared with a reason apiece.

### RCS Finesse is keyboard-neutral by arithmetic, not by convention

"Smaller minimum side-thruster pulses" means nothing to a key, which answers exactly 1.0 or exactly
0.0. The node raises a fractional attitude command to a power, which shrinks it — and
`Math.pow(1, x)` is **1** and `Math.pow(0, x)` is **0** for any positive x, so the two values a
keyboard can produce come back untouched.

That turns "stick only" from a note in a blurb into a test: the spin after a held key is asserted
**bit-identical** with the node and without, in both burners, and it is why the node is excused from
the flown gate — a boolean pilot cannot see it, and that is a fact about the pilot rather than an
excuse about the node.

*(The first version of that check pushed only the right burner, so dropping the shaping from the
**left** line raised nothing at all — half a node, silently uncovered.)*

### Emergency Arrest: four refusals and one use

The spec asks for *"close to upright and just above a safe surface … a short high-thrust braking
pulse at a large fuel cost"*. Every number in it is a refusal:

| | |
| --- | ---: |
| fires below | 200 px |
| and inside | ±24° of upright |
| and only while descending faster than | 6 px/s |
| takes off the sink rate | 92 px/s |
| costs, of a full tank | **25%** |

**Each refusal was a mutation that raised zero failures until it was written down.** So was "once a
mission", and so was the fuel cost.

It is a rebindable action like any other (`f`, `pad:3`) — `ACTIONS` is derived from `DEFAULT_KEYS`,
so the settings screen, the rebind rules, the save format and the pad all learned about it without
being told, which is what the M30 binding work was for.

The HUD says whether it would fire *right now*, reading `ship.canArrest` — the same question
`ship.step` asks, not a copy of the three conditions. A control that silently refuses three presses
in four is the Pulse Laser's dry press again (M30a), and the answer to that was to make the state
readable rather than to loosen the rule.

Verified in the game on venus-2: fuel 100% → 75%, V-SPD 45 → −46.4, the cue reading **ARREST FIRED**.

**And the "one press, one pulse" rule needed a lander that could physically fire twice.** With the
single charge the node grants, "fires on the edge" and "fires while held" are indistinguishable — the
charge runs out either way — and at a gentle 40 px/s the pulse takes the lander out of its own window
before a second substep. Measured at 200 px/s with two charges, where the difference is one charge
against none.

### Twin-Link's reach was wrong, and the gate caught it before it shipped

The first cut was 260 px — half the beam's own reach, which *sounded* like "nearby". It changed
nothing in any flown mission on any body. Measured over **664 machines** across every mission of
every chapter:

| distance to the nearest *other* machine | |
| --- | ---: |
| minimum | 231 px |
| p10 · p25 | 255 · 299 |
| **median** | **455** |
| p75 · max | 821 · 2527 |

| arc reach | reaches a second machine for |
| ---: | ---: |
| **260** (first cut) | **12%** of machines |
| 300 | 25% |
| 360 | 36% |
| 420 | 45% |
| **460** (shipped) | ~50% |
| 560 | 59% |

460 is the median: it chains about half the time, which is the spec's *"can chain to a nearby
machine"* rather than "always hits two", and it stays inside the beam's own 520 px reach so the arc
can never find something the laser could simply have targeted instead. Both bounds are asserted
against the constants they answer — `COMBAT.minSpacing` below, `ABILITY.laserRange` above — which is
the M30a rule: **a number nobody asserted is a number that drifts.**

This is the first time that rule has caught something *before* it shipped rather than four
milestones later.

### The gate could not see the arc, and the reason was the trace again

Even at 460 the flown gate read Twin-Link as inert. Instrumented, the arc was live for **1,662
substeps across 50 flights** — it was working, and the trace could not see it, because it compared
`kills` and a wounded machine is not a kill.

`field.summary()` reports `hpLeft` now: hull left standing on the field, of which a kill is one
threshold. Twin-Link reads LUNA 3/5 with it. Same shape as M31's rounded trace, one level up — the
measurement was of the wrong quantity rather than at the wrong precision.

### Two repairs the milestone forced

**`skillFeatures(meta)` is one place deciding what a career unlocks.** It was already copied between
the screen that draws the nodes and the action that buys one, and M34 gave the copies a second field
to disagree about (`cleared`, for the Fourth Shuttle's five-body gate). `cleared` counts **distinct
bodies ever finished**, not this run's — skills are wiped on death and the *right* to buy one should
not be, or the capstone would be unreachable by anybody who had ever lost a run.

**`settings-tests.js` moved the booster onto a hard-coded `f`**, which M34 gave to Emergency Arrest.
`rebind` correctly refused — it would have left an action with no keyboard control — and the test
died on a null. It derives a free key from `DEFAULT_KEYS` now. The rule under test was right and the
constant was stale, which is what a hard-coded key does every time the default map grows.

### One edit that hit the wrong call site

`drawTelegraph(ctx, e, type, time, opts)` appears in **two** functions, and the Counter-Battery mark
went into the first one — `drawLethalWarnings`, which only draws machines already in `telegraph`.
The witness read unchanged and said so.

That is precisely what `test/mutate.sh` refuses to do (*"target appears twice — make it unique, or
you are not mutating what you think you are"*), and I did not apply the same care editing by hand.

### What did not move

**Both fixtures byte-identical.** Full suite green, every encounter-audit figure identical: campaign
crossing **642/800 (80%)**, at-once 0: 63.1% · 1: 25.9% · 2: 9.5% · 3: 1.4% · 4: 0.1%, deep-route
engagement 751/800.

`loadout-tests.js` 324 → **396**, `enemies-tests.js` 140 → **149**, `skills-tests.js` 76 → **111**,
`settings-tests.js` 188 → **193**, `route-tests.js` 126 → **128**.

The Fourth Shuttle is the one node here that touches the attrition curve the whole run model rests on
(M27, decision 4). It is gated behind five bodies cleared, as the spec asks, and **its effect on run
length is not measured yet** — that is M36's job, with everything in.

## M35 — five per tree, and the two holes that were not about the count (2026-08-22)

Tom's call after seeing the screen M34 produced: *"we have way too many skills, there should only be
5 in each path."* **Eight nodes cut, two built, board at 15.**

### The measurement that decided what to cut

The node count was not the problem. The tier structure was:

```
                    T1                        T2                          T3            T4
TECHNICIAN          fuel-mix, field-patching  black-box, salvage-drone    -- none --    phoenix
FLIGHT & SURVIVAL   x3                        x3                          x3            fourth-shuttle
COMBAT SYSTEMS      capacitor, threat-anal.   harmonics, energy, counter  twin-link     -- none --
```

**Technician had no tier 3 and Combat had no tier 4.** Trimming to five fixes neither; building
`autonomous-repair` and `combat-overdrive` did. Every tree is **T1, T1, T2, T3, T4** now with the
capstone behind the tier-3, and the three capstone paths landed within 10 research of each other
without being tuned to:

| tree | cheapest path to the capstone | data |
| --- | --- | ---: |
| Technician | field-patching → black-box → autonomous-repair → phoenix-protocol | **515** |
| Flight | reinforced-struts → surface-adaptation → emergency-arrest → fourth-shuttle | **515** |
| Combat | capacitor → shield-harmonics → twin-link → combat-overdrive | **505** |

Every rank of all fifteen: **2,885** research, against ~**298** banked in a typical run.

### Combat Overdrive, measured in the running game

Flown on `luna-4` at seed 4242, hovering so the lander survived the window and the bill:

```
 s   overdrive  overheat  engineThrust
0.5      4.49       0        130.0
1.5      3.49       0        130.0
2.5      2.49       0        130.0
3.5      1.49       0        130.0
4.5      0.49       0        130.0
5.0         0     3.99        93.6      <- the window closes into the bill
6.0         0     2.99        93.6
```

93.6 is 130 × 0.72 exactly. And the recharge half, with the laser spent and cooling:

| | cooldown |
| --- | ---: |
| laser spent | 4.17 s |
| pressed | 4.12 s |
| **+0.5 s into the window** | **1.12 s** |

3.0 s of cooldown drained in 0.5 s of flight — 6x, as declared. On screen the panel reads
**OVERDRIVE 4.4s** in cyan while it runs and **ENGINE HOT 2.9s** in red afterwards, stacked above the
ARREST cue with no overlap; the laser panel reads CHARGING with a visibly filling bar.

### Autonomous Repair — the rig was wrong first, for the third milestone running

MARS/deep read **0/5**. At the prize pad with machines up, four flights in five end as a crash, and a
crash is insensitive to 20% more hull knitted back. Scanned across five bodies and both routes:

```
MARS/home 2/5    MARS/deep 0/5
VENUS/home 0/5   VENUS/deep 1/5
LUNA/home 0/5    LUNA/deep 2/5
EUROPA/home 2/5  EUROPA/deep 0/5
TITAN/home 1/5   TITAN/deep 1/5
```

MARS is what the nanites themselves claim, so MARS/home is the rig.

### What each cut took with it

Seven of the eight cut nodes were the **only** thing selling their effect key:

| cut | mechanic removed | lived in |
| --- | --- | --- |
| Inertial Dampers | **nothing** — `disturbanceResist` has three other sellers | — |
| Salvage Drone | missions paid more | `main.js` |
| Environmental Seals | a general resist answering **every** channel | `forces.js` |
| Steady Hands | instruments settled after two still seconds | `hud.js` |
| Navigation Forecast | cards gave up their held-back hazard | `screens.js`, `route.js` |
| Counter-Battery Logic | a near miss painted its firer | `enemydraw.js`, `main.js`, `enemies.js` |
| Energy on Kill | a kill returned a charge | `abilities.js` |
| RCS Finesse | analog fine control near centre | `ship.js` |

### Mutation-tested

| mutation | failures raised |
| --- | ---: |
| the node grants no overdrive | 6 |
| it fires on every press rather than once a mission | 4 |
| the engine never derates | 4 |
| a sixth node added to a tree | 4 |
| autonomous repair is ignored | 3 |
| the recharge does nothing | 2 |
| the shield boost does nothing | 2 |
| the overdrive never charges its bill | 2 |
| the overheat replaces the weather derate instead of composing | 1 |
| the sliding burn forgets the derate | **0** → 1 after a structural check |
| held rather than edge-triggered | **0** → 1 after the rig was rebuilt |

**Both zeros were real holes.** The second is the one worth remembering: with the single charge the
node grants, "fires on the edge" and "fires while held" are indistinguishable — which is **exactly the
trap M34 recorded on Emergency Arrest**, walked into again by the session that had just read it. Two
charges and a hold that outlasts the window *and* the bill is what tells them apart.

The first is a different shape: `engineThrust()` has two callers and one of them — the recovery burn
while a touchdown is still sliding — is too narrow for any flight to reach. It is asserted in the
source instead: outside `engineThrust`, nothing in `ship.js` touches `spec.thrust` or the derate.

### One pre-existing bug, found by looking at the screen

The CONTROLS screen titled **Emergency Arrest as `undefined`** and had done since M34:

```
before:  MAIN BOOSTER · LEFT BURNER · RIGHT BURNER · ATTITUDE HOLD · ACTIVE MODULE · undefined · undefined
after:   MAIN BOOSTER · LEFT BURNER · RIGHT BURNER · ATTITUDE HOLD · ACTIVE MODULE · EMERGENCY ARREST · COMBAT OVERDRIVE
```

`ACTIONS` is derived from `DEFAULT_KEYS` and the human label is the one thing that derivation does
not carry, so a new control gets a row for free and gets `undefined` for free with it — `BUILDERS`
from M29 in a fourth place. Asserted in both directions in `settings-tests.js` now, from the source.

And the assertion's own first version was spliced **inside the `check` helper**, so it never ran and
the mutation that removes a label raised zero. Running `mutate.sh` on a test you just wrote is how
that surfaced.

### What did not move

**Both fixtures byte-identical**, which is the load-bearing result: `rcsFinesse` came out of the
control path and the general hazard resist out of `forces.js`, and both were arithmetically inert at
a stock loadout. Full suite green. Every encounter-audit figure identical: crossing **642/800 (80%)**,
at-once 0: 63.1% · 1: 25.9% · 2: 9.5% · 3: 1.4% · 4: 0.1%, deep-route engagement 751/800.

`loadout-tests.js` 396 → **350**, `skills-tests.js` 111 → **109**, `enemies-tests.js` 149 → **163**,
`settings-tests.js` 193 → **211** — 4 of those with no edit at all, because `ACTIONS` is derived
from `DEFAULT_KEYS` and the overdrive is a rebindable action; the rest are the label guard above.

## M36 — the heat number moves, and the twentieth module (2026-08-22)

The balance pass. Three things were queued for it; one of them turned out to be a **bug** rather than
a balance question.

### Heat had been inert since M5, and it is arithmetic

Whether heat can bite is a question about **burn duty**: it accumulates only above
`fall / (rise + fall)`. Measured fresh before anything was touched:

```
           burn duty   peak heat (bite 60)     break-even duty the authoring asked for
MERCURY      34-37%          10-31                          33-50%
IO           25-28%          10-15                          33-50%
```

Re-authored per body from that measured duty — Mercury `heatFall` 1.45, Io 0.8 for a similar rise,
because Io's pilot burns nine points less of the mission. `HEAT.bite` 60 → **55**, lining it up with
`COLD.bite`.

| peak heat | 1 | 2 | 3 | 4 | 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mercury, way home | 40 | **58** | 30 | **68** | **76** |
| Mercury, prize route | 35 | 24 | 21 | 46 | 49 |
| Io, way home | 42 | 48 | 48 | **61** | **65** |
| Io, prize route | 28 | **69** | **83** | 40 | 32 |

`mercury-3` is **COLD TRAP** and stays the cool one — authored as high rise on a high fall, an engine
making heat freely on ground that takes it away. The first cut of this pass flattened it into the
ramp before the name had been read.

### The finding: heat was made by a button

`thermal` read `ship.thrusting`, a boolean. A keyboard hover is a **pulse train at full throttle**; a
pad hover is a **held fraction** that reads as thrusting 100% of the time. Same flight, roughly twice
the heat on a pad.

Fixed in two halves, and both are needed:

| | keyboard, 50% duty | pad, 0.5 held |
| --- | ---: | ---: |
| boolean `thrusting` | rises half the time | rises **all** the time |
| magnitude, cooling only while coasting | rises half, cools half | rises half, **never cools** |
| magnitude, cooling always | `rise×0.5 − fall` | `rise×0.5 − fall` |

Asserted over 8 s: keyboard and pad within 0.5 of a point, and a quarter throttle makes measurably
less than a half.

**Two wrong turns, both caught by measuring rather than by reading:**

- `ship.throttle` is the **smoothed** value the exhaust plume uses; it lerps toward zero without
  arriving, so read as "is the engine on" it is on forever after the first burn. Every mission pinned
  at 100.
- The parity rig ran 30 s and **both sides hit the 100 clamp**, agreeing for the wrong reason — the
  mutation that puts cooling back in the coasting branch raised **zero failures** against it.

### The floor rule now asks what it meant to ask

It asserted ">10 s to bite" at a flat **0.5 duty**, which M31 had already recorded as a profile
neither the pilot nor a hovering player has. Derived now from `gravity / SHIP.thrust`:

| | hover throttle | time to bite, mission 5 |
| --- | ---: | ---: |
| Mercury | **33%** | 17 s |
| Io | **23%** | 23 s |

Those are the two figures M31 measured by hand. In the browser on `mercury-5` at **full** throttle
held down: bite at 4.5 s, derate floor (0.55) at 9 s, and it recovers the moment you let go.

**The `ENGINE HEAT · THRUST DOWN` warning fired for the first time since M5.** It was built with the
channel and had been unreachable.

### The Thermal Sink — 20 of 20

`heatResist` 0.6 slows what the engine puts in, `heatShed` 1.7 speeds up what the hull sheds — the
spec's two halves, on opposite terms. Flown **MERCURY/home 3/5, IO/home 2/5, IO/deep 2/5**.

**Every body on the ladder now has both slots filled.** Io and Mercury were the two with no passive.

Knock-on: the **Thermal Purge** went `PLUTO/deep 1/5` → `MERCURY/home 3/5 · IO/home 2/5 · IO/deep 2/5
· PLUTO/deep 1/5`. It always claimed those bodies; giving the channel a consequence made it work.

### The Fourth Shuttle buys a mission and a half

40 seeded runs of the real ladder, real pilot, a shuttle per crash and the mission retried:

| profile | 3 shuttles | 4 shuttles | change |
| --- | --- | --- | --- |
| cautious (safe pad) | 1.02 bodies · 9.97 missions | 1.07 · **11.45** | **+15% run length** |
| greedy (prize every 3rd) | 0.05 bodies · 5.22 missions | 0.10 · **6.50** | **+25%** |

The attrition curve survives it. Absolute figures describe the instrument — this pilot has no
loadout, no skills, no weapon and no evasive logic — so the **ratio** is the finding.

*(The first rig ended the run on the first crash and reported 0 bodies cleared for every seed at both
shuttle counts. A measurement that says nothing is a broken measurement.)*

### Combat Overdrive is a real trade, and is left alone

```
LUNA/deep     kills 3->4   hull 60->60   enemy hp left 287->282
MARS/deep     kills 6->5   hull 70->60   enemy hp left 246->259    worse
IO/deep       kills 6->8   hull 60->70   enemy hp left 213->182    better
MERCURY/deep  unchanged
```

No landing outcome moved on any body. Not retuned — no complaint to aim at.

### What moved, and what did not

**Campaign crossing 642/800 → 641/800 (80%).** One flight in eight hundred, with heat biting on ten
missions, because heat costs **thrust** — recoverable — rather than hull.

**Physics fixture byte-identical**, which is the load-bearing result: it replays a fixed input script,
so `throttleCmd` provably did not touch the flight model. **Flight fixture 5 of 186 moved**, all
Mercury and Io, every grade unchanged, fuel left the difference (`mercury-2` 44.8 → 34.5) — a derated
engine burns more. Re-recorded.

Audit: deep-route engagement 751/800 and the at-once distribution identical; flight time 1.18x →
1.17x; sweep-everything landings 114/1000 → 111/1000.

`forces-tests.js` 147 → **160**, `loadout-tests.js` 350 → **359**.

## M37 — two active modules (2026-08-22)

Tom's playtest call: *"you need laser for enemies. playtest have shown that everyone picks the laser
and keeps it. so two active modules from now on."*

**A finding about a choice that was never offered.** Ten actives had been built, each proved to change
a flown mission on a body it claims and each made obtainable — and none of that mattered, because the
one slot they competed for was already spoken for by the weapon.

| | before | after |
| --- | --- | --- |
| active slots | 1 | **2** — `E` / `X`, pad X / **Y** |
| Emergency Arrest | `f`, pad **Y** | `f`, pad **LB** |
| a module in both slots | — | refused; picking it in the other **moves** it |

Verified in the game: Pulse Laser in slot I and Ray Shield in slot II, fired on `E` and `X`, **both
active in the same substep**, separate charge pools, both panels stacked on the HUD with the arrest
and overdrive cues lifted above them.

### Two mutations raised zero, and one of them cannot be tested any other way

| mutation | before | after |
| --- | ---: | ---: |
| a module may sit in both slots | 12 | 12 |
| the save drops the second slot | **0** | 1 |
| the second slot is built empty | **0** | 1 (structural) |
| only the first slot is stepped | **0** | 1 (structural) |

The save coercion was simply untested. The other two are `main.js` — **the game loop, which no node
test can execute** — so they are asserted from the source, the same answer M36 gave for
`engineThrust`'s second caller.

### What did not move

**Both fixtures byte-identical.** Crossing 641/800, deep-route engagement 751/800, at-once
distribution and every other audit figure unchanged. This adds a slot rather than power to a slot.

**What has not been measured**: what *two* actives do to the crossing. The loadout gate flies modules
one at a time and the pilot presses on a single cue, so this instrument cannot answer it. A human can.

`skills-tests.js` 109 → **127**, `enemies-tests.js` 163 → **173**, `settings-tests.js` 220 → **223**,
`save-tests.js` 83 → **86**.

## M39 — one list, pick two (2026-08-22)

Tom on the M37 loadout screen: *"This is not good design to have the slots twice."* Correct — the
same ten modules drawn twice is a table, not a choice.

| | M37 | M39 |
| --- | --- | --- |
| the screen | two identical grids, one per slot | **one grid** |
| which button | a heading above each grid | **a badge on the fitted tile** |
| choosing | pick within a slot | **order of picking decides**: first `E`/X, second `Q`/Y |
| a third pick | — | refused, with a reason |
| second-slot keyboard key | `x` | **`q`** — pad X is slot *one*, so `x` was two X's on one screen |

Verified in the game: laser badged `E`, shield badged `Q`, a third pick refused with
*"Both active slots are taken. Tap one to free it."* and nothing changed, tapping the laser off
freeing slot I while the shield kept `Q`, and the next pick landing back in slot I.

**One mutation raised zero**: hard-coding the first slot when removing a module. With only a
slot-I removal under test, "free the slot it is in" and "always free slot I" are the same thing — the
check had to remove from slot II to tell them apart. Same shape as M35's edge-versus-held trap, which
also needed a second case before it could fail.

Both fixtures byte-identical, crossing 641/800, every audit figure unchanged.
`skills-tests.js` 127 → **149**.
