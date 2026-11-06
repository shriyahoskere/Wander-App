/*
  voice-standin.js - a temporary voice: your Mac's built-in speech, used until milestone 4.

  What it is for: so you can hear the system's clips now. It uses the browser's built-in
  "speech synthesis" (the same voices as Spoken Content in System Settings). In milestone 4 the
  ElevenLabs voice replaces it, and clips will then play through the mixer.

  Known limit: the built-in voice cannot fade, so when you talk over it, it stops instantly
  instead of fading in 150 ms. The ElevenLabs version will fade properly.

  How it fits: live.js calls speak() for every clip the engine wants played, and cancel() when
  you start speaking over it. If no built-in voice is available it says so and the session
  carries on, with the clip text shown on screen instead.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  VS.createStandInVoice = function (cfg) {
    var synth = (typeof window !== 'undefined' && window.speechSynthesis) ? window.speechSynthesis : null;
    var current = null, token = 0;

    function pickVoice() {
      var voices = synth ? synth.getVoices() : [];
      var want = String(cfg.get('standInVoiceName') || '').toLowerCase().trim();
      var i;
      if (want) { for (i = 0; i < voices.length; i++) { if (voices[i].name.toLowerCase().indexOf(want) >= 0) { return voices[i]; } } }
      var prefs = ['en-au', 'en-gb', 'en-us', 'en'];
      for (var p = 0; p < prefs.length; p++) {
        for (i = 0; i < voices.length; i++) {
          if (String(voices[i].lang).toLowerCase().indexOf(prefs[p]) === 0 && voices[i].localService) { return voices[i]; }
        }
      }
      return voices[0] || null;
    }

    return {
      available: function () { return !!synth; },
      voiceName: function () { var v = pickVoice(); return v ? v.name : null; },

      /* speak(text, onEnd) -> true if speaking started. onEnd(problem) is called when it finishes. */
      speak: function (text, onEnd) {
        var mine = ++token;
        function done(problem) { if (mine === token) { current = null; if (onEnd) { onEnd(problem || null); } } }
        if (!synth || !cfg.get('useStandInVoice')) {
          // No voice: pretend it took a natural amount of time, so timing still works.
          setTimeout(function () { done(synth ? null : 'no-voice'); }, Math.min(6000, 600 + String(text).length * 60));
          return false;
        }
        synth.cancel();
        var u = new SpeechSynthesisUtterance(text);
        var v = pickVoice();
        if (v) { u.voice = v; u.lang = v.lang; }
        u.rate = cfg.get('standInRate'); u.pitch = 1; u.volume = 1;
        u.onend = function () { done(null); };
        u.onerror = function (e) { done(e && e.error === 'interrupted' ? null : 'error'); };
        current = u;
        synth.speak(u);
        return true;
      },

      /* Stop speaking now. The onEnd of the cancelled line is NOT called. */
      cancel: function () {
        token++;
        if (synth) { synth.cancel(); }
        var was = !!current; current = null;
        return was;
      },

      speaking: function () { return !!current; }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
