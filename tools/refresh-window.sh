#!/usr/bin/env bash
#
# Dev helper: restart a running Omarski window in place so it picks up
# freshly regenerated sprites and game code. No-op when the game is not
# open. The new window is spawned onto the workspace the old one occupied
# with the "silent" rule, so focus never moves to it.

set -euo pipefail

plugin_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
app_id=io.github.tyrichards.omarski

client=$(hyprctl clients -j 2>/dev/null |
  jq -c --arg id "$app_id" 'map(select(.class == $id))[0] // empty')
if [[ -z $client ]]; then
  echo "no open $app_id window; nothing to refresh"
  exit 0
fi

pid=$(jq -r '.pid' <<<"$client")
ws=$(jq -r '.workspace.id' <<<"$client")
x=$(jq -r '.at[0]' <<<"$client")
y=$(jq -r '.at[1]' <<<"$client")
side=$(jq -r '.size[0]' <<<"$client")

# Only kill the pid if it is still the quickshell game instance.
if grep -qz "QS_APP_ID=$app_id" "/proc/$pid/environ" 2>/dev/null; then
  kill "$pid" 2>/dev/null || true
fi
for _ in $(seq 1 50); do
  hyprctl clients -j 2>/dev/null |
    jq -e --arg id "$app_id" 'map(select(.class == $id)) | length == 0' \
      >/dev/null && break
  sleep 0.1
done

command="env QS_APP_ID=$app_id QS_DISABLE_FILE_WATCHER=1"
command+=" OMARSKI_SIDE=$side OMARSKI_SPRITES=$plugin_dir/assets/sprites"
if [[ -n ${OMARSKI_DEBUG_START:-} ]]; then
  command+=" OMARSKI_DEBUG_START=$OMARSKI_DEBUG_START"
fi
command+=" quickshell -p '$plugin_dir/game'"
command_json=$(jq -Rn --arg command "$command" '$command')

rules="{ float = true, size = \"$side $side\", move = \"$x $y\""
rules+=", workspace = \"$ws silent\""
rules+=", tag = \"-default-opacity\", opacity = 1.0, opaque = true }"

hyprctl eval "hl.exec_cmd($command_json, $rules)" >/dev/null
echo "refreshed $app_id on workspace $ws"
