# Progression audit

What the hangar, the skill trees and the loadout actually do, how difficulty is supposed to climb,
and where it does not. Measured from the code at `d941106` (after M26), not from design intent.

Written because Tom lost the overview after M24–M26 changed the run shape three times, and because
the audit found a blocker that no test catches: **four of the five hangar tracks cannot be climbed
at all on the three-body ladder M25 shipped.**

> **Status, after M29 (2026-08-21): the hangar, the economy and the content are all done.** The
> ladder is ten bodies, all five tracks reach L4, the material costs are re-cut for order *and*
> scale, M13's anti-frustration floor pays out again, and **all ten bodies are authored** — 50
> missions with distinct names, briefs, objectives and a set piece each. Tech Cores buy the L3 and L4
> rungs, so the third currency has a sink. What is left is **a human flying it**. The measured state
> is the M27, M28 and M29 sections of `test/BASELINE.md`.
>
> **Three figures below were wrong when M28 re-measured them**, and two had already sent a brief off
> in the wrong direction. They are corrected in place and marked. This document was honest when it
> was written and the code moved under it — **re-measure it before building from it**, the same way
> you would re-measure the game.

**Re-measure before trusting any number here.** Every figure below is reproducible with the
snippets in the last section.

---

## The three systems, and what a death costs

Three progression systems, three currencies, deliberately not interchangeable. The thing that
matters most is which survive a death, because that is the whole risk structure of a run.

| | buys | costs | on death | full cost |
| --- | --- | --- | --- | ---: |
| **Hangar** (`components.js`) | 5 tracks × 3 levels | salvage **+ body-specific material**, and **tech cores on L3/L4** (M29) | **kept** | 12,840 salvage |
| **Skills** (`skills.js`) | 3 trees × **5 nodes**, ranked | research data | **wiped** | **2,885 data** (M35) |
| **Loadout** (`modules.js`) | 1 active + 1 passive slot | nothing — blueprints are earned | blueprints **kept** | **10 active + 10 passive** (M36) |

`Save.wipeForDeath` is the authority: it clears `purchasedSkills`, `banked` and the opened map, and
keeps `componentLevels`, `unlockedBlueprints` and `equipped`.

> **M31 (2026-08-22) found the loadout row was worse than "earned": it was unreachable.** Five of the
> nine modules had **no grant path at all** — the only unlocks were the two starter passives, one
> guaranteed on a first chapter clear, and the weapon for surviving a mission that shot at you. Ray
> Shield, Magnetic Anchor, Thermal Purge, Ice Cleats and Hardened Radar could be obtained only under
> god mode, which is exactly why no playtest surfaced it, and the route card recommended four of them
> by name. **Every cleared body hands over a blueprint now**, chosen for the body about to be flown.
> The count above is 14 modules against 10 grants in a full ladder, and blueprints survive death, so
> the collection is the one thing that compounds across runs.

**The intended trade** is sound and worth preserving: salvage spent in the hangar is the only thing
that outlives a run, it can only be spent in the window between bodies, and spending it means not
carrying it. Every supply stop asks "buy something permanent, or keep what you have?". The trade is
fine. The numbers underneath it are not.

---

## How a body gets harder, mission to mission

Four authored numbers carry the ramp. Mission 1 is always unarmed; mission 5 is always a small
high-multiplier pad with the most machines on the map.

| mission | fuel | scoring pad | machines |
| --- | ---: | --- | ---: |
| moon-1 | 124 | ×3 / 130px | 0 |
| moon-2 | 116 | ×3 / 120px | 3 |
| moon-3 | 112 | ×3 / 110px | 3 |
| moon-4 | 108 | ×3 / 110px | 4 |
| moon-5 | 104 | ×5 / **78px** | 4 |
| mars-1 → 5 | 136 → 120 | ×3/120 → ×5/84 | 0 → 5 |

Moon and Mars are well made. **Europa is not monotonic**: fuel runs 122 · 118 · 116 · **126** · 124
and machines run 0 · 1 · 3 · **2** · 3, so mission 4 is easier than mission 3 on both counts. That
is structural rather than sloppy — `europa-2` and `europa-4` are single-pad caves and M21 measured
that they cannot hold more machines without breaking the promise that the crossing is survivable
unarmed. The chapter is capped by its own geometry (see `test/BASELINE.md`, M21).

---

## How the ladder gets harder, body to body

**As M25 shipped it, the ramp was inverted:**

| # | body | gravity m/s² | friction | machines | hazards |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | Moon | 4.67 | 1.00 | 0–4 | none |
| 2 | Mars | **7.06** | 1.00 | **0–5** | wind, dust, channels |
| 3 | Europa | 4.11 | **0.07** | 0–3 | ice, radiation |

Europa, the finale, had the weakest gravity in the game — weaker than the Moon — the fewest machines,
and a fuel budget that went back up. Mars, the hardest body in the game, was flown second, so a
player who survived Mars found the finale a relief.

**M27 fixed it by sorting the ten-body ladder on measured difficulty**, which is the order in the
next section. Europa teaches ice at position 2 and Venus — gravity 10.48, dense drag — ends it.

**What did not get fixed, and is an M28 input:** the *machine* count does not ramp at all, and where
it moves it moves the wrong way.

```
machines down the ladder (M27): lun 4 · eur 3 · tit 3 · mar 5 · enc 0 · gan 3 · io 3 · mer 3 · plu 3 · ven 3
after M29 authored them:        lun 4 · eur 3 · tit 3 · mar 5 · enc 4 · gan 5 · io 5 · mer 5 · plu 4 · ven 5
```

Every survey body capped at 3 because `generateChapter`'s budget is `min(3, ...)`, while the authored
introductory Moon fields 4 and Mars fields 5. **Enceladus, at position 5, had no `eligibleEnemySets`
at all** — a body with nothing hostile on it, halfway down.

**M29 fixed it by authoring the budgets rather than deriving them**, and the fix carries a finding
worth more than the numbers: on Enceladus the machine *count* barely mattered and the *type* decided
everything. Measured unarmed over 20 seeds on the way home — drones at 2 machines 2–5/20, turrets at
4 machines 17–20/20. At 7.3 px/s² a lander cannot decelerate, so a drone that closes and rams is not
a difficulty knob there; it is a coin toss. Enceladus is a turret body that meets its first drone on
mission 4.

Titan and Europa stay at 3 for the same structural reason M21 recorded: both are drone bodies, and a
drone-only chapter cannot absorb machines the way a mixed one can. **The remaining lever on the
combat ramp is the six unimplemented enemy designs**, not bigger budgets.

---

## The blocker: the hangar is nailed shut *(fixed by M27 — kept for the reasoning)*

Every hangar level costs salvage **plus a material only one body produces**. That gate is good
design — "go there to build this". But M25 cut the ladder to Moon/Mars/Europa, and **seven of the ten
material sources became unreachable**.

| track | reachable ceiling | blocked by | from |
| --- | --- | --- | --- |
| Landing gear | **L4 — full** | — | — |
| Engine & tanks | L3 | Nickel-iron / tungsten | Mercury |
| Attitude thrusters | L2 | Hydrocarbon composite | Titan |
| Hull | L2 | Sulfur-resistant ceramic | Venus |
| Sensors | **L1 — locked** | Silica nanograins | Enceladus |

**Sensors cannot be bought at all** — its first level needs Enceladus. One of five tracks is
decorative.

**M27 fixed this by putting the bodies back on the route**, not by repointing a single cost. Measured
after: landing gear, engine, thrusters, hull and sensors all reach **L4**. The gate concept — go
there to build this — survives intact, and the refusals now name a body the player is going to
visit ("Needs 40 more Conductive ice salts", Europa, body 2).

**Hull matters most here** — and the claim this document made about it was also wrong. It said that
at L2 (+12%), "112 hull still dies in two". It does not: 112 − 50 − 50 = 12, alive, and the third
shot kills. M28 measured every level:

| hull | max | dies on hit |
| --- | ---: | ---: |
| L1 stock | 100 | **2** |
| L2 | 112 | **3** |
| L3 / L4 | 125 / 140 | 3 |

The error came from `test/enemies-tests.js`, which asserted `Math.ceil(150 / damage)` — and **150 is
not a hull any level produces**. A test encoding a figure rather than a property, the same fault M24
found twice in that same file. The test now derives the hull from the component table. **No damage
change was needed**, and the "either re-cut the materials or drop damage to ~45" choice was never a
real one.

What *was* true: Hull L2 gated on Mars. M28 moved it to Titan, body 3.

### Why it happened

Tom asked for linear progression and named the bodies: *"the progression on the planets should be
linear without any choice (moon, mars then europa)"*. That specifies an **order**; M25 implemented
it as the **entire reachable set**, and did not audit what depended on the other seven bodies. Before
M25 the route offered tier A (Mars, **Titan**, Europa, **Enceladus**) immediately, tier B (Mercury,
Venus, Io) after two non-Moon chapters, and tier C (Pluto, Ganymede) after five — across five
sectors, with `clearedChapters` persisting between runs. All ten materials were obtainable, and the
two most-blocking ones today were **tier A**, the easiest in the game.

Tom's position, recorded 2026-08-20: he did not intend to exclude the other bodies.

---

## ~~The economy is an order of magnitude short~~ — WRONG, corrected by M28

| | |
| --- | ---: |
| a clean 5-mission body clear pays | ~530 salvage, 85 data |
| what Tom's real Moon clear paid | **300 salvage, 112 data** |
| cheapest hangar upgrade (RCS L2) | 260 salvage |
| landing gear L2 | 320 salvage |
| full hangar | 12,840 salvage ≈ **24 body clears** |

**"A perfect first chapter buys nothing" was this document's headline claim and it is false.** The
figures above are right; the conclusion drawn from them is not, because it compared the pay against
**Landing Gear at 320 rather than the cheapest rung on the board at 260**. Tom's real 300-salvage
Moon clear bought Attitude Thrusters L2 with change.

M28 measured it properly, across three play profiles — sloppy is the near pad with mixed grades and
no ore collected, clean is the deep pad every time:

| body | sloppy | normal | clean |
| --- | ---: | ---: | ---: |
| Moon / Mars | **300** | 435 | 563 |
| Europa | 361 | 496 | 603 |
| every survey body | 314 | 469 | 711 |

Every profile on every body clears the cheapest rung. **The payout was not changed**, because the
measurement said it did not need to be. What *was* broken is below.

Research is healthier — ~85 data per body against a 40–95 cheapest node, so about one skill per body
— but skills are wiped on death, so it never compounds.

> **M35 (2026-08-22): the board is fifteen nodes, not thirty, and this is the arithmetic behind it.**
> Every rank of all fifteen costs **2,885** research and a typical run banks about **298** before
> losing it, so a player buys **three to five nodes a run whether the board holds fifteen or thirty**.
> Adding nodes past the point where every tier is covered adds variety, not power — and each one is
> another thing that has to be proved delivered. The cheapest path to a capstone is **515 / 515 / 505**
> data in the three trees, which emerged from the shared T1-T1-T2-T3-T4 shape rather than being tuned.
> The decision and the full reasoning are in `ROADMAP_STATUS.md` under "Tom's decisions", item 5.

### What actually was broken: the floor, and the material *scale*

**M13's anti-frustration debrief had not paid out since M24.** It transmits 60 salvage and 40
research on a failed run so that "a run that ends badly still ends with a decision" — and M24 made
death empty `meta.banked`. The floor was banked by `bankRun` and zeroed by `wipeForDeath` on the next
line. M27 made it critical by removing replay, since it is now the only income a run that dies early
leaves behind. Fixed by paying it *through* the wipe.

**And every L4 rung was unbuyable in one run.** Materials are wiped on death and each body is visited
once per run, so a rung is only ever buyable if a single visit funds its whole material cost. One
visit yields **~50 on a normal run and ~90 on a clean one** — the ~470 sweep-everything ceiling is
reached 33 times in 300 by the encounter audit. Against that, gear L4 wanted 160 Ilmenite, engine L4
140 Iron-oxide, hull L4 130 Sulfur-resistant. The whole Landing Gear track wanted **290 Ilmenite out
of one Moon visit**. Every cost is 25–50 now.

---

## Are the other seven bodies finished?

**Yes, since M29** — this section is kept for the reasoning and for what the audit found. What
follows described the state before it.

**Systems yes, content no.** They are playable and validated — since M27, at the sector each one
actually occupies on the ladder and over 20 seeds rather than 6, and every body is structural 100/100
— but they are anonymous. And since M27 they are no longer optional: every run meets all seven.

Two things that sweep found once it flew where the ladder goes, both now fixed: the generator was
asking for a 50 px prize pad against a 56 px stance at sector 5 and beyond, so **the last five bodies
each generated one impossible mission**; and the sweep was hard-failing on flight rather than
geometry, against the rule the rest of the file follows. Venus remains the outlier on flight —
86/100 home, 36/100 on the prize route, geometry sound — which is the wall body behaving like a wall,
measured by a pilot that does not dodge.

What all ten already have: a full `PlanetDefinition` (real and mapped gravity, atmosphere, drag,
wind, friction, visibility, rare material, terrain palette, eligible enemy sets), a generated
five-mission chapter with a real ramp, and recommended counters.

What the seven survey bodies lack:

- **Shared names and briefs.** Every one runs FIRST LOOK / LOW PASS / DEEP FIELD / THE SHELF / LAST
  LIGHT, with identical brief text. Titan and Io read the same.
- **No optional objectives.** `optionalObjective: null` on all 35 — the objectives system built in
  M14 is dead on seven of ten bodies.
- **No set pieces.** No caves, no wind-channel canyon, no fragile plate. Each authored body has one.
- **No per-mission hazard tuning.** They inherit planet defaults; authored Mars missions tune dust
  period, floor and duty per mission.

### Hazards named but not implemented — *all implemented in M29, and there were more than this*

This table was **wrong in both directions**, and only an audit found it. It is kept exactly as
written because being wrong is the useful part.

| hazard | body | what this doc said | truth |
| --- | --- | --- | --- |
| acid, downdraft | Venus | hollow | hollow — correct |
| eruption | Io | hollow | hollow — correct |
| magnetic, falseRadar | Ganymede | hollow | hollow — correct |
| **heat** | **Mercury, Io** | *not listed* | **hollow** — spelled against a builder named `thermal` |
| **cold** | **Pluto** | *not listed* | **hollow** — spelled against `cryo` |
| **plume** | **Enceladus** | *not listed* | **hollow** — spelled against `plumes` (M28b) |
| `ice` | Europa | implemented via `surfaceFriction` | correct, and left alone |
| `darkness` | Pluto | "implemented via `visibility`" | **technically true, practically wrong** |

So **four bodies had no working hazard at all** — Mercury, Io, Enceladus and Ganymede — not the two
this table implies. And the `darkness` note actively misled: it was low visibility, the renderer
draws visibility as *dust*, and so the darkest body in the game came out as pale blue fog, which is
what Tom reported in M29a. Following the "do not fix them" advice would have kept it that way.

Every one is implemented now, and `forces-tests.js` asserts that **every hazard string any planet or
mission declares resolves to a builder**, so this cannot recur silently. The estimate below was
about right for the writing and missed the audit entirely.

*(Original estimate: roughly a week of content work — 35 names and briefs, 35 objectives, one set
piece each, three signature hazards.)*

---

## The ladder

**Decided — see "Decided (Tom, 2026-08-20)" below for the reasoning and the four rules that go with
it.** Ordered by measured difficulty, which fixes the inverted ramp for free: Europa becomes a
*teaching* body for ice at position 2 rather than a limp finale, and Venus is a genuine wall to end
on. Scheduled as M27.

| # | body | gravity | teaches | state |
| ---: | --- | ---: | --- | --- |
| 1 | Moon | 4.67 | vacuum, pure inertia | authored |
| 2 | Europa | 4.11 | ice — the touchdown slides | authored |
| 3 | Titan | 4.47 | thick air, wind, gliding | survey |
| 4 | Mars | 7.06 | weight and weather together | authored |
| 5 | Enceladus | **1.40** | near-weightless, plumes | survey |
| 6 | Ganymede | 4.38 | *(needs its hazards built)* | survey |
| 7 | Io | 4.92 | heat, eruptions | survey |
| 8 | Mercury | 7.19 | heat at real weight | survey |
| 9 | Pluto | 3.12 | cold and darkness | survey |
| 10 | Venus | **10.48** | the wall — dense drag, heaviest | survey |

### The material map — re-cut by M28

M27 made the materials reachable; M28 made them well-ordered. The rule was **every track's L2 from
bodies 1–3, L3 from 3–6, L4 from 6–10, with Hull's L2 earlier than Mars**, and it now holds — asserted
in `components-tests.js` against `PLANET_ORDER`, so a change to the ladder fails there rather than
quietly nailing a track shut again.

| track | L2 | L3 | L4 | was |
| --- | ---: | ---: | ---: | --- |
| Landing gear | body 1 | body 3 | body 6 | 1 / 2 / 4 |
| Engine & tanks | body 1 | body 4 | body 8 | 1 / 4 / 8 |
| Attitude thrusters | body 2 | body 3 | body 7 | 1 / 3 / 6 |
| **Hull** | **body 3** | body 4 | body 10 | **4 / 10 / 10** |
| **Sensors** | **body 2** | body 5 | body 9 | **5 / 6 / 9** |

All five tracks are buyable by **body 3**, where before Hull waited for Mars and Sensors for
Enceladus at body 5. Costs were re-cut for *scale* as well as order — see the section above.

*(An earlier draft of this section said Hull L3 gated on Venus while L4 gated on Io, an impossible
order. Hull L4 needed Venus* and *Io, so both gated on body 10. That figure had been read off the M25
three-body order. It is moot now, and it was the third wrong number this document handed to a brief.)*

---

## Decided (Tom, 2026-08-20)

The run's shape is settled, and it went against the recommendation above. **Tom's model is the
ten-body ladder**, and his argument is the roguelike one: die, keep what the hangar bolted on, start
again slightly stronger, get a little further, repeat.

He is right, and the recommendation was wrong for a specific reason worth recording: it priced a run
at **50 missions**, which is the length of a run that *clears all ten bodies* — the rarest outcome in
a permadeath game, not the typical one. The typical run dies at body 3 or 4, which is 15–20 missions.
The measured figures were in Tom's own playtest log the whole time:

| from the playtest log, 2026-08-20 | flight time |
| --- | ---: |
| 5 Moon missions, 3 crashes, run lost | **131 s** |
| 5 Moon missions, 2 crashes, chapter cleared | **182 s** |

A body is about **three minutes**. Ten bodies is ~30 minutes of flight plus briefings, and a run that
dies at body 4 is about twelve. That is a roguelike run length, and the objection was built on a
guess when the measurement was already recorded.

**A second argument for the fixed ladder, missed at the time:** with five bodies drawn from ten by
seed, the *materials* become seed-dependent. A player needing Titan's hydrocarbon for Attitude
Thrusters L3 might not be offered Titan for several runs — a softer, more frustrating version of the
exact bug this document exists to fix. A fixed order makes the material progression guaranteed and
therefore designable.

**M26 turned out to be a precondition.** A ten-body ladder means re-flying the Moon and Europa on
every run, which would be unbearable at one fixed silhouette per mission. The M26 shuffle takes each
body from 1 to 24 chapter layouts, on top of per-seed heightmaps, pads, entry side and enemy
placement. Without it this model does not work.

### The four rules

1. **The order is fixed and never varies.** Moon first, Venus last, the same every run.
2. **Every run starts at the Moon.** No starting from the furthest body reached — that would kill the
   attrition curve the model depends on.
3. **No replay.** A cleared body cannot be re-flown for salvage. The supply stop is a supply stop,
   not a choice. This reverses the farming half of M25.
4. **Shuttles attrit.** Currently every supply stop restores to 3, which across ten bodies is
   effectively thirty lives. It wants **+1 per body cleared, capped at 3**, so losses accumulate down
   the ladder.

### The risk this creates, and it is the big one — checked by M28

**Removing replay removes the player's only recovery mechanism.** Under M25 a player short of salvage
could re-fly a cleared body and grind their way to an upgrade. Without that, income per run is bounded
by how far the player gets — and a player stuck at body 3 has *no way to earn their way out of it*
except by playing body 1–3 better.

That moves the payout scale from "important" to **critical**, and it means the economy must guarantee
a floor: every run, however badly it goes, has to leave the player measurably stronger than the last,
or the loop deadlocks. M13's anti-frustration debrief is the existing hook for this and should be
re-tuned rather than re-invented. **Verify this before anything else in M28 is tuned.**

**M28 did that check first, and the floor was not holding — it had never fired.** The debrief was
banked and then zeroed by `wipeForDeath` on the next line, so since M24 a lost run had left exactly
nothing. It pays through the wipe now: the worst run the game allows — three landers thrown away on
moon-1, zero missions cleared — leaves 60 salvage and 40 research, worth one skill rank. A run that
dies at body 3 leaves 5 permanent upgrades.

The floor holds. What the guess got wrong was *which* number was broken: the payout scale was fine
all along, and the two things that were not are the debrief and the material scale.

## Suggested order of work

Ranked by how much each moves toward "upgrades are the price of entry". The first was blocking and is
done; the economy is now the front of the queue.

Now scheduled as **M27–M29** in `ROADMAP_STATUS.md`. In short:

1. ~~**Restore all ten bodies to the ladder** (M27).~~ **Done.** The materials became reachable by
   being on the route rather than by being repointed, all five tracks now reach L4, and the inverted
   ramp is fixed because the order is difficulty-sorted.
2. ~~**Re-cut the materials and the payout** (M28).~~ **Done** — ordering *and* scale. The payout
   needed no change; the material costs did.
3. ~~**Give each body a recommended tier and print it at the supply stop** (M28).~~ **Printed.** The
   other half — tuning pad width and machine damage against that lander — is **deliberately still
   open**, because it is a difficulty change and *is it hard or is it unfair?* is unanswered.
4. ~~**Let Hull answer the two-shot rule** (M28).~~ **It always did.** Hull L2 buys the third shot;
   the claim otherwise came from a test that encoded 150, a hull no level produces.
5. ~~**Make the seven survey bodies into content** (M29).~~ **Done.** 35 missions authored with
   distinct names, briefs, objectives and a set piece each; every hollow hazard implemented; and
   Tech Cores given a sink on the L3/L4 rungs. The audit that opened it found four bodies with no
   working weather at all, which no plan had listed.

Farming decay is **no longer needed** — Tom removed replay entirely, so there is nothing to decay.
See the risk that creates, above.

## What is already working — do not touch

- **The three-currency split.** Permanent salvage, perishable research, earned-but-free blueprints is
  a clean risk structure.
- **The material gate as a concept.** Needing Europa's ice salts for gear L3 is exactly right; it
  just has to point at bodies the player can reach.
- **The within-body ramp on Moon and Mars.** Quiet mission 1, tightening pads, rising machines,
  falling fuel, a tiny ×5 pad as the exam.
- **Spend-or-carry at the supply stop** — genuinely interesting once there is enough money for it to
  be a decision.

---

## How to re-measure everything above

```bash
# hangar cost curve and full total
node -e "import('./src/components.js').then(C=>{let g=0;for(const id of C.COMPONENT_IDS){const t=C.COMPONENTS[id];let s=0;t.levels.forEach((l,i)=>{if(!l.cost)return;s+=l.cost.salvage;console.log(t.name+' L'+(i+1)+': '+l.cost.salvage+'s '+JSON.stringify(l.cost.materials||{}));});g+=s;}console.log('TOTAL '+g);});"
```

```bash
# which hangar levels are reachable on the current ladder
node -e "Promise.all([import('./src/components.js'),import('./src/planets.js'),import('./src/route.js')]).then(([C,P,R])=>{const reach=new Set(R.PLANET_ORDER.map(id=>P.PLANETS[id].rareMaterial));for(const id of C.COMPONENT_IDS){const t=C.COMPONENTS[id];let cap=1;for(let i=1;i<t.levels.length;i++){const miss=Object.keys(t.levels[i].cost.materials||{}).filter(m=>!reach.has(m));if(miss.length){console.log(t.name+' capped at L'+cap+' by '+miss.join(', '));cap=-1;break;}cap=i+1;}if(cap>0)console.log(t.name+' full to L'+cap);}});"
```

```bash
# what a clean five-mission body clear pays
node -e "Promise.all([import('./src/economy.js'),import('./src/missions.js')]).then(([E,M])=>{for(const [n,ls] of [['MOON',M.MOON_LEVELS],['MARS',M.MARS_LEVELS],['EUROPA',M.EUROPA_LEVELS]]){let s=0,d=0;for(const l of ls){const r=E.missionReward({grade:'GOOD',padMultiplier:(l.pads[0]||{}).mult||2,fuelLeft:40,maxFuel:l.fuel,rareMaterial:l.rareMaterial,firstClear:true});s+=r.salvage;d+=r.data;}console.log(n+': '+s+' salvage, '+d+' data');}});"
```

```bash
# per-mission ramp within each body
node -e "import('./src/missions.js').then(M=>{for(const [n,ls] of [['MOON',M.MOON_LEVELS],['MARS',M.MARS_LEVELS],['EUROPA',M.EUROPA_LEVELS]]){console.log('== '+n);ls.forEach(l=>console.log('  '+l.id.padEnd(9)+' fuel '+l.fuel+'  pads '+(l.pads||[]).map(p=>'x'+p.mult+'/'+p.width).join(' ').padEnd(20)+' enemies '+(l.enemyBudget||0)));}});"
```

```bash
# every body's real properties, sorted by gravity
node -e "import('./src/planets.js').then(P=>{Object.keys(P.PLANETS).map(id=>({id,g:P.gravityFor(id)/6,p:P.PLANETS[id]})).sort((a,b)=>a.g-b.g).forEach(r=>console.log(r.id.padEnd(10)+r.g.toFixed(2).padStart(6)+'  '+String(r.p.atmosphere).padEnd(7)+' fric '+String(r.p.surfaceFriction).padEnd(5)+' '+(r.p.hazards||[]).join(',')));});"
```
