#!/usr/bin/env bash
#
# Prepares a release: the two edits a tag cannot carry, then the tag.
#
# Usage: build/release.sh <version> <notes> [--preview | --push]
#   version: 1.2.3, without the leading v
#   notes:   a notes file, kept outside the repository (the tree must be clean,
#            and the metainfo is where the notes live once written) - a summary
#            paragraph, then "### New" / "### Fixed" / "### Changes" sections of
#            bullets; see build/notes.py for the exact format. A bare sentence still
#            works, for a release with one thing to say.
#   --preview  change nothing: print the metainfo entry and the GitHub notes that
#              these notes would produce, then stop. Run it before the real thing.
#   --push     push the commit and the tag afterwards, which starts release.yml.
#
# A tag names a commit; it cannot put anything inside one. Two things have to be
# inside the commit because Flathub builds it without ever running our workflows:
#
#   <Version> in Omnigit.csproj   what the app reports. The Flatpak build never
#                                passes -p:Version, because Flathub would not.
#   <release> in the metainfo    the notes a software centre shows. Flathub
#                                rejects a build whose newest release is not the
#                                version being built.
#
# Everything else - artifact names, the GitHub Release, the Flathub manifest - is
# derived from the tag by CI. So this exists to make the two edits stop being a
# checklist, not to move them somewhere they cannot work.
#
# Nothing is pushed unless you ask for it. Pushing the tag is what starts a
# release build, and that should be a decision rather than a side effect.
set -euo pipefail

VERSION="${1:?usage: release.sh <version> <notes-file|sentence> [--preview|--push]}"
NOTES_ARG="${2:?usage: release.sh <version> <notes-file|sentence> [--preview|--push]}"
PUSH=no
PREVIEW=no
case "${3:-}" in
    --push) PUSH=yes ;;
    --preview) PREVIEW=yes ;;
    "") ;;
    *) echo "!! unknown option ${3}" >&2 ; exit 1 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ID=io.github.polemus.Omnigit
CSPROJ="$ROOT/src/Omnigit/Omnigit.csproj"
METAINFO="$ROOT/build/linux/$APP_ID.metainfo.xml"
TAG="v$VERSION"

. "$ROOT/build/version.sh"

case "$VERSION" in
    [0-9]*.[0-9]*.[0-9]*) ;;
    *) echo "!! $VERSION is not a x.y.z version" >&2 ; exit 1 ;;
esac

# A file is the normal case. A sentence is written to one, so there is one path below.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
if [ -f "$NOTES_ARG" ]; then
    NOTES_FILE="$NOTES_ARG"
else
    NOTES_FILE="$WORK/notes.md"
    printf '%s\n' "$NOTES_ARG" > "$NOTES_FILE"
fi

# Parsed now, so a malformed file fails before anything has been changed.
ENTRY="$(python3 "$ROOT/build/notes.py" entry "$VERSION" "$NOTES_FILE")"

if [ "$PREVIEW" = yes ]; then
    cp "$METAINFO" "$WORK/metainfo.xml"
    python3 - "$WORK/metainfo.xml" "$ENTRY" <<'PY'
import sys
path, entry = sys.argv[1], sys.argv[2] + "\n"
xml = open(path).read()
open(path, "w").write(xml.replace("  <releases>\n", "  <releases>\n" + entry, 1))
PY
    echo "==================== metainfo entry (software centres, Flathub)"
    printf '%s\n' "$ENTRY"
    echo
    echo "==================== GitHub release notes (above the standing install sections)"
    python3 "$ROOT/build/notes.py" markdown "$WORK/metainfo.xml" "$VERSION"
    echo
    echo "The About page shows the same notes as plain text, headings as lines and"
    echo "bullets as •. Nothing was changed."
    exit 0
fi

# A release is built from the tagged commit, so anything not committed is not in
# it - and finding that out afterwards means retagging.
if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
    echo "!! the working tree has changes - commit or stash them first" >&2
    git -C "$ROOT" status --short >&2
    exit 1
fi

if git -C "$ROOT" rev-parse --verify "$TAG" >/dev/null 2>&1; then
    echo "!! $TAG already exists" >&2
    exit 1
fi

CURRENT="$(project_version "$ROOT")"
if [ "$CURRENT" = "$VERSION" ]; then
    echo "!! the csproj already says $VERSION - is this release already prepared?" >&2
    exit 1
fi

echo "==> Omnigit $CURRENT -> $VERSION"

# ---------------------------------------------------------------- the version
# Anchored to the tag rather than a bare number: the file holds package versions
# too, and a loose match would rewrite whichever one happened to look similar.
sed -i "s|<Version>$CURRENT</Version>|<Version>$VERSION</Version>|" "$CSPROJ"

if [ "$(project_version "$ROOT")" != "$VERSION" ]; then
    echo "!! the csproj still says $(project_version "$ROOT")" >&2
    exit 1
fi

# ------------------------------------------------------------------ the notes
# Newest first, which is the order AppStream readers show them in and the order
# flathub-manifest.sh reads to check the newest is the one being built.
python3 - "$METAINFO" "$ENTRY" <<'PY'
import sys

path, entry = sys.argv[1], sys.argv[2] + "\n"
xml = open(path).read()
marker = "  <releases>\n"
if marker not in xml:
    sys.exit(f"no <releases> element in {path}")

open(path, "w").write(xml.replace(marker, marker + entry, 1))
PY

# appstreamcli is what Flathub runs. Catching a malformed entry here beats
# catching it in a review comment days later.
if command -v appstreamcli >/dev/null 2>&1; then
    appstreamcli validate --no-net "$METAINFO" >/dev/null \
        || { echo "!! the metainfo no longer validates" >&2 ; exit 1 ; }
    echo "==> metainfo validates"
fi

# ------------------------------------------------------------- commit and tag
git -C "$ROOT" add "$CSPROJ" "$METAINFO"
# The commit carries the summary paragraph; the full notes are in the metainfo it changes.
SUMMARY="$(awk 'BEGIN{RS=""} NR==1{gsub(/\n/," "); print; exit}' "$NOTES_FILE")"
git -C "$ROOT" commit -q -m "Omnigit $VERSION" -m "$SUMMARY"
git -C "$ROOT" tag -a "$TAG" -m "Omnigit $VERSION"

echo "==> Committed and tagged $TAG"
git -C "$ROOT" --no-pager show --stat --format='    %h %s' "$TAG" | head -8

if [ "$PUSH" = yes ]; then
    echo "==> Pushing"
    git -C "$ROOT" push origin HEAD
    git -C "$ROOT" push origin "$TAG"
    echo "==> release.yml is building. Nothing else to do."
else
    echo
    echo "Nothing pushed. When you are ready:"
    echo "    git push origin HEAD && git push origin $TAG"
fi
