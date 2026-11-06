/*
  tts-elevenlabs.js - text-to-speech (TTS): turns each line into speech in your ElevenLabs voice.

  What it is for: every line the system says is spoken in the voice set in Settings
  (voiceId, by default U9VgC8Xinl7nnNsyDd3J). Each line is made ONCE and kept in the browser
  (a "cache"), so the next time it plays instantly and costs nothing. A line is only made again
  if you change its wording, the voice, the model or the voice settings.

  Request (from ElevenLabs' docs): POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
  ?output_format=mp3_44100_128, header xi-api-key, JSON body { text, model_id, voice_settings }.
  The reply is the audio file.

  How it fits: voice.js asks render(text) for audio, then plays it through the mixer. If anything
  fails, voice.js falls back to the Mac's built-in voice and the page says why.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  // A short fingerprint of a long string, used to name cached audio.
  function hash(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function explain(status, voiceId) {
    if (status === 401 || status === 403) { return 'ElevenLabs did not accept the API key for the voice.'; }
    if (status === 404) { return 'ElevenLabs could not find voice ' + voiceId + '. Add it to "My Voices" in your ElevenLabs account, or check the voice ID in Settings.'; }
    if (status === 402 || status === 429) { return 'ElevenLabs refused because of credits or rate limits (error ' + status + ').'; }
    if (status === 422) { return 'ElevenLabs did not accept the voice settings or model (error 422). Check them in Settings, Voice.'; }
    return 'ElevenLabs could not make the voice line (error ' + status + ').';
  }

  /*
    createElevenLabsTts(cfg, deps)
      deps (for tests): { fetch, getKey, store: { load(key), save(key, name, data) } }
  */
  VS.createElevenLabsTts = function (cfg, deps) {
    deps = deps || {};
    var doFetch = deps.fetch || (typeof fetch !== 'undefined' ? fetch.bind(root) : null);
    var getKey = deps.getKey || function () { return VS.keys.get(cfg); };
    var store = deps.store || VS.fileStore;
    var inFlight = {};

    function settings() {
      return {
        stability: cfg.get('voiceStability'),
        similarity_boost: cfg.get('voiceSimilarity'),
        style: cfg.get('voiceStyle'),
        use_speaker_boost: true,
        speed: cfg.get('voiceSpeed')
      };
    }

    function cacheKey(text) {
      return 'tts:' + hash([cfg.get('voiceId'), cfg.get('ttsModel'), JSON.stringify(settings()), text].join('|'));
    }

    function request(text) {
      var key = String(getKey() || '').trim();
      if (!key) { return Promise.reject({ plain: 'No ElevenLabs key loaded. Use "Load .env" in Sound and voice.', setup: true }); }
      var api = String(cfg.get('elevenLabsApiBase')).replace(/\/+$/, '');
      var voiceId = cfg.get('voiceId');
      return doFetch(api + '/v1/text-to-speech/' + encodeURIComponent(voiceId) + '?output_format=mp3_44100_128', {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text: text, model_id: cfg.get('ttsModel'), voice_settings: settings() })
      }).then(function (r) {
        if (!r.ok) { throw { plain: explain(r.status, voiceId), setup: r.status !== 429 }; }
        return r.arrayBuffer();
      }, function () {
        throw { plain: 'Could not reach ElevenLabs for the voice. Check the internet connection.', setup: false };
      });
    }

    var api = {
      cacheKey: cacheKey,

      /* render(text) -> Promise of an ArrayBuffer of audio (from the cache, or freshly made and cached). */
      render: function (text) {
        var k = cacheKey(text);
        if (inFlight[k]) { return inFlight[k]; }
        var p = store.load(k).then(function (hit) {
          if (hit && hit.data) { return hit.data; }
          return request(text).then(function (data) {
            return Promise.resolve(store.save(k, text, data)).catch(function () { return null; }).then(function () { return data; });
          });
        });
        inFlight[k] = p;
        var clear = function () { delete inFlight[k]; };
        p.then(clear, clear);
        return p;
      },

      /* Is this line already made? */
      cached: function (text) { return store.load(cacheKey(text)).then(function (hit) { return !!(hit && hit.data); }); },

      /*
        prepare(texts, onProgress) - make every line ahead of time, one at a time, so the first time
        each is needed it plays instantly. Stops at the first setup problem (wrong key, wrong voice).
        Resolves to { made, already, failed, problem }.
      */
      prepare: function (texts, onProgress) {
        var out = { made: 0, already: 0, failed: 0, problem: null, total: texts.length }, i = 0;
        function next() {
          if (i >= texts.length || out.problem) { return Promise.resolve(out); }
          var t = texts[i++];
          return api.cached(t).then(function (was) {
            if (was) { out.already++; return; }
            return api.render(t).then(function () { out.made++; }, function (e) {
              out.failed++;
              if (e && e.setup) { out.problem = e.plain; }
            });
          }).then(function () { if (onProgress) { onProgress(out, i); } return next(); });
        }
        return next();
      }
    };
    return api;
  };

  /* Lines that can be made ahead of time: every line without {blanks}. */
  VS.preparableLines = function (clips) {
    var seen = {}, out = [];
    clips.forEach(function (c) {
      if (/\{\w+\}/.test(c.text) || seen[c.text]) { return; }
      seen[c.text] = true; out.push(c.text);
    });
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
