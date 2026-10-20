import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';
import yaml from 'js-yaml';
const require = createRequire(import.meta.url);
const schema = require('../source/assets/welkin/careers-data.js');
const { createStudioAdmin } = require('../lib/studio-admin.cjs');
const root = process.cwd(), tmp = path.join(root, 'work', 'tmp');
const initial = JSON.parse(await fs.readFile(path.join(root, 'studio-content/source/careers/data.json'), 'utf8'));
const validated = schema.validate(initial);
assert.equal(validated.jobs.length, 3);
const legacy = structuredClone(initial); delete legacy.application.guidelines; delete legacy.application.disclaimer;
assert.equal(schema.validate(legacy).application.guidelines, schema.empty().application.guidelines);
assert.equal(schema.validate(legacy).application.disclaimer, schema.empty().application.disclaimer);
assert.deepEqual(schema.validate(schema.empty()), schema.empty());
for (const mutate of [
  value => { value.jobs[0].typeId = 'unknown'; },
  value => { value.jobs[0].status = 'invisible'; },
  value => { value.types.push(value.types[0]); },
  value => { value.jobs[0].id = 123; },
  value => { value.application.url = 'javascript:alert(1)'; },
  value => { value.application.url = 'https://user:secret@example.com/'; },
  value => { value.jobs[0].title = ''; },
  value => { value.application.guidelines = ''; },
  value => { value.application.disclaimer = 'x'.repeat(6001); }
]) { const bad = structuredClone(validated); mutate(bad); assert.throws(() => schema.validate(bad)); }
assert.equal(schema.validate({ ...validated, application: { ...validated.application, url: 'mailto:recruit@example.com' } }).application.url, 'mailto:recruit@example.com');
await fs.mkdir(tmp, { recursive: true });
const fixture = await fs.mkdtemp(path.join(tmp, 'careers-'));
const siteDir = path.join(fixture, 'site');
const seed = async (file, text) => { const target = path.join(fixture, file); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, text); };
const dataPath = 'studio-content/source/careers/data.json';
let server, refreshes = 0;
const sessions = [], errors = [];
async function until(predicate) { for (let index = 0; index < 200; index++) { if (predicate()) return; await delay(5); } throw new Error('Timed out waiting for recruitment editor'); }
const html = await fs.readFile(path.join(root, 'lib/admin.html'), 'utf8');
const scripts = await Promise.all(['careers-data.js', 'careers-admin.js', 'admin.js'].map(name => fs.readFile(path.join(root, 'source/assets/welkin', name), 'utf8')));
try {
  await seed('_config.yml', await fs.readFile(path.join(root, '_config.yml'), 'utf8'));
  await seed('site/_config.yml', await fs.readFile(path.join(root, 'studio-content/site.yml'), 'utf8'));
  await seed(dataPath, JSON.stringify(validated));
  await seed('site/source/careers/data.json', JSON.stringify(validated));
  const hexo = { source: { async process() {} }, async _generate() { refreshes++; } };
  const middleware = createStudioAdmin({ projectRoot: fixture, siteDir, hexo });
  server = http.createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const discovery = await (await fetch(base + '/__studio_api/status')).json();
  async function call(body) {
    const response = await fetch(base + '/__studio_api/careers', { method: body ? 'PUT' : 'GET', headers: { 'X-Studio-Session': discovery.nonce, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { code: response.status, data: await response.json() };
  }
  assert.equal((await fetch(base + '/__studio_api/careers')).status, 403);
  const state = (await call()).data;
  assert.equal((await call({ ...state, version: 'stale' })).code, 409);
  assert.equal((await call({ ...state, data: { ...state.data, jobs: [{ ...state.data.jobs[0], typeId: 'unknown' }] } })).code, 400);
  assert.equal(refreshes, 0);
  const update = structuredClone(state); update.data.jobs[0].title = '本地招募测试 🌿';
  assert.equal((await call(update)).code, 200);
  assert.equal(refreshes, 1);
  assert.equal((await call(update)).code, 409);
  const canonical = await fs.readFile(path.join(fixture, dataPath), 'utf8');
  assert.equal(canonical, await fs.readFile(path.join(siteDir, 'source/careers/data.json'), 'utf8'));
  assert.equal(JSON.parse(canonical).jobs[0].title, '本地招募测试 🌿');
  assert((await fs.readdir(path.join(fixture, 'work/admin-backups'))).some(name => name.endsWith('-careers.json')));
  await seed(dataPath, JSON.stringify({ ...validated, notice: '外部修改' }));
  assert.equal((await call({ data: validated, version: (await call()).data.version + 'stale' })).code, 409);

  const dom = new JSDOM(html, { url: base + '/admin/', runScripts: 'outside-only' }); sessions.push(dom);
  const win = dom.window, $ = id => win.document.getElementById(id);
  Object.assign(win, { jsyaml: yaml, TextEncoder, TextDecoder, AbortSignal, structuredClone, confirm: () => true, fetch: (url, options) => fetch(new URL(url, base + '/admin/'), options) });
  win.addEventListener('error', event => errors.push(event.error?.message));
  scripts.forEach(script => win.eval(script));
  await until(() => !$('workspace').hidden);
  $('careers-tab').click(); await until(() => !$('careers-editor').hidden);
  assert.equal($('careers-fields').querySelectorAll('[data-job-id]').length, 3);
  assert.equal($('post-editor').hidden, true);
  const clickText = text => { const button = [...$('careers-fields').querySelectorAll('button')].find(button => button.textContent === text); assert(button, text); button.click(); };
  const input = (node, value) => { node.value = value; node.dispatchEvent(new win.Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
  // Referenced types cannot be removed until their jobs are reassigned (including drafts).
  $('careers-fields').querySelectorAll('.careers-admin-taxonomy')[1].querySelector('button').click();
  assert($('status').textContent.includes('仍有关联职位'));
  assert.equal($('careers-fields').querySelectorAll('.careers-admin-taxonomy')[1].querySelectorAll('input').length, 4);
  clickText('＋ 添加招聘方向');
  input($('careers-fields').querySelector('.careers-admin-taxonomy').lastElementChild.querySelector('input'), '训练与协作');
  clickText('＋ 添加招聘类型');
  input($('careers-fields').querySelectorAll('.careers-admin-taxonomy')[1].lastElementChild.querySelector('input'), '战术指导');
  clickText('＋ 添加职位');
  let job = $('careers-fields').querySelector('[data-job-id]:last-of-type');
  // Use the final job explicitly, independent of DOM sibling element types.
  job = [...$('careers-fields').querySelectorAll('[data-job-id]')].at(-1);
  assert.equal(job.open, true); assert.equal(job.querySelector('[data-career-field=status]').value, 'draft');
  input(job.querySelector('[data-career-field=title]'), '新增战术指导');
  const directionId = [...job.querySelector('[data-career-field=directionId]').options].at(-1).value;
  const typeId = [...job.querySelector('[data-career-field=typeId]').options].at(-1).value;
  input(job.querySelector('[data-career-field=directionId]'), directionId);
  input(job.querySelector('[data-career-field=typeId]'), typeId);
  input(job.querySelector('[data-career-field=status]'), 'published');
  input($('careers-fields').querySelector('[data-career-field=url]'), 'mailto:recruit@example.com');
  input($('careers-fields').querySelector('[data-career-field=guidelines]'), '自愿报名，有偿任务另行确认。');
  input($('careers-fields').querySelector('[data-career-field=disclaimer]'), '不影响依法享有的权利。');
  // Renaming an existing category updates all job dropdown labels without losing edits.
  input($('careers-fields').querySelectorAll('.careers-admin-taxonomy')[1].lastElementChild.querySelector('input'), '战术协作');
  assert.equal([...job.querySelector('[data-career-field=typeId]').options].at(-1).textContent, '战术协作');
  $('save').click(); await until(() => $('status').textContent.includes('招聘信息已保存'));
  let saved = (await call()).data;
  assert.equal(saved.data.jobs.length, 4); assert.equal(saved.data.jobs.at(-1).title, '新增战术指导');
  assert.equal(saved.data.jobs.at(-1).typeId, typeId); assert.equal(saved.data.types.at(-1).label, '战术协作');
  assert.equal(saved.data.application.url, 'mailto:recruit@example.com');
  assert.equal(saved.data.application.guidelines, '自愿报名，有偿任务另行确认。');
  assert.equal(saved.data.application.disclaimer, '不影响依法享有的权利。');
  // Discard reload actually discards and remains in the recruitment editor.
  input(job.querySelector('[data-career-field=title]'), '不应保存的修改');
  $('reload').click(); await until(() => !$('save').textContent.includes('·') && !$('careers-editor').hidden);
  assert.equal([...$('careers-fields').querySelectorAll('[data-career-field=title]')].at(-1).value, '新增战术指导');
  job = [...$('careers-fields').querySelectorAll('[data-job-id]')].at(-1); job.open = true; job.querySelector('button').click();
  assert.equal($('careers-fields').querySelectorAll('[data-job-id]').length, 3);
  $('careers-fields').querySelectorAll('.careers-admin-taxonomy')[1].lastElementChild.querySelector('button').click();
  assert.equal($('careers-fields').querySelectorAll('.careers-admin-taxonomy')[1].querySelectorAll('input').length, 4);
  // Switching editors saves pending deletions first.
  $('posts-tab').click(); await until(() => $('careers-editor').hidden);
  saved = (await call()).data; assert.equal(saved.data.jobs.length, 3); assert.equal(saved.data.types.length, 4);
  assert.equal($('editor-empty').hidden, false);

  // Static-host GitHub editing: UTF-8 round trip and optimistic file version in Contents API.
  const docs = new Map([['_config.yml', await fs.readFile(path.join(root, '_config.yml'), 'utf8')], ['studio-content/site.yml', await fs.readFile(path.join(root, 'studio-content/site.yml'), 'utf8')], [dataPath, JSON.stringify(validated)]]);
  let sha = 'careers-v1', put = null;
  const online = new JSDOM(html, { url: 'https://studio.example/admin/', runScripts: 'outside-only' }); sessions.push(online);
  const ow = online.window, oq = id => ow.document.getElementById(id);
  Object.assign(ow, { jsyaml: yaml, TextEncoder, TextDecoder, AbortSignal, structuredClone, confirm: () => true });
  ow.addEventListener('error', event => errors.push(event.error?.message));
  ow.fetch = async (url, options = {}) => {
    const target = new URL(url, 'https://studio.example/admin/');
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (target.pathname.endsWith('/__studio_api/status')) return reply({}, 404);
    assert.equal(target.origin, 'https://api.github.com'); assert.equal(options.headers.Authorization, 'Bearer TEST_ONLY');
    if (target.pathname.includes('/git/trees/')) return reply({ tree: [...docs.keys()].map(path => ({ path, type: 'blob' })) });
    const file = target.pathname.split('/contents/')[1]; assert(docs.has(file));
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body); assert.equal(file, dataPath);
      if (body.sha !== sha) return reply({ message: 'File changed' }, 409);
      put = body; docs.set(file, Buffer.from(body.content, 'base64').toString('utf8')); sha = 'careers-v2';
      return reply({ content: { sha } });
    }
    return reply({ type: 'file', encoding: 'base64', content: Buffer.from(docs.get(file)).toString('base64'), sha: file === dataPath ? sha : 'other-sha' });
  };
  scripts.forEach(script => ow.eval(script)); await until(() => !oq('connect-panel').hidden);
  oq('repo').value = 'example/studio'; oq('branch').value = 'main'; oq('token').value = 'TEST_ONLY';
  oq('connect-form').dispatchEvent(new ow.Event('submit', { bubbles: true, cancelable: true }));
  await until(() => !oq('workspace').hidden && !oq('connect-form').querySelector('button[type=submit]').disabled);
  oq('careers-tab').click(); await until(() => !oq('careers-editor').hidden);
  const titleInput = oq('careers-fields').querySelector('[data-career-field=headline]'); titleInput.value = '你好，新队友 🌿'; titleInput.dispatchEvent(new ow.Event('input', { bubbles: true }));
  oq('save').click(); await until(() => oq('status').textContent.includes('招聘信息已提交'));
  assert.equal(put.branch, 'main'); assert.equal(put.sha, 'careers-v1');
  assert.equal(JSON.parse(docs.get(dataPath)).headline, '你好，新队友 🌿');
  assert.equal(oq('careers-editor').inert, false);
  sha = 'external-edit'; titleInput.value = '过期编辑'; titleInput.dispatchEvent(new ow.Event('input', { bubbles: true }));
  oq('save').click(); await until(() => oq('status').classList.contains('is-error'));
  assert.equal(JSON.parse(docs.get(dataPath)).headline, '你好，新队友 🌿', 'Stale editor must not overwrite remote changes');
  assert.deepEqual(errors, []);
  console.log('PASS careers: schema, local authorization/conflicts/backups/mirrors/refresh, admin add/edit/delete/guard/draft/reload/switch, GitHub UTF-8 save/conflict');
} finally {
  sessions.forEach(dom => dom.window.close());
  if (server) await new Promise(resolve => server.close(resolve));
  assert(path.resolve(fixture).startsWith(path.resolve(tmp) + path.sep)); await fs.rm(fixture, { recursive: true, force: true });
}
