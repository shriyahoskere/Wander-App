/*
  voice.js - the system's voice: your ElevenLabs voice, with the Mac's built-in voice as backup.

  What it is for: live.js says "say this line" and this file decides how. If the ElevenLabs
  voice is switched on and a key is loaded, it plays the line in that voice through the mixer
  (so talking over it fades it out in 150 ms, and the ocean sits underneath). If that fails for
  any reason, it says why once and uses the Mac's built-in voice instead, so a line is never lost.

  How it fits: live.js creates one for each session. The Wording tab uses previewLine() for its
  "Hear a line" buttons.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  /* createVoice(cfg, ctx, mixer, { onProblem(message), onUsing(name) }) */
  VS.createVoice = function (cfg, ctx, mixer, ev) {
    ev = ev || {};
    var standIn = VS.createStandInVoice(cfg);
    var tts = VS.createElevenLabsTts(cfg);
    var decoded = {}, token = 0, current = null, reported = {};

    function useEleven() { return cfg.get('useElevenLabsVoice') && !!String(VS.keys.get(cfg) || '').trim(); }

    function problemOnce(msg) {
      if (reported[msg]) { return; }
      reported[msg] = true;
      if (ev.onProblem) { ev.onProblem(msg); }
    }

    function decode(text) {
      var k = tts.cacheKey(text);
      if (decoded[k]) { return Promise.resolve(decoded[k]); }
      return tts.render(text).then(function (data) { return ctx.decodeAudioData(data.slice(0)); }).then(function (buf) { decoded[k] = buf; return buf; });
    }

    return {
      /* speak(text, onEnd) -> plays the line; onEnd(problem|null) when it finishes (not if cancelled). */
      speak: function (text, onEnd) {
        var mine = ++token;
        current = 'pending';
        function done(p) { if (mine === token) { current = null; if (onEnd) { onEnd(p || null); } } }
        if (!useEleven()) {
          current = 'standin';
          return standIn.speak(text, done);
        }
        decode(text).then(function (buf) {
          if (mine !== token) { return; } // cancelled while the line was being made
          current = 'eleven';
          if (ev.onUsing) { ev.onUsing('ElevenLabs voice'); }
          mixer.playClipBuffer(buf, { onEnded: function () { done(null); } });
        }, function (e) {
          if (mine !== token) { return; }
          problemOnce((e && e.plain ? e.plain : 'The ElevenLabs voice did not work.') + ' Using the Mac\'s built-in voice for now.');
          current = 'standin';
          standIn.speak(text, done);
        });
        return true;
      },
      cancel: function () {
        token++;
        var was = !!current; current = null;
        mixer.stopClip(cfg.get('clipFadeOutMs'));
        standIn.cancel();
        return was;
      },
      speaking: function () { return !!current; },

      /* Make every plain line ahead of time, in the background. */
      prepare: function (texts, onProgress) {
        if (!useEleven()) { return Promise.resolve(null); }
        return tts.prepare(texts, onProgress);
      }
    };
  };

  /* For "Hear a line" buttons: play one line in the configured voice, outside a session. */
  VS.previewLine = function (cfg, text, onDone) {
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!cfg.get('useElevenLabsVoice') || !String(VS.keys.get(cfg) || '').trim() || !AC) {
      var s = VS.createStandInVoice(cfg);
      return { by: 'built-in voice', ok: s.speak(text, function () { if (onDone) { onDone(null); } }) };
    }
    var ctx = new AC();
    VS.createElevenLabsTts(cfg).render(text).then(function (data) { return ctx.decodeAudioData(data.slice(0)); }).then(function (buf) {
      var src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start();
      src.onended = function () { ctx.close(); if (onDone) { onDone(null); } };
    }, function (e) {
      ctx.close();
      if (onDone) { onDone(e && e.plain ? e.plain : 'The ElevenLabs voice did not work.'); }
    });
    return { by: 'ElevenLabs voice', ok: true };
  };
})(typeof window !== 'undefined' ? window : globalThis);
