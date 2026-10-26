import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handleCloudControl } from '../lib/ps-control-cloud.mjs';

const token = 'test-only-cloud-token-at-least-24-characters';
const digest = createHash('sha256').update(token).digest('hex');
const auth = { authorization: 'Bearer ' + token };
const SESSION = 'b'.repeat(36);
const CONVERSATION = 'ps-control-' + SESSION;

const now = () => Date.now();

function makePage() {
  const page = {
    navigations: [],
    viewport: { width: 1440, height: 960 },
    url() { return page.location || 'about:blank'; },
    async goto(target) { page.location = target; page.navigations.push(target); },
    async setViewportSize(size) { page.viewport = size; },
    viewportSize() { return page.viewport; },
    on() {},
    setDefaultTimeout() {},
    async evaluate() { return [{ name: 'get_document', description: '读取当前文档', inputSchema: { type: 'object', properties: {}, required: [] } }]; },
    async waitForFunction() {},
    async screenshot() { return Buffer.from('fake-png'); },
  };
  return page;
}

function makeBrowser(page, { contexts = 1 } = {}) {
  const browser = {
    closed: 0,
    createdContexts: 0,
    contexts() {
      return Array.from({ length: contexts }, () => ({
        pages: () => [page],
        newPage: async () => page,
      }));
    },
    async newContext() { browser.createdContexts++; return { pages: () => [page], newPage: async () => page }; },
    async close() { browser.closed++; },
  };
  return browser;
}

function makeSandbox(page) {
  const sandbox = {
    init: 0,
    killed: 0,
    extended: [],
    async commands_run(command, options) { sandbox.init++; return { exitCode: 0 }; },
    browser: { cdpUrl: 'https://sandbox.example/cdp?access_token=sealed' },
    async kill() { sandbox.killed++; },
    async extendTimeout(seconds) { sandbox.extended.push(seconds); },
  };
  sandbox.commands = { run: sandbox.commands_run };
  return sandbox;
}

function makeStore(seed = []) {
  const rows = new Map(seed.map(row => [row.conversationId, row]));
  const store = {
    rows,
    writes: 0,
    async listConversations(options = {}) {
      const all = [...rows.values()];
      return all.slice(0, options.limit || 100).map(row => ({ conversationId: row.conversationId, metadata: row.metadata }));
    },
    async getConversation({ conversationId }) {
      const row = rows.get(conversationId);
      if (!row) throw Error('ENOENT');
      return { conversationId, metadata: row.metadata };
    },
    async updateConversation({ conversationId, metadata }) {
      store.writes++;
      const row = rows.get(conversationId) || { conversationId, metadata: {} };
      row.metadata = metadata;
      rows.set(conversationId, row);
      return row;
    },
    async appendMessage({ conversationId }) {
      const row = rows.get(conversationId) || { conversationId, metadata: {} };
      rows.set(conversationId, row);
    },
  };
  return store;
}

const post = (data, headers = auth, url = 'https://senkou.example/api/ps-control') => new Request(url, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});
const get = (headers = {}) => new Request('https://senkou.example/api/ps-control', { headers });

// --- fail closed before touching anything ---
let response = await handleCloudControl({ request: post({ action: 'create_session' }), env: {} }, { digest: '' });
assert.equal(response.status, 503);
assert.equal((await response.json()).error.code, 'ACCESS_NOT_CONFIGURED');

response = await handleCloudControl({ request: get(), env: {} }, { digest });
assert.equal((await response.json()).ready, false, 'no sandbox means not ready');
response = await handleCloudControl({ request: get(), env: {}, sandbox: makeSandbox(makePage()) }, { digest });
let body = await response.json();
assert.equal(body.ready, true);
assert.equal(body.execution, 'edgeone-sandbox');

// --- authentication precedes any sandbox allocation ---
const page = makePage();
const sandbox = makeSandbox(page);
const browser = makeBrowser(page);
const store = makeStore([{ conversationId: CONVERSATION, metadata: { ps_control: { session_id: SESSION, open: true, last_used: now(), expires_at: now() + 60000 } } }]);
const connect = async () => browser;
for (const headers of [{}, { authorization: 'Bearer nope' }, { authorization: 'Bearer ' + token.slice(0, -1) }]) {
  response = await handleCloudControl({ request: post({ action: 'list_tools', session_id: SESSION }, headers), env: {}, sandbox, store, conversation_id: CONVERSATION }, { digest, connect });
  assert.equal(response.status, 401);
  assert.match(response.headers.get('www-authenticate'), /Bearer/);
}
assert.equal(sandbox.init, 0, 'unauthenticated calls must not start a sandbox');
assert.equal(browser.closed, 0);

// --- request validation ---
const base = { env: {}, sandbox, store, conversation_id: CONVERSATION };
response = await handleCloudControl({ ...base, request: post({ action: 'delete_everything' }) }, { digest, connect });
assert.equal(response.status, 400);
assert.match((await response.json()).error.message, /create_session/);

response = await handleCloudControl({ ...base, request: post({ action: 'list_sessions', extra: 1 }) }, { digest, connect });
assert.equal(response.status, 400);

response = await handleCloudControl({ ...base, request: post({ action: 'create_session' }, auth, 'https://senkou.example/api/ps-control') }, { digest, connect });
assert.equal(response.status, 200, 'create_session must not require an existing conversation');

for (const conversation of ['ps-control-xyz', 'other-' + SESSION, undefined]) {
  response = await handleCloudControl({ ...base, conversation_id: conversation, request: post({ action: 'list_tools', session_id: SESSION }) }, { digest, connect });
  assert.equal(response.status, 400, 'a conversation that is not our session must be rejected');
}

response = await handleCloudControl({ ...base, request: post({ action: 'list_tools', session_id: 'c'.repeat(36) }) }, { digest, connect });
assert.equal(response.status, 400, 'session id must match the conversation id');

for (const size of [{ width: 100 }, { height: 9000 }, { width: 1440.5 }]) {
  response = await handleCloudControl({ ...base, request: post({ action: 'create_session', ...size }) }, { digest, connect });
  assert.equal(response.status, 400);
}

// --- create_session opens one page and records the session ---
store.rows.clear();
page.navigations.length = 0; sandbox.init = 0; browser.closed = 0;
response = await handleCloudControl({ ...base, request: post({ action: 'create_session', width: 1280, height: 720 }) }, { digest, connect });
body = await response.json();
assert.equal(response.status, 200);
assert.match(body.session_id, /^[a-f0-9]{36}$/);
assert.deepEqual(body.viewport, { width: 1280, height: 720 });
assert.equal(body.idle_timeout_seconds, 1800);
assert.equal(page.navigations.length, 1);
assert.match(page.navigations[0], /^https:\/\/senkou\.xyz\/ps\/\?control_session=[a-f0-9]{36}$/);
const opened = store.rows.get('ps-control-' + body.session_id).metadata.ps_control;
assert.equal(opened.open, true);
assert.equal(sandbox.init, 1);
assert.equal(browser.closed, 1, 'the CDP connection is closed but the page stays open');

// --- create_session refuses a fifth session ---
const filled = Array.from({ length: 4 }, (_, index) => ({ conversationId: 'ps-control-' + 'd'.repeat(35) + index, metadata: { ps_control: { session_id: 'd'.repeat(35) + index, open: true, last_used: now(), expires_at: now() + 60000 } } }));
const fullStore = makeStore(filled);
response = await handleCloudControl({ ...base, store: fullStore, request: post({ action: 'create_session' }) }, { digest, connect });
assert.equal(response.status, 429);

// --- calling tools on an open session ---
store.rows.clear();
store.rows.set(CONVERSATION, { conversationId: CONVERSATION, metadata: { ps_control: { session_id: SESSION, open: true, last_used: now(), expires_at: now() + 60000 } } });
response = await handleCloudControl({ ...base, request: post({ action: 'list_tools', session_id: SESSION }) }, { digest, connect });
body = await response.json();
assert.equal(response.status, 200);
assert(Array.isArray(body.tools) && body.tools.length > 0, 'list_tools must return the editor tool schema');
assert.equal(sandbox.extended.at(-1), 1800, 'an active session keeps the sandbox alive');

response = await handleCloudControl({ ...base, request: post({ action: 'close_session', session_id: SESSION }) }, { digest, connect });
assert.equal(response.status, 200);
assert.equal((await response.json()).ok, true);
assert.equal(sandbox.killed, 1);
assert.equal(store.rows.get(CONVERSATION).metadata.ps_control.open, false);

// --- expired or missing sessions fail with 404 ---
for (const metadata of [{ ps_control: { session_id: SESSION, open: false, expires_at: now() + 60000 } }, { ps_control: { session_id: SESSION, open: true, expires_at: now() - 1000 } }, {}]) {
  const expired = makeStore([{ conversationId: CONVERSATION, metadata }]);
  response = await handleCloudControl({ ...base, store: expired, request: post({ action: 'list_tools', session_id: SESSION }) }, { digest, connect });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'SESSION_EXPIRED');
}

// --- one operation per session at a time ---
let release;
const hanging = new Promise(resolve => { release = resolve; });
const slowConnect = async () => { await hanging; return browser; };
const liveStore = makeStore([{ conversationId: CONVERSATION, metadata: { ps_control: { session_id: SESSION, open: true, last_used: now(), expires_at: now() + 60000 } } }]);
const live = { ...base, store: liveStore };
const first = handleCloudControl({ ...live, request: post({ action: 'list_tools', session_id: SESSION }) }, { digest, connect: slowConnect });
await new Promise(resolve => setTimeout(resolve, 20));
response = await handleCloudControl({ ...live, request: post({ action: 'call_tool', session_id: SESSION, name: 'get_document', arguments: {} }) }, { digest, connect: slowConnect });
assert.equal(response.status, 409);
assert.equal((await response.json()).error.code, 'SESSION_BUSY');
release();
assert.equal((await first).status, 200, 'the first operation still completes');

// --- a stalled operation closes the session instead of editing in the background ---
const stall = makeSandbox(makePage());
response = await handleCloudControl({ ...live, sandbox: stall, request: post({ action: 'list_tools', session_id: SESSION }) }, { digest, connect: async () => { await new Promise(() => {}); }, timeoutMs: 20 });
assert.equal(response.status, 504);
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(stall.killed, 1, 'a timed-out operation must kill the sandbox');
assert.equal(liveStore.rows.get(CONVERSATION).metadata.ps_control.open, false);

// --- list_sessions only reports live sessions ---
const mixed = makeStore([
  { conversationId: 'ps-control-' + 'e'.repeat(36), metadata: { ps_control: { session_id: 'e'.repeat(36), open: true, last_used: now(), expires_at: now() + 60000 } } },
  { conversationId: 'ps-control-' + 'f'.repeat(36), metadata: { ps_control: { session_id: 'f'.repeat(36), open: true, last_used: now(), expires_at: now() - 1 } } },
  { conversationId: 'ps-control-index', metadata: {} },
]);
response = await handleCloudControl({ ...base, store: mixed, conversation_id: 'ps-control-index', request: post({ action: 'list_sessions' }) }, { digest, connect });
body = await response.json();
assert.equal(response.status, 200);
assert.deepEqual(body.sessions.map(session => session.session_id), ['e'.repeat(36)]);

// --- missing runtime pieces produce explicit errors ---
response = await handleCloudControl({ ...base, store: undefined, request: post({ action: 'list_sessions' }) }, { digest, connect });
assert.equal(response.status, 503);
response = await handleCloudControl({ ...base, sandbox: undefined, request: post({ action: 'create_session' }) }, { digest, connect });
assert.equal(response.status, 503);
const silenced = console.error; console.error = () => {};
response = await handleCloudControl({ ...base, store: makeStore([{ conversationId: CONVERSATION, metadata: { ps_control: { session_id: SESSION, open: true, last_used: now(), expires_at: now() + 60000 } } }]), sandbox: { ...sandbox, commands: { run: async () => { throw Error('boom'); } } }, request: post({ action: 'list_tools', session_id: SESSION }) }, { digest, connect });
console.error = silenced;
assert.equal(response.status, 503, 'runtime failures must not leak internals');
assert.equal((await response.json()).error.code, 'CLOUD_EXECUTION_FAILED');

console.log('ps-api cloud: auth, conversation routing, session lifecycle, busy/timeout and error paths passed');
