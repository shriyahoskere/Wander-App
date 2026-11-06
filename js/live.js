/*
  live.js - runs a real session with sound: ocean, microphone, voice detection, clips.

  What it is for: it connects all the parts.
    microphone -> mic.js (loudness) -> vad.js (speech started / stopped) -> engine.js (the rules)
    engine.js actions -> audio-mixer.js (ocean levels) and voice-standin.js (clips)
  It also loads the ocean (your saved file, or the stand-in), runs the heartbeat that checks
  the timers, and reports problems out loud and on screen.

  How it fits: live-ui.js (the Live audio tab) creates one of these and gives it a few
  functions to update the screen. Speech-to-text arrives in milestone 3; until then you can
  type what you said so the follow-up rules have words to work with.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  function decode(ctx, arrayBuffer) {
    // decodeAudioData consumes its input, so give it a copy.
    return ctx.decodeAudioData(arrayBuffer.slice(0));
  }

  // Ocean, in order of preference: your saved file, assets/ocean.wav (only works through a web server), the stand-in.
  VS.loadOceanBuffer = function (ctx) {
    return VS.oceanStore.load().then(function (saved) {
      if (saved && saved.data) {
        return decode(ctx, saved.data).then(function (buf) {
          return { buffer: buf, source: 'your file "' + saved.name + '"', kind: 'file' };
        }, function () {
          return null;
        });
      }
      return null;
    }).then(function (got) {
      if (got) { return got; }
      if (typeof location !== 'undefined' && /^https?:/.test(location.protocol)) {
        return fetch('assets/ocean.wav').then(function (r) {
          if (!r.ok) { throw new Error('missing'); }
          return r.arrayBuffer();
        }).then(function (data) { return decode(ctx, data); }).then(function (buf) {
          return { buffer: buf, source: 'assets/ocean.wav', kind: 'file' };
        }).catch(function () { return null; });
      }
      return null;
    }).then(function (got) {
      if (got) { return got; }
      var syn = VS.synthOcean(ctx.sampleRate, 40, 1234);
      var buf = ctx.createBuffer(2, syn.channels[0].length, ctx.sampleRate);
      buf.getChannelData(0).set(syn.channels[0]); buf.getChannelData(1).set(syn.channels[1]);
      return { buffer: buf, source: 'the built-in stand-in ocean', kind: 'standin' };
    });
  };

  /*
    createLiveSession(cfg, ui)
    ui: { log(line, kind), status(info), clip(text|null), problem(text|null), ocean(text) }
  */
  VS.createLiveSession = function (cfg, ui) {
    var ctx = null, mixer = null, engine = null, vad = null, mic = null, ticker = null, voice = null;
    var running = false, clipActive = false, gateUntil = 0, lastStatus = 0, unsubscribe = null;
    var stt = null, lastWordsAlert = 0, cues = null, cueTimer = null, lastQuietSince = 0;

    function log(line, kind) { if (ui.log) { ui.log(line, kind || 'narrate'); } }
    var startedAt = 0, wallStart = 0, recorder = null;
    // Every stretch the voice detector heard (session time, ms), so the accurate pass can recover
    // speech the live transcription missed. Snoozed speech is never added; "scratch that" removes.
    var heard = [];

    function sayAlert(text) {
      log(VS.formatLine(Date.now() - startedAt, 'System says: "' + text + '"'), 'clip');
      if (voice) { voice.speak(text, null); }
    }
    var alertChooser = VS.createChooser(VS.currentClips);
    function clipText(situation) { var p = alertChooser.pick(situation); return p ? p.text : null; }

    // Transcription events -> engine and screen.
    var sttEvents = {
      onPartial: function (text) {
        if (!running) { return; }
        engine.transcript(text, false);
        if (ui.words) { ui.words(text, false, false); }
      },
      onFinal: function (text) {
        if (!running) { return; }
        var st = engine.state(), asleep = st === 'Snoozed' || st === 'Stopped';
        if (ui.words) { ui.words(text, true, asleep); }
        log(VS.formatLine(Date.now() - startedAt, 'You say: "' + text + '"'), 'speech');
        engine.transcript(text, true);
      },
      onStatus: function (text) { if (ui.sttStatus) { ui.sttStatus(text); } },
      onProblem: function (msg, o) {
        if (!running) { return; }
        if (ui.problem) { ui.problem(msg); }
        log(VS.formatLine(Date.now() - startedAt, 'Transcription problem: ' + msg), 'narrate');
        if (ui.words) { ui.words(null); }
        // Failures are never silent, but say it at most once every 30 seconds.
        if (Date.now() - lastWordsAlert > 30000) {
          lastWordsAlert = Date.now();
          var line = clipText(o && o.lostWords ? 'alert-lost' : 'alert-words');
          if (line) { sayAlert(line); }
        }
      }
    };

    function startStt() {
      stt = VS.createTranscriber(cfg, sttEvents);
      return stt.start().then(function () {
        log(VS.formatLine(Date.now() - startedAt, 'Transcription: ' + stt.name + '.'), 'narrate');
      }, function (err) {
        sttEvents.onProblem(err.message, { lostWords: false });
        stt = null;
      });
    }

    function wantsCue(a) {
      if (!cues || !cfg.get('promptCueEnabled') || a.kind !== 'prompt') { return false; }
      return cfg.get('promptCueFor') === 'all' || VS.QUESTION_SITUATIONS.indexOf(a.situation) >= 0;
    }

    function playClip(a) {
      clipActive = true;
      if (ui.clip) { ui.clip(a.text, a.situation); }
      function speakNow() {
        cueTimer = null;
        log(VS.formatLine(a.t, 'System says: "' + a.text + '"'), 'clip');
        voice.speak(a.text, function (problem) {
          clipActive = false; gateUntil = Date.now() + 300;
          if (ui.clip) { ui.clip(null); }
          if (problem === 'no-voice') { log('(No built-in voice is available, so the clip was shown instead of spoken.)', 'narrate'); }
          if (a.kind === 'prompt' && engine) { engine.clipEnded(); }
        });
      }
      if (wantsCue(a)) {
        mixer.playCue(cues.prompt, cfg.get('cueVolume'));
        if (ui.cue) { ui.cue('prompt'); }
        cueTimer = setTimeout(speakNow, Math.round(cues.prompt.duration * 1000 * 0.5) + cfg.get('promptCueGapMs'));
      } else {
        speakNow();
      }
    }

    // The soft sound after you speak. Nothing plays when you START speaking. Once you have been
    // quiet for pauseCueAfterMs (5 s) after speaking, your after-you-speak sound plays (the file
    // you chose, or the built-in one), by which time the ocean has risen back.
    // (The sound file is kept under the old "record-cue" name, so a file you chose still works.)
    var pauseCueDone = true, pendingKind = null;
    function speechBegan() {
      lastQuietSince = 0; pauseCueDone = false; pendingKind = null;
      var st = engine ? engine.state() : 'Stopped';
      if (st !== 'Snoozed' && st !== 'Stopped' && wallStart) { heard.push({ startT: Date.now() - wallStart, endT: null }); }
    }
    function speechStopped(agoMs) {
      lastQuietSince = Date.now() - (agoMs || 0); pauseCueDone = false;
      var last = heard[heard.length - 1];
      if (last && last.endT == null) { last.endT = Math.max(last.startT, lastQuietSince - wallStart); }
    }
    function checkPauseCue(n) {
      if (pauseCueDone || !lastQuietSince || !engine) { return; }
      var wait = cfg.get('pauseCueAfterMs');
      if (n - lastQuietSince < wait + 150) { return; } // +150 ms lets a thought saved at the same moment go first
      pauseCueDone = true;
      var st = engine.state();
      if (!cfg.get('pauseCueEnabled') || !cues || clipActive || st === 'Snoozed' || st === 'Stopped' || st === 'Listening') { pendingKind = null; return; }
      mixer.playCue(cues.record, cfg.get('cueVolume'));
      log(VS.formatLine(n - startedAt, (wait / 1000).toFixed(1) + 's of quiet: played ' + (cues.recordSource && cues.recordSource.indexOf('your file') === 0 ? cues.recordSource : 'the after-you-speak sound') + '.'), 'narrate');
      pendingKind = null;
    }

    // Make every plain line in the ElevenLabs voice ahead of time, so each plays instantly.
    function prepareVoice() {
      if (!cfg.get('ttsPrepareAhead')) { return; }
      var lines = VS.preparableLines(VS.currentClips());
      var p = voice.prepare(lines, function (prog) {
        if (ui.voiceStatus) { ui.voiceStatus('Preparing the voice: ' + (prog.made + prog.already) + ' of ' + prog.total + ' lines'); }
      });
      if (!p) { return; }
      p.then(function (r) {
        if (!r) { if (ui.voiceStatus) { ui.voiceStatus(cfg.get('useElevenLabsVoice') ? 'No .env key loaded: using the Mac\'s built-in voice' : 'Using the Mac\'s built-in voice'); } return; }
        if (r.problem) {
          if (ui.voiceStatus) { ui.voiceStatus('Voice problem: using the built-in voice'); }
          if (ui.problem) { ui.problem(r.problem + ' Using the Mac\'s built-in voice for now.'); }
          log(VS.formatLine(Date.now() - startedAt, 'Voice problem: ' + r.problem), 'narrate');
          return;
        }
        if (ui.voiceStatus) { ui.voiceStatus('ElevenLabs voice ready (' + (r.made + r.already) + ' lines)'); }
        log(VS.formatLine(Date.now() - startedAt, 'ElevenLabs voice ready: ' + r.made + ' lines made now, ' + r.already + ' already kept in this browser.'), 'narrate');
      });
    }

    function onThoughtSaved(a) {
      // The language processor reads the thought for all six kinds (task, goal, reflection,
      // concept, story, quote); if its wording gives no clear cue, the simple rules' kind stays.
      if (cfg.get('liveKindsByNlp') && VS.nlpKind) {
        var k = null;
        try { k = VS.nlpKind(a.item.text); } catch (e) { k = null; }
        if (k && k !== a.item.kind) { a.item.kind = k; engine.setItemKind(a.item.id, k); }
      }
      // The optional tiny saved tone (off by default: only your after-you-speak sound plays).
      if (cues && cfg.get('savedCueEnabled')) { mixer.playCue(cues[a.item.kind] || cues.reflection, cfg.get('cueVolume')); }
      if (ui.thought) { ui.thought(a.item, a.count); }
    }

    function stopClip() {
      if (cueTimer) { clearTimeout(cueTimer); cueTimer = null; } // you spoke during the cue: the question is dropped
      voice.cancel(); mixer.stopClip();
      clipActive = false; gateUntil = Date.now() + 150;
      if (ui.clip) { ui.clip(null); }
    }

    function onAction(a) {
      if (a.type === 'narrate') { if (cfg.get('narrate')) { log(VS.formatLine(a.t, a.text), 'narrate'); } }
      else if (a.type === 'ocean') { mixer.setLevel(a.level); }
      else if (a.type === 'playClip') { playClip(a); }
      else if (a.type === 'stopClip') { stopClip(); }
      else if (a.type === 'thoughtSaved') { onThoughtSaved(a); }
      else if (a.type === 'scratch') { heard = heard.filter(function (h) { return h.startT < a.fromT; }); }
      else if (a.type === 'thoughtsScratched') { if (ui.scratchThoughts) { ui.scratchThoughts(a.ids); } }
      else if (a.type === 'sessionStarted' || a.type === 'sessionRestored') { if (a.type === 'sessionStarted') { wallStart = Date.now(); heard = []; if (recorder) { recorder.reset(); } }
         if (ui.sessionEvent) { ui.sessionEvent(a.type); } }
      if (a.type === 'ocean' && a.level === 'out' && vad) { vad.forceQuiet(); }
    }

    function heartbeat() {
      if (!running) { return; }
      engine.tick();
      checkPauseCue(Date.now());
      if (vad) { vad.setGate(clipActive || Date.now() < gateUntil ? cfg.get('vadClipGateDb') : 0); }
      var n = Date.now();
      if (n - lastStatus >= 100 && ui.status) {
        lastStatus = n;
        ui.status({
          engine: engine.status(),
          vad: vad ? vad.state() : null,
          oceanGain: mixer.gainNow(),
          oceanLevel: mixer.level(),
          quietMs: lastQuietSince ? n - lastQuietSince : null, pauseCueMs: cfg.get('pauseCueAfterMs'), pauseCueDone: pauseCueDone,
          outputDb: mixer.outputLevelDb(),
          ctxState: ctx.state
        });
      }
    }

    var session = {
      running: function () { return running; },

      /* The transcript so far, for sorting: { startWall, utterances: [{ startT, endT, text }] }. */
      transcript: function () {
        if (!engine) { return null; }
        var utts = engine.utterances();
        // add stretches the detector heard but live transcription returned nothing for (only
        // useful with the accurate pass; empty ones are dropped again if it finds no words)
        var extra = recorder ? heard.filter(function (h) {
          var end = h.endT == null ? Date.now() - wallStart : h.endT;
          return !utts.some(function (u) { return u.startT <= end + 1500 && (u.endT == null ? u.startT : u.endT) >= h.startT - 1500; });
        }).map(function (h) { return { startT: h.startT, endT: h.endT == null ? Date.now() - wallStart : h.endT, text: '' }; }) : [];
        var all = utts.concat(extra).sort(function (a, b) { return a.startT - b.startT; });
        return { startWall: wallStart, utterances: all, recording: recorder ? recorder.snapshot() : null };
      },

      /* Sound levels for the water on screen, read every frame. null when not running. */
      levels: function () {
        if (!running || !engine) { return null; }
        var v = vad ? vad.state() : null;
        return {
          speaking: engine.state() === 'Listening',
          voiceDb: v ? v.levelDb : null, voiceOffDb: v ? v.offDb : null,
          outputDb: mixer.outputLevelDb()
        };
      },

      start: function (opts) {
        opts = opts || {};
        if (running) { return Promise.resolve(); }
        if (ui.problem) { ui.problem(null); }
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { return Promise.reject(new Error('This browser has no audio support. Use Chrome.')); }
        ctx = new AC({ latencyHint: 'interactive' });
        mixer = VS.createMixer(ctx, cfg);
        voice = VS.createVoice(cfg, ctx, mixer, {
          onProblem: function (msg) {
            if (ui.problem) { ui.problem(msg); }
            log(VS.formatLine(Date.now() - startedAt, 'Voice problem: ' + msg), 'narrate');
          }
        });
        startedAt = Date.now(); wallStart = startedAt;
        return ctx.resume().then(function () { return VS.loadOceanBuffer(ctx); }).then(function (ocean) {
          var info = mixer.setOceanBuffer(ocean.buffer);
          if (ui.ocean) { ui.ocean(ocean.source + ' (loop ' + Math.round(info.seconds) + ' s, blended over ' + info.fadeSeconds.toFixed(1) + ' s)', ocean.kind); }
          mixer.startOcean();
          return VS.loadCues(ctx).then(function (c) { cues = c; if (ui.cues) { ui.cues(c); } return ocean; });
        }).then(function (ocean) {
          unsubscribe = cfg.onChange(function (k) {
            if (k === '*' || /^(oceanGain|duckGain|clipDuckGain)$/.test(k)) { mixer.refresh(); }
          });
          engine = VS.createEngine({ clock: VS.realClock, cfg: cfg, chooser: VS.createChooser(VS.currentClips), onAction: onAction });
          running = true;
          engine.start();
          log(VS.formatLine(0, 'Playing ' + ocean.source + '.'), 'narrate');
          ticker = VS.createTicker(50, heartbeat);
          lastQuietSince = 0; pauseCueDone = true; heard = []; // nothing said yet: no sound until you have spoken
          prepareVoice();
          if (!opts.useMic) {
            log(VS.formatLine(Date.now() - startedAt, 'Microphone is off. Use the "Hold to talk" button to pretend you are speaking.'), 'narrate');
            return;
          }
          // keep the session's sound in memory for the accurate pass when you save (never on disk)
          recorder = cfg.get('sttAccuratePass') && cfg.get('sttProvider') === 'elevenlabs' && VS.createSessionRecorder ? VS.createSessionRecorder(cfg) : null;
          vad = VS.createVad(cfg, {
            onStart: function () { if (running) { speechBegan(); engine.speechStart(); if (stt) { stt.speechStart(); } } },
            onEnd: function (t, ago, why) {
              if (!running) { return; }
              speechStopped(ago);
              if (why === 'steady-noise') { log(VS.formatLine(Date.now() - startedAt, 'That steady sound did not change for minutes, so I learned it as room noise.'), 'narrate'); }
              engine.speechEnd(ago);
              if (stt) { stt.speechEnd(); }
            }
          });
          return VS.startMic(ctx, cfg, {
            onLevel: function (t, db) { if (vad) { vad.push(t, db); } },
            onAudio: function (f32, rate) { if (stt) { stt.audio(f32, rate); } if (recorder) { recorder.push(f32, rate); } },
            onLost: function (msg) {
              if (ui.problem) { ui.problem(msg + ' Plug it back in, then press End session and Start again.'); }
              vad = null;
              if (stt) { stt.stop(); stt = null; }
              var micLine = clipText('alert-mic'); if (micLine) { sayAlert(micLine); }
            }
          }).then(function (m) {
            mic = m;
            log(VS.formatLine(Date.now() - startedAt, 'Microphone on (' + m.label + '). Stay quiet for a moment while I learn how noisy the room is.'), 'narrate');
            return startStt();
          }, function (err) {
            vad = null;
            if (ui.problem) { ui.problem(err.message + ' The ocean keeps playing; you can use "Hold to talk" instead.'); }
            var micLine = clipText('alert-mic'); if (micLine) { sayAlert(micLine); }
          });
        });
      },

      /* End everything: fade the ocean out, close the microphone and audio. */
      end: function () {
        if (!running) { return; }
        running = false;
        if (ticker) { ticker.stop(); ticker = null; }
        if (stt) { stt.stop(); stt = null; }
        if (mic) { mic.stop(); mic = null; }
        recorder = null; // the sound is let go once the session ends (the UI has already taken its copy for the accurate pass)
        if (voice) { voice.cancel(); }
        if (cueTimer) { clearTimeout(cueTimer); cueTimer = null; }
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        vad = null;
        var c = ctx, mx = mixer;
        mx.setLevel('out');
        setTimeout(function () { mx.close(); c.close(); }, cfg.get('oceanFadeOutMs') + 200);
        log(VS.formatLine(Date.now() - startedAt, 'Session ended. Ocean fading out.'), 'narrate');
      },

      /* Words you typed, as if speech-to-text had heard them. */
      sendWords: function (text) {
        if (!running) { return; }
        // Typed words count as a short stretch of speech, unless you are speaking right now.
        var simulate = !vad || !vad.state().speaking;
        if (simulate) { speechBegan(); engine.speechStart(); engine.speechEnd(); speechStopped(0); }
        log(VS.formatLine(Date.now() - startedAt, 'You say: "' + text + '"'), 'speech');
        engine.transcript(text, true);
      },

      /* The "Hold to talk" button: pretend speech starts / stops. */
      pretendSpeaking: function (on) {
        if (!running) { return; }
        // With the microphone on, holding the button also sends what you say to transcription
        // (push-to-talk), even if the voice detector has not noticed you yet.
        if (on) { speechBegan(); engine.speechStart(); if (stt) { stt.speechStart(); } }
        else { speechStopped(0); engine.speechEnd(); if (stt) { stt.speechEnd(); } }
      },

      command: function (name, minutes) { if (running) { engine.command(name, minutes, 'A button'); } },

      /* Replace the ocean while running (after choosing a new file). */
      swapOcean: function () {
        if (!running) { return Promise.resolve(null); }
        return VS.loadOceanBuffer(ctx).then(function (ocean) {
          mixer.stopOcean();
          var info = mixer.setOceanBuffer(ocean.buffer);
          mixer.startOcean();
          if (ui.ocean) { ui.ocean(ocean.source + ' (loop ' + Math.round(info.seconds) + ' s, blended over ' + info.fadeSeconds.toFixed(1) + ' s)', ocean.kind); }
          log(VS.formatLine(Date.now() - startedAt, 'Now playing ' + ocean.source + '.'), 'narrate');
          return ocean;
        });
      },

      /* Reload the cue sounds after you choose a new file. */
      reloadCues: function () {
        if (!running) { return Promise.resolve(null); }
        return VS.loadCues(ctx).then(function (c) { cues = c; if (ui.cues) { ui.cues(c); } return c; });
      },

      /* Play a cue now (for "Hear it" buttons). */
      previewCue: function (kind) { if (running && cues) { mixer.playCue(cues[kind], cfg.get('cueVolume')); return true; } return false; },

      items: function () { return engine ? engine.items() : []; },

      debug: function () { return { ctx: ctx, mixer: mixer, engine: engine, vad: vad, voice: voice, stt: stt }; }
    };
    return session;
  };
})(typeof window !== 'undefined' ? window : globalThis);
