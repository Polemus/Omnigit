#!/usr/bin/env bash
#
# Renders the README's screenshots into docs/screenshots, from the real app drawn
# offscreen by Avalonia's headless platform - the same Skia pixels a window gets.
#
# Usage: tools/Screenshots/run.sh [scene ...]
#   With no scenes, renders all of them. Scene names are the file names without .png.
#
# It never reads your own Omnigit settings. XDG_CONFIG_HOME points at a fresh
# directory, so the only repositories on screen are the ones listed below, and the
# only thing copied from your real config is accounts.json - the harmless half of each
# account, so pull requests and the publish picker can reach the sites. Tokens stay in
# the keyring, where Omnigit already reads them from.
#
# What it expects to find, all set up once by hand:
#   $SCREENSHOT_REPOS/Omnigit     a clone of this repository, origin set to GitHub
#   $SCREENSHOT_REPOS/storefront  a revert stopped on a conflict in src/cart.js
#   $SCREENSHOT_REPOS/notes       any local-only repository, for the picker's grouping
#   $SCREENSHOT_PLAYGROUND        a clone with uncommitted changes to show each viewer:
#                                 src/pricing.cs, images/logo.png, web/icon.svg,
#                                 web/package-lock.json, data/products.csv, GUIDE.md -
#                                 and open pull requests on its site
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export SCREENSHOT_REPOS="${SCREENSHOT_REPOS:-/mnt/data/Code/omnigit-screenshots}"
export SCREENSHOT_PLAYGROUND="${SCREENSHOT_PLAYGROUND:-/mnt/data/Code/omnigit-playground}"
REAL_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/Omnigit"

# A fixed, readable name rather than mktemp's: the plugins page prints this path.
CONFIG=/tmp/omnigit-screenshots/.config
rm -rf "$CONFIG"
trap 'rm -rf /tmp/omnigit-screenshots' EXIT
mkdir -p "$CONFIG/Omnigit/plugins/sizes"

[ -f "$REAL_CONFIG/accounts.json" ] && cp "$REAL_CONFIG/accounts.json" "$CONFIG/Omnigit/"

cat > "$CONFIG/Omnigit/repositories.json" <<EOF
{
  "Repositories": [
    "$SCREENSHOT_REPOS/Omnigit",
    "$SCREENSHOT_PLAYGROUND",
    "$SCREENSHOT_REPOS/storefront",
    "$SCREENSHOT_REPOS/notes"
  ],
  "LastOpened": "$SCREENSHOT_PLAYGROUND"
}
EOF

# The sample plugin, installed and switched on, so Settings → Plugins has a row.
dotnet build "$ROOT/samples/SizeViewer" -v quiet -nologo >/dev/null
cp "$ROOT/samples/SizeViewer/bin/Debug/net10.0/SizeViewer.dll" \
   "$ROOT/samples/SizeViewer/plugin.json" "$CONFIG/Omnigit/plugins/sizes/"

cat > "$CONFIG/Omnigit/settings.json" <<'EOF'
{ "Language": "en", "EnabledPlugins": [ "omnigit.sample.sizes" ] }
EOF

dotnet build "$ROOT/tools/Screenshots" -v quiet -nologo >/dev/null

echo "==> Rendering into docs/screenshots"
XDG_CONFIG_HOME="$CONFIG" OMNIGIT_NO_DESKTOP_INTEGRATION=1 \
    dotnet "$ROOT/tools/Screenshots/bin/Debug/net10.0/Screenshots.dll" "${SCREENSHOT_OUT:-$ROOT/docs/screenshots}" "$@"
