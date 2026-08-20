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

// --- ice: the shell fractures into stepped plates, and blades stand between them
{
  const icy = (over = {}) => cfg({
    terrain: { archetype: 'basin', relief: 260, detail: 1.2 }, surface: 'ice', ...over,
  });
  const rocky = cfg({ terrain: { archetype: 'basin', relief: 260, detail: 1.2 } });

  const t = new Terrain(icy(), 55);
  const r = new Terrain(rocky, 55);
  check('ice reports its surface', t.surface === 'ice');
  check('rock is the default', r.surface === 'rock' && r.seams.length === 0 && r.seracs.length === 0);
  check('an icy world fractures', t.seams.length > 0, `${t.seams.length} seams`);
  check('an icy world grows seracs', t.seracs.length > 0, `${t.seracs.length} seracs`);
  check('the ice pass actually reshapes the ground',
    Array.from(t.h).some((v, i) => v !== r.h[i]));

  // Same seed, same ice - and the streams are its own, so an ice pass on one
  // body can never shuffle the pads or the road on another.
  const t2 = new Terrain(icy(), 55);
  check('ice is deterministic',
    Array.from(t.h).every((v, i) => v === t2.h[i]) &&
    JSON.stringify(t.seracs) === JSON.stringify(t2.seracs) &&
    JSON.stringify(t.seams) === JSON.stringify(t2.seams));
  check('ice varies with the seed',
    JSON.stringify(new Terrain(icy(), 56).seracs) !== JSON.stringify(t.seracs));

  // The plates step against each other without walking: every throw is a real
  // one, it lands on a sample boundary, and the running total stays bounded, so
  // the far end of the map is never dragged off the bottom of the world.
  check('every seam has a real throw',
    t.seams.every((s) => Math.abs(s.drop) >= 9 - 0.001 && Math.abs(s.drop) <= 30 + 0.001),
    t.seams.map((s) => s.drop.toFixed(1)).join(' '));
  check('a seam lands on a sample boundary',
    t.seams.every((s) => Math.abs(s.x / t.step - Math.round(s.x / t.step)) < 1e-6));
  {
    let run = 0, worst = 0;
    for (const s of t.seams) { run += s.drop; worst = Math.max(worst, Math.abs(run)); }
    check('the plates step rather than walk', worst <= 34 + 0.001, worst.toFixed(1));
  }

  // A serac is in the heightmap, not drawn on top of it - which is the whole
  // reason collision comes free.
  for (const s of t.seracs) {
    check('a serac stands above the ground beside it',
      t.heightAt(s.x + s.lean * s.r) < Math.min(t.heightAt(s.x - s.r * 1.4), t.heightAt(s.x + s.r * 1.4)),
      `${Math.round(s.x)}`);
    check('a serac records the crest it actually has',
      Math.abs(s.top - t.heightAt(s.x + s.lean * s.r)) < 1.5);
  }

  // Nothing icy may touch a landing zone or the air above it.
  for (const t3 of [new Terrain(icy(), 3), new Terrain(icy(), 4), new Terrain(icy(), 5)]) {
    for (const p of t3.pads) {
      check('no serac near a pad',
        t3.seracs.every((s) => s.x + s.r < p.x1 - 60 || s.x - s.r > p.x2 + 60));
      check('no seam near a pad',
        t3.seams.every((s) => s.x < p.x1 - 100 || s.x > p.x2 + 100));
      // A plate carries its pad with it: the recorded pad height has to be the
      // ground the lander will actually touch, after every shear.
      check('a pad still sits on its own plate',
        Math.abs(p.y - t3.heightAt((p.x1 + p.x2) / 2)) < 2.5,
        `${p.y.toFixed(1)} vs ${t3.heightAt((p.x1 + p.x2) / 2).toFixed(1)}`);
      check('a pad is still flat', Math.abs(p.y1 - p.y2) < 12);
    }
    check('the fractured world stays inside its bounds',
      Array.from(t3.h).every((v) => v > t3.height * 0.2 && v < t3.height - 20));
  }

  // A roofed ice level is the tightest air in the game: it gets less of both.
  const cave = new Terrain(icy({ cave: true, clearance: 260 }), 55);
  let minGap = Infinity;
  for (let i = 0; i < cave.n; i++) minGap = Math.min(minGap, cave.h[i] - cave.ceiling[i]);
  check('ice never closes a cave corridor', minGap >= 200, minGap.toFixed(0));
  check('a cave gets smaller blades',
    Math.max(...cave.seracs.map((s) => s.r)) < Math.max(...t.seracs.map((s) => s.r)));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
