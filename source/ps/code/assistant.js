/* Tool-calling assistant. Models can only invoke the operations declared here. */
(function () {
  'use strict';
  const ui = window.OnlinePS;
  const integer = (description, minimum, maximum) => ({ type: 'integer', description, minimum, maximum });
  const text = (description, maxLength = 160) => ({ type: 'string', description, maxLength, minLength: 1 });
  const id = integer('图层 ID，从 get_document 获取，不是面板序号', 0, 2147483647);
  function tool(name, description, properties, required) {
    return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } };
  }
  const tools = [
    tool('get_document', '读取当前画布尺寸、选区和所有图层。操作前先读取；图层列表从底部到顶部。', {}, []),
    tool('create_document', '新建画布，保留已经打开的文档。', { width: integer('宽度，像素', 1, 4096), height: integer('高度，像素', 1, 4096), name: text('文档名称'), background: { type: 'string', enum: ['white', 'transparent'] } }, ['width', 'height', 'name', 'background']),
    tool('resize_document', '缩放整张图像到指定像素尺寸；保持比例时需计算另一边。', { width: integer('宽度', 1, 4096), height: integer('高度', 1, 4096) }, ['width', 'height']),
    tool('crop_document', '按像素矩形裁剪画布，坐标以左上角为原点。', { x: integer('左边', 0, 4095), y: integer('上边', 0, 4095), width: integer('宽度', 1, 4096), height: integer('高度', 1, 4096) }, ['x', 'y', 'width', 'height']),
    tool('rotate_document', '旋转整个画布，单位度。', { angle: { type: 'integer', enum: [90, -90, 180] } }, ['angle']),
    tool('flip_document', '翻转整个画布。', { axis: { type: 'string', enum: ['horizontal', 'vertical'] } }, ['axis']),
    tool('select_rectangle', '创建矩形选区。', { x: integer('左边', 0, 4095), y: integer('上边', 0, 4095), width: integer('宽度', 1, 4096), height: integer('高度', 1, 4096) }, ['x', 'y', 'width', 'height']),
    tool('change_selection', '全选、反选或取消选区。', { action: { type: 'string', enum: ['all', 'invert', 'deselect'] } }, ['action']),
    tool('add_text', '添加可编辑的文字图层。x、y 是文字基线的左端坐标；请保证文字在画布内。', { text: text('文字内容', 1000), name: text('图层名称'), x: integer('基线横坐标', 0, 4096), y: integer('基线纵坐标', 0, 4096), size: integer('字体像素大小', 6, 512), color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: '六位十六进制颜色，如 #ffffff' } }, ['text', 'name', 'x', 'y', 'size', 'color']),
    tool('edit_layer', '修改一个图层的名称、可见性或不透明度。仅提供需要修改的属性。', { layer_id: id, name: text('新名称'), visible: { type: 'boolean' }, opacity: { type: 'number', minimum: 0, maximum: 100 } }, ['layer_id']),
    tool('duplicate_layer', '复制指定图层，保留原图层。', { layer_id: id }, ['layer_id']),
    tool('move_layer', '按像素偏移移动图层。', { layer_id: id, dx: integer('水平偏移', -4096, 4096), dy: integer('垂直偏移', -4096, 4096) }, ['layer_id', 'dx', 'dy']),
    tool('adjust_layer', '对指定普通像素图层执行调整。保留原图请先复制。', { layer_id: id, effect: { type: 'string', enum: ['invert', 'desaturate', 'autoContrast', 'autoLevels'] } }, ['layer_id', 'effect'])
  ];
  const titles = { get_document: '读取画布', create_document: '新建画布', resize_document: '缩放图像', crop_document: '裁剪画布', rotate_document: '旋转画布', flip_document: '翻转画布', select_rectangle: '创建选区', change_selection: '修改选区', add_text: '添加文字', edit_layer: '修改图层', duplicate_layer: '复制图层', move_layer: '移动图层', adjust_layer: '调整图层' };
  function validate(args, schema) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error('工具参数必须是对象。');
    for (const k of schema.required) if (!Object.hasOwn(args, k)) throw Error('缺少参数：' + k);
    for (const [k, v] of Object.entries(args)) {
      const s = schema.properties[k]; if (!Object.hasOwn(schema.properties, k)) throw Error('不支持的参数：' + k);
      if (s.type === 'integer' ? !Number.isSafeInteger(v) : typeof v !== s.type) throw Error('参数类型不正确：' + k);
      if (s.enum && !s.enum.includes(v) || s.minimum !== undefined && v < s.minimum || s.maximum !== undefined && v > s.maximum || s.minLength && v.length < s.minLength || s.maxLength && v.length > s.maxLength || s.pattern && !new RegExp(s.pattern).test(v)) throw Error('参数超出允许范围：' + k);
    }
  }
  ui.createAssistant = function (deps) {
    const { app, native, el, button, status } = deps;
    let abort, serial = 0, view, messages = [], logs = [], expected, expectedState, conversationDoc;
    const docState = () => { const d = app.xK(); return d ? JSON.stringify([d.WE, d.r, d.B, d.f, d.U.map(l => [l.add.lyid, l.getName(), l.xC, l.vT()])]) : ''; };
    function snapshot() {
      const d = app.xK(); if (!d) return { document: null };
      return { name: d.name, width: d.r, height: d.B, selection: d.h ? { x: d.h.S.x, y: d.h.S.y, width: d.h.S.r, height: d.h.S.B } : null,
        layers: d.U.map(l => ({ id: l.add.lyid, name: l.getName(), visible: l.vT(), opacity: Math.round(l.xC * 100 / 255), text: !!l.add.TySh, locked: l.fn(31) })), selected_ids: d.f.map(i => d.U[i]?.add.lyid) };
    }
    function unchanged() { if (app.xK() !== expected || docState() !== expectedState) throw Error('画布已在助手之外被修改或切换，已停止操作。请重新发送任务。'); }
    function rect(a) { const d = app.xK(); if (a.x + a.width > d.r || a.y + a.height > d.B) throw Error('矩形超出当前画布。'); }
    const quote = JSON.stringify;
    function selectLayer(a) {
      const d = app.xK(), layer = d.U.find(l => l.add.lyid === a.layer_id);
      if (!layer) throw Error('图层不存在，请重新读取画布。');
      if (layer.fn(31)) throw Error('图层已锁定，请先在图层面板解锁。');
      // The identifier is a validated integer; model text never becomes executable code.
      return 'function find(ls){for(var i=0;i<ls.length;i++){if(ls[i].id==' + a.layer_id + ')return ls[i];var cs=ls[i].layers;if(cs){var l=find(cs);if(l)return l;}}return null;}var layer=find(app.activeDocument.layers);app.activeDocument.activeLayer=layer;';
    }
    async function execute(name, a, signal) {
      const schema = tools.find(t => t.function.name === name)?.function.parameters;
      if (!schema) throw Error('不支持此操作。'); validate(a, schema); unchanged();
      if (name === 'get_document') return snapshot();
      const d = app.xK(); if (name !== 'create_document' && !d) throw Error('请先新建或打开画布。');
      if (d && d.r * d.B > 16000000) throw Error('当前画布超过 1600 万像素，请先缩小后使用助手。');
      let code;
      switch (name) {
        case 'create_document': if (a.width * a.height > 16000000) throw Error('画布不能超过 1600 万像素。'); code = 'app.documents.add(' + [a.width, a.height, 72, quote(a.name), 'null', a.background === 'transparent' ? 1 : 0].join(',') + ')'; break;
        case 'resize_document': if (a.width * a.height > 16000000) throw Error('画布不能超过 1600 万像素。'); code = 'app.activeDocument.resizeImage(' + a.width + ',' + a.height + ')'; break;
        case 'crop_document': rect(a); code = 'app.activeDocument.crop(' + JSON.stringify([a.x, a.y, a.x + a.width, a.y + a.height]) + ')'; break;
        case 'rotate_document': code = 'app.activeDocument.rotateCanvas(' + a.angle + ')'; break;
        case 'flip_document': code = 'app.activeDocument.flipCanvas(' + (a.axis === 'horizontal' ? 0 : 1) + ')'; break;
        case 'select_rectangle': rect(a); code = 'app.activeDocument.selection.select(' + JSON.stringify([[a.x, a.y], [a.x + a.width, a.y], [a.x + a.width, a.y + a.height], [a.x, a.y + a.height]]) + ')'; break;
        case 'change_selection': code = 'app.activeDocument.selection.' + ({ all: 'selectAll', invert: 'invert', deselect: 'deselect' })[a.action] + '()'; break;
        case 'add_text':
          if (a.x > d.r || a.y > d.B) throw Error('文字基线超出画布。');
          code = 'var l=app.activeDocument.artLayers.add();l.kind=LayerKind.TEXT;l.name=' + quote(a.name) + ';l.textItem.contents=' + quote(a.text) + ';l.textItem.size=' + a.size + ';l.textItem.position=' + JSON.stringify([a.x, a.y]) + ';var c=new SolidColor();c.rgb.hexValue=' + quote(a.color.slice(1)) + ';l.textItem.color=c;'; break;
        case 'edit_layer':
          code = selectLayer(a); for (const k of ['name', 'visible', 'opacity']) if (Object.hasOwn(a, k)) code += 'layer.' + k + '=' + quote(a[k]) + ';'; break;
        case 'duplicate_layer': code = selectLayer(a) + 'layer.duplicate();'; break;
        case 'move_layer': code = selectLayer(a) + 'layer.translate(' + a.dx + ',' + a.dy + ');'; break;
        case 'adjust_layer':
          if (d.U.find(l => l.add.lyid === a.layer_id)?.add.TySh) throw Error('请对普通像素图层执行此调整。');
          code = selectLayer(a) + 'layer.' + a.effect + '();'; break;
      }
      const before = docState(); native.script(app, code);
      await new Promise(r => setTimeout(r, 40));
      if (signal.aborted) throw new DOMException('cancelled', 'AbortError');
      expected = app.xK(); expectedState = docState();
      if (before === expectedState && name !== 'change_selection' && name !== 'select_rectangle') throw Error('编辑器没有产生预期变化，请检查图层类型或锁定状态。');
      return { ok: true, state: snapshot() };
    }
    function addLog(role, text) { logs.push({ role, text }); if (logs.length > 70) logs.shift(); paint(); }
    function paint() {
      if (!view?.isConnected) return; view.replaceChildren();
      for (const item of logs) { const row = el('div', 'assistant-message'); row.dataset.role = item.role; row.append(el('span', 'assistant-speaker', ({ user: '你', assistant: '助手', tool: '操作', error: '未执行' })[item.role]), el('p', '', item.text)); view.append(row); }
      view.scrollTop = view.scrollHeight;
    }
    function cancel() { if (abort) { abort.abort(); abort = null; serial++; messages = []; } }
    async function run(task, preview, runButton, stop) {
      let timer, current, changed = 0; const token = ++serial;
      try {
        const p = deps.profile('assistant'); if (!p || !p.url || !p.model) throw Error('请先在 AI 设置中选择“用于操控编辑器”的平台。');
        if (p.type !== 'chat') throw Error('操控编辑器需要支持工具调用的 Chat API，请在 AI 设置中选择对应接口类型。');
        if (!task.trim()) throw Error('请先描述要完成的任务。');
        if (conversationDoc !== app.xK() || messages.length > 30) messages = [];
        expected = app.xK(); expectedState = docState(); current = new AbortController(); abort = current;
        timer = setTimeout(() => current.abort(), 180000); runButton.disabled = true; stop.hidden = false;
        const key = deps.secret(p), headers = { 'Content-Type': 'application/json' }; if (key) headers.Authorization = 'Bearer ' + key;
        let content = task.trim() + '\n当前编辑器状态：' + JSON.stringify(snapshot());
        if (preview && expected) {
          const c = document.createElement('canvas'); const scale = Math.min(1, 1024 / expected.r, 1024 / expected.B); c.width = Math.max(1, Math.round(expected.r * scale)); c.height = Math.max(1, Math.round(expected.B * scale));
          if (expected.r * expected.B > 16000000) throw Error('当前画布过大，无法发送预览。');
          const bitmap = await createImageBitmap(new Blob([native.png(app, expected)], { type: 'image/png' })); c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height); bitmap.close();
          content = [{ type: 'text', text: content }, { type: 'image_url', image_url: { url: c.toDataURL('image/png') } }];
        }
        messages.push({ role: 'user', content }); addLog('user', task.trim());
        const system = { role: 'system', content: '你是在线图片编辑器中的操作助手。用中文简短回答。根据用户明确任务调用提供的工具，直接操作画布。只通过工具完成编辑，不输出代码或让用户执行脚本。先 get_document，按返回的真实图层 ID 操作；处理工具错误，不虚构成功。用户未要求时不要修改其他内容，不要关闭文档。用户只问问题时回答即可。工具不支持的操作说明限制。图像生成/局部填充需要用户进入“图像工具”并配置支持图片输出的模型，不能用 add_text 冒充图片。' };
        for (let round = 0, count = 0; round < 8; round++) {
          if (current.signal.aborted) throw new DOMException('cancelled', 'AbortError'); unchanged(); status('助手正在处理… 已完成 ' + changed + ' 项编辑');
          const body = { model: p.model, messages: [system, ...messages], tools, tool_choice: 'auto', stream: false, max_tokens: 2048 };
          const url = deps.endpoint(p, 'assistant'); if (new URL(url).hostname === 'api.deepseek.com') body.thinking = { type: 'disabled' };
          const data = await deps.jsonRequest(url, { method: 'POST', headers, body: JSON.stringify(body) }, current.signal, key);
          if (current.signal.aborted) throw new DOMException('cancelled', 'AbortError'); unchanged();
          const response = data.choices?.[0]?.message; if (!response) throw Error('接口未返回有效的助手回复。');
          const calls = response.tool_calls;
          const message = { role: 'assistant', content: typeof response.content === 'string' ? response.content : null };
          if (response.reasoning_content) message.reasoning_content = response.reasoning_content;
          if (!calls?.length) { if (!message.content) throw Error('接口返回了空回复。'); messages.push(message); addLog('assistant', message.content); status('已完成，可在画布查看结果。编辑操作可逐步撤销。'); conversationDoc = app.xK(); return; }
          if (!Array.isArray(calls) || calls.length > 12 || calls.some(c => c.type !== 'function' || typeof c.id !== 'string' || !c.function || typeof c.function.arguments !== 'string')) throw Error('接口返回的工具调用格式不正确。');
          message.tool_calls = calls; messages.push(message);
          for (const call of calls) {
            if (++count > 24) throw Error('已达到本次任务的 24 步上限，请检查结果后继续。');
            if (current.signal.aborted) throw new DOMException('cancelled', 'AbortError'); unchanged();
            const name = call.function.name; let result;
            try { result = await execute(name, JSON.parse(call.function.arguments), current.signal); if (name !== 'get_document') changed++; addLog('tool', (titles[name] || name) + ' · 完成'); }
            catch (e) { if (e.name === 'AbortError') throw e; result = { error: e.message }; addLog('error', (titles[name] || '未知操作') + '：' + e.message); }
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
          }
        }
        throw Error('已达到本次任务的对话轮数上限，请检查结果后继续。');
      } catch (e) {
        if (token !== serial) return;
        messages = []; conversationDoc = app.xK();
        status((e.name === 'AbortError' ? '已停止等待。' : e.message) + (changed ? ' 已完成的 ' + changed + ' 项编辑保留，可逐步撤销。' : ''), e.name !== 'AbortError');
      } finally { clearTimeout(timer); if (token === serial) { if (abort === current) abort = null; runButton.disabled = false; stop.hidden = true; } }
    }
    function render(content) {
      const form = el('form', 'ai-assistant');
      const label = el('label', 'ai-field', '操控编辑器的平台'), profiles = el('select'); profiles.id = 'ai-assistant-profile'; label.append(profiles); form.append(label);
      const list = deps.profiles().filter(p => p.type === 'chat'); const empty = el('option', '', '请先配置支持工具调用的平台'); empty.value = ''; profiles.append(empty);
      for (const p of list) { const o = el('option', '', p.name); o.value = p.id; profiles.append(o); } profiles.value = deps.profile('assistant')?.id || '';
      profiles.onchange = () => { cancel(); deps.assign('assistant', profiles.value); messages = []; start.disabled = false; stop.hidden = true; status('已切换平台，可以开始新的对话。'); };
      form.append(button('AI 设置', () => deps.settings(), 'ai-configure'));
      form.append(el('p', 'ai-note', '告诉助手要做什么，它会调用编辑器工具。支持新建、缩放、裁剪、选区、文字和图层操作。'));
      view = el('div', 'assistant-log'); view.setAttribute('role', 'log'); view.setAttribute('aria-label', '助手执行记录'); form.append(view); paint();
      const taskLabel = el('label', 'ai-field', '编辑任务'), prompt = el('textarea'); prompt.id = 'ai-task'; prompt.rows = 3; prompt.maxLength = 4000; prompt.placeholder = '例如：新建 1200 × 800 的白色画布，在左上方添加墨绿色文字“森口电竞”。'; taskLabel.append(prompt); form.append(taskLabel);
      const check = el('label', 'ai-check'), preview = el('input'); preview.type = 'checkbox'; preview.id = 'ai-assistant-preview'; check.append(preview, document.createTextNode('发送当前画布预览（需要模型支持图片输入）')); form.append(check);
      const actions = el('div', 'ai-form-actions'), start = button('执行任务', () => {}, 'ai-primary'), stop = button('停止', () => { cancel(); start.disabled = false; stop.hidden = true; status('已停止等待。已完成的编辑保留，可逐步撤销。'); }), clear = button('清空对话', () => { cancel(); start.disabled = false; stop.hidden = true; messages = []; logs = []; paint(); status('对话已清空，画布保留。'); }); start.type = 'submit'; stop.hidden = true; actions.append(start, stop, clear); form.append(actions);
      form.append(el('p', 'ai-note', '默认发送任务和图层信息；勾选后额外发送画布预览。关闭面板会停止等待，已完成的编辑保留。'));
      form.onsubmit = e => { e.preventDefault(); if (!abort) run(prompt.value, preview.checked, start, stop); }; content.append(form);
    }
    return { render, cancel };
  };
}());
