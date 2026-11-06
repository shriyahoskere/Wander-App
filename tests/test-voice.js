/*
  test-voice.js - tests for the ElevenLabs voice and the .env key.

  What it is for: checks that the key is read correctly from a .env file and never saved, that
  each line is made in the configured voice with the documented request, that a line is only
  made once (then kept), and that problems are explained in plain English. The ElevenLabs side is
  a pretend server here.

  How it fits: run from tests.html (browser) or tests/run-node.js.
*/
(function (root) {
  var VS = root.VS, T = VS.test, eq = VS.eq, ok = VS.ok;

  // ---------- .env ----------
  T('.env: the key is found in the usual formats', function () {
    eq(VS.parseEnv('ELEVENLABS_API_KEY=sk_abc123').key, 'sk_abc123');
    eq(VS.parseEnv('# my keys\nexport ELEVENLABS_API_KEY="sk_quoted"\nOTHER=1').key, 'sk_quoted');
    eq(VS.parseEnv("ELEVEN_LABS_API_KEY='sk_single'").key, 'sk_single');
    eq(VS.parseEnv('XI_API_KEY = sk_spaces   # comment').key, 'sk_spaces');
    eq(VS.parseEnv('ANTHROPIC_API_KEY=x').ok, false);
    ok(/ELEVENLABS_API_KEY=/.test(VS.parseEnv('').message));
  });
  T('.env: the key is kept in memory only, never in the saved settings', function () {
    var store = {}, fake = { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; } };
    var cfg = VS.createConfig(fake);
    eq(VS.keys.loadEnv('ELEVENLABS_API_KEY=sk_memory_only_9876', '.env').ok, true);
    eq(VS.keys.get(cfg), 'sk_memory_only_9876');
    eq(VS.keys.loaded().ending, '9876');
    cfg.set('voiceSpeed', 1.0);
    ok(JSON.stringify(store).indexOf('sk_memory_only') < 0, 'not written to browser storage');
    VS.keys.forget(); eq(VS.keys.get(cfg), '');
  });
  T('voice: the default voice is the one you chose', function () {
    eq(VS.createConfig().get('voiceId'), 'U9VgC8Xinl7nnNsyDd3J');
  });

  // ---------- ElevenLabs voice, against a pretend server ----------
  function ttsRig(opts) {
    opts = opts || {};
    var cfg = VS.createConfig(), calls = [], saved = {};
    var store = {
      load: function (k) { return Promise.resolve(saved[k] || null); },
      save: function (k, name, data) { saved[k] = { name: name, data: data }; return Promise.resolve(); }
    };
    var fakeFetch = function (url, init) {
      calls.push({ url: url, init: init, body: JSON.parse(init.body) });
      var st = opts.status || 200;
      return Promise.resolve({ ok: st === 200, status: st, arrayBuffer: function () { return Promise.resolve(new Uint8Array([1, 2, 3]).buffer); } });
    };
    var tts = VS.createElevenLabsTts(cfg, { fetch: fakeFetch, getKey: function () { return opts.key === undefined ? 'sk_test' : opts.key; }, store: store });
    return { cfg: cfg, tts: tts, calls: calls, saved: saved };
  }

  T('voice: a line is requested in the documented format, in your voice', function () {
    var r = ttsRig();
    return r.tts.render('Go on.').then(function (data) {
      eq(new Uint8Array(data)[2], 3);
      var c = r.calls[0];
      ok(/\/v1\/text-to-speech\/U9VgC8Xinl7nnNsyDd3J\?output_format=mp3_44100_128$/.test(c.url), c.url);
      eq(c.init.method, 'POST'); eq(c.init.headers['xi-api-key'], 'sk_test');
      eq(c.body.text, 'Go on.'); eq(c.body.model_id, 'eleven_multilingual_v2');
      eq(c.body.voice_settings, { stability: 0.8, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 0.9 });
    });
  });
  T('voice: each line is made once, then kept; changing the voice makes it again', function () {
    var r = ttsRig();
    return r.tts.render('Mm.').then(function () { return r.tts.render('Mm.'); }).then(function () {
      eq(r.calls.length, 1, 'second time comes from the browser');
      r.cfg.set('voiceSpeed', 1.0);
      return r.tts.render('Mm.');
    }).then(function () { eq(r.calls.length, 2, 'new speed, new recording'); });
  });
  T('voice: preparing ahead skips lines already made and lines with blanks', function () {
    var r = ttsRig();
    var lines = VS.preparableLines(VS.CLIPS);
    ok(lines.every(function (l) { return l.indexOf('{') < 0; }));
    return r.tts.render(lines[0]).then(function () { return r.tts.prepare(lines.slice(0, 5)); }).then(function (res) {
      eq(res.already, 1); eq(res.made, 4); eq(r.calls.length, 5);
    });
  });
  T('voice: a wrong key or a missing voice is explained, and preparing stops', function () {
    var r = ttsRig({ status: 401 });
    return r.tts.prepare(['A.', 'B.', 'C.']).then(function (res) {
      ok(/did not accept the API key/.test(res.problem)); eq(r.calls.length, 1, 'stops after the first refusal');
      var r2 = ttsRig({ status: 404 });
      return r2.tts.render('A.').then(function () { throw new Error('should fail'); }, function (e) { ok(/could not find voice U9VgC8Xinl7nnNsyDd3J/.test(e.plain)); });
    });
  });
  T('voice: with no key loaded it says how to load one, and asks nothing of ElevenLabs', function () {
    var r = ttsRig({ key: '' });
    return r.tts.render('A.').then(function () { throw new Error('should fail'); }, function (e) {
      ok(/Load .env/.test(e.plain)); eq(r.calls.length, 0);
    });
  });
  T('recording sound: built in, and quiet', function () {
    var d = VS.synthCue(44100, 'record'), peak = 0;
    for (var i = 0; i < d.length; i++) { peak = Math.max(peak, Math.abs(d[i])); }
    ok(d.length < 44100 * 0.5 && peak > 0.02 && peak < 0.2, 'short and soft (' + peak.toFixed(3) + ')');
  });
})(typeof window !== 'undefined' ? window : globalThis);
