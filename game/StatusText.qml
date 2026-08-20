import QtQuick

// One cell of the status box. The original uses a bold fixed-pitch face so the
// digits stay put as they tick, drawn with no antialiasing.
Text {
  // Integer zoom of the scene, so the box grows with the sprites.
  required property int zoom

  // Column widths, in characters, sized for "Speed:" and "0:01:36.54".
  readonly property real charWidth: font.pixelSize * 0.62
  readonly property real labelWidth: 6 * charWidth
  readonly property real valueWidth: 11 * charWidth

  font.family: "monospace"
  font.pixelSize: 7 * zoom
  font.bold: true
  color: "black"
  renderType: Text.NativeRendering
}
