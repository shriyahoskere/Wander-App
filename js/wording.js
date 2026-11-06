/*
  wording.js - keeps your own wording for each situation, on top of the defaults.

  What it is for: when you edit lines on the Wording tab, they are saved in this browser and
  replace the default lines for that situation. Situations you have not touched keep the
  defaults from clips/clips.js. You can export everything to a file (to keep, share with me, or
  move to another computer) and import it back.

  How it fits: the chooser asks clips() for the lines it may say, every time it picks, so edits
  apply straight away, even in a running session.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  function defaultsFor(id) {
    return VS.CLIPS.filter(function (c) { return c.situation === id; }).map(function (c) { return c.text; });
  }

  function cleanLines(lines) {
    if (typeof lines === 'string') { lines = lines.split(/\r?\n/); }
    return (lines || []).map(function (l) { return String(l).replace(/\s+/g, ' ').trim(); }).filter(function (l) { return l.length > 0; });
  }

  /* createWording(storage) - storage is optional (localStorage in the browser). */
  VS.createWording = function (storage, storageKey) {
    var key = storageKey || 'voice-space-wording-v1';
    var edits = {}, listeners = [];
    try { var raw = storage && storage.getItem(key); if (raw) { edits = JSON.parse(raw) || {}; } } catch (e) { edits = {}; }

    function save() { if (storage) { try { storage.setItem(key, JSON.stringify(edits)); } catch (e) { /* storage blocked */ } } }
    function notify(id) { listeners.forEach(function (f) { f(id); }); }

    var api = {
      /* The lines in use for a situation (yours if edited, otherwise the defaults). */
      lines: function (id) { return edits[id] ? edits[id].slice() : defaultsFor(id); },
      defaults: defaultsFor,
      isEdited: function (id) { return !!edits[id]; },

      /* Save new lines. Returns { ok, message }. Required situations cannot be emptied. */
      set: function (id, lines) {
        var sit = VS.situationById(id);
        if (!sit) { return { ok: false, message: 'Unknown situation: ' + id }; }
        var clean = cleanLines(lines);
        if (sit.required && clean.length === 0) {
          return { ok: false, message: 'This one needs at least one line: problems are never silent.' };
        }
        if (JSON.stringify(clean) === JSON.stringify(defaultsFor(id))) { delete edits[id]; } else { edits[id] = clean; }
        save(); notify(id);
        return { ok: true };
      },
      reset: function (id) { delete edits[id]; save(); notify(id); },
      resetAll: function () { edits = {}; save(); notify('*'); },

      /* Every line the system may say, in the same shape as VS.CLIPS. */
      clips: function () {
        var out = [];
        VS.SITUATIONS.forEach(function (sit) {
          var defs = VS.CLIPS.filter(function (c) { return c.situation === sit.id; });
          var category = defs.length ? defs[0].category : 'Other';
          if (!edits[sit.id]) { defs.forEach(function (c) { out.push(c); }); return; }
          edits[sit.id].forEach(function (text, i) {
            out.push({ id: sit.id + '-' + (i + 1), situation: sit.id, category: category, text: text, template: /\{\w+\}/.test(text), custom: true });
          });
        });
        return out;
      },

      exportJson: function () {
        var all = {};
        VS.SITUATIONS.forEach(function (sit) { all[sit.id] = api.lines(sit.id); });
        return JSON.stringify({ app: 'voice-space', kind: 'wording', version: 1, situations: all }, null, 2);
      },

      /* Import a file made by exportJson. Returns { ok, message, count }. */
      importJson: function (text) {
        var data;
        try { data = JSON.parse(text); } catch (e) { return { ok: false, message: 'That file is not a wording file (it is not valid JSON).' }; }
        var sits = data && data.situations;
        if (!sits || typeof sits !== 'object') { return { ok: false, message: 'That file does not contain wording.' }; }
        var count = 0, skipped = [];
        Object.keys(sits).forEach(function (id) {
          if (!VS.situationById(id)) { skipped.push(id); return; }
          var r = api.set(id, sits[id]);
          if (r.ok) { count++; } else { skipped.push(id); }
        });
        return { ok: true, count: count, message: 'Imported wording for ' + count + ' situations.' + (skipped.length ? ' Skipped: ' + skipped.join(', ') + '.' : '') };
      },

      onChange: function (fn) { listeners.push(fn); }
    };
    return api;
  };

  /* The lines to use everywhere: your wording if a store has been set up, otherwise the defaults. */
  VS.currentClips = function () { return VS.wordingStore ? VS.wordingStore.clips() : VS.CLIPS; };
})(typeof window !== 'undefined' ? window : globalThis);
