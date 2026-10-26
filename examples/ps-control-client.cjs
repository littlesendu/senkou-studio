'use strict';
// Node 20.19+: PS_CONTROL_ENDPOINT / PS_CONTROL_TOKEN, or the local connection.json.
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const saved = await fs.readFile(path.join(__dirname, '../work/ps-control/connection.json'), 'utf8').then(JSON.parse).catch(() => ({}));
  const endpoint = process.env.PS_CONTROL_ENDPOINT || saved.endpoint;
  const token = process.env.PS_CONTROL_TOKEN || saved.token;
  if (!endpoint || !token) throw Error('先启动 npm run start:ps-api，或设置 PS_CONTROL_ENDPOINT 与 PS_CONTROL_TOKEN。');
  async function api(body) {
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
    const data = await res.json(); if (!res.ok || data.error) throw Error(data.error?.message || 'HTTP ' + res.status); return data;
  }
  const { session_id } = await api({ action: 'create_session' });
  const call = async (name, args = {}) => (await api({ action: 'call_tool', session_id, name, arguments: args })).result;
  try {
    const { tools } = await api({ action: 'list_tools', session_id });
    console.log('可用工具：' + tools.map(t => t.name).join(', '));
    await call('create_document', { width: 800, height: 600, name: 'aibot 示例', background: 'white' });
    await call('draw_shape', { name: '薄荷色块', shape: 'rectangle', x: 80, y: 80, width: 640, height: 440, fill: '#cce9dd' });
    await call('add_text', { name: '标题', text: '你好，在线 PS', x: 120, y: 300, size: 52, color: '#173e32' });
    const state = await call('get_document'); console.log('真实图层：', state.layers.map(l => ({ name: l.name, text: l.text, empty: l.empty })));
    const output = path.join(__dirname, '../work/ps-control-example'); await fs.mkdir(output, { recursive: true });
    for (const format of ['png', 'psd']) { const file = await call('export_file', { format }); const target = path.join(output, 'aibot-example.' + format); await fs.writeFile(target, Buffer.from(file.data_base64, 'base64')); console.log('已导出：' + target); }
  } finally { await api({ action: 'close_session', session_id }); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });