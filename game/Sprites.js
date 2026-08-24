.pragma library

// Catalog of the 82 original Omaski sprites in assets/sprites/, mapped from
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
var SKIER_SIDE_R = 4;      // skis planted across the fall line: stopped
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

// Rattled over a mogul: arms, poles and skis all fanned out into an X.
var SKIER_BUMP = 96;

// --------------------------------------------------------------------------
// Crashes and recovery
// --------------------------------------------------------------------------
var CRASH_OUCH = 12;       // the blank starburst; the word is drawn over it
var CRASH_SIT = 13;        // down in the snow, skis upright: /\O/\
var CRASH_SPRAWL = 18;     // wiped out after a bad landing
var CRASH_HEADFIRST = 19;  // buried head-first in the snow
var CRASH_TANGLE = 20;     // upside down, legs tangled
var GETTING_UP_L = 21;
var GETTING_UP_R = 22;

// What the starburst may shout. Picked at random on every crash.
var CRASH_WORDS = ["OUCH!", "SH%T!", "F*@%!", "POW!", "ZANG!", "OHNO!",
                   "BIFF!", "KAPOW!", "ZOINK!"];

// --------------------------------------------------------------------------
// Airborne and tricks
// --------------------------------------------------------------------------
var JUMP_V = 14;           // flying V: ski tips up and spread, tails crossed
var JUMP_HIGH_L = 15;      // mid-flip, arms wide
var JUMP_HIGH_R = 16;      // mirror of JUMP_HIGH_L
var JUMP_TUCK = 17;        // tucked, upside down

// A backflip (steered in the air) cycles through these four frames.
var FLIP_FRAMES = [JUMP_HIGH_L, JUMP_TUCK, CRASH_HEADFIRST, JUMP_HIGH_R];

// --------------------------------------------------------------------------
// Other skiers, boarders, dogs and deer on the hill
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

// Deer trot straight across the slope. Hit one and it bursts; you carry on.
var DEER_A = 90;
var DEER_B = 91;
var DEER_SPLAT_A = 92;     // the burst
var DEER_SPLAT_B = 93;     // the settled pool
var DEER_FRAMES = [DEER_A, DEER_B];

// --------------------------------------------------------------------------
// Terrain and obstacles
// --------------------------------------------------------------------------
var ROCK = 45;             // grey boulder - crash
var STUMP = 46;            // mossy stump - crash
var MOGUL_SMALL = 47;      // low bump - rattles and slows you
var MOGUL_LARGE = 48;      // big bump - rattles and slows you harder
var RAMP = 52;             // rainbow ramp - big air
var TREE = 49;             // evergreen - crash
var TREE_BARE = 50;        // dead sapling - crash
var TREE_BIG = 51;         // the tall pine
var TREE_DEAD_BIG_A = 94;  // big dead snags - crash
var TREE_DEAD_BIG_B = 95;
var TREE_XMAS_A = 87;      // decorated trees (the original's holiday flourish)
var TREE_XMAS_B = 88;
var TREE_XMAS_C = 89;
var TREE_BURNT_A = 83;     // a tree the yeti has torched
var TREE_BURNT_B = 84;
var TREE_BURNT_C = 85;
var CLOUD = 27;            // drifts across the slope, purely decorative
var SNOW_PATCH = 82;       // bare patch of dirt

// The chairlift: a tower, then loaded and empty chairs.
var LIFT_TOWER = 64;
var LIFT_CHAIR_FULL = 65;
var LIFT_CHAIR_PAIR = 66;
var LIFT_CHAIR_EMPTY = 67;

// --------------------------------------------------------------------------
// Title card
// --------------------------------------------------------------------------
// The version line and key hints are runtime Font.js text, not sprites.
var LOGO = 53;             // mountains and the fat green wordmark

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
var YETI_GRAB = 76;        // the skier snatched, held aloft
var YETI_SHOVE_A = 77;     // rammed headfirst into the maw
var YETI_SHOVE_B = 78;
var YETI_FEET_A = 79;      // only the boots left - the freeze frame
var YETI_FEET_B = 80;
var YETI_GULP = 81;        // jaws shut over the lot
var SKI_SCRAP = 86;        // all that is left of you

var YETI_RUN_FRAMES = [YETI_RUN_A, YETI_RUN_B, YETI_RUN_C, YETI_RUN_D];
var YETI_ROAR_FRAMES = [YETI_ARMS_UP_A, YETI_ARMS_UP_B];
var YETI_LEAP_FRAMES = [YETI_LEAP_A, YETI_LEAP_B];

// The meal: grab, then a violent shove, then the freeze frame on the boots.
var YETI_EAT_FRAMES = [YETI_GRAB, YETI_GRAB,
                       YETI_SHOVE_A, YETI_SHOVE_B, YETI_SHOVE_A, YETI_SHOVE_B,
                       YETI_FEET_A, YETI_FEET_B, YETI_FEET_A, YETI_FEET_B,
                       YETI_FEET_A];

// --------------------------------------------------------------------------
// Metrics
// --------------------------------------------------------------------------
//
// Sprite dimensions, so the engine can size and centre images without waiting
// on asynchronous image loads. Kept identical to tools/make-sprites.py.
var SIZES = {
  1: [5, 11], 2: [8, 11], 3: [10, 11], 4: [8, 8], 5: [8, 11],
  6: [10, 11], 7: [8, 8], 8: [6, 8], 9: [6, 8], 10: [6, 8],
  11: [6, 8], 12: [28, 15], 13: [9, 7], 14: [7, 9], 15: [7, 8],
  16: [7, 8], 17: [7, 9], 18: [8, 7], 19: [8, 8], 20: [8, 6],
  21: [7, 8], 22: [7, 8], 27: [16, 8], 28: [9, 9], 29: [9, 9],
  30: [9, 9], 31: [9, 6], 32: [9, 7], 33: [8, 6], 34: [8, 6],
  35: [7, 7], 36: [7, 7], 37: [9, 11], 38: [7, 11], 39: [9, 11],
  40: [11, 11], 41: [11, 11], 42: [11, 11], 43: [9, 11], 44: [11, 9],
  45: [6, 3], 46: [4, 3], 47: [4, 2], 48: [6, 2], 49: [7, 8],
  50: [6, 7], 51: [8, 16], 52: [8, 3], 53: [120, 44], 64: [7, 16],
  65: [7, 8], 66: [7, 8], 67: [7, 8], 68: [8, 12], 69: [8, 12],
  70: [8, 12], 71: [8, 12], 72: [8, 12], 73: [8, 12], 74: [8, 12],
  75: [8, 12], 76: [8, 12], 77: [8, 12], 78: [8, 12], 79: [8, 12],
  80: [8, 12], 81: [8, 12], 82: [4, 2], 83: [6, 7], 84: [6, 7],
  85: [6, 7], 86: [2, 3], 87: [7, 8], 88: [7, 8], 89: [7, 8],
  90: [13, 9], 91: [13, 9], 92: [13, 9], 93: [13, 9], 94: [8, 14],
  95: [8, 14], 96: [9, 8]
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
