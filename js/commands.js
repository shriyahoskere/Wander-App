/*
  commands.js - the voice command matcher: "snooze", "stop", "resume", "scratch that".

  What it is for: decide, with plain fixed rules (never an AI model), whether something
  you said is a command. It is a command ONLY when it is your whole utterance and short.
  "I stopped because I wanted to take notes" is just you talking, so it never stops anything.

  How it fits: the engine hands every final transcript to match(). The phrases that count
  as each command live in the config (commandVariants) so you can edit them.
  Whether there was a pause before the words is checked by the engine, which knows the timing.
*/
(function (root) {
  var VS = root.VS = root.VS || {};
  var MIN_WORDS = '(?:minute|minutes|min|mins)';

  VS.createCommandMatcher = function (cfg) {
    // Words that, if they appear inside a longer sentence, deserve a "this is not a command" note.
    var MENTION_STEMS = { snooze: 'snooze', stop: 'stop', resume: 'resume', scratch: 'scratch' };

    function findMention(norm) {
      var words = norm.split(' ');
      for (var i = 0; i < words.length; i++) {
        for (var stem in MENTION_STEMS) {
          if (words[i].indexOf(stem) === 0) { return words[i]; }
        }
      }
      return null;
    }

    function matchVariants(norm, words) {
      var variants = cfg.get('commandVariants');
      for (var cmd in variants) {
        var list = variants[cmd];
        for (var i = 0; i < list.length; i++) {
          if (VS.normalise(list[i]) === norm && words <= cfg.get('commandMaxWords')) {
            return { isCommand: true, command: cmd, minutes: null, via: 'phrase' };
          }
        }
      }
      return null;
    }

    // "snooze for ten minutes", "scratch the last five minutes"
    function matchWithNumber(norm, words) {
      if (words > cfg.get('commandMaxWords') + 2) { return null; }
      var m = new RegExp('^snooze (?:for )?(?:about )?([a-z0-9 ]+?) ' + MIN_WORDS + '$').exec(norm);
      if (m) {
        var n = VS.wordsToNumber(m[1]);
        if (n !== null && n >= 1 && n <= 600) { return { isCommand: true, command: 'snooze', minutes: n, via: 'number' }; }
        return null;
      }
      m = new RegExp('^scratch (?:the |that )?last (?:([a-z0-9 ]+?) )?' + MIN_WORDS + '$').exec(norm);
      if (m) {
        var s = m[1] ? VS.wordsToNumber(m[1]) : 1;
        if (s !== null && s >= 1 && s <= 600) { return { isCommand: true, command: 'scratch', minutes: s, via: 'number' }; }
      }
      return null;
    }

    return {
      /*
        match(text) -> { isCommand: true, command, minutes } when the whole utterance is a command,
        otherwise { isCommand: false, mention } where mention is a command-like word found inside
        a longer sentence (or null).
      */
      match: function (text) {
        var norm = VS.normalise(text);
        if (!norm) { return { isCommand: false, mention: null }; }
        var words = norm.split(' ').length;
        var hit = matchVariants(norm, words) || matchWithNumber(norm, words);
        if (hit) { return hit; }
        return { isCommand: false, mention: findMention(norm) };
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
