/* Native selects stay in the form; this layer supplies the studio menu and keyboard interaction. */
(() => {
  'use strict';
  let serial = 0, active = null;
  const instances = new WeakMap();
  function enhance(select) {
    if (instances.has(select) || select.multiple || select.size > 1) return;
    const wrapper = document.createElement('span');
    wrapper.className = 'studio-select';
    select.before(wrapper); wrapper.append(select);
    const originalTabIndex = select.tabIndex;
    select.dataset.studioSelect = 'true'; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    const trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'studio-select-trigger';
    trigger.setAttribute('role', 'combobox'); trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<span></span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
    const caption = trigger.firstElementChild;
    wrapper.append(trigger);
    const menu = document.createElement('div');
    menu.id = 'studio-options-' + (++serial); menu.className = 'studio-select-menu'; menu.hidden = true; menu.inert = true;
    menu.setAttribute('role', 'listbox'); trigger.setAttribute('aria-controls', menu.id);
    const label = select.getAttribute('aria-label') || [...(select.labels || [])].map(el => {
      const copy = el.cloneNode(true);
      copy.querySelectorAll('select,.studio-select,svg').forEach(child => child.remove());
      return copy.textContent.trim();
    }).join(' ') || '请选择';
    trigger.setAttribute('aria-label', label);
    menu.setAttribute('aria-label', label);
    if (select.hasAttribute('aria-describedby')) trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
    // Popovers enter the browser's top layer, including when the form is in a dialog.
    const topLayer = typeof menu.showPopover === 'function';
    if (topLayer) menu.setAttribute('popover', 'manual');
    (select.closest('dialog') || document.body).append(menu);
    let highlighted = -1, closeTimer = 0, searchTimer = 0, search = '';
    let items = [];
    const enabled = () => items.filter(item => !item.option.disabled && !item.option.closest('optgroup[disabled]'));
    function refresh() {
      if (!select.isConnected) { close(); menu.remove(); return; }
      caption.textContent = select.options[select.selectedIndex]?.label || '请选择';
      trigger.disabled = select.disabled;
      trigger.tabIndex = originalTabIndex;
      trigger.setAttribute('aria-required', String(select.required));
      menu.replaceChildren();
      items = [...select.options].map((option, index) => {
        const item = document.createElement('div');
        item.id = menu.id + '-' + index; item.setAttribute('role', 'option');
        item.textContent = option.textContent; item.dataset.index = index;
        item.setAttribute('aria-selected', String(option.selected));
        item.setAttribute('aria-disabled', String(option.disabled || Boolean(option.closest('optgroup[disabled]'))));
        if (option.hidden) item.hidden = true;
        menu.append(item);
        return { option, item, index };
      });
      if (trigger.disabled) close();
      if (active === instance) highlight(select.selectedIndex);
    }
    function highlight(index) {
      highlighted = index;
      items.forEach(entry => entry.item.classList.toggle('is-highlighted', entry.index === index));
      const item = items[index]?.item;
      if (item) { trigger.setAttribute('aria-activedescendant', item.id); item.scrollIntoView({ block: 'nearest' }); }
    }
    function position() {
      if (!select.isConnected) { close(); return; }
      const rect = trigger.getBoundingClientRect(), gap = 7, edge = 10;
      const width = Math.min(Math.max(rect.width, 175), innerWidth - edge * 2);
      const below = innerHeight - rect.bottom - gap - edge;
      const above = rect.top - gap - edge;
      const height = Math.min(300, Math.max(below, above), innerHeight * .45);
      menu.style.width = width + 'px'; menu.style.maxHeight = Math.max(44, height) + 'px';
      menu.style.left = Math.max(edge, Math.min(rect.left, innerWidth - width - edge)) + 'px';
      const actualHeight = Math.min(menu.scrollHeight, height);
      menu.style.top = (below >= actualHeight || below >= above ? rect.bottom + gap : Math.max(edge, rect.top - gap - actualHeight)) + 'px';
    }
    function open() {
      if (select.disabled) return;
      if (active && active !== instance) active.close();
      clearTimeout(closeTimer); active = instance;
      refresh(); menu.hidden = false; menu.inert = false;
      if (topLayer && !menu.matches(':popover-open')) menu.showPopover();
      position(); trigger.setAttribute('aria-expanded', 'true');
      menu.getBoundingClientRect(); menu.classList.add('is-open');
      highlight(select.selectedIndex >= 0 ? select.selectedIndex : enabled()[0]?.index ?? -1);
    }
    function close() {
      trigger.setAttribute('aria-expanded', 'false'); trigger.removeAttribute('aria-activedescendant');
      menu.classList.remove('is-open'); menu.inert = true;
      if (active === instance) active = null;
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => { if (topLayer && menu.matches(':popover-open')) menu.hidePopover(); menu.hidden = true; }, 160);
    }
    function commit(index) {
      const entry = items[index];
      if (!entry || entry.item.hidden || entry.item.getAttribute('aria-disabled') === 'true') return;
      select.selectedIndex = index;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      refresh(); close(); trigger.focus({ preventScroll: true });
    }
    const instance = { close, refresh, position, trigger, select, menu };
    instances.set(select, instance);
    trigger.addEventListener('click', () => active === instance ? close() : open());
    trigger.addEventListener('keydown', event => {
      const key = event.key;
      if (['ArrowDown','ArrowUp','Home','End'].includes(key)) {
        event.preventDefault(); const wasOpen = active === instance;
        if (!wasOpen) open();
        const choices = enabled().filter(entry => !entry.option.hidden);
        const at = choices.findIndex(entry => entry.index === highlighted);
        let next = key === 'Home' ? 0 : key === 'End' ? choices.length - 1 : at + (key === 'ArrowDown' ? 1 : -1);
        if (!wasOpen && key === 'ArrowDown') next = Math.max(at, 0);
        highlight(choices[Math.max(0, Math.min(choices.length - 1, next))]?.index ?? -1);
      } else if (key === 'Enter' || key === ' ') {
        event.preventDefault(); active === instance ? commit(highlighted) : open();
      } else if (key === 'Escape') { if (active === instance) { event.preventDefault(); event.stopPropagation(); close(); } }
      else if (key === 'Tab') close();
      else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); clearTimeout(searchTimer); search += key.toLocaleLowerCase();
        if (active !== instance) open();
        const match = enabled().find(entry => entry.option.textContent.trim().toLocaleLowerCase().startsWith(search));
        if (match) highlight(match.index);
        searchTimer = setTimeout(() => { search = ''; }, 650);
      }
    });
    menu.addEventListener('pointerdown', event => event.preventDefault());
    menu.addEventListener('click', event => { const item = event.target.closest('[role=option]'); if (item) commit(Number(item.dataset.index)); });
    menu.addEventListener('pointermove', event => { const item = event.target.closest('[role=option]'); if (item && item.getAttribute('aria-disabled') !== 'true') highlight(Number(item.dataset.index)); });
    select.addEventListener('change', refresh);
    select.addEventListener('focus', () => trigger.focus());
    select.addEventListener('invalid', event => { event.preventDefault(); trigger.focus(); });
    select.form?.addEventListener('reset', () => queueMicrotask(refresh));
    refresh();
  }
  function discover(root) {
    if (root.nodeType !== 1) return;
    if (root.matches('select')) enhance(root);
    root.querySelectorAll('select').forEach(enhance);
  }
  discover(document.body);
  new MutationObserver(records => {
    if (!document?.body) return;
    const refresh = new Set();
    for (const record of records) {
      const select = record.target.closest?.('select');
      if (select && instances.has(select)) refresh.add(instances.get(select));
      for (const node of record.addedNodes) discover(node);
    }
    refresh.forEach(instance => instance.refresh());
    if (active && !active.select.isConnected) { active.close(); }
    // Remove portals left by an editor rerender without retaining old forms.
    document.querySelectorAll('.studio-select-menu').forEach(menu => {
      if (!document.querySelector('[aria-controls="' + menu.id + '"]')) menu.remove();
    });
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled','selected','label','value','required'] });
  document.addEventListener('pointerdown', event => { if (active && !active.trigger.contains(event.target) && !active.menu.contains(event.target)) active.close(); });
  document.addEventListener('focusin', event => { if (active && event.target !== active.trigger) active.close(); });
  document.addEventListener('scroll', event => { if (active && !active.menu.contains(event.target)) active.close(); }, true);
  window.addEventListener('resize', () => active?.close());
})();
