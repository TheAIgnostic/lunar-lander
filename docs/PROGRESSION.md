# Progression audit

What the hangar, the skill trees and the loadout actually do, how difficulty is supposed to climb,
and where it does not. Measured from the code at `d941106` (after M26), not from design intent.

Written because Tom lost the overview after M24–M26 changed the run shape three times, and because
the audit found a blocker that no test catches: **four of the five hangar tracks cannot be climbed
at all on the current ladder.**

**Re-measure before trusting any number here.** Every figure below is reproducible with the
snippets in the last section.

---

## The three systems, and what a death costs

Three progression systems, three currencies, deliberately not interchangeable. The thing that
matters most is which survive a death, because that is the whole risk structure of a run.

| | buys | costs | on death | full cost |
| --- | --- | --- | --- | ---: |
| **Hangar** (`components.js`) | 5 tracks × 3 levels | salvage **+ body-specific material** | **kept** | 12,840 salvage |
| **Skills** (`skills.js`) | 3 trees × 4 nodes, ranked | research data | **wiped** | 1,555 data |
| **Loadout** (`modules.js`) | 1 active + 1 passive slot | nothing — blueprints are earned | blueprints **kept** | 5 active, 4 passive |

`Save.wipeForDeath` is the authority: it clears `purchasedSkills`, `banked` and the opened map, and
keeps `componentLevels`, `unlockedBlueprints` and `equipped`.

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

| # | body | gravity m/s² | friction | machines | hazards |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | Moon | 4.67 | 1.00 | 0–4 | none |
| 2 | Mars | **7.06** | 1.00 | **0–5** | wind, dust, channels |
| 3 | Europa | 4.11 | **0.07** | 0–3 | ice, radiation |

**The ramp is inverted.** Europa, the finale, has the weakest gravity in the game — weaker than the
Moon — the fewest machines, and a fuel budget that goes back up. Its difficulty rests entirely on ice
friction and radiation. Mars is the hardest body in the game and is flown second, so a player who
survives Mars finds the finale a relief.

---

## The blocker: the hangar is nailed shut

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

**Hull matters most here.** M24 set machine damage at exactly half a stock hull, and
`test/enemies-tests.js` asserts that a hull upgrade buys a third shot. Capped at L2 (+12%), 112 hull
still dies in two — so the assertion passes against a 150-hull figure the player cannot actually
reach. Either the materials are re-cut, or the damage wants to be ~45.

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

## The economy is an order of magnitude short

| | |
| --- | ---: |
| a clean 5-mission body clear pays | ~530 salvage, 85 data |
| what Tom's real Moon clear paid | **300 salvage, 112 data** |
| cheapest hangar upgrade (RCS L2) | 260 salvage |
| landing gear L2 | 320 salvage |
| full hangar | 12,840 salvage ≈ **24 body clears** |

**A perfect first chapter buys nothing.** That is the single worst number in the system, and it is
what Tom hit in playtest. A whole three-body expedition funds roughly four level-2 upgrades, so the
curve where a player accumulates enough to comfortably take the next body currently takes several
complete runs to appear.

Research is healthier — ~85 data per body against a 40–95 cheapest node, so about one skill per body
— but skills are wiped on death, so it never compounds.

---

## Are the other seven bodies finished?

**Systems yes, content no.** They are playable today and validated (30/30 structural, 30/30 reachable
since M9), but they are anonymous.

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

### Hazards named but not implemented

`ice` (Europa) and `darkness` (Pluto) *are* implemented — through `surfaceFriction` and `visibility`
rather than a force builder, so they do not appear in `forces.js` `BUILDERS`. These five are genuinely
hollow, flavour on the route card and nothing more:

| hazard | body | consequence |
| --- | --- | --- |
| acid, downdraft | Venus | survives on gravity 10.48 + dense drag |
| eruption | Io | keeps heat, loses its signature |
| magnetic, falseRadar | Ganymede | **both hollow — Ganymede is the Moon with a different colour** |

Roughly a week of content work to make all seven shippable: 35 names and briefs, 35 objectives, one
set piece each, three signature hazards.

---

## The proposed full ladder

Ordered by measured difficulty. Fixes the inverted ramp for free — Europa becomes a *teaching* body
for ice at position 2 rather than a limp finale, and Venus is a genuine wall to end on.

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

### The material map must be re-cut against whatever ladder is chosen

This is not automatic. Laying today's costs over the ladder above:

- **Hull L3 needs Venus (body 10)** while **Hull L4 needs Io (body 7)** — L4 cannot be bought before
  L3, so Hull caps at L2 until the last body of the run. That is the track that answers two-shot
  machines.
- **Sensors does not start until body 5** (Enceladus).

The rule it needs: **every track's L2 from bodies 1–3, L3 from bodies 3–6, L4 from bodies 6–10**, with
Hull's L2 pulled earlier than Mars. A re-authoring pass over `components.js`, not a formula.

---

## Open decision (as of 2026-08-20)

Ten bodies × five missions is **50 missions per run**, perhaps 60–90 minutes with retries. Long for a
roguelike run, but it does serve Tom's stated goal — "only a very high skilled player should pass all
bodies without substantial upgrades; it should be nearly impossible".

The alternative is a **run of five bodies drawn from the ten**, always opening on the Moon and always
ending on Venus, the middle three assigned by the run seed from the existing tiers. Shorter, more
replayable, every material reachable across a few runs, and it uses `eligibleBodies` rather than
deleting it.

**Recommended: the second.** It keeps a run to one sitting and makes the hangar the thing that
carries between runs, which is exactly the permanent/perishable split already built. A 50-mission run
makes a single run the whole game, which fights the loop.

Not yet decided. Whichever is chosen, the work splits into three commits: the ladder, the material
re-cut, and the survey-body content pass.

---

## Suggested order of work

Ranked by how much each moves toward "upgrades are the price of entry". The first two are blocking —
nothing else matters while four of five tracks are capped.

1. **Re-source the hangar materials onto reachable bodies.** Either repoint the blocked levels, or
   restore the other bodies to the ladder. Prefer restoring: it keeps the "this material comes from
   that world" texture, which is good design.
2. **Raise payout ~2.5× or halve the level-2 costs.** Target: a clean body clear buys one meaningful
   upgrade, a sloppy one nearly does.
3. **Make the ladder monotonic.** See the proposed order above.
4. **Give each body a recommended tier and print it on the route card.** Tune pad width and machine
   damage against *that* lander rather than a stock one. This is the mechanism that converts
   "upgrades are nice" into "upgrades are required"; nothing currently tells the game what the player
   is supposed to be flying.
5. **Decay farming payouts ~40% per replay.** M25 lets a cleared body be re-flown. Research already
   falls via `firstClear`; salvage does not, so grinding the Moon is optimal and flattens everything
   above it.
6. **Let Hull answer the two-shot rule** — either via fix 1, or drop machine damage to ~45.

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
