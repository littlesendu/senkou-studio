// Real editor integration tests with synthetic AI replies. No API credentials or external traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright'), sharp = require('sharp');
const root = path.resolve(__dirname, '../source/ps'), output = path.resolve(__dirname, '../work/editor-guardrails');
const mime = { '.html': 'text/html;charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm' };
let fontRequests = [], fontReleased = false, releaseFont;
const server = http.createServer(async (req, res) => {
  try {
    const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) throw Error('path');
    if (/\.(ttf|otf)$/.test(file)) fontRequests.push(name);
    if (file.endsWith('DroidSansFallback.ttf') && !fontReleased) await new Promise(resolve => { releaseFont = () => { fontReleased = true; resolve(); }; });
    let data = await fs.readFile(file);
    if (file.endsWith('pp1753360222.js')) data = Buffer.from(data.toString().replace('OnlinePS.install({', 'OnlinePS.install(window.debugNative={').replace('OnlinePS.start(senkouApp)', 'window.debugApp=senkouApp;OnlinePS.start(senkouApp)'));
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(data);
  } catch { res.writeHead(404).end(); }
});
(async () => {
  await fs.mkdir(output, { recursive: true }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined, headless: true });
  const errors = [], imageRequests = []; let batches = [], round = 0, results = [], imageMode = 'normal';
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'zh-CN', acceptDownloads: true });
    await context.addInitScript(() => {
      window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined;
      localStorage.setItem('senkou.image-ai.v1', JSON.stringify({ active: 'control', assistant: 'control', image: 'image', profiles: [
        { id: 'control', name: 'Control fixture', type: 'chat', url: 'https://assistant.test/v1', model: 'fixture' },
        { id: 'image', name: 'Image fixture', type: 'images', url: 'https://images.test/v1', model: 'fixture-image' }
      ] }));
    });
    await context.route('**/*', async route => {
      const request = route.request(); if (request.url().startsWith(origin)) return route.continue();
      if (request.url().startsWith('https://images.test/')) {
        const body = request.postDataJSON(); imageRequests.push(body);
        const transparent = body.background === 'transparent' && imageMode !== 'opaque';
        const image = imageMode === 'empty' ? sharp({ create: { width: 400, height: 300, channels: 4, background: '#00000000' } }) : transparent ? sharp({ create: { width: 80, height: 80, channels: 4, background: '#74bc9c' } }).extend({ left: 160, right: 160, top: 110, bottom: 110, background: '#00000000' }) : sharp({ create: { width: 400, height: 300, channels: 4, background: '#203c30' } });
        return route.fulfill({ json: { data: [{ b64_json: (await image.png().toBuffer()).toString('base64') }] } });
      }
      if (!request.url().startsWith('https://assistant.test/')) return route.abort();
      const body = request.postDataJSON(), lastUser = body.messages.findLastIndex(m => m.role === 'user');
      results = body.messages.slice(lastUser + 1).filter(m => m.role === 'tool').map(m => JSON.parse(m.content));
      assert.equal(body.tools.find(t => t.function.name === 'generate_layered_image').function.parameters.properties.layers.maxItems, 12);
      const actions = batches[round++], calls = actions?.map(([name, args], index) => ({ id: 'call-' + round + '-' + index, type: 'function', function: { name, arguments: JSON.stringify(args) } }));
      return route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: calls ? null : '检查结束。', ...(calls ? { tool_calls: calls } : {}) } }] } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', dialog => dialog.dismiss());
    await page.goto(origin, { waitUntil: 'networkidle' }); await page.waitForFunction(() => document.body.dataset.editorVersion); await page.evaluate(() => OnlinePS.ai.open('assistant'));
    async function start(actions, task = 'Fixture task') { batches = actions; round = 0; results = []; await page.locator('#ai-task').fill(task); await page.getByRole('button', { name: '发送', exact: true }).click(); }
    async function done() { await page.locator('.ai-status').filter({ hasText: '已完成，可在画布查看结果' }).waitFor(); return results; }
    async function run(actions, task) { await start(actions, task); return done(); }
    const create = ['create_document', { width: 400, height: 300, name: 'Guardrails', background: 'transparent' }];
    const title = { text: '中文可编辑标题', name: '真实标题', x: 395, y: 299, size: 90, color: '#74bc9c', font: 'MadeUp-DeepSeekFont' };
    await start([[create], [['add_text', title]]]);
    await page.waitForFunction(() => document.querySelector('.ai-status').textContent.includes('已完成 1 项编辑'));
    while (!releaseFont) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(await page.evaluate(() => debugApp.xK().U.filter(l => l.add.TySh).length), 0, 'Wait for a real font before creating text'); releaseFont();
    await done();
    const first = results.at(-1), textId = first.layer_id;
    assert(first.ok, JSON.stringify(first)); assert.equal(first.font, 'DroidSansFallback'); assert(first.corrections.some(t => t.includes('字体'))); assert(first.corrections.some(t => t.includes('画布')));
    function inCanvas(info, width = 400, height = 300) { const b = info.bounds; assert(!info.empty); assert(b.width > 0 && b.height > 0); assert(b.x >= 0 && b.y >= 0 && b.x + b.width <= width && b.y + b.height <= height, JSON.stringify(b)); }
    inCanvas(first.state.layers.find(l => l.id === textId));
    assert(!fontRequests.some(url => /MadeUp|DeepSeek/.test(url)), 'Never request an invented font');
    const count = await page.evaluate(() => debugApp.xK().U.length);
    await run([[['add_text', { ...title, text: ' \n\u200b ' }]]]); assert(!results[0].ok); assert(results[0].error.includes('可见内容')); assert.equal(await page.evaluate(() => debugApp.xK().U.length), count);
    await run([[['add_text', { ...title, text: '长'.repeat(1000), size: 512 }]]]); assert(!results[0].ok); assert(results[0].error.includes('分行'), JSON.stringify(results[0])); assert.equal(await page.evaluate(() => debugApp.xK().U.length), count, 'Failed layout restores the document');
    await run([[['edit_text', { layer_id: textId, text: '文字修复', font: '__proto__', size: 40, x: 30000, y: 30000 }]]]); assert(results[0].ok, JSON.stringify(results[0])); inCanvas(results[0].state.layers.find(l => l.id === textId)); assert.equal(results[0].font, 'DroidSansFallback');
    await run([[['move_layer', { layer_id: textId, dx: -30000, dy: 30000 }], ['transform_layer', { layer_id: textId, scale_percent: 200, angle: 15 }]]]); assert(results.every(r => r.ok), JSON.stringify(results)); inCanvas(results.at(-1).state.layers.find(l => l.id === textId));
    // Reproduce a legacy text layer with a missing font and an empty cached transform rectangle.
    await page.evaluate(id => {
      debugNative.AI.script(debugApp, 'app.activeDocument.activeLayer.textItem.font="LegacyMissingFont"');
      const layer = debugApp.xK().U.find(l => l.add.lyid === id); layer.S.x = layer.S.y = layer.S.r = layer.S.B = 0; layer.buffer = new Uint8Array(0);
    }, textId);
    await run([[['edit_text', { layer_id: textId, font: 'NotInstalled', x: 1000, y: 1000, size: 35 }]]]); assert(results[0].ok, JSON.stringify(results[0])); inCanvas(results[0].state.layers.find(l => l.id === textId));
    await run([[['get_fonts', { query: 'NotoSansSC' }], ['get_document', {}]]]); assert(results[0].fonts.some(f => f.id === 'NotoSansSCThin-Regular')); assert(results[1].layers.some(l => l.id === textId && !l.empty && l.kind === 'editable_text' && l.contents === '文字修复'));
    const emptyId = await page.evaluate(() => { debugNative.AI.script(debugApp, 'app.activeDocument.artLayers.add()'); return debugApp.xK().U[debugApp.xK().f[0]].add.lyid; });
    await run([[['get_document', {}], ['edit_layer', { layer_id: emptyId, name: '假艺术字' }]]]); assert(results[0].layers.find(l => l.id === emptyId).empty); assert(!results[1].ok && results[1].error.includes('空层'));
    const before = await page.evaluate(() => debugApp.xK().U.length);
    imageMode = 'empty'; await run([[['generate_image', { mode: 'generate', prompt: 'isolated object', layer_name: '空图', transparent_background: true }]]]); assert(!results[0].ok && results[0].error.includes('空图')); assert.equal(await page.evaluate(() => debugApp.xK().U.length), before);
    imageMode = 'opaque'; await run([[['generate_image', { mode: 'generate', prompt: 'isolated object', layer_name: '不透明前景', transparent_background: true }]]]); assert(!results[0].ok && results[0].error.includes('不透明')); assert.equal(await page.evaluate(() => debugApp.xK().U.length), before);
    const layers = Array.from({ length: 7 }, (_, i) => ({ layer_name: ['背景纹理', '主体人物', '主体道具', '前景叶片', '装饰圆环', '边框', '艺术字素材'][i], prompt: 'Only component ' + i + ', at fixed canvas coordinates; no other content.' }));
    imageMode = 'normal'; await run([[['generate_layered_image', { layers }]]]); assert(results[0].ok, JSON.stringify(results[0])); assert.equal(results[0].layers.length, 7); assert.equal(new Set(results[0].layers.map(l => l.id)).size, 7); assert(results[0].layers.slice(1).every(l => l.has_transparency));
    const reqs = imageRequests.slice(-7); assert.equal(reqs[0].background, undefined); assert(reqs.slice(1).every(r => r.background === 'transparent')); assert(reqs.every(r => r.prompt.includes('Layer contract:'))); assert(reqs[0].prompt.includes('Do not include foreground subjects'));
    await run([[['generate_layered_image', { layers: [{ layer_name: '背景', prompt: 'Background' }, { layer_name: '错误前景', prompt: 'Foreground', transparent_background: false }] }]]]); assert(!results[0].ok && results[0].error.includes('透明'));
    // No empty drawing layer when a real selection clips the entire requested shape.
    await run([[['select_rectangle', { x: 0, y: 0, width: 10, height: 10 }], ['draw_shape', { name: '被选区完全裁掉', shape: 'rectangle', x: 200, y: 200, width: 30, height: 30, fill: '#74bc9c' }], ['change_selection', { action: 'deselect' }]]]); assert(!results[1].ok && results[1].error.includes('实际像素'));
    // The corrected text remains editable with positive cached bounds after a PSD save/open roundtrip.
    await page.locator('.ai-close').click(); await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(output, 'validated-layers-1440.png') });
    const downloaded = page.waitForEvent('download');
    await page.locator('.topbar > span:first-of-type > button').filter({ hasText: /^文件$/ }).click();
    await page.locator('.contextpanel:visible .label').filter({ hasText: /^存储为 PSD$/ }).click();
    const psd = path.join(output, 'validated-text-layers.psd'); await (await downloaded).saveAs(psd);
    await page.evaluate(() => window.beforeRoundtrip = debugApp.xK()); await page.locator('#local-open-input').setInputFiles(psd);
    await page.waitForFunction(() => debugApp.xK() !== window.beforeRoundtrip && debugApp.xK()?.U.some(l => l.add.TySh));
    const exported = await page.evaluate(() => { const d = debugApp.xK(), l = d.U.find(l => l.add.TySh); return { ...debugNative.AI.layerInfo(d, l), id: l.add.lyid }; });
    inCanvas(exported); assert.equal(exported.font, 'DroidSansFallback'); assert.equal(exported.contents, '文字修复');
    await page.evaluate(() => OnlinePS.ai.open('assistant')); await run([[['transform_layer', { layer_id: exported.id, scale_percent: 80, angle: -15 }]]]); assert(results[0].ok, JSON.stringify(results[0])); inCanvas(results[0].state.layers.find(l => l.id === exported.id));
    assert.deepEqual(errors, []);
    console.log('Layer/text guardrails passed: 7 semantic component layers with genuine alpha and IDs; rejected opaque/empty images, empty layer renaming and selection-clipped drawing; wait for local glyphs, unknown/prototype font IDs, invisible/oversized text rollback, actual bounds fitting, legacy empty text repair, moves/rotation, real PSD text roundtrip and transform. All AI responses mocked; no external requests.');
  } finally { if (releaseFont) releaseFont(); await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
