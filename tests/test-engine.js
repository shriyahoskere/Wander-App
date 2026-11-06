/*
  test-engine.js - tests for the silence engine's timing and behaviour rules.

  What it is for: proves each rule using a fake clock, e.g. "the system never speaks until a
  full minute after a finished sentence" and "two unanswered prompts, then a snooze offer once,
  then silence". If any rule breaks later, a test here turns red.

  The timing numbers come from the settings (at the top), so the tests follow the defaults.

  How it fits: run from tests.html (in the browser) or tests/run-node.js.
*/
(function (root) {
  var VS = root.VS, T = VS.test, eq = VS.eq, ok = VS.ok;
  var R = function (o, c) { return VS.makeRig(o, c); };
  var D = VS.createConfig();
  var BUF = D.get('endOfSpeechBufferMs');       // 1 s breath buffer
  var OPEN = D.get('openerSilenceMs');          // 60 s
  var FOLLOW = D.get('followUpSilenceMs');      // 60 s
  var INC = D.get('incompleteSilenceMs');       // 90 s
  var BACK = D.get('backoffAfterUnansweredMs'); // 90 s
  var FIRE = BUF + FOLLOW;                      // first prompt after a finished sentence
  var FIRE_INC = BUF + INC;                     // first prompt after an unfinished sentence

  // ---------- defaults ----------
  T('defaults: every wait before speaking is at least one minute', function () {
    eq(OPEN, 60000); eq(FOLLOW, 60000); eq(INC, 90000); eq(D.get('selfQuestionSilenceMs'), 90000); eq(BACK, 90000);
    eq(D.get('topicBoundaryMs'), 120000);
  });
  T('defaults: the rest match the brief', function () {
    eq(BUF, 1000); eq(D.get('snoozeDefaultMin'), 20); eq(D.get('maxConsecutiveUnansweredPrompts'), 2);
    eq(D.get('stopUndoMs'), 10000); eq(D.get('scratchDefaultMin'), 3);
    eq(D.get('duckGain'), 0.05); eq(D.get('duckAttackMs'), 200); eq(D.get('duckReleaseMs'), 3000);
    eq(D.get('clipDuckGain'), 0.35); eq(D.get('oceanGain'), 0.6);
  });
  T('settings refuse any wait shorter than one minute', function () {
    ['openerSilenceMs', 'followUpSilenceMs', 'incompleteSilenceMs', 'selfQuestionSilenceMs', 'backoffAfterUnansweredMs'].forEach(function (k) {
      VS.throws(function () { VS.createConfig().set(k, 59999); }, k);
    });
  });

  // ---------- opener ----------
  T('opener: silent for a full minute, then exactly one opener', function () {
    var r = R(); r.advance(OPEN - 50);
    eq(r.prompts().length, 0, 'before one minute');
    r.advance(50);
    eq(r.prompts().length, 1); eq(r.prompts()[0].category, 'Opener'); eq(r.engine.state(), 'Prompting');
  });
  T('opener: only one per session, even after a long ignored silence', function () {
    var r = R(); r.advance(OPEN); r.endClip(); r.advance(1800000);
    eq(r.prompts().length, 1);
  });
  T('opener: a goal with recent activity is referenced', function () {
    var r = R({}, function () { return { goals: ['plan the move to Melbourne'], resurfaced: null }; });
    r.advance(OPEN);
    ok(/shifted with plan the move to Melbourne/.test(r.prompts()[0].text), r.prompts()[0].text);
  });
  T('opener: speaking first means no opener', function () {
    var r = R(); r.advance(5000); r.speak('Morning pages'); r.advance(1000);
    eq(r.prompts().length, 0);
  });

  // ---------- pause window and adaptive timing ----------
  T('a breath shorter than the buffer is not a pause', function () {
    var r = R(); r.speak('I went to the shop', 1000); r.advance(500); r.engine.speechStart();
    eq(r.engine.state(), 'Listening'); ok(/just a breath/.test(r.narration()));
  });
  T('finished sentence: nothing before buffer + 60 s, one clip at 61 s', function () {
    var r = R(); r.speak('I went to the shop'); r.advance(FIRE - 50);
    eq(r.prompts().length, 0, 'just before'); r.advance(50);
    eq(r.prompts().length, 1, 'at 61 s'); eq(r.prompts()[0].category, 'Reflect');
  });
  T('sentence ending on "and" extends the wait to buffer + 90 s', function () {
    var r = R(); r.speak('I was going to call her back and'); r.advance(FIRE_INC - 50);
    eq(r.prompts().length, 0); r.advance(50);
    eq(r.prompts().length, 1); eq(r.prompts()[0].category, 'Backchannel');
  });
  T('sentence ending on a filler ("um") also extends the wait', function () {
    var r = R(); r.speak('I think maybe um'); r.advance(FIRE_INC - 50);
    eq(r.prompts().length, 0); r.advance(50); eq(r.prompts().length, 1);
  });
  T('a trailing-off sentence ("...") extends the wait', function () {
    var r = R(); r.speak('I was just wondering...'); r.advance(FIRE_INC - 50);
    eq(r.prompts().length, 0); r.advance(50); eq(r.prompts()[0].category, 'Backchannel');
  });
  T('self-addressed question: extended wait, and it is NEVER answered', function () {
    var r = R(); r.speak('What else did I think about this morning'); r.advance(1200000);
    eq(r.prompts().length, 0); ok(/Choosing silence/.test(r.narration()));
  });
  T('the system never speaks before a full minute, whatever was said', function () {
    ['I need to call the bank tomorrow', 'I feel overwhelmed', 'I was going to say that', 'That is all', "I think I'll just start"].forEach(function (text) {
      var r = R(); r.speak(text); var t0 = r.clock.now(), fired = null;
      for (var i = 0; i < 5000 && fired === null; i++) { r.advance(50); if (r.prompts().length) { fired = r.clock.now() - t0; } }
      ok(fired !== null && fired >= FIRE, text + ' fired at ' + fired);
    });
  });
  T('never speaks twice in one silence (while a clip plays)', function () {
    var r = R(); r.speak('I need to call the bank'); r.advance(FIRE); r.advance(14000);
    eq(r.prompts().length, 1);
  });
  T('no confirmation chimes during a pause: nothing is played before the threshold', function () {
    var r = R(); r.speak('I went to the shop'); r.advance(FIRE - 100);
    eq(r.has('playClip'), 0);
  });

  // ---------- follow-up logic ----------
  T('plan gets a planning question', function () {
    var r = R(); r.speak('I need to call the bank tomorrow'); r.advance(FIRE);
    eq(r.prompts()[0].category, 'Plan');
  });
  T('self-resolving statement offers to pin a task', function () {
    var r = R(); r.speak("I think I'll just start it as a rant in my notes"); r.advance(FIRE);
    ok(/pin|to-do/.test(r.prompts()[0].text), r.prompts()[0].text);
  });
  T('clearly resolved gets a closer', function () {
    var r = R(); r.speak("Okay that's it for today"); r.advance(FIRE);
    eq(r.prompts()[0].category, 'Closer');
  });
  T('emotional: only a soft backchannel, never a question', function () {
    var r = R(); r.speak('I feel so overwhelmed and anxious about everything'); r.advance(FIRE);
    eq(r.prompts()[0].category, 'Emotional');
  });
  T('heavy: only a soft backchannel', function () {
    var r = R(); r.speak("I feel like I'm failing at all of it"); r.advance(FIRE);
    eq(r.prompts()[0].category, 'Emotional');
  });
  T('after an unanswered prompt, the next one waits 90 s and is a backchannel, never another question', function () {
    var r = R(); r.speak('I need to call the bank'); r.advance(FIRE); r.endClip();
    r.advance(BACK - 50); eq(r.prompts().length, 1); r.advance(50);
    eq(r.prompts().length, 2); eq(r.prompts()[1].category, 'Backchannel');
  });
  T('two unanswered prompts: a snooze is offered once, then silence', function () {
    var r = R(); r.speak('I need to call the bank'); r.advance(FIRE); r.endClip();
    r.advance(BACK); r.endClip(); r.advance(BACK);
    eq(r.prompts().length, 3); eq(r.prompts()[2].category, 'Exit'); r.endClip();
    r.advance(1800000); eq(r.prompts().length, 3);
  });
  T('speaking again counts as an answer and resets the count', function () {
    var r = R(); r.speak('I need to call the bank'); r.advance(FIRE); r.endClip();
    r.advance(2000); r.speak('And I should email Sam'); r.advance(FIRE);
    eq(r.prompts().length, 2); eq(r.prompts()[1].category, 'Plan');
    ok(/Counting this as an answer/.test(r.narration()));
  });
  T('rotation: the same category does not repeat the same phrasing back to back', function () {
    var r = R(); r.speak('I need to call the bank'); r.advance(FIRE); r.endClip(); r.speak('I need to book flights'); r.advance(FIRE);
    ok(r.prompts()[0].clipId !== r.prompts()[1].clipId);
  });
  T('speaking while a clip plays cancels the clip at once', function () {
    var r = R(); r.speak('I need to call the bank'); r.advance(FIRE);
    eq(r.engine.state(), 'Prompting'); r.engine.speechStart();
    eq(r.has('stopClip'), 1); eq(r.engine.state(), 'Listening');
  });
  T('the clip watchdog ends a clip that never reports finishing', function () {
    var r = R(); r.speak('I need to call the bank'); r.advance(FIRE); r.advance(15000);
    ok(r.engine.state() !== 'Prompting');
  });

  // ---------- very long speech, noise ----------
  T('a very long utterance with no pauses: the system stays silent', function () {
    var r = R(); r.engine.speechStart(); r.advance(1200000);
    eq(r.engine.state(), 'Listening'); eq(r.prompts().length, 0);
  });
  T('background noise with no words: no crash and no speech', function () {
    var r = R(); r.engine.speechStart(); r.advance(500); r.engine.speechEnd(); r.advance(300000);
    eq(r.prompts().length, 0); ok(/nothing to follow up on/i.test(r.narration()));
  });

  // ---------- commands ----------
  T('command words inside a sentence never trigger a command', function () {
    ['I stopped because I wanted to take notes', 'We should stop doing that', 'I will snooze it later', 'Resume writing the chapter', 'He said scratch that out'].forEach(function (text) {
      var r = R(); r.speak(text); r.advance(2000);
      ok(r.engine.state() !== 'Stopped' && r.engine.state() !== 'Snoozed', text);
      eq(r.confirmations().length, 0, text);
    });
  });
  T('a command word right after other speech (no pause before it) is content', function () {
    var r = R(); r.speak('I need to go home', 1000);
    r.engine.speechStart(); r.advance(300); r.engine.speechEnd(); r.engine.transcript('stop', true);
    ok(r.engine.state() !== 'Stopped'); ok(/part of a sentence/.test(r.narration()));
  });
  T('snooze: default 20 minutes, silent throughout, then ends', function () {
    var r = R(); r.speak('snooze'); r.advance(1500);
    eq(r.engine.state(), 'Snoozed'); eq(r.confirmations()[0].text, 'Snoozed. Twenty minutes.');
    r.advance(19 * 60000); eq(r.engine.state(), 'Snoozed'); eq(r.prompts().length, 0);
    r.advance(61000); eq(r.engine.state(), 'Idle'); ok(/snooze is over/i.test(r.narration()));
  });
  T('snooze for ten minutes overrides the default', function () {
    var r = R(); r.speak('snooze for ten minutes'); r.advance(100);
    eq(r.confirmations()[0].text, 'Snoozed. Ten minutes.');
    r.advance(9 * 60000); eq(r.engine.state(), 'Snoozed'); r.advance(61000); eq(r.engine.state(), 'Idle');
  });
  T('speech during a snooze is not kept and nothing is said', function () {
    var r = R(); r.speak('snooze'); r.advance(2000); r.speak('a private thought'); r.advance(60000);
    eq(r.engine.utterances().length, 0); eq(r.prompts().length, 0);
  });
  T('snooze ending mid-thought: the system keeps listening, silently', function () {
    var r = R(); r.speak('snooze for one minute'); r.advance(55000); r.engine.speechStart(); r.advance(6000);
    eq(r.engine.state(), 'Listening'); eq(r.prompts().length, 0);
  });
  T('resume ends a snooze early', function () {
    var r = R(); r.speak('snooze'); r.advance(5000); r.speak('resume'); r.advance(100);
    eq(r.engine.state(), 'Idle'); ok(/ended early/i.test(r.narration()));
  });
  T('stop then resume inside the undo window restores the session', function () {
    var r = R(); r.speak('first thought here'); r.advance(1500); r.speak('stop'); r.advance(100);
    eq(r.engine.state(), 'Stopped'); eq(r.confirmations()[0].text, 'Saved. One thought.');
    r.advance(4000); r.speak('resume'); r.advance(100);
    eq(r.engine.state(), 'Idle'); eq(r.engine.thoughts(), 1); eq(r.has('sessionSaved'), 0);
  });
  T('stop: after the undo window the session is saved, and resume starts a new one', function () {
    var r = R(); r.speak('first thought here'); r.advance(1500); r.speak('stop'); r.advance(11000);
    eq(r.has('sessionSaved'), 1); r.speak('resume'); r.advance(100);
    eq(r.has('sessionStarted'), 1); eq(r.engine.thoughts(), 0); eq(r.engine.state(), 'Idle');
  });
  T('resume with nothing to resume: stays quiet', function () {
    var r = R(); r.speak('resume'); r.advance(100);
    ok(/Nothing to resume/.test(r.narration())); eq(r.confirmations().length, 0);
    ok(r.engine.state() !== 'Snoozed' && r.engine.state() !== 'Stopped');
  });
  T('session timeout stops the session by itself', function () {
    var r = R({ sessionTimeoutMin: 1 }); r.advance(61000); eq(r.engine.state(), 'Stopped');
  });
  T('a session never ends itself without a timeout', function () {
    var r = R(); r.advance(3 * 3600000); ok(r.engine.state() !== 'Stopped');
  });

  // ---------- scratch ----------
  T('scratch that removes only the last 3 minutes and confirms', function () {
    var r = R(); r.speak('first thought about the garden'); r.advance(240000);
    r.speak('second thought about work'); r.advance(2000); r.speak('scratch that'); r.advance(100);
    eq(r.engine.utterances().length, 1); eq(r.engine.thoughts(), 1);
    eq(r.confirmations().slice(-1)[0].text, 'Scratched. Last three minutes gone.');
    ok(r.engine.lastText().indexOf('second') < 0, 'scratched text must not remain');
  });
  T('scratch the last five minutes overrides the default', function () {
    var r = R(); r.speak('an early thought here'); r.advance(400000); r.speak('a later one'); r.advance(2000);
    r.speak('scratch the last five minutes'); r.advance(100);
    eq(r.confirmations().slice(-1)[0].text, 'Scratched. Last five minutes gone.');
    eq(r.engine.utterances().length, 1);
  });
  T('scratch with less recorded than the window says so honestly', function () {
    var r = R(); r.speak('only a little so far'); r.advance(3000); r.speak('scratch that'); r.advance(100);
    eq(r.confirmations()[0].text, "Scratched. That's everything so far."); eq(r.engine.utterances().length, 0);
  });
  T('scratch with nothing recorded', function () {
    var r = R(); r.speak('scratch that'); r.advance(100);
    eq(r.confirmations()[0].text, 'Nothing to scratch.');
  });
  T('scratched material is never followed up on', function () {
    var r = R(); r.speak('my secret plan to quit'); r.advance(2000); r.speak('scratch that'); r.advance(100);
    var before = r.prompts().length; r.advance(600000);
    eq(r.prompts().length, before);
  });

  // ---------- wizard, settings, conditions ----------
  T('wizard fires a clip: the engine cancels its own', function () {
    var r = R(); r.speak('I need to call the bank'); r.advance(3000);
    r.engine.externalClip({ id: 'wiz', text: 'Go on.', category: 'Backchannel' }, 'Wizard'); r.advance(FIRE + 10000);
    eq(r.systemPrompts().length, 0); eq(r.prompts().length, 1); ok(/Wizard fired/.test(r.narration()));
  });
  T('hot reload: changing a setting mid-silence applies immediately', function () {
    var r = R(); r.speak('I went to the shop'); r.advance(FIRE - 1000);
    eq(r.prompts().length, 0); r.cfg.set('followUpSilenceMs', 120000); r.advance(30000);
    eq(r.prompts().length, 0, 'the longer wait applies straight away'); r.advance(31050);
    eq(r.prompts().length, 1);
  });
  T('condition silenceOnly: the system never speaks on its own', function () {
    var r = R({ condition: 'silenceOnly' }); r.advance(OPEN + 1000); r.speak('I need to call the bank'); r.advance(600000);
    eq(r.prompts().length, 0);
  });
  T('condition backchannelOnly: only backchannel or soft clips', function () {
    var r = R({ condition: 'backchannelOnly' }); r.speak('I need to call the bank'); r.advance(FIRE);
    eq(r.prompts()[0].category, 'Backchannel');
  });
  T('a two-minute silence before speaking starts a new thought (segment)', function () {
    var r = R({ condition: 'silenceOnly' }); r.speak('about the garden'); r.advance(125000); r.speak('about work');
    eq(r.engine.thoughts(), 2); eq(r.has('segmentBoundary'), 1);
  });
  T('an unfinished sentence and a one-minute think stay one thought', function () {
    var r = R({ condition: 'silenceOnly' }); r.speak('I was thinking about the garden and'); r.advance(60000); r.speak('the fence needs fixing too');
    eq(r.engine.thoughts(), 1); eq(r.engine.items().length, 0, 'not saved yet');
  });

  // ---------- live thought capture ----------
  function saved(r) { return r.engine.actions().filter(function (a) { return a.type === 'thoughtSaved'; }); }
  T('capture: a finished sentence followed by 5 s of quiet is saved as one thought', function () {
    var r = R({ condition: 'silenceOnly' }); r.speak('I need to call the bank tomorrow'); r.advance(4950);
    eq(saved(r).length, 0, 'not before 5 s'); r.advance(100);
    eq(saved(r).length, 1); eq(saved(r)[0].item.kind, 'task'); eq(saved(r)[0].item.text, 'I need to call the bank tomorrow');
  });
  T('capture: tasks, goals and reflections are told apart', function () {
    [['I need to email Sam about the rent', 'task'], ["I think I'll just start the essay tonight", 'task'],
     ['This year I want to get better at drawing', 'goal'], ['My goal is to run a half marathon', 'goal'],
     ['It was a strange day at the studio', 'reflection']].forEach(function (c) {
      var r = R({ condition: 'silenceOnly' }); r.speak(c[0]); r.advance(5000);
      eq(saved(r)[0].item.kind, c[1], c[0]);
    });
  });
  T('capture: speaking again within 4 s keeps it the same thought', function () {
    var r = R({ condition: 'silenceOnly' }); r.speak('I went to the shop'); r.advance(2000); r.speak('and bought far too much bread'); r.advance(5000);
    eq(saved(r).length, 1); eq(saved(r)[0].item.text, 'I went to the shop and bought far too much bread');
  });
  T('capture: an unfinished thought is saved once the full wait has passed', function () {
    var r = R({ condition: 'silenceOnly' }); r.speak('I keep meaning to call her but'); r.advance(10000);
    eq(saved(r).length, 0); r.advance(BUF + INC);
    eq(saved(r).length, 1);
  });
  T('capture: stop saves the thought in progress and counts every saved thought', function () {
    var r = R({ condition: 'silenceOnly' }); r.speak('First thing on my mind'); r.advance(5000); r.speak('Second thing'); r.advance(1500); r.speak('stop'); r.advance(100);
    eq(r.confirmations()[0].text, 'Saved. Two thoughts.'); eq(r.engine.items().length, 2);
  });
  T('capture: snooze saves the thought in progress first', function () {
    var r = R(); r.speak('A thought before the break'); r.advance(1500); r.speak('snooze'); r.advance(100);
    eq(r.engine.items().length, 1);
  });
  T('capture: scratch that removes saved thoughts in the window', function () {
    var r = R({ condition: 'silenceOnly' }); r.speak('Keep this one'); r.advance(240000); r.speak('Scratch this one'); r.advance(5000);
    eq(r.engine.items().length, 2); r.speak('scratch that'); r.advance(100);
    eq(r.engine.items().map(function (i) { return i.text; }), ['Keep this one']);
    eq(r.has('thoughtsScratched'), 1);
  });
  T('ocean: rises back only after 4 s of quiet, not at the 1 s breath check', function () {
    var r = R(); r.speak('I went to the shop'); var before = r.engine.actions().length;
    r.advance(1500);
    eq(r.engine.actions().slice(before).filter(function (a) { return a.type === 'ocean' && a.level === 'up'; }).length, 0, 'not at 1.5 s');
    r.advance(2600);
    eq(r.engine.actions().slice(before).filter(function (a) { return a.type === 'ocean' && a.level === 'up'; }).length, 1, 'by 4.1 s');
  });
  T('status reports the live countdown numbers', function () {
    var r = R(); r.speak('I went to the shop'); r.advance(3500);
    var st = r.engine.status();
    eq(st.phase, 'wait'); eq(st.thresholdMs, 60000); eq(st.waitedMs, 2500);
    eq(VS.countdownLine(st), 'Waiting for silence: 2.5s / 60.0s');
  });
})(typeof window !== 'undefined' ? window : globalThis);
