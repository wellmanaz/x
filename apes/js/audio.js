/* Damn Dirty Apes: little synthesized sound effects (Web Audio, no files). */
(function () {
  "use strict";
  var DDA = window.DDA = window.DDA || {};
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

  var SOUNDS = {
    jump: function () { tone(330, 660, 0.12, "square", 0.05); },
    land: function () { tone(140, 90, 0.05, "triangle", 0.05); },
    score: function () { tone(880, 0, 0.05, "square", 0.04); tone(1320, 0, 0.07, "square", 0.04, 0.05); },
    fruit: function () { tone(660, 0, 0.06, "square", 0.05); tone(990, 0, 0.08, "square", 0.05, 0.06); },
    net: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0, 0.08, "square", 0.05, i * 0.07); }); },
    smash: function () { noise(0.15, 0.12); tone(200, 60, 0.12, "sawtooth", 0.05); },
    throw: function () { tone(110, 70, 0.12, "triangle", 0.09); },
    bounce: function () { tone(180, 120, 0.06, "triangle", 0.04); },
    crumble: function () { noise(0.2, 0.06); },
    die: function () { tone(660, 80, 0.9, "square", 0.06); },
    clear: function () { [523, 659, 784, 659, 784, 1047].forEach(function (f, i) { tone(f, 0, 0.12, "square", 0.05, i * 0.11); }); },
    life: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, 0, 0.1, "triangle", 0.07, i * 0.08); }); },
    over: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0, 0.25, "triangle", 0.08, i * 0.22); }); },
    move: function () { tone(440, 0, 0.03, "square", 0.03); },
    choose: function () { tone(660, 880, 0.08, "square", 0.04); }
  };

  DDA.audio = {
    play: function (name) { if (enabled && SOUNDS[name]) { try { SOUNDS[name](); } catch (e) { /* ignore */ } } },
    unlock: function () { ac(); },
    setEnabled: function (on) { enabled = !!on; }
  };
})();
