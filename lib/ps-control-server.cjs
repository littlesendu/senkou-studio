'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { chromium } = require('playwright');
const { openapi } = require('./ps-control-schema.cjs');
const { createPSAIMiddleware } = require('./ps-ai-node.cjs');

const API = '/api/ps-control';
const { listTools, callTool } = require('./ps-control-tools.cjs');
const allowedActions = ['create_session', 'list_sessions', 'close_session', 'list_tools', 'call_tool', 'diagnose'];
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
      const id = randomBytes(16).toString('hex'), session = { id, context, page, busy: false, lastUsed: Date.now() };
      context.on('close', () => sessions.delete(id));
      await page.goto(origin + '/ps/', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForFunction(() => !!window.OnlinePS?.ai?.control && !!document.body.dataset.editorVersion, null, { timeout: 60000 });
      sessions.set(id, session);
      return { session_id: id, viewport: page.viewportSize(), idle_timeout_seconds: Math.round(idleMs / 1000) };
    } catch (error) { await context?.close().catch(() => {}); throw error; }
    finally { starting--; }
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
        const fields = { create_session: ['width', 'height'], list_sessions: [], close_session: ['session_id'], list_tools: ['session_id'], call_tool: ['session_id', 'name', 'arguments'], diagnose: [] };
        if (!Object.hasOwn(fields, body.action)) throw fault('未知 action。支持：' + allowedActions.join(', '));
        for (const key of Object.keys(body)) if (key !== 'action' && !fields[body.action].includes(key)) throw fault('不支持的字段：' + key);
        if (body.action === 'diagnose') {
          const steps = [];
          try { const launched = await getBrowser(); steps.push({ step: 'browser', ok: true, version: launched.version() }); }
          catch (error) { steps.push({ step: 'browser', ok: false, error: String(error?.message || error).slice(0, 200) }); }
          return json(res, 200, { ready: steps.every(step => step.ok), execution: 'external-worker', steps });
        }
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