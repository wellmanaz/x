/* Damn Dirty Apes: drawing. Everything is drawn with canvas shapes and
 * small pixel maps made for this game; there are no image files.
 * The screen is 960 x 540 logical pixels; the play field (480 x 540)
 * sits in the middle with score panels either side.
 */
(function () {
  "use strict";
  var DDA = window.DDA = window.DDA || {};
  var E = DDA.engine;
  var FIELD_X = 240;
  var FONT = "Consolas, 'Lucida Console', 'Courier New', monospace";
  var PS = 1.5;            // ranger pixel size
  var BOSS_SCALE = 1.2;

  var THEMES = {
    canopy: { sky: ["#24503a", "#0d2117"], far: "#173a27", near: "#102c1d", deck: "#8cc152", deckDark: "#4f7f2a", deckUnder: "#35561d", detail: "nodes" },
    temple: { sky: ["#f29a52", "#5b2a4c"], far: "#7a3d4a", near: "#4b2236", deck: "#c2b49a", deckDark: "#8c8070", deckUnder: "#5b5246", detail: "blocks" },
    bridges: { sky: ["#2b6670", "#0b2327"], far: "#1d4c52", near: "#12353a", deck: "#b77c45", deckDark: "#7a4f28", deckUnder: "#55361c", detail: "planks" },
    falls: { sky: ["#18406b", "#060f1c"], far: "#163556", near: "#0d2440", deck: "#7d8a99", deckDark: "#556170", deckUnder: "#3a434f", detail: "rock" }
  };

  // ---------- pixel sprites ----------

  var RANGER_PAL = { h: "#a06a34", b: "#3f2814", s: "#f0bf8c", e: "#1b1b1b", k: "#cdb46c", p: "#a88f4c", w: "#ffd34a", d: "#6c4f2c", o: "#3a2414" };
  var HEAD = [
    ".....hhhh.....",
    "....hhhhhh....",
    "....hbbbbh....",
    "..hhhhhhhhhh..",
    ".....ssss.....",
    ".....ssse.....",
    ".....ssss.....",
    "......ss......"
  ];
  var BODY = [
    "....kkkkkk....",
    "...kkkkwkkk...",
    "...kkkkkkkk...",
    "..skkpkkpkks..",
    "..s.kkkkkk.s..",
    "..s.kkkkkk.s..",
    "....dddddd....",
    "....dddddd...."
  ];
  var LEGS_STAND = [
    "....dd..dd....",
    "....ss..ss....",
    "....ss..ss....",
    "....ss..ss....",
    "...ooo..ooo...",
    "...ooo..ooo..."
  ];
  var LEGS_WALK = [
    "...dd....dd...",
    "...ss....ss...",
    "..ss......ss..",
    "..ss......ss..",
    ".ooo......ooo.",
    ".ooo......ooo."
  ];
  var LEGS_JUMP = [
    "...ss....ss...",
    "...ss....ss...",
    "..ooo....ooo..",
    "..ooo....ooo..",
    "..............",
    ".............."
  ];
  var BODY_JUMP = [
    ".s..kkkkkk..s.",
    ".s.kkkkwkkk.s.",
    "..skkkkkkkks..",
    "....kkpkkp....",
    "....kkkkkk....",
    "....kkkkkk....",
    "....dddddd....",
    "....dddddd...."
  ];
  var CLIMB = [
    ".....hhhh.....",
    "....hhhhhh....",
    "....hbbbbh....",
    "..hhhhhhhhhh..",
    "..s..ssss.....",
    "..s..ssss.....",
    "..s..ssss..s..",
    "..s...ss...s..",
    "..kkkkkkkkkk..",
    "...kkkkkkkks..",
    "...kkkkkkkk...",
    "....kkkkkk....",
    "....kkkkkk....",
    "....kkkkkk....",
    "....dddddd....",
    "....dddddd....",
    "....dd..dd....",
    "....ss..ss....",
    "....ss...ss...",
    "....ss...ss...",
    "...ooo...ooo..",
    "...ooo........"
  ];
  var FRAMES = {
    stand: HEAD.concat(BODY, LEGS_STAND),
    walk: HEAD.concat(BODY, LEGS_WALK),
    jump: HEAD.concat(BODY_JUMP, LEGS_JUMP),
    climb: CLIMB
  };

  function sprite(ctx, rows, pal, x, y, flip, scale) {
    scale = scale || 1;
    var w = rows[0].length, h = rows.length;
    var ox = Math.round(x - (w * scale) / 2), oy = Math.round(y - h * scale);
    for (var r = 0; r < h; r++) {
      var row = rows[r];
      for (var c = 0; c < w; c++) {
        var ch = row[flip ? w - 1 - c : c];
        if (ch === ".") continue;
        ctx.fillStyle = pal[ch];
        ctx.fillRect(ox + c * scale, oy + r * scale, scale, scale);
      }
    }
  }

  // ---------- shapes ----------

  function ellipse(ctx, x, y, rx, ry, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function circle(ctx, x, y, r, color) { ellipse(ctx, x, y, r, r, color); }

  // An ape: s = scale (1 = troop boss), pose: "idle" | "pound" | "throw" | "walk" | "sit"
  function ape(ctx, x, y, s, pose, dir, t, opts) {
    opts = opts || {};
    var fur = opts.fur || "#5a3a28", dark = opts.dark || "#3a2418", face = opts.face || "#caa07a";
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * (dir < 0 ? -1 : 1), s);
    // legs
    ellipse(ctx, -9, -6, 7, 6, dark);
    ellipse(ctx, 9, -6, 7, 6, dark);
    // tail (small apes only)
    if (opts.tail) {
      ctx.strokeStyle = fur; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-12, -12); ctx.quadraticCurveTo(-26, -14, -22, -28 + Math.sin(t * 6) * 3); ctx.stroke();
    }
    // body
    ellipse(ctx, 0, -22, 18, 17, fur);
    ellipse(ctx, 0, -19, 10, 11, "#9a7656");
    // arms
    var lUp = false, rUp = false;
    if (pose === "pound") { var ph = Math.floor(t * 6) % 2; lUp = ph === 0; rUp = ph === 1; }
    if (pose === "throw") rUp = true;
    function arm(side, up) {
      ctx.save();
      ctx.translate(side * 15, -30);
      ctx.rotate(side * (up ? -2.3 : -0.25));
      ellipse(ctx, 0, 10, 6, 12, fur);
      circle(ctx, 0, 21, 5, dark);
      ctx.restore();
    }
    if (pose === "walk") {
      var sw = Math.sin(t * 10) * 0.5;
      ctx.save(); ctx.translate(-14, -28); ctx.rotate(0.2 + sw); ellipse(ctx, 0, 10, 5, 11, fur); ctx.restore();
      ctx.save(); ctx.translate(14, -28); ctx.rotate(-0.2 - sw); ellipse(ctx, 0, 10, 5, 11, fur); ctx.restore();
    } else {
      arm(-1, lUp);
      arm(1, rUp);
    }
    if (pose === "throw" && opts.holding) {
      circle(ctx, 22, -54, 7, opts.holding === "durian" ? "#8fb33a" : "#6b4423");
    }
    // head
    circle(ctx, -12, -45, 5, fur);
    circle(ctx, 12, -45, 5, fur);
    circle(ctx, 0, -46, 13, fur);
    ellipse(ctx, 2, -42, 9, 8, face);
    // brow
    ctx.fillStyle = dark;
    ctx.fillRect(-8, -52, 18, 4);
    // eyes
    circle(ctx, -2, -47, 2.2, "#fff");
    circle(ctx, 6, -47, 2.2, "#fff");
    circle(ctx, -1.5, -47, 1.1, "#111");
    circle(ctx, 6.5, -47, 1.1, "#111");
    // nostrils and mouth
    circle(ctx, 1, -41, 0.9, dark);
    circle(ctx, 4, -41, 0.9, dark);
    ctx.fillStyle = dark;
    ctx.fillRect(-2, -37, 9, 1.5);
    // bandana (the troop boss wears a red one)
    if (opts.bandana) {
      ctx.fillStyle = "#d33a2c";
      ctx.fillRect(-13, -58, 26, 5);
      ctx.beginPath(); ctx.moveTo(-13, -57); ctx.lineTo(-22, -60); ctx.lineTo(-20, -52); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function coconut(ctx, x, y, rot) {
    var cy = y - 8;
    circle(ctx, x, cy, 8, "#6b4423");
    ctx.strokeStyle = "#4a2d15"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, cy, 5.6, rot, rot + 2); ctx.stroke();
    for (var i = 0; i < 3; i++) {
      var a = rot + i * 2.09;
      circle(ctx, x + Math.cos(a) * 3.4, cy + Math.sin(a) * 3.4, 1.4, "#2c180a");
    }
    circle(ctx, x - 3, cy - 4, 1.6, "#9a6a3e");
  }

  function durian(ctx, x, y, rot) {
    var cy = y - 9;
    ctx.fillStyle = "#c9dc6c";
    for (var i = 0; i < 10; i++) {
      var a = rot + i * Math.PI / 5;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 13, cy + Math.sin(a) * 13);
      ctx.lineTo(x + Math.cos(a + 0.3) * 8, cy + Math.sin(a + 0.3) * 8);
      ctx.lineTo(x + Math.cos(a - 0.3) * 8, cy + Math.sin(a - 0.3) * 8);
      ctx.fill();
    }
    circle(ctx, x, cy, 9, "#8fb33a");
    circle(ctx, x - 3, cy - 3, 2.5, "#b5d15a");
  }

  function net(ctx, x, y, facing, swing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.rotate(swing);
    ctx.strokeStyle = "#8b5a2b"; ctx.lineWidth = 2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(10, -10); ctx.stroke();
    ctx.strokeStyle = "#f2f2f2"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(15, -15, 6, 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "rgba(240,240,240,0.7)"; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(10, -15); ctx.lineTo(20, -15);
    ctx.moveTo(15, -20); ctx.lineTo(15, -10);
    ctx.moveTo(11, -19); ctx.lineTo(19, -11);
    ctx.stroke();
    ctx.restore();
  }

  function fruit(ctx, kind, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.4, 1.4);
    fruitShape(ctx, kind, 0, 0, t + x);
    ctx.restore();
  }

  function fruitShape(ctx, kind, x, y, t) {
    var bob = Math.sin(t * 3) * 1.5;
    y = y - 4 + bob;
    if (kind === "banana") {
      ctx.strokeStyle = "#ffd94a"; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(x, y - 12, 8, 0.4, 2.6); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 3, y - 13, 8, 0.4, 2.4); ctx.stroke();
      ctx.fillStyle = "#6b4a1e"; ctx.fillRect(x + 7, y - 12, 2, 3);
    } else if (kind === "pineapple") {
      ellipse(ctx, x, y - 7, 6, 8, "#e5a12a");
      ctx.strokeStyle = "#a8661a"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 11); ctx.lineTo(x + 3, y - 2);
      ctx.moveTo(x - 3, y - 14); ctx.lineTo(x + 5, y - 5);
      ctx.moveTo(x + 5, y - 11); ctx.lineTo(x - 3, y - 2);
      ctx.moveTo(x + 3, y - 14); ctx.lineTo(x - 5, y - 5);
      ctx.stroke();
      ctx.fillStyle = "#3f9a3a";
      ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x - 5, y - 22); ctx.lineTo(x, y - 17); ctx.lineTo(x + 5, y - 22); ctx.closePath(); ctx.fill();
    } else if (kind === "mango") {
      ellipse(ctx, x, y - 7, 7, 6, "#f07a2a");
      ellipse(ctx, x - 2, y - 9, 3, 2, "#ffb04a");
      ellipse(ctx, x + 4, y - 14, 4, 2, "#3f9a3a");
    } else if (kind === "net") {
      net(ctx, x - 6, y, 1, Math.sin(t * 2) * 0.15);
    }
  }

  function crate(ctx, x, y, t) {
    var w = 28, h = 20, l = x - w / 2, top = y - h;
    ctx.fillStyle = "#9a6331"; ctx.fillRect(l, top, w, h);
    ctx.fillStyle = "#6e431d";
    ctx.fillRect(l, top, w, 2); ctx.fillRect(l, y - 2, w, 2);
    ctx.fillRect(l, top, 2, h); ctx.fillRect(l + w - 2, top, 2, h);
    ctx.fillRect(l + 2, top + 9, w - 4, 2);
    // banana painted on the side
    ctx.strokeStyle = "#ffd94a"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(x, top + 4, 7, 0.6, 2.5); ctx.stroke();
    // bananas peeking out of the top
    ctx.strokeStyle = "#ffe066"; ctx.lineWidth = 3;
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(x + i * 7, top + 2, 5, 3.6, 5.6); ctx.stroke();
    }
    // a little glow so it reads as the goal
    var a = 0.25 + 0.2 * Math.sin(t * 4);
    ctx.strokeStyle = "rgba(255,230,90," + a.toFixed(2) + ")"; ctx.lineWidth = 2;
    ctx.strokeRect(l - 3, top - 8, w + 6, h + 10);
  }

  // ---------- stage pieces ----------

  function background(ctx, theme, key, t) {
    var g = ctx.createLinearGradient(0, 0, 0, E.C.H);
    g.addColorStop(0, theme.sky[0]);
    g.addColorStop(1, theme.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, E.C.W, E.C.H);
    var i;
    if (key === "canopy") {
      circle(ctx, 70, 60, 22, "rgba(255,250,220,0.85)");
      for (i = 0; i < 9; i++) {
        var tx = i * 60 + 10;
        ctx.fillStyle = theme.far;
        ctx.fillRect(tx, 120, 10, 420);
        circle(ctx, tx + 5, 120, 34, theme.far);
      }
      for (i = 0; i < 6; i++) circle(ctx, i * 96 + 30, 530, 46, theme.near);
    } else if (key === "temple") {
      circle(ctx, 380, 120, 40, "rgba(255,220,150,0.8)");
      ctx.fillStyle = theme.far;
      for (i = 0; i < 6; i++) ctx.fillRect(40 + i * 20, 470 - i * 70, 400 - i * 40, 70);
      ctx.fillStyle = theme.near;
      for (i = 0; i < 7; i++) circle(ctx, i * 80, 540, 50, theme.near);
    } else if (key === "bridges") {
      for (i = 0; i < 26; i++) {
        var mx = (i * 37) % 480, my = (i * 53) % 300 + 40;
        ctx.fillStyle = "rgba(200,240,240,0.05)";
        ctx.fillRect(mx, my, 60, 6);
      }
      ctx.fillStyle = theme.near;
      ctx.fillRect(-4, 0, 22, 540); ctx.fillRect(462, 0, 22, 540);
      ctx.fillStyle = theme.far;
      ctx.fillRect(196, 0, 30, 540);
    } else if (key === "falls") {
      for (i = 0; i < 30; i++) circle(ctx, (i * 71) % 480, (i * 37) % 180 + 10, 1, "rgba(255,255,255,0.7)");
      ctx.fillStyle = "#2a6aa8";
      ctx.fillRect(196, 0, 88, 540);
      ctx.fillStyle = "rgba(170,220,255,0.55)";
      for (i = 0; i < 14; i++) {
        var sx = 200 + (i * 13) % 80, sy = ((t * 160 + i * 61) % 600) - 60;
        ctx.fillRect(sx, sy, 3, 40);
      }
      ctx.fillStyle = theme.near;
      for (i = 0; i < 6; i++) circle(ctx, i * 96 + 20, 540, 40, theme.near);
    }
  }

  function deck(ctx, p, theme, t) {
    var x1 = p.x1, y1 = p.y1, x2 = p.x2, y2 = p.y2;
    var shake = 0;
    if (p.crumble && p.gone) {
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    if (p.crumble && p.t >= 0) shake = Math.sin(t * 60) * 1.2;
    var top = p.crumble ? "#9c8a74" : theme.deck;
    var under = p.crumble ? "#6a5a48" : theme.deckUnder;
    ctx.save();
    ctx.translate(shake, 0);
    ctx.fillStyle = under;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 + 8); ctx.lineTo(x1, y1 + 8); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 + 4); ctx.lineTo(x1, y1 + 4); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = theme.deckDark;
    var len = x2 - x1, x, y;
    if (p.crumble) {
      ctx.strokeStyle = "#4a3c2e"; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1 + 4, y1 + 1); ctx.lineTo(x1 + 9, y1 + 5); ctx.lineTo(x1 + 14, y1 + 2); ctx.lineTo(x1 + 19, y1 + 7);
      ctx.stroke();
    } else if (theme.detail === "nodes") {
      for (x = x1 + 12; x < x2; x += 24) { y = y1 + (x - x1) * (y2 - y1) / len; ctx.fillRect(x, y, 2, 8); }
    } else if (theme.detail === "blocks") {
      for (x = x1 + 10; x < x2; x += 20) { y = y1 + (x - x1) * (y2 - y1) / len; ctx.fillRect(x, y + 4, 1.5, 4); }
    } else if (theme.detail === "planks") {
      for (x = x1 + 6; x < x2; x += 8) { y = y1 + (x - x1) * (y2 - y1) / len; ctx.fillRect(x, y, 1, 8); }
      ctx.strokeStyle = "#e0c58e"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x1, y1 - 7); ctx.lineTo(x2, y2 - 7); ctx.stroke();
      for (x = x1 + 2; x < x2; x += 24) { y = y1 + (x - x1) * (y2 - y1) / len; ctx.fillRect(x, y - 7, 1, 7); }
    } else {
      for (x = x1 + 7; x < x2; x += 15) { y = y1 + (x - x1) * (y2 - y1) / len; ctx.fillRect(x, y + 2, 4, 2); }
    }
    ctx.restore();
  }

  function vine(ctx, v, t) {
    ctx.strokeStyle = "#3c8f3a"; ctx.lineWidth = 3; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(v.x, v.top);
    for (var y = v.top; y <= v.bottom; y += 6) {
      ctx.lineTo(v.x + Math.sin(y * 0.25 + t * 0.8) * 2, y);
    }
    ctx.lineTo(v.x, v.bottom);
    ctx.stroke();
    ctx.fillStyle = "#6fcf5f";
    for (var ly = v.top + 8; ly < v.bottom - 4; ly += 14) {
      var side = (Math.floor(ly / 14) % 2) ? 1 : -1;
      ctx.beginPath();
      ctx.ellipse(v.x + side * 4, ly, 4, 2, side * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function perch(ctx, st, theme) {
    var b = st.boss;
    ctx.fillStyle = theme.deckUnder;
    ctx.fillRect(b.perch[0], b.y, b.perch[1] - b.perch[0], 8);
    ctx.fillStyle = theme.deck;
    ctx.fillRect(b.perch[0], b.y, b.perch[1] - b.perch[0], 4);
  }

  function player(ctx, g, t) {
    var p = g.player;
    var flip = p.facing < 0;
    var frame;
    if (p.state === "climb") {
      frame = FRAMES.climb;
      flip = Math.floor(p.climbT * 7) % 2 === 1;
    } else if (p.state === "jump" || p.state === "fall") frame = FRAMES.jump;
    else if (p.walkT > 0 && Math.floor(p.walkT * 8) % 2 === 1) frame = FRAMES.walk;
    else frame = FRAMES.stand;

    if (g.mode === "dying") {
      var k = 1 - Math.max(0, g.modeT) / E.C.DYING_TIME;
      ctx.save();
      ctx.translate(p.x, p.y - 16);
      ctx.rotate(Math.min(1, k * 3) * Math.PI / 2 * (flip ? -1 : 1));
      sprite(ctx, FRAMES.stand, RANGER_PAL, 0, 16, flip, PS);
      ctx.restore();
      for (var i = 0; i < 3; i++) {
        var a = t * 5 + i * 2.1;
        circle(ctx, p.x + Math.cos(a) * 13, p.y - 38 + Math.sin(a) * 4, 2.2, "#ffe066");
      }
      return;
    }
    if (p.net > 0 && (p.net > 2 || Math.floor(t * 8) % 2 === 0)) {
      ctx.save();
      ctx.translate(p.x + p.facing * 4, p.y - 15);
      ctx.scale(1.5, 1.5);
      net(ctx, 0, 0, p.facing, Math.sin(t * 14) * 0.9 - 0.2);
      ctx.restore();
    }
    sprite(ctx, frame, RANGER_PAL, p.x, p.y, flip, PS);
  }

  // ---------- HUD ----------

  function text(ctx, s, x, y, size, color, align, weight) {
    ctx.font = (weight || "bold") + " " + size + "px " + FONT;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = color || "#fff";
    ctx.fillText(s, x, y);
  }

  function outlined(ctx, s, x, y, size, color, align) {
    ctx.font = "bold " + size + "px " + FONT;
    ctx.textAlign = align || "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, size / 6);
    ctx.strokeStyle = "#1a0d05";
    ctx.strokeText(s, x, y);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  function pad(n, w) { var s = String(n); while (s.length < w) s = "0" + s; return s; }

  function hatIcon(ctx, x, y) {
    ctx.fillStyle = RANGER_PAL.h;
    ctx.fillRect(x - 9, y, 18, 3);
    ctx.fillRect(x - 5, y - 6, 10, 6);
    ctx.fillStyle = RANGER_PAL.b;
    ctx.fillRect(x - 5, y - 2, 10, 2);
  }

  function badge(ctx, label, x, y, color) {
    circle(ctx, x, y, 12, color);
    text(ctx, label, x, y + 5, 15, "#fff", "center");
  }

  function hud(ctx, g, info, t) {
    ctx.fillStyle = "#0b0f0a";
    ctx.fillRect(0, 0, FIELD_X, 540);
    ctx.fillRect(FIELD_X + 480, 0, 240, 540);
    ctx.fillStyle = "#24351f";
    ctx.fillRect(FIELD_X - 3, 0, 3, 540);
    ctx.fillRect(FIELD_X + 480, 0, 3, 540);

    outlined(ctx, "DAMN DIRTY", 120, 54, 26, "#ffd34a");
    outlined(ctx, "APES", 120, 92, 40, "#ff7a3a");

    text(ctx, "SCORE", 28, 150, 18, "#9fb38f");
    text(ctx, pad(g.score, 6), 28, 182, 30, "#fff");
    text(ctx, "HIGH", 28, 226, 18, "#9fb38f");
    text(ctx, pad(Math.max(info.hi || 0, g.score), 6), 28, 258, 30, "#ffd34a");
    text(ctx, "LIVES", 28, 302, 18, "#9fb38f");
    for (var i = 0; i < Math.min(g.lives, 6); i++) hatIcon(ctx, 40 + i * 26, 326);
    text(ctx, "LEVEL " + g.level, 28, 382, 22, "#fff");
    text(ctx, "STAGE " + (g.stageIdx + 1) + " OF " + E.STAGES.length, 28, 410, 18, "#9fb38f");
    text(ctx, g.stage.name.toUpperCase(), 28, 438, 22, "#8fe07a");

    var rx = FIELD_X + 480 + 28;
    text(ctx, "BONUS", rx, 60, 18, "#9fb38f");
    var low = g.bonus <= 1000 && g.mode === "play";
    ctx.strokeStyle = low ? "#ff5a3c" : "#ffd34a"; ctx.lineWidth = 3;
    ctx.strokeRect(rx, 72, 184, 52);
    if (!low || Math.floor(t * 4) % 2 === 0) text(ctx, pad(g.bonus, 4), rx + 92, 110, 34, low ? "#ff5a3c" : "#fff", "center");

    if (g.player.net > 0) {
      text(ctx, "NET", rx, 160, 18, "#9fb38f");
      ctx.fillStyle = "#24351f"; ctx.fillRect(rx, 170, 184, 14);
      ctx.fillStyle = "#8fe07a"; ctx.fillRect(rx, 170, 184 * g.player.net / E.C.NET_TIME, 14);
    }

    var cy = 260;
    badge(ctx, "A", rx + 12, cy - 6, "#3aa53a"); text(ctx, "Jump", rx + 34, cy, 20, "#fff");
    text(ctx, "Stick / D-pad", rx, cy + 40, 18, "#fff");
    text(ctx, "  walk and climb", rx, cy + 64, 18, "#9fb38f");
    badge(ctx, "≡", rx + 12, cy + 98, "#555"); text(ctx, "Pause", rx + 34, cy + 104, 20, "#fff");
    badge(ctx, "B", rx + 12, cy + 138, "#c0392b"); text(ctx, "Pause / back", rx + 34, cy + 144, 20, "#fff");
    text(ctx, "Grab the net to", rx, cy + 198, 17, "#9fb38f");
    text(ctx, "bag apes and nuts", rx, cy + 220, 17, "#9fb38f");
  }

  // ---------- the play field ----------

  function field(ctx, g, info, t) {
    var st = g.stage, theme = THEMES[st.key] || THEMES.canopy;
    ctx.save();
    ctx.translate(FIELD_X, 0);
    ctx.beginPath(); ctx.rect(0, 0, E.C.W, E.C.H); ctx.clip();
    background(ctx, theme, st.key, t);
    st.vines.forEach(function (v) { vine(ctx, v, t); });
    st.plats.forEach(function (p) { deck(ctx, p, theme, t); });
    perch(ctx, st, theme);
    crate(ctx, st.goal.x, st.goal.y, t);
    st.items.forEach(function (it) { if (!it.taken) fruit(ctx, it.kind, it.x, it.y, t); });

    // the troop: the boss and two lookouts
    var b = g.boss;
    var pose = b.windup > 0 ? "throw" : (b.thrownT < 0.25 ? "throw" : (Math.floor(t / 3) % 3 === 0 ? "pound" : "idle"));
    var holding = b.windup > 0 ? (st.durians && (b.throwN + 1) % E.tuning(g).durianEvery === 0 ? "durian" : "coconut") : null;
    var faceDir = (b.windup > 0 || b.thrownT < 0.25) ? b.dir : st.boss.dirs[0];
    if (b.x - st.boss.perch[0] > 30) ape(ctx, st.boss.perch[0] + 2, b.y, 0.45, "idle", 1, t + 1, { tail: true, fur: "#6b4630" });
    if (st.boss.perch[1] - b.x > 30) ape(ctx, st.boss.perch[1] - 2, b.y, 0.45, "idle", -1, t + 2, { tail: true, fur: "#6b4630" });
    ape(ctx, b.x, b.y, BOSS_SCALE, pose, faceDir, t, { bandana: true, holding: holding });

    g.hazards.forEach(function (h) {
      if (h.kind === "coconut") coconut(ctx, h.x, h.y, h.rot);
      else if (h.kind === "durian") durian(ctx, h.x, h.y, h.rot);
      else {
        var mp = h.state === "climb" ? "pound" : "walk";
        ape(ctx, h.x, h.y, 0.42, mp, h.dir, h.walkT, { tail: true, fur: "#7a5236", face: "#d9b48c" });
      }
    });

    player(ctx, g, t);

    (info.popups || []).forEach(function (p) {
      var a = Math.min(1, p.t * 2);
      ctx.globalAlpha = a;
      outlined(ctx, String(p.text), p.x, p.y - (1 - p.t) * 18, 14, p.color || "#fff");
      ctx.globalAlpha = 1;
    });

    if (g.mode === "ready") {
      outlined(ctx, "GET READY", 240, 270, 40, "#ffd34a");
      outlined(ctx, st.name.toUpperCase(), 240, 312, 22, "#8fe07a");
    } else if (g.mode === "clear") {
      outlined(ctx, "CRATE TAKEN!", 240, 250, 40, "#ffd34a");
      if (info.clearBonus) outlined(ctx, "BONUS +" + info.clearBonus, 240, 292, 24, "#fff");
      for (var i = 0; i < 12; i++) {
        var bx = (i * 47 + t * 40) % 480, by = ((t * 120 + i * 67) % 560) - 20;
        ctx.save(); ctx.translate(bx, by); ctx.rotate(t * 3 + i);
        ctx.strokeStyle = "#ffd94a"; ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(0, 0, 6, 0.4, 2.6); ctx.stroke();
        ctx.restore();
      }
    } else if (g.mode === "over") {
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, 480, 540);
      outlined(ctx, "GAME OVER", 240, 270, 44, "#ff5a3c");
    }
    ctx.restore();
  }

  function frame(ctx, g, info, t) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 960, 540);
    field(ctx, g, info, t);
    hud(ctx, g, info, t);
  }

  // ---------- title and menus ----------

  function title(ctx, info, t) {
    var th = THEMES.canopy;
    var g = ctx.createLinearGradient(0, 0, 0, 540);
    g.addColorStop(0, "#2a5a3e"); g.addColorStop(1, "#08160f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 540);
    for (var i = 0; i < 16; i++) {
      ctx.fillStyle = th.far;
      ctx.fillRect(i * 64 + 10, 140, 12, 400);
      circle(ctx, i * 64 + 16, 140, 40, th.far);
    }
    ctx.fillStyle = th.deck; ctx.fillRect(560, 400, 340, 6);
    ctx.fillStyle = th.deckUnder; ctx.fillRect(560, 406, 340, 6);
    ape(ctx, 790, 400, 2.4, Math.floor(t / 2) % 2 ? "pound" : "idle", -1, t, { bandana: true });
    ape(ctx, 620, 400, 1.0, "idle", 1, t + 1, { tail: true, fur: "#6b4630" });
    sprite(ctx, FRAMES.stand, RANGER_PAL, 160, 470, false, 4);
    ctx.fillStyle = "#8cc152"; ctx.fillRect(60, 470, 220, 8);
    coconut(ctx, 700, 400, t * 4);

    outlined(ctx, "DAMN DIRTY", 480, 96, 64, "#ffd34a");
    outlined(ctx, "APES", 480, 186, 104, "#ff7a3a");
    text(ctx, "Climb the vines. Jump the coconuts. Take back the banana crate.", 480, 232, 20, "#e8f2dc", "center", "normal");

    if (!info.menuOpen) {
      if (Math.floor(t * 2) % 2 === 0) outlined(ctx, "Press A to start", 480, 330, 34, "#fff");
      text(ctx, "HIGH SCORE " + pad(info.hi || 0, 6), 480, 372, 22, "#ffd34a", "center");
      text(ctx, "Menu: settings     B: back to games", 480, 500, 20, "#cfe0c4", "center", "normal");
      text(ctx, "Controller not responding? Hold the Menu button and pick “Use game controls”.", 480, 526, 15, "#8fa38a", "center", "normal");
    }
  }

  function menu(ctx, m) {
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(0, 0, 960, 540);
    var w = 480, rowH = 52, h = 110 + m.rows.length * rowH;
    var x = 480 - w / 2, y = 270 - h / 2;
    ctx.fillStyle = "#12200f"; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#8fe07a"; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
    outlined(ctx, m.title, 480, y + 50, 32, "#ffd34a");
    m.rows.forEach(function (r, i) {
      var ry = y + 82 + i * rowH;
      var sel = i === m.index;
      if (sel) {
        ctx.fillStyle = "#2f4a26"; ctx.fillRect(x + 16, ry, w - 32, rowH - 8);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(x + 16, ry, w - 32, rowH - 8);
      }
      text(ctx, r.label, x + 36, ry + 30, 22, sel ? "#fff" : "#cfe0c4");
      if (r.value != null) text(ctx, "◀ " + r.value + " ▶", x + w - 36, ry + 30, 22, sel ? "#ffd34a" : "#cfe0c4", "right");
    });
    text(ctx, m.hint || "A: choose   B: back", 480, y + h - 14, 16, "#8fa38a", "center", "normal");
  }

  function gameOver(ctx, info) {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, 960, 540);
    outlined(ctx, "GAME OVER", 480, 190, 64, "#ff5a3c");
    text(ctx, "SCORE " + pad(info.score, 6), 480, 260, 30, "#fff", "center");
    if (info.newHigh) outlined(ctx, "NEW HIGH SCORE!", 480, 306, 30, "#ffd34a");
    else text(ctx, "HIGH " + pad(info.hi, 6), 480, 300, 24, "#ffd34a", "center");
    text(ctx, "A: play again     B: title", 480, 400, 24, "#cfe0c4", "center");
  }

  DDA.render = {
    FIELD_X: FIELD_X, THEMES: THEMES, FRAMES: FRAMES,
    frame: frame, title: title, menu: menu, gameOver: gameOver
  };
})();
