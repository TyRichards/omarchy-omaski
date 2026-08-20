import QtQuick

// A single original SkiFree bitmap, drawn with hard nearest-neighbour edges.
//
// The sprites are 1991 pixel art, so any smoothing turns them to mush. The
// game scales by whole numbers only and rounds every position to the device
// pixel grid, which keeps the art as crisp as it looked on a VGA monitor.
Image {
  id: root

  // Resource id from Sprites.js.
  required property int sprite
  // Native pixel size of this bitmap.
  required property int nativeWidth
  required property int nativeHeight
  // Integer scale factor applied to every sprite in the scene.
  required property int zoom
  // Directory holding the extracted PNGs.
  required property string spriteDir
  // Mirror horizontally, for the flipped halves of the skier's turn arc.
  property bool flipped: false

  source: spriteDir + "/" + fileName(sprite)
  width: nativeWidth * zoom
  height: nativeHeight * zoom

  // Nearest-neighbour, no mipmaps, no filtering of any kind.
  smooth: false
  mipmap: false
  antialiasing: false
  cache: true
  asynchronous: false
  fillMode: Image.Stretch
  // Ask the loader for the native size so Qt never pre-scales the texture.
  sourceSize: Qt.size(nativeWidth, nativeHeight)

  transform: Scale {
    origin.x: root.width / 2
    xScale: root.flipped ? -1 : 1
  }

  function fileName(id) {
    return (id < 10 ? "00" : id < 100 ? "0" : "") + id + ".png"
  }
}
