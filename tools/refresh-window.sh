#!/usr/bin/env bash
#
# Dev helper: make a running Omaski window pick up fresh game code.
#
# The game runs with quickshell's file watcher enabled, so QML/JS edits
# live-reload inside the existing window on their own — same window, same
# tile, no respawn. This script nudges an explicit reload over IPC for
# changes the watcher cannot see (or after a `git checkout`). Legacy
# instances without the IPC handler get one final kill-and-respawn.
#
# No-op when the game is not open.

set -euo pipefail

plugin_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
app_id=io.github.tyrichards.omaski

client=$(hyprctl clients -j 2>/dev/null |
  jq -c --arg id "$app_id" 'map(select(.class == $id))[0] // empty')
if [[ -z $client ]]; then
  echo "no open $app_id window; nothing to refresh"
  exit 0
fi

pid=$(jq -r '.pid' <<<"$client")

# Address the IPC call to the exact instance behind the open window (the
# path can be ambiguous while offscreen test instances are running).
instance=$(quickshell list --all 2>/dev/null | awk -v pid="$pid" '
  /^Instance / { id = $2; sub(":", "", id) }
  /Process ID:/ && $3 == pid { print id }')

if [[ -n $instance ]] &&
   quickshell ipc -i "$instance" call dev reload >/dev/null 2>&1; then
  echo "live-reloaded $app_id in place"
  exit 0
fi

# --- legacy instance without the IPC handler: respawn once to migrate -----

ws=$(jq -r '.workspace.id' <<<"$client")
x=$(jq -r '.at[0]' <<<"$client")
y=$(jq -r '.at[1]' <<<"$client")
side=$(jq -r '.size[0]' <<<"$client")

if grep -qz "QS_APP_ID=$app_id" "/proc/$pid/environ" 2>/dev/null; then
  kill "$pid" 2>/dev/null || true
fi
for _ in $(seq 1 50); do
  hyprctl clients -j 2>/dev/null |
    jq -e --arg id "$app_id" 'map(select(.class == $id)) | length == 0' \
      >/dev/null && break
  sleep 0.1
done

command="env QS_APP_ID=$app_id"
command+=" OMASKI_SIDE=$side OMASKI_SPRITES=$plugin_dir/assets/sprites"
if [[ -n ${OMASKI_DEBUG_START:-} ]]; then
  command+=" OMASKI_DEBUG_START=$OMASKI_DEBUG_START"
fi
command+=" quickshell -p '$plugin_dir/game'"
command_json=$(jq -Rn --arg command "$command" '$command')

rules="{ float = true, size = \"$side $side\", move = \"$x $y\""
rules+=", workspace = \"$ws silent\""
rules+=", tag = \"-default-opacity\", opacity = 1.0, opaque = true }"

hyprctl eval "hl.exec_cmd($command_json, $rules)" >/dev/null
echo "respawned $app_id with live reload enabled (one-time migration)"
