/* Hair Force One: game rules. No DOM, so the same file runs in the
 * browser (window.HF.engine) and under Node for the tests.
 * Everything lives on the maze grid: x is the column, y the row, and a
 * whole number is the centre of a tile. Speeds are in tiles per second.
 */
(function (factory) {
  var isNode = typeof module === "object" && module.exports && typeof require === "function";
  var api = factory(isNode ? require("./mazes.js") : window.HF.MAZES);
  if (isNode) module.exports = api;
  else { window.HF = window.HF || {}; window.HF.engine = api; }
})(function (MAZES) {
  "use strict";

  var C = {
    PLAYER_SPEED: 6, CHASER_SPEED: 4.9, FLEE_SPEED: 3.2, FIRED_SPEED: 11, LEAVE_SPEED: 3.5,
    SAND: 0.55,
    HIT: 0.65,                 // chaser and hero closer than this touch
    BIGLY_TIME: 7, BIGLY_MIN: 2.5, BIGLY_WARN: 2,
    WALL_TIME: 6, MAX_WALLS: 2, MAX_BRICKS: 6, BRICK_PILE: 2, BRICK_ROOM: 0.8,
    ELEVATOR_COOLDOWN: 0.6,
    BONUS_AT: [60, 160], BONUS_TIME: 9,
    TRAIL_DELAY: 1.5, NOISE_TIME: 8, WANDER_TIME: 6,
    RESPAWN: 1.2,
    EXTRA_LIFE_AT: 15000, EXTRA_LIFE_EVERY: 40000,
    READY_TIME: 1.6, DYING_TIME: 1.9, CLEAR_TIME: 2.4,
    POINTS: { coin: 10, burger: 50, bricks: 100 },
    FIRE_POINTS: [200, 400, 800, 1600],
    RELEASE: [0, 2.5, 6, 10]
  };

  var DIFFICULTY = {
    easy: { key: "easy", speed: 0.85, bigly: 1.3, release: 1.4, bricks: 4 },
    normal: { key: "normal", speed: 1, bigly: 1, release: 1, bricks: 3 },
    hard: { key: "hard", speed: 1.12, bigly: 0.8, release: 0.7, bricks: 2 }
  };

  // The four chasers, in release order.
  var CHASERS = ["subpoena", "checker", "mic", "auditor"];
  var BONUS_KINDS = ["covfefe", "trophy", "steak", "goldbar"];

  var DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  var ORDER = [[0, -1], [-1, 0], [0, 1], [1, 0]];   // tie-break: up, left, down, right

  // ---------- small helpers ----------

  function rngFrom(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function near(v) { return Math.round(v); }
  function same(a, b) { return Math.abs(a - b) < 1e-6; }

  // ---------- mazes ----------

  function build(spec) {
    var rows = spec.rows, H = rows.length, W = rows[0].length;
    var m = {
      key: spec.key, name: spec.name, tip: spec.tip, W: W, H: H,
      cell: [], item: [], sand: [], home: [], start: null, door: null, exit: null,
      bonus: null, elevator: {}, coins: 0
    };
    var pads = {};
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var ch = rows[y].charAt(x), i = y * W + x;
        var kind = "path", item = 0, sand = false;
        if (ch === "#") kind = "wall";
        else if (ch === "H") { kind = "home"; m.home.push({ x: x, y: y }); }
        else if (ch === "=") { kind = "door"; m.door = { x: x, y: y }; }
        else if (ch === ".") item = 1;
        else if (ch === "o") item = 2;
        else if (ch === "K") item = 3;
        else if (ch === "S") { item = 1; sand = true; }
        else if (ch === "s") sand = true;
        else if (ch === "P") m.start = { x: x, y: y };
        else if (ch === "F") m.bonus = { x: x, y: y };
        else if (ch === "1" || ch === "2") (pads[ch] = pads[ch] || []).push(i);
        m.cell[i] = kind;
        m.item[i] = item;
        m.sand[i] = sand;
        if (item === 1) m.coins++;
      }
    }
    for (var k in pads) {
      if (pads[k].length === 2) {
        m.elevator[pads[k][0]] = pads[k][1];
        m.elevator[pads[k][1]] = pads[k][0];
      }
    }
    if (m.door) m.exit = { x: m.door.x, y: m.door.y - 1 };
    // The middle of D.C., straight under the door.
    m.homeCentre = { x: m.door ? m.door.x : W >> 1, y: m.home.length ? m.home[0].y : 0 };
    return m;
  }

  function idx(m, x, y) { return y * m.W + x; }
  function inside(m, x, y) { return x >= 0 && y >= 0 && x < m.W && y < m.H; }

  function wallAt(g, x, y) {
    for (var i = 0; i < g.walls.length; i++) if (g.walls[i].x === x && g.walls[i].y === y) return g.walls[i];
    return null;
  }

  function heroOpen(g, x, y) {
    var m = g.maze;
    if (!inside(m, x, y)) return false;
    return m.cell[idx(m, x, y)] === "path" && !wallAt(g, x, y);
  }

  // Where a chaser may go depends on what it is doing.
  function chaserOpen(g, c, x, y) {
    var m = g.maze;
    if (!inside(m, x, y)) return false;
    var cell = m.cell[idx(m, x, y)];
    if (cell === "wall") return false;
    if (c.state === "fired") return true;           // a pink slip flies over new walls
    if (wallAt(g, x, y)) return false;
    if (cell === "home" || cell === "door") return c.state === "home" || c.state === "leave";
    return true;
  }

  function isSand(g, x, y) {
    var m = g.maze, tx = near(x), ty = near(y);
    return inside(m, tx, ty) && m.sand[idx(m, tx, ty)];
  }

  // Distance (in tiles) from one tile to every other, for a chaser.
  function distances(g, c, tx, ty) {
    var m = g.maze, N = m.W * m.H, d = new Array(N);
    for (var i = 0; i < N; i++) d[i] = Infinity;
    if (!inside(m, tx, ty)) return d;
    var q = [tx, ty], head = 0;
    d[idx(m, tx, ty)] = 0;
    while (head < q.length) {
      var x = q[head++], y = q[head++], here = d[idx(m, x, y)];
      for (var k = 0; k < 4; k++) {
        var nx = x + ORDER[k][0], ny = y + ORDER[k][1];
        if (!chaserOpen(g, c, nx, ny)) continue;
        var j = idx(m, nx, ny);
        if (d[j] !== Infinity) continue;
        d[j] = here + 1;
        q.push(nx, ny);
      }
    }
    return d;
  }

  // ---------- setting up ----------

  function tuning(g) {
    var s = Math.min(g.stageNum, 6), d = DIFFICULTY[g.difficulty] || DIFFICULTY.normal;
    return {
      player: C.PLAYER_SPEED * (1 + 0.02 * Math.min(s, 5)),
      chaser: (C.CHASER_SPEED + 0.22 * s) * d.speed,
      flee: C.FLEE_SPEED,
      bigly: Math.max(C.BIGLY_MIN, C.BIGLY_TIME - 0.6 * g.stageNum) * d.bigly,
      release: C.RELEASE.map(function (r) { return r * d.release * Math.max(0.4, 1 - 0.12 * s); }),
      bricks: d.bricks
    };
  }

  function createGame(opts) {
    opts = opts || {};
    var g = {
      difficulty: DIFFICULTY[opts.difficulty] ? opts.difficulty : "normal",
      lives: opts.lives || 3,
      score: 0,
      stageNum: opts.stage || 0,
      rng: rngFrom(opts.seed != null ? opts.seed : (Date.now() & 0xffffffff)),
      invincible: !!opts.invincible,
      nextExtra: C.EXTRA_LIFE_AT,
      events: [],
      t: 0
    };
    loadStage(g);
    return g;
  }

  function loadStage(g) {
    var spec = MAZES[g.stageNum % MAZES.length];
    g.maze = build(spec);
    g.coinsLeft = g.maze.coins;
    g.eaten = 0;
    g.bonusShown = 0;
    g.bricks = tuning(g).bricks;
    resetRun(g);
  }

  // Back to the start positions (new stage, or after losing a life).
  function resetRun(g) {
    var m = g.maze, tu = tuning(g);
    g.mode = "ready";
    g.modeT = 0;
    g.walls = [];
    g.bigly = 0;
    g.chain = 0;
    g.bonus = null;
    g.noise = null;
    g.trail = [];
    g.player = {
      x: m.start.x, y: m.start.y, dx: 0, dy: 0, want: null, face: [-1, 0],
      cx: m.start.x, cy: m.start.y, px: null, py: null, lift: 0, moving: false, dist: 0, look: 1
    };
    var homes = m.home.slice().sort(function (a, b) { return a.x - b.x; });
    var mid = homes.length >> 1;
    var spots = [m.exit, homes[mid - 1] || homes[mid], homes[mid], homes[mid + 1] || homes[mid]];
    g.chasers = CHASERS.map(function (kind, i) {
      var s = spots[i];
      return {
        id: i, kind: kind, x: s.x, y: s.y, dx: 0, dy: 0,
        state: i === 0 ? "chase" : "home",
        wait: tu.release[i], tx: s.x, ty: s.y, wander: null, wanderT: 0, t: 0
      };
    });
  }

  // ---------- events and score ----------

  function emit(g, type, data) {
    var e = data || {};
    e.type = type;
    g.events.push(e);
  }

  function addScore(g, pts, x, y, label) {
    g.score += pts;
    if (x != null) emit(g, "score", { pts: pts, x: x, y: y, label: label || null });
    while (g.score >= g.nextExtra) {
      g.lives++;
      g.nextExtra += C.EXTRA_LIFE_EVERY;
      emit(g, "extra-life");
    }
  }

  function makeNoise(g, x, y) { g.noise = { x: near(x), y: near(y), t: g.t }; }

  // ---------- the main step ----------

  function step(g, input, dt) {
    input = input || {};
    g.t += dt;
    g.modeT += dt;
    if (g.mode === "ready") {
      steer(g, input);       // the first direction pressed is remembered
      if (g.modeT >= C.READY_TIME) { g.mode = "play"; g.modeT = 0; }
      return;
    }
    if (g.mode === "dying") {
      if (g.modeT >= C.DYING_TIME) {
        g.lives--;
        if (g.lives <= 0) { g.lives = 0; g.mode = "over"; g.modeT = 0; emit(g, "game-over"); }
        else resetRun(g);
      }
      return;
    }
    if (g.mode === "clear") {
      if (g.modeT >= C.CLEAR_TIME) { g.stageNum++; loadStage(g); emit(g, "stage", { stage: g.stageNum }); }
      return;
    }
    if (g.mode !== "play") return;

    var tu = tuning(g);
    steer(g, input);
    if (input.build) buildWall(g);
    movePlayer(g, tu, dt);
    eat(g, tu);
    if (g.mode !== "play") return;
    updateTrail(g);
    updateWalls(g, dt);
    updateBigly(g, dt);
    updateBonus(g, dt);
    for (var i = 0; i < g.chasers.length; i++) moveChaser(g, g.chasers[i], tu, dt);
    touch(g);
  }

  // ---------- the hero ----------

  // Pick the wanted direction from what is held. With two held (a stick
  // pushed on the diagonal), the one across the current heading wins, so the
  // hero turns at the next opening.
  function steer(g, input) {
    var p = g.player, held = [];
    ["up", "left", "down", "right"].forEach(function (k) { if (input[k]) held.push(DIRS[k]); });
    if (!held.length) return;
    var pick = held[0];
    if (held.length > 1 && (p.dx || p.dy)) {
      for (var i = 0; i < held.length; i++) {
        if (held[i][0] * p.dx + held[i][1] * p.dy === 0) { pick = held[i]; break; }
      }
    }
    p.want = pick;
  }

  // arrived: the hero walked onto this centre (rather than starting from it).
  function onPlayerCentre(g, arrived) {
    var p = g.player, m = g.maze;
    var x = near(p.x), y = near(p.y);
    if (arrived && (x !== p.cx || y !== p.cy)) { p.px = p.cx; p.py = p.cy; }
    p.cx = x; p.cy = y;
    p.x = x; p.y = y;
    // Elevators carry the hero to the other pad.
    var i = idx(m, p.cx, p.cy);
    if (arrived && m.elevator[i] != null && p.lift <= 0) {
      var j = m.elevator[i];
      p.x = p.cx = j % m.W;
      p.y = p.cy = Math.floor(j / m.W);
      p.px = null; p.py = null;
      p.lift = C.ELEVATOR_COOLDOWN;
      makeNoise(g, p.x, p.y);
      emit(g, "elevator");
    }
    var w = p.want;
    if (w && heroOpen(g, p.cx + w[0], p.cy + w[1])) { p.dx = w[0]; p.dy = w[1]; }
    else if (!heroOpen(g, p.cx + p.dx, p.cy + p.dy)) { p.dx = 0; p.dy = 0; }
  }

  function movePlayer(g, tu, dt) {
    var p = g.player;
    p.lift = Math.max(0, p.lift - dt);
    var w = p.want;
    // Turn round on the spot, if the tile behind is open.
    if (w && (p.dx || p.dy) && w[0] === -p.dx && w[1] === -p.dy) {
      var back = nextCentre(p, w[0], w[1]);
      if (heroOpen(g, back.x, back.y)) { p.dx = w[0]; p.dy = w[1]; }
    }
    var speed = tu.player * (isSand(g, p.x, p.y) ? C.SAND : 1);
    var left = speed * dt, guard = 0, x0 = p.x, y0 = p.y;
    while (left > 1e-9 && guard++ < 6) {
      if (!p.dx && !p.dy) {
        if (!same(p.x, near(p.x)) || !same(p.y, near(p.y))) break;
        onPlayerCentre(g, false);
        if (!p.dx && !p.dy) break;
      }
      var n = nextCentre(p, p.dx, p.dy);
      var gap = Math.abs(n.x - p.x) + Math.abs(n.y - p.y);
      if (left < gap - 1e-6) { p.x += p.dx * left; p.y += p.dy * left; left = 0; }
      else { p.x = n.x; p.y = n.y; left = Math.max(0, left - gap); onPlayerCentre(g, true); }
    }
    p.moving = p.x !== x0 || p.y !== y0;
    if (p.moving) p.dist += Math.abs(p.x - x0) + Math.abs(p.y - y0);
    if (p.dx || p.dy) p.face = [p.dx, p.dy];
    if (p.dx) p.look = p.dx;
  }

  // The next tile centre ahead of something moving along (dx, dy).
  function nextCentre(e, dx, dy) {
    if (dx > 0) return { x: Math.floor(e.x + 1e-6) + 1, y: near(e.y) };
    if (dx < 0) return { x: Math.ceil(e.x - 1e-6) - 1, y: near(e.y) };
    if (dy > 0) return { x: near(e.x), y: Math.floor(e.y + 1e-6) + 1 };
    if (dy < 0) return { x: near(e.x), y: Math.ceil(e.y - 1e-6) - 1 };
    return { x: near(e.x), y: near(e.y) };
  }

  function eat(g, tu) {
    var p = g.player, m = g.maze, tx = near(p.x), ty = near(p.y);
    var i = idx(m, tx, ty), it = m.item[i];
    if (it) {
      m.item[i] = 0;
      if (it === 1) {
        g.coinsLeft--;
        g.eaten++;
        addScore(g, C.POINTS.coin);
        emit(g, "coin");
        if (g.bonusShown < C.BONUS_AT.length && g.eaten >= C.BONUS_AT[g.bonusShown]) {
          g.bonusShown++;
          var b = m.bonus;
          if (b) g.bonus = { x: b.x, y: b.y, t: C.BONUS_TIME, kind: BONUS_KINDS[g.stageNum % BONUS_KINDS.length] };
        }
      } else if (it === 2) {
        addScore(g, C.POINTS.burger);
        goBigly(g, tu);
        makeNoise(g, tx, ty);
      } else if (it === 3) {
        g.bricks = Math.min(C.MAX_BRICKS, g.bricks + C.BRICK_PILE);
        addScore(g, C.POINTS.bricks, tx, ty);
        emit(g, "bricks");
      }
    }
    if (g.bonus && tx === g.bonus.x && ty === g.bonus.y) {
      var pts = 500 * (1 + Math.min(g.stageNum, 7));
      addScore(g, pts, tx, ty);
      emit(g, "bonus", { kind: g.bonus.kind });
      makeNoise(g, tx, ty);
      g.bonus = null;
    }
    if (g.coinsLeft <= 0 && g.mode === "play") {
      g.mode = "clear";
      g.modeT = 0;
      g.walls = [];
      emit(g, "clear");
    }
  }

  function goBigly(g, tu) {
    g.bigly = tu.bigly;
    g.chain = 0;
    g.chasers.forEach(function (c) {
      if (c.state === "chase") { c.state = "flee"; c.dx = -c.dx; c.dy = -c.dy; }
    });
    emit(g, "bigly");
  }

  function updateBigly(g, dt) {
    if (g.bigly <= 0) return;
    g.bigly -= dt;
    if (g.bigly <= 0) {
      g.bigly = 0;
      g.chasers.forEach(function (c) { if (c.state === "flee") c.state = "chase"; });
      emit(g, "bigly-end");
    }
  }

  function updateBonus(g, dt) {
    if (!g.bonus) return;
    g.bonus.t -= dt;
    if (g.bonus.t <= 0) g.bonus = null;
  }

  function updateTrail(g) {
    var p = g.player, last = g.trail[g.trail.length - 1];
    var x = near(p.x), y = near(p.y);
    if (!last || last.x !== x || last.y !== y) g.trail.push({ x: x, y: y, t: g.t });
    while (g.trail.length > 2 && g.trail[1].t < g.t - 4) g.trail.shift();
  }

  // ---------- walls ----------

  // Where a wall would go now: on the tile just behind the hero, or failing
  // that the tile they came from. null when there is nowhere to put one.
  function wallSpot(g) {
    var p = g.player, moving = !!(p.dx || p.dy), d = moving ? [p.dx, p.dy] : p.face;
    var cx = moving ? p.cx : near(p.x), cy = moving ? p.cy : near(p.y);
    var away = Math.abs(p.x - cx) + Math.abs(p.y - cy);
    var spots = [];
    if (moving && away >= 0.6) spots.push({ x: cx, y: cy });
    spots.push({ x: cx - d[0], y: cy - d[1] });
    if (p.px != null) spots.push({ x: p.px, y: p.py });
    for (var i = 0; i < spots.length; i++) if (canBuild(g, spots[i])) return spots[i];
    return null;
  }

  function canBuild(g, s) {
    var m = g.maze, p = g.player;
    if (!heroOpen(g, s.x, s.y)) return false;
    var i = idx(m, s.x, s.y);
    if (m.elevator[i] != null) return false;
    if (m.exit && s.x === m.exit.x && s.y === m.exit.y) return false;
    if (Math.abs(p.x - s.x) + Math.abs(p.y - s.y) < 0.6) return false;
    for (var k = 0; k < g.chasers.length; k++) {
      var c = g.chasers[k];
      if (Math.abs(c.x - s.x) + Math.abs(c.y - s.y) < C.BRICK_ROOM) return false;
    }
    return true;
  }

  function buildWall(g) {
    if (g.bricks <= 0 || g.walls.length >= C.MAX_WALLS) { emit(g, "no-build"); return false; }
    var s = wallSpot(g);
    if (!s) { emit(g, "no-build"); return false; }
    g.walls.push({ x: s.x, y: s.y, t: C.WALL_TIME, life: C.WALL_TIME });
    g.bricks--;
    makeNoise(g, s.x, s.y);
    emit(g, "build", { x: s.x, y: s.y });
    return true;
  }

  function updateWalls(g, dt) {
    for (var i = g.walls.length - 1; i >= 0; i--) {
      g.walls[i].t -= dt;
      if (g.walls[i].t <= 0) {
        emit(g, "crumble", { x: g.walls[i].x, y: g.walls[i].y });
        g.walls.splice(i, 1);
      }
    }
  }

  // ---------- the chasers ----------

  function chaserSpeed(g, c, tu) {
    var s;
    if (c.state === "fired") return C.FIRED_SPEED;
    if (c.state === "leave" || c.state === "home") s = C.LEAVE_SPEED;
    else if (c.state === "flee") s = tu.flee;
    else s = tu.chaser;
    return s * (isSand(g, c.x, c.y) ? C.SAND : 1);
  }

  function heroTile(g) { return { x: near(g.player.x), y: near(g.player.y) }; }

  function manhattan(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  // Each chaser has its own idea of where the hero is going.
  function chaseTarget(g, c) {
    var hero = heroTile(g), p = g.player, m = g.maze;
    var here = { x: near(c.x), y: near(c.y) };
    if (c.kind === "checker") {
      // The Fact-Checker heads for the next junction in front of the hero.
      if (!(p.dx || p.dy)) return hero;
      var x = hero.x, y = hero.y;
      for (var k = 1; k <= 8; k++) {
        var nx = x + p.dx, ny = y + p.dy;
        if (!heroOpen(g, nx, ny)) break;
        x = nx; y = ny;
        var ways = 0;
        for (var j = 0; j < 4; j++) if (heroOpen(g, x + ORDER[j][0], y + ORDER[j][1])) ways++;
        if (ways >= 3) break;
      }
      if (x === here.x && y === here.y) return hero;
      return { x: x, y: y };
    }
    if (c.kind === "mic") {
      // The Hot Mic goes to the last loud thing the hero did.
      var n = g.noise;
      if (n && g.t - n.t < C.NOISE_TIME && !(n.x === here.x && n.y === here.y) && !(c.heard === n.t)) return n;
      if (n && n.x === here.x && n.y === here.y) c.heard = n.t;
      if (manhattan(here, hero) <= 7) return hero;
      if (!c.wander || c.wanderT <= 0 || (c.wander.x === here.x && c.wander.y === here.y)) {
        c.wander = randomTile(g);
        c.wanderT = C.WANDER_TIME;
      }
      return c.wander;
    }
    if (c.kind === "auditor") {
      // The Auditor follows the paper trail, a little behind.
      if (manhattan(here, hero) <= 4) return hero;
      var tr = g.trail;
      for (var i = 0; i < tr.length; i++) if (tr[i].t >= g.t - C.TRAIL_DELAY) return tr[i];
      return hero;
    }
    return hero;   // the Subpoena: straight at you
  }

  function randomTile(g) {
    var m = g.maze;
    for (var tries = 0; tries < 200; tries++) {
      var x = 1 + Math.floor(g.rng() * (m.W - 2)), y = 1 + Math.floor(g.rng() * (m.H - 2));
      if (m.cell[idx(m, x, y)] === "path") return { x: x, y: y };
    }
    return heroTile(g);
  }

  function chooseDir(g, c) {
    var m = g.maze, x = near(c.x), y = near(c.y);
    var opts = [];
    for (var k = 0; k < 4; k++) {
      var d = ORDER[k];
      var reverse = (c.dx || c.dy) && d[0] === -c.dx && d[1] === -c.dy;
      if (reverse && c.state !== "fired") continue;
      if (chaserOpen(g, c, x + d[0], y + d[1])) opts.push(d);
    }
    if (!opts.length && (c.dx || c.dy) && chaserOpen(g, c, x - c.dx, y - c.dy)) opts.push([-c.dx, -c.dy]);
    if (!opts.length) { c.dx = 0; c.dy = 0; return; }
    var target, best = null, score;
    if (c.state === "flee") {
      // Run from the hero: the way that ends up furthest from them.
      var h = heroTile(g), away = distances(g, c, h.x, h.y);
      score = -Infinity;
      opts.forEach(function (d) {
        var v = away[idx(m, x + d[0], y + d[1])];
        if (v === Infinity) v = 999;
        v += g.rng() * 0.5;
        if (v > score) { score = v; best = d; }
      });
    } else {
      if (c.state === "fired") target = m.homeCentre;
      else if (c.state === "leave") target = m.exit;
      else target = chaseTarget(g, c);
      c.tx = target.x; c.ty = target.y;
      var dist = distances(g, c, target.x, target.y);
      score = Infinity;
      opts.forEach(function (d) {
        var v = dist[idx(m, x + d[0], y + d[1])];
        if (v < score) { score = v; best = d; }
      });
      if (!best) best = opts[Math.floor(g.rng() * opts.length)];
    }
    c.dx = best[0]; c.dy = best[1];
  }

  function onChaserCentre(g, c) {
    var m = g.maze;
    c.x = near(c.x); c.y = near(c.y);
    if (c.state === "leave" && c.x === m.exit.x && c.y === m.exit.y) {
      c.state = "chase";
      c.dx = 0; c.dy = 0;
    } else if (c.state === "fired" && c.x === m.homeCentre.x && c.y === m.homeCentre.y) {
      c.state = "home";
      c.wait = C.RESPAWN;
      c.dx = 0; c.dy = 0;
      emit(g, "back-home");
      return;
    }
    chooseDir(g, c);
  }

  function moveChaser(g, c, tu, dt) {
    c.t += dt;
    c.wanderT -= dt;
    if (c.state === "home") {
      c.wait -= dt;
      if (c.wait > 0) return;
      c.state = "leave";
    }
    // A wall can go up in front of a chaser between two tiles: turn back.
    if ((c.dx || c.dy)) {
      var ahead = nextCentre(c, c.dx, c.dy);
      if (!chaserOpen(g, c, ahead.x, ahead.y)) { c.dx = -c.dx; c.dy = -c.dy; }
    }
    var left = chaserSpeed(g, c, tu) * dt, guard = 0;
    while (left > 1e-9 && guard++ < 6) {
      if (!c.dx && !c.dy) {
        if (!same(c.x, near(c.x)) || !same(c.y, near(c.y))) { c.x = near(c.x); c.y = near(c.y); }
        onChaserCentre(g, c);
        if (!c.dx && !c.dy) break;
      }
      var n = nextCentre(c, c.dx, c.dy);
      var gap = Math.abs(n.x - c.x) + Math.abs(n.y - c.y);
      if (left < gap - 1e-6) { c.x += c.dx * left; c.y += c.dy * left; left = 0; }
      else { c.x = n.x; c.y = n.y; left = Math.max(0, left - gap); onChaserCentre(g, c); if (c.state === "home") break; }
    }
  }

  // ---------- touching ----------

  function touch(g) {
    var p = g.player;
    for (var i = 0; i < g.chasers.length; i++) {
      var c = g.chasers[i];
      if (c.state !== "chase" && c.state !== "flee") continue;
      var dx = c.x - p.x, dy = c.y - p.y;
      if (dx * dx + dy * dy >= C.HIT * C.HIT) continue;
      if (c.state === "flee") {
        var pts = C.FIRE_POINTS[Math.min(g.chain, C.FIRE_POINTS.length - 1)];
        g.chain++;
        c.state = "fired";
        addScore(g, pts, c.x, c.y, "YOU'RE FIRED!");
        makeNoise(g, c.x, c.y);
        emit(g, "fire", { kind: c.kind });
      } else if (!g.invincible) {
        die(g, c);
        return;
      }
    }
  }

  function die(g, c) {
    g.mode = "dying";
    g.modeT = 0;
    g.bigly = 0;
    g.player.caughtBy = c ? c.kind : null;
    emit(g, "die", { by: c ? c.kind : null });
  }

  return {
    C: C, DIFFICULTY: DIFFICULTY, MAZES: MAZES, CHASERS: CHASERS, BONUS_KINDS: BONUS_KINDS,
    build: build, createGame: createGame, step: step, tuning: tuning,
    heroOpen: heroOpen, chaserOpen: chaserOpen, distances: distances,
    wallSpot: wallSpot, buildWall: buildWall, chaseTarget: chaseTarget, nextCentre: nextCentre
  };
});
