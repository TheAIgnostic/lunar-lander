#!/bin/bash
# Every check, in the order that fails fastest.  ./test/run-all.sh
#
# `set -o pipefail` matters more than it looks: every line below pipes through
# `tail`, and without it the pipeline reports *tail's* exit status. The mission
# validator failed two families and this script still printed "all checks
# passed", which is the one thing a test runner must never do.
set -e
set -o pipefail
cd "$(dirname "$0")/.."
echo "=== unit: landing grader ==="   && node test/landing-tests.js  | tail -2
echo "=== unit: forces + planets ===" && node test/forces-tests.js   | tail -2
echo "=== unit: save + migration ===" && node test/save-tests.js | tail -2
echo "=== unit: route + economy ===" && node test/route-tests.js | tail -2
echo "=== unit: components ===" && node test/components-tests.js | tail -2
echo "=== unit: skills + modules ===" && node test/skills-tests.js | tail -2
echo "=== unit: loadout reaches the sim ===" && node test/loadout-tests.js | tail -3
echo "=== unit: terrain grammar ===" && node test/terrain-tests.js  | tail -2
echo "=== unit: enemies + abilities ===" && node test/enemies-tests.js | tail -2
echo "=== unit: settings + bindings ===" && node test/settings-tests.js | tail -2
# A gate, not a measurement: "which slot it is in decided the sky" is a bug.
# Deliberately not in `mutate.sh`'s list - it takes ~10 s and mutate.sh is meant
# to be run a dozen times in a sitting.
echo "=== gate: two actives, either way round ===" && node test/slot-order.js | tail -3
echo "=== unit: objectives + gradient ===" && node test/objectives-tests.js | tail -2
echo "=== regression: physics (no pilot) ===" && node test/physics-fixture.js | tail -2
echo "=== regression: flight outcomes ===" && node test/flight-fixture.js | tail -2
echo "=== validation: every mission ===" && node test/validate-missions.js "${1:-10}" | tail -4
echo "=== regression: the MVP ===" && node test/mvp-regression.js "${1:-10}" | tail -3
# Not a gate - a measurement. What a player actually meets out there: enemies
# per mission, what there is to pick up, and what each route costs.
echo "=== audit: what a player meets ===" && node test/encounter-audit.js "${1:-10}" | tail -8
echo "=== build: single file ==="     && node build.js
echo
echo "all checks passed"
