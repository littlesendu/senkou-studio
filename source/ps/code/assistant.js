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
  const color = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: '六位十六进制颜色' };
  const point = { type: 'object', properties: { x: integer('横坐标', 0, 30000), y: integer('纵坐标', 0, 30000) }, required: ['x', 'y'], additionalProperties: false };
  const points = { type: 'array', items: point, minItems: 2, maxItems: 500 };
  const tools = [
    tool('draw_paths', '用画笔实际绘制多条线段/折线，适合火柴人、简笔画、图示和自由笔画。圆头圆角，结果为独立像素图层。不能用文字冒充绘画。', { name: text('图层名称'), color, width: integer('画笔宽度，像素', 1, 256), paths: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', properties: { points, closed: { type: 'boolean' } }, required: ['points'], additionalProperties: false } } }, ['name', 'color', 'width', 'paths']),
    tool('draw_shape', '绘制矩形或椭圆，结果为独立像素图层。可只描边或只填色，适合火柴人头部、图形和色块。', { name: text('图层名称'), shape: { type: 'string', enum: ['rectangle', 'ellipse'] }, x: integer('左侧', 0, 29999), y: integer('顶部', 0, 29999), width: integer('宽度', 1, 30000), height: integer('高度', 1, 30000), fill: color, stroke: color, stroke_width: integer('描边宽度', 1, 256) }, ['name', 'shape', 'x', 'y', 'width', 'height']),
    tool('fill_color', '用纯色填充当前选区，没有选区时填充整个画布。新建图层，保留原图。', { name: text('图层名称'), color }, ['name', 'color']),
    tool('select_polygon', '用画布坐标创建多边形选区，至少三个顶点。', { points: { ...points, minItems: 3 } }, ['points']),
    tool('modify_selection', '扩展、收缩或羽化当前选区。', { action: { type: 'string', enum: ['expand', 'contract', 'feather'] }, pixels: integer('像素数', 1, 500) }, ['action', 'pixels']),
    tool('generate_image', '调用用户配置的生图 AI，并把结果加入新图层。generate 生成新画面；edit 编辑整张可见图；fill 根据提示填充当前选区；remove 移除选区内物体并补全背景。需要时先用选区工具确定范围。绘制简单线条/火柴人优先用 draw_paths 和 draw_shape。', { mode: { type: 'string', enum: ['generate', 'edit', 'fill', 'remove'] }, prompt: text('完整的图像生成或编辑提示词', 12000) }, ['mode', 'prompt']),
    tool('transform_layer', '缩放或旋转指定图层，中心为锚点。', { layer_id: id, scale_percent: integer('缩放百分比', 1, 1000), angle: integer('旋转角度', -360, 360) }, ['layer_id']),
    tool('delete_layer', '删除用户明确要求删除的指定图层。', { layer_id: id }, ['layer_id']),
    tool('get_document', '读取当前画布尺寸、选区和所有图层。操作前先读取；图层列表从底部到顶部。', {}, []),
    tool('create_document', '新建画布，保留已经打开的文档。', { width: integer('宽度，像素', 1, 30000), height: integer('高度，像素', 1, 30000), name: text('文档名称'), background: { type: 'string', enum: ['white', 'transparent'] } }, ['width', 'height', 'name', 'background']),
    tool('resize_document', '缩放整张图像到指定像素尺寸；保持比例时需计算另一边。', { width: integer('宽度', 1, 30000), height: integer('高度', 1, 30000) }, ['width', 'height']),
    tool('crop_document', '按像素矩形裁剪画布，坐标以左上角为原点。', { x: integer('左边', 0, 29999), y: integer('上边', 0, 29999), width: integer('宽度', 1, 30000), height: integer('高度', 1, 30000) }, ['x', 'y', 'width', 'height']),
    tool('rotate_document', '旋转整个画布，单位度。', { angle: { type: 'integer', enum: [90, -90, 180] } }, ['angle']),
    tool('flip_document', '翻转整个画布。', { axis: { type: 'string', enum: ['horizontal', 'vertical'] } }, ['axis']),
    tool('select_rectangle', '创建矩形选区。', { x: integer('左边', 0, 29999), y: integer('上边', 0, 29999), width: integer('宽度', 1, 30000), height: integer('高度', 1, 30000) }, ['x', 'y', 'width', 'height']),
    tool('change_selection', '全选、反选或取消选区。', { action: { type: 'string', enum: ['all', 'invert', 'deselect'] } }, ['action']),
    tool('add_text', '添加可编辑的文字图层。x、y 是文字基线的左端坐标；请保证文字在画布内。', { text: text('文字内容', 1000), name: text('图层名称'), x: integer('基线横坐标', 0, 30000), y: integer('基线纵坐标', 0, 30000), size: integer('字体像素大小', 6, 512), color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: '六位十六进制颜色，如 #ffffff' } }, ['text', 'name', 'x', 'y', 'size', 'color']),
    tool('edit_layer', '修改一个图层的名称、可见性或不透明度。仅提供需要修改的属性。', { layer_id: id, name: text('新名称'), visible: { type: 'boolean' }, opacity: { type: 'number', minimum: 0, maximum: 100 } }, ['layer_id']),
    tool('duplicate_layer', '复制指定图层，保留原图层。', { layer_id: id }, ['layer_id']),
    tool('move_layer', '按像素偏移移动图层。', { layer_id: id, dx: integer('水平偏移', -30000, 30000), dy: integer('垂直偏移', -30000, 30000) }, ['layer_id', 'dx', 'dy']),
    tool('adjust_layer', '对指定普通像素图层执行调整。保留原图请先复制。', { layer_id: id, effect: { type: 'string', enum: ['invert', 'desaturate', 'autoContrast', 'autoLevels'] } }, ['layer_id', 'effect'])
  ];
  const titles = { draw_paths: '绘制笔画', draw_shape: '绘制形状', fill_color: '填充颜色', select_polygon: '多边形选区', modify_selection: '调整选区', generate_image: '调用生图 AI', transform_layer: '变换图层', delete_layer: '删除图层', get_document: '读取画布', create_document: '新建画布', resize_document: '缩放图像', crop_document: '裁剪画布', rotate_document: '旋转画布', flip_document: '翻转画布', select_rectangle: '创建选区', change_selection: '修改选区', add_text: '添加文字', edit_layer: '修改图层', duplicate_layer: '复制图层', move_layer: '移动图层', adjust_layer: '调整图层' };
  function validate(value, schema, path = '参数') {
    const type = schema.type;
    if (type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(path + '必须是对象。');
      for (const k of schema.required || []) if (!Object.hasOwn(value, k)) throw Error('缺少参数：' + path + '.' + k);
      for (const [k, v] of Object.entries(value)) { if (!Object.hasOwn(schema.properties, k)) throw Error('不支持的参数：' + k); validate(v, schema.properties[k], path + '.' + k); }
    } else if (type === 'array') {
      if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) throw Error(path + '数量不正确。');
      value.forEach((v, i) => validate(v, schema.items, path + '[' + i + ']'));
    } else {
      if (type === 'integer' ? !Number.isSafeInteger(value) : typeof value !== type || type === 'number' && !Number.isFinite(value)) throw Error('参数类型不正确：' + path);
      if (schema.enum && !schema.enum.includes(value) || schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum || schema.minLength && value.length < schema.minLength || schema.maxLength && value.length > schema.maxLength || schema.pattern && !new RegExp(schema.pattern).test(value)) throw Error('参数超出允许范围：' + path);
    }
  }
  ui.createAssistant = function (deps) {
    const { app, native, el, button, status } = deps;
    let abort, serial = 0, view, messages = [], logs = [], expected, expectedState, expectedMask, conversationDoc;
    const docState = () => { const d = app.xK(); return d ? JSON.stringify([d.WE, d.r, d.B, d.f, d.U.map(l => [l.add.lyid, l.getName(), l.xC, l.vT()])]) : ''; };
    function snapshot() {
      const d = app.xK(); if (!d) return { document: null };
      return { name: d.name, width: d.r, height: d.B, selection: d.h ? { x: d.h.S.x, y: d.h.S.y, width: d.h.S.r, height: d.h.S.B } : null,
        layers: d.U.map(l => ({ id: l.add.lyid, name: l.getName(), visible: l.vT(), opacity: Math.round(l.xC * 100 / 255), text: !!l.add.TySh, locked: l.fn(31) })), selected_ids: d.f.map(i => d.U[i]?.add.lyid) };
    }
    function unchanged() { if (app.xK() !== expected || docState() !== expectedState || app.xK()?.h !== expectedMask) throw Error('画布已在助手之外被修改或切换，已停止操作。请重新发送任务。'); }
    function rect(a) { const d = app.xK(); if (a.x + a.width > d.r || a.y + a.height > d.B) throw Error('矩形超出当前画布。'); }
    const quote = JSON.stringify;
    function selectLayer(a) {
      const d = app.xK(), layer = d.U.find(l => l.add.lyid === a.layer_id);
      if (!layer) throw Error('图层不存在，请重新读取画布。');
      if (layer.fn(31)) throw Error('图层已锁定，请先在图层面板解锁。');
      // The identifier is a validated integer; model text never becomes executable code.
      return 'function find(ls){for(var i=0;i<ls.length;i++){if(ls[i].id==' + a.layer_id + ')return ls[i];var cs=ls[i].layers;if(cs){var l=find(cs);if(l)return l;}}return null;}var layer=find(app.activeDocument.layers);app.activeDocument.activeLayer=layer;';
    }
    function draw(name, a) {
      const d = app.xK(); let x, y, w, h, pad = name === 'draw_paths' ? Math.ceil(a.width / 2) + 2 : Math.ceil((a.stroke_width || 1) / 2) + 2;
      if (name === 'draw_paths') {
        const all = a.paths.flatMap(p => p.points); all.forEach(p => { if (p.x > d.r || p.y > d.B) throw Error('笔画坐标超出画布。'); });
        x = Math.max(0, Math.floor(Math.min(...all.map(p => p.x)) - pad)); y = Math.max(0, Math.floor(Math.min(...all.map(p => p.y)) - pad));
        w = Math.min(d.r, Math.ceil(Math.max(...all.map(p => p.x)) + pad)) - x; h = Math.min(d.B, Math.ceil(Math.max(...all.map(p => p.y)) + pad)) - y;
      } else if (name === 'fill_color') {
        const r = d.h?.S; x = r ? Math.max(0, r.x) : 0; y = r ? Math.max(0, r.y) : 0; w = r ? Math.min(d.r, r.x + r.r) - x : d.r; h = r ? Math.min(d.B, r.y + r.B) - y : d.B;
      } else {
        rect(a); if (!a.fill && !a.stroke) throw Error('形状需要填色或描边颜色。');
        x = Math.max(0, a.x - pad); y = Math.max(0, a.y - pad); w = Math.min(d.r, a.x + a.width + pad) - x; h = Math.min(d.B, a.y + a.height + pad) - y;
      }
      if (w <= 0 || h <= 0) throw Error('绘图范围未覆盖画布。');
      const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); if (!ctx) throw Error('浏览器无法创建绘图区域。');
      ctx.translate(-x, -y); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (name === 'draw_paths') { ctx.strokeStyle = a.color; ctx.lineWidth = a.width; for (const path of a.paths) { ctx.beginPath(); path.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); if (path.closed) ctx.closePath(); ctx.stroke(); } }
      else if (name === 'draw_shape') { ctx.beginPath(); if (a.shape === 'ellipse') ctx.ellipse(a.x + a.width / 2, a.y + a.height / 2, a.width / 2, a.height / 2, 0, 0, Math.PI * 2); else ctx.rect(a.x, a.y, a.width, a.height); if (a.fill) { ctx.fillStyle = a.fill; ctx.fill(); } if (a.stroke) { ctx.strokeStyle = a.stroke; ctx.lineWidth = a.stroke_width || 1; ctx.stroke(); } }
      else { ctx.fillStyle = a.color; ctx.fillRect(x, y, w, h); }
      const pixels = ctx.getImageData(0, 0, w, h).data;
      // Clip local drawing to the real selection, preserving feathered mask alpha.
      if (d.h) { const m = d.h.S, values = native.mask(d); for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) { const mx = px + x - m.x, my = py + y - m.y, alpha = mx >= 0 && my >= 0 && mx < m.r && my < m.B ? values[my * m.r + mx] : 0, i = (py * w + px) * 4 + 3; pixels[i] = Math.round(pixels[i] * alpha / 255); } }
      deps.pastePixels(pixels, w, h, x, y, a.name);
    }
    async function execute(name, a, signal) {
      const schema = tools.find(t => t.function.name === name)?.function.parameters;
      if (!schema) throw Error('不支持此操作。'); validate(a, schema); unchanged();
      if (name === 'get_document') return snapshot();
      const d = app.xK(); if (name !== 'create_document' && name !== 'generate_image' && !d) throw Error('请先新建或打开画布。');
      if (name === 'generate_image') {
        const result = await deps.imageTask(a.mode, a.prompt, signal);
        expected = app.xK(); expectedState = docState(); expectedMask = app.xK()?.h;
        return { ...result, state: snapshot() };
      }
      if (['draw_paths', 'draw_shape', 'fill_color'].includes(name)) {
        draw(name, a); expected = app.xK(); expectedState = docState(); expectedMask = app.xK()?.h;
        return { ok: true, state: snapshot() };
      }
      let code;
      switch (name) {
        case 'select_polygon':
          a.points.forEach(p => { if (p.x > d.r || p.y > d.B) throw Error('顶点超出画布。'); });
          code = 'app.activeDocument.selection.select(' + JSON.stringify(a.points.map(p => [p.x, p.y])) + ')'; break;
        case 'modify_selection': if (!d.h) throw Error('请先创建选区。'); code = 'app.activeDocument.selection.' + a.action + '(' + a.pixels + ')'; break;
        case 'transform_layer': if (a.scale_percent === undefined && a.angle === undefined) throw Error('请提供缩放或旋转参数。'); code = selectLayer(a); if (a.scale_percent !== undefined) code += 'layer.resize(' + a.scale_percent + ',' + a.scale_percent + ');'; if (a.angle !== undefined) code += 'layer.rotate(' + a.angle + ');'; break;
        case 'delete_layer': code = selectLayer(a) + 'layer.remove();'; break;
        case 'create_document': code = 'app.documents.add(' + [a.width, a.height, 72, quote(a.name), 'null', a.background === 'transparent' ? 2 : 0].join(',') + ')'; break;
        case 'resize_document': code = 'app.activeDocument.resizeImage(' + a.width + ',' + a.height + ')'; break;
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
      expected = app.xK(); expectedState = docState(); expectedMask = app.xK()?.h;
      if (before === expectedState && name !== 'change_selection' && name !== 'select_rectangle' && name !== 'select_polygon' && name !== 'modify_selection' && name !== 'edit_layer') throw Error('编辑器没有产生预期变化，请检查图层类型或锁定状态。');
      return { ok: true, state: snapshot() };
    }
    function addLog(role, text) { logs.push({ role, text }); if (logs.length > 70) logs.shift(); paint(); }
    function paint() {
      if (!view?.isConnected) return; view.replaceChildren();
      view.hidden = !logs.length; for (const item of logs) { const row = el('div', 'assistant-message'); row.dataset.role = item.role; row.append(el('span', 'assistant-speaker', ({ user: '你', assistant: '助手', tool: '操作', error: '未执行' })[item.role]), el('p', '', item.text)); view.append(row); }
      view.scrollTop = view.scrollHeight;
    }
    function cancel() { if (abort) { abort.abort(); abort = null; serial++; messages = []; } }
    async function run(task, preview, runButton, stop) {
      let timer, current, changed = 0; const token = ++serial;
      try {
        const p = deps.profile('assistant');
        if (!p && deps.profile('image')) {
          current = new AbortController(); abort = current; timer = setTimeout(() => current.abort(), 180000); runButton.disabled = true; stop.hidden = false;
          addLog('user', task.trim()); status('正在准备图像任务…');
          const mode = app.xK()?.h ? (/移除|去掉|删除|remove/i.test(task) ? 'remove' : 'fill') : !app.xK() || /生成|画一|绘制|generate/i.test(task) ? 'generate' : 'edit';
          const result = await deps.imageTask(mode, task.trim(), current.signal); if (token !== serial) return;
          addLog('assistant', '已添加“' + result.layer + '”图层。'); conversationDoc = app.xK(); status('已完成，可撤销本次编辑。'); return;
        }
        if (!p || !p.url || !p.model) throw Error('请先在 AI 设置中指定操控 AI 或生图 AI。');
        if (p.type !== 'chat') throw Error('操控编辑器需要支持工具调用的 Chat API，请在 AI 设置中选择对应接口类型。');
        if (!task.trim()) throw Error('请先描述要完成的任务。');
        if (conversationDoc !== app.xK() || messages.length > 30) messages = [];
        expected = app.xK(); expectedState = docState(); expectedMask = app.xK()?.h; current = new AbortController(); abort = current;
        timer = setTimeout(() => current.abort(), 180000); runButton.disabled = true; stop.hidden = false; status(preview && expected ? '正在准备画布预览…' : '助手正在处理…');
        const key = deps.secret(p), headers = { 'Content-Type': 'application/json' }; if (key) headers.Authorization = 'Bearer ' + key;
        let content = task.trim() + '\n当前编辑器状态：' + JSON.stringify(snapshot());
        if (preview && expected) {
          const c = await deps.preview(expected, 1024); if (current.signal.aborted || token !== serial) throw new DOMException('cancelled', 'AbortError'); unchanged();
          content = [{ type: 'text', text: content }, { type: 'image_url', image_url: { url: c.toDataURL('image/png') } }];
        }
        messages.push({ role: 'user', content }); addLog('user', task.trim());
        const system = { role: 'system', content: '你是在线图片编辑器中的操作助手。用中文简短回答。根据用户明确任务调用提供的工具，直接操作画布。只通过工具完成编辑，不输出代码或让用户执行脚本。先 get_document，按返回的真实图层 ID 操作；处理工具错误，不虚构成功。用户未要求时不要修改其他内容，不要关闭文档。用户只问问题时回答即可。工具不支持的操作说明限制。简单绘画（火柴人、线稿、图示）直接调用 draw_paths / draw_shape 创建真实笔画；禁止用 add_text 冒充绘画。复杂图像生成、整图修改、选区填充或移除调用 generate_image，它会自动使用用户单独配置的生图 AI，你负责组织提示词并在需要时先创建选区，不需要用户切换面板。没有生图配置时告知去 AI 设置指定生图 AI。当前选区优先作为编辑范围，保留其他区域。不要在画图前清除用户的选区。' };
        for (let round = 0, count = 0; round < 12; round++) {
          if (current.signal.aborted) throw new DOMException('cancelled', 'AbortError'); unchanged(); status('助手正在处理… 已完成 ' + changed + ' 项编辑');
          const body = { model: p.model, messages: [system, ...messages], tools, tool_choice: 'auto', stream: false, max_tokens: 4096 };
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
            if (++count > 40) throw Error('已达到本次任务的 40 步上限，请检查结果后继续。');
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
        if (e.name !== 'AbortError') addLog('error', e.message);
        status((e.name === 'AbortError' ? '已停止等待。' : e.message) + (changed ? ' 已完成的 ' + changed + ' 项编辑保留，可逐步撤销。' : ''), e.name !== 'AbortError');
      } finally { clearTimeout(timer); if (token === serial) { if (abort === current) abort = null; runButton.disabled = false; stop.hidden = true; } }
    }
    function render(content, mode) {
      const form = el('form', 'ai-assistant');
      view = el('div', 'assistant-log'); view.setAttribute('role', 'log'); view.setAttribute('aria-label', '助手执行记录'); form.append(view); paint(); view.hidden = !logs.length;
      const prompt = el('textarea'); prompt.id = 'ai-task'; prompt.setAttribute('aria-label', '对 AI 说点什么'); prompt.rows = 2; prompt.maxLength = 12000;
      prompt.placeholder = mode === 'fill' || mode === 'remove' ? '想怎样修改选区？' : '描述想做的事，例如：画一个火柴人'; form.append(prompt);
      const actions = el('div', 'ai-chat-actions'), options = el('details', 'ai-chat-options'), summary = el('summary', '', '选项'); summary.setAttribute('aria-label', '对话选项'); options.append(summary);
      const extra = el('div', 'ai-chat-menu'); extra.append(button('AI 设置', () => deps.settings()));
      const check = el('label', 'ai-check'), preview = el('input'); preview.type = 'checkbox'; preview.id = 'ai-assistant-preview'; check.append(preview, document.createTextNode('附上画布预览')); extra.append(check);
      const start = button('发送', () => {}, 'ai-primary'), stop = button('停止', () => { cancel(); start.disabled = false; stop.hidden = true; status('已停止等待，已完成的编辑保留。'); }); start.type = 'submit'; stop.hidden = true;
      extra.append(button('清空对话', () => { cancel(); start.disabled = false; stop.hidden = true; messages = []; logs = []; paint(); view.hidden = true; options.open = false; status(''); })); options.append(extra);
      actions.append(options, stop, start); form.append(actions);
      let composing = false; prompt.addEventListener('compositionstart', () => { composing = true; }); prompt.addEventListener('compositionend', () => { composing = false; });
      prompt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !composing && e.keyCode !== 229) { e.preventDefault(); form.requestSubmit(); } });
      form.onsubmit = e => { e.preventDefault(); if (abort) return; const text = prompt.value.trim(); if (!text) return; if (!deps.profile('assistant') && !deps.profile('image')) { status('请先在选项 → AI 设置中添加平台。', true); return; } prompt.value = ''; options.open = false; run(text, preview.checked, start, stop); prompt.focus(); };
      content.append(form);
    }
    return { render, cancel };
  };
}());
