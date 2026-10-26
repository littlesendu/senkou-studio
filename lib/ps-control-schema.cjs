'use strict';
// Shared by the website build, EdgeOne entry and persistent browser service.
const API = '/api/ps-control';
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (maxLength = 500) => ({ type: 'string', minLength: 1, maxLength });
const int = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const enumeration = values => ({ type: 'string', enum: values });
const sessionId = { type: 'string', pattern: '^[a-f0-9]{32}$' };
function openapi(origin = '') {
  return { openapi: '3.1.0', info: { title: 'Senkou Online PS Control API', version: '1.0.0', description: '供 aibot / 外部 AI 调用的真实浏览器编辑服务。先 create_session，再读取 list_tools 并 call_tool，最后 export_file 与 close_session；工具 inputSchema 为实时权威参数，结果以文档状态和截图核验。执行端默认是 EdgeOne Agent 沙箱（每个会话独立 Chromium），设置 PS_CONTROL_URL 时改用外部浏览器服务。单次请求体 5 MB、单次执行 120 秒、最多 4 个会话、闲置 30 分钟回收；导出不受 5 MB 限制。排查用 diagnose。' }, servers: [{ url: origin || '/' }], paths: { [API]: {
    get: { operationId: 'discoverEditorAPI', summary: '获取连接信息', responses: { 200: { description: 'JSON discovery' } } },
    post: { operationId: 'controlOnlinePS', summary: '创建会话、发现工具或执行编辑', security: [{ bearerAuth: [] }], requestBody: { required: true, content: { 'application/json': { schema: { oneOf: [
      schema({ action: { const: 'create_session' }, width: int(640, 2560), height: int(480, 1600) }, ['action']),
      schema({ action: { const: 'list_sessions' } }, ['action']),
      schema({ action: { const: 'diagnose' } }, ['action']),
      schema({ action: enumeration(['close_session', 'list_tools']), session_id: sessionId }, ['action', 'session_id']),
      schema({ action: { const: 'call_tool' }, session_id: sessionId, name: str(100), arguments: { type: 'object' } }, ['action', 'session_id', 'name', 'arguments'])
    ] }, examples: { create: { value: { action: 'create_session' } }, tools: { value: { action: 'list_tools', session_id: '0123456789abcdef0123456789abcdef' } }, edit: { value: { action: 'call_tool', session_id: '0123456789abcdef0123456789abcdef', name: 'create_document', arguments: { width: 1200, height: 800, name: '海报', background: 'white' } } } } } } }, responses: { 200: { description: '成功；call_tool 返回 result，文件为 data_base64' }, 400: { description: '参数错误' }, 401: { description: '缺少或错误的访问令牌' }, 404: { description: '会话不存在或已过期' }, 409: { description: '会话正在运行另一个命令' }, 429: { description: '会话容量已满' }, 503: { description: '控制服务未就绪' }, 504: { description: '命令超时；会话已关闭，请新建会话' } } }
  } }, components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } } };
}
module.exports = { openapi };
