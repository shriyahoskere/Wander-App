/*
  mic.js - opens the microphone and measures how loud it is, about 100 times a second.

  What it is for: it asks the browser for the microphone, then reads the loudness of the most
  recent sound and hands it to the voice detector. Nothing is recorded or saved in this
  milestone. If the microphone is blocked, missing, or unplugged mid-session, it reports a
  plain-English problem so the system can say so out loud (failures are never silent).

  How it fits: live.js starts it and connects its readings to vad.js. The microphone is never
  connected to the speakers, so you will not hear yourself.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  function explain(err) {
    var n = err && err.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') {
      return 'The browser blocked the microphone. Click the icon at the left of the address bar, allow the microphone, then press Start again.';
    }
    if (n === 'NotFoundError' || n === 'OverconstrainedError') {
      return 'No microphone was found. Check one is plugged in and chosen in System Settings, Sound, Input.';
    }
    if (n === 'NotReadableError' || n === 'AbortError') {
      return 'The microphone is busy or not responding. Close other apps that might be using it (Zoom, FaceTime) and try again.';
    }
    return 'The microphone could not be opened (' + (err && err.message ? err.message : 'unknown reason') + ').';
  }
  VS.explainMicError = explain;

  /*
    startMic(ctx, cfg, { onLevel(tMs, levelDb), onLost(message) }) -> Promise of { stop(), label }
  */
  VS.startMic = function (ctx, cfg, cb) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('This browser cannot use a microphone here. Open the page in Chrome.'));
    }
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: cfg.get('micEchoCancellation'),
        noiseSuppression: cfg.get('micNoiseSuppression'),
        autoGainControl: false,
        channelCount: 1
      }
    }).catch(function (err) { throw new Error(explain(err)); }).then(function (stream) {
      var source = ctx.createMediaStreamSource(stream);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser); // deliberately NOT connected to the speakers
      var buf = new Float32Array(analyser.fftSize);
      var win = Math.min(buf.length, Math.round(ctx.sampleRate * 0.012)); // last ~12 ms
      var stopped = false;
      var track = stream.getAudioTracks()[0];
      if (track) {
        track.addEventListener('ended', function () {
          if (!stopped && cb.onLost) { cb.onLost('The microphone was disconnected.'); }
        });
      }
      // Raw sound for transcription (only if someone asked for it). A "script processor" hands us
      // the samples in blocks of about 85 ms. It must be connected onward to keep running, so it
      // goes through a volume of zero: you never hear yourself.
      var proc = null, mute = null;
      if (cb.onAudio && ctx.createScriptProcessor) {
        proc = ctx.createScriptProcessor(4096, 1, 1);
        mute = ctx.createGain(); mute.gain.value = 0;
        source.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
        proc.onaudioprocess = function (e) {
          if (!stopped) { cb.onAudio(new Float32Array(e.inputBuffer.getChannelData(0)), ctx.sampleRate); }
        };
      }
      var ticker = VS.createTicker(10, function () {
        if (stopped) { return; }
        analyser.getFloatTimeDomainData(buf);
        cb.onLevel(Date.now(), VS.levelDb(buf, buf.length - win, buf.length));
      });
      return {
        label: track ? track.label : 'microphone',
        stop: function () {
          stopped = true; ticker.stop();
          try { source.disconnect(); } catch (e) { /* already gone */ }
          if (proc) { proc.onaudioprocess = null; try { proc.disconnect(); mute.disconnect(); } catch (e2) { /* already gone */ } }
          stream.getTracks().forEach(function (t) { t.stop(); });
        }
      };
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);
