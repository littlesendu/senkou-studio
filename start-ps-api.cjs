'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { createControlServer } = require('./lib/ps-control-server.cjs');
const { loadControlToken } = require('./lib/ps-control-auth.cjs');
(async () => {
  const port = Number(process.env.PS_CONTROL_PORT || 4010);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PS_CONTROL_PORT 必须是 1–65535。');
  const folder = path.join(__dirname, 'work/ps-control');
  const token = await loadControlToken(folder, process.env.PS_CONTROL_TOKEN);
  const controller = await createControlServer({ token });
  const origin = await controller.listen(port, process.env.PS_CONTROL_HOST || '127.0.0.1');
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  const connection = path.join(folder, 'connection.json');
  await fs.writeFile(connection, JSON.stringify({ endpoint: origin + '/api/ps-control', token: controller.token, openapi: origin + '/api/ps-control/openapi.json', documentation: origin + '/ps/api/' }, null, 2), { mode: 0o600 });
  console.log('在线 PS 控制服务：' + origin + '/api/ps-control');
  console.log('接口文档：' + origin + '/ps/api/');
  console.log('aibot 连接信息（含令牌，仅本机保存）：' + connection);
  console.log('访问令牌会保留，重启后继续有效。请勿将连接文件或令牌提交到仓库。');
  console.log('按 Ctrl+C 停止。默认仅本机可访问；远程 aibot 需将此服务部署到可访问的服务器。');
  let stopped = false;
  async function stop() { if (stopped) return; stopped = true; await controller.close(); process.exit(0); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
})().catch(error => { console.error(error.message); process.exitCode = 1; });