/*
  run-node.js - runs all the tests in a terminal. OPTIONAL: you do not need it.
  The same tests (plus the audio ones, which need a browser) run by opening tests/tests.html.
*/
var path = require('path');
var root = path.join(__dirname, '..');
['util', 'clock', 'config', 'commands', 'rules', 'situations', 'wording', 'chooser', 'engine', 'narrate', 'dryrun', 'loop', 'ocean-synth', 'vad', 'audio-mixer', 'keys', 'pcm', 'stt-elevenlabs', 'stt-chrome', 'stt', 'cues', 'tts-elevenlabs', 'seascape', 'cards', 'extract-prompt', 'nlp', 'extract-claude', 'outcomes', 'accurate'].forEach(function (f) { require(path.join(root, 'js', f + '.js')); });
require(path.join(root, 'clips', 'clips.js'));
require(path.join(root, 'samples', 'samples.js'));
['harness', 'rig', 'test-engine', 'test-parts', 'test-audio', 'test-audio-browser', 'test-stt', 'test-wording', 'test-voice', 'test-sea', 'test-extract', 'test-accurate'].forEach(function (f) { require(path.join(__dirname, f + '.js')); });

globalThis.VS.runAll().then(function (results) {
  var failed = 0;
  results.forEach(function (r) { if (!r.pass) { failed++; console.log('FAIL  ' + r.name + '\n      ' + r.error); } });
  console.log(results.length - failed + ' passed, ' + failed + ' failed, ' + results.length + ' total (audio tests that need a browser are skipped here)');
  process.exit(failed ? 1 : 0);
});
