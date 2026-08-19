# TERMINAL VELOCITY

A neon-vector lunar lander. Space is the booster, `A`/`D` are the attitude burners, the tank is
finite, and the small pads pay the most.

Three ways to play, side by side:

- **EXPEDITION** — a roguelite run. Three shuttles, five missions a body, then choose your next leg
  from four route cards. Bank salvage, spend it in the hangar, spend research in the skill trees.
- **CLASSIC** — the original twelve missions across four worlds, unchanged.
- **ENDLESS** — procedurally escalating sectors.

Fifteen authored missions across the Moon, Mars and Europa, plus generated survey chapters for every
other body, so no route card leads nowhere.

Every map is a gradient. The near landing zone is always reachable on the tank you start with, and
it always gets you home. The good material is at the far end, past a line of fuel cells you have to
fly low and slow to collect — and that low road is the ground the guns can see. Going deep is a
decision you make on the way out, not a whim at the end.

Some of that ground is defended. Abandoned security machines track you, telegraph every shot, and
cost you hull — but never a landing: every mission keeps one pad that nothing can reach, so a weapon
is a choice and never a requirement.

No dependencies, no build step, no image or audio assets — one canvas, ES modules, WebAudio.

## Run

```bash
node serve.js
```

Then open <http://localhost:8791>. Any static server works — the `src/*.js` modules only need
`http://` rather than `file://` — but this one sends everything `no-store`, which matters when you
are editing: browsers cache ES modules hard enough that a reload will happily serve the file you
just changed away.

### Or build one file you can double-click

```bash
node build.js
```

Writes `dist/terminal-velocity.html` — every module and the stylesheet inlined into a single
self-contained page. That one runs straight from `file://` with no server at all, because the
restriction is on loading *external* module files, not on an inline `<script type="module">`.
Copy it anywhere; it works offline.

## macOS app

```bash
./macos/build.sh            # builds dist/Terminal Velocity.app
./macos/build.sh --install  # ...and copies it to /Applications
```

A ~900 KB native shell: an `NSWindow` hosting the bundled page in a `WKWebView`, with its own Dock
icon (drawn by `macos/make-icon.swift` from the same polygon the game draws the ship with), a menu
bar, and native full screen. The game code is untouched — no Electron, no framework, just `swiftc`
and the Xcode command line tools.

The build ends with a self-test: it loads the page headlessly, asserts the game booted inside the
web view, and fails the build if it did not.

Being unsigned, the first launch from Finder may need a right-click -> Open. Handing it to someone
else without that step requires an Apple Developer account to sign and notarize.

## Controls

| Key | Action |
| --- | --- |
| `Space` `W` `↑` | Main booster |
| `A` `←` / `D` `→` | Left / right attitude burner |
| `S` `↓` | Attitude hold — burns fuel to kill spin |
| `E` `Q` | Fire the equipped active module |
| `R` | Retry · `P`/`Esc` pause · `M` mute |

Touch devices get the same controls as on-screen pads in landscape, including the module button.
Every flight control can be rebound in **Settings → Controls**; retry, pause, mute and escape are
reserved so the menu is always reachable.

### Accessibility

**Settings** also carries motion, flashing, instrument size and contrast. All four change how the
game is *presented* and nothing about how it behaves — there is a test that flies the same mission
with every one of them changed and asserts a byte-identical result.

- **Motion** — screen shake at full, half or off.
- **Flashing** — pulsing and strobing at full, reduced or held steady. A warning never disappears
  when you turn this down; it stops moving.
- **Instrument size** — the HUD and every menu at 85%, 100% or 125%.
- **Contrast** — pads get a white bar and squared ends, threats get a white ring and a letter, so
  every marker in the game is readable without relying on colour.

### Steering modes

**Settings** (in the menu, on the pause screen, or `⌘,` in the macOS app) offers two schemes:

- **Classic** — the side burners are attitude control. Point the nose, then burn. Left plus booster
  drifts you left; left on its own only spins you. This is the 1969 problem, and the only way to fly
  the tight pads well.
- **Direct** — the side burners push the lander sideways and the hull holds itself upright. Left
  means left with no attitude to manage, at a slightly higher fuel cost per nudge.

Classic rotation can also be **inverted**, for pilots who read the stick the other way round. The
choice persists between sessions.

## Layout

26 modules under `src/`, plus `test/` and `macos/`. **`docs/ARCHITECTURE.md` is the map** — what each
file owns, the dev hooks on `window`, the environment gotchas, and the baseline physics constants.

- `DESIGN.md` — the research the original design came from
- `ROADMAP_STATUS.md` — the roguelite expansion: milestones, decisions, open findings, next task
- `test/BASELINE.md` — measured behaviour at every milestone
- `LOGBOOK` in the main menu — your own statistics: landings, losses, fuel efficiency, best grade
  per mission, threats destroyed and threats flown past

## Testing

The game exposes `__game`, `__ship`, `__input` and `__act` on `window`. With the server running,
load the autopilot in the browser console and fly the campaign unattended:

```js
const s = document.createElement('script'); s.src = '/test/autopilot.js'; document.head.appendChild(s);
await __autopilotReady;          // it imports the shared control law as a module
// then
await __runAll(12)               // [{lvl, outcome, quality, fuelLeft, secs}, ...]
__runChapter('MARS')             // one expedition chapter, headlessly
```

Or run every check at once:

```bash
./test/run-all.sh 20
```

The autopilot flies the highest-multiplier pad on each mission (`__runAll(12, 0)` flies the *safe* pad instead).
That is the fuel-budget regression test: a mission that comes back `outcome: "crash"` with
`fuelLeft: 0` is a budget that got too tight.

The full regression is `node test/mvp-regression.js 20`: all 27 missions at 20 seeds each, enemies
live where a mission has them, flown with nothing equipped. Every mission has a seed the autopilot
lands on; 92% of flights land overall. It also measures the simulation under its worst intended load
(four machines firing and a laser burning: 1.3 µs per 120 Hz step), a sixty-mission session, and that
a seed reproduces its flight exactly.

The autopilot's crosswind and ceiling weaknesses were worked on in M6, M7 and M13; see
`test/BASELINE.md` for the before/after numbers.