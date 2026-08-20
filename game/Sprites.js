.pragma library

// Catalog of the 89 bitmaps embedded in the official ski32.exe, mapped from
// raw resource id to the role each one plays in the game. Every sprite is
// referenced by name from here so the engine never hardcodes a bare number.
//
// Resource ids are stable across Chris Pirih's 16-bit 1991 build and his
// 32-bit 2005 rebuild; they were identified by rendering each bitmap and
// cross-referencing the original game's on-screen behaviour.

// --------------------------------------------------------------------------
// The skier
// --------------------------------------------------------------------------
//
// SkiFree steers through seven discrete headings. Sprites 2..7 cover the
// right-hand half plus straight-down, and the mirrored pairs (2/5, 4/7) give
// the left-hand half. Mirroring is verified programmatically: sprite 5 is
// exactly sprite 2 flipped, and 7 is exactly 4 flipped.
var SKIER_DOWN = 1;        // tucked, pointing straight downhill (fastest)
var SKIER_DIAG_R = 2;      // carving down-right
var SKIER_TRAV_R = 3;      // traversing right, heavy edge
var SKIER_SIDE_R = 4;      // sideways right, nearly stopped
var SKIER_DIAG_L = 5;      // mirror of SKIER_DIAG_R
var SKIER_TRAV_L = 6;      // mirror of SKIER_TRAV_R
var SKIER_SIDE_L = 7;      // mirror of SKIER_SIDE_R

// Headings run left (-3) to right (+3), 0 being straight downhill. Index with
// heading + 3. Entries are [resourceId, mirrored].
var SKIER_BY_HEADING = [
  [SKIER_SIDE_L, false], // -3 hard left
  [SKIER_TRAV_L, false], // -2
  [SKIER_DIAG_L, false], // -1
  [SKIER_DOWN, false],   //  0 straight down
  [SKIER_DIAG_R, false], // +1
  [SKIER_TRAV_R, false], // +2
  [SKIER_SIDE_R, false]  // +3 hard right
];

// Walking/side-stepping uphill.
var SKIER_STEP_L = 8;
var SKIER_STEP_R = 9;
var SKIER_CLIMB_L = 10;
var SKIER_CLIMB_R = 11;

// --------------------------------------------------------------------------
// Crashes and recovery
// --------------------------------------------------------------------------
var CRASH_OUCH = 12;       // the "OUCH!" starburst - hitting a tree or rock
var CRASH_SIT = 13;        // sitting in the snow, skis splayed
var CRASH_SPRAWL = 18;     // wiped out after a bad landing
var CRASH_HEADFIRST = 19;  // buried head-first in the snow
var CRASH_TANGLE = 20;     // upside down, legs tangled
var GETTING_UP_L = 21;
var GETTING_UP_R = 22;

// --------------------------------------------------------------------------
// Airborne and tricks
// --------------------------------------------------------------------------
var JUMP_LOW = 14;         // small air off a mogul
var JUMP_HIGH_L = 15;      // big air, arms wide
var JUMP_HIGH_R = 16;      // mirror of JUMP_HIGH_L
var JUMP_TUCK = 17;        // tucked, spraying snow

// A backflip cycles through these four frames.
var FLIP_FRAMES = [JUMP_HIGH_L, JUMP_TUCK, CRASH_HEADFIRST, JUMP_HIGH_R];

// --------------------------------------------------------------------------
// Other skiers and boarders on the hill
// --------------------------------------------------------------------------
var SKIER2_DOWN = 28;
var SKIER2_DIAG_L = 29;
var SKIER2_DIAG_R = 30;
var SKIER2_CRASH = 31;
var SKIER2_SPRAWL = 32;

var BOARDER_A = 37;
var BOARDER_B = 38;
var BOARDER_C = 39;
var BOARDER_D = 40;
var BOARDER_CRASH_A = 41;
var BOARDER_CRASH_B = 42;
var BOARDER_CRASH_C = 43;
var BOARDER_CRASH_D = 44;
var BOARDER_FRAMES = [BOARDER_A, BOARDER_B, BOARDER_C, BOARDER_D];

// The dog, and its "woof!" bark frames.
var DOG_A = 33;
var DOG_B = 34;
var DOG_BARK_A = 35;
var DOG_BARK_B = 36;
var DOG_FRAMES = [DOG_A, DOG_B];
var DOG_BARK_FRAMES = [DOG_BARK_A, DOG_BARK_B];

// --------------------------------------------------------------------------
// Terrain and obstacles
// --------------------------------------------------------------------------
var ROCK = 45;             // grey boulder - crash
var STUMP = 46;            // mossy stump - crash
var MOGUL_SMALL = 47;      // low bump - small jump
var MOGUL_LARGE = 48;      // big bump - bigger jump
var RAMP = 52;             // rainbow ramp - big air
var TREE = 49;             // evergreen - crash
var TREE_BARE = 50;        // dead tree - crash
var TREE_BIG = 51;         // the tall pine
var TREE_XMAS_A = 87;      // decorated trees (the original's holiday flourish)
var TREE_XMAS_B = 88;
var TREE_XMAS_C = 89;
var TREE_BURNT_A = 83;     // a tree the yeti has torched
var TREE_BURNT_B = 84;
var TREE_BURNT_C = 85;
var CLOUD = 27;            // drifts across the slope, purely decorative
var SNOW_PATCH = 82;       // bare patch of dirt

// Slalom gate flags: a left-hand and a right-hand marker.
var FLAG_LEFT = 23;
var FLAG_RIGHT = 24;
var GATE_GREEN = 25;       // smiling target - cleared the gate
var GATE_RED = 26;         // scowling target - missed the gate

// The chairlift: a tower, then loaded and empty chairs.
var LIFT_TOWER = 64;
var LIFT_CHAIR_FULL = 65;
var LIFT_CHAIR_PAIR = 66;
var LIFT_CHAIR_EMPTY = 67;

// --------------------------------------------------------------------------
// Signage
// --------------------------------------------------------------------------
var LOGO = 53;             // "SkiFree - Copyright 1991 by Chris Pirih"
var VERSION = 54;          // "Version 1.04"
var HINT_NUMPAD = 55;      // "Use NumPad (0-9) for better control"
var HINT_KEYS = 56;        // "F2 = Restart / F3 = Pause"
var SIGN_START_R = 57;
var SIGN_START_L = 58;
var SIGN_FINISH_R = 59;
var SIGN_FINISH_L = 60;
var SIGN_SLALOM = 61;      // "Slalom"
var SIGN_TREE_SLALOM = 62; // "Tree Slalom"
var SIGN_FREESTYLE = 63;   // "Free style"

// --------------------------------------------------------------------------
// The Abominable Snow Monster
// --------------------------------------------------------------------------
var YETI_ARMS_UP_A = 68;   // roaring, arms raised
var YETI_ARMS_UP_B = 69;
var YETI_RUN_A = 70;       // loping downhill after you
var YETI_RUN_B = 71;
var YETI_RUN_C = 72;
var YETI_RUN_D = 73;
var YETI_LEAP_A = 74;      // pouncing, head down
var YETI_LEAP_B = 75;
var YETI_EAT_A = 76;       // skier in its jaws
var YETI_EAT_B = 77;
var YETI_EAT_C = 78;
var YETI_EAT_D = 79;
var YETI_CHEW = 80;        // chewing, satisfied
var YETI_BURP = 81;        // the burp, with a stray ski
var SKI_SCRAP = 86;        // all that is left of you

var YETI_RUN_FRAMES = [YETI_RUN_A, YETI_RUN_B, YETI_RUN_C, YETI_RUN_D];
var YETI_ROAR_FRAMES = [YETI_ARMS_UP_A, YETI_ARMS_UP_B];
var YETI_LEAP_FRAMES = [YETI_LEAP_A, YETI_LEAP_B];
var YETI_EAT_FRAMES = [YETI_EAT_A, YETI_EAT_B, YETI_EAT_C, YETI_EAT_D,
                       YETI_CHEW, YETI_CHEW, YETI_BURP, YETI_BURP];

// --------------------------------------------------------------------------
// Metrics
// --------------------------------------------------------------------------
//
// Sprite dimensions, so the engine can size and centre images without waiting
// on asynchronous image loads. Taken from the DIB headers in ski32.exe.
var SIZES = {
  1: [16, 32], 2: [16, 32], 3: [24, 28], 4: [24, 28], 5: [16, 32],
  6: [24, 28], 7: [24, 28], 8: [24, 28], 9: [24, 28], 10: [24, 28],
  11: [24, 28], 12: [32, 32], 13: [32, 24], 14: [32, 32], 15: [28, 31],
  16: [28, 31], 17: [28, 34], 18: [32, 26], 19: [32, 32], 20: [31, 24],
  21: [25, 31], 22: [25, 31], 23: [12, 24], 24: [12, 24], 25: [12, 24],
  26: [12, 24], 27: [64, 32], 28: [24, 30], 29: [22, 29], 30: [21, 29],
  31: [24, 24], 32: [24, 24], 33: [21, 15], 34: [21, 15], 35: [19, 19],
  36: [19, 19], 37: [26, 30], 38: [20, 30], 39: [25, 31], 40: [30, 29],
  41: [32, 32], 42: [32, 32], 43: [25, 29], 44: [29, 25], 45: [23, 11],
  46: [16, 11], 47: [16, 4], 48: [24, 8], 49: [28, 32], 50: [22, 27],
  51: [32, 64], 52: [32, 8], 53: [93, 57], 54: [52, 10], 55: [92, 30],
  56: [63, 32], 57: [42, 27], 58: [42, 27], 59: [50, 29], 60: [50, 29],
  61: [40, 36], 62: [44, 36], 63: [40, 35], 64: [24, 64], 65: [26, 32],
  66: [26, 32], 67: [26, 32], 68: [32, 48], 69: [32, 48], 70: [32, 48],
  71: [32, 48], 72: [32, 48], 73: [32, 48], 74: [32, 48], 75: [32, 48],
  76: [32, 48], 77: [32, 48], 78: [32, 48], 79: [32, 48], 80: [32, 48],
  81: [32, 48], 82: [16, 8], 83: [22, 27], 84: [22, 27], 85: [22, 27],
  86: [8, 11], 87: [28, 32], 88: [28, 32], 89: [28, 32]
};

function size(id) {
  return SIZES[id] || [16, 16];
}

function width(id) {
  return size(id)[0];
}

function height(id) {
  return size(id)[1];
}

function fileName(id) {
  return (id < 10 ? "00" : id < 100 ? "0" : "") + id + ".png";
}
