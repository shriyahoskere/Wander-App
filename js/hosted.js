/*
  hosted.js - lets the hosted site (Netlify) use keys kept on Netlify instead of a .env file.

  What it is for: when the page is opened from the web and the site has the Wander function
  (netlify/edge-functions/wander-api.js), the page asks it which keys the site holds. If it holds
  them, you don't need to load a .env: requests to ElevenLabs and Anthropic go through the site,
  which adds the key. The page itself never sees the key. If the site has a passcode, you type it
  once in Sound and voice; it is remembered in this browser (the passcode only, never a key).

  A .env you load still wins: if you load one, the page talks to ElevenLabs and Anthropic directly.
  Opened as a file from your Mac, none of this runs.

  The live transcription connection still goes straight to ElevenLabs: the site only hands out the
  one-time pass for it.
*/
(function (root) {
  var VS = root.VS = root.VS || {};
  var MARK = 'hosted-by-site';
  var PASS_KEY = 'wander.sitePasscode';
  var state = { on: false, eleven: false, anthropic: false, passcode: false, passOk: true, checked: false };
  VS.hosted = state;

  function readPass() { try { return root.localStorage.getItem(PASS_KEY) || ''; } catch (e) { return ''; } }
  function writePass(v) { try { if (v) { root.localStorage.setItem(PASS_KEY, v); } else { root.localStorage.removeItem(PASS_KEY); } } catch (e) { /* private window */ } }
  function announce() { try { root.dispatchEvent(new Event('wander-hosted')); } catch (e) { /* old browser */ } }

  if (!VS.keys || typeof root.fetch !== 'function' || !/^https?:$/.test(root.location ? root.location.protocol : '')) { return; }

  // Keys: use the site's when no .env has been loaded.
  var keys = VS.keys, origGet = keys.get, origLoaded = keys.loaded, origClaude = keys.claudeLoaded;
  keys.get = function (cfg, which) {
    var own = origGet.call(keys, cfg, which);
    if (own) { return own; }
    if (!state.on || !state.passOk) { return ''; }
    return (which === 'anthropic' ? state.anthropic : state.eleven) ? MARK : '';
  };
  keys.loaded = function () { return origLoaded.call(keys) || (state.on && state.passOk && state.eleven ? { file: 'this site', ending: '', site: true } : null); };
  keys.claudeLoaded = function () { return origClaude.call(keys) || (state.on && state.passOk && state.anthropic ? { file: 'this site', ending: '', site: true } : null); };
  keys.ownLoaded = function () { return !!(origLoaded.call(keys) || origClaude.call(keys)); };

  // Requests carrying the stand-in key go through the site instead.
  var realFetch = root.fetch.bind(root);
  function headerOf(h, name) {
    if (!h) { return ''; }
    if (typeof h.get === 'function') { return h.get(name) || ''; }
    var found = ''; Object.keys(h).forEach(function (k) { if (k.toLowerCase() === name) { found = h[k]; } });
    return found;
  }
  function strip(h, names) {
    var out = {};
    if (typeof h.forEach === 'function' && typeof h.get === 'function') { h.forEach(function (v, k) { out[k] = v; }); } else { Object.keys(h || {}).forEach(function (k) { out[k] = h[k]; }); }
    Object.keys(out).forEach(function (k) { if (names.indexOf(k.toLowerCase()) >= 0) { delete out[k]; } });
    out['x-wander-pass'] = readPass();
    return out;
  }
  root.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var h = init && init.headers;
    var m = /^https:\/\/api\.elevenlabs\.io(\/.*)$/.exec(url);
    if (m && headerOf(h, 'xi-api-key') === MARK) {
      return realFetch('/api/eleven' + m[1], Object.assign({}, init, { headers: strip(h, ['xi-api-key']) }));
    }
    m = /^https:\/\/api\.anthropic\.com(\/v1\/messages)$/.exec(url);
    if (m && headerOf(h, 'x-api-key') === MARK) {
      return realFetch('/api/anthropic' + m[1], Object.assign({}, init, { headers: strip(h, ['x-api-key', 'anthropic-dangerous-direct-browser-access']) })).then(function (r) {
        if (r.headers.get('x-wander-wrapped') !== '1') { return r; }
        return r.text().then(function (t) {
          var o; try { o = JSON.parse(t); } catch (e) { o = { status: 502, body: '{"error":{"message":"The site sent back something unreadable."}}' }; }
          return new Response(o.body, { status: o.status, headers: { 'content-type': 'application/json' } });
        });
      });
    }
    return realFetch(input, init);
  };

  /* Ask the site what it holds. Resolves to the state. */
  VS.hostedCheck = function () {
    return realFetch('/api/wander/status', { headers: { 'x-wander-pass': readPass() }, cache: 'no-store' }).then(function (r) {
      if (!r.ok || (r.headers.get('content-type') || '').indexOf('json') < 0) { throw new Error('no function'); }
      return r.json();
    }).then(function (o) {
      state.on = !!(o.eleven || o.anthropic); state.eleven = !!o.eleven; state.anthropic = !!o.anthropic;
      state.passcode = !!o.passcode; state.passOk = !!o.passOk; state.checked = true;
      announce(); return state;
    }, function () { state.on = false; state.checked = true; announce(); return state; });
  };
  VS.hostedSetPass = function (v) { writePass(String(v || '').trim()); return VS.hostedCheck(); };
  VS.hostedForgetPass = function () { writePass(''); return VS.hostedCheck(); };
  VS.hostedCheck();
})(typeof window !== 'undefined' ? window : globalThis);
