#!/bin/sh
set -eu
qw_source=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
qw_magpie=${MAGPIE_BIN:-}
if [ -z "$qw_magpie" ]; then qw_magpie=$(command -v magpie 2>/dev/null || true); fi
if [ -z "$qw_magpie" ] && [ -x /Applications/magpie.app/Contents/MacOS/magpie ]; then qw_magpie=/Applications/magpie.app/Contents/MacOS/magpie; fi
if [ -z "$qw_magpie" ]; then
  echo 'Magpie CLI not found. Install Magpie or set MAGPIE_BIN to its executable.' >&2
  exit 1
fi
qw_target=${QWENWORK_PLUGIN_INSTALL_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/magpie-plugins/qwenwork-community}
case "$qw_target" in /|"$HOME"|.|'') echo 'Unsafe install directory.' >&2; exit 1;; esac
qw_marker=.managed-by-magpie-qwenwork-auth
if [ -e "$qw_target" ] && [ ! -f "$qw_target/$qw_marker" ]; then echo 'The target is not managed by this installer; nothing was changed.' >&2; exit 1; fi
qw_previous=$qw_target.previous
if [ -e "$qw_previous" ] && [ ! -f "$qw_previous/$qw_marker" ]; then echo 'Unrecognized backup directory; nothing was changed.' >&2; exit 1; fi
mkdir -p -- "$(dirname -- "$qw_target")"
qw_stage=$(mktemp -d "$(dirname -- "$qw_target")/.qwenwork-install.XXXXXX")
trap 'if [ -n "$qw_stage" ] && [ -d "$qw_stage" ]; then rm -rf -- "$qw_stage"; fi' EXIT HUP INT TERM
for qw_file in index.mjs lib package.json "$qw_marker" README.md CHANGELOG.md LICENSE THIRD_PARTY_NOTICES.md docs; do
  cp -R -- "$qw_source/$qw_file" "$qw_stage/"
done
mkdir -p -- "$qw_stage/scripts"
cp -- "$qw_source/scripts/diagnose.mjs" "$qw_stage/scripts/"
if [ -d "$qw_previous" ]; then rm -rf -- "$qw_previous"; fi
if [ -d "$qw_target" ]; then mv -- "$qw_target" "$qw_previous"; fi
mv -- "$qw_stage" "$qw_target"
qw_stage=
if ! "$qw_magpie" plugin add "$qw_target"; then
  rm -rf -- "$qw_target"
  if [ -d "$qw_previous" ]; then mv -- "$qw_previous" "$qw_target"; fi
  echo 'Magpie registration failed. Previous plugin files were restored.' >&2
  exit 1
fi
echo 'Installed. Open Magpie > Providers > From plugins > QwenWork, then sign in in the browser.'
echo 'Existing model routes were not selected or changed by this installer.'
