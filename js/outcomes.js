/*
  outcomes.js - shows the sorted transcript after you save a session.

  What it is for: when a session is saved, this runs the sort and shows the answer exactly in the
  shape your prompt asks for: the table (order, timestamp, category, item, status, exact excerpt,
  paraphrase, linked items, confidence), then unclassified passages, the category count and the
  note. With an Anthropic key it shows the offline language processor's sort straight away and
  replaces it with Claude's when that arrives. "Copy table" and "Download" give the same content
  as Markdown, to paste into your notes.

  How it fits: live-ui.js calls VS.initOutcomes(cfg) once, then outcomes.run({ startWall,
  utterances }) when a session ends. Nothing here changes the session.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  var HEAD = ['Order', 'Timestamp', 'Primary category', 'Item', 'Status', 'Exact transcript excerpt', 'Polished paraphrase', 'Linked items', 'Confidence'];

  function cell(s) { return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n+/g, ' '); }

  /* The result as Markdown: the table, then the three sections, in your prompt's order. */
  VS.extractionMarkdown = function (r, meta) {
    meta = meta || {};
    var lines = [];
    lines.push('# Sorted thoughts' + (meta.when ? ' (' + meta.when + ')' : ''));
    lines.push('');
    lines.push('Sorted by ' + (r.engine === 'claude' ? 'Claude (' + (r.model || '') + ')' : 'the offline language processor') + '.');
    lines.push('');
    lines.push('| ' + HEAD.join(' | ') + ' |');
    lines.push('|' + HEAD.map(function () { return '---'; }).join('|') + '|');
    r.items.forEach(function (it) {
      lines.push('| ' + [
        it.order, it.timestamp || 'not available', it.category, cell(it.item), it.status,
        it.excerpts.map(function (e) { return '"' + cell(e) + '"'; }).join(' / '),
        it.paraphrase ? 'paraphrase: ' + cell(it.paraphrase) : '',
        it.links.length ? it.links.join(', ') : '',
        it.confidence + (it.confidence === 'low' && it.confidenceReason ? ' (' + cell(it.confidenceReason) + ')' : '')
      ].join(' | ') + ' |');
    });
    if (!r.items.length) { lines.push('| | | | No items found | | | | | |'); }
    lines.push('');
    lines.push('## Unclassified but potentially relevant passages');
    if (!r.unclassified.length) { lines.push('- None.'); }
    r.unclassified.forEach(function (u) { lines.push('- ' + (u.timestamp ? '[' + u.timestamp + '] ' : '') + '"' + u.excerpt + '": ' + u.reason); });
    lines.push('');
    lines.push('## Category count');
    VS.CATEGORIES.forEach(function (c) { lines.push('- ' + c + ': ' + (r.counts[c] || 0)); });
    lines.push('');
    lines.push('## Note');
    lines.push(r.note || 'None.');
    return lines.join('\n');
  };

  VS.initOutcomes = function (cfg) {
    function $(id) { return document.getElementById(id); }
    var sheet = $('sortScrim'), body = $('sortBody'), status = $('sortStatus'), last = null, lastMeta = null, runId = 0;

    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (text != null) { e.textContent = text; } return e; }

    function render(r, meta) {
      last = r; lastMeta = meta;
      body.textContent = '';
      $('sortBy').textContent = r.engine === 'claude' ? 'Sorted by Claude (' + r.model + ') with your prompt' : 'Sorted offline by the language processor';
      // category count, including zeros
      var counts = el('div', 'sort-counts');
      VS.CATEGORIES.forEach(function (c) {
        var chip = el('span', 'sort-chip ' + c.toLowerCase());
        chip.appendChild(el('b', null, String(r.counts[c] || 0)));
        chip.appendChild(document.createTextNode(' ' + c.toLowerCase()));
        counts.appendChild(chip);
      });
      body.appendChild(counts);
      // the table
      var wrap = el('div', 'sort-table-wrap');
      var table = el('table', 'sort-table');
      var thead = el('thead'), hr = el('tr');
      HEAD.forEach(function (h) { hr.appendChild(el('th', null, h)); });
      thead.appendChild(hr); table.appendChild(thead);
      var tb = el('tbody');
      r.items.forEach(function (it, i) {
        var tr = el('tr', 'cat-' + it.category.toLowerCase());
        tr.style.animationDelay = Math.min(i * 40, 600) + 'ms';
        tr.appendChild(el('td', 'num', String(it.order)));
        tr.appendChild(el('td', 'num', it.timestamp || 'not available'));
        var cat = el('td'); cat.appendChild(el('span', 'cat', it.category)); tr.appendChild(cat);
        tr.appendChild(el('td', 'item', it.item));
        tr.appendChild(el('td', 'status', it.status));
        var ex = el('td', 'excerpt');
        it.excerpts.forEach(function (e, j) {
          var q = el('q', it.excerptFound && it.excerptFound[j] === false ? 'not-found' : null, e);
          if (it.excerptFound && it.excerptFound[j] === false) { q.title = 'These words were not found exactly in the transcript.'; }
          ex.appendChild(q);
        });
        tr.appendChild(ex);
        var para = el('td', 'para');
        if (it.paraphrase) { para.appendChild(el('span', 'para-label', 'paraphrase')); para.appendChild(document.createTextNode(' ' + it.paraphrase)); }
        tr.appendChild(para);
        tr.appendChild(el('td', 'num', it.links.join(', ')));
        var conf = el('td', 'conf ' + it.confidence, it.confidence);
        if (it.confidence === 'low' && it.confidenceReason) { conf.appendChild(el('span', 'why', it.confidenceReason)); }
        tr.appendChild(conf);
        tb.appendChild(tr);
      });
      if (!r.items.length) { var none = el('tr'); var td = el('td', 'empty', 'Nothing in this transcript was clear enough to sort.'); td.colSpan = HEAD.length; none.appendChild(td); tb.appendChild(none); }
      table.appendChild(tb); wrap.appendChild(table); body.appendChild(wrap);
      // after the table
      var un = el('section', 'sort-sec');
      un.appendChild(el('h3', null, 'Unclassified but potentially relevant passages'));
      if (!r.unclassified.length) { un.appendChild(el('p', 'muted', 'None.')); }
      else {
        var ul = el('ul');
        r.unclassified.forEach(function (u) {
          var li = el('li');
          if (u.timestamp) { li.appendChild(el('span', 'num', u.timestamp + ' ')); }
          li.appendChild(el('q', null, u.excerpt)); li.appendChild(document.createTextNode(' ' + u.reason));
          ul.appendChild(li);
        });
        un.appendChild(ul);
      }
      body.appendChild(un);
      var note = el('section', 'sort-sec');
      note.appendChild(el('h3', null, 'Note'));
      note.appendChild(el('p', null, r.note || 'None.'));
      if (r.items.some(function (it) { return it.excerptFound && it.excerptFound.indexOf(false) >= 0; })) {
        note.appendChild(el('p', 'warn-line', 'Underlined excerpts were not found word for word in the transcript; check them before relying on them.'));
      }
      body.appendChild(note);
      $('sortCopy').disabled = false; $('sortDownload').disabled = false;
      $('sortPrompt').hidden = !r.prompt;
      $('sortReopen').hidden = false;
    }

    function open() { sheet.hidden = false; $('sortClose').focus(); }
    function close() { sheet.hidden = true; }

    var api;
    api = {
      /* Sort a finished session. input: { startWall, utterances: [{ startT, endT, text }] } */
      run: function (input, opts) {
        opts = opts || {};
        // First, the accurate pass (the whole session, re-transcribed), if there is sound for it.
        if (cfg.get('sttAccuratePass') && input.recording && input.recording.chunks && input.recording.chunks.length && VS.accurateTranscript) {
          opts.allStretches = input.utterances; // includes heard stretches with no live words yet
          body.textContent = ''; open();
          $('sortBy').textContent = ''; $('sortCopy').disabled = true; $('sortDownload').disabled = true; $('sortPrompt').hidden = true;
          status.textContent = 'Making a more accurate transcript of the whole session...';
          status.classList.add('busy');
          var rec = input.recording;
          input = { startWall: input.startWall, utterances: input.utterances.filter(function (u) { return String(u.text || '').trim(); }) };
          var withHeard = opts.allStretches || input.utterances;
          return VS.accurateTranscript(cfg, { startWall: input.startWall, utterances: withHeard, recording: rec }).then(function (r) {
            status.classList.remove('busy');
            if (opts.onImproved) { opts.onImproved(r.utterances); }
            return api.run({ startWall: input.startWall, utterances: r.utterances.filter(function (u) { return String(u.text || '').trim(); }).map(function (u) { return { startT: u.startT, endT: u.endT, text: u.text }; }), accurate: r }, { note: 'Accurate transcript: ' + r.improved + ' stretch' + (r.improved === 1 ? '' : 'es') + ' re-transcribed by ElevenLabs Scribe v2.' });
          }, function (e) {
            status.classList.remove('busy');
            return api.run(input, { note: e && e.plain ? e.plain : 'The accurate transcript did not work, so the live words are used.' });
          });
        }
        var engine = cfg.get('extractionEngine');
        if (engine === 'off') { if (opts.note) { open(); status.textContent = opts.note; } return Promise.resolve(null); }
        var preface = opts.note ? opts.note + ' ' : '';
        var mine = ++runId;
        var meta = { when: input.startWall ? new Date(input.startWall).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '' };
        var hasText = (input.utterances || []).some(function (u) { return String(u.text || '').trim(); });
        body.textContent = '';
        open();
        if (!hasText) {
          status.textContent = preface + 'Nothing was said this session, so there is nothing to sort.';
          $('sortBy').textContent = ''; $('sortCopy').disabled = true; $('sortDownload').disabled = true; $('sortPrompt').hidden = true;
          return Promise.resolve(null);
        }
        var claudeKey = !!VS.keys.get(cfg, 'anthropic');
        var useClaude = engine === 'claude' || (engine === 'auto' && claudeKey);
        var offline = engine !== 'claude' || !claudeKey;
        if (offline || useClaude) {
          // the offline sort is instant, so show it first (also the fallback if Claude fails)
          var quick = VS.nlpExtract(input, { passageGapMs: cfg.get('passageGapMs') });
          render(quick, meta);
        }
        if (!useClaude) {
          status.textContent = preface + (engine === 'claude' ? 'No Anthropic key loaded, so this is the offline sort. Add ANTHROPIC_API_KEY to your .env file to use Claude.' : '');
          return Promise.resolve(last);
        }
        status.textContent = preface + 'Claude is reading the transcript with your prompt...';
        status.classList.add('busy');
        return VS.claudeExtract(cfg, input).then(function (r) {
          if (mine !== runId) { return r; }
          status.classList.remove('busy'); status.textContent = preface.trim();
          render(r, meta);
          return r;
        }, function (e) {
          if (mine !== runId) { return null; }
          status.classList.remove('busy');
          status.textContent = preface + (e && e.plain ? e.plain : 'Claude could not sort this session.') + ' Showing the offline sort.';
          return last;
        });
      },
      open: open, close: close, last: function () { return last; }
    };

    $('sortClose').addEventListener('click', close);
    $('sortReopen').addEventListener('click', function () { if (last) { open(); } });
    sheet.addEventListener('click', function (e) { if (e.target === sheet) { close(); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) { close(); } });
    $('sortCopy').addEventListener('click', function () {
      if (!last) { return; }
      var md = VS.extractionMarkdown(last, lastMeta);
      (navigator.clipboard ? navigator.clipboard.writeText(md) : Promise.reject()).then(function () { if (VS.toast) { VS.toast('Table copied'); } }, function () {
        var ta = document.createElement('textarea'); ta.value = md; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); if (VS.toast) { VS.toast('Table copied'); } } catch (err) { /* nothing more to try */ }
        ta.remove();
      });
    });
    $('sortDownload').addEventListener('click', function () {
      if (!last) { return; }
      var blob = new Blob([VS.extractionMarkdown(last, lastMeta)], { type: 'text/markdown' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'sorted-thoughts-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.md';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    });
    $('sortPrompt').addEventListener('click', function () {
      if (!last || !last.prompt) { return; }
      var w = $('sortPromptText'); w.textContent = last.prompt; w.hidden = !w.hidden;
    });
    return api;
  };
})(typeof window !== 'undefined' ? window : globalThis);
