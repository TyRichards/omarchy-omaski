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
    for (var id = 1; id <= 89; id++) canvas.loadImage(root.spriteUrl(id))
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
      canvas.requestPaint()
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

  // A bordered panel of centred text lines, PICO-8 style.
  function panel(ctx, cx, top, lines) {
    var w = 0
    for (var i = 0; i < lines.length; i++)
      w = Math.max(w, Font.width(lines[i]))
    w += 8
    var h = lines.length * 7 + 5
    var x = Math.round(cx - w / 2)
    ctx.fillStyle = root.ink
    ctx.fillRect(x - 1, top - 1, w + 2, h + 2)
    ctx.fillStyle = root.snow
    ctx.fillRect(x, top, w, h)
    ctx.fillStyle = root.ink
    for (var j = 0; j < lines.length; j++) {
      Font.draw(ctx, Math.round(cx - Font.width(lines[j]) / 2),
                top + 3 + j * 7, lines[j])
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
      s.y + (root.vh - root.skierY) / PX + pad,
      s.course)

    // Course signage near the start.
    if (s.y < Engine.SIGN_ROW + 60 && s.y > -60) {
      for (var i = 0; i < Engine.COURSES.length; i++) {
        var c = Engine.COURSES[i]
        list.push({ sprite: c.sign, x: c.x, y: Engine.SIGN_ROW })
      }
    }

    // Start and finish banners flanking the active course.
    var spec = Engine.courseById(s.course)
    if (spec && s.course !== Engine.COURSE_FREESTYLE) {
      list.push({ sprite: Sprites.SIGN_START_L, x: spec.x - 13,
                  y: Engine.courseStartY() })
      list.push({ sprite: Sprites.SIGN_START_R, x: spec.x + 13,
                  y: Engine.courseStartY() })
      list.push({ sprite: Sprites.SIGN_FINISH_L, x: spec.x - 13,
                  y: Engine.courseFinishY(s.course) })
      list.push({ sprite: Sprites.SIGN_FINISH_R, x: spec.x + 13,
                  y: Engine.courseFinishY(s.course) })
    }

    // Slalom gates, with a judged marker once each is passed.
    var gates = Engine.gatesFor(s.course)
    for (var g = 0; g < gates.length; g++) {
      list.push({ sprite: Sprites.FLAG_LEFT,
                  x: gates[g].x - gates[g].halfWidth, y: gates[g].y })
      list.push({ sprite: Sprites.FLAG_RIGHT,
                  x: gates[g].x + gates[g].halfWidth, y: gates[g].y })
      if (g < s.nextGate) {
        list.push({ sprite: s.gateResults[g] ? Sprites.GATE_GREEN
                                             : Sprites.GATE_RED,
                    x: gates[g].x, y: gates[g].y })
      }
    }

    // Painter's order: lower on the hill draws in front.
    list.sort(function (a, b) { return a.y - b.y })
    for (var o = 0; o < list.length; o++) {
      root.sprite(ctx, list[o].sprite, list[o].x, list[o].y)
    }

    // --- dogs, snowboarders and other skiers ------------------------------
    for (var k = 0; k < s.critters.length; k++) {
      var frame = Engine.critterSprite(s.critters[k])
      root.mirrored(ctx, frame[0], frame[1], s.critters[k].x, s.critters[k].y, 0)
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
    if (root.hudVisible && root.started) root.drawHud(ctx)
    if (!root.started) root.drawTitle(ctx)

    if (s.courseFinished) {
      var cspec = Engine.courseById(s.course)
      panel(ctx, root.vw / 2, Math.round(root.vh * 0.16), [
        (cspec ? cspec.label : "Course") + " complete!",
        "Time " + Engine.formatTime(s.courseTime),
        "Gates " + s.gatesCleared + " of " + (s.gatesCleared + s.gatesMissed),
        "Style " + Engine.formatStyle(s.style).replace(/^ +/, ""),
        "F2 to restart"
      ])
    }

    if (s.paused) {
      panel(ctx, root.vw / 2, Math.round(root.vh / 2 - 8),
            ["Paused - F3 to ski"])
    }

    if (s.over) {
      panel(ctx, root.vw / 2, Math.round(root.vh * 0.72),
            ["You have been eaten.", "F2 to restart"])
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
    var lines = [
      "TIME " + Engine.formatTime(s.elapsed),
      "DIST " + Engine.formatDistance(s.distance).toUpperCase(),
      "SPEED " + Engine.formatSpeed(s.speed).toUpperCase(),
      "STYLE " + Engine.formatStyle(s.style)
    ]
    var w = 0
    for (var i = 0; i < lines.length; i++)
      w = Math.max(w, Font.width(lines[i]))
    w += 6
    var h = lines.length * 7 + 4
    var x = root.vw - w - 2
    ctx.fillStyle = root.ink
    ctx.fillRect(x - 1, 1, w + 2, h + 2)
    ctx.fillStyle = root.snow
    ctx.fillRect(x, 2, w, h)
    ctx.fillStyle = root.ink
    for (var j = 0; j < lines.length; j++)
      Font.draw(ctx, x + 3, 4 + j * 7, lines[j])
  }

  function drawTitle(ctx) {
    var cx = root.vw / 2
    var y = Math.round(root.vh * 0.14)
    var logoUrl = root.spriteUrl(Sprites.LOGO)
    if (canvas.isImageLoaded(logoUrl)) {
      ctx.drawImage(logoUrl, Math.round(cx - Sprites.width(Sprites.LOGO) / 2), y)
    }
    y += Sprites.height(Sprites.LOGO) + 6
    var rest = [Sprites.VERSION, Sprites.HINT_NUMPAD, Sprites.HINT_KEYS]
    for (var i = 0; i < rest.length; i++) {
      var url = root.spriteUrl(rest[i])
      if (canvas.isImageLoaded(url)) {
        ctx.drawImage(url, Math.round(cx - Sprites.width(rest[i]) / 2), y)
      }
      y += Sprites.height(rest[i]) + 5
    }
    ctx.fillStyle = root.ink
    var hint = "PRESS ANY KEY TO SKI"
    Font.draw(ctx, Math.round(cx - Font.width(hint) / 2),
              Math.min(y + 4, root.vh - 10), hint)
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
    canvas.requestPaint()
  }

  Keys.onPressed: function (event) {
    var s = root.sim

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
      Engine.setHeading(s, 0); break

    // --- jump -----------------------------------------------------------
    case Qt.Key_Up:
    case Qt.Key_W:
    case Qt.Key_Space:
    case Qt.Key_Insert:
      Engine.jump(s, root.events); break

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
      s.paused = !s.paused; break
    case Qt.Key_H:
      root.hudVisible = !root.hudVisible; break
    case Qt.Key_Y:
      // Summon him early, for the brave.
      if (!s.yeti) Engine.spawnYeti(s, s.viewAbove)
      break
    case Qt.Key_Escape:
      Qt.quit(); break
    }
    canvas.requestPaint()
  }

  Keys.onReleased: function (event) {
    var s = root.sim
    switch (event.key) {
    case Qt.Key_F:
      s.fast = false; break
    case Qt.Key_Home:
    case Qt.Key_PageUp:
      s.climbing = 0; break
    }
  }

  // Mouse steering: the skier turns toward the pointer, and clicking jumps.
  MouseArea {
    anchors.fill: parent
    acceptedButtons: Qt.LeftButton | Qt.RightButton
    hoverEnabled: true

    onPositionChanged: function (mouse) {
      if (!root.started) return
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
      canvas.requestPaint()
    }
  }
}
