#!/bin/bash
# Every check, in the order that fails fastest.  ./test/run-all.sh
set -e
cd "$(dirname "$0")/.."
echo "=== unit: landing grader ==="   && node test/landing-tests.js  | tail -2
echo "=== unit: forces + planets ===" && node test/forces-tests.js   | tail -2
echo "=== unit: save + migration ===" && node test/save-tests.js | tail -2
echo "=== unit: route + economy ===" && node test/route-tests.js | tail -2
echo "=== unit: components ===" && node test/components-tests.js | tail -2
echo "=== unit: terrain grammar ===" && node test/terrain-tests.js  | tail -2
echo "=== regression: physics (no pilot) ===" && node test/physics-fixture.js | tail -2
echo "=== regression: flight outcomes ===" && node test/flight-fixture.js | tail -2
echo "=== validation: every mission ===" && node test/validate-missions.js "${1:-10}" | tail -4
echo "=== build: single file ==="     && node build.js
echo
echo "all checks passed"
