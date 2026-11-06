/*
  test-wording.js - tests for the Wording tab's data: every situation the system can speak in
  has its own lines, your edits replace the defaults straight away, and empty means silence
  (except for problems, which are never silent).

  How it fits: run from tests.html (browser) or tests/run-node.js.
*/
(function (root) {
  var VS = root.VS, T = VS.test, eq = VS.eq, ok = VS.ok;
  var D = VS.createConfig(), FIRE = D.get('endOfSpeechBufferMs') + D.get('followUpSilenceMs'), BACK = D.get('backoffAfterUnansweredMs');

  function withWording(fn) {
    var store = {}, fake = { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; } };
    var w = VS.createWording(fake);
    var prev = VS.wordingStore; VS.wordingStore = w;
    try { return fn(w, fake); } finally { VS.wordingStore = prev; }
  }
  function rigWith() {
    var r = VS.makeRig();
    // rebuild the engine so it uses the current wording
    var chooser = VS.createChooser(VS.currentClips), clock = VS.createFakeClock(0);
    var engine = VS.createEngine({ clock: clock, cfg: r.cfg, chooser: chooser }); engine.start();
    r.clock = clock; r.engine = engine;
    r.advance = function (ms) { while (ms > 0) { var d = Math.min(50, ms); clock.advance(d); engine.tick(); ms -= d; } };
    r.speak = function (text) { engine.speechStart(); r.advance(1000); engine.speechEnd(); engine.transcript(text, true); };
    return r;
  }

  T('wording: every situation the engine can ask for is on the Wording tab', function () {
    var asked = {};
    function spy(list) { var ch = VS.createChooser(list); var pick = ch.pick; ch.pick = function (s, v) { asked[s] = true; return pick(s, v); }; return ch; }
    // Drive the engine through every kind of moment and record which situations it asks for.
    var texts = ['I need to call the bank', "I think I'll just start", 'What a day it was', "That's it for today", 'I was going to say and', 'I feel so anxious', 'snooze', 'resume', 'stop', 'resume', 'scratch that', 'scratch the last minute'];
    texts.forEach(function (text) {
      var cfg = VS.createConfig(), clock = VS.createFakeClock(0), e = VS.createEngine({ clock: clock, cfg: cfg, chooser: spy(VS.CLIPS) });
      e.start();
      function adv(ms) { while (ms > 0) { clock.advance(50); e.tick(); ms -= 50; } }
      e.speechStart(); adv(1000); e.speechEnd(); e.transcript(text, true); adv(FIRE); e.clipEnded(); adv(BACK); e.clipEnded(); adv(BACK);
    });
    Object.keys(asked).forEach(function (s) { ok(VS.situationById(s), 'the engine asked for "' + s + '" but it is not on the Wording tab'); });
    ['plan', 'plan-pin', 'reflect', 'closer', 'backchannel', 'emotional', 'back-after-unanswered', 'exit', 'confirm-snoozed', 'confirm-saved', 'confirm-scratched-none'].forEach(function (s) { ok(asked[s], 'expected the engine to use "' + s + '"'); });
  });

  T('wording: your lines replace the defaults immediately', function () {
    withWording(function (w) {
      eq(w.set('plan', 'What is the very first thing?\nWhen would you like to start?').ok, true);
      var r = rigWith(); r.speak('I need to call the bank'); r.advance(FIRE);
      eq(r.engine.actions().filter(function (a) { return a.type === 'playClip'; })[0].text, 'What is the very first thing?');
      ok(w.isEdited('plan'));
    });
  });

  T('wording: the line after no answer is separate from the line after an unfinished thought', function () {
    withWording(function (w) {
      w.set('back-after-unanswered', 'Still here.'); w.set('backchannel', 'Keep going.');
      var r = rigWith(); r.speak('I need to call the bank'); r.advance(FIRE); r.engine.clipEnded(); r.advance(BACK);
      var said = r.engine.actions().filter(function (a) { return a.type === 'playClip'; }).map(function (a) { return a.text; });
      eq(said[1], 'Still here.');
      var r2 = rigWith(); r2.speak('I was going to call her and'); r2.advance(D.get('endOfSpeechBufferMs') + D.get('incompleteSilenceMs'));
      eq(r2.engine.actions().filter(function (a) { return a.type === 'playClip'; })[0].text, 'Keep going.');
    });
  });

  T('wording: an empty situation means the system stays quiet there, and says why', function () {
    withWording(function (w) {
      eq(w.set('plan', '').ok, true);
      var r = rigWith(); r.speak('I need to call the bank'); r.advance(FIRE + 5000);
      eq(r.engine.actions().filter(function (a) { return a.type === 'playClip'; }).length, 0);
      ok(/There is no wording for "Planning question"/.test(r.engine.actions().map(function (a) { return a.text; }).join('\n')));
    });
  });

  T('wording: problem lines can never be emptied (failures are never silent)', function () {
    withWording(function (w) {
      ['alert-mic', 'alert-words', 'alert-lost'].forEach(function (s) { eq(w.set(s, '   ').ok, false, s); ok(w.lines(s).length > 0); });
    });
  });

  T('wording: blanks in your own lines are filled in', function () {
    withWording(function (w) {
      w.set('confirm-snoozed', 'Okay, quiet for {minutes}.');
      var r = rigWith(); r.speak('snooze for ten minutes'); r.advance(100);
      eq(r.engine.actions().filter(function (a) { return a.type === 'playClip'; })[0].text, 'Okay, quiet for ten minutes.');
    });
  });

  T('wording: saved in the browser, restore default, and export/import round trip', function () {
    withWording(function (w, fake) {
      w.set('closer', 'All done for now?');
      eq(VS.createWording(fake).lines('closer'), ['All done for now?'], 'kept after reopening the page');
      var file = w.exportJson();
      w.reset('closer'); eq(w.isEdited('closer'), false); eq(w.lines('closer'), w.defaults('closer'));
      var res = w.importJson(file); ok(res.ok); eq(w.lines('closer'), ['All done for now?']);
      eq(w.importJson('not json').ok, false);
    });
  });

  T('wording: undoing a stop now says so', function () {
    var r = VS.makeRig(); r.speak('a thought'); r.advance(1500); r.speak('stop'); r.advance(2000); r.speak('resume'); r.advance(100);
    ok(r.confirmations().some(function (a) { return a.text === 'Back again. Nothing was lost.'; }));
  });
})(typeof window !== 'undefined' ? window : globalThis);
