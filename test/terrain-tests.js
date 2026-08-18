// Structural tests for the terrain grammar. No browser needed:
//   node test/terrain-tests.js
import { Terrain } from '../src/terrain.js';
import { ARCHETYPE_NAMES } from '../src/archetypes.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) pass++; else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
};

const cfg = (over = {}) => ({
  width: 3000, height: 1400, groundBase: 300, rough: 190,
  pads: [{ mult: 2 }, { mult: 5 }], cave: false, fuelCells: 2, ...over,
});

console.log('terrain grammar');

// --- legacy path must be untouched: same seed, same everything
{
  const a = new Terrain(cfg(), 4242);
  const b = new Terrain(cfg(), 4242);
  check('legacy terrain is deterministic',
    Array.from(a.h).every((v, i) => v === b.h[i]) &&
    JSON.stringify(a.pads.map(p => [p.x1, p.y])) === JSON.stringify(b.pads.map(p => [p.x1, p.y])));
  check('legacy terrain reports itself as legacy', a.archetypeName === 'legacy' && a.shape === null);
  check('legacy terrain grows no rocks by default', a.rocks.length === 0);
}

// --- every archetype: structurally sound and reproducible
for (const name of ARCHETYPE_NAMES) {
  const c = cfg({ terrain: { archetype: name, relief: 260, detail: 1 } });
  const t = new Terrain(c, 99);
  const t2 = new Terrain(c, 99);
  const hs = Array.from(t.h);

  check(`${name}: deterministic`, hs.every((v, i) => v === t2.h[i]));
  check(`${name}: no NaN heights`, hs.every(Number.isFinite));
  check(`${name}: stays inside the world`,
    hs.every(v => v > c.height * 0.15 && v < c.height - 20),
    `${Math.min(...hs).toFixed(0)}..${Math.max(...hs).toFixed(0)}`);
  check(`${name}: produced the requested pads`, t.pads.length === c.pads.length);

  // pads must be flat enough to land on and must match the surface they cut
  for (const p of t.pads) {
    const mid = (p.x1 + p.x2) / 2;
    check(`${name}: pad surface matches heightAt`,
      Math.abs(t.heightAt(mid) - ((p.y1 + p.y2) / 2)) < 6,
      `${t.heightAt(mid).toFixed(1)} vs ${((p.y1 + p.y2) / 2).toFixed(1)}`);
    check(`${name}: pad slope is landable`, Math.abs(p.slope) <= 0.08, p.slope.toFixed(3));
    check(`${name}: pad is wide enough for the lander`, p.x2 - p.x1 >= 56, (p.x2 - p.x1).toFixed(0));
    check(`${name}: pad sits inside the level`, p.x1 > 20 && p.x2 < c.width - 20);
    // approach: nothing directly above the pad within a lander's height
    const clear = t.heightAt(mid) - Math.min(t.heightAt(mid - 30), t.heightAt(mid + 30));
    check(`${name}: pad is not buried in a spike`, clear < 140, clear.toFixed(0));
  }

  // pads must never be carved on top of each other
  for (let i = 1; i < t.pads.length; i++) {
    for (let j = 0; j < i; j++) {
      check(`${name}: pads ${j} and ${i} do not overlap`,
        t.pads[i].x1 > t.pads[j].x2 + 40 || t.pads[i].x2 < t.pads[j].x1 - 40,
        `${t.pads[j].x1.toFixed(0)}..${t.pads[j].x2.toFixed(0)} vs ${t.pads[i].x1.toFixed(0)}..${t.pads[i].x2.toFixed(0)}`);
    }
  }

  // the shape must actually create relief, not a flat field. Basin and dunes
  // are deliberately the gentle shapes, for opening missions.
  const span = Math.max(...hs) - Math.min(...hs);
  const floor = (name === 'basin' || name === 'dunes') ? 80 : 120;
  check(`${name}: creates real elevation change`, span > floor, span.toFixed(0));

  // the silhouette must fit the world rather than clip flat against its floor
  const atFloor = hs.filter(v => v > c.height - 45).length;
  const atRoof = hs.filter(v => v < c.height * 0.24).length;
  check(`${name}: does not clip against the world floor`, atFloor === 0, `${atFloor} samples`);
  check(`${name}: does not clip against the world roof`, atRoof === 0, `${atRoof} samples`);

  check(`${name}: rocks sit on the surface`,
    t.rocks.every(r => Math.abs(r.y - t.heightAt(r.x)) < 1.5));
  check(`${name}: no rocks on a pad`, t.rocks.every(r => !t.padAt(r.x)));
}

// --- a different seed gives a different map
{
  const c = cfg({ terrain: { archetype: 'crater', relief: 260, detail: 1 } });
  const a = new Terrain(c, 1), b = new Terrain(c, 2);
  check('crater varies with the seed', Array.from(a.h).some((v, i) => v !== b.h[i]));
}

// --- cave ceilings still leave a corridor when combined with a shape
{
  const c = cfg({ terrain: { archetype: 'canyon', relief: 240 }, cave: true, clearance: 260 });
  const t = new Terrain(c, 7);
  let minGap = Infinity;
  for (let i = 0; i < t.n; i++) minGap = Math.min(minGap, t.h[i] - t.ceiling[i]);
  check('cave + archetype keeps a corridor', minGap >= 200, minGap.toFixed(0));
  for (const p of t.pads) {
    check('cave leaves headroom above each pad', p.y - t.ceilingAt((p.x1 + p.x2) / 2) > 260);
  }
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
