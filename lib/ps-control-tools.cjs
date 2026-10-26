'use strict';
const schema = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (maxLength = 500) => ({ type: 'string', minLength: 1, maxLength });
const int = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const enumeration = values => ({ type: 'string', enum: values });
const tool = (name, description, parameters) => ({ name, description, inputSchema: parameters });
const extraTools = [
  tool('configure_image_ai', '可选：为当前会话配置生图平台，以启用 generate_image / generate_layered_image。外部操控 AI 本身无需配置。Key 仅存于该会话内存，关闭会话即清除；使用 HTTPS 连接。', schema({ type: enumeration(['images', 'chat', 'gemini']), url: str(2000), model: str(160), key: { type: 'string', maxLength: 2000 }, proxy: { type: 'boolean' } }, ['type', 'url', 'model'])),
  tool('get_screenshot', '获取整个编辑器的截图（含工具栏与面板），坐标单位为 CSS 像素。', schema()),
  tool('inspect_ui', '列出可见按钮、输入框、菜单、工具提示和屏幕坐标。可配合 ui_action 操作所有界面工具。', schema()),
  tool('ui_action', '按屏幕坐标点击、拖动、滚动，或按键、输入文字。先 inspect_ui / get_screenshot 确认目标。', schema({ action: enumeration(['click', 'double_click', 'move', 'drag', 'scroll', 'key', 'type']), x: int(0, 4096), y: int(0, 4096), to_x: int(0, 4096), to_y: int(0, 4096), button: enumeration(['left', 'right', 'middle']), delta_x: int(-5000, 5000), delta_y: int(-5000, 5000), text: str(20000), key: str(100) }, ['action'])),
  tool('run_script', '执行编辑器 Photoshop 兼容脚本。支持 app.activeDocument、图层、选区、路径、滤镜、蒙版与 executeAction。仅在结构化工具无法满足时使用；不是 Node.js / 网页 JavaScript。执行后读取状态或截图核验。', schema({ code: str(50000) }, ['code'])),
  tool('open_file', '以 base64 上传图片或 PSD；作为新文档打开。后续可用脚本复制图层到其他文档。', schema({ name: str(160), data_base64: str(40000000) }, ['name', 'data_base64'])),
  tool('export_file', '导出当前文档；PSD 保留真实图层、蒙版与可编辑文字，PNG/JPG 是合成图。返回 base64 文件。', schema({ format: enumeration(['png', 'psd', 'jpg']) }, ['format'])),
  tool('list_documents', '列出会话中打开的文档及当前文档；切换可调用 run_script。', schema())
];
function fault(message, status = 400) { return Object.assign(new Error(message), { status }); }
  async function listTools(s) {
    const native = await s.page.evaluate(() => OnlinePS.ai.control.tools().map(t => ({ name: t.function.name, description: t.function.description, inputSchema: t.function.parameters })));
    return [...native, ...extraTools];
  }
  async function callTool(s, name, args) {
    const tools = await listTools(s), def = tools.find(t => t.name === name);
    if (!def) throw fault('未知工具。请先调用 list_tools 获取工具列表。');
    // Reuse the editor's strict validator, including nested geometry and enum limits.
    await s.page.evaluate(({ args, schema }) => OnlinePS.ai.control.validate(args, schema), { args, schema: def.inputSchema });
    if (name === 'configure_image_ai') return s.page.evaluate(args => OnlinePS.ai.configureRemoteImage(args), args);
    if (name === 'get_screenshot') return { mime_type: 'image/png', data_base64: (await s.page.screenshot({ type: 'png' })).toString('base64'), viewport: s.page.viewportSize() };
    if (name === 'inspect_ui') return s.page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight }, elements: [...document.querySelectorAll('button,input,textarea,select,[role="button"],.toolbtn,.contextpanel .label')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden').slice(0, 250).map(e => { const b = e.getBoundingClientRect(); return { tag: e.tagName.toLowerCase(), text: (e.getAttribute('aria-label') || e.title || e.textContent || e.getAttribute('placeholder') || '').trim().slice(0, 180), type: e.type, disabled: !!e.disabled, x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), width: Math.round(b.width), height: Math.round(b.height) }; }) }));
    if (name === 'ui_action') {
      const p = s.page, xy = () => { for (const key of ['x', 'y']) if (args[key] === undefined || args[key] >= p.viewportSize()[key === 'x' ? 'width' : 'height']) throw fault('请提供视口范围内的 x / y 坐标。'); };
      if (['click', 'double_click', 'move', 'drag', 'scroll'].includes(args.action)) xy();
      if (args.action === 'click') await p.mouse.click(args.x, args.y, { button: args.button || 'left' });
      if (args.action === 'double_click') await p.mouse.dblclick(args.x, args.y, { button: args.button || 'left' });
      if (args.action === 'move') await p.mouse.move(args.x, args.y);
      if (args.action === 'drag') {
        if (args.to_x === undefined || args.to_y === undefined || args.to_x >= p.viewportSize().width || args.to_y >= p.viewportSize().height) throw fault('拖动需要视口范围内的 to_x / to_y。');
        await p.mouse.move(args.x, args.y); await p.mouse.down({ button: args.button || 'left' });
        try { await p.mouse.move(args.to_x, args.to_y, { steps: 20 }); } finally { await p.mouse.up({ button: args.button || 'left' }); }
      }
      if (args.action === 'scroll') { await p.mouse.move(args.x, args.y); await p.mouse.wheel(args.delta_x || 0, args.delta_y || 0); }
      if (args.action === 'key') { if (!args.key) throw fault('按键操作需要 key，例如 Control+z。'); await p.keyboard.press(args.key); }
      if (args.action === 'type') { if (!args.text) throw fault('输入操作需要 text。'); await p.keyboard.insertText(args.text); }
      await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return { ok: true, state: await p.evaluate(() => OnlinePS.ai.control.snapshot()) };
    }
    if (name === 'open_file') {
      if (!/\.(png|jpe?g|gif|webp|bmp|tiff?|psd|xcf|svg|pdf|avif)$/i.test(args.name) || /[\\/\x00-\x1f]/.test(args.name)) throw fault('请提供不含路径的图片或 PSD 文件名。');
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(args.data_base64)) throw fault('文件必须是标准 base64，不带 data: 前缀。');
      const buffer = Buffer.from(args.data_base64, 'base64'); if (!buffer.length) throw fault('文件为空。');
      const before = await s.page.evaluate(() => OnlinePS.ai.app.r9.length);
      await s.page.locator('#local-open-input').setInputFiles({ name: args.name, mimeType: 'application/octet-stream', buffer });
      await s.page.waitForFunction(n => OnlinePS.ai.app.r9.length > n, before, { timeout: 20000 });
      return { ok: true, state: await s.page.evaluate(() => OnlinePS.ai.control.snapshot()) };
    }
    if (name === 'export_file') return s.page.evaluate(async format => OnlinePS.ai.control.exclusive(async () => {
      const { app, native } = OnlinePS.ai, doc = app.xK(); if (!doc) throw Error('请先打开或创建文档。');
      const raw = await native.exportFile(app, doc, format), bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw.buffer, raw.byteOffset || 0, raw.byteLength);
      let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return { name: doc.name.replace(/\.[^.]+$/, '') + '.' + format, mime_type: { png: 'image/png', jpg: 'image/jpeg', psd: 'image/vnd.adobe.photoshop' }[format], data_base64: btoa(binary), bytes: bytes.length };
    }), args.format);
    if (name === 'run_script') return s.page.evaluate(async code => OnlinePS.ai.control.exclusive(async () => { await OnlinePS.ai.native.controlScript(OnlinePS.ai.app, code); await new Promise(r => setTimeout(r, 50)); return { ok: true, state: OnlinePS.ai.control.snapshot() }; }), args.code);
    if (name === 'list_documents') return s.page.evaluate(() => ({ documents: OnlinePS.ai.app.r9.map((d, index) => ({ index, name: d.name, width: d.r, height: d.B, active: d === OnlinePS.ai.app.xK() })) }));
    return s.page.evaluate(({ name, args }) => OnlinePS.ai.control.execute(name, args), { name, args });
  }

module.exports = { extraTools, listTools, callTool };
