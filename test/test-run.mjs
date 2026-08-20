import { Engine, Sprites } from './harness.mjs';

const dt = 1 / 60;
let failures = 0;
function check(name, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
}

// --- 1. straight-down run --------------------------------------------------
{
  const s = Engine.createState();
  let crashes = 0, stuck = 0, maxStuck = 0, last = 0;
  const ev = [];
  for (let i = 0; i < 60 * 60; i++) {
    ev.length = 0;
    Engine.step(s, dt, ev);
    if (ev.includes('crash')) crashes++;
    if (Math.abs(s.distance - last) < 1e-12) { stuck++; maxStuck = Math.max(maxStuck, stuck); }
    else stuck = 0;
    last = s.distance;
  }
  console.log(`\n60s straight down: dist=${s.distance.toFixed(0)}m crashes=${crashes} ` +
              `longest-stall=${(maxStuck / 60).toFixed(2)}s course=${s.course}`);
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
    ev.length = 0;
    Engine.step(s, dt, ev);
    if (ev.includes('yeti') && spawnedAt === null) spawnedAt = s.distance;
  }
  check('yeti spawns past 2000m', spawnedAt !== null && spawnedAt >= Engine.YETI_DISTANCE,
        `at ${spawnedAt === null ? 'never' : spawnedAt.toFixed(0) + 'm'}`);
  check('yeti eats you at normal speed', s.eaten);
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
  for (let i = 0; i < 60 * 4; i++) { s.graceTimer = 9; Engine.step(s, dt, ev); }
  check('and build up to full speed',
        Math.abs(s.speed - Engine.SPEED_BY_HEADING[0]) < 0.01,
        `${s.speed.toFixed(1)}m/s`);

  // Skis fully across the fall line skid to a dead stop.
  s.heading = 3;
  let ticks = 0;
  let lastY = s.y;
  while (s.speed > 0 && ticks < 60 * 3) { s.graceTimer = 9; Engine.step(s, dt, ev); ticks++; }
  check('full sideways stops you dead', s.speed === 0,
        `stopped in ${(ticks / 60).toFixed(2)}s`);
  lastY = s.y;
  for (let i = 0; i < 60; i++) { s.graceTimer = 9; Engine.step(s, dt, ev); }
  check('and you stay put while stopped', Math.abs(s.y - lastY) < 1e-9);
  check('a crash costs your momentum', (() => {
    const t = Engine.createState();
    t.speed = 15;
    Engine.crash(t, 12, ev);
    return t.speed === 0;
  })());
}

// --- 5. jumping and flips --------------------------------------------------
{
  const s = Engine.createState();
  const ev = [];
  Engine.jump(s, ev);
  check('jump goes airborne', s.airborne && s.vertical > 0);
  let peak = 0, ticks = 0;
  while (s.airborne && ticks < 600) { Engine.step(s, dt, ev); peak = Math.max(peak, s.height); ticks++; }
  check('comes back down', !s.airborne, `peak=${peak.toFixed(2)}m in ${(ticks / 60).toFixed(2)}s`);

  // A full 4-stage backflip should score, and land clean.
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

// --- 6. crash recovery -----------------------------------------------------
{
  const s = Engine.createState();
  const ev = [];
  Engine.crash(s, Sprites.CRASH_OUCH, ev);
  check('crash stops you', s.crashed && Engine.speedFor(s) >= 0);
  let ticks = 0;
  while (s.crashed && ticks < 60 * 10) { Engine.step(s, dt, ev); ticks++; }
  check('you get back up', !s.crashed, `after ${(ticks / 60).toFixed(2)}s`);
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
  const a = Engine.objectsIn(0, 0, 40, 40, 'free');
  const b = Engine.objectsIn(0, 0, 40, 40, 'free');
  check('field is deterministic', JSON.stringify(a) === JSON.stringify(b), `${a.length} objects`);
  const tree = Engine.objectsIn(0, 0, 60, 60, Engine.COURSE_TREE)
    .filter(o => o.kind === Engine.SOLID).length;
  const free = Engine.objectsIn(0, 0, 60, 60, Engine.COURSE_FREESTYLE)
    .filter(o => o.kind === Engine.SOLID).length;
  check('tree slalom is denser', tree > free, `tree=${tree} free=${free}`);
  // Nothing may sit inside the clearing itself. Objects from cells that merely
  // overlap the query box are fine, so test each object's own position.
  const nearStart = Engine.objectsIn(-40, -30, 40, 45, 'free');
  const intruders = nearStart.filter(o => Engine.inStartClearing(o.x, o.y));
  check('start clearing is empty', intruders.length === 0,
        `${intruders.length} intruders of ${nearStart.length} nearby`);
}

// --- 9. courses ------------------------------------------------------------
{
  for (const c of [Engine.COURSE_SLALOM, Engine.COURSE_TREE]) {
    const gates = Engine.gatesFor(c);
    check(`${c} has gates`, gates.length > 5, `${gates.length} gates`);
  }
  check('freestyle has no gates', Engine.gatesFor(Engine.COURSE_FREESTYLE).length === 0);

  // Skiing down the slalom lane should select that course.
  const s = Engine.createState();
  s.x = Engine.courseById(Engine.COURSE_SLALOM).x;
  const ev = [];
  for (let i = 0; i < 60 * 5 && s.course === Engine.COURSE_NONE; i++) {
    s.heading = 0;
    Engine.step(s, dt, ev);
  }
  check('entering a lane picks the course', s.course === Engine.COURSE_SLALOM, s.course);
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
  check('89 sprites catalogued', ids.length === 89, `${ids.length}`);
  check('7 skier headings', Sprites.SKIER_BY_HEADING.length === 7);
  const missing = Sprites.SKIER_BY_HEADING.filter(e => !Sprites.SIZES[e[0]]);
  check('every heading has a sprite', missing.length === 0);
  check('yeti has run frames', Sprites.YETI_RUN_FRAMES.length === 4);
  check('yeti has an eat sequence', Sprites.YETI_EAT_FRAMES.length >= 6);
}

// --- 11b. gate judging, course timing and banners -------------------------
{
  const ev = [];

  // Thread every gate dead centre: all cleared, none missed.
  const good = Engine.createState();
  good.course = Engine.COURSE_SLALOM;
  const gates = Engine.gatesFor(Engine.COURSE_SLALOM);
  for (const g of gates) {
    good.x = g.x;          // perfectly on line
    good.y = g.y + 1.5;    // just past it
    Engine.stepCourse(good, 1 / 60, ev);
  }
  check('threading every gate clears them all',
        good.gatesCleared === gates.length && good.gatesMissed === 0,
        `${good.gatesCleared} cleared, ${good.gatesMissed} missed`);
  check('finishing the course is detected', good.courseFinished);
  check('every gate is judged', good.gateResults.length === gates.length);
  check('all results recorded as cleared',
        good.gateResults.every(r => r === true));

  // Ski far outside the gates: all missed.
  const bad = Engine.createState();
  bad.course = Engine.COURSE_SLALOM;
  for (const g of gates) {
    bad.x = g.x + 40;      // nowhere near
    bad.y = g.y + 1.5;
    Engine.stepCourse(bad, 1 / 60, ev);
  }
  check('missing every gate is counted',
        bad.gatesMissed === gates.length && bad.gatesCleared === 0,
        `${bad.gatesCleared} cleared, ${bad.gatesMissed} missed`);
  check('misses recorded as false', bad.gateResults.every(r => r === false));

  // Clearing a gate should be worth style points.
  const scored = Engine.createState();
  scored.course = Engine.COURSE_SLALOM;
  scored.x = gates[0].x;
  scored.y = gates[0].y + 1.5;
  const before = scored.style;
  Engine.stepCourse(scored, 1 / 60, ev);
  check('clearing a gate scores style', scored.style > before);

  // The course clock should run while on a course, and banners sit in order.
  const timed = Engine.createState();
  timed.course = Engine.COURSE_SLALOM;
  for (let i = 0; i < 120; i++) Engine.stepCourse(timed, 1 / 60, ev);
  check('course clock advances', timed.courseTime > 0,
        `${timed.courseTime.toFixed(2)}s`);
  check('finish banner is below the start banner',
        Engine.courseFinishY(Engine.COURSE_SLALOM) > Engine.courseStartY());
  const signage = [Sprites.SIGN_START_L, Sprites.SIGN_START_R,
                   Sprites.SIGN_FINISH_L, Sprites.SIGN_FINISH_R,
                   Sprites.GATE_GREEN, Sprites.GATE_RED,
                   Sprites.FLAG_LEFT, Sprites.FLAG_RIGHT,
                   Sprites.SIGN_SLALOM, Sprites.SIGN_TREE_SLALOM,
                   Sprites.SIGN_FREESTYLE, Sprites.LOGO,
                   Sprites.HINT_NUMPAD, Sprites.HINT_KEYS];
  const missingSigns = signage.filter(id => !Sprites.SIZES[id]);
  check('all signage sprites exist', missingSigns.length === 0,
        `${signage.length} checked, missing [${missingSigns}]`);
}

// --- 11c. a whole slalom run, played like a player ------------------------
{
  const s = Engine.createState();
  s.viewAbove = 9;
  s.x = Engine.courseById(Engine.COURSE_SLALOM).x;   // line up with the sign
  const ev = [];
  let entered = false, judged = 0;

  for (let i = 0; i < 60 * 120 && !s.courseFinished; i++) {
    // Steer toward the next gate, the way a player threads them. Heading
    // is capped at 2: full sideways is now a dead stop, and no player
    // parks across the hill in the middle of a timed run.
    const gates = Engine.gatesFor(s.course);
    const g = gates[s.nextGate];
    if (g) {
      const dx = g.x - s.x;
      Engine.setHeading(s, Math.max(-2, Math.min(2, Math.round(dx / 2))));
    }
    const before = s.nextGate;
    ev.length = 0;
    Engine.step(s, dt, ev);
    if (ev.includes('course:' + Engine.COURSE_SLALOM)) entered = true;
    if (s.nextGate > before) judged++;
  }

  const total = Engine.gatesFor(Engine.COURSE_SLALOM).length;
  check('skiing the lane enters the course', entered);
  check('every gate on the course is judged', judged === total,
        `${judged} of ${total}`);
  check('a played run clears most gates', s.gatesCleared / total > 0.7,
        `${s.gatesCleared} cleared, ${s.gatesMissed} missed`);
  check('the run reaches the finish', s.courseFinished,
        `${s.courseTime.toFixed(1)}s`);
  check('cleared plus missed equals judged',
        s.gatesCleared + s.gatesMissed === judged);
}

// --- 12. dogs, snowboarders and other skiers ------------------------------
{
  const s = Engine.createState();
  const ev = [];
  // Run long enough for several spawn intervals.
  for (let i = 0; i < 60 * 30; i++) Engine.step(s, dt, ev);
  check('critters appear on the hill', s.critters.length > 0, `${s.critters.length} present`);
  check('critter count is capped', s.critters.length <= Engine.MAX_CRITTERS);

  const kinds = new Set();
  const t = Engine.createState();
  for (let i = 0; i < 60 * 300; i++) {
    Engine.step(t, dt, ev);
    for (const c of t.critters) kinds.add(c.kind);
  }
  check('all three critter kinds spawn', kinds.size === 3, [...kinds].join(','));

  // Every kind must map to a real sprite in both states.
  let bad = 0;
  for (const kind of [Engine.CRITTER_DOG, Engine.CRITTER_BOARDER, Engine.CRITTER_SKIER]) {
    for (const down of [false, true]) {
      for (const vx of [-2, 0, 2]) {
        const [id] = Engine.critterSprite({ kind, down, vx, frame: 3, timer: 0.5 });
        if (!Sprites.SIZES[id]) bad++;
      }
    }
  }
  check('every critter frame has a sprite', bad === 0, `${bad} missing`);

  // Colliding with one should knock you down.
  const u = Engine.createState();
  u.critters = [{ kind: Engine.CRITTER_DOG, x: u.x, y: u.y, vx: 0, vy: 0,
                  frame: 0, timer: 0, down: false, downTimer: 0 }];
  Engine.step(u, dt, ev);
  check('running into a critter crashes you', u.crashed);
  check('the critter goes down too', u.critters[0].down);
}

// --- 13. a long survival run stays healthy --------------------------------
{
  const s = Engine.createState();
  const ev = [];
  let ticks = 0;
  // Steer like a player: mostly down, weaving.
  for (; ticks < 60 * 120 && !s.eaten; ticks++) {
    ev.length = 0;
    if (ticks % 40 === 0) Engine.setHeading(s, [0, 1, 0, -1][(ticks / 40) % 4]);
    if (s.distance > 1900) s.fast = true;
    Engine.step(s, dt, ev);
  }
  check('two-minute run does not wedge', s.distance > 800,
        `dist=${s.distance.toFixed(0)}m eaten=${s.eaten}`);
  check('numbers stay finite',
        Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.style));
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
