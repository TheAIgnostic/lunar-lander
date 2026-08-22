# Auditing this codebase

Written 2026-08-22 for a reviewer who did not build it, by the model that did. The job is finding
bugs, not adding features — the game is content-complete and published.

**Read this before `ROADMAP_STATUS.md`.** That file is 2,000 lines of what was built and why; this
one is where the bugs actually are.

```bash
./test/run-all.sh 20        # everything. ~4 minutes. 2,348 assertions, 11 suites, 2 fixtures, 2 sweeps
node test/loadout-tests.js  # the gate. ~4 s, and the one that catches the most
./test/mutate.sh …          # break the code on purpose (§4)
./macos/build.sh            # the only check that executes the game loop. Run it AFTER committing
```

`./macos/build.sh` ad-hoc-signs and launches a `.app`, and doing that **revokes the agent's macOS
access to `~/Desktop`** until the app is relaunched. Commit first. This has cost real time twice.

---

## 1. Start here: everything green is not everything covered

The suite is 2,348 assertions and passes. **It cannot see three whole classes of fault**, and every
bug found by a human in the last four sessions was in one of them.

| blind spot | size | what shipped through it |
| --- | --- | --- |
| **no node test executes the game loop** | 3,384 lines across `main.js`, `screens.js`, `actions.js`, `state.js`, `audio.js` | 3 crashes (below) |
| **no node test draws** | all of `render.js`, `hud.js`, `enemydraw.js`, `drawkit.js` | 6 expedition cards printing `[object Object]` |
| **no node test listens** | all of `audio.js` | a voice leaking between missions since M29f; a bed mixed in dB that sounded wrong |

Seven modules have no direct unit suite at all: `audio`, `debug`, `drawkit`, `gamelog`, `particles`,
`planeticons`, `state`.

**If you have limited time, spend it in those files.** Reading `main.js` and `screens.js` line by
line for undefined identifiers, stale references and half-finished refactors is, on this codebase's
history, the highest-yield thing you can do.

---

## 2. The three faults that shipped, and they are one fault

All three were **a free variable on a path no node test can execute**:

| milestone | what | how long it was live |
| --- | --- | --- |
| M30e | a gauge read a `ship` it never had | until the next browser load |
| M31 | extracting a function orphaned the `rad` it used | until the next browser load |
| **M35** | removing a skill deleted `bonus`, and one of its three uses survived in `Log.log('kill', …)` | **two commits, published** |

The M35 one froze the game the instant the laser destroyed anything. Every suite passed the whole
time.

**So: grep for identifiers that are used but never declared or imported, in the five browser-only
files.** There is no linter in this repo and `node --check` only catches syntax. A real scope
analysis over those files is worth more than any test you could write.

The mitigation added afterwards is `macos/build.sh`'s self-test, which now **flies a mission, fires a
module and requires something to die** before it passes. It catches this class — but only on the code
path it happens to fly (LUNA 4, pulse laser, one kill). It proves nothing about the other 49 missions,
the other 19 modules, landing, banking, the supply stop, or any screen.

---

## 3. Leads worth pulling, ranked

Ordered by what I would look at first. **Lead 1 is a verified gap I found while writing this and
deliberately did not fix**, so you have one worked example of the shape.

### 1. The exemption list is only half-checked — *verified, unfixed*

`test/loadout-tests.js` §4 keeps `NOT_IN_FLIGHT`: things excused from "fitting this must change a
flown mission", each with a written reason. The file claims the list "fails the other way too" — an
excuse that is stale gets reported.

**It only does that for modules.** The loop reads:

```js
const mod = moduleById(id);
const node = findNode(id);
check(`NOT_IN_FLIGHT names something real: ${id}`, !!(mod || node));
if (!mod) continue;              // <-- every skill node leaves here
```

So **the four skill nodes on that list are never verified to be off the flight path**:
`fourth-shuttle`, `phoenix-protocol`, `black-box`, `threat-analysis`. A node parked there with a
plausible sentence is trusted forever. That is precisely the fault the list exists to prevent, and
this project has been caught by a stale list four times.

Worth doing: give nodes the same reverse check, and see whether all four are honest.

### 2. Two active modules, measured one at a time

M37 gave the lander two active slots. **The loadout gate flies modules individually** and the test
pilot presses on a single cue, so *nothing has ever measured two actives in one mission* except one
hand-written check that a shield and a foil overlap. Interactions between simultaneously-held modules
are unexplored: shared ship fields, teardown order, two modules writing the same channel.

Look at what each active writes on the ship (`anchor`, `shieldActive`, `shieldFactor`, `airBrake`,
`cloaked`, `decoy`, `beaconBoost`) and ask which pairs collide.

### 3. Source-grep assertions are text checks wearing a test's clothes

Five test files use `readFileSync` to assert things about source text rather than behaviour:
`loadout-tests`, `settings-tests`, `forces-tests`, and both fixtures. They exist because the rule
genuinely cannot be reached any other way (see §1), but they are brittle in a specific direction:
**a refactor that changes formatting can make them vacuously true.** For example
`settings-tests.js` requires `/g\.slots\s*=\s*ACTIVE_SLOTS\.map\(/` to appear in `main.js`. Rename or
reformat and the check silently stops checking.

Verify each one still fails when the rule it guards is broken. `mutate.sh` is how.

### 4. `level.__forces` is cached on the level object

`forcesFor(level)` memoises onto a non-enumerable `__forces` property. **A level mutated after its
forces are first built keeps the old forces.** The test rigs avoid this by spreading into a fresh
object; nothing enforces that. If any code path edits `level.hazards` in place after a mission has
started, the weather silently will not change.

### 5. `hazardLead` — sold, not delivered

The Sensors track's L3 (700 salvage + two materials) advertises "Hazard trajectory prediction" and
nothing reads it. It is the single entry on `KNOWN_GAPS` and prints a `GAP` line on every gate run.
Known, recorded, real: **the player is charged for it.**

### 6. Four of five status channels barely bite

Measured, not guessed: corrosion on Venus peaks at 42 against a bite of 45; cold crosses on one Pluto
mission in five. Heat was in this state from M5 until M36 and its passive could not honestly be built
until the number moved. These two were deliberately left — no complaint to aim at — but if you are
looking for "sold and not delivered", this is where the next one would be.

### 7. Save migration

`coerceMeta` merges onto defaults. Fields added over 40 milestones; only some have explicit coercion.
A save from an older build that carries a field of the wrong *type* (not just missing) is not
obviously handled. `save-tests.js` covers corruption and missing fields, less so wrong types.

---

## 4. How to verify a finding here

**A passing test is not a test that bites, and this is the house rule.**

```bash
./test/mutate.sh src/forces.js 'const d = drag * (ship.airBrake || 1);' 'const d = drag;'
```

One exact string replacement, the unit suites, a count of what each lost, the file restored on a
trap. **Zero failures is the finding, not the result** — it means nothing was checking the behaviour
you just deleted.

Tally so far: M31 9 mutations / 0 real holes, M32 10/**5**, M33 15/**6**, M35 11/**2**, M39 4/**1**.

When one raises zero, ask which of three it is before writing an assertion:

1. **Nothing checks it.** Write the check.
2. **Something else covers for it.** Two triggers where either suffices — each needs a rig where it
   is the only one that can fire.
3. **Nothing can reach it.** `main.js` is unreachable from node; a *structural* assertion is the
   honest answer, not a rig that cannot exist.

### The rigs lie, and they lie in one direction

Five milestones running, the first version of a measurement proved less than it looked like it
proved. Always the same shape: **the rig was built from whatever the world generated, so it measured
the world rather than the rule.**

- **the route** — modules flown to the deep pad, where four flights in five end as a crash and a
  crash is insensitive to almost everything. Four things read as inert that are not.
- **the geometry** — a drone parked 60 px away to test ramming; ram range is 44 px and its standoff
  ring is 195, so it politely backed off.
- **the terrain** — blast falloff measured against a machine wherever the generator put one; the
  ground height between the points differed by more than the offset under test.
- **the axis** — self-harm measured by stepping sideways while the charge landed 120 px *below*, so
  the offset under test was swamped by the one that was not.
- **the ceiling** — an audio parity rig where both sides pinned at a clamp and therefore agreed.

**Place the thing your claim is about. Do not go looking for it.** And when a measurement says
*everything* is broken, or *nothing* is, suspect the measurement first.

---

## 5. Do not "fix" these — they are decisions

Each cost an argument. Changing one is reopening it, not repairing it.

| looks wrong | is deliberate |
| --- | --- |
| 15 skill nodes, the spec says 30 | Tom's call. `skills-tests.js` fails on a sixth node in any tree, and on a tier shape other than T1,T1,T2,T3,T4 |
| 3 enemies, the spec lists 8 | Tom deferred the other six to v1 |
| no module *energy* anywhere | this build has charges and a cooldown. Four spec nodes and a whole component track wanted energy; all dropped |
| a cleared body cannot be re-flown | the attrition curve the run model rests on |
| god mode never loses a shuttle | test switch, Tom's request |
| `classic` steering is not an angle spring | you would need two hands to translate; `direct` already exists |
| the pilot lands 74% PERFECT | it is an autopilot, not a proxy for a person. Landing bands await human data |
| `titan-5` takes the prize 0–2/20 | authored to be flown on the air; the pilot has no glide planning |
| the campaign crossing is 80%, not 100% | M24, with the number in front of him. The guarantee is the pad, not the route to it |

Two constants that are asserted against *relationships*, not values — read the assertion before
touching either: `ABILITY.laserRange` (against every machine's engagement range) and
`ABILITY.twinLinkReach` (between `COMBAT.minSpacing` and the beam's own reach).

---

## 6. What must not move

`node test/physics-fixture.js` and `node test/flight-fixture.js` print **`unchanged`**. The physics
fixture replays a fixed input script and moves only when the simulation moves; the flight fixture
records autopilot outcomes and moves when either the game or the pilot changes.

If either moves, that is a real change or a bug, and it needs a sentence in `test/BASELINE.md` saying
which. The encounter audit at the end of `run-all.sh` is a **measurement, not a gate** — but every
figure in it has been stable for ten milestones, so a change should be explained:

```
campaign crossing 641/800 (80%)   deep-route engagement 751/800 (94%)
machines at once  0: 63.1%  1: 25.9%  2: 9.5%  3: 1.4%  4: 0.1%
```

---

## 7. Where the real risk sits

An honest summary from the model that wrote it:

**The simulation is the well-tested part** — physics, terrain, forces, economy, the loadout, the
skill trees. 2,348 assertions, a gate that refuses anything sold and not delivered, and mutation
testing on everything added in the last ten milestones.

**The layer between the simulation and the player is the untested part** — the loop, the screens, the
dispatch, the audio. That is 3,384 lines that no automated check executes, and it is where all three
shipped crashes came from.

If your audit finds nothing in `src/main.js`, `src/screens.js`, `src/actions.js` and `src/audio.js`,
be suspicious of the audit.
