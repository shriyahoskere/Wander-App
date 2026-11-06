/*
  dryrun.js - the dry-run simulator.

  What it is for: take a written transcript with [pause] and [long pause] tags and replay it
  through the silence engine on a fake clock, with no microphone and no sound. It prints a
  timeline of where the system would speak, which clip it would choose, and why, in the same
  wording as narrate mode.

  Transcript format (one thing per line, or several tags and sentences on a line):
    I need to call the bank          a line of text = you speak that sentence
    [pause]                          3 seconds of silence (setting: dryRunPauseMs)
    [long pause]                     15 seconds of silence (setting: dryRunLongPauseMs)
    [pause 8s] or [silence 8s]       a silence of exactly 8 seconds
    # a comment                      ignored
  Two spoken lines with no tag between them are separated by a short natural gap (dryRunGapMs),
  which is shorter than a breath, so they read as one stretch of speech.

  How it fits: it uses the same engine, rules, chooser and config as the live system.
*/
(function (root) {
  var VS = root.VS = root.VS || {};
  var STEP_MS = 50;

  // Turn the transcript text into a list of { type: 'speech'|'silence', ... } events.
  VS.parseTranscript = function (text, cfg) {
    var events = [], errors = [];
    String(text).split(/\r?\n/).forEach(function (rawLine, idx) {
      var line = rawLine.trim();
      if (!line || line.charAt(0) === '#') { return; }
      line.split(/(\[[^\]]*\])/).forEach(function (part) {
        part = part.trim();
        if (!part) { return; }
        if (part.charAt(0) === '[') {
          var m = /^\[\s*(long pause|pause|silence)(?:\s+(\d+(?:\.\d+)?)\s*s?)?\s*\]$/i.exec(part);
          if (!m) { errors.push('Line ' + (idx + 1) + ': I do not understand the tag ' + part); return; }
          var ms;
          if (m[2]) { ms = parseFloat(m[2]) * 1000; }
          else if (/^long/i.test(m[1])) { ms = cfg.get('dryRunLongPauseMs'); }
          else { ms = cfg.get('dryRunPauseMs'); }
          events.push({ type: 'silence', ms: ms });
        } else {
          var words = part.split(/\s+/).length;
          var dur = Math.max(800, Math.round(words / cfg.get('dryRunWordsPerSecond') * 1000));
          events.push({ type: 'speech', text: part, durMs: dur });
        }
      });
    });
    return { events: events, errors: errors };
  };

  /*
    run(text, opts) -> { lines, actions, errors, summary }
      opts.cfg      - config (default: a fresh in-memory config)
      opts.chooser  - clip chooser (default: built from the clip library)
      opts.context  - opener context getter
    lines: [{ t, kind: 'narrate'|'speech'|'clip'|'end', text, line }] in order.
  */
  VS.runDry = function (text, opts) {
    opts = opts || {};
    var cfg = opts.cfg || VS.createConfig();
    var chooser = opts.chooser || VS.createChooser(VS.currentClips ? VS.currentClips : VS.CLIPS);
    var parsed = VS.parseTranscript(text, cfg);
    var clock = VS.createFakeClock(0);
    var lines = [];

    function add(t, kind, msg) { lines.push({ t: t, kind: kind, text: msg, line: VS.formatLine(t, msg) }); }

    var engine = VS.createEngine({
      clock: clock, cfg: cfg, chooser: chooser, context: opts.context,
      onAction: function (a) {
        if (a.type === 'narrate') { add(a.t, 'narrate', a.text); }
        else if (a.type === 'playClip') { add(a.t, 'clip', 'System says: "' + a.text + '"' + (a.kind === 'confirmation' ? ' (confirmation)' : '')); }
        else if (a.type === 'stopClip') { add(a.t, 'clip', 'Clip cut off with a fast fade.'); }
      }
    });

    // Build an absolute-time schedule of what the pretend speaker does.
    var schedule = [], cursor = 0, prev = null, lag = cfg.get('dryRunSttLagMs');
    parsed.events.forEach(function (ev) {
      if (ev.type === 'silence') { cursor += ev.ms; prev = ev; return; }
      if (prev && prev.type === 'speech') { cursor += cfg.get('dryRunGapMs'); }
      var startAt = cursor, endAt = cursor + ev.durMs;
      schedule.push({ at: startAt, run: function (e) { return function () {
        add(startAt, 'speech', 'You say: "' + e.text + '" (about ' + VS.fmtSec(e.durMs, 0) + 's)');
        engine.speechStart();
      }; }(ev) });
      schedule.push({ at: endAt, run: function () { engine.speechEnd(); } });
      schedule.push({ at: endAt + lag, run: function (e) { return function () { engine.transcript(e.text, true); }; }(ev) });
      cursor = endAt; prev = ev;
    });
    schedule.sort(function (a, b) { return a.at - b.at; });
    var endTime = cursor;

    engine.start();
    var clipEndAt = null, i = 0;
    while (clock.now() < endTime || i < schedule.length) {
      clock.advance(STEP_MS);
      while (i < schedule.length && schedule[i].at <= clock.now()) { schedule[i].run(); i++; }
      engine.tick();
      var st = engine.state();
      if (st === 'Prompting' && clipEndAt === null) { clipEndAt = clock.now() + cfg.get('dryRunClipMs'); }
      if (st !== 'Prompting') { clipEndAt = null; }
      if (st === 'Prompting' && clock.now() >= clipEndAt) { engine.clipEnded(); clipEndAt = null; }
      if (clock.now() > endTime + 600000) { break; } // safety stop
    }

    var acts = engine.actions();
    var clips = acts.filter(function (a) { return a.type === 'playClip' && a.kind === 'prompt'; });
    add(clock.now(), 'end', 'End of transcript. The system spoke ' + clips.length + (clips.length === 1 ? ' time.' : ' times.'));
    return {
      lines: lines, actions: acts, errors: parsed.errors, engine: engine,
      summary: { prompts: clips.length, durationMs: clock.now(), thoughts: engine.thoughts() }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
