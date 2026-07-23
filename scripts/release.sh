#!/usr/bin/env bash
# Ship a new Archo release — fully automatic via GitHub Actions.
#   ./scripts/release.sh 0.1.1
# This only bumps the version and pushes. The Release workflow (.github/
# workflows/release.yml) then builds the macOS installers and publishes the
# GitHub Release. Installed apps auto-detect it on next launch.
#
# You don't even need this script — bumping "version" in package.json and
# pushing to master is enough. It's just a convenience wrapper.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

VER="${1:?usage: release.sh <version>  e.g. release.sh 0.1.1}"

echo "▸ bumping version → $VER"
npm version "$VER" --no-git-tag-version >/dev/null

git add package.json
git -c commit.gpgsign=false commit -q -m "Release v$VER"
git push origin master

echo "✓ pushed. GitHub Actions is now building & publishing v$VER."
echo "  Watch it: https://github.com/imonursahin/archo/actions"
