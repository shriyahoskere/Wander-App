/*
  accurate.js - a second, more accurate transcript of the whole session, made when you save.

  What it is for: live transcription has to guess each short stretch on its own, within a
  fraction of a second, so it sometimes picks the wrong words. When you save, this sends the
  whole session's audio once to ElevenLabs' standard (not live) model, Scribe v2, which hears
  every word in its full context, plus your word list (names and terms it should expect). The
  result replaces the live words for sorting and in "What you said".

  Privacy: the audio is kept only in this tab's memory while the session runs, sent once when you
  save, then discarded. It is never saved to disk or the browser. Anything you scratched, and
  anything said while snoozed, is left out: only words that fall inside the stretches the session
  kept are used.

  Request (ElevenLabs docs): POST {api}/v1/speech-to-text, header xi-api-key, multipart form with
  model_id=scribe_v2, file (a WAV), language_code, timestamps_granularity=word,
  tag_audio_events=false, and one "keyterms" field per term. The reply has "words", each with
  text, start and end in seconds.

  How it fits: live.js records with VS.createSessionRecorder(); outcomes.js calls
  VS.accurateTranscript() before sorting.
*/
(function (root) {
  var VS = root.VS = root.VS || {};
  var RATE = 16000;

  /* Keeps the session's microphone sound, at 16 kHz, in memory. */
  VS.createSessionRecorder = function (cfg, now) {
    now = now || Date.now;
    var chunks = [], samples = 0, startedAt = 0, resampler = null, inRate = 0, full = false;
    var maxSamples = function () { return Math.round(RATE * 60 * cfg.get('accuratePassMaxMinutes')); };
    return {
      push: function (f32, sampleRate) {
        if (full) { return; }
        if (!resampler || inRate !== sampleRate) { resampler = VS.createResampler(sampleRate, RATE); inRate = sampleRate; }
        var i16 = VS.floatToInt16(resampler.push(f32));
        if (!i16.length) { return; }
        if (!startedAt) { startedAt = now() - Math.round(i16.length / RATE * 1000); }
        chunks.push(i16); samples += i16.length;
        if (samples >= maxSamples()) { full = true; }
      },
      /* { startedAt (wall ms of the first sample), seconds, chunks, full } */
      snapshot: function () { return { startedAt: startedAt, seconds: samples / RATE, chunks: chunks.slice(), full: full }; },
      reset: function () { chunks = []; samples = 0; startedAt = 0; full = false; },
      seconds: function () { return samples / RATE; }
    };
  };

  /* 16-bit mono WAV file from Int16Array chunks. */
  VS.encodeWav16 = function (chunks, rate) {
    rate = rate || RATE;
    var n = chunks.reduce(function (a, c) { return a + c.length; }, 0);
    var buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) { v.setUint8(o + i, s.charCodeAt(i)); } }
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    var o = 44;
    chunks.forEach(function (c) { for (var i = 0; i < c.length; i++) { v.setInt16(o, c[i], true); o += 2; } });
    return buf;
  };

  /* Split Int16Array chunks into pieces of at most maxSamples (0 = one piece). */
  VS.splitChunks = function (chunks, maxSamples) {
    if (!maxSamples) { return [chunks]; }
    var out = [], cur = [], n = 0;
    chunks.forEach(function (c) {
      var i = 0;
      while (i < c.length) {
        var take = Math.min(c.length - i, maxSamples - n);
        cur.push(i === 0 && take === c.length ? c : c.subarray(i, i + take)); n += take; i += take;
        if (n >= maxSamples) { out.push(cur); cur = []; n = 0; }
      }
    });
    if (cur.length) { out.push(cur); }
    return out.length ? out : [[]];
  };

  /* Your word list: from the setting, one term per comma or line, cleaned and limited. */
  VS.keytermList = function (text, maxTerms, maxChars) {
    var seen = {};
    return String(text || '').split(/[\n,;]+/).map(function (t) { return t.replace(/[<>{}\[\]\\]/g, '').trim(); })
      .filter(function (t) { var k = t.toLowerCase(); if (!t || t.length > maxChars || seen[k]) { return false; } seen[k] = true; return true; })
      .slice(0, maxTerms);
  };

  /*
    Put the accurate words back into the stretches the session kept.
      utterances: [{ startT, endT, text }] (ms since the session started; scratched ones are gone)
      words: [{ text, start, end, type }] (seconds since the recording started)
      offsetMs: when the recording started, in session time
    Each kept stretch gets the accurate words that fall inside it (with a little margin); words
    outside every kept stretch (scratched, snoozed, or noise) are dropped. A stretch with no
    accurate words (for example, typed text) keeps its live words.
  */
  VS.mergeAccurate = function (utterances, words, offsetMs, marginMs) {
    marginMs = marginMs == null ? 1200 : marginMs;
    var ws = (words || []).filter(function (w) { return w && w.type !== 'spacing' && w.type !== 'audio_event' && String(w.text || '').trim(); })
      .map(function (w) { return { text: String(w.text).trim(), t: offsetMs + (w.start || 0) * 1000 }; });
    var used = 0;
    var out = (utterances || []).map(function (u, i) {
      if (u.startT == null) { return { startT: u.startT, endT: u.endT, text: u.text, improved: false }; }
      var next = utterances[i + 1];
      var from = u.startT - marginMs, to = (u.endT == null ? u.startT : u.endT) + marginMs;
      if (next && next.startT != null) { to = Math.min(to, next.startT - 1); } // never take the next stretch's words
      var mine = ws.filter(function (w) { return w.t >= from && w.t <= to && !w.taken; });
      mine.forEach(function (w) { w.taken = true; });
      used += mine.length;
      if (!mine.length) { return { startT: u.startT, endT: u.endT, text: u.text, improved: false }; }
      var text = mine.map(function (w) { return w.text; }).join(' ').replace(/\s+([,.!?;:])/g, '$1');
      return { startT: u.startT, endT: u.endT, text: text, improved: true, live: u.text };
    });
    return { utterances: out, wordsUsed: used, wordsDropped: ws.length - used };
  };

  function plain(status) {
    if (status === 401 || status === 403) { return 'ElevenLabs did not accept the key for the accurate transcript.'; }
    if (status === 402 || status === 429) { return 'ElevenLabs refused the accurate transcript because of credits or rate limits (error ' + status + ').'; }
    return 'ElevenLabs could not make the accurate transcript (error ' + status + ').';
  }

  /*
    VS.accurateTranscript(cfg, { startWall, utterances, recording }, deps)
      -> Promise of { utterances, improved: n, dropped: n }   (rejects with { plain })
  */
  VS.accurateTranscript = function (cfg, input, deps) {
    deps = deps || {};
    var rec = input.recording;
    if (!rec || !rec.chunks || !rec.chunks.length || rec.seconds < 0.5) { return Promise.reject({ plain: 'No microphone sound was recorded, so the live words are used.', quiet: true }); }
    var key = String(deps.key != null ? deps.key : (VS.keys ? VS.keys.get(cfg) : '') || '').trim();
    if (!key) { return Promise.reject({ plain: 'No ElevenLabs key loaded, so the live words are used.' }); }
    var doFetch = deps.fetch || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
    var api = String(cfg.get('elevenLabsApiBase')).replace(/\/+$/, '');
    var terms = VS.keytermList(cfg.get('sttKeyterms'), 1000, 50);
    // Through the hosted site, send the sound in 2-minute pieces so no single request is too big.
    var pieceSamples = deps.pieceSeconds != null ? deps.pieceSeconds * RATE : (key === 'hosted-by-site' ? 120 * RATE : 0);
    var pieces = VS.splitChunks(rec.chunks, pieceSamples);
    function send(piece) {
      var form = new FormData();
      form.append('model_id', cfg.get('accuratePassModel'));
      form.append('file', new Blob([VS.encodeWav16(piece)], { type: 'audio/wav' }), 'session.wav');
      var lang = String(cfg.get('sttLanguage') || '').trim();
      if (lang) { form.append('language_code', lang); }
      form.append('timestamps_granularity', 'word');
      form.append('tag_audio_events', 'false');
      terms.forEach(function (t) { form.append('keyterms', t); });
      return doFetch(api + '/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: form }).then(function (r) {
        if (!r.ok) { throw { plain: plain(r.status) }; }
        return r.json();
      }, function () { throw { plain: 'Could not reach ElevenLabs for the accurate transcript, so the live words are used.' }; });
    }
    var allWords = [], at = 0;
    var chain = pieces.reduce(function (p, piece) {
      return p.then(function () {
        var startS = at; at += piece.reduce(function (a, c) { return a + c.length; }, 0) / RATE;
        return send(piece).then(function (data) {
          (data.words || []).forEach(function (w) { allWords.push(Object.assign({}, w, { start: (w.start || 0) + startS, end: (w.end || 0) + startS })); });
        });
      });
    }, Promise.resolve());
    return chain.then(function () {
      var offset = rec.startedAt && input.startWall ? rec.startedAt - input.startWall : 0;
      var m = VS.mergeAccurate(input.utterances, allWords, offset);
      return { utterances: m.utterances, improved: m.utterances.filter(function (u) { return u.improved; }).length, dropped: m.wordsDropped };
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
