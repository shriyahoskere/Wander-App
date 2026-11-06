/*
  live-ui.js - the Session screen.

  What it is for: it shows what the live session is doing and turns your clicks into session
  actions. The big picture is the water from the Figma design (seascape.js): calm, small waves
  while you speak, higher waves while you are quiet, complete stillness when stopped, and a paper
  boat that sails in for each captured thought and every so many words. Everything else is in the
  dashboard beside it: voice detection first, then your words, what the system is doing, the
  controls, the Captured list, and your sound files and key.

  How it fits: all the real work is in live.js. This file only touches the page.
*/
(function () {
  var VS = window.VS;

  var HEADLINE = { Idle: 'Here when you\'re ready', Listening: 'Listening', PauseWindow: 'Quiet', Prompting: 'Speaking', Snoozed: 'Snoozed', Stopped: 'Stopped' };
  var KIND_LABEL = { reflection: 'Reflection', task: 'Task', goal: 'Goal', concept: 'Concept', story: 'Story', quote: 'Quote' };

  VS.initLiveUi = function (cfg) {
    function $(id) { return document.getElementById(id); }
    function toast(t) { if (VS.toast) { VS.toast(t); } }
    var logBox = $('audioLog'), stage = $('stage');
    var sea = VS.createSeascape($('seaCanvas'), cfg);
    VS.sea = sea; // for checking things from the browser's developer console
    // What moves the waves: your voice while you speak, the ocean (and the system's voice) while
    // you are quiet. With the microphone off, holding "Hold to talk" makes a gentle pretend voice.
    function clamp01(x) { return Math.max(0, Math.min(1, x)); }
    sea.setLevelSource(function () {
      var L = session && session.levels ? session.levels() : null;
      if (!L) { return 0; }
      if (L.speaking) {
        if (L.voiceDb != null) { return clamp01((L.voiceDb - L.voiceOffDb) / 28); }
        var t = Date.now() / 1000;
        return 0.45 + 0.3 * Math.sin(t * 5.3) * Math.sin(t * 1.7);
      }
      // The ocean: follow its swells, measured against its own recent average, so a quiet or a
      // loud recording both move the waves.
      if (!isFinite(L.outputDb)) { return 0; }
      var now = Date.now(), dt = oceanAvgAt ? Math.min(1, (now - oceanAvgAt) / 1000) : 1;
      oceanAvgAt = now;
      // (start from the first real reading, and catch up at once after a fade-in or a big change)
      if (oceanAvg == null || Math.abs(L.outputDb - oceanAvg) > 12) { oceanAvg = L.outputDb; }
      else { oceanAvg += (L.outputDb - oceanAvg) * (1 - Math.exp(-dt / 4)); }
      return clamp01(0.35 + (L.outputDb - oceanAvg) / 7);
    });
    var oceanAvg = null, oceanAvgAt = 0;

    // ---- boats for words: one every N words you say (Settings, "The water on screen") ----
    var wordsCommitted = 0, wordsPartial = 0, wordBoats = 0;
    function countWords(t) { var m = String(t || '').match(/[A-Za-z0-9\u00C0-\uFFFF']+/g); return m ? m.length : 0; }
    function checkWordBoats() {
      var n = cfg.get('boatEveryWords');
      if (!n || n <= 0 || !cfg.get('showBoats')) { return; }
      var due = Math.floor((wordsCommitted + wordsPartial) / n);
      while (wordBoats < due) { wordBoats++; sea.addBoat('words'); }
    }
    function resetSea() { sea.clear(); wordsCommitted = 0; wordsPartial = 0; wordBoats = 0; runMs = 0; lastTick = 0; }

    // ---- the little white note on the water ("mic has been turned on") ----
    var toastTimer = null;
    function seaToast(text) {
      var el = $('seaToast');
      el.textContent = text; el.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3200);
    }

    // ---- session time (stopped time does not count) ----
    var runMs = 0, lastTick = 0;
    function hms(ms) {
      var t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, x = t % 60;
      return [h, m, x].map(function (v) { return (v < 10 ? '0' : '') + v; }).join(':');
    }

    function addLine(text, kind) {
      var d = document.createElement('div');
      d.className = 'line ' + kind; d.textContent = text;
      logBox.appendChild(d); logBox.scrollTop = logBox.scrollHeight;
    }

    function pct(db) { return Math.max(0, Math.min(100, (db + 90) / 90 * 100)); }
    function clock(ms) { return VS.fmtClock(ms).replace(/^00:/, ''); }

    // ---- copying (hover a line for its copy button; "Copy all" in each header) ----
    function copyText(text, what) {
      var done = function () { toast((what || 'Text') + ' copied'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(done, function () { fallback(); });
      }
      fallback();
      function fallback() {
        var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast('Could not copy'); }
        ta.remove();
      }
    }
    function copyButton(getText, what) {
      var b = document.createElement('button');
      b.className = 'copy-btn'; b.title = 'Copy'; b.type = 'button';
      b.innerHTML = '<span class="msym" aria-hidden="true">content_copy</span><span class="sr-only">Copy</span>';
      b.addEventListener('click', function (e) {
        e.stopPropagation(); copyText(getText(), what);
        b.classList.add('copied'); b.querySelector('.msym').textContent = 'check';
        setTimeout(function () { b.classList.remove('copied'); b.querySelector('.msym').textContent = 'content_copy'; }, 1200);
      });
      return b;
    }
    function wordLine(text) {
      var p = document.createElement('p'); p.className = 'line-copy';
      var t = document.createElement('span'); t.className = 'txt'; t.textContent = text;
      p.appendChild(t); p.appendChild(copyButton(function () { return t.textContent; }, 'Line'));
      return p;
    }

    // ---- live words ----
    var wordsBox = $('words'), partialEl = null, asleepNote = null;
    function clearPlaceholder() { var ph = wordsBox.querySelector('.placeholder'); if (ph) { ph.remove(); } }
    function words(text, final, asleep) {
      if (text === null) { wordsPartial = 0; if (partialEl) { partialEl.remove(); partialEl = null; } return; } // words in progress were lost
      if (!asleep) {
        if (final) { wordsCommitted += countWords(text); wordsPartial = 0; } else { wordsPartial = countWords(text); }
        checkWordBoats();
      }
      clearPlaceholder();
      if (asleep) {
        // While snoozed, nothing you say is shown or kept: only a quiet reminder.
        if (partialEl) { partialEl.remove(); partialEl = null; }
        if (!asleepNote) { asleepNote = document.createElement('p'); asleepNote.className = 'asleep'; wordsBox.appendChild(asleepNote); }
        asleepNote.textContent = 'Snoozed. Nothing is kept; only "resume" is listened for.';
        return;
      }
      if (!final) {
        if (!partialEl) { partialEl = document.createElement('p'); partialEl.className = 'partial'; wordsBox.appendChild(partialEl); }
        partialEl.textContent = text;
      } else {
        if (partialEl) { partialEl.remove(); partialEl = null; }
        wordsBox.appendChild(wordLine(text));
      }
      wordsBox.scrollTop = wordsBox.scrollHeight;
    }

    // ---- captured thoughts ----
    var capList = $('captured'), capCount = $('capCount');
    function setCount(n) {
      capCount.textContent = String(n);
      capCount.classList.remove('bump'); void capCount.offsetWidth; capCount.classList.add('bump');
      setTimeout(function () { capCount.classList.remove('bump'); }, 260);
    }
    function addThought(item, count) {
      var empty = capList.querySelector('.empty');
      if (empty) { empty.remove(); }
      var li = document.createElement('li');
      li.className = 'cap ' + item.kind; li.id = 'cap-' + item.id;
      var dot = document.createElement('span'); dot.className = 'dot';
      var kind = document.createElement('span'); kind.className = 'kind'; kind.textContent = KIND_LABEL[item.kind] || item.kind;
      var time = document.createElement('time'); time.textContent = clock(item.endT);
      var p = document.createElement('p'); p.textContent = item.text;
      li.appendChild(dot); li.appendChild(kind); li.appendChild(time); li.appendChild(p);
      li.appendChild(copyButton(function () { return item.text; }, KIND_LABEL[item.kind] || 'Thought'));
      li.setAttribute('data-kind', item.kind); li.__text = item.text;
      capList.appendChild(li);
      capList.scrollTop = capList.scrollHeight;
      setCount(count);
      if (cfg.get('showBoats')) { showTag(item.kind, sea.addBoat('thought', item.id)); }
    }

    // ---- tags on the water: what happened to each thought, rising from its boat ----
    var tags = [], tagLoop = 0;
    function showTag(kind, boat) {
      var el = VS.tagEl(kind);
      el.classList.add(boat ? 'on-boat' : 'no-boat');
      stage.appendChild(el);
      var tag = { el: el, boat: boat, born: Date.now() };
      tags.push(tag);
      setTimeout(function () { el.classList.add('fade'); }, cfg.get('tagShowMs'));
      setTimeout(function () { el.remove(); tags = tags.filter(function (t) { return t !== tag; }); }, cfg.get('tagShowMs') + 700);
      placeTags();
    }
    function placeTags() {
      cancelAnimationFrame(tagLoop);
      tags.forEach(function (t) {
        var p = t.boat ? sea.positionOf(t.boat) : null;
        if (!p) { return; }
        // keep the tag on the screen, just above its boat
        var w = t.el.offsetWidth || 160;
        var x = Math.max(12, Math.min(p.w - w - 12, p.x - w / 2));
        var y = Math.max(12, p.y - p.h * 0.07 - 44); // just above the (smaller) boat
        t.el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
      });
      if (tags.length) { tagLoop = requestAnimationFrame(placeTags); }
    }
    function clearTags() { tags.forEach(function (t) { t.el.remove(); }); tags = []; }
    function removeThoughts(ids) {
      sea.removeTagged(ids);
      ids.forEach(function (id) {
        var li = $('cap-' + id);
        if (li) { li.classList.add('leaving'); setTimeout(function () { li.remove(); }, 420); }
      });
      setTimeout(function () { setCount(capList.querySelectorAll('.cap:not(.leaving)').length); }, 430);
    }
    function resetCaptured() {
      capList.textContent = '';
      var li = document.createElement('li'); li.className = 'empty';
      li.textContent = 'Each thought you finish lands here as a reflection, a task or a goal, with a tiny sound.';
      capList.appendChild(li);
      capCount.textContent = '0';
    }

    // ---- the tide and the state line ----
    function friendly(st) {
      var e = st.engine;
      if (e.state === 'Listening') { return 'Go ahead. Nothing will interrupt you.'; }
      if (e.state === 'Prompting') { return ''; }
      if (e.state === 'Snoozed') { return 'Back in ' + clock(e.snoozeLeftMs) + '. Say "resume" to come back sooner.'; }
      if (e.state === 'Stopped') { return 'Saved. Say "resume" to undo, or start a new session.'; }
      if (e.phase === 'opener') { return 'Take your time. Nothing will be said for at least a minute.'; }
      if (e.phase === 'buffer') { return 'Taking a breath...'; }
      if (e.phase === 'wait') { return 'Quiet for ' + Math.floor(e.waitedMs / 1000) + ' s. Take all the time you need.'; }
      if (e.phase === 'done') { return 'Staying quiet until you speak.'; }
      return '';
    }

    // The water: calm while you speak, higher waves while quiet, still when stopped or snoozed.
    var SEA_TITLE = { Idle: 'Listening', Listening: 'Listening', PauseWindow: 'Listening', Prompting: 'Listening', Snoozed: 'Snoozed', Stopped: 'Stopped' };
    function paintSea(st) {
      var e = st.engine;
      var speaking = e.state === 'Listening';
      var mode = (e.state === 'Stopped' || e.state === 'Snoozed') ? 'still' : (speaking ? 'calm' : 'rough');
      sea.setMode(mode);
      stage.setAttribute('data-mode', mode);
      stage.setAttribute('data-run', 'on');
      stage.setAttribute('data-speaking', speaking ? '1' : '0');
      $('seaState').textContent = SEA_TITLE[e.state] || e.state;
      $('seaHint').classList.toggle('gone', sea.count() > 0 || e.state !== 'Idle');
      var now = Date.now();
      if (lastTick && e.state !== 'Stopped') { runMs += now - lastTick; }
      lastTick = now;
      $('seaTimer').textContent = hms(runMs);
      var btn = $('seaStopStart');
      var label = e.state === 'Stopped' ? 'Start' : (e.state === 'Snoozed' ? 'Resume' : 'Stop');
      if (btn.textContent !== label) { btn.textContent = label; }
      btn.classList.toggle('start', label !== 'Stop');
      lastEngineState = e.state;
    }
    var lastEngineState = null;

    var ui = {
      log: addLine,
      words: words,
      thought: addThought,
      scratchThoughts: removeThoughts,
      sessionEvent: function (type) { if (type === 'sessionStarted') { resetCaptured(); resetSea(); } },
      sttStatus: function (text) { $('sttStatus').textContent = text; },
      clip: function (text) { $('audioClip').textContent = text ? '"' + text + '"' : ''; },
      cue: function () {},
      cues: function (c) { showCueSources(c.promptSource, c.savedSource, c.recordSource); },
      voiceStatus: function (text) { $('voiceStatus').textContent = text; $('voiceStatus').title = text; },
      problem: function (text) { var p = $('audioProblem'); p.textContent = text || ''; p.hidden = !text; },
      ocean: function (text, kind) {
        $('oceanSource').textContent = text; $('oceanSource').title = text;
        $('oceanReset').hidden = kind !== 'file';
      },
      status: function (s) {
        var e = s.engine;
        if (e.state !== 'Snoozed' && asleepNote) { asleepNote.remove(); asleepNote = null; }
        $('stateLine').textContent = HEADLINE[e.state] || e.state;
        $('recPill').classList.toggle('on', e.state === 'Listening');
        $('stateSub').textContent = friendly(s);
        paintSea(s);
        $('audioState').textContent = e.state;
        $('audioCountdown').textContent = VS.countdownLine(e) || ' ';
        var oceanPct = Math.round(s.oceanGain * 100);
        $('oceanMeter').style.width = Math.min(100, oceanPct) + '%';
        $('oceanText').textContent = 'ocean ' + oceanPct + '% (' + ({ 'in': 'normal', up: 'rising back', duck: 'ducked while you speak', clipDuck: 'under a spoken line', out: 'faded out', silent: 'silent' }[s.oceanLevel] || s.oceanLevel) + ')';
        if (s.vad) {
          $('micMeter').style.width = pct(s.vad.levelDb) + '%';
          $('micOn').hidden = false; $('micOn').style.left = pct(s.vad.onDb) + '%';
          $('micText').textContent = s.vad.calibrating ? 'learning the room noise...' :
            (s.vad.speaking ? 'speaking' : 'quiet') + ' (level ' + Math.round(s.vad.levelDb) + ' dB, speech starts above ' + Math.round(s.vad.onDb) + ' dB' + (s.vad.gateDb ? ', less sensitive while the system speaks' : '') + ')';
          $('micMeter').className = s.vad.speaking ? 'loud' : '';
        } else {
          $('micText').textContent = 'microphone off: hold to talk, or type';
          $('micMeter').style.width = e.state === 'Listening' ? '62%' : '0';
          $('micMeter').className = e.state === 'Listening' ? 'loud' : '';
          $('micOn').hidden = true; // no microphone: no speech threshold to show
        }
        // front and centre: is the system hearing speech right now?
        var speaking = s.vad ? s.vad.speaking : e.state === 'Listening';
        var det = e.state === 'Snoozed' ? ['Snoozed: not listening', 'off'] : e.state === 'Stopped' ? ['Stopped', 'off'] :
          (s.vad && s.vad.calibrating) ? ['Learning the room\'s quiet', 'off'] : speaking ? ['Speech detected', 'speaking'] : ['Quiet', 'quiet'];
        $('detLabel').textContent = det[0];
        $('detDot').className = 'det-dot ' + det[1];
      }
    };

    var session = VS.createLiveSession(cfg, ui);
    window.__vsLive = session; // for checking things from the browser's developer console

    function setRunning(on) {
      $('audioStart').disabled = on; $('audioEnd').disabled = !on; $('useMic').disabled = on;
      $('saveBar').disabled = !on;
      ['audioSend', 'audioText', 'holdTalk'].forEach(function (id) { $(id).disabled = !on; });
      Array.prototype.forEach.call(document.querySelectorAll('#audioCmds button'), function (b) { b.disabled = !on; });
    }
    setRunning(false);

    $('audioStart').addEventListener('click', function () {
      logBox.textContent = '';
      wordsBox.textContent = ''; partialEl = null; asleepNote = null;
      resetCaptured(); resetSea(); clearTags();
      setRunning(true);
      $('stateLine').textContent = 'Starting...';
      $('seaState').textContent = 'Starting';
      var useMic = $('useMic').checked;
      session.start({ useMic: useMic }).then(function () {
        if (!session.running()) { return; }
        seaToast(useMic ? 'mic has been turned on' : 'mic is off: use Hold to talk, or type');
      }).catch(function (err) {
        ui.problem(err.message); setRunning(false); seaOff('Ready');
      });
    });
    function seaOff(title) {
      sea.setMode('still');
      stage.setAttribute('data-mode', 'still'); stage.setAttribute('data-run', 'off'); stage.setAttribute('data-speaking', '0');
      $('seaState').textContent = title;
      $('seaStopStart').textContent = 'Start'; $('seaStopStart').classList.add('start');
      lastTick = 0;
    }
    $('copyWords').addEventListener('click', function () {
      var lines = Array.prototype.map.call(wordsBox.querySelectorAll('p.line-copy .txt'), function (x) { return x.textContent; });
      if (!lines.length) { toast('Nothing to copy yet'); return; }
      copyText(lines.join('\n'), 'Transcript');
    });
    function capturedItems() { return Array.prototype.filter.call(capList.querySelectorAll('li.cap'), function (li) { return !li.classList.contains('leaving'); }); }
    $('copyCaptured').addEventListener('click', function () {
      var items = capturedItems();
      if (!items.length) { toast('Nothing captured yet'); return; }
      copyText(items.map(function (li) { return (KIND_LABEL[li.getAttribute('data-kind')] || 'Thought') + ': ' + li.__text; }).join('\n'), 'Captured thoughts');
    });
    $('copyTasks').addEventListener('click', function () {
      var tasks = capturedItems().filter(function (li) { return li.getAttribute('data-kind') === 'task'; });
      if (!tasks.length) { toast('No tasks captured yet'); return; }
      copyText(tasks.map(function (li) { return '- [ ] ' + li.__text; }).join('\n'), 'Tasks');
    });

    // the accurate pass: when it arrives, "What you said" shows the improved words
    function showImproved(utts) {
      wordsBox.textContent = ''; partialEl = null; asleepNote = null;
      var note = document.createElement('p'); note.className = 'improved-note';
      note.textContent = 'Accurate transcript (re-transcribed when you saved)';
      wordsBox.appendChild(note);
      utts.forEach(function (u) { if (String(u.text || '').trim()) { var l = wordLine(u.text); if (u.improved) { l.classList.add('improved'); } wordsBox.appendChild(l); } });
      $('sttStatus').textContent = 'Words: accurate pass done';
    }

    // your word list for the transcription
    var kt = $('keytermsInput');
    kt.value = cfg.get('sttKeyterms');
    kt.addEventListener('change', function () { cfg.set('sttKeyterms', kt.value); toast(session.running() ? 'Word list saved: used from the next session and for the accurate pass' : 'Word list saved'); });

    // ---- sorting the transcript when a session ends (your extraction prompt) ----
    var outcomes = VS.initOutcomes ? VS.initOutcomes(cfg) : null;
    VS.outcomes = outcomes;

    $('audioEnd').addEventListener('click', function () {
      var transcript = session.transcript ? session.transcript() : null;
      session.end(); setRunning(false); clearTags();
      if (outcomes && transcript) { outcomes.run(transcript, { onImproved: showImproved }); }
      seaOff('Saved');
      $('stateLine').textContent = 'Session ended';
      $('stateSub').textContent = 'Your captured thoughts stay on screen until you start again.';
      $('audioState').textContent = 'Ended'; $('audioCountdown').textContent = ' ';
    });

    // ---- the controls on the water ----
    // Stop / Start: Stop is the same as saying "stop" (the water goes still). Start begins a session,
    // or, once stopped or snoozed, is the same as saying "resume".
    $('seaStopStart').addEventListener('click', function () {
      if (!session.running()) { $('audioStart').click(); return; }
      if (lastEngineState === 'Stopped' || lastEngineState === 'Snoozed') { session.command('resume'); }
      else { session.command('stop'); }
    });

    // save: the wrap-up card from the design, then "finish and sort" ends the session.
    var KIND_ROWS = [
      { kind: 'reflection', one: 'recorded into reflection', many: 'recorded into reflection' },
      { kind: 'goal', one: 'goal identified', many: 'goals identified' },
      { kind: 'task', one: 'task added', many: 'tasks added' },
      { kind: 'concept', one: 'concept recognised', many: 'concepts recognised' },
      { kind: 'quote', one: 'thought kept as a quote', many: 'thoughts kept as quotes' },
      { kind: 'story', one: 'story saved', many: 'stories saved' }
    ];
    function spokenLength(ms) {
      var t = Math.floor(ms / 1000), m = Math.floor(t / 60), x = t % 60, out = [];
      if (m) { out.push(m + (m === 1 ? ' minute' : ' minutes')); }
      if (x || !m) { out.push(x + (x === 1 ? ' second' : ' seconds')); }
      return out.join(' ');
    }
    function openWrap() {
      var items = session.items ? session.items() : [];
      var n = items.length;
      $('wrapLead').textContent = 'You were with us ' + spokenLength(runMs) + (n ? ' and I have caught ' + n + (n === 1 ? ' thought.' : ' thoughts.') : '. No thoughts caught yet.');
      var rows = $('wrapRows'); rows.textContent = '';
      KIND_ROWS.forEach(function (k) {
        var c = items.filter(function (it) { return it.kind === k.kind; }).length;
        if (!c) { return; }
        var li = document.createElement('li');
        var span = document.createElement('span'); span.textContent = c + ' ' + (c === 1 ? k.one : k.many);
        var ico = document.createElement('span'); ico.className = 'ico';
        ico.innerHTML = VS.kindIcon(k.kind, 18);
        li.appendChild(span); li.appendChild(ico); rows.appendChild(li);
      });
      rows.hidden = !rows.children.length;
      $('wrapScrim').hidden = false;
      $('wrapFinish').focus();
    }
    function closeWrap() { $('wrapScrim').hidden = true; }
    $('saveBar').addEventListener('click', function () { if (session.running()) { openWrap(); } });
    $('wrapKeep').addEventListener('click', closeWrap);
    $('wrapFinish').addEventListener('click', function () { closeWrap(); $('audioEnd').click(); seaToast('saved'); });
    $('wrapScrim').addEventListener('click', function (e) { if (e.target === $('wrapScrim')) { closeWrap(); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('wrapScrim').hidden) { closeWrap(); } });

    // ---- the two switches: the sound after you speak, and the paper boats ----
    function bindSwitch(id, key, after) {
      var el = $(id);
      el.checked = !!cfg.get(key);
      el.addEventListener('change', function () { cfg.set(key, el.checked); if (after) { after(el.checked); } });
      cfg.onChange(function (k) { if (k === key || k === '*') { el.checked = !!cfg.get(key); } });
    }
    bindSwitch('pauseCueSwitch', 'pauseCueEnabled', function (on) { toast(on ? 'Sound after you speak: on' : 'Sound after you speak: off'); });
    bindSwitch('boatsSwitch', 'showBoats', function (on) {
      if (!on) { sea.clear(); clearTags(); }
      toast(on ? 'Paper boats will sail in for new thoughts' : 'Paper boats hidden');
    });

    // the back arrow: never ends a session by accident
    $('stageBack').addEventListener('click', function () {
      if (session.running()) { seaToast('use Save to finish the session'); return; }
      sea.clear(); clearTags(); seaOff('Ready'); $('seaTimer').textContent = '00:00:00';
    });

    // the dashboard: shown by default; the focus button on the water hides it
    var layout = $('seaLayout');
    function setDrawer(open, remember) {
      layout.classList.toggle('closed', !open);
      $('drawerToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
      var ic = $('drawerToggle').querySelector('.msym'); if (ic) { ic.textContent = open ? 'close_fullscreen' : 'open_in_full'; }
      if (remember) { try { localStorage.setItem('voice-space-drawer', open ? 'open' : 'closed'); } catch (e) { /* storage blocked */ } }
    }
    var savedDrawer = null; // the dashboard is open by default; the focus button hides it
    try { savedDrawer = localStorage.getItem('voice-space-drawer'); } catch (e) { /* storage blocked */ }
    var narrow = window.matchMedia && window.matchMedia('(max-width: 1000px)').matches;
    setDrawer(savedDrawer !== 'closed');
    $('drawerToggle').addEventListener('click', function () { setDrawer(layout.classList.contains('closed'), true); });
    if ($('drawerClose')) { $('drawerClose').addEventListener('click', function () { setDrawer(false, true); $('drawerToggle').focus(); }); }

    function send() {
      var t = $('audioText').value.trim();
      if (!t) { return; }
      session.sendWords(t); words(t, true, false); $('audioText').value = '';
    }
    $('audioSend').addEventListener('click', send);
    $('audioText').addEventListener('keydown', function (e) { if (e.key === 'Enter') { send(); } });

    // Hold to talk: press and hold (mouse, touch or the space bar while the button is focused).
    var hold = $('holdTalk'), holding = false;
    function down(e) {
      if (holding || hold.disabled) { return; }
      holding = true; hold.classList.add('held'); session.pretendSpeaking(true);
      // Keep the press on this button until you let go, even if the page shifts underneath.
      if (e && e.pointerId !== undefined && hold.setPointerCapture) { try { hold.setPointerCapture(e.pointerId); } catch (err) { /* not a pointer press */ } }
      if (e) { e.preventDefault(); }
    }
    function up() { if (!holding) { return; } holding = false; hold.classList.remove('held'); session.pretendSpeaking(false); }
    hold.addEventListener('pointerdown', down);
    hold.addEventListener('pointerup', up); hold.addEventListener('pointercancel', up); hold.addEventListener('lostpointercapture', up);
    hold.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') { down(e); } });
    hold.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') { up(); } });

    Array.prototype.forEach.call(document.querySelectorAll('#audioCmds button'), function (b) {
      b.addEventListener('click', function () {
        var m = b.getAttribute('data-min');
        session.command(b.getAttribute('data-cmd'), m ? parseInt(m, 10) : null);
      });
    });

    // ---- your own sound files ----
    function checkAudio(file) {
      return file.arrayBuffer().then(function (data) {
        var test = new OfflineAudioContext(1, 1, 44100);
        return test.decodeAudioData(data.slice(0)).then(function (buf) { return { data: data, duration: buf.duration }; }, function () {
          throw new Error('Chrome could not read "' + file.name + '" as audio. WAV, MP3, M4A or AAC files work.');
        });
      });
    }

    function describeSaved() {
      VS.oceanStore.load().then(function (saved) {
        if (session.running()) { return; }
        if (saved) { ui.ocean('your file "' + saved.name + '" (saved in this browser)', 'file'); }
        else { ui.ocean('the built-in stand-in ocean. Choose your recording to replace it.', 'standin'); }
      });
      Promise.all([VS.fileStore.load('prompt-cue'), VS.fileStore.load('saved-cue'), VS.fileStore.load('record-cue')]).then(function (r) {
        showCueSources(r[0] ? 'your file "' + r[0].name + '"' : 'the built-in soft cue', r[1] ? 'your file "' + r[1].name + '"' : 'the built-in tiny tones', r[2] ? 'your file "' + r[2].name + '"' : 'the built-in soft rise');
      });
    }
    function showCueSources(prompt, saved, record) {
      if (record) { $('recordCueSource').textContent = record; $('recordCueSource').title = record; $('recordCueReset').hidden = record.indexOf('your file') !== 0; }
      $('promptCueSource').title = prompt; $('savedCueSource').title = saved;
      $('promptCueSource').textContent = prompt; $('promptCueReset').hidden = prompt.indexOf('your file') !== 0;
      $('savedCueSource').textContent = saved; $('savedCueReset').hidden = saved.indexOf('your file') !== 0;
    }
    describeSaved();

    $('oceanFile').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) { return; }
      ui.problem(null);
      checkAudio(f).then(function (a) {
        var warn = a.duration < 8 ? ' It is only ' + a.duration.toFixed(1) + ' s long, so the repeat may be noticeable.' : '';
        return VS.oceanStore.save(f.name, a.data).then(function () {
          toast('Ocean saved: ' + f.name);
          addLine('Saved "' + f.name + '" (' + Math.round(a.duration) + ' s) as your ocean, in this browser only.' + warn, 'narrate');
          if (session.running()) { return session.swapOcean(); }
          describeSaved();
        });
      }).catch(function (e) { ui.problem(e.message); });
      ev.target.value = '';
    });
    $('oceanReset').addEventListener('click', function () {
      VS.oceanStore.clear().then(function () {
        toast('Using the stand-in ocean');
        if (session.running()) { return session.swapOcean(); }
        describeSaved();
      });
    });

    function cuePicker(inputId, resetId, key, label) {
      $(inputId).addEventListener('change', function (ev) {
        var f = ev.target.files && ev.target.files[0];
        if (!f) { return; }
        ui.problem(null);
        checkAudio(f).then(function (a) {
          return VS.fileStore.save(key, f.name, a.data).then(function () {
            toast(label + ' saved: ' + f.name);
            if (session.running()) { return session.reloadCues(); }
            describeSaved();
          });
        }).catch(function (e) { ui.problem(e.message); });
        ev.target.value = '';
      });
      $(resetId).addEventListener('click', function () {
        VS.fileStore.clear(key).then(function () {
          toast('Using the built-in ' + label.toLowerCase());
          if (session.running()) { return session.reloadCues(); }
          describeSaved();
        });
      });
    }
    cuePicker('promptCueFile', 'promptCueReset', 'prompt-cue', 'Question cue');
    cuePicker('savedCueFile', 'savedCueReset', 'saved-cue', 'Saved sound');
    cuePicker('recordCueFile', 'recordCueReset', 'record-cue', 'After-you-speak sound');

    // "Hear it" works without a running session, through a short-lived audio context.
    function hear(kind) {
      if (session.previewCue(kind)) { return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { return; }
      var ctx = new AC();
      VS.loadCues(ctx).then(function (c) {
        var src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = c[kind]; g.gain.value = cfg.get('cueVolume');
        src.connect(g); g.connect(ctx.destination); src.start();
        src.onended = function () { ctx.close(); };
      });
    }
    $('promptCueHear').addEventListener('click', function () { hear('prompt'); });
    $('recordCueHear').addEventListener('click', function () { hear('record'); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-hear]'), function (b) {
      b.addEventListener('click', function () { hear(b.getAttribute('data-hear')); });
    });

    // ---- transcription choice ----
    var provider = $('sttProvider');
    provider.value = cfg.get('sttProvider');
    provider.addEventListener('change', function () {
      cfg.set('sttProvider', provider.value);
      toast(session.running() ? 'Transcription changes the next time you start' : 'Transcription set');
    });
    cfg.onChange(function (k) { if (k === 'sttProvider' || k === '*') { provider.value = cfg.get('sttProvider'); } });

    // ---- the ElevenLabs key, from your .env file, kept in memory only ----
    function showKey() {
      var k = VS.keys.loaded(), c = VS.keys.claudeLoaded ? VS.keys.claudeLoaded() : null;
      var parts = [];
      var site = (k && k.site) || (c && c.site);
      if (k) { parts.push(k.site ? 'ElevenLabs' : 'ElevenLabs (ends in ' + k.ending + ')'); }
      if (c) { parts.push(c.site ? 'Anthropic' : 'Anthropic (ends in ' + c.ending + ')'); }
      var h = VS.hosted || {};
      $('keyNote').textContent = site ? 'Using the keys kept on this site: ' + parts.join(' and ') + '. No .env needed.' :
        parts.length ? 'Loaded from ' + (k || c).file + ' for this session: ' + parts.join(', ') :
        (h.on && !h.passOk ? 'This site keeps your keys. Type the passcode below.' : 'Not loaded. Pick your .env file.');
      $('keyNote').title = $('keyNote').textContent;
      $('envForget').hidden = VS.keys.ownLoaded ? !VS.keys.ownLoaded() : (!k && !c);
      var row = $('sitePassRow');
      if (row) {
        row.hidden = !(h.on && h.passcode);
        $('sitePassNote').textContent = h.passOk ? 'Passcode accepted. Remembered in this browser.' : 'This site keeps your keys. Type its passcode to use them.';
        $('sitePassGo').textContent = h.passOk ? 'Forget' : 'Use';
        $('sitePass').hidden = !!h.passOk;
      }
      showVoice();
    }
    function showVoice() {
      if (session.running()) { return; }
      var id = cfg.get('voiceId');
      ui.voiceStatus(!cfg.get('useElevenLabsVoice') ? 'Mac built-in voice (ElevenLabs voice is off in Settings)' :
        (VS.keys.loaded() ? 'ElevenLabs voice ' + id : 'ElevenLabs voice ' + id + ' (load your .env to use it)'));
    }
    $('envFile').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (!f) { return; }
      f.text().then(function (text) {
        var r = VS.keys.loadEnv(text, f.name);
        if (r.ok) { ui.problem(null); toast('Key loaded for this session'); } else { ui.problem(r.message); }
        showKey();
      });
      ev.target.value = '';
    });
    $('envForget').addEventListener('click', function () { VS.keys.forget(); showKey(); toast('Key forgotten'); });
    window.addEventListener('wander-hosted', showKey);
    if ($('sitePassGo')) {
      var usePass = function () {
        if (VS.hosted && VS.hosted.passOk) { VS.hostedForgetPass(); toast('Passcode forgotten'); return; }
        VS.hostedSetPass($('sitePass').value).then(function (h) {
          $('sitePass').value = '';
          if (h.passOk) { ui.problem(null); toast('Passcode accepted'); } else { ui.problem('That passcode is not right.'); }
        });
      };
      $('sitePassGo').addEventListener('click', usePass);
      $('sitePass').addEventListener('keydown', function (e) { if (e.key === 'Enter') { usePass(); } });
    }
    $('voiceHear').addEventListener('click', function () {
      var line = 'Whenever you\'re ready. What\'s on your mind?';
      var r = VS.previewLine(cfg, line, function (problem) { if (problem) { ui.problem(problem); } });
      toast('Playing in the ' + r.by);
    });
    cfg.onChange(function (k) { if (k === 'voiceId' || k === 'useElevenLabsVoice' || k === '*') { showVoice(); } });
    showKey();

    return session;
  };
})();
