# TERMINAL VELOCITY

A neon-vector lunar lander. Space is the booster, `A`/`D` are the attitude burners, the tank is
finite, and the small pads pay the most. Twelve missions across four worlds, then an endless mode.

No dependencies, no build step, no image or audio assets — one canvas, ES modules, WebAudio.

## Run

```bash
python3 -m http.server 8781
```

Then open <http://localhost:8781>. (Any static server works; the `src/*.js` modules need `http://`,
not `file://`.)

### Or build one file you can double-click

```bash
node build.js
```

Writes `dist/terminal-velocity.html` — the nine modules and the stylesheet inlined into a single
self-contained page. That one runs straight from `file://` with no server at all, because the
restriction is on loading *external* module files, not on an inline `<script type="module">`.
Copy it anywhere; it works offline.

## Controls

| Key | Action |
| --- | --- |
| `Space` `W` `↑` | Main booster |
| `A` `←` / `D` `→` | Left / right attitude burner |
| `S` `↓` | Attitude hold — burns fuel to kill spin |
| `R` | Retry · `P`/`Esc` pause · `M` mute |

Touch devices get three on-screen pads in landscape.

## Layout

```
index.html      canvas + DOM overlay screens
style.css       UI chrome
src/util.js     math, seeded RNG
src/audio.js    synthesized engines, impacts, chimes
src/input.js    keyboard + touch -> intent
src/terrain.js  midpoint-displacement heightmap, pads, cave ceilings, fuel cells
src/levels.js   12 missions + endless generator
src/particles.js pooled particles, debris, rings, floating text
src/ship.js     integration, collision, landing verdict
src/render.js   parallax background, world, ship, HUD
src/main.js     state machine, camera, scoring, persistence
test/autopilot.js  phased autopilot used to verify every level is landable
```

`DESIGN.md` has the research the design came from and the full spec.

## Testing

The game exposes `__game`, `__ship`, `__input` and `__act` on `window`. With the server running,
load the autopilot in the browser console and fly the campaign unattended:

```js
const s = document.createElement('script'); s.src = '/test/autopilot.js'; document.head.appendChild(s);
// then
await __runAll(12)   // [{lvl, outcome, quality, fuelLeft, secs}, ...]
```

It flies the highest-multiplier pad on each mission (`__runAll(12, 0)` flies the *safe* pad instead).
That is the fuel-budget regression test: a mission that comes back `outcome: "crash"` with
`fuelLeft: 0` is a budget that got too tight.

Last full run — every mission lands, most of them on the ×5:

| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ✅ 43% | ✅ 37% | ✅ 31% | ✅ 45% | ✅ 56% | ✅ 34% | ✅ 49% | ✅ 46% | ✅ 48% | ✅ 44% | ✅ 33% | ✅ HARD |

**Known harness limit:** the autopilot has no terrain lookahead and hunts under crosswind, so on
Titan (10–12) it burns roughly twice what a human needs and sometimes runs dry chasing the ×5.
Those levels were validated by landing them individually rather than by its fuel figure.
