#!/usr/bin/env bash
# Builds this fork's desktop app, ad-hoc signs it and installs it to /Applications. Quit OpenChamber first.
set -euo pipefail
cd "$(dirname "$0")/.."
bun install --frozen-lockfile
(cd packages/electron && bun run package --mac --dir -c.mac.notarize=false -c.mac.identity=null)
APP=packages/electron/dist/mac-arm64/OpenChamber.app
codesign --force --deep --sign - "$APP"
rm -rf /Applications/OpenChamber.app
cp -R "$APP" /Applications/
echo "Installed /Applications/OpenChamber.app"
