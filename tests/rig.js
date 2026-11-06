/*
  rig.js - a test helper that builds a complete engine on a fake clock.

  What it is for: so each test can say "speak this, wait 5.9 seconds, check nothing happened,
  wait 0.1 more, check a clip played" in one or two lines, without any real waiting.

  How it fits: used by the test-*.js files only. Not part of the app.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  VS.makeRig = function (overrides, context) {
    var cfg = VS.createConfig();
    Object.keys(overrides || {}).forEach(function (k) { cfg.set(k, overrides[k]); });
    var clock = VS.createFakeClock(0);
    var chooser = VS.createChooser(VS.CLIPS);
    var engine = VS.createEngine({ clock: clock, cfg: cfg, chooser: chooser, context: context });
    engine.start();

    var rig = {
      cfg: cfg, clock: clock, engine: engine, chooser: chooser,
      // Move time forward in 50 ms steps, ticking the engine each step.
      advance: function (ms) {
        while (ms > 0) {
          var d = Math.min(50, ms);
          clock.advance(d); engine.tick(); ms -= d;
        }
      },
      // Speak a sentence: takes durMs, the transcript arrives the instant you stop.
      speak: function (text, durMs) {
        engine.speechStart();
        rig.advance(durMs === undefined ? 1000 : durMs);
        engine.speechEnd();
        engine.transcript(text, true);
      },
      // Prompts the system spoke (not confirmations).
      prompts: function () {
        return engine.actions().filter(function (a) { return a.type === 'playClip' && a.kind === 'prompt'; });
      },
      systemPrompts: function () {
        return rig.prompts().filter(function (a) { return a.who === 'system'; });
      },
      confirmations: function () {
        return engine.actions().filter(function (a) { return a.type === 'playClip' && a.kind === 'confirmation'; });
      },
      narration: function () {
        return engine.actions().filter(function (a) { return a.type === 'narrate'; }).map(function (a) { return a.text; }).join('\n');
      },
      has: function (type) {
        return engine.actions().filter(function (a) { return a.type === type; }).length;
      },
      endClip: function () { engine.clipEnded(); }
    };
    return rig;
  };
})(typeof window !== 'undefined' ? window : globalThis);
