/*
  engine.js - the silence engine: the rulebook for when the system may speak.

  What it is for: it is a "state machine", meaning it is always in exactly one of six
  situations (Idle, Listening, PauseWindow, Prompting, Snoozed, Stopped) and a small set
  of events moves it between them. It decides ONLY about timing and rules. It plays no
  sound, reads no microphone and stores nothing. Instead it announces what it wants done
  as "actions" (play this clip, turn the ocean down, here is a plain-English narration line).

  How it fits: later milestones connect the real microphone, voice detection, ocean mixer
  and speech-to-text to the engine's inputs (speechStart, speechEnd, transcript, clipEnded)
  and carry out its actions. Today the dry-run simulator and the tests drive it with
  a fake clock. It never reads the real time, so it is fully testable.

  How timing works: when you stop speaking, a short buffer (endOfSpeechBufferMs) checks it
  was not just a breath. Once the pause is "confirmed", the wait (5s for a finished sentence,
  longer for an unfinished one) is counted from that moment. When it runs out, at most ONE
  clip is chosen, or none. Settings are read fresh each time, so edits apply live.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  VS.STATES = ['Idle', 'Listening', 'PauseWindow', 'Prompting', 'Snoozed', 'Stopped'];

  /*
    deps:
      clock   - { now() } in milliseconds (real or fake)
      cfg     - the config object
      chooser - the clip chooser
      commands (optional) - command matcher (one is created if missing)
      context  (optional) - function returning { goals: [...], resurfaced: {...} | null } for the opener
      onAction (optional) - function called with every action as it happens
  */
  VS.createEngine = function (deps) {
    var cfg = deps.cfg, clock = deps.clock, chooser = deps.chooser, rules = VS.rules;
    var commands = deps.commands || VS.createCommandMatcher(cfg);
    var getContext = deps.context || function () { return { goals: [], resurfaced: null }; };
    var onAction = deps.onAction || null;
    var actions = [];
    var s = fresh();

    function fresh() {
      return {
        started: false, state: 'Stopped', t0: 0, sessionStart: 0,
        speaking: false, speechStartedAt: null, lastSpeechEndAt: null, burstGap: Infinity,
        idleSince: 0, silenceStartedAt: 0, confirmed: false, confirmedAt: 0, waitKind: 'standard',
        firedThisSilence: false, openerFired: false,
        unanswered: 0, awaitingAnswer: false, snoozeOffered: false,
        lastText: '', decision: null, interim: '',
        snoozeUntil: 0, stoppedAt: 0, stopPending: false, stopCount: 0,
        utterances: [], segId: 0, lastClipCategory: null, promptStartedAt: 0, playing: null,
        items: [], itemSeq: 0, oceanUp: true
      };
    }

    function now() { return clock.now(); }
    function el() { return now() - s.t0; }
    function secs(ms) { return VS.fmtSec(ms); }

    function emit(a) {
      a.t = el();
      actions.push(a);
      if (onAction) { onAction(a); }
      return a;
    }
    function say(text) { return emit({ type: 'narrate', text: text }); }
    function ocean(level) { return emit({ type: 'ocean', level: level }); }

    // ---------- helpers that read the current situation ----------

    // Thoughts = the ones already saved, plus the one you are in the middle of (if any).
    function thoughtCount() { return s.items.length + (hasUnfiled() ? 1 : 0); }
    function hasUnfiled() { return s.utterances.some(function (u) { return !u.filed; }); }

    // Save what you said since the last saved thought as one thought: a reflection, a task or a goal.
    function fileThought() {
      var un = s.utterances.filter(function (u) { return !u.filed; });
      if (!un.length) { return null; }
      var text = un.map(function (u) { return u.text; }).join(' ');
      var kind = rules.kindOf(text, cfg);
      var sensitive = rules.classify(text, {}, cfg).sensitive;
      un.forEach(function (u) { u.filed = true; });
      var item = { id: 'thought-' + (++s.itemSeq), kind: kind, text: text, startT: un[0].startT, endT: un[un.length - 1].endT, sensitive: sensitive };
      s.items.push(item);
      emit({ type: 'thoughtSaved', item: JSON.parse(JSON.stringify(item)), count: s.items.length });
      var preview = text.length > 60 ? text.slice(0, 57) + '...' : text;
      say('Thought saved as a ' + kind + ' (' + s.items.length + ' so far): "' + preview + '".');
      return item;
    }

    // The last few things you said in the current thought, joined, for the rules to read.
    function computeLastText() {
      var mine = s.utterances.filter(function (u) { return u.seg === s.segId; });
      return mine.slice(-3).map(function (u) { return u.text; }).join('. ');
    }

    function classifyNow() {
      return rules.classify(s.lastText, { lastWasUnanswered: s.awaitingAnswer }, cfg);
    }

    // How long to wait, and the plain-English reason, for the thing you last said.
    function thresholdFor(d) {
      var follow = cfg.get('followUpSilenceMs');
      if (!s.lastText) {
        return { ms: follow, msg: 'No words came through yet, so I am using the standard ' + secs(follow) + 's wait.' };
      }
      if (d.selfAddressedQuestion) {
        var q = cfg.get('selfQuestionSilenceMs');
        return { ms: q, msg: 'That sounded like a question you asked yourself, so I will wait ' + secs(q) + 's and will not answer it.' };
      }
      var inc = cfg.get('incompleteSilenceMs');
      if (d.endingKind === 'trailing') {
        return { ms: inc, msg: 'Your last sentence trailed off, so it\'s incomplete. Extending the wait to ' + secs(inc) + 's instead of ' + secs(follow) + 's.' };
      }
      if (d.endingKind === 'filler') {
        return { ms: inc, msg: 'Your last sentence ended on a filler ("' + d.endingWord + '"), so it\'s incomplete. Extending the wait to ' + secs(inc) + 's instead of ' + secs(follow) + 's.' };
      }
      if (d.endingKind === 'incomplete') {
        return { ms: inc, msg: 'Your last sentence ended with "' + d.endingWord + '", so it\'s incomplete. Extending the wait to ' + secs(inc) + 's instead of ' + secs(follow) + 's.' };
      }
      return { ms: follow, msg: 'Your last sentence looks finished, so the wait is ' + secs(follow) + 's.' };
    }

    function currentThresholdMs() {
      if (s.waitKind === 'backoff') { return cfg.get('backoffAfterUnansweredMs'); }
      if (!s.decision) { s.decision = classifyNow(); }
      return thresholdFor(s.decision).ms;
    }

    // ---------- inputs from the outside world ----------

    function start() {
      actions = [];
      s = fresh();
      s.started = true; s.t0 = now(); s.sessionStart = s.t0; s.state = 'Idle'; s.idleSince = s.t0;
      ocean('in');
      say('Session started. Ocean fading in.');
    }

    function newSession() {
      var t0 = s.t0;
      s = fresh();
      s.started = true; s.t0 = t0; s.sessionStart = now(); s.state = 'Idle'; s.idleSince = now();
      ocean('in');
      emit({ type: 'sessionStarted' });
      say('Starting a new session. Ocean fading in.');
    }

    function speechStart() {
      if (!s.started || s.speaking) { return; }
      var n = now();
      s.burstGap = s.lastSpeechEndAt === null ? Infinity : n - s.lastSpeechEndAt;
      s.speaking = true; s.speechStartedAt = n;
      if (s.state === 'Snoozed' || s.state === 'Stopped') { return; }
      s.openerFired = true; // once you have started talking, an opener is no longer wanted

      if (s.state === 'Prompting') {
        emit({ type: 'stopClip', fadeMs: 150 });
        s.playing = null;
        say('You started speaking while a clip was playing, so I cut it off right away.');
        ocean('duck'); s.oceanUp = false;
      } else if (s.state === 'PauseWindow' && !s.confirmed) {
        say('You started speaking again before the pause was confirmed, so that was just a breath. Timer cleared.');
      } else {
        say('You started speaking. Ocean ducked to ' + Math.round(cfg.get('duckGain') * 100) + '%.');
        ocean('duck'); s.oceanUp = false;
      }

      // A long silence before this means a new thought begins.
      if (s.lastSpeechEndAt !== null && s.burstGap >= cfg.get('topicBoundaryMs') && s.utterances.length > 0) {
        fileThought();
        s.segId++;
        emit({ type: 'segmentBoundary', segment: s.segId });
        say('That was a long silence (' + Math.round(s.burstGap / 1000) + 's), so what comes next starts a new thought.');
      }

      if (s.awaitingAnswer) {
        s.awaitingAnswer = false; s.unanswered = 0; s.snoozeOffered = false;
        say('You spoke again. Counting this as an answer. Unanswered prompts reset to 0.');
      }
      s.state = 'Listening'; s.confirmed = false; s.firedThisSilence = false; s.waitKind = 'standard';
    }

    // agoMs (optional): the voice detector noticed the quiet a little late, so backdate the stop.
    function speechEnd(agoMs) {
      if (!s.started || !s.speaking) { return; }
      var spoke = s.speechStartedAt === null ? 0 : now() - s.speechStartedAt;
      var endAt = now() - Math.max(0, Math.min(agoMs || 0, spoke));
      s.speaking = false; s.lastSpeechEndAt = endAt;
      if (s.state === 'Listening') {
        s.state = 'PauseWindow'; s.silenceStartedAt = endAt; s.confirmed = false;
        s.firedThisSilence = false; s.waitKind = 'standard'; s.decision = null;
        say('You paused. Waiting ' + secs(cfg.get('endOfSpeechBufferMs')) + 's to be sure it\'s not just a breath.');
      }
    }

    // A transcript from speech-to-text. final === false means a partial result that may still change.
    function transcript(text, final) {
      if (!s.started) { return; }
      if (final === false) { s.interim = String(text || ''); return; }
      text = String(text || '').trim();
      if (!text) { return; }
      s.interim = '';

      var m = commands.match(text);
      var continuation = m.isCommand && s.burstGap < cfg.get('endOfSpeechBufferMs');
      var asleep = s.state === 'Snoozed' || s.state === 'Stopped';

      if (m.isCommand && !continuation) {
        say('Heard "' + text + '". It was your whole utterance, so I\'m treating it as a command.');
        runCommand(m);
        return;
      }
      if (asleep) {
        say('Heard speech while ' + (s.state === 'Snoozed' ? 'snoozed' : 'stopped') + '. Only commands are listened for, so nothing was kept.');
        return;
      }
      if (continuation) {
        say('Heard "' + text + '". It is a command word, but it came right after other speech, so it\'s part of a sentence and not a command.');
      } else if (m.mention) {
        say('Heard "' + text + '". Contains "' + m.mention + '" but it\'s part of a sentence, so I\'m treating it as normal speech, not a command.');
      }
      addUtterance(text);
    }

    function addUtterance(text) {
      var startT = (s.speechStartedAt === null ? now() : s.speechStartedAt) - s.t0;
      s.utterances.push({ startT: startT, endT: el(), text: text, seg: s.segId });
      s.lastText = computeLastText();
      s.decision = null;
      if (s.state === 'PauseWindow' && s.confirmed && !s.firedThisSilence && s.waitKind === 'standard') {
        var before = currentThresholdMs();
        s.decision = classifyNow();
        var t = thresholdFor(s.decision);
        if (t.ms !== before) { say('Your words arrived after the pause began. ' + t.msg); }
      }
    }

    function clipEnded() {
      if (s.state !== 'Prompting') { s.playing = null; return; }
      s.playing = null;
      s.state = 'PauseWindow'; s.silenceStartedAt = now(); s.confirmed = true; s.confirmedAt = now();
      s.waitKind = 'backoff'; s.firedThisSilence = false;
      s.decision = null; // re-read the situation: the last prompt is now unanswered
      ocean('up'); s.oceanUp = true;
      say('The clip finished. Waiting ' + secs(cfg.get('backoffAfterUnansweredMs')) + 's for an answer before anything else. Ocean fading back up.');
    }

    // The researcher (wizard) plays a clip. The wizard wins: the engine will not fire its own.
    function externalClip(clip, who) {
      if (!s.started || s.state === 'Snoozed' || s.state === 'Stopped') { return false; }
      var label = who || 'Wizard';
      emit({ type: 'playClip', clipId: clip.id, text: clip.text, category: clip.category, kind: 'prompt', who: label.toLowerCase() });
      say(label + ' fired clip "' + clip.id + '". The engine will not fire its own, so the ' + label.toLowerCase() + ' wins.');
      s.state = 'Prompting'; s.promptStartedAt = now(); s.playing = 'prompt';
      s.firedThisSilence = true; s.awaitingAnswer = true; s.unanswered++;
      ocean('clipDuck');
      return true;
    }

    // ---------- the clock tick ----------

    function tick() {
      if (!s.started) { return; }
      var n = now();
      var timeoutMin = cfg.get('sessionTimeoutMin');
      if (timeoutMin > 0 && s.state !== 'Stopped' && n - s.sessionStart >= timeoutMin * 60000) {
        say('The session timeout (' + timeoutMin + ' minutes) was reached, so I\'m stopping.');
        doStop();
        return;
      }
      switch (s.state) {
        case 'Idle':
          if (!s.openerFired && n - s.idleSince >= cfg.get('openerSilenceMs')) { fireOpener(); }
          break;
        case 'PauseWindow':
          if (!s.confirmed && n - s.silenceStartedAt >= cfg.get('endOfSpeechBufferMs')) { confirmPause(); }
          if (s.confirmed && !s.oceanUp && n >= s.silenceStartedAt + cfg.get('oceanReturnDelayMs')) {
            ocean('up'); s.oceanUp = true;
            say(secs(cfg.get('oceanReturnDelayMs')) + 's of quiet. Ocean fading back up over ' + secs(cfg.get('duckReleaseMs')) + 's.');
          }
          if (s.confirmed && hasUnfiled() && n >= s.silenceStartedAt + cfg.get('thoughtSavedDelayMs')) {
            if (!s.decision) { s.decision = classifyNow(); }
            // Only a finished sentence counts as a finished thought here; an unfinished one waits for the full wait.
            if (s.decision.completeness === 'complete') { fileThought(); }
          }
          if (s.confirmed && !s.firedThisSilence && n >= s.confirmedAt + currentThresholdMs()) { expire(); }
          break;
        case 'Prompting':
          if (n - s.promptStartedAt >= cfg.get('clipWatchdogMs')) {
            say('The clip never reported that it finished, so I\'m assuming it did.');
            clipEnded();
          }
          break;
        case 'Snoozed':
          if (n >= s.snoozeUntil) { endSnooze('timer'); }
          break;
        case 'Stopped':
          if (s.stopPending && n - s.stoppedAt >= cfg.get('stopUndoMs')) { finalizeStop(); }
          break;
      }
    }

    function confirmPause() {
      s.confirmed = true;
      s.confirmedAt = s.silenceStartedAt + cfg.get('endOfSpeechBufferMs');
      s.decision = classifyNow();
      var rise;
      if (cfg.get('oceanReturnDelayMs') <= cfg.get('endOfSpeechBufferMs')) {
        ocean('up'); s.oceanUp = true;
        rise = ' Ocean fading back up over ' + secs(cfg.get('duckReleaseMs')) + 's.';
      } else {
        rise = ' The ocean comes back after ' + secs(cfg.get('oceanReturnDelayMs')) + 's of quiet.';
      }
      say('Pause confirmed. ' + thresholdFor(s.decision).msg + rise);
    }

    function playPrompt(pick, category, countsAsUnanswered, situation) {
      emit({ type: 'playClip', clipId: pick.clip.id, situation: situation || pick.clip.situation, text: pick.text, category: category, kind: 'prompt', who: 'system', audioFile: pick.clip.audioFile || null });
      s.state = 'Prompting'; s.promptStartedAt = now(); s.playing = 'prompt';
      s.awaitingAnswer = true; s.firedThisSilence = true; s.lastClipCategory = category;
      if (countsAsUnanswered) { s.unanswered++; }
      ocean('clipDuck');
    }

    function fireOpener() {
      s.openerFired = true;
      var lead = Math.round(cfg.get('openerSilenceMs') / 1000) + ' seconds of silence. ';
      if (cfg.get('condition') === 'silenceOnly') {
        say(lead + 'The silence-only condition is on, so there is no opener.');
        return;
      }
      var o = chooser.pickOpener(getContext() || {});
      if (!o) { say(lead + 'There is no wording for the opening line, so I\'m staying quiet.'); return; }
      say(lead + 'Opener rule fired: ' + o.why + '. Chose clip "' + o.clip.id + '". Playing it.');
      playPrompt(o, 'Opener', true);
    }

    // The wait is over. Choose ONE clip or stay silent.
    function expire() {
      s.firedThisSilence = true;
      fileThought(); // an unfinished thought is saved once the full wait has passed
      var wait = secs(currentThresholdMs()) + 's of silence passed. ';
      var d = s.decision || (s.decision = classifyNow());
      var condition = cfg.get('condition');

      if (condition === 'silenceOnly') {
        say(wait + 'The silence-only condition is on, so I\'m staying quiet.');
        return;
      }
      if (s.unanswered >= cfg.get('maxConsecutiveUnansweredPrompts')) {
        if (!s.snoozeOffered) {
          s.snoozeOffered = true;
          var ex = chooser.pick('exit');
          if (!ex) {
            say(wait + s.unanswered + ' prompts in a row went unanswered. There is no wording for the snooze offer, so I\'m staying quiet.');
            return;
          }
          say(wait + s.unanswered + ' prompts in a row went unanswered, so I\'m offering a snooze once and then going quiet. Chose clip "' + ex.clip.id + '". Playing it.');
          playPrompt(ex, 'Exit', false, 'exit');
        } else {
          say(wait + 'Still no answer, and I already offered a snooze, so I\'m staying quiet until you speak.');
        }
        return;
      }
      if (!s.lastText) {
        if (s.lastSpeechEndAt !== null) {
          say(wait + 'I heard you speaking, but no words came through, so there is nothing to follow up on. Staying quiet.');
        } else {
          say(wait + 'Nothing has been said yet, so there is nothing to follow up on. Staying quiet.');
        }
        return;
      }
      var cat = rules.applyCondition(d.suggestedClipCategory, cfg);
      if (cat === 'none') {
        say(wait + d.reason + ' Choosing silence.');
        return;
      }
      var changed = cat !== d.suggestedClipCategory;
      var situation = situationFor(cat, changed ? null : d.intent, d.downgraded && !changed);
      var pick = chooser.pick(situation);
      if (!pick) {
        var sit = VS.situationById ? VS.situationById(situation) : null;
        say(wait + 'There is no wording for "' + (sit ? sit.title : situation) + '", so I\'m staying quiet.');
        return;
      }
      say(wait + 'Classified your last thought as: ' + d.thoughtType + ', ' + d.tone + ' tone. Chose clip "' + pick.clip.id + '". Playing it. (' + d.reason +
        (changed ? ' The ' + condition + ' condition changed the choice to ' + cat + '.' : '') + ')');
      playPrompt(pick, cat, true, situation);
    }

    // Which situation's wording to use, from the kind of clip the rules chose.
    function situationFor(cat, intent, afterUnanswered) {
      if (cat === 'Backchannel') { return afterUnanswered ? 'back-after-unanswered' : 'backchannel'; }
      if (cat === 'Plan') { return intent === 'pin' ? 'plan-pin' : 'plan'; }
      return { Reflect: 'reflect', Dissect: 'dissect', 'Self-assure': 'self-assure', Opine: 'opine', Emotional: 'emotional', Closer: 'closer', Exit: 'exit' }[cat] || String(cat).toLowerCase();
    }

    // ---------- commands ----------

    function playConfirmation(id, vars) {
      var pick = chooser.pick(id, vars);
      if (!pick) { return; }
      emit({ type: 'playClip', clipId: pick.clip.id, situation: id, text: pick.text, category: 'Confirmation', kind: 'confirmation', who: 'system', audioFile: pick.clip.audioFile || null });
    }

    function runCommand(m) {
      if (m.command === 'snooze') { doSnooze(m.minutes); }
      else if (m.command === 'stop') { doStop(); }
      else if (m.command === 'resume') { doResume(); }
      else if (m.command === 'scratch') { doScratch(m.minutes); }
    }

    function doSnooze(minutes) {
      var min = minutes || cfg.get('snoozeDefaultMin');
      fileThought();
      s.state = 'Snoozed'; s.snoozeUntil = now() + min * 60000;
      s.confirmed = false; s.firedThisSilence = true; s.awaitingAnswer = false; s.unanswered = 0; s.snoozeOffered = false;
      say('Snoozed until ' + VS.fmtClock(el() + min * 60000) + ' (' + VS.minutesPhrase(min) + '). Ocean fading out. Silent until then; only "resume" is listened for.');
      ocean('out');
      playConfirmation('confirm-snoozed', { minutes: VS.minutesPhrase(min) });
    }

    function doStop() {
      if (s.state === 'Stopped') { return; }
      fileThought();
      var count = s.items.length;
      s.state = 'Stopped'; s.stoppedAt = now(); s.stopPending = true; s.stopCount = count; s.confirmed = false;
      say('Session stopped with ' + VS.thoughtsPhrase(count) + '. Say "resume" within ' + secs(cfg.get('stopUndoMs'), 0) + 's to undo. Ocean fading out.');
      ocean('out');
      playConfirmation('confirm-saved', { thoughts: VS.thoughtsPhrase(count) });
    }

    function finalizeStop() {
      s.stopPending = false;
      emit({ type: 'sessionSaved', thoughts: s.stopCount, utterances: s.utterances.slice() });
      say('The undo window is over. Session saved with ' + VS.thoughtsPhrase(s.stopCount) + '. Say "resume" to start a new one.');
    }

    function doResume() {
      if (s.state === 'Snoozed') { endSnooze('command'); return; }
      if (s.state === 'Stopped') {
        if (s.stopPending) {
          s.stopPending = false; s.state = 'Idle'; s.idleSince = now(); s.confirmed = false; s.firedThisSilence = false;
          emit({ type: 'sessionRestored' });
          ocean('in');
          say('Session restored. Nothing was lost. Ocean fading back in.');
          playConfirmation('confirm-restored');
        } else {
          newSession();
        }
        return;
      }
      say('Nothing to resume: the session is already running, so I\'m staying quiet.');
    }

    function endSnooze(how) {
      s.snoozeUntil = 0; s.idleSince = now(); s.confirmed = false; s.firedThisSilence = false;
      s.state = s.speaking ? 'Listening' : 'Idle';
      ocean(s.speaking ? 'duck' : 'in');
      if (how === 'command') {
        say('Snooze ended early by your command. Ocean fading back in.');
      } else {
        say('The snooze is over. Ocean fading back in.' + (s.speaking ? ' You were mid-sentence, so I\'ll just keep listening.' : ''));
      }
    }

    function doScratch(minutes) {
      var min = minutes || cfg.get('scratchDefaultMin');
      var cutoff = el() - min * 60000;
      var kept = s.utterances.filter(function (u) { return u.startT < cutoff; });
      var removed = s.utterances.length - kept.length;
      s.utterances = kept;
      var gone = s.items.filter(function (it) { return it.endT >= cutoff; }).map(function (it) { return it.id; });
      s.items = s.items.filter(function (it) { return it.endT < cutoff; });
      // A saved thought that was only partly scratched is removed whole; its earlier words stay as unsaved speech.
      if (gone.length) {
        s.utterances.forEach(function (u) { if (u.filed && !s.items.some(function (it) { return u.startT >= it.startT && u.startT <= it.endT; })) { u.filed = false; } });
        emit({ type: 'thoughtsScratched', ids: gone });
      }
      s.lastText = computeLastText();
      s.decision = null;
      emit({ type: 'scratch', fromT: Math.max(0, cutoff), toT: el(), removed: removed, minutes: min });
      if (removed === 0) {
        say('Scratch that: nothing was recorded in the last ' + VS.minutesPhrase(min) + ', so nothing was removed.');
        playConfirmation('confirm-scratched-none');
      } else if (kept.length === 0 && min * 60000 >= now() - s.sessionStart) {
        say('Scratched everything so far (' + removed + ' ' + (removed === 1 ? 'utterance' : 'utterances') + '), because the window is longer than the session. It will never be referenced again.');
        playConfirmation('confirm-scratched-all');
      } else {
        say('Scratched the last ' + VS.minutesPhrase(min) + ' (' + removed + ' ' + (removed === 1 ? 'utterance' : 'utterances') + '). It will never be referenced again.');
        playConfirmation(min === 1 ? 'confirm-scratched-one' : 'confirm-scratched', { minutes: VS.minutesPhrase(min) });
      }
    }

    // Same as the spoken commands, for buttons and wizard keys.
    function command(name, minutes, who) {
      if (!s.started) { return; }
      say((who || 'A button') + ' triggered "' + name + '".');
      runCommand({ command: name, minutes: minutes || null });
    }

    // ---------- what the screen needs to show ----------

    function status() {
      var n = now(), out = {
        state: s.state, speaking: s.speaking, confirmed: s.confirmed, phase: 'none', waitedMs: 0, thresholdMs: 0,
        unanswered: s.unanswered, thoughts: thoughtCount(), openerFired: s.openerFired, awaitingAnswer: s.awaitingAnswer, snoozeLeftMs: 0
      };
      if (!s.started) { return out; }
      if (s.state === 'Idle' && !s.openerFired) {
        out.phase = 'opener'; out.waitedMs = n - s.idleSince; out.thresholdMs = cfg.get('openerSilenceMs');
      } else if (s.state === 'PauseWindow') {
        if (!s.confirmed) {
          out.phase = 'buffer'; out.waitedMs = n - s.silenceStartedAt; out.thresholdMs = cfg.get('endOfSpeechBufferMs');
        } else {
          out.phase = s.firedThisSilence ? 'done' : 'wait';
          out.waitedMs = n - s.confirmedAt; out.thresholdMs = currentThresholdMs();
        }
      } else if (s.state === 'Snoozed') {
        out.snoozeLeftMs = Math.max(0, s.snoozeUntil - n);
      }
      return out;
    }

    return {
      start: start, speechStart: speechStart, speechEnd: speechEnd, transcript: transcript,
      clipEnded: clipEnded, tick: tick, externalClip: externalClip, command: command, status: status,
      state: function () { return s.state; },
      actions: function () { return actions.slice(); },
      thoughts: thoughtCount,
      items: function () { return JSON.parse(JSON.stringify(s.items)); },
      /* Everything said this session (after any "scratch that"), with times since the start. */
      utterances: function () { return s.utterances.map(function (u) { return { startT: u.startT, endT: u.endT, text: u.text }; }); },
      /* Change the kind of a saved thought (the language processor may read it more precisely). */
      setItemKind: function (id, kind) { s.items.forEach(function (it) { if (it.id === id) { it.kind = kind; } }); },
      utterances: function () { return s.utterances.slice(); },
      lastText: function () { return s.lastText; }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
