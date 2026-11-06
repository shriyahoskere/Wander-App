/*
  stt-chrome.js - live transcription with Chrome's built-in speech recognition.

  What it is for: a free option that needs no API key. Chrome sends your audio to Google's
  servers and returns words as you speak. It is usually less accurate than ElevenLabs, and it
  listens all the time (not only while you speak), because Chrome manages its own microphone.

  Chrome stops recognising every so often on its own; this restarts it quietly.

  How it fits: stt.js creates this when the setting sttProvider is "chrome".
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  VS.createChromeStt = function (cfg, ev) {
    var Rec = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
    var rec = null, running = false, restartTimer = null, failures = 0;

    function status(t) { if (ev.onStatus) { ev.onStatus(t); } }
    function problem(m, lost) { if (ev.onProblem) { ev.onProblem(m, { lostWords: !!lost }); } }

    function begin() {
      if (!running) { return; }
      rec = new Rec();
      rec.continuous = true;
      rec.interimResults = true;
      var lang = String(cfg.get('sttLanguage') || '').trim();
      rec.lang = lang || (navigator.language || 'en-AU');
      rec.onresult = function (e) {
        failures = 0;
        var interim = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          var text = String(e.results[i][0].transcript || '').trim();
          if (!text) { continue; }
          if (e.results[i].isFinal) { if (ev.onFinal) { ev.onFinal(text); } }
          else { interim += (interim ? ' ' : '') + text; }
        }
        if (interim && ev.onPartial) { ev.onPartial(interim); }
      };
      rec.onerror = function (e) {
        var err = e && e.error;
        if (err === 'no-speech' || err === 'aborted') { return; }
        if (err === 'not-allowed' || err === 'service-not-allowed') {
          running = false;
          problem('Chrome would not start its speech recognition on this page. Try ElevenLabs instead (Settings, Transcription).', false);
          status('Words: unavailable');
          return;
        }
        failures++;
        problem(err === 'network' ? 'Chrome lost its connection to the speech service.' : 'Chrome speech recognition had a problem (' + err + ').', true);
      };
      rec.onend = function () {
        if (!running) { return; }
        restartTimer = setTimeout(begin, Math.min(10000, 250 * Math.pow(2, failures)));
      };
      try { rec.start(); status('Words: listening (Chrome)'); } catch (e) { /* already started */ }
    }

    return {
      name: 'Chrome',
      start: function () {
        if (!Rec) { return Promise.reject(new Error('This browser has no built-in speech recognition. Use Chrome, or choose ElevenLabs.')); }
        running = true; failures = 0; begin();
        return Promise.resolve();
      },
      stop: function () {
        running = false;
        if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
        if (rec) { try { rec.abort(); } catch (e) { /* ignore */ } rec = null; }
        status('Words: off');
      },
      audio: function () {},
      speechStart: function () {},
      speechEnd: function () {}
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
