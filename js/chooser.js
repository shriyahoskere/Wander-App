/*
  chooser.js - picks which line to say.

  What it is for: given a situation ("plan", "back-after-unanswered", "confirm-snoozed"...), pick
  one of its lines and rotate through them so repeats never feel scripted. It always picks the
  line used least so far (ties go to the earlier one), which makes it predictable and testable.
  Lines with {blanks} are only used when every blank can be filled. It also builds the session
  opener from the priority list: 1) a goal with recent activity, 2) a thought from an earlier
  session, 3) open-ended.

  How it fits: the engine asks the chooser for a line by situation. The chooser reads the lines
  fresh every time (from your Wording tab edits, or the defaults), so edits apply at once.
  It plays nothing and speaks nothing.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  function blanksIn(text) {
    var out = [], re = /\{(\w+)\}/g, m;
    while ((m = re.exec(text))) { out.push(m[1]); }
    return out;
  }

  /* clips: an array, or a function returning the current array. */
  VS.createChooser = function (clips) {
    var used = {};
    function list() { return typeof clips === 'function' ? clips() : clips; }
    function keyOf(c) { return c.situation + '|' + c.text; }
    function count(c) { return used[keyOf(c)] || 0; }

    function usable(situation, vars) {
      return list().filter(function (c) {
        if (c.situation !== situation) { return false; }
        return blanksIn(c.text).every(function (b) { return vars && vars[b] !== undefined && vars[b] !== null && vars[b] !== ''; });
      });
    }

    function leastUsed(arr) {
      var best = null;
      for (var i = 0; i < arr.length; i++) { if (best === null || count(arr[i]) < count(best)) { best = arr[i]; } }
      return best;
    }

    var api = {
      /* pick('plan') or pick('confirm-snoozed', { minutes: 'ten minutes' }) -> { clip, text } or null */
      pick: function (situation, vars) {
        var clip = leastUsed(usable(situation, vars || {}));
        if (!clip) { return null; }
        used[keyOf(clip)] = count(clip) + 1;
        return { clip: clip, text: VS.fillTemplate(clip.text, vars || {}) };
      },

      /* Kept for older callers: same as pick. */
      confirm: function (situation, vars) { return api.pick(situation, vars); },

      lines: function (situation) { return list().filter(function (c) { return c.situation === situation; }); },

      /* pickOpener({ goals: ['plan the move'], resurfaced: null | { topic: 'the move' } }) -> { clip, text, why } or null */
      pickOpener: function (ctx) {
        ctx = ctx || {};
        var goals = ctx.goals || [], p;
        if (goals.length) {
          var goal = goals[0].split(/\s+/).slice(0, 6).join(' ');
          p = api.pick('opener-goal', { goal: goal });
          if (p) { p.why = 'goal "' + goal + '" has recent activity, so asking about it'; return p; }
        }
        if (ctx.resurfaced) {
          var topic = ctx.resurfaced.topic ? ctx.resurfaced.topic.split(/\s+/).slice(0, 8).join(' ') : '';
          p = api.pick('opener-resurface', topic ? { topic: topic } : {});
          if (p) { p.why = 'an earlier thought is ready to come back around'; return p; }
        }
        p = api.pick('opener-open');
        if (p) { p.why = 'no recent goals, so using an open-ended opener'; }
        return p;
      },

      usage: function () { return JSON.parse(JSON.stringify(used)); }
    };
    return api;
  };
})(typeof window !== 'undefined' ? window : globalThis);
