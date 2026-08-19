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
