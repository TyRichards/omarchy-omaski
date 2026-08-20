#!/usr/bin/env python3
"""
Omarski sprite bootstrap.

Downloads the official 32-bit SkiFree build (v1.04) published by its author,
Chris Pirih, at https://ski.ihoc.net/ and extracts the 89 original device
independent bitmaps from its PE resource section into transparent PNG files.

Nothing copyrighted is redistributed with this plugin: the artwork is fetched
from the author's own site on first run and cached locally, exactly like a
game that asks you to point it at your original data files.

Requires only the Python 3 standard library.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import os
import struct
import sys
import tempfile
import urllib.request
import zipfile
import zlib
from collections import deque
from pathlib import Path

ZIP_URL = "https://ski.ihoc.net/ski32.zip"
EXE_URL = "https://ski.ihoc.net/ski32.exe"

# Known-good digests for the author's published binaries. Used as an integrity
# hint only: an unexpected digest warns but still extracts, since Pirih has
# recompiled the game more than once (see the "ANTIVIRUS WARNINGS" note on his
# site) and a future rebuild should not brick the plugin.
KNOWN_EXE_SHA256 = {
    "3572d3757638bc1ae388c3d007ba59ba1f370911901e2a35d2f1297e8cf0ff35": "ski32.exe v1.04 (2005 build)",
}

EXPECTED_SPRITES = 89
USER_AGENT = "Omarski/1.0 (+https://github.com/tyrichards/omarski)"


# --------------------------------------------------------------------------- #
# PE resource parsing
# --------------------------------------------------------------------------- #

RT_BITMAP = 2


class PEFile:
    """Just enough PE parsing to walk the .rsrc directory tree."""

    def __init__(self, data: bytes):
        self.data = data
        if data[:2] != b"MZ":
            raise ValueError("not a DOS/PE image")
        pe_off = struct.unpack_from("<I", data, 0x3C)[0]
        if data[pe_off:pe_off + 4] != b"PE\0\0":
            raise ValueError("missing PE signature (16-bit NE image?)")

        coff = pe_off + 4
        n_sections = struct.unpack_from("<H", data, coff + 2)[0]
        opt_size = struct.unpack_from("<H", data, coff + 16)[0]
        opt = coff + 20
        magic = struct.unpack_from("<H", data, opt)[0]
        # PE32 keeps 16 data directories at +96, PE32+ at +112.
        data_dirs = opt + (96 if magic == 0x10B else 112)

        self.sections = []
        sec_off = opt + opt_size
        for i in range(n_sections):
            base = sec_off + 40 * i
            v_size, v_addr, r_size, r_addr = struct.unpack_from("<IIII", data, base + 8)
            self.sections.append((v_addr, max(v_size, r_size), r_addr))

        self.rsrc_rva = struct.unpack_from("<I", data, data_dirs + 2 * 8)[0]
        if not self.rsrc_rva:
            raise ValueError("image has no resource directory")

    def rva_to_offset(self, rva: int) -> int:
        for v_addr, v_size, r_addr in self.sections:
            if v_addr <= rva < v_addr + v_size:
                return r_addr + (rva - v_addr)
        raise ValueError(f"RVA {rva:#x} is outside every section")

    def resources_of_type(self, want_type: int) -> dict[int, bytes]:
        data = self.data
        root = self.rva_to_offset(self.rsrc_rva)
        found: dict[int, bytes] = {}

        def walk(node: int, path: list[int]) -> None:
            n_named, n_id = struct.unpack_from("<HH", data, node + 12)
            for i in range(n_named + n_id):
                entry = node + 16 + 8 * i
                name, child = struct.unpack_from("<II", data, entry)
                if child & 0x80000000:
                    walk(root + (child & 0x7FFFFFFF), path + [name])
                    continue
                rva, size = struct.unpack_from("<II", data, root + child)
                # path == [type, name, language]
                if path and path[0] == want_type and len(path) >= 2:
                    res_id = path[1] & 0x7FFFFFFF
                    if res_id not in found:
                        start = self.rva_to_offset(rva)
                        found[res_id] = data[start:start + size]

        walk(root, [])
        return found


# --------------------------------------------------------------------------- #
# DIB decoding
# --------------------------------------------------------------------------- #

def decode_dib(blob: bytes) -> tuple[int, int, list[list[tuple[int, int, int]]]]:
    """Decode an RT_BITMAP payload (a DIB with no BITMAPFILEHEADER)."""
    header_size = struct.unpack_from("<I", blob, 0)[0]

    if header_size < 40:  # BITMAPCOREHEADER
        width, height = struct.unpack_from("<hh", blob, 4)
        bpp = struct.unpack_from("<H", blob, 10)[0]
        palette_entry = 3
        n_colors = 1 << bpp if bpp <= 8 else 0
        compression = 0
    else:  # BITMAPINFOHEADER or later
        width, height, _planes, bpp = struct.unpack_from("<iiHH", blob, 4)
        compression = struct.unpack_from("<I", blob, 16)[0]
        colors_used = struct.unpack_from("<I", blob, 32)[0]
        palette_entry = 4
        n_colors = colors_used or (1 << bpp if bpp <= 8 else 0)

    if compression != 0:
        raise ValueError(f"compressed DIB (BI_{compression}) is unsupported")

    bottom_up = height > 0
    height = abs(height)

    palette = []
    for i in range(n_colors):
        off = header_size + i * palette_entry
        b, g, r = blob[off], blob[off + 1], blob[off + 2]
        palette.append((r, g, b))

    pixel_start = header_size + n_colors * palette_entry
    stride = ((width * bpp + 31) // 32) * 4

    rows: list[list[tuple[int, int, int]]] = [[] for _ in range(height)]
    for row in range(height):
        y = height - 1 - row if bottom_up else row
        base = pixel_start + row * stride
        line = rows[y]
        for x in range(width):
            if bpp == 8:
                line.append(palette[blob[base + x]])
            elif bpp == 4:
                byte = blob[base + (x >> 1)]
                idx = (byte >> 4) if (x & 1) == 0 else (byte & 0x0F)
                line.append(palette[idx])
            elif bpp == 1:
                byte = blob[base + (x >> 3)]
                line.append(palette[(byte >> (7 - (x & 7))) & 1])
            elif bpp == 24:
                off = base + x * 3
                line.append((blob[off + 2], blob[off + 1], blob[off]))
            elif bpp == 32:
                off = base + x * 4
                line.append((blob[off + 2], blob[off + 1], blob[off]))
            else:
                raise ValueError(f"unsupported bit depth {bpp}")
    return width, height, rows


def alpha_mask(width: int, height: int,
               rows: list[list[tuple[int, int, int]]]) -> list[list[int]]:
    """
    Flood fill white from the sprite border to build a transparency mask.

    SkiFree blits opaque rectangles onto an all-white slope, so the original
    art has no alpha channel. Only clearing border-connected white keeps
    interior whites (the yeti's eyes, mogul highlights) intact.
    """
    alpha = [[255] * width for _ in range(height)]
    seen = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        if 0 <= x < width and 0 <= y < height and not seen[y][x]:
            seen[y][x] = True
            if rows[y][x] == (255, 255, 255):
                alpha[y][x] = 0
                queue.append((x, y))

    for x in range(width):
        push(x, 0)
        push(x, height - 1)
    for y in range(height):
        push(0, y)
        push(width - 1, y)

    while queue:
        x, y = queue.popleft()
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)

    return alpha


# --------------------------------------------------------------------------- #
# PNG encoding
# --------------------------------------------------------------------------- #

def write_png(path: Path, width: int, height: int,
              rows: list[list[tuple[int, int, int]]],
              alpha: list[list[int]]) -> None:
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0 (None)
        row, arow = rows[y], alpha[y]
        for x in range(width):
            r, g, b = row[x]
            raw += bytes((r, g, b, arow[x]))

    def chunk(tag: bytes, payload: bytes) -> bytes:
        return (struct.pack(">I", len(payload)) + tag + payload
                + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")

    tmp = path.with_suffix(".png.tmp")
    tmp.write_bytes(png)
    tmp.replace(path)


# --------------------------------------------------------------------------- #
# Fetching
# --------------------------------------------------------------------------- #

def fetch(url: str, timeout: int) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def acquire_exe(source: str | None, timeout: int) -> bytes:
    if source:
        blob = Path(source).read_bytes()
        return unwrap_zip(blob) if blob[:2] == b"PK" else blob

    errors = []
    for url in (ZIP_URL, EXE_URL):
        try:
            print(f"omarski: fetching {url}", file=sys.stderr)
            blob = fetch(url, timeout)
            return unwrap_zip(blob) if blob[:2] == b"PK" else blob
        except Exception as exc:  # noqa: BLE001 - report and try the next URL
            errors.append(f"  {url}: {exc}")
    raise SystemExit("omarski: could not download SkiFree:\n" + "\n".join(errors))


def unwrap_zip(blob: bytes) -> bytes:
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        names = [n for n in archive.namelist() if n.lower().endswith(".exe")]
        if not names:
            raise ValueError("archive contains no .exe")
        return archive.read(names[0])


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #

def main() -> int:
    default_dir = Path(
        os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")
    ) / "omarski" / "sprites"

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-o", "--out", type=Path, default=default_dir,
                        help=f"output directory (default: {default_dir})")
    parser.add_argument("-s", "--source",
                        help="use a local ski32.exe/ski32.zip instead of downloading")
    parser.add_argument("-t", "--timeout", type=int, default=30,
                        help="network timeout in seconds (default: 30)")
    parser.add_argument("-f", "--force", action="store_true",
                        help="re-extract even if the cache looks complete")
    args = parser.parse_args()

    out: Path = args.out
    stamp = out / ".complete"

    if stamp.exists() and not args.force:
        have = len(list(out.glob("[0-9][0-9][0-9].png")))
        if have >= EXPECTED_SPRITES:
            print(f"omarski: {have} sprites already cached in {out}")
            return 0

    exe = acquire_exe(args.source, args.timeout)
    digest = hashlib.sha256(exe).hexdigest()
    if digest in KNOWN_EXE_SHA256:
        print(f"omarski: verified {KNOWN_EXE_SHA256[digest]}")
    else:
        print(f"omarski: warning - unrecognised build (sha256 {digest})", file=sys.stderr)

    bitmaps = PEFile(exe).resources_of_type(RT_BITMAP)
    if not bitmaps:
        raise SystemExit("omarski: no RT_BITMAP resources found")

    out.mkdir(parents=True, exist_ok=True)
    written = 0
    for res_id in sorted(bitmaps):
        try:
            width, height, rows = decode_dib(bitmaps[res_id])
            write_png(out / f"{res_id:03d}.png", width, height,
                      rows, alpha_mask(width, height, rows))
            written += 1
        except Exception as exc:  # noqa: BLE001 - skip only the bad sprite
            print(f"omarski: skipped bitmap {res_id}: {exc}", file=sys.stderr)

    if written < EXPECTED_SPRITES:
        raise SystemExit(
            f"omarski: only extracted {written}/{EXPECTED_SPRITES} sprites"
        )

    stamp.write_text(f"{digest}\n{written}\n")
    print(f"omarski: extracted {written} sprites to {out}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        sys.exit(130)
