#!/usr/bin/env bash
#
# Launch Omaski.
#
# The window is placed to match Omarchy's "single-window square aspect ratio"
# layout (SUPER + CTRL + BACKSPACE) exactly: the largest 1:1 square that fits
# the usable area of the focused monitor, centred horizontally, sitting under
# the bar. The geometry is derived from the live compositor state rather than
# hardcoded, so it stays correct across monitors, scales, and gap settings.

set -euo pipefail

plugin_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
app_id=io.github.tyrichards.omaski
sprite_dir="$plugin_dir/assets/sprites"

# ---------------------------------------------------------------------------
# Focus an existing run instead of opening a second copy.
# ---------------------------------------------------------------------------
if address=$(hyprctl clients -j 2>/dev/null |
  jq -r --arg id "$app_id" 'map(select(.class == $id))[0].address // empty') &&
  [[ -n $address ]]; then
  hyprctl dispatch "hl.dsp.focus({ window = \"address:$address\" })" >/dev/null
  exit 0
fi

# ---------------------------------------------------------------------------
# Work out the square geometry from the compositor.
# ---------------------------------------------------------------------------
#
# Hyprland reports monitor size in physical pixels and reserved space in
# logical pixels, so the monitor is converted to logical units first. The
# usable box is then inset by gaps_out, and the window's own border is
# subtracted to land on the client size the layout would have produced.

read_gap() {
  # "css gap data: 10 10 10 10" -> top right bottom left
  hyprctl getoption "general:$1" 2>/dev/null |
    sed -n 's/^css gap data: //p' | head -1
}

geometry=$(
  monitors=$(hyprctl monitors -j)
  gaps_out=$(read_gap gaps_out)
  border=$(hyprctl getoption general:border_size 2>/dev/null |
    sed -n 's/^int: //p' | head -1)

  jq -r \
    --arg gaps "${gaps_out:-10 10 10 10}" \
    --argjson border "${border:-2}" '
    # The focused monitor, falling back to the first one.
    ((map(select(.focused)) | first) // .[0]) as $m
    | ($gaps | split(" ") | map(tonumber)) as $g
    | ($g[0]) as $gt | ($g[1]) as $gr | ($g[2]) as $gb | ($g[3]) as $gl
    | ($m.scale // 1) as $scale
    # Logical size of the monitor.
    | (($m.width / $scale) | floor) as $lw
    | (($m.height / $scale) | floor) as $lh
    # reserved is [left, top, right, bottom], already logical.
    | ($m.reserved // [0,0,0,0]) as $r
    | ($r[0] + $gl) as $insetL
    | ($r[1] + $gt) as $insetT
    | ($r[2] + $gr) as $insetR
    | ($r[3] + $gb) as $insetB
    # Space available to the window frame, borders included.
    | ($lw - $insetL - $insetR) as $availW
    | ($lh - $insetT - $insetB) as $availH
    # The client area of a maximised 1:1 window.
    | ([$availW, $availH] | min - 2 * $border) as $side
    # Centre the frame in the available box, then step past the border.
    | ($insetL + (($availW - ($side + 2 * $border)) / 2 | floor) + $border) as $x
    | ($insetT + $border) as $y
    | "\($side) \($x) \($y) \($m.name)"
  ' <<<"$monitors"
)

read -r side pos_x pos_y monitor <<<"$geometry"

if [[ -z ${side:-} || $side -lt 320 ]]; then
  # Fall back to a sane square rather than refusing to start.
  side=886
  pos_x=0
  pos_y=0
fi

# ---------------------------------------------------------------------------
# Launch.
# ---------------------------------------------------------------------------
#
# hl.exec_cmd applies one-shot window rules to just this process, so nothing
# in the user's Hyprland config is touched. Floating at an explicit size and
# position reproduces the square layout without disturbing tiled neighbours.

# Note: quickshell's --no-duplicate is deliberately not used. It keys off a
# hash of the config path, so a stale instance id from an earlier run makes it
# refuse to start at all. The hyprctl check above already prevents duplicates.
#
# The file watcher stays ON: quickshell live-reloads the QML in place when
# game files change, reusing the same window — no respawn, no re-tiling.
# The ground around the game's frame follows the desktop's terminal theme.
theme_bg=$(grep -m1 '^background' \
  ~/.local/state/omarchy/current/theme/alacritty.toml 2>/dev/null |
  grep -o '#[0-9a-fA-F]*' || true)

command="env QS_APP_ID=$app_id"
command+=" OMASKI_SIDE=$side OMASKI_SPRITES=$sprite_dir"
if [[ -n $theme_bg ]]; then
  command+=" OMASKI_BG=$theme_bg"
fi
# Debug only: OMASKI_DEBUG_START=<metres> ./launch.sh skips the title card
# and starts that far down the hill. See game/Game.qml.
if [[ -n ${OMASKI_DEBUG_START:-} ]]; then
  command+=" OMASKI_DEBUG_START=$OMASKI_DEBUG_START"
fi
command+=" quickshell -p '$plugin_dir/game'"

command_json=$(jq -Rn --arg command "$command" '$command')

# The snowfield has to be pure white, so the window must be fully opaque.
# Omarchy tags every window `default-opacity` and then applies 0.985/0.96 to
# anything still carrying the tag, so opting out means dropping the tag as well
# as asking for opacity 1 - `opaque` alone loses to the later opacity rule.
rules="{ float = true, size = \"$side $side\""
if [[ ${pos_x:-0} -gt 0 || ${pos_y:-0} -gt 0 ]]; then
  rules+=", move = \"$pos_x $pos_y\""
else
  rules+=", center = true"
fi
rules+=", tag = \"-default-opacity\", opacity = 1.0, opaque = true }"

hyprctl eval "hl.exec_cmd($command_json, $rules)" >/dev/null
