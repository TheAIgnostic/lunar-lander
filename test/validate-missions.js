// Mission validation sweep (roadmap section 5, layer 5 + section 17).
// Structural checks plus a real flight, over many seeds, with no browser:
//   node test/validate-missions.js [seedCount]
import { Terrain } from '../src/terrain.js';
import { validateTerrain, validateEnemies, sanctuaryClear } from '../src/validate.js';
import { flyMission } from './pilot.js';
import { LEVELS } from '../src/levels.js';
import { ARCHETYPE_NAMES } from '../src/archetypes.js';
import { CHAPTERS, chapterFor } from '../src/missions.js';
import { PLANET_ORDER } from '../src/route.js';

const SEEDS = +(process.argv[2] || 12);
let hardFail = 0;
const warnings = [];

const base = {
  width: 3000, height: 1400, groundBase: 300, rough: 190, gravity: 32, fuel: 110,
  wind: 0, gust: 0, drag: 0, cave: false, fuelCells: 0,
};

// The test pilot has a known weakness: sustained crosswind. Those missions were
// verified by hand in earlier sessions, so a flight failure there is reported
// as a pilot limitation rather than a broken mission - but it is never hidden.
const PILOT_LIMITED = (level) => Math.abs(level.wind || 0) >= 30;

/** The nearest landing zone - the one every mission promises you can reach. */
const nearIndex = (terrain) => {
  let best = 0;
  terrain.pads.forEach((p, i) => {
    if ((p.tier || 0) < (terrain.pads[best].tier || 0)) best = i;
  });
  return best;
};

function assess(label, level, seedList) {
  const rows = [];
  for (const seed of seedList) {
    let terrain;
    try {
      terrain = new Terrain(level, seed);
    } catch (e) {
      rows.push({ seed, structural: [String(e.message)], flight: null });
      continue;
    }
    const v = validateTerrain(level, terrain);

    // Two routes, because the map has two. The way home is the near zone on the
    // starting tank, flown straight in and then deliberately from each side -
    // two of three succeeding is "at least two viable approach paths". The
    // prize is the deep zone by way of the fuel road, and it is evidence rather
    // than proof: a deep run the test pilot fumbles is not a broken mission.
    const near = nearIndex(terrain);
    const runs = [
      flyMission(level, terrain, { padIndex: near }),
      flyMission(level, terrain, { padIndex: near, approach: 'left' }),
      flyMission(level, terrain, { padIndex: near, approach: 'right' }),
    ];
    const deep = flyMission(level, new Terrain(level, seed), { padIndex: 0, viaCells: true });
    const landed = runs.filter((r) => r.outcome === 'land').length;
    const reached = runs.filter((r) => r.reached).length;
    rows.push({ seed, structural: v.problems, flight: { landed, reached, runs, deep, notes: v.notes } });
  }

  const structuralFails = rows.filter((r) => r.structural.length).length;
  const unreachable = rows.filter((r) => r.flight && r.flight.reached === 0).length;
  const unflyable = rows.filter((r) => r.flight && r.flight.landed === 0).length;
  const singlePath = rows.filter((r) => r.flight && r.flight.reached === 1).length;
  // A validator can *prove* geometry. It can only offer *evidence* about
  // flyability, because a failed flight may be the test pilot's fault. So
  // structural problems fail the sweep; flight problems are always reported
  // but never silently treated as proof that a mission is impossible.
  const limited = PILOT_LIMITED(level);
  const ok = structuralFails === 0;
  if (unreachable) warnings.push(`${label}: ${unreachable}/${seedList.length} seeds the pilot never reached the pad`);
  if (!ok) hardFail++;

  const mark = !ok ? 'FAIL' : (unreachable ? 'warn' : (unflyable === 0 ? 'ok  ' : 'ok* '));
  const n = seedList.length;
  const deepLanded = rows.filter((r) => r.flight && r.flight.deep.outcome === 'land').length;
  const deepCells = rows.filter((r) => r.flight).reduce((a, r) => a + r.flight.deep.cellsTaken, 0);
  console.log(`${mark} ${label.padEnd(22)} structural ${String(n - structuralFails).padStart(3)}/${n}` +
    `   home ${String(n - unflyable).padStart(3)}/${n}` +
    `   prize ${String(deepLanded).padStart(3)}/${n}` +
    `   cells ${(deepCells / Math.max(1, n)).toFixed(1)}` +
    `   single-path ${String(singlePath).padStart(3)}`);

  if (unflyable && !unreachable) {
    console.log(`       ${unflyable}/${seedList.length} seeds: pad reached but touchdown missed — pilot precision${limited ? ` (crosswind ${level.wind}±${level.gust})` : ''}, not a mission defect`);
  }
  for (const r of rows) {
    if (r.structural.length) console.log(`       seed ${r.seed}: ${r.structural.join('; ')}`);
    else if (r.flight && r.flight.reached === 0) {
      const dv = r.flight.notes.deltaV;
      console.log(`       seed ${r.seed}: the near pad was never reached (closest ${r.flight.runs.map((x) => x.closest).join('/')} px) ` +
        `(${r.flight.runs.map((x) => `${x.outcome}${x.grade ? '/' + x.grade : ''}`).join(', ')})` +
        `  deltaV need ${dv.near} / tank ${dv.tank}`);
    }
  }
  return ok;
}

const seedList = Array.from({ length: SEEDS }, (_, i) => 1000 + i * 137);

console.log(`\nvalidating each archetype over ${SEEDS} seeds\n`);
for (const name of ARCHETYPE_NAMES) {
  assess(name, { ...base, terrain: { archetype: name, relief: 260, detail: 1 }, pads: [{ mult: 2 }, { mult: 5, width: 90 }] }, seedList);
}

console.log(`\nvalidating cave variants\n`);
for (const name of ['canyon', 'crater', 'basin']) {
  assess(`${name} + ice ceiling`, {
    ...base, cave: true, clearance: 280, fuel: 124,
    terrain: { archetype: name, relief: 240, detail: 1 }, pads: [{ mult: 3, width: 150 }],
  }, seedList);
}

// **Every authored chapter, in ladder order.** Three bodies were authored until
// M29 and are now ten, so this walks `CHAPTERS` rather than three named
// exports: a chapter added to the game is validated because it exists, not
// because somebody remembered to add a line here.
for (const pid of PLANET_ORDER) {
  const chapter = Object.values(CHAPTERS).find((c) => c.planet === pid);
  if (!chapter) continue;
  console.log(`\nvalidating the ${chapter.title} chapter (ladder position ${PLANET_ORDER.indexOf(pid) + 1})\n`);
  for (const level of chapter.levels) {
    assess(`${level.id} ${level.title}`, level, seedList);
  }
}

// **The invariant the deleted generator used to provide.**
//
// Until M29 this block swept `generateChapter`, the fallback that produced a
// five-mission survey chapter for any body without authored content. It is what
// let the ladder go from three bodies to ten in M27 without ten chapters having
// to exist first, and M29 authored all ten, which left it reachable by nothing.
// Deleted on Tom's call.
//
// What it was really providing was the guarantee that **every body on the
// ladder has something to fly**, and deleting a fallback without replacing that
// guarantee is how a body added later becomes a blank screen. So it is checked
// directly here, and asserted again in `route-tests.js`: a missing chapter is a
// failing test rather than a generated apology.
console.log(`\nchecking every body on the ladder has an authored chapter\n`);
{
  const missing = PLANET_ORDER.filter((pid) => !Object.values(CHAPTERS).some((c) => c.planet === pid));
  if (missing.length) {
    hardFail++;
    console.log(`FAIL  ${missing.length} bodies have no authored chapter: ${missing.join(', ')}`);
  } else {
    const counts = PLANET_ORDER.map((pid) => {
      const c = Object.values(CHAPTERS).find((x) => x.planet === pid);
      return `${pid.slice(0, 3).toLowerCase()} ${c.levels.length}`;
    });
    console.log(`ok    all ${PLANET_ORDER.length} bodies authored   ${counts.join(' · ')}`);
  }
  // And that `chapterFor` fails loudly rather than quietly for one that is not.
  let threw = false;
  try { chapterFor('NOT_A_BODY', 1); } catch { threw = true; }
  if (!threw) { hardFail++; console.log('FAIL  chapterFor does not throw for an unknown body'); }
}

// ---------------------------------------------------------------- combat
//
// M12's acceptance criterion was that a weapon is never required, and it was
// enforced here as "an unarmed autopilot survives the safe route on every
// seed". **M24 retired that**, deliberately and on Tom's call: the guns hit for
// half a hull, lock in a quarter second and shoot three times faster, and the
// promise is now narrower and stated exactly:
//
//     the sanctuary PAD is unreachable. The crossing to it is not.
//
// So the hard gate is the geometry - `sanctuaryClear`, the lowest-multiplier
// pad and the 420 px column above it, outside every machine's engagement disc.
// That still holds 20/20 everywhere and still fails the run if it breaks.
//
// Surviving the crossing is now a *measurement*, not a proof. It is still flown
// and still printed, because a number that nobody watches rots - but it is
// evidence about difficulty, and the instrument producing it (an autopilot with
// no weapon, no shield and no evasive logic whatsoever) measures the floor, not
// what a person meets. Read a fall here as "this got harder", never as "this
// broke"; the thing that would be broken is the sanctuary line above it.
console.log(`\nvalidating combat: every armed mission, flown with no weapon\n`);
// Every armed mission on the ladder, all ten bodies since M29 - the sanctuary
// promise is made by every mission that has a machine on it, so the proof has
// to cover every mission that has a machine on it.
const ARMED = PLANET_ORDER
  .map((pid) => Object.values(CHAPTERS).find((c) => c.planet === pid))
  .filter(Boolean)
  .flatMap((c) => c.levels)
  .filter((l) => l.enemyBudget > 0);
let combatFail = 0;
// Campaign-wide: how often the crossing to the safe pad kills an unarmed,
// non-evading autopilot. M24 accepts this as difficulty rather than failure,
// so it is tracked as a headline number instead of a gate.
let crossingLost = 0;
let crossingFlown = 0;
for (const level of ARMED) {
  const rows = [];
  for (const seed of seedList) {
    const terrain = new Terrain(level, seed);
    const ev = validateEnemies(level, terrain, seed);
    const exposure = sanctuaryClear(level, terrain, ev.enemies);
    // The guarantee is about the *sanctuary*: the near landing zone and the
    // column above it stay outside every machine's reach, so a weapon is never
    // the price of completing a mission. That is the flight this proves.
    //
    // It used to fly with no `padIndex`, which targets the highest-multiplier
    // pad - the deep zone, past the fuel road, with the guards on it. That is
    // the risk route, and "you can take the prize unarmed" is a stronger claim
    // than the design makes. It is still measured, and still printed, but as
    // evidence rather than as the proof.
    const near = nearIndex(terrain);
    const armed = flyMission(level, terrain, { padIndex: near, enemies: true, enemySeed: seed });
    const quiet = flyMission(level, terrain, { padIndex: near });
    const prize = flyMission(level, new Terrain(level, seed), { enemies: true, enemySeed: seed, viaCells: true });
    rows.push({ seed, ev, exposure, armed, quiet, prize });
  }
  const structural = rows.filter((r) => r.ev.problems.length).length;
  const exposed = rows.filter((r) => !r.exposure.ok).length;
  const shotDown = rows.filter((r) => r.armed.lostToFire).length;
  const costLanding = rows.filter((r) => r.quiet.outcome === 'land' && r.armed.outcome !== 'land').length;
  const landed = rows.filter((r) => r.armed.outcome === 'land').length;
  const placed = rows.reduce((a, r) => a + r.ev.enemies.length, 0) / rows.length;
  const worstHull = Math.min(...rows.map((r) => r.armed.hull));
  const prizeLost = rows.filter((r) => r.prize.lostToFire).length;
  const prizeLanded = rows.filter((r) => r.prize.outcome === 'land').length;
  const hits = rows.reduce((a, r) => a + (r.armed.combat ? r.armed.combat.hitsTaken : 0), 0) / rows.length;

  // The geometry is the proof. Everything else on this line is evidence.
  const ok = structural === 0 && exposed === 0;
  // A combat failure is not a structural one, and reporting it as one sent M24
  // looking for terrain damage that did not exist. Counted as what it is.
  if (!ok) { combatFail++; }
  crossingLost += shotDown;
  crossingFlown += rows.length;
  const n = rows.length;
  console.log(`${ok ? (costLanding ? 'ok* ' : 'ok  ') : 'FAIL'} ${(level.id + ' ' + level.title).padEnd(22)}` +
    ` placed ${placed.toFixed(1)}/${level.enemyBudget}   sanctuary ${String(n - exposed).padStart(3)}/${n}` +
    `   survived fire ${String(n - shotDown).padStart(3)}/${n}   landed ${String(landed).padStart(3)}/${n}` +
    `   hull>=${String(worstHull).padStart(3)}   hits ${hits.toFixed(1)}` +
    `   · prize unarmed ${String(prizeLanded).padStart(2)}/${n}${prizeLost ? ` (lost ${prizeLost})` : ''}`);
  for (const r of rows) {
    if (r.ev.problems.length) console.log(`       seed ${r.seed}: ${r.ev.problems.join('; ')}`);
    if (!r.exposure.ok) console.log(`       seed ${r.seed}: sanctuary pad exposed in ${r.exposure.exposed} samples`);
    if (r.armed.lostToFire) console.log(`       seed ${r.seed}: lost to fire on the crossing (the pad itself stayed clear)`);
  }
  if (costLanding) {
    warnings.push(`${level.id}: ${costLanding}/${n} seeds the pilot landed unarmed and quiet but missed under fire`);
    console.log(`       ${costLanding}/${n} seeds: reached and survived, but the touchdown slipped - pilot precision under pressure`);
  }
}

console.log(`\nvalidating the classic campaign (legacy terrain)\n`);
for (const level of LEVELS) {
  assess(`${level.id} ${level.title}`, level, seedList);
}

if (warnings.length) {
  console.log('\nflight warnings (geometry is sound; the test pilot fell short):');
  for (const w of warnings) console.log(`  - ${w}`);
}
const crossPct = crossingFlown ? Math.round(100 * (crossingFlown - crossingLost) / crossingFlown) : 100;
console.log(`\nthe crossing to the safe pad, flown unarmed with no evasive logic: ` +
  `${crossingFlown - crossingLost}/${crossingFlown} survived (${crossPct}%). ` +
  `M24 accepts this as difficulty - the guarantee is the pad, not the route to it.`);
console.log(`\n${hardFail === 0 ? 'all mission families structurally valid' : `${hardFail} mission families STRUCTURALLY INVALID`}` +
  `${combatFail === 0 ? `, every armed mission keeps its sanctuary` : `, ${combatFail} armed missions WITH AN EXPOSED SANCTUARY`}` +
  `${warnings.length ? `, ${warnings.length} with flight warnings` : ''}\n`);
process.exit(hardFail || combatFail ? 1 : 0);
