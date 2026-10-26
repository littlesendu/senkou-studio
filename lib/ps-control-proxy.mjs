/** Public website API: native EdgeOne sandbox by default; external workers remain optional. */
import { randomBytes } from 'node:crypto';
import { controlAccess } from './ps-control-access.mjs';
import { openapi as controlOpenAPI } from './ps-control-schema.cjs';

export async function handlePSControl({ request, env = {} }, options = {}) {
  const url = new URL(request.url), openapi = url.pathname.endsWith('/openapi.json') || url.searchParams.get('format') === 'openapi';
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  if (!['GET', 'POST'].includes(request.method) || (openapi && request.method !== 'GET')) return json({ error: { message: '仅支持 GET / POST。' } }, 405);
  // The public schema is available before configuring credentials or a worker.
  // EdgeOne request.url may contain an internal forwarding hostname.
  if (openapi) return json(controlOpenAPI(new URL(env.PAGES_BASE_URL || 'https://senkou.xyz').origin));
  const access = controlAccess(env, options.digest);
  if (!access.configured) return json({ name: 'Senkou Online PS Control API', ready: false, error: { code: 'ACCESS_NOT_CONFIGURED', message: '接口访问令牌配置无效，请检查 PS_CONTROL_TOKEN。' } }, request.method === 'POST' ? 503 : 200);
  if (request.method === 'POST' && !access.authorize(request.headers.get('authorization'))) {
    const response = json({ error: { code: 'UNAUTHORIZED', message: '缺少或错误的访问令牌。请使用 Authorization: Bearer <PS_CONTROL_TOKEN>。' } }, 401);
    response.headers.set('WWW-Authenticate', 'Bearer realm="online-ps"'); return response;
  }
  const native = !env.PS_CONTROL_URL;
  let worker;
  try {
    worker = native ? new URL('/ps-control-worker', env.PAGES_BASE_URL || 'https://senkou.xyz') : new URL(env.PS_CONTROL_URL);
    if (!/^https?:$/.test(worker.protocol) || worker.username || worker.password || worker.search || worker.hash) throw Error();
  } catch { return json({ error: { message: '管理员配置的服务地址无效。' } }, 503); }
  if (!native) worker.pathname = worker.pathname.replace(/\/+$/, '').replace(/\/api\/ps-control$/, '') + '/api/ps-control';
  const headers = new Headers({ Accept: 'application/json' });
  // Forward the caller's bearer credential. Do not replace it with an admin secret:
  // a public function must not silently grant browser access to anonymous users.
  if (request.headers.has('authorization')) headers.set('authorization', request.headers.get('authorization'));
  let body;
  if (request.method === 'POST') {
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return json({ error: { message: '请使用 application/json。' } }, 415);
    // EdgeOne hands the body over as arrayBuffer(), text() or a web stream depending on the
    // runtime. Accept all three, and report failures as JSON instead of a platform error page.
    try {
      if (typeof request.arrayBuffer === 'function') body = new Uint8Array(await request.arrayBuffer());
      else if (typeof request.text === 'function') body = new TextEncoder().encode(await request.text());
      else if (request.body?.getReader) {
        const chunks = []; let total = 0; const reader = request.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > 5 * 1024 * 1024) { await reader.cancel(); return json({ error: { message: '网站接口请求上限为 5 MB，请缩小上传文件。' } }, 413); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        body = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
      }
    } catch { return json({ error: { message: '读取请求体失败，请重试。' } }, 400); }
    body ??= new Uint8Array(0);
    if (body.byteLength > 5 * 1024 * 1024) return json({ error: { message: '网站接口请求上限为 5 MB，请缩小上传文件。' } }, 413);
    if (!body.byteLength) return json({ error: { message: '请求体不能为空。' } }, 400);
    headers.set('Content-Type', 'application/json');
    if (native) {
      let input; try { input = JSON.parse(new TextDecoder().decode(body)); } catch { return json({ error: { message: '请求体必须是 JSON 对象。' } }, 400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: { message: '请求体必须是 JSON 对象。' } }, 400);
      let id;
      // The platform caps makers-conversation-id at 36 characters of [0-9a-zA-Z-_.],
      // so a session is a bare 32-character hex id and the fixed names stay short too.
      if (input.action === 'create_session') id = randomBytes(16).toString('hex');
      else if (input.action !== 'list_sessions' && input.action !== 'diagnose') { id = input.session_id; if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) return json({ error: { message: 'session_id 无效，请先 create_session。' } }, 400); }
      headers.set('makers-conversation-id', id || 'pscindex');
    }
  }
  if (native && request.method === 'GET') headers.set('makers-conversation-id', 'pscdiscovery');
  // Not every EdgeOne runtime exposes request.signal; AbortSignal.any() rejects undefined members.
  const timeout = AbortSignal.timeout(110000);
  const signal = request.signal && typeof request.signal.addEventListener === 'function' ? AbortSignal.any([request.signal, timeout]) : timeout;
  try {
    const response = await (options.fetch || fetch)(worker, { method: request.method, headers, body, redirect: 'error', signal });
    if (!response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); return json({ error: { message: native ? '云端编辑器执行入口尚未生效，请检查 EdgeOne 是否完成本次 GitHub 自动部署。' : '浏览器控制服务没有返回 JSON，请检查 PS_CONTROL_URL。' } }, 502); }
    // Keep advertised routes on this website rather than exposing a private worker hostname.
    if (request.method === 'GET' && !openapi && response.ok) { await response.body?.cancel(); return json({ name: 'Senkou Online PS Control API', version: '1.0.0', ready: true, endpoint: '/api/ps-control', openapi: '/ps/api/openapi.json', documentation: '/ps/api/', authentication: 'Authorization: Bearer <PS_CONTROL_TOKEN>', execution: native ? 'edgeone-sandbox' : 'external-worker', actions: ['create_session', 'list_sessions', 'close_session', 'list_tools', 'call_tool'] }); }
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('PS control proxy failed:', error?.name || 'unknown', error?.cause?.code || '');
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return json({ error: { code: timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE', message: native ? (timedOut ? 'EdgeOne 云端编辑器执行超时，请重试。' : 'EdgeOne 云端编辑器执行入口暂时无法连接，请稍后重试。') : '浏览器控制服务无法连接或操作超时，请检查 PS_CONTROL_URL。' } }, 502);
  }
}