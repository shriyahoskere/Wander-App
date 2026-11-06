/*
  audio-mixer.js - the always-on mixer: the ocean underneath, and system clips on top.

  What it is for: it plays the ocean loop for the whole session and moves its volume between
  five levels, each with its own speed:
    in        fade up to oceanGain over oceanFadeInMs (session start, snooze over)
    duck      fast down to duckGain over duckAttackMs (you started speaking)
    up        slowly back to oceanGain over duckReleaseMs (pause confirmed: "I heard you")
    clipDuck  down to clipDuckGain (a system clip is playing)
    out       fade to silence over oceanFadeOutMs (snooze, stop)
  It also plays clip recordings (from milestone 4) and can cut a clip off with a fast fade.

  It uses the browser's built-in audio system (Web Audio). Volume changes are smooth curves,
  never jumps, so you never hear a click. A new change can interrupt an old one halfway; the
  mixer always starts the new curve from wherever the volume actually is.

  How it fits: live.js turns the engine's "ocean" actions into setLevel() calls. Tests run the
  same mixer inside an offline (silent, super fast) audio context and measure the result.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  // Curve shapes. u goes 0..1 over the ramp; the result goes 0..1 from start to target.
  var SHAPES = {
    easeOut: function (u) { return 1 - (1 - u) * (1 - u); },          // fast at first (ducking)
    smooth: function (u) { return 0.5 - 0.5 * Math.cos(Math.PI * u); } // gentle start and end
  };

  VS.levelSpec = function (level, cfg) {
    switch (level) {
      case 'in': return { gain: cfg.get('oceanGain'), ms: cfg.get('oceanFadeInMs'), shape: 'smooth' };
      case 'up': return { gain: cfg.get('oceanGain'), ms: cfg.get('duckReleaseMs'), shape: 'smooth' };
      case 'duck': return { gain: cfg.get('duckGain'), ms: cfg.get('duckAttackMs'), shape: 'easeOut' };
      case 'clipDuck': return { gain: cfg.get('clipDuckGain'), ms: cfg.get('duckAttackMs'), shape: 'easeOut' };
      case 'out': return { gain: 0, ms: cfg.get('oceanFadeOutMs'), shape: 'smooth' };
      default: return null;
    }
  };

  /*
    createMixer(ctx, cfg, { destination }) - ctx is an AudioContext or OfflineAudioContext.
    All scheduling methods take an optional `at` (seconds on the audio clock); default is now.
  */
  VS.createMixer = function (ctx, cfg, opts) {
    opts = opts || {};
    var dest = opts.destination || ctx.destination;
    var master = ctx.createGain();
    var analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    master.connect(analyser); analyser.connect(dest);

    var oceanGain = ctx.createGain();
    oceanGain.gain.value = 0;
    oceanGain.connect(master);

    var loopBuffer = null, oceanSrc = null, loopInfo = null;
    var ramp = { t0: 0, v0: 0, v1: 0, dur: 0, shape: 'smooth' };
    var levelName = 'silent';
    var clip = null; // { src, gain, ended }

    function now(at) { return at === undefined ? ctx.currentTime : at; }

    // What the ocean gain is (or will be) at time t, from the curve we last scheduled.
    function gainAt(t) {
      if (ramp.dur <= 0 || t >= ramp.t0 + ramp.dur) { return t < ramp.t0 ? ramp.v0 : ramp.v1; }
      if (t <= ramp.t0) { return ramp.v0; }
      var u = (t - ramp.t0) / ramp.dur;
      return ramp.v0 + (ramp.v1 - ramp.v0) * SHAPES[ramp.shape](u);
    }

    function rampTo(target, ms, shape, at) {
      var t = now(at), v = gainAt(t), dur = Math.max(0.005, ms / 1000);
      var g = oceanGain.gain;
      // Freeze the old curve exactly where it is at time t, then start the new curve a hair later
      // from that same value. (Simply cancelling a curve that is halfway through makes the browser
      // jump back to the value from before it, which you would hear as a click. Tests caught this.)
      if (g.cancelAndHoldAtTime) { g.cancelAndHoldAtTime(t); }
      else { g.cancelScheduledValues(t); g.setValueAtTime(v, t); }
      var steps = Math.max(8, Math.min(512, Math.round(dur * 100)));
      var curve = new Float32Array(steps);
      for (var i = 0; i < steps; i++) { curve[i] = v + (target - v) * SHAPES[shape](i / (steps - 1)); }
      g.setValueCurveAtTime(curve, t + 2 / ctx.sampleRate, dur);
      ramp = { t0: t, v0: v, v1: target, dur: dur, shape: shape };
    }

    var mixer = {
      context: ctx,

      /* Load a decoded recording (AudioBuffer) as the ocean. Builds the seamless loop once. */
      setOceanBuffer: function (buffer) {
        var chans = [];
        for (var c = 0; c < buffer.numberOfChannels; c++) { chans.push(buffer.getChannelData(c)); }
        var fade = Math.round(buffer.sampleRate * cfg.get('oceanLoopCrossfadeMs') / 1000);
        loopInfo = VS.crossfadeLoop(chans, fade);
        loopBuffer = ctx.createBuffer(chans.length, loopInfo.length, buffer.sampleRate);
        loopInfo.channels.forEach(function (data, i) { loopBuffer.getChannelData(i).set(data); });
        loopInfo.seconds = loopInfo.length / buffer.sampleRate;
        loopInfo.fadeSeconds = loopInfo.fadeSamples / buffer.sampleRate;
        return loopInfo;
      },

      /* Start the loop playing (silently: call setLevel('in') to hear it). */
      startOcean: function (at) {
        if (!loopBuffer) { throw new Error('No ocean sound has been loaded.'); }
        if (oceanSrc) { return; }
        oceanSrc = ctx.createBufferSource();
        oceanSrc.buffer = loopBuffer;
        oceanSrc.loop = true; // sample-exact repeat inside the audio system: no gaps, no drift
        oceanSrc.connect(oceanGain);
        oceanSrc.start(now(at));
      },

      stopOcean: function (at) {
        if (oceanSrc) { try { oceanSrc.stop(now(at)); } catch (e) { /* already stopped */ } oceanSrc = null; }
      },

      /* Move the ocean to one of the five levels. Returns the target and time used. */
      setLevel: function (level, at) {
        var spec = VS.levelSpec(level, cfg);
        if (!spec) { return null; }
        rampTo(spec.gain, spec.ms, spec.shape, at);
        levelName = level;
        return spec;
      },

      /* Settings changed: move to the new value of the current level, quickly. */
      refresh: function () {
        var spec = VS.levelSpec(levelName, cfg);
        if (spec) { rampTo(spec.gain, 150, 'smooth'); }
      },

      gainNow: function (at) { return gainAt(now(at)); },
      level: function () { return levelName; },
      loopInfo: function () { return loopInfo; },

      /* Play a clip recording on top. Any clip already playing is faded out first. */
      playClipBuffer: function (buffer, o) {
        o = o || {};
        mixer.stopClip(cfg.get('clipFadeOutMs'), o.at);
        var t = now(o.at), src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = buffer; g.gain.setValueAtTime(o.gain === undefined ? 1 : o.gain, t);
        src.connect(g); g.connect(master);
        var mine = { src: src, gain: g, ended: false };
        src.onended = function () {
          mine.ended = true;
          if (clip === mine) { clip = null; }
          if (o.onEnded && !mine.cancelled) { o.onEnded(); }
        };
        src.start(t);
        clip = mine;
        return mine;
      },

      /* Cut off the playing clip with a short fade (no click). */
      stopClip: function (fadeMs, at) {
        if (!clip) { return false; }
        var c = clip, t = now(at), f = Math.max(0.005, (fadeMs === undefined ? cfg.get('clipFadeOutMs') : fadeMs) / 1000);
        c.cancelled = true;
        var g = c.gain.gain, v = g.value;
        g.cancelScheduledValues(t); g.setValueAtTime(v, t); g.linearRampToValueAtTime(0, t + f);
        try { c.src.stop(t + f + 0.01); } catch (e) { /* already stopped */ }
        clip = null;
        return true;
      },

      clipPlaying: function () { return !!clip; },

      /* A short interface sound on top of everything. It never interrupts a clip. */
      playCue: function (buffer, gain, at) {
        var t = now(at), src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = buffer; g.gain.setValueAtTime(gain === undefined ? 0.5 : gain, t);
        src.connect(g); g.connect(master); src.start(t);
        return src;
      },

      /* Loudness of everything you are hearing right now, in dB. */
      outputLevelDb: function () {
        var buf = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(buf);
        return VS.levelDb(buf);
      },

      close: function () {
        mixer.stopOcean(); mixer.stopClip(10);
        try { master.disconnect(); } catch (e) { /* ignore */ }
      }
    };
    return mixer;
  };
})(typeof window !== 'undefined' ? window : globalThis);
