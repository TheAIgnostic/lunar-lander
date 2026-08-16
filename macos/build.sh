#!/bin/bash
# Builds "Terminal Velocity.app" — a native macOS shell around the single-file
# game build. Needs the Xcode command line tools (swiftc) and node.
#
#   ./macos/build.sh            build, self-test, leave the app in dist/
#   ./macos/build.sh --install  also copy it to /Applications

set -euo pipefail
cd "$(dirname "$0")/.."

APP="dist/Terminal Velocity.app"
NAME="TerminalVelocity"

echo "==> bundling the game"
node build.js

echo "==> compiling the shell"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O -parse-as-library=false \
  -target arm64-apple-macos11 \
  -o "$APP/Contents/MacOS/$NAME" \
  macos/main.swift 2>/dev/null \
  || swiftc -O -o "$APP/Contents/MacOS/$NAME" macos/main.swift

echo "==> drawing the icon"
rm -rf dist/AppIcon.iconset
swift macos/make-icon.swift dist/AppIcon.iconset >/dev/null
iconutil -c icns dist/AppIcon.iconset -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf dist/AppIcon.iconset

cp dist/terminal-velocity.html "$APP/Contents/Resources/game.html"
cp macos/Info.plist "$APP/Contents/Info.plist"

echo "==> signing (ad-hoc)"
codesign --force --sign - --timestamp=none "$APP" 2>/dev/null || echo "    codesign unavailable, continuing unsigned"

echo "==> self-test"
if "$APP/Contents/MacOS/$NAME" --selftest; then
  echo "    game booted inside the app"
else
  echo "    SELF-TEST FAILED" >&2
  exit 1
fi

if [[ "${1:-}" == "--install" ]]; then
  rm -rf "/Applications/Terminal Velocity.app"
  cp -R "$APP" /Applications/
  echo "==> installed to /Applications"
fi

du -sh "$APP" | sed 's/^/==> built /'
