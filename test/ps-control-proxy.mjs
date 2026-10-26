import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handlePSControl } from '../lib/ps-control-proxy.mjs';

const token = 'test-only-proxy-token-at-least-24-characters';
const digest = createHash('sha256').update(token).digest('hex');
const auth = { authorization: 'Bearer ' + token };
const make = (method = 'GET', data, headers = {}) => new Request('https://senkou.example/api/ps-control', {
  method,
  headers: { ...headers, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
  ...(data === undefined ? {} : { body: typeof data === 'string' ? data : JSON.stringify(data) })
});
const text = body => typeof body === 'string' ? body : new TextDecoder().decode(body);
const call = (request, env, options) => handlePSControl({ request, env }, options);

// --- discovery without any credential stays public and honest ---
let response = await call(make(), {}, { digest: '', fetch: async () => { throw Error('must not reach a worker'); } });
let body = await response.json();
assert.equal(response.status, 200);
assert.equal(body.ready, false);
assert.equal(body.error.code, 'ACCESS_NOT_CONFIGURED');
response = await call(make('POST', { action: 'create_session' }), {}, { digest: '' });
assert.equal(response.status, 503);

// --- openapi is served from the deployment, never from the worker ---
for (const config of [{}, { PS_CONTROL_TOKEN: token }, { PS_CONTROL_TOKEN: token, PS_CONTROL_URL: 'https://worker.example' }, { PAGES_BASE_URL: 'https://custom.example/path/' }]) {
  for (const url of ['https://senkou.example/api/ps-control/openapi.json', 'https://senkou.example/api/ps-control?format=openapi']) {
    response = await call(new Request(url), config, { digest, fetch: async () => { throw Error('schema must not contact the worker'); } });
    assert.equal(response.status, 200);
    const schema = await response.json();
    assert.equal(schema.openapi, '3.1.0');
    assert.equal(schema.servers[0].url, config.PAGES_BASE_URL ? 'https://custom.example' : 'https://senkou.xyz');
    assert.equal(schema.paths['/api/ps-control'].post.operationId, 'controlOnlinePS');
    assert.deepEqual(schema.paths['/api/ps-control'].post.security, [{ bearerAuth: [] }]);
    assert(!JSON.stringify(schema).includes(token), 'public schema must never expose credentials');
    assert(!JSON.stringify(schema).includes('"const"'), 'OpenAPI 3.0 validators ignore const; use single-value enums');
  }
}

// --- native mode: the platform agent is addressed by conversation id ---
const seen = [];
const nativeFetch = async (url, init) => {
  seen.push({ url: String(url), headers: init.headers, body: init.body });
  return Response.json({ ready: true });
};
response = await call(make(), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
body = await response.json();
assert.equal(response.status, 200);
assert.equal(body.execution, 'edgeone-sandbox');
assert.equal(body.endpoint, '/api/ps-control');
assert.equal(seen.at(-1).url, 'https://senkou.xyz/ps-control-worker');
assert.equal(seen.at(-1).headers.get('makers-conversation-id'), 'pscdiscovery');

seen.length = 0;
const created = [];
for (let index = 0; index < 2; index++) {
  response = await call(make('POST', { action: 'create_session', width: 1200, height: 800 }, auth), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
  assert.equal(response.status, 200);
  const conversation = seen.at(-1).headers.get('makers-conversation-id');
  assert.match(conversation, /^[a-f0-9]{32}$/, 'each create_session must get its own conversation id');
  created.push(conversation);
  assert.deepEqual(JSON.parse(text(seen.at(-1).body)), { action: 'create_session', width: 1200, height: 800 });
}
assert.notEqual(created[0], created[1], 'conversation ids must not repeat');

seen.length = 0;
response = await call(make('POST', { action: 'list_sessions' }, auth), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
assert.equal(response.status, 200);
assert.equal(seen.at(-1).headers.get('makers-conversation-id'), 'pscindex');

seen.length = 0;
response = await call(make('POST', { action: 'list_tools', session_id: 'a'.repeat(32) }, auth), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
assert.equal(response.status, 200);
assert.equal(seen.at(-1).headers.get('makers-conversation-id'), 'a'.repeat(32));

// A malformed session id must be rejected locally, before any worker call.
for (const bad of ['abc', 'A'.repeat(32), 'a'.repeat(31), 42, null]) {
  seen.length = 0;
  response = await call(make('POST', { action: 'call_tool', session_id: bad, name: 'get_document', arguments: {} }, auth), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
  assert.equal(response.status, 400, 'invalid session id must be a 400');
  assert.equal(seen.length, 0, 'invalid session ids must not reach the worker');
}

// PAGES_BASE_URL drives both the worker origin and the advertised origin.
seen.length = 0;
await call(make(), { PS_CONTROL_TOKEN: token, PAGES_BASE_URL: 'https://custom.example/path/' }, { fetch: nativeFetch });
assert.equal(seen.at(-1).url, 'https://custom.example/ps-control-worker');

// Platforms that only validate OpenAPI 3.0 can request that version of the same schema.
response = await call(new Request('https://senkou.example/api/ps-control/openapi.json?version=3.0'), { PS_CONTROL_TOKEN: token }, { fetch: async () => { throw Error('schema must not contact the worker'); } });
assert.equal((await response.json()).openapi, '3.0.3');

// --- upstream failures never look like success ---
response = await call(make(), { PS_CONTROL_TOKEN: token }, { fetch: async () => new Response('<html>frontend</html>', { headers: { 'Content-Type': 'text/html' } }) });
assert.equal(response.status, 502);
const silenced = console.error; console.error = () => {};
response = await call(make(), { PS_CONTROL_TOKEN: token }, { fetch: async () => { throw Error('offline'); } });
console.error = silenced;
assert.equal(response.status, 502);
assert.equal((await response.json()).error.code, 'UPSTREAM_UNREACHABLE');
response = await call(make(), { PS_CONTROL_TOKEN: token }, { fetch: async () => Response.json({ ready: false }, { status: 503 }) });
assert.equal(response.status, 503, 'a not-ready agent must pass through');

// --- EdgeOne runtime shapes: no request.signal, arrayBuffer()/text() bodies ---
const runtimeRequest = (method = 'GET', payload, headers = {}) => ({
  method,
  url: 'https://senkou.example/api/ps-control',
  headers: new Headers({ ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...headers }),
  ...(method === 'POST' ? { async arrayBuffer() { return new TextEncoder().encode(payload).buffer; } } : {}),
});
seen.length = 0;
response = await call(runtimeRequest(), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
assert.equal(response.status, 200, 'a request without signal must still be forwarded');
assert.equal((await response.json()).execution, 'edgeone-sandbox');
response = await call(runtimeRequest('POST', JSON.stringify({ action: 'list_sessions' }), auth), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
assert.equal(response.status, 200);
assert.equal(seen.at(-1).headers.get('makers-conversation-id'), 'pscindex');
const textRequest = { method: 'POST', url: 'https://senkou.example/api/ps-control', headers: new Headers({ 'content-type': 'application/json', ...auth }), async text() { return JSON.stringify({ action: 'create_session' }); } };
response = await call(textRequest, { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
assert.equal(response.status, 200, 'a text()-only request must still be forwarded');
assert.match(seen.at(-1).headers.get('makers-conversation-id'), /^[a-f0-9]{32}$/);
response = await call(runtimeRequest('POST', '', auth), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
assert.equal(response.status, 400, 'an empty body must be a JSON error, not a crash');
const brokenRequest = { method: 'POST', url: 'https://senkou.example/api/ps-control', headers: new Headers({ 'content-type': 'application/json', ...auth }), async arrayBuffer() { throw Error('stream error'); } };
response = await call(brokenRequest, { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
assert.equal(response.status, 400);
assert.match((await response.json()).error.message, /读取请求体/);

// --- request hygiene ---
response = await call(new Request('https://senkou.example/api/ps-control', { method: 'POST', headers: { ...auth, 'Content-Type': 'text/plain' }, body: '{}' }), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
assert.equal(response.status, 415);
response = await call(make('POST', ' '.repeat(5 * 1024 * 1024 + 1), auth), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
assert.equal(response.status, 413);
response = await call(make('PUT'), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
assert.equal(response.status, 405);

// --- authentication gate ---
seen.length = 0;
for (const headers of [{}, { authorization: 'Bearer wrong-token' }, { authorization: 'Bearer ' + token.slice(0, -1) }]) {
  response = await call(make('POST', { action: 'create_session' }, headers), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate'), /Bearer/);
}
assert.equal(seen.length, 0, 'unauthorized requests must never reach the worker');

seen.length = 0;
response = await call(make('POST', { action: 'diagnose' }, auth), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
assert.equal(response.status, 200, 'diagnose needs no session id');
assert.equal(seen.at(-1).headers.get('makers-conversation-id'), 'pscindex');
// --- external worker mode stays available as an escape hatch ---
const external = { PS_CONTROL_TOKEN: token, PS_CONTROL_URL: 'https://worker.example/api/ps-control' };
const forwarded = [];
const workerFetch = async (url, init) => { forwarded.push({ url: String(url), headers: init.headers, body: init.body }); return Response.json({ result: { ok: true } }); };
response = await call(make('POST', { action: 'call_tool', session_id: 'abc', name: 'get_document', arguments: {} }, auth), external, { fetch: workerFetch });
assert.equal(response.status, 200);
assert.equal(forwarded.at(-1).url, 'https://worker.example/api/ps-control');
assert.equal(forwarded.at(-1).headers.get('authorization'), auth.authorization);
assert.equal(forwarded.at(-1).headers.get('makers-conversation-id'), null, 'external workers need no conversation routing');
assert.equal(JSON.parse(text(forwarded.at(-1).body)).name, 'get_document');
for (const headers of [{}, { authorization: 'Bearer wrong-token' }]) {
  forwarded.length = 0;
  response = await call(make('POST', { action: 'create_session' }, headers), external, { fetch: workerFetch });
  assert.equal(response.status, 401);
  assert.equal(forwarded.length, 0);
}
response = await call(make(), external, { fetch: workerFetch });
body = await response.json();
assert.equal(body.execution, 'external-worker');
for (const url of ['javascript:bad', 'https://user:pass@worker.example', 'https://worker.example/?x=1', 'ftp://worker.example']) {
  response = await call(make(), { PS_CONTROL_TOKEN: token, PS_CONTROL_URL: url }, { fetch: workerFetch });
  assert.equal(response.status, 503, 'unsafe worker urls must fail closed: ' + url);
}
console.log('ps-api proxy: credential gate, conversation routing, both execution modes, limits and upstream errors passed');
