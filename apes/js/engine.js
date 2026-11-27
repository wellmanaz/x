/* Damn Dirty Apes: game rules. No DOM, so the same file runs in the
 * browser (window.DDA.engine) and under Node for the tests.
 * Positions are the bottom centre of each thing (its feet).
 */
(function (factory) {
  var isNode = typeof module === "object" && module.exports && typeof require === "function";
  var api = factory(isNode ? require("./stages.js") : window.DDA.STAGES);
  if (isNode) module.exports = api;
  else { window.DDA = window.DDA || {}; window.DDA.engine = api; }
})(function (STAGES) {
  "use strict";

  var C = {
    W: 480, H: 540, GROUND_Y: 520,
    GRAVITY: 720,
    WALK: 72, CLIMB: 48, JUMP_V: 220,
    FALL_LIMIT: 24,          // a drop deeper than this is fatal
    STEP: 10,                // walk up or down a ledge this high
    VINE_REACH: 8,
    CRUMBLE_DELAY: 0.45, CRUMBLE_GONE: 3.5, TILE: 24,
    NET_TIME: 9,
    BONUS_START: 4000, BONUS_STEP: 100, BONUS_TICK: 2,
    EXTRA_LIFE_AT: 20000,
    READY_TIME: 1.4, DYING_TIME: 1.8, CLEAR_TIME: 2.6,
    FIRST_THROW: 1.0, WINDUP: 0.4
  };

  var DIFFICULTY = {
    easy: { key: "easy", speed: 0.85, interval: 1.25, vine: 0.7, monkeys: 0 },
    normal: { key: "normal", speed: 1, interval: 1, vine: 1, monkeys: 0 },
    hard: { key: "hard", speed: 1.15, interval: 0.82, vine: 1.3, monkeys: 1 }
  };

  var ITEM_POINTS = { banana: 300, pineapple: 500, mango: 800 };
  var SMASH_POINTS = { coconut: 300, durian: 500, monkey: 800 };
  var SIZE = { coconut: [16, 16], durian: [18, 18], monkey: [18, 16] };

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

  function surf(p, x) {
    if (p.x2 === p.x1) return p.y1;
    return p.y1 + (x - p.x1) * (p.y2 - p.y1) / (p.x2 - p.x1);
  }
  function covers(p, x) { return x >= p.x1 - 0.01 && x <= p.x2 + 0.01; }
  function downhill(p) {
    var d = p.y2 - p.y1;
    return d > 0.5 ? 1 : d < -0.5 ? -1 : 0;
  }
  function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ---------- stage building ----------

  function build(spec) {
    var plats = [];
    function add(x1, y1, x2, y2, crumble) {
      plats.push({
        id: plats.length, x1: x1, y1: y1, x2: x2, y2: y2,
        crumble: !!crumble, ground: y1 >= C.GROUND_Y - 5 && y2 >= C.GROUND_Y - 5,
        t: -1, gone: false, goneT: 0
      });
    }
    (spec.plats || []).forEach(function (p) { add(p[0], p[1], p[2], p[3], false); });
    (spec.rows || []).forEach(function (r) {
      var x1 = r.from[0], y1 = r.from[1], x2 = r.to[0], y2 = r.to[1];
      function yAt(x) { return y1 + (x - x1) * (y2 - y1) / (x2 - x1); }
      var a = r.crumble ? r.crumble[0] : x2, b = r.crumble ? r.crumble[1] : x2;
      if (a > x1) add(x1, yAt(x1), a, yAt(a), false);
      for (var x = a; x < b - 0.01; x += C.TILE) {
        var e = Math.min(b, x + C.TILE);
        add(x, yAt(x), e, yAt(e), true);
      }
      if (x2 > b) add(b, yAt(b), x2, yAt(x2), false);
    });

    function snap(x, hint, what) {
      var best = null, bd = Infinity;
      plats.forEach(function (p) {
        if (!covers(p, x)) return;
        var d = Math.abs(surf(p, x) - hint);
        if (d < bd) { bd = d; best = p; }
      });
      if (!best || bd > 10) throw new Error(spec.key + ": no floor for " + what + " at x=" + x + " y~" + hint);
      return best;
    }

    var vines = (spec.vines || []).map(function (v, i) {
      var tp = snap(v[0], v[1], "vine top"), bp = snap(v[0], v[2], "vine bottom");
      return { id: i, x: v[0], top: surf(tp, v[0]), bottom: surf(bp, v[0]), topPlat: tp.id, bottomPlat: bp.id };
    });
    var sp = snap(spec.start[0], spec.start[1], "start");
    var gp = snap(spec.goal[0], spec.goal[1], "goal");
    var items = (spec.items || []).map(function (it, i) {
      var p = snap(it[1], it[2], it[0]);
      return { id: i, kind: it[0], x: it[1], y: surf(p, it[1]), plat: p.id, taken: false };
    });
    return {
      key: spec.key, name: spec.name, spec: spec,
      plats: plats, vines: vines, items: items,
      start: { x: spec.start[0], y: surf(sp, spec.start[0]), plat: sp.id },
      goal: { x: spec.goal[0], y: surf(gp, spec.goal[0]), plat: gp.id },
      boss: spec.boss, durians: !!spec.durians, monkeys: !!spec.monkeys
    };
  }

  // The highest live floor crossed while moving down from prevY to newY at x.
  function landing(st, x, prevY, newY) {
    var best = null, bs = Infinity;
    for (var i = 0; i < st.plats.length; i++) {
      var p = st.plats[i];
      if (p.gone || !covers(p, x)) continue;
      var s = surf(p, x);
      if (prevY <= s + 0.5 && newY >= s && s < bs) { bs = s; best = p; }
    }
    return best;
  }

  // Another live floor at x whose surface is between up above and down below y.
  function adjacent(st, from, x, y, up, down) {
    var best = null, bd = Infinity;
    for (var i = 0; i < st.plats.length; i++) {
      var p = st.plats[i];
      if (p === from || p.gone || !covers(p, x)) continue;
      var d = surf(p, x) - y;
      if (d >= -up && d <= down && Math.abs(d) < bd) { bd = Math.abs(d); best = p; }
    }
    return best;
  }

  function vineAt(st, x, y, end) {
    for (var i = 0; i < st.vines.length; i++) {
      var v = st.vines[i];
      if (Math.abs(v.x - x) <= C.VINE_REACH && Math.abs(v[end] - y) <= 6) return v;
    }
    return null;
  }

  // ---------- game life cycle ----------

  function createGame(opts) {
    opts = opts || {};
    var g = {
      rng: rngFrom(opts.seed == null ? Date.now() : opts.seed),
      diff: DIFFICULTY[opts.difficulty] || DIFFICULTY.normal,
      noHazards: !!opts.noHazards,
      invincible: !!opts.invincible,   // tests only
      score: 0,
      lives: opts.lives || 3,
      level: opts.level || 1,
      stageIdx: opts.stage || 0,
      extraGiven: false,
      cleared: 0,
      events: [],
      t: 0,
      nextId: 1
    };
    loadStage(g);
    return g;
  }

  function loadStage(g) {
    g.stage = build(STAGES[g.stageIdx]);
    resetRun(g);
  }

  function resetRun(g) {
    var st = g.stage;
    st.plats.forEach(function (p) { p.t = -1; p.gone = false; p.goneT = 0; });
    g.player = {
      x: st.start.x, y: st.start.y, vx: 0, vy: 0,
      state: "ground", plat: st.start.plat, vine: -1,
      facing: st.start.x < C.W / 2 ? 1 : -1,
      net: 0, fallFrom: st.start.y, jumpId: 0, jumpCount: 0,
      walkT: 0, climbT: 0
    };
    g.hazards = [];
    g.boss = {
      x: st.boss.x, y: st.boss.y, cd: C.FIRST_THROW, windup: 0, dir: st.boss.dirs[0],
      throwN: 0, mcd: 4, anim: 0, thrownT: 9
    };
    g.bonus = C.BONUS_START;
    g.bonusT = C.BONUS_TICK;
    g.mode = "ready";
    g.modeT = C.READY_TIME;
    g.deathCause = null;
  }

  function tuning(g) {
    var L = g.level - 1, s = g.stageIdx, m = g.diff;
    return {
      throwInterval: Math.max(1.05, (2.5 - 0.22 * L - 0.08 * s) * m.interval),
      rollSpeed: Math.min(150, (78 + 9 * L + 4 * s) * m.speed),
      vineChance: Math.min(0.65, (0.16 + 0.07 * L) * m.vine),
      durianEvery: L >= 1 ? 3 : 4,
      maxMonkeys: Math.min(3, 1 + Math.floor(L / 2) + m.monkeys),
      monkeyEvery: Math.max(5, 10 - L),
      monkeySpeed: Math.min(70, (40 + 5 * L) * m.speed),
      durianSpeed: Math.min(95, (55 + 6 * L) * m.speed)
    };
  }

  function emit(g, type, data) {
    var e = data || {};
    e.type = type;
    g.events.push(e);
  }

  function addScore(g, pts, x, y) {
    g.score += pts;
    emit(g, "score", { pts: pts, x: x, y: y });
    if (!g.extraGiven && g.score >= C.EXTRA_LIFE_AT) {
      g.extraGiven = true;
      g.lives += 1;
      emit(g, "extra-life");
    }
  }

  function die(g, cause) {
    if (g.mode !== "play") return;
    g.mode = "dying";
    g.modeT = C.DYING_TIME;
    g.deathCause = cause;
    g.player.net = 0;
    emit(g, "die", { cause: cause });
  }

  // input: { left, right, up, down, jump } where jump is a fresh press.
  function step(g, input, dt) {
    input = input || {};
    g.t += dt;
    if (g.mode === "ready") {
      g.modeT -= dt;
      if (g.modeT <= 0) { g.mode = "play"; emit(g, "go"); }
      return;
    }
    if (g.mode === "dying") {
      g.modeT -= dt;
      if (g.modeT <= 0) {
        g.lives -= 1;
        if (g.lives <= 0) { g.lives = 0; g.mode = "over"; emit(g, "game-over"); }
        else resetRun(g);
      }
      return;
    }
    if (g.mode === "clear") {
      g.modeT -= dt;
      if (g.modeT <= 0) {
        g.stageIdx += 1;
        if (g.stageIdx >= STAGES.length) { g.stageIdx = 0; g.level += 1; }
        loadStage(g);
        emit(g, "stage", { stage: g.stageIdx, level: g.level });
      }
      return;
    }
    if (g.mode !== "play") return;

    g.bonusT -= dt;
    if (g.bonusT <= 0) {
      g.bonusT += C.BONUS_TICK;
      g.bonus = Math.max(0, g.bonus - C.BONUS_STEP);
      if (g.bonus === 0) { die(g, "time"); return; }
    }

    updateCrumbles(g, dt);
    updatePlayer(g, input, dt);
    if (g.mode !== "play") return;
    if (!g.noHazards) {
      updateBoss(g, dt);
      updateHazards(g, dt);
    }
    jumpScoring(g);
    hits(g);
    if (g.mode !== "play") return;
    pickups(g);
    goal(g);
  }

  // ---------- floors that crumble ----------

  function updateCrumbles(g, dt) {
    var ps = g.stage.plats;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (!p.crumble) continue;
      if (p.t >= 0) {
        p.t -= dt;
        if (p.t < 0) { p.t = -1; p.gone = true; p.goneT = C.CRUMBLE_GONE; emit(g, "crumble", { x: (p.x1 + p.x2) / 2, y: p.y1 }); }
      } else if (p.gone) {
        p.goneT -= dt;
        if (p.goneT <= 0) p.gone = false;
      }
    }
  }

  // ---------- the ranger ----------

  function startFall(p, vx) {
    p.state = "fall";
    p.vy = 0;
    p.vx = vx;
    p.fallFrom = p.y;
  }

  function updatePlayer(g, input, dt) {
    var p = g.player, st = g.stage;
    var dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (p.net > 0) {
      p.net = Math.max(0, p.net - dt);
      if (p.net === 0) emit(g, "net-end");
    }
    var netted = p.net > 0;

    if (p.state === "ground") {
      var pl = st.plats[p.plat];
      if (pl.gone) { startFall(p, 0); return; }
      if (input.jump && !netted) {
        p.state = "jump";
        p.vy = -C.JUMP_V;
        p.vx = dx * C.WALK;
        p.fallFrom = p.y;
        p.jumpId += 1;
        p.jumpCount = 0;
        if (dx) p.facing = dx;
        emit(g, "jump");
        return;
      }
      if (!netted && input.up) {
        var vu = vineAt(st, p.x, p.y, "bottom");
        if (vu) { p.state = "climb"; p.vine = vu.id; p.x = vu.x; p.y = vu.bottom; return; }
      }
      if (!netted && input.down) {
        var vd = vineAt(st, p.x, p.y, "top");
        if (vd) { p.state = "climb"; p.vine = vd.id; p.x = vd.x; p.y = vd.top; return; }
      }
      if (dx) {
        p.facing = dx;
        p.walkT += dt;
        var nx = clamp(p.x + dx * C.WALK * dt, 6, C.W - 6);
        if (!covers(pl, nx)) {
          var edgeY = surf(pl, dx > 0 ? pl.x2 : pl.x1);
          var q = adjacent(st, pl, nx, edgeY, C.STEP, C.STEP);
          if (q) { p.plat = q.id; pl = q; }
          else { p.x = nx; startFall(p, dx * C.WALK * 0.5); return; }
        }
        p.x = nx;
        p.y = surf(pl, nx);
      } else {
        p.walkT = 0;
        p.y = surf(pl, p.x);
      }
      if (pl.crumble && pl.t < 0 && !pl.gone) pl.t = C.CRUMBLE_DELAY;
      return;
    }

    if (p.state === "climb") {
      var v = st.vines[p.vine];
      var dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      p.y += dy * C.CLIMB * dt;
      if (dy) p.climbT += dt;
      if (p.y <= v.top) { p.y = v.top; p.state = "ground"; p.plat = v.topPlat; p.vine = -1; }
      else if (p.y >= v.bottom) { p.y = v.bottom; p.state = "ground"; p.plat = v.bottomPlat; p.vine = -1; }
      return;
    }

    // jump or fall
    p.vy += C.GRAVITY * dt;
    var fx = p.x + p.vx * dt;
    if (fx < 6 || fx > C.W - 6) { fx = clamp(fx, 6, C.W - 6); p.vx = 0; }
    var fy = p.y + p.vy * dt;
    if (p.vy > 0) {
      var land = landing(st, fx, p.y, fy);
      if (land) {
        p.x = fx;
        p.y = surf(land, fx);
        if (p.y - p.fallFrom > C.FALL_LIMIT) { die(g, "fall"); return; }
        p.state = "ground";
        p.plat = land.id;
        p.vx = 0;
        emit(g, "land");
        return;
      }
    }
    p.x = fx;
    p.y = fy;
    if (p.y > C.H + 30) die(g, "fall");
  }

  // ---------- the troop boss ----------

  function updateBoss(g, dt) {
    var b = g.boss, st = g.stage, tu = tuning(g);
    b.anim += dt;
    b.thrownT += dt;
    if (b.windup > 0) {
      b.windup -= dt;
      if (b.windup <= 0) {
        b.windup = 0;
        throwOne(g, tu);
        b.cd = tu.throwInterval * (0.8 + 0.4 * g.rng());
      }
    } else {
      b.cd -= dt;
      if (b.cd <= 0) {
        b.windup = C.WINDUP;
        var dirs = st.boss.dirs;
        b.dir = dirs[Math.floor(g.rng() * dirs.length)];
      }
    }
    if (st.monkeys) {
      b.mcd -= dt;
      if (b.mcd <= 0) {
        b.mcd = tu.monkeyEvery;
        var n = 0;
        g.hazards.forEach(function (h) { if (h.kind === "monkey") n++; });
        if (n < tu.maxMonkeys) spawnMonkey(g, tu);
      }
    }
  }

  function throwOne(g, tu) {
    var b = g.boss, st = g.stage, spec = st.boss;
    b.throwN += 1;
    b.thrownT = 0;
    var hx = b.x + b.dir * 24, hy = b.y - 40;
    var durian = st.durians && b.throwN % tu.durianEvery === 0;
    if (durian) {
      g.hazards.push({
        id: g.nextId++, kind: "durian", state: "bounce", x: hx, y: hy,
        vx: b.dir * tu.durianSpeed * (0.85 + 0.3 * g.rng()), vy: -120, rot: 0, jumped: -1
      });
    } else {
      var vx = spec.vx[0] + (spec.vx[1] - spec.vx[0]) * g.rng();
      g.hazards.push({
        id: g.nextId++, kind: "coconut", state: "fall", x: hx, y: hy,
        vx: b.dir * vx, vy: spec.vy, dir: b.dir, plat: -1, vine: -1,
        lastVine: -1, rot: 0, jumped: -1
      });
    }
    emit(g, "throw", { kind: durian ? "durian" : "coconut" });
  }

  function spawnMonkey(g, tu) {
    var b = g.boss, d = g.stage.boss.dirs[0];
    g.hazards.push({
      id: g.nextId++, kind: "monkey", state: "drop", x: b.x + d * 12, y: b.y - 12,
      vx: d * 30, vy: -110, dir: d, plat: -1, vine: -1, lastVine: -1, lastVineX: 0,
      speed: tu.monkeySpeed, turnT: 0.5, rot: 0, jumped: -1, walkT: 0
    });
    emit(g, "monkey");
  }

  // ---------- hazards ----------

  function updateHazards(g, dt) {
    var tu = tuning(g);
    var list = g.hazards;
    for (var i = 0; i < list.length; i++) {
      var h = list[i];
      if (h.kind === "coconut") coconut(g, h, dt, tu);
      else if (h.kind === "durian") durian(g, h, dt);
      else monkey(g, h, dt);
    }
    g.hazards = list.filter(function (h) {
      return !h.dead && h.x > -20 && h.x < C.W + 20 && h.y < C.H + 40;
    });
  }

  function airborne(g, h, dt) {
    // Returns the floor it landed on, or null.
    h.vy += C.GRAVITY * dt;
    var nx = h.x + h.vx * dt, ny = h.y + h.vy * dt;
    var land = h.vy > 0 ? landing(g.stage, nx, h.y, ny) : null;
    h.x = nx;
    if (land) { h.y = surf(land, nx); return land; }
    h.y = ny;
    return null;
  }

  function coconut(g, h, dt, tu) {
    var st = g.stage, speed = tu.rollSpeed;
    if (h.state === "fall") {
      var land = airborne(g, h, dt);
      if (land) {
        h.state = "roll";
        h.plat = land.id;
        h.dir = downhill(land) || sign(h.vx) || 1;
      }
      h.rot += sign(h.vx) * 4 * dt;
      return;
    }
    if (h.state === "vine") {
      var v = st.vines[h.vine];
      h.y += speed * 0.85 * dt;
      if (h.y >= v.bottom) {
        h.y = v.bottom;
        h.state = "roll";
        h.plat = v.bottomPlat;
        h.lastVine = v.id;
        h.dir = downhill(st.plats[h.plat]) || (g.rng() < 0.5 ? -1 : 1);
      }
      return;
    }
    // rolling
    var pl = st.plats[h.plat];
    if (pl.gone) { h.state = "fall"; h.vx = h.dir * speed * 0.5; h.vy = 0; return; }
    var dh = downhill(pl);
    if (dh) h.dir = dh;
    var px = h.x, nx = h.x + h.dir * speed * dt;
    if (!covers(pl, nx)) {
      var edgeY = surf(pl, h.dir > 0 ? pl.x2 : pl.x1);
      var q = adjacent(st, pl, nx, edgeY, 1, 3);
      if (q) { h.plat = q.id; pl = q; h.x = nx; h.y = surf(q, nx); }
      else if (adjacent(st, pl, nx, edgeY, C.STEP + 2, 0)) { h.dir = -h.dir; }
      else { h.x = nx; h.state = "fall"; h.vx = h.dir * speed * 0.6; h.vy = 0; return; }
    } else {
      h.x = nx;
      h.y = surf(pl, nx);
    }
    h.rot += h.dir * speed * dt / 6;
    // Maybe drop down a vine it is passing over.
    for (var i = 0; i < st.vines.length; i++) {
      var vn = st.vines[i];
      if (vn.id === h.lastVine || vn.topPlat !== h.plat) continue;
      if ((px - vn.x) * (h.x - vn.x) > 0) continue;
      h.lastVine = vn.id;
      var c = tu.vineChance, p = g.player;
      if (p.y > h.y + 20 && Math.abs(p.x - vn.x) < 90) c += 0.15;
      if (g.rng() < c) { h.state = "vine"; h.vine = vn.id; h.x = vn.x; }
      break;
    }
  }

  function durian(g, h, dt) {
    h.vy += C.GRAVITY * dt;
    var nx = h.x + h.vx * dt, ny = h.y + h.vy * dt;
    // Bounces back off the side of the screen once, then leaves next time.
    if (!h.reflected && ny < C.GROUND_Y - 40 && ((nx < 8 && h.vx < 0) || (nx > C.W - 8 && h.vx > 0))) {
      h.reflected = true;
      h.vx = -h.vx;
      nx = h.x + h.vx * dt;
    }
    var land = h.vy > 0 ? landing(g.stage, nx, h.y, ny) : null;
    h.x = nx;
    if (land) {
      h.y = surf(land, nx);
      h.vy = land.ground ? -150 : -200;
      emit(g, "bounce");
    } else {
      h.y = ny;
    }
    h.rot += sign(h.vx) * 6 * dt;
  }

  function monkey(g, h, dt) {
    var st = g.stage, p = g.player;
    h.walkT += dt;
    if (h.state === "drop") {
      var land = airborne(g, h, dt);
      if (land) { h.state = "walk"; h.plat = land.id; h.vx = 0; h.vy = 0; if (!h.dir) h.dir = 1; }
      return;
    }
    if (h.state === "climb") {
      var v = st.vines[h.vine];
      var target = h.climbTo === "top" ? v.top : v.bottom;
      var step = h.speed * 0.8 * dt;
      if (Math.abs(target - h.y) <= step) {
        h.y = target;
        h.state = "walk";
        h.plat = h.climbTo === "top" ? v.topPlat : v.bottomPlat;
        h.lastVine = v.id;
        h.lastVineX = h.x;
        h.dir = g.rng() < 0.5 ? -1 : 1;
      } else {
        h.y += sign(target - h.y) * step;
      }
      return;
    }
    var pl = st.plats[h.plat];
    if (pl.gone) { h.state = "drop"; h.vx = 0; h.vy = 0; return; }
    if (p.state !== "climb" && Math.abs(p.y - h.y) < 24) {
      h.turnT -= dt;
      if (h.turnT <= 0) {
        h.turnT = 0.8;
        if (g.rng() < 0.6) h.dir = sign(p.x - h.x) || h.dir;
      }
    }
    var px = h.x, nx = h.x + h.dir * h.speed * dt;
    if (nx < 8 || nx > C.W - 8) { h.dir = -h.dir; return; }
    if (!covers(pl, nx)) {
      var edgeY = surf(pl, h.dir > 0 ? pl.x2 : pl.x1);
      var q = adjacent(st, pl, nx, edgeY, C.STEP, C.STEP);
      if (q) { h.plat = q.id; pl = q; }
      else { h.dir = -h.dir; return; }
    }
    h.x = nx;
    h.y = surf(pl, nx);
    if (h.lastVine >= 0 && Math.abs(h.x - h.lastVineX) > 16) h.lastVine = -1;
    for (var i = 0; i < st.vines.length; i++) {
      var vn = st.vines[i];
      if (vn.id === h.lastVine || (px - vn.x) * (h.x - vn.x) > 0) continue;
      var up = vn.bottomPlat === h.plat && p.y < h.y - 30;
      var down = vn.topPlat === h.plat && p.y > h.y + 30;
      h.lastVine = vn.id;
      h.lastVineX = vn.x;
      if ((up || down) && g.rng() < 0.55) {
        h.state = "climb";
        h.vine = vn.id;
        h.climbTo = up ? "top" : "bottom";
        h.x = vn.x;
      }
      break;
    }
  }

  // ---------- scoring and contact ----------

  function hazardBox(h) {
    var s = SIZE[h.kind];
    return [h.x - s[0] / 2 + 2, h.y - s[1] + 2, h.x + s[0] / 2 - 2, h.y];
  }
  function playerBox(p) { return [p.x - 5, p.y - 23, p.x + 5, p.y - 1]; }
  function netBox(p) {
    var a = p.x - 3 * p.facing, b = p.x + 28 * p.facing;
    return [Math.min(a, b), p.y - 36, Math.max(a, b), p.y + 2];
  }
  function overlap(a, b) { return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }

  function jumpScoring(g) {
    var p = g.player;
    if (p.state !== "jump") return;
    for (var i = 0; i < g.hazards.length; i++) {
      var h = g.hazards[i];
      if (h.jumped === p.jumpId || h.dead) continue;
      if (Math.abs(h.x - p.x) < 10 && h.y > p.y + 2 && h.y - p.y < 44) {
        h.jumped = p.jumpId;
        p.jumpCount += 1;
        addScore(g, p.jumpCount === 1 ? 100 : 200, p.x, p.y - 26);
      }
    }
  }

  function hits(g) {
    var p = g.player;
    var pb = playerBox(p), nb = p.net > 0 ? netBox(p) : null;
    for (var i = 0; i < g.hazards.length; i++) {
      var h = g.hazards[i];
      if (h.dead) continue;
      var hb = hazardBox(h);
      if (nb && overlap(nb, hb)) {
        h.dead = true;
        addScore(g, SMASH_POINTS[h.kind], h.x, h.y - 16);
        emit(g, "smash", { kind: h.kind, x: h.x, y: h.y });
        continue;
      }
      if (!g.invincible && overlap(pb, hb)) { die(g, h.kind); return; }
    }
    g.hazards = g.hazards.filter(function (h) { return !h.dead; });
  }

  function pickups(g) {
    var p = g.player;
    g.stage.items.forEach(function (it) {
      if (it.taken || Math.abs(p.x - it.x) >= 12 || Math.abs(p.y - it.y) >= 16) return;
      it.taken = true;
      if (it.kind === "net") {
        p.net = C.NET_TIME;
        emit(g, "net", { x: it.x, y: it.y });
      } else {
        addScore(g, ITEM_POINTS[it.kind] || 300, it.x, it.y - 18);
        emit(g, "fruit", { kind: it.kind });
      }
    });
  }

  function goal(g) {
    var p = g.player, gl = g.stage.goal;
    if (p.state !== "ground" || p.plat !== gl.plat || Math.abs(p.x - gl.x) >= 14) return;
    g.mode = "clear";
    g.modeT = C.CLEAR_TIME;
    g.cleared += 1;
    g.player.net = 0;
    var bonus = g.bonus;
    emit(g, "clear", { bonus: bonus });
    if (bonus > 0) addScore(g, bonus, gl.x, gl.y - 30);
  }

  return {
    C: C, DIFFICULTY: DIFFICULTY, STAGES: STAGES,
    ITEM_POINTS: ITEM_POINTS, SMASH_POINTS: SMASH_POINTS,
    createGame: createGame, step: step, build: build, tuning: tuning,
    surf: surf, covers: covers, downhill: downhill, landing: landing, adjacent: adjacent,
    hazardBox: hazardBox, playerBox: playerBox, netBox: netBox, overlap: overlap,
    rngFrom: rngFrom
  };
});
