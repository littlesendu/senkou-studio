'use strict';
const { Readable } = require('node:stream');

// Local preview uses the same request handler as the deployed cloud function.
function createPSAIMiddleware(options = {}) {
  const handler = import('./ps-ai-proxy.mjs');
  return async function psAI(req, res, next) {
    if (new URL(req.url, 'http://localhost').pathname !== '/api/ps-ai') return next();
    const abort = new AbortController();
    req.on('aborted', () => abort.abort());
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });
    try {
      const hasBody = !['GET', 'HEAD'].includes(req.method);
      const request = new Request('http://' + req.headers.host + req.url, { method: req.method, headers: req.headers, signal: abort.signal, ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}) });
      const response = await (await handler).handleAIProxy({ request, env: options.env || process.env }, options);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) {
        const stream = Readable.fromWeb(response.body);
        res.on('close', () => { if (!res.writableEnded) stream.destroy(); });
        stream.on('error', () => res.destroy()); stream.pipe(res);
      } else res.end();
    } catch {
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: { message: '本站 AI 转发暂不可用，请稍后重试。' } }));
    }
  };
}
module.exports = { createPSAIMiddleware };
