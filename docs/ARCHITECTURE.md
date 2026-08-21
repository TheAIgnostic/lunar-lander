# Architecture audit

Written for roadmap Phase 0. Records what exists *before* the roguelite expansion, so later
milestones can prove they did not disturb the flight model.

## Files and responsibilities

Everything under `src/` is a plain ES module, loaded directly in the browser and by the node tests.

| File | Owns | Added |
| --- | --- | --- |
| `src/main.js` | the loop: state machine, camera, simulation stepping, outcomes, wiring | —/M23 |
| `src/state.js` | the shared mutable state: `g`, `meta` (+`setMeta`), `store`, `settings`, the device singletons | M23 |
| `src/screens.js` | every overlay screen, as HTML; presentation only | M23 |
| `src/actions.js` | the dispatch: what every button and key command does | M23 |
| `src/ship.js` | integration, collision, the touchdown settling window, hull, per-run spec | — |
| `src/landing.js` | severity score, band thresholds, gear tier, every landing constant | M1 |
| `src/terrain.js` | heightmap, the entry, distance-banded pads, the fuel road, cargo, deposits, the cave mouth, boulders and ice raised into the ground | —/M14/M15/M19/M20 |
| `src/archetypes.js` | 7 macro silhouettes and their landing-zone anchors | M2 |
| `src/spawn.js` | the starting position and momentum rule (the terrain owns the entry since M14) | M3/M14 |
| `src/validate.js` | structural mission checks: spawn clearance, approach corridors, delta-v bound | M3 |
| `src/planets.js` | 10 PlanetDefinitions, the gravity mapping, and what the ground is made of | M4/M5/M20/M29a/M29 |
| `src/planeticons.js` | one icon per body, for the route screen | M17 |
| `src/missions.js` | **all ten authored chapters** (50 missions), the survey-chapter fallback, `chapterFor` | M4-M9/M29 |
| `src/forces.js` | force/status interface: atmosphere, dust, wind channels, thermal, cryo, plumes, radiation, glide, acid, downdraft, eruption, magnetic, falseRadar, darkness | M5-M7/M28b/M29 |
| `src/save.js` | versioned MetaSave + RunState, legacy migration, corruption recovery | M8 |
| `src/economy.js` | rewards, the carried haul, what a deposit is worth, the transmitted/cargo split, settlement and banking | M9/M15 |
| `src/route.js` | the ten-body ladder, the next-body card, the progress trail, checkpoint rule | M9/M27 |
| `src/components.js` | 5 component tracks, `deriveLoadout` / `deriveFull`, purchase rules, the recommended tier | M10/M11/M28 |
| `src/skills.js` | 3 skill trees, `deriveSkills`, purchase and gating rules | M11 |
| `src/modules.js` | 5 active + 4 passive modules, blueprint guarantee list | M11/M12 |
| `src/enemies.js` | enemy roster, placement around the prize, telegraphs, projectiles, damage, rewards | M12/M14 |
| `src/objectives.js` | the optional objectives: conditions judged at touchdown, and six cargo recoveries | M14/M15 |
| `src/abilities.js` | the active-module runtime: charges, duration, cooldown, effects | M12 |
| `src/render.js` | the world: background, terrain, ship, dust, beacons, trajectory, hangar ship | —/M12/M15/M23 |
| `src/drawkit.js` | the shared drawing vocabulary: palette, type, `throb`, tint helpers, HUD panels | M23 |
| `src/enemydraw.js` | machines, telegraphs, wrecks, shots, the laser and the shield | M23 |
| `src/hud.js` | the instruments: HUD, pointers, panels, gauges | M23 |
| `src/gamelog.js` | the playtest trace: one sitting's events, as text or JSON | M24 |
| `src/debug.js` | F3 telemetry overlay, F4 landing-envelope bars, F5 enemy ranges | M0/M12 |
| `src/particles.js` | pooled particles, debris, rings, floating text | — |
| `src/audio.js` | synthesized engines, impacts, chimes | — |
| `src/input.js` | rebindable key map, touch, and the 0..1 intent the sim reads | —/M13/M30 |
| `src/levels.js` | the original 12 classic missions, endless generator, world palettes | — |
| `src/util.js` | math, seeded RNG, `safeStore` | — |
| `serve.js` | the dev server, `no-store` so an edit always reaches the browser | M13 |

**The axis the map is built on:** distance from the entry. The terrain picks where the lander comes
in *before* it places pads, then places them in bands measured from there — near, mid, deep. Content
is authored **prize-first**: `pads[0]` goes in the deepest band and the last entry in the nearest, so
swapping two entries in a mission's `pads` array moves them across the map. Reward follows distance
(`padTier` into `missionReward`), the fuel road is a line of cells from the entry to the deep zone,
and enemies are placed around the prize rather than scattered. The near zone is always reachable on
the starting tank; the deep one is deliberately not.

**What is raised into the ground, and the one ordering rule it has.** A boulder (M19), Europa's ice
(M20) and a structure (M21) are not drawn on top of the heightmap, they are *in* it: the same three hull points and
two feet already test against the ground, so collision is exact and free, and everything placed
afterwards — the fuel road, the cargo, the ore clearances, line of sight, the corridor validator —
sees the real surface. Each pass runs on its own seed stream derived from the seed rather than
drawn from the shared `rng`, so adding one cannot shuffle the pads or the road. The rule: a raising
pass records the crest it produced, and **a later pass can invalidate it**, so every crest is
re-derived once in the constructor after all of them. Any new raising pass goes before that line.
`PlanetDefinition.terrainStyle` is how a body asks for ice — content, not a branch in the generator.

A **structure** is the one of these with a consumer: it is a flat-topped tower or hab, and a ground
gun stands on the roof. Terrain still does not know what a turret is — it produces flat-topped
geometry and records it, and `placeEnemies` chooses among what it finds. A roof is derived from the
*highest* ground under the whole footprint, never the height at its centre, or the high end of a
slope stands proud through it.

**A body's `world` is its identity, not a palette it borrows.** `world` picks the sky, the hills, the
accent and the dust colour — and the **name drawn over the mission**. Six of the ten used to point at
another body's: Mercury, Io and Venus announced themselves as MARS, and Enceladus, Ganymede and Pluto
as EUROPA, which is what Tom found on the first full run of the ladder. The terrain underneath was
always the right body's. `route-tests.js` asserts that no two bodies share a world or an accent and
that none draws a name belonging to a different body — deliberately *not* "the world name equals the
display name", because the Moon is THE MOON on a world called LUNA.

**Ice and friction travel together.** `terrainStyle: 'ice'` makes the ground look frozen and
`surfaceFriction` makes it behave that way; setting one without the other gives either a texture with
no consequence or a surprise with no warning. Asserted.

**A force may not call `Math.random()`.** Forces are pure functions of `(ship, level, t)` and that is
what makes a seed reproduce a flight. The dust squall needs to feel random anyway, so it hashes the
time slot — unpredictable to the player, identical on replay, salted per mission so two missions do
not storm in lockstep. Anything else that wants "occasionally, unpredictably" wants the same trick.

**The hazard name in authored data is a key into a table in code, and a miss is silent.**
`forcesFor` does `BUILDERS[spec.type]`; when that comes back undefined, `add()` is never called, no
error is raised, and the body flies with **no weather at all** while its route card, its summary and
its briefing all describe some. M29 audited every planet and every authored mission and found this
on three names — `'heat'` against a builder named `thermal`, `'cold'` against `cryo`, `'plume'`
against `plumes` — which, with Ganymede's two hazards that had no builder at all, meant **Mercury,
Io, Enceladus and Ganymede had no working hazard whatsoever**, at positions 5 to 8 of a ladder every
run walks. M28b caught the `plume` case from an external review; `heat` and `cold` had never been
noticed, and *this document listed them as working*.

Aliases in `BUILDERS` are the fix. The rule is the test: `forces-tests.js` asserts that **every
hazard string any planet or mission declares resolves to a builder**, with `NON_FORCE_HAZARDS`
(`ice`, implemented as `surfaceFriction`) as the one stated exception. Generalise it — anywhere a
**name in content** indexes a **table in code**, assert that every name resolves, because the failure
mode is silence.

**Four status channels, four different consequences, on purpose.** A status that only fills a gauge
is the fault M29a named on radiation. Heat costs **thrust** (the engine derates past 60% and recovers
when you stop burning), cold costs **control** (the attitude thrusters stiffen), corrosion costs
**hull**, and charge adds a torque and a downward pull. Radiation eats hull *high* and in sweeps;
acid eats hull *low* and never stops, so Europa and Venus sit at opposite ends of the ladder teaching
opposite instincts. `ship.thermalDerate` and `ship.rcsStiffness` are the two multipliers the ship
reads back, and `applyForces` resets both every step — a hazard must never follow a lander to another
body.

**And a status needs a rate a player can act on.** M18 slowed radiation because *"it went clean to
saturated in three seconds, which left no room to reach a shadow"*, and M29's first tuning of four
new channels walked straight back into it: Mercury went clean to derated in **3.2 s**. Retuned
against mission length (25-45 s) so mission 1 of a body barely bites and mission 5 bites
mid-crossing, and `forces-tests.js` asserts a 10 s floor on every authored mission that declares one.

**Darkness and dust are different channels.** Pluto's darkness was `visibility: 0.45`, and the
renderer draws visibility as dust, so the darkest body in the game rendered as pale blue haze. Dust
tints toward the body's own dust colour and lightens; darkness subtracts toward black and closes a
sight radius. A body can be hazy, dark, both or neither, and neither has to lie about the other.
Beacons and ore crates draw above both, so blind is never targetless — the M18 line does not move
because the cause changed.

**The sanctuary rule covers weather, not just machines.** M29 put hazards in *places* for the first
time (vents, fountains, sinking air, anomalies), and the first tuning had an Enceladus vent over the
safe pad: the way home fell to 11/20 while the prize route held at 19/20 on every force setting
tried. Force barely moved it, which is what said the problem was *where* it was. `plumes`,
`downdraft` and `eruption` all call `offSanctuary`, which reads `sanctuaryPad` from `enemies.js`
rather than reimplementing "the nearest landing zone" — one rule, one implementation. The deep zone
is fair game, which is why the prize route never moved.

**A hazard may never leave presentation, which is the accessibility rule from the other side.**
`falseRadar` moves the HUD readout and **nothing else**: flown twice from the same state with and
without it, the lander ends at the same position, velocity and spin to six decimals, and that is
asserted. It also follows that no autopilot here can measure whether Ganymede is any good — the same
blind spot visibility has had since M24, and darkness now shares it.

**Tech Cores buy the top two hangar rungs.** A core drops on a PERFECT landing on a small pad and
nowhere else, so salvage measures how much you flew, materials measure where you went, and a core
measures how well you put the lander down. Cores wipe on death, so M28's affordability rule applies
unchanged and is asserted: L3 costs 3 and gates from body 3, L4 costs 6 and gates from body 6,
against measured yields of 3.5/8/11.5/16 by ladder position on a normal run. L2 costs no cores, so
the M28 income floor is untouched.

**A hazard that is only a gauge cannot be learned.** Radiation raised a number and drew nothing, so
there was no way to know where it was or which way to go; it is an altitude belt with a drawn edge
now. The general rule: if a hazard has a boundary, draw the boundary — which since M29 also means the
vents, fountains, sinking-air columns and magnetic anomalies that have a *place* rather than a level.
Every hollow hazard named here before M29 is implemented, and the check that used to be advice is a
test now (see the rule above).

**The input contract is a magnitude, and the keyboard is its degenerate case.** Since M30 the
simulation reads `amountOf(input, 'thrust')` — a number in 0..1 — rather than a boolean, and
multiplies by it. A key and a touch button answer **exactly** 1.0 or **exactly** 0.0, and
`x * 1.0 === x` under IEEE-754, so widening the contract could not move a keyboard flight: proved by
flying every mission through both trees and comparing 29.5M raw 64-bit doubles, zero differences.
**Two flight models is the fault this project has been burned by three times** — `__settleNow`
reimplementing the settle, the autopilot drifting three milestones behind its own control law, Mars
running at double drag — so an analog trigger widens the number and never forks the law.

The exactness is load-bearing and is asserted in `settings-tests.js` rather than left to the
fixtures, because **the physics fixture compares to four decimal places** and reads "unchanged" with
a held key returning 0.9999999. `this.thrusting` / `rcsLeft` / `rcsRight` stay **booleans** derived
from the magnitudes: a dozen consumers read them and none wants a float.

**A pad's two endpoints are exact for the same reason.** Below `PAD.deadzone` a stick reads exactly
0 and above `PAD.saturate` (0.95) a trigger reads exactly 1, so a pad at the stop commands the same
full burn a held key does — measured, 9.0 fuel/s and vy −96.0 either way. `saturate` is not cosmetic:
most triggers never report a clean 1.0, and without it a pad player would fly the whole game at 99%
throttle and match no recorded figure.

**`PAD.curve` is 1.5 because of where it puts the hover point**, which is the one thing about a
control curve that is arithmetic rather than taste. Thrust is 130 px/s² against gravity of 8.4-62.9,
so the throttle that cancels gravity runs 6-48% — and on a *linear* trigger the whole ten-body ladder
would be flown in the bottom third of the travel, which is where a trigger has the least resolution.
At 1.5 the hover band is 20-61%, eight of ten bodies between 30% and 49%. Table in `test/BASELINE.md`,
M30 stages 2-5.

**Two things refuse a NaN from the pad, and the second is not decoration.** `shape()` guards its own
floor (`!(NaN > floor)` is true), and the fold in `pollGamepad` is written `if (v > next[a])` rather
than `Math.max` **precisely because `Math.max(0, NaN)` is NaN** and a NaN amount multiplies straight
into `vx`/`vy`. Do not tidy that line.

**`pollGamepad()` is called from `frame()` and never from `advance()`.** The headless drivers call
`advance`, and a sweep must not change its answer because somebody left a controller plugged into the
machine running it.

**A pad control is a pseudo-key in the same binding map** — `pad:7` is button 7, `axis:0-` is axis 0
pushed negative — so `rebind()`, `setBindings()`, the save format and the settings screen never
learned what a gamepad is. The one rule that had to change: **`rebind()` replaces within a family,
not across one.** It used to set `next[action] = [key]`, and with a pad in the map that means binding
the booster to a trigger silently unbinds the space bar. "An action is never left with nothing on it"
is asked **per family** now, and an action left with no *keyboard* binding is refused outright,
because an action reachable only on a pad is the exact lockout that rule exists to prevent.

**Steering is the one setting that is allowed to change the simulation, and there are three.**
Everything on the settings screen is presentation-only *except* this, which has always been true
(`direct` has changed the flight model since M0) and is worth stating because the next rule below
says the opposite about everything else.

Since M29c the rotating law comes in two:

| mode | what a burner does | who it is for |
| --- | --- | --- |
| `classic` (default) | adds spin; **release and the rotation settles within about half a second** | the tuned mode |
| `pro` | adds spin that keeps going until you cancel it | the original law, unchanged to the digit |
| `direct` | translates the hull, which holds itself upright | no attitude to fly at all |

`classic` is *rate* control rather than acceleration control, and it is deliberately **not** an angle
spring: the attitude you set persists, so you still point the nose and choose the angle. Auto-levelling
on release would mean holding a burner and the booster together to translate at all, which is most of
the way to `direct` — and `direct` already exists.

Three things hold the split honest. `STEERING.pro` is `{ spinCap: 1, idleDamp: null }` **precisely so
every line of the classic branch reduces to its pre-split arithmetic**, and `settings-tests.js`
reproduces that arithmetic by hand and requires a match to 1e-9. Both fixtures and `test/pilot.js`
name `pro` explicitly rather than taking the default, so every figure recorded in `test/BASELINE.md`
— M19's terrain wall, M21's placement numbers, M24's 70% crossing — still measures the model it was
measured against, and stays a *floor* for what a player on the default meets. And `STEERING_MODES` is
the single vocabulary the flight model, the save layer and the settings screen all read, because a
mode the game accepts and the save layer rejects would work for one session and silently reset on the
next launch — for exactly the one player who chose the non-default.

**Idle damping composes with the ship's own, it does not replace it.** The first cut took
`Math.min(spec.spinDamp, mode.idleDamp)`, and 0.90 is stronger than the Gyro Stabilizer's 0.985 — so
on the default mode the gyro's entire spin-damping half was inert, a module bought, equipped and
doing nothing. That is the `hazardLead` fault, and `loadout-tests.js` caught it on the first run;
it now asserts the gyro is worth fitting in *both* named modes rather than in whatever the default
happens to be.

**Audio is synthesized, and the title screen's bed is too.** There are no audio files in this
project. The space bed (M29f) is four layers of WebAudio nodes — a detuned drone, filtered noise, two
high partials, and one sparse beacon ping — and **all of its movement is LFO nodes rather than
per-frame JavaScript**. That is deliberate: M16 found `engines` writing 240 automation events a
second forever, and a bed that plays for as long as somebody leaves the title screen up is where that
fault would hurt most. The graph is built once, the oscillators drive themselves, and the only
JavaScript that runs afterwards is one `setTimeout` per ping — which stops being rescheduled the
moment the bed is switched off.

**The bed has exactly one owner: `setState`.** It was briefly given two — `silence()` also switched
it off "for safety" — and the frame loop calls `silence()` *every frame the game is not in play*, so
the bed was killed on the one screen it exists for. `silence()` stops the flight voices; the screen
owns the ambience. One rule, one implementation, again.

**The rule that holds accessibility honest:** every accessibility setting changes *presentation*
only — shake, flashing, instrument size, contrast and key bindings never reach the simulation.
`test/settings-tests.js` flies the same mission with all of them changed and asserts the result is
byte-identical, so a player who needs the motion turned off is flying the same game as everyone else.

**Which way the imports point.** The graph is a DAG and since M23 that is *enforced*: the bundler
derives its emit order from a topological sort of the import graph and fails loudly on a cycle.
`util` at the bottom, then the leaves, then `ship` / `terrain` / `enemies`, then the drawing layer
(`drawkit` under `render` / `enemydraw` / `hud`), then `state`, then `screens` and `actions`, then
`main`. **26 of 33 modules import three things or fewer.**

Two M23 rules worth knowing before touching the UI layer:

- **`meta` is reassigned** when a run banks, and an ES import cannot assign to what it imports —
  so `state.js` exports `setMeta` and every reader gets the live binding.
- **`actions.js` is a leaf.** `act()` needs eight verbs that belong to the loop (`startLevel`,
  `launch`, `setState`, …), and importing them from main would be a cycle: main injects them once
  at startup through `wireFlow`. Add a new flow verb there, not as an import.

The rule that keeps it that way: **a generator may not import a concept.** `terrain.js` used to
import `economy.js` and `objectives.js` so it could stamp a price and an objective onto the geometry
it produced, and that direction cost a real crash — the bundler emits terrain first, so a
module-level read of the price table threw "cannot access before initialization" in the single-file
build and nowhere else. Terrain produces geometry; a deposit carries its distance `tier` and
`economy.nodeWorth` prices it; the cargo spec is resolved in `missionToLevel`, where content lives.

**The rule that makes reward a decision:** material is a physical deposit in the world, not a figure
computed at touchdown. `missionReward` counts what the lander carried home and the landing grade
*multiplies* that haul; what stays computed is a stipend, so a flight that collects nothing is still
paid and is paid about a quarter as much. Deposits are placed by the same rule that places the
guards — around the deep landing zone and back along the fuel road — and never in the near band,
never within 150 px of a landing zone, never in the sanctuary approach corridor, and never close
enough to a fuel cell to be swept up with it. `validate.js` enforces all four, which is what keeps
"a mission is always completable while collecting nothing" a statement about geometry.

**How many machines is a question about the air, not the map.** The spec asks for 1-3 engaging at
once and rarely 4. Until M21 that was checked as a count of machines *placed*, which is a different
claim and the one that kept the campaign at 21 machines. The rule is local now: a machine's
engagement disc may overlap at most `COMBAT.maxAtOnce - 1` others, which guarantees no point in any
disc is covered by more — and `placeEnemies` and `validate.js` enforce it with the same constant.
A consequence worth knowing before raising a budget: **a map holds a finite number of
non-overlapping engagements**, and past that the budget is fiction rather than difficulty.

`generateChapter` read `VALIDATION.minPadWidth` for the same reason and to the same end. It used to
carry its own pad arithmetic, and at depth 2 — sector 5 and beyond, which the three-body ladder never
reached — it asked for a 50 px prize pad against a 56 px stance, so **the last five bodies of the
M27 ladder each generated one mission its own validator rejects**. Where a generator and its checker
both encode a limit, they share the constant.

M29 deleted the generator, so there is no second encoder of that limit left — but the *rule* outlived
it: pads are hand-authored now, and `route-tests.js` asserts that no authored pad is narrower than
`VALIDATION.minPadWidth + 8`, reading the validator's own constant. When a shared constant loses its
sharer, move the check; do not let it lapse. The budgets in `missions.js` were set from a measured
capacity sweep and fill to 99%.

**The rule that holds combat fair, and what M24 narrowed it to.** Every mission keeps a
*sanctuary* — its lowest-multiplier pad and the 420 px column above it — outside every machine's
engagement range. `placeEnemies` and `validateEnemies` measure against the same points
(`sanctuaryGates`), so the rule cannot drift between what is generated and what is checked. That is
still a hard gate, still 20/20 on every mission, and still the thing that makes a promise here a
statement about geometry rather than about skill.

What it promises is now **narrower, and exactly this**:

> The sanctuary **pad** is unreachable. The **crossing** to it is not.

Until M24 the validator also required that an unarmed autopilot *survive* that crossing on every
seed, and it did — machines cost hull, never the lander. M24 made a hit worth half a hull, cut the
turret's lock to a quarter second and tripled shot speed, and 73 of 240 unarmed crossings now end in
a loss. That was Tom's call, taken with the number in front of him. So surviving the crossing is a
**measurement** in `validate-missions.js`, not a proof: it is flown, printed and watched, but a fall
there reads as "this got harder", never as "this broke". The thing that would be broken is the
sanctuary line above it.

Read the number knowing what produced it: an autopilot with no weapon, no shield and **no evasive
logic at all**. It measures the floor, not what a person meets.

**What a run is, since M24.** There is one game mode: the expedition. The classic campaign and the
endless run are gone from the menu — but *not* from the repo, and that distinction is load-bearing:
`levels.js` and its twelve missions are the M0 physics baseline, and both fixtures regress against
them. Deleting the content would delete the only proof the flight model has not drifted, so they
stay as an engine fixture that no player can reach. `act()` keeps the `campaign` and `endless` cases
as audible refusals rather than dropping them, so a stale key binding says why (the M16 rule).

The run is the roguelike unit, and since **M27** it is a ten-body linear ladder: `PLANET_ORDER` is
Moon, Europa, Titan, Mars, Enceladus, Ganymede, Io, Mercury, Pluto, Venus — sorted by measured
difficulty, fixed for every run. A run always starts at its foot, and losing the last shuttle puts
you back there. Four rules hold it up, all Tom's (2026-08-20):

1. **The order never varies.** Moon first, Venus last, every run.
2. **Every run starts at the Moon**, never from the furthest body reached — that is the attrition
   curve the model depends on.
3. **No replay.** A cleared body cannot be re-flown. This is enforced by what `routeChoices`
   *returns* — only the next body — because `route:N` indexes that array, so there is no index a
   cleared body can be reached through. The ladder behind the player is `ladderTrail`, a display
   concern with nothing clickable in it.
4. **Shuttles attrit**: `+1` per body cleared, capped at 3, never a restore to full.

Sorting by difficulty fixed the inverted ramp for free — Europa had been the finale with the weakest
gravity in the game and now teaches ice at position 2 — and it is what unblocks the hangar. Every
component level costs salvage plus a material only one body produces, and the three-body ladder had
made seven of ten unreachable: Sensors could not be bought at all. The materials come back **by
being on the route**, so the "this material comes from that world" texture survives intact rather
than being repointed at whatever is nearby.

**The sector is the ladder position.** `run.sector` increments once per body, so it runs 1–10. It
used to feed `generateChapter` as a depth term, which is why a survey body was generated harder
further down the ladder; with the generator deleted in M29, difficulty is authored per mission and
neither `chapterFor` nor `peakMachines` takes a sector at all. The consequence that still matters:
anything that *adds* the sector to a per-body difficulty figure is double-counting, because the
position is already sorted by difficulty. That is what saturated the route card's forecast in M27
until it was measured — six of ten cards printed the same thing.

`isCheckpoint` fires after **every** body, which is both the design and the fix for a real bug:
rewards accumulate in `run.haul`, purchases spend from `meta.banked`, and only a checkpoint moves one
to the other, so a checkpoint every *second* body left a whole chapter's pay unspendable. Since M25b
the banking happens on the way *in*, before the screen opens — which means the checkpoint screen must
**not** report `run.haul`, because banking has just emptied it. It reports what it settled
(`g.lastSettled`) and what is on hand; only the route screen, which opens before banking, reports the
haul.

Losing the last shuttle calls `Save.wipeForDeath`, and what that keeps is the whole of the design:

| lost on death | kept on death |
| --- | --- |
| skills, every banked resource, the opened map | hangar component levels, blueprints, equipped modules |

...which is what makes the hangar a *decision*. Salvage spent on a permanent upgrade is the only
thing that survives a run, and it is spent at the supply stop — the same moment, and the only
moment, that the loadout opens. So a permanent upgrade is always bought at the price of the loadout
you would otherwise carry to the next body. The hangar is readable at any time; what it will not
do outside that window is take your salvage. Mission select exists but is earned: `meta.gameCompleted`
is set only by carrying an expedition through all ten bodies.

**And since M27 that decision has no safety net.** Removing replay removed the only way to recover
from a bad run: income is bounded by how far the player gets, and a player stuck at body 3 cannot
grind their way out. Every run has to leave them measurably stronger than the last or the loop
deadlocks. Three rules hold that floor up, and M28 had to repair two of them:

- **The debrief is paid through the wipe.** `wipeForDeath(meta, { debrief })` clears the pot and
  *then* credits M13's 60/40 floor. It used to be banked before the wipe and zeroed by it, so from
  M24 until M28 a lost run left literally nothing. The order is the mechanism — put a credit before
  the wipe and it disappears.
- **No rung may cost more of one material than a single visit yields.** Materials are wiped on death
  and each body is visited once per run, so a cost above ~50 is a rung nobody can ever buy. Every L4
  used to be one. Asserted in `components-tests.js`, along with the gate windows (L2 from bodies
  1–3, L3 from 3–6, L4 from 6–10) — both stated against `PLANET_ORDER`, so re-ordering the ladder
  fails a test rather than quietly nailing a track shut.
- **`RECOMMENDED_TIER` says what the next body expects you to be flying**, printed at the supply stop
  where the hangar is open and the choice is still live. The figures sit just under what one normal
  run can fund by that point: a recommendation the economy cannot pay for teaches the player to
  ignore it.

**God mode is a test switch with a deliberately narrow blast radius.** Settings → GOD MODE grants
**resources and a starting position**, and nothing else: 999,999 of every currency, every material
(read from `components.js`'s own cost tables, so an M28 re-cut cannot leave one behind), every
blueprint, every body on the ladder startable, and the hangar window held open so the pot can
actually be spent. It does not touch the flight model, the landing bands, the damage numbers or the
terrain — a test build that flies differently from the real one cannot answer "does this feel
right?", which is the only question the playtest log exists to serve. Everything is bought through
the same `purchase()` and `buySkill()` a player uses, so an upgrade fitted under it is the same
upgrade.

Three rules hold it honest. It is **stamped into the playtest log's header** in both text and JSON,
because Tom pastes that log into chat and a run flown with a bottomless pot starting at Venus is not
a normal run. It is **marked in amber on the menu and the expedition screen**, so a screenshot taken
under it looks wrong at a glance. And `beginExpedition` **re-reads the flag itself** rather than
trusting its caller, so a stale button or a console call cannot skip eight bodies on a real save.
`meta.godMode` is declared in `defaultMeta()`, which is what makes NEW GAME clear it.

**The playtest log is not the logbook.** `meta.stats` is the player's career record: aggregated,
lossy, permanent. `gamelog.js` is the opposite — an ordered event trace of one sitting, in memory
only, built to be pasted into a conversation or exported. It records what was *measured* (the actual
grade, fuel, hull, seed) rather than what was intended, because "that felt wrong" is only debuggable
against numbers. Nothing in the game reads it back, so a log that is broken or full cannot change a
flight — the same rule the accessibility settings live under.

**The rule that holds the upgrade system together:** components, skills and the equipped passive are
*derived* into a per-run ship spec at mission start (`deriveFull` then `ship.applyLoadout`). The
shared `SHIP` and `LANDING` constants are never mutated — that is what stops a reloaded save from
stacking an upgrade twice.

Physics does not import UI. Landing evaluation consumes a touchdown snapshot and returns a result
object. Hazards apply through the shared force interface, so a new body is data, not code.

**One force per id.** `forcesFor` dedupes, because a level can declare the same weather twice and
authored data must not be able to change the physics by repeating itself. It could: a mission with
`wind`/`gust`/`drag` *and* `'atmosphere'` in its hazard list got the force pushed twice and applied
twice per step, and four of the five authored Mars missions flew at roughly double their own drag
from M6 until M28b. The redundant strings are gone from the content; the dedupe is what stops it
recurring.

**Ending a run and losing one cost the same thing.** `abandon-run` goes through `wipeForDeath` like a
crash does, pays M13's debrief floor through it, and arms on the first press. Until M28b it banked
and kept everything, which made abandoning strictly better than dying — and, because each run carries
a fresh `banked[]` settlement list, made the floor farmable at 60 salvage and 40 research per
start-and-quit cycle. A run is resumable, so abandoning is never how a player stops playing; it is
how they give up on a run.

## Tests

```bash
./test/run-all.sh 20                 # everything: 10 unit suites, 2 fixtures, 2 sweeps, the audit, build
node test/validate-missions.js 20    # structural + flown validation of every mission family
node test/mvp-regression.js 20       # all 27 missions, performance, long session, determinism
node test/enemies-tests.js           # enemies, combat rules, the active-module runtime
node test/settings-tests.js          # key bindings, accessibility, presentation neutrality
node test/objectives-tests.js        # objectives, distance tiers, the fuel road, cargo, deposits
node test/encounter-audit.js 20      # what a player actually meets: enemies, ore, both routes
node test/physics-fixture.js         # physics drift, no pilot in the loop
node test/flight-fixture.js          # mission outcomes flown by the autopilot
./macos/build.sh                     # bundles, then self-tests the app
```

`test/pilot.js` is the control law as a pure module, shared by the node validator and the browser
harness so both fly identically. `test/autopilot.js` is the browser wrapper — it *adapts* the shared
law rather than reimplementing it, which it used to, having quietly drifted three milestones behind.
Load it with `await __autopilotReady` before flying, since it imports the law as a module.

`flyMission` takes `{ padIndex }` to choose a landing zone and `{ viaCells: true }` to fly the fuel
road — the two routes every tiered mission has, and both sweeps check both. `{ viaMaterial: true }`
adds the ore to that route: the control law never detours for something it was not told to fly to,
so "the autopilot collected nothing" is evidence about the pilot and not about the map. The
encounter audit flies all three. It keeps enemies **off** unless `{ enemies: true }` asks for them:
the terrain sweep and the flight fixture measure whether the ground can be flown; mixing gunfire into them would turn a
terrain regression into a combat regression. The combat section of `validate-missions.js` turns them
on and flies with nothing equipped, because what it has to prove is that nothing is needed.

Two fixtures, deliberately: the **physics** fixture replays a fixed input script and moves only when
the simulation moves; the **flight** fixture records autopilot outcomes and moves when either the
game or the pilot changes. Improving the pilot should move the second and leave the first alone.

## Dev hooks (on `window`)

| Hook | Use |
| --- | --- |
| `__game`, `__ship`, `__input`, `__settings`, `__debug` | live state |
| `__act('...')` | fire any UI action: `chapter:LUNA`, `buy:gear`, `skill:fuel-mix`, `route:0`, `equip:passive:ice-cleats` |
| `__advance(dt)` | step the simulation without rendering |
| `__draw()` | render one frame on demand |
| `__setSeed(n)` or `?seed=N` | pin every mission for reproducible runs. **`g.forcedSeed` is this pin and nothing else** — never set it from a run's own seed, which `resumeExpedition` used to do, silently pinning every later run in the session |
| `__flyHeadless({padIndex, approach})` | fly the current mission instantly |
| `__runAllHeadless(12)` | fly the whole classic campaign in ~450 ms |
| `__preview(archetype, relief, detail)` | rebuild the current mission with another terrain shape |
| `__goMission('LUNA', 3)` | jump straight to any mission of any chapter |
| `__field()` | the live enemy field: machines, shots, kills, suppressed shots |
| `__game.carried` | what the hold has picked up this mission; `__game.terrain.materialLeft()` is what is still out there |
| `__useAbility()` | fire the equipped active module |
| `__runChapter('MARS')` | fly a whole chapter headlessly (after `await __autopilotReady`) |
| `__settleNow()` | run the *pending* settle immediately — it does not decide anything itself |
| `__log()` / `__logJSON()` / `__logClear()` | the playtest trace, for pasting straight out of the console |
| `__pad()` | what the gamepad is doing: pads seen, which one is in use, the 0..1 per action, what it is pressing |

## Environment notes that cost real time

- **`requestAnimationFrame` does not fire while the browser pane is hidden.** Timed test sweeps stall
  silently. Use `__advance` / `__flyHeadless`, and check `document.hidden` before blaming the game.
- **ES modules cache hard**, which is why `serve.js` exists: it is a 40-line static server that sends
  everything `no-store`, so a reload after editing `src/` always lands. `.claude/launch.json` runs
  it. Reaching for `python3 -m http.server` again means reaching for the old bug, where the fix was
  restarting on a new port every time.
- **Screenshots misreport at emulated viewport sizes.** If one looks half-painted, re-issue
  `resize_window` (nudge the height by 1 px) and shoot again.
- **A raised shape must close its fill below the ground, not across itself.** Closing the path at a
  fixed height meets the surface only on level ground; on a slope the closing edge floats and draws
  a visible box. This shipped in M19 and stayed invisible until M20's ice made the ground steep
  enough to expose it. Trace the heightmap, close underneath it, and stroke only the silhouette.
- **A debug hook that reimplements a rule will drift from it.** `__settleNow` decided the
  post-landing state itself — `g.levelIndex === LEVELS.length - 1 ? 'victory' : 'result'` — and
  `LEVELS` is the twelve *classic* missions, so on an expedition it sent every landing to the result
  screen and skipped banking, the blueprint grants and the whole chapter-clear branch. A scripted
  five-mission Moon run landed all five and reported `cleared=[]`, which reads exactly like a broken
  ladder and cost M27 an hour. Both settle timers go through `settleAfter(ms, work)` now, which holds
  the pending work, and the hook runs *that* rather than a copy of it. Same class as M23's drifted
  autopilot and M24's constant-encoding assertions: **one rule, one implementation.**
- **The bundle cannot catch a missing import.** It concatenates every module into one scope, so a
  name that was never imported still resolves. M23's surgery produced two genuinely missing imports
  and three phantom ones, and the bundle built clean through all five; real ES module loading (node
  `import()` for syntax, the browser for bindings) caught every one. The bundle canary proves load
  order and name collisions — only the module loader proves the imports.
- **The macOS self-test is the bundling canary.** It has caught a duplicate `const` across modules, a
  module missing from the bundler list, a namespace import that vanished from the bundle, (M15)
  a module-level `const X = SOME_IMPORT.field` that throws "cannot access before initialization"
  because the bundler emits that module first, and (M23) the same namespace rebuilt once per
  importing module - a duplicate `const Save` the moment a second module imported it. Read imported config **inside** functions, not at
  module load. Run the self-test before calling any milestone done.
- **...but run it *after* committing, not before.** `macos/build.sh` ad-hoc-signs and launches a
  fresh `.app`, and doing that revokes the agent's macOS TCC grant for `~/Desktop` — every read
  under it returns `EPERM`, while `~/Documents` and the rest of the home directory keep working, so
  it does not look like a permissions problem at first. Observed twice in M20, both times
  immediately after that script, with hours of heavy file I/O working fine in between. Re-granting
  in System Settings does not take effect until the app is **relaunched**, which is why the ordering
  matters: the canary is the last gate before a milestone is done, and that is exactly the worst
  moment to lose write access to the repo.
- **Ratio-based performance checks measure the JIT.** The MVP regression compared the combat loop
  against a physics-only loop that runs after the whole mission sweep has warmed it; the denominator
  tracked warm-up history rather than cost. Measure the property you mean — for combat, cost *per
  machine* as machines are added.

## Reading order for a new session

1. `ROADMAP_STATUS.md` — what is done, what is next, and the decisions behind both.
2. This file — what each module owns and the rules that hold the design together.
3. `docs/PROGRESSION.md` — the hangar/skills/loadout as one system, and the measured blocker in it.
4. `test/BASELINE.md` — the measurements, milestone by milestone, ending with the encounter audit.
   The M19 and M20 sections are the two that record *where the wall is* for terrain; M27 is the
   ladder as it stands.

Then **measure before editing**: `./test/run-all.sh 20` for the suites, and the encounter audit
described at the end of `test/BASELINE.md` for what a player actually meets in the world. Every
milestone in this project that went well started from a number, and both of the ones that went
badly started from an assumption.

## After the MVP (M14+)

The MVP is complete and measured (`test/BASELINE.md`, M13 section). What the next milestones inherit:

- **Three of eight enemies exist** since M29e added the Mast Sniper. Coil Cannon, Patrol Drone, Mortar Platform, Magnetic Mine, Solar
  Sentry and Shielded Guardian are roster entries with no implementation. Adding one is an
  `ENEMY_TYPES` entry plus a draw function; the field, telegraph, projectile, damage and reward
  systems are shared. `PlanetDefinition.eligibleEnemySets` is where a new design joins the bodies
  that should field it. **M29 made this the most valuable thing left**: Enceladus measured that on a
  low-gravity body the machine *type* decides almost everything and the count decides almost nothing
  (drones at 2 machines 2-5/20, turrets at 4 machines 17-20/20), so more designs is the only real
  lever left on the combat ramp.

  **What M29e learned building the first one**, for whoever builds the next five: a machine is not
  finished when it draws and fires. The Mast Sniper passed every unit test while being able to see
  the lander for **0.5 seconds in an entire flight** - it was placed by the generic station rule,
  which asks where a machine should stand and never asks what it can see from there. Measure a new
  design's *engagement*, not just its numbers. And know that `range` is not the lever it looks like:
  the sanctuary bubble scales with it, so a longer reach is pushed further from the player, and the
  at-once rule counts overlapping discs, so a big disc crowds the rest of the budget off the map.
  Reach costs twice and buys less than vantage does.
- ~~**Seven bodies still fly generated survey chapters**~~ — **done in M29.** All ten bodies are
  authored, 50 missions in `src/missions.js`, and `generateChapter` is **deleted**. There is no
  generated fallback: `chapterFor` throws for a body with no chapter, and the invariant the fallback
  used to provide is asserted in `route-tests.js` and `validate-missions.js` instead. Adding a body
  to `PLANET_ORDER` without writing its five missions is a failing test, not a blank screen.
- **Landing bands await human playtest data.** They were deliberately not retuned in M13 — the only
  recorded data is an autopilot, which is not a proxy for a person.
- **Moving landing platforms** are still deferred (Europa 5, Io 5): `padAt` and the landing check
  would have to become time-aware.
- ~~**Three ice bodies still fly rock.**~~ Fixed in M29a — Enceladus, Pluto and Ganymede carry
  `terrainStyle: 'ice'` with friction to match.
- **Mission fuel budgets have not been re-authored** since the map grew, and M15 gave the gap a
  number: taking the deposits that lie on the fuel road is comfortable (236/300 landings, 27–55%
  left), but sweeping every deposit lands 156/300 and 0/20 on `mars-2` and `europa-4`. Written for a
  900 px traverse, now flown across 2,000–2,600 px with a road and an ore field in between.
- ~~**Controller support does not exist.**~~ **Built in M30.** The simulation reads a 0..1 magnitude,
  a gamepad fills it, pad controls are rebindable through the screen that already existed, and the
  pad hot-plugs. What is **not** built is menu navigation: a pad flies the lander and fires the
  module, but pausing, confirming and backing out are still keyboard or mouse. START and HOME are
  reserved against a flight binding so those buttons stay free for it.
- **Achievements** are deliberately not built. The spec gates them behind stable progression, and
  the statistics they would be built on only started being recorded in M13.
- **The numbers to tune** live in config objects: `COMBAT` in `enemies.js`, `ABILITY` in
  `abilities.js`, `LANDING` in `landing.js`, `CORE_PITY`/`DEBRIEF` in `economy.js`.

## Baseline physics constants (do not drift without a measured reason)

Scale: **6 px = 1 m**.

| Constant | Value | Source |
| --- | --- | --- |
| main thrust | 130 px/s² (21.7 m/s²) | `SHIP.thrust` |
| RCS angular accel | 5.0 rad/s² | `SHIP.rcsAccel` |
| max spin | 3.2 rad/s | `SHIP.maxSpin` |
| spin damping | 0.995 per 1/60 s | `SHIP.spinDamp` |
| side thrust (direct mode) | 62 px/s² | `SHIP.sideThrust` |
| fuel burn | main 9/s, RCS 3.2/s, hold 5/s, side 5.5/s | `SHIP` |
| gravity range | 28–66 px/s² (4.7–11 m/s²) | `levels.js` |
| fixed timestep | 1/120 s, max 8 substeps per frame | `main.js` |
| landing envelope | PERFECT vy 11 / vx 7 / 3.5° · GOOD 20 / 13 / 8° · HARD 34 / 22 / 15° | `ENVELOPE` |
| off-pad rule | PERFECT or GOOD on ground shallower than 10° survives at ×1 | `ship.collide` |

Collision uses three hull points plus two feet, tested against the heightmap each substep. At the
fastest observed speeds (~480 px/s) a substep advances 4 px, so tunnelling is not possible — the
test is "below the surface", not a swept intersection.

## Current 12 missions -> mission templates

| Current | Reusable as | Note |
| --- | --- | --- |
| LUNA 1–3 | Moon 1, 2, 5 | already crater/ridge-ish; needs the archetype pass for shelves |
| MARS 4–6 | Mars 1, 2, 4 | wind is absent today; Mars gusts arrive in M6 |
| EUROPA 7–9 | Europa 2, 3 | cave ceiling maps onto "crevasse / ice bridge" |
| TITAN 10–12 | Titan 1, 2, 5 | wind+drag already implemented; kept for the later Titan chapter |
| endless | side mode | stays as-is, per Tom's decision to keep old content |

## Determinism

`?seed=N` (or `__setSeed(n)`) pins every mission; terrain seed is `g.seed ^ (level.id * 2654435761)`.
Verified: the same seed reproduces heightmap, pads and fuel cells exactly; a different seed differs.
This is a precondition for every later validation test.

## Debug controls

- `F3` or `` ` `` — telemetry overlay (fps, seed, gravity, position, velocity, altitude, angle,
  spin, surface slope, fuel, throttle, live inputs, steering mode, current verdict, last touchdown,
  and — when the mission has any — threat states, shots fired, hits taken, hull and module state)
- `F4` — landing-envelope bars showing each criterion against its perfect/good/hard/crash zones
- `F5` — enemy engagement rings: outer range in red, the minimum range a ground gun cannot shoot
  inside in green

Accessibility settings live on the settings screen, not behind a debug key: motion, flashing,
instrument size, contrast and key bindings. They are stored in `meta.settings` and applied by
`applyPresentation()` in `main.js` (a CSS variable and two root classes) plus the `flash`/`contrast`
options passed into the renderer.
