#!/usr/bin/env bash
# Ship a new Archo release.
#   ./scripts/release.sh 0.1.1   → sets version, builds, publishes GitHub release
# The installed app auto-detects it (update:check compares against the latest
# GitHub release via your authenticated gh CLI).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

VER="${1:?usage: release.sh <version>  e.g. release.sh 0.1.1}"
REPO="imonursahin/archo"

echo "▸ bumping version → $VER"
npm version "$VER" --no-git-tag-version >/dev/null

echo "▸ committing"
git add package.json
git -c commit.gpgsign=false commit -q -m "Release v$VER" || true
git push origin master

echo "▸ building installers"
npm run dist

echo "▸ publishing release v$VER"
gh release create "v$VER" \
  "dist/Archo-$VER-arm64.dmg" \
  "dist/Archo-$VER-arm64-mac.zip" \
  dist/latest-mac.yml \
  --repo "$REPO" \
  --title "Archo $VER" \
  --generate-notes

echo "✓ published: https://github.com/$REPO/releases/tag/v$VER"
echo "  Installed apps will show the update on next launch (or Settings → Check for updates)."
