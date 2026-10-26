'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { chromium } = require('playwright');
const { openapi } = require('./ps-control-schema.cjs');
const { createPSAIMiddleware } = require('./ps-ai-node.cjs');

const API = '/api/ps-control';
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (maxLength = 500) => ({ type: 'string', minLength: 1, maxLength });
const int = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const enumeration = values => ({ type: 'string', enum: values });
const tool = (name, description, parameters) => ({ name, description, inputSchema: parameters });
const extraTools = [
  tool('configure_image_ai', '可选：为当前会话配置生图平台，以启用 generate_image / generate_layered_image。外部操控 AI 本身无需配置。Key 仅存于该会话内存，关闭会话即清除；使用 HTTPS 连接。', schema({ type: enumeration(['images', 'chat', 'gemini']), url: str(2000), model: str(160), key: { type: 'string', maxLength: 2000 }, proxy: { type: 'boolean' } }, ['type', 'url', 'model'])),
  tool('get_screenshot', '获取整个编辑器的截图（含工具栏与面板），坐标单位为 CSS 像素。', schema()),
  tool('inspect_ui', '列出可见按钮、输入框、菜单、工具提示和屏幕坐标。可配合 ui_action 操作所有界面工具。', schema()),
  tool('ui_action', '按屏幕坐标点击、拖动、滚动，或按键、输入文字。先 inspect_ui / get_screenshot 确认目标。', schema({ action: enumeration(['click', 'double_click', 'move', 'drag', 'scroll', 'key', 'type']), x: int(0, 4096), y: int(0, 4096), to_x: int(0, 4096), to_y: int(0, 4096), button: enumeration(['left', 'right', 'middle']), delta_x: int(-5000, 5000), delta_y: int(-5000, 5000), text: str(20000), key: str(100) }, ['action'])),
  tool('run_script', '执行编辑器 Photoshop 兼容脚本。支持 app.activeDocument、图层、选区、路径、滤镜、蒙版与 executeAction。仅在结构化工具无法满足时使用；不是 Node.js / 网页 JavaScript。执行后读取状态或截图核验。', schema({ code: str(50000) }, ['code'])),
  tool('open_file', '以 base64 上传图片或 PSD；作为新文档打开。后续可用脚本复制图层到其他文档。', schema({ name: str(160), data_base64: str(40000000) }, ['name', 'data_base64'])),
  tool('export_file', '导出当前文档；PSD 保留真实图层、蒙版与可编辑文字，PNG/JPG 是合成图。返回 base64 文件。', schema({ format: enumeration(['png', 'psd', 'jpg']) }, ['format'])),
  tool('list_documents', '列出会话中打开的文档及当前文档；切换可调用 run_script。', schema())
];
const allowedActions = ['create_session', 'list_sessions', 'close_session', 'list_tools', 'call_tool'];
function fault(message, status = 400) { return Object.assign(new Error(message), { status }); }
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); }
function validToken(req, token) { const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || ''); if (!match) return false; const got = Buffer.from(match[1]), want = Buffer.from(token); return got.length === want.length && timingSafeEqual(got, want); }
async function readJSON(req, limit) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fault('请使用 Content-Type: application/json。', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw fault('请求过大，请缩小上传文件。', 413); chunks.push(chunk); }
  try { const body = JSON.parse(Buffer.concat(chunks)); if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error(); return body; } catch { throw fault('请求体必须是 JSON 对象。'); }
}
function discovery(origin = '') {
  return { name: 'Senkou Online PS Control API', version: '1.0.0', ready: true, endpoint: origin + API, openapi: origin + API + '/openapi.json', documentation: origin + '/ps/api/', authentication: 'Authorization: Bearer <PS_CONTROL_TOKEN>', transport: 'HTTP JSON', actions: allowedActions, note: '创建独立编辑器会话，再 list_tools / call_tool。操作结果含真实文档状态，可导出 PSD。此服务不会控制访客原有浏览器标签页。' };
}
async function createControlServer(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, '../source/ps'));
  const token = options.token || process.env.PS_CONTROL_TOKEN || randomBytes(32).toString('hex');
  if (token.length < 24 || /[\r\n]/.test(token)) throw Error('PS_CONTROL_TOKEN 至少需要 24 个字符，且不能有换行。');
  const sessions = new Map(); let browser, launching, origin, closing = false, starting = 0;
  const maxSessions = options.maxSessions || 4, idleMs = options.idleMs || 30 * 60 * 1000, timeoutMs = options.timeoutMs || 90000;
  const aiMiddleware = createPSAIMiddleware({ env: options.env || process.env });
  async function getBrowser() {
    if (browser?.isConnected()) return browser;
    if (!launching) launching = chromium.launch({ channel: options.channel ?? process.env.EDITOR_BROWSER_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined), headless: options.headless !== false }).then(b => (browser = b)).finally(() => { launching = null; });
    return launching;
  }
  async function closeSession(id) { const s = sessions.get(id); if (!s) return; sessions.delete(id); await s.context.close().catch(() => {}); }
  async function bounded(session, fn) {
    if (session.busy) throw fault('这个会话正在运行另一个命令。请等待完成后再调用。', 409);
    session.busy = true; let timer;
    try { return await Promise.race([fn(), new Promise((_, reject) => { timer = setTimeout(() => { closeSession(session.id); reject(fault('操作超时，会话已关闭，防止后台继续修改。请创建新会话。', 504)); }, timeoutMs); })]); }
    finally { clearTimeout(timer); session.busy = false; session.lastUsed = Date.now(); }
  }
  async function createSession(body) {
    if (closing) throw fault('服务正在关闭。', 503);
    if (sessions.size + starting >= maxSessions) throw fault('会话已满，请关闭不用的会话。', 429);
    for (const [key, min, max] of [['width', 640, 2560], ['height', 480, 1600]]) if (body[key] !== undefined && (!Number.isInteger(body[key]) || body[key] < min || body[key] > max)) throw fault(`${key} 超出允许范围 ${min}–${max}。`);
    starting++; let context;
    try {
      context = await (await getBrowser()).newContext({ viewport: { width: body.width || 1440, height: body.height || 960 }, locale: 'zh-CN', acceptDownloads: true });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      // A session can use network AI/image tools, but imported web pages cannot navigate the controller away.
      page.on('dialog', dialog => dialog.dismiss().catch(() => {}));
      const id = randomBytes(18).toString('hex'), session = { id, context, page, busy: false, lastUsed: Date.now() };
      context.on('close', () => sessions.delete(id));
      await page.goto(origin + '/ps/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => !!window.OnlinePS?.ai?.control && !!document.body.dataset.editorVersion, null, { timeout: 60000 });
      sessions.set(id, session);
      return { session_id: id, viewport: page.viewportSize(), idle_timeout_seconds: Math.round(idleMs / 1000) };
    } catch (error) { await context?.close().catch(() => {}); throw error; }
    finally { starting--; }
  }
  async function listTools(s) {
    const native = await s.page.evaluate(() => OnlinePS.ai.control.tools().map(t => ({ name: t.function.name, description: t.function.description, inputSchema: t.function.parameters })));
    return [...native, ...extraTools];
  }
  async function callTool(s, name, args) {
    const tools = await listTools(s), def = tools.find(t => t.name === name);
    if (!def) throw fault('未知工具。请先调用 list_tools 获取工具列表。');
    // Reuse the editor's strict validator, including nested geometry and enum limits.
    await s.page.evaluate(({ args, schema }) => OnlinePS.ai.control.validate(args, schema), { args, schema: def.inputSchema });
    if (name === 'configure_image_ai') return s.page.evaluate(args => OnlinePS.ai.configureRemoteImage(args), args);
    if (name === 'get_screenshot') return { mime_type: 'image/png', data_base64: (await s.page.screenshot({ type: 'png' })).toString('base64'), viewport: s.page.viewportSize() };
    if (name === 'inspect_ui') return s.page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight }, elements: [...document.querySelectorAll('button,input,textarea,select,[role="button"],.toolbtn,.contextpanel .label')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').slice(0, 250).map(e => { const b = e.getBoundingClientRect(); return { tag: e.tagName.toLowerCase(), text: (e.getAttribute('aria-label') || e.title || e.textContent || e.getAttribute('placeholder') || '').trim().slice(0, 180), type: e.type, disabled: !!e.disabled, x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), width: Math.round(b.width), height: Math.round(b.height) }; }) }));
    if (name === 'ui_action') {
      const p = s.page, xy = () => { for (const key of ['x', 'y']) if (args[key] === undefined || args[key] >= p.viewportSize()[key === 'x' ? 'width' : 'height']) throw fault('请提供视口范围内的 x / y 坐标。'); };
      if (['click', 'double_click', 'move', 'drag', 'scroll'].includes(args.action)) xy();
      if (args.action === 'click') await p.mouse.click(args.x, args.y, { button: args.button || 'left' });
      if (args.action === 'double_click') await p.mouse.dblclick(args.x, args.y, { button: args.button || 'left' });
      if (args.action === 'move') await p.mouse.move(args.x, args.y);
      if (args.action === 'drag') {
        if (args.to_x === undefined || args.to_y === undefined || args.to_x >= p.viewportSize().width || args.to_y >= p.viewportSize().height) throw fault('拖动需要视口范围内的 to_x / to_y。');
        await p.mouse.move(args.x, args.y); await p.mouse.down({ button: args.button || 'left' });
        try { await p.mouse.move(args.to_x, args.to_y, { steps: 20 }); } finally { await p.mouse.up({ button: args.button || 'left' }); }
      }
      if (args.action === 'scroll') { await p.mouse.move(args.x, args.y); await p.mouse.wheel(args.delta_x || 0, args.delta_y || 0); }
      if (args.action === 'key') { if (!args.key) throw fault('按键操作需要 key，例如 Control+z。'); await p.keyboard.press(args.key); }
      if (args.action === 'type') { if (!args.text) throw fault('输入操作需要 text。'); await p.keyboard.insertText(args.text); }
      await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return { ok: true, state: await p.evaluate(() => OnlinePS.ai.control.snapshot()) };
    }
    if (name === 'open_file') {
      if (!/\.(png|jpe?g|gif|webp|bmp|tiff?|psd|xcf|svg|pdf|avif)$/i.test(args.name) || /[\\/\x00-\x1f]/.test(args.name)) throw fault('请提供不含路径的图片或 PSD 文件名。');
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(args.data_base64)) throw fault('文件必须是标准 base64，不带 data: 前缀。');
      const buffer = Buffer.from(args.data_base64, 'base64'); if (!buffer.length) throw fault('文件为空。');
      const before = await s.page.evaluate(() => OnlinePS.ai.app.r9.length);
      await s.page.locator('#local-open-input').setInputFiles({ name: args.name, mimeType: 'application/octet-stream', buffer });
      await s.page.waitForFunction(n => OnlinePS.ai.app.r9.length > n, before, { timeout: 20000 });
      return { ok: true, state: await s.page.evaluate(() => OnlinePS.ai.control.snapshot()) };
    }
    if (name === 'export_file') return s.page.evaluate(async format => OnlinePS.ai.control.exclusive(async () => {
      const { app, native } = OnlinePS.ai, doc = app.xK(); if (!doc) throw Error('请先打开或创建文档。');
      const raw = await native.exportFile(app, doc, format), bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw.buffer, raw.byteOffset || 0, raw.byteLength);
      let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return { name: doc.name.replace(/\.[^.]+$/, '') + '.' + format, mime_type: { png: 'image/png', jpg: 'image/jpeg', psd: 'image/vnd.adobe.photoshop' }[format], data_base64: btoa(binary), bytes: bytes.length };
    }), args.format);
    if (name === 'run_script') return s.page.evaluate(async code => OnlinePS.ai.control.exclusive(async () => { await OnlinePS.ai.native.controlScript(OnlinePS.ai.app, code); await new Promise(r => setTimeout(r, 50)); return { ok: true, state: OnlinePS.ai.control.snapshot() }; }), args.code);
    if (name === 'list_documents') return s.page.evaluate(() => ({ documents: OnlinePS.ai.app.r9.map((d, index) => ({ index, name: d.name, width: d.r, height: d.B, active: d === OnlinePS.ai.app.xK() })) }));
    return s.page.evaluate(({ name, args }) => OnlinePS.ai.control.execute(name, args), { name, args });
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'), pathname = url.pathname;
      if ((pathname === API || pathname === '/') && req.method === 'GET') return json(res, 200, discovery(''));
      if (pathname === API + '/openapi.json' && req.method === 'GET') return json(res, 200, openapi(origin));
      if (pathname === API) {
        if (req.method !== 'POST') return json(res, 405, { error: { message: '请使用 GET 发现接口，POST 执行命令。' } });
        if (!validToken(req, token)) return json(res, 401, { error: { message: '缺少或错误的 Bearer 访问令牌。' } });
        const body = await readJSON(req, options.maxBodyBytes || 32 * 1024 * 1024);
        const fields = { create_session: ['width', 'height'], list_sessions: [], close_session: ['session_id'], list_tools: ['session_id'], call_tool: ['session_id', 'name', 'arguments'] };
        if (!Object.hasOwn(fields, body.action)) throw fault('未知 action。支持：' + allowedActions.join(', '));
        for (const key of Object.keys(body)) if (key !== 'action' && !fields[body.action].includes(key)) throw fault('不支持的字段：' + key);
        if (body.action === 'create_session') { const created = await createSession(body); if (res.destroyed) { await closeSession(created.session_id); return; } return json(res, 200, created); }
        if (body.action === 'list_sessions') return json(res, 200, { sessions: [...sessions.values()].map(s => ({ session_id: s.id, busy: s.busy, last_used: new Date(s.lastUsed).toISOString() })) });
        const s = sessions.get(body.session_id); if (!s) throw fault('会话不存在或已过期。请先 create_session。', 404);
        if (body.action === 'close_session') { await closeSession(s.id); return json(res, 200, { ok: true }); }
        const result = await bounded(s, () => body.action === 'list_tools' ? listTools(s).then(tools => ({ tools })) : callTool(s, body.name, body.arguments));
        return json(res, 200, body.action === 'list_tools' ? result : { result });
      }
      if (pathname === '/api/ps-ai' || pathname === '/api/ps-images') return aiMiddleware(req, res, () => json(res, 404, { error: { message: '接口不存在。' } }));
      if (!pathname.startsWith('/ps/') || !['GET', 'HEAD'].includes(req.method)) return json(res, 404, { error: { message: '接口不存在。编辑器控制入口：' + API } });
      let relative; try { relative = decodeURIComponent(pathname.slice(4)); } catch { throw fault('路径编码无效。'); }
      const file = path.resolve(root, relative || 'index.html');
      if (!file.startsWith(root + path.sep) || relative.includes('\\') || relative.includes('\0')) throw fault('无效路径。', 403);
      let target = file; const stat = await fs.stat(target).catch(() => null); if (stat?.isDirectory()) target = path.join(target, 'index.html');
      const real = await fs.realpath(target).catch(() => null); if (!real || !real.startsWith(root + path.sep)) return json(res, 404, { error: { message: '文件不存在。' } });
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm' };
      res.writeHead(200, { 'Content-Type': mime[path.extname(real)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : await fs.readFile(real));
    } catch (error) { if (!res.headersSent) json(res, error.status || 400, { error: { message: error.message || '编辑器操作失败。' } }); else res.end(); }
  });
  const cleaner = setInterval(() => { for (const s of sessions.values()) if (!s.busy && Date.now() - s.lastUsed > idleMs) closeSession(s.id); }, Math.min(idleMs, 60000)); cleaner.unref();
  return {
    server, token, sessions,
    async listen(port = 4010, host = '127.0.0.1') {
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.removeListener('error', reject); resolve(); }); });
      const address = server.address(), hostname = ['0.0.0.0', '::'].includes(address.address) ? '127.0.0.1' : address.address; origin = 'http://' + (hostname.includes(':') ? '[' + hostname + ']' : hostname) + ':' + address.port; return origin;
    },
    async close() { closing = true; clearInterval(cleaner); await Promise.allSettled([...sessions.keys()].map(closeSession)); if (launching) await launching.catch(() => {}); await browser?.close(); await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); }); }
  };
}
module.exports = { createControlServer, discovery, openapi };