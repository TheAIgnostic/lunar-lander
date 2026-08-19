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
| `R` | Retry · `P`/`Esc` pause · `M` mute |

Touch devices get three on-screen pads in landscape.

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

23 modules under `src/`, plus `test/` and `macos/`. **`docs/ARCHITECTURE.md` is the map** — what each
file owns, the dev hooks on `window`, the environment gotchas, and the baseline physics constants.

- `DESIGN.md` — the research the original design came from
- `ROADMAP_STATUS.md` — the roguelite expansion: milestones, decisions, open findings, next task
- `test/BASELINE.md` — measured behaviour at every milestone

## Testing

The game exposes `__game`, `__ship`, `__input` and `__act` on `window`. With the server running,
load the autopilot in the browser console and fly the campaign unattended:

```js
const s = document.createElement('script'); s.src = '/test/autopilot.js'; document.head.appendChild(s);
// then
await __runAll(12)   // [{lvl, outcome, quality, fuelLeft, secs}, ...]
```

Or run every check at once:

```bash
./test/run-all.sh 20
```

The autopilot flies the highest-multiplier pad on each mission (`__runAll(12, 0)` flies the *safe* pad instead).
That is the fuel-budget regression test: a mission that comes back `outcome: "crash"` with
`fuelLeft: 0` is a budget that got too tight.

Last full run of the classic campaign — every mission lands:

| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

The autopilot's old crosswind and ceiling weaknesses were fixed in M6 and M7; see `test/BASELINE.md`
for the before/after numbers.