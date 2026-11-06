/*
  nlp.js - the offline language processor: sorts a transcript into items, following your prompt.

  What it is for: it applies your extraction prompt's rules without the internet or a key, using
  "compromise" (a free natural language processing library, in vendor/). It reads how things are
  said rather than what they mean:
    - sentences, clauses, verb tense, questions and pronouns come from compromise;
    - "I need to / have to / will" + an action  -> TASK, committed
      "I could / might / should / maybe I'll"   -> TASK, proposed
    - "I want to / hope to / would like to" + an outcome (be, learn, get better...) -> GOAL
    - feelings, realisations, "I keep", "I've been" about yourself       -> REFLECTION
    - questions about the world, "what if", "I wonder", general claims   -> CONCEPT
    - two or more past events in order (then, so, after...)              -> STORY
    - a rule to live by in your exact words ("you should just...", "always...", "my rule is")
                                                                          -> QUOTE (often none)
  It follows the bifurcation rules (a goal and its step become two linked items; a story and the
  reflection it leads to become two linked items), keeps your exact words in the excerpt, and
  never invents a timestamp, owner or deadline. When unsure it says so (confidence low) or leaves
  the passage unclassified with a reason.

  How it fits: live.js asks VS.nlpKind() for the tag on each thought as you speak. When a session
  is saved, outcomes.js asks VS.nlpExtract() for the full table (and Claude too, if a key is set).
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  function lib() {
    if (root.nlp) { return root.nlp; }
    if (typeof require === 'function') { try { return require('../vendor/compromise.js'); } catch (e) { return null; } }
    return null;
  }

  // ---------- word lists (lower case) ----------
  var ACTION_VERBS = ('call email text message send finish check book buy order pay write draft edit review read submit reply ' +
    'prep prepare plan schedule ask tell remind clean fix sort update run start ring post print pick sign apply cancel ' +
    'return renew look find make set organise organize file move upload download install test try practise practice ' +
    'ramble record note list research contact meet visit see collect drop bring take get grab do finalise finalize ' +
    'outline sketch build ship share publish fill print wash cook pack book follow message dm').split(' ');
  var STATIVE = 'be feel think know want like love hate see seem wonder guess mean understand remember need believe hope wish'.split(' ');
  var GOAL_VERBS = 'be become learn improve grow get master start build achieve have reach own run create launch write travel live finish'.split(' ');
  var FEELINGS = ('bad good sad happy guilty anxious stressed stressing overwhelmed proud frustrated tired boring bored excited ' +
    'worried nervous lonely calm stuck lost confused annoyed upset grateful relieved scared afraid disappointed motivated ' +
    'unmotivated drained exhausted fine weird strange').split(' ');

  var RE = {
    taskCommitted: /\b(i|we)\s+(?:really\s+|definitely\s+|still\s+|just\s+|also\s+|actually\s+)?(need to|needs to|have to|has to|gotta|got to|must|will|'ll|am going to|'m going to|am gonna|'m gonna)\s+(?:really\s+|definitely\s+|just\s+|also\s+|actually\s+)?([a-z']+)/,
    taskRemind: /\b(remind me to|don't forget to|do not forget to|make sure (?:i|to|we)|note to self[:,]?\s*(?:to)?)\s+([a-z']+)/,
    taskProposed: /\b(i|we)\s+(could|might|may|should|can)\s+(?:maybe\s+|probably\s+|also\s+|just\s+|always\s+)?([a-z']+)|\bmaybe\s+(?:i|we)(?:'ll|\s+will|\s+should|\s+could|\s+can)?\s+([a-z']+)|\b(?:i|we)(?:'m|\s+am|\s+are|'re)\s+thinking\s+(?:of|about)\s+([a-z']+ing)/,
    goal: /\b(i|we)\s+(?:really\s+|also\s+|eventually\s+|just\s+)?(want to|wanna|would like to|'d like to|hope to|wish to|aim to|plan to|intend to|am aiming to|'m aiming to|am trying to|'m trying to|dream of|dream about)\s+([a-z']+)/,
    goalStated: /\bmy\s+(goal|aim|dream|plan|ambition|intention)\s+(is|for|this)\b/,
    principle: /^(?:and\s+|but\s+|so\s+)?(always\b|never\b|don't ever\b|you\s+(?:should(?:n't)?|have to|must|need to|can't|cannot|gotta|got to)\b|you've got to\b|the\s+(?:key|trick|point|secret)\s+is\b|what matters(?:\s+most)?\s+is\b|it's\s+(?:always\s+)?better to\b|it's okay to\b|it is okay to\b|life is\b|done is better\b|less is more\b)|\b(i\s+(?:always\s+)?(?:believe|live by|try to live by|remind myself)(?:\s+that)?|my\s+(?:rule|motto|mantra|principle)\s+is|rule of thumb)\b/,
    selfQuestion: /\b(what (?:else )?(?:did|was|were|am|do) i\b|where was i|what am i (?:doing|saying)|what was (?:that|it)|what else|why am i saying)/,
    conceptCue: /\b(what if|i wonder|i reckon|my theory|in theory|hypothes[ie]s|it would be (?:cool|interesting|nice|good) (?:if|to)|imagine if|i think (?:that )?(?:the|it|there|people|we|everyone|most|a lot)|maybe (?:the|it's|there|people|that's)|probably because|the reason (?:is|why)|it seems like|the idea (?:is|that)|an idea)\b/,
    reflectionCue: /\b(i\s+(?:feel|felt|realis|realiz|notic|keep|kept|tend to|struggle|guess i|always|never|love|hate|enjoy|miss|get so|get really|get distracted|ran out|didn't get|haven't|really haven't|was stressing|was thinking|was feeling|was worried|was trying|think i|don't know (?:if|why|how|what))|i've been|i'm\s+(?:so|really|kind of|a bit|not|too|always|still|stuck|just)|i am\s+(?:so|really|not|always|still|stuck)|makes me|made me|it's (?:just )?kind of|it was (?:just )?(?:kind of|so|really))/,
    sequence: /\b(then|and then|after that|afterwards|so i|so we|when i|when we|because i|until|later|eventually|the next|at first|in the end|suddenly|turns out)\b/,
    pastTime: /\b(yesterday|today|this morning|last (?:night|week|month|year|time)|the other day|earlier|once|when i was|a while ago|ago)\b/,
    newTopic: /^(?:anyway|anyways|also|another thing|oh and|okay so|ok so|right so|next|the other thing|on another note|separately)\b/,
    filler: /^(?:um+|uh+|hmm+|like|so|and|yeah|okay|ok|right)[.,!?]*$/,
    unfinished: /\b(and|but|so|because|or|um|uh|like)[.,]*$/
  };

  function lower(s) { return String(s || '').toLowerCase().replace(/[‘’]/g, "'"); }
  function words(s) { return String(s || '').trim().split(/\s+/).filter(Boolean); }
  function cap(s) { s = String(s || '').trim(); return s.charAt(0).toUpperCase() + s.slice(1); }
  function trimEnd(s) { return String(s || '').trim().replace(/[\s,;:.!?—-]+$/, ''); }

  // An exact, short excerpt: the sentence, or a window of words around where the cue was found.
  function excerptOf(text, cueIndex, maxWords) {
    maxWords = maxWords || 26;
    var t = String(text).trim();
    var ws = words(t);
    if (ws.length <= maxWords) { return t; }
    // find which word the cue starts in
    var at = 0, pos = 0;
    if (cueIndex > 0) { for (var i = 0; i < ws.length; i++) { pos = t.indexOf(ws[i], pos); if (pos >= cueIndex) { at = i; break; } pos += ws[i].length; } }
    var from = Math.max(0, Math.min(at - 4, ws.length - maxWords));
    var startPos = 0, k;
    for (k = 0, pos = 0; k <= from; k++) { pos = t.indexOf(ws[k], pos); if (k === from) { startPos = pos; } pos += ws[k].length; }
    var endWord = from + maxWords - 1, endPos = startPos;
    for (k = from, pos = startPos; k <= endWord; k++) { pos = t.indexOf(ws[k], pos); pos += ws[k].length; endPos = pos; }
    return t.slice(startPos, endPos);
  }

  // The words after a cue, up to the end of the clause, as an item description.
  function phraseAfter(text, idx) {
    var rest = String(text).slice(idx);
    rest = rest.split(/[.;!?]|,\s*(?:and|but|so|because|which|though)\b|\s+(?:and then|but|because|so that|so i|so we)\s+/i)[0];
    var ws = words(rest);
    if (ws.length > 14) { rest = ws.slice(0, 14).join(' ') + '...'; }
    return cap(trimEnd(rest));
  }
  function shortDescription(text, n) {
    var ws = words(trimEnd(text));
    return cap(ws.slice(0, n || 12).join(' ') + (ws.length > (n || 12) ? '...' : ''));
  }

  // ---------- reading a sentence ----------
  function features(nlp, sentence) {
    var low = lower(sentence);
    var f = { low: low, words: words(sentence).length, question: /\?\s*$/.test(sentence), past: 0, firstPerson: /\b(i|i'm|i've|i'd|i'll|me|my|myself|we|our|us)\b/.test(low) };
    if (nlp) {
      try {
        var d = nlp(sentence);
        f.past = d.match('#PastTense').length;
        if (!f.question) { f.question = d.questions().found; }
      } catch (e) { /* fall back to the plain reading */ }
    } else {
      f.past = (low.match(/\b\w+ed\b|\b(was|were|went|saw|got|had|did|said|took|made|came|told|felt|thought|found|left|ran|began|bought|wrote)\b/g) || []).length;
    }
    return f;
  }

  function isActionVerb(v) { v = lower(v).replace(/'s$/, ''); return ACTION_VERBS.indexOf(v) >= 0 || (/ing$/.test(v) && ACTION_VERBS.indexOf(v.replace(/ing$/, '')) >= 0); }
  function isStative(v) { return STATIVE.indexOf(lower(v)) >= 0; }

  /* Candidate items found in one sentence (most sentences give one or none). */
  function readSentence(nlp, s) {
    var text = s.text, f = features(nlp, text), low = f.low, out = [], m;
    if (f.words < 3 || RE.filler.test(low.trim())) { return { items: [], why: 'too short to be sure what it means' }; }
    if (f.question && RE.selfQuestion.test(low)) { return { items: [], why: 'a question to yourself while thinking, not a topic to explore' }; }

    // QUOTE: a rule to live by, in your exact words. Present tense, not a question, not long.
    if (!f.question && f.past === 0 && f.words <= 30 && (m = RE.principle.exec(low))) {
      out.push({ category: 'QUOTE', status: 'not applicable', item: 'A principle: ' + shortDescription(text, 10), excerpt: String(text).trim(),
        confidence: 'medium', cue: m.index });
      return { items: out };
    }

    // GOAL and TASK (possibly both, linked: an aim and a concrete step)
    var goalM = RE.goal.exec(low) || RE.goalStated.exec(low);
    var taskM = RE.taskCommitted.exec(low), taskStatus = 'committed';
    var remindM = RE.taskRemind.exec(low);
    if (remindM && (!taskM || remindM.index < taskM.index)) { taskM = remindM; taskM.verb = remindM[2]; }
    else if (taskM) { taskM.verb = taskM[3]; }
    if (taskM && (isStative(taskM.verb) || taskM.verb === 'be' || taskM.verb === 'have')) { taskM = null; } // "I will be", "I'll have"
    if (!taskM) {
      var p = RE.taskProposed.exec(low);
      if (p) { var v = p[3] || p[4] || p[5]; if (v && isActionVerb(v)) { taskM = p; taskM.verb = v; taskStatus = 'proposed'; } }
    }
    // a bare instruction to yourself: "Start prepping the order of tasks..."
    if (!taskM && !goalM && !f.question) {
      var first = lower(words(text)[0] || '').replace(/[^a-z']/g, '');
      if (isActionVerb(first) && f.words >= 3 && !/^(get|do|make|see|take|look)$/.test(first)) { taskM = { index: 0, verb: first, bare: true }; taskStatus = 'committed'; }
    }

    if (goalM) {
      var gv = goalM[3] || '';
      var concreteWant = gv && isActionVerb(gv) && GOAL_VERBS.indexOf(gv) < 0 && f.words <= 14 && !/\b(this year|next year|one day|someday|eventually|by the end)\b/.test(low);
      if (concreteWant && !taskM) {
        // "I want to call mum": a bounded action, said as a wish, so a proposed task
        out.push({ category: 'TASK', status: 'proposed', item: phraseAfter(text, goalM.index + goalM[0].length - gv.length), excerpt: excerptOf(text, goalM.index), confidence: 'medium', cue: goalM.index });
      } else {
        var gIdx = goalM[3] ? goalM.index + goalM[0].length - goalM[3].length : goalM.index + goalM[0].length;
        var gStatus = /plan to|intend to|aiming to|my (?:goal|aim|plan|intention)/.test(goalM[0]) ? 'committed' : 'proposed';
        out.push({ category: 'GOAL', status: gStatus, item: phraseAfter(text, gIdx), excerpt: excerptOf(text, goalM.index),
          confidence: GOAL_VERBS.indexOf(gv) >= 0 || RE.goalStated.test(low) ? 'high' : 'medium', cue: goalM.index });
      }
    }
    if (taskM) {
      var tIdx = taskM.bare ? 0 : taskM.index + taskM[0].length - taskM.verb.length;
      var desc = phraseAfter(text, tIdx);
      if (words(desc).length >= 2) {
        out.push({ category: 'TASK', status: taskStatus, item: desc, excerpt: excerptOf(text, taskM.index),
          confidence: taskStatus === 'committed' && !taskM.bare ? 'high' : 'medium', cue: taskM.index });
      }
    }
    if (out.length) { return { items: out, features: f }; }

    // CONCEPT: an idea or question to explore beyond your own day
    if (f.question) {
      if (RE.selfQuestion.test(low)) { return { items: [], why: 'a question to yourself while thinking, not a topic to explore' }; }
      out.push({ category: 'CONCEPT', status: 'not applicable', item: 'Question: ' + shortDescription(text, 14), excerpt: excerptOf(text, 0), confidence: 'medium', cue: 0 });
      return { items: out, features: f };
    }
    if ((m = RE.conceptCue.exec(low))) {
      out.push({ category: 'CONCEPT', status: 'hypothesis', item: shortDescription(text.slice(m.index), 14), excerpt: excerptOf(text, m.index), confidence: 'medium', cue: m.index });
      return { items: out, features: f };
    }

    // REFLECTION: about yourself - a feeling, a realisation, a pattern you notice
    var feelingWord = FEELINGS.some(function (w) { return new RegExp('\\b' + w + '\\b').test(low); });
    if ((m = RE.reflectionCue.exec(low)) || (f.firstPerson && feelingWord)) {
      out.push({ category: 'REFLECTION', status: 'observation', item: shortDescription(text, 12), excerpt: excerptOf(text, m ? m.index : 0),
        confidence: m ? 'medium' : 'low', reason: m ? '' : 'only a feeling word suggests it is about you', cue: m ? m.index : 0 });
      return { items: out, features: f };
    }

    // CONCEPT: a general claim about the world (not about you), long enough to explore
    if (!f.firstPerson && f.words >= 9 && f.past === 0) {
      out.push({ category: 'CONCEPT', status: 'observation', item: shortDescription(text, 14), excerpt: excerptOf(text, 0),
        confidence: 'low', reason: 'a general statement; the processor cannot tell an idea from small talk', cue: 0 });
      return { items: out, features: f };
    }
    return { items: [], features: f, why: f.firstPerson ? 'about your day, but no feeling, realisation, plan or idea in the wording' : 'no clear task, goal, reflection, idea, story or principle in the wording' };
  }

  // ---------- passages ----------
  function splitSentences(nlp, text) {
    var t = String(text || '').trim();
    if (!t) { return []; }
    var parts = null;
    if (nlp) { try { parts = nlp(t).sentences().out('array'); } catch (e) { parts = null; } }
    if (!parts || !parts.length) { parts = t.split(/(?<=[.!?])\s+/); }
    // keep each sentence as the exact words from the transcript
    var out = [], pos = 0;
    parts.forEach(function (p) {
      p = String(p).trim(); if (!p) { return; }
      var at = t.indexOf(p, pos);
      if (at < 0) { at = t.indexOf(words(p)[0], pos); }
      if (at < 0) { out.push(p); return; }
      out.push(t.slice(at, at + p.length)); pos = at + p.length;
    });
    return out;
  }

  function passagesOf(nlp, utterances, gapMs) {
    var passages = [], cur = null, prevEnd = null;
    utterances.forEach(function (u) {
      var sents = splitSentences(nlp, u.text);
      sents.forEach(function (text, i) {
        var low = lower(text);
        var newUtt = i === 0, gap = newUtt && prevEnd != null && u.startT != null ? u.startT - prevEnd : 0;
        if (!cur || RE.newTopic.test(low) || (newUtt && gap >= gapMs)) {
          cur = { sentences: [] }; passages.push(cur);
        }
        cur.sentences.push({ text: text, t: u.startT, utt: u });
      });
      if (u.endT != null) { prevEnd = u.endT; }
    });
    return passages;
  }

  // A story: two or more past events in order, in the same passage.
  function findStory(nlp, passage) {
    var pastRun = [], best = null;
    passage.sentences.forEach(function (s) {
      var f = features(nlp, s.text);
      s.f = f;
      var interpretation = /\b(made me (?:realis|realiz|think|feel|see)|i realis|i realiz|i learned that|i learnt that|taught me|that's when i (?:knew|realis|realiz))/.test(f.low);
      var narrative = !interpretation && f.past >= 1 && !f.question && (f.firstPerson || /\b(he|she|they|my \w+|a friend|someone)\b/.test(f.low));
      if (narrative) { pastRun.push(s); } else { if (pastRun.length) { best = pick(best, pastRun); } pastRun = []; }
    });
    if (pastRun.length) { best = pick(best, pastRun); }
    function pick(b, run) {
      var verbs = run.reduce(function (n, s) { return n + s.f.past; }, 0);
      var seq = run.some(function (s) { return RE.sequence.test(s.f.low) || RE.pastTime.test(s.f.low); });
      var ok = (run.length >= 2 && verbs >= 3 && seq) || (run.length === 1 && verbs >= 3 && RE.sequence.test(run[0].f.low) && run[0].f.words >= 16);
      if (!ok) { return b; }
      return !b || verbs > b.verbs ? { run: run.slice(), verbs: verbs } : b;
    }
    return best;
  }

  /*
    VS.nlpExtract({ startWall, utterances: [{ startT, endT, text }] }, opts) -> result
      result: { engine: 'nlp', items: [...], unclassified: [...], counts: {...}, note }
      item:   { order, timestamp, category, item, status, excerpts: [text], paraphrase, links, confidence, confidenceReason }
  */
  VS.nlpExtract = function (input, opts) {
    opts = opts || {};
    var nlp = lib();
    var utterances = (input && input.utterances || []).filter(function (u) { return String(u.text || '').trim(); });
    var haveTimes = utterances.length > 0 && utterances.every(function (u) { return u.startT != null; });
    var passages = passagesOf(nlp, utterances, opts.passageGapMs == null ? 6000 : opts.passageGapMs);
    var items = [], unclassified = [];

    passages.forEach(function (p) {
      var story = findStory(nlp, p);
      var storySet = story ? story.run : [];
      var found = [];
      if (story) {
        var first = storySet[0];
        var lastS = storySet[storySet.length - 1];
        found.push({ at: p.sentences.indexOf(first), si: p.sentences.indexOf(lastS), utt: lastS.utt, t: first.t, category: 'STORY', status: 'not applicable',
          item: 'What happened: ' + shortDescription(first.text, 11),
          excerpts: storySet.map(function (s) { return excerptOf(s.text, 0, 34); }),
          confidence: story.verbs >= 4 ? 'medium' : 'low',
          reason: story.verbs >= 4 ? '' : 'only a short run of past events; it may be a single memory' });
      }
      p.sentences.forEach(function (s, i) {
        var r = readSentence(nlp, s);
        var inStory = storySet.indexOf(s) >= 0;
        if (inStory) {
          // inside a story, keep only what stands on its own: a task, goal, quote, or an interpretation
          r.items = r.items.filter(function (it) { return it.category === 'TASK' || it.category === 'GOAL' || it.category === 'QUOTE'; });
          if (!r.items.length) { return; }
        }
        if (!r.items.length) {
          if (words(s.text).length >= 4) {
            var why = RE.unfinished.test(lower(s.text).trim()) ? 'unclear: the sentence trails off' : (r.why || 'no clear category');
            unclassified.push({ t: s.t, excerpt: excerptOf(s.text, 0, 30), reason: why });
          }
          return;
        }
        r.items.forEach(function (it) {
          found.push({ at: i + (it.category === 'TASK' ? 0.1 : 0), si: i, utt: s.utt, t: s.t, category: it.category, status: it.status, item: it.item,
            excerpts: [it.excerpt], confidence: it.confidence, reason: it.reason || '' });
        });
      });
      // A passage is one thought: neighbouring reflective sentences make ONE reflection, and
      // neighbouring general claims ONE concept, quoting the clearest sentences (up to two),
      // not one item per sentence. Anything in between (a task, a goal) keeps them apart.
      found.sort(function (a, b) { return a.at - b.at; });
      var rank = { high: 3, medium: 2, low: 1 }, merged = [];
      found.forEach(function (x) {
        var prev = merged[merged.length - 1];
        var mergeable = (x.category === 'REFLECTION' || (x.category === 'CONCEPT' && !/^Question:/.test(x.item)));
        if (prev && mergeable && prev.category === x.category && !/^Question:/.test(prev.item)) {
          prev.group.push(x);
        } else { x.group = [x]; merged.push(x); }
      });
      found = merged.map(function (keep) {
        var group = keep.group; delete keep.group;
        if (group.length < 2) { return keep; }
        var best = group.slice().sort(function (a, b) { return rank[b.confidence] - rank[a.confidence] || a.at - b.at; });
        keep.excerpts = best.slice(0, 2).sort(function (a, b) { return a.at - b.at; }).map(function (x) { return x.excerpts[0]; });
        keep.item = best[0].item;
        keep.confidence = keep.category === 'CONCEPT' && best[0].confidence === 'low' ? 'medium' : best[0].confidence;
        keep.reason = keep.confidence === 'low' ? best[0].reason : '';
        return keep;
      });
      // de-duplicate: the same words should not appear as two items of the same kind
      var seen = {};
      found = found.filter(function (it) { var k = it.category + '|' + it.excerpts.join('|'); if (seen[k]) { return false; } seen[k] = true; return true; });
      found.sort(function (a, b) { return a.at - b.at; });
      // links within a passage, as the bifurcation rules ask
      var base = items.length;
      found.forEach(function (it, j) { it.order = base + j + 1; it.links = []; });
      // Link only what was said together: in the same stretch of speech and within a sentence
      // or two of each other. Being near each other in time is not enough (no invented links).
      function together(x, y) { return x.utt && x.utt === y.utt && Math.abs((x.si || 0) - (y.si || 0)) <= 2; }
      function linkAll(a, b) { found.forEach(function (x) { if (x.category !== a) { return; } found.forEach(function (y) { if (y.category === b && together(x, y)) { x.links.push(y.order); y.links.push(x.order); } }); }); }
      linkAll('GOAL', 'TASK');
      linkAll('STORY', 'REFLECTION');
      if (found.some(function (x) { return x.category === 'REFLECTION'; }) && found.some(function (x) { return x.category === 'CONCEPT' && x.confidence !== 'low'; })) { linkAll('REFLECTION', 'CONCEPT'); }
      found.forEach(function (it) { items.push(it); });
    });

    var counts = {};
    VS.CATEGORIES.forEach(function (c) { counts[c] = 0; });
    var out = items.map(function (it) {
      counts[it.category]++;
      var uniq = it.links.filter(function (n, i, a) { return a.indexOf(n) === i && n !== it.order; }).sort(function (a, b) { return a - b; });
      return {
        order: it.order,
        timestamp: haveTimes && it.t != null ? VS.stamp(it.t) : 'not available',
        category: it.category, item: it.item, status: it.status,
        excerpts: it.excerpts, paraphrase: '', links: uniq,
        confidence: it.confidence, confidenceReason: it.confidence === 'low' ? (it.reason || 'weak wording cue') : ''
      };
    });

    var lows = out.filter(function (x) { return x.confidence === 'low'; }).map(function (x) { return x.order; });
    var note = [];
    note.push(haveTimes ? 'Timestamps are minutes:seconds since the session started, taken from when each stretch of speech began; none are missing.' :
      'Some speech had no time, so those items show "not available" instead of a timestamp.');
    note.push('Sorted offline by the language processor, which reads wording cues (tense, "need to" versus "could", questions), not meaning.' +
      (lows.length ? ' Treat item' + (lows.length > 1 ? 's ' : ' ') + lows.join(', ') + ' with care: the wording was ambiguous.' : ''));
    if (!counts.QUOTE) { note.push('No guiding principle was said in exact words, so there are no quotes.'); }

    return {
      engine: 'nlp', items: out,
      unclassified: unclassified.map(function (u) { return { timestamp: haveTimes && u.t != null ? VS.stamp(u.t) : 'not available', excerpt: u.excerpt, reason: u.reason }; }),
      counts: counts, note: note.join(' ')
    };
  };

  /* The kind of one captured thought, for its tag while you speak: 'task', 'goal', 'reflection',
     'concept', 'story', 'quote', or null when the wording gives no clear cue. */
  VS.nlpKind = function (text) {
    var r = VS.nlpExtract({ utterances: [{ text: text }] });
    if (!r.items.length) { return null; }
    var pick = r.items.filter(function (x) { return x.category === 'TASK' && x.status === 'committed'; })[0] ||
      r.items.filter(function (x) { return x.category === 'GOAL'; })[0] || r.items[0];
    return pick.category.toLowerCase();
  };

  VS.nlpAvailable = function () { return !!lib(); };
})(typeof window !== 'undefined' ? window : globalThis);
