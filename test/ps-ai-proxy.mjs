import assert from 'node:assert/strict';
import { handleAIProxy } from '../lib/ps-ai-proxy.mjs';

const origin = 'https://studio.example', upstream = 'https://openaiapi.cc/v1/chat/completions';
const auth = 'Bearer synthetic-test-key';
function request(target = upstream, options = {}) {
  const method = options.method || 'POST';
  return new Request(origin + '/api/ps-ai', { method, ...options, headers: { Origin: origin, 'X-AI-Upstream': target, Authorization: auth, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}), ...options.headers }, ...(method === 'POST' ? { body: options.body ?? '{"model":"test","messages":[]}' } : {}) });
}
let calls = 0;
const reply = async () => { calls++; return Response.json({ ok: true }); };
async function status(req, expected, options = {}, env = {}) {
  const response = await handleAIProxy({ request: req, env }, { fetch: reply, ...options });
  assert.equal(response.status, expected, await response.clone().text());
  await response.text(); return response;
}
await status(request(), 200);
const prior = calls;
for (const target of ['https://127.0.0.1/v1/models', 'http://openaiapi.cc/v1/models', 'https://openaiapi.cc.evil.example/v1/models', 'https://openaiapi.cc:444/v1/models', 'https://u:secret@openaiapi.cc/v1/models', upstream + '?key=secret', upstream + '#fragment', 'https://openaiapi.cc/redirect', 'https://openaiapi.cc/v1/%2e%2e/admin']) await status(request(target), 403);
await status(request(upstream, { headers: { Origin: 'https://unrelated.example' } }), 403);
await status(request(upstream, { headers: { 'Sec-Fetch-Site': 'cross-site' } }), 403);
await status(request(upstream, { headers: { Authorization: '' } }), 401);
await status(request(upstream, { method: 'DELETE' }), 405);
await status(request(upstream, { method: 'GET' }), 405);
await status(request(upstream, { headers: { 'Content-Type': 'text/plain' } }), 415);
await status(request(), 503, {}, { PS_AI_ALLOWED_HOSTS: '*' });
await status(request(), 503, {}, { PS_AI_ALLOWED_HOSTS: '127.0.0.1' });
await status(request(upstream, { body: 'a'.repeat(65) }), 413, { maxBodyBytes: 64 });
await status(request(upstream, { headers: { 'Content-Length': '1000' } }), 413, { maxBodyBytes: 64 });
assert.equal(calls, prior, 'rejected requests must never reach upstream');
const health = await handleAIProxy({ request: new Request(origin + '/api/ps-ai') });
assert.deepEqual(await health.json(), { service: 'online-ps-ai-proxy', version: 1, allowedHosts: ['openaiapi.cc'] });
await status(request('https://openaiapi.cc/v1/models', { method: 'GET' }), 200);
await status(request('https://api.deepseek.com/v1/models', { method: 'GET' }), 200, {}, { PS_AI_ALLOWED_HOSTS: 'openaiapi.cc,api.deepseek.com' });
await status(request(upstream, { method: 'OPTIONS' }), 204);
// Forward JSON exactly, allow only necessary headers, and discard upstream cookies/CORS.
const body = '{"model":"test","messages":[{"role":"user","content":"draw"}]}';
const proxied = await handleAIProxy({ request: request(upstream, { body, headers: { Cookie: 'session=private', 'X-Forwarded-Host': 'evil.example' } }) }, { fetch: async (url, init) => {
  assert.equal(url, upstream); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
  assert.equal(init.headers.get('authorization'), auth); assert.equal(init.headers.get('cookie'), null); assert.equal(init.headers.get('origin'), null); assert.equal(init.headers.get('x-forwarded-host'), null);
  assert.equal(Buffer.from(init.body).toString(), body);
  return new Response('{"error":{"message":"invalid API key"}}', { status: 401, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'leak=1', 'Access-Control-Allow-Origin': '*' } });
} });
assert.equal(proxied.status, 401); assert.equal(proxied.headers.get('set-cookie'), null); assert.equal(proxied.headers.get('access-control-allow-origin'), null); assert.equal(proxied.headers.get('cache-control'), 'no-store'); await proxied.text();
// Image bytes, filename and mask survive unchanged through multipart forwarding.
const form = new FormData(); form.append('model', 'image-test'); form.append('image', new Blob([new Uint8Array([0, 255, 128, 10])], { type: 'image/png' }), 'reference.png'); form.append('mask', new Blob(['transparent-mask'], { type: 'image/png' }), 'mask.png');
const multipart = new Request(origin + '/api/ps-ai', { method: 'POST', headers: { Origin: origin, 'X-AI-Upstream': 'https://openaiapi.cc/v1/images/edits', Authorization: auth }, body: form });
const raw = Buffer.from(await multipart.clone().arrayBuffer());
const imageResponse = await handleAIProxy({ request: multipart }, { fetch: async (url, init) => {
  assert.equal(url, 'https://openaiapi.cc/v1/images/edits'); assert.deepEqual(Buffer.from(init.body), raw);
  const parsed = await new Request(url, { method: 'POST', headers: init.headers, body: init.body }).formData();
  assert.deepEqual(Buffer.from(await parsed.get('image').arrayBuffer()), Buffer.from([0, 255, 128, 10])); assert.equal(parsed.get('image').name, 'reference.png'); assert.equal(await parsed.get('mask').text(), 'transparent-mask');
  return Response.json({ data: [{ b64_json: 'synthetic' }] });
} }); await imageResponse.text();
// Streaming must not wait for a full response, and cancellation must reach upstream.
let release, signal;
const streaming = await handleAIProxy({ request: request('https://openaiapi.cc/v1/responses') }, { fetch: async (_url, init) => {
  signal = init.signal;
  return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('data: first\n\n')); release = () => { c.enqueue(new TextEncoder().encode('data: last\n\n')); c.close(); }; } }), { headers: { 'Content-Type': 'text/event-stream' } });
} });
assert.equal(streaming.headers.get('content-type'), 'text/event-stream'); const reader = streaming.body.getReader(); assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: first\n\n'); await reader.cancel(); assert(signal.aborted);
// Fetch failures and timeouts return usable JSON without leaking secrets or internal details.
for (const mode of ['failure', 'timeout']) {
  const response = await handleAIProxy({ request: request() }, { timeoutMs: 15, fetch: async (_url, init) => {
    if (mode === 'failure') throw Error(auth + ' internal stack trace');
    await new Promise((resolve, reject) => { const keepAlive = setTimeout(resolve, 1000); init.signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(Error('aborted')); }, { once: true }); });
  } });
  assert.equal(response.status, mode === 'failure' ? 502 : 504); const message = await response.text(); assert(!message.includes('synthetic-test-key')); assert(!message.includes('stack trace'));
}
console.log('AI relay passed: origin and host boundaries, auth, body limits, header isolation, exact JSON/multipart image and mask forwarding, SSE cancellation, upstream errors and timeout.');
