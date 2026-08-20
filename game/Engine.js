.pragma library

.import "Sprites.js" as Sprites

// ---------------------------------------------------------------------------
// Omarski engine, third rebuild
// ---------------------------------------------------------------------------
//
// A from-scratch simulation of the rules of the classic 1991 skiing game,
// as documented by its author and observed in play:
//
//   * The world wraps at +/-2048 metres in every direction.
//   * Seven discrete headings: straight down, three grades each way. The
//     hardest grade points the skis fully across the fall line, and you
//     skid to a dead stop.
//   * The skier carries momentum. From a standstill you build speed
//     gradually; turning across the hill scrubs it off; a crash resets it
//     to zero and you push off again.
//   * F doubles the speed.
//   * The Abominable Snow Monster appears past 2000 metres. He is faster
//     than a tucked skier, so only F escapes; he cannot grab you mid-air.
//     Outrun him far enough and he gives up — until the next 2000 metres.
//   * Three courses branch off the start: Slalom, Free-style, Tree Slalom.
//
// The object field is generated deterministically from the world coordinate,
// so the hill is stable: ski back uphill and the same trees are still there.
//
// The engine runs in metres and seconds and never touches the screen; the
// view decides how many pixels a metre gets (8, in the chunky rebuild).

var PIXELS_PER_METRE = 8;
var WORLD_LIMIT = 2048;          // metres, in each direction
var TICK_HZ = 30;

// --- movement --------------------------------------------------------------

var MAX_HEADING = 3;

// Target scalar speed in m/s per |heading|. Straight down is fastest, and
// skis fully sideways means a stop, exactly like the classic.
var SPEED_BY_HEADING = [15.0, 13.7, 12.0, 0.0];

// Unit direction of travel per |heading|: [sideways, downhill]. These give
// the classic downhill components (15 / 12.5 / 8 / 0 m/s at full speed).
var DIR_SIDE = [0.0, 0.403, 0.747, 1.0];
var DIR_DOWN = [1.0, 0.916, 0.664, 0.0];

var ACCEL = 9.0;                 // m/s^2 gained pointing down the hill
var BRAKE = 22.0;                // m/s^2 scrubbed when edging above target
var FAST_MULTIPLIER = 2.0;       // what F does to the target speed
var CLIMB_SPEED = 3.0;           // m/s when side-stepping back up

// --- crashes ---------------------------------------------------------------

var CRASH_SECONDS = 1.4;         // time spent in the snow
var CRASH_GRACE = 0.6;           // immunity after standing back up

// --- air -------------------------------------------------------------------
// Tuned so a mogul gives about a second of air and a rainbow ramp closer to
// two — long enough to work a backflip round.

var GRAVITY = 12.0;              // m/s^2
var JUMP_IMPULSE = 8.5;          // m/s at power 1.0
var SPEED_BOOST = 0.35;          // extra air from carrying speed into the lip

// --- the monster -----------------------------------------------------------

var YETI_DISTANCE = 2000;        // metres before the first one shows up
var YETI_RESPAWN = 2000;         // and another every this much further
var YETI_SPEED = 16.5;           // m/s, faster than a tucked skier
var YETI_GIVE_UP = 60;           // metres behind at which he loses interest

// --- terrain ---------------------------------------------------------------
// One object may occupy each 7x7 metre cell; cell size and OBJECT_CHANCE
// together set the density, roughly one object per 95 square metres.

var CELL = 7;
var OBJECT_CHANCE = 0.52;

// A clearing around the start keeps the three course signs readable.
var START_CLEAR_X = 30;
var START_CLEAR_TOP = -18;
var START_CLEAR_BOTTOM = 34;

// ---------------------------------------------------------------------------
// Deterministic hashing
// ---------------------------------------------------------------------------

// 32-bit integer hash; no floats or trig, so the hill is identical on every
// machine and across sessions.
function hash2(x, y, salt) {
  var h = (x | 0) * 0x85297a4d ^ (y | 0) * 0x68e31da4 ^ (salt | 0) * 0xb5297a4d;
  h = h ^ (h >>> 15);
  h = (h * 0x45d9f3b) | 0;
  h = h ^ (h >>> 13);
  h = (h * 0x45d9f3b) | 0;
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
// Three signs stand just below the start; skiing past one enters its course.

var COURSE_NONE = "free";
var COURSE_SLALOM = "slalom";
var COURSE_FREESTYLE = "freestyle";
var COURSE_TREE = "tree";

var COURSE_LENGTH = 500;   // metres of gates
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

function courseStartY() {
  return SIGN_ROW + 34;
}

function courseFinishY(course) {
  var gates = gatesFor(course);
  return gates.length ? gates[gates.length - 1].y + 14 : SIGN_ROW + COURSE_LENGTH;
}

// Gates weave side to side down the course; Tree Slalom spaces them wider
// but squeezes them narrower, because the timber does half the work.
function gatesFor(course) {
  var spec = courseById(course);
  if (!spec || course === COURSE_FREESTYLE) return [];

  var gates = [];
  var spacing = course === COURSE_TREE ? 22 : 18;
  var count = Math.floor(COURSE_LENGTH / spacing);
  for (var i = 0; i < count; i++) {
    var sway = Math.sin(i * 0.9) * 16 + (rand01(i, 0, 11) - 0.5) * 8;
    gates.push({
      index: i,
      x: spec.x + sway,
      y: SIGN_ROW + 40 + i * spacing,
      halfWidth: course === COURSE_TREE ? 4.5 : 5.5
    });
  }
  return gates;
}

// ---------------------------------------------------------------------------
// The object field
// ---------------------------------------------------------------------------

var SOLID = "solid";       // crash into it
var JUMPABLE = "jump";     // launches you
var DECOR = "decor";       // pure scenery

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

function inStartClearing(x, y) {
  return y > START_CLEAR_TOP && y < START_CLEAR_BOTTOM
      && Math.abs(x) < START_CLEAR_X;
}

// Every object whose cell intersects the requested world rectangle. Cells
// are keyed on wrapped coordinates so the field repeats with the world.
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

      var x = cx * CELL + rand01(wx, wy, 2) * CELL;
      var y = cy * CELL + rand01(wx, wy, 3) * CELL;

      // Tested on the jittered position, so nothing drifts into the clearing.
      if (inStartClearing(x, y)) continue;

      var pick = rand01(wx, wy, 4);

      // Cumulative shares of the object mix. Tree Slalom is wall-to-wall
      // timber; elsewhere the hill is varied.
      var tree = course === COURSE_TREE ? 0.80 : 0.34;
      var rock = tree + (course === COURSE_TREE ? 0.05 : 0.16);
      var mogul = rock + 0.24;
      var ramp = mogul + 0.08;
      var patch = ramp + 0.06;
      var cloud = patch + 0.07;

      if (pick < tree) {
        var t = rand01(wx, wy, 5);
        out.push(obstacle(SOLID,
          t < 0.72 ? Sprites.TREE : t < 0.88 ? Sprites.TREE_BARE
                                             : Sprites.TREE_BIG, x, y));
      } else if (pick < rock) {
        out.push(obstacle(SOLID, rand01(wx, wy, 6) < 0.6
                          ? Sprites.ROCK : Sprites.STUMP, x, y));
      } else if (pick < mogul) {
        var big = rand01(wx, wy, 7) < 0.45;
        out.push(obstacle(JUMPABLE,
                          big ? Sprites.MOGUL_LARGE : Sprites.MOGUL_SMALL,
                          x, y, { power: big ? 0.75 : 0.5 }));
      } else if (pick < ramp) {
        out.push(obstacle(JUMPABLE, Sprites.RAMP, x, y, { power: 1.0, ramp: true }));
      } else if (pick < patch) {
        out.push(obstacle(DECOR, Sprites.SNOW_PATCH, x, y));
      } else if (pick < cloud) {
        out.push(obstacle(DECOR, Sprites.CLOUD, x, y, { cloud: true }));
      } else {
        out.push(obstacle(SOLID, Sprites.LIFT_TOWER, x, y));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Collision
// ---------------------------------------------------------------------------
// The skier's feet are tested against the base of each object, which is why
// you can pass behind the crown of a tall pine but not through its trunk.

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
    // Position in metres; y grows downhill.
    x: 0,
    y: 0,
    heading: 0,
    speed: 0,           // current scalar speed, m/s — momentum lives here

    // Airborne state. Velocity is frozen at the lip and carried through
    // the air; you steer again when the skis touch snow.
    airborne: false,
    height: 0,          // metres above the snow
    vertical: 0,        // m/s upward
    airVx: 0,
    airVy: 0,
    flipStage: -1,      // -1 = not flipping, else index into FLIP_FRAMES
    flipCount: 0,

    // Crash state.
    crashed: false,
    crashTimer: 0,
    crashSprite: Sprites.CRASH_SIT,
    graceTimer: 0,

    // Progress.
    distance: 0,        // metres travelled downhill, monotonic
    elapsed: 0,         // seconds
    style: 0,           // style points

    // Course.
    course: COURSE_NONE,
    courseStarted: false,
    courseFinished: false,
    courseTime: 0,
    gatesCleared: 0,
    gatesMissed: 0,
    nextGate: 0,
    gateResults: [],    // one entry per judged gate: true cleared

    // Input.
    fast: false,
    climbing: 0,        // -1 left, +1 right while side-stepping uphill

    // Metres of slope visible above the skier; the view keeps this current
    // so the monster can enter from just off screen.
    viewAbove: 9,

    // Dogs, snowboarders and other skiers sharing the hill.
    critters: [],
    critterTimer: 0,

    // The monster.
    yeti: null,
    yetiNext: YETI_DISTANCE,
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

// The target speed the current heading is pulling toward.
function speedFor(state) {
  var target = SPEED_BY_HEADING[Math.abs(state.heading)];
  return state.fast ? target * FAST_MULTIPLIER : target;
}

// Advance the world by dt seconds. `events` collects things the view may
// want to react to without the engine knowing about the UI.
function step(state, dt, events) {
  if (state.paused || state.over) return state;
  state.elapsed += dt;

  if (state.eaten) {
    state.eatTimer += dt;
    state.eatFrame = Math.min(Math.floor(state.eatTimer / 0.28),
                              Sprites.YETI_EAT_FRAMES.length - 1);
    if (state.eatTimer > 3.0) state.over = true;
    return state;
  }

  if (state.crashed) {
    state.crashTimer -= dt;
    if (state.crashTimer <= 0) {
      state.crashed = false;
      state.heading = 0;
      // You stand up inside the footprint of whatever felled you, so solids
      // are ignored just long enough to push off clear of it.
      state.graceTimer = CRASH_GRACE;
    }
    stepYeti(state, dt, events);
    return state;
  }

  if (state.graceTimer > 0) state.graceTimer -= dt;

  // --- movement ------------------------------------------------------------
  if (state.airborne) {
    // Carried momentum: the lip decided this trajectory.
    state.x = wrap(state.x + state.airVx * dt);
    state.y = wrap(state.y + state.airVy * dt);
    if (state.airVy > 0) state.distance += state.airVy * dt;

    state.vertical -= GRAVITY * dt;
    state.height += state.vertical * dt;
    if (state.height <= 0) {
      state.height = 0;
      state.airborne = false;
      // Landing mid-rotation means eating snow.
      if (state.flipStage >= 0 && state.flipStage % Sprites.FLIP_FRAMES.length !== 0) {
        crash(state, Sprites.CRASH_SPRAWL, events);
        state.style = Math.max(0, state.style - 100);
        if (events) events.push("land-bad");
      } else if (events) {
        events.push("land");
      }
      state.flipStage = -1;
      state.flipCount = 0;
    }
  } else if (state.climbing !== 0) {
    // Side-stepping up the hill: slow, and you gain no distance.
    state.x = wrap(state.x + state.climbing * CLIMB_SPEED * dt);
    state.y = wrap(state.y - CLIMB_SPEED * 0.45 * dt);
    state.speed = 0;
  } else {
    // Momentum: close on the heading's target speed. Gravity builds speed
    // gently; edging across the hill sheds it much faster, and skis fully
    // sideways bring you skidding to a halt.
    var target = speedFor(state);
    if (state.speed < target) {
      state.speed = Math.min(target, state.speed + ACCEL * dt);
    } else {
      state.speed = Math.max(target, state.speed - BRAKE * dt);
    }

    var mag = Math.abs(state.heading);
    var side = (state.heading < 0 ? -1 : 1) * DIR_SIDE[mag] * state.speed;
    var down = DIR_DOWN[mag] * state.speed;
    state.x = wrap(state.x + side * dt);
    state.y = wrap(state.y + down * dt);
    state.distance += down * dt;
  }

  // --- obstacles -----------------------------------------------------------
  var near = objectsIn(state.x - 4, state.y - 4, state.x + 4, state.y + 4,
                       state.course);
  for (var i = 0; i < near.length; i++) {
    var o = near[i];
    if (o.kind === DECOR || !hits(state.x, state.y, o)) continue;

    if (o.kind === JUMPABLE) {
      if (!state.airborne) launch(state, o.power, events);
    } else if (state.graceTimer <= 0
               && (!state.airborne || state.height < 0.6)) {
      // Enough air sails over anything; a low hop still clips the trunk.
      crash(state, o.sprite === Sprites.ROCK || o.sprite === Sprites.STUMP
            ? Sprites.CRASH_SIT : Sprites.CRASH_OUCH, events);
      break;
    }
  }

  // --- style ---------------------------------------------------------------
  if (state.airborne) {
    state.style += dt * 12 * (1 + state.height * 0.4);
  }

  stepCourse(state, dt, events);
  stepCritters(state, dt, events);
  stepYeti(state, dt, events);
  return state;
}

function launch(state, power, events) {
  var mag = Math.abs(state.heading);
  state.airborne = true;
  state.height = 0.01;
  // Faster skiers get more air off the same lip, and keep their line.
  var carried = Math.min(1, state.speed / SPEED_BY_HEADING[0]);
  state.vertical = JUMP_IMPULSE * power * (1 + carried * SPEED_BOOST);
  state.airVx = (state.heading < 0 ? -1 : 1) * DIR_SIDE[mag] * state.speed;
  state.airVy = DIR_DOWN[mag] * state.speed;
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
  state.speed = 0;       // momentum is gone; you push off from a standstill
  if (events) events.push("crash");
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

function stepCourse(state, dt, events) {
  if (state.course === COURSE_NONE) {
    // Crossing the sign row picks the course whose lane you are in.
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
// Dogs, snowboarders and other skiers
// ---------------------------------------------------------------------------
// A few wandering characters share the hill. They are hazards: run into one
// and you both go down. They spawn just off the top of the view and retire
// once they fall well behind.

var CRITTER_DOG = "dog";
var CRITTER_BOARDER = "boarder";
var CRITTER_SKIER = "skier";

var MAX_CRITTERS = 4;
var CRITTER_INTERVAL = 3.2;   // seconds between spawn attempts

var CRASH_POSE = {};
CRASH_POSE[CRITTER_DOG] = Sprites.CRASH_SIT;
CRASH_POSE[CRITTER_BOARDER] = Sprites.CRASH_SPRAWL;
CRASH_POSE[CRITTER_SKIER] = Sprites.CRASH_TANGLE;

function spawnCritter(state) {
  var roll = Math.random();
  var kind = roll < 0.4 ? CRITTER_DOG
           : roll < 0.75 ? CRITTER_BOARDER
           : CRITTER_SKIER;
  state.critters.push({
    kind: kind,
    x: state.x + (Math.random() - 0.5) * 28,
    y: state.y - (state.viewAbove > 0 ? state.viewAbove : 9) - 2,
    vx: (Math.random() - 0.5) * 4,
    vy: kind === CRITTER_DOG ? 2.5 : kind === CRITTER_BOARDER ? 11.0 : 9.0,
    frame: 0,
    timer: 0,
    down: false,
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
        c.vx = Math.max(-3, Math.min(3, c.vx + (Math.random() - 0.5) * 1.5));
      }
      c.frame = Math.floor(c.timer / 0.16);

      if (!state.crashed && !state.airborne && !state.eaten
          && state.graceTimer <= 0
          && Math.abs(wrap(state.x - c.x)) < 1.0
          && Math.abs(wrap(state.y - c.y)) < 0.9) {
        c.down = true;
        c.downTimer = 1.6;
        crash(state, CRASH_POSE[c.kind] || Sprites.CRASH_SIT, events);
      }
    }

    if (wrap(state.y - c.y) < 60) kept.push(c);
  }
  state.critters = kept;
}

// The sprite for a critter right now, as [spriteId, mirrored].
function critterSprite(c) {
  if (c.kind === CRITTER_DOG) {
    var frames = c.down ? Sprites.DOG_BARK_FRAMES : Sprites.DOG_FRAMES;
    return [frames[c.frame % 2], c.vx < 0];
  }
  if (c.kind === CRITTER_BOARDER) {
    if (c.down) {
      var wipe = [Sprites.BOARDER_CRASH_A, Sprites.BOARDER_CRASH_B,
                  Sprites.BOARDER_CRASH_C, Sprites.BOARDER_CRASH_D];
      return [wipe[c.frame % wipe.length], false];
    }
    return [Sprites.BOARDER_FRAMES[c.frame % Sprites.BOARDER_FRAMES.length], false];
  }
  if (c.down) return [Sprites.SKIER2_CRASH, false];
  if (c.vx < -0.8) return [Sprites.SKIER2_DIAG_L, false];
  if (c.vx > 0.8) return [Sprites.SKIER2_DIAG_R, false];
  return [Sprites.SKIER2_DOWN, false];
}

// ---------------------------------------------------------------------------
// The Abominable Snow Monster
// ---------------------------------------------------------------------------

// He materialises just inside the top edge of the view, so you see him
// coming rather than having him blink into existence.
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
    if (state.distance >= state.yetiNext) {
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

  if (y.mode === "bored") {
    // Beaten: he shuffles back up the hill and is gone.
    y.y = wrap(y.y - 8 * dt);
    y.frame = Math.floor(y.timer / 0.18) % Sprites.YETI_ROAR_FRAMES.length;
    if (y.modeTimer > 2.5) state.yeti = null;
    return;
  }

  var dx = state.x - y.x;
  var dy = state.y - y.y;
  var dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > YETI_GIVE_UP) {
    // Outrun. He gives up — and the hill owes you another in 2000 metres.
    y.mode = "bored";
    y.modeTimer = 0;
    state.yetiNext = state.distance + YETI_RESPAWN;
    if (events) events.push("yeti-bored");
    return;
  }

  if (dist > 0.001) {
    y.x = wrap(y.x + dx / dist * YETI_SPEED * dt);
    y.y = wrap(y.y + dy / dist * YETI_SPEED * dt);
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
    // Steering in the air works a backflip round.
    if (state.flipStage < 0) state.flipStage = 0;
    state.flipStage++;
    state.flipCount++;
    if (state.flipStage % Sprites.FLIP_FRAMES.length === 0) state.style += 150;
    return;
  }
  state.heading = Math.max(-MAX_HEADING,
                           Math.min(MAX_HEADING, state.heading + delta));
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

// The current sprite for the skier, as [spriteId, mirrored].
function skierSprite(state) {
  if (state.eaten) return [Sprites.SKI_SCRAP, false];
  if (state.crashed) return [state.crashSprite, false];

  if (state.airborne) {
    if (state.flipStage >= 0) {
      return [Sprites.FLIP_FRAMES[state.flipStage % Sprites.FLIP_FRAMES.length],
              false];
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
// Formatting, matching the classic status box
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

// "0:01:36.54" — hours:minutes:seconds.hundredths
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
