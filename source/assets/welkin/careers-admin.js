(() => {
  'use strict';
  window.SenkouCareersAdmin = {
    create(root, source, onDirty, onError) {
      const data = structuredClone(window.SenkouCareersData.validate(source));
      const element = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
      const id = prefix => prefix + '-' + (window.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
      function button(label, handler, className) { const node = element('button', label, className); node.type = 'button'; node.addEventListener('click', handler); return node; }
      function field(parent, label, object, key, { type = 'text', required = false, max = 300, options, change } = {}) {
        const wrap = element('label', label), input = element(options ? 'select' : type === 'textarea' ? 'textarea' : 'input');
        if (options) for (const option of options) { const node = element('option', option.label); node.value = option.id; input.append(node); }
        else { if (type !== 'textarea') input.type = type; input.maxLength = max; }
        input.value = object[key]; input.required = required; input.dataset.careerField = key;
        input.addEventListener(options ? 'change' : 'input', () => { object[key] = input.value; onDirty(); if (change) change(); });
        wrap.append(input); parent.append(wrap); return input;
      }
      function group(title, note) {
        const section = element('section', '', 'settings-group careers-admin-group'), heading = element('h2', title);
        section.append(heading); if (note) section.append(element('p', note, 'field-help'));
        root.append(section); return section;
      }
      function taxonomy(key, title, reference, note) {
        const section = group(title, note), list = element('div', '', 'careers-admin-taxonomy'); section.append(list);
        for (const item of data[key]) {
          const row = element('div', '', 'careers-admin-taxonomy-row');
          field(row, '名称', item, 'label', { required: true, max: 30, change: () => {
            for (const option of root.querySelectorAll('select[data-career-field="' + reference + '"] option')) if (option.value === item.id) option.textContent = item.label;
          } });
          row.append(button('删除', () => {
            if (data.jobs.some(job => job[reference] === item.id)) { onError('“' + item.label + '”仍有关联职位（包括草稿），请先为这些职位更换' + (key === 'types' ? '类型' : '方向') + '，或删除职位。'); return; }
            data[key] = data[key].filter(value => value.id !== item.id); onDirty(); render();
          }, 'careers-admin-delete'));
          list.append(row);
        }
        if (!data[key].length) list.append(element('p', '还没有项目，点击下方按钮添加。', 'field-help'));
        section.append(button('＋ 添加' + (key === 'types' ? '招聘类型' : '招聘方向'), () => {
          if (data[key].length >= (key === 'types' ? 40 : 20)) { onError('已达到可添加的数量上限。'); return; }
          data[key].push({ id: id(key), label: key === 'types' ? '新的招聘类型' : '新的招聘方向' }); onDirty(); render();
          root.querySelectorAll('.careers-admin-taxonomy')[key === 'directions' ? 0 : 1].querySelector('div:last-of-type input')?.focus();
        }));
      }
      function render() {
        const openJobs = new Set([...root.querySelectorAll('[data-job-id][open]')].map(node => node.dataset.jobId));
        root.replaceChildren();
        const intro = group('招聘页与申请方式'); const introGrid = element('div', '', 'form-grid'); intro.append(introGrid);
        field(introGrid, '招聘页标题', data, 'headline', { required: true, max: 80 });
        field(introGrid, '筛选提示', data, 'notice', { max: 200 });
        field(introGrid, '招聘页介绍', data, 'intro', { type: 'textarea', max: 300 });
        field(introGrid, '申请说明 · 各职位共用', data.application, 'instructions', { type: 'textarea', required: true, max: 2000 });
        field(introGrid, '申请按钮文字', data.application, 'label', { required: true, max: 30 });
        field(introGrid, '申请表链接 · 留空使用网站预约入口', data.application, 'url', { max: 1000 });
        intro.append(element('p', '申请按钮会先弹出须知。用户将阅读区滚动到底并点击“我已阅读并同意”后，才会前往此链接；留空时使用网站预约入口。', 'field-help'));
        const consent = group('申请前必读 · 弹窗内容', '每行显示为一段。保持报名性质、报酬安排和信息用途与实际情况一致；修改后保存并部署生效。');
        field(consent, '应聘须知', data.application, 'guidelines', { type: 'textarea', required: true, max: 6000 });
        field(consent, '免责声明', data.application, 'disclaimer', { type: 'textarea', required: true, max: 6000 });
        taxonomy('directions', '招聘方向 · 页面上方', 'directionId', '例如：游戏服务、工作室运营。可添加或删除，名称可直接编辑。');
        taxonomy('types', '招聘类型 · 页面左侧', 'typeId', '例如：护航队友、娱乐陪玩、内容运营、客服接待。');
        const section = group('职位 · ' + data.jobs.length + ' 项', '展开职位编辑。草稿不显示在招聘页；撤下公开职位可改为草稿。');
        for (const job of data.jobs) {
          const details = element('details', '', 'careers-admin-job'); details.dataset.jobId = job.id; details.open = openJobs.has(job.id);
          const summary = element('summary'), title = element('strong', job.title), badge = element('span', job.status === 'published' ? '公开招聘' : '草稿'); summary.append(title, badge); details.append(summary);
          const content = element('div', '', 'careers-admin-job-body'), grid = element('div', '', 'form-grid'); content.append(grid);
          field(grid, '职位名称', job, 'title', { required: true, max: 80, change: () => { title.textContent = job.title || '未命名职位'; } });
          field(grid, '发布状态', job, 'status', { options: [{ id: 'draft', label: '草稿 · 暂不展示' }, { id: 'published', label: '公开招聘' }], change: () => { badge.textContent = job.status === 'published' ? '公开招聘' : '草稿'; } });
          field(grid, '招聘方向', job, 'directionId', { options: data.directions, required: true });
          field(grid, '招聘类型', job, 'typeId', { options: data.types, required: true });
          for (const [label, key, max, required] of [['工作地点', 'location', 50, true], ['合作方式', 'arrangement', 30, true], ['经验要求', 'experience', 50, true], ['招募人数', 'headcount', 30, false], ['报酬说明', 'compensation', 80, false]]) field(grid, label, job, key, { max, required });
          field(grid, '职位简介', job, 'summary', { type: 'textarea', max: 300 });
          field(grid, '工作内容 · 可换行', job, 'responsibilities', { type: 'textarea', max: 3000 });
          field(grid, '任职要求 · 可换行', job, 'requirements', { type: 'textarea', max: 3000 });
          content.append(button('删除这个职位', () => {
            if (!confirm('删除“' + job.title + '”？保存修改后生效。')) return;
            data.jobs = data.jobs.filter(item => item.id !== job.id); onDirty(); render();
          }, 'careers-admin-delete'));
          details.append(content); section.append(details);
        }
        section.append(button('＋ 添加职位', () => {
          if (!data.directions.length || !data.types.length) { onError('请先添加至少一个招聘方向和招聘类型。'); return; }
          if (data.jobs.length >= 100) { onError('最多保留 100 个职位。'); return; }
          const job = { id: id('job'), title: '新的招募职位', directionId: data.directions[0].id, typeId: data.types[0].id, status: 'draft', location: '线上远程', arrangement: '灵活合作', experience: '经验不限', headcount: '若干', compensation: '面议', summary: '', responsibilities: '', requirements: '' };
          data.jobs.push(job); onDirty(); render();
          const node = [...root.querySelectorAll('[data-job-id]')].find(node => node.dataset.jobId === job.id); node.open = true; node.querySelector('input').focus();
        }));
      }
      render();
      return { read: () => window.SenkouCareersData.validate(data) };
    }
  };
})();
