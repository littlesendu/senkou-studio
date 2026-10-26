import assert from 'node:assert/strict';
import { handlePSControl } from '../lib/ps-control-proxy.mjs';
const make = (method = 'GET', data, headers = {}) => new Request('https://senkou.example/api/ps-control', { method, headers: { ...headers, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
let response = await handlePSControl({ request: make() });
assert.equal((await response.json()).error.code, 'ACCESS_NOT_CONFIGURED');
response = await handlePSControl({ request: make('POST', { action: 'create_session' }) }); assert.equal(response.status, 503);
const token = 'test-only-proxy-token-at-least-24-characters';
const auth = { Authorization: 'Bearer ' + token };
response = await handlePSControl({ request: make(), env: { PS_CONTROL_TOKEN: token } }); assert.equal((await response.json()).error.code, 'WORKER_NOT_CONFIGURED');
response = await handlePSControl({ request: make(), env: { PS_CONTROL_TOKEN: 'short', PS_CONTROL_URL: 'https://worker.example' } }); assert.equal((await response.json()).error.code, 'ACCESS_NOT_CONFIGURED');
let forwarded;
const env = { PS_CONTROL_URL: 'https://worker.example/api/ps-control', PS_CONTROL_TOKEN: token };
const fetch = async (url, init) => { forwarded = { url, init }; return Response.json({ result: { ok: true } }); };
response = await handlePSControl({ request: make('POST', { action: 'call_tool', session_id: 'abc', name: 'get_document', arguments: {} }, auth), env }, { fetch });
assert.equal(response.status, 200); assert.equal(forwarded.url.href, 'https://worker.example/api/ps-control'); assert.equal(forwarded.init.headers.get('authorization'), auth.Authorization);
assert.equal(JSON.parse(new TextDecoder().decode(forwarded.init.body)).name, 'get_document');
for (const headers of [{}, { Authorization: 'Bearer wrong-token' }, { Authorization: token }]) {
  forwarded = undefined;
  response = await handlePSControl({ request: make('POST', { action: 'create_session' }, headers), env }, { fetch });
  assert.equal(response.status, 401); assert.equal(forwarded, undefined, 'unauthorized requests must not reach the worker');
  assert.match(response.headers.get('www-authenticate'), /Bearer/);
}
response = await handlePSControl({ request: make(), env }, { fetch }); const discovery = await response.json(); assert.equal(discovery.ready, true); assert.equal(discovery.endpoint, '/api/ps-control');
response = await handlePSControl({ request: new Request('https://senkou.example/api/ps-control/openapi.json'), env }, { fetch }); assert.equal(forwarded.url.href, 'https://worker.example/api/ps-control/openapi.json');
response = await handlePSControl({ request: make(), env }, { fetch: async () => new Response('<html>frontend</html>', { headers: { 'Content-Type': 'text/html' } }) }); assert.equal(response.status, 502);
response = await handlePSControl({ request: make(), env }, { fetch: async () => { throw Error('offline'); } }); assert.equal(response.status, 502);
response = await handlePSControl({ request: make(), env: { ...env, PS_CONTROL_URL: 'javascript:bad' } }); assert.equal(response.status, 503);
response = await handlePSControl({ request: new Request('https://senkou.example/api/ps-control', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: ' '.repeat(5 * 1024 * 1024 + 1) }), env }, { fetch }); assert.equal(response.status, 413);
console.log('ps-api proxy: token gate, fail-closed configuration, route mapping, size limits and upstream errors passed');
