(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const yaml = window.jsyaml;
  let careersEditor = null, careersVersion = null;
  let backend = null, files = [], settings = null, current = null, section = 'posts', dirty = false, working = false;
  const status = (text, bad = false) => { $('status').textContent = text; $('status').classList.toggle('is-error', bad); };
  const loginKey = 'senkou.admin.login.v1';
  const dayMs = 24 * 60 * 60 * 1000;
  let rememberedUntil = 0, expiryTimer = 0;
  function stopRemembering() {
    clearTimeout(expiryTimer); rememberedUntil = 0;
    $('remember-state').hidden = true; $('remember-state').textContent = '';
    $('disconnect').textContent = '退出登录';
  }
  function forgetLogin() {
    stopRemembering();
    try { localStorage.removeItem(loginKey); return true; } catch { return false; }
  }
  function readLogin() {
    try {
      const value = JSON.parse(localStorage.getItem(loginKey));
      if (!value) return null;
      if (value.version !== 1 || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repo)
        || typeof value.branch !== 'string' || !value.branch.trim() || typeof value.token !== 'string' || !value.token.trim()
        || ![7, 30].includes(value.days) || !Number.isFinite(value.savedAt) || !Number.isFinite(value.expiresAt)
        || value.expiresAt !== value.savedAt + value.days * dayMs || value.expiresAt <= Date.now()) {
        forgetLogin(); return null;
      }
      return value;
    } catch { forgetLogin(); return null; }
  }
  function checkLoginExpiry() {
    clearTimeout(expiryTimer);
    if (!rememberedUntil) return;
    const remaining = rememberedUntil - Date.now();
    if (remaining <= 0) {
      forgetLogin(); status('记住登录已到期，本次编辑可以继续；下次进入后台需要重新连接。');
    } else expiryTimer = setTimeout(checkLoginExpiry, Math.min(remaining, dayMs));
  }
  function showRememberedLogin(value) {
    rememberedUntil = value.expiresAt;
    $('remember-state').textContent = '已记住登录 · 至 ' + new Date(value.expiresAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
    $('remember-state').hidden = false; $('disconnect').textContent = '退出并清除登录';
    checkLoginExpiry();
  }
  function rememberLogin(credentials, days) {
    const savedAt = Date.now();
    const value = { version: 1, ...credentials, days, savedAt, expiresAt: savedAt + days * dayMs };
    try { localStorage.setItem(loginKey, JSON.stringify(value)); showRememberedLogin(value); return true; }
    catch { forgetLogin(); return false; }
  }
  const setDirty = value => { dirty = value; $('save').textContent = dirty ? '保存修改 ·' : '保存修改'; };
  const encode = value => btoa(Array.from(new TextEncoder().encode(value), byte => String.fromCharCode(byte)).join(''));
  const decode = value => new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g, '')), char => char.charCodeAt(0)));
  const split = content => {
    const match = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    return match ? { front: yaml.load(match[1], { schema: yaml.JSON_SCHEMA }) || {}, body: match[2].replace(/^\r?\n/, '') } : { front: {}, body: content };
  };
  const titleFor = file => { try { return split(file.content).front.title || file.path.split('/').at(-1); } catch { return file.path; } };
  const editable = path => /^studio-content\/source\/(?:_posts\/[^/]+\.md|(?:[a-zA-Z0-9_-]+\/)+index\.md)$/.test(path) && !path.includes('..');
  async function responseJson(response) {
    let data; try { data = await response.json(); } catch { throw new Error('没有收到有效响应，请确认预览已启动或 GitHub 连接正常。'); }
    if (!response.ok) throw Object.assign(new Error(data.error || data.message || `请求失败（${response.status}）。`), { status: response.status });
    return data;
  }
  function localBackend(nonce) {
    async function request(route, body) {
      return responseJson(await fetch('../__studio_api/' + route, {
        method: body ? 'PUT' : 'GET', headers: { 'X-Studio-Session': nonce, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      }));
    }
    return { name: '本地编辑', load: () => request('state'), save: file => request('file', file), saveSettings: value => request('settings', value), loadCareers: () => request('careers'), saveCareers: value => request('careers', value), listReviews: () => request('reviews'), moderate: value => request('review', value) };
  }
  function githubBackend(repo, branch, token) {
    const base = 'https://api.github.com/repos/' + repo;
    const ref = encodeURIComponent(branch);
    const headers = { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' };
    const request = async (path, method = 'GET', body) => {
      try { return await responseJson(await fetch(base + path, { method, headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })); }
      catch (error) {
        if (error.status === 401) { forgetLogin(); error.message = 'GitHub 令牌已失效或被撤销，已清除记住的登录。请重新连接。'; }
        throw error;
      }
    };
    const get = async (path, revision = branch) => {
      const data = await request('/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(revision));
      if (data.type !== 'file' || data.encoding !== 'base64') throw new Error('该文件无法读取：' + path);
      return { path, content: decode(data.content), sha: data.sha };
    };
    let configFile, siteFile;
    return {
      name: 'GitHub / ' + repo,
      async load() {
        const tree = await request('/git/trees/' + ref + '?recursive=1');
        if (tree.truncated) throw new Error('仓库过大，无法完整读取。请使用单独的网站仓库。');
        [configFile, siteFile] = await Promise.all([get('_config.yml'), get('studio-content/site.yml')]);
        const paths = tree.tree.filter(item => item.type === 'blob' && editable(item.path));
        const list = [];
        // Four parallel reads avoid exhausting the browser's connection pool.
        for (let start = 0; start < paths.length; start += 4) list.push(...await Promise.all(paths.slice(start, start + 4).map(item => get(item.path))));
        const config = yaml.load(configFile.content), site = yaml.load(siteFile.content);
        if (!config?.studio || !site?.theme) throw new Error('这个仓库不是森口电竞网站项目，请确认仓库名。');
        return { files: list, settings: { site, studio: config.studio, version: configFile.sha + ':' + siteFile.sha } };
      },
      async save(file) {
        const data = await request('/contents/' + file.path.split('/').map(encodeURIComponent).join('/'), 'PUT', { message: '更新手记：' + titleFor(file), content: encode(file.content), branch, ...(file.sha ? { sha: file.sha } : {}) });
        return { sha: data.content.sha, message: '已提交到 GitHub，网站将在部署工作流完成后更新。' };
      },
      async saveSettings(value) {
        const reference = await request('/git/ref/heads/' + ref);
        const [latestConfig, latestSite] = await Promise.all([get('_config.yml', reference.object.sha), get('studio-content/site.yml', reference.object.sha)]);
        if (value.version !== latestConfig.sha + ':' + latestSite.sha) throw new Error('配置已被其他操作修改，请重新载入后保存。');
        const config = yaml.load(latestConfig.content), site = yaml.load(latestSite.content);
        config.studio = value.studio;
        Object.assign(site, value.site);
        // One tree and one commit keep theme + site settings in one deployment.
        const parent = await request('/git/commits/' + reference.object.sha);
        const configText = yaml.dump(config, { lineWidth: -1 });
        const siteText = yaml.dump(site, { lineWidth: -1 });
        const tree = await request('/git/trees', 'POST', { base_tree: parent.tree.sha, tree: [
          { path: '_config.yml', mode: '100644', type: 'blob', content: configText },
          { path: 'studio-content/site.yml', mode: '100644', type: 'blob', content: siteText }
        ] });
        const commit = await request('/git/commits', 'POST', { message: '更新森口电竞网站信息', tree: tree.sha, parents: [reference.object.sha] });
        await request('/git/refs/heads/' + ref, 'PATCH', { sha: commit.sha, force: false });
        configFile = await get('_config.yml', commit.sha); siteFile = await get('studio-content/site.yml', commit.sha);
        return { version: configFile.sha + ':' + siteFile.sha, message: '网站信息已提交到 GitHub，等待部署完成即可查看。' };
      },
      async loadCareers() {
        try { const file = await get('studio-content/source/careers/data.json'); return { data: window.SenkouCareersData.validate(JSON.parse(file.content.replace(/^\uFEFF/, ''))), version: file.sha }; }
        catch (error) { if (error.status === 404) return { data: window.SenkouCareersData.empty(), version: null }; throw error; }
      },
      async saveCareers(value) {
        const data = window.SenkouCareersData.validate(value.data);
        const result = await request('/contents/studio-content/source/careers/data.json', 'PUT', { message: '更新森口电竞招聘信息', content: encode(JSON.stringify(data, null, 2) + '\n'), branch, ...(value.version ? { sha: value.version } : {}) });
        return { version: result.content.sha, message: '招聘信息已提交到 GitHub，托管平台部署成功后生效。' };
      },
      async listReviews() {
        const published = await get('studio-content/source/reviews/data.json');
        const approved = JSON.parse(published.content.replace(/^\uFEFF/, '')).reviews || [];
        const issues = [];
        for (let page = 1; page <= 5; page++) {
          const batch = await request('/issues?state=open&per_page=100&page=' + page);
          issues.push(...batch); if (batch.length < 100) break;
        }
        const pending = issues.filter(issue => !issue.pull_request && issue.title.startsWith('[客户评价]') && !approved.some(item => item.sourceIssue === issue.number)).map(issue => {
          const match = (issue.body || '').match(/^<!-- senkou-review:v1 -->\s*### 评价对象\s*([^\n]+)\s*### 星级\s*([1-5])\s*### 内容\r?\n([\s\S]*?)\r?\n\r?\n由森口电竞网站评价表单生成，审核通过后展示。\s*$/);
          return match ? { id: 'github-' + issue.number, sourceIssue: issue.number, target: match[1].trim(), rating: Number(match[2]), content: match[3].trim().slice(0, 300), createdAt: issue.created_at, author: issue.user?.login } : null;
        }).filter(Boolean);
        return { approved, pending };
      },
      async moderate(value) {
        const dataFile = await get('studio-content/source/reviews/data.json');
        const data = JSON.parse(dataFile.content.replace(/^\uFEFF/, ''));
        if (value.action === 'approve') {
          const item = (await this.listReviews()).pending.find(item => item.id === value.id);
          if (!item) throw new Error('评价已被处理，请重新载入。');
          const { author, ...review } = item; data.reviews.push(review); data.reviews = data.reviews.slice(-100);
        } else if (value.action === 'remove') data.reviews = data.reviews.filter(item => item.id !== value.id);
        if (value.action !== 'reject') await request('/contents/studio-content/source/reviews/data.json', 'PUT', { message: value.action === 'approve' ? '发布一条客户评价' : '撤下一条客户评价', content: encode(JSON.stringify(data, null, 2) + '\n'), branch, sha: dataFile.sha });
        let message = value.action === 'approve' ? '已通过审核并提交到 GitHub。等待托管平台自动部署成功后，网站评价和成员星级会更新，无需再次上传。' : value.action === 'remove' ? '已提交撤下操作，等待托管平台自动部署成功后网站更新。' : '已拒绝这条评价。';
        if (value.action !== 'remove') {
          const issueNumber = Number(value.id.replace('github-', ''));
          if (!Number.isInteger(issueNumber) || issueNumber < 1) throw new Error('评价编号无效。');
          try { await request('/issues/' + issueNumber, 'PATCH', { state: 'closed', state_reason: value.action === 'approve' ? 'completed' : 'not_planned' }); }
          catch (error) { if (value.action === 'reject') throw error; message += ' 原评价未能关闭，请检查令牌的 Issues 权限。'; }
        }
        return { ...await this.listReviews(), message };
      },
      disconnect() { token = ''; headers.Authorization = ''; }
    };
  }
  function showConnection() { $('workspace').hidden = true; $('connect-panel').hidden = false; $('connection-state').textContent = '尚未连接'; $('disconnect').hidden = true; }
  function renderList() {
    $('file-list').replaceChildren();
    for (const file of files.filter(file => section === 'posts' ? file.path.includes('/_posts/') : section === 'pages' && !file.path.includes('/_posts/')).sort((a, b) => a.path.localeCompare(b.path))) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = titleFor(file); button.title = file.path;
      button.classList.toggle('current', current?.path === file.path);
      button.addEventListener('click', () => openFile(file)); $('file-list').append(button);
    }
    for (const [id, name] of [['posts-tab', 'posts'], ['pages-tab', 'pages'], ['settings-tab', 'settings'], ['reviews-tab', 'reviews'], ['careers-tab', 'careers']]) $(id).classList.toggle('selected', section === name);
  }
  async function saveIfNeeded() { if (dirty) return await save(); return true; }
  function populateFile(file) {
    $('careers-editor').hidden = true;
    const parsed = split(file.content); current = { ...file, front: parsed.front };
    $('post-title').value = parsed.front.title || '';
    $('post-path').value = file.path.split('/').at(-1); $('post-path').readOnly = Boolean(file.sha) || !file.path.includes('/_posts/');
    const date = parsed.front.date;
    $('post-date').value = date instanceof Date ? date.toISOString().replace('T', ' ').slice(0, 19) : (date || '');
    $('post-cover').value = parsed.front.cover || '';
    $('post-categories').value = [parsed.front.categories || []].flat().join(', ');
    $('post-tags').value = [parsed.front.tags || []].flat().join(', ');
    $('post-body').value = parsed.body;
    $('editor-title').textContent = parsed.front.title || '新的手记'; $('editor-type').textContent = file.path.includes('/_posts/') ? 'FIELD NOTES / 工作室手记' : 'PAGES / 网站页面';
    $('reviews-editor').hidden = true; $('save').hidden = false;
    $('post-editor').hidden = false; $('settings-editor').hidden = true; $('editor-empty').hidden = true;
    setDirty(false); renderList();
  }
  async function openFile(file) { if (working || !(await saveIfNeeded())) return; try { populateFile(file); } catch (error) { status('这篇文章的 YAML 格式有误：' + error.message, true); } }
  function field(label, key, value, parent, type = 'text', options = []) {
    const wrap = document.createElement('label'); wrap.textContent = label;
    let input;
    if (type === 'textarea') input = document.createElement('textarea');
    else if (type === 'select') { input = document.createElement('select'); for (const [optionValue, optionLabel] of options) { const option = document.createElement('option'); option.value = optionValue; option.textContent = optionLabel; input.append(option); } }
    else { input = document.createElement('input'); input.type = type; }
    input.value = value ?? ''; input.dataset.setting = key;
    if (type === 'number') { input.min = '0'; input.max = '5'; input.step = '1'; }
    wrap.append(input); parent.append(wrap); return input;
  }
  function group(title, action) {
    const block = document.createElement('section'); block.className = 'settings-group';
    const headingRow = document.createElement('div'); headingRow.className = 'settings-group-heading';
    const heading = document.createElement('h2'); heading.textContent = title; headingRow.append(heading);
    if (action) { const button = document.createElement('button'); button.type = 'button'; button.textContent = action.label; button.className = action.className || ''; button.addEventListener('click', action.onClick); headingRow.append(button); }
    const grid = document.createElement('div'); grid.className = 'form-grid'; block.append(headingRow, grid); $('settings-fields').append(block); return grid;
  }
  function readSettingsForm() {
    const value = structuredClone(settings);
    for (const input of $('settings-fields').querySelectorAll('[data-setting]')) {
      const keys = input.dataset.setting.split('.'); let target = value;
      for (const key of keys.slice(0, -1)) target = target[key] ??= {};
      const last = keys.at(-1);
      target[last] = last === 'tags' ? input.value.split(/[,，]/).map(item => item.trim()).filter(Boolean) : ['featured', 'future'].includes(last) ? input.value === 'true' : input.type === 'number' ? Number(input.value) : input.value;
    }
    return value;
  }
  function editorAction(label, onClick, className = '') {
    return { label, onClick, className };
  }
  function renderSettingsFields() {
    const studio = settings.studio ||= {};
    const services = Array.isArray(studio.services) && studio.services.length ? studio.services : [
      { id: 'escort', eyebrow: '01 / ESCORT', name: '护航', description: '带着目标进场，和队友一起行动。\n先聊需求，再确定本局安排。', tags: ['目标沟通', '协同配合'], link_label: '了解护航服务', icon: 'shield', badge: '' },
      { id: 'entertainment', eyebrow: '02 / JUST FOR FUN', name: '娱乐', description: '把输赢先放一放，快乐放在前面。\n一起尝试，一起收集有趣瞬间。', tags: ['轻松开局', '快乐同行'], link_label: '了解娱乐玩法', icon: 'star', featured: true, badge: '' },
      { id: 'companion', eyebrow: '03 / TEAM UP', name: '陪玩', description: '不必一个人匹配，找个合拍的队友。\n聊聊你的节奏，再一起开一局。', tags: ['组队交流', '按需约局'], link_label: '了解陪玩服务', icon: 'team', badge: '' }
    ];
    studio.services = services;
    studio.members = Array.isArray(studio.members) ? studio.members : [];
    $('settings-fields').replaceChildren();
    let grid = group('网站与工作室');
    for (const [label, key] of [['网站名称', 'title'], ['副标题', 'subtitle'], ['作者', 'author'], ['网站地址', 'url'], ['网站根路径', 'root'], ['网站简介', 'description']]) field(label, 'site.' + key, settings.site[key], grid, key === 'description' ? 'textarea' : 'text');
    for (const [label, key] of [['工作室名称', 'name'], ['游戏名称', 'game'], ['构想时间 · YYYY.MM', 'idea_date'], ['成立时间 · YYYY.MM', 'launch_date'], ['加入我们按钮文字', 'join_label']]) field(label, 'studio.' + key, studio[key], grid);
    grid = group('服务区文案');
    for (const [label, key] of [['眉题', 'eyebrow'], ['标题前半句', 'title'], ['标题强调', 'title_emphasis'], ['说明第一行', 'description'], ['说明第二行', 'subdescription'], ['底部提示', 'services_footnote']]) field(label, key === 'services_footnote' ? 'studio.' + key : 'studio.services_intro.' + key, key === 'services_footnote' ? studio[key] : (studio.services_intro?.[key] || ''), grid, key === 'services_footnote' ? 'textarea' : 'text');
    services.forEach((service, index) => {
      grid = group('服务项目 / ' + String(index + 1).padStart(2, '0'), editorAction('删除', () => { const value = readSettingsForm(); value.studio.services.splice(index, 1); if (!value.studio.services.length) value.studio.services.push({ id: 'service-1', eyebrow: '01 / NEW SERVICE', name: '新服务', description: '', tags: [], link_label: '了解服务详情', icon: 'shield', badge: '' }); settings = value; renderSettingsFields(); setDirty(true); }, 'careers-admin-delete'));
      for (const [label, key] of [['编号', 'id'], ['眉题', 'eyebrow'], ['名称', 'name'], ['右上角丝带标签', 'badge'], ['描述（可换行）', 'description'], ['标签（逗号分隔）', 'tags'], ['链接文字', 'link_label'], ['图标类型', 'icon'], ['自定义链接（可选）', 'href']]) {
        const type = key === 'description' ? 'textarea' : key === 'icon' ? 'select' : 'text';
        const options = [['shield', '盾牌'], ['star', '星星'], ['team', '队伍'], ['bolt', '闪电']];
        field(label, 'studio.services.' + index + '.' + key, key === 'tags' ? (service.tags || []).join('，') : service[key], grid, type, options);
      }
      field('突出显示', 'studio.services.' + index + '.featured', service.featured ? 'true' : '', grid, 'select', [['', '否'], ['true', '是']]);
    });
    const servicesAdd = document.createElement('button'); servicesAdd.type = 'button'; servicesAdd.textContent = '＋新增服务项目'; servicesAdd.addEventListener('click', () => { const value = readSettingsForm(); value.studio.services.push({ id: 'service-' + (value.studio.services.length + 1), eyebrow: String(value.studio.services.length + 1).padStart(2, '0') + ' / NEW SERVICE', name: '新服务', description: '', tags: [], link_label: '了解服务详情', icon: 'shield', badge: '' }); settings = value; renderSettingsFields(); setDirty(true); }); $('settings-fields').append(servicesAdd);
    grid = group('成员区文案');
    const crewIntro = studio.crew_intro || {};
    for (const [label, key] of [['眉题', 'eyebrow'], ['标题前半句', 'title'], ['标题强调', 'title_emphasis'], ['说明第一行', 'description'], ['说明第二行', 'subdescription']]) field(label, 'studio.crew_intro.' + key, crewIntro[key], grid);
    const contact = studio.contact ||= {};
    grid = group('预约区文案与链接');
    for (const [label, key, type] of [['按钮文字', 'label', 'text'], ['预约链接', 'url', 'text'], ['眉题', 'eyebrow', 'text'], ['标题', 'title', 'textarea'], ['说明', 'description', 'textarea'], ['提示文字', 'prompt', 'text'], ['详情链接文字', 'link_label', 'text'], ['底部左侧', 'bottom_left', 'text'], ['底部右侧', 'bottom_right', 'text']]) field(label, 'studio.contact.' + key, contact[key], grid, type);
    const about = studio.about ||= {};
    grid = group('关于区文案');
    for (const [label, key, type] of [['眉题', 'eyebrow', 'text'], ['标题', 'title', 'textarea'], ['介绍', 'intro', 'textarea'], ['故事', 'story', 'textarea'], ['价值关键词', 'values_title', 'text'], ['价值英文副标题', 'values_subtitle', 'text']]) field(label, 'studio.about.' + key, about[key], grid, type);
    const timeline = Array.isArray(about.timeline) ? about.timeline : [];
    about.timeline = timeline;
    timeline.forEach((item, index) => {
      grid = group('时间线 / ' + String(index + 1).padStart(2, '0'), editorAction('删除', () => { const value = readSettingsForm(); value.studio.about.timeline.splice(index, 1); settings = value; renderSettingsFields(); setDirty(true); }, 'careers-admin-delete'));
      for (const [label, key, type] of [['日期或标识', 'date', 'text'], ['标题', 'title', 'text'], ['内容', 'body', 'textarea']]) field(label, 'studio.about.timeline.' + index + '.' + key, item[key], grid, type);
      field('未来计划', 'studio.about.timeline.' + index + '.future', item.future ? 'true' : '', grid, 'select', [['', '否'], ['true', '是']]);
    });
    const timelineAdd = document.createElement('button'); timelineAdd.type = 'button'; timelineAdd.textContent = '＋新增时间线项目'; timelineAdd.addEventListener('click', () => { const value = readSettingsForm(); value.studio.about.timeline.push({ date: '', title: '新的时间节点', body: '', future: false }); settings = value; renderSettingsFields(); setDirty(true); }); $('settings-fields').append(timelineAdd);
    const serviceConsent = window.SenkouServiceConsentData.validate(studio.service_consent);
    grid = group('预约提交表 · 弹窗内容');
    const consentHelp = document.createElement('p'); consentHelp.className = 'field-help'; consentHelp.textContent = '这里修改点击“提交表”后的须知弹窗。正文用空行分段，段内可换行；滚动到底才能同意的规则保持不变。在线保存后随网站部署生效。'; grid.before(consentHelp);
    for (const spec of window.SenkouServiceConsentData.fields) { const input = field(spec.label, 'studio.service_consent.' + spec.key, serviceConsent[spec.key], grid, spec.multiline ? 'textarea' : 'text'); input.maxLength = spec.max; input.required = true; if (spec.multiline) input.closest('label').classList.add('consent-editor-wide'); if (['guidelines', 'disclaimer'].includes(spec.key)) input.classList.add('consent-editor-body'); }
    const members = studio.members;
    members.forEach((member, index) => {
      grid = group('小队成员 / ' + String(index + 1).padStart(2, '0'), editorAction('删除', () => { const value = readSettingsForm(); if (value.studio.members.length <= 1) return; value.studio.members.splice(index, 1); settings = value; renderSettingsFields(); setDirty(true); }, 'careers-admin-delete'));
      for (const [label, key] of [['显示名称', 'name'], ['昵称', 'handle'], ['身份', 'role'], ['头像地址', 'avatar'], ['头像右上角丝带标签', 'badge'], ['头像底部标签', 'portrait_label'], ['成员编号', 'squad_label']]) field(label, 'studio.members.' + index + '.' + key, member[key], grid);
    });
    const membersAdd = document.createElement('button'); membersAdd.type = 'button'; membersAdd.textContent = '＋新增成员'; membersAdd.addEventListener('click', () => { const value = readSettingsForm(); value.studio.members.push({ name: '新成员', handle: 'new-member', role: '工作室成员', avatar: '/assets/welkin/avatars/sendu.webp', badge: '', portrait_label: 'MEMBER / ' + String(value.studio.members.length + 1).padStart(2, '0'), squad_label: 'SQUAD / ' + String(value.studio.members.length + 1).padStart(2, '0') }); settings = value; renderSettingsFields(); setDirty(true); }); $('settings-fields').append(membersAdd);
  }
  async function openSettings() {
    if (working || !(await saveIfNeeded())) return;
    $('reviews-editor').hidden = true; $('save').hidden = false;
    $('careers-editor').hidden = true;
    section = 'settings'; current = null; renderList(); $('file-list').replaceChildren();
    renderSettingsFields();
    $('editor-title').textContent = '网站设置'; $('editor-type').textContent = 'STUDIO / 小队信息'; $('post-editor').hidden = true; $('settings-editor').hidden = false; $('editor-empty').hidden = true; setDirty(false);
  }  async function load() {
    status('正在载入网站内容…');
    const data = await backend.load(); settings = data.settings; files = data.files;
    $('workspace').hidden = false; $('connect-panel').hidden = true; $('connection-state').textContent = backend.name; $('disconnect').hidden = backend.name === '本地编辑';
    current = null; setDirty(false); section = 'posts'; renderList();
    for (const id of ['post-editor', 'settings-editor', 'reviews-editor', 'careers-editor']) $(id).hidden = true;
    $('save').hidden = false; $('editor-empty').hidden = true;
    const first = files.find(file => file.path.includes('/_posts/'));
    if (first) populateFile(first); else $('editor-empty').hidden = false;
    status('已连接。选择内容即可编辑，切换内容时会先保存当前修改。');
  }
  async function save() {
    if (!backend || working || (!current && !['settings', 'careers'].includes(section))) return false;
    if (!dirty) return true;
    working = true; $('save').disabled = true; $('careers-editor').inert = true; status('正在保存…');
    try {
      let result;
      if (section === 'careers') {
        if (!$('careers-editor').reportValidity()) return false;
        result = await backend.saveCareers({ data: careersEditor.read(), version: careersVersion }); careersVersion = result.version;
      } else if (section === 'settings') {
        if (!$('settings-editor').reportValidity()) return false;
        const value = readSettingsForm();
        delete value.studio.rating;
        for (const member of value.studio.members) delete member.rating;
        if (!value.site.title.trim() || !value.studio.name.trim()) throw new Error('请填写网站与工作室名称。');
        if (!/^https?:\/\//.test(value.site.url) || !/^\/(?:[a-zA-Z0-9_.~-]+\/)*$/.test(value.site.root)) throw new Error('请检查网站地址与网站根路径。');
        if (value.studio.contact?.url && !/^(https?:\/\/|mailto:|tel:)/.test(value.studio.contact.url)) throw new Error('预约链接请使用 http、https、mailto 或 tel 地址。');
        if (value.studio.reviews?.repository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.studio.reviews.repository)) throw new Error('评价仓库请使用 用户名/仓库名 格式。');
        value.studio.service_consent = window.SenkouServiceConsentData.validate(value.studio.service_consent);
        result = await backend.saveSettings(value); settings = { ...value, version: result.version };
      } else {
        if (!$('post-editor').reportValidity()) return false;
        let path = current.path;
        if (!current.sha) path = 'studio-content/source/_posts/' + $('post-path').value.trim();
        if (!editable(path)) throw new Error('文件名请使用单个 .md 文件名，不能包含路径。');
        const front = { ...current.front, title: $('post-title').value.trim() };
        for (const [key, id] of [['date', 'post-date'], ['cover', 'post-cover']]) { if ($(id).value.trim()) front[key] = $(id).value.trim(); else delete front[key]; }
        for (const [key, id] of [['categories', 'post-categories'], ['tags', 'post-tags']]) {
          const values = $(id).value.split(/[,，]/).map(value => value.trim()).filter(Boolean);
          if (values.length) front[key] = values; else delete front[key];
        }
        const content = '---\n' + yaml.dump(front, { lineWidth: -1 }) + '---\n\n' + $('post-body').value.trimEnd() + '\n';
        const file = { path, content, sha: current.sha || null };
        result = await backend.save(file);
        const saved = { ...file, sha: result.sha }; const index = files.findIndex(file => file.path === current.path);
        if (index < 0) files.push(saved); else files[index] = saved;
        populateFile(saved);
      }
      setDirty(false); renderList(); status(result.message); return true;
    } catch (error) { status(error.message, true); return false; }
    finally { working = false; $('save').disabled = false; $('careers-editor').inert = false; }
  }
  function renderReviews(data) {
    $('reviews-list').replaceChildren();
    for (const [kind, heading, list] of [['pending', '待审核', data.pending], ['approved', '已通过审核', data.approved]]) {
      const group = document.createElement('section'); group.className = 'review-admin-group';
      const title = document.createElement('h2'); title.textContent = heading + ' · ' + list.length; group.append(title);
      if (!list.length) { const empty = document.createElement('p'); empty.className = 'field-help'; empty.textContent = kind === 'pending' ? '还没有待审核的评价。' : '审核通过的评价会显示在这里。'; group.append(empty); }
      for (const review of list) {
        const article = document.createElement('article'); article.className = 'review-admin-card';
        const target = document.createElement('strong'); target.textContent = review.target + ' · ' + '★'.repeat(review.rating);
        const content = document.createElement('p'); content.textContent = review.content;
        const meta = document.createElement('small'); meta.textContent = (review.createdAt || '').slice(0, 10) + (review.author ? ' · GitHub / ' + review.author : '');
        const actions = document.createElement('div');
        for (const [action, label] of kind === 'pending' ? [['approve', '通过审核'], ['reject', '拒绝']] : [['remove', '从网站撤下']]) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
          button.addEventListener('click', async () => {
            if (working) return; working = true; button.disabled = true; status('正在处理评价…');
            try { const result = await backend.moderate({ id: review.id, action }); renderReviews(result); status(result.message); }
            catch (error) { status(error.message, true); button.disabled = false; }
            finally { working = false; }
          }); actions.append(button);
        }
        article.append(target, content, meta, actions); group.append(article);
      }
      $('reviews-list').append(group);
    }
  }
  async function openReviews() {
    if (working || !(await saveIfNeeded())) return;
    $('careers-editor').hidden = true;
    section = 'reviews'; current = null; setDirty(false); renderList(); $('file-list').replaceChildren();
    $('post-editor').hidden = true; $('settings-editor').hidden = true; $('editor-empty').hidden = true; $('save').hidden = true; $('reviews-editor').hidden = false;
    $('editor-title').textContent = '客户评价'; $('editor-type').textContent = 'KIND WORDS / 评价审核';
    status('正在读取评价…');
    try { renderReviews(await backend.listReviews()); status(backend.name === '本地编辑' ? '通过审核后，刷新首页即可查看评价。' : '通过审核后自动提交到 GitHub；托管平台部署成功后，网站评价和成员星级更新。'); }
    catch (error) { status(error.message, true); }
  }
  async function openCareers(discard = false) {
    if (working || (!discard && !(await saveIfNeeded()))) return;
    working = true; status('正在载入招聘信息…');
    try {
      const result = await backend.loadCareers();
      careersEditor = window.SenkouCareersAdmin.create($('careers-fields'), result.data, () => setDirty(true), text => status(text, true));
      careersVersion = result.version; section = 'careers'; current = null;
      for (const id of ['post-editor', 'settings-editor', 'reviews-editor', 'editor-empty']) $(id).hidden = true;
      $('careers-editor').hidden = false; $('save').hidden = false;
      $('editor-title').textContent = '招聘管理'; $('editor-type').textContent = 'JOIN US / 寻找新的队友';
      setDirty(false); renderList(); status('可增删招聘方向、类型与职位。修改完成后点击“保存修改”。');
    } catch (error) { status(error.message, true); }
    finally { working = false; }
  }
  $('careers-editor').addEventListener('submit', event => { event.preventDefault(); save(); });
  $('careers-tab').addEventListener('click', () => openCareers());
  $('reviews-tab').addEventListener('click', openReviews);
  $('save').addEventListener('click', save);
  for (const id of ['post-editor', 'settings-editor']) $(id).addEventListener('input', () => setDirty(true));
  $('post-title').addEventListener('input', () => { $('editor-title').textContent = $('post-title').value || '新的手记'; });
  $('new-post').addEventListener('click', async () => {
    if (working || !(await saveIfNeeded())) return;
    section = 'posts'; const stamp = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    let filename = stamp + '-new-story.md'; let index = 1;
    while (files.some(file => file.path.endsWith('/' + filename))) filename = stamp + '-new-story-' + index++ + '.md';
    populateFile({ path: 'studio-content/source/_posts/' + filename, content: '---\ntitle: 新的手记\ndate: ' + stamp + ' 12:00:00\n---\n\n从这里写下小队的新故事。\n', sha: null });
    setDirty(true); $('post-title').focus();
  });
  $('settings-tab').addEventListener('click', openSettings);
  for (const [id, value] of [['posts-tab', 'posts'], ['pages-tab', 'pages']]) $(id).addEventListener('click', async () => {
    if (working || !(await saveIfNeeded())) return;
    section = value; current = null; renderList();
    const first = files.find(file => value === 'posts' ? file.path.includes('/_posts/') : !file.path.includes('/_posts/'));
    if (first) populateFile(first); else { for (const id of ['post-editor', 'settings-editor', 'reviews-editor', 'careers-editor', 'save']) $(id).hidden = true; $('editor-empty').hidden = false; setDirty(false); }
  });
  $('reload').addEventListener('click', async () => { if (working) return; if (dirty && !confirm('重新载入会放弃当前未保存的修改，继续吗？')) return; try { if (section === 'careers') await openCareers(true); else if (section === 'reviews') await openReviews(); else await load(); } catch (error) { status(error.message, true); } });
  $('disconnect').addEventListener('click', async () => {
    if (working || !(await saveIfNeeded())) return;
    backend?.disconnect?.(); backend = null; settings = null; files = []; current = null; careersEditor = null; careersVersion = null;
    const cleared = forgetLogin();
    $('token').value = ''; $('remember-login').checked = false; $('remember-days').disabled = true;
    showConnection(); status(cleared ? '已退出，记住的登录信息和页面中的令牌已清除。' : '已退出，但浏览器未允许清除存储，请在浏览器设置中清除本站数据。', !cleared);
  });
  $('remember-login').addEventListener('change', () => { $('remember-days').disabled = !$('remember-login').checked; });
  window.addEventListener('focus', checkLoginExpiry);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkLoginExpiry(); });
  window.addEventListener('storage', event => { if (event.key === loginKey || event.key === null) stopRemembering(); });
  $('connect-form').addEventListener('submit', async event => {
    event.preventDefault(); if (working) return; working = true;
    const button = event.submitter || $('connect-form').querySelector('button[type="submit"]'); button.disabled = true;
    const credentials = { repo: $('repo').value.trim(), branch: $('branch').value.trim(), token: $('token').value.trim() };
    const shouldRemember = $('remember-login').checked, days = Number($('remember-days').value);
    forgetLogin();
    try {
      backend = githubBackend(credentials.repo, credentials.branch, credentials.token); $('token').value = ''; await load();
      if (shouldRemember && [7, 30].includes(days)) {
        if (rememberLogin(credentials, days)) status('已连接，已在此浏览器记住登录 ' + days + ' 天。到期或退出后需重新连接。');
        else status('已连接，但浏览器未允许保存登录信息，本次连接仍可正常编辑。', true);
      }
    }
    catch (error) { backend?.disconnect?.(); backend = null; showConnection(); status(error.message, true); }
    finally { working = false; button.disabled = false; }
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  async function restoreLogin() {
    const value = readLogin();
    if (!value) { showConnection(); status('连接仓库后开始编辑；可选择在此浏览器记住登录。'); return; }
    $('repo').value = value.repo; $('branch').value = value.branch;
    $('remember-login').checked = true; $('remember-days').value = String(value.days); $('remember-days').disabled = false;
    const button = $('connect-form').querySelector('button[type="submit"]'); button.disabled = true; working = true;
    try {
      status('正在使用记住的登录连接 GitHub…');
      backend = githubBackend(value.repo, value.branch, value.token); await load();
      showRememberedLogin(value); status('已自动连接。可继续编辑，退出登录会清除本浏览器记住的信息。');
    } catch (error) {
      backend?.disconnect?.(); backend = null; showConnection(); status('自动连接未成功：' + error.message, true);
      if (error.status === 401) { $('remember-login').checked = false; $('remember-days').disabled = true; }
    } finally { working = false; button.disabled = false; }
  }
  (async () => {
    try {
      const response = await fetch('../__studio_api/status', { signal: AbortSignal.timeout(2500), cache: 'no-store' });
      if (response.ok && response.headers.get('Content-Type')?.includes('application/json')) { const data = await response.json(); if (data.mode === 'local' && data.nonce) { backend = localBackend(data.nonce); await load(); return; } }
    } catch (error) { if (backend) { status(error.message, true); return; } }
    await restoreLogin();
  })();
})();




