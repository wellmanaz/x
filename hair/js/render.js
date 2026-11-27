/* Hair Force One: drawing. Everything is drawn with canvas shapes made for
 * this game; there are no image files.
 * The screen is 960 x 540 logical pixels. The maze (25 x 21 tiles of 24px)
 * sits in the middle with score panels either side.
 */
(function () {
  "use strict";
  var HF = window.HF = window.HF || {};
  var E = HF.engine;
  var TILE = 24, FX = 180, FY = 18;
  var FONT = "'Segoe UI', 'Arial Black', Arial, sans-serif";
  var MONO = "Consolas, 'Lucida Console', 'Courier New', monospace";

  var THEMES = {
    tower: { bg: "#0d0b16", floor: "#16121f", floor2: "#1a1524", wall: "#ece6d8", wallDark: "#c6bca6", edge: "#d6a92c", door: "#f5d36b", ground: null, label: "#d6a92c" },
    golf: { bg: "#1d5a2a", floor: "#2a7a37", floor2: "#257031", wall: "#164a20", wallDark: "#0f3517", edge: "#6fc25a", door: "#ffffff", ground: "#e8d398", groundDot: "#cdb371", label: "#ffffff" },
    swamp: { bg: "#0d2622", floor: "#143631", floor2: "#173b35", wall: "#4a3a24", wallDark: "#33281a", edge: "#86a83c", door: "#c8e07a", ground: "#5c4229", groundDot: "#7a5a38", label: "#c8e07a" },
    rally: { bg: "#080c24", floor: "#0f1638", floor2: "#121a42", wall: "#1f3486", wallDark: "#16256a", edge: "#e8393a", door: "#ffffff", ground: null, label: "#ffffff" }
  };

  var CHASER_INFO = {
    subpoena: { name: "SUBPOENA", line: "Always right on your tail" },
    checker: { name: "FACT-CHECKER", line: "Cuts you off up ahead" },
    mic: { name: "HOT MIC", line: "Runs to every loud move" },
    auditor: { name: "AUDITOR", line: "Follows your paper trail" }
  };

  // ---------- helpers ----------

  function px(tx) { return FX + tx * TILE + TILE / 2; }
  function py(ty) { return FY + ty * TILE + TILE / 2; }

  function ellipse(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function circle(ctx, x, y, r, color) { ellipse(ctx, x, y, r, r, color); }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function text(ctx, s, x, y, size, color, align, weight, font) {
    ctx.font = (weight || "bold") + " " + size + "px " + (font || FONT);
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color || "#fff";
    ctx.fillText(s, x, y);
  }

  function outlined(ctx, s, x, y, size, color, align, stroke) {
    ctx.font = "900 " + size + "px " + FONT;
    ctx.textAlign = align || "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, size / 5);
    ctx.strokeStyle = stroke || "#120a04";
    ctx.strokeText(s, x, y);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  function pad(n, w) { var s = String(n); while (s.length < w) s = "0" + s; return s; }

  // ---------- the hero ----------
  // A big round orange head, pale patches round the eyes, pursed lips, a red
  // tie, and a huge blond swoop of hair that streams out behind in the wind.
  // look: 1 facing right, -1 facing left. flow: [dx, dy] of movement.
  // o: { talk, bigly, dying (0..1), scale }
  function hero(ctx, x, y, look, flow, t, o) {
    o = o || {};
    var s = (o.scale || 1) * (o.bigly ? 1.3 : 1);
    var moving = !!(flow && (flow[0] || flow[1]));
    var dying = o.dying || 0;
    ctx.save();
    ctx.translate(x, y);
    if (dying > 0) {
      ctx.rotate(dying * dying * 12);
      var shrink = 1 - Math.max(0, dying - 0.55) / 0.45;
      ctx.scale(Math.max(0.05, shrink), Math.max(0.05, shrink));
    }
    ctx.scale(s * look, s);

    // tie and collar
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(-5, 8); ctx.lineTo(0, 11); ctx.lineTo(5, 8); ctx.lineTo(4, 12); ctx.lineTo(-4, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d42a2a";
    ctx.beginPath(); ctx.moveTo(-1.6, 10); ctx.lineTo(1.6, 10); ctx.lineTo(1.2, 12); ctx.lineTo(2.4, 19); ctx.lineTo(0, 21.5); ctx.lineTo(-2.4, 19); ctx.lineTo(-1.2, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#a81c1c";
    ctx.fillRect(-1.6, 10, 3.2, 2);

    // ear at the back of the head
    ellipse(ctx, -8.6, 1.5, 2.2, 3.2, "#e98a3c");

    // face
    var face = ctx.createLinearGradient(0, -10, 0, 11);
    face.addColorStop(0, "#ffb15a");
    face.addColorStop(1, "#e47a30");
    ctx.fillStyle = face;
    ctx.beginPath(); ctx.ellipse(0.5, 1, 9.2, 10, 0, 0, Math.PI * 2); ctx.fill();
    // jowls
    ellipse(ctx, 4.5, 6.5, 4, 3, "#ec8a3a");

    // pale patches round the eyes
    ellipse(ctx, 1.8, -1.2, 3, 2.1, "#ffe2b6");
    ellipse(ctx, 7.2, -1.2, 2.4, 2, "#ffe2b6");

    // squinting eyes and blond brows
    ctx.strokeStyle = "#3a2410"; ctx.lineWidth = 1.3; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0.4, -1); ctx.lineTo(3.2, -1.2); ctx.moveTo(6, -1.2); ctx.lineTo(8.4, -1); ctx.stroke();
    ctx.strokeStyle = "#f4d36a"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-0.4, -4.2); ctx.lineTo(3.4, -3.4); ctx.moveTo(5.8, -3.4); ctx.lineTo(9, -4.2); ctx.stroke();

    // nose
    ellipse(ctx, 6.4, 2.2, 2, 1.6, "#f0903f");

    // pursed lips, opening and closing while he talks
    var open = o.talk ? (Math.sin(t * 22) > 0) : false;
    if (open) {
      ellipse(ctx, 5, 6, 2.7, 2.2, "#c2504a");
      ellipse(ctx, 5, 6, 1.6, 1.2, "#4a1410");
    } else {
      ellipse(ctx, 5, 6, 2.8, 1.4, "#c2504a");
      ellipse(ctx, 5, 5.9, 1.4, 0.5, "#8a2a24");
    }

    hair(ctx, flow, moving, t, o, dying);
    ctx.restore();
  }

  function hair(ctx, flow, moving, t, o, dying) {
    ctx.save();
    if (dying > 0) {
      // the hair takes off on its own
      ctx.translate(-dying * 6, -dying * 40);
      ctx.rotate(-dying * 2);
    }
    var wild = o.bigly ? 1.6 : 1;
    var wob = Math.sin(t * (moving ? 18 : 4));
    var lift = flow ? (flow[1] > 0 ? -1 : flow[1] < 0 ? 1 : 0) : 0;   // vertical streaming
    var reach = (moving ? 1 : 0.55) * wild;

    var light = "#fff0a0", mid = "#f5cf4a", dark = "#d9a326";

    // strands streaming out behind
    ctx.lineCap = "round";
    for (var k = 0; k < 5; k++) {
      var sy = -12 + k * 2.6;
      var ex = -11 - (6 + k * 1.5) * reach - wob * 1.5;
      var ey = sy - 2 + lift * (4 + k) * reach + Math.sin(t * 12 + k) * (moving ? 1.6 : 0.6);
      ctx.strokeStyle = k % 2 ? dark : mid;
      ctx.lineWidth = 3 - k * 0.3;
      ctx.beginPath();
      ctx.moveTo(-4, sy + 1);
      ctx.quadraticCurveTo(-9 - reach * 2, sy - 4 + lift * 2, ex, ey);
      ctx.stroke();
    }
    if (o.bigly) {
      ctx.strokeStyle = light; ctx.lineWidth = 1.6;
      for (var j = 0; j < 4; j++) {
        var a = -2.4 + j * 0.45 + wob * 0.05;
        ctx.beginPath();
        ctx.moveTo(-2, -12);
        ctx.lineTo(-2 + Math.cos(a) * 14, -12 + Math.sin(a) * 14);
        ctx.stroke();
      }
    }

    // the main swoop: from the back of the head, over the crown, and curling
    // down over the forehead at the front
    var gr = ctx.createLinearGradient(0, -16, 0, 0);
    gr.addColorStop(0, light);
    gr.addColorStop(0.55, mid);
    gr.addColorStop(1, dark);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(-9.5, 3);
    ctx.bezierCurveTo(-13.5, -4, -11, -14.5, -1, -15.5);
    ctx.bezierCurveTo(8, -16.5, 13.5, -11, 12.5, -5.5);
    ctx.bezierCurveTo(12, -2, 8.5, -2.6, 6.5, -4.6);
    ctx.bezierCurveTo(3, -7.4, -3, -6.6, -5.5, -2.5);
    ctx.bezierCurveTo(-6.5, -0.5, -8, 2, -9.5, 3);
    ctx.closePath();
    ctx.fill();
    // a few lines of texture combed toward the front
    ctx.strokeStyle = dark; ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(-8, -6); ctx.quadraticCurveTo(-2, -14, 9, -10);
    ctx.moveTo(-6, -3); ctx.quadraticCurveTo(0, -10, 10, -6.5);
    ctx.stroke();
    ctx.strokeStyle = light; ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-6, -11); ctx.quadraticCurveTo(1, -15, 8, -12.5);
    ctx.stroke();
    // the forward curl flips up a little when he runs
    ctx.fillStyle = mid;
    ctx.beginPath();
    ctx.moveTo(10, -7);
    ctx.quadraticCurveTo(15 + (moving ? wob : 0), -9 - (moving ? 1.5 : 0), 13, -3.5);
    ctx.quadraticCurveTo(12, -5, 10, -5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---------- the chasers ----------

  function eyes(ctx, x1, x2, y, r, lookX, lookY, angry) {
    circle(ctx, x1, y, r, "#fff");
    circle(ctx, x2, y, r, "#fff");
    circle(ctx, x1 + lookX * r * 0.45, y + lookY * r * 0.45, r * 0.5, "#111");
    circle(ctx, x2 + lookX * r * 0.45, y + lookY * r * 0.45, r * 0.5, "#111");
    if (angry) {
      ctx.strokeStyle = "#111"; ctx.lineWidth = 1.3; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x1 - r, y - r - 1.2); ctx.lineTo(x1 + r * 0.8, y - r + 0.6);
      ctx.moveTo(x2 + r, y - r - 1.2); ctx.lineTo(x2 - r * 0.8, y - r + 0.6);
      ctx.stroke();
    }
  }

  // pal: null for the normal colours, or the scared palette
  function subpoena(ctx, t, lx, ly, scared, walk) {
    var paper = scared ? scared.body : "#f4ecd4", roll = scared ? scared.dark : "#dccfaa";
    ctx.fillStyle = "#222";
    var step = Math.sin(walk * 20) * 1.6;
    ctx.fillRect(-4, 8, 2, 3 + step); ctx.fillRect(2, 8, 2, 3 - step);
    ctx.fillStyle = paper;
    ctx.fillRect(-7, -8, 14, 16);
    ellipse(ctx, 0, -8.5, 8.5, 2.6, roll);
    ellipse(ctx, 0, 8.5, 8.5, 2.6, roll);
    ctx.fillStyle = scared ? scared.dark : "#b9ad8c";
    ctx.fillRect(-5, 2, 8, 1); ctx.fillRect(-5, 4.5, 6, 1);
    if (!scared) circle(ctx, 4, 4.5, 2.6, "#c62828");
    eyes(ctx, -2.8, 2.8, -3, 2.4, lx, ly, !scared);
  }

  function checker(ctx, t, lx, ly, scared) {
    var rim = scared ? scared.dark : "#24324f";
    ctx.strokeStyle = scared ? scared.dark : "#6b4423"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(3.5, 3.5); ctx.lineTo(9, 10); ctx.stroke();
    circle(ctx, -1, -2, 8.5, rim);
    circle(ctx, -1, -2, 6.6, scared ? scared.body : "#d6ecff");
    // one big eye fills the lens
    circle(ctx, -1, -2, 4.8, "#fff");
    circle(ctx, -1 + lx * 2, -2 + ly * 2, 2.5, scared ? "#7a6fa8" : "#2a6fd6");
    circle(ctx, -1 + lx * 2.4, -2 + ly * 2.4, 1.2, "#111");
    if (!scared) {
      ctx.strokeStyle = "#e53935"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(6, -8); ctx.lineTo(10, -13); ctx.stroke();
    }
  }

  function mic(ctx, t, lx, ly, scared) {
    ctx.strokeStyle = "#222"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 11); ctx.quadraticCurveTo(-5 + Math.sin(t * 9) * 3, 14, -9, 11); ctx.stroke();
    ctx.fillStyle = "#1b1b1b"; ctx.fillRect(-2.2, 4, 4.4, 8);
    ctx.fillStyle = scared ? scared.dark : "#d32f2f";
    ctx.fillRect(-5, 0.5, 10, 5);
    ctx.fillStyle = "#fff"; ctx.fillRect(-5, 2.3, 10, 1.2);
    circle(ctx, 0, -5, 7, scared ? scared.body : "#a7b0ba");
    ctx.strokeStyle = scared ? scared.dark : "#78828d"; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (var i = -5; i <= 5; i += 2.5) { ctx.moveTo(i, -11.5); ctx.lineTo(i, 1.5); ctx.moveTo(-6.5, -5 + i); ctx.lineTo(6.5, -5 + i); }
    ctx.stroke();
    eyes(ctx, -2.6, 2.6, -6, 2.3, lx, ly, !scared);
    if (!scared && Math.sin(t * 6) > 0) circle(ctx, 6, -11, 1.6, "#ff3b3b");   // the red "live" light
  }

  function auditor(ctx, t, lx, ly, scared) {
    roundRect(ctx, -7.5, -8, 15, 18, 2.5);
    ctx.fillStyle = scared ? scared.body : "#3d6b49"; ctx.fill();
    ctx.fillStyle = scared ? "#e8e4ff" : "#c4ecb0";
    ctx.fillRect(-5.5, -5.5, 11, 6);
    // eyes in the display
    ctx.fillStyle = "#1d3a20";
    ctx.fillRect(-3.6 + lx * 1.2, -3.8 + ly, 2.2, 2.6);
    ctx.fillRect(1.4 + lx * 1.2, -3.8 + ly, 2.2, 2.6);
    ctx.fillStyle = scared ? scared.dark : "#9cc49a";
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) ctx.fillRect(-5 + c * 3.8, 2.4 + r * 2.4, 2.4, 1.6);
    // green eyeshade
    ctx.fillStyle = scared ? scared.dark : "rgba(40,190,90,0.9)";
    ctx.beginPath(); ctx.moveTo(-9, -8); ctx.lineTo(9, -8); ctx.lineTo(6, -11.5); ctx.lineTo(-6, -11.5); ctx.closePath(); ctx.fill();
  }

  var DRAW = { subpoena: subpoena, checker: checker, mic: mic, auditor: auditor };

  function chaser(ctx, c, g, t, scale) {
    var x = px(c.x), y = py(c.y);
    var p = g.player;
    var lx = 0, ly = 0;
    if (c.state === "chase" || c.state === "leave") {
      var dx = p.x - c.x, dy = p.y - c.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      lx = dx / d; ly = dy / d;
    } else if (c.state === "flee") { lx = c.dx; ly = c.dy; }
    ctx.save();
    ctx.translate(x, y);
    if (scale) ctx.scale(scale, scale);
    if (c.state === "fired") {
      // a pink slip flying back to D.C.
      ctx.rotate(Math.sin(t * 20) * 0.4);
      ctx.fillStyle = "#ff8fb4";
      ctx.fillRect(-7, -5, 14, 10);
      ctx.fillStyle = "#c2185b";
      ctx.fillRect(-5, -2.5, 10, 1.2); ctx.fillRect(-5, 0.5, 7, 1.2);
      ctx.restore();
      return;
    }
    if (c.state === "home") ctx.translate(0, Math.sin(t * 5 + c.id) * 1.5);
    var scared = null;
    if (c.state === "flee") {
      var flash = g.bigly < E.C.BIGLY_WARN && Math.floor(t * 6) % 2 === 0;
      scared = flash ? { body: "#ffffff", dark: "#b9b3d6" } : { body: "#c9c2ee", dark: "#8a82be" };
      ctx.translate(Math.sin(t * 40 + c.id) * 0.8, 0);
    }
    DRAW[c.kind](ctx, t + c.id, lx, ly, scared, c.t);
    if (scared) {
      // a nervous drop of sweat
      ctx.fillStyle = "#7fd0ff";
      ctx.beginPath(); ctx.moveTo(9, -11); ctx.quadraticCurveTo(12, -6, 9, -5); ctx.quadraticCurveTo(6, -6, 9, -11); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- pickups ----------

  function coin(ctx, x, y) {
    circle(ctx, x, y, 3.4, "#a87a12");
    circle(ctx, x - 0.3, y - 0.3, 2.8, "#ffd447");
    circle(ctx, x - 1, y - 1, 0.9, "#fff6c0");
  }

  function burger(ctx, x, y, t) {
    var b = 1 + Math.sin(t * 6) * 0.08;
    ctx.save(); ctx.translate(x, y); ctx.scale(b, b);
    ctx.fillStyle = "#e2a24a";
    ctx.beginPath(); ctx.ellipse(0, -2.5, 8, 5, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#fff3c4";
    for (var i = -1; i <= 1; i++) circle(ctx, i * 3, -5.2 + Math.abs(i), 0.6, "#fff3c4");
    ctx.fillStyle = "#5cb043"; ctx.fillRect(-8.5, -2.5, 17, 1.8);
    ctx.fillStyle = "#ffc928";
    ctx.beginPath(); ctx.moveTo(-8, -0.8); ctx.lineTo(8, -0.8); ctx.lineTo(5, 2); ctx.lineTo(2, -0.2); ctx.lineTo(-3, 2); ctx.closePath(); ctx.fill();
    roundRect(ctx, -8, 0.2, 16, 3.4, 1.6); ctx.fillStyle = "#6b3a1e"; ctx.fill();
    roundRect(ctx, -7.5, 3.6, 15, 3.4, 1.6); ctx.fillStyle = "#e2a24a"; ctx.fill();
    ctx.restore();
  }

  function bricksIcon(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s || 1, s || 1);
    ctx.fillStyle = "#b5402f";
    ctx.fillRect(-8, -1, 7.5, 4.5); ctx.fillRect(0.5, -1, 7.5, 4.5);
    ctx.fillRect(-4, -6, 7.5, 4.5);
    ctx.fillStyle = "#d86a4e";
    ctx.fillRect(-8, -1, 7.5, 1.2); ctx.fillRect(0.5, -1, 7.5, 1.2); ctx.fillRect(-4, -6, 7.5, 1.2);
    ctx.restore();
  }

  function bonusItem(ctx, kind, x, y, t) {
    ctx.save(); ctx.translate(x, y + Math.sin(t * 4) * 1.5);
    if (kind === "covfefe") {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(4.5, 8); ctx.lineTo(-4.5, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#7a4a26"; ctx.fillRect(-7, -8, 14, 3);
      ctx.fillStyle = "#b07a46"; ctx.fillRect(-5.4, -1, 10.8, 4);
      ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-2, -10); ctx.quadraticCurveTo(-4, -13, -2, -16); ctx.moveTo(2, -10); ctx.quadraticCurveTo(4, -13, 2, -16); ctx.stroke();
    } else if (kind === "trophy") {
      ctx.fillStyle = "#ffd447";
      ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(6, -8); ctx.quadraticCurveTo(6, 1, 0, 2); ctx.quadraticCurveTo(-6, 1, -6, -8); ctx.fill();
      ctx.strokeStyle = "#ffd447"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(-6, -4, 3, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(6, -4, 3, Math.PI * 1.5, Math.PI * 0.5); ctx.stroke();
      ctx.fillStyle = "#c99a1c"; ctx.fillRect(-1.2, 2, 2.4, 4); ctx.fillRect(-5, 6, 10, 3);
      circle(ctx, 0, -4, 1.8, "#fff");
    } else if (kind === "steak") {
      ellipse(ctx, 0, 0, 9, 6.5, "#6d3a22");
      ellipse(ctx, -1, -1, 7, 4.6, "#874a2b");
      ctx.strokeStyle = "#e0312b"; ctx.lineWidth = 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-6, -1); ctx.quadraticCurveTo(-3, -5, 0, -1); ctx.quadraticCurveTo(3, 3, 6, -1); ctx.stroke();
    } else {
      ctx.fillStyle = "#c9961c";
      ctx.fillRect(-9, 1, 9, 5); ctx.fillRect(0.5, 1, 9, 5); ctx.fillRect(-4.5, -5, 9, 5);
      ctx.fillStyle = "#ffd85a";
      ctx.fillRect(-9, 1, 9, 2); ctx.fillRect(0.5, 1, 9, 2); ctx.fillRect(-4.5, -5, 9, 2);
    }
    ctx.restore();
  }

  // ---------- the maze ----------

  function mazeLayer(ctx, g, th, t) {
    var m = g.maze, W = m.W, H = m.H;
    ctx.fillStyle = th.floor;
    ctx.fillRect(FX, FY, W * TILE, H * TILE);
    // floor stripes (fairways, carpet, water ripples)
    ctx.fillStyle = th.floor2;
    for (var r = 0; r < H; r += 2) ctx.fillRect(FX, FY + r * TILE, W * TILE, TILE);

    var y, x, i;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        i = y * W + x;
        var X = FX + x * TILE, Y = FY + y * TILE;
        if (m.sand[i] && th.ground) {
          roundRect(ctx, X + 1, Y + 1, TILE - 2, TILE - 2, 7);
          ctx.fillStyle = th.ground; ctx.fill();
          ctx.fillStyle = th.groundDot;
          ctx.fillRect(X + 6, Y + 7, 2, 2); ctx.fillRect(X + 15, Y + 14, 2, 2); ctx.fillRect(X + 9, Y + 17, 2, 2);
        }
        if (m.cell[i] === "home") {
          ctx.fillStyle = "rgba(255,255,255,0.06)";
          ctx.fillRect(X, Y, TILE, TILE);
        }
      }
    }

    // walls: a solid block, with a bright edge wherever it meets the floor
    var wall = function (x, y) { return x < 0 || y < 0 || x >= W || y >= H || m.cell[y * W + x] === "wall"; };
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        if (!wall(x, y)) continue;
        var X2 = FX + x * TILE, Y2 = FY + y * TILE;
        ctx.fillStyle = th.wall;
        ctx.fillRect(X2, Y2, TILE, TILE);
        ctx.fillStyle = th.wallDark;
        if (!wall(x, y + 1)) ctx.fillRect(X2, Y2 + TILE - 5, TILE, 5);
        ctx.fillStyle = th.edge;
        if (!wall(x, y - 1)) ctx.fillRect(X2, Y2, TILE, 2.5);
        if (!wall(x, y + 1)) ctx.fillRect(X2, Y2 + TILE - 2.5, TILE, 2.5);
        if (!wall(x - 1, y)) ctx.fillRect(X2, Y2, 2.5, TILE);
        if (!wall(x + 1, y)) ctx.fillRect(X2 + TILE - 2.5, Y2, 2.5, TILE);
      }
    }
    if (m.key === "rally") {
      // little white stars on the blue
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
        if (wall(x, y) && (x * 7 + y * 3) % 5 === 0) star(ctx, FX + x * TILE + 12, FY + y * TILE + 11, 3.2);
      }
    }

    // D.C. door and label
    if (m.door) {
      var dX = FX + m.door.x * TILE, dY = FY + m.door.y * TILE;
      ctx.fillStyle = th.bg;
      ctx.fillRect(dX, dY + 7, TILE, 10);
      ctx.fillStyle = th.door;
      ctx.fillRect(dX, dY + 10, TILE, 4);
      var hx = px(m.homeCentre.x), hy = py(m.homeCentre.y);
      text(ctx, "D.C.", hx, FY + (m.homeCentre.y + 1) * TILE + 15, 12, th.label, "center", "900");
      void hy;
    }

    // elevators
    for (var k in m.elevator) {
      i = Number(k);
      var ex = px(i % W), ey = py(Math.floor(i / W));
      var ready = g.player.lift <= 0;
      ctx.fillStyle = "#3b2c08";
      ctx.fillRect(ex - 9, ey - 10, 18, 20);
      ctx.strokeStyle = ready ? "#ffd447" : "#8a7430"; ctx.lineWidth = 2;
      ctx.strokeRect(ex - 9, ey - 10, 18, 20);
      ctx.beginPath(); ctx.moveTo(ex, ey - 10); ctx.lineTo(ex, ey + 10); ctx.stroke();
      ctx.fillStyle = ready ? (Math.sin(t * 5) > 0 ? "#ffe680" : "#ffd447") : "#8a7430";
      ctx.beginPath(); ctx.moveTo(ex - 5, ey - 3); ctx.lineTo(ex - 2, ey - 7); ctx.lineTo(ex + 1, ey - 3); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ex - 1, ey + 3); ctx.lineTo(ex + 2, ey + 7); ctx.lineTo(ex + 5, ey + 3); ctx.closePath(); ctx.fill();
    }
  }

  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
      if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  function builtWall(ctx, w, t) {
    var X = FX + w.x * TILE, Y = FY + w.y * TILE;
    if (w.t < 1.5 && Math.floor(t * 8) % 2 === 0) ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#8e2f22";
    ctx.fillRect(X + 1, Y + 1, TILE - 2, TILE - 2);
    ctx.fillStyle = "#c44a35";
    for (var r = 0; r < 4; r++) {
      var off = r % 2 ? 0 : 5;
      for (var c = -1; c < 3; c++) {
        var bx = X + 2 + off + c * 10, by = Y + 2 + r * 5.5;
        var x0 = Math.max(X + 2, bx), x1 = Math.min(X + TILE - 2, bx + 9);
        if (x1 > x0) ctx.fillRect(x0, by, x1 - x0, 4.5);
      }
    }
    // cracks as it wears out
    var wear = 1 - w.t / w.life;
    if (wear > 0.5) {
      ctx.strokeStyle = "#3a120c"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(X + 6, Y + 3); ctx.lineTo(X + 11, Y + 10); ctx.lineTo(X + 8, Y + 16);
      if (wear > 0.75) { ctx.moveTo(X + 18, Y + 6); ctx.lineTo(X + 14, Y + 13); ctx.lineTo(X + 18, Y + 21); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ---------- HUD ----------

  function badge(ctx, label, x, y, color) {
    circle(ctx, x, y, 12, color);
    text(ctx, label, x, y + 5, 14, "#fff", "center", "bold");
  }

  function hud(ctx, g, info, t) {
    var th = THEMES[g.maze.key] || THEMES.tower;
    ctx.fillStyle = "#090a12";
    ctx.fillRect(0, 0, FX - 6, 540);
    ctx.fillRect(FX + 25 * TILE + 6, 0, 960 - (FX + 25 * TILE + 6), 540);

    outlined(ctx, "HAIR", 87, 50, 34, "#ffd447");
    outlined(ctx, "FORCE ONE", 87, 80, 22, "#ff5a4e");

    text(ctx, "SCORE", 20, 128, 15, "#8f95b2");
    text(ctx, pad(g.score, 6), 20, 156, 28, "#fff", "left", "bold", MONO);
    text(ctx, "HIGH", 20, 194, 15, "#8f95b2");
    text(ctx, pad(Math.max(info.hi || 0, g.score), 6), 20, 222, 28, "#ffd447", "left", "bold", MONO);
    text(ctx, "STAGE " + (g.stageNum + 1), 20, 268, 20, "#fff");
    text(ctx, g.maze.name.toUpperCase(), 20, 292, 15, th.edge === "#d6a92c" ? "#ffd447" : th.edge);
    text(ctx, "GOLD LEFT", 20, 330, 15, "#8f95b2");
    text(ctx, String(g.coinsLeft), 20, 356, 24, "#ffd447", "left", "bold", MONO);

    text(ctx, "LIVES", 20, 398, 15, "#8f95b2");
    for (var i = 0; i < Math.min(g.lives, 5); i++) hero(ctx, 32 + i * 28, 430, 1, null, t, { scale: 0.62 });

    // right panel
    var rx = FX + 25 * TILE + 22;
    text(ctx, "BRICKS", rx, 40, 15, "#8f95b2");
    for (var b = 0; b < E.C.MAX_BRICKS; b++) {
      var bx = rx + 12 + (b % 3) * 26, by = 66 + Math.floor(b / 3) * 22;
      ctx.globalAlpha = b < g.bricks ? 1 : 0.18;
      bricksIcon(ctx, bx, by, 1);
      ctx.globalAlpha = 1;
    }
    badge(ctx, "A", rx + 10, 124, "#3aa53a");
    text(ctx, "build a wall", rx + 28, 129, 15, "#fff", "left", "normal");
    text(ctx, "behind you", rx + 28, 147, 15, "#cfd3ea", "left", "normal");

    if (g.bigly > 0) {
      var warn = g.bigly < E.C.BIGLY_WARN;
      if (!warn || Math.floor(t * 6) % 2 === 0) outlined(ctx, "BIGLY!", rx + 70, 196, 30, "#ffd447", "center", "#7a1010");
      ctx.fillStyle = "#2a2440"; ctx.fillRect(rx, 206, 140, 10);
      ctx.fillStyle = warn ? "#ff5a4e" : "#ffd447";
      ctx.fillRect(rx, 206, 140 * Math.min(1, g.bigly / E.tuning(g).bigly), 10);
    }

    text(ctx, "WHO'S CHASING", rx, 250, 15, "#8f95b2");
    var y0 = 280;
    E.CHASERS.forEach(function (k, n) {
      var cy = y0 + n * 52;
      ctx.save(); ctx.translate(rx + 12, cy); ctx.scale(0.95, 0.95);
      DRAW[k](ctx, t + n, 1, 0, null, t);
      ctx.restore();
      text(ctx, CHASER_INFO[k].name, rx + 30, cy - 2, 13, "#fff");
      text(ctx, CHASER_INFO[k].line, rx + 30, cy + 15, 11, "#a9aecb", "left", "normal");
    });
    text(ctx, "Menu / B: pause", rx, 520, 13, "#8f95b2", "left", "normal");
  }

  // ---------- the play field ----------

  function field(ctx, g, info, t) {
    var th = THEMES[g.maze.key] || THEMES.tower, m = g.maze;
    ctx.fillStyle = th.bg;
    ctx.fillRect(FX - 6, 0, 25 * TILE + 12, 540);
    mazeLayer(ctx, g, th, t);

    // gold, burgers and the brick pile
    for (var i = 0; i < m.item.length; i++) {
      var it = m.item[i];
      if (!it) continue;
      var x = px(i % m.W), y = py(Math.floor(i / m.W));
      if (it === 1) coin(ctx, x, y);
      else if (it === 2) burger(ctx, x, y, t);
      else bricksIcon(ctx, x, y + 3, 1);
    }
    if (g.bonus && (g.bonus.t > 2 || Math.floor(t * 8) % 2 === 0)) bonusItem(ctx, g.bonus.kind, px(g.bonus.x), py(g.bonus.y), t);

    g.walls.forEach(function (w) { builtWall(ctx, w, t); });

    // where a wall would go right now
    if (g.mode === "play" && g.bricks > 0 && g.walls.length < E.C.MAX_WALLS) {
      var spot = E.wallSpot(g);
      if (spot) {
        ctx.strokeStyle = "rgba(255,140,110,0.45)"; ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(FX + spot.x * TILE + 3, FY + spot.y * TILE + 3, TILE - 6, TILE - 6);
        ctx.setLineDash([]);
      }
    }

    if (g.mode !== "dying" || g.modeT < 0.35) {
      g.chasers.forEach(function (c) { chaser(ctx, c, g, t); });
    }

    var p = g.player;
    var look = p.look || 1;
    var dying = g.mode === "dying" ? Math.min(1, Math.max(0, (g.modeT - 0.35) / (E.C.DYING_TIME - 0.6))) : 0;
    if (g.mode !== "over") {
      hero(ctx, px(p.x), py(p.y) - 1, look, p.moving ? [p.dx, p.dy] : null, t, {
        talk: p.moving && g.mode === "play", bigly: g.bigly > 0, dying: dying
      });
    }

    (info.popups || []).forEach(function (q) {
      ctx.globalAlpha = Math.min(1, q.t * 2);
      var yy = py(q.y) - 14 - (1.2 - q.t) * 16;
      if (q.label) outlined(ctx, q.label, Math.min(FX + 25 * TILE - 70, Math.max(FX + 70, px(q.x))), yy - 16, 15, "#ff5a4e", "center", "#fff");
      outlined(ctx, String(q.text), px(q.x), yy, 14, q.color || "#fff");
      ctx.globalAlpha = 1;
    });

    var cx = FX + 25 * TILE / 2;
    if (g.mode === "ready") {
      banner(ctx, cx, 270, m.name.toUpperCase(), m.tip, th);
    } else if (g.mode === "clear") {
      outlined(ctx, "ALL THE GOLD!", cx, 262, 40, "#ffd447");
      text(ctx, "Next stop coming up", cx, 292, 18, "#fff", "center");
      for (var c = 0; c < 18; c++) {
        var bx = FX + (c * 61 + t * 50) % 600, by = ((t * 140 + c * 83) % 560) - 20;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(t * 4 + c);
        ctx.fillStyle = c % 3 === 0 ? "#ffd447" : c % 3 === 1 ? "#ff5a4e" : "#ffffff";
        ctx.fillRect(-4, -2, 8, 4);
        ctx.restore();
      }
    }
  }

  function banner(ctx, x, y, title, tip, th) {
    ctx.fillStyle = "rgba(5,5,12,0.78)";
    roundRect(ctx, x - 230, y - 44, 460, 82, 12); ctx.fill();
    ctx.strokeStyle = th.edge; ctx.lineWidth = 2; ctx.stroke();
    outlined(ctx, title, x, y - 6, 32, "#ffd447");
    text(ctx, tip, x, y + 24, 16, "#e9ebf7", "center", "normal");
  }

  function frame(ctx, g, info, t) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 960, 540);
    field(ctx, g, info, t);
    hud(ctx, g, info, t);
  }

  // ---------- title and menus ----------

  function title(ctx, info, t) {
    var bg = ctx.createLinearGradient(0, 0, 0, 540);
    bg.addColorStop(0, "#141a44"); bg.addColorStop(1, "#05060f");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 960, 540);
    // stage spotlights
    for (var s = 0; s < 3; s++) {
      var sx = 180 + s * 300 + Math.sin(t * 0.7 + s * 2) * 60;
      var gr = ctx.createRadialGradient(sx, 540, 10, sx, 300, 420);
      gr.addColorStop(0, "rgba(255,240,190,0.18)"); gr.addColorStop(1, "rgba(255,240,190,0)");
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(sx - 40, 540); ctx.lineTo(sx - 200, 0); ctx.lineTo(sx + 200, 0); ctx.lineTo(sx + 40, 540); ctx.fill();
    }
    // a row of gold coins
    for (var i = 0; i < 18; i++) coin(ctx, 60 + i * 50, 470);

    // the hero, big, hair in a gale
    hero(ctx, 250, 230, 1, [1, 0], t, { scale: 7.2, talk: Math.floor(t / 1.5) % 2 === 0 });

    outlined(ctx, "HAIR", 690, 112, 96, "#ffd447");
    outlined(ctx, "FORCE ONE", 690, 184, 60, "#ff5a4e");
    text(ctx, "Grab the gold. Dodge the paperwork.", 690, 220, 20, "#e8ebff", "center", "normal");

    if (!info.menuOpen) {
      if (Math.floor(t * 2) % 2 === 0) outlined(ctx, "Press A to start", 690, 282, 32, "#fff");
      text(ctx, "HIGH SCORE " + pad(info.hi || 0, 6), 690, 318, 20, "#ffd447", "center", "bold", MONO);
      // how to play
      var y = 360;
      burger(ctx, 520, y - 6, t); text(ctx, "Cheeseburger: go BIGLY and fire them all", 540, y, 16, "#fff", "left", "normal");
      bricksIcon(ctx, 520, y + 26, 1); text(ctx, "A: drop a brick wall behind you", 540, y + 30, 16, "#fff", "left", "normal");
      coin(ctx, 520, y + 54); text(ctx, "Pick up every gold coin to clear a stage", 540, y + 60, 16, "#fff", "left", "normal");
      text(ctx, "Menu: settings     B: back to games", 480, 512, 18, "#c9cde6", "center", "normal");
      text(ctx, "Controller not responding? Hold the Menu button and pick “Use game controls”.", 480, 532, 13, "#8a8fae", "center", "normal");
    }
  }

  function menu(ctx, m) {
    ctx.fillStyle = "rgba(0,0,0,0.66)";
    ctx.fillRect(0, 0, 960, 540);
    var w = 480, rowH = 52, h = 110 + m.rows.length * rowH;
    var x = 480 - w / 2, y = 270 - h / 2;
    ctx.fillStyle = "#121633"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#ffd447"; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
    outlined(ctx, m.title, 480, y + 50, 32, "#ffd447");
    m.rows.forEach(function (r, i) {
      var ry = y + 82 + i * rowH;
      var sel = i === m.index;
      if (sel) {
        ctx.fillStyle = "#2a3168"; ctx.fillRect(x + 16, ry, w - 32, rowH - 8);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(x + 16, ry, w - 32, rowH - 8);
      }
      text(ctx, r.label, x + 36, ry + 30, 22, sel ? "#fff" : "#c9cde6");
      if (r.value != null) text(ctx, "◀ " + r.value + " ▶", x + w - 36, ry + 30, 22, sel ? "#ffd447" : "#c9cde6", "right");
    });
    text(ctx, m.hint || "A: choose   B: back", 480, y + h - 14, 16, "#8a8fae", "center", "normal");
  }

  function gameOver(ctx, info) {
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(0, 0, 960, 540);
    outlined(ctx, "GAME OVER", 480, 190, 64, "#ff5a4e");
    text(ctx, "SCORE " + pad(info.score, 6), 480, 260, 30, "#fff", "center", "bold", MONO);
    if (info.newHigh) outlined(ctx, "NEW HIGH SCORE!", 480, 306, 30, "#ffd447");
    else text(ctx, "HIGH " + pad(info.hi, 6), 480, 300, 24, "#ffd447", "center", "bold", MONO);
    text(ctx, "A: play again     B: title", 480, 400, 24, "#c9cde6", "center");
  }

  HF.render = {
    TILE: TILE, FX: FX, FY: FY, THEMES: THEMES,
    frame: frame, title: title, menu: menu, gameOver: gameOver, hero: hero
  };
})();
