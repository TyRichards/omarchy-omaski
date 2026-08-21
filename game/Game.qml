import QtQuick
import "Engine.js" as Engine
import "Sprites.js" as Sprites
import "Font.js" as Font

// The playfield.
//
// Everything is drawn onto one small virtual screen — a Canvas of roughly
// 220 logical pixels — which is integer-scaled up to the window with no
// filtering. That is what gives the game its chunky fantasy-console look,
// and it is also what makes it smooth: one item repaints thirty times a
// second, instead of a tree's worth of Image objects being created and
// destroyed every tick (the mistake that made version 2 stutter).
FocusScope {
  id: root

  required property string spriteDir
  property bool windowActive: true

  // Integer zoom from window size to the virtual screen.
  readonly property int pixelScale: {
    var side = Math.min(width, height)
    return side <= 0 ? 3 : Math.max(2, Math.round(side / 222))
  }
  readonly property int vw: Math.max(64, Math.ceil(width / pixelScale))
  readonly property int vh: Math.max(64, Math.ceil(height / pixelScale))

  // The skier sits about a third of the way down, as in the classic, so you
  // can see what is coming.
  readonly property int skierY: Math.round(vh * 0.34)

  // Metres of slope visible above the skier — where the monster comes from.
  onSkierYChanged: root.sim.viewAbove = root.skierY / Engine.PIXELS_PER_METRE

  property var sim: Engine.createState()
  property var events: []
  property bool started: false
  property bool hudVisible: true

  // Debug hook, off unless OMARSKI_DEBUG_START is set to a distance in
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

  // The paint code skips sprites that are not loaded, which keeps startup
  // clean but would also hide a wrong sprite path forever — so say so once.
  Timer {
    interval: 2000
    running: true
    onTriggered: {
      if (!canvas.isImageLoaded(root.spriteUrl(1)))
        console.warn("omarski: sprites did not load from " + root.spriteDir)
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
  // The virtual screen
  // ------------------------------------------------------------------------

  Canvas {
    id: canvas
    width: root.vw
    height: root.vh
    transformOrigin: Item.TopLeft
    scale: root.pixelScale
    smooth: false          // nearest-neighbour upscale: big square pixels
    antialiasing: false
    onPaint: root.draw()
    // Repaint as sprites arrive so the title card fills in, and repaint on
    // resize (size changes mark the canvas dirty automatically).
    onImageLoaded: requestPaint()
  }

  // The UI text overlay: unscaled window resolution, so text can sit at a
  // size between the integer steps available inside the world canvas.
  Canvas {
    id: uiCanvas
    anchors.fill: parent
    smooth: false
    antialiasing: false
    onPaint: root.drawUi()
  }

  // ------------------------------------------------------------------------
  // Drawing
  // ------------------------------------------------------------------------

  // PICO-8 ink.
  readonly property string snow: "#FFF1E8"
  readonly property string ink: "#000000"
  readonly property string inkSoft: "#5F574F"
  readonly property string shadow: "#C2C3C7"

  function sx(worldX) {
    return Math.round(root.vw / 2 + Engine.wrap(worldX - root.sim.x)
                      * Engine.PIXELS_PER_METRE)
  }

  function sy(worldY) {
    return Math.round(root.skierY + Engine.wrap(worldY - root.sim.y)
                      * Engine.PIXELS_PER_METRE)
  }

  // Draw a sprite with its base centred on the world point, `lift` logical
  // pixels above the snow.
  function sprite(ctx, id, worldX, worldY, lift) {
    var url = root.spriteUrl(id)
    if (!canvas.isImageLoaded(url)) return
    ctx.drawImage(url,
                  sx(worldX) - (Sprites.width(id) >> 1),
                  sy(worldY) - Sprites.height(id) - (lift || 0))
  }

  // UI text lives on an unscaled overlay canvas at 1.5x the world pixel
  // size — halfway between the tiny status box and full double scale.
  // Because the overlay is in window pixels, every glyph pixel is still a
  // crisp integer number of screen pixels.
  readonly property int uiScale: Math.max(2, Math.round(root.pixelScale * 3 / 2))

  function repaint() {
    canvas.requestPaint()
    uiCanvas.requestPaint()
  }

  // Centred overlay text; cx is the centre, in window pixels.
  function uiText(ctx, cx, top, text) {
    Font.draw(ctx, Math.round(cx - Font.width(text, root.uiScale) / 2),
              Math.round(top), text, root.uiScale)
  }

  // A bordered panel of centred text lines on the overlay, PICO-8 style.
  function uiPanel(ctx, cx, top, lines) {
    var U = root.uiScale
    var P = root.pixelScale
    var lh = 6 * U
    var w = 0
    for (var i = 0; i < lines.length; i++)
      w = Math.max(w, Font.width(lines[i], U))
    w += 6 * P
    var h = lines.length * lh + 3 * P
    var x = Math.round(cx - w / 2)
    ctx.fillStyle = root.ink
    ctx.fillRect(x - P, top - P, w + 2 * P, h + 2 * P)
    ctx.fillStyle = root.snow
    ctx.fillRect(x, top, w, h)
    ctx.fillStyle = root.ink
    for (var j = 0; j < lines.length; j++) {
      Font.draw(ctx, Math.round(cx - Font.width(lines[j], U) / 2),
                top + 2 * P + j * lh, lines[j], U)
    }
  }

  function draw() {
    var ctx = canvas.getContext("2d")
    var s = root.sim
    var PX = Engine.PIXELS_PER_METRE

    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = root.snow
    ctx.fillRect(0, 0, root.vw, root.vh)

    // --- the hill ---------------------------------------------------------
    var pad = 4
    var list = Engine.objectsIn(
      s.x - root.vw / (2 * PX) - pad,
      s.y - root.skierY / PX - pad,
      s.x + root.vw / (2 * PX) + pad,
      s.y + (root.vh - root.skierY) / PX + pad)

    // Painter's order: lower on the hill draws in front.
    list.sort(function (a, b) { return a.y - b.y })
    for (var o = 0; o < list.length; o++) {
      root.sprite(ctx, list[o].sprite, list[o].x, list[o].y)
    }

    // --- dogs, deer, snowboarders and other skiers ------------------------
    // (a close dog's WOOF! text is drawn by the overlay)
    for (var k = 0; k < s.critters.length; k++) {
      var cr = s.critters[k]
      var frame = Engine.critterSprite(cr)
      root.mirrored(ctx, frame[0], frame[1], cr.x, cr.y, 0)
    }

    // --- the skier --------------------------------------------------------
    if (!s.eaten) {
      if (s.airborne && s.height > 0.3) {
        // A shadow on the snow, to judge the landing by.
        ctx.fillStyle = root.shadow
        ctx.fillRect(Math.round(root.vw / 2 - 3), root.skierY - 1, 6, 2)
      }
      var pose = Engine.skierSprite(s)
      root.mirrored(ctx, pose[0], pose[1], s.x, s.y,
                    Math.round(s.height * PX))
      if (s.crashed) {
        // The starburst; its word is drawn by the overlay.
        var burstUrl = root.spriteUrl(Sprites.CRASH_OUCH)
        if (canvas.isImageLoaded(burstUrl)) {
          ctx.drawImage(burstUrl,
                        sx(s.x) - (Sprites.width(Sprites.CRASH_OUCH) >> 1),
                        sy(s.y) - Sprites.height(s.crashSprite)
                        - Sprites.height(Sprites.CRASH_OUCH) - 2)
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
    // (panels and title text live on the UI overlay canvas)
    if (root.hudVisible && root.started) root.drawHud(ctx)
    if (!root.started) root.drawTitle(ctx)
  }

  // Everything drawn at the UI text size, in window pixels.
  function drawUi() {
    var ctx = uiCanvas.getContext("2d")
    ctx.clearRect(0, 0, uiCanvas.width, uiCanvas.height)
    var s = root.sim
    var P = root.pixelScale
    var U = root.uiScale
    ctx.fillStyle = root.ink

    if (root.started) {
      // A close dog pipes up.
      for (var k = 0; k < s.critters.length; k++) {
        var cr = s.critters[k]
        if (!cr.bark || cr.down) continue
        var frame = Engine.critterSprite(cr)
        root.uiText(ctx, sx(cr.x) * P,
                    (sy(cr.y) - Sprites.height(frame[0]) - 3) * P - 5 * U,
                    "WOOF!")
      }

      // The crash word, centred on the starburst.
      if (s.crashed && !s.eaten) {
        var burstMid = (sy(s.y) - Sprites.height(s.crashSprite) - 2
                        - Sprites.height(Sprites.CRASH_OUCH) / 2) * P
        root.uiText(ctx, sx(s.x) * P, burstMid - 5 * U / 2, s.crashWord)
      }
    }

    if (!root.started) root.drawTitleText(ctx)

    if (s.paused) {
      root.uiPanel(ctx, uiCanvas.width / 2,
                   Math.round(uiCanvas.height / 2 - 8 * P),
                   ["PAUSED - Ⓞ TO SKI"])
    }

    if (s.over) {
      root.uiPanel(ctx, uiCanvas.width / 2,
                   Math.round(uiCanvas.height * 0.72),
                   ["YOU HAVE BEEN EATEN.", "F2 TO RESTART"])
    }
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

  function drawHud(ctx) {
    var s = root.sim
    // Two columns: labels on the left, values right-aligned. Drawn at 1px
    // weight — the status box stays small — and the font is strictly
    // monospace, so the ticking digits hold perfectly still.
    var rows = [
      ["TIME", Engine.formatTime(s.elapsed)],
      ["DIST", Math.floor(s.distance) + "M"],
      ["SPEED", Math.floor(s.speed) + "M/S"],
      ["STYLE", String(Math.floor(s.style))]
    ]
    var labelW = Font.width("SPEED")
    var valueW = Font.width("0:00:00.00")
    var w = labelW + 4 + valueW + 6
    var h = rows.length * 7 + 4
    var x = root.vw - w - 2
    ctx.fillStyle = root.ink
    ctx.fillRect(x - 1, 1, w + 2, h + 2)
    ctx.fillStyle = root.snow
    ctx.fillRect(x, 2, w, h)
    ctx.fillStyle = root.ink
    for (var j = 0; j < rows.length; j++) {
      Font.draw(ctx, x + 3, 4 + j * 7, rows[j][0])
      Font.draw(ctx, x + w - 3 - Font.width(rows[j][1]), 4 + j * 7, rows[j][1])
    }
  }

  // The world-canvas half of the title screen: just the logo, riding high
  // so the skier stands in clear view below it.
  function drawTitle(ctx) {
    var logoUrl = root.spriteUrl(Sprites.LOGO)
    if (canvas.isImageLoaded(logoUrl)) {
      ctx.drawImage(logoUrl,
                    Math.round(root.vw / 2 - Sprites.width(Sprites.LOGO) / 2), 2)
    }
  }

  // The overlay half: tagline, version, hints and the start prompt, all in
  // the PICO-8 font at the UI size, below the skier.
  function drawTitleText(ctx) {
    var P = root.pixelScale
    var U = root.uiScale
    var cx = uiCanvas.width / 2
    var lh = 6 * U
    var y = Math.max((Sprites.height(Sprites.LOGO) + 8) * P,
                     (root.skierY + 10) * P)

    ctx.fillStyle = root.ink
    root.uiText(ctx, cx, y, "SKI FREE. AVOID THE YETI.")
    y += lh + U
    ctx.fillStyle = root.inkSoft
    root.uiText(ctx, cx, y, "VERSION 4.5")
    y += lh + U
    ctx.fillStyle = root.ink
    root.uiText(ctx, cx, y, "USE NUMPAD (0-9)")
    y += lh
    root.uiText(ctx, cx, y, "FOR BETTER CONTROL")
    y += lh + U
    root.uiText(ctx, cx, y, "Ⓞ = PAUSE   F = FAST")
    y += lh
    root.uiText(ctx, cx, y, "F2 = RESTART")
    y += lh + lh / 2
    root.uiText(ctx, cx, Math.min(y, uiCanvas.height - 6 * U),
                "PRESS ❎ TO SKI")
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

    // --- fast mode ------------------------------------------------------
    case Qt.Key_F:
      s.fast = true; break

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
    case Qt.Key_F:
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

    // Where the pointer last actually steered from. A resting pointer
    // jitters by a pixel or two, and that must never override a heading
    // set on the keyboard — a stopped skier has to stay stopped.
    property real steerX: -1
    property real steerY: -1

    onPositionChanged: function (mouse) {
      if (!root.started) return
      if (steerX < 0) { steerX = mouse.x; steerY = mouse.y; return }
      if (Math.abs(mouse.x - steerX) + Math.abs(mouse.y - steerY)
          < 4 * root.pixelScale) return
      steerX = mouse.x
      steerY = mouse.y
      var dx = mouse.x - root.width / 2
      var dy = mouse.y - root.skierY * root.pixelScale
      // Pointer above the skier leaves the heading alone.
      if (dy < -8 * root.pixelScale) return
      var norm = Math.max(-1, Math.min(1, dx / (root.width * 0.3)))
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
