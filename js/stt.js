/*
  stt.js - speech-to-text (STT): the part that turns your speech into words.

  What it is for: one common shape for every transcription service, so they can be swapped
  (ElevenLabs today, Chrome's built-in one as a free option, others such as Deepgram or a local
  Whisper later) without changing anything else. Every service offers:
    start(), stop()
    audio(samples, sampleRate)  - raw microphone sound (only some services need it)
    speechStart(), speechEnd()  - the voice detector's view of when you are talking
  and reports back through:
    onPartial(text)  - words so far, while you speak (may still change)
    onFinal(text)    - settled words for a stretch of speech
    onStatus(text)   - a short line for the screen ("connected", "resting"...)
    onProblem(message, { lostWords }) - something went wrong; lostWords means speech was missed

  How it fits: live.js calls createTranscriber() based on the sttProvider setting.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  VS.createTranscriber = function (cfg, ev, deps) {
    var p = cfg.get('sttProvider');
    if (p === 'elevenlabs') { return VS.createElevenLabsStt(cfg, ev, deps); }
    if (p === 'chrome') { return VS.createChromeStt(cfg, ev); }
    return {
      name: 'off',
      start: function () { if (ev.onStatus) { ev.onStatus('Words: transcription is off'); } return Promise.resolve(); },
      stop: function () {}, audio: function () {}, speechStart: function () {}, speechEnd: function () {}
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
