.pragma library

// Catalog of the 89 original Omarski sprites in assets/sprites/, mapped from
// sprite id to the role each one plays in the game. Every sprite is
// referenced by name from here so the engine never hardcodes a bare number.
//
// The artwork is drawn for this project by tools/make-sprites.py and ships
// with the plugin. The ids and canvas sizes double as the engine's layout
// and collision metrics, so they must stay in step with the generator.

// --------------------------------------------------------------------------
// The skier
// --------------------------------------------------------------------------
//
// Steering runs through seven discrete headings. Sprites 2..7 cover the
// right-hand half plus straight-down, and the mirrored pairs (2/5, 3/6, 4/7)
// give the left-hand half; the generator produces each left sprite by
// flipping its right-hand twin.
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
var LOGO = 53;             // the Omarski title card
var VERSION = 54;          // "Version 2.0"
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
// on asynchronous image loads. Kept identical to tools/make-sprites.py.
var SIZES = {
  1: [8, 16], 2: [8, 16], 3: [12, 14], 4: [12, 14], 5: [8, 16],
  6: [12, 14], 7: [12, 14], 8: [12, 14], 9: [12, 14], 10: [12, 14],
  11: [12, 14], 12: [16, 16], 13: [16, 12], 14: [16, 16], 15: [14, 16],
  16: [14, 16], 17: [14, 17], 18: [16, 13], 19: [16, 16], 20: [16, 12],
  21: [13, 16], 22: [13, 16], 23: [6, 12], 24: [6, 12], 25: [6, 12],
  26: [6, 12], 27: [32, 16], 28: [12, 15], 29: [11, 15], 30: [11, 15],
  31: [12, 12], 32: [12, 12], 33: [11, 8], 34: [11, 8], 35: [10, 10],
  36: [10, 10], 37: [13, 15], 38: [10, 15], 39: [13, 16], 40: [15, 15],
  41: [16, 16], 42: [16, 16], 43: [13, 15], 44: [15, 13], 45: [12, 6],
  46: [8, 6], 47: [8, 3], 48: [12, 4], 49: [14, 16], 50: [11, 14],
  51: [16, 32], 52: [16, 6], 53: [120, 64], 54: [44, 7], 55: [72, 14],
  56: [44, 22], 57: [22, 14], 58: [24, 15], 59: [26, 15], 60: [28, 15],
  61: [27, 18], 62: [29, 18], 63: [25, 18], 64: [12, 32], 65: [13, 16],
  66: [13, 16], 67: [13, 16], 68: [16, 24], 69: [16, 24], 70: [16, 24],
  71: [16, 24], 72: [16, 24], 73: [16, 24], 74: [16, 24], 75: [16, 24],
  76: [16, 24], 77: [16, 24], 78: [16, 24], 79: [16, 24], 80: [16, 24],
  81: [16, 24], 82: [8, 4], 83: [11, 14], 84: [11, 14], 85: [11, 14],
  86: [4, 6], 87: [14, 16], 88: [14, 16], 89: [14, 16]
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
