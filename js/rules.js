/*
  rules.js - the deterministic "listening" rules (no AI model involved).

  What it is for: read the last thing you said and decide, using plain word lists and
  patterns from the config: is it finished or unfinished, was it a question you asked
  yourself, is it emotional, is it a plan, did you decide something? Then it picks which
  KIND of clip would fit (or none). It returns the same shape of answer that the AI
  layer will return in milestone 5, so the AI can slot in later without changing the engine.

  How it fits: the engine calls classify() while you are in a pause, so the answer is
  ready when the timer runs out. When in doubt, it chooses a soft backchannel or silence.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  // Categories that are questions. Never used right after an unanswered prompt.
  var QUESTION_CATEGORIES = ['Plan', 'Reflect', 'Dissect', 'Self-assure', 'Opine', 'Closer'];
  VS.QUESTION_CATEGORIES = QUESTION_CATEGORIES;

  function phraseRegex(phrase) {
    return new RegExp("(^|[^a-z0-9'])" + VS.escapeRegExp(VS.normalise(phrase)) + "($|[^a-z0-9'])");
  }

  // Returns the first phrase from the list found in the (already normalised) text, or null.
  function findPhrase(norm, list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] && phraseRegex(list[i]).test(norm)) { return list[i]; }
    }
    return null;
  }

  // The last sentence of the raw text, normalised.
  function lastSentence(text) {
    var parts = String(text).split(/[.?!]+/);
    for (var i = parts.length - 1; i >= 0; i--) {
      var n = VS.normalise(parts[i]);
      if (n) { return n; }
    }
    return '';
  }

  var rules = {
    /* How does the text end? -> { kind: 'complete'|'incomplete'|'filler'|'trailing', word } */
    endingKind: function (text, cfg) {
      var raw = String(text).trim();
      if (/(\.\.\.|…|—|--)\s*$/.test(raw)) { return { kind: 'trailing', word: '...' }; }
      var norm = VS.normalise(raw);
      if (!norm) { return { kind: 'complete', word: '' }; }
      var words = norm.split(' ');
      var last = words[words.length - 1];
      if (cfg.get('fillerWords').indexOf(last) >= 0) { return { kind: 'filler', word: last }; }
      if (cfg.get('incompleteEndings').indexOf(last) >= 0) { return { kind: 'incomplete', word: last }; }
      return { kind: 'complete', word: last };
    },

    /* Was the last sentence a question the person asked themselves? */
    isSelfAddressedQuestion: function (text, cfg) {
      var s = lastSentence(text);
      if (!s) { return false; }
      var pats = cfg.get('selfQuestionPatterns');
      for (var i = 0; i < pats.length; i++) {
        try { if (new RegExp(pats[i], 'i').test(s)) { return true; } } catch (e) { /* skip a broken pattern */ }
      }
      return false;
    },

    /*
      classify(text, ctx, cfg) -> decision (same fields the AI layer returns, plus source and intent)
      ctx: { lastWasUnanswered: boolean }
    */
    classify: function (text, ctx, cfg) {
      ctx = ctx || {};
      var raw = String(text || '').trim();
      if (!raw) {
        return {
          completeness: 'complete', thoughtType: 'reflect', tone: 'neutral', selfResolving: false,
          selfAddressedQuestion: false, sensitive: false, suggestedClipCategory: 'none', intent: null,
          reason: 'Nothing has been said that I could follow up on.', source: 'rules', endingWord: ''
        };
      }
      var norm = VS.normalise(raw);
      var recent = VS.normalise(raw.split(/[.?!]+/).slice(-3).join(' '));
      var end = rules.endingKind(raw, cfg);
      var selfQ = rules.isSelfAddressedQuestion(raw, cfg);
      var heavy = findPhrase(recent, cfg.get('heavyWords'));
      var emotional = findPhrase(recent, cfg.get('emotionalWords'));
      var sensitiveHit = findPhrase(recent, cfg.get('sensitivePhrases'));
      var selfRes = findPhrase(recent, cfg.get('selfResolvingPhrases'));
      var plan = findPhrase(recent, cfg.get('planPhrases'));
      var closer = findPhrase(recent, cfg.get('closerPhrases'));

      var completeness = end.kind === 'trailing' ? 'trailing' : (end.kind === 'complete' ? 'complete' : 'incomplete');
      var tone = heavy ? 'heavy' : (emotional ? 'emotional' : 'neutral');
      var sensitive = !!(heavy || sensitiveHit);

      var thoughtType = 'reflect';
      if (selfQ || /\bi wonder\b/.test(recent)) { thoughtType = 'wonder'; }
      else if (selfRes) { thoughtType = 'self-assure'; }
      else if (plan) { thoughtType = 'plan'; }
      else if (/\b(worried|anxious|nervous|afraid)\b/.test(recent)) { thoughtType = 'worry'; }
      else if (/\b(ugh|so annoying|so frustrating|hate when)\b/.test(recent)) { thoughtType = 'vent'; }
      else if (/\b(i think|i feel like|honestly|i prefer)\b/.test(recent)) { thoughtType = 'opine'; }

      var category, intent = null, reason, downgraded = false;
      if (selfQ) {
        category = 'none';
        reason = 'It sounded like a question you asked yourself, so I will not answer it.';
      } else if (tone !== 'neutral' || sensitive) {
        category = 'Emotional';
        reason = tone !== 'neutral'
          ? 'It sounded ' + tone + ', so only a soft backchannel is allowed and I will not probe.'
          : 'It sounded private or self-critical, so only a soft backchannel is allowed and I will not probe.';
      } else if (completeness !== 'complete') {
        category = 'Backchannel';
        reason = 'The thought looks unfinished, so a gentle backchannel fits best.';
      } else if (selfRes) {
        category = 'Plan'; intent = 'pin';
        reason = 'You decided something yourself, so I can offer to pin it as a task.';
      } else if (closer) {
        category = 'Closer';
        reason = 'It sounded clearly finished, so a closer fits.';
      } else if (plan) {
        category = 'Plan';
        reason = 'It sounded like a plan or task, so a planning question fits.';
      } else {
        category = 'Reflect';
        reason = 'It looks like a finished but unresolved thought, so a reflective question fits.';
      }

      // Never ask a question right after an unanswered prompt: downgrade to a backchannel.
      if (ctx.lastWasUnanswered && QUESTION_CATEGORIES.indexOf(category) >= 0) {
        category = 'Backchannel'; intent = null; downgraded = true;
        reason += ' My last prompt got no answer, so I am using a gentle line instead of asking another question.';
      }

      return {
        completeness: completeness, thoughtType: thoughtType, tone: tone, selfResolving: !!selfRes,
        selfAddressedQuestion: selfQ, sensitive: sensitive, suggestedClipCategory: category, intent: intent,
        reason: reason, source: 'rules', endingWord: end.word, endingKind: end.kind, downgraded: downgraded
      };
    },

    /* What kind of thought is this, for the captured list? 'goal', 'task' or 'reflection'. */
    kindOf: function (text, cfg) {
      var norm = VS.normalise(text);
      if (findPhrase(norm, cfg.get('goalPhrases'))) { return 'goal'; }
      if (findPhrase(norm, cfg.get('selfResolvingPhrases')) || findPhrase(norm, cfg.get('planPhrases'))) { return 'task'; }
      return 'reflection';
    },

        /* Apply the experience condition (fullPrompt / backchannelOnly / silenceOnly) to a category. */
    applyCondition: function (category, cfg) {
      var c = cfg.get('condition');
      if (category === 'none') { return 'none'; }
      if (c === 'silenceOnly') { return 'none'; }
      if (c === 'backchannelOnly' && category !== 'Backchannel' && category !== 'Emotional') { return 'Backchannel'; }
      return category;
    }
  };

  VS.rules = rules;
})(typeof window !== 'undefined' ? window : globalThis);
