/*
  stt-elevenlabs.js - live transcription with ElevenLabs (Scribe v2 Realtime).

  What it is for: it streams your voice to ElevenLabs while you are speaking and receives
  words back: "partial" words while you talk (they may still change) and "committed" words
  once you stop (final).

  How it works, step by step:
  1. When the voice detector says you started speaking, it asks ElevenLabs for a single-use
     token (a one-time pass made from your API key, so the key itself is never sent over the
     live connection) and opens a live connection (a WebSocket).
  2. It sends your audio in small pieces, about 10 a second, starting half a second before you
     started (the "pre-roll"), so your first word is not clipped.
  3. When you stop speaking, it tells ElevenLabs "that's the end of this bit" (a "commit"),
     and the final words come back.
  4. Audio is ONLY sent while you are speaking. Silence is never sent, which keeps the cost
     down in long sessions. After a minute of silence the connection is closed; it reopens
     the next time you speak.
  5. If the connection drops while you are mid-sentence, it reports that words were lost so
     the system can say so out loud, then reconnects next time you speak (waiting a bit longer
     after each failure).

  Documented format (from ElevenLabs' docs): wss://api.elevenlabs.io/v1/speech-to-text/realtime
  with model_id=scribe_v2_realtime, token, audio_format=pcm_16000, commit_strategy=manual.
  Audio messages: {"message_type": "input_audio_chunk", "audio_base_64": "...", "commit": false,
  "sample_rate": 16000}. Replies: session_started, partial_transcript, committed_transcript, or
  an error type such as auth_error or quota_exceeded.

  How it fits: stt.js creates this when the setting sttProvider is "elevenlabs".
*/
(function (root) {
  var VS = root.VS = root.VS || {};
  if (!VS.keytermList) {
    VS.keytermList = function (text, maxTerms, maxChars) {
      var seen = {};
      return String(text || '').split(/[\n,;]+/).map(function (t) { return t.replace(/[<>{}\[\]\\]/g, '').trim(); })
        .filter(function (t) { var k = t.toLowerCase(); if (!t || t.length > maxChars || seen[k]) { return false; } seen[k] = true; return true; })
        .slice(0, maxTerms);
    };
  }
  var RATE = 16000, CHUNK = 1600; // 100 ms of audio per message

  var ERRORS = {
    auth_error: 'ElevenLabs did not accept the API key. Check the key in your .env file.',
    quota_exceeded: 'Your ElevenLabs account has run out of credits for transcription.',
    unaccepted_terms: 'ElevenLabs needs you to accept its terms for speech-to-text. Log in at elevenlabs.io and accept them.',
    rate_limited: 'ElevenLabs is limiting requests right now. It will try again shortly.',
    commit_throttled: 'ElevenLabs is limiting requests right now. It will try again shortly.',
    queue_overflow: 'ElevenLabs is busy right now. It will try again shortly.',
    resource_exhausted: 'ElevenLabs is busy right now. It will try again shortly.',
    transcriber_error: 'ElevenLabs had a problem transcribing.',
    input_error: 'ElevenLabs could not read the audio it was sent.',
    invalid_request: 'ElevenLabs refused the request as invalid.',
    chunk_size_exceeded: 'An audio piece was too large for ElevenLabs.',
    error: 'ElevenLabs reported an error.'
  };
  // Problems with the account or setup: repeating yourself will not help, so the system says
  // "I can't catch your words right now" instead of "say it again".
  var SETUP = { auth_error: true, quota_exceeded: true, unaccepted_terms: true, invalid_request: true };
  // These close the connection but are not worth bothering you about: it simply reopens next time.
  var QUIET_CLOSE = { insufficient_audio_activity: true, session_time_limit_exceeded: true };

  /*
    createElevenLabsStt(cfg, ev, deps)
      ev: { onPartial(text), onFinal(text), onStatus(text), onProblem(message, { lostWords }) }
      deps (for tests): { WebSocket, fetch, now }
  */
  VS.createElevenLabsStt = function (cfg, ev, deps) {
    deps = deps || {};
    var WS = deps.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    var doFetch = deps.fetch || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
    var now = deps.now || function () { return Date.now(); };
    var getKey = deps.getKey || function () { return VS.keys ? VS.keys.get(cfg) : cfg.get('elevenLabsApiKey'); };

    var socket = null, sockState = 'closed'; // closed | connecting | open
    var resampler = null, inRate = 0;
    var preRoll = [], preRollSamples = 0;    // recent 16 kHz audio kept while silent
    var outBuf = [], outSamples = 0;         // audio waiting to be sent while speaking
    var queue = [];                          // messages waiting for the connection to open
    var speaking = false, pending = false, pendingTimer = null, lastSpeechAt = 0;
    var tailing = false, tailEnd = 0, tailTimer = null; // the short tail of sound sent after you stop
    var failures = 0, retryAt = 0, stopped = true, idleTimer = null, gotPartial = '';

    function status(t) { if (ev.onStatus) { ev.onStatus(t); } }
    function problem(msg, lost) { if (ev.onProblem) { ev.onProblem(msg, { lostWords: !!lost }); } }

    function concat(list, n) {
      var out = new Int16Array(n), o = 0;
      list.forEach(function (a) { out.set(a, o); o += a.length; });
      return out;
    }

    function rawSend(obj) {
      if (socket && sockState === 'open') {
        try { socket.send(JSON.stringify(obj)); } catch (e) { /* the close handler deals with it */ }
      } else {
        queue.push(obj);
      }
    }

    function sendAudio(i16, commit) {
      rawSend({ message_type: 'input_audio_chunk', audio_base_64: VS.int16ToBase64(i16), commit: !!commit, sample_rate: RATE });
    }

    function flushOut(commit) {
      var all = concat(outBuf, outSamples);
      outBuf = []; outSamples = 0;
      for (var i = 0; i < all.length; i += CHUNK) {
        var last = i + CHUNK >= all.length;
        sendAudio(all.subarray(i, Math.min(all.length, i + CHUNK)), commit && last);
      }
      if (commit && all.length === 0) { sendAudio(new Int16Array(160), true); } // 10 ms of silence carries the commit
    }

    function clearPending() { pending = false; if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; } }

    function scheduleIdleClose() {
      if (idleTimer) { clearTimeout(idleTimer); }
      idleTimer = setTimeout(function () {
        if (!speaking && !pending && socket) { closeSocket('idle'); status('Words: resting (reconnects when you speak)'); }
      }, cfg.get('sttIdleCloseMs'));
    }

    function closeSocket(why) {
      var s = socket; socket = null; sockState = 'closed'; queue = [];
      if (s) { s.__why = why; try { s.close(1000, why); } catch (e) { /* ignore */ } }
    }

    function fail(message, lostWords) {
      failures++;
      retryAt = now() + Math.min(30000, 1000 * Math.pow(2, failures - 1));
      var wasPending = pending || speaking;
      clearPending();
      closeSocket('failed');
      problem(message, lostWords && wasPending);
      status('Words: problem (' + message + ')');
    }

    function onMessage(evt) {
      var msg;
      try { msg = JSON.parse(evt.data); } catch (e) { return; }
      var type = msg.message_type || msg.type;
      if (type === 'session_started') { failures = 0; status('Words: connected to ElevenLabs'); return; }
      if (type === 'partial_transcript') {
        var t = String(msg.text || '').trim();
        if (t && t !== gotPartial) { gotPartial = t; if (ev.onPartial) { ev.onPartial(t); } }
        return;
      }
      if (type === 'committed_transcript') {
        gotPartial = '';
        clearPending();
        var f = String(msg.text || '').trim();
        if (f && ev.onFinal) { ev.onFinal(f); }
        if (!speaking) { scheduleIdleClose(); }
        return;
      }
      if (QUIET_CLOSE[type]) { closeSocket(type); return; }
      if (ERRORS[type] || msg.error) {
        fail((ERRORS[type] || ERRORS.error) + (msg.error ? ' (' + msg.error + ')' : ''), !SETUP[type]);
      }
    }

    function connect() {
      if (sockState !== 'closed' || stopped) { return; }
      var key = String(getKey() || '').trim();
      if (!key) {
        problem('No ElevenLabs key loaded. Use "Load .env" in Sound and voice (or choose Chrome transcription).', false);
        retryAt = now() + 5000;
        return;
      }
      if (now() < retryAt) { return; }
      if (!WS || !doFetch) { problem('This browser cannot open a live connection.', speaking); return; }
      sockState = 'connecting';
      status('Words: connecting to ElevenLabs...');
      var api = String(cfg.get('elevenLabsApiBase')).replace(/\/+$/, '');
      doFetch(api + '/v1/single-use-token/realtime_scribe', { method: 'POST', headers: { 'xi-api-key': key } }).then(function (r) {
        if (r.status === 401 || r.status === 403) { throw { plain: ERRORS.auth_error }; }
        if (!r.ok) { throw { plain: 'ElevenLabs would not start a transcription session (error ' + r.status + ').' }; }
        return r.json();
      }, function () {
        throw { plain: 'Could not reach ElevenLabs. Check the internet connection. If this keeps happening, ElevenLabs may be refusing requests from a page opened as a file; tell me and I will set up a fix.' };
      }).then(function (body) {
        if (stopped) { sockState = 'closed'; return; }
        if (!body || !body.token) { throw { plain: 'ElevenLabs did not return a session pass.' }; }
        var q = 'model_id=scribe_v2_realtime&audio_format=pcm_16000&commit_strategy=manual&token=' + encodeURIComponent(body.token);
        var lang = String(cfg.get('sttLanguage') || '').trim();
        if (lang) { q += '&language_code=' + encodeURIComponent(lang); }
        if (cfg.get('sttFilterBackground')) { q += '&filter_background_audio=true'; }
        // your word list: one keyterms parameter per term (ElevenLabs: up to 50, 20 letters each)
        VS.keytermList(cfg.get('sttKeyterms'), 50, 20).forEach(function (t) { q += '&keyterms=' + encodeURIComponent(t); });
        var s = new WS(String(cfg.get('elevenLabsWsBase')).replace(/\/+$/, '') + '/v1/speech-to-text/realtime?' + q);
        socket = s;
        s.onopen = function () {
          if (socket !== s) { return; }
          sockState = 'open';
          var q2 = queue; queue = [];
          q2.forEach(rawSend);
        };
        s.onmessage = function (e) { if (socket === s) { onMessage(e); } };
        s.onerror = function () { /* onclose follows and explains */ };
        s.onclose = function (e) {
          if (socket !== s) { return; } // we closed it on purpose
          socket = null; sockState = 'closed'; queue = [];
          if (pending || speaking) { fail('The connection to ElevenLabs dropped' + (e && e.code ? ' (code ' + e.code + ')' : '') + '.', true); }
        };
      }).catch(function (err) {
        sockState = 'closed';
        // Could not even start: a setup or internet problem, so "say it again" would not help.
        fail(err && err.plain ? err.plain : 'Could not start transcription.', false);
      });
    }

    var api = {
      name: 'ElevenLabs',

      start: function () {
        stopped = false; failures = 0; retryAt = 0;
        if (!String(getKey() || '').trim()) {
          status('Words: waiting for your .env key');
        } else {
          status('Words: ready (ElevenLabs connects when you speak)');
        }
        return Promise.resolve();
      },

      stop: function () {
        stopped = true; speaking = false; tailing = false; if (tailTimer) { clearTimeout(tailTimer); tailTimer = null; } clearPending();
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        closeSocket('stopped');
        status('Words: off');
      },

      // Raw microphone audio, any sample rate.
      audio: function (f32, sampleRate) {
        if (stopped) { return; }
        if (!resampler || inRate !== sampleRate) { resampler = VS.createResampler(sampleRate, RATE); inRate = sampleRate; }
        var i16 = VS.floatToInt16(resampler.push(f32));
        if (!i16.length) { return; }
        if (speaking || tailing) {
          outBuf.push(i16); outSamples += i16.length;
          if (outSamples >= CHUNK) { flushOut(false); }
          if (tailing && now() >= tailEnd) { finishTail(); }
        } else {
          preRoll.push(i16); preRollSamples += i16.length;
          var keep = Math.round(RATE * cfg.get('sttPreRollMs') / 1000);
          while (preRoll.length > 1 && preRollSamples - preRoll[0].length >= keep) { preRollSamples -= preRoll.shift().length; }
        }
      },

      speechStart: function () {
        if (tailing) { tailing = false; if (tailTimer) { clearTimeout(tailTimer); tailTimer = null; } speaking = true; lastSpeechAt = now(); return; } // picked up again before the commit: one stretch
        if (stopped || speaking) { return; }
        speaking = true; lastSpeechAt = now();
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        outBuf = preRoll; outSamples = preRollSamples; preRoll = []; preRollSamples = 0;
        connect();
      },

      speechEnd: function () {
        if (stopped || !speaking) { return; }
        speaking = false;
        if (sockState === 'closed') { outBuf = []; outSamples = 0; return; } // nothing to commit to
        // Keep sending a little sound after you stop (sttPostRollMs), so the end of the last word
        // reaches ElevenLabs before the words are finalised.
        var post = cfg.get('sttPostRollMs') || 0;
        if (post > 0) {
          tailing = true; tailEnd = now() + post;
          tailTimer = setTimeout(finishTail, post + 80); // in case no more audio arrives
          return;
        }
        commitNow();
      },

      debug: function () { return { sockState: sockState, speaking: speaking, tailing: tailing, pending: pending, failures: failures, queued: queue.length }; }
    };

    function finishTail() {
      if (!tailing) { return; }
      tailing = false;
      if (tailTimer) { clearTimeout(tailTimer); tailTimer = null; }
      if (stopped || sockState === 'closed') { outBuf = []; outSamples = 0; return; }
      commitNow();
    }
    function commitNow() {
        flushOut(true);
        pending = true;
        if (pendingTimer) { clearTimeout(pendingTimer); }
        pendingTimer = setTimeout(function () {
          pendingTimer = null;
          if (pending) { pending = false; status('Words: nothing came back for the last bit'); scheduleIdleClose(); }
        }, cfg.get('sttCommitTimeoutMs'));
    }
    return api;
  };
})(typeof window !== 'undefined' ? window : globalThis);
