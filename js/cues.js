/*
  cues.js - the two small interface sounds.

  What it is for:
  1. The question cue: a soft sound just before the system asks a question, so a question never
     arrives out of nowhere. You can replace it with your own .wav in Sound and voice on the Session screen.
  2. The after-you-speak sound ("record" below, kept under that name so a file you chose before
     still works): one soft sound once you have been quiet for 5 s after speaking. Nothing plays
     when you start speaking. Replace it with your own file on the Session screen.
  3. The saved sound: a very tiny sound each time a thought is saved, so you know your thoughts
     are being logged. Each kind has its own tiny tone: a reflection is a single soft note, a task
     two quick notes, a goal two notes stepping up. You can replace it with your own file too
     (then the same file plays for every kind).

  How they are made: until you choose files, the sounds are built from pure tones with a soft
  start and a gentle fade, kept very quiet. They play through the mixer, on top of the ocean.

  How it fits: live.js asks for a cue buffer and plays it with mixer.playCue().
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  // One soft note: a sine with a 6 ms rise and an exponential fade.
  function note(data, sr, startS, hz, durS, level) {
    var start = Math.round(startS * sr), n = Math.round(durS * sr);
    for (var i = 0; i < n && start + i < data.length; i++) {
      var t = i / sr;
      var env = Math.min(1, t / 0.006) * Math.exp(-t / (durS / 4.5));
      // a quieter octave above gives a glassy, bell-like edge
      data[start + i] += level * env * (Math.sin(2 * Math.PI * hz * t) + 0.25 * Math.sin(4 * Math.PI * hz * t));
    }
  }

  var RECIPES = {
    // question cue: two gentle notes, a little like a soft intake of breath before speaking
    prompt: { len: 0.9, notes: [[0, 587.3, 0.55, 0.16], [0.16, 880, 0.7, 0.13]] },
    // recording: a tiny soft rise, the moment you start speaking
    record: { len: 0.3, notes: [[0, 784, 0.12, 0.07], [0.06, 1046.5, 0.22, 0.06]] },
    reflection: { len: 0.35, notes: [[0, 1318.5, 0.3, 0.07]] },
    task: { len: 0.4, notes: [[0, 1174.7, 0.16, 0.06], [0.09, 1174.7, 0.22, 0.06]] },
    goal: { len: 0.45, notes: [[0, 987.8, 0.2, 0.06], [0.1, 1480, 0.3, 0.06]] }
  };

  /* synthCue(sampleRate, kind) -> Float32Array of a mono sound */
  VS.synthCue = function (sampleRate, kind) {
    var r = RECIPES[kind] || RECIPES.reflection;
    var data = new Float32Array(Math.round(r.len * sampleRate));
    r.notes.forEach(function (nt) { note(data, sampleRate, nt[0], nt[1], nt[2], nt[3]); });
    return data;
  };

  VS.CUE_KINDS = Object.keys(RECIPES);

  /*
    loadCues(ctx) -> Promise of { prompt: AudioBuffer, reflection, task, goal, promptSource, savedSource }
    Uses your chosen files when present, otherwise the built-in tones.
  */
  VS.loadCues = function (ctx) {
    function synth(kind) {
      var d = VS.synthCue(ctx.sampleRate, kind), b = ctx.createBuffer(1, d.length, ctx.sampleRate);
      b.getChannelData(0).set(d);
      return b;
    }
    function fromStore(key) {
      return VS.fileStore.load(key).then(function (saved) {
        if (!saved || !saved.data) { return null; }
        return ctx.decodeAudioData(saved.data.slice(0)).then(function (buf) { return { buf: buf, name: saved.name }; }, function () { return null; });
      });
    }
    return Promise.all([fromStore('prompt-cue'), fromStore('saved-cue'), fromStore('record-cue')]).then(function (got) {
      var out = { reflection: synth('reflection'), task: synth('task'), goal: synth('goal'), prompt: synth('prompt'), record: synth('record') };
      out.recordSource = 'the built-in soft rise';
      if (got[2]) { out.record = got[2].buf; out.recordSource = 'your file "' + got[2].name + '"'; }
      out.promptSource = 'the built-in soft cue';
      out.savedSource = 'the built-in tiny tones';
      if (got[0]) { out.prompt = got[0].buf; out.promptSource = 'your file "' + got[0].name + '"'; }
      if (got[1]) { out.reflection = out.task = out.goal = got[1].buf; out.savedSource = 'your file "' + got[1].name + '"'; }
      return out;
    });
  };

  // Situations that are questions, so they get the question cue first.
  VS.QUESTION_SITUATIONS = ['opener-open', 'opener-goal', 'opener-resurface', 'plan', 'plan-pin', 'reflect', 'closer', 'dissect', 'self-assure', 'opine', 'exit'];
})(typeof window !== 'undefined' ? window : globalThis);
