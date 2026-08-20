import QtQuick
import "Engine.js" as Engine
import "Sprites.js" as Sprites

// The playfield. Draws the slope, the skier, and the status box, and pumps the
// simulation at a fixed 60 Hz regardless of how often the view repaints.
FocusScope {
  id: root

  required property string spriteDir
  property bool windowActive: true

  // Integer zoom keeps the 1991 art pixel-exact. The original ran at roughly
  // 1:1 on a 640x480 VGA screen; on a modern high-density panel a 2x or 3x
  // zoom reproduces the same apparent sprite size.
  readonly property int zoom: {
    var target = Math.min(width, height)
    if (target <= 0) return 2
    var byHeight = Math.floor(target / 300)
    return Math.max(2, Math.min(4, byHeight))
  }

  // Metres visible across the viewport.
  readonly property real metresWide: width / (Engine.PIXELS_PER_METRE * zoom)
  readonly property real metresTall: height / (Engine.PIXELS_PER_METRE * zoom)
  // Slope visible uphill of the skier, which is where the monster comes from.
  readonly property real metresAbove: skierScreenY / (Engine.PIXELS_PER_METRE * zoom)

  // Keep the simulation told about the view, so the yeti enters from just off
  // screen no matter how the window is sized.
  onMetresAboveChanged: root.sim.viewAbove = root.metresAbove

  // The skier sits about a third of the way down, as in the original, so you
  // can see what is coming.
  readonly property real skierScreenY: height * 0.34

  property var sim: Engine.createState()
  property int repaint: 0
  property var events: []

  // Debug hook, off unless OMARSKI_DEBUG_START is set to a distance in metres.
  // Skips the title card and starts that far down the hill, so the late game
  // and the monster can be exercised without skiing two kilometres first.
  readonly property int debugStart: {
    var value = parseInt(root.debugStartEnv || "", 10)
    return isNaN(value) || value < 0 ? 0 : value
  }
  property string debugStartEnv: ""

  property bool started: false

  focus: true
  clip: true

  Component.onCompleted: {
    // Tell the simulation how much slope is visible above the skier.
    root.sim.viewAbove = root.metresAbove
    if (root.debugStart > 0) {
      root.sim.distance = root.debugStart
      root.sim.y = root.debugStart
      root.started = true
    }
    // A FocusScope only receives key events once it actually holds active
    // focus, so claim it as soon as the item is realised. There is
    // deliberately no watchdog that re-grabs focus whenever it is lost: that
    // fights the window manager and spins.
    root.forceActiveFocus()
  }

  // ------------------------------------------------------------------------
  // Simulation clock
  // ------------------------------------------------------------------------

  Timer {
    id: clock
    interval: Math.round(1000 / Engine.TICK_HZ)
    repeat: true
    // The hill stays still until you take your first run, so the title card
    // is readable and you are not eaten while reading it.
    running: root.windowActive && root.started && !root.sim.over
    onTriggered: {
      root.events = []
      Engine.step(root.sim, interval / 1000, root.events)
      root.repaint++
    }
  }

  // ------------------------------------------------------------------------
  // World to screen
  // ------------------------------------------------------------------------

  function screenX(worldX) {
    var dx = Engine.wrap(worldX - root.sim.x)
    return Math.round(width / 2 + dx * Engine.PIXELS_PER_METRE * zoom)
  }

  function screenY(worldY) {
    var dy = Engine.wrap(worldY - root.sim.y)
    return Math.round(skierScreenY + dy * Engine.PIXELS_PER_METRE * zoom)
  }

  // ------------------------------------------------------------------------
  // Slope
  // ------------------------------------------------------------------------

  Rectangle {
    anchors.fill: parent
    color: "white"
  }

  // Everything in the world, sorted so lower objects overlap higher ones.
  Repeater {
    id: field

    model: {
      root.repaint  // re-evaluate every tick
      var pad = 3
      var list = Engine.objectsIn(
        root.sim.x - root.metresWide / 2 - pad,
        root.sim.y - root.skierScreenY / (Engine.PIXELS_PER_METRE * root.zoom) - pad,
        root.sim.x + root.metresWide / 2 + pad,
        root.sim.y + root.metresTall + pad,
        root.sim.course)

      // Course signage near the start.
      if (root.sim.y < Engine.SIGN_ROW + 60) {
        for (var i = 0; i < Engine.COURSES.length; i++) {
          var c = Engine.COURSES[i]
          list.push({
            kind: Engine.DECOR, sprite: c.sign,
            x: c.x, y: Engine.SIGN_ROW,
            w: Sprites.width(c.sign) / Engine.PIXELS_PER_METRE,
            h: Sprites.height(c.sign) / Engine.PIXELS_PER_METRE
          })
        }
      }

      // Start and finish banners flanking the active course.
      var spec = Engine.courseById(root.sim.course)
      if (spec && root.sim.course !== Engine.COURSE_FREESTYLE) {
        var banners = [
          { y: Engine.courseStartY(), l: Sprites.SIGN_START_L, r: Sprites.SIGN_START_R },
          { y: Engine.courseFinishY(root.sim.course), l: Sprites.SIGN_FINISH_L,
            r: Sprites.SIGN_FINISH_R }
        ]
        for (var b = 0; b < banners.length; b++) {
          var side = 13
          list.push({
            kind: Engine.DECOR, sprite: banners[b].l,
            x: spec.x - side, y: banners[b].y,
            w: Sprites.width(banners[b].l) / Engine.PIXELS_PER_METRE,
            h: Sprites.height(banners[b].l) / Engine.PIXELS_PER_METRE
          })
          list.push({
            kind: Engine.DECOR, sprite: banners[b].r,
            x: spec.x + side, y: banners[b].y,
            w: Sprites.width(banners[b].r) / Engine.PIXELS_PER_METRE,
            h: Sprites.height(banners[b].r) / Engine.PIXELS_PER_METRE
          })
        }
      }

      // Slalom gates for the active course.
      var gates = Engine.gatesFor(root.sim.course)
      for (var g = 0; g < gates.length; g++) {
        var gate = gates[g]
        var passed = g < root.sim.nextGate
        list.push({
          kind: Engine.DECOR, sprite: Sprites.FLAG_LEFT,
          x: gate.x - gate.halfWidth, y: gate.y,
          w: Sprites.width(Sprites.FLAG_LEFT) / Engine.PIXELS_PER_METRE,
          h: Sprites.height(Sprites.FLAG_LEFT) / Engine.PIXELS_PER_METRE
        })
        list.push({
          kind: Engine.DECOR, sprite: Sprites.FLAG_RIGHT,
          x: gate.x + gate.halfWidth, y: gate.y,
          w: Sprites.width(Sprites.FLAG_RIGHT) / Engine.PIXELS_PER_METRE,
          h: Sprites.height(Sprites.FLAG_RIGHT) / Engine.PIXELS_PER_METRE
        })
        if (passed) {
          // A smiling marker for a gate you cleared, a scowling one for a miss.
          var marker = root.sim.gateResults[g] ? Sprites.GATE_GREEN
                                               : Sprites.GATE_RED
          list.push({
            kind: Engine.DECOR, sprite: marker,
            x: gate.x, y: gate.y,
            w: Sprites.width(marker) / Engine.PIXELS_PER_METRE,
            h: Sprites.height(marker) / Engine.PIXELS_PER_METRE
          })
        }
      }

      list.sort(function (a, b) { return a.y - b.y })
      return list
    }

    delegate: PixelSprite {
      required property var modelData
      sprite: modelData.sprite
      nativeWidth: Sprites.width(modelData.sprite)
      nativeHeight: Sprites.height(modelData.sprite)
      zoom: root.zoom
      spriteDir: root.spriteDir
      // Objects are anchored at the base of the sprite, so the skier's feet
      // and a tree's trunk meet on the same ground line.
      x: root.screenX(modelData.x) - width / 2
      y: root.screenY(modelData.y) - height
      opacity: modelData.cloud ? 0.85 : 1.0
    }
  }

  // ------------------------------------------------------------------------
  // The skier
  // ------------------------------------------------------------------------

  PixelSprite {
    id: skier
    readonly property var frame: {
      root.repaint
      return Engine.skierSprite(root.sim)
    }

    visible: !root.sim.eaten
    sprite: frame[0]
    flipped: frame[1]
    nativeWidth: Sprites.width(frame[0])
    nativeHeight: Sprites.height(frame[0])
    zoom: root.zoom
    spriteDir: root.spriteDir
    x: Math.round(root.width / 2 - width / 2)
    // Airborne height lifts the sprite up the screen.
    y: {
      root.repaint
      return Math.round(root.skierScreenY - height
        - root.sim.height * Engine.PIXELS_PER_METRE * root.zoom)
    }
    z: 10
  }

  // A shadow on the snow while airborne, so you can judge your landing.
  Rectangle {
    visible: root.sim.airborne && root.sim.height > 0.3
    width: 10 * root.zoom
    height: 3 * root.zoom
    radius: height / 2
    color: "#20000000"
    x: Math.round(root.width / 2 - width / 2)
    y: {
      root.repaint
      return Math.round(root.skierScreenY - height / 2)
    }
    z: 9
  }

  // ------------------------------------------------------------------------
  // Dogs, snowboarders and other skiers
  // ------------------------------------------------------------------------

  Repeater {
    model: {
      root.repaint
      var out = []
      var list = root.sim.critters
      for (var i = 0; i < list.length; i++) {
        var frame = Engine.critterSprite(list[i])
        out.push({
          sprite: frame[0],
          flipped: frame[1],
          x: list[i].x,
          y: list[i].y
        })
      }
      return out
    }

    delegate: PixelSprite {
      required property var modelData
      sprite: modelData.sprite
      flipped: modelData.flipped
      nativeWidth: Sprites.width(modelData.sprite)
      nativeHeight: Sprites.height(modelData.sprite)
      zoom: root.zoom
      spriteDir: root.spriteDir
      x: root.screenX(modelData.x) - width / 2
      y: root.screenY(modelData.y) - height
      z: 8
    }
  }

  // ------------------------------------------------------------------------
  // The monster
  // ------------------------------------------------------------------------

  PixelSprite {
    id: yeti
    readonly property var info: {
      root.repaint
      var s = root.sim
      if (s.eaten) {
        return { sprite: Sprites.YETI_EAT_FRAMES[s.eatFrame],
                 x: s.x, y: s.y }
      }
      if (!s.yeti) return null
      var frames = s.yeti.mode === "roar" ? Sprites.YETI_ROAR_FRAMES
                 : s.yeti.mode === "leap" ? Sprites.YETI_LEAP_FRAMES
                 : Sprites.YETI_RUN_FRAMES
      return { sprite: frames[s.yeti.frame % frames.length],
               x: s.yeti.x, y: s.yeti.y }
    }

    visible: info !== null
    sprite: info ? info.sprite : Sprites.YETI_RUN_A
    nativeWidth: Sprites.width(sprite)
    nativeHeight: Sprites.height(sprite)
    zoom: root.zoom
    spriteDir: root.spriteDir
    x: info ? root.screenX(info.x) - width / 2 : 0
    y: info ? root.screenY(info.y) - height : 0
    z: 11
  }

  // ------------------------------------------------------------------------
  // Status box, mirroring the original's top-right readout
  // ------------------------------------------------------------------------

  Rectangle {
    id: statusBox
    anchors.top: parent.top
    anchors.right: parent.right
    anchors.margins: 4 * root.zoom
    width: statusGrid.implicitWidth + 10 * root.zoom
    height: statusGrid.implicitHeight + 8 * root.zoom
    color: "white"
    border.color: "black"
    border.width: Math.max(1, root.zoom / 2)
    visible: root.hudVisible
    z: 50

    // Four label/value rows: Time, Dist, Speed, Style.
    Column {
      id: statusGrid
      anchors.centerIn: parent
      spacing: 1 * root.zoom

      Repeater {
        model: {
          root.repaint
          var s = root.sim
          return [
            { label: "Time:", value: Engine.formatTime(s.elapsed) },
            { label: "Dist:", value: Engine.formatDistance(s.distance) },
            { label: "Speed:", value: Engine.formatSpeed(s.speed) },
            { label: "Style:", value: Engine.formatStyle(s.style) }
          ]
        }

        // Each entry emits its label cell and its value cell.
        delegate: Row {
          required property var modelData
          spacing: 5 * root.zoom

          StatusText {
            zoom: root.zoom
            text: parent.modelData.label
            width: labelWidth
          }
          StatusText {
            zoom: root.zoom
            text: parent.modelData.value
            width: valueWidth
            horizontalAlignment: Text.AlignRight
          }
        }
      }
    }
  }

  property bool hudVisible: true

  // ------------------------------------------------------------------------
  // Overlays
  // ------------------------------------------------------------------------

  // Title card, shown until the first input, like the original's splash.
  Column {
    anchors.centerIn: parent
    anchors.verticalCenterOffset: -root.height * 0.08
    spacing: 6 * root.zoom
    visible: !root.started
    z: 60

    PixelSprite {
      sprite: Sprites.LOGO
      nativeWidth: Sprites.width(Sprites.LOGO)
      nativeHeight: Sprites.height(Sprites.LOGO)
      zoom: root.zoom
      spriteDir: root.spriteDir
      anchors.horizontalCenter: parent.horizontalCenter
    }
    PixelSprite {
      sprite: Sprites.HINT_NUMPAD
      nativeWidth: Sprites.width(Sprites.HINT_NUMPAD)
      nativeHeight: Sprites.height(Sprites.HINT_NUMPAD)
      zoom: root.zoom
      spriteDir: root.spriteDir
      anchors.horizontalCenter: parent.horizontalCenter
    }
    PixelSprite {
      sprite: Sprites.HINT_KEYS
      nativeWidth: Sprites.width(Sprites.HINT_KEYS)
      nativeHeight: Sprites.height(Sprites.HINT_KEYS)
      zoom: root.zoom
      spriteDir: root.spriteDir
      anchors.horizontalCenter: parent.horizontalCenter
    }
    StatusText {
      anchors.horizontalCenter: parent.horizontalCenter
      zoom: root.zoom
      text: "Press any key to ski"
    }
  }

  // Course result, shown once you cross the finish banner.
  Rectangle {
    anchors.horizontalCenter: parent.horizontalCenter
    anchors.top: parent.top
    anchors.topMargin: root.height * 0.16
    width: resultCol.implicitWidth + 14 * root.zoom
    height: resultCol.implicitHeight + 10 * root.zoom
    color: "white"
    border.color: "black"
    border.width: Math.max(1, root.zoom / 2)
    visible: root.sim.courseFinished
    z: 60

    Column {
      id: resultCol
      anchors.centerIn: parent
      spacing: 2 * root.zoom

      Repeater {
        model: {
          root.repaint
          var s = root.sim
          var spec = Engine.courseById(s.course)
          return [
            (spec ? spec.label : "Course") + " complete",
            "Time:  " + Engine.formatTime(s.courseTime),
            "Gates: " + s.gatesCleared + " of "
              + (s.gatesCleared + s.gatesMissed),
            "Style: " + Engine.formatStyle(s.style).replace(/^ +/, ""),
            "F2 to restart"
          ]
        }
        delegate: StatusText {
          required property string modelData
          zoom: root.zoom
          text: modelData
        }
      }
    }
  }

  // Paused banner, wording taken from the original's string table.
  Rectangle {
    anchors.centerIn: parent
    width: pausedText.implicitWidth + 12 * root.zoom
    height: pausedText.implicitHeight + 8 * root.zoom
    color: "white"
    border.color: "black"
    border.width: Math.max(1, root.zoom / 2)
    visible: root.sim.paused
    z: 60

    StatusText {
      id: pausedText
      anchors.centerIn: parent
      zoom: root.zoom
      text: "Ski Paused ... Press F3 to continue"
    }
  }

  // Eaten. The original just leaves you there; F2 restarts.
  Rectangle {
    anchors.horizontalCenter: parent.horizontalCenter
    anchors.bottom: parent.bottom
    anchors.bottomMargin: root.height * 0.12
    width: overText.implicitWidth + 12 * root.zoom
    height: overText.implicitHeight + 8 * root.zoom
    color: "white"
    border.color: "black"
    border.width: Math.max(1, root.zoom / 2)
    visible: root.sim.over
    z: 60

    StatusText {
      id: overText
      anchors.centerIn: parent
      zoom: root.zoom
      text: "You have been eaten.  Press F2 to restart."
    }
  }

  // ------------------------------------------------------------------------
  // Input
  // ------------------------------------------------------------------------
  //
  // The original accepts arrow keys, the numeric keypad (which is why it says
  // "Use NumPad (0-9) for better control"), Home/Insert, and the mouse.
  // Numpad 1-9 set an absolute heading; arrows nudge it.

  function restart() {
    root.sim = Engine.createState()
    root.started = false
    root.repaint++
  }

  Keys.onPressed: function (event) {
    var s = root.sim

    // Any key dismisses the title card.
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

    // --- absolute headings on the numpad, as in the original -------------
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
      if (!s.yeti) Engine.spawnYeti(s, root.metresAbove)
      break
    case Qt.Key_Escape:
      Qt.quit(); break
    }
    root.repaint++
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
      var dy = mouse.y - root.skierScreenY
      // Pointer above the skier means side-step uphill.
      if (dy < -8) return
      var span = root.width / 2
      var norm = Math.max(-1, Math.min(1, dx / (span * 0.6)))
      Engine.setHeading(root.sim, Math.round(norm * 3))
      root.repaint++
    }

    onPressed: function (mouse) {
      // Clicking must not leave the key handler without focus.
      root.forceActiveFocus()
      root.started = true
      if (mouse.button === Qt.LeftButton) Engine.jump(root.sim, root.events)
      root.repaint++
    }
  }
}
