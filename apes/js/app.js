/* Damn Dirty Apes: screens, menus, saving, and the main loop. */
(function () {
  "use strict";
  var DDA = window.DDA, E = DDA.engine, R = DDA.render, A = DDA.audio;
  var LAUNCHER = "../";
  var RES = 2;              // backing pixels per logical pixel (960x540 -> 1920x1080)
  var STEP = 1 / 60;
  var JUMP_BUFFER = 0.12;

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  canvas.width = 960 * RES;
  canvas.height = 540 * RES;

  function load(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function save(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* storage may be off */ }
  }

  var DIFFS = ["easy", "normal", "hard"];
  var settings = load("dda:settings", null) || {};
  if (DIFFS.indexOf(settings.difficulty) < 0) settings.difficulty = "normal";
  if (settings.lives !== 3 && settings.lives !== 5) settings.lives = 3;
  if (typeof settings.sound !== "boolean") settings.sound = true;
  A.setEnabled(settings.sound);

  var input = DDA.input.create(window);
  var ui = {
    screen: "title",     // title | game | pause | over
    menu: null,          // open menu on top of the title or the game
    game: null,
    hi: Number(load("dda:hi", 0)) || 0,
    newHigh: false,
    popups: [],
    clearBonus: 0,
    acc: 0,
    last: null,
    t: 0,
    pendingJump: 0,
    overT: 0
  };

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- menus ----------

  function settingRows() {
    return [
      { id: "difficulty", label: "Difficulty", value: cap(settings.difficulty) },
      { id: "lives", label: "Lives", value: String(settings.lives) },
      { id: "sound", label: "Sound", value: settings.sound ? "On" : "Off" }
    ];
  }

  function openMenu(kind) {
    ui.menu = { kind: kind, index: 0 };
    refreshMenu();
  }

  function refreshMenu() {
    var m = ui.menu;
    if (!m) return;
    if (m.kind === "pause") {
      m.title = "PAUSED";
      m.rows = [{ id: "resume", label: "Resume" }].concat(settingRows(), [
        { id: "restart", label: "Restart" },
        { id: "quit", label: "Quit to title" }
      ]);
      m.hint = "Difficulty and lives apply to the next game";
    } else {
      m.title = "SETTINGS";
      m.rows = settingRows().concat([{ id: "back", label: "Back" }]);
      m.hint = "A: change   B: back";
    }
    if (m.index >= m.rows.length) m.index = m.rows.length - 1;
  }

  function change(id, dir) {
    if (id === "difficulty") {
      var i = DIFFS.indexOf(settings.difficulty);
      settings.difficulty = DIFFS[(i + dir + DIFFS.length) % DIFFS.length];
    } else if (id === "lives") {
      settings.lives = settings.lives === 3 ? 5 : 3;
    } else if (id === "sound") {
      settings.sound = !settings.sound;
      A.setEnabled(settings.sound);
    } else return false;
    save("dda:settings", settings);
    refreshMenu();
    A.play("move");
    return true;
  }

  function closeMenu() {
    ui.menu = null;
    if (ui.screen === "pause") ui.screen = "game";
    input.forget();
  }

  function menuInput(inp) {
    var m = ui.menu, row = m.rows[m.index];
    if (inp.nav === "up") { m.index = (m.index + m.rows.length - 1) % m.rows.length; A.play("move"); return; }
    if (inp.nav === "down") { m.index = (m.index + 1) % m.rows.length; A.play("move"); return; }
    if (inp.nav === "left") { change(row.id, -1); return; }
    if (inp.nav === "right") { change(row.id, 1); return; }
    if (inp.pressed.b || inp.pressed.menu) { closeMenu(); return; }
    if (inp.pressed.a) {
      if (change(row.id, 1)) return;
      A.play("choose");
      if (row.id === "resume" || row.id === "back") closeMenu();
      else if (row.id === "restart") { ui.menu = null; startGame(); }
      else if (row.id === "quit") { ui.menu = null; toTitle(); }
    }
  }

  // ---------- screens ----------

  function startGame() {
    ui.game = E.createGame({ difficulty: settings.difficulty, lives: settings.lives });
    ui.screen = "game";
    ui.menu = null;
    ui.popups = [];
    ui.acc = 0;
    ui.pendingJump = 0;
    ui.clearBonus = 0;
    ui.overT = 0;
    ui.newHigh = false;
    A.play("choose");
  }

  function toTitle() {
    ui.screen = "title";
    ui.menu = null;
    ui.game = null;
    input.forget();
  }

  function pause() {
    if (ui.screen !== "game") return;
    ui.screen = "pause";
    openMenu("pause");
    A.play("move");
  }

  function leave() {
    ui.leaving = true;
    window.location.href = LAUNCHER;
  }

  // B, Esc and the browser's own Back all come here.
  function back() {
    if (ui.menu) { closeMenu(); return; }
    if (ui.screen === "game") { pause(); return; }
    if (ui.screen === "over") { toTitle(); return; }
    if (ui.screen === "title") leave();
  }

  function saveHigh() {
    var g = ui.game;
    if (g && g.score > ui.hi) {
      ui.hi = g.score;
      ui.newHigh = true;
      save("dda:hi", ui.hi);
    }
  }

  function events(g) {
    for (var i = 0; i < g.events.length; i++) {
      var e = g.events[i];
      switch (e.type) {
        case "score":
          ui.popups.push({ text: e.pts, x: e.x, y: e.y, t: 1, color: e.pts >= 500 ? "#ffd34a" : "#fff" });
          if (e.pts < 1000) A.play("score");
          break;
        case "jump": A.play("jump"); break;
        case "throw": A.play("throw"); break;
        case "smash": A.play("smash"); break;
        case "net": A.play("net"); break;
        case "fruit": A.play("fruit"); break;
        case "crumble": A.play("crumble"); break;
        case "die": A.play("die"); break;
        case "clear": ui.clearBonus = e.bonus; A.play("clear"); saveHigh(); break;
        case "extra-life":
          ui.popups.push({ text: "EXTRA LIFE", x: g.player.x, y: g.player.y - 40, t: 1.6, color: "#8fe07a" });
          A.play("life");
          break;
        case "game-over": A.play("over"); break;
      }
    }
    g.events.length = 0;
  }

  function updateGame(inp, dt) {
    var g = ui.game;
    if (inp.pressed.menu || inp.pressed.b || inp.pressed.y) { pause(); return; }
    if (inp.pressed.a || inp.pressed.x) ui.pendingJump = JUMP_BUFFER;
    ui.acc = Math.min(ui.acc + dt, STEP * 6);
    while (ui.acc >= STEP) {
      ui.acc -= STEP;
      E.step(g, {
        left: inp.held.left, right: inp.held.right, up: inp.held.up, down: inp.held.down,
        jump: ui.pendingJump > 0
      }, STEP);
      if (g.player.state === "jump") ui.pendingJump = 0;
      else ui.pendingJump = Math.max(0, ui.pendingJump - STEP);
    }
    events(g);
    ui.popups.forEach(function (p) { p.t -= dt; });
    ui.popups = ui.popups.filter(function (p) { return p.t > 0; });
    if (g.mode === "over") {
      ui.overT += dt;
      if (ui.overT > 1.6) { saveHigh(); ui.screen = "over"; input.forget(); }
    }
  }

  function update(inp, dt) {
    if (ui.menu) { menuInput(inp); return; }
    if (ui.screen === "title") {
      if (inp.pressed.a) startGame();
      else if (inp.pressed.menu || inp.pressed.y) { openMenu("settings"); A.play("move"); }
      else if (inp.pressed.b) back();
      return;
    }
    if (ui.screen === "game") { updateGame(inp, dt); return; }
    if (ui.screen === "over") {
      if (inp.pressed.a) startGame();
      else if (inp.pressed.b) toTitle();
    }
  }

  function draw() {
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.imageSmoothingEnabled = false;
    var info = { hi: ui.hi, popups: ui.popups, clearBonus: ui.clearBonus, menuOpen: !!ui.menu };
    if (ui.screen === "title") {
      R.title(ctx, info, ui.t);
    } else {
      R.frame(ctx, ui.game, info, ui.t);
      if (ui.screen === "over") R.gameOver(ctx, { score: ui.game.score, hi: ui.hi, newHigh: ui.newHigh });
    }
    if (ui.menu) R.menu(ctx, ui.menu);
  }

  function frame(nowMs) {
    var dt = ui.last == null ? 0 : Math.min(0.1, Math.max(0, (nowMs - ui.last) / 1000));
    ui.last = nowMs;
    ui.t += dt;
    var inp = input.poll(nowMs);
    if (inp.pressed.a || inp.pressed.x) A.unlock();
    update(inp, dt);
    draw();
  }

  function loop(now) {
    frame(now);
    window.requestAnimationFrame(loop);
  }

  // ---------- browser hooks ----------

  canvas.addEventListener("pointerdown", function () { A.unlock(); input.click(); });

  // Keep the browser's Back inside the game: it pauses, closes menus, and
  // only leaves for the launcher from the title screen.
  if (window.history && window.history.pushState) {
    try { window.history.pushState({ dda: 1 }, ""); } catch (e) { /* ignore */ }
    window.addEventListener("popstate", function () {
      back();
      if (!ui.leaving) { try { window.history.pushState({ dda: 1 }, ""); } catch (e) { /* ignore */ } }
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) pause();
  });
  window.addEventListener("pageshow", function () {
    ui.last = null;
    input.forget();
  });

  DDA.app = {
    ui: ui, settings: settings, frame: frame, startGame: startGame, back: back,
    leave: function () { leave(); }
  };

  if (!window.DDA_MANUAL) window.requestAnimationFrame(loop);
})();
