/*
  narrate.js - turns what the engine does into calm, readable sentences.

  What it is for: "narrate mode". Every decision the engine makes comes with a plain-English
  reason, and this file formats it as a timestamped line, like
  [00:00:44] 9s of silence passed. Classified your last thought as: plan... Playing it.
  It also builds the single updating countdown line ("Waiting for silence: 3.2s / 5.0s").

  How it fits: the dry-run simulator and the live page both use these same functions, so a
  dry run and a live session read exactly the same way. One line per decision, never per
  audio frame.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  VS.formatLine = function (tMs, text) {
    return '[' + VS.fmtClock(tMs) + '] ' + text;
  };

  // The single live line shown while a timer is running, or null if no timer is running.
  VS.countdownLine = function (st) {
    function pair() { return VS.fmtSec(Math.min(st.waitedMs, st.thresholdMs)) + 's / ' + VS.fmtSec(st.thresholdMs) + 's'; }
    if (st.phase === 'opener') { return 'Waiting for you to begin: ' + pair(); }
    if (st.phase === 'buffer') { return 'Checking the pause is not just a breath: ' + pair(); }
    if (st.phase === 'wait') { return 'Waiting for silence: ' + pair(); }
    if (st.phase === 'done') { return 'Wait is over. Staying quiet until you speak.'; }
    if (st.state === 'Snoozed') {
      var s = Math.ceil(st.snoozeLeftMs / 1000), m = Math.floor(s / 60);
      return 'Snoozed: ' + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60) + ' left';
    }
    if (st.state === 'Listening') { return 'Listening. The system is silent.'; }
    if (st.state === 'Prompting') { return 'A clip is playing.'; }
    if (st.state === 'Stopped') { return 'Stopped.'; }
    return null;
  };

  /*
    createNarrator({ write }) -> { handle(action) }
    Pass engine actions to handle(); it writes a formatted line for each narration action
    (and a short line for clips, which is what you actually hear).
  */
  VS.createNarrator = function (opts) {
    return {
      handle: function (a) {
        if (a.type === 'narrate') { opts.write(VS.formatLine(a.t, a.text), a); }
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
