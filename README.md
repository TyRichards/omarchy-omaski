# Omarski

SkiFree for Omarchy — the 1991 original, rebuilt to run natively on Hyprland
with the **real sprites** from Chris Pirih's own release.

Click the skier in the bar and the game opens as a true 1:1 square window, in
exactly the position and at exactly the size Omarchy's *single-window square
aspect ratio* layout would give it.

No Wine. No browser. No emulator. Just Quickshell and QML.

```
Time:  0:00:44.25
Dist:      551m
Speed:    15m/s
Style:      282
```

## The sprites are the originals

Omarski does not ship a redrawn tribute, and it does not ship Pirih's artwork
either. On first launch it downloads the official 32-bit `ski32.exe` (v1.04)
from [the author's own site](https://ski.ihoc.net/), parses the PE resource
directory, and extracts all **89 device-independent bitmaps** into transparent
PNGs under `~/.cache/omarski/sprites/`.

That means the skier, the trees, the rainbow ramp, the chairlift, the dog, the
snowboarders, the OUCH! starburst and all fourteen frames of the Abominable
Snow Monster are pixel-for-pixel the ones from 1991 — while the repository
itself stays free of anyone else's copyrighted art.

The extractor is `extract-sprites.py`, pure Python standard library, no
dependencies. It flood-fills white inwards from each sprite's border to build
an alpha mask, so the interior whites that matter — the monster's eyes, the
highlights on a mogul — survive intact.

```bash
# Runs automatically on first launch, but you can drive it by hand:
python3 extract-sprites.py                       # fetch and extract
python3 extract-sprites.py --source ./ski32.zip  # use a local copy
python3 extract-sprites.py --force               # re-extract
```

## Faithfulness

The simulation follows the rules of the original as documented by its author:

| Original behaviour | In Omarski |
|---|---|
| 16 pixels per metre | `PIXELS_PER_METRE = 16` |
| World wraps at ±2048 m in every direction | `WORLD_LIMIT = 2048`, wrapped on both axes |
| `F` doubles the game speed | `FAST_MULTIPLIER = 2.0` |
| The monster appears after 2000 m | `YETI_DISTANCE = 2000` |
| He cannot be outrun at normal speed | He is slightly faster than a tucked skier, and only `F` escapes |
| He cannot grab you in mid-air | Collision is skipped while airborne |
| Seven discrete headings | Straight down plus three each way, using the mirrored sprite pairs |
| Three courses off the start | Slalom, Free-style, Tree Slalom, chosen by which sign you pass |
| Slalom gates score you | A smiling marker for a cleared gate, a scowling one for a miss |
| Start and Finish banners | Drawn at each end of a course, with a result panel at the finish |
| Trees, rocks, stumps, moguls, ramps | All present, with the ramp giving the biggest air |
| Dogs, snowboarders, other skiers | Wander the hill and knock you down on contact |
| Status box: Time / Dist / Speed / Style | Same four rows, same `0:01:36.54` and `  723m` formats |
| Deterministic hill | Hashed per-cell placement, so the slope is identical every run |

The mirrored sprite pairs were verified programmatically rather than by eye:
sprite 5 is exactly sprite 2 flipped, and 7 is exactly 4 flipped, so the turn
arc uses the same seven bitmaps the original did.

## Controls

| Key | Action |
|---|---|
| Arrows / `WASD` | Steer |
| Numpad `1`–`9` | Absolute heading, as the original's "Use NumPad (0-9)" hint suggests |
| `Space`, `Up`, `Insert`, left click | Jump — press again in the air to work a backflip |
| Mouse | Steer toward the pointer |
| Hold `F` | Fast mode. The only way past the monster |
| `Home` / `PageUp` | Side-step uphill |
| `F3` or `P` | Pause |
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
  later opacity rule wins and the snow comes out grey. Omarski drops the tag as
  well, which is the documented opt-out, and the snowfield renders pure white.

## Tests

The simulation is plain JavaScript, so it runs headless under node. The suite
covers downhill progress, crash recovery, jump and backflip scoring, world
wrapping, field determinism, course selection, status formatting, the sprite
catalog, and both halves of the monster rule — that he eats you at normal
speed and that `F` gets you away.

```bash
node test/test-run.mjs
```

59 checks, including a full played slalom run that steers gate to gate and
asserts every one of the 27 gates is judged and the finish is reached.

The suite earned its keep. It caught, among others: fast mode not registering
at all, Tree Slalom being no denser than the open hill, the start clearing
quietly swallowing the entire object field, jumps too brief to complete a
flip, and the monster spawning further above the skier than the viewport could
show, so he blinked into existence instead of loping in from the top edge.

There is also a debug hook for exercising the late game without skiing two
kilometres by hand:

```bash
# start already at 1990 m, so the monster turns up almost immediately
OMARSKI_DEBUG_START=1990 ./launch.sh

# the same, without the launcher's window placement
OMARSKI_DEBUG_START=1990 quickshell -p ./game
```

## Install

```bash
omarchy plugin validate .
omarchy plugin enable io.github.tyrichards.omarski
```

Saving any file under `~/.config/omarchy/plugins/` hot-reloads the plugin.

Besides the bar icon, the game can be opened (or focused, if it is already
running) from a script or keybinding:

```bash
omarchy shell omarski launch
```

## Credit

SkiFree was written by **Chris Pirih** in 1991 and remains his. He still hosts
it, for free, at <https://ski.ihoc.net/> — go read the story of how it came to
be, and buy the man a T-shirt.

This plugin is an independent reimplementation of the game's logic that loads
his original artwork from his own distribution. The code here is MIT; the
sprites are his and are never redistributed.

## License

MIT. See [LICENSE](LICENSE).
