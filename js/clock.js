/*
  clock.js - the two clocks the app can use.

  What it is for: the silence engine never looks at the real time itself. It asks a
  "clock" what time it is. In real sessions that is the real clock. In tests and in
  the dry-run simulator it is a fake clock that only moves when we say so, which is
  how we can test a 10-second rule in a fraction of a millisecond.

  How it fits: engine.js is given one of these when it is created.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  VS.realClock = { now: function () { return Date.now(); } };

  VS.createFakeClock = function (startMs) {
    var t = startMs || 0;
    return {
      now: function () { return t; },
      advance: function (ms) { t += ms; },
      set: function (ms) { t = ms; }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
