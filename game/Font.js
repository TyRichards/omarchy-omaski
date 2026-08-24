.pragma library

// The PICO-8 system font (released CC-0 by Lexaloffle): 3x5 glyphs on a
// 4-pixel advance, strictly monospace — even the dot fills a 3-wide box, so
// columns of digits hold still. Extracted pixel-for-pixel from the published
// font sheet, including the real ❎ and 🅾 controller-button glyphs (7 wide,
// mapped to "❎"/"Ⓞ"). tools/make-sprites.py uses the same table for the
// baked sprites, so the HUD and the signage share a voice. Drawn one filled
// rect per pixel straight onto the game's low-resolution canvas.

var GLYPHS = {
  "A": "### #.# ### #.# #.#", "B": "### #.# ##. #.# ###",
  "C": ".## #.. #.. #.. .##", "D": "##. #.# #.# #.# ###",
  "E": "### #.. ##. #.. ###", "F": "### #.. ##. #.. #..",
  "G": ".## #.. #.. #.# ###", "H": "#.# #.# ### #.# #.#",
  "I": "### .#. .#. .#. ###", "J": "### .#. .#. .#. ##.",
  "K": "#.# #.# ##. #.# #.#", "L": "#.. #.. #.. #.. ###",
  "M": "### ### #.# #.# #.#", "N": "##. #.# #.# #.# #.#",
  "O": ".## #.# #.# #.# ##.", "P": "### #.# ### #.. #..",
  "Q": ".#. #.# #.# ##. .##", "R": "### #.# ##. #.# #.#",
  "S": ".## #.. ### ..# ##.", "T": "### .#. .#. .#. .#.",
  "U": "#.# #.# #.# #.# .##", "V": "#.# #.# #.# ### .#.",
  "W": "#.# #.# #.# ### ###", "X": "#.# #.# .#. #.# #.#",
  "Y": "#.# #.# ### ..# ###", "Z": "### ..# .#. #.. ###",
  "0": "### #.# #.# #.# ###", "1": "##. .#. .#. .#. ###",
  "2": "### ..# ### #.. ###", "3": "### ..# .## ..# ###",
  "4": "#.# #.# ### ..# ..#", "5": "### #.. ### ..# ###",
  "6": "#.. #.. ### #.# ###", "7": "### ..# ..# ..# ..#",
  "8": "### #.# ### #.# ###", "9": "### #.# ### ..# ..#",
  "(": ".#. #.. #.. #.. .#.", ")": ".#. ..# ..# ..# .#.",
  "-": "... ... ### ... ...", "=": "... ### ... ### ...",
  ".": "... ... ... ... .#.", "!": ".#. .#. .#. ... .#.",
  ":": "... .#. ... .#. ...", "/": "..# .#. .#. .#. #..",
  "%": "#.# ..# .#. #.. #.#", "*": "#.# .#. ### .#. #.#",
  "@": ".#. #.# #.# #.. .##", " ": "... ... ... ... ...",
  "<": "..# .#. #.. .#. ..#", ">": "#.. .#. ..# .#. #..",
  "+": "... .#. ### .#. ...", ",": "... ... ... .#. #..",
  ";": "... .#. ... .#. #..", "?": "### ..# .## ... .#.",
  "#": "#.# ### #.# ### #.#", "'": ".#. #.. ... ... ...",
  "\"": "#.# #.# ... ... ...",
  "❎": ".#####. ##.#.## ###.### ##.#.## .#####.",
  "Ⓞ": ".#####. ##...## ##.#.## ##...## .#####."
};

// The "puny" lowercase font from the same official sheet (lowercase
// codepoints): 3x4 glyphs sitting on the shared baseline. Lowercase input
// selects these, so mixed strings like "version 5.1" typeset exactly as
// PICO-8 would.
var PUNY = {
  "A": "... ### #.# ### #.#", "B": "... ##. ##. #.# ###",
  "C": "... ### #.. #.. ###", "D": "... ##. #.# #.# ##.",
  "E": "... ### ##. #.. ###", "F": "... ### ##. #.. #..",
  "G": "... ### #.. #.# ###", "H": "... #.# #.# ### #.#",
  "I": "... ### .#. .#. ###", "J": "... ### .#. .#. ##.",
  "K": "... #.# ##. #.# #.#", "L": "... #.. #.. #.. ###",
  "M": "... ### ### #.# #.#", "N": "... ##. #.# #.# #.#",
  "O": "... .## #.# #.# ##.", "P": "... ### #.# ### #..",
  "Q": "... .#. #.# ##. .##", "R": "... ### #.# ##. #.#",
  "S": "... .## #.. ..# ##.", "T": "... ### .#. .#. .#.",
  "U": "... #.# #.# #.# .##", "V": "... #.# #.# ### .#.",
  "W": "... #.# #.# ### ###", "X": "... #.# .#. #.# #.#",
  "Y": "... #.# ### ..# ###", "Z": "... ### ..# #.. ###"
};

function glyph(ch) {
  if (ch >= "a" && ch <= "z")
    return (PUNY[ch.toUpperCase()] || GLYPHS[" "]).split(" ");
  return (GLYPHS[ch.toUpperCase()] || GLYPHS[" "]).split(" ");
}

var HEIGHT = 5;

// Pixel width of a string at the given scale (default 1).
function width(text, scale) {
  scale = scale || 1;
  var w = 0;
  for (var i = 0; i < text.length; i++) w += glyph(text[i])[0].length + 1;
  return text.length ? (w - 1) * scale : 0;
}

// Draw text at (x, y) in the canvas context's current fillStyle.
function draw(ctx, x, y, text, scale) {
  scale = scale || 1;
  var cx = x;
  for (var i = 0; i < text.length; i++) {
    var rows = glyph(text[i]);
    for (var j = 0; j < rows.length; j++) {
      for (var k = 0; k < rows[j].length; k++) {
        if (rows[j][k] === "#")
          ctx.fillRect(cx + k * scale, y + j * scale, scale, scale);
      }
    }
    cx += (rows[0].length + 1) * scale;
  }
}
