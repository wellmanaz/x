// Rules tests for Hair Force One. Run with: node --test  (from the hair folder)
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../js/engine.js");

const DT = 1 / 60;
const STEPS = [[0, -1], [-1, 0], [0, 1], [1, 0]];

// ---------- helpers ----------

function newGame(opts) {
  return E.createGame(Object.assign({ seed: 42, invincible: true }, opts || {}));
}
function play(g) { let n = 0; while (g.mode === "ready" && n++ < 1000) E.step(g, {}, DT); }
function run(g, input, secs) { for (let i = 0; i < Math.round(secs * 60); i++) E.step(g, input || {}, DT); }
function at(m, x, y) { return m.cell[y * m.W + x]; }
function item(m, x, y) { return m.item[y * m.W + x]; }
function findAll(m, fn) {
  const out = [];
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++) if (fn(x, y)) out.push({ x, y });
  return out;
}
function putHero(g, x, y) {
  const p = g.player;
  p.x = p.cx = x; p.y = p.cy = y;
  p.dx = p.dy = 0; p.want = null; p.px = p.py = null; p.lift = 0;
}
// Shut every chaser away in D.C. so a test can look at one thing at a time.
function parkChasers(g) {
  const h = g.maze.homeCentre;
  g.chasers.forEach((c) => { c.state = "home"; c.wait = 1e9; c.x = h.x; c.y = h.y; c.dx = c.dy = 0; });
}
// An open tile a long way from t.
function farFrom(g, t) {
  const m = g.maze;
  return findAll(m, (x, y) => at(m, x, y) === "path")
    .sort((a, b) => (Math.abs(b.x - t.x) + Math.abs(b.y - t.y)) - (Math.abs(a.x - t.x) + Math.abs(a.y - t.y)))[0];
}
function events(g, type) { return g.events.filter((e) => e.type === type); }
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}
const onLine = (v) => Math.abs(v - Math.round(v)) < 1e-6;

// ---------- the mazes ----------

test("there are four mazes, each 25 x 21", () => {
  assert.equal(E.MAZES.length, 4);
  for (const spec of E.MAZES) {
    assert.equal(spec.rows.length, 21, spec.key);
    spec.rows.forEach((r, y) => assert.equal(r.length, 25, spec.key + " row " + y));
  }
});

for (const spec of E.MAZES) {
  test("maze " + spec.key + " has everything it needs and nothing broken", () => {
    const m = E.build(spec);
    assert.ok(m.name && m.tip, "name and tip");
    assert.ok(m.start && at(m, m.start.x, m.start.y) === "path", "start");
    assert.ok(m.door && at(m, m.door.x, m.door.y) === "door", "door");
    assert.ok(m.exit && at(m, m.exit.x, m.exit.y) === "path", "exit above the door");
    assert.ok(m.home.length >= 3, "room for three chasers at home");
    assert.ok(m.bonus && at(m, m.bonus.x, m.bonus.y) === "path", "bonus spot");
    assert.ok(m.coins > 200, "plenty of gold");
    assert.equal(Object.keys(m.elevator).length % 2, 0, "elevators come in pairs");
    assert.ok(findAll(m, (x, y) => item(m, x, y) === 2).length >= 4, "cheeseburgers");
    assert.ok(findAll(m, (x, y) => item(m, x, y) === 3).length >= 1, "a brick pile");

    // The outer edge is all wall.
    for (let x = 0; x < m.W; x++) { assert.equal(at(m, x, 0), "wall"); assert.equal(at(m, x, m.H - 1), "wall"); }
    for (let y = 0; y < m.H; y++) { assert.equal(at(m, 0, y), "wall"); assert.equal(at(m, m.W - 1, y), "wall"); }

    // Left and right halves mirror each other.
    // (Elevator numbers may cross over, as in the swamp's drain pipes.)
    const shape = (r) => r.replace(/[12]/g, "E");
    spec.rows.forEach((r, y) => assert.equal(shape(r.split("").reverse().join("")), shape(r), spec.key + " row " + y));

    const open = (x, y) => x >= 0 && y >= 0 && x < m.W && y < m.H && at(m, x, y) === "path";
    const paths = findAll(m, open);
    for (const t of paths) {
      const ways = STEPS.filter(([dx, dy]) => open(t.x + dx, t.y + dy)).length;
      assert.ok(ways >= 2, "dead end at " + t.x + "," + t.y);
    }
    for (let y = 0; y < m.H - 1; y++) for (let x = 0; x < m.W - 1; x++) {
      assert.ok(!(open(x, y) && open(x + 1, y) && open(x, y + 1) && open(x + 1, y + 1)), "2x2 open block at " + x + "," + y);
    }

    // The hero can walk to every open tile from the start.
    const g = newGame({ stage: E.MAZES.indexOf(spec) });
    const seen = new Set([m.start.x + "," + m.start.y]);
    const q = [m.start];
    while (q.length) {
      const t = q.shift();
      for (const [dx, dy] of STEPS) {
        const k = (t.x + dx) + "," + (t.y + dy);
        if (!seen.has(k) && E.heroOpen(g, t.x + dx, t.y + dy)) { seen.add(k); q.push({ x: t.x + dx, y: t.y + dy }); }
      }
    }
    assert.equal(seen.size, paths.length, "every tile reachable");

    // Chasers can get out of D.C., and from the exit to every open tile.
    for (const h of m.home) {
      const d = E.distances(g, { state: "leave" }, m.exit.x, m.exit.y);
      assert.ok(d[h.y * m.W + h.x] < Infinity, "home tile " + h.x + " can reach the exit");
    }
    const fromExit = E.distances(g, { state: "chase" }, m.exit.x, m.exit.y);
    for (const t of paths) assert.ok(fromExit[t.y * m.W + t.x] < Infinity, "chasers reach " + t.x + "," + t.y);
    // A chaser on the hunt cannot walk into D.C.
    assert.equal(E.chaserOpen(g, { state: "chase" }, m.door.x, m.door.y), false);
    assert.equal(E.chaserOpen(g, { state: "leave" }, m.door.x, m.door.y), true);
  });
}

// ---------- moving about ----------

test("the hero and the chasers stay on the grid and out of walls", () => {
  for (const seed of [1, 2, 3]) {
    for (let stage = 0; stage < 4; stage++) {
      const g = newGame({ seed, stage });
      const r = rng(seed * 100 + stage);
      let input = {};
      for (let i = 0; i < 60 * 40; i++) {
        if (i % 20 === 0) {
          const k = ["up", "down", "left", "right"][Math.floor(r() * 4)];
          input = { [k]: true, build: r() < 0.08 };
        } else input.build = false;
        E.step(g, input, DT);
        const p = g.player, m = g.maze;
        assert.ok(onLine(p.x) || onLine(p.y), `hero off the grid at ${p.x},${p.y}`);
        assert.equal(at(m, Math.round(p.x), Math.round(p.y)), "path", `hero in a wall at ${p.x},${p.y}`);
        for (const c of g.chasers) {
          assert.ok(onLine(c.x) || onLine(c.y), `${c.kind} off the grid at ${c.x},${c.y}`);
          assert.notEqual(at(m, Math.round(c.x), Math.round(c.y)), "wall", `${c.kind} in a wall`);
          const w = g.walls.find((w) => w.x === Math.round(c.x) && w.y === Math.round(c.y));
          assert.ok(!w || c.state === "fired", `${c.kind} walked through a built wall`);
        }
        if (g.mode === "clear") break;
      }
    }
  }
});

test("the first direction pressed during READY is used at the start", () => {
  const g = newGame();
  parkChasers(g);
  E.step(g, { left: true }, DT);
  play(g);
  run(g, {}, 0.3);
  assert.ok(g.player.x < g.maze.start.x, "moved left with nothing held");
});

test("the hero turns round at once", () => {
  const g = newGame();
  play(g);
  parkChasers(g);
  run(g, { left: true }, 0.2);
  assert.equal(g.player.dx, -1);
  E.step(g, { right: true }, DT);
  assert.equal(g.player.dx, 1);
});

test("the hero stops at a wall and waits", () => {
  const g = newGame();
  play(g);
  parkChasers(g);
  run(g, { up: true }, 2);  // straight up from the start is a wall at once
  const p = g.player;
  assert.equal(p.dx, 0); assert.equal(p.dy, 0);
  assert.equal(at(g.maze, p.x, p.y - 1) !== "path" || !E.heroOpen(g, p.x, p.y - 1), true);
});

test("sand and mud slow the hero down", () => {
  const g = newGame({ stage: 1 });
  play(g);
  parkChasers(g);
  const m = g.maze;
  const sand = findAll(m, (x, y) => m.sand[y * m.W + x] && E.heroOpen(g, x + 1, y));
  const firm = findAll(m, (x, y) => !m.sand[y * m.W + x] && at(m, x, y) === "path" && E.heroOpen(g, x + 1, y) && !m.sand[y * m.W + x + 1]);
  assert.ok(sand.length && firm.length);
  putHero(g, sand[0].x, sand[0].y);
  run(g, { right: true }, 2 / 60);
  const slow = g.player.x - sand[0].x;
  putHero(g, firm[0].x, firm[0].y);
  run(g, { right: true }, 2 / 60);
  const fast = g.player.x - firm[0].x;
  assert.ok(slow > 0 && slow < fast * 0.7, `sand ${slow} vs firm ${fast}`);
});

// ---------- elevators ----------

test("an elevator carries the hero to the other pad", () => {
  const g = newGame({ stage: 0 });
  play(g);
  parkChasers(g);
  const m = g.maze;
  const pads = Object.keys(m.elevator).map(Number).map((i) => ({ x: i % m.W, y: Math.floor(i / m.W) }));
  assert.equal(pads.length, 2);
  const [a, b] = pads.sort((p, q) => p.x - q.x);
  putHero(g, a.x + 2, a.y);
  g.events.length = 0;
  run(g, { left: true }, 0.5);
  assert.equal(events(g, "elevator").length, 1);
  assert.ok(Math.abs(g.player.x - b.x) <= 1.5 && g.player.y === b.y, `hero at ${g.player.x},${g.player.y}`);
});

test("walking off an elevator pad does not ride it", () => {
  const g = newGame({ stage: 0 });
  play(g);
  parkChasers(g);
  const m = g.maze;
  const i = Number(Object.keys(m.elevator)[0]);
  const pad = { x: i % m.W, y: Math.floor(i / m.W) };
  putHero(g, pad.x, pad.y);
  g.events.length = 0;
  const dir = E.heroOpen(g, pad.x + 1, pad.y) ? { right: true } : { left: true };
  run(g, dir, 0.3);
  assert.equal(events(g, "elevator").length, 0);
  assert.equal(g.player.y, pad.y);
  assert.ok(Math.abs(g.player.x - pad.x) > 0.5 && Math.abs(g.player.x - pad.x) < 3);
});

// ---------- gold, burgers, bricks ----------

test("coins score 10 and a bonus item turns up after 60", () => {
  const g = newGame();
  play(g);
  parkChasers(g);
  const m = g.maze;
  const coin = findAll(m, (x, y) => item(m, x, y) === 1)[0];
  g.eaten = 59;
  const before = g.score, left = g.coinsLeft;
  putHero(g, coin.x, coin.y);
  E.step(g, {}, DT);
  assert.equal(g.score - before, 10);
  assert.equal(g.coinsLeft, left - 1);
  assert.ok(g.bonus, "bonus item out");
  assert.deepEqual([g.bonus.x, g.bonus.y], [m.bonus.x, m.bonus.y]);
  const s = g.score;
  putHero(g, m.bonus.x, m.bonus.y);
  E.step(g, {}, DT);
  assert.equal(g.score - s, 500);
  assert.equal(g.bonus, null);
});

test("a brick pile gives two bricks, up to six", () => {
  const g = newGame();
  play(g);
  parkChasers(g);
  const m = g.maze;
  const pile = findAll(m, (x, y) => item(m, x, y) === 3)[0];
  g.bricks = 5;
  putHero(g, pile.x, pile.y);
  E.step(g, {}, DT);
  assert.equal(g.bricks, 6);
  assert.equal(events(g, "bricks").length, 1);
});

test("a cheeseburger goes BIGLY and fired chasers score 200, 400, 800, 1600", () => {
  const g = newGame({ invincible: false });
  play(g);
  const m = g.maze;
  const burger = findAll(m, (x, y) => item(m, x, y) === 2)[0];
  const far = farFrom(g, burger);
  g.chasers.forEach((c) => { c.state = "chase"; c.x = far.x; c.y = far.y; c.dx = c.dy = 0; });
  putHero(g, burger.x, burger.y);
  E.step(g, {}, DT);
  assert.ok(g.bigly > 0);
  assert.equal(events(g, "bigly").length, 1);
  assert.ok(g.chasers.every((c) => c.state === "flee"));

  const scores = [];
  for (const c of g.chasers) {
    c.x = g.player.x; c.y = g.player.y; c.dx = c.dy = 0;
    const s = g.score;
    E.step(g, {}, DT);
    assert.equal(c.state, "fired", c.kind);
    scores.push(g.score - s);
    c.x = m.homeCentre.x; c.y = m.homeCentre.y;   // out of the way
  }
  assert.deepEqual(scores, [200, 400, 800, 1600]);
  assert.equal(g.mode, "play", "no harm done");
});

test("a fired chaser flies home, waits, then comes back out", () => {
  const g = newGame();
  play(g);
  parkChasers(g);
  const c = g.chasers[0];
  c.state = "fired"; c.wait = 0; c.x = 1; c.y = 1; c.dx = c.dy = 0;
  const seen = new Set();
  for (let i = 0; i < 60 * 12; i++) { E.step(g, {}, DT); seen.add(c.state); }
  assert.ok(seen.has("home") && seen.has("leave") && seen.has("chase"), [...seen].join());
  assert.equal(events(g, "back-home").length, 1);
});

test("BIGLY runs out and the chasers turn back", () => {
  const g = newGame();
  play(g);
  const burger = findAll(g.maze, (x, y) => item(g.maze, x, y) === 2)[0];
  const far = farFrom(g, burger);
  g.chasers[0].x = far.x; g.chasers[0].y = far.y;
  putHero(g, burger.x, burger.y);
  E.step(g, {}, DT);
  assert.equal(g.chasers[0].state, "flee");
  run(g, {}, E.tuning(g).bigly + 0.1);
  assert.equal(g.bigly, 0);
  assert.notEqual(g.chasers[0].state, "flee");
  assert.equal(events(g, "bigly-end").length, 1);
});

// ---------- walls ----------

test("A builds a wall behind the hero that blocks chasers, then crumbles", () => {
  const g = newGame();
  play(g);
  parkChasers(g);
  const start = g.maze.start;
  run(g, { left: true }, 0.25);
  const bricks = g.bricks;
  assert.ok(E.buildWall(g));
  assert.equal(g.bricks, bricks - 1);
  const w = g.walls[0];
  assert.equal(w.y, start.y);
  assert.ok(w.x > g.player.x, "behind the hero");
  assert.equal(E.heroOpen(g, w.x, w.y), false);
  assert.equal(E.chaserOpen(g, { state: "chase" }, w.x, w.y), false);
  assert.equal(E.chaserOpen(g, { state: "flee" }, w.x, w.y), false);
  assert.equal(E.chaserOpen(g, { state: "fired" }, w.x, w.y), true);

  // The hero cannot walk back through it.
  run(g, { right: true }, 1);
  assert.ok(g.player.x <= w.x - 1 + 1e-9);

  run(g, {}, E.C.WALL_TIME);
  assert.equal(g.walls.length, 0);
  assert.equal(events(g, "crumble").length, 1);
});

test("no more than two walls at once, and none without bricks", () => {
  const g = newGame();
  play(g);
  parkChasers(g);
  g.bricks = 6;
  run(g, { left: true }, 0.25);
  assert.ok(E.buildWall(g));
  run(g, { left: true }, 0.4);
  assert.ok(E.buildWall(g));
  run(g, { left: true }, 0.4);
  assert.equal(E.buildWall(g), false);
  assert.equal(g.walls.length, 2);
  assert.equal(g.bricks, 4);

  const h = newGame();
  play(h);
  parkChasers(h);
  h.bricks = 0;
  run(h, { left: true }, 0.25);
  assert.equal(E.buildWall(h), false);
  assert.equal(events(h, "no-build").length, 1);
});

test("a wall never lands on a chaser", () => {
  const g = newGame();
  play(g);
  parkChasers(g);
  run(g, { left: true }, 0.25);
  const spot = E.wallSpot(g);
  assert.ok(spot);
  const c = g.chasers[1];
  c.state = "chase"; c.x = spot.x; c.y = spot.y;
  const again = E.wallSpot(g);
  assert.ok(!again || again.x !== spot.x || again.y !== spot.y);
});

test("a chaser heading into a new wall turns back", () => {
  const g = newGame();
  play(g);
  parkChasers(g);
  run(g, { left: true }, 0.25);
  const spot = E.wallSpot(g);
  const c = g.chasers[0];
  c.state = "chase"; c.x = spot.x + 0.9; c.y = spot.y; c.dx = -1; c.dy = 0;
  assert.ok(E.buildWall(g));
  E.step(g, {}, DT);
  assert.equal(c.dx, 1, "reversed");
});

// ---------- the chasers ----------

test("each chaser hunts in its own way", () => {
  const g = newGame();
  play(g);
  parkChasers(g);
  const [sub, checker, mic, aud] = g.chasers;
  const p = g.player;
  run(g, { left: true }, 0.2);
  const hero = { x: Math.round(p.x), y: Math.round(p.y) };

  sub.state = "chase"; sub.x = 1; sub.y = 19;
  assert.deepEqual(E.chaseTarget(g, sub), hero);

  checker.state = "chase"; checker.x = 1; checker.y = 19;
  const ahead = E.chaseTarget(g, checker);
  assert.equal(ahead.y, hero.y);
  assert.ok(ahead.x < hero.x, "the Fact-Checker cuts in ahead of the hero");

  aud.state = "chase"; aud.x = 1; aud.y = 19;
  g.t = 10;
  g.trail = [{ x: 3, y: 1, t: 7 }, { x: 4, y: 1, t: 8.6 }, { x: 5, y: 1, t: 9.5 }];
  assert.deepEqual([E.chaseTarget(g, aud).x, E.chaseTarget(g, aud).y], [4, 1], "the Auditor follows the trail");
  aud.x = hero.x + 2; aud.y = hero.y;
  assert.deepEqual(E.chaseTarget(g, aud), hero, "up close the Auditor goes straight in");

  mic.state = "chase"; mic.x = 1; mic.y = 19;
  g.noise = { x: 23, y: 1, t: g.t };
  const n = E.chaseTarget(g, mic);
  assert.deepEqual([n.x, n.y], [23, 1], "the Hot Mic runs to the noise");
  g.noise = { x: 23, y: 1, t: g.t - 20 };
  const w = E.chaseTarget(g, mic);
  assert.equal(at(g.maze, w.x, w.y), "path", "with nothing to hear it roams");
});

test("building a wall makes a noise", () => {
  const g = newGame();
  play(g);
  parkChasers(g);
  run(g, { left: true }, 0.25);
  g.noise = null;
  E.buildWall(g);
  assert.ok(g.noise);
  assert.deepEqual([g.noise.x, g.noise.y], [g.walls[0].x, g.walls[0].y]);
});

test("all four chasers are out of D.C. after a while", () => {
  const g = newGame();
  play(g);
  run(g, {}, 16);
  for (const c of g.chasers) assert.ok(c.state === "chase" || c.state === "flee", c.kind + " is " + c.state);
});

// ---------- lives, stages, score ----------

test("a chaser on the hunt catches the hero", () => {
  const g = newGame({ invincible: false, lives: 3 });
  play(g);
  parkChasers(g);
  const c = g.chasers[0];
  c.state = "chase"; c.x = g.player.x; c.y = g.player.y;
  E.step(g, {}, DT);
  assert.equal(g.mode, "dying");
  assert.equal(events(g, "die")[0].by, "subpoena");
  run(g, {}, E.C.DYING_TIME + 0.05);
  assert.equal(g.lives, 2);
  assert.equal(g.mode, "ready");
  assert.deepEqual([g.player.x, g.player.y], [g.maze.start.x, g.maze.start.y]);
});

test("losing the last life ends the game", () => {
  const g = newGame({ invincible: false, lives: 1 });
  play(g);
  parkChasers(g);
  const c = g.chasers[0];
  c.state = "chase"; c.x = g.player.x; c.y = g.player.y;
  E.step(g, {}, DT);
  run(g, {}, E.C.DYING_TIME + 0.05);
  assert.equal(g.mode, "over");
  assert.equal(g.lives, 0);
  assert.equal(events(g, "game-over").length, 1);
});

test("grabbing the last coin clears the stage and the next maze loads", () => {
  const g = newGame();
  play(g);
  parkChasers(g);
  const m = g.maze;
  const coin = findAll(m, (x, y) => item(m, x, y) === 1)[0];
  g.coinsLeft = 1;
  putHero(g, coin.x, coin.y);
  E.step(g, {}, DT);
  assert.equal(g.mode, "clear");
  run(g, {}, E.C.CLEAR_TIME + 0.05);
  assert.equal(g.stageNum, 1);
  assert.equal(g.maze.key, E.MAZES[1].key);
  assert.equal(g.mode, "ready");
  assert.equal(g.coinsLeft, g.maze.coins);
  assert.equal(events(g, "stage").length, 1);
  // After the fourth maze it goes round again.
  assert.equal(newGame({ stage: 4 }).maze.key, E.MAZES[0].key);
});

test("an extra life at 15,000, then every 40,000", () => {
  const g = newGame({ lives: 3 });
  play(g);
  parkChasers(g);
  const m = g.maze;
  const coins = findAll(m, (x, y) => item(m, x, y) === 1);
  g.score = 14990;
  putHero(g, coins[0].x, coins[0].y);
  E.step(g, {}, DT);
  assert.equal(g.lives, 4);
  assert.equal(g.nextExtra, 55000);
  g.score = 54990;
  putHero(g, coins[1].x, coins[1].y);
  E.step(g, {}, DT);
  assert.equal(g.lives, 5);
  assert.equal(events(g, "extra-life").length, 2);
});

test("difficulty and later stages change the pace", () => {
  const t = (difficulty, stage) => E.tuning({ difficulty, stageNum: stage });
  assert.ok(t("easy", 0).chaser < t("normal", 0).chaser);
  assert.ok(t("normal", 0).chaser < t("hard", 0).chaser);
  assert.ok(t("easy", 0).bigly > t("normal", 0).bigly && t("normal", 0).bigly > t("hard", 0).bigly);
  assert.ok(t("easy", 0).bricks > t("hard", 0).bricks);
  assert.ok(t("normal", 5).chaser > t("normal", 0).chaser);
  assert.ok(t("normal", 5).release[3] < t("normal", 0).release[3]);
  assert.equal(t("normal", 20).bigly, E.C.BIGLY_MIN);
  assert.ok(t("normal", 0).chaser < t("normal", 0).player, "the hero is faster than the chasers");
  assert.equal(newGame({ difficulty: "nonsense" }).difficulty, "normal");
});

test("the same seed and the same moves play out the same way", () => {
  const snap = () => {
    const g = newGame({ seed: 7, invincible: false });
    const r = rng(99);
    let input = {};
    for (let i = 0; i < 60 * 30; i++) {
      if (i % 15 === 0) input = { [["up", "down", "left", "right"][Math.floor(r() * 4)]]: true, build: r() < 0.1 };
      else input.build = false;
      E.step(g, input, DT);
    }
    return JSON.stringify({ s: g.score, l: g.lives, m: g.mode, p: g.player, c: g.chasers, w: g.walls, n: g.coinsLeft });
  };
  assert.equal(snap(), snap());
});

// ---------- every maze can be cleared ----------

// A simple bot: walk to the nearest coin, taking the elevators into account.
// It plans from the tile the hero will reach next, since that is where the
// hero turns.
function botInput(g) {
  const m = g.maze, p = g.player;
  const key = (x, y) => y * m.W + x;
  let sx = Math.round(p.x), sy = Math.round(p.y);
  if (p.dx || p.dy) {
    const n = E.nextCentre(p, p.dx, p.dy);
    if (item(m, n.x, n.y) === 1) return [p.dx, p.dy];   // grab the coin just ahead first
    sx = n.x; sy = n.y;
    const pad = m.elevator[key(sx, sy)];
    if (pad != null && p.lift <= 0) {
      // Riding an elevator: hold on until the hero comes out the other end,
      // or a turn back would cancel the ride.
      sx = pad % m.W; sy = Math.floor(pad / m.W);
      const d = nearestCoinStep(g, sx, sy);
      return d && d[0] === -p.dx && d[1] === -p.dy ? [p.dx, p.dy] : d;
    }
  }
  return nearestCoinStep(g, sx, sy);
}

function nearestCoinStep(g, sx, sy) {
  const m = g.maze;
  const key = (x, y) => y * m.W + x;
  const first = new Map([[key(sx, sy), null]]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    const k = key(x, y);
    if (item(m, x, y) === 1 && !(x === sx && y === sy)) return first.get(k);
    for (const [dx, dy] of STEPS) {
      let nx = x + dx, ny = y + dy;
      if (!E.heroOpen(g, nx, ny)) continue;
      const pad = m.elevator[key(nx, ny)];
      if (pad != null) { nx = pad % m.W; ny = Math.floor(pad / m.W); }
      const nk = key(nx, ny);
      if (first.has(nk)) continue;
      first.set(nk, first.get(k) || [dx, dy]);
      q.push([nx, ny]);
    }
  }
  return null;
}

for (let stage = 0; stage < 4; stage++) {
  test("a bot can clear maze " + E.MAZES[stage].key, () => {
    const g = newGame({ stage });
    let secs = 0;
    while (g.mode !== "clear" && secs < 600) {
      const d = botInput(g);
      const input = {};
      if (d) input[d[0] < 0 ? "left" : d[0] > 0 ? "right" : d[1] < 0 ? "up" : "down"] = true;
      E.step(g, input, DT);
      secs += DT;
    }
    assert.equal(g.mode, "clear", `${g.coinsLeft} coins left after ${Math.round(secs)}s`);
  });
}
