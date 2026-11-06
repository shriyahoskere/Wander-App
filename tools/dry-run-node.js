/*
  dry-run-node.js - OPTIONAL developer shortcut: run the dry-run simulator in a terminal.
  You do not need this. The page index.html does the same thing in the browser.
  Usage (only if you ever install Node): node tools/dry-run-node.js samples-file.txt
  With no file name it runs the built-in sample named "basic".
*/
var fs = require('fs');
var path = require('path');
['util', 'clock', 'config', 'commands', 'rules', 'situations', 'wording', 'chooser', 'engine', 'narrate', 'dryrun'].forEach(function (f) { require(path.join('..', 'js', f + '.js')); });
require('../clips/clips.js');
require('../samples/samples.js');
var VS = globalThis.VS;
var file = process.argv[2];
var text = file ? fs.readFileSync(file, 'utf8') : VS.SAMPLES[process.argv[3] || 'basic'].text;
var res = VS.runDry(text);
res.errors.forEach(function (e) { console.log('! ' + e); });
res.lines.forEach(function (l) { console.log((l.kind === 'speech' ? '    ' : '') + l.line); });
