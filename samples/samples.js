/*
  samples.js - example transcripts for the dry-run simulator.

  What it is for: so you have something to run straight away. Each one shows a different rule.
  (Same reason as clips.js: a page opened from your Mac can load a script but not a separate
  text file. You can still load your own .txt transcript with the "Load a .txt file" button.)
*/
(function (root) {
  var VS = root.VS = root.VS || {};
  VS.SAMPLES = {
    'basic': {
      title: '1. A normal session: opener, a thought, follow-ups',
      text: [
        '# Silence at the start gets one opener. A short pause is a breath. A long pause after a finished plan gets one question.',
        '[long pause]',
        "I've been thinking about the move and I keep going back and forth",
        '[pause]',
        'I should probably make a list of what actually needs to happen first',
        '[long pause]',
        'Yeah I think that is right',
        '[long pause]'
      ].join('\n')
    },
    'unfinished': {
      title: '2. Unfinished sentence, self-addressed question, command words inside a sentence',
      text: [
        '# "and" at the end means the system waits longer. A question to yourself is never answered.',
        '# "stopped" inside a sentence is not a command. "snooze for ten minutes" on its own is.',
        'I was going to call her back and',
        '[long pause]',
        'What else did I think about this morning',
        '[long pause]',
        'I stopped because I wanted to take notes',
        '[pause]',
        'snooze for ten minutes',
        '[long pause]'
      ].join('\n')
    },
    'unanswered': {
      title: '3. Two prompts go unanswered: a snooze is offered once, then quiet',
      text: [
        '# The system never asks two questions in a row. After two unanswered prompts it offers a snooze once and goes quiet.',
        'I need to sort out the invoices before Friday',
        '[long pause]',
        '[long pause]',
        '[long pause]',
        '[long pause]'
      ].join('\n')
    },
    'heavy': {
      title: '4. A heavy moment: only a soft backchannel, never a probe',
      text: [
        '# Emotional or heavy words limit the system to a soft "Mm." or "I am here." It never asks a question.',
        "I feel like I'm failing at all of it and I can't keep this up",
        '[long pause]'
      ].join('\n')
    },
    'commands': {
      title: '5. Scratch that, stop, and undo the stop with resume',
      text: [
        '# A long silence makes the next sentence a new thought. "scratch that" removes only the last 3 minutes.',
        '# "stop" saves; "resume" within 10 seconds undoes it.',
        'The first idea is to start with the settings screen',
        '[silence 240s]',
        'The second idea is a quiet mode for the evenings',
        '[pause]',
        'scratch that',
        '[pause]',
        'stop',
        '[pause 4s]',
        'resume',
        '[long pause]'
      ].join('\n')
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
