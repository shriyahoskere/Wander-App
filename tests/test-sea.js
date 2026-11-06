/*
  test-sea.js - tests for the water on the Session screen.

  What it is for: checks the rules from your design. While you speak the waves move calmly;
  while you are quiet they move with more height; when stopped the water is completely still.
  A boat sails in from outside the frame, stays put, rides the water, and there are never more
  than 10.

  How it fits: run from tests.html (browser) or tests/run-node.js. No drawing is needed.
*/
(function (root) {
  var VS = root.VS, T = VS.test, eq = VS.eq, ok = VS.ok;

  function seeded() { var x = 7; return function () { x = (x * 16807) % 2147483647; return x / 2147483647; }; }
  function run(model, seconds) { for (var i = 0; i < seconds * 60; i++) { model.step(1 / 60); } }

  T('water: quiet makes higher waves than speaking', function () {
    var m = VS.createSeaModel({ random: seeded() });
    m.setMode('rough'); run(m, 8);
    var rough = m.motion();
    m.setMode('calm'); run(m, 8);
    var calm = m.motion();
    ok(rough.amp > calm.amp * 2, 'quiet waves are much higher (' + rough.amp.toFixed(2) + ' vs ' + calm.amp.toFixed(2) + ')');
    ok(rough.speed > calm.speed, 'and a little faster');
    ok(calm.speed > 0, 'speaking still moves the water, gently');
  });

  T('water: sound moves the waves (louder voice, higher crests), but never when stopped', function () {
    var m = VS.createSeaModel({ random: seeded() });
    m.setMode('calm'); m.setLevel(0); run(m, 6);
    var hush = m.motion().amp;
    m.setLevel(1); run(m, 6);
    var loud = m.motion().amp;
    ok(loud > hush * 1.5, 'louder lifts the waves (' + loud.toFixed(2) + ' vs ' + hush.toFixed(2) + ')');
    m.setMode('rough'); m.setLevel(0); run(m, 8);
    ok(m.motion().amp > loud, 'even a loud voice stays calmer than the quiet-time swell');
    m.setMode('still'); m.setLevel(1); run(m, 6);
    var t = m.sceneTime(); m.setLevel(0); run(m, 3); m.setLevel(1); run(m, 3);
    eq(m.sceneTime(), t, 'sound does not move still water');
  });

  T('water: stopped means complete stillness', function () {
    var m = VS.createSeaModel({ random: seeded() });
    m.setMode('rough'); run(m, 5);
    m.addBoat('thought', 1); run(m, 2); // a boat halfway in
    m.setMode('still'); run(m, 5);
    var t = m.sceneTime(), x = m.boats()[0].x;
    run(m, 10);
    eq(m.motion().speed, 0);
    eq(m.sceneTime(), t, 'the waves do not move at all');
    eq(m.boats()[0].x, x, 'a boat on its way in stops where it is');
  });

  T('water: a boat sails in from outside the frame and then stays where it is', function () {
    var m = VS.createSeaModel({ random: seeded() });
    m.setMode('rough');
    var b = m.addBoat('thought', 'a');
    ok(b.x < 0 || b.x > 1, 'starts outside the frame');
    run(m, 12);
    eq(b.phase, 'resting');
    ok(b.x > 0.05 && b.x < 0.95, 'ends inside the frame');
    var x = b.x; run(m, 20);
    eq(b.x, x, 'stays where it is while you are quiet');
  });

  T('water: never more than 10 boats (or the number in Settings)', function () {
    var m = VS.createSeaModel({ random: seeded() });
    for (var i = 0; i < 14; i++) { m.addBoat('thought', i); }
    eq(m.count(), 10);
    eq(m.addBoat('words'), null);
    var m2 = VS.createSeaModel({ random: seeded(), maxBoats: function () { return 3; } });
    for (var j = 0; j < 5; j++) { m2.addBoat('words'); }
    eq(m2.count(), 3);
  });

  T('water: "scratch that" sails the scratched thoughts\' boats away', function () {
    var m = VS.createSeaModel({ random: seeded() });
    m.setMode('rough');
    m.addBoat('thought', 1); m.addBoat('thought', 2); m.addBoat('words');
    run(m, 10);
    eq(m.removeTagged([2]), 1);
    eq(m.count(), 2, 'counted as gone straight away');
    run(m, 8);
    eq(m.boats().length, 2, 'and off the screen after it sails away');
  });

  T('water: boats spread out instead of piling up', function () {
    var m = VS.createSeaModel({ random: seeded() });
    m.setMode('rough');
    for (var i = 0; i < 10; i++) { m.addBoat('thought', i); }
    run(m, 10);
    var xs = m.boats().map(function (b) { return b.toX; }).sort();
    var minGap = 1;
    for (var k = 1; k < xs.length; k++) { minGap = Math.min(minGap, xs[k] - xs[k - 1]); }
    ok(xs[xs.length - 1] - xs[0] > 0.5, 'they use the width of the water');
    ok(minGap > 0.01, 'no two in the same spot');
  });
})(typeof window !== 'undefined' ? window : globalThis);

(function (root) {
  var VS = root.VS, T = VS.test, eq = VS.eq, ok = VS.ok;
  T('tags: each kind says what happened to the thought, in your wording', function () {
    eq(VS.KINDS.task.tag, 'converted to a task');
    eq(VS.KINDS.goal.tag, 'set a goal');
    eq(VS.KINDS.reflection.tag, 'added to reflections');
  });
})(typeof window !== 'undefined' ? window : globalThis);
