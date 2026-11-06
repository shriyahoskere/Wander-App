/*
  vad.js - voice activity detection (VAD): the part that notices when someone is talking.

  What it is for: it is given the microphone's loudness about 100 times a second and decides
  "speech started" and "speech stopped". That drives the ocean ducking and the silence timers,
  so it has to be fast and local (no internet). It does NOT understand words; that is
  speech-to-text, in milestone 3.

  How it decides:
  - It first learns how loud the quiet room is (the "noise floor"), and keeps adjusting.
  - Speech STARTS when the sound stays clearly above the floor (vadOnsetDb) for a short
    moment (vadMinOnsetMs, about 60 ms). Short clicks do not count.
  - Speech STOPS when the sound has stayed near the floor (below vadOffsetDb) for
    vadHangoverMs, so the short gaps between words are bridged. The stop is reported as
    happening when the quiet actually began, so timing stays honest.
  - Using two different levels for start and stop is called "hysteresis"; it stops flickering.
  - While the system itself is speaking, it becomes less sensitive (the "gate").
  - If something perfectly steady (a fan) keeps it "speaking" for minutes, it learns that
    sound as the new room noise.

  How it fits: mic.js feeds it loudness readings; live.js connects its start/stop to the engine.
  It never touches audio itself, so it can be tested with made-up loudness numbers.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  /*
    createVad(cfg, { onStart(tMs), onEnd(tMs, agoMs) })
    push(tMs, levelDb) - one loudness reading (dB below full scale, e.g. -45)
  */
  VS.createVad = function (cfg, cb) {
    cb = cb || {};
    var st;
    function reset() {
      st = {
        started: null, lastT: null, calibrating: true, calSum: 0, calN: 0,
        floor: -70, speaking: false, aboveMs: 0, quietMs: 0, speechStart: 0,
        gateDb: 0, level: -100, winStart: 0, winMin: 0, winMax: -200, winSum: 0, winN: 0
      };
    }
    reset();

    function thresholds() {
      var on = Math.max(st.floor + cfg.get('vadOnsetDb'), cfg.get('vadMinLevelDb')) + st.gateDb;
      var gap = Math.max(1, cfg.get('vadOnsetDb') - Math.min(cfg.get('vadOffsetDb'), cfg.get('vadOnsetDb') - 1));
      return { on: on, off: on - gap };
    }

    function adaptFloor(level) {
      // Falls quickly toward quieter readings, rises slowly toward louder ones.
      var rate = level < st.floor ? 0.05 : 0.003;
      st.floor += (level - st.floor) * rate;
    }

    // While "speaking", check every 5 s whether the sound is suspiciously steady (a fan, a hum).
    function stuckCheck(t, level) {
      if (st.winN === 0) { st.winStart = t; st.winMin = level; st.winMax = level; }
      st.winMin = Math.min(st.winMin, level); st.winMax = Math.max(st.winMax, level);
      st.winSum += level; st.winN++;
      if (t - st.winStart < 5000) { return false; }
      var steady = (st.winMax - st.winMin) < 4;
      var mean = st.winSum / st.winN;
      st.winN = 0; st.winSum = 0;
      if (steady && t - st.speechStart >= cfg.get('vadStuckNoiseMs')) {
        st.floor = mean;
        return true;
      }
      return false;
    }

    return {
      push: function (t, level) {
        if (st.started === null) { st.started = t; st.lastT = t; }
        var dt = Math.max(0, Math.min(200, t - st.lastT));
        st.lastT = t; st.level = level;

        if (st.calibrating) {
          st.calSum += level; st.calN++;
          if (t - st.started >= cfg.get('vadCalibrationMs')) {
            st.floor = st.calSum / st.calN; st.calibrating = false;
          }
          return;
        }

        var th = thresholds();
        if (!st.speaking) {
          if (level >= th.on) { st.aboveMs += dt; }
          else { st.aboveMs = Math.max(0, st.aboveMs - dt * 2); adaptFloor(level); }
          if (st.aboveMs >= cfg.get('vadMinOnsetMs')) {
            st.speaking = true; st.quietMs = 0; st.speechStart = t; st.winN = 0; st.aboveMs = 0;
            if (cb.onStart) { cb.onStart(t); }
          }
          return;
        }

        // speaking
        if (level < th.off) { st.quietMs += dt; } else { st.quietMs = 0; }
        if (level < st.floor) { adaptFloor(level); } // the floor may only fall during speech
        var stuck = stuckCheck(t, level);
        if (stuck || st.quietMs >= cfg.get('vadHangoverMs')) {
          var ago = stuck ? 0 : st.quietMs;
          st.speaking = false; st.quietMs = 0; st.aboveMs = 0;
          if (cb.onEnd) { cb.onEnd(t, ago, stuck ? 'steady-noise' : 'quiet'); }
        }
      },
      // Make detection less sensitive by this many dB (used while the system is speaking).
      setGate: function (db) { st.gateDb = db; },
      // Stop "speaking" right away (e.g. the session is snoozed).
      forceQuiet: function () { st.speaking = false; st.quietMs = 0; st.aboveMs = 0; },
      reset: reset,
      state: function () {
        var th = thresholds();
        return { speaking: st.speaking, calibrating: st.calibrating, floorDb: st.floor, onDb: th.on, offDb: th.off, levelDb: st.level, gateDb: st.gateDb };
      }
    };
  };

  // Loudness of a block of samples, in dB below full scale (0 dB = as loud as possible).
  VS.levelDb = function (samples, from, to) {
    from = from || 0; to = to || samples.length;
    var sum = 0;
    for (var i = from; i < to; i++) { sum += samples[i] * samples[i]; }
    var rms = Math.sqrt(sum / Math.max(1, to - from));
    return Math.max(-100, 20 * Math.log(rms + 1e-10) / Math.LN10);
  };
})(typeof window !== 'undefined' ? window : globalThis);
