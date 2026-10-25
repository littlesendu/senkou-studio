import { handleAIProxy } from '../../lib/ps-ai-proxy.mjs';

export function onRequest(context) {
  return handleAIProxy(context);
}
