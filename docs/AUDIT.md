# Auditing this codebase

Written 2026-08-22 for a reviewer who did not build it, by the model that did. The job is finding
bugs, not adding features — the game is content-complete and published.

**Read this before `ROADMAP_STATUS.md`.** That file is 2,000 lines of what was built and why; this
one is where the bugs actually are.

```bash
./test/run-all.sh 20        # everything. ~4 minutes. 2,406 assertions, 12 suites, 2 fixtures, 2 sweeps
node test/loadout-tests.js  # the gate. ~4 s, and the one that catches the most
./test/mutate.sh …          # break the code on purpose (§4)
./macos/build.sh            # the only check that executes the game loop. Run it AFTER committing
```

`./macos/build.sh` ad-hoc-signs and launches a `.app`, and doing that **revokes the agent's macOS
access to `~/Desktop`** until the app is relaunched. Commit first. This has cost real time twice.

---

## 1. Start here: everything green is not everything covered

The suite is 2,406 assertions and passes. **It cannot see three whole classes of fault**, and every
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

Ordered by what I would look at first.

> **Updated after the second audit (2026-08-22).** Two sessions, sixteen faults, **every one in a
> blind spot named in §1.** Leads **1**, **2** and **7** are closed; **3** and **4** are surveyed and
> clean but unenforced; **5** and **6** are untouched and are design calls rather than repairs. Of §3a, **A** found a sixth occurrence, **B** found one, **C** is closed and **D**
> found one. The findings are in `test/BASELINE.md` under "The first audit" and "The second audit".
> Read them before starting: they are the best available evidence of what this codebase's bugs
> actually look like.

### 1. ~~The exemption list is only half-checked~~ — **CLOSED** (`27bd46d`)

The gate's `NOT_IN_FLIGHT` reverse check ran only for modules, so four skill nodes were excused on a
plausible sentence. It checks nodes too now. *Kept here because it is the worked example: a guard
that covers half its own list reads exactly like a guard.*

<details>
<summary>the original finding</summary>

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

</details>

### 2. ~~Two active modules~~ — **CLOSED** (`test/slot-order.js`)

The first audit found two slot-interaction bugs here: `sensor-pulse` and `thermal-purge` wrote
visibility as a **max and a min in slot order**, so which slot a module sat in decided the sky
(measured 0.35 against 1.0); and `flightAssist` could loan a module already held in the other slot,
duplicating it. The second audit did the other 43 pairs.

**720 ordered comparisons** — 45 pairs × 4 firing schedules × 2 loadouts × 2 beds — replicating
`simulate`'s exact per-step order and diffing every observable field, discovered by walking the
objects rather than from a list. **One divergence**, `repair-nanites` + `bomb-rack`, bounded at
exactly one simulation step: the rack is the only thing that wounds the lander from *inside* a slot's
update, and the nanites' interrupt reads `hull`. The interrupt fires in both orders, one tick apart,
and the hull differs by one tick of repair (0.075 bare, to five decimals). Left alone and bounded by
assertion rather than fixed — see `test/BASELINE.md`, "Lead 2 closed".

It is now a gate in `run-all.sh` rather than a lead here. **Two things about it are worth carrying
into whatever you audit next:**

- **It carries a positive control and prints what it caught.** Three separate versions of this rig
  reported a clean zero, and only the last zero meant anything: the first had the lander outside the
  laser's 520 px reach so nine pairs measured an inert slot, and the second put the Titan station at
  **x = −7 on a 3,000 px map**. A sweep reporting zero is indistinguishable from a sweep that is not
  looking, so the file ends by building a pair that *is* order-dependent and failing if it cannot see
  it. **Any rig whose finding is an absence needs one of these.**
- **A finding that vanishes when you fix the rig is not automatically an artefact.** The nanites/bomb
  divergence disappeared at a valid station — and was still real. The mechanism had been reasoned out;
  it was then *placed* rather than hunted, and it reproduced exactly. §4's rule cuts both ways.

It is deliberately **not** in `mutate.sh`'s suite list (~10 s), so a mutation that breaks
commutativity raises zero there. `run-all.sh` is what catches it.

<details>
<summary>the original wording of this lead</summary>

M37 gave the lander two active slots. **The loadout gate flies modules individually** and the test
pilot presses on a single cue, so *nothing has ever measured two actives in one mission* except one
hand-written check that a shield and a foil overlap. Interactions between simultaneously-held modules
are unexplored: shared ship fields, teardown order, two modules writing the same channel.

Look at what each active writes on the ship (`anchor`, `shieldActive`, `shieldFactor`, `airBrake`,
`cloaked`, `decoy`, `beaconBoost`) and ask which pairs collide.

</details>

### 3. Source-grep assertions are text checks wearing a test's clothes — **surveyed, still open**

> The second audit added five more of them and verified each *by mutation* rather than by reading:
> the crash classifier, the hazard-death table, the bite table, the dangling-`g` scan and the audio
> guards all fail when the rule they guard is broken, and the crash-log one fails on the exact line
> that shipped. The existing ones were not re-verified one by one. **That is still the job here**, and
> `mutate.sh` is still how.


Five test files use `readFileSync` to assert things about source text rather than behaviour:
`loadout-tests`, `settings-tests`, `forces-tests`, and both fixtures. They exist because the rule
genuinely cannot be reached any other way (see §1), but they are brittle in a specific direction:
**a refactor that changes formatting can make them vacuously true.** For example
`settings-tests.js` requires `/g\.slots\s*=\s*ACTIVE_SLOTS\.map\(/` to appear in `main.js`. Rename or
reformat and the check silently stops checking.

Verify each one still fails when the rule it guards is broken. `mutate.sh` is how.

### 4. `level.__forces` is cached on the level object — **surveyed clean, still unenforced**

`forcesFor(level)` memoises onto a non-enumerable `__forces` property. **A level mutated after its
forces are first built keeps the old forces.** The test rigs avoid this by spreading into a fresh
object; nothing enforces that. If any code path edits `level.hazards` in place after a mission has
started, the weather silently will not change.

> Checked in the second audit and currently safe: nothing in `src/` assigns `level.hazards`,
> `.visibility`, `.wind`, `.gust`, `.drag` or `.gravity` after construction, and every builder in
> `forces.js` is a pure function of `(ship, level, t, dt, terrain)` holding no mutable closure state —
> so the cache cannot go stale and cannot carry flight state between missions. **Nothing asserts any
> of that**, and the levels the cache is written onto are module-level constants that live for the
> whole session, so the day a per-run scale or an in-place hazard edit arrives this becomes a fault
> with no test to catch it. Worth a guard more than another survey.

### 5. `hazardLead` — sold, not delivered

The Sensors track's L3 (700 salvage + two materials) advertises "Hazard trajectory prediction" and
nothing reads it. It is the single entry on `KNOWN_GAPS` and prints a `GAP` line on every gate run.
Known, recorded, real: **the player is charged for it.**

### 6. Four of five status channels barely bite

Measured, not guessed: corrosion on Venus peaks at 42 against a bite of 45; cold crosses on one Pluto
mission in five. Heat was in this state from M5 until M36 and its passive could not honestly be built
until the number moved. These two were deliberately left — no complaint to aim at — but if you are
looking for "sold and not delivered", this is where the next one would be.

> **Re-measured in the second audit and this still holds — read the 42 as a median, not a ceiling.**
> Per Venus mission over 20 seeds, the median peak is 54 / 35 / 18 / 44 / 48, so on three of the five
> the typical flight never reaches the bite; but the *tail* does, 35 of 100 flights, up to 86. So the
> balance complaint is unchanged and still a decision. What was a fault, and is fixed, is that those
> 35 flights got no warning: the callout fired at a flat 60 rather than at `ACID.bite`. **Do not read
> the fix as having moved this lead** — the channel bites exactly as rarely as it did.

### 7. ~~Save migration~~ — **CLOSED** (`dd09303`)

A numeric field of the wrong *type* fell through to `+=` string concatenation. Wrong-typed numerics
fall back to their defaults now, with tests. `save` went 86 → 92 assertions.

---

## 3a. New leads, from what the first audit actually found

These come from the *shape* of the eleven faults rather than from reading the code cold. They are the
highest-value place to start.

### A. The M29 name-table fault, occurrence six — **found, and it was a number**

A name in content indexing a table in code, failing **silently**. It has now been found five times:
`BUILDERS` (hazard names), `flightAssist`'s tips, the expedition card's `[object Object]`, the
CONTROLS screen's `undefined` labels, and the brief's HAZARD row. **Only three files read
`hazardName`/`hazardSpec`: `route.js`, `forces.js`, `screens.js`** — and the fifth fault was a reader
that did not use them at all.

So the question is not "are the three readers right", it is **"who else prints or switches on a
content name without going through the accessor"**. Look for `switch` and `if` chains over mission,
hazard, module, planet or enemy ids anywhere in `screens.js`, `hud.js` and `render.js`.

> **The sixth was found, and it was not a name.** The three `hazardName` readers are right, the three
> remaining `switch` statements in the browser-only files are all over internal tags, and
> `describeThreats`/`planetIcon` both filter or fall back. The occurrence was **the same fault in
> numbers**: `HEAT.bite` and the rest defined in `forces.js` and re-typed as literals in `hud.js` and
> `main.js`, where two of them had drifted and a third disagreed with itself two lines apart. Same
> silence, same shape, no string involved.
>
> **So widen the search from names to values.** Anywhere a presentation file states a threshold that
> a simulation file owns, it is one edit away from lying, and no test draws. `STATUS_BITE` is now the
> pattern to copy: one exported table, read by every reader, asserted complete against its own
> constants and asserted to be the *only* thing the readers compare against.

### B. Silent-drop channels — **found: the crash line's `reason`**

`gamelog` drops `undefined` fields silently, so *every* landed entry shipped without its numbers and
nothing noticed. **Anywhere that serialises an object field-by-field has this hole.** The playtest log
is the one Tom pastes into chat, so a field that quietly vanishes is a debugging tool lying. Check
every `Log.log(` call site against the object it reads from.

> **Found on the crash line, and it was worse than a drop.** All eighteen call sites were read against
> their objects; seventeen are clean. The eighteenth read `g.crashReason` — **a property nothing has
> ever assigned** — so the field did not vanish, it silently took the fallback, and every lander lost
> to a gun, a ram, its own charge or the weather was recorded as `reason=impact`. A channel that is
> always populated and always wrong is worse than one that is empty, because nothing about the log
> looks broken.
>
> The general guard is now in `settings-tests.js`: every `g.X` read in `main`/`screens`/`actions`
> against everything anything assigns. It fails on the line that shipped. The same scan was run by
> hand over `ship`, `meta` and `run` and those are clean — but only `g` is enforced, so **extend the
> scan rather than re-running it** if you want this class closed properly.

### C. Anything added in M35–M40 that touches a device or a screen — **CLOSED**

Three of the eleven faults were **new features that never reached the touch layer** (MODULE II,
ARREST, OVERDRIVE — all purchasable, none pressable on a touch device). The pattern: a feature is
built, bound on keyboard and pad, tested headlessly, and the fourth input path is forgotten. Audit
every action in `DEFAULT_KEYS` against the touch buttons in `index.html`, and against the pad.

> Re-audited in the second audit: all eight actions in `DEFAULT_KEYS` have a touch button in
> `index.html`, a `bindTouchButton`/`bindAction` wiring in `main.js`, and a pad token. **Nothing the
> game sells is unreachable on any of the four input paths.** One loose end, deliberately left because
> it is a design call and not a fault: `t-ability` is the only touch button never hidden, and with
> nothing fitted in slot one it is completely inert — no sound, no ring, no text. See the second
> audit's "Observed, not changed".

### D. Voices that hold a gain — **found: a guard made unreachable**

Two audio faults were voices built or held open when they should not have been. `audio.js` has no
unit suite at all. Every `setTargetAtTime` that ramps *to* a value is a candidate for never being
ramped back.

> Every one of them was walked in the second audit and none *holds* a gain — but the opposite fault
> was there: **a voice that has already arrived being re-scheduled every frame, forever.** `silence()`
> cleared `_mainOn`/`_rcsOn` before calling `engines`, which made M16's dedupe guard unreachable, and
> the frame loop calls `silence()` every frame the game is not in play. Measured live on the title
> screen at **240 automation events a second** — the same figure M16's own comment records. `laser`
> and `setWind` were asked every frame with no guard at all.
>
> **So the question for this file is both directions**: what ramps up and never comes down, *and*
> what is written when nothing has changed. Both are inaudible to every test in the repo; the browser
> is the instrument, and patching `AudioParam.prototype.setTargetAtTime` and counting is the method.

---

## 4. How to verify a finding here

**A passing test is not a test that bites, and this is the house rule.**

```bash
./test/mutate.sh src/forces.js 'const d = drag * (ship.airBrake || 1);' 'const d = drag;'
```

One exact string replacement, the unit suites, a count of what each lost, the file restored on a
trap. **Zero failures is the finding, not the result** — it means nothing was checking the behaviour
you just deleted.

Tally so far: M31 9 mutations / 0 real holes, M32 10/**5**, M33 15/**6**, M35 11/**2**, M39 4/**1**,
second audit 6/**3** (and the other three were the new guards, run to prove they bite).

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
- **the reach** — the slot-order sweep parked the lander wherever `width * 0.3` fell, outside the
  beam's 520 px, so `pulse-laser` fired at nothing and nine of its pairs measured one live module
  against an inert slot. It reported a clean zero.
- **the map** — the fix for that took `enemies[0].x - 200` unconditionally and put the Titan station
  at **x = −7 on a 3,000 px level**, then reported an order-dependence from outside the world.

**Place the thing your claim is about. Do not go looking for it.** And when a measurement says
*everything* is broken, or *nothing* is, suspect the measurement first.

**Two corollaries, both paid for by the slot-order sweep.**

*A rig whose finding is an absence must prove it can see.* Three versions of that sweep reported a
clean zero and only the last one meant anything. So it ends by constructing a fault of the shape it
is hunting and failing if it does not catch it, and it prints what it caught. **If your conclusion is
"nothing is wrong", the rig needs a positive control before that sentence is worth writing down.**

*And the rule cuts both ways: a finding that disappears when you fix the rig is not automatically an
artefact.* The one real divergence in that sweep vanished at a valid station — because the rig had
stopped creating the condition, not because the mechanism was imaginary. It was reasoned out, then
**placed**, and reproduced exactly. Do not let "the rig was wrong" become a reason to stop looking.

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
skill trees. 2,406 assertions, a gate that refuses anything sold and not delivered, and mutation
testing on everything added in the last ten milestones.

**The layer between the simulation and the player is the untested part** — the loop, the screens, the
dispatch, the audio. That is 3,384 lines that no automated check executes, and it is where all three
shipped crashes came from.

If your audit finds nothing in `src/main.js`, `src/screens.js`, `src/actions.js` and `src/audio.js`,
be suspicious of the audit.
