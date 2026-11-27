// Browser smoke run for Damn Dirty Apes, without a real browser:
// loads index.html in jsdom, draws with @napi-rs/canvas, and drives the
// game with a fake Xbox controller and the keyboard.
//
//   npm i jsdom @napi-rs/canvas        (anywhere; set SMOKE_DEPS to that folder)
//   SMOKE_DEPS=/path/to/node_modules node tools/smoke.js [screenshot-dir]
"use strict";
const path = require("path");
const fs = require("fs");
const deps = process.env.SMOKE_DEPS || path.join(__dirname, "..", "node_modules");
const { JSDOM } = require(path.join(deps, "jsdom"));
const { createCanvas } = require(path.join(deps, "@napi-rs/canvas"));

const shots = process.argv[2] || null;
if (shots) fs.mkdirSync(shots, { recursive: true });

let passed = 0, failed = 0;
function check(name, ok, extra) {
  if (ok) { passed++; console.log("ok   " + name); }
  else { failed++; console.log("FAIL " + name + (extra ? "  (" + extra + ")" : "")); }
}

const ROOT = path.join(__dirname, "..");
const BASE = "https://example.test/x/apes/";

// The page with its own <script src> files inlined, so no loader is needed.
function pageHtml() {
  return fs.readFileSync(path.join(ROOT, "index.html"), "utf8").replace(
    /<script src="([^"?]+)(\?[^"]*)?"><\/script>/g,
    (m, src) => "<script>\n" + fs.readFileSync(path.join(ROOT, src), "utf8") + "\n</script>");
}

function makePad() {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  return {
    index: 0, id: "Xbox Wireless Controller (STANDARD GAMEPAD)", mapping: "standard", connected: true,
    buttons, axes: [0, 0, 0, 0],
    set(i, on) { buttons[i].pressed = on; buttons[i].value = on ? 1 : 0; }
  };
}

(async function main() {
  const pad = makePad();
  let padOn = false;
  const dom = new JSDOM(pageHtml(), {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: BASE,
    beforeParse(window) {
      window.DDA_MANUAL = true;
      window.HTMLCanvasElement.prototype.getContext = function () {
        if (!this._real) this._real = createCanvas(this.width || 300, this.height || 150);
        return this._real.getContext("2d");
      };
      Object.defineProperty(window.navigator, "getGamepads", {
        value: () => (padOn ? [pad, null, null, null] : [null, null, null, null])
      });
    }
  });
  const w = dom.window;
  await new Promise((res) => {
    if (w.document.readyState === "complete") res();
    else w.addEventListener("load", res);
  });
  const errors = [];
  w.addEventListener("error", (e) => errors.push(e.message));

  const app = w.DDA.app, E = w.DDA.engine, ui = app.ui;
  let now = 1000;
  function frames(n) { for (let i = 0; i < n; i++) { now += 1000 / 60; app.frame(now); } }
  function tap(i) { pad.set(i, true); frames(2); pad.set(i, false); frames(2); }
  function key(k, type) { w.dispatchEvent(new w.KeyboardEvent(type || "keydown", { key: k, bubbles: true })); }
  function shot(name) {
    if (!shots) return;
    const c = w.document.getElementById("game")._real;
    fs.writeFileSync(path.join(shots, name + ".png"), c.toBuffer("image/png"));
  }

  check("scripts loaded", !!(app && E && w.DDA.render && w.DDA.input && w.DDA.audio));
  frames(5);
  check("starts on the title screen", ui.screen === "title");
  shot("01-title");

  // The A press that opened the page is still held when the pad appears.
  pad.set(0, true);
  padOn = true;
  frames(5);
  check("a held A from the launcher does not start a game", ui.screen === "title");
  pad.set(0, false);
  frames(2);
  tap(0);
  check("A starts a game", ui.screen === "game" && ui.game && ui.game.mode === "ready");
  frames(Math.ceil(E.C.READY_TIME * 60) + 5);
  check("after Get Ready the stage is live", ui.game.mode === "play");

  const g = ui.game;
  const x0 = g.player.x;
  pad.set(15, true); frames(30); pad.set(15, false); frames(1);
  check("D-pad right walks right", g.player.x > x0 + 20, "moved " + (g.player.x - x0).toFixed(1));
  const x1 = g.player.x;
  pad.axes[0] = -0.9; frames(20); pad.axes[0] = 0; frames(1);
  check("left stick walks left", g.player.x < x1 - 10);
  const x2 = g.player.x;
  pad.axes[0] = 0.2; frames(20); pad.axes[0] = 0;
  check("small stick drift is ignored", g.player.x === x2);
  tap(0);
  check("A jumps", g.player.state === "jump");
  frames(60);
  check("and lands", g.player.state === "ground" && g.mode === "play");
  shot("02-canopy");

  // Short Menu press pauses; a long hold is left to Edge.
  pad.set(9, true); frames(50); pad.set(9, false); frames(2);
  check("holding Menu (Edge's own menu) does not pause", ui.screen === "game");
  tap(9);
  check("a short Menu press pauses", ui.screen === "pause" && ui.menu && ui.menu.kind === "pause");
  shot("03-pause");
  const t0 = g.t;
  frames(30);
  check("the game is frozen while paused", g.t === t0);
  tap(1);
  check("B resumes", ui.screen === "game" && !ui.menu);
  tap(1);
  check("B in play pauses (it never leaves the game)", ui.screen === "pause");
  // Sound is row 3 (Resume, Difficulty, Lives, Sound, ...)
  for (let i = 0; i < 3; i++) tap(13);
  const row = ui.menu.rows[ui.menu.index];
  check("D-pad moves down the menu", row.id === "sound", row.id);
  tap(0);
  check("A toggles sound off and it is saved", app.settings.sound === false &&
    JSON.parse(w.localStorage.getItem("dda:settings")).sound === false);
  tap(0);
  check("and back on", app.settings.sound === true);
  tap(12); tap(12);
  check("up to Difficulty", ui.menu.rows[ui.menu.index].id === "difficulty");
  pad.set(15, true); frames(2); pad.set(15, false); frames(2);
  check("right changes the difficulty", app.settings.difficulty === "hard");
  pad.set(14, true); frames(2); pad.set(14, false); frames(2);
  check("left changes it back", app.settings.difficulty === "normal");
  tap(1);
  check("B closes the pause menu", ui.screen === "game");

  // Browser Back (Edge's B in browsing mode) pauses instead of leaving.
  w.dispatchEvent(new w.PopStateEvent("popstate", { state: null }));
  frames(1);
  check("browser Back pauses the game", ui.screen === "pause" && !ui.leaving);
  // Quit to title: last row
  ui.menu.index = ui.menu.rows.length - 1;
  tap(0);
  check("Quit to title", ui.screen === "title" && !ui.game);
  tap(9);
  check("Menu on the title opens settings", ui.menu && ui.menu.kind === "settings");
  shot("04-settings");
  tap(1);
  check("B closes settings", !ui.menu && ui.screen === "title");

  // Keyboard, and Edge's Gamepad* key names while the pad is talking.
  padOn = false;
  frames(30);
  key(" "); frames(2); key(" ", "keyup");
  check("Space starts a game from the keyboard", ui.screen === "game");
  frames(Math.ceil(E.C.READY_TIME * 60) + 5);
  const kx = ui.game.player.x;
  key("ArrowRight"); frames(20); key("ArrowRight", "keyup"); frames(1);
  check("arrow keys walk", ui.game.player.x > kx + 10);
  key("Escape"); frames(2);
  check("Esc pauses", ui.screen === "pause");
  key("Escape"); frames(2);
  check("Esc resumes", ui.screen === "game");
  padOn = true;
  frames(3);
  pad.set(15, true); frames(3);
  const pauseBefore = ui.screen;
  key("GamepadMenu"); frames(2); key("GamepadMenu", "keyup");
  pad.set(15, false); frames(2);
  check("Gamepad* keys are ignored while the pad API is active", pauseBefore === "game" && ui.screen === "game");

  // Game over and back to the title.
  const gg = ui.game;
  gg.lives = 1;
  gg.mode = "play";
  gg.player.state = "fall"; gg.player.fallFrom = 0; gg.player.y = 600; gg.player.vy = 10;
  frames(Math.ceil((E.C.DYING_TIME + 2) * 60));
  check("losing the last life shows Game Over", ui.screen === "over");
  shot("05-game-over");
  tap(0);
  check("A plays again", ui.screen === "game" && ui.game !== gg);
  tap(1);
  ui.menu.index = ui.menu.rows.length - 1; tap(0);
  check("back at the title", ui.screen === "title");
  tap(1);
  check("B on the title heads back to the launcher", ui.leaving === true);

  // Draw every stage mid-play (and one with the net out) for a look.
  if (shots) {
    ui.leaving = false;
    for (let s = 0; s < E.STAGES.length; s++) {
      ui.game = E.createGame({ seed: 4, stage: s, invincible: true });
      ui.screen = "game"; ui.menu = null;
      padOn = false;
      for (let i = 0; i < 60 * 9; i++) { E.step(ui.game, {}, 1 / 60); ui.game.bonus = 3500; }
      if (s === 2) { ui.game.player.net = 6; }
      ui.game.events.length = 0;
      frames(1);
      shot("1" + s + "-" + E.STAGES[s].key);
    }
  }

  check("no script errors", errors.length === 0, errors.join("; "));
  console.log("\n" + passed + " passed, " + failed + " failed");
  w.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
