# Working on the tests

What each suite covers is in `docs/ARCHITECTURE.md` under **Tests**; every figure they have ever
produced is in `test/BASELINE.md`. This file is the two procedures that are not obvious from reading
either — how to check a test *bites*, and how to add something the game sells to the gate that
guards it.

```bash
./test/run-all.sh 20        # everything. minutes.
node test/loadout-tests.js  # the gate. ~4 s, and the one you will run most.
./test/mutate.sh …          # break the code on purpose (below)
```

---

## 1. A passing test is not a test that bites

**Every real fault in M30–M33 was found by breaking the code on purpose, by looking at the screen, or
by a human.** None was found by reading. So the last step of any change here is not "the suite is
green", it is "the suite goes red when I put the fault back".

```bash
./test/mutate.sh src/forces.js 'const d = drag * (ship.airBrake || 1);' 'const d = drag;'
```

One exact string replacement, the unit suites, a count of what each one lost, and the file put back
on a trap. It refuses a target it cannot find and refuses one that appears twice, because a mutation
you cannot locate exactly is a mutation you are not making.

**Zero failures is the finding, not the result.** It means the behaviour you just deleted was never
being checked by anything. That is the point of doing it, and it has paid every time:

| milestone | mutations tried | raised **zero**, i.e. found a hole |
| --- | ---: | ---: |
| M31 | 9 | 0 |
| M32 | 10 | **5** |
| M33 | 15 | **6** |
| M35 | 11 | **2** |

(M31's two zeros were not holes: one was the M30f regression behaving correctly — a comment naming a
key must *not* silence the gap line — and the other was owned by a different suite. Check which you
have before writing anything.)

Among the zeros were a module that never let go of the lander (so one charge cloaked you for the rest
of the mission), a drone that rammed a lander it could not see, blast damage with no falloff, and a
`ship.decoy` the teardown check was structurally unable to see.

### What to mutate

Aim at the **rule**, not the code. Good mutations delete a *decision* somebody took:

- a guard: `if (!armed)` → always armed; `Math.max` → `+`; a clamp removed
- a teardown: the line that puts a field back when a module ends
- an argument: the one that decides *what* a machine chases, or *which* pad is flown
- a constant the design rests on: a reach, a radius, a threshold
- a whole half of an effect: one field read by two places, with one read removed

If you cannot think of a mutation for a line, that is worth noticing on its own.

**And a trap this file has now been caught by after describing it.** M34 recorded that an
edge-triggered control granted **one** charge cannot be distinguished from a held one — the charge is
gone either way — and M35's Combat Overdrive walked into the same thing: the mutation that removes the
edge check raised zero against a rig with one charge. Give the rig two, and hold the control past
every window that would block a second firing. **Reading a lesson is not the same as having it.**

**Some rules cannot be reached by behaviour at all, and those get a structural check.** M35's second
zero was the recovery burn that runs while a touchdown is still sliding: a real second caller of
`engineThrust()`, too narrow a path for any flight in any suite to cross. Rather than build a rig for
it, `loadout-tests.js` asserts the *source* — outside `engineThrust`, nothing in `ship.js` touches
`spec.thrust` or the derate. Reach for this when the honest answer to "why does nothing catch it" is
"nothing goes there", not "nobody wrote the check".

### When one raises zero

Do **not** reach for the assertion that would make it fail. Ask first which of these it is, because
two of the three are not test problems:

1. **Nothing checks it.** Write the check. This is the common case.
2. **Something else covers for it.** Two triggers, either of which is enough — M33's bomb detonating
   on the ground *and* on contact, over a turret standing on the ground. Each needs a rig where it is
   the only one that can fire: empty ground for one, a machine held in the air for the other.
3. **It genuinely does not matter.** Rare, and it means the code can go.

---

## 2. The three ways a rig lies, all of them observed

Three milestones running, the first version of a measurement proved less than it looked like it
proved. The failure mode is always the same shape: **the rig was built from whatever the world
happened to generate, so it measured the world rather than the rule.**

- **M31 — the route.** Modules were flown to the deep pad, where four flights in five end as a crash
  and a crash is insensitive to almost everything. Four things read as inert that are not. Fly both
  routes; the sanctuary route is quiet enough for a status channel to matter, the deep route is the
  only one where anything shoots at you.
- **M32 — the geometry.** A drone was parked 60 px away to test ramming. Ram range is 44 px and a
  drone's standoff ring is 195, so it politely backed off and the test proved nothing.
- **M33 — the terrain.** Blast falloff was measured against a turret wherever the generator had put
  one; the ground height between the drop point and the machine differed by more than the offset
  under test, and a charge that should have clipped the edge of the blast measured zero at *every*
  radius. The machine is placed now, not found.

**The rule: place the thing your claim is about. Do not go looking for it.** And when a measurement
comes back saying *everything* is broken, or *nothing* is — suspect the measurement first. M30g's
near-miss is the canonical one: a check reported 20 of 20 recommendations missing because the names
were title case and the modules are uppercase.

---

## 3. Adding something the game sells

Anything with an `effect` — a component level, a skill node, a module — is covered by
`loadout-tests.js`, and it will refuse to let you add one quietly. Five sections, and a new thing has
to satisfy the ones that apply:

**§2 — every declared effect is delivered.** Every key needs an entry in `WITNESS`: how it is
delivered (`flight` / `economy` / `instrument`) and a measurement that runs the real code with the
declared number moved. A key with no witness is a hard failure; a witness for a key nobody sells is a
hard failure the other way.

- Loadout keys use `only(key, value)` — a stock spec with exactly one key moved.
- A module's own keys use `withEffect(id, patch, fn)` — actives read `mod.effect`, not the loadout,
  so this is `only()` for the other half of the board. It is what catches a literal written into
  `abilities.js` beside the data.
- Measure by **running** the thing: `flyMission`, `ship.step`, `applyForces`, `Abilities.update`, or
  the real drawing code through `inkCtx()`. Never by reading the spec object back.

**§4 — fitting it changes a flown mission**, on a body its own `good` field claims. This is what
makes `good` a claim rather than flavour, and `good` is what the route card and the blueprint grant
are derived from.

- A module is flown on every body in `good`, on **both** routes.
- A skill node needs an entry in `NODE_RIG` saying where it is worth measuring and what has to be in
  the air. No entry and no exemption is a hard failure — adding a node forces you to say how it flies.
- Which cues need machines is declared in `pilot.js` (`CUES_NEEDING_MACHINES`), beside the cues. It
  has been got wrong twice from the test side; do not restate it there.
- If it genuinely cannot move a flight, put it in `NOT_IN_FLIGHT` **with a reason** — and note that
  list fails the other way too: anything parked there that *does* move a flight is reported as a
  stale excuse.

**§5 — the player can get hold of it.** New modules enter the blueprint pool automatically
(`nextBlueprint` derives from `good`), and the ladder is simulated to prove it. Five of nine modules
had no grant path at all until M31 and nobody had asked.

**A skill node also has to fit the board.** `test/skills-tests.js` asserts **five nodes per tree**
with tiers **T1, T1, T2, T3, T4** and the capstone standing behind the tier-3 — Tom's decision, 2026-08-22,
recorded in `ROADMAP_STATUS.md` under "Tom's decisions", item 5. Adding a node means removing one.
And **removing one usually removes a mechanic**: most nodes are the only thing selling their effect
key, so check what else sells it before deleting the implementation, or the gate fails the other way
on an orphaned witness.

**An active also needs a `cue`** — when a player would reach for it — declared on the module in
`modules.js`, not in the test. `threat` / `final` / `status` / `blind` / `hurt` / `overhead`. Under
the wrong cue a module is fitted, fired and provably identical to an empty slot.

**And if it writes a field on the ship**, the teardown check in `enemies-tests.js` covers it with no
work from you: snapshot, run the module out, run one step of physics, require the lander back. Add
what it is *meant* to leave behind to `KEEPS`, and nothing else.

---

## 4. `run-all.sh` cannot see a rendering fault

**No node test draws.** Two of the last three milestones introduced a bug that every suite passed and
the first `__draw()` in a browser threw — M30e pointed a gauge at a `ship` it never had, M31 orphaned
a variable while extracting a function. A screenshot found six expedition cards printing
`[object Object]` that no test could have.

So a change that touches `render.js`, `hud.js`, `enemydraw.js` or `screens.js` is not finished until
it has been looked at:

```bash
# .claude/launch.json runs serve.js. Then, in the browser console:
__setSeed(4242); __goMission('TITAN', 3); __act('launch'); __draw();
```

`__advance(dt)` steps without rendering, `__draw()` renders on demand, and `requestAnimationFrame`
does **not** fire in a hidden pane — so drive both by hand rather than waiting for a frame. The dev
hooks are listed in `docs/ARCHITECTURE.md`; `__flyHeadless` and friends only exist once
`test/autopilot.js` has been injected.

Where a visual claim can be measured, measure it: sample the canvas with `getImageData` and pin
`g.time` first, or the throb animation will confound two frames that differ only in what you changed.

---

## 5. What must not move

`node test/physics-fixture.js` and `node test/flight-fixture.js` print **`unchanged`**. If either
moves, that is either a real change to the flight model or a bug, and it needs a sentence in
`test/BASELINE.md` saying which. The physics fixture replays a fixed input script; the flight fixture
records autopilot outcomes. Improving the pilot should move the second and leave the first alone.

The encounter audit at the end of `run-all.sh` is a **measurement, not a gate** — but every figure in
it has been identical since M30, and a milestone that moves one should say why.

Run `./macos/build.sh` last, and **after committing**: it ad-hoc-signs and launches a fresh `.app`,
which revokes the agent's macOS access to `~/Desktop` until the app is relaunched. It is the bundling
canary and has caught faults no other check can see.
