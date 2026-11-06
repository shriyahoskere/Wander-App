/*
  test-audio-browser.js - tests that render real sound with the browser's audio system.

  What it is for: it builds the actual mixer inside an "offline" audio context (it computes the
  sound as fast as possible without playing it) and then measures the result: how quickly the
  ocean ducks, how slowly it comes back, whether the loop wraps without a jump, and whether a
  clip cut-off is a smooth fade rather than a click.

  How it fits: only runs in a browser (tests.html). In Node these tests are skipped.
*/
(function (root) {
  var VS = root.VS, T = VS.test, ok = VS.ok, near = VS.near;
  if (typeof OfflineAudioContext === 'undefined') { return; }

  var SR = 22050;
  function cfgWith(o) { var c = VS.createConfig(); Object.keys(o || {}).forEach(function (k) { c.set(k, o[k]); }); return c; }
  function dcBuffer(ctx, seconds, value) {
    var b = ctx.createBuffer(1, Math.round(SR * seconds), SR), d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) { d[i] = value; }
    return b;
  }
  function at(data, sec) { return data[Math.round(sec * SR)]; }
  function maxStep(data, from, to) {
    var m = 0;
    for (var i = Math.round(from * SR) + 1; i < Math.round(to * SR); i++) { m = Math.max(m, Math.abs(data[i] - data[i - 1])); }
    return m;
  }

  T('[sound] ocean fades in, ducks to 5% within 200 ms, and rises back gradually over 3 s', function () {
    var ctx = new OfflineAudioContext(1, SR * 7, SR);
    var cfg = cfgWith({ oceanLoopCrossfadeMs: 100, oceanFadeInMs: 500 });
    var m = VS.createMixer(ctx, cfg);
    m.setOceanBuffer(dcBuffer(ctx, 10, 1)); // a steady signal, so the output IS the ocean volume
    m.startOcean(0); m.setLevel('in', 0); m.setLevel('duck', 2); m.setLevel('up', 3);
    return ctx.startRendering().then(function (buf) {
      var d = buf.getChannelData(0);
      near(at(d, 0.7), 0.6, 0.01, 'normal level');
      near(at(d, 2.2), 0.05, 0.01, 'ducked by 200 ms');
      ok(at(d, 2.1) < 0.25, 'already well down after 100 ms (' + at(d, 2.1).toFixed(3) + ')');
      ok(at(d, 3.5) < 0.2, 'still low half a second into the return (' + at(d, 3.5).toFixed(3) + ')');
      ok(at(d, 4.5) > 0.25 && at(d, 4.5) < 0.45, 'about halfway after 1.5 s (' + at(d, 4.5).toFixed(3) + ')');
      near(at(d, 6.05), 0.6, 0.01, 'fully back after 3 s');
      ok(maxStep(d, 0.3, 6.9) < 0.002, 'no jumps anywhere (biggest step ' + maxStep(d, 0.3, 6.9).toFixed(4) + ')');
    });
  });

  T('[sound] interrupting a fade halfway continues smoothly from where it was', function () {
    var ctx = new OfflineAudioContext(1, SR * 4, SR);
    var m = VS.createMixer(ctx, cfgWith({ oceanLoopCrossfadeMs: 100, oceanFadeInMs: 200 }));
    m.setOceanBuffer(dcBuffer(ctx, 10, 1));
    m.startOcean(0); m.setLevel('in', 0); m.setLevel('duck', 1); m.setLevel('up', 1.5); m.setLevel('duck', 2.3);
    return ctx.startRendering().then(function (buf) {
      var d = buf.getChannelData(0);
      ok(maxStep(d, 0.3, 3.9) < 0.002, 'no click when a fade is interrupted (biggest step ' + maxStep(d, 0.3, 3.9).toFixed(4) + ')');
      near(at(d, 2.6), 0.05, 0.01, 'ducked again');
    });
  });

  T('[sound] a clip sits on top while the ocean goes to 35%', function () {
    var ctx = new OfflineAudioContext(1, SR * 3, SR);
    var m = VS.createMixer(ctx, cfgWith({ oceanLoopCrossfadeMs: 100, oceanFadeInMs: 200 }));
    m.setOceanBuffer(dcBuffer(ctx, 10, 1));
    m.startOcean(0); m.setLevel('in', 0); m.setLevel('clipDuck', 1);
    return ctx.startRendering().then(function (buf) {
      near(at(buf.getChannelData(0), 1.5), 0.35, 0.01);
    });
  });

  T('[sound] talking over a clip cuts it off with a fast fade, not a click', function () {
    var ctx = new OfflineAudioContext(1, SR * 3, SR);
    var m = VS.createMixer(ctx, cfgWith({}));
    m.playClipBuffer(dcBuffer(ctx, 2, 0.5), { at: 0.5 });
    m.stopClip(150, 1.2);
    return ctx.startRendering().then(function (buf) {
      var d = buf.getChannelData(0);
      near(at(d, 1.1), 0.5, 0.001, 'clip playing');
      ok(Math.abs(at(d, 1.4)) < 0.001, 'silent within 150 ms (' + at(d, 1.4) + ')');
      ok(maxStep(d, 1.15, 1.45) < 0.01, 'a fade, not a click (biggest step ' + maxStep(d, 1.15, 1.45).toFixed(4) + ')');
    });
  });

  T('[sound] the stand-in ocean loops several times with no jump at the seams', function () {
    var ctx = new OfflineAudioContext(1, SR * 10, SR);
    var cfg = cfgWith({ oceanLoopCrossfadeMs: 500, oceanFadeInMs: 100 });
    var m = VS.createMixer(ctx, cfg);
    var syn = VS.synthOcean(SR, 3, 9), b = ctx.createBuffer(1, syn.channels[0].length, SR);
    b.getChannelData(0).set(syn.channels[0]);
    var info = m.setOceanBuffer(b);
    m.startOcean(0); m.setLevel('in', 0);
    return ctx.startRendering().then(function (buf) {
      var d = buf.getChannelData(0), typical = 0, n = 0, worst = 0;
      for (var i = SR; i < d.length; i++) { typical += Math.abs(d[i] - d[i - 1]); n++; }
      typical /= n;
      for (var k = 1; k * info.length < d.length; k++) {
        var s = k * info.length;
        worst = Math.max(worst, Math.abs(d[s] - d[s - 1]) / typical);
      }
      ok(worst < 5, 'worst seam step is ' + worst.toFixed(2) + 'x a normal step');
      var gap = 0, run = 0;
      for (var j = SR; j < d.length; j++) { run = d[j] === 0 ? run + 1 : 0; gap = Math.max(gap, run); }
      ok(gap < 5, 'no silent gap (longest run of silence: ' + gap + ' samples)');
    });
  });

  T('[sound] the ocean fades out completely on snooze', function () {
    var ctx = new OfflineAudioContext(1, SR * 5, SR);
    var m = VS.createMixer(ctx, cfgWith({ oceanLoopCrossfadeMs: 100, oceanFadeInMs: 200, oceanFadeOutMs: 1000 }));
    m.setOceanBuffer(dcBuffer(ctx, 10, 1));
    m.startOcean(0); m.setLevel('in', 0); m.setLevel('out', 1);
    return ctx.startRendering().then(function (buf) {
      var d = buf.getChannelData(0);
      ok(at(d, 1.5) > 0.1 && at(d, 1.5) < 0.5, 'fading');
      ok(Math.abs(at(d, 2.1)) < 0.0005, 'silent after the fade');
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
