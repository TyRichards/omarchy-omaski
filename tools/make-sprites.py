#!/usr/bin/env python3
"""Render Omarski's original sprite set, in a PICO-8 flavoured style.

Every sprite in assets/sprites/ is generated from the pixel grids and drawing
code in this file. The artwork is original to this project — drawn for
Omarski in a minimalist fantasy-console style, using the 16-colour PICO-8
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
import os
import struct
import zlib

# ---------------------------------------------------------------------------
# Palette: the 16 PICO-8 colours, one character each
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
    1: (8, 16), 2: (8, 16), 3: (12, 14), 4: (12, 14), 5: (8, 16),
    6: (12, 14), 7: (12, 14), 8: (12, 14), 9: (12, 14), 10: (12, 14),
    11: (12, 14), 12: (16, 16), 13: (16, 12), 14: (16, 16), 15: (14, 16),
    16: (14, 16), 17: (14, 17), 18: (16, 13), 19: (16, 16), 20: (16, 12),
    21: (13, 16), 22: (13, 16), 23: (6, 12), 24: (6, 12), 25: (6, 12),
    26: (6, 12), 27: (32, 16), 28: (12, 15), 29: (11, 15), 30: (11, 15),
    31: (12, 12), 32: (12, 12), 33: (11, 8), 34: (11, 8), 35: (10, 10),
    36: (10, 10), 37: (13, 15), 38: (10, 15), 39: (13, 16), 40: (15, 15),
    41: (16, 16), 42: (16, 16), 43: (13, 15), 44: (15, 13), 45: (12, 6),
    46: (8, 6), 47: (8, 3), 48: (12, 4), 49: (14, 16), 50: (11, 14),
    51: (16, 32), 52: (16, 5), 53: (96, 48), 54: (44, 7), 55: (72, 14),
    56: (44, 22), 57: (22, 14), 58: (24, 15), 59: (26, 15), 60: (28, 15),
    61: (27, 18), 62: (29, 18), 63: (25, 18), 64: (12, 32), 65: (13, 16),
    66: (13, 16), 67: (13, 16), 68: (16, 24), 69: (16, 24), 70: (16, 24),
    71: (16, 24), 72: (16, 24), 73: (16, 24), 74: (16, 24), 75: (16, 24),
    76: (16, 24), 77: (16, 24), 78: (16, 24), 79: (16, 24), 80: (16, 24),
    81: (16, 24), 82: (8, 4), 83: (11, 14), 84: (11, 14), 85: (11, 14),
    86: (4, 6), 87: (14, 16), 88: (14, 16), 89: (14, 16),
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


# ---------------------------------------------------------------------------
# A tiny 3x5 pixel font for signs and banners
# ---------------------------------------------------------------------------

FONT = {
    "A": ".#. #.# ### #.# #.#", "B": "##. #.# ##. #.# ##.",
    "C": ".## #.. #.. #.. .##", "D": "##. #.# #.# #.# ##.",
    "E": "### #.. ##. #.. ###", "F": "### #.. ##. #.. #..",
    "G": ".## #.. #.# #.# .##", "H": "#.# #.# ### #.# #.#",
    "I": "### .#. .#. .#. ###", "J": "..# ..# ..# #.# .#.",
    "K": "#.# #.# ##. #.# #.#", "L": "#.. #.. #.. #.. ###",
    "M": "#.# ### ### #.# #.#", "N": "##. #.# #.# #.# #.#",
    "O": ".#. #.# #.# #.# .#.", "P": "##. #.# ##. #.. #..",
    "Q": ".#. #.# #.# ### .##", "R": "##. #.# ##. #.# #.#",
    "S": ".## #.. .#. ..# ##.", "T": "### .#. .#. .#. .#.",
    "U": "#.# #.# #.# #.# ###", "V": "#.# #.# #.# #.# .#.",
    "W": "#.# #.# ### ### #.#", "X": "#.# #.# .#. #.# #.#",
    "Y": "#.# #.# .#. .#. .#.", "Z": "### ..# .#. #.. ###",
    "0": ".#. #.# #.# #.# .#.", "1": ".#. ##. .#. .#. ###",
    "2": "##. ..# .#. #.. ###", "3": "### ..# .#. ..# ###",
    "4": "#.# #.# ### ..# ..#", "5": "### #.. ##. ..# ##.",
    "6": ".## #.. ### #.# ###", "7": "### ..# .#. .#. .#.",
    "8": "### #.# ### #.# ###", "9": "### #.# ### ..# ##.",
    "(": ".# #. #. #. .#", ")": "#. .# .# .# #.",
    "-": "... ... ### ... ...", "=": "... ### ... ### ...",
    ".": ". . . . #", "!": "# # # . #", ":": ". # . # .",
    "/": "..# ..# .#. #.. #..", " ": ".. .. .. .. ..",
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


def sign(w, h, lines, post_h=4, scale=1, board="w", ink="k"):
    """A bordered signboard on two posts, with centred lines of text."""
    dst = canvas(w, h)
    bh = h - post_h
    fill_rect(dst, 0, 0, w, bh, board)
    for x in range(w):
        dst[0][x] = "k"
        dst[bh - 1][x] = "k"
    for y in range(bh):
        dst[y][0] = "k"
        dst[y][w - 1] = "k"
    fill_rect(dst, 2, bh, 4, h, "B")
    fill_rect(dst, w - 4, bh, w - 2, h, "B")
    line_h = 5 * scale + 2
    total = len(lines) * line_h - 2
    y = max(2, (bh - total) // 2)
    for ln in lines:
        draw_text(dst, (w - text_width(ln, scale)) // 2, y, ln, ink, scale)
        y += line_h
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
# Red cap, blue jacket, dark-blue trousers, black skis, grey poles.

SKIER_DOWN = """
..rrrr..
..rrrr..
..ffff..
.bbbbbb.
d.bbbb.d
d.bbbb.d
d.bbbb.d
d..bb..d
...nn...
..nnnn..
..n..n..
..n..n..
..k..k..
..k..k..
..k..k..
..k..k..
"""


@sprite(1)
def _skier_down():
    return place(SKIER_DOWN, 8, 16)


SKIER_DIAG_R = """
...rrrr.
...rrrr.
...ffff.
..bbbbb.
.d.bbbb.
.d.bbbbd
.d.bbb.d
.d..bb.d
...nnn..
..nnnn..
..n..nn.
.nn...n.
.k....k.
..k....k
..k....k
...k...k
"""


@sprite(2)
def _skier_diag_r():
    return place(SKIER_DIAG_R, 8, 16)


@sprite(5)
def _skier_diag_l():
    return mirror(place(SKIER_DIAG_R, 8, 16))


SKIER_TRAV_R = """
....rrrr....
....rrff....
...bbbbb....
.d.bbbbb.d..
.d.bbbbb.d..
.d.bbbbb.d..
.d..bbb..d..
....nnn.....
...nnnnn....
...nn.nn....
...nn.nn....
..knnk.nk...
kkkkkkkkkkkk
.kkkkkkkkkk.
"""


@sprite(3)
def _skier_trav_r():
    return place(SKIER_TRAV_R, 12, 14)


@sprite(6)
def _skier_trav_l():
    return mirror(place(SKIER_TRAV_R, 12, 14))


SKIER_SIDE_R = """
....rrrr....
....rrff....
....bbbb....
..d.bbbb.d..
..d.bbbb.d..
..d.bbbb.d..
..d..bb..d..
....nnn.....
...nnnnn....
...nn.nn....
...nn.nn....
...knnkk....
kkkkkkkkkkkk
.kkkkkkkkkk.
"""


@sprite(4)
def _skier_side_r():
    return place(SKIER_SIDE_R, 12, 14)


@sprite(7)
def _skier_side_l():
    return mirror(place(SKIER_SIDE_R, 12, 14))


SKIER_STEP_L = """
....rrrr....
....ffrr....
....bbbb....
..d.bbbb.d..
..d.bbbb.d..
..d.bbbb.d..
..d..bb..d..
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
    return place(SKIER_STEP_L, 12, 14)


@sprite(9)
def _skier_step_r():
    return mirror(place(SKIER_STEP_L, 12, 14))


SKIER_CLIMB_L = """
....rrrr....
....ffrr....
....bbbb....
..d.bbbb.d..
..d.bbbb.d..
..d.bbbb.d..
..d..bb..d..
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
    return place(SKIER_CLIMB_L, 12, 14)


@sprite(11)
def _skier_climb_r():
    return mirror(place(SKIER_CLIMB_L, 12, 14))


# --- crashes ---------------------------------------------------------------


@sprite(12)
def _crash_ouch():
    star = """
.......yy.......
.y.....yy.....y.
.yy...yyyy...yy.
..yy..yyyy..yy..
...yyyyyyyyyy...
..yyyyyyyyyyyy..
.yyyyyyyyyyyyyy.
yyyyyyyyyyyyyyyy
yyyyyyyyyyyyyyyy
.yyyyyyyyyyyyyy.
..yyyyyyyyyyyy..
...yyyyyyyyyy...
..yy..yyyy..yy..
.yy...yyyy...yy.
.y.....yy.....y.
.......yy.......
"""
    dst = place(star, 16, 16, anchor="center")
    dst = rim(dst, "y", "r")
    draw_text(dst, 4, 6, "OW!", "k")
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


CRASH_SIT = """
.....rrrr.......
.....ffrr.......
....bbbbb.......
...bbbbbbb.d....
....bbbbb..d....
...nnnnnnn.d....
..nnnnnnnnnd....
.kk.nnnnn.kk....
kkk.w..w..kkk...
.k..ww.ww..k....
"""


@sprite(13)
def _crash_sit():
    return place(CRASH_SIT, 16, 12)


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
.....rrrr....
.....ffrr....
.....bbbb....
...d.bbbb....
...d.bbbb.d..
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

JUMP_LOW = """
.....rrrr.......
.....rrrr.......
.....ffff.......
.d..bbbbbb..d...
..d.bbbbbb.d....
..d.bbbbbb.d....
...dbbbbbd......
....nnnn........
...nnnnnn.......
...nn..nn.......
..knnk.knnk.....
.kkkkkkkkkkkkk..
kkkkkkkkkkkkk...
"""


@sprite(14)
def _jump_low():
    return place(JUMP_LOW, 16, 16, anchor="center")


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


# --- slalom flags and gate markers ----------------------------------------


@sprite(23)
def _flag_left():
    art = """
rrrr..
rrrrk.
.rrkk.
...kk.
...kk.
...kk.
...kk.
...kk.
...kk.
...kk.
..dkkd
"""
    return place(art, 6, 12)


@sprite(24)
def _flag_right():
    return mirror(_flag_left())


def gate_face(colour, happy):
    dst = canvas(6, 12)
    fill_rect(dst, 2, 5, 4, 12, "d")
    fill_rect(dst, 0, 0, 6, 6, colour)
    dst[0][0] = dst[0][5] = dst[5][0] = dst[5][5] = "."
    dst[1][1] = dst[1][4] = "k"
    if happy:
        dst[3][1] = dst[4][2] = dst[4][3] = dst[3][4] = "k"
    else:
        dst[4][1] = dst[3][2] = dst[3][3] = dst[4][4] = "k"
    return dst


@sprite(25)
def _gate_green():
    return gate_face("g", True)


@sprite(26)
def _gate_red():
    return gate_face("r", False)


# --- scenery ---------------------------------------------------------------


@sprite(27)
def _cloud():
    dst = canvas(32, 16)
    for cx, cy, rx, ry in ((9, 10, 7, 4), (17, 7, 8, 5), (24, 10, 6, 4)):
        ellipse(dst, cx, cy, rx, ry, "s")
    for cx, cy, rx, ry in ((9, 9, 5, 3), (17, 6, 6, 4), (23, 9, 4, 3)):
        ellipse(dst, cx, cy, rx, ry, "w")
    return dst


TREE = """
......ww......
......gg......
.....gggg.....
.....ggge.....
....ggggee....
....gggeee....
...gggggeee...
...ggggeeee...
..gggggeeeee..
..ggggeeeeee..
.gggggeeeeeee.
.ggggggeeeeee.
......BB......
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


TREE_BIG = """
.......ww.......
.......gg.......
......gggg......
......ggge......
.....gggeee.....
.....ggggee.....
....gggggeee....
....ggggeeee....
.....gggeee.....
....ggggeeee....
...gggggeeeee...
...ggggeeeeee...
..gggggeeeeeee..
.....ggggeee....
....gggggeeee...
...ggggggeeeee..
..gggggggeeeeee.
..ggggggeeeeeee.
.gggggggeeeeeeee
.ggggggggeeeeeee
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
    for x, y, ch in ((6, 4, a), (8, 7, b), (4, 9, c), (9, 11, a), (3, 12, b)):
        if dst[y][x] != ".":
            dst[y][x] = ch
    dst[1][6] = dst[1][7] = "y"
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
    art = """
......rrrr......
...rrrbbbbbb....
..bbbggggggggg..
.gggyyyyyyyyyyy.
wwwwwwwwwwwwwwww
"""
    return place(art, 16, 5)


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


@sprite(64)
def _lift_tower():
    dst = canvas(12, 32)
    fill_rect(dst, 0, 1, 12, 2, "d")            # crossarm
    fill_rect(dst, 1, 0, 2, 3, "s")             # sheaves
    fill_rect(dst, 10, 0, 11, 3, "s")
    for y in range(2, 30):                       # lattice mast
        dst[y][5] = dst[y][6] = "s" if y % 3 else "d"
    fill_rect(dst, 3, 30, 9, 32, "d")            # footing
    return dst


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
# The rival skier wears orange; the boarder pink with a yellow board.

SKIER2_DOWN = """
...yyyy...
...ffff...
..oooooo..
.d.oooo.d.
.d.oooo.d.
.d.oooo.d.
....vv....
...vvvv...
...v..v...
...v..v...
...k..k...
...k..k...
...k..k...
...k..k...
"""


@sprite(28)
def _skier2_down():
    return place(SKIER2_DOWN, 12, 15)


SKIER2_DIAG_L = """
...yyyy....
...ffff....
..oooooo...
.d.oooo.d..
.d.oooo.d..
.d.oooo.d..
....vvv....
...vvvv....
...vv.v....
..vv..v....
..k...k....
.k...k.....
.k...k.....
k...k......
"""


@sprite(29)
def _skier2_diag_l():
    return place(SKIER2_DIAG_L, 11, 15)


@sprite(30)
def _skier2_diag_r():
    return place(mirror(grid(SKIER2_DIAG_L)), 11, 15)


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
    return place(SKIER2_CRASH, 12, 12)


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
    return place(SKIER2_SPRAWL, 12, 12)


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
    return place(DOG_A, 11, 8)


@sprite(34)
def _dog_b():
    return place(DOG_B, 11, 8)


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
    return place(DOG_BARK, 10, 10)


@sprite(36)
def _dog_bark_b():
    art = remap(grid(DOG_BARK), {"w": "s"})
    return place(shift_up(art, 1), 10, 10)


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
    return boarder(13, 15, -1)


@sprite(38)
def _boarder_b():
    return boarder(10, 15, 0)


@sprite(39)
def _boarder_c():
    return boarder(13, 16, 1)


@sprite(40)
def _boarder_d():
    dst = boarder(15, 15, 0)
    fill_rect(dst, 1, 10, 4, 11, "y")   # board grabbed sideways
    return dst


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
    return boarder_crash(16, 16, False)


@sprite(42)
def _boarder_crash_b():
    return boarder_crash(16, 16, True)


@sprite(43)
def _boarder_crash_c():
    return boarder_crash(13, 15, False)


@sprite(44)
def _boarder_crash_d():
    return boarder_crash(15, 13, True)


# --- signage ---------------------------------------------------------------


def peak(dst, apex_x, apex_y, height, cap=4):
    """A snow-capped mountain: grey triangle, white for the top `cap` rows."""
    for j in range(height):
        colour = "w" if j < cap else "s"
        blit(dst, [[colour] * (2 * j + 1)], apex_x - j, apex_y + j)


@sprite(53)
def _logo():
    dst = canvas(96, 48)
    peak(dst, 30, 2, 14)
    peak(dst, 62, 5, 11)
    draw_text(dst, (96 - text_width("OMARSKI", 2)) // 2, 17, "OMARSKI", "n", 2)
    fill_rect(dst, 20, 29, 76, 30, "r")
    draw_text(dst, (96 - text_width("A FREE OMARCHY GAME", 1)) // 2, 33,
              "A FREE OMARCHY GAME", "k", 1)
    draw_text(dst, (96 - text_width("SKI FAST. AVOID THE YETI.", 1)) // 2, 41,
              "SKI FAST. AVOID THE YETI.", "d", 1)
    return dst


@sprite(54)
def _version():
    dst = canvas(44, 7)
    draw_text(dst, 0, 1, "VERSION 3.0", "k")
    return dst


@sprite(55)
def _hint_numpad():
    dst = canvas(72, 14)
    draw_text(dst, (72 - text_width("USE NUMPAD (0-9)", 1)) // 2, 1,
              "USE NUMPAD (0-9)", "k")
    draw_text(dst, (72 - text_width("FOR BETTER CONTROL", 1)) // 2, 8,
              "FOR BETTER CONTROL", "k")
    return dst


@sprite(56)
def _hint_keys():
    dst = canvas(44, 22)
    draw_text(dst, (44 - text_width("F2 = RESTART", 1)) // 2, 1,
              "F2 = RESTART", "k")
    draw_text(dst, (44 - text_width("F3 = PAUSE", 1)) // 2, 8, "F3 = PAUSE", "k")
    draw_text(dst, (44 - text_width("F = FAST", 1)) // 2, 15, "F = FAST", "k")
    return dst


@sprite(57)
def _sign_start_r():
    dst = canvas(22, 14)
    fill_rect(dst, 14, 1, 16, 14, "B")
    blit(dst, grid("""
gggggg
ggggk.
.ggk..
..k...
"""), 16, 1)
    blit(dst, sign(14, 11, ["GO!"], post_h=3), 0, 3)
    return dst


@sprite(58)
def _sign_start_l():
    return blit(canvas(24, 15), sign(24, 15, ["START"], post_h=4), 0, 0)


@sprite(59)
def _sign_finish_r():
    dst = canvas(26, 15)
    fill_rect(dst, 18, 0, 20, 15, "B")
    for j in range(6):
        for i in range(6):
            dst[j][20 + i] = "k" if (i // 2 + j // 2) % 2 == 0 else "w"
    blit(dst, sign(18, 11, ["DONE!"], post_h=3), 0, 4)
    return dst


@sprite(60)
def _sign_finish_l():
    return blit(canvas(28, 15), sign(28, 15, ["FINISH"], post_h=4), 0, 0)


@sprite(61)
def _sign_slalom():
    return sign(27, 18, ["SLALOM"], post_h=5)


@sprite(62)
def _sign_tree_slalom():
    return sign(29, 18, ["TREE", "SLALOM"], post_h=5)


@sprite(63)
def _sign_freestyle():
    return sign(25, 18, ["FREE", "STYLE"], post_h=5)


# --- the yeti --------------------------------------------------------------
# A shaggy grey monster with a pink maw, outlined so he reads on the snow.

YETI_ROAR = """
.dd..........dd.
dssd.dddddd.dssd
dssddssssssddssd
dssdskwsskwsdssd
.dsdssssssssdsd.
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
....dkwsskwd....
....dssssssd....
....dsmmmmsd....
.dd.dssmmssd.dd.
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
....dkwsskwd....
....dssssssd....
....dsmmmmsd....
.dd.dssmmssd.dd.
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
.dskwsskwsddssd.
.dsssssssssdsd..
.dsmmmmmmsssd...
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
    """Standing yeti with an open maw, the base for the eating frames."""
    return grid("""
.....dddddd.....
....dssssssd....
....dkwsskwd....
....dssssssd....
....dsmmmmsd....
....dsmmmmsd....
...ddssmmssdd...
..dsssssssssgd..
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
def _yeti_eat_a():
    # The skier held aloft in one raised arm.
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


@sprite(77)
def _yeti_eat_b():
    # Lowered to the mouth.
    dst = place(yeti_body(), 16, 24)
    blit(dst, grid("""
rr
bb
nn
"""), 8, 6)
    return dst


@sprite(78)
def _yeti_eat_c():
    # Legs sticking out of the jaws.
    dst = place(yeti_body(), 16, 24)
    blit(dst, grid("""
n.n
n.n
k.k
"""), 7, 7)
    return dst


@sprite(79)
def _yeti_eat_d():
    # Swallowed: a belly bulge and a dropped ski.
    dst = place(yeti_body(), 16, 24)
    fill_rect(dst, 6, 14, 11, 16, "s")
    blit(dst, grid("kkkk"), 12, 20)
    return dst


@sprite(80)
def _yeti_chew():
    dst = place(yeti_body(), 16, 24)
    # Mouth shut, contented: fur over the maw and a thin smile.
    fill_rect(dst, 5, 4, 11, 7, "s")
    fill_rect(dst, 6, 5, 10, 6, "d")
    return dst


@sprite(81)
def _yeti_burp():
    dst = place(yeti_body(), 16, 24)
    # Maw wide open, one ski flung clear.
    fill_rect(dst, 5, 3, 11, 7, "m")
    fill_rect(dst, 6, 4, 10, 6, "v")
    blit(dst, grid("""
..kk
.kk.
kk..
"""), 12, 1)
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


def build(outdir):
    os.makedirs(outdir, exist_ok=True)
    for sid in sorted(SIZES):
        if sid not in BUILDERS:
            raise SystemExit("no builder for sprite %d" % sid)
        rows = BUILDERS[sid]()
        w, h = SIZES[sid]
        if len(rows[0]) != w or len(rows) != h:
            raise SystemExit("sprite %d is %dx%d, expected %dx%d"
                             % (sid, len(rows[0]), len(rows), w, h))
        write_png(os.path.join(outdir, "%03d.png" % sid), rows)
    print("wrote %d sprites to %s" % (len(SIZES), outdir))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    default_out = os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "assets", "sprites")
    parser.add_argument("-o", "--outdir", default=default_out)
    args = parser.parse_args()
    build(args.outdir)


if __name__ == "__main__":
    main()
