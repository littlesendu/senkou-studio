import { handlePSControl } from '../../../lib/ps-control-proxy.mjs';
export function onRequest(context) { return handlePSControl(context); }