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
