/*
  test-accurate.js - tests for the accurate transcript made when you save, and the word list.

  What it is for: checks that the whole session's sound becomes a valid WAV, that the request to
  ElevenLabs uses the standard Scribe v2 model with your language and word list, that the accurate
  words go back into the stretches the session kept (scratched and snoozed speech stays out), and
  that the live connection carries the background filter and your word list.

  How it fits: run from tests.html (browser) or tests/run-node.js. ElevenLabs is pretend here.
*/
(function (root) {
  var VS = root.VS, T = VS.test, eq = VS.eq, ok = VS.ok;

  T('accurate pass: the recorded sound becomes a 16 kHz mono WAV', function () {
    var wav = VS.encodeWav16([new Int16Array([1, -1, 300]), new Int16Array([5])]);
    var v = new DataView(wav);
    eq(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3)), 'RIFF');
    eq(v.getUint32(24, true), 16000); eq(v.getUint16(22, true), 1); eq(v.getUint32(40, true), 8);
    eq(v.getInt16(48, true), 300);
  });

  T('accurate pass: better words go back into the kept stretches; scratched and snoozed speech stays out', function () {
    var utts = [{ startT: 10000, endT: 13000, text: 'I need to cool the bank' }, { startT: 30000, endT: 33000, text: 'neural science is fun' }, { startT: 50000, endT: 50500, text: 'typed note' }];
    var words = [
      { text: 'I', start: 9.6, end: 9.7, type: 'word' }, { text: 'need', start: 9.8, end: 10.0, type: 'word' }, { text: 'to', start: 10.1, end: 10.2, type: 'word' },
      { text: 'call', start: 10.3, end: 10.5, type: 'word' }, { text: 'the', start: 10.6, end: 10.7, type: 'word' }, { text: 'bank.', start: 10.8, end: 11.1, type: 'word' },
      { text: 'secret', start: 20.0, end: 20.4, type: 'word' }, { text: 'scratched', start: 20.5, end: 21, type: 'word' },
      { text: 'Neuroscience', start: 29.6, end: 30.2, type: 'word' }, { text: 'is', start: 30.3, end: 30.4, type: 'word' }, { text: 'fun', start: 30.5, end: 30.8, type: 'word' }, { text: '.', start: 30.8, end: 30.8, type: 'word' }
    ];
    var m = VS.mergeAccurate(utts, words, 500); // the recording started 0.5 s into the session
    eq(m.utterances[0].text, 'I need to call the bank.');
    eq(m.utterances[1].text, 'Neuroscience is fun.');
    eq(m.utterances[2].text, 'typed note', 'no sound for typed words: they stay');
    eq(m.utterances[2].improved, false);
    ok(!m.utterances.some(function (u) { return /secret|scratched/.test(u.text); }), 'words outside every kept stretch are dropped');
    eq(m.wordsDropped, 2);
  });

  T('accurate pass: the request uses Scribe v2, your language and your word list', function () {
    var store = {}, fakeStore = { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; } };
    var cfg = VS.createConfig(fakeStore);
    cfg.set('elevenLabsApiBase', 'https://api.example'); cfg.set('sttKeyterms', 'neuroscience, Coot-tha, PhD');
    var sent = null;
    var fetch = function (url, init) { sent = { url: url, init: init }; return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ words: [{ text: 'Hello', start: 1.0, end: 1.2, type: 'word' }, { text: 'there.', start: 1.3, end: 1.6, type: 'word' }] }); } }); };
    var rec = { startedAt: 1000, seconds: 3, chunks: [new Int16Array(16000 * 3)] };
    return VS.accurateTranscript(cfg, { startWall: 1000, utterances: [{ startT: 900, endT: 1800, text: 'hello they' }], recording: rec }, { fetch: fetch, key: 'el-key' }).then(function (r) {
      eq(sent.url, 'https://api.example/v1/speech-to-text');
      eq(sent.init.headers['xi-api-key'], 'el-key');
      var f = sent.init.body;
      eq(f.get('model_id'), 'scribe_v2'); eq(f.get('language_code'), 'en'); eq(f.get('timestamps_granularity'), 'word');
      eq(f.getAll('keyterms'), ['neuroscience', 'Coot-tha', 'PhD']);
      ok(f.get('file') && f.get('file').size === 44 + 16000 * 3 * 2, 'the whole session as one WAV');
      eq(r.utterances[0].text, 'Hello there.'); eq(r.improved, 1);
    });
  });

  T('accurate pass: with no recorded sound (typing only), the live words are used', function () {
    var cfg = VS.createConfig();
    return VS.accurateTranscript(cfg, { utterances: [], recording: null }, { key: 'k' }).then(function () { ok(false, 'should not run'); }, function (e) { ok(/live words/.test(e.plain)); });
  });

  T('accurate pass: a stretch the live transcription missed (empty text) is filled from the accurate words', function () {
    var m = VS.mergeAccurate([{ startT: 1000, endT: 3000, text: '' }, { startT: 9000, endT: 10000, text: 'typed line' }],
      [{ text: 'Call', start: 1.2, type: 'word' }, { text: 'Mum.', start: 1.6, type: 'word' }], 0);
    eq(m.utterances[0].text, 'Call Mum.'); ok(m.utterances[0].improved);
    eq(m.utterances[1].text, 'typed line');
  });

  T('accurate pass: through the site, the sound goes in pieces and the word times still line up', function () {
    var cfg = VS.createConfig(), sent = 0;
    var chunks = [new Int16Array(16000 * 3)]; // 3 seconds
    var fakeFetch = function () {
      sent++;
      var w = sent === 1 ? [{ text: 'One.', start: 0.5, type: 'word' }] : [{ text: 'Two.', start: 0.2, type: 'word' }];
      return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ words: w }); } });
    };
    var utts = [{ startT: 0, endT: 1000, text: '' }, { startT: 2000, endT: 2800, text: '' }];
    return VS.accurateTranscript(cfg, { startWall: 1000, utterances: utts, recording: { startedAt: 1000, seconds: 3, chunks: chunks } }, { key: 'k', fetch: fakeFetch, pieceSeconds: 2 }).then(function (r) {
      eq(sent, 2); eq(r.utterances[0].text, 'One.'); eq(r.utterances[1].text, 'Two.'); // 2 s + 0.2 s lands in the second stretch
    });
  });

  T('accurate pass: pieces split cleanly with nothing lost', function () {
    var p = VS.splitChunks([new Int16Array(5), new Int16Array(7)], 4);
    eq(p.map(function (x) { return x.reduce(function (a, c) { return a + c.length; }, 0); }), [4, 4, 4]);
    eq(VS.splitChunks([new Int16Array(5)], 0).length, 1);
  });

  T('word list: cleaned, de-duplicated and limited (50 terms of 20 letters live; 1000 of 50 for the accurate pass)', function () {
    eq(VS.keytermList(' neuroscience, PhD;PhD\n Coot-tha , <bad>', 50, 20), ['neuroscience', 'PhD', 'Coot-tha', 'bad']);
    eq(VS.keytermList('a-very-long-term-that-is-too-long-for-live', 50, 20), []);
    var many = []; for (var i = 0; i < 60; i++) { many.push('term' + i); }
    eq(VS.keytermList(many.join(','), 50, 20).length, 50);
  });
})(typeof window !== 'undefined' ? window : globalThis);
