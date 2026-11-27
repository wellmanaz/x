// Browser smoke run for Hair Force One, without a real browser:
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
const BASE = "https://example.test/x/hair/";

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
      window.HF_MANUAL = true;
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

  const app = w.HF.app, E = w.HF.engine, ui = app.ui;
  let now = 1000;
  function frames(n) { for (let i = 0; i < n; i++) { now += 1000 / 60; app.frame(now); } }
  function tap(i) { pad.set(i, true); frames(2); pad.set(i, false); frames(2); }
  function key(k, type) { w.dispatchEvent(new w.KeyboardEvent(type || "keydown", { key: k, bubbles: true })); }
  function shot(name) {
    if (!shots) return;
    const c = w.document.getElementById("game")._real;
    fs.writeFileSync(path.join(shots, name + ".png"), c.toBuffer("image/png"));
  }

  check("scripts loaded", !!(app && E && w.HF.render && w.HF.input && w.HF.audio && w.HF.MAZES));
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
  shot("02-ready");
  frames(Math.ceil(E.C.READY_TIME * 60) + 5);
  check("after the stage banner the maze is live", ui.game.mode === "play");

  const g = ui.game;
  g.invincible = true;
  const x0 = g.player.x;
  pad.set(14, true); frames(40); pad.set(14, false); frames(1);
  check("D-pad left runs left", g.player.x < x0 - 2, "moved " + (g.player.x - x0).toFixed(2));
  check("and picks up gold", g.score > 0 && g.coinsLeft < g.maze.coins);
  pad.axes[0] = 0.9; frames(20); pad.axes[0] = 0; frames(1);
  check("left stick turns round", g.player.dx === 1);
  const yBefore = g.player.y, xBefore = g.player.x;
  pad.axes[0] = 0.2; pad.axes[1] = 0.2; frames(3); pad.axes[0] = 0; pad.axes[1] = 0;
  check("small stick drift changes nothing", g.player.dx === 1 && g.player.y === yBefore && g.player.x >= xBefore);
  frames(30);
  const bricks = g.bricks;
  tap(0);
  check("A builds a wall behind the hero", g.walls.length === 1 && g.bricks === bricks - 1,
    "walls " + g.walls.length + " bricks " + g.bricks);
  frames(20);
  shot("03-play");

  // Short Menu press pauses; a long hold is left to Edge.
  pad.set(9, true); frames(50); pad.set(9, false); frames(2);
  check("holding Menu (Edge's own menu) does not pause", ui.screen === "game");
  tap(9);
  check("a short Menu press pauses", ui.screen === "pause" && ui.menu && ui.menu.kind === "pause");
  shot("04-pause");
  const t0 = g.t;
  frames(30);
  check("the game is frozen while paused", g.t === t0);
  tap(1);
  check("B resumes", ui.screen === "game" && !ui.menu);
  tap(1);
  check("B in play pauses (it never leaves the game)", ui.screen === "pause");
  for (let i = 0; i < 3; i++) tap(13);
  const row = ui.menu.rows[ui.menu.index];
  check("D-pad moves down the menu", row.id === "sound", row.id);
  tap(0);
  check("A toggles sound off and it is saved", app.settings.sound === false &&
    JSON.parse(w.localStorage.getItem("hf:settings")).sound === false);
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
  ui.menu.index = ui.menu.rows.length - 1;
  tap(0);
  check("Quit to title", ui.screen === "title" && !ui.game);
  tap(9);
  check("Menu on the title opens settings", ui.menu && ui.menu.kind === "settings");
  shot("05-settings");
  tap(1);
  check("B closes settings", !ui.menu && ui.screen === "title");

  // Keyboard, and Edge's Gamepad* key names while the pad is talking.
  padOn = false;
  frames(30);
  key(" "); frames(2); key(" ", "keyup");
  check("Space starts a game from the keyboard", ui.screen === "game");
  frames(Math.ceil(E.C.READY_TIME * 60) + 5);
  ui.game.invincible = true;
  const kx = ui.game.player.x;
  key("ArrowRight"); frames(30); key("ArrowRight", "keyup"); frames(1);
  check("arrow keys run", ui.game.player.x > kx + 1);
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

  // Go bigly, fire a chaser, see the popup.
  const gb = ui.game;
  gb.invincible = false;
  E.step(gb, {}, 0);
  const burgerAt = gb.maze.item.indexOf(2);
  gb.player.x = gb.player.cx = burgerAt % gb.maze.W;
  gb.player.y = gb.player.cy = Math.floor(burgerAt / gb.maze.W);
  gb.player.dx = 0; gb.player.dy = 0;
  frames(2);
  check("a cheeseburger goes bigly", gb.bigly > 0 && gb.chasers.some((c) => c.state === "flee"));
  const runner = gb.chasers.find((c) => c.state === "flee");
  runner.x = gb.player.x; runner.y = gb.player.y; runner.dx = 0; runner.dy = 0;
  frames(2);
  check("touching a scared chaser fires it", runner.state === "fired" && ui.popups.some((p) => p.label));
  shot("06-bigly");

  // Game over and back to the title.
  gb.lives = 1;
  gb.bigly = 0;
  gb.chasers.forEach((c) => { if (c.state === "flee") c.state = "chase"; });
  const hunter = gb.chasers.find((c) => c !== runner);
  hunter.state = "chase"; hunter.dx = 0; hunter.dy = 0;
  hunter.x = gb.player.x; hunter.y = gb.player.y;
  frames(3);
  check("a chaser catches the hero", gb.mode === "dying");
  frames(40);
  shot("07-dying");
  frames(Math.ceil((E.C.DYING_TIME + 2) * 60));
  check("losing the last life shows Game Over", ui.screen === "over");
  shot("08-game-over");
  tap(0);
  check("A plays again", ui.screen === "game" && ui.game !== gb);
  tap(1);
  ui.menu.index = ui.menu.rows.length - 1; tap(0);
  check("back at the title", ui.screen === "title");
  tap(1);
  check("B on the title heads back to the launcher", ui.leaving === true);

  // Draw every maze mid-play for a look.
  if (shots) {
    ui.leaving = false;
    padOn = false;
    for (let s = 0; s < E.MAZES.length; s++) {
      ui.game = E.createGame({ seed: 5, stage: s, invincible: true });
      ui.screen = "game"; ui.menu = null;
      const gg = ui.game;
      for (let i = 0; i < 60 * 8; i++) {
        const dirs = ["left", "up", "right", "down"];
        const inp = {}; inp[dirs[Math.floor(i / 50) % 4]] = true;
        inp.build = i === 60 * 7;
        E.step(gg, inp, 1 / 60);
      }
      if (s === 1) gg.bonus = { x: gg.maze.bonus.x, y: gg.maze.bonus.y, t: 5, kind: "trophy" };
      if (s === 2) { gg.bigly = 5; gg.chasers.forEach((c) => { if (c.state === "chase") c.state = "flee"; }); }
      gg.events.length = 0;
      frames(1);
      shot("1" + s + "-" + E.MAZES[s].key);
    }
  }

  check("no script errors", errors.length === 0, errors.join("; "));
  console.log("\n" + passed + " passed, " + failed + " failed");
  w.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
