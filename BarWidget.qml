import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

// One bar icon that opens the game, or focuses it if it is already running.
BarWidget {
  id: root
  moduleName: "io.github.tyrichards.omaski"

  readonly property string launcherPath: {
    var value = Qt.resolvedUrl("launch.sh").toString()
    return value.indexOf("file://") === 0 ? value.slice(7) : value
  }

  function launchGame() {
    // launch.sh focuses an existing run, fetches the sprites on first use, and
    // works out the square geometry, so the widget only has to fire it.
    Quickshell.execDetached([root.launcherPath])
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    // nf-md-ski (U+F1304), the downhill skier in Omarchy's JetBrainsMono Nerd Font.
    text: "󱌄"
    onPressed: function (mouseButton) {
      if (mouseButton === Qt.LeftButton) root.launchGame()
    }
  }

  // `omarchy shell ipc call omaski launch` opens or focuses the game, so a
  // keybinding can do what the bar icon does.
  IpcHandler {
    target: "omaski"

    function launch(): void { root.launchGame() }
  }
}
