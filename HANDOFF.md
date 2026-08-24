# Omarski v1 (4.7.9) — handoff

This archive is the complete, working v1 of Omarski, frozen before the
v2 rewrite (fixed 128x128 PICO-8 grid). It is launch-ready as it stands.

## What this is

A SkiFree-style skiing game as an Omarchy shell plugin
(`io.github.tyrichards.omarski`), all-original art, MIT licensed.
Quickshell/QML front end, pure-JS engine, PICO-8-flavoured look with a
variable-size virtual screen (~220 logical px, integer-scaled).

## Spin it back up

1. Unzip into the Omarchy plugins directory:
   `unzip omarski-v1.zip -d ~/.config/omarchy/plugins/`
   (the zip contains the full `io.github.tyrichards.omarski/` folder,
   including `.git` with all history)
2. Validate: `omarchy plugin validate ~/.config/omarchy/plugins/io.github.tyrichards.omarski`
3. Restart the shell (`omarchy restart shell`) and add the Omarski bar
   widget, or run directly:
   `env QS_APP_ID=io.github.tyrichards.omarski OMARSKI_SIDE=440 quickshell -p game`

## Publish to GitHub later

```
cd io.github.tyrichards.omarski
git remote add origin git@github.com:tyrichards/omarski.git
git push -u origin master
```

## Dev loop

- `python3 tools/make-sprites.py` — regenerate all sprite PNGs (applies
  hand-edit overrides from `tools/overrides/`, syncs SIZES into
  `game/Sprites.js`, touches `assets/sprites/.stamp` which hot-reloads
  an open game window)
- `node test/test-run.mjs` — engine test suite (72+ checks)
- `tools/edit-sprites` — in-browser pixel editor at
  http://127.0.0.1:8787/ (grouped dropdown, pencil/eraser, saves crop
  to content and hot-reload the open window)
- `tools/refresh-window.sh` — respawn the game window in place after
  QML/JS code changes

## State at freeze

Version 4.7.9, all tests passing. Open items were tracked in TODO.md:
refine yeti, refine frame of game, ship. The v2 rewrite supersedes the
"frame of game" item.
