// Offline browser regression checks; no live AI credentials or external requests.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../source/ps');
const mime = { '.html': 'text/html;charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) throw Error('path');
    let data = await fs.readFile(file);
    if (file.endsWith('pp1753360222.js')) data = Buffer.from(data.toString().replace('OnlinePS.install({', 'OnlinePS.install(window.debugNative={').replace('OnlinePS.start(senkouApp)', 'window.debugApp=senkouApp;OnlinePS.start(senkouApp)'));
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
function paired(messages) {
  let pending = new Set();
  for (const message of messages) {
    if (message.role === 'tool') {
      assert(pending.delete(message.tool_call_id), 'tool result must match a pending call');
    } else {
      assert.equal(pending.size, 0, 'finish every tool batch before another assistant/user message');
      if (message.tool_calls) pending = new Set(message.tool_calls.map(call => call.id));
    }
  }
  assert.equal(pending.size, 0, 'requests must not contain unfinished tool batches');
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  const errors = [], reports = [];
  let phase = 'long', round = 0, requests = [], continuing = false;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'zh-CN' });
    await context.addInitScript(() => localStorage.setItem('senkou.image-ai.v1', JSON.stringify({
      active: 'control', assistant: 'control', profiles: [{ id: 'control', name: 'Offline fixture', type: 'chat', url: 'https://assistant.test/v1', model: 'fixture-tools', key: 'synthetic-browser-only', remember: true }]
    })));
    await context.route('**/*', async route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      if (!route.request().url().startsWith('https://assistant.test/')) return route.abort();
      const body = route.request().postDataJSON(); requests.push(body); paired(body.messages);
      const fn = (name, args, index = 0) => ({ id: phase + '-' + round + '-' + index, type: 'function', function: { name, arguments: JSON.stringify(args) } });
      const shape = index => fn('draw_shape', { name: phase + ' ' + index, shape: 'rectangle', x: 10 + index % 12 * 8, y: 10 + Math.floor(index / 12) * 8, width: 5, height: 5, fill: '#173e32' }, index);
      let calls, content = null;
      if (continuing) {
        assert(body.messages.some(message => message.role === 'user' && String(message.content).includes('ORIGINAL-' + phase)), 'continuation retains the original task');
        assert(body.messages.some(message => message.role === 'assistant' && message.content?.includes('上下文已保留')));
        if (phase === 'rounds') {
          assert.equal(body.messages.filter(message => message.role === 'tool').length >= 60, true);
          calls = round === 0 ? [shape(60)] : undefined;
        } else if (phase === 'tools') {
          const deferred = body.messages.filter(message => message.role === 'tool' && JSON.parse(message.content).deferred);
          assert.equal(deferred.length, 2, 'unexecuted calls explicitly marked as deferred');
          calls = round === 0 ? [shape(70), shape(71)] : undefined;
        }
        if (!calls) content = '已完成剩余工作。';
      } else if (phase === 'long') {
        calls = round < 14 ? [shape(round * 3), shape(round * 3 + 1), shape(round * 3 + 2)] : undefined;
        if (!calls) content = '已完成长任务。';
      } else if (phase === 'rounds') calls = [shape(round * 2), shape(round * 2 + 1)];
      else if (phase === 'tools') calls = Array.from({ length: 12 }, (_, i) => shape(round * 12 + i));
      else if (phase === 'read-loop') calls = [fn('get_document', {})];
      else if (phase === 'error-loop') calls = [fn('resize_document', { width: 0, height: 10 })];
      else content = '新画布已收到。';
      round++;
      await route.fulfill({ json: { choices: [{ message: { role: 'assistant', content, ...(calls ? { tool_calls: calls } : {}) } }] } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.dismiss());
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.body.dataset.editorVersion);
    await page.evaluate(() => { debugNative.AI.script(debugApp, 'app.documents.add(160,120,72,"Budget fixture",null,0)'); OnlinePS.ai.open('assistant'); });
    // Avoid unnecessary previews so tests exercise the conversation, tools and native canvas only.
    const option = page.locator('.ai-chat-options'); await option.locator('summary').click();
    const preview = option.locator('input[type=checkbox]'); if (await preview.isChecked()) await preview.uncheck();
    const layerCount = () => page.evaluate(() => debugApp.xK().U.length);
    const initial = await layerCount();
    async function run(task, paused) {
      await page.locator('#ai-task').fill(task); await page.getByRole('button', { name: '发送', exact: true }).click();
      assert.equal(await page.locator('#ai-task').inputValue(), '');
      await page.locator('.ai-status').filter({ hasText: paused ? /^已暂停：/ : /^已完成，可在画布查看结果/ }).waitFor({ timeout: 45000 });
      assert.equal(await page.locator('.ai-status').getAttribute('data-error'), 'false');
      assert.equal(await page.getByRole('button', { name: '发送', exact: true }).isEnabled(), true);
    }
    await run('ORIGINAL-long: draw 42 marks over 14 replies.', false);
    assert.equal(round, 15); assert.equal(await layerCount(), initial + 42);
    reports.push({ task: phase, modelRounds: round, actualEdits: 42 });
    phase = 'rounds'; round = 0; requests = [];
    await run('ORIGINAL-rounds: draw 61 marks, leave the last one for continuation.', true);
    assert.equal(round, 30); assert.equal(await layerCount(), initial + 102);
    assert((await page.locator('.ai-status').innerText()).includes('30 轮'));
    const history = await page.locator('.assistant-log').innerText(); assert(history.includes('上下文已保留'));
    await page.locator('.ai-close').click(); await page.evaluate(() => OnlinePS.ai.open('assistant'));
    assert((await page.locator('.assistant-log').innerText()).includes('上下文已保留'));
    continuing = true; round = 0; await run('继续', false);
    assert.equal(round, 2); assert.equal(await layerCount(), initial + 103, 'resume executes only the remaining edit');
    reports.push({ task: phase, pausedAfter: 30, resumedEdits: 1 });
    phase = 'tools'; round = 0; requests = []; continuing = false;
    await run('ORIGINAL-tools: draw 72 marks.', true);
    assert.equal(round, 6); assert.equal(await layerCount(), initial + 173, 'never execute past 70 calls');
    assert((await page.locator('.ai-status').innerText()).includes('70 次'));
    continuing = true; round = 0; await run('继续剩下的两笔', false);
    assert.equal(round, 2); assert.equal(await layerCount(), initial + 175);
    reports.push({ task: phase, pausedAfter: 70, deferredEdits: 2 });
    for (const name of ['read-loop', 'error-loop']) {
      phase = name; round = 0; requests = []; continuing = false;
      await run('ORIGINAL-' + name, true);
      assert.equal(round, 3); assert.equal(await layerCount(), initial + 175);
      assert((await page.locator('.ai-status').innerText()).includes('连续重复'));
      reports.push({ task: phase, pausedAfter: 3 });
    }
    phase = 'new-document'; round = 0; requests = [];
    await page.evaluate(() => debugNative.AI.script(debugApp, 'app.documents.add(80,60,72,"Another canvas",null,0)'));
    await run('This is a different document.', false);
    assert.equal(requests[0].messages.filter(message => message.role === 'user').length, 1);
    assert.equal(requests[0].messages.some(message => message.role === 'tool'), false, 'switching documents clears stale tool context');
    assert.deepEqual(errors, []);
    console.log('PASS assistant limits: 14-round/42-edit task, 30-round pause/resume, 70-call partial-batch resume, idle/error loop guard, document switch; no browser errors.');
    await fs.mkdir(path.resolve(__dirname, '../work/editor-ai'), { recursive: true });
    await fs.writeFile(path.resolve(__dirname, '../work/editor-ai/assistant-limits-tests-20261024.json'), JSON.stringify(reports, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
