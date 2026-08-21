import { Engine, Sprites } from './harness.mjs';

const dt = 1 / 60;
let failures = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
}

// Crashes freeze the skier until a key is pressed, so every long bot run
// mashes the controls to get back up, the way a player would.
function playTick(s, ev) {
  ev.length = 0;
  if (s.crashed) Engine.turn(s, 1);
  Engine.step(s, dt, ev);
}

// --- 1. straight-down run --------------------------------------------------
{
  const s = Engine.createState();
  let crashes = 0, stuck = 0, maxStuck = 0, last = 0;
  const ev = [];
  for (let i = 0; i < 60 * 60; i++) {
    playTick(s, ev);
    if (ev.includes('crash')) crashes++;
    if (Math.abs(s.distance - last) < 1e-12) { stuck++; maxStuck = Math.max(maxStuck, stuck); }
    else stuck = 0;
    last = s.distance;
  }
  console.log(`\n60s straight down: dist=${s.distance.toFixed(0)}m crashes=${crashes} ` +
              `longest-stall=${(maxStuck / 60).toFixed(2)}s`);
  check('makes downhill progress', s.distance > 300, `${s.distance.toFixed(0)}m`);
  check('does not crash-loop', maxStuck / 60 < 3.0, `${(maxStuck / 60).toFixed(2)}s stalled`);
  check('crash rate is sane', crashes < 40, `${crashes} crashes/min`);
}

// --- 2. yeti appears at 2000m and eats you --------------------------------
{
  const s = Engine.createState();
  s.distance = Engine.YETI_DISTANCE - 1;
  const ev = [];
  let spawnedAt = null;
  for (let i = 0; i < 60 * 30 && !s.eaten; i++) {
    playTick(s, ev);
    if (ev.includes('yeti') && spawnedAt === null) spawnedAt = s.distance;
  }
  check('yeti spawns past 2000m', spawnedAt !== null && spawnedAt >= Engine.YETI_DISTANCE,
        `at ${spawnedAt === null ? 'never' : spawnedAt.toFixed(0) + 'm'}`);
  check('yeti eats you at normal speed', s.eaten);

  // The meal ends frozen on the boots sticking out of the maw.
  const frames = Sprites.YETI_EAT_FRAMES;
  check('the freeze frame is the feet', frames[frames.length - 1] === Sprites.YETI_FEET_A);
  while (!s.over) Engine.step(s, dt, []);
  check('eat sequence reaches its last frame', s.eatFrame === frames.length - 1);
}

// --- 3. F outruns the yeti -------------------------------------------------
{
  const s = Engine.createState();
  s.distance = Engine.YETI_DISTANCE - 1;
  s.fast = true;
  const ev = [];
  for (let i = 0; i < 60 * 25 && !s.eaten; i++) {
    ev.length = 0;
    s.fast = true;
    s.heading = 0;
    // This test measures momentum, not collision: skiing blind at 30 m/s
    // would crash constantly and reset the speed being measured, so keep
    // the obstacle grace topped up for the whole run.
    s.graceTimer = 1;
    Engine.step(s, dt, ev);
  }
  const gap = s.yeti ? Math.abs(Engine.wrap(s.y - s.yeti.y)) : 0;
  check('fast mode survives the yeti', !s.eaten, `gap=${gap.toFixed(1)}m`);
  check('fast mode doubles top speed',
        Math.abs(s.speed - Engine.SPEED_BY_HEADING[0] * 2) < 0.01, `${s.speed}m/s`);
  check('the monster is terrifyingly fast',
        Engine.YETI_SPEED > Engine.SPEED_BY_HEADING[0]
        && Engine.YETI_SPEED < Engine.SPEED_BY_HEADING[0] * Engine.FAST_MULTIPLIER,
        `${Engine.YETI_SPEED}m/s`);
}

// --- 4. speed varies with heading -----------------------------------------
{
  const s = Engine.createState();
  const speeds = [];
  for (let h = 0; h <= 3; h++) {
    s.heading = h;
    s.fast = false;
    speeds.push(Engine.speedFor(s));
  }
  check('straight down is fastest', speeds[0] === Math.max(...speeds), speeds.join(' > '));
  check('speed decreases as you turn',
        speeds[0] > speeds[1] && speeds[1] > speeds[2] && speeds[2] > speeds[3]);
}

// --- 4b. momentum: gradual build-up, dead stop at full sideways -------------
{
  const s = Engine.createState();
  const ev = [];
  s.graceTimer = 9; // measure movement, not collisions
  Engine.step(s, dt, ev);
  const early = s.speed;
  check('you push off slowly, not instantly', early > 0 && early < 2,
        `${early.toFixed(2)}m/s after one tick`);
  for (let i = 0; i < 60 * 4; i++) { s.graceTimer = 9; s.jumpGrace = 9; Engine.step(s, dt, ev); }
  check('and build up to full speed',
        Math.abs(s.speed - Engine.SPEED_BY_HEADING[0]) < 0.01,
        `${s.speed.toFixed(1)}m/s`);

  // Skis fully across the fall line skid to a dead stop.
  s.heading = 3;
  let ticks = 0;
  let lastY = s.y;
  while (s.speed > 0 && ticks < 60 * 3) { s.graceTimer = 9; s.jumpGrace = 9; Engine.step(s, dt, ev); ticks++; }
  check('full sideways stops you dead', s.speed === 0,
        `stopped in ${(ticks / 60).toFixed(2)}s`);
  lastY = s.y;
  for (let i = 0; i < 60; i++) { s.graceTimer = 9; s.jumpGrace = 9; Engine.step(s, dt, ev); }
  check('and you stay put while stopped', Math.abs(s.y - lastY) < 1e-9);
  check('a crash costs your momentum', (() => {
    const t = Engine.createState();
    t.speed = 15;
    Engine.crash(t, Sprites.CRASH_SIT, ev);
    return t.speed === 0;
  })());
}

// --- 5. jumping and flips --------------------------------------------------
{
  const s = Engine.createState();
  const ev = [];
  Engine.jump(s, ev);
  check('jump goes airborne', s.airborne && s.vertical > 0);

  // Holding the jump key must not thrash the pose mid-air.
  const stageBefore = s.flipStage;
  Engine.jump(s, ev);
  check('jumping again mid-air does nothing', s.flipStage === stageBefore);
  check('plain air uses the flying V', Engine.skierSprite(s)[0] === Sprites.JUMP_V);

  let peak = 0, ticks = 0;
  while (s.airborne && ticks < 600) { Engine.step(s, dt, ev); peak = Math.max(peak, s.height); ticks++; }
  check('comes back down', !s.airborne, `peak=${peak.toFixed(2)}m in ${(ticks / 60).toFixed(2)}s`);
  check('landing arms a launch grace', s.jumpGrace > 0, `${s.jumpGrace.toFixed(2)}s`);

  // A full 4-stage backflip (steered in the air) should score, and land clean.
  const t = Engine.createState();
  Engine.jump(t, ev);
  const before = t.style;
  for (let i = 0; i < Sprites.FLIP_FRAMES.length; i++) Engine.turn(t, 1);
  check('full backflip scores style', t.style > before, `+${(t.style - before).toFixed(0)}`);
  while (t.airborne) Engine.step(t, dt, ev);
  check('clean flip lands upright', !t.crashed);

  // Landing mid-rotation should wipe out.
  const u = Engine.createState();
  Engine.jump(u, ev);
  Engine.turn(u, 1);   // one stage only: still inverted
  while (u.airborne) Engine.step(u, dt, ev);
  check('partial flip crashes', u.crashed);
}

// --- 5b. moguls rattle, only the ramp launches ------------------------------
{
  const field = Engine.objectsIn(-300, -300, 300, 300);
  const mogul = field.find(o => o.kind === Engine.BUMP);
  const ramp = field.find(o => o.kind === Engine.JUMPABLE);
  check('the field has moguls and a ramp', !!mogul && !!ramp);

  if (mogul) {
    const s = Engine.createState();
    s.x = mogul.x; s.y = mogul.y; s.speed = 12;
    Engine.step(s, dt, []);
    check('a mogul does not launch you', !s.airborne);
    check('a mogul rattles you into the X pose',
          s.bumpTimer > 0 && Engine.skierSprite(s)[0] === Sprites.SKIER_BUMP);
    check('a mogul scrubs speed', s.speed < 12 * 0.7, `${s.speed.toFixed(1)}m/s`);

    // Standing still on a mogul must stay still — no bounce loop.
    const t = Engine.createState();
    t.x = mogul.x; t.y = mogul.y; t.speed = 0; t.heading = 3;
    for (let i = 0; i < 60; i++) Engine.step(t, dt, []);
    check('standing on a mogul is inert', !t.airborne && t.bumpTimer === 0);
  }

  if (ramp) {
    const s = Engine.createState();
    s.x = ramp.x; s.y = ramp.y; s.speed = 12;
    const ev = [];
    Engine.step(s, dt, ev);
    check('the rainbow ramp launches you', s.airborne && ev.includes('ramp'));

    // And a skier parked on the ramp does not get flung.
    const t = Engine.createState();
    t.x = ramp.x; t.y = ramp.y; t.speed = 0; t.heading = 3;
    Engine.step(t, dt, []);
    check('a parked skier is not flung off a ramp', !t.airborne);
  }
}

// --- 6. crash recovery: you stay down until a key --------------------------
{
  const s = Engine.createState();
  const ev = [];
  Engine.crash(s, Sprites.CRASH_SIT, ev);
  check('crash stops you', s.crashed && s.speed === 0);
  check('the starburst gets a word', Sprites.CRASH_WORDS.includes(s.crashWord),
        `"${s.crashWord}"`);

  for (let i = 0; i < 60 * 5; i++) Engine.step(s, dt, ev);
  check('you stay down with no input', s.crashed, `still down after 5s`);

  Engine.turn(s, 1);
  check('a key picks you back up', !s.crashed && s.graceTimer > 0);

  // But not instantly: the minimum sit has to be served first.
  const t = Engine.createState();
  Engine.crash(t, Sprites.CRASH_SIT, ev);
  Engine.turn(t, 1);
  check('no instant pop-up after a crash', t.crashed);

  // Different crashes may shout different things.
  const words = new Set();
  for (let i = 0; i < 60; i++) {
    const u = Engine.createState();
    Engine.crash(u, Sprites.CRASH_SIT, ev);
    words.add(u.crashWord);
  }
  check('the crash word varies', words.size > 1, [...words].join(' '));
}

// --- 7. world wraps at +/-2048m -------------------------------------------
{
  check('wrap is periodic', Math.abs(Engine.wrap(Engine.WORLD_LIMIT * 2 + 5) - 5) < 1e-9);
  check('wrap is symmetric', Math.abs(Engine.wrap(-Engine.WORLD_LIMIT - 1) - (Engine.WORLD_LIMIT - 1)) < 1e-9);
  check('world limit is 2048', Engine.WORLD_LIMIT === 2048);
  check('8 pixels per metre', Engine.PIXELS_PER_METRE === 8);
}

// --- 8. field is deterministic and stable ---------------------------------
{
  const a = Engine.objectsIn(0, 0, 40, 40);
  const b = Engine.objectsIn(0, 0, 40, 40);
  check('field is deterministic', JSON.stringify(a) === JSON.stringify(b), `${a.length} objects`);

  // Nothing may sit inside the clearing itself. Objects from cells that merely
  // overlap the query box are fine, so test each object's own position.
  const nearStart = Engine.objectsIn(-40, -30, 40, 45);
  const intruders = nearStart.filter(o => Engine.inStartClearing(o.x, o.y));
  check('start clearing is empty', intruders.length === 0,
        `${intruders.length} intruders of ${nearStart.length} nearby`);

  // The hill should offer some big dead trees and stumps among the rest.
  const wide = Engine.objectsIn(-400, -400, 400, 400);
  const sprites = new Set(wide.map(o => o.sprite));
  check('big dead trees grow on the hill',
        sprites.has(Sprites.TREE_DEAD_BIG_A) || sprites.has(Sprites.TREE_DEAD_BIG_B));
  check('stumps litter the hill', sprites.has(Sprites.STUMP));

  // Mogul patches: somewhere out there, seven-plus bumps piled together.
  const bumps = wide.filter(o => o.kind === Engine.BUMP);
  let biggestPile = 0;
  for (const b of bumps) {
    const near = bumps.filter(o =>
      Math.abs(o.x - b.x) < 6 && Math.abs(o.y - b.y) < 6).length;
    biggestPile = Math.max(biggestPile, near);
  }
  check('moguls pile up in clusters', biggestPile >= 7, `${biggestPile} together`);
}

// --- 10. status box formatting matches the original -----------------------
{
  check('time format', Engine.formatTime(96.54) === '0:01:36.54', Engine.formatTime(96.54));
  check('dist format', Engine.formatDistance(723) === '  723m', `"${Engine.formatDistance(723)}"`);
  check('speed format', Engine.formatSpeed(13) === '13m/s', `"${Engine.formatSpeed(13)}"`);
  check('style format', Engine.formatStyle(266).trim() === '266', `"${Engine.formatStyle(266)}"`);
}

// --- 11. sprite catalog integrity -----------------------------------------
{
  const ids = Object.keys(Sprites.SIZES).map(Number);
  check('85 sprites catalogued', ids.length === 85, `${ids.length}`);
  check('7 skier headings', Sprites.SKIER_BY_HEADING.length === 7);
  const missing = Sprites.SKIER_BY_HEADING.filter(e => !Sprites.SIZES[e[0]]);
  check('every heading has a sprite', missing.length === 0);
  check('yeti has run frames', Sprites.YETI_RUN_FRAMES.length === 4);
  check('yeti has an eat sequence', Sprites.YETI_EAT_FRAMES.length >= 6);
  const extras = [Sprites.SKIER_BUMP, Sprites.JUMP_V, Sprites.DEER_A,
                  Sprites.DEER_B, Sprites.DEER_SPLAT_A, Sprites.DEER_SPLAT_B,
                  Sprites.TREE_DEAD_BIG_A, Sprites.TREE_DEAD_BIG_B,
                  Sprites.CRASH_OUCH, Sprites.LOGO];
  check('new sprites are catalogued', extras.every(id => !!Sprites.SIZES[id]));
  check('crash words exist', Sprites.CRASH_WORDS.length >= 5);
}

// --- 12. dogs, deer, snowboarders and other skiers ------------------------
{
  const s = Engine.createState();
  const ev = [];
  // Run long enough for several spawn intervals.
  for (let i = 0; i < 60 * 30; i++) playTick(s, ev);
  check('critters appear on the hill', s.critters.length > 0, `${s.critters.length} present`);
  check('critter count is capped', s.critters.length <= Engine.MAX_CRITTERS);

  const kinds = new Set();
  const t = Engine.createState();
  for (let i = 0; i < 60 * 300; i++) {
    playTick(t, ev);
    for (const c of t.critters) kinds.add(c.kind);
  }
  check('all four critter kinds spawn', kinds.size === 4, [...kinds].join(','));

  // Every kind must map to a real sprite in every state.
  let bad = 0;
  for (const kind of [Engine.CRITTER_DOG, Engine.CRITTER_BOARDER,
                      Engine.CRITTER_SKIER, Engine.CRITTER_DEER]) {
    for (const down of [false, true]) {
      for (const vx of [-2, 0, 2]) {
        const [id] = Engine.critterSprite({ kind, down, splat: down && kind === Engine.CRITTER_DEER,
                                            vx, frame: 3, timer: 0.5, bark: false, downTimer: 1.5 });
        if (!Sprites.SIZES[id]) bad++;
      }
    }
  }
  check('every critter frame has a sprite', bad === 0, `${bad} missing`);

  // Colliding with a boarder or dog knocks you down.
  const u = Engine.createState();
  u.critters = [{ kind: Engine.CRITTER_DOG, x: u.x, y: u.y, vx: 0, vy: 0,
                  frame: 0, timer: 0, bark: false, splat: false, down: false, downTimer: 0 }];
  Engine.step(u, dt, ev);
  check('running into a dog crashes you', u.crashed);
  check('the dog goes down too', u.critters[0].down);

  // A deer just explodes; you ski straight through.
  const v = Engine.createState();
  v.speed = 14;
  v.critters = [{ kind: Engine.CRITTER_DEER, x: v.x, y: v.y, vx: 6, vy: 1,
                  frame: 0, timer: 0, bark: false, splat: false, down: false, downTimer: 0 }];
  ev.length = 0;
  Engine.step(v, dt, ev);
  check('hitting a deer does not crash you', !v.crashed && ev.includes('deer'));
  check('the deer bursts', v.critters[0].splat);
  const [splatId] = Engine.critterSprite(v.critters[0]);
  check('the burst has a sprite', splatId === Sprites.DEER_SPLAT_A);
  // A fresh critter may wander in during the wait, so look specifically
  // for the splatted remains rather than any deer at all.
  for (let i = 0; i < 60 * 3; i++) Engine.step(v, dt, ev);
  check('the remains soak away', !v.critters.some(c => c.splat));

  // Dogs bark when the skier is close.
  const w = Engine.createState();
  w.critters = [{ kind: Engine.CRITTER_DOG, x: w.x + 3, y: w.y + 3, vx: 4, vy: 0.8,
                  frame: 0, timer: 0, bark: false, splat: false, down: false, downTimer: 0 }];
  Engine.step(w, dt, ev);
  check('a close dog barks', w.critters.length && w.critters[0].bark);
  check('a barking dog shows a bark frame',
        Sprites.DOG_BARK_FRAMES.includes(Engine.critterSprite(w.critters[0])[0]));
}

// --- 13. a long survival run stays healthy --------------------------------
{
  const s = Engine.createState();
  const ev = [];
  let ticks = 0;
  // Steer like a player: mostly down, weaving, mashing up after crashes.
  for (; ticks < 60 * 120 && !s.eaten; ticks++) {
    if (s.crashed) Engine.turn(s, 1);
    else if (ticks % 40 === 0) Engine.setHeading(s, [0, 1, 0, -1][(ticks / 40) % 4]);
    if (s.distance > 1900) s.fast = true;
    ev.length = 0;
    Engine.step(s, dt, ev);
  }
  check('two-minute run does not wedge', s.distance > 800,
        `dist=${s.distance.toFixed(0)}m eaten=${s.eaten}`);
  check('numbers stay finite',
        Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.style));
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
