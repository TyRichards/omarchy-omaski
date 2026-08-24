#!/usr/bin/env python3
"""Render Omaski's original sprite set, in a PICO-8 flavoured style.

Every sprite in assets/sprites/ is generated from the pixel grids and drawing
code in this file. The artwork is original to this project — drawn for
Omaski in a minimalist fantasy-console style, using the 16-colour PICO-8
palette — and is licensed with the rest of the plugin, so the whole
repository is freely redistributable.

Sprites are authored at 8 pixels per metre (half the classic 16), which is
what gives the game its chunky look once the renderer integer-scales its
small virtual screen up to the window.

The catalog ids and canvas sizes match game/Sprites.js, which the engine uses
for layout and collision. Only Python's standard library is required:

    python3 tools/make-sprites.py [-o OUTDIR]
"""

import argparse
import json
import math
import os
import re
import struct
import zlib

# ---------------------------------------------------------------------------
# Palette: the 16 PICO-8 colours, one character each. Nothing else — every
# colour in the game locks to one of the official PICO-8 sixteen.
# ---------------------------------------------------------------------------
# '.' (and ' ') are transparent.

PALETTE = {
    "k": (0x00, 0x00, 0x00, 255),   # 0  black
    "n": (0x1D, 0x2B, 0x53, 255),   # 1  dark blue
    "v": (0x7E, 0x25, 0x53, 255),   # 2  dark purple
    "e": (0x00, 0x87, 0x51, 255),   # 3  dark green
    "B": (0xAB, 0x52, 0x36, 255),   # 4  brown
    "d": (0x5F, 0x57, 0x4F, 255),   # 5  dark grey
    "s": (0xC2, 0xC3, 0xC7, 255),   # 6  light grey
    "w": (0xFF, 0xF1, 0xE8, 255),   # 7  white
    "r": (0xFF, 0x00, 0x4D, 255),   # 8  red
    "o": (0xFF, 0xA3, 0x00, 255),   # 9  orange
    "y": (0xFF, 0xEC, 0x27, 255),   # 10 yellow
    "g": (0x00, 0xE4, 0x36, 255),   # 11 green
    "b": (0x29, 0xAD, 0xFF, 255),   # 12 blue
    "l": (0x83, 0x76, 0x9C, 255),   # 13 indigo
    "m": (0xFF, 0x77, 0xA8, 255),   # 14 pink
    "f": (0xFF, 0xCC, 0xAA, 255),   # 15 peach
}

# Sprite canvas sizes, kept identical to game/Sprites.js. At 8 px/metre these
# give every object the same world-space footprint the classic had at 16.
SIZES = {
    1: (14, 19), 2: (16, 20), 3: (18, 16), 4: (16, 16), 5: (16, 20),
    6: (18, 16), 7: (16, 16), 8: (12, 15), 9: (12, 15), 10: (12, 15),
    11: (12, 15), 12: (56, 30), 13: (18, 14), 14: (14, 18), 15: (14, 16),
    16: (14, 16), 17: (14, 17), 18: (16, 13), 19: (16, 16), 20: (16, 12),
    21: (13, 16), 22: (13, 16), 27: (32, 16), 28: (17, 17), 29: (17, 17),
    30: (17, 17), 31: (17, 11), 32: (17, 14), 33: (15, 11), 34: (15, 11),
    35: (14, 13), 36: (14, 13), 37: (18, 21), 38: (14, 21), 39: (18, 22),
    40: (21, 21), 41: (22, 22), 42: (22, 22), 43: (18, 21), 44: (21, 18),
    45: (12, 6), 46: (8, 6), 47: (8, 3), 48: (12, 4), 49: (14, 16),
    50: (11, 14), 51: (16, 32), 52: (16, 6), 53: (120, 44),
    64: (14, 32), 65: (13, 16), 66: (13, 16),
    67: (13, 16), 68: (16, 24), 69: (16, 24), 70: (16, 24), 71: (16, 24),
    72: (16, 24), 73: (16, 24), 74: (16, 24), 75: (16, 24), 76: (16, 24),
    77: (16, 24), 78: (16, 24), 79: (16, 24), 80: (16, 24), 81: (16, 24),
    82: (8, 4), 83: (11, 14), 84: (11, 14), 85: (11, 14), 86: (4, 6),
    87: (14, 16), 88: (14, 16), 89: (14, 16), 90: (25, 17), 91: (25, 17),
    92: (25, 17), 93: (25, 17), 94: (16, 28), 95: (16, 28), 96: (18, 16),
}

# ---------------------------------------------------------------------------
# Canvas helpers
# ---------------------------------------------------------------------------


def canvas(w, h, fill="."):
    return [[fill] * w for _ in range(h)]


def grid(text):
    """Parse a multi-line pixel grid, padding rows to the widest line."""
    lines = [ln for ln in text.splitlines() if ln != ""]
    width = max(len(ln) for ln in lines)
    return [list(ln.ljust(width, ".")) for ln in lines]


def mirror(rows):
    return [list(reversed(r)) for r in rows]


def shift_up(rows, n=1):
    """Move art up n rows inside the same canvas (a hop/bob frame)."""
    blank = [["."] * len(rows[0]) for _ in range(n)]
    return rows[n:] + blank


def scale_by(rows, f=1.4):
    """Nearest-neighbour resample by factor f (used at 1.4: the doubled
    critters, reduced 30%)."""
    sh, sw = len(rows), len(rows[0])
    dh, dw = round(sh * f), round(sw * f)
    return [[rows[min(sh - 1, int(y / f))][min(sw - 1, int(x / f))]
             for x in range(dw)] for y in range(dh)]


def scale2(rows):
    """Nearest-neighbour double: every pixel becomes a 2x2 block."""
    out = []
    for r in rows:
        rr = []
        for c in r:
            rr += [c, c]
        out.append(rr)
        out.append(list(rr))
    return out


def remap(rows, table):
    return [[table.get(c, c) for c in r] for r in rows]


def blit(dst, src, x, y):
    for j, row in enumerate(src):
        for i, c in enumerate(row):
            if c in (".", " "):
                continue
            px, py = x + i, y + j
            if 0 <= px < len(dst[0]) and 0 <= py < len(dst):
                dst[py][px] = c
    return dst


def place(art, w, h, anchor="bottom"):
    """Centre `art` horizontally on a w x h canvas, bottom- or centre-anchored."""
    rows = grid(art) if isinstance(art, str) else art
    aw, ah = len(rows[0]), len(rows)
    if aw > w or ah > h:
        raise ValueError("art %dx%d exceeds canvas %dx%d" % (aw, ah, w, h))
    x = (w - aw) // 2
    y = (h - ah) if anchor == "bottom" else (h - ah) // 2
    return blit(canvas(w, h), rows, x, y)


def fill_rect(dst, x0, y0, x1, y1, c):
    for y in range(y0, y1):
        for x in range(x0, x1):
            if 0 <= x < len(dst[0]) and 0 <= y < len(dst):
                dst[y][x] = c
    return dst


def ellipse(dst, cx, cy, rx, ry, c):
    for y in range(len(dst)):
        for x in range(len(dst[0])):
            dx, dy = (x - cx) / max(rx, 0.01), (y - cy) / max(ry, 0.01)
            if dx * dx + dy * dy <= 1.0:
                dst[y][x] = c
    return dst


def rim(dst, body, edge):
    """Outline every `body` pixel that touches transparency with `edge`."""
    h, w = len(dst), len(dst[0])
    out = [row[:] for row in dst]
    for y in range(h):
        for x in range(w):
            if dst[y][x] != body:
                continue
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if not (0 <= ny < h and 0 <= nx < w) or dst[ny][nx] == ".":
                        out[y][x] = edge
    return out


# ---------------------------------------------------------------------------
# The PICO-8 system font (released CC-0 by Lexaloffle): 3x5 glyphs on a
# 4-pixel advance, strictly monospace — even the dot fills a 3-wide box.
# Extracted pixel-for-pixel from the published font sheet, including the
# real ❎ and 🅾 controller-button glyphs (7 wide, mapped to "❎"/"Ⓞ").
# Keep this table in step with game/Font.js.
# ---------------------------------------------------------------------------

FONT = {
    "A": "### #.# ### #.# #.#", "B": "### #.# ##. #.# ###",
    "C": ".## #.. #.. #.. .##", "D": "##. #.# #.# #.# ###",
    "E": "### #.. ##. #.. ###", "F": "### #.. ##. #.. #..",
    "G": ".## #.. #.. #.# ###", "H": "#.# #.# ### #.# #.#",
    "I": "### .#. .#. .#. ###", "J": "### .#. .#. .#. ##.",
    "K": "#.# #.# ##. #.# #.#", "L": "#.. #.. #.. #.. ###",
    "M": "### ### #.# #.# #.#", "N": "##. #.# #.# #.# #.#",
    "O": ".## #.# #.# #.# ##.", "P": "### #.# ### #.. #..",
    "Q": ".#. #.# #.# ##. .##", "R": "### #.# ##. #.# #.#",
    "S": ".## #.. ### ..# ##.", "T": "### .#. .#. .#. .#.",
    "U": "#.# #.# #.# #.# .##", "V": "#.# #.# #.# ### .#.",
    "W": "#.# #.# #.# ### ###", "X": "#.# #.# .#. #.# #.#",
    "Y": "#.# #.# ### ..# ###", "Z": "### ..# .#. #.. ###",
    "0": "### #.# #.# #.# ###", "1": "##. .#. .#. .#. ###",
    "2": "### ..# ### #.. ###", "3": "### ..# .## ..# ###",
    "4": "#.# #.# ### ..# ..#", "5": "### #.. ### ..# ###",
    "6": "#.. #.. ### #.# ###", "7": "### ..# ..# ..# ..#",
    "8": "### #.# ### #.# ###", "9": "### #.# ### ..# ..#",
    "(": ".#. #.. #.. #.. .#.", ")": ".#. ..# ..# ..# .#.",
    "-": "... ... ### ... ...", "=": "... ### ... ### ...",
    ".": "... ... ... ... .#.", "!": ".#. .#. .#. ... .#.",
    ":": "... .#. ... .#. ...", "/": "..# .#. .#. .#. #..",
    "%": "#.# ..# .#. #.. #.#", "*": "#.# .#. ### .#. #.#",
    "@": ".#. #.# #.# #.. .##", " ": "... ... ... ... ...",
    "❎": ".#####. ##.#.## ###.### ##.#.## .#####.",
    "Ⓞ": ".#####. ##...## ##.#.## ##...## .#####.",
}


def glyph(ch):
    rows = FONT.get(ch.upper(), FONT[" "]).split(" ")
    return [list(r) for r in rows]


def text_width(s, scale=1):
    w = 0
    for ch in s:
        w += (len(glyph(ch)[0]) + 1) * scale
    return w - scale if s else 0


def draw_text(dst, x, y, s, colour, scale=1):
    cx = x
    for ch in s:
        rows = glyph(ch)
        for j, row in enumerate(rows):
            for i, c in enumerate(row):
                if c != "#":
                    continue
                fill_rect(dst, cx + i * scale, y + j * scale,
                          cx + (i + 1) * scale, y + (j + 1) * scale, colour)
        cx += (len(rows[0]) + 1) * scale
    return dst


# ---------------------------------------------------------------------------
# PNG writer (stdlib only)
# ---------------------------------------------------------------------------


def write_png(path, rows):
    h, w = len(rows), len(rows[0])
    raw = bytearray()
    for row in rows:
        raw.append(0)
        for c in row:
            raw.extend(PALETTE.get(c, (0, 0, 0, 0)))

    def chunk(tag, data):
        block = tag + data
        return (struct.pack(">I", len(data)) + block
                + struct.pack(">I", zlib.crc32(block) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


# ---------------------------------------------------------------------------
# Sprite builders
# ---------------------------------------------------------------------------

BUILDERS = {}


def sprite(sid):
    def register(fn):
        BUILDERS[sid] = fn
        return fn
    return register


# --- the skier -------------------------------------------------------------
# Red beanie with a bobble on top, blue jacket, dark-blue trousers, black
# skis. Every pose is built symmetric: 2px blue sleeves, 2px legs, 2px skis,
# a straight waist rather than an hourglass. The poles are always thin grey
# lines — never more than a single pixel of thickness — and they track the
# skis: straight back when pointing downhill, flared 30 degrees on a gentle
# turn, trailing parallel behind the skis on a hard traverse, planted in
# the snow at a dead stop.

SKIER_DOWN = """
.kk...rr...kk.
.kk..rrrr..kk.
.k...rrrr...k.
.k...ffff...k.
.k..bbbbbb..k.
.kbb.bbbb.bbk.
.kbb.bbbb.bbk.
.kbb.bbbb.bbk.
....bbbbbb....
.....nnnn.....
.....nnnn.....
....nn..nn....
....nn..nn....
....kk..kk....
....kk..kk....
....kk..kk....
....kk..kk....
....kk..kk....
....kk..kk....
"""


@sprite(1)
def _skier_down():
    return place(SKIER_DOWN, 14, 19)


# One notch off straight: skis run long, tails peeking behind the boots and
# tips stepping out ahead; the poles flare out and down at 30 degrees.
SKIER_DIAG_R = """
.......rr.......
......rrrr......
......rrrr......
......ffff......
.....bbbbbb.....
...bb.bbbb.bb...
...bb.bbbb.bb...
...bb.bbbb.bb...
..d..bbbbbb..d..
dd.....nnnn...dd
...k..nnnn......
....knn.knn.....
....knn.knn.....
.....kk..kk.....
.....kk..kk.....
......kk..kk....
......kk..kk....
.......kk..kk...
.......kk..kk...
........kk..kk..
"""


@sprite(2)
def _skier_diag_r():
    return place(SKIER_DIAG_R, 16, 20)


@sprite(5)
def _skier_diag_l():
    return mirror(place(SKIER_DIAG_R, 16, 20))


# Two notches: a hard traverse. Arms tucked against the body, both poles
# streaming out behind, and the skis dropping across the hill at a proper
# 30 degrees — one row down for every two columns, with the tails behind
# the boots running parallel to the tips out front.
SKIER_TRAV_R = """
.......rr.........
......rrrr........
......rrrr........
......ffff........
dd...bbbbbb.......
..ddbbbbbbbb......
dd..bbbbbbbb......
..ddbbbbbbbb......
......bbbb........
......nnnn........
kk..knn.nn........
..kk.nnknn........
....knnknnk.......
......kkkk........
........kkkk......
..........kkkk....
"""


@sprite(3)
def _skier_trav_r():
    return place(SKIER_TRAV_R, 18, 16)


@sprite(6)
def _skier_trav_l():
    return mirror(place(SKIER_TRAV_R, 18, 16))


# Skis planted fully across the fall line: stopped. Two long level skis with
# daylight between them, poles planted in the snow.
SKIER_SIDE_R = """
......rr........
.....rrrr.......
.....rrrr.......
.....ffff.......
..k.bbbbbb.k....
..k.bbbbbb.k....
..k.bbbbbb.k....
..k.bbbbbb.k....
..k..bbbb..k....
..k..nnnn..k....
..k.nn.nn..k....
.kkknn.nn.kkk...
...knnknnk......
..kkkkkkkkkkkkkk
................
.kkkkkkkkkkkkkk.
"""


@sprite(4)
def _skier_side_r():
    return place(SKIER_SIDE_R, 16, 16)


@sprite(7)
def _skier_side_l():
    return mirror(place(SKIER_SIDE_R, 16, 16))


SKIER_STEP_L = """
.....rr.....
....rrrr....
....ffrr....
....bbbb....
.d.bbbbbb.d.
.d.bbbbbb.d.
.d.bbbbbb.d.
....bbbb....
....nnn.....
...nnnnn....
...nn..nn...
..nn....nn..
..knk...nk..
kkkkkk.kkkkk
.kkkkkkkkkk.
"""


@sprite(8)
def _skier_step_l():
    return place(SKIER_STEP_L, 12, 15)


@sprite(9)
def _skier_step_r():
    return mirror(place(SKIER_STEP_L, 12, 15))


SKIER_CLIMB_L = """
.....rr.....
....rrrr....
....ffrr....
....bbbb....
.d.bbbbbb.d.
.d.bbbbbb.d.
.d.bbbbbb.d.
....bbbb....
....nnn.....
...nnnnn....
...nn.nn....
...nn.nn....
..kknnkk....
.kkkkkkkkkk.
..kkkkkkkkkk
"""


@sprite(10)
def _skier_climb_l():
    return place(SKIER_CLIMB_L, 12, 15)


@sprite(11)
def _skier_climb_r():
    return mirror(place(SKIER_CLIMB_L, 12, 15))


# --- crashes ---------------------------------------------------------------


@sprite(12)
def _crash_burst():
    # A Batman-style starburst: a straight-edged polygon of nine hard
    # triangular spikes, yellow inside a thick orange outline. The crash
    # word is drawn over it at runtime.
    W, H = 56, 30
    cx, cy = 27.5, 14.5
    verts = []
    for i in range(18):
        a = i * math.pi / 9 + math.pi / 2      # one spike straight up
        r = 13.5 if i % 2 == 0 else 8.0
        verts.append((cx + math.cos(a) * r * 1.95, cy + math.sin(a) * r))

    def inside(px, py):
        hit = False
        for i in range(len(verts)):
            x1, y1 = verts[i]
            x2, y2 = verts[(i + 1) % len(verts)]
            if (y1 > py) != (y2 > py) and \
               px < (x2 - x1) * (py - y1) / (y2 - y1) + x1:
                hit = not hit
        return hit

    dst = canvas(W, H)
    for y in range(H):
        for x in range(W):
            if inside(x + 0.5, y + 0.5):
                dst[y][x] = "y"
    # A bold outline: any yellow within two pixels of the edge goes orange.
    out = [row[:] for row in dst]
    for y in range(H):
        for x in range(W):
            if dst[y][x] != "y":
                continue
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    ny, nx = y + dy, x + dx
                    if not (0 <= ny < H and 0 <= nx < W) or dst[ny][nx] == ".":
                        out[y][x] = "o"
    return out


# Sprawled out in the snow: sitting down, ski tips thrown up and out in a
# V behind him, arms and poles pointing down and out in an upside-down V.
CRASH_SIT = """
kk..............kk
.kk.....rr.....kk.
..kk...rrrr...kk..
...kk..rrrr..kk...
....kk.ffff.kk....
.....kbbbbbbk.....
....bbkkbbkkbb....
...bbb.kkkk.bbb...
..bbb..bkkb..bbb..
.dd....kkkk....dd.
.d....kknnkk....d.
d....kknnnnkk....d
d...kkn....nkk...d
...kkw......wkk...
"""


@sprite(13)
def _crash_sit():
    return place(CRASH_SIT, 18, 14)


CRASH_SPRAWL = """
..kk.........kk.
...kk.......kk..
....kk.nn..kk...
.....knnnnkk....
..w..nnnnnn..w..
.ww.bbbbbbbb.ww.
....bbbbbbbb....
...bbbbbbbbbb...
..ffbbbbbbbbff..
.....rrrr.ww....
.....rrrrww.....
......rr........
"""


@sprite(18)
def _crash_sprawl():
    return place(CRASH_SPRAWL, 16, 13)


CRASH_HEADFIRST = """
...kk......kk...
....kk....kk....
.....kk..kk.....
.....nn..nn.....
.....nn..nn.....
.....nnnnnn.....
....bbbbbbbb....
....bbbbbbbb....
.....bbbbbb.....
...wwwwwwwwww...
..wwwwwwwwwwww..
.wwwwwwwwwwwwww.
"""


@sprite(19)
def _crash_headfirst():
    return place(CRASH_HEADFIRST, 16, 16)


CRASH_TANGLE = """
..kkk......kk...
.....kk..kkk....
..kk...knnk.kk..
....kknnnnk.....
....bbnnnbb.....
...bbbbbbbbb.f..
..fbbbbbbbbbff..
....bbrrrbb.....
...wwrrrrrww....
....wwrrrww.....
"""


@sprite(20)
def _crash_tangle():
    return place(CRASH_TANGLE, 16, 12)


GETTING_UP_L = """
......rr.....
.....rrrr....
.....ffrr....
.....bbbb....
...d.bbbb....
...d.bbbb.d..
...d..bb..d..
....nnnnn.d..
...nnnnnnnd..
...nnnnnn....
...nn..nn....
..knnk.nnk...
kkkkkkkkkk...
.kkkkkkkkkkk.
"""


@sprite(21)
def _getting_up_l():
    return place(GETTING_UP_L, 13, 16)


@sprite(22)
def _getting_up_r():
    return mirror(place(GETTING_UP_L, 13, 16))


# --- airborne and tricks ---------------------------------------------------

# The plain jump: skis in a flying V — tips up and spread wide, tails
# crossing under the boots like a loose X.
JUMP_BODY = """
....rr....
...rrrr...
...rrrr...
...ffff...
bb.bbbb.bb
.bbbbbbbb.
..bbbbbb..
..bbbbbb..
...nnnn...
..nn..nn..
..nn..nn..
"""


@sprite(14)
def _jump_v():
    dst = canvas(14, 18)
    for r in range(18):
        off = int(r * 0.5 + 0.5)
        # Above the hands the lines taper to a single pixel.
        cols = (off, 13 - off) if r < 5 else (off, off + 1, 12 - off, 13 - off)
        for x in cols:
            if 0 <= x < 14:
                dst[r][x] = "k"
    blit(dst, grid(JUMP_BODY), 2, 1)
    # Poles gripped in the fists, flaring out just below the ski tips.
    for x, y in ((1, 5), (0, 4), (12, 5), (13, 4)):
        dst[y][x] = "k"
    return dst


JUMP_HIGH_L = """
d...........d.
.d..rrrr...d..
..d.rrff..d...
...bbbbbbb....
..bbbbbbbb....
....bbbb......
....nnnn......
...nnnnnn.....
...nn..nn.....
..knnk.nnk....
.kkkkk.kkkkk..
kkkkk.kkkkk...
"""


@sprite(15)
def _jump_high_l():
    return place(JUMP_HIGH_L, 14, 16, anchor="center")


@sprite(16)
def _jump_high_r():
    return mirror(place(JUMP_HIGH_L, 14, 16, anchor="center"))


JUMP_TUCK = """
...kkkkkkkkk..
..kkkkkkkkkkk.
..knnk...knnk.
...nnn...nnn..
...nnnnnnnnn..
....bbbbbbb...
...bbbbbbbbb..
..fbbbbbbbbf..
....bbbbbb....
.....rrrr.....
.....rrrr.....
.....ffff.....
"""


@sprite(17)
def _jump_tuck():
    return place(JUMP_TUCK, 14, 17, anchor="center")


# Rattled over a mogul: everything fans out into an X — arms and poles
# thrown up in a V, skis splayed into a perfect upside-down V below.
SKIER_BUMP = """
d................d
.d..............d.
..d.....rr.....d..
...bb..rrrr..bb...
....bb.rrrr.bb....
.....b.ffff.b.....
.....bbbbbbbb.....
......bbbbbb......
......bbbbbb......
.......nnnn.......
......nn..nn......
.....nn....nn.....
....kkk....kkk....
...kkk......kkk...
..kkk........kkk..
.kk............kk.
"""


@sprite(96)
def _skier_bump():
    return place(SKIER_BUMP, 18, 16)


# --- scenery ---------------------------------------------------------------


@sprite(27)
def _cloud():
    dst = canvas(32, 16)
    for cx, cy, rx, ry in ((9, 10, 7, 4), (17, 7, 8, 5), (24, 10, 6, 4)):
        ellipse(dst, cx, cy, rx, ry, "s")
    for cx, cy, rx, ry in ((9, 9, 5, 3), (17, 6, 6, 4), (23, 9, 4, 3)):
        ellipse(dst, cx, cy, rx, ry, "w")
    return dst


# Three stacked triangles, each rising to a sharp single-pixel point,
# dark-shaded on the right, with snow caught on the left edges.
TREE = """
......g.......
.....ggg......
....gggee.....
...wgggeee....
......g.......
.....ggg......
....gggee.....
...ggggeee....
..wggggeeee...
.....gge......
....ggggee....
...gggggeee...
..ggggggeeee..
.wgggggeeeeee.
......BB......
.....BBBB.....
"""


@sprite(49)
def _tree():
    return place(TREE, 14, 16)


TREE_BARE = """
..B.....B..
.B.B.B..B..
..B.BB.B.B.
...BBBB.B..
..B.BBB....
....BB.....
....BB.....
....BB.....
....BB.....
...BBB.....
...BBBB....
"""


@sprite(50)
def _tree_bare():
    return place(TREE_BARE, 11, 14)


# Four tiers for the tall pine, every one rising to a point.
TREE_BIG = """
.......g........
......ggg.......
.....gggee......
....wgggeee.....
.......g........
......ggg.......
.....gggee......
....ggggeee.....
...wggggeeee....
......gge.......
.....ggggee.....
....gggggeee....
...ggggggeeee...
..wgggggeeeeee..
......ggge......
.....gggggee....
....ggggggeee...
...gggggggeeee..
..ggggggggeeeee.
.wgggggggeeeeeee
......BBBB......
......BBBB......
......BBBB......
......BBBB......
.....BBBBBB.....
"""


@sprite(51)
def _tree_big():
    return place(TREE_BIG, 16, 32)


def xmas_tree(a, b, c):
    dst = place(TREE, 14, 16)
    for x, y, ch in ((6, 5, a), (8, 7, b), (5, 9, c), (9, 11, a), (3, 12, b)):
        if dst[y][x] != ".":
            dst[y][x] = ch
    dst[0][6] = "y"   # 1px star capping the pointy tip
    return dst


@sprite(87)
def _xmas_a():
    return xmas_tree("r", "y", "b")


@sprite(88)
def _xmas_b():
    return xmas_tree("y", "b", "r")


@sprite(89)
def _xmas_c():
    return xmas_tree("b", "r", "y")


# A big dead snag: bare gnarled crown, tall trunk with broken branch stubs.
TREE_DEAD_BIG = """
.B.....B........
.B..B..B....B...
..B.B.B.B..B....
..BB.BBB.B.B....
...BBBB.BBB.....
.....BBBBB......
......BBB.......
......BBB.......
.....dBBB.......
......BBB.......
......BBBB......
......BBB.B.....
.....dBBB..B....
......BBB.......
......BBB.......
...B..BBB.......
....B.BBB.......
.....dBBB.......
......BBB.......
......BBB.......
......BBB.......
......BBB.......
......BBB.......
......BBB.......
......BBB.......
.....BBBBB......
....BBBBBBB.....
................
"""


@sprite(94)
def _tree_dead_big_a():
    return place(TREE_DEAD_BIG, 16, 28)


@sprite(95)
def _tree_dead_big_b():
    return mirror(place(TREE_DEAD_BIG, 16, 28))


TREE_BURNT = """
..d.....d..
.d.d.d..d..
..d.dd.d.d.
...dddd.d..
..d.kkd....
....kk.....
.o..kk.....
.oo.kk..o..
....kk.oo..
...kkk.....
...kkkk....
"""


@sprite(83)
def _burnt_a():
    return place(TREE_BURNT, 11, 14)


@sprite(84)
def _burnt_b():
    return mirror(place(TREE_BURNT, 11, 14))


@sprite(85)
def _burnt_c():
    return place(remap(grid(TREE_BURNT), {"o": "y"}), 11, 14)


ROCK = """
....ssss....
..sswwsss...
.sswwssssd..
.sssssssdd..
.ssssddddd..
..dddddddd..
"""


@sprite(45)
def _rock():
    return place(ROCK, 12, 6)


STUMP = """
..BBBBB.
.BBffBB.
.BfBBfB.
.BBffBB.
.BBBBBB.
.BBBBBB.
"""


@sprite(46)
def _stump():
    return place(STUMP, 8, 6)


@sprite(47)
def _mogul_small():
    art = """
..ssss..
.swwwws.
ssssssss
"""
    return place(art, 8, 3)


@sprite(48)
def _mogul_large():
    art = """
....ssss....
..sswwwwss..
.swwwwwwwws.
ssssssssssss
"""
    return place(art, 12, 4)


@sprite(52)
def _ramp():
    # A flat rainbow lying across the slope: five full-width stripes, the
    # same five colours in the same order (red on top), over a white face.
    dst = canvas(16, 6)
    bands = ["r", "o", "y", "g", "b", "w"]
    for y in range(6):
        for x in range(16):
            dst[y][x] = bands[y]
    return dst


@sprite(82)
def _snow_patch():
    art = """
..ffff..
.fBBfBf.
ffBBBBf.
.fffff..
"""
    return place(art, 8, 4)


# --- chairlift -------------------------------------------------------------


# A proper A-frame pylon: twin tube legs spreading toward the ground,
# cross-braced every few metres, a full-width crossarm on top with yellow
# cable sheaves hanging at each end, concrete footings at the base.
LIFT_TOWER = """
ssssssssssssss
dddddddddddddd
yy..........yy
yy..........yy
....sd..sd....
....sd..sd....
....sdddsd....
...sd....sd...
...sd....sd...
...sd....sd...
...sddddddd...
...sd....sd...
..sd......sd..
..sd......sd..
..sd......sd..
..sddddddddd..
..sd......sd..
..sd......sd..
.sd........sd.
.sd........sd.
.sd........sd.
.sddddddddddd.
.sd........sd.
.sd........sd.
sd..........sd
sd..........sd
sd..........sd
sd..........sd
sd..........sd
dd..........dd
sss........sss
sss........sss
"""


@sprite(64)
def _lift_tower():
    return place(LIFT_TOWER, 14, 32)


def chair(riders):
    dst = canvas(13, 16)
    fill_rect(dst, 0, 0, 13, 1, "d")             # cable
    fill_rect(dst, 6, 1, 7, 5, "d")              # hanger
    fill_rect(dst, 2, 5, 11, 6, "d")             # back rail
    fill_rect(dst, 2, 5, 3, 11, "d")
    fill_rect(dst, 2, 10, 12, 11, "d")           # seat
    fill_rect(dst, 11, 11, 12, 13, "d")          # footrest
    if riders >= 1:
        blit(dst, grid("""
oo
oo
bb
"""), 4, 6)
        fill_rect(dst, 4, 11, 5, 13, "b")
    if riders >= 2:
        blit(dst, grid("""
mm
mm
nn
"""), 8, 6)
        fill_rect(dst, 8, 11, 9, 13, "n")
    return dst


@sprite(65)
def _chair_full():
    return chair(1)


@sprite(66)
def _chair_pair():
    return chair(2)


@sprite(67)
def _chair_empty():
    return chair(0)


# --- other skiers ----------------------------------------------------------
# The rival skier wears orange, built on the same symmetric frame as the
# hero: 2px arms, 2px legs, 2px skis.

SKIER2_DOWN = """
....yyyy....
....ffff....
...oooooo...
..ddoooodd..
..ddoooodd..
....oooo....
....vvvv....
...vv..vv...
...vv..vv...
...kk..kk...
...kk..kk...
...kk..kk...
"""


@sprite(28)
def _skier2_down():
    return place(scale_by(grid(SKIER2_DOWN)), 17, 17)


SKIER2_DIAG_L = """
....yyyy....
....ffff....
...oooooo...
..ddoooodd..
..ddoooodd..
....oooo....
....vvvv....
...vv..vv...
...vv..vv...
..kk..kk....
..kk..kk....
.kk..kk.....
"""


@sprite(29)
def _skier2_diag_l():
    return place(scale_by(grid(SKIER2_DIAG_L)), 17, 17)


@sprite(30)
def _skier2_diag_r():
    return place(scale_by(mirror(grid(SKIER2_DIAG_L))), 17, 17)


SKIER2_CRASH = """
....yyyy....
....ffyy....
...oooooo...
..oooooooo..
..vvvvvvvv.d
.vvvvvvvvvvd
kk.vvvvvv.kk
kk.w.ww.w.kk
"""


@sprite(31)
def _skier2_crash():
    return place(scale_by(grid(SKIER2_CRASH)), 17, 11)


SKIER2_SPRAWL = """
.kk......kk.
..kk....kk..
...kk.vvkk..
....kvvvv...
.w..vvvvv.w.
.ww.oooooww.
...oooooooo.
..ffoooooof.
....yyyyww..
....yyyww...
"""


@sprite(32)
def _skier2_sprawl():
    return place(scale_by(grid(SKIER2_SPRAWL)), 17, 14)


# --- the dog ---------------------------------------------------------------

DOG_A = """
.........BB
......B.BBB
.BB...BBBB.
..BBBBBBB..
..BBBBBB...
..B..BB....
.B..B..B...
.B..B...B..
"""

DOG_B = """
.........BB
......B.BBB
.BB...BBBB.
..BBBBBBB..
..BBBBBB...
...BB.BB...
..B....B...
...B....B..
"""


@sprite(33)
def _dog_a():
    return place(scale_by(grid(DOG_A)), 15, 11)


@sprite(34)
def _dog_b():
    return place(scale_by(grid(DOG_B)), 15, 11)


DOG_BARK = """
.w..w.....
w..w..BB..
.w....BBB.
...BBBBB..
..BBBBBB..
..BBBBBB..
...BB.BB..
...BB..BB.
..BB....B.
"""


@sprite(35)
def _dog_bark_a():
    return place(scale_by(grid(DOG_BARK)), 14, 13)


@sprite(36)
def _dog_bark_b():
    art = remap(grid(DOG_BARK), {"w": "s"})
    return place(scale_by(shift_up(art, 1)), 14, 13)


# --- deer ------------------------------------------------------------------
# A deer trots straight across the slope. Hit one and it bursts — the deer
# comes off much worse than you do.

DEER = """
.............BB.B.
.............BB.B.
..............BBB.
.............BkBBB
..BBBBBBBBBBBBBB..
.wBBBBBBBBBBBBBB..
.wBBffffffffBBB...
..BBBBBBBBBBBB....
...BB...BB..BB....
...BB...BB..BB....
...BB...BB...BB...
..BB....BB...BB...
"""


@sprite(90)
def _deer_a():
    return place(scale_by(grid(DEER)), 25, 17)


@sprite(91)
def _deer_b():
    return place(scale_by(shift_up(grid(DEER), 1)), 25, 17)


def deer_splat(pool):
    dst = canvas(18, 12)
    if pool:
        # Settled: a wide dark pool with a few remains.
        ellipse(dst, 8.5, 8, 7.0, 3.2, "r")
        ellipse(dst, 8.5, 8.5, 4.5, 2.0, "v")
        for x, y in ((5, 7), (9, 8), (12, 7)):
            dst[y][x] = "B"
        for x, y in ((1, 5), (16, 6), (7, 4), (12, 4)):
            dst[y][x] = "r"
    else:
        # The burst itself: blood every which way.
        ellipse(dst, 8.5, 6, 5.5, 3.6, "r")
        ellipse(dst, 8.5, 6.5, 3.2, 2.0, "v")
        for x, y in ((1, 2), (3, 0), (6, 0), (11, 0), (14, 1), (16, 3),
                     (17, 6), (15, 9), (12, 11), (5, 11), (2, 9), (0, 5),
                     (9, 1), (13, 2), (4, 10), (16, 10)):
            dst[y][x] = "r"
        for x, y in ((7, 5), (10, 6), (8, 7), (11, 4)):
            dst[y][x] = "B"
    return dst


@sprite(92)
def _deer_splat_a():
    return scale_by(deer_splat(False))


@sprite(93)
def _deer_splat_b():
    return scale_by(deer_splat(True))


# --- snowboarders ----------------------------------------------------------


def boarder(w, h, lean):
    """A pink-suited boarder on a yellow board, leaning -1/0/+1."""
    dst = canvas(w, h)
    cx = w // 2
    fill_rect(dst, max(0, cx - 5 + lean * 2), h - 2,
              min(w, cx + 5 + lean * 2), h - 1, "y")   # board
    fill_rect(dst, cx - 1, h - 5, cx + 1, h - 2, "n")  # legs
    fill_rect(dst, cx - 2 + lean, h - 8, cx + 2 + lean, h - 5, "m")
    fill_rect(dst, cx - 3 + lean, h - 7, cx + 3 + lean, h - 6, "m")  # arms
    fill_rect(dst, cx - 1 + lean, h - 10, cx + 1 + lean, h - 8, "f")
    fill_rect(dst, cx - 1 + lean, h - 11, cx + 1 + lean, h - 9, "e")  # cap
    return dst


@sprite(37)
def _boarder_a():
    return scale_by(boarder(13, 15, -1))


@sprite(38)
def _boarder_b():
    return scale_by(boarder(10, 15, 0))


@sprite(39)
def _boarder_c():
    return scale_by(boarder(13, 16, 1))


@sprite(40)
def _boarder_d():
    dst = boarder(15, 15, 0)
    fill_rect(dst, 1, 10, 4, 11, "y")   # board grabbed sideways
    return scale_by(dst)


def boarder_crash(w, h, flip):
    dst = canvas(w, h)
    cx, cy = w // 2, h - 5
    fill_rect(dst, cx - 5, cy + 2, cx + 5, cy + 3, "w")      # snow spray
    fill_rect(dst, cx - 2, cy - 1, cx + 2, cy + 2, "m")      # heap
    fill_rect(dst, cx - 4, cy, cx - 2, cy + 1, "f")
    if flip:
        fill_rect(dst, cx - 6, cy - 3, cx + 1, cy - 2, "y")  # board up
    else:
        fill_rect(dst, cx - 1, cy - 3, cx + 6, cy - 2, "y")
    fill_rect(dst, cx + 1, cy - 2, cx + 3, cy - 1, "e")
    return dst


@sprite(41)
def _boarder_crash_a():
    return scale_by(boarder_crash(16, 16, False))


@sprite(42)
def _boarder_crash_b():
    return scale_by(boarder_crash(16, 16, True))


@sprite(43)
def _boarder_crash_c():
    return scale_by(boarder_crash(13, 15, False))


@sprite(44)
def _boarder_crash_d():
    return scale_by(boarder_crash(15, 13, True))


# --- title card and hints --------------------------------------------------


def synth_sun(dst, cx, cy, r):
    for y in range(cy - r, cy + r + 1):
        dy = y - cy
        if dy in (2, 5, 7):        # scanline gaps toward the bottom
            continue
        half = int((r * r - dy * dy) ** 0.5)
        c = "y" if dy < -2 else ("o" if dy <= 2 else "r")
        for x in range(cx - half, cx + half + 1):
            if 0 <= x < len(dst[0]) and 0 <= y < len(dst):
                dst[y][x] = c
    return dst


def mountain(dst, apex_x, apex_y, height, cap=6):
    """A clean angular peak: dead-straight flanks at one constant pitch a
    side, a solid white snow cap with a regular chevron hem, a light-blue
    body, and the bold 2px black outline to match the wordmark."""
    W, H = len(dst[0]), len(dst)
    tmp = canvas(W, H)
    for j in range(height):
        lx = j
        rx = j
        y = apex_y + j
        if not (0 <= y < H):
            continue
        for x in range(apex_x - lx, apex_x + rx + 1):
            if not (0 <= x < W):
                continue
            hem = cap + (0, 1, 2, 3, 2, 1)[x % 6]
            tmp[y][x] = "w" if j < hem else "b"
    # The bold outline: anything within two pixels of the edge goes black.
    for y in range(H):
        for x in range(W):
            if tmp[y][x] == ".":
                continue
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    ny, nx = y + dy, x + dx
                    if not (0 <= ny < H and 0 <= nx < W) or tmp[ny][nx] == ".":
                        tmp[y][x] = "k"
    return blit(dst, tmp, 0, 0)


@sprite(53)
def _logo():
    # Mountains behind a fat Omarchy-green wordmark with a uniform 2px
    # black outline. The snow caps cover the top half of each peak.
    dst = canvas(120, 44)
    # A vaporwave sun rises in the valley between the peaks: yellow crown,
    # orange belly, red base, with the classic scanline gaps low down.
    synth_sun(dst, 59, 9, 8)
    mountain(dst, 46, 0, 30, cap=15)
    # The second peak's 45-degree base ends flush with the I (x = 94).
    mountain(dst, 72, 8, 22, cap=11)
    word = "OMASKI"
    wx = (120 - text_width(word, 3)) // 2
    wy = 25
    for ox in range(-2, 3):
        for oy in range(-2, 3):
            if ox or oy:
                draw_text(dst, wx + ox, wy + oy, word, "k", 3)
    draw_text(dst, wx, wy, word, "g", 3)
    # A shallow notch down from the top edge of the big M, leaving its
    # middle vertex bridging the towers just below — so it reads as an M.
    mx = wx + 4 * 3
    fill_rect(dst, mx + 3, wy, mx + 6, wy + 2, "k")
    # Mountains can leak through corner gaps in the outline between
    # letters; ink over anything in the wordmark band that is not the
    # word or its outline.
    for y in range(wy - 2, wy + 5 * 3 + 2):
        for x in range(wx - 2, wx + text_width(word, 3) + 2):
            if dst[y][x] not in (".", "k", "g"):
                dst[y][x] = "k"
    return dst


# The version line and key hints are no longer baked sprites: the title
# screen draws them at runtime with game/Font.js, so they can render at the
# in-between UI text size.


# --- the yeti --------------------------------------------------------------
# A shaggy grey monster, and properly mean about it: heavy brows angled
# down into a scowl, red eyes, fangs top and bottom of the maw.

YETI_ROAR = """
.dd..........dd.
dssd.dddddd.dssd
dssddskssksddssd
dssdsrksskrsdssd
.dsdsmwmmwmsdsd.
.dsdsmmmmmmsdsd.
..ddsmwmwmmsdd..
...dssmmmmssd...
...dssssssssd...
...dsswwwwssd...
..dssswwwwsssd..
..dsswwwwwwssd..
..dsswwwwwwssd..
..dsswwwwwwssd..
..dssswwwwsssd..
...dssssssssd...
...dssdssdssd...
...dssd..dssd...
..dssd....dssd..
..dssd....dssd..
..dssd....dssd..
.dsssd....dsssd.
.dsssd....dsssd.
.ddddd....ddddd.
"""


@sprite(68)
def _yeti_roar_a():
    return place(YETI_ROAR, 16, 24)


@sprite(69)
def _yeti_roar_b():
    return place(shift_up(grid(YETI_ROAR), 1), 16, 24)


YETI_RUN_A = """
.....dddddd.....
....dssssssd....
....dskssksd....
....dsrkkrsd....
....dswmmwsd....
.dd.dsmmmmsd.dd.
dssddssssssddssd
dssssswwwwssssd.
.dsssswwwwsssd..
..dsswwwwwwsd...
..dsswwwwwwsd...
..dsswwwwwwsd...
..dssswwwwssd...
..dssssssssd....
..dssdsssdsd....
.dssd..dsssd....
dssd....dssd....
dssd.....dssd...
dssd......dssd..
.dssd......dssd.
.dsssd.....dsssd
..ddddd....ddddd
"""

YETI_RUN_B = """
.....dddddd.....
....dssssssd....
....dskssksd....
....dsrkkrsd....
....dswmmwsd....
.dd.dsmmmmsd.dd.
dssddssssssddssd
dssssswwwwssssd.
.dsssswwwwsssd..
..dsswwwwwwsd...
..dsswwwwwwsd...
..dsswwwwwwsd...
..dssswwwwssd...
..dssssssssd....
..dsdsssdssd....
..dsssd..dssd...
.dssd.....dssd..
.dssd......dssd.
dssd........dssd
dssd........dssd
dsssd......dsssd
ddddd......ddddd
"""


@sprite(70)
def _yeti_run_a():
    return place(YETI_RUN_A, 16, 24)


@sprite(71)
def _yeti_run_b():
    return place(YETI_RUN_B, 16, 24)


@sprite(72)
def _yeti_run_c():
    return place(shift_up(grid(YETI_RUN_A), 1), 16, 24)


@sprite(73)
def _yeti_run_d():
    return place(shift_up(grid(YETI_RUN_B), 1), 16, 24)


YETI_LEAP = """
...ddddddd......
..dsssssssd.dd..
.dskrsskrsddssd.
.dsssssssssdsd..
.dsmwmmwmsssd...
.dsmwmwmwsssd...
.dssmmmmssssd...
..dssssssssssd..
.ddsswwwwsssssd.
dsssswwwwssssssd
.ddsswwwwssdsssd
..dsswwwwsd.dssd
..dssswwssd..dsd
..dssssssd...dsd
.dssdssssd....dd
dssd..dsssd.....
dsd....dsssd....
dd......dssd....
.........ddd....
"""


@sprite(74)
def _yeti_leap_a():
    return place(YETI_LEAP, 16, 24)


@sprite(75)
def _yeti_leap_b():
    return place(shift_up(grid(YETI_LEAP), 2), 16, 24)


def yeti_body():
    """Standing yeti, scowling, maw wide open — the base for the meal."""
    return grid("""
.....dddddd.....
....dssssssd....
....dskssksd....
....dsrkkrsd....
....dsmmmmsd....
....dsmwwmsd....
...ddsmmmmsdd...
..dssssssssssd..
.dsssswwwwsssd..
.dsssswwwwsssd..
.dsswwwwwwwssd..
.dsswwwwwwwssd..
.dsswwwwwwwssd..
.dssswwwwwsssd..
..dsssssssssd...
..dssssssssd....
..dssdssdssd....
..dssd..dssd....
..dssd..dssd....
.dsssd..dsssd...
.dsssd..dsssd...
.ddddd..ddddd...
""")


@sprite(76)
def _yeti_grab():
    # The skier snatched, held aloft in one raised arm.
    dst = place(yeti_body(), 16, 24)
    fill_rect(dst, 12, 4, 14, 9, "s")
    blit(dst, grid("""
rr
ff
bb
bb
nn
kk
"""), 12, 0)
    return dst


def yeti_shove():
    # Headfirst into the maw: legs and ski tips thrashing above the jaws,
    # both fists clamped around them.
    dst = place(yeti_body(), 16, 24)
    blit(dst, grid("""
k..k
k..k
n..n
nnnn
bbbb
"""), 6, 0)
    fill_rect(dst, 4, 2, 6, 5, "s")
    fill_rect(dst, 10, 2, 12, 5, "s")
    return dst


@sprite(77)
def _yeti_shove_a():
    return yeti_shove()


@sprite(78)
def _yeti_shove_b():
    return shift_up(yeti_shove(), 1)


def yeti_feet():
    # Only the boots left, sticking out of the mouth. Freeze frame.
    dst = place(yeti_body(), 16, 24)
    blit(dst, grid("""
nn.nn
kk.kk
"""), 6, 4)
    blit(dst, grid("kkkk"), 11, 21)   # one dropped ski on the snow
    return dst


@sprite(79)
def _yeti_feet_a():
    return yeti_feet()


@sprite(80)
def _yeti_feet_b():
    return shift_up(yeti_feet(), 1)


@sprite(81)
def _yeti_gulp():
    # Jaws shut over the lot, cheeks bulging.
    dst = place(yeti_body(), 16, 24)
    fill_rect(dst, 5, 4, 11, 7, "s")
    fill_rect(dst, 6, 5, 10, 6, "d")
    blit(dst, grid("kkkk"), 11, 21)
    return dst


@sprite(86)
def _ski_scrap():
    art = """
k..k
.kk.
.kk.
k..k
k..k
.kk.
"""
    return place(art, 4, 6)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def load_override(sid):
    """Hand-edited pixels from the sprite editor win over the builder.

    tools/overrides/NNN.txt holds the ASCII grid saved by sprite-editor.py.
    Its size is authoritative (the editor crops to content), so it may
    differ from SIZES. Delete the file to hand the sprite back to the
    generator.
    """
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        "overrides", "%03d.txt" % sid)
    if not os.path.exists(path):
        return None
    with open(path) as fh:
        lines = [l for l in fh.read().splitlines() if l.strip()]
    if not lines or any(len(l) != len(lines[0]) for l in lines):
        raise SystemExit("override %03d is empty or ragged" % sid)
    return [list(l) for l in lines]


def sync_sizes(sizes):
    """Rewrite the SIZES table in game/Sprites.js to match the real art.

    The game anchors every sprite bottom-center from that table, so it must
    always reflect the PNGs on disk — including hand-edit overrides whose
    crop changed a sprite's dimensions.
    """
    path = os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "game", "Sprites.js")
    with open(path) as fh:
        src = fh.read()
    entries = ["%d: [%d, %d]" % (sid, w, h)
               for sid, (w, h) in sorted(sizes.items())]
    lines = []
    while entries:
        lines.append("  " + ", ".join(entries[:5]) + ("," if entries[5:] else ""))
        entries = entries[5:]
    block = "var SIZES = {\n" + "\n".join(lines) + "\n};"
    m = re.search(r"var SIZES = \{[^}]*\};", src)
    if not m:
        raise SystemExit("SIZES table not found in game/Sprites.js")
    new = src[:m.start()] + block + src[m.end():]
    if new != src:
        with open(path, "w") as fh:
            fh.write(new)


def build(outdir):
    os.makedirs(outdir, exist_ok=True)
    entries = []
    overridden = []
    actual_sizes = {}
    for sid in sorted(SIZES):
        if sid not in BUILDERS:
            raise SystemExit("no builder for sprite %d" % sid)
        rows = load_override(sid)
        if rows is not None:
            overridden.append(sid)
        else:
            rows = BUILDERS[sid]()
            w, h = SIZES[sid]
            if len(rows[0]) != w or len(rows) != h:
                raise SystemExit("sprite %d is %dx%d, expected %dx%d"
                                 % (sid, len(rows[0]), len(rows), w, h))
        actual_sizes[sid] = (len(rows[0]), len(rows))
        write_png(os.path.join(outdir, "%03d.png" % sid), rows)
        name = BUILDERS[sid].__name__.lstrip("_")
        entries.append(('"%03d %s": %s'
                        % (sid, name,
                           json.dumps("\n".join("".join(r) for r in rows)))))
    # Feed the sprite dropdown in sprite-editor.html: file:// pages cannot
    # read the sprites directory, but they can include a script.
    data_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "sprite-data.js")
    with open(data_path, "w") as fh:
        fh.write("// generated by make-sprites.py - do not edit\n")
        fh.write("const SPRITE_DATA = {\n  ")
        fh.write(",\n  ".join(entries))
        fh.write("\n};\n")
    sync_sizes(actual_sizes)
    with open(os.path.join(outdir, ".stamp"), "w") as fh:
        fh.write("%d\n" % len(SIZES))
    print("wrote %d sprites to %s" % (len(SIZES), outdir))
    if overridden:
        print("hand-edit overrides applied: %s"
              % ", ".join("%03d" % s for s in overridden))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    default_out = os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "assets", "sprites")
    parser.add_argument("-o", "--outdir", default=default_out)
    args = parser.parse_args()
    build(args.outdir)


if __name__ == "__main__":
    main()
