/*
  wander-api.js - a Netlify Edge Function that keeps your keys on Netlify, not in the page.

  What it is for: on the hosted site, the page sends its ElevenLabs and Anthropic requests here
  (to /api/...). This function adds your real key, which lives only in Netlify's environment
  variables, and passes the request on. The key is never sent to the browser.

  Set these in Netlify (Site configuration > Environment variables), then redeploy:
      ELEVENLABS_API_KEY   your ElevenLabs key
      ANTHROPIC_API_KEY    optional: lets Claude sort your thoughts
      WANDER_PASSCODE      a word only you know, so strangers with the link can't spend your credits

  Only the few addresses Wander uses are allowed through.
  Claude can take longer than Netlify's 40-second wait for a first reply, so for Anthropic the
  function answers straight away and keeps the line open with spaces until Claude is done; the
  page (js/hosted.js) unwraps it.
*/
const ELEVEN_PATHS = /^\/v1\/(speech-to-text(\?|$)|single-use-token\/realtime_scribe$|text-to-speech\/[A-Za-z0-9]+$)/;

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
function env(name) {
  try { return (globalThis.Netlify && Netlify.env.get(name)) || ''; } catch (e) { return ''; }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const eleven = env('ELEVENLABS_API_KEY').trim(), anthropic = env('ANTHROPIC_API_KEY').trim(), pass = env('WANDER_PASSCODE').trim();
  const passOk = !pass || req.headers.get('x-wander-pass') === pass;

  if (url.pathname === '/api/wander/status') {
    return json({ eleven: !!eleven, anthropic: !!anthropic, passcode: !!pass, passOk: passOk });
  }
  if (!passOk) { return json({ detail: { status: 'passcode', message: 'Wrong or missing Wander passcode.' } }, 401); }

  const headers = new Headers();
  ['content-type', 'accept', 'anthropic-version'].forEach((h) => { const v = req.headers.get(h); if (v) { headers.set(h, v); } });
  let upstream, wrap = false;
  if (url.pathname.startsWith('/api/eleven/')) {
    const p = url.pathname.slice('/api/eleven'.length);
    if (!ELEVEN_PATHS.test(p)) { return json({ detail: 'Not allowed' }, 403); }
    if (!eleven) { return json({ detail: { status: 'no_key', message: 'No ELEVENLABS_API_KEY is set on this Netlify site.' } }, 401); }
    headers.set('xi-api-key', eleven);
    upstream = 'https://api.elevenlabs.io' + p + url.search;
  } else if (url.pathname === '/api/anthropic/v1/messages') {
    if (!anthropic) { return json({ error: { type: 'authentication_error', message: 'No ANTHROPIC_API_KEY is set on this Netlify site.' } }, 401); }
    headers.set('x-api-key', anthropic);
    upstream = 'https://api.anthropic.com/v1/messages';
    wrap = true;
  } else {
    return json({ detail: 'Not found' }, 404);
  }
  if (req.method !== 'POST') { return json({ detail: 'Not allowed' }, 405); }
  const body = await req.arrayBuffer();

  if (!wrap) {
    try {
      const r = await fetch(upstream, { method: 'POST', headers: headers, body: body });
      return new Response(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/octet-stream', 'cache-control': 'no-store' } });
    } catch (e) {
      return json({ detail: 'Netlify could not reach ElevenLabs.' }, 502);
    }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const beat = setInterval(() => { try { ctrl.enqueue(enc.encode(' ')); } catch (e) { /* closed */ } }, 10000);
      let out;
      try {
        const r = await fetch(upstream, { method: 'POST', headers: headers, body: body });
        out = { status: r.status, body: await r.text() };
      } catch (e) {
        out = { status: 502, body: JSON.stringify({ error: { message: 'Netlify could not reach Anthropic.' } }) };
      }
      clearInterval(beat);
      ctrl.enqueue(enc.encode(JSON.stringify(out)));
      ctrl.close();
    }
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'application/json', 'x-wander-wrapped': '1', 'cache-control': 'no-store' } });
}

export const config = { path: '/api/*' };
