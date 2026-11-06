/*
  situations.js - every moment the system can speak (or deliberately stays silent).

  What it is for: this is the "form" behind the Wording tab. Each situation says, in plain words,
  exactly when it plays, when it never plays, which {blanks} its lines may use, and whether it is
  in use yet. The engine asks for wording by these ids, so every outcome has its own lines.

  How it fits: wording-ui.js turns this list into the Wording tab. A test checks that every
  situation the engine can ask for is listed here.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  function s(id, group, title, when, never, extra) {
    var o = { id: id, group: group, title: title, when: when, never: never, blanks: [], status: 'active', required: false };
    if (extra) { for (var k in extra) { o[k] = extra[k]; } }
    return o;
  }

  var START = 'Starting a session';
  var DONE = 'After you finish a thought (60 s of quiet)';
  var UNDONE = 'After an unfinished thought (90 s of quiet)';
  var SOFT = 'Soft responses';
  var NOANSWER = 'When you don\'t answer';
  var CONFIRM = 'Confirming a command';
  var WRONG = 'When something goes wrong';

  VS.SITUATION_GROUPS = [START, DONE, UNDONE, SOFT, NOANSWER, CONFIRM, WRONG];

  VS.SITUATIONS = [
    s('opener-open', START, 'Opening line',
      'You start a session and say nothing for a full minute. Said once per session, and only if there is no recent goal or earlier thought to bring up.',
      'You have already started talking. It is never repeated, even if ignored.'),
    s('opener-goal', START, 'Opening line about a goal',
      'Session start, after a minute of quiet, when one of your goals had recent activity. {goal} becomes a short name for the goal.',
      'There are no goals with recent activity. Never repeated if you ignore it.',
      { blanks: ['goal'], status: 'later', later: 'Goals arrive with saved sessions (milestone 3, part 2).' }),
    s('opener-resurface', START, 'Opening line bringing back an earlier thought',
      'Session start, after a minute of quiet, when a non-sensitive thought from an earlier session can come back. {topic} (optional) becomes a neutral few-word name for it.',
      'The thought was marked sensitive or was scratched. Your exact private words are never used.',
      { blanks: ['topic'], status: 'later', later: 'Needs saved sessions (milestone 3, part 2).' }),

    s('plan', DONE, 'Planning question',
      'Your last sentence was finished and sounded like a task or plan ("I need to...", "tomorrow", "deadline").',
      'The tone was emotional or heavy. The last prompt went unanswered.'),
    s('plan-pin', DONE, 'Offer to pin a task',
      'You answered or decided something yourself ("I think I\'ll just...", "I just need to...").',
      'The thought was sensitive. The last prompt went unanswered.'),
    s('reflect', DONE, 'Reflective question',
      'Your last sentence was finished but the thought sounded unresolved, and it was not a plan.',
      'The tone was emotional or heavy. The last prompt went unanswered.'),
    s('closer', DONE, 'Closer',
      'You sounded clearly done ("that\'s it", "that\'s all", "anyway").',
      'The tone was emotional or heavy. The last prompt went unanswered.'),
    s('dissect', DONE, 'Question that digs a little deeper',
      'A long, tangled but neutral thought.',
      'Any emotional, heavy or sensitive content.',
      { status: 'later', later: 'Chosen by the listening layer (milestone 5). The word-list rules cannot tell this case apart yet.' }),
    s('self-assure', DONE, 'Question after you reassured yourself',
      'You reassured yourself about something uncertain.',
      'Sensitive content. Never used as a compliment.',
      { status: 'later', later: 'Chosen by the listening layer (milestone 5).' }),
    s('opine', DONE, 'Question when you are weighing options',
      'You weighed options out loud without choosing.',
      'The tone was emotional or heavy.',
      { status: 'later', later: 'Chosen by the listening layer (milestone 5).' }),

    s('backchannel', UNDONE, 'Gentle nudge to continue',
      'You stopped mid-sentence: the last word was "and", "because", "so", "but", a filler like "um", or you trailed off. Also used for everything when the backchannel-only condition is on.',
      'It was a question you asked yourself.'),

    s('emotional', SOFT, 'Soft response',
      'What you said contained emotional, heavy or self-critical words (the lists are in Settings, "Word lists the rules use"). Only these lines are allowed then: never a question, never a probe.',
      'The tone was neutral.'),

    s('back-after-unanswered', NOANSWER, 'After a prompt got no answer',
      'The system spoke, you stayed quiet for 90 s. It never asks a second question in a row, so it uses one of these instead.',
      'You answered. Two prompts in a row already went unanswered (then the snooze offer comes instead).'),
    s('exit', NOANSWER, 'Snooze offer',
      'Two prompts in a row went unanswered and another 90 s passed. Said once, then the system stays quiet until you speak.',
      'You are speaking. It has already been offered in this quiet stretch.'),

    s('confirm-saved', CONFIRM, 'After "stop"',
      'You said "stop" on its own. {thoughts} becomes e.g. "seven thoughts".',
      'Never at an ordinary pause.', { blanks: ['thoughts'] }),
    s('confirm-snoozed', CONFIRM, 'After "snooze"',
      'You said "snooze" or "snooze for ten minutes" on its own. {minutes} becomes e.g. "ten minutes".',
      'Never at an ordinary pause.', { blanks: ['minutes'] }),
    s('confirm-restored', CONFIRM, 'After "resume" undoes a stop',
      'You said "resume" within 10 s of "stop", so the session is restored.',
      'A snooze ending (the ocean fading back in is the signal then).'),
    s('confirm-scratched', CONFIRM, 'After "scratch that"',
      'You said "scratch that" (or "scratch the last five minutes") and something was removed. {minutes} becomes e.g. "three minutes".',
      'The window was exactly one minute (next card), or covered everything, or nothing was there.', { blanks: ['minutes'] }),
    s('confirm-scratched-one', CONFIRM, 'After "scratch the last minute"',
      'You asked to scratch exactly one minute and something was removed.',
      'Any other length.'),
    s('confirm-scratched-all', CONFIRM, 'After "scratch that" removed everything',
      'The scratch window was longer than the whole session so far.',
      'Something earlier was kept.'),
    s('confirm-scratched-none', CONFIRM, 'After "scratch that" with nothing to remove',
      'Nothing was said in the scratch window.',
      'Something was removed.'),

    s('alert-mic', WRONG, 'Microphone problem',
      'The microphone is blocked, missing or unplugged.',
      'Never skipped: failures are never silent, so this needs at least one line.', { required: true }),
    s('alert-words', WRONG, 'Transcription cannot work',
      'No ElevenLabs key, the key was refused, credits ran out, or no internet. Said at most once every 30 s.',
      'The problem is a dropped connection mid-sentence (next card).', { required: true }),
    s('alert-lost', WRONG, 'Words were lost',
      'The connection dropped while you were speaking, so that bit was not captured. Said at most once every 30 s.',
      'Never skipped: this needs at least one line.', { required: true })
  ];

  // Moments where the system deliberately says nothing. Shown on the Wording tab so every outcome is visible.
  VS.SILENT_OUTCOMES = [
    ['A breath shorter than 1 second', 'Not counted as a pause at all.'],
    ['While you are speaking', 'Completely silent. A clip that was playing is cut off.'],
    ['A question you asked yourself ("what else did I think about?")', 'The wait is 90 s and then the system chooses silence. It never answers it.'],
    ['Nothing said yet, or no words came through', 'After the wait, it stays quiet: there is nothing to follow up on.'],
    ['After the snooze offer has been made', 'Quiet until you speak again.'],
    ['After the opener is ignored', 'Quiet. The opener is never repeated.'],
    ['While snoozed', 'Fully silent. Only "resume" is listened for.'],
    ['When a snooze ends', 'The ocean fades back in. No words.'],
    ['The silence-only condition (Settings, "condition")', 'Never speaks on its own; commands are still confirmed.'],
    ['At an ordinary pause', 'No chime, no "mm-hm". The ocean rising back is the "I heard you".']
  ];

  VS.situationById = function (id) {
    for (var i = 0; i < VS.SITUATIONS.length; i++) { if (VS.SITUATIONS[i].id === id) { return VS.SITUATIONS[i]; } }
    return null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
