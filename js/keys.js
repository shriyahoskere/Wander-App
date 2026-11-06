/*
  keys.js - where the ElevenLabs API key comes from.

  What it is for: you keep your keys in a .env file on your Mac, as the original brief asked:
      ELEVENLABS_API_KEY=your-key-here
      ANTHROPIC_API_KEY=your-other-key-here   (optional: lets Claude sort your thoughts)
  When you start working, you pick that file once with the "Load .env" button. The page reads
  the key and keeps it in memory only: it is never saved in the browser, never shown, never
  written to the logs, and it is gone when you close or reload the tab.

  How it fits: transcription (stt-elevenlabs.js) and the voice (tts-elevenlabs.js) ask
  VS.keys.get(cfg) for the key whenever they need it.
*/
(function (root) {
  var VS = root.VS = root.VS || {};
  var NAMES = ['ELEVENLABS_API_KEY', 'ELEVEN_LABS_API_KEY', 'ELEVENLABS_KEY', 'XI_API_KEY'];
  var CLAUDE_NAMES = ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY', 'ANTHROPIC_KEY'];

  function readAll(text) {
    var found = {};
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || /^\s*#/.test(line)) { return; }
      var v = m[2];
      if (/^".*"$/.test(v) || /^'.*'$/.test(v)) { v = v.slice(1, -1); } else { v = v.replace(/\s+#.*$/, ''); }
      found[m[1].toUpperCase()] = v.trim();
    });
    return found;
  }
  function first(found, names) { for (var i = 0; i < names.length; i++) { if (found[names[i]]) { return found[names[i]]; } } return ''; }

  /* Read a key out of .env text. Returns { ok, key, name, message }. */
  VS.parseEnv = function (text) {
    var lines = String(text || '').split(/\r?\n/), found = {};
    lines.forEach(function (line) {
      var m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || /^\s*#/.test(line)) { return; }
      var v = m[2];
      if (/^".*"$/.test(v) || /^'.*'$/.test(v)) { v = v.slice(1, -1); }
      else { v = v.replace(/\s+#.*$/, ''); } // an unquoted value may end with a comment
      found[m[1].toUpperCase()] = v.trim();
    });
    for (var i = 0; i < NAMES.length; i++) {
      if (found[NAMES[i]]) { return { ok: true, key: found[NAMES[i]], name: NAMES[i] }; }
    }
    return { ok: false, message: 'No ElevenLabs key found. The file needs a line like ELEVENLABS_API_KEY=your-key-here' };
  };

  var mem = null, claude = null;
  VS.keys = {
    /* The key to use: get(cfg) for ElevenLabs, get(cfg, 'anthropic') for Claude. */
    get: function (cfg, which) {
      if (which === 'anthropic') { return claude ? claude.key : ''; }
      if (mem) { return mem.key; }
      try { return String((cfg && cfg.get('elevenLabsApiKey')) || ''); } catch (e) { return ''; }
    },
    /* Load from the text of a .env file. Returns { ok, message }. Either key is enough. */
    loadEnv: function (text, fileName) {
      var r = VS.parseEnv(text);
      var c = first(readAll(text), CLAUDE_NAMES);
      if (!r.ok && !c) { return { ok: false, message: 'No ElevenLabs or Anthropic key found. The file needs a line like ELEVENLABS_API_KEY=your-key-here' }; }
      var file = fileName || '.env', parts = [];
      if (r.ok) { mem = { key: r.key, file: file, name: r.name }; parts.push('ElevenLabs (ends in ' + r.key.slice(-4) + ')'); }
      if (c) { claude = { key: c, file: file }; parts.push('Anthropic (ends in ' + c.slice(-4) + ')'); }
      return { ok: true, message: 'Loaded from ' + file + ' for this session only: ' + parts.join(' and ') + '.' };
    },
    forget: function () { mem = null; claude = null; },
    loaded: function () { return mem ? { file: mem.file, ending: mem.key.slice(-4) } : null; },
    claudeLoaded: function () { return claude ? { file: claude.file, ending: claude.key.slice(-4) } : null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
