.pragma library

.import "Sprites.js" as Sprites

// ---------------------------------------------------------------------------
// Omarski engine, fourth cut
// ---------------------------------------------------------------------------
//
// A from-scratch simulation of the rules of the classic 1991 skiing game,
// as documented by its author and observed in play — trimmed to a single
// mode: down the hill, past whatever the hill throws at you.
//
//   * The world wraps at +/-2048 metres in every direction.
//   * Seven discrete headings: straight down, three grades each way. The
//     hardest grade points the skis fully across the fall line, and you
//     skid to a dead stop.
//   * The skier carries momentum. From a standstill you build speed
//     gradually; turning across the hill scrubs it off; a crash resets it
//     to zero — and leaves you sitting in the snow until you press
//     something to get back up.
//   * Moguls rattle you and scrub speed; only the rainbow ramp gives air.
//   * F doubles the speed.
//   * The Abominable Snow Monster appears past 2000 metres. He is
//     terrifyingly fast — only F escapes; he cannot grab you mid-air.
//     Outrun him far enough and he gives up — until the next 2000 metres.
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

var CRASH_MIN_SECONDS = 0.7;     // you cannot get up faster than this
var CRASH_GRACE = 0.6;           // immunity after standing back up

// --- moguls ----------------------------------------------------------------

var BUMP_SLOW = 0.55;            // fraction of speed kept over a mogul
var BUMP_SECONDS = 0.5;          // how long the X-pose rattle lasts
var BUMP_COOLDOWN = 0.9;         // no double-rattle from the same bump

// --- air -------------------------------------------------------------------
// Tuned so the rainbow ramp gives a couple of seconds of air — long enough
// to work a backflip round with the steering keys.

var GRAVITY = 12.0;              // m/s^2
var JUMP_IMPULSE = 8.5;          // m/s at power 1.0
var SPEED_BOOST = 0.35;          // extra air from carrying speed into the lip
var LAND_GRACE = 0.5;            // seconds before another lip can launch you

// --- the monster -----------------------------------------------------------

var YETI_DISTANCE = 2000;        // metres before the first one shows up
var YETI_RESPAWN = 2000;         // and another every this much further
var YETI_SPEED = 21.0;           // m/s: terrifying. Only F outruns him.
var YETI_GIVE_UP = 60;           // metres behind at which he loses interest
var EAT_FRAME_SECONDS = 0.16;    // the shove is violent and quick
var EAT_TOTAL_SECONDS = 3.0;     // then the freeze frame holds

// --- terrain ---------------------------------------------------------------
// One object may occupy each 7x7 metre cell; cell size and OBJECT_CHANCE
// together set the density, roughly one object per 95 square metres.

var CELL = 7;
var OBJECT_CHANCE = 0.52;

// A small clearing around the start, so the first push-off is fair.
var START_CLEAR_X = 14;
var START_CLEAR_TOP = -10;
var START_CLEAR_BOTTOM = 18;

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
// The object field
// ---------------------------------------------------------------------------

var SOLID = "solid";       // crash into it
var JUMPABLE = "jump";     // launches you (the rainbow ramp)
var BUMP = "bump";         // rattles you and scrubs speed (moguls)
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
function objectsIn(minX, minY, maxX, maxY) {
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

      // Cumulative shares of the object mix.
      var tree = 0.36;
      var rock = tree + 0.15;
      var mogul = rock + 0.24;
      var ramp = mogul + 0.08;
      var patch = ramp + 0.06;
      var cloud = patch + 0.06;

      if (pick < tree) {
        var t = rand01(wx, wy, 5);
        var sprite = t < 0.56 ? Sprites.TREE
                   : t < 0.70 ? Sprites.TREE_BARE
                   : t < 0.82 ? (rand01(wx, wy, 8) < 0.5
                                 ? Sprites.TREE_DEAD_BIG_A
                                 : Sprites.TREE_DEAD_BIG_B)
                   : t < 0.94 ? Sprites.TREE_BIG
                   : Sprites.TREE_XMAS_A + (hash2(wx, wy, 9) % 3);
        out.push(obstacle(SOLID, sprite, x, y));
      } else if (pick < rock) {
        out.push(obstacle(SOLID, rand01(wx, wy, 6) < 0.6
                          ? Sprites.ROCK : Sprites.STUMP, x, y));
      } else if (pick < mogul) {
        var big = rand01(wx, wy, 7) < 0.45;
        out.push(obstacle(BUMP,
                          big ? Sprites.MOGUL_LARGE : Sprites.MOGUL_SMALL,
                          x, y, { hard: big }));
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
    jumpGrace: 0,       // just landed: the same lip cannot relaunch you

    // Mogul rattle.
    bumpTimer: 0,
    bumpCooldown: 0,

    // Crash state. You stay down until a key gets you up.
    crashed: false,
    crashTimer: 0,      // minimum time in the snow before a key works
    crashSprite: Sprites.CRASH_SIT,
    crashWord: "OUCH!",
    graceTimer: 0,

    // Progress.
    distance: 0,        // metres travelled downhill, monotonic
    elapsed: 0,         // seconds
    style: 0,           // style points

    // Input.
    fast: false,
    climbing: 0,        // -1 left, +1 right while side-stepping uphill

    // Metres of slope visible above the skier; the view keeps this current
    // so the monster can enter from just off screen.
    viewAbove: 9,

    // Dogs, deer, snowboarders and other skiers sharing the hill.
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
    state.eatFrame = Math.min(Math.floor(state.eatTimer / EAT_FRAME_SECONDS),
                              Sprites.YETI_EAT_FRAMES.length - 1);
    if (state.eatTimer > EAT_TOTAL_SECONDS) state.over = true;
    return state;
  }

  if (state.crashed) {
    // Down in the snow. Nothing moves until a key picks you back up —
    // the timer only meters the earliest moment that key can work.
    if (state.crashTimer > 0) state.crashTimer -= dt;
    stepCritters(state, dt, events);
    stepYeti(state, dt, events);
    return state;
  }

  if (state.graceTimer > 0) state.graceTimer -= dt;
  if (state.jumpGrace > 0) state.jumpGrace -= dt;
  if (state.bumpCooldown > 0) state.bumpCooldown -= dt;
  if (state.bumpTimer > 0) state.bumpTimer -= dt;

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
      state.jumpGrace = LAND_GRACE;
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
  var near = objectsIn(state.x - 4, state.y - 4, state.x + 4, state.y + 4);
  for (var i = 0; i < near.length; i++) {
    var o = near[i];
    if (o.kind === DECOR || !hits(state.x, state.y, o)) continue;

    if (o.kind === JUMPABLE) {
      // The lip only bites moving skis, and never the pair you just
      // landed on — that way a dead stop next to a ramp stays a stop.
      if (!state.airborne && state.jumpGrace <= 0 && state.speed > 1.0) {
        launch(state, o.power, events);
      }
    } else if (o.kind === BUMP) {
      if (!state.airborne && state.graceTimer <= 0
          && state.bumpCooldown <= 0 && state.speed > 1.0) {
        state.speed *= o.hard ? BUMP_SLOW * 0.85 : BUMP_SLOW;
        state.bumpTimer = BUMP_SECONDS;
        state.bumpCooldown = BUMP_COOLDOWN;
        if (events) events.push("bump");
      }
    } else if (state.graceTimer <= 0
               && (!state.airborne || state.height < 0.6)) {
      // Enough air sails over anything; a low hop still clips the trunk.
      crash(state, Sprites.CRASH_SIT, events);
      break;
    }
  }

  // --- style ---------------------------------------------------------------
  if (state.airborne) {
    state.style += dt * 12 * (1 + state.height * 0.4);
  }

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
  state.crashTimer = CRASH_MIN_SECONDS;
  state.crashSprite = sprite;
  state.crashWord = Sprites.CRASH_WORDS[
    Math.floor(Math.random() * Sprites.CRASH_WORDS.length)];
  state.airborne = false;
  state.height = 0;
  state.vertical = 0;
  state.flipStage = -1;
  state.bumpTimer = 0;
  state.heading = 0;
  state.speed = 0;       // momentum is gone; you push off from a standstill
  if (events) events.push("crash");
}

// A key press picks the skier up, once the minimum sit is served.
function getUp(state) {
  if (!state.crashed) return;
  if (state.crashTimer > 0) {
    // Wiggling the controls shaves the sit a little.
    state.crashTimer -= 0.15;
    return;
  }
  state.crashed = false;
  state.heading = 0;
  // You stand up inside the footprint of whatever felled you, so solids
  // are ignored just long enough to push off clear of it.
  state.graceTimer = CRASH_GRACE;
}

// ---------------------------------------------------------------------------
// Dogs, deer, snowboarders and other skiers
// ---------------------------------------------------------------------------
// A few wandering characters share the hill. Boarders and rival skiers are
// hazards: run into one and you both go down. Dogs trot straight across the
// slope and bark when you get close. Deer cross too — but hitting a deer
// hurts only the deer, spectacularly.

var CRITTER_DOG = "dog";
var CRITTER_BOARDER = "boarder";
var CRITTER_SKIER = "skier";
var CRITTER_DEER = "deer";

var MAX_CRITTERS = 5;
var CRITTER_INTERVAL = 3.0;   // seconds between spawn attempts
var DOG_BARK_RANGE = 7;       // metres at which the dog starts woofing

var CRASH_POSE = {};
CRASH_POSE[CRITTER_DOG] = Sprites.CRASH_SIT;
CRASH_POSE[CRITTER_BOARDER] = Sprites.CRASH_SPRAWL;
CRASH_POSE[CRITTER_SKIER] = Sprites.CRASH_TANGLE;

function spawnCritter(state) {
  var roll = Math.random();
  var kind = roll < 0.28 ? CRITTER_DOG
           : roll < 0.55 ? CRITTER_BOARDER
           : roll < 0.75 ? CRITTER_SKIER
           : CRITTER_DEER;
  var above = (state.viewAbove > 0 ? state.viewAbove : 9) + 2;
  var c = {
    kind: kind,
    x: state.x + (Math.random() - 0.5) * 28,
    y: state.y - above,
    vx: (Math.random() - 0.5) * 4,
    vy: kind === CRITTER_BOARDER ? 11.0 : 9.0,
    frame: 0,
    timer: 0,
    bark: false,
    splat: false,
    down: false,
    downTimer: 0
  };
  if (kind === CRITTER_DOG || kind === CRITTER_DEER) {
    // Crossers: strong sideways motion, starting off to one side so the
    // walk carries them across the skier's path.
    var dir = Math.random() < 0.5 ? -1 : 1;
    c.vx = dir * (kind === CRITTER_DEER ? 6 + Math.random() * 3
                                        : 3.5 + Math.random() * 1.5);
    c.vy = kind === CRITTER_DEER ? 1.2 : 0.8;
    c.x = state.x - dir * (10 + Math.random() * 10);
  }
  state.critters.push(c);
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
      if (c.downTimer <= 0) {
        if (c.splat) continue;          // what's left soaks into the snow
        c.down = false;
      }
    } else {
      c.x = wrap(c.x + c.vx * dt);
      c.y = wrap(c.y + c.vy * dt);
      c.frame = Math.floor(c.timer / 0.16);

      var dx = wrap(state.x - c.x);
      var dy = wrap(state.y - c.y);
      if (c.kind === CRITTER_DOG) {
        c.bark = Math.abs(dx) < DOG_BARK_RANGE && Math.abs(dy) < DOG_BARK_RANGE;
      }

      if (!state.crashed && !state.airborne && !state.eaten
          && state.graceTimer <= 0
          && Math.abs(dx) < (c.kind === CRITTER_DEER ? 1.4 : 1.0)
          && Math.abs(dy) < 0.9) {
        c.down = true;
        if (c.kind === CRITTER_DEER) {
          // The deer bursts; the skier sails on through.
          c.splat = true;
          c.downTimer = 2.0;
          state.style += 50;
          if (events) events.push("deer");
        } else {
          c.downTimer = 1.6;
          crash(state, CRASH_POSE[c.kind] || Sprites.CRASH_SIT, events);
        }
      }
    }

    if (wrap(state.y - c.y) < 60 && Math.abs(wrap(state.x - c.x)) < 70) {
      kept.push(c);
    }
  }
  state.critters = kept;
}

// The sprite for a critter right now, as [spriteId, mirrored].
function critterSprite(c) {
  if (c.kind === CRITTER_DEER) {
    if (c.splat) return [c.downTimer > 1.2 ? Sprites.DEER_SPLAT_A
                                           : Sprites.DEER_SPLAT_B, false];
    return [Sprites.DEER_FRAMES[c.frame % 2], c.vx < 0];
  }
  if (c.kind === CRITTER_DOG) {
    var frames = (c.down || c.bark) ? Sprites.DOG_BARK_FRAMES
                                    : Sprites.DOG_FRAMES;
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

  y.frame = Math.floor(y.timer / 0.09) % Sprites.YETI_RUN_FRAMES.length;
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
    getUp(state);
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
  if (state.eaten || state.over) return;
  if (state.crashed) {
    getUp(state);
    return;
  }
  if (state.airborne) return;   // holding the key must not thrash the pose
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
    return [Sprites.JUMP_V, false];
  }

  if (state.bumpTimer > 0) return [Sprites.SKIER_BUMP, false];

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
