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
assert.equal(seen.at(-1).headers.get('makers-conversation-id'), 'ps-control-discovery');

seen.length = 0;
const created = [];
for (let index = 0; index < 2; index++) {
  response = await call(make('POST', { action: 'create_session', width: 1200, height: 800 }, auth), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
  assert.equal(response.status, 200);
  const conversation = seen.at(-1).headers.get('makers-conversation-id');
  assert.match(conversation, /^ps-control-[a-f0-9]{36}$/, 'each create_session must get its own conversation id');
  created.push(conversation);
  assert.deepEqual(JSON.parse(text(seen.at(-1).body)), { action: 'create_session', width: 1200, height: 800 });
}
assert.notEqual(created[0], created[1], 'conversation ids must not repeat');

seen.length = 0;
response = await call(make('POST', { action: 'list_sessions' }, auth), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
assert.equal(response.status, 200);
assert.equal(seen.at(-1).headers.get('makers-conversation-id'), 'ps-control-index');

seen.length = 0;
response = await call(make('POST', { action: 'list_tools', session_id: 'a'.repeat(36) }, auth), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
assert.equal(response.status, 200);
assert.equal(seen.at(-1).headers.get('makers-conversation-id'), 'ps-control-' + 'a'.repeat(36));

// A malformed session id must be rejected locally, before any worker call.
for (const bad of ['abc', 'A'.repeat(36), 'a'.repeat(35), 42, null]) {
  seen.length = 0;
  response = await call(make('POST', { action: 'call_tool', session_id: bad, name: 'get_document', arguments: {} }, auth), { PS_CONTROL_TOKEN: token }, { fetch: nativeFetch });
  assert.equal(response.status, 400, 'invalid session id must be a 400');
  assert.equal(seen.length, 0, 'invalid session ids must not reach the worker');
}

// PAGES_BASE_URL drives both the worker origin and the advertised origin.
seen.length = 0;
await call(make(), { PS_CONTROL_TOKEN: token, PAGES_BASE_URL: 'https://custom.example/path/' }, { fetch: nativeFetch });
assert.equal(seen.at(-1).url, 'https://custom.example/ps-control-worker');

// --- upstream failures never look like success ---
response = await call(make(), { PS_CONTROL_TOKEN: token }, { fetch: async () => new Response('<html>frontend</html>', { headers: { 'Content-Type': 'text/html' } }) });
assert.equal(response.status, 502);
response = await call(make(), { PS_CONTROL_TOKEN: token }, { fetch: async () => { throw Error('offline'); } });
assert.equal(response.status, 502);
response = await call(make(), { PS_CONTROL_TOKEN: token }, { fetch: async () => Response.json({ ready: false }, { status: 503 }) });
assert.equal(response.status, 503, 'a not-ready agent must pass through');

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
