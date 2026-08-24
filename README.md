# Omaski

A skiing game for Omarchy in the spirit of the 1991 classic SkiFree, rebuilt
to run natively on Hyprland — with **all-original artwork** in a chunky,
minimalist fantasy-console style, so the whole plugin is freely
redistributable.

Click the skier in the bar and the game opens as a true 1:1 square window, in
exactly the position and at exactly the size Omarchy's *single-window square
aspect ratio* layout would give it.

No Wine. No browser. No emulator. No network. Just Quickshell and QML.

```
TIME 0:00:44.25
DIST   551M
SPEED  15M/S
STYLE   282
```

## The look: a tiny screen, blown up

Everything renders onto a small virtual screen of roughly 220 logical pixels
— drawn with the 16-colour PICO-8 palette and a 3x5 pixel font — then
integer-scales up to the window with no filtering. Big square pixels, warm
paper-white snow, flat colours.

That virtual screen is also why the game is smooth. The whole frame is
painted onto **one canvas at a fixed 30 fps**; nothing in the scene graph is
created or destroyed while you ski. (Version 2 rebuilt a list of QML image
objects on every tick, which is why its trees teleported instead of scrolling.
Version 3 repaints one item.)

## The artwork is original — and yours to redistribute

Every one of the **82 sprites** in `assets/sprites/` — the skier in his red
beanie, the triangle-stacked trees, the big dead snags, the rainbow ramp, the
chairlift, the barking dog, the deer (and what is left of one), the
snowboarders, the crash starburst and every frame of the Abominable Snow
Monster's table manners — was drawn for this project, at 8 pixels per metre. The pixel grids live in
`tools/make-sprites.py` (pure Python standard library), which renders the
whole set:

```bash
python3 tools/make-sprites.py     # regenerate assets/sprites/
```

Nothing is extracted from, traced over, or downloaded out of anyone else's
game. The sprites are MIT-licensed with the rest of the plugin, which is what
lets Omaski ship complete on the plugin marketplace with no first-run
downloads.

## Faithfulness

The simulation is a from-scratch implementation of the classic's rules:

| Classic behaviour | In Omaski |
|---|---|
| World wraps at ±2048 m in every direction | `WORLD_LIMIT = 2048`, wrapped on both axes |
| Momentum | You push off from a standstill, build to 15 m/s, and a crash costs all of it |
| Seven discrete headings | Straight down, three grades each way |
| Skis fully sideways = stop | Hard side is a dead stop: you skid to 0 m/s and stay put |
| Turning scrubs speed | Edging across the fall line brakes much faster than gravity builds |
| `F` doubles the game speed | `FAST_MULTIPLIER = 2.0` |
| The monster appears after 2000 m | `YETI_DISTANCE = 2000` |
| He cannot be outrun at normal speed | 21 m/s crushes a 15 m/s tuck; only `F` escapes |
| He cannot grab you in mid-air | Collision is skipped while airborne |
| Escape him and he returns | Outrun him by 60 m and he gives up — until 2000 m later |
| Caught skiers get eaten on camera | A violent shove, then a freeze frame on the boots |
| A crash puts you down until you act | You sit — skis up, /\O/\ — until a key picks you up |
| Moguls rattle, the ramp launches | Bumps scrub speed and fan you into an X; the rainbow gives air |
| Trees, rocks, stumps, dead snags | All present, all solid |
| Jumps carry your line | Air velocity is frozen at the lip; steering mid-air works a backflip |
| Dogs, deer, boarders, other skiers | Dogs cross and bark; deer cross and, if hit, burst |
| Status box: Time / Dist / Speed / Style | Same four rows, `0:01:36.54` and `  723m` formats |
| Deterministic hill | Hashed per-cell placement, so the slope is identical every run |

One deliberate departure from the classic: there are no course signs and no
slalom modes. It is one mode — down the hill.

## Controls

| Key | Action |
|---|---|
| Arrows / `WASD` | Steer — hold `Down`/`S` to tuck: straight downhill at full F-speed |
| Numpad `1`–`9` | Absolute heading — "Use NumPad (0-9) for better control" |
| `X` (❎), `Space`, `Up`, `Insert`, left click | Jump — steer in the air to work a backflip |
| Mouse | Steer toward the pointer |
| Hold `F` | Fast mode. The only way past the monster |
| `Home` / `PageUp` | Side-step uphill |
| `Z` (Ⓞ), `F3` or `P` | Pause |
| Any steering or jump key | Get back up after a crash |
| `F2` | Restart |
| `H` | Toggle the status box |
| `Y` | Summon the monster early, if you are feeling brave |
| `Escape` | Quit |

Land a backflip mid-rotation and you will eat snow, exactly as you deserve.

## Window geometry

The launcher does not hardcode a size. It reads the focused monitor from
`hyprctl monitors`, converts the physical size to logical pixels using the
monitor scale, subtracts the reserved bar area, the configured `gaps_out` and
the window border, and takes the largest square that fits. On a 2256×1504
display at 1.6× scale with a 30 px bar and 10 px gaps that works out to
**886 × 886 at (262, 42)** — the same numbers Hyprland's own
`single_window_aspect_ratio = { 1, 1 }` layout produces, verified by
measurement.

The rules are applied through `hl.exec_cmd`, so they affect only this one
process and nothing in your Hyprland config is touched.

Two details worth knowing, both learned the hard way:

* The window asks for its square size but does not lock `minimumSize` to
  `maximumSize`. Pinning them makes the compositor destroy the window if it
  ever gets tiled.
* Omarchy tags every window `default-opacity` and then applies `0.985 0.96` to
  whatever still carries the tag, so `opaque = true` alone is not enough — the
  later opacity rule wins and the snow goes muddy. Omaski drops the tag as
  well, which is the documented opt-out, and the snowfield renders solid.

## Tests

The simulation is plain JavaScript, so it runs headless under node. The suite
covers momentum (push-off, top speed, the dead stop at full sideways, crashes
zeroing it), the crash freeze and key-to-get-up rule, mogul rattles versus
ramp launches (including the standing-on-a-bump regression), jump and
backflip scoring, deer bursts, barking dogs, world wrapping, field
determinism, status formatting, the sprite catalog, and both halves of the
monster rule — that he eats you at normal speed and that `F` gets you away.

```bash
node test/test-run.mjs
```

72 checks, all green.

There is also a debug hook for exercising the late game without skiing two
kilometres by hand:

```bash
# start already at 1990 m, so the monster turns up almost immediately
OMASKI_DEBUG_START=1990 ./launch.sh

# the same, without the launcher's window placement
OMASKI_DEBUG_START=1990 quickshell -p ./game
```

## Install

```bash
omarchy plugin add https://github.com/TyRichards/omarchy-omaski --enable
```

Then add the Omaski widget to your bar, or launch it from the app list
(`tools/install-app-entry.sh` registers the desktop entry).

Installing by hand instead: clone this repository into
`~/.config/omarchy/plugins/io.github.tyrichards.omaski`, then

```bash
omarchy plugin validate .
omarchy plugin enable io.github.tyrichards.omaski
```

## Uninstall

```bash
omarchy plugin remove io.github.tyrichards.omaski
```

Remove the optional app-list entry with
`rm ~/.local/share/applications/omaski.desktop
~/.local/share/icons/hicolor/256x256/apps/omaski.png`.

Saving any file under `~/.config/omarchy/plugins/` hot-reloads the plugin.

Besides the bar icon, the game can be opened (or focused, if it is already
running) from a script or keybinding:

```bash
omarchy shell omaski launch
```

## Credit

Omaski is a from-scratch homage to **SkiFree**, written by Chris Pirih in
1991\. He still hosts the original, for free, at <https://ski.ihoc.net/> — go
play it, read the story of how it came to be, and buy the man a T-shirt.

The presentation tips its hat to the fantasy-console scene — PICO-8 and the
tiny games made for it — while every asset here is drawn from scratch.

This plugin shares no code or artwork with SkiFree and is not affiliated with
or endorsed by Chris Pirih or Microsoft. What it borrows is the *idea* — the
slope, the ramps, and the appetite of the thing that lives past 2000 metres —
and game mechanics are ideas.

## License

MIT, code and artwork alike. See [LICENSE](LICENSE).
