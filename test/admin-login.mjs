import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import yaml from 'js-yaml';

const html = await fs.readFile(new URL('../lib/admin.html', import.meta.url), 'utf8');
const script = await fs.readFile(new URL('../source/assets/welkin/admin.js', import.meta.url), 'utf8');
const key = 'senkou.admin.login.v1', day = 86400000;
const repo = 'example/senkou', token = 'TEST_TOKEN_NOT_A_REAL_CREDENTIAL';
const docs = new Map();
for (const path of ['_config.yml', 'studio-content/site.yml', 'studio-content/source/_posts/hello-senkou.md']) {
  docs.set(path, await fs.readFile(new URL('../' + path, import.meta.url), 'utf8'));
}
const studio = yaml.load(docs.get('_config.yml')).studio;
const sessions = [], scriptErrors = [];
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(5); }
  throw new Error('Timed out waiting for admin UI');
}
async function app({ storage = new Map(), now = Date.now(), blocked = false, apiError = null, local = false, url = 'https://studio.example/admin/' } = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' }); sessions.push(dom);
  const win = dom.window, $ = id => win.document.getElementById(id), calls = [];
  let time = now, errorStatus = apiError;
  Object.assign(win, { jsyaml: yaml, TextEncoder, TextDecoder, AbortSignal, structuredClone });
  win.Date.now = () => time;
  win.addEventListener('error', event => scriptErrors.push(event.error));
  Object.defineProperty(win, 'localStorage', { value: {
    getItem(name) { if (blocked) throw new Error('Storage denied'); return storage.get(name) ?? null; },
    setItem(name, value) { if (blocked) throw new Error('Storage denied'); storage.set(name, String(value)); },
    removeItem(name) { if (blocked) throw new Error('Storage denied'); storage.delete(name); }
  } });
  win.fetch = async (input, options = {}) => {
    const requestUrl = new URL(input, url), path = decodeURIComponent(requestUrl.pathname);
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (path.endsWith('/__studio_api/status')) return reply(local ? { mode: 'local', nonce: 'local-test-nonce' } : {}, local ? 200 : 404);
    if (path.endsWith('/__studio_api/state') && local) return reply({ files: [], settings: { studio, site: { theme: 'welkin' } } });
    assert.equal(requestUrl.origin, 'https://api.github.com', 'A token must only go to GitHub');
    assert.equal(options.headers.Authorization, 'Bearer ' + token);
    calls.push({ path, method: options.method, ref: requestUrl.searchParams.get('ref') });
    if (errorStatus === 'network') throw new TypeError('Failed to fetch');
    if (errorStatus) return reply({ message: errorStatus === 401 ? 'Bad credentials' : 'Service temporarily unavailable' }, errorStatus);
    const base = '/repos/' + repo;
    if (path.startsWith(base + '/git/trees/')) return reply({ truncated: false, tree: [...docs.keys()].map(path => ({ path, type: 'blob' })) });
    if (path.startsWith(base + '/contents/')) {
      const name = path.slice((base + '/contents/').length);
      assert(docs.has(name), 'Unexpected content path: ' + name);
      return reply({ type: 'file', encoding: 'base64', content: Buffer.from(docs.get(name)).toString('base64'), sha: 'test-sha-' + name });
    }
    throw new Error('Unexpected route: ' + path);
  };
  win.eval(script);
  await until(() => !$('connect-panel').hidden || !$('workspace').hidden);
  await until(() => !$('connect-form').querySelector('button[type=submit]').disabled);
  return {
    win, $, calls, storage,
    async login(remember = false, days = 7, branch = 'main') {
      $('repo').value = repo; $('branch').value = branch; $('token').value = token;
      $('remember-login').checked = remember; $('remember-login').dispatchEvent(new win.Event('change'));
      $('remember-days').value = String(days);
      $('connect-form').dispatchEvent(new win.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: $('connect-form').querySelector('button[type=submit]') }));
      await until(() => !$('connect-form').querySelector('button[type=submit]').disabled);
    },
    setError(value) { errorStatus = value; },
    advance(ms) { time += ms; win.dispatchEvent(new win.Event('focus')); },
    close() { dom.window.close(); }
  };
}
try {
  const first = await app();
  assert.equal(first.$('remember-login').checked, false);
  assert.equal(first.$('remember-days').disabled, true);
  await first.login();
  assert.equal(first.$('workspace').hidden, false);
  assert.equal(first.$('token').value, '');
  assert.equal(first.storage.size, 0, 'No opt-in means no persisted credentials');
  const noRememberReload = await app({ storage: first.storage });
  assert.equal(noRememberReload.$('connect-panel').hidden, false);
  assert.equal(noRememberReload.calls.length, 0);

  for (const days of [7, 30]) {
    const login = await app(); await login.login(true, days, 'feature/notes');
    const stored = JSON.parse(login.storage.get(key));
    assert.equal(stored.repo, repo); assert.equal(stored.branch, 'feature/notes'); assert.equal(stored.token, token);
    assert.equal(stored.expiresAt - stored.savedAt, days * day);
    assert.equal(login.$('remember-state').hidden, false);
    assert(login.$('status').textContent.includes(days + ' 天'));
    const refresh = await app({ storage: login.storage, now: stored.savedAt + day });
    assert.equal(refresh.$('workspace').hidden, false);
    assert(refresh.$('status').textContent.includes('已自动连接'));
    assert.equal(refresh.$('token').value, '', 'Restoring must never fill the token into a visible form');
    assert.equal(JSON.parse(login.storage.get(key)).expiresAt, stored.expiresAt, 'Refreshing must not silently extend the deadline');
    assert(refresh.calls.some(item => item.ref === 'feature/notes'), 'Restore the chosen branch');
    const revokedWhileEditing = await app({ storage: new Map(login.storage), now: stored.savedAt + day });
    revokedWhileEditing.setError(401); revokedWhileEditing.$('reload').click();
    await until(() => revokedWhileEditing.$('status').textContent.includes('令牌已失效'));
    assert.equal(revokedWhileEditing.storage.has(key), false);
    assert.equal(revokedWhileEditing.$('remember-state').hidden, true);
    refresh.$('disconnect').click(); await until(() => !refresh.$('connect-panel').hidden);
    assert.equal(login.storage.has(key), false);
    const afterLogout = await app({ storage: login.storage });
    assert.equal(afterLogout.calls.length, 0);
    assert.equal(afterLogout.$('connect-panel').hidden, false);
  }

  const active = await app(); await active.login(true);
  const saved = JSON.parse(active.storage.get(key));
  const future = await app({ storage: new Map(active.storage), now: saved.expiresAt });
  assert.equal(future.storage.has(key), false);
  assert.equal(future.calls.length, 0, 'Expired tokens must not be sent to GitHub');
  active.advance(8 * day);
  assert.equal(active.storage.has(key), false);
  assert.equal(active.$('workspace').hidden, false, 'Expiry must preserve an open editing session');
  assert(active.$('status').textContent.includes('记住登录已到期'));

  for (const invalid of ['{broken json', JSON.stringify({ ...saved, days: 365 }), JSON.stringify({ ...saved, expiresAt: saved.expiresAt + day })]) {
    const invalidStorage = new Map([[key, invalid]]);
    const invalidApp = await app({ storage: invalidStorage });
    assert.equal(invalidStorage.has(key), false); assert.equal(invalidApp.calls.length, 0);
  }
  const denied = await app({ blocked: true }); await denied.login(true);
  assert.equal(denied.$('workspace').hidden, false);
  assert(denied.$('status').textContent.includes('浏览器未允许保存'));
  assert.equal(denied.$('remember-state').hidden, true);

  const seed = await app(); await seed.login(true);
  const revoked = await app({ storage: new Map(seed.storage), apiError: 401 });
  assert.equal(revoked.$('connect-panel').hidden, false);
  assert.equal(revoked.storage.has(key), false);
  assert(revoked.$('status').textContent.includes('令牌已失效'));
  assert.equal(revoked.$('remember-login').checked, false);
  for (const failure of ['network', 503, 403]) {
    const recoverable = await app({ storage: new Map(seed.storage), apiError: failure });
    assert.equal(recoverable.$('connect-panel').hidden, false);
    assert.equal(recoverable.$('repo').value, repo);
    assert.equal(recoverable.$('token').value, '');
    assert(recoverable.storage.has(key), 'Temporary connectivity/permission errors should not erase a remembered login');
    recoverable.setError(null); await recoverable.login(false);
    assert.equal(recoverable.$('workspace').hidden, false);
    assert.equal(recoverable.storage.has(key), false, 'Opting out on a new login clears an older saved login');
  }
  const crossTab = await app(); await crossTab.login(true);
  const newer = JSON.parse(crossTab.storage.get(key)); newer.savedAt += 8 * day; newer.expiresAt += 8 * day;
  crossTab.storage.set(key, JSON.stringify(newer));
  crossTab.win.dispatchEvent(new crossTab.win.StorageEvent('storage', { key, newValue: JSON.stringify(newer) }));
  crossTab.advance(8 * day);
  assert(crossTab.storage.has(key), 'An older tab must not clear a newer remembered login when its own timer expires');
  assert.equal(crossTab.$('remember-state').hidden, true);
  const failed = await app({ apiError: 401 }); await failed.login(true);
  assert.equal(failed.storage.size, 0, 'Never remember an unsuccessful login');
  const preview = await app({ local: true, storage: new Map(seed.storage) });
  assert.equal(preview.$('connection-state').textContent, '本地编辑');
  assert.equal(preview.calls.length, 0, 'A local preview must keep using the local editing API');
  assert.equal(preview.$('disconnect').hidden, true);
  for (const dom of sessions) assert.equal(dom.window.document.querySelector('#token').value, '');
  assert.equal(scriptErrors.length, 0, scriptErrors.map(error => error.message).join('\n'));
  console.log('PASS admin login: opt-in, 7/30-day restore, chosen branch, fixed deadline, expiry, logout, invalid/revoked token, offline retry, denied storage and local-preview priority');
} finally { for (const dom of sessions) dom.window.close(); }
