// A bounded, same-origin relay. Keys and image data stay in memory for this request only.
const DEFAULT_HOSTS = ['openaiapi.cc'];
const MAX_BODY = 6_000_000;
const AI_PATH = /^(?:\/v1\/(?:models|chat\/completions|responses|images\/(?:generations|edits))|\/v1beta\/models(?:\/[a-zA-Z0-9._-]+:generateContent)?)$/;
const json = (status, message) => new Response(JSON.stringify({ error: { message } }), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});
function hosts(env) {
  const list = env.PS_AI_ALLOWED_HOSTS === undefined ? DEFAULT_HOSTS : String(env.PS_AI_ALLOWED_HOSTS).split(',').map(host => host.trim().toLowerCase()).filter(Boolean);
  if (!list.length || list.some(host => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host))) throw Error('Invalid host configuration');
  return new Set(list);
}
async function readBody(request, limit, signal) {
  if (Number(request.headers.get('content-length')) > limit) throw Object.assign(Error('body limit'), { status: 413 });
  const reader = request.body?.getReader(); if (!reader) return undefined;
  const chunks = []; let length = 0;
  const cancel = () => reader.cancel().catch(() => {}); signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (signal.aborted) throw Error('cancelled'); if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw Object.assign(Error('body limit'), { status: 413 }); }
      chunks.push(value);
    }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
  const body = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}
export async function handleAIProxy(context, options = {}) {
  const request = context.request, env = context.env || {}, ownURL = new URL(request.url);
  const origin = request.headers.get('origin');
  if ((origin && origin !== ownURL.origin) || request.headers.get('sec-fetch-site') === 'cross-site') return json(403, '本站 AI 转发仅接受本站页面的请求。');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Allow': 'GET, POST, OPTIONS', 'Cache-Control': 'no-store' } });
  if (!['GET', 'POST'].includes(request.method)) return json(405, '本站 AI 转发只支持 GET 和 POST 请求。');
  let allowed;
  try { allowed = hosts(env); } catch { return json(503, '本站 AI 转发的域名配置有误，请联系网站管理员。'); }
  const target = request.headers.get('x-ai-upstream');
  if (!target && request.method === 'GET') return new Response(JSON.stringify({ service: 'online-ps-ai-proxy', version: 1, allowedHosts: [...allowed] }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  let url;
  try { url = new URL(target); } catch { return json(400, '缺少有效的 AI 接口地址。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !allowed.has(url.hostname)) return json(403, '本站转发尚未开放此接口域名。请使用平台直连，或由管理员在 PS_AI_ALLOWED_HOSTS 中添加可信域名。');
  if (!AI_PATH.test(url.pathname)) return json(403, '本站转发仅支持 AI 模型列表、对话和图像接口。');
  const isModels = /\/models$/.test(url.pathname);
  if ((request.method === 'GET') !== isModels) return json(405, '此 AI 接口不支持该请求方式。');
  const authorization = request.headers.get('authorization'), googleKey = request.headers.get('x-goog-api-key');
  if ((!authorization || !/^Bearer\s+\S+$/i.test(authorization)) && !googleKey?.trim()) return json(401, '请在 AI 设置中填写所选平台的 API Key。');
  const headers = new Headers({ Accept: 'application/json, text/event-stream' });
  if (authorization) headers.set('Authorization', authorization);
  if (googleKey) headers.set('x-goog-api-key', googleKey);
  const contentType = request.headers.get('content-type');
  if (request.method === 'POST') {
    if (!contentType || !/^(?:application\/json(?:;|$)|multipart\/form-data;\s*boundary=)/i.test(contentType)) return json(415, 'AI 转发仅支持 JSON 或图片表单请求。');
    headers.set('Content-Type', contentType);
  }
  const abort = new AbortController(), onAbort = () => abort.abort();
  request.signal.addEventListener('abort', onAbort, { once: true });
  if (request.signal.aborted) abort.abort();
  const timer = setTimeout(() => abort.abort(), options.timeoutMs ?? 110_000); timer.unref?.();
  const cleanup = () => { clearTimeout(timer); request.signal.removeEventListener('abort', onAbort); };
  let reader;
  try {
    const body = request.method === 'POST' ? await readBody(request, options.maxBodyBytes ?? MAX_BODY, abort.signal) : undefined;
    const response = await (options.fetch || fetch)(url.href, { method: request.method, headers, body, signal: abort.signal, redirect: 'error', credentials: 'omit' });
    const responseHeaders = { 'Content-Type': response.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (!response.body) { cleanup(); return new Response(null, { status: response.status, headers: responseHeaders }); }
    reader = response.body.getReader();
    const stream = new ReadableStream({
      async pull(controller) {
        try { const result = await reader.read(); if (result.done) { cleanup(); controller.close(); } else controller.enqueue(result.value); }
        catch { cleanup(); controller.error(new Error('AI 响应中断，请重试。')); }
      },
      async cancel() { abort.abort(); cleanup(); await reader.cancel().catch(() => {}); }
    });
    return new Response(stream, { status: response.status, headers: responseHeaders });
  } catch (error) {
    cleanup();
    if (error.status === 413) return json(413, '图片或对话内容超过本站转发的 6 MB 请求限制，请缩小参考图、开始新对话，或改用平台直连。');
    if (abort.signal.aborted) return json(504, 'AI 请求已取消或等待超时，请稍后重试。');
    return json(502, '本站无法连接此 AI 平台，请检查平台状态后重试。');
  }
}
