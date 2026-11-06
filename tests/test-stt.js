/*
  test-stt.js - tests for live transcription: the audio conversion maths and the ElevenLabs
  connection logic.

  What it is for: the ElevenLabs part is tested against a pretend server (a fake live
  connection and a fake token request) that follows ElevenLabs' documented message format.
  This checks what we send and how we react to every kind of reply, without a real key.

  How it fits: run from tests.html (browser) or tests/run-node.js.
*/
(function (root) {
  var VS = root.VS, T = VS.test, eq = VS.eq, ok = VS.ok, near = VS.near;

  // ---------- audio conversion ----------
  function sine(rate, hz, seconds) {
    var n = Math.round(rate * seconds), s = new Float32Array(n);
    for (var i = 0; i < n; i++) { s[i] = 0.8 * Math.sin(2 * Math.PI * hz * i / rate); }
    return s;
  }
  function crossings(s) { var c = 0; for (var i = 1; i < s.length; i++) { if ((s[i - 1] < 0) !== (s[i] < 0)) { c++; } } return c; }

  T('audio: 48 kHz sound becomes 16 kHz, same pitch, pieces join seamlessly', function () {
    var src = sine(48000, 440, 1), r = VS.createResampler(48000, 16000), parts = [], i = 0, sizes = [4096, 1000, 3333, 4096];
    while (i < src.length) { var n = sizes[parts.length % sizes.length]; parts.push(r.push(src.subarray(i, i + n))); i += n; }
    var total = 0; parts.forEach(function (p) { total += p.length; });
    var out = new Float32Array(total), o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; });
    near(out.length, 16000, 2, 'number of samples');
    near(crossings(out), 880, 4, 'the pitch is unchanged');
    var peak = 0; for (var k = 2000; k < out.length; k++) { peak = Math.max(peak, Math.abs(out[k])); }
    near(peak, 0.8, 0.05, 'speech-range sound keeps its loudness');
    var jump = 0; for (var m = 2000; m < out.length; m++) { jump = Math.max(jump, Math.abs(out[m] - out[m - 1])); }
    ok(jump < 0.2, 'no clicks where the pieces join (' + jump.toFixed(3) + ')');
  });
  T('audio: 44.1 kHz also converts to 16 kHz', function () {
    near(VS.createResampler(44100, 16000).push(sine(44100, 300, 1)).length, 16000, 2);
  });
  T('audio: very high sounds are filtered out before resampling', function () {
    var out = VS.createResampler(48000, 16000).push(sine(48000, 15000, 1)), peak = 0;
    for (var k = 2000; k < out.length; k++) { peak = Math.max(peak, Math.abs(out[k])); }
    ok(peak < 0.25, 'a 15 kHz whistle is strongly reduced (' + peak.toFixed(2) + ')');
  });
  T('audio: 16-bit conversion clips too-loud sound instead of wrapping', function () {
    eq(Array.from(VS.floatToInt16(new Float32Array([1.5, -1.5, 0, 0.5]))), [32767, -32768, 0, 16384]);
  });
  T('audio: base64 encoding', function () {
    eq(VS.bytesToBase64(new Uint8Array([72, 105, 33])), 'SGkh');
    eq(VS.int16ToBase64(new Int16Array([1, -1])), 'AQD//w==');
  });

  // ---------- ElevenLabs connection, against a pretend server ----------
  function rig(opts) {
    opts = opts || {};
    var cfg = VS.createConfig();
    if (opts.key !== '') { cfg.set('elevenLabsApiKey', opts.key || 'test-key-1234'); }
    if (opts.lang) { cfg.set('sttLanguage', opts.lang); }
    if (opts.keyterms) { cfg.set('sttKeyterms', opts.keyterms); }
    // these tests check the plain behaviour: half a second of lead-in, commit straight away
    cfg.set('sttPreRollMs', opts.preRoll == null ? 500 : opts.preRoll);
    cfg.set('sttPostRollMs', opts.postRoll == null ? 0 : opts.postRoll);
    var ev = { partial: [], final: [], problems: [], status: [] };
    var sockets = [], fetches = [];
    function FakeWS(url) { this.url = url; this.sent = []; sockets.push(this); }
    FakeWS.prototype.send = function (d) { this.sent.push(JSON.parse(d)); };
    FakeWS.prototype.close = function () { this.closed = true; };
    FakeWS.prototype.serverOpen = function () { this.onopen && this.onopen(); };
    FakeWS.prototype.serverSays = function (obj) { this.onmessage && this.onmessage({ data: JSON.stringify(obj) }); };
    FakeWS.prototype.serverDrops = function (code) { this.onclose && this.onclose({ code: code || 1006 }); };
    var fakeFetch = function (url, init) {
      fetches.push({ url: url, init: init });
      if (opts.fetchFails) { return Promise.reject(new TypeError('Failed to fetch')); }
      var st = opts.status || 200;
      return Promise.resolve({ ok: st === 200, status: st, json: function () { return Promise.resolve({ token: 'sutkn_abc' }); } });
    };
    var stt = VS.createElevenLabsStt(cfg, {
      onPartial: function (t) { ev.partial.push(t); },
      onFinal: function (t) { ev.final.push(t); },
      onStatus: function (t) { ev.status.push(t); },
      onProblem: function (m, o) { ev.problems.push({ msg: m, lost: o.lostWords }); }
    }, { WebSocket: FakeWS, fetch: fakeFetch });
    stt.start();
    return {
      stt: stt, ev: ev, sockets: sockets, fetches: fetches, cfg: cfg,
      // feed `seconds` of 48 kHz sound in microphone-sized blocks
      feed: function (seconds, loud) {
        var n = Math.round(48000 * seconds);
        for (var i = 0; i < n; i += 4096) {
          var b = new Float32Array(Math.min(4096, n - i));
          if (loud) { for (var k = 0; k < b.length; k++) { b[k] = 0.3 * Math.sin(k / 7); } }
          stt.audio(b, 48000);
        }
      },
      ws: function () { return sockets[sockets.length - 1]; },
      samplesSent: function (s) {
        var n = 0;
        s.sent.forEach(function (m) { n += atob16len(m.audio_base_64); });
        return n;
      }
    };
  }
  function atob16len(b64) {
    var pad = (b64.match(/=+$/) || [''])[0].length;
    return Math.round((b64.length * 3 / 4 - pad) / 2);
  }
  function settle() { return new Promise(function (r) { setTimeout(r, 0); }); }

  T('ElevenLabs: nothing is sent while you are silent', function () {
    var r = rig(); r.feed(5, false);
    eq(r.fetches.length, 0); eq(r.sockets.length, 0);
  });

  T('ElevenLabs: speaking asks for a one-time pass, then opens the documented live connection', function () {
    var r = rig({ lang: 'en' }); r.feed(1, false); r.stt.speechStart();
    return settle().then(function () {
      eq(r.fetches.length, 1);
      ok(/\/v1\/single-use-token\/realtime_scribe$/.test(r.fetches[0].url), r.fetches[0].url);
      eq(r.fetches[0].init.method, 'POST'); eq(r.fetches[0].init.headers['xi-api-key'], 'test-key-1234');
      var u = r.ws().url;
      ok(u.indexOf('wss://api.elevenlabs.io/v1/speech-to-text/realtime?') === 0, u);
      ['model_id=scribe_v2_realtime', 'audio_format=pcm_16000', 'commit_strategy=manual', 'token=sutkn_abc', 'language_code=en', 'filter_background_audio=true'].forEach(function (p) { ok(u.indexOf(p) >= 0, 'missing ' + p); });
      ok(u.indexOf('test-key') < 0, 'the API key itself never goes in the live connection address');
    });
  });

  T('ElevenLabs: your word list goes to the live connection, one keyterms parameter per term', function () {
    var r = rig({ keyterms: 'neuroscience, Coot-tha' }); r.stt.speechStart();
    return settle().then(function () {
      var u = r.ws().url;
      ok(u.indexOf('&keyterms=neuroscience') > 0 && u.indexOf('&keyterms=Coot-tha') > 0, u);
    });
  });
  T('ElevenLabs: a short tail of sound is sent after you stop, then the words are finalised', function () {
    var r = rig({ postRoll: 600 }); r.stt.speechStart();
    return settle().then(function () {
      var s = r.ws(); s.serverOpen(); s.serverSays({ message_type: 'session_started', session_id: 'x' });
      r.feed(1, true); r.stt.speechEnd(); r.feed(0.3, false);
      ok(!s.sent.some(function (m) { return m.commit; }), 'not finalised straight away: the end of the last word is still coming');
      ok(r.stt.debug().tailing, 'sending the tail');
      return new Promise(function (res) { setTimeout(res, 750); }).then(function () {
        eq(s.sent.filter(function (m) { return m.commit; }).length, 1, 'finalised once, after the tail');
        ok(!r.stt.debug().tailing);
      });
    });
  });
  T('ElevenLabs: speaking again during the tail keeps it one stretch (no early commit)', function () {
    var r = rig({ postRoll: 600 }); r.stt.speechStart();
    return settle().then(function () {
      var s = r.ws(); s.serverOpen(); s.serverSays({ message_type: 'session_started', session_id: 'x' });
      r.feed(0.5, true); r.stt.speechEnd(); r.feed(0.2, false); r.stt.speechStart(); r.feed(0.5, true);
      return new Promise(function (res) { setTimeout(res, 750); }).then(function () {
        eq(s.sent.filter(function (m) { return m.commit; }).length, 0, 'still one stretch');
        eq(r.ws(), s, 'same connection');
      });
    });
  });

  T('ElevenLabs: audio waits for the connection, includes the half second before you spoke, then commits', function () {
    var r = rig(); r.feed(2, false); r.stt.speechStart(); r.feed(1, true);
    return settle().then(function () {
      var s = r.ws();
      eq(s.sent.length, 0, 'nothing sent before the connection opens');
      s.serverOpen(); s.serverSays({ message_type: 'session_started', session_id: 'x' });
      r.feed(1, true); r.stt.speechEnd();
      var msgs = s.sent;
      ok(msgs.length > 10, 'about ten messages a second');
      msgs.forEach(function (m) { eq(m.message_type, 'input_audio_chunk'); eq(m.sample_rate, 16000); ok(typeof m.audio_base_64 === 'string'); });
      ok(msgs.slice(0, -1).every(function (m) { return m.commit === false; }), 'only the last message commits');
      eq(msgs[msgs.length - 1].commit, true);
      ok(msgs.every(function (m) { return atob16len(m.audio_base_64) <= 1600; }), 'pieces are 100 ms or smaller');
      near(r.samplesSent(s), 16000 * 2.5, 1700, 'two seconds of speech plus about half a second of pre-roll');
    });
  });

  T('ElevenLabs: words in progress and final words are passed on', function () {
    var r = rig(); r.stt.speechStart();
    return settle().then(function () {
      var s = r.ws(); s.serverOpen();
      s.serverSays({ message_type: 'partial_transcript', text: 'I need' });
      s.serverSays({ message_type: 'partial_transcript', text: 'I need to call' });
      r.stt.speechEnd();
      s.serverSays({ message_type: 'committed_transcript', text: 'I need to call the bank.' });
      eq(r.ev.partial, ['I need', 'I need to call']); eq(r.ev.final, ['I need to call the bank.']);
      eq(r.ev.problems.length, 0);
    });
  });

  T('ElevenLabs: a refused key is explained in plain English, and no connection is opened', function () {
    var r = rig({ status: 401 }); r.stt.speechStart();
    return settle().then(settle).then(function () {
      eq(r.sockets.length, 0);
      ok(/did not accept the API key/.test(r.ev.problems[0].msg), r.ev.problems[0].msg);
      eq(r.ev.problems[0].lost, false, 'a setup problem: asking you to repeat yourself would not help');
    });
  });

  T('ElevenLabs: no internet (or a blocked request) is explained', function () {
    var r = rig({ fetchFails: true }); r.stt.speechStart();
    return settle().then(settle).then(function () {
      ok(/Could not reach ElevenLabs/.test(r.ev.problems[0].msg));
    });
  });

  T('ElevenLabs: no key yet says how to add one', function () {
    var r = rig({ key: '' }); r.stt.speechStart();
    ok(/No ElevenLabs key loaded/.test(r.ev.problems[0].msg)); eq(r.fetches.length, 0);
  });

  T('ElevenLabs: the connection dropping mid-sentence reports lost words', function () {
    var r = rig(); r.stt.speechStart();
    return settle().then(function () {
      var s = r.ws(); s.serverOpen(); r.feed(0.5, true); s.serverDrops(1006);
      eq(r.ev.problems.length, 1); eq(r.ev.problems[0].lost, true);
      ok(/dropped/.test(r.ev.problems[0].msg));
    });
  });

  T('ElevenLabs: an error message from the server (out of credits) is explained', function () {
    var r = rig(); r.stt.speechStart();
    return settle().then(function () {
      var s = r.ws(); s.serverOpen();
      s.serverSays({ message_type: 'quota_exceeded', error: 'Quota exceeded' });
      ok(/run out of credits/.test(r.ev.problems[0].msg)); ok(s.closed, 'the connection is closed');
    });
  });

  T('ElevenLabs: a routine "no audio for a while" close is quiet, and the next speech reconnects', function () {
    var r = rig(); r.stt.speechStart();
    return settle().then(function () {
      var s = r.ws(); s.serverOpen(); r.stt.speechEnd();
      s.serverSays({ message_type: 'committed_transcript', text: 'Hello.' });
      s.serverSays({ message_type: 'insufficient_audio_activity', error: 'no audio' });
      eq(r.ev.problems.length, 0, 'not worth bothering you about');
      r.stt.speechStart();
      return settle();
    }).then(function () {
      eq(r.fetches.length, 2, 'a fresh one-time pass'); eq(r.sockets.length, 2);
    });
  });

  T('ElevenLabs: stopping closes the connection and ignores later audio', function () {
    var r = rig(); r.stt.speechStart();
    return settle().then(function () {
      var s = r.ws(); s.serverOpen(); r.stt.stop();
      ok(s.closed); var n = s.sent.length; r.feed(1, true); eq(s.sent.length, n);
    });
  });

  T('transcriber choice: off and chrome are available behind the same switch', function () {
    var c = VS.createConfig(); c.set('sttProvider', 'off');
    eq(VS.createTranscriber(c, {}).name, 'off');
    c.set('sttProvider', 'chrome'); eq(VS.createTranscriber(c, {}).name, 'Chrome');
    c.set('sttProvider', 'elevenlabs'); eq(VS.createTranscriber(c, {}).name, 'ElevenLabs');
  });

  T('settings: the API key is stored as a secret and is not shown in narration', function () {
    var c = VS.createConfig(); var e = c.describe().filter(function (x) { return x.key === 'elevenLabsApiKey'; })[0];
    eq(e.type, 'secret');
    var r = VS.makeRig(); r.cfg.set('elevenLabsApiKey', 'sk_secret_value'); r.speak('hello there'); r.advance(70000);
    ok(r.narration().indexOf('sk_secret') < 0);
  });
})(typeof window !== 'undefined' ? window : globalThis);
