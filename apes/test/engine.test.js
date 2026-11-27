// Rules tests for Damn Dirty Apes. Run from apes/: node --test
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../js/engine.js");
const C = E.C;
const DT = 1 / 60;

function run(g, input, seconds, until) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    E.step(g, typeof input === "function" ? input(g, i) : input, DT);
    if (until && until(g)) return i + 1;
  }
  return n;
}
function play(g) { run(g, {}, C.READY_TIME + 0.05); assert.equal(g.mode, "play"); }
function stageIndex(key) { return E.STAGES.findIndex((s) => s.key === key); }
function newGame(key, opts) {
  return E.createGame(Object.assign({ seed: 7, stage: stageIndex(key) }, opts || {}));
}
function placePlayer(g, x, platId) {
  const p = g.player, pl = g.stage.plats[platId];
  p.x = x; p.y = E.surf(pl, x); p.plat = platId; p.state = "ground"; p.vx = 0; p.vy = 0;
}
function platCovering(g, x, nearY) {
  let best = null, bd = Infinity;
  g.stage.plats.forEach((p) => {
    if (!E.covers(p, x)) return;
    const d = Math.abs(E.surf(p, x) - nearY);
    if (d < bd) { bd = d; best = p; }
  });
  return best;
}
function addCoconut(g, x, plat, dir) {
  const h = {
    id: g.nextId++, kind: "coconut", state: "roll", x, y: E.surf(plat, x), vx: 0, vy: 0,
    dir, plat: plat.id, vine: -1, lastVine: -1, rot: 0, jumped: -1
  };
  g.hazards.push(h);
  return h;
}

// ---------- the stages ----------

test("every stage builds, with vines, a start, a goal and an unreachable boss", () => {
  assert.equal(E.STAGES.length, 4);
  E.STAGES.forEach((spec) => {
    const st = E.build(spec);
    assert.ok(st.vines.length >= 5, spec.key + " vines");
    assert.ok(st.plats.some((p) => p.ground), spec.key + " ground");
    st.vines.forEach((v) => assert.ok(v.bottom - v.top > 40, spec.key + " vine " + v.id + " too short"));
    // Nothing walkable is near the boss's perch.
    const b = spec.boss;
    st.plats.forEach((p) => {
      for (let x = b.perch[0]; x <= b.perch[1]; x += 4) {
        if (!E.covers(p, x)) continue;
        assert.ok(E.surf(p, x) - b.y > C.JUMP_V * C.JUMP_V / (2 * C.GRAVITY) + 4,
          spec.key + ": the boss could be reached from floor " + p.id);
      }
    });
  });
});

// A graph of the floors: walking between touching floors, vines, and jumps
// over short gaps. Used to check each layout can be finished.
function floorGraph(st) {
  const edges = st.plats.map(() => []);
  const maxGap = C.WALK * (2 * C.JUMP_V / C.GRAVITY) - 8;
  st.plats.forEach((p) => st.plats.forEach((q) => {
    if (p === q) return;
    const py = E.surf(p, p.x2), qy = E.surf(q, q.x1);
    if (Math.abs(p.x2 - q.x1) < 0.5 && Math.abs(py - qy) <= C.STEP) {
      edges[p.id].push({ type: "walk", to: q.id, dir: 1 });
      edges[q.id].push({ type: "walk", to: p.id, dir: -1 });
    } else if (q.x1 > p.x2 && q.x1 - p.x2 <= maxGap && Math.abs(py - qy) <= 8) {
      edges[p.id].push({ type: "jump", to: q.id, dir: 1, edge: p.x2 });
      edges[q.id].push({ type: "jump", to: p.id, dir: -1, edge: q.x1 });
    }
  }));
  st.vines.forEach((v) => {
    edges[v.bottomPlat].push({ type: "vine", to: v.topPlat, vine: v, up: true });
    edges[v.topPlat].push({ type: "vine", to: v.bottomPlat, vine: v, up: false });
  });
  return edges;
}

function route(st) {
  const edges = floorGraph(st);
  const prev = new Map([[st.start.plat, null]]);
  const queue = [st.start.plat];
  while (queue.length) {
    const at = queue.shift();
    if (at === st.goal.plat) break;
    edges[at].forEach((e) => {
      if (prev.has(e.to)) return;
      prev.set(e.to, { from: at, edge: e });
      queue.push(e.to);
    });
  }
  if (!prev.has(st.goal.plat)) return null;
  const path = [];
  for (let at = st.goal.plat; prev.get(at); at = prev.get(at).from) path.unshift(prev.get(at).edge);
  return path;
}

test("the crate can be reached from the start on every stage", () => {
  E.STAGES.forEach((spec) => {
    const st = E.build(spec);
    assert.ok(route(st), spec.key + ": no route from start to crate");
  });
});

// Drive the ranger along the route with real inputs, hazards off.
function autopilot(g) {
  const path = route(g.stage);
  let k = 0;
  return function (g2) {
    const p = g2.player;
    while (k < path.length && p.state === "ground" && p.plat === path[k].to) k++;
    if (p.state !== "ground" && p.state !== "climb") return {};
    if (k >= path.length) {
      const gx = g2.stage.goal.x;
      return { left: gx < p.x - 1, right: gx > p.x + 1 };
    }
    const e = path[k];
    if (e.type === "walk") return { left: e.dir < 0, right: e.dir > 0 };
    if (e.type === "vine") {
      if (p.state === "climb") return { up: e.up, down: !e.up };
      const dx = e.vine.x - p.x;
      if (Math.abs(dx) > 1.5) return { left: dx < 0, right: dx > 0 };
      return { up: e.up, down: !e.up };
    }
    // jump: run at the gap, take off a few pixels before the edge
    const toEdge = (e.edge - p.x) * e.dir;
    return { left: e.dir < 0, right: e.dir > 0, jump: toEdge <= 6 };
  };
}

for (const spec of E.STAGES) {
  test("autopilot climbs " + spec.key + " to the crate and clears it", () => {
    const g = newGame(spec.key, { noHazards: true });
    play(g);
    const pilot = autopilot(g);
    run(g, (gg) => pilot(gg), 70, (gg) => gg.mode !== "play");
    assert.equal(g.mode, "clear", spec.key + " ended in " + g.mode + " (" + g.deathCause + ") at " +
      Math.round(g.player.x) + "," + Math.round(g.player.y));
    assert.ok(g.score >= g.bonus && g.score > 0, "the time bonus is paid out");
  });
}

// ---------- hazards flow and never get stuck ----------

for (const spec of E.STAGES) {
  test(spec.key + ": thrown hazards always work their way off the screen", () => {
    const g = newGame(spec.key, { invincible: true, seed: 11 });
    placePlayer(g, g.stage.start.x, g.stage.start.plat);
    play(g);
    const born = new Map();
    const lastMove = new Map();
    let longest = 0, thrown = 0;
    for (let i = 0; i < 90 / DT; i++) {
      E.step(g, {}, DT);
      g.bonus = C.BONUS_START;
      for (const h of g.hazards) {
        if (h.kind === "monkey") continue;
        if (!born.has(h.id)) { born.set(h.id, g.t); thrown++; lastMove.set(h.id, { x: h.x, y: h.y, t: g.t }); }
        const lm = lastMove.get(h.id);
        if (Math.abs(h.x - lm.x) + Math.abs(h.y - lm.y) > 2) lastMove.set(h.id, { x: h.x, y: h.y, t: g.t });
        else assert.ok(g.t - lm.t < 2, spec.key + ": " + h.kind + " " + h.id + " stuck at " + Math.round(h.x) + "," + Math.round(h.y));
        longest = Math.max(longest, g.t - born.get(h.id));
      }
    }
    assert.ok(thrown > 20, "the boss keeps throwing (" + thrown + ")");
    assert.ok(longest < 40, spec.key + ": a hazard stayed on screen " + longest.toFixed(1) + "s");
  });
}

test("coconuts sometimes drop down vines, more often at higher levels", () => {
  function vineDrops(level) {
    const g = newGame("canopy", { invincible: true, seed: 3, level });
    play(g);
    let drops = 0;
    const seen = new Set();
    run(g, {}, 120, () => { g.bonus = C.BONUS_START; g.hazards.forEach((h) => { if (h.state === "vine" && !seen.has(h.id + ":" + h.vine)) { seen.add(h.id + ":" + h.vine); drops++; } }); return false; });
    return drops;
  }
  const l1 = vineDrops(1), l3 = vineDrops(3);
  assert.ok(l1 > 0, "some vine drops at level 1");
  assert.ok(l3 > l1, "more at level 3 (" + l3 + " vs " + l1 + ")");
});

test("monkeys come down on the stages that have them, up to the cap", () => {
  const g = newGame("bridges", { invincible: true, seed: 5 });
  play(g);
  let most = 0;
  run(g, {}, 60, () => { g.bonus = C.BONUS_START; most = Math.max(most, g.hazards.filter((h) => h.kind === "monkey").length); return false; });
  assert.ok(most >= 1);
  assert.ok(most <= E.tuning(g).maxMonkeys);
  const c = newGame("canopy", { invincible: true });
  play(c);
  run(c, {}, 30, () => { c.bonus = C.BONUS_START; return false; });
  assert.equal(c.hazards.filter((h) => h.kind === "monkey").length, 0);
});

// ---------- the ranger ----------

test("climbing a vine moves the ranger to the floor above", () => {
  const g = newGame("canopy", { noHazards: true });
  play(g);
  const v = g.stage.vines[0];
  placePlayer(g, v.x + 5, v.bottomPlat);
  run(g, { up: true }, 0.1);
  assert.equal(g.player.state, "climb");
  assert.equal(g.player.x, v.x, "snaps onto the vine");
  run(g, { up: true }, 3, (gg) => gg.player.state === "ground");
  assert.equal(g.player.plat, v.topPlat);
  assert.ok(Math.abs(g.player.y - v.top) < 0.01);
  // and back down
  run(g, { down: true }, 3, (gg) => gg.player.state === "ground" && gg.player.plat === v.bottomPlat);
  assert.equal(g.player.plat, v.bottomPlat);
});

test("nothing happens pressing up away from a vine", () => {
  const g = newGame("canopy", { noHazards: true });
  play(g);
  const x0 = g.player.x;
  run(g, { up: true }, 0.5);
  assert.equal(g.player.state, "ground");
  assert.equal(g.player.x, x0);
});

test("walking off a floor edge onto the floor below is fatal", () => {
  const g = newGame("canopy", { noHazards: true });
  play(g);
  const f1 = platCovering(g, 30, 450);
  placePlayer(g, 30, f1.id);
  run(g, { left: true }, 3, (gg) => gg.mode !== "play");
  assert.equal(g.mode, "dying");
  assert.equal(g.deathCause, "fall");
});

test("walking up and down temple steps is safe", () => {
  const g = newGame("temple", { noHazards: true });
  play(g);
  const low = platCovering(g, 60, 458);
  placePlayer(g, 60, low.id);
  run(g, { right: true }, 6, (gg) => gg.player.x > 420);
  assert.equal(g.mode, "play");
  assert.equal(g.player.state, "ground");
  assert.ok(g.player.x > 420, "crossed the whole tier");
});

test("a running jump clears a broken plank on the rope bridges", () => {
  const g = newGame("bridges", { noHazards: true });
  play(g);
  const left = platCovering(g, 150, 444);
  placePlayer(g, 150, left.id);
  run(g, (gg) => ({ right: true, jump: gg.player.state === "ground" && gg.player.x >= left.x2 - 6 }), 2,
    (gg) => gg.player.x > 240 && gg.player.state === "ground");
  assert.equal(g.mode, "play");
  assert.ok(g.player.x > 224, "landed on the far side");
});

test("crumbling rock gives way under a ranger who stands still", () => {
  const g = newGame("falls", { noHazards: true });
  play(g);
  const tile = g.stage.plats.find((p) => p.crumble);
  placePlayer(g, (tile.x1 + tile.x2) / 2, tile.id);
  run(g, {}, C.CRUMBLE_DELAY + 0.05);
  assert.ok(tile.gone, "the tile is gone");
  run(g, {}, 2, (gg) => gg.mode !== "play");
  assert.equal(g.mode, "dying");
  assert.equal(g.deathCause, "fall");
});

test("crumbling rock holds a ranger who keeps walking, then grows back", () => {
  const g = newGame("falls", { noHazards: true });
  play(g);
  const row = g.stage.plats.filter((p) => p.crumble && Math.abs(p.y1 - 446) < 8);
  const start = platCovering(g, row[0].x1 - 10, row[0].y1);
  placePlayer(g, row[0].x1 - 10, start.id);
  run(g, { right: true }, 3, (gg) => gg.player.x > row[row.length - 1].x2 + 10);
  assert.equal(g.mode, "play");
  assert.ok(row.some((p) => p.gone), "the tiles behind fell away");
  run(g, {}, C.CRUMBLE_GONE + 0.1);
  assert.ok(row.every((p) => !p.gone), "and came back");
});

test("jumping a coconut scores 100, a second in the same jump 200 more", () => {
  const g = newGame("canopy", { noHazards: true });
  play(g);
  const ground = g.stage.plats.find((p) => p.ground);
  placePlayer(g, 200, ground.id);
  const h = addCoconut(g, 262, ground, -1);
  g.noHazards = false;
  g.boss.cd = 999;
  run(g, {}, 2, () => h.x - g.player.x <= 26);
  run(g, (gg, i) => ({ jump: i === 0 }), 1, (gg) => gg.player.state === "ground");
  assert.equal(g.mode, "play");
  assert.equal(g.score, 100);

  // two coconuts close together
  placePlayer(g, 200, ground.id);
  const a = addCoconut(g, 220, ground, -1), b = addCoconut(g, 227, ground, -1);
  run(g, (gg, i) => ({ jump: i === 0 }), 1, (gg) => gg.player.state === "ground");
  assert.equal(g.mode, "play");
  assert.equal(g.score, 400);
  assert.ok(a.jumped === g.player.jumpId && b.jumped === g.player.jumpId);
});

test("touching a coconut costs a life and restarts the stage", () => {
  const g = newGame("canopy", { noHazards: true, lives: 3 });
  play(g);
  const ground = g.stage.plats.find((p) => p.ground);
  placePlayer(g, 200, ground.id);
  g.noHazards = false;
  g.boss.cd = 999;
  addCoconut(g, 230, ground, -1);
  run(g, {}, 1, (gg) => gg.mode !== "play");
  assert.equal(g.mode, "dying");
  assert.equal(g.deathCause, "coconut");
  run(g, {}, C.DYING_TIME + 0.05);
  assert.equal(g.lives, 2);
  assert.equal(g.mode, "ready");
  assert.equal(g.hazards.length, 0);
  assert.equal(g.player.x, g.stage.start.x);
  assert.equal(g.bonus, C.BONUS_START);
});

test("losing the last life ends the game", () => {
  const g = newGame("canopy", { noHazards: true, lives: 1 });
  play(g);
  const f1 = platCovering(g, 30, 450);
  placePlayer(g, 30, f1.id);
  run(g, { left: true }, 3, (gg) => gg.mode !== "play");
  run(g, {}, C.DYING_TIME + 0.1);
  assert.equal(g.mode, "over");
  assert.equal(g.lives, 0);
  const s = g.score;
  run(g, { right: true, jump: true }, 1);
  assert.equal(g.mode, "over", "nothing moves after game over");
  assert.equal(g.score, s);
});

test("the net bags hazards in front for points, and stops jumping and climbing", () => {
  const g = newGame("canopy", { noHazards: true });
  play(g);
  const net = g.stage.items.find((it) => it.kind === "net");
  placePlayer(g, net.x - 20, net.plat);
  run(g, { right: true }, 1, (gg) => gg.player.net > 0);
  assert.ok(net.taken);
  assert.ok(g.player.net > 0);
  const p = g.player;
  run(g, { jump: true }, 0.2);
  assert.equal(p.state, "ground", "can't jump while holding the net");

  g.noHazards = false;
  g.boss.cd = 999;
  const pl = g.stage.plats[p.plat];
  const h = addCoconut(g, p.x + 30, pl, -1);
  h.dir = -1;
  pl.y1 = pl.y2 = E.surf(pl, p.x); // level it so the coconut rolls at the ranger
  p.facing = 1;
  const before = g.score;
  run(g, {}, 1, () => h.dead || g.mode !== "play");
  assert.equal(g.mode, "play");
  assert.equal(g.score - before, E.SMASH_POINTS.coconut);
  assert.equal(g.hazards.length, 0);

  run(g, {}, C.NET_TIME);
  assert.equal(g.player.net, 0, "the net wears off");
});

test("the net does not cover the ranger's back", () => {
  const g = newGame("canopy", { noHazards: true });
  play(g);
  const ground = g.stage.plats.find((p) => p.ground);
  placePlayer(g, 200, ground.id);
  g.player.net = 5;
  g.player.facing = -1;
  g.noHazards = false;
  g.boss.cd = 999;
  addCoconut(g, 240, ground, -1);
  run(g, {}, 1, (gg) => gg.mode !== "play");
  assert.equal(g.mode, "dying");
});

test("fruit pays out once", () => {
  const g = newGame("canopy", { noHazards: true });
  play(g);
  const fr = g.stage.items.find((it) => it.kind === "banana");
  placePlayer(g, fr.x - 15, fr.plat);
  run(g, { right: true }, 0.6);
  assert.equal(g.score, E.ITEM_POINTS.banana);
  run(g, { left: true }, 0.6);
  run(g, { right: true }, 0.6);
  assert.equal(g.score, E.ITEM_POINTS.banana);
});

test("the bonus counts down and running out of time costs a life", () => {
  const g = newGame("canopy", { noHazards: true });
  play(g);
  run(g, {}, C.BONUS_TICK + 0.02);
  assert.equal(g.bonus, C.BONUS_START - C.BONUS_STEP);
  run(g, {}, (C.BONUS_START / C.BONUS_STEP) * C.BONUS_TICK, (gg) => gg.mode !== "play");
  assert.equal(g.mode, "dying");
  assert.equal(g.deathCause, "time");
});

test("clearing all four stages starts level 2 with tougher numbers", () => {
  const g = newGame("canopy", { noHazards: true });
  const t1 = E.tuning(g);
  for (let s = 0; s < E.STAGES.length; s++) {
    play(g);
    assert.equal(g.stageIdx, s);
    const gl = g.stage.goal;
    placePlayer(g, gl.x - 20, gl.plat);
    run(g, { right: true }, 1, (gg) => gg.mode === "clear");
    assert.equal(g.mode, "clear");
    run(g, {}, C.CLEAR_TIME + 0.05);
  }
  assert.equal(g.level, 2);
  assert.equal(g.stageIdx, 0);
  assert.equal(g.cleared, 4);
  const t2 = E.tuning(g);
  assert.ok(t2.rollSpeed > t1.rollSpeed);
  assert.ok(t2.throwInterval < t1.throwInterval);
  assert.ok(t2.vineChance > t1.vineChance);
});

test("difficulty settings scale the hazards", () => {
  const e = E.tuning(E.createGame({ seed: 1, difficulty: "easy" }));
  const n = E.tuning(E.createGame({ seed: 1, difficulty: "normal" }));
  const h = E.tuning(E.createGame({ seed: 1, difficulty: "hard" }));
  assert.ok(e.rollSpeed < n.rollSpeed && n.rollSpeed < h.rollSpeed);
  assert.ok(e.throwInterval > n.throwInterval && n.throwInterval > h.throwInterval);
});

test("an extra life at 20,000 points, once", () => {
  const g = newGame("canopy", { noHazards: true, lives: 3 });
  play(g);
  g.score = C.EXTRA_LIFE_AT - 200;
  const fr = g.stage.items.find((it) => it.kind === "banana");
  placePlayer(g, fr.x - 15, fr.plat);
  run(g, { right: true }, 0.6);
  assert.equal(g.lives, 4);
  assert.ok(g.events.some((e) => e.type === "extra-life"));
  g.score += 30000;
  const pine = g.stage.items.find((it) => it.kind === "pineapple");
  placePlayer(g, pine.x - 15, pine.plat);
  run(g, { right: true }, 0.6);
  assert.equal(g.lives, 4);
});

test("the same seed plays out the same way", () => {
  function trace(seed) {
    const g = E.createGame({ seed, stage: 2, invincible: true });
    run(g, {}, 30, () => { g.bonus = C.BONUS_START; return false; });
    return g.hazards.map((h) => h.kind + Math.round(h.x) + "," + Math.round(h.y)).join("|");
  }
  assert.equal(trace(42), trace(42));
  assert.notEqual(trace(42), trace(43));
});
