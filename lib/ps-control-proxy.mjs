/** EdgeOne routes this endpoint to the persistent browser controller.
 * The browser worker is a separate service; cloud functions are stateless.
 * Credentials are operator-configured and are never taken from the request body.
 */
export async function handlePSControl({ request, env = {} }, options = {}) {
  const url = new URL(request.url), openapi = url.pathname.endsWith('/openapi.json');
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  if (!['GET', 'POST'].includes(request.method) || (openapi && request.method !== 'GET')) return json({ error: { message: '仅支持 GET / POST。' } }, 405);
  if (!env.PS_CONTROL_URL) return json({ name: 'Senkou Online PS Control API', version: '1.0.0', ready: false, documentation: '/ps/api/', error: { code: 'WORKER_NOT_CONFIGURED', message: '尚未配置浏览器控制服务。管理员需先运行 npm run start:ps-api，再设置 PS_CONTROL_URL。静态编辑页面不是控制 API。' } }, request.method === 'POST' ? 503 : 200);
  let worker;
  try { worker = new URL(env.PS_CONTROL_URL); if (!/^https?:$/.test(worker.protocol) || worker.username || worker.password || worker.search || worker.hash) throw Error(); } catch { return json({ error: { message: '管理员配置的 PS_CONTROL_URL 无效。' } }, 503); }
  worker.pathname = worker.pathname.replace(/\/+$/, '').replace(/\/api\/ps-control$/, '') + '/api/ps-control' + (openapi ? '/openapi.json' : '');
  const headers = new Headers({ Accept: 'application/json' });
  // Forward the caller's bearer credential. Do not replace it with an admin secret:
  // a public function must not silently grant browser access to anonymous users.
  if (request.headers.has('authorization')) headers.set('authorization', request.headers.get('authorization'));
  let body;
  if (request.method === 'POST') {
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return json({ error: { message: '请使用 application/json。' } }, 415);
    const chunks = []; let total = 0; const reader = request.body?.getReader();
    if (reader) try { while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > 5 * 1024 * 1024) { await reader.cancel(); return json({ error: { message: '网站转发请求上限 5 MB；大文件请直连控制服务。' } }, 413); } chunks.push(value); } } finally { reader.releaseLock(); }
    body = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
    headers.set('Content-Type', 'application/json');
  }
  try {
    const response = await (options.fetch || fetch)(worker, { method: request.method, headers, body, redirect: 'error', signal: AbortSignal.any([request.signal, AbortSignal.timeout(110000)]) });
    if (!response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); return json({ error: { message: '浏览器控制服务没有返回 JSON，请检查 PS_CONTROL_URL 是否误填为前端页面。' } }, 502); }
    // Keep advertised routes on this website rather than exposing a private worker hostname.
    if (request.method === 'GET' && !openapi && response.ok) { await response.body?.cancel(); return json({ name: 'Senkou Online PS Control API', version: '1.0.0', ready: true, endpoint: '/api/ps-control', openapi: '/api/ps-control/openapi.json', documentation: '/ps/api/', authentication: 'Authorization: Bearer <PS_CONTROL_TOKEN>', actions: ['create_session', 'list_sessions', 'close_session', 'list_tools', 'call_tool'] }); }
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch { return json({ error: { message: '浏览器控制服务无法连接或操作超时。请检查服务运行状态与 PS_CONTROL_URL。' } }, 502); }
}