/*
  config.js - every setting in one place.

  What it is for: all timing, audio and behaviour numbers live here, never inside the
  logic. Each setting has a default, a plain-English description and limits, so the
  settings panel on the page can be built from this list automatically.

  How it fits: the engine, command matcher and rules ask the config for a value at the
  moment they need it (they never keep a copy), so changing a setting takes effect
  straight away. That is the "hot reload". In the browser, changes are saved in the
  browser's local storage so they survive a refresh.
*/
(function (root) {
  var VS = root.VS = root.VS || {};

  var G_TIMING = 'Timing: when the system may speak';
  var G_CMD = 'Snooze, stop and scratch';
  var G_OCEAN = 'Ocean sound';
  var G_MIC = 'Microphone and voice detection';
  var G_VOICE = 'Voice';
  var G_STT = 'Transcription (turning your speech into words)';
  var G_BEHAVE = 'What the system is allowed to do';
  var G_LISTS = 'Word lists the rules use';
  var G_COMMANDS = 'Voice command phrases';
  var G_DRY = 'Dry-run simulator';
  var G_SEA = 'The water on screen';
  var G_SORT = 'Sorting your thoughts after a session';

  var SCHEMA = [];
  function def(key, type, d, group, help, extra) {
    var o = { key: key, type: type, def: d, group: group, help: help };
    if (extra) { for (var k in extra) { o[k] = extra[k]; } }
    SCHEMA.push(o);
  }

  // ---- Timing ----
  // Calm-technology rule: every wait before the system may speak is at least one full minute.
  // People need time to collect a thought, process it, and then say it. The minimums enforce that.
  var MIN_WAIT = { min: 60000, max: 1800000 };
  def('openerSilenceMs', 'number', 60000, G_TIMING, 'Silence at the start of a session before the system offers its one opener (ms). At least one minute.', MIN_WAIT);
  def('followUpSilenceMs', 'number', 60000, G_TIMING, 'How long after a finished sentence the system waits before it may follow up (ms). Counted from when the pause is confirmed. At least one minute.', MIN_WAIT);
  def('incompleteSilenceMs', 'number', 90000, G_TIMING, 'Longer wait after a sentence that ended on "and", "because", "um" and similar (ms).', MIN_WAIT);
  def('selfQuestionSilenceMs', 'number', 90000, G_TIMING, 'Wait after a question you asked yourself. The system never answers it, but the timer is extended (ms).', MIN_WAIT);
  def('backoffAfterUnansweredMs', 'number', 90000, G_TIMING, 'After the system speaks and gets no answer, how long it waits before anything else (ms). At least one minute.', MIN_WAIT);
  def('endOfSpeechBufferMs', 'number', 1000, G_TIMING, 'A breath shorter than this is not a pause. The silence clock starts only after it (ms).', { min: 100, max: 10000 });
  def('topicBoundaryMs', 'number', 120000, G_TIMING, 'If you stay silent this long and then speak again, that starts a new thought (ms). Two minutes, so a long think stays part of the same thought.', { min: 10000, max: 1800000 });
  def('clipWatchdogMs', 'number', 15000, G_TIMING, 'Safety net: if a clip never reports that it finished, assume it did after this long (ms).', { min: 2000, max: 120000 });

  def('oceanReturnDelayMs', 'number', 2000, G_TIMING, 'How long you must be quiet before the ocean starts rising back (ms). It then rises gradually (duckReleaseMs), so it is fully back by the time the soft sound plays. An early test found a 1 s return felt like a nudge, so keep this above 1 s.', { min: 500, max: 30000 });
  def('thoughtSavedDelayMs', 'number', 5000, G_TIMING, 'After a finished sentence, this much quiet means the thought is complete and it is saved, with a tiny sound (ms). Unfinished sentences wait for the full wait.', { min: 1000, max: 60000 });

  // ---- Snooze, stop, scratch ----
  def('snoozeDefaultMin', 'number', 20, G_CMD, 'How long "snooze" lasts when you do not say a number (minutes).', { min: 1, max: 600 });
  def('stopUndoMs', 'number', 10000, G_CMD, 'After "stop", how long "resume" can still undo it (ms).', { min: 0, max: 120000 });
  def('scratchDefaultMin', 'number', 3, G_CMD, 'How much "scratch that" removes when you do not say a number (minutes).', { min: 1, max: 600 });
  def('maxConsecutiveUnansweredPrompts', 'number', 2, G_CMD, 'After this many unanswered prompts in a row, the system offers a snooze once and goes quiet.', { min: 1, max: 10 });
  def('sessionTimeoutMin', 'number', 0, G_CMD, 'Automatically stop the session after this many minutes. 0 means never.', { min: 0, max: 1440 });

  // ---- Ocean ----
  def('oceanGain', 'number', 0.6, G_OCEAN, 'Normal ocean volume, 0 to 1.', { min: 0, max: 1 });
  def('duckGain', 'number', 0.05, G_OCEAN, 'Ocean volume while you are speaking, 0 to 1. Near silent.', { min: 0, max: 1 });
  def('duckAttackMs', 'number', 200, G_OCEAN, 'How fast the ocean turns down when you start speaking (ms).', { min: 10, max: 5000 });
  def('duckReleaseMs', 'number', 3000, G_OCEAN, 'How gradually the ocean comes back after you stop. This rising sound is the "I heard you" signal (ms).', { min: 100, max: 30000 });
  def('clipDuckGain', 'number', 0.35, G_OCEAN, 'Ocean volume while a system voice clip is playing, 0 to 1.', { min: 0, max: 1 });

  def('oceanFadeInMs', 'number', 3000, G_OCEAN, 'How long the ocean takes to fade in when a session starts or a snooze ends (ms).', { min: 100, max: 30000 });
  def('oceanFadeOutMs', 'number', 3000, G_OCEAN, 'How long the ocean takes to fade out on snooze or stop (ms).', { min: 100, max: 30000 });
  def('oceanLoopCrossfadeMs', 'number', 3000, G_OCEAN, 'Length of the blend where the end of the ocean recording melts into its start, so the loop has no click or gap (ms).', { min: 100, max: 20000 });
  def('clipFadeOutMs', 'number', 150, G_OCEAN, 'How fast a system clip fades out when you start speaking over it (ms).', { min: 10, max: 2000 });

  def('promptCueEnabled', 'boolean', true, G_OCEAN, 'Play a soft cue just before the system asks a question.');
  def('promptCueFor', 'choice', 'questions', G_OCEAN, 'Which lines get the cue first: questions only (not "Mm." or "Go on."), or all spoken lines.', { options: ['questions', 'all'] });
  def('promptCueGapMs', 'number', 700, G_OCEAN, 'Pause between the cue and the spoken line (ms).', { min: 0, max: 5000 });
  def('savedCueEnabled', 'boolean', false, G_OCEAN, 'Also play a tiny tone each time a thought is saved (off: only your after-you-speak sound plays).');
  def('pauseCueEnabled', 'boolean', true, G_OCEAN, 'After you finish speaking and stay quiet for pauseCueAfterMs, play your after-you-speak sound (the file you chose, or the built-in one). Nothing plays when you start speaking.');
  def('pauseCueAfterMs', 'number', 5000, G_OCEAN, 'How long you must be quiet after speaking before the soft sound plays (ms).', { min: 1000, max: 60000 });
  def('cueVolume', 'number', 0.5, G_OCEAN, 'Volume of the cue and the saved sound, 0 to 1.', { min: 0, max: 1 });
  def('boatEveryWords', 'number', 40, G_SEA, 'A paper boat sails in each time a thought is captured, and also after every this many words you say. 0 means boats only for captured thoughts.', { min: 0, max: 1000 });
  def('showBoats', 'boolean', false, G_SEA, 'Show paper boats (and their tags) sailing in on the water as thoughts are captured.');
  def('maxBoats', 'number', 10, G_SEA, 'The most boats on the water at once.', { min: 1, max: 20 });
  def('tagShowMs', 'number', 5000, G_SEA, 'How long the tag over a new boat ("converted to a task", "set a goal", "added to reflections") stays on screen, in ms.', { min: 1000, max: 30000 });
  def('liveKindsByNlp', 'boolean', true, G_SORT, 'While you speak, let the language processor choose each thought\'s tag from all six kinds (task, goal, reflection, concept, story, quote) instead of the simple word lists.');
  def('extractionEngine', 'choice', 'auto', G_SORT, 'Who sorts the transcript when you save. auto: Claude if an Anthropic key is in your .env file, otherwise the offline language processor. claude: Claude only. nlp: the offline language processor only. off: no sorting.', { options: ['auto', 'claude', 'nlp', 'off'] });
  def('claudeModel', 'choice', 'claude-sonnet-5-5', G_SORT, 'Which Claude model reads your transcript with your extraction prompt.', { options: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'] });
  def('anthropicApiBase', 'text', 'https://api.anthropic.com', G_SORT, 'Where Claude is reached. Leave as it is.');
  def('passageGapMs', 'number', 6000, G_SORT, 'For the offline language processor: a silence this long (ms) between stretches of speech starts a new passage.', { min: 1000, max: 120000 });
  def('calmWaveHeight', 'number', 0.28, G_SEA, 'How high the waves are while you are speaking, before your voice moves them (0 is flat, 1 is the same as when you are quiet).', { min: 0, max: 1 });
  def('waveReactivity', 'number', 1, G_SEA, 'How much sound moves the waves: your voice while you speak, the ocean while you are quiet. 0 turns it off, 2 doubles it.', { min: 0, max: 2 });

  // ---- Microphone and voice detection ----
  def('vadOnsetDb', 'number', 12, G_MIC, 'How far above the room noise a sound must be to count as speech starting (dB). Lower = more sensitive.', { min: 4, max: 40 });
  def('vadOffsetDb', 'number', 7, G_MIC, 'How far above the room noise the sound must stay to count as still speaking (dB). Must be lower than the onset value.', { min: 2, max: 30 });
  def('vadMinOnsetMs', 'number', 60, G_MIC, 'How long the sound must stay loud before it counts as speech (ms). Keeps clicks and taps from ducking the ocean.', { min: 20, max: 500 });
  def('vadHangoverMs', 'number', 500, G_MIC, 'How long it must be quiet before speech counts as stopped (ms). Short gaps between words are bridged. The system backdates the stop, so your wait is still counted from the real moment you went quiet.', { min: 100, max: 3000 });
  def('vadMinLevelDb', 'number', -55, G_MIC, 'Quietest level that can ever count as speech (dB below full scale). Raise it if a very quiet room still triggers.', { min: -80, max: -20 });
  def('vadCalibrationMs', 'number', 600, G_MIC, 'At the start, the system listens this long to learn how noisy the room is. Stay quiet for this moment (ms).', { min: 200, max: 5000 });
  def('vadClipGateDb', 'number', 10, G_MIC, 'While the system is speaking, speech detection becomes this much less sensitive, so its own voice does not trigger it (dB). Headphones work much better.', { min: 0, max: 30 });
  def('vadStuckNoiseMs', 'number', 120000, G_MIC, 'If something very steady (a fan, a hum) keeps the detector "speaking" this long, it learns that sound as room noise and carries on (ms).', { min: 10000, max: 1800000 });
  def('micEchoCancellation', 'boolean', true, G_MIC, 'Ask the browser to remove the sound coming out of your speakers from the microphone signal.');
  def('micNoiseSuppression', 'boolean', true, G_MIC, 'Ask the browser to reduce steady background noise.');

  // ---- Transcription (speech-to-text) ----
  def('sttProvider', 'choice', 'elevenlabs', G_STT, 'Who turns your speech into words: elevenlabs (needs your API key), chrome (free, built into Chrome; your audio goes to Google), or off.', { options: ['elevenlabs', 'chrome', 'off'] });
  def('elevenLabsApiKey', 'secret', '', G_STT, 'Not used: the key now comes from your .env file and stays in memory only.', { hidden: true });
  def('sttLanguage', 'text', 'en', G_STT, 'Language code, for example "en". Setting it is more accurate than letting the service guess the language from a few words. Leave empty to let it detect the language.');
  def('sttPreRollMs', 'number', 800, G_STT, 'Sound kept from just before speech was detected, so your first word is not clipped (ms).', { min: 0, max: 3000 });
  def('sttPostRollMs', 'number', 600, G_STT, 'Sound still sent after you stop, before the words are finalised, so the end of your last word is not cut off (ms).', { min: 0, max: 3000 });
  def('sttKeyterms', 'text', '', G_STT, 'Words to listen for: names and terms it keeps getting wrong, separated by commas. The live transcription uses up to 50 (20 letters each); the accurate pass up to 1000. ElevenLabs charges about 20% more when this is used.');
  def('sttFilterBackground', 'boolean', true, G_STT, 'Ask ElevenLabs to ignore background sound and other voices (helps with the ocean playing).');
  def('sttAccuratePass', 'boolean', true, G_STT, 'When you save, transcribe the whole session again with the more accurate (not live) model, and use that for sorting and "What you said". The audio is kept in memory only until then.');
  def('accuratePassModel', 'text', 'scribe_v2', G_STT, 'The ElevenLabs model for the accurate pass.');
  def('accuratePassMaxMinutes', 'number', 90, G_STT, 'Longest session kept in memory for the accurate pass (minutes).', { min: 5, max: 240 });
  def('sttIdleCloseMs', 'number', 60000, G_STT, 'Close the ElevenLabs connection after this much silence; it reopens when you speak (ms). Saves money in long sessions.', { min: 10000, max: 600000 });
  def('sttCommitTimeoutMs', 'number', 10000, G_STT, 'If no words come back this long after you stop speaking, give up on that bit (ms).', { min: 2000, max: 60000 });
  def('elevenLabsApiBase', 'text', 'https://api.elevenlabs.io', G_STT, 'Advanced: the ElevenLabs web address. Leave as it is.');
  def('elevenLabsWsBase', 'text', 'wss://api.elevenlabs.io', G_STT, 'Advanced: the ElevenLabs live connection address. Leave as it is.');

  // ---- Voice ----
  def('useElevenLabsVoice', 'boolean', true, G_VOICE, 'Speak every line in your ElevenLabs voice (needs your .env key loaded). If it fails, the Mac\'s built-in voice is used instead.');
  def('voiceId', 'text', 'U9VgC8Xinl7nnNsyDd3J', G_VOICE, 'The ElevenLabs voice ID. It must be in "My Voices" in your ElevenLabs account.');
  def('ttsModel', 'choice', 'eleven_multilingual_v2', G_VOICE, 'Which ElevenLabs model makes the speech. eleven_multilingual_v2 is steady and calm; eleven_v4 is newer and more expressive; the turbo and flash models are faster but lines are prepared ahead anyway.', { options: ['eleven_multilingual_v2', 'eleven_v4', 'eleven_v4_turbo', 'eleven_v3', 'eleven_flash_v2_5'] });
  def('voiceStability', 'number', 0.8, G_VOICE, 'Higher = steadier, flatter delivery. 0 to 1.', { min: 0, max: 1 });
  def('voiceSimilarity', 'number', 0.75, G_VOICE, 'How closely to stick to the original voice. 0 to 1.', { min: 0, max: 1 });
  def('voiceStyle', 'number', 0, G_VOICE, 'Style exaggeration. Keep near 0 for a calm voice. 0 to 1.', { min: 0, max: 1 });
  def('voiceSpeed', 'number', 0.9, G_VOICE, 'Speaking speed; slightly under 1 sounds calmer. 0.7 to 1.2.', { min: 0.7, max: 1.2 });
  def('ttsPrepareAhead', 'boolean', true, G_VOICE, 'When a session starts, make every line in the voice ahead of time (once; they are kept in this browser), so each plays instantly.');

  def('useStandInVoice', 'boolean', true, G_VOICE, 'Backup: use the Mac\'s built-in voice when the ElevenLabs voice is off or fails.');
  def('standInVoiceName', 'text', '', G_VOICE, 'Backup voice: name of the built-in voice to use, for example "Karen" or "Daniel". Leave empty to pick an English one automatically.');
  def('standInRate', 'number', 0.85, G_VOICE, 'Backup voice speaking speed. Slightly under 1 sounds calmer.', { min: 0.5, max: 1.5 });

  // ---- Behaviour ----
  def('condition', 'choice', 'fullPrompt', G_BEHAVE, 'Which version of the experience: fullPrompt (normal), backchannelOnly (only soft "go on" style lines), silenceOnly (never speaks on its own).', { options: ['fullPrompt', 'backchannelOnly', 'silenceOnly'] });
  def('narrate', 'boolean', true, G_BEHAVE, 'Print the plain-English running commentary of what the system is doing and why.');

  // ---- Word lists ----
  def('incompleteEndings', 'list', ['and', 'because', 'that', 'so', 'but', 'or', 'if', 'which', 'when', 'then', 'to'], G_LISTS, 'If a sentence ends on one of these words, it is probably unfinished.');
  def('fillerWords', 'list', ['um', 'uh', 'oh', 'er', 'erm', 'hmm'], G_LISTS, 'If speech ends on one of these, treat it as unfinished.');
  def('selfQuestionPatterns', 'list', [
    '^(what|where|how|why|when|which)( else| other)? (did|do|was|am|should|could|would|can|will|have|had|might) (i|we)\\b',
    '^(am i|do i|did i|should i|could i|can i|have i|was i|what if i|what else|why am i|why do i|why did i)\\b',
    '\\b(did i forget|what was i saying|where was i)\\b'
  ], G_LISTS, 'Patterns (regular expressions) for a question you ask yourself, which the system must never answer.');
  def('selfResolvingPhrases', 'list', ["i think i'll just", "i'll just", 'i just need to', 'i just have to', "i'm just going to", "i guess i'll just", 'i should just', "i'll start with", "maybe i'll just", "i'll start by"], G_LISTS, 'Phrases where you answered or decided something yourself. The system may offer to pin it as a task.');
  def('planPhrases', 'list', ['i need to', 'i have to', 'i should', "i'm going to", 'i want to', "i've got to", 'i gotta', 'make a list', 'get started', 'to do', 'plan to', 'supposed to', 'deadline', 'tomorrow', 'next week', 'this weekend'], G_LISTS, 'Phrases that suggest a plan or task.');
  def('goalPhrases', 'list', ['my goal', 'goal is', "i'd love to", 'i hope to', "i'm aiming", 'i aim to', 'this year', 'by the end of', 'one day', 'long term', 'eventually', 'i want to become', 'i want to get better', 'i want to be', 'in the future'], G_LISTS, 'Phrases that mark a thought as a goal (checked before tasks). Used for the captured list.');
  def('closerPhrases', 'list', ["that's it", "that's all", "that's everything", "i'm done", 'all done', 'that covers it', 'nothing else', 'anyway'], G_LISTS, 'Phrases that suggest the thought is clearly finished.');
  def('emotionalWords', 'list', ['overwhelmed', 'anxious', 'stressed', 'sad', 'scared', 'lonely', 'exhausted', 'burnt out', 'burned out', 'crying', 'frustrated', 'upset', 'worried', 'terrified', 'panicking', 'ashamed', 'embarrassed', 'angry', 'heartbroken'], G_LISTS, 'Words that suggest an emotional moment. The system then only uses a soft backchannel.');
  def('heavyWords', 'list', ['hopeless', 'worthless', 'hate myself', 'want to die', 'end it all', 'no point', "can't go on", "can't keep this up", 'failing at', 'falling apart', 'give up on everything', "don't want to be here"], G_LISTS, 'Words that suggest something heavy. Same soft handling, and the thought is marked sensitive.');
  def('sensitivePhrases', 'list', ["i'm so stupid", "i'm stupid", "i'm useless", "i'm a failure", "i'm pathetic", 'my fault', 'hate myself', "i can't do anything right", 'nobody likes me'], G_LISTS, 'Self-critical or private lines. These are marked sensitive: never resurfaced, never quoted back.');

  // ---- Voice command phrases ----
  def('commandMaxWords', 'number', 4, G_COMMANDS, 'A command must be the whole utterance and no longer than this many words. Commands with a number ("snooze for ten minutes") may be two words longer.', { min: 1, max: 10 });
  def('commandVariants', 'json', {
    snooze: ['snooze', 'snooze please', 'snooze now'],
    stop: ['stop', 'stop please', 'stop session', 'end session', 'stop recording'],
    resume: ['resume', 'resume session', 'start', 'start session', 'i am back', "i'm back"],
    scratch: ['scratch that', 'scratch it', 'scratch this', 'delete that']
  }, G_COMMANDS, 'The exact phrases that count as each command. Edit as JSON.');

  // ---- Dry-run ----
  def('dryRunPauseMs', 'number', 3000, G_DRY, 'How long a [pause] tag lasts in a dry-run transcript (ms).', { min: 100, max: 1800000 });
  def('dryRunLongPauseMs', 'number', 100000, G_DRY, 'How long a [long pause] tag lasts (ms). 100 s, longer than any wait, so the system gets the chance to speak.', { min: 100, max: 1800000 });
  def('dryRunGapMs', 'number', 600, G_DRY, 'Natural gap between two lines with no tag between them (ms). Shorter than the end-of-speech buffer, so it counts as a breath.', { min: 0, max: 10000 });
  def('dryRunWordsPerSecond', 'number', 2.5, G_DRY, 'How fast the pretend speaker talks.', { min: 0.5, max: 8 });
  def('dryRunSttLagMs', 'number', 300, G_DRY, 'Delay between you finishing a sentence and the transcript arriving (ms).', { min: 0, max: 5000 });
  def('dryRunClipMs', 'number', 3000, G_DRY, 'How long a system clip takes to play in a dry run (ms).', { min: 200, max: 15000 });

  VS.CONFIG_SCHEMA = SCHEMA;

  function entryFor(key) {
    for (var i = 0; i < SCHEMA.length; i++) { if (SCHEMA[i].key === key) return SCHEMA[i]; }
    return null;
  }

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  // Check a new value and turn it into the right type. Throws a plain-English error if it is not allowed.
  function coerce(entry, value) {
    var k = entry.key, v = value;
    if (entry.type === 'number') {
      if (typeof v === 'string') { v = parseFloat(v); }
      if (typeof v !== 'number' || !isFinite(v)) { throw new Error(k + ' needs a number.'); }
      if (v < entry.min || v > entry.max) { throw new Error(k + ' must be between ' + entry.min + ' and ' + entry.max + '.'); }
      return v;
    }
    if (entry.type === 'boolean') {
      if (v === true || v === 'true') { return true; }
      if (v === false || v === 'false') { return false; }
      throw new Error(k + ' must be true or false.');
    }
    if (entry.type === 'choice') {
      if (entry.options.indexOf(v) < 0) { throw new Error(k + ' must be one of: ' + entry.options.join(', ') + '.'); }
      return v;
    }
    if (entry.type === 'list') {
      if (typeof v === 'string') { v = v.split(/[\n,]+/); }
      if (!Array.isArray(v)) { throw new Error(k + ' needs a list.'); }
      return v.map(function (x) { return String(x).trim(); }).filter(function (x) { return x.length > 0; });
    }
    if (entry.type === 'json') {
      if (typeof v === 'string') {
        try { v = JSON.parse(v); } catch (e) { throw new Error(k + ' is not valid JSON.'); }
      }
      if (!v || typeof v !== 'object' || Array.isArray(v)) { throw new Error(k + ' needs a JSON object.'); }
      return v;
    }
    return String(v);
  }

  /*
    createConfig(storage, storageKey)
    storage is optional: anything with getItem/setItem (the browser's localStorage fits).
    Without it, settings simply live in memory (that is what tests use).
  */
  VS.createConfig = function (storage, storageKey) {
    var key = storageKey || 'voice-space-config-v1';
    var values = {}, overrides = {}, listeners = [];

    function load() {
      var i;
      values = {}; overrides = {};
      for (i = 0; i < SCHEMA.length; i++) { values[SCHEMA[i].key] = clone(SCHEMA[i].def); }
      if (!storage) { return; }
      try {
        var raw = storage.getItem(key);
        var saved = raw ? JSON.parse(raw) : {};
        for (var k in saved) {
          var e = entryFor(k);
          if (e) { try { values[k] = coerce(e, saved[k]); overrides[k] = values[k]; } catch (err) { /* ignore a bad saved value */ } }
        }
      } catch (err2) { /* storage unavailable or corrupted: use defaults */ }
    }

    function save() {
      if (!storage) { return; }
      try { storage.setItem(key, JSON.stringify(overrides)); } catch (err) { /* storage full or blocked */ }
    }

    function notify(changedKey) {
      for (var i = 0; i < listeners.length; i++) { listeners[i](changedKey, values[changedKey]); }
    }

    load();

    return {
      get: function (k) {
        if (!(k in values)) { throw new Error('Unknown setting: ' + k); }
        return values[k];
      },
      set: function (k, v) {
        var e = entryFor(k);
        if (!e) { throw new Error('Unknown setting: ' + k); }
        var c = coerce(e, v);
        values[k] = c;
        if (JSON.stringify(c) === JSON.stringify(e.def)) { delete overrides[k]; } else { overrides[k] = c; }
        save();
        notify(k);
        return c;
      },
      reset: function (k) {
        var e = entryFor(k);
        if (!e) { throw new Error('Unknown setting: ' + k); }
        values[k] = clone(e.def);
        delete overrides[k];
        save();
        notify(k);
      },
      resetAll: function () {
        load(); overrides = {}; save(); notify('*');
      },
      reload: function () { load(); notify('*'); },
      all: function () { return clone(values); },
      isChanged: function (k) { return k in overrides; },
      describe: function () { return SCHEMA; },
      onChange: function (fn) {
        listeners.push(fn);
        return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
      }
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
