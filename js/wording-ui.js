/*
  wording-ui.js - the Wording tab: plan exactly what the system says in every situation.

  What it is for: one card per situation, in the order a session unfolds. Each card says when it
  plays and when it never plays, lets you write the lines (one per line; the system rotates
  through them), play one aloud, and restore the defaults. Below the cards is the list of
  moments where the system deliberately stays silent, so every outcome is covered.

  How it fits: edits go to wording.js, which saves them in this browser. The engine reads them
  the next time it speaks, even mid-session.
*/
(function () {
  var VS = window.VS;
  var SAMPLE = { minutes: 'ten minutes', thoughts: 'seven thoughts', goal: 'the move', topic: 'the garden plans' };

  VS.initWordingUi = function (wording, cfg) {
    var box = document.getElementById('wordingCards');
    if (!box) { return; }
    var hearTurn = {};

    function make(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) { e.className = cls; }
      if (text !== undefined) { e.textContent = text; }
      return e;
    }
    function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

    function warningsFor(sit, lines) {
      var w = [];
      if (!lines.length) { w.push(sit.required ? 'This needs at least one line.' : 'No lines: the system will stay quiet in this situation.'); }
      lines.forEach(function (l) {
        var n = l.split(/\s+/).length;
        if (n > 16) { w.push('"' + l.slice(0, 40) + '..." is ' + n + ' words, likely longer than 6 seconds to say.'); }
        var blanks = (l.match(/\{(\w+)\}/g) || []).map(function (b) { return b.slice(1, -1); });
        blanks.forEach(function (b) {
          if (sit.blanks.indexOf(b) < 0) { w.push('"{' + b + '}" is not a blank this situation can fill' + (sit.blanks.length ? ' (it can use: ' + sit.blanks.map(function (x) { return '{' + x + '}'; }).join(', ') + ')' : '') + '. That line will never be said.'); }
        });
        if (/\?\s*$/.test(l) && (sit.id === 'emotional' || sit.id === 'back-after-unanswered')) {
          w.push('"' + l.slice(0, 40) + '" is a question. This situation is meant to never ask one.');
        }
      });
      return w;
    }

    function card(sit) {
      var c = make('section', 'sit' + (sit.status === 'later' ? ' later' : ''));
      c.id = 'sit-' + sit.id;
      var h = make('h3', '', sit.title);
      var tagLater = make('span', 'tag', 'not used yet');
      var tagEdited = make('span', 'tag edited', 'your wording');
      if (sit.status === 'later') { h.appendChild(tagLater); }
      h.appendChild(tagEdited);
      c.appendChild(h);
      var p1 = make('p'); p1.appendChild(make('strong', '', 'Plays when: ')); p1.appendChild(document.createTextNode(sit.when)); c.appendChild(p1);
      var p2 = make('p'); p2.appendChild(make('strong', '', 'Never when: ')); p2.appendChild(document.createTextNode(sit.never)); c.appendChild(p2);
      if (sit.blanks.length) { c.appendChild(make('p', 'small', 'Blanks you can use: ' + sit.blanks.map(function (b) { return '{' + b + '}'; }).join(', ') + '. They are filled in when the line is said.')); }
      if (sit.later) { c.appendChild(make('p', 'small', 'Not used yet: ' + sit.later + ' You can write the lines now.')); }

      var ta = make('textarea');
      ta.setAttribute('aria-label', 'Lines for ' + sit.title);
      ta.spellcheck = true;
      c.appendChild(ta);
      c.appendChild(make('p', 'small', 'One line per way of saying it. The system rotates through them so it never sounds scripted.'));

      var row = make('div', 'row');
      var hear = make('button', 'btn small', 'Hear a line'); hear.type = 'button';
      var restore = make('button', 'btn small quiet', 'Restore default'); restore.type = 'button';
      var msg = make('span', 'small msg');
      row.appendChild(hear); row.appendChild(restore); row.appendChild(msg);
      c.appendChild(row);
      var warn = make('ul', 'warn'); c.appendChild(warn);

      function refresh() {
        var lines = wording.lines(sit.id);
        ta.value = lines.join('\n');
        ta.rows = Math.max(2, Math.min(8, lines.length + 1));
        tagEdited.hidden = !wording.isEdited(sit.id);
        restore.disabled = !wording.isEdited(sit.id);
        showWarnings(lines);
      }
      function showWarnings(lines) {
        warn.textContent = '';
        warningsFor(sit, lines).forEach(function (t) { warn.appendChild(make('li', '', t)); });
      }
      ta.addEventListener('input', function () {
        showWarnings(ta.value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean));
        msg.textContent = 'Not saved yet (click outside the box to save)';
      });
      ta.addEventListener('change', function () {
        var r = wording.set(sit.id, ta.value);
        if (r.ok) { refresh(); msg.textContent = 'Saved'; } else { refresh(); msg.textContent = r.message + ' Your previous lines are kept.'; }
      });
      hear.addEventListener('click', function () {
        var lines = ta.value.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
        if (!lines.length) { msg.textContent = 'No lines to play.'; return; }
        var i = (hearTurn[sit.id] || 0) % lines.length; hearTurn[sit.id] = i + 1;
        var text = VS.fillTemplate(lines[i], SAMPLE);
        msg.textContent = 'Playing: "' + text + '"';
        var r = VS.previewLine(cfg, text, function (problem) { msg.textContent = problem ? problem : ''; });
        if (!r.ok) { msg.textContent = 'No voice available. The line would be: "' + text + '"'; }
      });
      restore.addEventListener('click', function () { wording.reset(sit.id); refresh(); msg.textContent = 'Back to the default wording'; });
      refresh();
      c.__refresh = refresh;
      return c;
    }

    function build() {
      box.textContent = '';
      var jump = document.getElementById('wordingJump');
      jump.textContent = '';
      VS.SITUATION_GROUPS.forEach(function (g) {
        var a = make('a', '', g); a.href = '#grp-' + slug(g); jump.appendChild(a);
        var head = make('h2', 'grp', g); head.id = 'grp-' + slug(g); box.appendChild(head);
        VS.SITUATIONS.filter(function (s) { return s.group === g; }).forEach(function (s) { box.appendChild(card(s)); });
      });
      var a2 = make('a', '', 'When it stays silent'); a2.href = '#grp-silent'; jump.appendChild(a2);
      var sh = make('h2', 'grp', 'When the system stays silent (no wording needed)'); sh.id = 'grp-silent'; box.appendChild(sh);
      var table = make('table', 'silent');
      VS.SILENT_OUTCOMES.forEach(function (r) {
        var tr = make('tr'); tr.appendChild(make('th', '', r[0])); tr.appendChild(make('td', '', r[1])); table.appendChild(tr);
      });
      box.appendChild(table);
    }
    build();

    function note(t) { document.getElementById('wordingMsg').textContent = t; }

    document.getElementById('wordingExport').addEventListener('click', function () {
      var blob = new Blob([wording.exportJson()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'voice-space-wording.json';
      document.body.appendChild(a); a.click(); a.remove();
      note('Saved a copy of all wording as voice-space-wording.json in your Downloads.');
    });
    document.getElementById('wordingImport').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) { return; }
      f.text().then(function (t) { var r = wording.importJson(t); note(r.message); build(); });
      ev.target.value = '';
    });
    document.getElementById('wordingReset').addEventListener('click', function () {
      if (!window.confirm || window.confirm('Put every situation back to the default wording?')) { wording.resetAll(); build(); note('All wording is back to the defaults.'); }
    });
  };
})();
