/* Selection-aware contextual task bar. Uses native document coordinates and actions. */
(function () {
  'use strict';
  const ui = window.OnlinePS;
  ui.startContextbar = function (app, native) {
    const { el, button, icon } = ui.ai;
    const bar = el('div', 'context-taskbar'); bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', '画布快捷任务栏'); bar.hidden = true;
    const handle = button('', null, 'context-drag'); handle.innerHTML = icon('drag'); handle.title = '拖动快捷任务栏'; handle.setAttribute('aria-label', '拖动快捷任务栏，方向键微调，Home 复位');
    const content = el('div', 'context-actions'), more = button('', () => { menu.hidden = !menu.hidden; more.setAttribute('aria-expanded', String(!menu.hidden)); }, 'context-more');
    more.innerHTML = icon('more'); more.title = '更多快捷操作'; more.setAttribute('aria-label', '更多快捷操作'); more.setAttribute('aria-expanded', 'false');
    const menu = el('div', 'context-options'); menu.hidden = true; menu.setAttribute('aria-label', '快捷栏选项');
    const selectionOptions = el('div');
    function script(code) { native.script(app, code); update(true); }
    selectionOptions.append(button('扩展选区 5 像素', () => script('app.activeDocument.selection.expand(5)')), button('收缩选区 5 像素', () => script('app.activeDocument.selection.contract(5)')), button('羽化选区 5 像素', () => script('app.activeDocument.selection.feather(5)')));
    menu.append(selectionOptions, button('AI 设置', () => ui.ai.open('settings')), button('重置工具栏位置', () => { pinned = null; update(true); }), button('隐藏快捷栏', () => { dismissed = app.xK(); bar.hidden = true; }));
    bar.append(handle, content, more, menu); document.body.append(bar);
    const file = el('input'); file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp'; file.hidden = true; file.setAttribute('aria-label', '添加图片为图层'); document.body.append(file);
    file.onchange = async () => {
      const item = file.files[0], doc = app.xK(); file.value = ''; if (!item || !doc) return;
      try {
        const bitmap = await createImageBitmap(item); if (bitmap.width * bitmap.height > 32000000) { bitmap.close(); throw Error('图片过大，请先缩小后添加。'); }
        const c = document.createElement('canvas'); c.width = doc.r; c.height = doc.B; const ctx = c.getContext('2d'), scale = Math.min(1, doc.r / bitmap.width, doc.B / bitmap.height);
        ctx.drawImage(bitmap, (doc.r - bitmap.width * scale) / 2, (doc.B - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale); bitmap.close();
        if (app.xK() !== doc) throw Error('画布已切换，请返回原画布后重新添加。');
        native.paste(app, new Uint8Array(ctx.getImageData(0, 0, doc.r, doc.B).data.buffer), doc.r, doc.B, item.name);
      } catch (e) { window.alert('添加图片失败：' + e.message); }
    };
    function action(label, symbol, fn) { const b = button('', fn); b.innerHTML = icon(symbol) + '<span>' + label + '</span>'; b.title = label; b.setAttribute('aria-label', label); return b; }
    let lastDoc, lastMask, lastSelected, pinned = null, dismissed, signature = '', dragging;
    function bound(x, y) {
      const bounds = app.XS.u4.getBoundingClientRect(), w = bar.offsetWidth, h = bar.offsetHeight;
      return { x: Math.max(Math.max(8, bounds.left), Math.min(x, Math.min(innerWidth - 8, bounds.right) - w)), y: Math.max(Math.max(90, bounds.top + 8), Math.min(y, Math.min(innerHeight - 30, bounds.bottom - 8) - h)) };
    }
    function position(x, y) { const p = bound(x, y); bar.style.left = p.x + 'px'; bar.style.top = p.y + 'px'; }
    function update(force) {
      const doc = app.xK(), selected = !!doc?.h;
      if (!doc || doc === dismissed) { bar.hidden = true; lastDoc = doc; return; }
      if (doc !== lastDoc) { pinned = null; dismissed = null; }
      if (force || doc !== lastDoc || selected !== lastSelected) {
        content.replaceChildren(); menu.hidden = true; more.setAttribute('aria-expanded', 'false'); selectionOptions.hidden = !selected;
        content.append(action('AI 对话', 'spark', () => ui.ai.open('assistant')));
        if (selected) content.append(action('生成式填充', 'spark', () => ui.ai.open('tools', 'fill')), action('移除', 'remove', () => ui.ai.open('tools', 'remove')), action('反选', 'invert', () => script('app.activeDocument.selection.invert()')), action('取消选择', 'select', () => script('app.activeDocument.selection.deselect()')));
        else content.append(action('生成图像', 'spark', () => ui.ai.open('tools', 'generate')), action('从设备添加', 'folder', () => file.click()), action('AI 图像编辑', 'select', () => ui.ai.open('tools', 'edit')));
      }
      bar.hidden = false; bar.dataset.selection = String(selected);
      const view = app.XS.tB[app.as5], rect = view?.SP.getBoundingClientRect(); if (!rect || rect.width === 0) { bar.hidden = true; return; }
      const s = doc.h?.S || { x: 0, y: 0, r: doc.r, B: doc.B }, points = [doc.k.dD(s.x,s.y),doc.k.dD(s.x+s.r,s.y),doc.k.dD(s.x,s.y+s.B),doc.k.dD(s.x+s.r,s.y+s.B)], dpi = native.dpi();
      const xs = points.map(p => p.x / dpi + rect.left), ys = points.map(p => p.y / dpi + rect.top);
      const next = [doc.r, doc.B, ...xs.map(Math.round), ...ys.map(Math.round), innerWidth, innerHeight].join(',');
      if (force || next !== signature || doc !== lastDoc || doc.h !== lastMask) {
        const x = (Math.min(...xs) + Math.max(...xs) - bar.offsetWidth) / 2;
        let y = Math.max(...ys) + 14; if (y + bar.offsetHeight > rect.bottom - 12) y = Math.min(...ys) - bar.offsetHeight - 14;
        position(pinned?.x ?? x, pinned?.y ?? y); signature = next;
      }
      lastDoc = doc; lastMask = doc.h; lastSelected = selected;
    }
    handle.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); const r = bar.getBoundingClientRect(); dragging = { x: e.clientX - r.left, y: e.clientY - r.top }; handle.setPointerCapture(e.pointerId); });
    handle.addEventListener('pointermove', e => { if (!dragging) return; pinned = bound(e.clientX - dragging.x, e.clientY - dragging.y); position(pinned.x, pinned.y); });
    handle.addEventListener('pointerup', () => { dragging = null; }); handle.addEventListener('pointercancel', () => { dragging = null; });
    handle.addEventListener('keydown', e => { if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(e.key)) return; e.preventDefault(); if (e.key === 'Home') { pinned = null; update(true); return; } const r = bar.getBoundingClientRect(); pinned = bound(r.left + (e.key === 'ArrowLeft' ? -10 : e.key === 'ArrowRight' ? 10 : 0), r.top + (e.key === 'ArrowUp' ? -10 : e.key === 'ArrowDown' ? 10 : 0)); position(pinned.x, pinned.y); });
    document.addEventListener('pointerdown', e => { if (!bar.contains(e.target)) { menu.hidden = true; more.setAttribute('aria-expanded','false'); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.hidden = true; more.setAttribute('aria-expanded','false'); } });
    // Restore lives in the persistent AI entry, so a hidden bar is always recoverable.
    ui.ai.restoreTaskbar = () => { dismissed = null; pinned = null; update(true); };
    const restore = button('显示画布快捷栏', ui.ai.restoreTaskbar, 'ai-restore-taskbar'); restore.title = '恢复或复位画布快捷任务栏';
    document.querySelector('.workspace-actions').querySelector('.workspace-ai').addEventListener('dblclick', ui.ai.restoreTaskbar);
    const originalOpen = ui.ai.open; ui.ai.open = function () { originalOpen.apply(this, arguments); const container = document.querySelector('.ai-content'); if (container) container.append(restore); };
    window.addEventListener('resize', () => update(true));
    setInterval(() => { if (!document.hidden && !dragging) update(); }, 160); update(true);
  };
}());
