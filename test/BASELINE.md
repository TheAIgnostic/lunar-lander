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
