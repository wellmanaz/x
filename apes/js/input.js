/* Damn Dirty Apes: controller and keyboard input.
 * Xbox controller through the Gamepad API (standard mapping):
 *   A (0) jump / choose, B (1) back, X (2) jump, Y (3) pause,
 *   Menu (9) pause on a short press (a long press is Edge's own menu),
 *   D-pad (12-15) or left stick to walk and climb. View (8) is left alone.
 * Keyboard: arrows / WASD, Space Z Enter = A, Esc Backspace = B, P = Menu.
 * Edge can also send "Gamepad..." key names; those are ignored while the
 * Gamepad API is already delivering the same pad.
 */
(function () {
  "use strict";
  var DDA = window.DDA = window.DDA || {};

  var MENU_TAP_MS = 600;
  var FIRST_REPEAT = 380, NEXT_REPEAT = 140;
  var DEAD_X = 0.4, DEAD_Y = 0.55;

  var KEYS = {
    ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
    a: "left", d: "right", w: "up", s: "down", A: "left", D: "right", W: "up", S: "down",
    GamepadDPadLeft: "left", GamepadDPadRight: "right", GamepadDPadUp: "up", GamepadDPadDown: "down",
    GamepadLeftThumbstickLeft: "left", GamepadLeftThumbstickRight: "right",
    GamepadLeftThumbstickUp: "up", GamepadLeftThumbstickDown: "down",
    " ": "a", Enter: "a", z: "a", Z: "a", GamepadA: "a",
    x: "x", X: "x", GamepadX: "x",
    Escape: "b", Backspace: "b", GamepadB: "b",
    p: "menu", P: "menu", GamepadMenu: "menu",
    GamepadY: "y"
  };
  var DIRS = ["left", "right", "up", "down"];

  function create(win) {
    var nav = win.navigator;
    var keyHeld = {};
    var keyPressed = {};
    var pads = {};
    var lastPadActivity = -Infinity;
    var repeat = { dir: null, next: 0 };
    var clickQueued = false;

    function now() { return win.performance && win.performance.now ? win.performance.now() : Date.now(); }

    function padIsTalking(key) {
      return key.indexOf("Gamepad") === 0 && now() - lastPadActivity < 400;
    }

    win.addEventListener("keydown", function (e) {
      var k = KEYS[e.key];
      if (!k) return;
      e.preventDefault();
      if (padIsTalking(e.key)) return;
      if (!e.repeat) keyPressed[k] = true;
      keyHeld[k] = true;
    });
    win.addEventListener("keyup", function (e) {
      var k = KEYS[e.key];
      if (!k) return;
      e.preventDefault();
      keyHeld[k] = false;
    });
    win.addEventListener("blur", function () { keyHeld = {}; });

    function readPad(gp) {
      var b = gp.buttons || [], ax = gp.axes || [];
      function on(i) { return !!(b[i] && (b[i].pressed || b[i].value > 0.5)); }
      var x = ax[0] || 0, y = ax[1] || 0;
      return {
        a: on(0), b: on(1), x: on(2), y: on(3), menu: on(9),
        left: on(14) || x < -DEAD_X, right: on(15) || x > DEAD_X,
        up: on(12) || y < -DEAD_Y, down: on(13) || y > DEAD_Y
      };
    }

    function anyDown(s) {
      for (var k in s) if (s[k]) return true;
      return false;
    }

    // Buttons already held when a pad first shows up (say, the A press that
    // opened this page from the launcher) must be let go before they count.
    function forget() {
      pads = {};
      keyHeld = {};
      keyPressed = {};
    }

    // frameTime: the requestAnimationFrame timestamp (same clock as
    // performance.now in browsers).
    function poll(frameTime) {
      var t = frameTime != null ? frameTime : now();
      var held = { left: !!keyHeld.left, right: !!keyHeld.right, up: !!keyHeld.up, down: !!keyHeld.down };
      var pressed = { a: false, b: false, x: false, y: false, menu: false, left: false, right: false, up: false, down: false };
      for (var k in keyPressed) if (keyPressed[k]) pressed[k] = true;
      keyPressed = {};
      if (clickQueued) { pressed.a = true; clickQueued = false; }

      var list = nav.getGamepads ? nav.getGamepads() : [];
      var seen = {};
      for (var i = 0; i < (list ? list.length : 0); i++) {
        var gp = list[i];
        if (!gp || gp.connected === false) continue;
        seen[gp.index] = true;
        var cur = readPad(gp);
        var st = pads[gp.index];
        if (!st) {
          st = pads[gp.index] = { prev: cur, blocked: {}, menuAt: -1 };
          for (var bk in cur) if (cur[bk]) st.blocked[bk] = true;
          continue;
        }
        if (anyDown(cur)) lastPadActivity = now();
        for (var name in cur) {
          if (!cur[name]) st.blocked[name] = false;
          if (st.blocked[name]) cur[name] = false;
        }
        ["a", "b", "x", "y"].forEach(function (n) { if (cur[n] && !st.prev[n]) pressed[n] = true; });
        if (cur.menu && !st.prev.menu) st.menuAt = t;
        if (!cur.menu && st.prev.menu && st.menuAt >= 0) {
          if (t - st.menuAt < MENU_TAP_MS) pressed.menu = true;
          st.menuAt = -1;
        }
        DIRS.forEach(function (d) {
          if (cur[d]) held[d] = true;
          if (cur[d] && !st.prev[d]) pressed[d] = true;
        });
        st.prev = cur;
      }
      for (var idx in pads) if (!seen[idx]) delete pads[idx];

      // Menu navigation repeats while a direction is held.
      var dir = null;
      DIRS.forEach(function (d) { if (held[d] && !dir) dir = d; });
      var repeatDir = null;
      if (!dir) repeat.dir = null;
      else if (dir !== repeat.dir) { repeat.dir = dir; repeat.next = t + FIRST_REPEAT; repeatDir = dir; }
      else if (t >= repeat.next) { repeat.next = t + NEXT_REPEAT; repeatDir = dir; }
      return { held: held, pressed: pressed, nav: repeatDir };
    }

    return {
      poll: poll,
      forget: forget,
      click: function () { clickQueued = true; }
    };
  }

  DDA.input = { create: create };
})();
