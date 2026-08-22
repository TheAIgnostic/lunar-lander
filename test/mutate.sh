#!/bin/bash
# Break the code on purpose and check the tests notice.
#
#   ./test/mutate.sh src/forces.js 'const d = drag * (ship.airBrake || 1);' 'const d = drag;'
#
# Applies one exact string replacement, runs the unit suites, prints how many
# assertions each one lost, and puts the file back. A mutation that raises
# **zero** failures is the finding: it means the behaviour you just deleted was
# never being checked by anything.
#
# The restore runs on a trap, so an interrupt or a syntax error still leaves the
# working tree as it found it. Check `git status` afterwards anyway - this edits
# real source files, and a shell that is killed hard cannot clean up.
set -u
cd "$(dirname "$0")/.."

if [ $# -lt 3 ]; then
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
fi

FILE="$1"; FROM="$2"; TO="$3"
[ -f "$FILE" ] || { echo "no such file: $FILE" >&2; exit 2; }

BACKUP="$(mktemp)"
cp "$FILE" "$BACKUP"
restore() { cp "$BACKUP" "$FILE"; rm -f "$BACKUP"; }
trap restore EXIT INT TERM

python3 - "$FILE" "$FROM" "$TO" <<'PY' || exit 2
import sys
path, frm, to = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(path).read()
n = src.count(frm)
if n == 0:
    sys.exit("MUTATION TARGET NOT FOUND — the string must match the source exactly:\n  " + frm[:120])
if n > 1:
    sys.exit(f"MUTATION TARGET APPEARS {n} TIMES — make it unique, or you are not mutating what you think you are")
open(path, 'w').write(src.replace(frm, to, 1))
PY

# The unit suites, in the order that fails fastest. The fixtures and sweeps are
# deliberately not here: they take minutes and a mutation worth making usually
# shows up in a unit suite, so this stays fast enough to run a dozen times.
SUITES="landing forces save route components skills loadout terrain enemies settings objectives"
total=0
echo "mutating $FILE"
for s in $SUITES; do
  out="$(node "test/$s-tests.js" 2>&1 | tail -1)"
  failed="$(printf '%s' "$out" | sed -n 's/.*[^0-9]\([0-9][0-9]*\) failed.*/\1/p')"
  [ -n "$failed" ] || failed="?"
  if [ "$failed" != "0" ] && [ "$failed" != "?" ]; then
    printf '  %-12s %s failures\n' "$s" "$failed"
    total=$((total + failed))
  fi
done

if [ "$total" -eq 0 ]; then
  echo "  ZERO FAILURES — nothing checks this. That is the finding, not the result."
else
  echo "  $total failures raised"
fi
