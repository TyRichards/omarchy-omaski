import QtQuick
import Quickshell
import Quickshell.Io

// The game window.
//
// The launcher applies one-shot Hyprland rules that float this window at the
// exact geometry Omarchy's "single-window square aspect ratio" layout would
// produce, so Omaski opens as a true 1:1 square in the same place a lone
// maximised window would sit.
//
// The size is requested, not locked: pinning minimumSize to maximumSize makes
// the compositor destroy the window if a user's config tiles it instead. The
// playfield simply adapts to whatever size it is given.
FloatingWindow {
  id: window

  // Live reload: quickshell watches the game's QML/JS files (on by
  // default) and reloads the config in place when they change, reusing
  // this window — code edits land in the open pane, no respawn, no
  // re-tiling. OMASKI_NO_WATCH=1 opts out for throwaway test runs.
  Component.onCompleted:
    Quickshell.watchFiles = Quickshell.env("OMASKI_NO_WATCH") !== "1"

  // Manual nudge for changes the file watcher cannot see (sprite-editor
  // tooling, git checkout of identical-mtime trees):
  //   quickshell ipc -p <plugin>/game call dev reload
  IpcHandler {
    target: "dev"
    function reload(): string {
      Quickshell.reload(false)
      return "reloading"
    }
  }

  // Preferred edge length in logical pixels, from the launcher.
  readonly property int side: {
    var value = parseInt(Quickshell.env("OMASKI_SIDE") || "", 10)
    return isNaN(value) || value < 320 ? 886 : value
  }

  // Where the sprites live. They ship with the plugin in assets/sprites,
  // next to this shell's directory. Qt.resolvedUrl cannot be used here
  // because Quickshell serves QML from a virtual qrc filesystem, so the real
  // path comes from Quickshell.shellDir. OMASKI_SPRITES overrides it for
  // experiments with alternative sprite sets.
  readonly property string spriteDir: {
    var dir = Quickshell.env("OMASKI_SPRITES") || ""
    if (dir !== "") return dir
    return Quickshell.shellDir + "/../assets/sprites"
  }

  title: "Omaski"
  visible: true
  // The snow colour, so the window ground reads as background around the
  // framed screen instead of black bars.
  color: "#FFF1E8"

  implicitWidth: side
  implicitHeight: side
  minimumSize: Qt.size(320, 320)
  maximized: false
  fullscreen: false

  Game {
    anchors.fill: parent
    spriteDir: window.spriteDir
    windowActive: true
    focus: true
    // Debug only: start this many metres down the hill. See Game.qml.
    debugStartEnv: Quickshell.env("OMASKI_DEBUG_START") || ""
  }

  // ------------------------------------------------------------------------
  // Shutdown
  // ------------------------------------------------------------------------
  //
  // Quickshell keeps its process alive after the last window closes, so the
  // shell has to exit deliberately. Closing the window is the only way out
  // besides Escape, and Qt reports that as `closed` on the FloatingWindow.
  //
  // `closed` on its own is not trustworthy: Hyprland also emits it when it
  // merely unmaps the window, which happens on every workspace switch. So the
  // signal is treated as a hint, and confirmed by asking the compositor
  // whether the client is really gone. Only a clear "no" quits, and a failed
  // or empty query is ignored rather than treated as a close.

  property int confirmations: 0

  onClosed: {
    window.confirmations = 0
    confirm.restart()
  }

  // Remapping cancels a pending confirmation.
  onVisibleChanged: if (visible) { confirm.stop(); window.confirmations = 0 }

  Timer {
    id: confirm
    interval: 700
    repeat: true
    // Three agreeing answers, so one hiccup cannot close the game.
    onTriggered: if (!clientCheck.running) clientCheck.running = true
  }

  Process {
    id: clientCheck
    command: ["bash", "-c",
      "hyprctl clients -j | jq -e -r 'any(.[]; .class == \"io.github.tyrichards.omaski\")'"]
    stdout: StdioCollector {
      waitForEnd: true
      onStreamFinished: {
        var answer = text.trim()
        if (answer === "true") {
          // Still there: it was only an unmap.
          confirm.stop()
          window.confirmations = 0
        } else if (answer === "false") {
          window.confirmations++
          if (window.confirmations >= 3) Qt.quit()
        }
        // Anything else means the query failed; wait and ask again.
      }
    }
  }
}
