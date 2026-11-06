// test-edge-node.mjs - checks the Netlify function (netlify/edge-functions/wander-api.js) in Node.
// Run: node tests/test-edge-node.mjs
import handler from '../netlify/edge-functions/wander-api.js';
let pass = 0, fail = 0;
const env = { ELEVENLABS_API_KEY: 'el-secret', ANTHROPIC_API_KEY: 'an-secret', WANDER_PASSCODE: 'sea' };
globalThis.Netlify = { env: { get: (k) => env[k] } };
const calls = [];
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ token: 't', words: [] }), { status: 200, headers: { 'content-type': 'application/json' } }); };
async function t(name, fn) { try { await fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, e.message); } }
const ok = (c, m) => { if (!c) { throw new Error(m || 'not ok'); } };
const req = (path, h, body) => new Request('https://wander.example' + path, { method: body === undefined ? 'GET' : 'POST', headers: h || {}, body });

await t('status says what the site holds, never the key', async () => {
  const r = await handler(req('/api/wander/status')); const o = await r.json(); const s = JSON.stringify(o);
  ok(o.eleven && o.anthropic && o.passcode && !o.passOk); ok(s.indexOf('secret') < 0);
});
await t('wrong passcode is refused', async () => {
  const r = await handler(req('/api/eleven/v1/single-use-token/realtime_scribe', { 'x-wander-pass': 'nope' }, ''));
  ok(r.status === 401); ok(calls.length === 0);
});
await t('ElevenLabs request gets the real key added', async () => {
  const r = await handler(req('/api/eleven/v1/single-use-token/realtime_scribe', { 'x-wander-pass': 'sea', 'xi-api-key': 'hosted-by-site' }, ''));
  ok(r.status === 200); const c = calls.pop();
  ok(c.url === 'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe', c.url); ok(c.init.headers.get('xi-api-key') === 'el-secret');
});
await t('other ElevenLabs addresses are blocked', async () => {
  const r = await handler(req('/api/eleven/v1/user', { 'x-wander-pass': 'sea' }, '')); ok(r.status === 403);
});
await t('Anthropic reply is wrapped and unwraps to the real status', async () => {
  const r = await handler(req('/api/anthropic/v1/messages', { 'x-wander-pass': 'sea', 'content-type': 'application/json', 'anthropic-version': '2023-06-01' }, '{}'));
  ok(r.headers.get('x-wander-wrapped') === '1'); const o = JSON.parse(await r.text()); ok(o.status === 200);
  const c = calls.pop(); ok(c.init.headers.get('x-api-key') === 'an-secret'); ok(c.init.headers.get('anthropic-version') === '2023-06-01');
});
await t('no passcode set: open to anyone (warned in the README)', async () => {
  env.WANDER_PASSCODE = ''; const r = await handler(req('/api/wander/status')); ok((await r.json()).passOk); env.WANDER_PASSCODE = 'sea';
});
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
