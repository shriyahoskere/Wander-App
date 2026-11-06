/*
  clips.js - the DEFAULT wording: every line the system may say, grouped by situation.

  What it is for: the system never makes up sentences. It only chooses from these lines, so its
  personality lives here. You normally change wording on the Wording tab of the page (your edits
  are kept in your browser and win over these defaults). This file is the starting point and what
  "Restore default" goes back to.

  Fields: id, situation (which moment it belongs to; see js/situations.js), category (the broad
  kind, used in the narration), text, optional template (the text has {blanks} filled in when it
  is said: {goal}, {topic}, {minutes}, {thoughts}).

  Why this is a .js file and not clips.json: a page opened straight from your Mac cannot read a
  separate JSON file, but it can load a script. The content is the same data.
*/
(function (root) {
  var VS = root.VS = root.VS || {};
  function c(id, situation, category, text, template) {
    return { id: id, situation: situation, category: category, text: text, template: !!template };
  }
  VS.CLIPS = [
    // ---- Starting a session ----
    c('opener-open', 'opener-open', 'Opener', 'Whenever you\'re ready. What\'s on your mind?'),
    c('opener-open-2', 'opener-open', 'Opener', 'Take your time. Anything you\'d like to get out of your head?'),
    c('opener-goal', 'opener-goal', 'Opener', 'A lot can happen in a day. Has anything shifted with {goal}?', true),
    c('opener-resurface', 'opener-resurface', 'Opener', 'Something from earlier came back around. Want to hear it?'),
    c('opener-resurface-topic', 'opener-resurface', 'Opener', 'Something about {topic} came back around. Want to hear it?', true),

    // ---- After a finished thought ----
    c('plan-gentle-first-step', 'plan', 'Plan', 'What might be a gentle first step with that?'),
    c('plan-today-or-later', 'plan', 'Plan', 'Does this feel like a today thing, or something that can wait?'),
    c('plan-smallest-version', 'plan', 'Plan', 'What would the smallest version of that look like?'),
    c('plan-pin-task', 'plan-pin', 'Plan', 'Want me to pin that as a task?'),
    c('plan-pin-todo', 'plan-pin', 'Plan', 'Should I hold onto that as a to-do?'),
    c('reflect-sitting-with-you', 'reflect', 'Reflect', 'What\'s been sitting with you about that?'),
    c('reflect-friend', 'reflect', 'Reflect', 'If a friend told you this, what would you say to them?'),
    c('reflect-what-matters', 'reflect', 'Reflect', 'What feels like it matters most here?'),
    c('closer-everything', 'closer', 'Closer', 'Does that feel like everything, for now?'),
    c('closer-all-for-now', 'closer', 'Closer', 'Is that all for now?'),
    c('closer-anything-else', 'closer', 'Closer', 'Anything else, or is that it for now?'),
    c('dissect-heaviest', 'dissect', 'Dissect', 'Which part of this feels the heaviest?'),
    c('dissect-underneath', 'dissect', 'Dissect', 'Is there something a bit underneath that?'),
    c('dissect-tangled', 'dissect', 'Dissect', 'Which bit is the most tangled?'),
    c('assure-sit-now', 'self-assure', 'Self-assure', 'How does that sit with you now?'),
    c('assure-easier', 'self-assure', 'Self-assure', 'What would make that feel a little easier?'),
    c('assure-hold', 'self-assure', 'Self-assure', 'Is there anything that would help that hold?'),
    c('opine-leaning', 'opine', 'Opine', 'Where are you leaning with it, right now?'),
    c('opine-gut', 'opine', 'Opine', 'What\'s your gut saying?'),
    c('opine-pulling', 'opine', 'Opine', 'Is one option pulling at you more?'),

    // ---- After an unfinished thought ----
    c('back-go-on', 'backchannel', 'Backchannel', 'Go on.'),
    c('back-more', 'backchannel', 'Backchannel', 'Is there more to this?'),
    c('back-take-time', 'backchannel', 'Backchannel', 'Take your time.'),

    // ---- Soft responses ----
    c('emo-mm', 'emotional', 'Emotional', 'Mm.'),
    c('emo-here', 'emotional', 'Emotional', 'I\'m here.'),
    c('emo-time', 'emotional', 'Emotional', 'Take all the time you need.'),

    // ---- When you don't answer ----
    c('quiet-still-here', 'back-after-unanswered', 'Backchannel', 'I\'m still here, whenever you\'re ready.'),
    c('quiet-no-rush', 'back-after-unanswered', 'Backchannel', 'No rush.'),
    c('quiet-listening', 'back-after-unanswered', 'Backchannel', 'I\'m listening.'),
    c('exit-snooze-offer', 'exit', 'Exit', 'That\'s okay, no pressure. Want me to snooze for a bit?'),
    c('exit-good-time', 'exit', 'Exit', 'Is this a good time?'),
    c('exit-say-the-word', 'exit', 'Exit', 'Just say the word and we can snooze.'),

    // ---- Confirming a command ----
    c('confirm-saved', 'confirm-saved', 'Confirmation', 'Saved. {thoughts}.', true),
    c('confirm-snoozed', 'confirm-snoozed', 'Confirmation', 'Snoozed. {minutes}.', true),
    c('confirm-restored', 'confirm-restored', 'Confirmation', 'Back again. Nothing was lost.'),
    c('confirm-scratched', 'confirm-scratched', 'Confirmation', 'Scratched. Last {minutes} gone.', true),
    c('confirm-scratched-one', 'confirm-scratched-one', 'Confirmation', 'Scratched. Last minute gone.'),
    c('confirm-scratched-all', 'confirm-scratched-all', 'Confirmation', 'Scratched. That\'s everything so far.'),
    c('confirm-scratched-none', 'confirm-scratched-none', 'Confirmation', 'Nothing to scratch.'),

    // ---- When something goes wrong ----
    c('alert-mic', 'alert-mic', 'Alert', 'I can\'t hear the microphone right now.'),
    c('alert-words', 'alert-words', 'Alert', 'I can\'t catch your words right now.'),
    c('alert-lost', 'alert-lost', 'Alert', 'I lost the last bit. Say it again?')
  ];
})(typeof window !== 'undefined' ? window : globalThis);
