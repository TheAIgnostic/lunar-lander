# ROADMAP STATUS

Working document for the roguelite expansion. Source spec:
`Lunar_Landing_Roguelite_Roadmap_for_Claude.md`. Branch: `v2` off `snapshot-2026-08-16`.

**Rule for every milestone:** ends with a playable build, a passing test pass, a commit, and this
file updated. `main` stays untouched and playable throughout.

---

## Current state (measured, not assumed)

| Spec assumption | Reality in this codebase |
| --- | --- |
| "approximately 15 levels" | 12 campaign missions (4 worlds x 3) + endless mode |
| bodies | LUNA, MARS, EUROPA (cave), TITAN (wind+drag) |
| save system to migrate | 5 localStorage keys: `tv_high`, `tv_unlocked`, `tv_bests`, `tv_muted`, `tv_settings` |
| landing grades | hard per-band cutoffs in `ENVELOPE` (ship.js), evaluated on the first contact frame |
| terrain | midpoint-displacement heightmap + carved flat pads + optional cave ceiling |
| ~2600 lines | src/{util,audio,input,terrain,levels,particles,ship,render,main}.js |

Scale: **6 px = 1 m**. Thrust 130 px/s^2 (21.7 m/s^2). Gravity 28-66 px/s^2 (4.7-11 m/s^2).

---

## Gravity: recommended mapping

Literal m/s^2 values break the game — real Moon gravity (1.62) at this scale is 9.7 px/s^2, a
thrust-to-weight of 13, and Enceladus (0.11) would be 0.7 px/s^2, effectively weightless. That
violates pillar 1 (preserve the flight feel).

Recommendation: compress with `g_px = 28 * sqrt(g_real / 1.62)`, anchored on the Moon. This
preserves ordering and relative character while landing almost exactly on the existing tuning:

| Body | Real m/s^2 | Mapped px/s^2 | Note |
| --- | ---: | ---: | --- |
| Enceladus | 0.11 | 7.3 | floaty by design |
| Pluto | 0.62 | 17.3 | |
| Europa | 1.31 | 25.2 | |
| Titan | 1.35 | 25.6 | |
| Ganymede | 1.43 | 26.3 | |
| Moon | 1.62 | 28.0 | = current LUNA 1 exactly |
| Io | 1.80 | 29.5 | |
| Mercury | 3.70 | 42.3 | |
| Mars | 3.71 | 42.4 | = current MARS 4 (42) |
| Venus | 8.87 | 65.5 | = current TITAN 12 (66) |

Real values stay in the UI for flavour; the mapped value drives physics. Both live in
`PlanetDefinition`.

---

## Milestones

Sized to fit inside a single 5-hour usage window. Each is independently useful and leaves the
game coherent. Spec phases in brackets.

| # | Milestone | Contains | Risk |
| --- | --- | --- | --- |
| M0 | Audit + rails [P0] | architecture note, debug overlay (velocity/angle/fuel/impulse/seed/grade), baseline physics constants recorded, this file | low |
| M1 | Landing grade rework [P1a] | combined severity score (vy 45 / vx 25 / angle 20 / centre 10), config thresholds, 150-250 ms aggregation window, settle-upright rule, post-landing breakdown panel | low |
| M2 | Terrain grammar [P1b] | macro archetypes (crater/canyon/ridge/basin/shelf), approach constraints, landing-zone geometry, micro detail | **high** |
| M3 | Terrain validation [P1b] | autopilot-driven reachability proof, >=2 approach paths, no hidden lethality, deterministic seeds | medium |
| M4 | Moon chapter [P1] | Moon 1-5 on the new grammar, data-driven MissionDefinition | medium |
| M5 | Planet data model [P2] | PlanetDefinition/MissionDefinition/hazard+force interface; port existing wind/drag/cave into it | medium |
| M6 | Mars chapter [P2] | Mars 1-5: drag, gusts, dust visibility | low |
| M7 | Europa chapter [P2] | Europa 1-5: low friction, cracking ice, radiation timing | medium |
| M8 | Run loop + save v2 [P3a] | 3 shuttles, seed retention on retry, 5-mission chapters, sector checkpoints, versioned save + migration from tv_* | **high** |
| M9 | Route + economy [P3b] | 4-choice route cards, eligibility tiers, salvage/research/tech cores/materials, banking + crash recovery | medium |
| M10 | Hangar [P4] | close-up ship scene, 4 component tracks x 4 levels (Hull, Gear, Engine/Fuel, Sensors), visible ship changes, costs | medium |
| M11 | Skills + loadout [P5] | 3 trees x 4 nodes, 1 active + 1 passive slot, Laser/Shield/Sensor Pulse, Fuel Recycler/Gyro/Ice Cleats | medium |
| M12 | Enemies [P6] | shared telegraph/projectile/damage system, Sentry Turret + Seeker Drone, non-combat path validation | medium |
| M13 | MVP polish [P8] | balance from recorded data, accessibility, stats, full autopilot regression over all 15 missions | low |

M0-M13 delivers the spec's own MVP (section 18): Moon + Mars + Europa, 15 missions, roguelite
loop, hangar, skills, two enemies. The remaining 7 bodies (35 missions) are M14+ and are not
scheduled until the MVP is stable — the spec says the same.

---

## Progress

- [ ] M0 — not started

## Blockers / open questions

1. Gravity mapping — recommendation above, awaiting confirmation.
2. Fate of the current TITAN chapter and endless mode under the new structure.

## Next task

M0: audit and rails.
