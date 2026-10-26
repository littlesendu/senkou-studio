import { handleCloudControl } from '../../lib/ps-control-cloud.mjs';
export function onRequest(context: any) { return handleCloudControl(context); }
