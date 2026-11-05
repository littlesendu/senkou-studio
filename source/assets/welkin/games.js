(function () {
  'use strict';
  const frame = document.querySelector('.game-frame');
  const reload = document.querySelector('[data-game-reload]');
  const full = document.querySelector('[data-game-full]');
  const wrap = document.querySelector('.game-frame-wrap');
  const loading = document.querySelector('[data-game-loading]');

  // The WebAssembly build needs roughly 13 MB and only resizes its canvas once Emscripten boots.
  // Poll the same-origin frame and drop the overlay at that point, so the wait does not look broken.
  function watchBoot(token) {
    if (!frame || !wrap) return;
    const started = Date.now();
    const tick = function () {
      if (token !== bootToken) return;
      if (Date.now() - started > 90000) { wrap.classList.add('is-ready'); return; }
      try {
        const canvas = frame.contentDocument && frame.contentDocument.querySelector('canvas');
        if (canvas && canvas.width > 320) { wrap.classList.add('is-ready'); return; }
      } catch (error) { /* not reachable yet */ }
      window.setTimeout(tick, 400);
    };
    tick();
  }
  let bootToken = 0;

  if (frame) {
    frame.addEventListener('load', function () { bootToken++; watchBoot(bootToken); });
    if (frame.contentDocument && frame.contentDocument.readyState === 'complete') { bootToken++; watchBoot(bootToken); }
  }

  if (loading) {
    loading.addEventListener('transitionend', function () {
      if (wrap && wrap.classList.contains('is-ready')) loading.setAttribute('hidden', '');
    });
  }

  if (reload && frame) {
    reload.addEventListener('click', function () {
      // Reload the game without adding history entries; a blank hop forces a fresh WebAssembly boot.
      const src = frame.getAttribute('src') || frame.src;
      if (wrap) wrap.classList.remove('is-ready');
      if (loading) loading.removeAttribute('hidden');
      frame.src = 'about:blank';
      window.setTimeout(function () { frame.src = src; }, 40);
    });
  }

  if (full && frame) {
    const sync = function () {
      const on = Boolean(document.fullscreenElement);
      full.textContent = on ? '退出全屏' : '全屏';
      full.setAttribute('aria-pressed', String(on));
    };
    full.addEventListener('click', async function () {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await (frame.requestFullscreen ? frame.requestFullscreen() : document.documentElement.requestFullscreen());
      } catch (error) {
        try { await document.documentElement.requestFullscreen(); } catch (ignored) { /* fullscreen blocked */ }
      }
    });
    document.addEventListener('fullscreenchange', sync);
    sync();
  }

  // The game grabs the pointer on click; keep the help panel from covering the canvas once dismissed.
  const help = document.querySelector('.game-help');
  if (help && frame) frame.addEventListener('load', function () { help.open = false; }, { once: true });
})();
