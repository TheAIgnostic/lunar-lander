# TERMINAL VELOCITY — Design Document

A neon-vector lunar lander for the browser. One canvas, no dependencies, 60 fps.

---

## 1. Research summary (what the lineage teaches)

| Era | Game | Contribution the design keeps |
| --- | --- | --- |
| 1969 | Storer's *Lunar* (text, PDP-8) | Fuel is the real resource. Every input costs something irreversible. |
| 1973 | *Moonlander* (DEC GT-40, vector) | Vector line art + glow reads instantly at any zoom. |
| 1973 | *LEM* | Horizontal velocity and thrust at an angle — the two-axis problem that makes it a *game*. |
| 1979 | Atari *Lunar Lander* | Proportional throttle, flashing pads with **bonus multipliers higher for smaller pads**, score from landing quality + remaining fuel, operator-set fuel budget. |
| 1995+ | Side-scrolling clones | Terrain wider than the screen, camera work, caves. |
| Modern (itch.io wave) | *Planet Lander*, *Lander* demakes | Multi-world progression, cave tunnels, pickups, per-level bests. |

From game-feel research: responsiveness first, then juice. Screen shake with **exponential trauma decay**, particles that erupt *along the impact vector*, bright-to-dark particle fade, squash/stretch, and UI that pulses on state change.

The three-input spec the user asked for is the Atari control scheme minus the throttle knob:
**Space = main booster · Left/Right = RCS attitude burners · fuel is finite.**

---

## 2. The pitch

You fly a fragile vector lander down a procedurally carved world toward pads that flash a multiplier. Gravity never stops pulling. The booster is loud, strong and expensive; the side burners are cheap but they *rotate* you, so every correction is a commitment. Land soft, land level, land on the small pad — or become debris.

Session shape: **12 hand-tuned missions across 4 worlds**, then **Endless** with escalating difficulty. A run lasts 30 seconds to 3 minutes. Restart is one key.

---

## 3. Controls

| Input | Action | Fuel/s |
| --- | --- | --- |
| `Space` / `W` / `↑` | Main booster — thrust along the ship's nose vector | 9 |
| `A` / `←` | Left RCS burner — angular accel counter-clockwise | 3.2 |
| `D` / `→` | Right RCS burner — angular accel clockwise | 3.2 |
| `S` / `↓` | Attitude hold — burns fuel to null out spin | 5 |
| `R` | Retry · `P`/`Esc` pause · `M` mute | — |
| Touch | Three on-screen pads (left burner / booster / right burner) | — |

Attitude hold is the concession to fairness: vacuum rotation has no natural damping, and without an assist the RCS becomes a punishment. It costs fuel, so it is a trade, not a free ride.

## 4. Physics model

- Vacuum worlds: no drag. Atmosphere worlds (Titan, Endless variants) add drag + **wind** with a sine-gust component and a HUD wind vane.
- `gravity` 28–72 px/s² per world; `thrust` 130 px/s² applied along `(sin θ, −cos θ)`.
- Angular: RCS `±5.0 rad/s²`, clamped to `±3.2 rad/s`, light `0.995` damping so the craft is controllable but never self-corrects.
- Integration: semi-implicit Euler, fixed `1/120 s` substeps with an accumulator so physics is frame-rate independent.
- Collision: three body points (left foot, right foot, hull apex) sampled against the terrain heightmap; cave levels add a ceiling map that is always lethal.

## 5. Landing verdicts

Both feet must be inside a pad, and:

| Verdict | Descent rate | Lateral | Tilt | Payout |
| --- | --- | --- | --- | --- |
| **PERFECT** | < 11 px/s | < 7 | < 3.5° | ×3.0 quality |
| **GOOD** | < 20 | < 13 | < 8° | ×2.0 |
| **HARD** | < 34 | < 22 | < 15° | ×1.0, sparks and a bounce of dust |
| **CRASH** | anything worse, hull contact, or ceiling contact | | | lose a life |

Hull apex touching ground is always a crash — you must land on the legs, and ceiling ice is always fatal.

**Off the pad:** a PERFECT or GOOD touchdown on ground shallower than 10° survives as
**DOWN SAFE — OFF PAD**: it pays the base ×1 rate, costs no lander, and breaks the streak.
Steeper ground, or a HARD arrival off the pad, still crashes. Playtesting made the case: losing a
run to a textbook landing forty pixels short of a ×5 sliver reads as the game cheating, while ×1 and
a broken streak still make missing the pad hurt.

**Fuel budget.** A full tank is about 25 s of continuous burn. The dominant cost is fighting gravity
for the length of the flight (`g × T`), so budgets scale with world gravity: Luna 92–110, Mars
116–130, Europa 112–124, Titan 160–178. Flown competently each mission lands with a third to a half
of the tank left — which is exactly the fuel score bonus.

## 6. Scoring

```
landing = 100 × padMultiplier × qualityFactor
fuel    = floor(remainingFuel) × 2
combo   = ×(1 + 0.25 × (streak − 1)), capped ×3
total  += (landing + fuel) × combo
```

Pads are `×2 / ×3 / ×5` — **the smaller the pad, the bigger the number**, straight from the 1979 cabinet. A crash resets the streak. Per-level bests and the all-time high score persist in `localStorage`.

## 7. Progression

| World | Levels | Gravity | Twist |
| --- | --- | --- | --- |
| **LUNA** | 1–3 | low | teaching: wide pad → two pads → narrow ×5 pad |
| **MARS** | 4–6 | medium | rough terrain, thin fuel, first ×5 forced |
| **EUROPA** | 7–9 | low, icy | **cave ceilings** — vertical corridors |
| **TITAN** | 10–12 | high | **wind + drag**, gusts that shift mid-descent |
| **ENDLESS** | ∞ | scaling | all modifiers mixed, seeded, fuel shrinks |

Floating **fuel cells** (+22) are scattered on the harder levels — a risk/reward detour. 3 lives per run.

## 8. Look and feel

- Palette: near-black `#05060c` ground-up gradient, cyan `#5ff5ff` hull, magenta `#ff4fd8` pads, amber `#ffb347` exhaust, red `#ff3b5c` alarms.
- Everything is stroked vector geometry with `shadowBlur` glow — no sprites, no image assets.
- Parallax: 3 star layers + 2 silhouetted mountain ranges + a planet disc on the horizon.
- Camera: follows with velocity lookahead, eases from 0.72× (cruise) to 1.35× (final approach) zoom, trauma-based shake.
- Landing kicks a dust plume; crashing shatters the ship into its own line segments and fires a shockwave ring.
- Audio is fully synthesized WebAudio: filtered noise for the booster (cutoff tracks throttle), a thinner band for RCS, a detuned saw thump for impact, a major arpeggio for a perfect landing.
- HUD: fuel arc, altitude ladder, split V/H velocity tapes that turn green inside the landing envelope, tilt bubble, wind vane, and an off-screen pad chevron.

## 9. Architecture

```
lander/
  index.html      canvas + DOM overlays (menu, briefing, results, pause)
  style.css       neon UI chrome, responsive, touch controls
  src/
    util.js       math, seeded RNG, easing
    audio.js      WebAudio synth voices
    input.js      keyboard + touch → intent object
    terrain.js    midpoint-displacement heightmap, pad carving, caves
    levels.js     12 mission configs + endless generator
    particles.js  pooled particles, debris, shockwaves, floating text
    ship.js       state, integration, collision, landing verdict
    render.js     background, world, ship, HUD
    main.js       state machine, camera, scoring, persistence
```

Fixed-step simulation, render interpolation off (fixed step is small enough), pooled particles so no GC churn mid-flight.
