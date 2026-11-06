/*
  test-parts.js - tests for the smaller pieces: settings, command matcher, rules, clip
  chooser, narrate formatting and the dry-run simulator.

  What it is for: the engine tests cover timing; these cover the building blocks it uses,
  so that when something fails you can tell which piece is at fault.

  How it fits: run from tests.html (in the browser) or tests/run-node.js.
*/
(function (root) {
  var VS = root.VS, T = VS.test, eq = VS.eq, ok = VS.ok;

  // ---------- config ----------
  T('config: an unknown setting name is an error, not a silent typo', function () {
    var c = VS.createConfig(); VS.throws(function () { c.get('followupSilenceMs'); }); VS.throws(function () { c.set('nope', 1); });
  });
  T('config: out-of-range and wrong-type values are rejected with a plain message', function () {
    var c = VS.createConfig();
    VS.throws(function () { c.set('duckGain', 3); }); VS.throws(function () { c.set('followUpSilenceMs', 'abc'); });
    VS.throws(function () { c.set('condition', 'loud'); }); eq(c.get('duckGain'), 0.05);
  });
  T('config: lists accept commas or lines; settings persist and reset', function () {
    var store = {}, fake = { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = v; } };
    var a = VS.createConfig(fake); a.set('fillerWords', 'um, uh\nerr'); eq(a.get('fillerWords'), ['um', 'uh', 'err']);
    a.set('followUpSilenceMs', 70000);
    var b = VS.createConfig(fake); eq(b.get('followUpSilenceMs'), 70000); ok(b.isChanged('followUpSilenceMs'));
    b.reset('followUpSilenceMs'); eq(VS.createConfig(fake).get('followUpSilenceMs'), 60000);
  });
  T('config: listeners are told when a setting changes', function () {
    var c = VS.createConfig(), seen = []; c.onChange(function (k, v) { seen.push(k + '=' + v); });
    c.set('snoozeDefaultMin', 30); eq(seen, ['snoozeDefaultMin=30']);
  });
  T('config: corrupted saved data falls back to defaults', function () {
    var bad = { getItem: function () { return '{not json'; }, setItem: function () {} };
    eq(VS.createConfig(bad).get('followUpSilenceMs'), 60000);
  });

  // ---------- commands ----------
  function M() { return VS.createCommandMatcher(VS.createConfig()); }
  T('commands: the four commands, case and punctuation do not matter', function () {
    var m = M();
    eq(m.match('Stop.').command, 'stop'); eq(m.match('SNOOZE').command, 'snooze');
    eq(m.match('Resume').command, 'resume'); eq(m.match('scratch that').command, 'scratch');
  });
  T('commands: numbers in words or digits', function () {
    var m = M();
    eq(m.match('snooze for ten minutes').minutes, 10); eq(m.match('snooze for 5 minutes').minutes, 5);
    eq(m.match('snooze for twenty five minutes').minutes, 25); eq(m.match('scratch the last five minutes').minutes, 5);
    eq(m.match('scratch the last minute').minutes, 1); eq(m.match('scratch that').minutes, null);
  });
  T('commands: only the whole utterance counts', function () {
    var m = M();
    ['I stopped because I wanted to take notes', 'please stop', 'stop the car', 'snooze for banana minutes', 'resume the work later', 'scratch that out'].forEach(function (t) {
      eq(m.match(t).isCommand, false, t);
    });
  });
  T('commands: a command word inside a sentence is noted as a mention', function () {
    eq(M().match('I stopped because I wanted to take notes').mention, 'stopped');
    eq(M().match('what a nice day').mention, null);
  });
  T('commands: phrases come from settings', function () {
    var c = VS.createConfig(), m = VS.createCommandMatcher(c);
    eq(m.match('pause please').isCommand, false);
    c.set('commandVariants', { snooze: ['pause please'], stop: ['stop'], resume: ['resume'], scratch: ['scratch that'] });
    eq(m.match('pause please').command, 'snooze');
  });

  // ---------- rules ----------
  var cfg = VS.createConfig();
  T('rules: endings', function () {
    eq(VS.rules.endingKind('I was going to call and', cfg).kind, 'incomplete');
    eq(VS.rules.endingKind('well um', cfg).kind, 'filler');
    eq(VS.rules.endingKind('I was thinking...', cfg).kind, 'trailing');
    eq(VS.rules.endingKind('I went home', cfg).kind, 'complete');
  });
  T('rules: self-addressed questions', function () {
    ['What else did I think about this morning', 'Did I forget something', 'Where was I', 'Should I just start now'].forEach(function (t) {
      ok(VS.rules.isSelfAddressedQuestion(t, cfg), t);
    });
    eq(VS.rules.isSelfAddressedQuestion('I went home and made tea', cfg), false);
  });
  T('rules: heavy or emotional can only give Emotional or none', function () {
    ['I feel hopeless', 'I am so anxious today', "I'm a failure and it's my fault"].forEach(function (t) {
      var d = VS.rules.classify(t, {}, cfg); ok(d.suggestedClipCategory === 'Emotional' || d.suggestedClipCategory === 'none', t);
    });
  });
  T('rules: sensitive lines are flagged', function () {
    eq(VS.rules.classify("I'm so stupid sometimes", {}, cfg).sensitive, true);
    eq(VS.rules.classify('I need to buy milk', {}, cfg).sensitive, false);
  });
  T('rules: decision has every field the AI layer will return', function () {
    var d = VS.rules.classify('I need to call the bank', {}, cfg);
    ['completeness', 'thoughtType', 'tone', 'selfResolving', 'selfAddressedQuestion', 'sensitive', 'suggestedClipCategory', 'reason'].forEach(function (k) { ok(k in d, k); });
  });
  T('rules: a self-addressed question never suggests a clip', function () {
    eq(VS.rules.classify('What else did I think about', {}, cfg).suggestedClipCategory, 'none');
  });

  // ---------- chooser / clips / wording ----------
  T('clips: every default line belongs to a known situation and stays short', function () {
    VS.CLIPS.forEach(function (c) {
      ok(c.id && c.text && c.category && VS.situationById(c.situation), c.id + ' has an unknown situation ' + c.situation);
      ok(c.text.split(/\s+/).length <= 16, c.id + ' is too long to say in about 6 seconds');
    });
    var ids = VS.CLIPS.map(function (c) { return c.id; }); eq(ids.length, ids.filter(function (x, i) { return ids.indexOf(x) === i; }).length, 'duplicate ids');
  });
  T('clips: every situation has default wording, and no line flatters', function () {
    VS.SITUATIONS.forEach(function (s) { ok(VS.CLIPS.some(function (c) { return c.situation === s.id; }), s.id + ' has no default lines'); });
    VS.CLIPS.forEach(function (c) { ok(!/\b(great|awesome|amazing|interesting|good job|well done)\b/i.test(c.text), c.id); });
  });
  T('chooser: rotates through variants before repeating', function () {
    var ch = VS.createChooser(VS.CLIPS), a = ch.pick('reflect').clip.id, b = ch.pick('reflect').clip.id, c = ch.pick('reflect').clip.id, d = ch.pick('reflect').clip.id;
    ok(a !== b && b !== c && a !== c); eq(d, a);
  });
  T('chooser: a line with a {blank} is only used when the blank can be filled', function () {
    var ch = VS.createChooser(VS.CLIPS);
    for (var i = 0; i < 4; i++) { ok(ch.pick('opener-resurface').text.indexOf('{') < 0); }
    eq(ch.pick('opener-goal'), null, 'no goal given, so no goal line');
  });
  T('chooser: opener priority is goal, then earlier thought, then open-ended', function () {
    var ch = VS.createChooser(VS.CLIPS);
    ok(/shifted with the move/.test(ch.pickOpener({ goals: ['the move'], resurfaced: { topic: 'x' } }).text));
    ok(/came back around/.test(ch.pickOpener({ goals: [], resurfaced: { topic: 'garden plans' } }).text));
    ok(/on your mind|get out of your head/.test(ch.pickOpener({}).text));
  });
  T('chooser: a goal phrase is cut to six words', function () {
    var t = VS.createChooser(VS.CLIPS).pickOpener({ goals: ['one two three four five six seven eight'] }).text;
    ok(/six\?/.test(t) && t.indexOf('seven') < 0, t);
  });
  T('templates: minutes and thoughts read naturally', function () {
    eq(VS.fillTemplate('Saved. {thoughts}.', { thoughts: VS.thoughtsPhrase(7) }), 'Saved. Seven thoughts.');
    eq(VS.thoughtsPhrase(1), 'one thought'); eq(VS.minutesPhrase(1), 'one minute'); eq(VS.minutesPhrase(25), 'twenty five minutes');
  });

  // ---------- narrate ----------
  T('narrate: line format and countdown wording', function () {
    eq(VS.formatLine(90500, 'hello'), '[00:01:30] hello');
    eq(VS.countdownLine({ phase: 'wait', waitedMs: 3200, thresholdMs: 5000 }), 'Waiting for silence: 3.2s / 5.0s');
    eq(VS.countdownLine({ phase: 'opener', waitedMs: 20000, thresholdMs: 10000 }), 'Waiting for you to begin: 10.0s / 10.0s');
  });

  // ---------- dry run ----------
  T('dry-run: tags are understood, bad tags are reported', function () {
    var p = VS.parseTranscript('Hello there\n[pause]\n[long pause]\n[pause 8s]\n[silence 2.5s]\n# note\n[nonsense]', VS.createConfig());
    eq(p.events.map(function (e) { return e.type === 'silence' ? e.ms : e.text; }), ['Hello there', 3000, 100000, 8000, 2500]);
    eq(p.errors.length, 1);
  });
  T('dry-run: the same transcript always gives the same timeline', function () {
    var a = VS.runDry(VS.SAMPLES.unfinished.text).lines.map(function (l) { return l.line; }).join('|');
    var b = VS.runDry(VS.SAMPLES.unfinished.text).lines.map(function (l) { return l.line; }).join('|');
    eq(a, b);
  });
  T('dry-run: every sample runs and prints a fire-point timeline', function () {
    Object.keys(VS.SAMPLES).forEach(function (k) {
      var r = VS.runDry(VS.SAMPLES[k].text); eq(r.errors.length, 0, k); ok(r.lines.length > 4, k);
      ok(r.lines.some(function (l) { return l.kind === 'end'; }), k);
    });
  });
  T('dry-run: sample "basic" opens after one minute; "unanswered" ends with exactly one snooze offer', function () {
    var b = VS.runDry(VS.SAMPLES.basic.text);
    ok(/^\[00:01:00\].*Opener rule fired/.test(b.lines.filter(function (l) { return l.kind === 'narrate'; })[1].line));
    var u = VS.runDry(VS.SAMPLES.unanswered.text), cats = u.actions.filter(function (a) { return a.kind === 'prompt'; }).map(function (a) { return a.category; });
    eq(cats, ['Plan', 'Backchannel', 'Exit']);
  });
  T('dry-run: sample "heavy" only ever gets Emotional clips', function () {
    var cats = VS.runDry(VS.SAMPLES.heavy.text).actions.filter(function (a) { return a.kind === 'prompt'; }).map(function (a) { return a.category; });
    ok(cats.length >= 1 && cats.every(function (c) { return c === 'Emotional'; }), JSON.stringify(cats));
  });
})(typeof window !== 'undefined' ? window : globalThis);
