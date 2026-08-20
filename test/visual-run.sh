#!/usr/bin/env bash
#
# Drive one scripted live run for visual spot-checks: title card, slalom
# entry, gates, pause, HUD toggle, and the yeti under fast mode. Every
# synthetic keypress is guarded on the game actually holding focus, so a
# focus steal aborts the run instead of typing into someone else's window.
# Screenshots land in ${TMPDIR:-/tmp}/omarski-shots/.
# Run it on an otherwise empty workspace with the desktop free.
set -u
S="${TMPDIR:-/tmp}/omarski-shots"; mkdir -p "$S"
ID=io.github.tyrichards.omarski

guard() {
  local cls
  cls=$(hyprctl activewindow -j | jq -r '.class // ""')
  if [[ $cls != "$ID" ]]; then
    echo "ABORT: focus is on '$cls', not the game (stage $1)"
    exit 2
  fi
}

shot() {
  local geo
  geo=$(hyprctl clients -j | jq -r --arg id "$ID" \
    '.[] | select(.class==$id) | "\(.at[0]),\(.at[1]) \(.size[0])x\(.size[1])"')
  [[ -n $geo ]] && grim -g "$geo" "$S/reg-$1.png" && echo "shot $1"
}

key() { guard "$2"; wtype -k "$1"; }

cd /home/trr/.config/omarchy/plugins/io.github.tyrichards.omarski
./launch.sh   # focuses the existing instance
sleep 3
guard launch
shot title

key 1 veer            # hard left; also dismisses the title card
sleep 4
shot veer

key 5 down            # straight down into the slalom entrance
sleep 2.2
shot signs
sleep 3
shot startbanner
sleep 6
shot gates1
sleep 8
shot gates2

key p pause
sleep 0.6
shot paused
key p unpause

key h hudoff
sleep 0.4
shot hudoff
key h hudon

sleep 8
shot gates3
sleep 8
shot gates4
sleep 6
shot finish1
sleep 4
shot finish2

# Yeti plus fast mode.
key y yeti
sleep 1.5
shot yeti
guard fast; wtype -P f
sleep 1.2
shot fastyeti
wtype -p f

echo DONE
