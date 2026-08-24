import QtQuick
import QtQuick.Window
import Quickshell.Io
import "Engine.js" as Engine
import "Sprites.js" as Sprites
import "Font.js" as Font

// The playfield, PICO-8 rules.
//
// The whole game lives on one fixed 128x128 pixel screen, drawn once per
// tick onto a single Canvas and scaled up by a whole number to fit the
// window, centred on black. Nothing is ever drawn at any other resolution:
// one sprite pixel is always exactly one screen grid cell, so the art shows
// up in the game exactly as it looks in the sprite editor, at every window
// size the compositor picks.
FocusScope {
  id: root

  required property string spriteDir
  property bool windowActive: true

  // The one and only screen.
  readonly property int screen: 128

  // The Game Boy style bezel around it, in game pixels.
  readonly property int bezel: 9
  readonly property int frame: screen + 2 * bezel

  // The zoom is locked to a whole number of PHYSICAL pixels per game
  // pixel. On a fractionally scaled monitor (Hyprland scale 1.5, say),
  // an integer zoom in logical pixels can still land on half a hardware
  // pixel — 5 logical x 1.5 = 7.5 physical — and the compositor has to
  // shred the grid to draw it. Working in physical pixels keeps every
  // game pixel a perfect square at every window size; the remainder
  // becomes black bars, never a stretched pixel.
  readonly property real dpr: Screen.devicePixelRatio || 1
  readonly property int pxScale: Math.max(1,
    Math.floor(Math.min(width, height) * dpr / root.frame))

  // The item-space scale and offsets that realise that physical zoom,
  // with the top-left corner pinned to the hardware pixel grid.
  readonly property real itemScale: root.pxScale / root.dpr

  // The skier rides high on the screen for extra reaction time.
  readonly property int skierY: 34

  property var sim: Engine.createState()
  property var events: []
  property bool started: false
  property bool hudVisible: true

  // Debug hook, off unless OMASKI_DEBUG_START is set to a distance in
  // metres: skips the title card and starts that far down the hill.
  property string debugStartEnv: ""
  readonly property int debugStart: {
    var value = parseInt(root.debugStartEnv || "", 10)
    return isNaN(value) || value < 0 ? 0 : value
  }

  focus: true
  clip: true

  Component.onCompleted: {
    root.sim.viewAbove = root.skierY / Engine.PIXELS_PER_METRE
    if (root.debugStart > 0) {
      root.sim.distance = root.debugStart
      root.sim.y = root.debugStart
      root.sim.yetiNext = Engine.YETI_DISTANCE
      root.started = true
    }
    var ids = Object.keys(Sprites.SIZES)
    for (var i = 0; i < ids.length; i++)
      canvas.loadImage(root.spriteUrl(Number(ids[i])))
    root.forceActiveFocus()
  }

  function spriteUrl(id) {
    return root.spriteDir + "/" + (id < 10 ? "00" : "0") + id + ".png"
  }

  // Hot reload: the sprite tools touch .stamp after rewriting PNGs, and the
  // open window swaps the art in place — no respawn, geometry untouched.
  function reloadSprites() {
    var ids = Object.keys(Sprites.SIZES)
    for (var i = 0; i < ids.length; i++) {
      var url = root.spriteUrl(Number(ids[i]))
      canvas.unloadImage(url)
      canvas.loadImage(url)
    }
    root.repaint()
  }

  FileView {
    path: root.spriteDir.replace(/^file:\/\//, "") + "/.stamp"
    watchChanges: true
    onFileChanged: root.reloadSprites()
  }

  // The paint code skips sprites that are not loaded, which keeps startup
  // clean but would also hide a wrong sprite path forever — so say so once.
  Timer {
    interval: 2000
    running: true
    onTriggered: {
      if (!canvas.isImageLoaded(root.spriteUrl(1)))
        console.warn("omaski: sprites did not load from " + root.spriteDir)
    }
  }

  // ------------------------------------------------------------------------
  // Simulation clock: a fixed 30 Hz for both physics and paint
  // ------------------------------------------------------------------------

  Timer {
    id: clock
    interval: 33
    repeat: true
    // The hill stays still until the first run, so the title is readable.
    running: root.windowActive && root.started && !root.sim.over
    onTriggered: {
      root.events = []
      Engine.step(root.sim, interval / 1000, root.events)
      root.repaint()
    }
  }

  // ------------------------------------------------------------------------
  // The screen
  // ------------------------------------------------------------------------

  // The ground around the frame: the same snow as the playfield.
  Rectangle {
    anchors.fill: parent
    color: "#FFF1E8"
  }

  // A kitschy DMG-style screen surround: light grey plastic, dark grey
  // accent stripes and inner lip, and the classic big rounded corner at
  // the bottom right. Drawn through the same physical-pixel-exact
  // transform as the screen, so the frame pixels stay perfect squares.
  Canvas {
    id: bezelCanvas
    width: root.frame * root.itemScale
    height: root.frame * root.itemScale
    x: Math.floor((root.width * root.dpr - root.frame * root.pxScale) / 2)
       / root.dpr
    y: Math.floor((root.height * root.dpr - root.frame * root.pxScale) / 2)
       / root.dpr
    smooth: false
    antialiasing: false
    onPaint: root.drawBezel()
  }

  function drawBezel() {
    var ctx = bezelCanvas.getContext("2d")
    var F = root.frame
    ctx.setTransform(root.itemScale, 0, 0, root.itemScale, 0, 0)
    ctx.clearRect(0, 0, F, F)

    // Body: light grey plastic with pixel-rounded corners — small ones
    // everywhere, the goofy big one at the bottom right.
    ctx.fillStyle = "#C2C3C7"
    ctx.fillRect(0, 0, F, F)
    function roundCorner(cx, cy, r, sx, sy) {
      for (var i = 0; i < r; i++) {
        var inset = r - Math.floor(Math.sqrt(r * r - (r - i - 0.5) * (r - i - 0.5)))
        ctx.clearRect(cx + (sx < 0 ? -inset : 0), cy + sy * i
                      + (sy < 0 ? -1 : 0), inset, 1)
      }
    }
    roundCorner(0, 0, 3, 1, 1)              // top left
    roundCorner(F, 0, 3, -1, 1)             // top right
    roundCorner(0, F, 3, 1, -1)             // bottom left
    roundCorner(F, F, 12, -1, -1)           // bottom right, DMG style

    // Accent stripes across the top bezel, dot-matrix style.
    ctx.fillStyle = "#5F574F"
    ctx.fillRect(5, 3, F - 10, 1)
    ctx.fillRect(5, 5, F - 10, 1)

    // Inner lip: a 1px dark ring hugging the screen.
    var b = root.bezel
    ctx.fillRect(b - 1, b - 1, root.screen + 2, 1)
    ctx.fillRect(b - 1, b + root.screen, root.screen + 2, 1)
    ctx.fillRect(b - 1, b, 1, root.screen)
    ctx.fillRect(b + root.screen, b, 1, root.screen)
  }

  // The canvas item spans the whole letterboxed square at its final size,
  // and the DRAWING CONTEXT is scaled instead of the item. Qt sizes the
  // canvas framebuffer at item-size x devicePixelRatio, which here lands on
  // exactly 128 x pxScale texels — so every game pixel rasterises as a
  // perfect pxScale-sized square of hardware pixels, on the first frame and
  // every frame after. (Scaling a 128px item's texture instead looks right
  // only until Qt recreates the canvas framebuffer DPR-multiplied — the
  // first repaint after startup — which smeared everything on fractionally
  // scaled monitors.)
  Canvas {
    id: canvas
    width: root.screen * root.itemScale
    height: root.screen * root.itemScale
    x: bezelCanvas.x + root.bezel * root.itemScale
    y: bezelCanvas.y + root.bezel * root.itemScale
    smooth: false
    antialiasing: false
    onPaint: root.draw()
    // Repaint as sprites arrive so the title card fills in.
    onImageLoaded: requestPaint()
  }

  function repaint() {
    canvas.requestPaint()
  }

  // ------------------------------------------------------------------------
  // Drawing — everything at scale 1 on the 128x128 grid
  // ------------------------------------------------------------------------

  // PICO-8 ink.
  readonly property string snow: "#FFF1E8"
  readonly property string ink: "#000000"
  readonly property string inkSoft: "#5F574F"
  readonly property string shadow: "#C2C3C7"

  function sx(worldX) {
    return Math.round(root.screen / 2 + Engine.wrap(worldX - root.sim.x)
                      * Engine.PIXELS_PER_METRE)
  }

  function sy(worldY) {
    return Math.round(root.skierY + Engine.wrap(worldY - root.sim.y)
                      * Engine.PIXELS_PER_METRE)
  }

  // Draw a sprite with its base centred on the world point, `lift` pixels
  // above the snow.
  function sprite(ctx, id, worldX, worldY, lift) {
    var url = root.spriteUrl(id)
    if (!canvas.isImageLoaded(url)) return
    ctx.drawImage(url,
                  sx(worldX) - (Sprites.width(id) >> 1),
                  sy(worldY) - Sprites.height(id) - (lift || 0))
  }

  // Draw a sprite, optionally mirrored, base-anchored at the world point.
  function mirrored(ctx, id, flip, worldX, worldY, lift) {
    var url = root.spriteUrl(id)
    if (!canvas.isImageLoaded(url)) return
    var w = Sprites.width(id)
    var x = sx(worldX) - (w >> 1)
    var y = sy(worldY) - Sprites.height(id) - (lift || 0)
    if (!flip) {
      ctx.drawImage(url, x, y)
      return
    }
    ctx.save()
    ctx.translate(x + w, y)
    ctx.scale(-1, 1)
    ctx.drawImage(url, 0, 0)
    ctx.restore()
  }

  // Centred text, one glyph pixel per screen pixel.
  function text(ctx, cx, top, str) {
    Font.draw(ctx, Math.round(cx - Font.width(str, 1) / 2),
              Math.round(top), str, 1)
  }

  // A bordered panel of centred text lines, PICO-8 style: a crisp 1px
  // rectangular border, snow fill, and the authentic 6px line height.
  function panel(ctx, cx, top, lines, colour) {
    var lh = 6
    var w = 0
    for (var i = 0; i < lines.length; i++)
      w = Math.max(w, Font.width(lines[i], 1))
    w += 6
    var h = lines.length * lh + 5
    var x = Math.round(cx - w / 2)
    ctx.fillStyle = colour || root.ink
    ctx.fillRect(x - 1, top - 1, w + 2, h + 2)
    ctx.fillStyle = root.snow
    ctx.fillRect(x, top, w, h)
    ctx.fillStyle = colour || root.ink
    for (var j = 0; j < lines.length; j++)
      text(ctx, cx, top + 3 + j * lh, lines[j])
  }

  function draw() {
    var ctx = canvas.getContext("2d")
    var s = root.sim
    var PX = Engine.PIXELS_PER_METRE

    // All game code draws in 128x128 coordinates; this transform maps one
    // game pixel to a whole number of hardware pixels (itemScale x dpr ==
    // pxScale, an integer), so integer coordinates rasterise crisply.
    ctx.setTransform(root.itemScale, 0, 0, root.itemScale, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = root.snow
    ctx.fillRect(0, 0, root.screen, root.screen)

    if (!root.started) {
      root.drawTitle(ctx)
      return
    }

    // --- the hill ---------------------------------------------------------
    var pad = 4
    var half = root.screen / (2 * PX)
    var list = Engine.objectsIn(
      s.x - half - pad,
      s.y - root.skierY / PX - pad,
      s.x + half + pad,
      s.y + (root.screen - root.skierY) / PX + pad)

    // Painter's order: lower on the hill draws in front.
    list.sort(function (a, b) { return a.y - b.y })
    for (var o = 0; o < list.length; o++) {
      root.sprite(ctx, list[o].sprite, list[o].x, list[o].y)
    }

    // --- dogs, deer, snowboarders and other skiers ------------------------
    ctx.fillStyle = root.ink
    for (var k = 0; k < s.critters.length; k++) {
      var cr = s.critters[k]
      var frame = Engine.critterSprite(cr)
      root.mirrored(ctx, frame[0], frame[1], cr.x, cr.y, 0)
      if (cr.bark && !cr.down)
        text(ctx, sx(cr.x), sy(cr.y) - Sprites.height(frame[0]) - 8, "WOOF!")
    }

    // --- the skier --------------------------------------------------------
    if (!s.eaten) {
      if (s.airborne && s.height > 0.3) {
        // A shadow on the snow, to judge the landing by.
        ctx.fillStyle = root.shadow
        ctx.fillRect(Math.round(root.screen / 2 - 3), root.skierY - 1, 6, 2)
      }
      var pose = Engine.skierSprite(s)
      root.mirrored(ctx, pose[0], pose[1], s.x, s.y,
                    Math.round(s.height * PX))
      if (s.crashed) {
        var burstUrl = root.spriteUrl(Sprites.CRASH_OUCH)
        if (canvas.isImageLoaded(burstUrl)) {
          var bx = sx(s.x) - (Sprites.width(Sprites.CRASH_OUCH) >> 1)
          var by = sy(s.y) - Sprites.height(s.crashSprite)
                 - Sprites.height(Sprites.CRASH_OUCH) - 2
          ctx.drawImage(burstUrl, bx, by)
          ctx.fillStyle = root.ink
          text(ctx, sx(s.x),
               by + Math.round(Sprites.height(Sprites.CRASH_OUCH) / 2) - 2,
               s.crashWord)
        }
      }
    }

    // --- the monster ------------------------------------------------------
    if (s.eaten) {
      root.sprite(ctx, Sprites.YETI_EAT_FRAMES[s.eatFrame], s.x, s.y)
    } else if (s.yeti) {
      var yf = s.yeti.mode === "roar" || s.yeti.mode === "bored"
             ? Sprites.YETI_ROAR_FRAMES
             : s.yeti.mode === "leap" ? Sprites.YETI_LEAP_FRAMES
             : Sprites.YETI_RUN_FRAMES
      root.sprite(ctx, yf[s.yeti.frame % yf.length], s.yeti.x, s.yeti.y)
    }

    // --- overlays ---------------------------------------------------------
    if (root.hudVisible) root.drawHud(ctx)

    if (s.paused)
      panel(ctx, root.screen / 2, 56, ["PAUSED - Ⓞ TO SKI"])

    if (s.over)
      panel(ctx, root.screen / 2, 92,
            ["YOU HAVE BEEN EATEN.", "F2 TO RESTART"], "#FF004D")
  }

  // Elapsed time squeezed as tight as it goes: M:SS, hours only if earned.
  function shortTime(t) {
    var total = Math.floor(t)
    var m = Math.floor(total / 60) % 60
    var sec = total % 60
    var hr = Math.floor(total / 3600)
    return (hr > 0 ? hr + ":" + (m < 10 ? "0" : "") : "") + m + ":"
           + (sec < 10 ? "0" : "") + sec
  }

  // The score readout, top right: four bare lines floating over the snow,
  // no box. The font is strictly monospace, so ticking digits hold still.
  function drawHud(ctx) {
    var s = root.sim
    var rows = [
      shortTime(s.elapsed),
      Math.floor(s.distance) + "M",
      Math.round(s.speed * 2.23694) + "MPH",
      "RAD: " + Math.floor(s.style)
    ]
    ctx.fillStyle = root.ink
    for (var j = 0; j < rows.length; j++) {
      Font.draw(ctx, root.screen - 2 - Font.width(rows[j], 1),
                2 + j * 6, rows[j], 1)
    }
  }

  // The title card: logo up top, tagline, version and hints below, all on
  // the same 128x128 grid.
  function drawTitle(ctx) {
    var cx = root.screen / 2
    var logoUrl = root.spriteUrl(Sprites.LOGO)
    if (canvas.isImageLoaded(logoUrl)) {
      ctx.drawImage(logoUrl,
                    Math.round(cx - Sprites.width(Sprites.LOGO) / 2), 9)
    }
    // Tagline and start prompt, balanced between logo and instructions.
    ctx.fillStyle = "#FF004D"   // PICO-8 red
    text(ctx, cx, 64, "SKI FREE. AVOID THE YETI.")
    ctx.fillStyle = root.ink
    text(ctx, cx, 71, "PRESS ⬇ TO SKI")
    // The key hints, low on the page.
    text(ctx, cx, 88, "USE NUMPAD (0-9)")
    text(ctx, cx, 94, "FOR BETTER CONTROL")
    text(ctx, cx, 103, "F = FAST ON/OFF")
    text(ctx, cx, 109, "F2 = RESTART  F3 = PAUSE")
    // Version in the puny lowercase font, lightest PICO-8 grey, tucked low.
    ctx.fillStyle = root.shadow
    text(ctx, cx, 121, "version 5.3")
  }

  // ------------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------------
  // Arrow keys and WASD steer; the numeric keypad sets absolute headings;
  // Home/PageUp side-step uphill; the mouse steers toward the pointer.

  function restart() {
    root.sim = Engine.createState()
    root.sim.viewAbove = root.skierY / Engine.PIXELS_PER_METRE
    root.started = false
    root.repaint()
  }

  Keys.onPressed: function (event) {
    var s = root.sim

    var wasStarted = root.started
    if (!root.started && event.key !== Qt.Key_F2) root.started = true

    switch (event.key) {
    // --- steering -------------------------------------------------------
    case Qt.Key_Left:
    case Qt.Key_A:
      Engine.turn(s, -1); break
    case Qt.Key_Right:
    case Qt.Key_D:
      Engine.turn(s, 1); break
    case Qt.Key_Down:
    case Qt.Key_S:
      // Holding down is a tuck: straight downhill at full F-speed.
      Engine.setHeading(s, 0)
      s.fast = true
      break

    // --- jump (❎ in PICO-8 terms) ---------------------------------------
    case Qt.Key_Up:
    case Qt.Key_W:
    case Qt.Key_Space:
    case Qt.Key_Insert:
    case Qt.Key_X:
      // Holding the key auto-repeats; one press is one hop.
      if (!event.isAutoRepeat) Engine.jump(s, root.events)
      break

    // --- absolute headings on the numpad --------------------------------
    case Qt.Key_1: Engine.setHeading(s, -3); break
    case Qt.Key_2: Engine.setHeading(s, -2); break
    case Qt.Key_3: Engine.setHeading(s, -1); break
    case Qt.Key_4: Engine.setHeading(s, -3); break
    case Qt.Key_5: Engine.setHeading(s, 0); break
    case Qt.Key_6: Engine.setHeading(s, 3); break
    case Qt.Key_7: Engine.setHeading(s, 1); break
    case Qt.Key_8: Engine.setHeading(s, 0); break
    case Qt.Key_9: Engine.setHeading(s, 2); break

    // --- side-stepping uphill -------------------------------------------
    case Qt.Key_Home:
      s.climbing = -1; break
    case Qt.Key_PageUp:
      s.climbing = 1; break

    // --- fast mode: F is a toggle, press to switch on, again to switch off
    case Qt.Key_F:
      if (!event.isAutoRepeat) s.fast = !s.fast
      break

    // --- meta -----------------------------------------------------------
    case Qt.Key_F2:
      root.restart(); break
    case Qt.Key_F3:
    case Qt.Key_P:
    case Qt.Key_Z:      // Ⓞ in PICO-8 terms
      // The keystroke that leaves the title screen must not also pause.
      if (wasStarted) s.paused = !s.paused
      break
    case Qt.Key_H:
      root.hudVisible = !root.hudVisible; break
    case Qt.Key_Y:
      // Summon him early, for the brave.
      if (!s.yeti) Engine.spawnYeti(s, s.viewAbove)
      break
    case Qt.Key_Escape:
      Qt.quit(); break
    }
    root.repaint()
  }

  Keys.onReleased: function (event) {
    // A held key auto-repeats as press/release pairs; only the real
    // release may switch anything off, or fast mode would flicker.
    if (event.isAutoRepeat) return
    var s = root.sim
    switch (event.key) {
    case Qt.Key_Down:
    case Qt.Key_S:
      s.fast = false; break
    case Qt.Key_Home:
    case Qt.Key_PageUp:
      s.climbing = 0; break
    }
  }

  // Mouse steering: the skier turns toward the pointer, and clicking jumps.
  MouseArea {
    id: mouseSteer
    anchors.fill: parent
    acceptedButtons: Qt.LeftButton | Qt.RightButton
    hoverEnabled: true

    // Window pixels -> 128-grid pixels.
    function gridX(wx) { return (wx - canvas.x) / root.itemScale }
    function gridY(wy) { return (wy - canvas.y) / root.itemScale }

    // Where the pointer last actually steered from. A resting pointer
    // jitters by a pixel or two, and that must never override a heading
    // set on the keyboard — a stopped skier has to stay stopped.
    property real steerX: -1
    property real steerY: -1

    onPositionChanged: function (mouse) {
      if (!root.started) return
      if (steerX < 0) { steerX = mouse.x; steerY = mouse.y; return }
      if (Math.abs(mouse.x - steerX) + Math.abs(mouse.y - steerY)
          < 4 * root.itemScale) return
      steerX = mouse.x
      steerY = mouse.y
      var dx = gridX(mouse.x) - root.screen / 2
      var dy = gridY(mouse.y) - root.skierY
      // Pointer above the skier leaves the heading alone.
      if (dy < -8) return
      var norm = Math.max(-1, Math.min(1, dx / (root.screen * 0.3)))
      Engine.setHeading(root.sim, Math.round(norm * 3))
    }

    onPressed: function (mouse) {
      // Clicking must not leave the key handler without focus.
      root.forceActiveFocus()
      root.started = true
      if (mouse.button === Qt.LeftButton) Engine.jump(root.sim, root.events)
      root.repaint()
    }
  }
}
