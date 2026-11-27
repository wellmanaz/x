/* Hair Force One: little synthesized sound effects (Web Audio, no files). */
(function () {
  "use strict";
  var HF = window.HF = window.HF || {};
  var ctx = null, enabled = true;

  function ac() {
    if (!enabled) return null;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === "suspended" && ctx.resume) { try { ctx.resume(); } catch (e) { /* ignore */ } }
    return ctx;
  }

  function tone(freq, to, dur, type, vol, delay) {
    var c = ac();
    if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(vol || 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol) {
    var c = ac();
    if (!c) return;
    var n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf; g.gain.value = vol || 0.1;
    s.connect(g); g.connect(c.destination);
    s.start();
  }

  var coinFlip = false;
  var SOUNDS = {
    coin: function () { coinFlip = !coinFlip; tone(coinFlip ? 1568 : 1760, 0, 0.045, "triangle", 0.035); },
    bigly: function () { [262, 330, 392, 523].forEach(function (f, i) { tone(f, 0, 0.14, "sawtooth", 0.05, i * 0.06); }); tone(523, 1046, 0.35, "square", 0.04, 0.26); },
    "bigly-end": function () { tone(523, 262, 0.3, "triangle", 0.05); },
    fire: function () { tone(880, 220, 0.18, "square", 0.05); tone(196, 0, 0.22, "sawtooth", 0.05, 0.16); },
    build: function () { noise(0.08, 0.12); tone(150, 80, 0.1, "triangle", 0.09); },
    "no-build": function () { tone(160, 0, 0.07, "square", 0.03); },
    crumble: function () { noise(0.18, 0.05); },
    bricks: function () { tone(330, 0, 0.06, "square", 0.04); tone(494, 0, 0.08, "square", 0.04, 0.06); },
    elevator: function () { tone(1318, 0, 0.35, "sine", 0.07); tone(1046, 0, 0.45, "sine", 0.06, 0.18); },
    bonus: function () { tone(2093, 0, 0.06, "square", 0.04); tone(2637, 0, 0.12, "square", 0.04, 0.06); noise(0.05, 0.05); },
    "back-home": function () { tone(700, 900, 0.06, "sine", 0.02); },
    die: function () { tone(523, 98, 1.1, "square", 0.05); tone(392, 0, 0.12, "triangle", 0.05, 1.1); },
    clear: function () { [392, 523, 659, 784, 659, 784, 1046].forEach(function (f, i) { tone(f, 0, 0.12, "square", 0.05, i * 0.1); }); },
    life: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, 0, 0.1, "triangle", 0.07, i * 0.08); }); },
    over: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0, 0.25, "triangle", 0.08, i * 0.22); }); },
    start: function () { [523, 523, 659, 784].forEach(function (f, i) { tone(f, 0, 0.1, "square", 0.045, i * 0.12); }); },
    move: function () { tone(440, 0, 0.03, "square", 0.03); },
    choose: function () { tone(660, 880, 0.08, "square", 0.04); }
  };

  HF.audio = {
    play: function (name) { if (enabled && SOUNDS[name]) { try { SOUNDS[name](); } catch (e) { /* ignore */ } } },
    unlock: function () { ac(); },
    setEnabled: function (on) { enabled = !!on; }
  };
})();
