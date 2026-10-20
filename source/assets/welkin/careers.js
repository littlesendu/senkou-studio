(() => {
  'use strict';
  const form = document.getElementById('careers-filters');
  if (!form) return;
  const cards = [...document.querySelectorAll('[data-career]')];
  const typeButtons = [...document.querySelectorAll('[data-type-list] button')];
  const directionButtons = [...document.querySelectorAll('[data-direction-list] button')];
  const count = document.getElementById('careers-count');
  let type = '', direction = '';
  const searchText = new Map(cards.map(card => [card, card.textContent.toLocaleLowerCase()]));
  function filter() {
    const fields = new FormData(form), keyword = fields.get('keyword').trim().toLocaleLowerCase();
    let visible = 0;
    for (const card of cards) {
      const match = (!type || card.dataset.type === type) && (!direction || card.dataset.direction === direction)
        && ['location', 'arrangement', 'experience'].every(key => !fields.get(key) || fields.get(key) === card.dataset[key])
        && (!keyword || searchText.get(card).includes(keyword));
      card.hidden = !match; if (match) visible++;
    }
    count.textContent = '共 ' + visible + ' 个在招职位';
    document.getElementById('careers-empty').hidden = visible > 0;
    for (const button of typeButtons) { const active = button.dataset.type === type; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); }
    for (const button of directionButtons) { const active = button.dataset.direction === direction; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); }
  }
  function reset() { form.reset(); type = ''; direction = ''; filter(); }
  typeButtons.forEach(button => button.addEventListener('click', () => { type = button.dataset.type; filter(); }));
  directionButtons.forEach(button => button.addEventListener('click', () => { direction = button.dataset.direction; filter(); }));
  form.addEventListener('submit', event => { event.preventDefault(); filter(); });
  form.addEventListener('input', filter);
  form.addEventListener('change', filter);
  document.getElementById('careers-reset').addEventListener('click', reset);
  document.querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', reset));
  // The destination is reached only through an explicit click after reading this opening.
  const dialog = document.getElementById('career-application-dialog');
  const reading = dialog?.querySelector('.career-dialog-scroll');
  const agree = document.getElementById('career-application-agree');
  const status = document.getElementById('career-reading-status');
  const progress = dialog?.querySelector('.career-reading-progress span');
  let opener = null, hasRead = false;
  if (dialog && reading && agree && typeof dialog.showModal === 'function') {
    function updateReading() {
      if (!dialog.open) return;
      const remaining = reading.scrollHeight - reading.clientHeight;
      const fraction = remaining > 0 ? Math.min(1, Math.max(0, reading.scrollTop / remaining)) : 1;
      progress.style.width = (fraction * 100) + '%';
      if (!hasRead && (remaining <= 0 || reading.scrollTop >= remaining - 2)) {
        hasRead = true;
        agree.disabled = false;
        status.textContent = '已阅读至末尾，可选择同意并前往报名表。';
        dialog.classList.add('has-read');
      }
    }
    function resetReading() {
      hasRead = false;
      agree.disabled = true;
      dialog.classList.remove('has-read');
      status.textContent = '请在上方阅读区滚动到底，读完后即可继续。';
      progress.style.width = '0%';
      reading.scrollTop = 0;
    }
    document.querySelectorAll('[data-apply-title]').forEach(button => {
      button.disabled = false;
      button.addEventListener('click', () => {
        if (dialog.open) return;
        opener = button;
        dialog.querySelector('[data-application-title]').textContent = button.dataset.applyTitle;
        resetReading();
        dialog.showModal();
        document.documentElement.classList.add('career-modal-open');
        reading.focus({ preventScroll: true });
        reading.scrollTop = 0;
        updateReading();
      });
    });
    reading.addEventListener('scroll', updateReading, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(updateReading).observe(reading);
    else window.addEventListener('resize', updateReading);
    dialog.querySelectorAll('[data-application-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('career-modal-open');
      resetReading();
      opener?.focus({ preventScroll: true });
    });
    agree.addEventListener('click', () => {
      if (!dialog.open || !hasRead || agree.disabled) return;
      agree.disabled = true;
      window.location.assign(dialog.dataset.applicationUrl);
    });
    window.addEventListener('pageshow', () => { if (dialog.open) dialog.close(); });
  }
  // Entries replay when returning from either scroll direction; content stays visible without JS.
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      entry.target.classList.toggle('is-in-view', entry.isIntersecting);
    }), { threshold: 0.08 });
    document.querySelectorAll('.career-card, .careers-intro, .careers-sidebar').forEach(element => { element.classList.add('career-reveal'); observer.observe(element); });
  }
})();
