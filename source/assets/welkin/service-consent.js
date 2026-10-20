(() => {
  'use strict';
  const dialog = document.getElementById('service-booking-dialog');
  const reading = dialog?.querySelector('.career-dialog-scroll');
  const agree = document.getElementById('service-booking-agree');
  const status = document.getElementById('service-reading-status');
  const progress = dialog?.querySelector('.career-reading-progress span');
  if (!dialog || !reading || !agree || !status || !progress || typeof dialog.showModal !== 'function') return;
  // Keep the entry unavailable if the configured form cannot be opened safely.
  let destination;
  try {
    destination = new URL(dialog.dataset.bookingUrl, window.location.href);
    if (!['https:', 'http:'].includes(destination.protocol) || destination.username || destination.password) return;
  } catch { return; }
  let opener = null, hasRead = false;
  function updateReading() {
    if (!dialog.open) return;
    const remaining = reading.scrollHeight - reading.clientHeight;
    const fraction = remaining > 0 ? Math.min(1, Math.max(0, reading.scrollTop / remaining)) : 1;
    progress.style.width = (fraction * 100) + '%';
    if (!hasRead && (remaining <= 0 || reading.scrollTop >= remaining - 2)) {
      hasRead = true;
      agree.disabled = false;
      status.textContent = '已阅读至末尾，可选择同意并前往提交表。';
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
  document.querySelectorAll('[data-service-booking]').forEach(button => {
    button.addEventListener('click', () => {
      if (dialog.open) return;
      opener = button;
      resetReading();
      dialog.showModal();
      document.documentElement.classList.add('career-modal-open');
      reading.focus({ preventScroll: true });
      reading.scrollTop = 0;
      updateReading();
    });
    button.disabled = false;
  });
  reading.addEventListener('scroll', updateReading, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(updateReading).observe(reading);
  else window.addEventListener('resize', updateReading);
  dialog.querySelectorAll('[data-service-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('career-modal-open');
    resetReading();
    opener?.focus({ preventScroll: true });
  });
  agree.addEventListener('click', () => {
    if (!dialog.open || !hasRead || agree.disabled) return;
    agree.disabled = true;
    window.location.assign(destination.href);
  });
  // Returning from the questionnaire starts a new reading, as with applications.
  window.addEventListener('pageshow', () => { if (dialog.open) dialog.close(); });
})();
