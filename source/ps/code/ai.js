/* User-owned image AI connections. No credentials or image data go through the studio server. */
(function () {
  'use strict';
  const ui = window.OnlinePS, storageKey = 'senkou.image-ai.v1';
  let native, app, panel, opener, controller, job = 0, memory = {}, state;
  try { state = JSON.parse(localStorage.getItem(storageKey)); } catch (_) {}
  if (!state || !Array.isArray(state.profiles)) state = { active: '', profiles: [] };
  state.profiles = state.profiles.filter(p => p && typeof p.id === 'string');
  state.image = state.image || state.active || ''; state.assistant = state.assistant || '';
  let assistant;
  const labels = { generate: '生成图像', edit: 'AI 图像编辑', fill: '生成式填充', remove: 'AI 移除' };
  const paths = {
    spark: '<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z"/><path d="m20 2 .6 1.4L22 4l-1.4.6L20 6l-.6-1.4L18 4l1.4-.6L20 2Z"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    folder: '<path d="M3 7V5h6l2 2h10v13H3V7Z"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    select: '<path stroke-dasharray="2 3" d="M4 4h16v16H4z"/>',
    invert: '<path d="M4 4h16v16H4zM12 4v16M12 4 4 12m8-3-8 8m8-3-6 6"/>',
    remove: '<path d="m4 14 9-10 8 7-9 10H8l-4-4v-3Zm3-3 8 7M3 21h18"/>',
    drag: '<circle cx="9" cy="5" r=".8"/><circle cx="15" cy="5" r=".8"/><circle cx="9" cy="12" r=".8"/><circle cx="15" cy="12" r=".8"/><circle cx="9" cy="19" r=".8"/><circle cx="15" cy="19" r=".8"/>'
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>'; }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function button(text, fn, cls) { const b = el('button', cls, text); b.type = 'button'; b.onclick = fn; return b; }
  function active(purpose) { return state.profiles.find(p => p.id === (purpose ? state[purpose] : state.active)); }
  function assign(purpose, id) { state[purpose] = id; try { persist(); } catch (_) {} }
  function persist() {
    localStorage.setItem(storageKey, JSON.stringify({ active: state.active, image: state.image, assistant: state.assistant, profiles: state.profiles.map(p => {
      const copy = Object.assign({}, p); if (!copy.remember) delete copy.key; return copy;
    }) }));
  }
  function secret(p) { return memory[p.id] || p.key || ''; }
  function status(text, error) { const target = panel.querySelector('.ai-status'); target.textContent = text; target.dataset.error = String(!!error); }
  function field(form, text, id, type, placeholder) {
    const label = el('label', 'ai-field'), caption = el('span', '', text), input = el(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input');
    input.id = id; input.name = id; if (input.tagName === 'INPUT') input.type = type || 'text'; if (placeholder) input.placeholder = placeholder;
    input.autocomplete = 'off'; label.append(caption, input); form.append(label); return input;
  }
  function option(select, value, title) { const o = el('option', '', title); o.value = value; select.append(o); }
  function endpoint(p, operation) {
    let url; try { url = new URL(p.url.trim()); } catch (_) { throw Error('请填写完整接口地址，例如 https://服务域名/v1。'); }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('接口地址只支持 HTTP / HTTPS，请勿在地址中填写 Key、查询参数或账号密码。');
    if (p.type === 'gemini') {
      url.pathname = url.pathname.replace(/\/$/, '').replace(/\/models\/[^/]+:generateContent$/, '').replace(/\/models$/, '') + '/models/' + encodeURIComponent(p.model) + ':generateContent';
    } else {
      let base = url.pathname.replace(/\/$/, '').replace(/\/(?:images\/(?:generations|edits)|chat\/completions|models)$/, '');
      url.pathname = base + '/' + (p.type === 'chat' ? 'chat/completions' : 'images/' + (operation === 'generate' ? 'generations' : 'edits'));
    }
    return url.href;
  }
  function validate(p) { if (!p || !p.url || !p.model.trim()) throw Error('先在 AI 设置里填写接口地址和模型名称。'); endpoint(p, 'generate'); return p; }
  async function jsonRequest(url, init, signal, key) {
    let response;
    try { response = await fetch(url, Object.assign({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal }, init)); }
    catch (error) { if (signal.aborted) throw error; throw Error('无法连接接口。请检查地址、网络以及平台是否允许浏览器跨域请求（CORS）。'); }
    const text = await response.text(); let data;
    try { data = JSON.parse(text); } catch (_) { throw Error('接口返回了非 JSON 内容（HTTP ' + response.status + '），请核对接口类型和地址。'); }
    if (!response.ok || data.error) {
      let message = data.error?.message || data.error || data.message || response.statusText;
      if (typeof message !== 'string') message = JSON.stringify(message);
      if (key) message = message.split(key).join('[已隐藏 Key]');
      throw Error('HTTP ' + response.status + '：' + message.slice(0, 300));
    }
    return data;
  }
  function dataURL(blob) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); }); }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function blob(c) { return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(Error('图片编码失败。')), 'image/png')); }
  function capture(mode) {
    const doc = app.xK(); if (mode !== 'generate' && !doc) throw Error('请先打开图片。');
    if ((mode === 'fill' || mode === 'remove') && !doc.h) throw Error('请先用框选或套索工具选中需要修改的区域。');
    if (doc && doc.r * doc.B > 16000000) throw Error('当前画布较大，请先缩小到 1600 万像素以内后使用 AI。');
    const shot = { doc, width: doc?.r || 1024, height: doc?.B || 1024, maskRef: doc?.h, history: doc?.ao };
    if (mode !== 'generate') {
      shot.image = new Blob([native.png(app, doc)], { type: 'image/png' });
      if (doc.h && (mode === 'fill' || mode === 'remove')) {
        const s = doc.h.S, values = native.mask(doc), mask = canvas(doc.r, doc.B), ctx = mask.getContext('2d'), pixels = ctx.createImageData(doc.r, doc.B);
        shot.alpha = new Uint8Array(doc.r * doc.B);
        for (let y = 0; y < doc.B; y++) for (let x = 0; x < doc.r; x++) {
          const i = y * doc.r + x, inside = x >= s.x && y >= s.y && x < s.x + s.r && y < s.y + s.B;
          const a = inside ? values[(y - s.y) * s.r + x - s.x] : 0;
          shot.alpha[i] = a; pixels.data.set([255, 255, 255, 255 - a], i * 4);
        }
        ctx.putImageData(pixels, 0, 0); shot.maskCanvas = mask;
      }
    }
    return shot;
  }
  async function requestImage(p, mode, prompt, shot, signal) {
    const key = secret(p), headers = {}, url = endpoint(p, mode); let body;
    if (p.type === 'images' && mode !== 'generate') {
      if (key) headers.Authorization = 'Bearer ' + key;
      body = new FormData(); body.append('model', p.model); body.append('prompt', prompt); body.append('n', '1');
      body.append('image', shot.image, 'image.png'); if (shot.maskCanvas) body.append('mask', await blob(shot.maskCanvas), 'mask.png');
    } else if (p.type === 'gemini') {
      if (key) headers['x-goog-api-key'] = key;
      headers['Content-Type'] = 'application/json';
      const parts = [{ text: prompt }];
      if (mode !== 'generate') {
        parts.push({ inlineData: { mimeType: 'image/png', data: (await dataURL(shot.image)).split(',')[1] } });
        if (shot.maskCanvas) {
          parts[0].text += '\nThe second image is a mask: white indicates the editable area. Preserve everything outside it and return the complete image at the original size.';
          const mask = canvas(shot.width, shot.height), ctx = mask.getContext('2d'), pixels = ctx.createImageData(shot.width, shot.height);
          for (let i = 0; i < shot.alpha.length; i++) pixels.data.set([shot.alpha[i], shot.alpha[i], shot.alpha[i], 255], i * 4);
          ctx.putImageData(pixels, 0, 0); parts.push({ inlineData: { mimeType: 'image/png', data: mask.toDataURL('image/png').split(',')[1] } });
        }
      }
      body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } });
    } else if (p.type === 'chat') {
      if (key) headers.Authorization = 'Bearer ' + key;
      headers['Content-Type'] = 'application/json';
      const content = [{ type: 'text', text: prompt }];
      if (mode !== 'generate') {
        content.push({ type: 'image_url', image_url: { url: await dataURL(shot.image) } });
        if (shot.maskCanvas) {
          content[0].text += '\nThe second image is a mask: transparent pixels indicate the area to change. Return the complete edited image at its original size.';
          content.push({ type: 'image_url', image_url: { url: shot.maskCanvas.toDataURL('image/png') } });
        }
      }
      body = JSON.stringify({ model: p.model, messages: [{ role: 'user', content }], stream: false });
    } else {
      if (key) headers.Authorization = 'Bearer ' + key;
      headers['Content-Type'] = 'application/json'; body = JSON.stringify({ model: p.model, prompt, n: 1, size: '1024x1024' });
    }
    const data = await jsonRequest(url, { method: 'POST', headers, body }, signal, key);
    let result;
    if (data.data?.[0]?.b64_json) result = 'data:image/png;base64,' + data.data[0].b64_json;
    else if (data.data?.[0]?.url) result = data.data[0].url;
    else if (p.type === 'gemini') {
      const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData || p.inline_data), image = part?.inlineData || part?.inline_data;
      if (image) result = 'data:' + (image.mimeType || image.mime_type || 'image/png') + ';base64,' + image.data;
    } else {
      const message = data.choices?.[0]?.message, content = message?.content;
      result = message?.images?.[0]?.image_url?.url;
      if (!result && Array.isArray(content)) result = content.find(p => p.type === 'image_url')?.image_url?.url;
      if (!result && typeof content === 'string') result = content.match(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/)?.[0] || content.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/)?.[1];
    }
    if (!result) throw Error('接口没有返回图片。请确认该模型支持图像输出，并选择与平台文档一致的接口类型。');
    if (!/^data:image\/(png|jpeg|webp);base64,/i.test(result) && !/^https?:\/\//i.test(result)) throw Error('接口返回了不支持的图片格式。');
    // Never forward the user's API key to a returned image/CDN URL.
    const response = await fetch(result, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw Error('生成成功，但下载结果失败（HTTP ' + response.status + '）。');
    const bytes = await response.blob(); if (bytes.size > 40 * 1024 * 1024) throw Error('返回图片超过 40 MB，请选择较小尺寸。');
    return bytes;
  }
  function ensureTarget(shot) {
    if (app.xK() !== shot.doc || (shot.doc && (shot.doc.r !== shot.width || shot.doc.B !== shot.height))) throw Error('画布已切换、关闭或尺寸已改变。结果未写入，请返回原画布后重新生成。');
  }
  async function applyImage(bytes, shot, mode, valid) {
    const bitmap = await createImageBitmap(bytes); const target = canvas(shot.width, shot.height), ctx = target.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, shot.width, shot.height); bitmap.close();
    const pixels = ctx.getImageData(0, 0, shot.width, shot.height).data;
    if (shot.alpha) for (let i = 0; i < shot.alpha.length; i++) pixels[i * 4 + 3] = Math.round(pixels[i * 4 + 3] * shot.alpha[i] / 255);
    if (!valid()) return;
    ensureTarget(shot);
    if (!shot.doc) native.script(app, 'app.documents.add(1024,1024,72,"AI 图像",null,2)');
    native.paste(app, new Uint8Array(pixels.buffer), shot.width, shot.height, labels[mode]);
  }
  function build() {
    panel = el('dialog', 'ai-dialog'); panel.id = 'workspace-ai'; panel.setAttribute('aria-labelledby', 'ai-title');
    panel.innerHTML = '<header class="ai-header"><h2 id="ai-title">AI 对话</h2><button type="button" class="ai-close" aria-label="关闭 AI 面板">' + icon('close') + '</button></header><nav class="ai-tabs" aria-label="AI 面板"><button type="button" data-tab="assistant">AI 对话</button><button type="button" data-tab="tools">图像工具</button></nav><div class="ai-content"></div><p class="ai-status" role="status" aria-live="polite"></p>';
    // Keep typing, Delete, paste and undo inside our modal away from the native canvas shortcuts.
    ['keydown', 'keyup', 'paste', 'copy', 'cut'].forEach(type => panel.addEventListener(type, e => e.stopPropagation()));
    document.body.append(panel); panel.querySelector('.ai-close').onclick = () => panel.close();
    panel.addEventListener('close', () => { cancel(); opener?.focus(); });
    panel.addEventListener('click', e => { if (e.target === panel) { const r = panel.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) panel.close(); } });
    panel.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => render(b.dataset.tab));
  }
  function cancel() { assistant?.cancel(); if (controller) { controller.abort(); controller = null; job++; } }
  function render(tab, mode) {
    cancel(); panel.dataset.tab = tab; panel.querySelector('#ai-title').textContent = ({ assistant: 'AI 对话', tools: 'AI 图像工具', settings: 'AI 设置' })[tab]; panel.querySelector('.ai-tabs').hidden = tab === 'settings'; panel.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
    const content = panel.querySelector('.ai-content'); content.replaceChildren(); status('');
    if (tab === 'settings') settings(content); else if (tab === 'assistant') assistant.render(content); else tools(content, mode || (app.xK()?.h ? 'fill' : 'generate'));
  }
  function settings(content) {
    const form = el('form', 'ai-settings'); form.noValidate = true;
    const chooser = field(form, '已保存的配置', 'ai-profile', 'select'); option(chooser, '', '新增平台配置');
    state.profiles.forEach(p => option(chooser, p.id, p.name)); chooser.value = state.active;
    const name = field(form, '配置名称', 'ai-name', 'text', '例如：我的对话平台、我的图像平台');
    const type = field(form, '接口类型', 'ai-protocol', 'select'); option(type, 'images', 'OpenAI 兼容 · Images API'); option(type, 'gemini', 'Gemini 原生 · generateContent'); option(type, 'chat', 'OpenAI 兼容 · Chat API（操控 / 图像）');
    const url = field(form, '接口地址', 'ai-endpoint', 'url', 'https://服务域名/v1');
    const model = field(form, '模型名称', 'ai-model', 'text', '填写平台提供的模型 ID');
    const keyLabel = el('div', 'ai-key-row'), key = field(keyLabel, 'API Key', 'ai-key', 'password', '无鉴权的本地服务可留空');
    const reveal = button('显示', () => { key.type = key.type === 'password' ? 'text' : 'password'; reveal.textContent = key.type === 'password' ? '显示' : '隐藏'; }); reveal.setAttribute('aria-label', '显示或隐藏 API Key'); keyLabel.append(reveal); form.append(keyLabel);
    const rememberLabel = el('label', 'ai-check'), remember = el('input'); remember.type = 'checkbox'; remember.id = 'ai-remember'; rememberLabel.append(remember, document.createTextNode('在此设备记住 Key')); form.append(rememberLabel);
    const uses = el('fieldset', 'ai-uses'); uses.append(el('legend', '', '配置用途（可同时选择）'));
    function use(text, id) { const label = el('label', 'ai-check'), input = el('input'); input.type = 'checkbox'; input.id = id; label.append(input, document.createTextNode(text)); uses.append(label); return input; }
    const forAssistant = use('用于操控编辑器', 'ai-use-assistant'), forImage = use('用于生成 / 编辑图片', 'ai-use-image'); form.append(uses);
    const note = el('p', 'ai-note', '地址、模型与 Key 只需填一份。支持两种能力的同一配置可以同时勾选两种用途。Key 默认只留在当前页面；勾选记住后保存在此浏览器。请求直接发送给所选平台。');
    const protocolHelp = el('p', 'ai-note');
    function explain() { protocolHelp.textContent = type.value === 'images' ? '生成使用 /images/generations；编辑和选区填充使用 /images/edits（multipart 图片与蒙版）。模型须支持相应能力。' : type.value === 'gemini' ? '填写包含版本号的根地址（如 /v1beta）。选区作为参考蒙版发送，最终仅把选区内像素加入图层。' : '操控使用 /chat/completions 的工具调用；生图使用同一端点的图片输出。模型需支持所选用途。支持工具调用的模型用于操控，支持图片输出的模型用于生图；不限制平台品牌。'; }
    type.onchange = () => { if (!chooser.value) { forAssistant.checked = type.value === 'chat'; forImage.checked = type.value !== 'chat'; } explain(); };
    function load(id) {
      const p = state.profiles.find(p => p.id === id); name.value = p?.name || ''; type.value = p?.type || 'images'; url.value = p?.url || ''; model.value = p?.model || ''; key.value = p ? secret(p) : ''; remember.checked = !!p?.remember; forAssistant.checked = p ? state.assistant === p.id : type.value === 'chat'; forImage.checked = p ? state.image === p.id : type.value !== 'chat'; key.type = 'password'; reveal.textContent = '显示'; explain(); status('');
    }
    chooser.onchange = () => { cancel(); load(chooser.value); }; load(chooser.value);
    function draft() { const p = { id: chooser.value || crypto.randomUUID(), name: name.value.trim() || model.value.trim(), type: type.value, url: url.value.trim(), model: model.value.trim(), remember: remember.checked }; validate(p); return p; }
    const actions = el('div', 'ai-form-actions');
    const save = button('保存并使用', () => {} , 'ai-primary'); save.type = 'submit';
    const test = button('测试连接', async () => {
      let timeout, current; try {
        cancel(); const p = draft(), k = key.value.trim(), signal = new AbortController(); controller = signal; current = ++job;
        timeout = setTimeout(() => signal.abort(), 15000); test.disabled = true; status('正在检查模型接口，不会生成图片…');
        const target = new URL(endpoint(p, 'generate'));
        target.pathname = p.type === 'gemini' ? target.pathname.replace(/\/models\/[^/]+:generateContent$/, '/models') : target.pathname.replace(/\/(?:images\/generations|chat\/completions)$/, '/models');
        const headers = k ? p.type === 'gemini' ? { 'x-goog-api-key': k } : { Authorization: 'Bearer ' + k } : {};
        const data = await jsonRequest(target.href, { headers }, signal.signal, k); if (job !== current) return;
        const models = p.type === 'gemini' ? data.models?.map(m => m.name.replace(/^models\//, '')) : data.data?.map(m => m.id);
        if (!Array.isArray(models)) throw Error('地址可访问，但返回格式不是模型列表；请核对接口类型。');
        const modelInfo = data.data?.find(m => m.id === p.model);
        status(Array.isArray(modelInfo?.output_modalities) && !modelInfo.output_modalities.includes('image') ? '连接成功，此模型只输出文字，可用于操控编辑器。生图、填充和 AI 移除需要另选支持图片输出的模型。' : models.includes(p.model) ? '连接成功，模型列表包含此模型。图像生成与编辑能力仍以平台文档为准。' : '连接成功，但列表中未找到此模型；请核对名称。部分平台不公开完整列表。');
      } catch (e) { if (current === undefined || current === job) status(e.name === 'AbortError' ? '连接检查已取消或超时。' : e.message + ' 部分平台不提供 /models，仍可保存配置。', true); }
      finally { clearTimeout(timeout); if (current === job) controller = null; test.disabled = false; }
    });
    const remove = button('删除配置', () => {
      if (!chooser.value) return; state.profiles = state.profiles.filter(p => p.id !== chooser.value); delete memory[chooser.value]; if (state.image === chooser.value) state.image = ''; if (state.assistant === chooser.value) state.assistant = ''; state.active = state.profiles[0]?.id || ''; try { persist(); render('settings'); status('配置已删除。'); } catch (_) { status('浏览器不允许保存设置。', true); }
    });
    actions.append(save, test, remove); form.append(note, protocolHelp, actions); content.append(form);
    form.onsubmit = e => {
      e.preventDefault(); try {
        const p = draft(); if (forAssistant.checked && p.type !== 'chat') throw Error('操控编辑器请选择 Chat API 接口类型。'); const k = key.value.trim(), index = state.profiles.findIndex(x => x.id === p.id); memory[p.id] = k; if (p.remember) p.key = k;
        if (index < 0) state.profiles.push(p); else state.profiles[index] = p; state.active = p.id; if (forAssistant.checked) state.assistant = p.id; else if (state.assistant === p.id) state.assistant = ''; if (forImage.checked) state.image = p.id; else if (state.image === p.id) state.image = ''; persist();
        render(forAssistant.checked && !forImage.checked ? 'assistant' : 'tools'); status('已使用“' + p.name + '”。可在“AI 助手”和“图像工具”分别选择平台，也可共用此配置。');
      } catch (error) { status(error.message, true); }
    };
  }
  function tools(content, mode) {
    const form = el('form', 'ai-tools'); const profiles = field(form, '当前平台', 'ai-tool-profile', 'select');
    option(profiles, '', '请先添加 AI 配置'); state.profiles.forEach(p => option(profiles, p.id, p.name)); profiles.value = state.image;
    profiles.onchange = () => assign('image', profiles.value);
    const configure = button('管理平台与 Key', () => render('settings'), 'ai-configure'); form.append(configure);
    const modeSelect = field(form, '使用工具', 'ai-mode', 'select'); Object.keys(labels).forEach(k => option(modeSelect, k, labels[k])); modeSelect.value = mode;
    const hint = el('p', 'ai-note');
    const prompt = field(form, '描述你想要的效果', 'ai-prompt', 'textarea', '例如：把选中区域换成盛开的白色花朵，保留原有光线。'); prompt.rows = 4; prompt.maxLength = 12000;
    function describe() {
      const m = modeSelect.value, selected = !!app.xK()?.h;
      hint.textContent = m === 'generate' ? '根据文字生成图片；有画布时添加为新图层，无画布时新建 1024 × 1024 文档。' : m === 'edit' ? '把当前画布的可见合成图发送给 AI；结果作为完整新图层加入。' : '先用框选或套索工具选择区域。仅发送当前合成图与蒙版，结果只在选区内显示；原图保留。';
      if (m === 'remove') prompt.placeholder = '可留空，自动移除选中的物体并补全背景。';
      else prompt.placeholder = '描述你想要的画面、物体或编辑效果。';
      hint.dataset.selection = String(selected);
    }
    modeSelect.onchange = describe; describe(); form.append(hint);
    const actions = el('div', 'ai-form-actions'), run = button('生成并添加图层', () => {}, 'ai-primary'); run.type = 'submit';
    const stop = button('取消生成', () => { cancel(); status('已取消生成，画布未更改。'); run.disabled = false; stop.hidden = true; }); stop.hidden = true; actions.append(run, stop); form.append(actions);
    form.append(el('p', 'ai-note', '点击生成后会调用所选平台，费用按平台规则计算。关闭面板会取消等待；平台可能已经开始处理请求。'));
    content.append(form);
    form.onsubmit = async e => {
      e.preventDefault(); let timeout; let current;
      try {
        const p = Object.assign({}, validate(active('image'))), m = modeSelect.value, text = prompt.value.trim();
        if (m !== 'remove' && !text) throw Error('请填写效果描述。');
        const shot = capture(m); current = ++job; const abort = new AbortController(); controller = abort; timeout = setTimeout(() => abort.abort(), 180000);
        run.disabled = true; stop.hidden = false; status('正在生成，请稍候…');
        const bytes = await requestImage(p, m, text || 'Remove the selected object. Naturally reconstruct the background, matching the surrounding texture, lighting and perspective. Do not change unmasked areas.', shot, abort.signal);
        if (current !== job || abort.signal.aborted) return; ensureTarget(shot);
        await applyImage(bytes, shot, m, () => current === job && !abort.signal.aborted); if (current !== job) return;
        status('已添加“' + labels[m] + '”图层，可在图层面板调整，或按 Ctrl / ⌘ + Z 撤销。');
      } catch (error) { if (current === undefined || current === job) status(error.name === 'AbortError' ? '请求超时或已取消，请稍后重试。' : error.message, true); }
      finally { clearTimeout(timeout); if (current === job) controller = null; run.disabled = false; stop.hidden = true; }
    };
  }
  ui.installAI = function (adapter) {
    native = adapter;
    const prefs = native.Preferences.prototype.Ts;
    native.Preferences.prototype.Ts = function () {
      const result = prefs.apply(this, arguments); this.tB[16]._.style.display = 'none';
      if (!this._senkouAI) { this._senkouAI = button('AI 设置', () => { this.amX(); ui.ai.open('settings'); }, 'ai-preferences'); this.body.append(this._senkouAI); }
      return result;
    };
    const fill = native.Fill.prototype.iB;
    native.Fill.prototype.iB = function (event) {
      if (event?.t === 'fromAction' && event.Iy?._o?.Usng?.v?.FlCn === 'aiHeal') { ui.ai.open('tools', 'fill'); return; }
      return fill.apply(this, arguments);
    };
  };
  ui.startAI = function (editor) {
    app = editor; build(); assistant = ui.createAssistant({ app, native, el, button, status, profile: active, profiles: () => state.profiles, secret, endpoint, jsonRequest, assign, settings: () => render('settings') });
    const entry = button('', () => ui.ai.open('assistant'), 'workspace-ai'); entry.innerHTML = icon('spark') + '<span>AI 对话</span>'; entry.title = '打开 AI 对话，直接描述编辑任务';
    document.querySelector('.workspace-actions').prepend(entry);
    const welcome = document.querySelector('.welcome-content'); if (welcome) welcome.append(button('AI 生成图像', () => ui.ai.open('tools', 'generate'), 'welcome-ai'));
    const help = document.getElementById('workspace-help');
    if (help) { const section = el('section', 'help-ai'); section.append(el('h3', '', 'AI 与快捷任务栏'), el('p', '', '“AI 设置”填写接口地址、模型和 Key，选择操控编辑器或生图修图用途；同一配置可共用。AI 助手可通过文字任务操作画布、选区、文字和图层。图像工具支持生图、整图编辑、选区填充和 AI 移除，需要图片输出模型。平台配置位于“编辑 → 首选项 → AI 设置”。顶部与画布快捷栏的“AI 对话”可直接打开聊天框；手机也可从快捷栏进入。顶部菜单与工具选项超宽时可横向滑动。')); section.append(button('打开 AI 助手', () => { help.close(); ui.ai.open('assistant'); }), button('打开 AI 设置', () => { help.close(); ui.ai.open('settings'); })); help.insertBefore(section, help.querySelector('.help-done'));  }
    ui.ai.app = app; ui.ai.native = native; ui.startContextbar(app, native);
  };
  ui.ai = { open(tab, mode) { opener = document.activeElement; if (!panel.open) panel.showModal(); render(tab || 'assistant', mode); panel.querySelector(tab === 'settings' ? '#ai-name' : tab === 'assistant' ? '#ai-task' : '#ai-prompt')?.focus(); }, icon, el, button, active, endpoint };
}());
