#!/usr/bin/env python3
"""Local server for the Omarski sprite editor.

Serves sprite-editor.html plus a tiny API:
  GET  /api/ping     - liveness check for the launcher
  GET  /api/sprites  - every sprite as ASCII art, with name and group
  POST /api/save     - {id, art}: write tools/overrides/NNN.txt and the
                       live assets/sprites/NNN.png, then refresh the game
  POST /api/revert   - {id}: drop the override, regenerate from the builder

Overrides are the hand-edited source of truth: make-sprites.py applies them
over its generated art, so regenerating never clobbers editor work.
"""
import argparse
import importlib.util
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOOLS = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.dirname(TOOLS)
OVERRIDES = os.path.join(TOOLS, "overrides")
SPRITES_DIR = os.path.join(PLUGIN, "assets", "sprites")
REFRESH = os.path.join(TOOLS, "refresh-window.sh")


def load_generator():
    spec = importlib.util.spec_from_file_location(
        "make_sprites", os.path.join(TOOLS, "make-sprites.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


GEN = load_generator()

# Dropdown folders, in display order; first prefix match wins.
GROUPS = [
    ("Skier", ("skier_", "jump_", "crash_", "getting_up_", "ski_scrap")),
    ("Rival skiers", ("skier2_",)),
    ("Snowboarders", ("boarder_",)),
    ("Dogs", ("dog_",)),
    ("Deer", ("deer_",)),
    ("Yeti", ("yeti_",)),
    ("Trees", ("tree", "xmas_", "burnt_", "stump")),
    ("Terrain", ("rock", "mogul_", "ramp", "snow_patch")),
    ("Ski lift", ("lift_", "chair_")),
    ("Title & sky", ("logo", "cloud")),
]


def group_of(name):
    for label, prefixes in GROUPS:
        if any(name.startswith(p) for p in prefixes):
            return label
    return "Other"


def override_path(sid):
    return os.path.join(OVERRIDES, "%03d.txt" % sid)


def sprite_art(sid):
    path = override_path(sid)
    if os.path.exists(path):
        with open(path) as fh:
            return fh.read().strip("\n"), True
    rows = GEN.BUILDERS[sid]()
    return "\n".join("".join(r) for r in rows), False


def catalog():
    out = []
    for sid in sorted(GEN.SIZES):
        name = GEN.BUILDERS[sid].__name__.lstrip("_")
        art, edited = sprite_art(sid)
        out.append({"id": sid, "name": name, "group": group_of(name),
                    "art": art, "edited": edited})
    return {"groups": [g for g, _ in GROUPS] + ["Other"], "sprites": out}


def validate(sid, art):
    if sid not in GEN.SIZES:
        return None, "unknown sprite id %r" % (sid,)
    w, h = GEN.SIZES[sid]
    lines = [l for l in art.splitlines() if l.strip()]
    if len(lines) != h or any(len(l) != w for l in lines):
        return None, "sprite %03d must stay %dx%d" % (sid, w, h)
    ok = set(GEN.PALETTE) | {"."}
    bad = set("".join(lines)) - ok
    if bad:
        return None, "unknown palette chars: %s" % "".join(sorted(bad))
    return [list(l) for l in lines], None


def refresh_game():
    if os.path.exists(REFRESH):
        subprocess.Popen([REFRESH], stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            with open(os.path.join(TOOLS, "sprite-editor.html"), "rb") as fh:
                self.send(200, fh.read(), "text/html; charset=utf-8")
        elif self.path == "/api/ping":
            self.send(200, {"ok": True})
        elif self.path == "/api/sprites":
            self.send(200, catalog())
        else:
            self.send(404, {"error": "not found"})

    def payload(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n) or b"{}")

    def do_POST(self):
        try:
            body = self.payload()
        except (ValueError, json.JSONDecodeError):
            self.send(400, {"error": "bad json"})
            return
        sid = body.get("id")
        if self.path == "/api/save":
            rows, err = validate(sid, body.get("art", ""))
            if err:
                self.send(400, {"error": err})
                return
            os.makedirs(OVERRIDES, exist_ok=True)
            with open(override_path(sid), "w") as fh:
                fh.write("\n".join("".join(r) for r in rows) + "\n")
            GEN.write_png(os.path.join(SPRITES_DIR, "%03d.png" % sid), rows)
            refresh_game()
            self.send(200, {"ok": True})
        elif self.path == "/api/revert":
            if sid not in GEN.SIZES:
                self.send(400, {"error": "unknown sprite id"})
                return
            try:
                os.remove(override_path(sid))
            except FileNotFoundError:
                pass
            rows = GEN.BUILDERS[sid]()
            GEN.write_png(os.path.join(SPRITES_DIR, "%03d.png" % sid), rows)
            refresh_game()
            art, _ = sprite_art(sid)
            self.send(200, {"ok": True, "art": art})
        else:
            self.send(404, {"error": "not found"})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print("sprite editor at http://127.0.0.1:%d/" % args.port)
    server.serve_forever()


if __name__ == "__main__":
    main()
