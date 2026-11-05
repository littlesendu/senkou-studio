(function () {
  'use strict';
  const frame = document.querySelector('.game-frame');
  const reload = document.querySelector('[data-game-reload]');
  const full = document.querySelector('[data-game-full]');

  if (reload && frame) {
    reload.addEventListener('click', function () {
      // Reload the game without adding history entries; a blank hop forces a fresh WebAssembly boot.
      const src = frame.getAttribute('src') || frame.src;
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
  if (help) {
    frame && frame.addEventListener('load', function () { help.open = false; }, { once: true });
  }
})();
