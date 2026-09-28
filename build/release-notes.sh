#!/usr/bin/env bash
#
# Prints one version's release notes as markdown, read from the metainfo.
#
# Usage: build/release-notes.sh [version]        (default: the csproj's)
#
# build/release.sh already writes a <release> entry for every version, because a
# software centre shows it and Flathub builds the commit rather than the tag. The
# GitHub release used to ignore all of that and print the same fixed blurb every
# time, so the one place a user looks for "what changed" was the only place that
# never said. This is the bridge, and it deliberately reads the metainfo rather
# than introducing a notes file of its own - a second copy of the notes is a copy
# that gets forgotten, exactly like a second copy of the version.
#
# Exits non-zero when the version has no entry, which is a release.sh that did not
# run rather than a release with nothing to say.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$ROOT/build/version.sh"

VERSION="${1:-$(project_version "$ROOT")}"
METAINFO="$ROOT/build/linux/io.github.polemus.Omnigit.metainfo.xml"

# The conversion lives in notes.py beside this, shared with release.sh, so the way
# notes go into the metainfo and the way they come back out cannot disagree.
python3 "$ROOT/build/notes.py" markdown "$METAINFO" "$VERSION"
