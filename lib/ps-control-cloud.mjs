/** Hosted editor executor. The platform supplies a per-session Chromium sandbox. */
import { controlAccess } from './ps-control-access.mjs';
import tools from './ps-control-tools.cjs';
const { listTools, callTool } = tools;
const actions = { create_session: ['width', 'height'], list_sessions: [], close_session: ['session_id'], list_tools: ['session_id'], call_tool: ['session_id', 'name', 'arguments'] };
const locks = new Set();
const fault = (message, status = 400, code = 'INVALID_REQUEST') => Object.assign(new Error(message), { status, code, publicMessage: true });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const header = (request, key) => request.headers?.get ? request.headers.get(key) : request.headers?.[key];
const idleMs = 30 * 60 * 1000;
const sessionMeta = item => item?.metadata?.ps_control;
async function sessions(store) {
  const found = await store.listConversations({ limit: 100, order: 'desc' });
  const rows = Array.isArray(found) ? found : found.items || found.conversations || [];
  return rows.map(sessionMeta).filter(s => s?.open && s.expires_at > Date.now());
}
export async function handleCloudControl(context, options = {}) {
  const { request, env = {} } = context;
  const access = controlAccess(env, options.digest);
  if (!['GET', 'POST'].includes(request.method)) return json({ error: { message: '仅支持 GET / POST。' } }, 405);
  if (!access.configured) return json({ ready: false, error: { code: 'ACCESS_NOT_CONFIGURED', message: '接口访问令牌配置无效。' } }, 503);
  if (request.method === 'GET') {
    try { const sandbox = context.sandbox; if (!sandbox) throw Error(); return json({ ready: true, execution: 'edgeone-sandbox' }); }
    catch { return json({ ready: false, error: { code: 'CLOUD_RUNTIME_UNAVAILABLE', message: '当前部署未启用 EdgeOne Agent 沙箱运行环境。' } }, 503); }
  }
  // Authentication precedes any sandbox allocation, store access or browser command.
  if (!access.authorize(header(request, 'authorization'))) {
    const response = json({ error: { code: 'UNAUTHORIZED', message: '缺少或错误的 Bearer 访问令牌。' } }, 401);
    response.headers.set('WWW-Authenticate', 'Bearer realm="online-ps"'); return response;
  }
  let browser, sandbox, timer, aborted, conversationId, held = false;
  let invalidated = false;
  try {
    const body = typeof request.json === 'function' ? await request.json() : request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.hasOwn(actions, body.action)) throw fault('请使用有效 action：' + Object.keys(actions).join(', '));
    if (Buffer.byteLength(JSON.stringify(body)) > 5 * 1024 * 1024) throw fault('网站接口请求上限为 5 MB。', 413);
    for (const key of Object.keys(body)) if (key !== 'action' && !actions[body.action].includes(key)) throw fault('不支持的字段：' + key);
    const store = context.store; if (!store) throw fault('云端会话存储尚未可用。', 503, 'CLOUD_STORE_UNAVAILABLE');
    if (body.action === 'list_sessions') return json({ sessions: (await sessions(store)).map(s => ({ session_id: s.session_id, last_used: new Date(s.last_used).toISOString() })) });
    conversationId = context.conversation_id;
    const id = conversationId?.match(/^ps-control-([a-f0-9]{36})$/)?.[1];
    if (!id || (body.action !== 'create_session' && body.session_id !== id)) throw fault('会话标识无效，请通过 /api/ps-control 调用。');
    for (const [key, min, max] of [['width', 640, 2560], ['height', 480, 1600]]) if (body[key] !== undefined && (!Number.isInteger(body[key]) || body[key] < min || body[key] > max)) throw fault(key + ' 超出允许范围。');
    if (locks.has(id)) throw fault('会话正在执行另一个操作，请等待完成。', 409, 'SESSION_BUSY');
    locks.add(id); held = true;
    let meta;
    if (body.action === 'create_session') {
      if ((await sessions(store)).length >= 4) throw fault('云端会话已满，请关闭不用的会话。', 429);
    } else {
      try { meta = sessionMeta(await store.getConversation({ conversationId })); } catch { /* absent / expired */ }
      if (!meta?.open || meta.expires_at <= Date.now()) throw fault('会话不存在或已过期，请先 create_session。', 404, 'SESSION_EXPIRED');
    }
    sandbox = context.sandbox; if (!sandbox) throw fault('当前部署没有可用的云端浏览器沙箱。', 503, 'CLOUD_RUNTIME_UNAVAILABLE');
    const invalidate = async () => {
      if (invalidated) return; invalidated = true;
      await Promise.allSettled([sandbox.kill(), store.updateConversation({ conversationId, metadata: { ps_control: { ...meta, open: false } } })]);
    };
    if (body.action === 'close_session') { await invalidate(); return json({ ok: true }); }
    const signal = request.signal;
    if (signal?.aborted) throw fault('请求已取消。', 499);
    let rejectCancelled;
    const cancelled = new Promise((_, reject) => { rejectCancelled = reject; });
    aborted = () => { invalidate(); rejectCancelled(fault('请求已取消，云端会话已关闭，防止后台继续修改。', 499)); };
    signal?.addEventListener('abort', aborted, { once: true });
    timer = setTimeout(() => { invalidate(); rejectCancelled(fault('操作超时，会话已关闭。请创建新会话。', 504)); }, options.timeoutMs || 100000);
    const execute = async () => {
      // A harmless SDK call initializes the managed sandbox; never construct sandbox credentials.
      await sandbox.commands.run('true', { timeout: 10 });
      // chromium.connectOverCDP relies on `this`; wrap it instead of passing the bare method.
      const connect = options.connect || (async (url, opts) => (await import('playwright')).chromium.connectOverCDP(url, opts));
      browser = await connect(sandbox.browser.cdpUrl, { timeout: 30000 });
      if (invalidated) { await browser.close(); throw fault('会话已取消。', 499); }
      const editorOrigin = new URL(options.editorOrigin || env.PAGES_BASE_URL || 'https://senkou.xyz').origin;
      const target = new URL('/ps/', editorOrigin); target.searchParams.set('control_session', id);
      const pageExists = p => { try { const url = new URL(p.url()); return url.origin === editorOrigin && url.pathname === '/ps/' && url.searchParams.get('control_session') === id; } catch { return false; } };
      let page = browser.contexts().flatMap(c => c.pages()).find(pageExists);
      if (body.action === 'create_session') {
        // Managed Chromium may expose no default context; create one instead of failing the session.
        const viewport = { width: body.width || 1440, height: body.height || 960 };
        const ctx = browser.contexts()[0] || await browser.newContext({ viewport, locale: 'zh-CN', acceptDownloads: true });
        page ||= await ctx.newPage();
        await page.setViewportSize(viewport);
        page.on('dialog', d => d.dismiss().catch(() => {}));
        await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForFunction(() => !!window.OnlinePS?.ai?.control && !!document.body.dataset.editorVersion, null, { timeout: 60000 });
        if (invalidated) throw fault('会话已取消。', 499);
        meta = { session_id: id, open: true, viewport: page.viewportSize(), last_used: Date.now(), expires_at: Date.now() + idleMs };
        await store.appendMessage({ conversationId, role: 'system', content: 'Online PS browser session created.' });
        await store.updateConversation({ conversationId, metadata: { ps_control: meta } });
        return { session_id: id, viewport: meta.viewport, idle_timeout_seconds: idleMs / 1000 };
      }
      if (!page || !await page.evaluate(() => !!window.OnlinePS?.ai?.control)) throw fault('云端浏览器会话已回收，请重新 create_session。', 404, 'SESSION_EXPIRED');
      page.setDefaultTimeout(10000);
      page.on('dialog', d => d.dismiss().catch(() => {}));
      const state = { id, page };
      const result = body.action === 'list_tools' ? { tools: await listTools(state) } : { result: await callTool(state, body.name, body.arguments) };
      if (invalidated) throw fault('会话已取消。', 499);
      meta.last_used = Date.now(); meta.expires_at = Date.now() + idleMs;
      await store.updateConversation({ conversationId, metadata: { ps_control: meta } });
      await sandbox.extendTimeout(idleMs / 1000);
      return result;
    };
    return json(await Promise.race([execute(), cancelled]));
  } catch (error) {
    if (!error.publicMessage) console.error('PS cloud operation failed:', error.code || error.name || 'unknown');
    return json({ error: { code: error.publicMessage ? error.code : 'CLOUD_EXECUTION_FAILED', message: error.publicMessage ? error.message : '云端编辑器执行失败。请检查 EdgeOne Agent 沙箱运行状态后重试。' } }, error.publicMessage ? error.status : 503);
  } finally {
    clearTimeout(timer); if (aborted) request.signal?.removeEventListener('abort', aborted);
    // CDP close disconnects this request; default browser context keeps the editor open.
    if (browser) await browser.close().catch(() => {});
    if (held) locks.delete(conversationId.slice('ps-control-'.length));
  }
}
