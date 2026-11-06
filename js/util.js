/*
  util.js - small helpers used by many other files.

  What it is for: turning numbers into spoken words ("10" -> "ten"), spoken words
  back into numbers, formatting times like 00:01:30, and filling the blanks in
  clip templates ("Saved. {thoughts}." -> "Saved. Seven thoughts.").

  How it fits: every other file hangs its pieces off one shared object called VS,
  and this file is loaded first. It has no state and does no audio or storage.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  var ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var TENS = { 2: 'twenty', 3: 'thirty', 4: 'forty', 5: 'fifty', 6: 'sixty', 7: 'seventy', 8: 'eighty', 9: 'ninety' };

  // 10 -> "ten", 25 -> "twenty five". Above 99 we just use digits.
  VS.numberToWords = function (n) {
    n = Math.round(n);
    if (n < 0 || n > 99) return String(n);
    if (n < 20) return ONES[n];
    var t = Math.floor(n / 10), u = n % 10;
    return TENS[t] + (u ? ' ' + ONES[u] : '');
  };

  // "ten" -> 10, "twenty five" -> 25, "7" -> 7. Returns null if it is not a number.
  VS.wordsToNumber = function (text) {
    var s = String(text).toLowerCase().trim().replace(/-/g, ' ');
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    var parts = s.split(/\s+/), total = 0, i, idx;
    if (!parts.length || !parts[0]) return null;
    for (i = 0; i < parts.length; i++) {
      idx = ONES.indexOf(parts[i]);
      if (idx >= 0) { total += idx; continue; }
      var tensKey = null;
      for (var k in TENS) { if (TENS[k] === parts[i]) tensKey = k; }
      if (tensKey !== null) { total += parseInt(tensKey, 10) * 10; continue; }
      return null;
    }
    return total;
  };

  // "ten minutes" / "one minute"
  VS.minutesPhrase = function (n) {
    return VS.numberToWords(n) + (n === 1 ? ' minute' : ' minutes');
  };

  // "seven thoughts" / "one thought" / "no thoughts"
  VS.thoughtsPhrase = function (n) {
    if (n === 0) return 'no thoughts';
    return VS.numberToWords(n) + (n === 1 ? ' thought' : ' thoughts');
  };

  // Fill {blanks} in a clip's text, then capitalise the first letter of each sentence.
  VS.fillTemplate = function (text, vars) {
    var out = String(text).replace(/\{(\w+)\}/g, function (m, key) {
      return vars && vars[key] !== undefined ? String(vars[key]) : m;
    });
    return out.replace(/(^|[.!?]\s+)([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
  };

  // 90500 -> "00:01:30"
  VS.fmtClock = function (ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return p(h) + ':' + p(m) + ':' + p(sec);
  };

  // 5000 -> "5.0"
  VS.fmtSec = function (ms, digits) {
    return (ms / 1000).toFixed(digits === undefined ? 1 : digits);
  };

  // Escape a plain phrase so it can sit safely inside a regular expression.
  VS.escapeRegExp = function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };

  // Lowercase, straighten curly apostrophes, drop punctuation and extra spaces.
  VS.normalise = function (text) {
    return String(text).toLowerCase()
      .replace(/[‘’ʼ]/g, "'")
      .replace(/-/g, ' ')
      .replace(/[^a-z0-9' ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };
})(typeof window !== 'undefined' ? window : globalThis);
