.pragma library

.import "Sprites.js" as Sprites

// ---------------------------------------------------------------------------
// Omarski engine
// ---------------------------------------------------------------------------
//
// A faithful reimplementation of the simulation rules of SkiFree (Chris Pirih,
// 1991). Behaviour follows the original as documented by its author and as
// observed in the shipping game:
//
//   * The slope is 16 pixels per metre.
//   * The world wraps at +/-2048 metres in every direction.
//   * Pressing F doubles the game speed.
//   * The Abominable Snow Monster appears once you pass 2000 metres, and
//     cannot be outrun at normal speed.
//   * Three courses branch off the start: Slalom, Free-style, Tree Slalom.
//
// The object field is generated deterministically from the world coordinate,
// so the hill is stable: ski back uphill and the same trees are still there,
// exactly like the original's fixed-seed layout.

var PIXELS_PER_METRE = 16;
var WORLD_LIMIT = 2048;          // metres, in each direction
var YETI_DISTANCE = 2000;        // metres before the monster shows up

// Headings, -3 (hard left) .. 0 (straight down) .. +3 (hard right).
var MAX_HEADING = 3;

// Downhill speed in metres/second for each |heading|. Straight down is
// fastest; turning across the fall line scrubs speed off.
var SPEED_BY_HEADING = [15.0, 12.5, 8.0, 2.5];

// Sideways drift in metres/second for each |heading|.
var DRIFT_BY_HEADING = [0.0, 5.5, 9.0, 11.0];

var CLIMB_SPEED = 3.0;           // m/s when walking back up the hill
var FAST_MULTIPLIER = 2.0;       // what F does
var CRASH_SECONDS = 1.4;         // time spent face-down in the snow
var TICK_HZ = 60;

// Air physics. Tuned so a mogul gives about a second of air and a rainbow
// ramp closer to two, which is long enough to work a backflip round without
// making the hang time feel floaty.
var GRAVITY = 12.0;              // metres/second^2
var JUMP_IMPULSE = 8.5;          // metres/second at power 1.0
var SPEED_BOOST = 0.35;          // extra air from carrying speed into the lip

// Cell size for deterministic object placement, in metres. One object may
// occupy each cell, so cell size and OBJECT_CHANCE together set the density.
// The original slope shows roughly a dozen objects in a 33x34 metre viewport,
// which is about one object per 95 square metres.
var CELL = 7;
var OBJECT_CHANCE = 0.52;

// Keep a small clearing around the start so the three course signs are
// readable before the hill gets busy.
var START_CLEAR_X = 30;
var START_CLEAR_TOP = -18;
var START_CLEAR_BOTTOM = 34;

// Grace period after getting up, so you do not immediately re-crash into the
// very obstacle you just hit while still standing inside its footprint.
var CRASH_GRACE = 0.6;

// ---------------------------------------------------------------------------
// Deterministic hashing
// ---------------------------------------------------------------------------

// 32-bit integer hash. Avoids trig/float tricks so the field is identical on
// every machine and stable across sessions.
function hash2(x, y, salt) {
  var h = (x | 0) * 0x1f1f1f1f ^ (y | 0) * 0x27d4eb2d ^ (salt | 0) * 0x165667b1;
  h = h ^ (h >>> 15);
  h = (h * 0x2545f491) | 0;
  h = h ^ (h >>> 13);
  h = (h * 0x3ad3e7d1) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// Uniform float in [0, 1).
function rand01(x, y, salt) {
  return hash2(x, y, salt) / 4294967296.0;
}

function wrap(value) {
  var span = WORLD_LIMIT * 2;
  var v = value + WORLD_LIMIT;
  v = v - Math.floor(v / span) * span;
  return v - WORLD_LIMIT;
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------
//
// In the original, three signs sit just below the start. Skiing past one to
// its left or right enters that course. Free-style is straight ahead.

var COURSE_NONE = "free";
var COURSE_SLALOM = "slalom";
var COURSE_FREESTYLE = "freestyle";
var COURSE_TREE = "tree";

var COURSE_LENGTH = 500;   // metres from gate to finish
var SIGN_ROW = 26;         // metres below the start where the signs stand

var COURSES = [
  { id: COURSE_SLALOM, x: -44, sign: Sprites.SIGN_SLALOM, label: "Slalom" },
  { id: COURSE_FREESTYLE, x: 0, sign: Sprites.SIGN_FREESTYLE, label: "Free style" },
  { id: COURSE_TREE, x: 44, sign: Sprites.SIGN_TREE_SLALOM, label: "Tree Slalom" }
];

function courseById(id) {
  for (var i = 0; i < COURSES.length; i++)
    if (COURSES[i].id === id) return COURSES[i];
  return null;
}

// ---------------------------------------------------------------------------
// Object kinds
// ---------------------------------------------------------------------------

var SOLID = "solid";       // crash into it
var JUMPABLE = "jump";     // launches you
var DECOR = "decor";       // pure scenery
var GATE = "gate";         // slalom flag pair

function obstacle(kind, sprite, x, y, extra) {
  var o = {
    kind: kind,
    sprite: sprite,
    x: x,
    y: y,
    w: Sprites.width(sprite) / PIXELS_PER_METRE,
    h: Sprites.height(sprite) / PIXELS_PER_METRE
  };
  if (extra) for (var k in extra) o[k] = extra[k];
  return o;
}

// ---------------------------------------------------------------------------
// Field generation
// ---------------------------------------------------------------------------
//
// Returns every object whose cell intersects the requested world rectangle.
// Cells are keyed on wrapped coordinates so the field repeats with the world.

// True if a point falls inside the clearing kept open around the start gate.
function inStartClearing(x, y) {
  return y > START_CLEAR_TOP && y < START_CLEAR_BOTTOM
      && Math.abs(x) < START_CLEAR_X;
}

function objectsIn(minX, minY, maxX, maxY, course) {
  var out = [];
  var cx0 = Math.floor(minX / CELL) - 1;
  var cx1 = Math.floor(maxX / CELL) + 1;
  var cy0 = Math.floor(minY / CELL) - 1;
  var cy1 = Math.floor(maxY / CELL) + 1;

  for (var cy = cy0; cy <= cy1; cy++) {
    for (var cx = cx0; cx <= cx1; cx++) {
      var wx = Math.floor(wrap(cx * CELL) / CELL);
      var wy = Math.floor(wrap(cy * CELL) / CELL);

      if (rand01(wx, wy, 1) > OBJECT_CHANCE) continue;

      var jitterX = cx * CELL + rand01(wx, wy, 2) * CELL;
      var jitterY = cy * CELL + rand01(wx, wy, 3) * CELL;

      // Leave the start clearing empty. Tested on the jittered position, not
      // the cell origin, so nothing can drift into the clearing.
      if (inStartClearing(jitterX, jitterY)) continue;

      var pick = rand01(wx, wy, 4);

      // Tree Slalom is wall-to-wall timber; elsewhere the hill is mixed.
      // Thresholds are cumulative shares of the object mix.
      var treeShare = course === COURSE_TREE ? 0.80 : 0.34;
      var rockShare = treeShare + (course === COURSE_TREE ? 0.05 : 0.16);
      var mogulShare = rockShare + 0.24;
      var rampShare = mogulShare + 0.08;
      var patchShare = rampShare + 0.06;
      var cloudShare = patchShare + 0.07;

      if (pick < treeShare) {
        var tree = rand01(wx, wy, 5);
        var sprite = tree < 0.72 ? Sprites.TREE
                   : tree < 0.88 ? Sprites.TREE_BARE
                   : Sprites.TREE_BIG;
        out.push(obstacle(SOLID, sprite, jitterX, jitterY));
      } else if (pick < rockShare) {
        out.push(obstacle(SOLID, rand01(wx, wy, 6) < 0.6
                          ? Sprites.ROCK : Sprites.STUMP, jitterX, jitterY));
      } else if (pick < mogulShare) {
        var big = rand01(wx, wy, 7) < 0.45;
        out.push(obstacle(JUMPABLE,
                          big ? Sprites.MOGUL_LARGE : Sprites.MOGUL_SMALL,
                          jitterX, jitterY, { power: big ? 0.75 : 0.5 }));
      } else if (pick < rampShare) {
        out.push(obstacle(JUMPABLE, Sprites.RAMP, jitterX, jitterY,
                          { power: 1.0, ramp: true }));
      } else if (pick < patchShare) {
        out.push(obstacle(DECOR, Sprites.SNOW_PATCH, jitterX, jitterY));
      } else if (pick < cloudShare) {
        out.push(obstacle(DECOR, Sprites.CLOUD, jitterX, jitterY,
                          { cloud: true }));
      } else {
        out.push(obstacle(SOLID, Sprites.LIFT_TOWER, jitterX, jitterY));
      }
    }
  }
  return out;
}

// Where a course's start and finish banners stand.
function courseStartY() {
  return SIGN_ROW + 34;
}

function courseFinishY(course) {
  var gates = gatesFor(course);
  return gates.length ? gates[gates.length - 1].y + 14 : SIGN_ROW + COURSE_LENGTH;
}

// Slalom and Tree Slalom gates: evenly spaced pairs of flags down the course.
function gatesFor(course) {
  var spec = courseById(course);
  if (!spec || course === COURSE_FREESTYLE) return [];

  var gates = [];
  var spacing = course === COURSE_TREE ? 22 : 18;
  var count = Math.floor(COURSE_LENGTH / spacing);
  for (var i = 0; i < count; i++) {
    var y = SIGN_ROW + 40 + i * spacing;
    // Gates weave side to side across the fall line.
    var sway = Math.sin(i * 0.9) * 16 + (rand01(i, 0, 11) - 0.5) * 8;
    gates.push({
      index: i,
      x: spec.x + sway,
      y: y,
      halfWidth: course === COURSE_TREE ? 4.5 : 5.5
    });
  }
  return gates;
}

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------
//
// The original tests the skier's feet against the base of each object, which
// is why you can ski "through" the top of a tall pine but not its trunk.

function hits(skierX, skierY, o) {
  var footWidth = 0.55;
  var baseHeight = Math.min(o.h, 0.85);
  return Math.abs(skierX - o.x) < (o.w * 0.5 + footWidth)
      && skierY > o.y - baseHeight
      && skierY < o.y + baseHeight * 0.75;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function createState() {
  return {
    // Position in metres. y grows downhill.
    x: 0,
    y: 0,
    heading: 0,

    // Airborne state.
    airborne: false,
    height: 0,          // metres above the snow
    vertical: 0,        // m/s upward
    flipStage: -1,      // -1 = not flipping, else index into FLIP_FRAMES
    flipCount: 0,

    // Crash state.
    crashed: false,
    crashTimer: 0,
    crashSprite: Sprites.CRASH_SIT,
    graceTimer: 0,      // brief immunity after standing back up

    // Progress.
    distance: 0,        // metres travelled downhill, monotonic
    elapsed: 0,         // seconds
    style: 0,           // style points
    speed: 0,           // current m/s, for the status box

    // Course.
    course: COURSE_NONE,
    courseStarted: false,
    courseFinished: false,
    courseTime: 0,
    gatesCleared: 0,
    gatesMissed: 0,
    nextGate: 0,
    // One entry per gate judged so far: true cleared, false missed.
    gateResults: [],

    // Input.
    fast: false,
    climbing: 0,        // -1 left, +1 right while side-stepping uphill

    // How much slope is visible above the skier, in metres. The view keeps
    // this current so the monster can enter from just off screen.
    viewAbove: 9,

    // Dogs, snowboarders and other skiers sharing the hill.
    critters: [],
    critterTimer: 0,

    // The monster.
    yeti: null,
    eaten: false,
    eatFrame: 0,
    eatTimer: 0,

    paused: false,
    over: false
  };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

function speedFor(state) {
  var mag = Math.abs(state.heading);
  var base = SPEED_BY_HEADING[mag];
  return state.fast ? base * FAST_MULTIPLIER : base;
}

function driftFor(state) {
  var mag = Math.abs(state.heading);
  var base = DRIFT_BY_HEADING[mag] * (state.heading < 0 ? -1 : 1);
  return state.fast ? base * FAST_MULTIPLIER : base;
}

// Advance the world by dt seconds. `events` collects things the view may want
// to react to (sounds, flashes) without the engine knowing about the UI.
function step(state, dt, events) {
  if (state.paused || state.over) return state;
  state.elapsed += dt;

  if (state.eaten) {
    state.eatTimer += dt;
    var frame = Math.floor(state.eatTimer / 0.28);
    state.eatFrame = Math.min(frame, Sprites.YETI_EAT_FRAMES.length - 1);
    if (state.eatTimer > 3.0) state.over = true;
    return state;
  }

  if (state.crashed) {
    state.crashTimer -= dt;
    state.speed = 0;
    if (state.crashTimer <= 0) {
      state.crashed = false;
      state.heading = 0;
      // You stand up inside the footprint of whatever felled you, so ignore
      // solid objects just long enough to ski clear of it.
      state.graceTimer = CRASH_GRACE;
    }
    stepYeti(state, dt, events);
    return state;
  }

  if (state.graceTimer > 0) state.graceTimer -= dt;

  // --- movement ------------------------------------------------------------
  if (state.climbing !== 0 && !state.airborne) {
    // Side-stepping up the hill: slow, and you gain no distance.
    state.x = wrap(state.x + state.climbing * CLIMB_SPEED * dt);
    state.y = wrap(state.y - CLIMB_SPEED * 0.45 * dt);
    state.speed = 0;
  } else {
    var down = speedFor(state);
    var side = driftFor(state);
    state.x = wrap(state.x + side * dt);
    state.y = wrap(state.y + down * dt);
    state.distance += down * dt;
    state.speed = down;
  }

  // --- airborne ------------------------------------------------------------
  if (state.airborne) {
    state.vertical -= GRAVITY * dt;
    state.height += state.vertical * dt;
    if (state.height <= 0) {
      state.height = 0;
      state.airborne = false;
      // Landing mid-flip means eating snow.
      if (state.flipStage >= 0 && state.flipStage % Sprites.FLIP_FRAMES.length !== 0) {
        crash(state, Sprites.CRASH_SPRAWL, events);
        state.style = Math.max(0, state.style - 100);
        if (events) events.push("land-bad");
      } else {
        if (events) events.push("land");
      }
      state.flipStage = -1;
      state.flipCount = 0;
    }
  }

  // --- obstacles -----------------------------------------------------------
  var near = objectsIn(state.x - 4, state.y - 4, state.x + 4, state.y + 4,
                       state.course);
  for (var i = 0; i < near.length; i++) {
    var o = near[i];
    if (o.kind === DECOR) continue;
    if (!hits(state.x, state.y, o)) continue;

    if (o.kind === JUMPABLE) {
      if (!state.airborne) {
        launch(state, o.power, events);
      }
    } else if (o.kind === SOLID) {
      // You sail straight over obstacles while in the air, and are briefly
      // immune right after picking yourself up.
      if (state.graceTimer <= 0 && (!state.airborne || state.height < 0.6)) {
        crash(state, o.sprite === Sprites.ROCK || o.sprite === Sprites.STUMP
              ? Sprites.CRASH_SIT : Sprites.CRASH_OUCH, events);
        break;
      }
    }
  }

  // --- style points --------------------------------------------------------
  if (state.airborne) {
    state.style += dt * 12 * (1 + state.height * 0.4);
  }

  // --- course progress -----------------------------------------------------
  stepCourse(state, dt, events);
  stepCritters(state, dt, events);
  stepYeti(state, dt, events);
  return state;
}

// ---------------------------------------------------------------------------
// Dogs, snowboarders and other skiers
// ---------------------------------------------------------------------------
//
// The original shares the hill with a few wandering characters. They are
// hazards: run into one and you both go down. They are spawned just off the
// top of the view and retired once they fall well behind.

var CRITTER_DOG = "dog";
var CRITTER_BOARDER = "boarder";
var CRITTER_SKIER = "skier";

var MAX_CRITTERS = 4;
var CRITTER_INTERVAL = 3.2;   // seconds between spawn attempts

function spawnCritter(state) {
  var roll = Math.random();
  var kind = roll < 0.4 ? CRITTER_DOG
           : roll < 0.75 ? CRITTER_BOARDER
           : CRITTER_SKIER;

  // Dogs mill about slowly; boarders and skiers come down the hill.
  var speed = kind === CRITTER_DOG ? 2.5
            : kind === CRITTER_BOARDER ? 11.0
            : 9.0;

  state.critters.push({
    kind: kind,
    x: state.x + (Math.random() - 0.5) * 28,
    y: state.y - (state.viewAbove > 0 ? state.viewAbove : 9) - 2,
    vx: (Math.random() - 0.5) * 4,
    vy: speed,
    frame: 0,
    timer: 0,
    down: false,      // knocked over
    downTimer: 0
  });
}

function stepCritters(state, dt, events) {
  state.critterTimer += dt;
  if (state.critterTimer >= CRITTER_INTERVAL) {
    state.critterTimer = 0;
    if (state.critters.length < MAX_CRITTERS) spawnCritter(state);
  }

  var kept = [];
  for (var i = 0; i < state.critters.length; i++) {
    var c = state.critters[i];
    c.timer += dt;

    if (c.down) {
      c.downTimer -= dt;
      if (c.downTimer <= 0) c.down = false;
    } else {
      c.x = wrap(c.x + c.vx * dt);
      c.y = wrap(c.y + c.vy * dt);
      // Dogs wander, so nudge their heading now and then.
      if (c.kind === CRITTER_DOG && Math.floor(c.timer * 2) % 7 === 0) {
        c.vx += (Math.random() - 0.5) * 1.5;
        if (c.vx > 3) c.vx = 3;
        if (c.vx < -3) c.vx = -3;
      }
      c.frame = Math.floor(c.timer / 0.16);

      // Collide with the skier: both of you end up in the snow.
      if (!state.crashed && !state.airborne && !state.eaten
          && state.graceTimer <= 0
          && Math.abs(wrap(state.x - c.x)) < 1.0
          && Math.abs(wrap(state.y - c.y)) < 0.9) {
        c.down = true;
        c.downTimer = 1.6;
        crash(state, CRASH_SIT_FOR[c.kind] || Sprites.CRASH_SIT, events);
      }
    }

    // Retire anything that has fallen a long way behind.
    if (wrap(state.y - c.y) < 60) kept.push(c);
  }
  state.critters = kept;
}

// Which crash pose the skier ends up in, per obstacle.
var CRASH_SIT_FOR = {};
CRASH_SIT_FOR[CRITTER_DOG] = Sprites.CRASH_SIT;
CRASH_SIT_FOR[CRITTER_BOARDER] = Sprites.CRASH_SPRAWL;
CRASH_SIT_FOR[CRITTER_SKIER] = Sprites.CRASH_TANGLE;

// The sprite for a critter right now, as [resourceId, mirrored].
function critterSprite(c) {
  if (c.kind === CRITTER_DOG) {
    if (c.down) return [Sprites.DOG_BARK_FRAMES[c.frame % 2], c.vx < 0];
    return [Sprites.DOG_FRAMES[c.frame % 2], c.vx < 0];
  }
  if (c.kind === CRITTER_BOARDER) {
    if (c.down) {
      var wipe = [Sprites.BOARDER_CRASH_A, Sprites.BOARDER_CRASH_B,
                  Sprites.BOARDER_CRASH_C, Sprites.BOARDER_CRASH_D];
      return [wipe[c.frame % wipe.length], false];
    }
    return [Sprites.BOARDER_FRAMES[c.frame % Sprites.BOARDER_FRAMES.length], false];
  }
  // Another skier.
  if (c.down) return [Sprites.SKIER2_CRASH, false];
  if (c.vx < -0.8) return [Sprites.SKIER2_DIAG_L, false];
  if (c.vx > 0.8) return [Sprites.SKIER2_DIAG_R, false];
  return [Sprites.SKIER2_DOWN, false];
}

function launch(state, power, events) {
  state.airborne = true;
  state.height = 0.01;
  // Faster skiers get more air off the same lip.
  var carried = Math.min(1, state.speed / SPEED_BY_HEADING[0]);
  state.vertical = JUMP_IMPULSE * power * (1 + carried * SPEED_BOOST);
  state.flipStage = -1;
  if (events) events.push(power >= 1.0 ? "ramp" : "jump");
}

function crash(state, sprite, events) {
  state.crashed = true;
  state.crashTimer = CRASH_SECONDS;
  state.crashSprite = sprite;
  state.airborne = false;
  state.height = 0;
  state.vertical = 0;
  state.flipStage = -1;
  state.heading = 0;
  if (events) events.push("crash");
}

function stepCourse(state, dt, events) {
  if (state.course === COURSE_NONE) {
    // Passing the sign row picks a course based on where you crossed it.
    if (state.y > SIGN_ROW + 8) {
      var best = null, bestDist = 1e9;
      for (var i = 0; i < COURSES.length; i++) {
        var d = Math.abs(state.x - COURSES[i].x);
        if (d < bestDist) { bestDist = d; best = COURSES[i]; }
      }
      if (best && bestDist < 22) {
        state.course = best.id;
        state.courseStarted = true;
        state.courseTime = 0;
        state.nextGate = 0;
        state.gateResults = [];
        if (events) events.push("course:" + best.id);
      }
    }
    return;
  }

  if (state.courseFinished || state.course === COURSE_FREESTYLE) return;

  // The clock on the course itself, shown when you cross the finish.
  state.courseTime += dt;

  var gates = gatesFor(state.course);
  while (state.nextGate < gates.length && state.y > gates[state.nextGate].y + 1) {
    var g = gates[state.nextGate];
    var cleared = Math.abs(state.x - g.x) <= g.halfWidth;
    state.gateResults[state.nextGate] = cleared;
    if (cleared) {
      state.gatesCleared++;
      state.style += 25;
      if (events) events.push("gate-clear");
    } else {
      state.gatesMissed++;
      if (events) events.push("gate-miss");
    }
    state.nextGate++;
  }

  if (state.nextGate >= gates.length && gates.length > 0) {
    state.courseFinished = true;
    if (events) events.push("finish");
  }
}

// ---------------------------------------------------------------------------
// The Abominable Snow Monster
// ---------------------------------------------------------------------------
//
// He materialises just off screen once you pass 2000 metres and runs you down.
// In the original he is faster than the skier at normal speed, so the only
// escape is F. Reaching you, he eats you, chews, and burps.

var YETI_SPEED = 16.5;             // m/s, a shade faster than a tucked skier

// He appears behind you, just inside the top edge of the view, so you see him
// coming rather than having him blink into existence.
//
// `metresAbove` is how much slope is visible uphill of the skier; the caller
// passes it so the spawn point tracks the real viewport.
function spawnYeti(state, metresAbove) {
  var above = (metresAbove > 0 ? metresAbove : 9) * 0.85;
  state.yeti = {
    x: state.x + (Math.random() < 0.5 ? -1 : 1) * 5,
    y: state.y - above,
    frame: 0,
    timer: 0,
    mode: "roar",
    modeTimer: 0
  };
}

function stepYeti(state, dt, events) {
  if (state.eaten) return;

  if (!state.yeti) {
    if (state.distance >= YETI_DISTANCE) {
      spawnYeti(state, state.viewAbove);
      if (events) events.push("yeti");
    }
    return;
  }

  var y = state.yeti;
  y.timer += dt;
  y.modeTimer += dt;

  if (y.mode === "roar") {
    // A beat of arms-up roaring before the chase begins.
    y.frame = Math.floor(y.timer / 0.18) % Sprites.YETI_ROAR_FRAMES.length;
    if (y.modeTimer > 0.7) { y.mode = "chase"; y.modeTimer = 0; }
    return;
  }

  var dx = state.x - y.x;
  var dy = state.y - y.y;
  var dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0.001) {
    var speed = YETI_SPEED;
    // He lopes a touch faster while you are in the air, so jumping is no
    // free escape, but F still outpaces him.
    var vx = dx / dist * speed;
    var vy = dy / dist * speed;
    y.x = wrap(y.x + vx * dt);
    y.y = wrap(y.y + vy * dt);
  }

  y.frame = Math.floor(y.timer / 0.11) % Sprites.YETI_RUN_FRAMES.length;
  y.mode = dist < 3.5 ? "leap" : "chase";

  // He cannot grab you out of the air.
  if (dist < 1.1 && !state.airborne) {
    state.eaten = true;
    state.eatTimer = 0;
    state.eatFrame = 0;
    if (events) events.push("eaten");
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function turn(state, delta) {
  if (state.eaten || state.over) return;
  if (state.crashed) {
    // Wiggling the controls gets you back on your feet faster.
    state.crashTimer = Math.max(0, state.crashTimer - 0.25);
    return;
  }
  if (state.airborne) {
    // Steering in the air starts a backflip.
    if (state.flipStage < 0) state.flipStage = 0;
    state.flipStage++;
    state.flipCount++;
    if (state.flipStage % Sprites.FLIP_FRAMES.length === 0) {
      state.style += 150;
    }
    return;
  }
  state.heading = Math.max(-MAX_HEADING, Math.min(MAX_HEADING, state.heading + delta));
}

function setHeading(state, heading) {
  if (state.crashed || state.eaten || state.over || state.airborne) return;
  state.heading = Math.max(-MAX_HEADING, Math.min(MAX_HEADING, heading));
}

function jump(state, events) {
  if (state.crashed || state.eaten || state.over) return;
  if (state.airborne) {
    turn(state, 1);   // advance the flip
    return;
  }
  launch(state, 0.55, events);
}

// The current sprite for the skier, as [resourceId, mirrored].
function skierSprite(state) {
  if (state.eaten) return [Sprites.SKI_SCRAP, false];
  if (state.crashed) return [state.crashSprite, false];

  if (state.airborne) {
    if (state.flipStage >= 0) {
      var f = Sprites.FLIP_FRAMES[state.flipStage % Sprites.FLIP_FRAMES.length];
      return [f, false];
    }
    return [state.height > 1.2 ? Sprites.JUMP_HIGH_L : Sprites.JUMP_LOW, false];
  }

  if (state.climbing !== 0) {
    var walk = Math.floor(state.elapsed * 6) % 2 === 0;
    if (state.climbing < 0)
      return [walk ? Sprites.SKIER_STEP_L : Sprites.SKIER_CLIMB_L, false];
    return [walk ? Sprites.SKIER_STEP_R : Sprites.SKIER_CLIMB_R, false];
  }

  return Sprites.SKIER_BY_HEADING[state.heading + MAX_HEADING];
}

// ---------------------------------------------------------------------------
// Formatting, matching the original status box
// ---------------------------------------------------------------------------

function pad(value, width) {
  var s = String(value);
  while (s.length < width) s = " " + s;
  return s;
}

function zeroPad(value, width) {
  var s = String(value);
  while (s.length < width) s = "0" + s;
  return s;
}

// "0:01:36.54" - hours:minutes:seconds.hundredths
function formatTime(seconds) {
  var total = Math.max(0, seconds);
  var hours = Math.floor(total / 3600);
  var minutes = Math.floor((total % 3600) / 60);
  var secs = Math.floor(total % 60);
  var hundredths = Math.floor((total * 100) % 100);
  return hours + ":" + zeroPad(minutes, 2) + ":" + zeroPad(secs, 2)
       + "." + zeroPad(hundredths, 2);
}

function formatDistance(metres) {
  return pad(Math.floor(metres), 5) + "m";
}

function formatSpeed(mps) {
  return pad(Math.floor(mps), 2) + "m/s";
}

function formatStyle(style) {
  return pad(Math.floor(style), 7);
}
