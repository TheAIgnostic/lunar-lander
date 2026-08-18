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
