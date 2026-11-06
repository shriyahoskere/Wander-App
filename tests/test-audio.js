/*
  test-audio.js - tests for the sound building blocks that do not need audio hardware:
  the seamless loop maker, the stand-in ocean, the voice detector, the mixer's level table,
  and the engine's handling of a backdated end of speech.

  How it fits: run from tests.html (browser) or tests/run-node.js. The tests that actually
  render sound are in test-audio-browser.js.
*/
(function (root) {
  var VS = root.VS, T = VS.test, eq = VS.eq, ok = VS.ok, near = VS.near;

  function noise(n, seed) {
    var a = seed || 7, out = new Float32Array(n);
    for (var i = 0; i < n; i++) { a = (a * 1103515245 + 12345) & 0x7fffffff; out[i] = (a / 0x7fffffff) * 2 - 1; }
    return out;
  }
  function smoothNoise(n, seed) {
    var w = noise(n, seed), out = new Float32Array(n), y = 0;
    for (var i = 0; i < n; i++) { y += (w[i] - y) * 0.05; out[i] = y; }
    return out;
  }

  // ---------- loop ----------
  T('loop: crossfade shortens the loop by the overlap', function () {
    var r = VS.crossfadeLoop([smoothNoise(10000)], 1000);
    eq(r.length, 9000); eq(r.fadeSamples, 1000); eq(r.channels[0].length, 9000);
  });
  T('loop: the wrap-around point is as smooth as anywhere else', function () {
    var src = smoothNoise(44100 * 4, 3);
    var raw = VS.seamJump(src);
    var looped = VS.seamJump(VS.crossfadeLoop([src], 44100).channels[0]);
    ok(looped.ratio < 4, 'seam jump is ' + looped.ratio.toFixed(2) + 'x a normal step (raw file was ' + raw.ratio.toFixed(2) + 'x)');
  });
  T('loop: a pure tone loops with no jump at the seam', function () {
    var n = 22050, s = new Float32Array(n);
    for (var i = 0; i < n; i++) { s[i] = Math.sin(2 * Math.PI * 220.37 * i / 22050); }
    ok(VS.seamJump(VS.crossfadeLoop([s], 2205).channels[0]).ratio < 3);
  });
  T('loop: a very short recording gets a shorter blend; a tiny one is just copied', function () {
    eq(VS.crossfadeLoop([smoothNoise(300)], 1000).fadeSamples, 100);
    eq(VS.crossfadeLoop([new Float32Array(4)], 1000).length, 4);
  });
  T('loop: every channel is blended the same way', function () {
    var r = VS.crossfadeLoop([smoothNoise(5000, 1), smoothNoise(5000, 2)], 500);
    eq(r.channels.length, 2); eq(r.channels[1].length, 4500);
  });

  // ---------- stand-in ocean ----------
  var syn = VS.synthOcean(8000, 20, 42);
  T('stand-in ocean: stereo, the right length, never too loud, no broken numbers', function () {
    eq(syn.channels.length, 2); eq(syn.channels[0].length, 160000);
    syn.channels.forEach(function (c) {
      var peak = 0;
      for (var i = 0; i < c.length; i++) { ok(isFinite(c[i]), 'bad sample at ' + i); peak = Math.max(peak, Math.abs(c[i])); }
      ok(peak <= 0.8001, 'peak ' + peak);
    });
  });
  T('stand-in ocean: it swells like waves (some seconds louder than others)', function () {
    var c = syn.channels[0], lv = [];
    for (var s = 0; s < 20; s++) { lv.push(VS.levelDb(c, s * 8000, (s + 1) * 8000)); }
    var range = Math.max.apply(null, lv) - Math.min.apply(null, lv);
    ok(range > 4, 'loudness only varies by ' + range.toFixed(1) + ' dB');
  });
  T('stand-in ocean: left and right differ (sounds wide), and the same seed gives the same sound', function () {
    var a = syn.channels[0], b = syn.channels[1], ab = 0, aa = 0, bb = 0;
    for (var i = 0; i < a.length; i += 3) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
    ok(Math.abs(ab / Math.sqrt(aa * bb)) < 0.9, 'channels are nearly identical');
    eq(VS.synthOcean(8000, 2, 42).channels[0][1234], VS.synthOcean(8000, 2, 42).channels[0][1234]);
  });

  // ---------- voice detection ----------
  function vadRig(overrides) {
    var cfg = VS.createConfig();
    Object.keys(overrides || {}).forEach(function (k) { cfg.set(k, overrides[k]); });
    var ev = [];
    var vad = VS.createVad(cfg, {
      onStart: function (t) { ev.push({ type: 'start', t: t }); },
      onEnd: function (t, ago, why) { ev.push({ type: 'end', t: t, ago: ago, why: why }); }
    });
    var t = 0;
    return {
      vad: vad, ev: ev, cfg: cfg,
      run: function (ms, db) { for (var i = 0; i < ms; i += 10) { t += 10; vad.push(t, typeof db === 'function' ? db(t) : db); } },
      now: function () { return t; }
    };
  }
  T('voice detection: notices speech within 100 ms', function () {
    var r = vadRig(); r.run(1000, -70); var onset = r.now();
    r.run(500, -30);
    eq(r.ev.length, 1); eq(r.ev[0].type, 'start');
    ok(r.ev[0].t - onset <= 80, 'took ' + (r.ev[0].t - onset) + ' ms');
  });
  T('voice detection: a short click or tap does not count as speech', function () {
    var r = vadRig(); r.run(1000, -70); r.run(30, -15); r.run(1000, -70);
    eq(r.ev.length, 0);
  });
  T('voice detection: short gaps between words are bridged; a real pause ends speech', function () {
    var r = vadRig(); r.run(1000, -70);
    for (var w = 0; w < 6; w++) { r.run(300, -28); r.run(200, -68); }
    eq(r.ev.length, 1, 'only the start so far');
    r.run(1500, -70);
    eq(r.ev.length, 2); eq(r.ev[1].type, 'end');
    near(r.ev[1].ago, 500, 10, 'the stop is backdated to when the quiet began');
  });
  T('voice detection: while the system speaks, its leaking voice does not trigger it', function () {
    var a = vadRig(); a.run(1000, -70); a.vad.setGate(10); a.run(1000, -50);
    eq(a.ev.length, 0, 'gated');
    var b = vadRig(); b.run(1000, -70); b.run(1000, -50);
    eq(b.ev.length, 1, 'same sound without the gate is detected');
  });
  T('voice detection: a slowly rising room noise does not count as speech', function () {
    var r = vadRig(); r.run(1000, -70);
    r.run(20000, function (t) { return -70 + Math.min(12, (t - 1000) / 1500); });
    eq(r.ev.length, 0);
  });
  T('voice detection: a steady fan that switches on is learned as room noise', function () {
    var r = vadRig({ vadStuckNoiseMs: 10000 }); r.run(1000, -70);
    r.run(16000, -40);
    eq(r.ev.map(function (e) { return e.type; }), ['start', 'end']); eq(r.ev[1].why, 'steady-noise');
    r.run(10000, -40);
    eq(r.ev.length, 2, 'the fan does not trigger again');
  });
  T('voice detection: a very long stretch of real speech is never cut off', function () {
    var r = vadRig({ vadStuckNoiseMs: 10000 }); r.run(1000, -70);
    r.run(60000, function (t) { return -30 + 12 * Math.sin(t / 37); });
    eq(r.ev.length, 1, 'still speaking');
  });
  T('voice detection: loudness maths', function () {
    var s = new Float32Array(4800);
    for (var i = 0; i < s.length; i++) { s[i] = Math.sin(2 * Math.PI * 100 * i / 48000); }
    near(VS.levelDb(s), -3.01, 0.05); eq(VS.levelDb(new Float32Array(100)), -100);
  });

  // ---------- mixer level table ----------
  T('mixer: each ocean level uses the settings from the brief', function () {
    var cfg = VS.createConfig();
    eq(VS.levelSpec('duck', cfg), { gain: 0.05, ms: 200, shape: 'easeOut' });
    eq(VS.levelSpec('up', cfg), { gain: 0.6, ms: 3000, shape: 'smooth' }, 'rises gradually, over 3 s');
    eq(VS.levelSpec('clipDuck', cfg).gain, 0.35);
    eq(VS.levelSpec('out', cfg).gain, 0); eq(VS.levelSpec('nonsense', cfg), null);
  });

  // ---------- engine changes for live audio ----------
  T('engine: a backdated end of speech keeps the wait honest', function () {
    var r = VS.makeRig();
    r.engine.speechStart(); r.advance(2000); r.advance(500); r.engine.speechEnd(500); r.engine.transcript('I went to the shop', true);
    r.advance(60450); eq(r.prompts().length, 0, 'not yet');
    r.advance(100); eq(r.prompts().length, 1, '61 s after the real end of speech');
  });
  T('engine: speech with no words says so instead of pretending nothing happened', function () {
    var r = VS.makeRig(); r.engine.speechStart(); r.advance(800); r.engine.speechEnd(); r.advance(70000);
    ok(/heard you speaking, but no words/.test(r.narration())); eq(r.prompts().length, 0);
  });
  T('clips: the microphone alert exists and is short', function () {
    var c = VS.CLIPS.filter(function (x) { return x.situation === 'alert-mic'; })[0];
    ok(c && c.text.split(' ').length <= 10);
  });
})(typeof window !== 'undefined' ? window : globalThis);
