/*
  harness.js - a tiny test runner (no outside libraries, so nothing to install).

  What it is for: test("name", function () { ... }) registers a test; eq(actual, expected)
  and ok(condition) check things. A test may also return a Promise (used by the audio tests,
  which render sound and wait for it). runAll() runs every test in order and resolves to the
  results. It works the same in the browser (tests.html) and in Node.

  How it fits: each tests/test-*.js file registers its tests with this runner.
*/
(function (root) {
  var VS = root.VS = root.VS || {};
  var tests = [];

  function show(v) { try { return JSON.stringify(v); } catch (e) { return String(v); } }

  VS.test = function (name, fn) { tests.push({ name: name, fn: fn }); };
  VS.eq = function (actual, expected, note) {
    if (show(actual) !== show(expected)) {
      throw new Error((note ? note + ': ' : '') + 'expected ' + show(expected) + ' but got ' + show(actual));
    }
  };
  VS.ok = function (cond, note) { if (!cond) { throw new Error(note || 'expected something to be true'); } };
  VS.near = function (actual, expected, tol, note) {
    if (!(Math.abs(actual - expected) <= tol)) {
      throw new Error((note ? note + ': ' : '') + 'expected about ' + expected + ' (within ' + tol + ') but got ' + actual);
    }
  };
  VS.throws = function (fn, note) {
    var threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (!threw) { throw new Error(note || 'expected an error to be thrown'); }
  };

  VS.runAll = function (onEach) {
    var results = [], i = 0;
    return new Promise(function (resolve) {
      function next() {
        if (i >= tests.length) { resolve(results); return; }
        var t = tests[i++], timer = null;
        function finish(pass, err) {
          if (timer) { clearTimeout(timer); timer = null; }
          var r = { name: t.name, pass: pass, error: err ? (err.message || String(err)) : undefined };
          results.push(r);
          if (onEach) { onEach(r); }
          next();
        }
        var out;
        try { out = t.fn(); } catch (e) { finish(false, e); return; }
        if (out && typeof out.then === 'function') {
          var done = false;
          timer = setTimeout(function () { if (!done) { done = true; finish(false, new Error('timed out after 30 s')); } }, 30000);
          out.then(function () { if (!done) { done = true; finish(true); } }, function (e) { if (!done) { done = true; finish(false, e); } });
        } else {
          finish(true);
        }
      }
      next();
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
