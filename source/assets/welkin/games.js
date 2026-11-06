(function () {
  'use strict';
  const frame = document.querySelector('.game-frame');
  const reload = document.querySelector('[data-game-reload]');
  const full = document.querySelector('[data-game-full]');
  const wrap = document.querySelector('.game-frame-wrap');
  const loading = document.querySelector('[data-game-loading]');

  // The WebAssembly build needs roughly 13 MB and only resizes its canvas once Emscripten boots.
  // Construct 2 resizes its canvas immediately but keeps it blank until the assets arrive,
  // so a sized canvas alone is not enough: a 2D canvas must also show some contrast.
  function watchBoot(token) {
    if (!frame || !wrap) return;
    const started = Date.now();
    const tick = function () {
      if (token !== bootToken) return;
      if (Date.now() - started > 90000) { wrap.classList.add('is-ready'); return; }
      try {
        const canvas = frame.contentDocument && frame.contentDocument.querySelector('canvas');
        if (canvas && canvas.width > 320 && Date.now() - started > 1200) {
          let painted = true;
          try {
            const context = canvas.getContext('2d');
            if (context) {
              // Sample the middle of the canvas: loading screens there carry the logo and progress
              // bar, while the corners stay a flat gradient that would read as "not painted yet".
              const width = Math.min(96, canvas.width), height = Math.min(96, canvas.height);
              const left = Math.max(0, Math.floor((canvas.width - width) / 2));
              const top = Math.max(0, Math.floor((canvas.height - height) / 2));
              const pixels = context.getImageData(left, top, width, height).data;
              let min = 999, max = -1;
              for (let index = 0; index < pixels.length; index += 4) {
                const value = pixels[index] + pixels[index + 1] + pixels[index + 2];
                if (value < min) min = value;
                if (value > max) max = value;
              }
              painted = max - min > 8;
            }
          } catch (error) { painted = true; /* tainted or WebGL canvas: trust the size */ }
          if (painted) { wrap.classList.add('is-ready'); return; }
        }
      } catch (error) { /* not reachable yet */ }
      window.setTimeout(tick, 400);
    };
    tick();
  }
  let bootToken = 0;

  // Construct 2 pulls its menu assets one request at a time and pays a round trip for each.
  // Pre-warming during the first load was measured and did not help: the edge answers ~600 requests
  // either way, and warming only added traffic. Cache headers do the heavy lifting for repeat
  // visits. What still hurts is exploring: the game streams the remaining assets on demand, so a
  // quiet low-concurrency warm-up after the menu appears keeps roaming smooth.
  function reportHeavyAssets() {
    const progress = document.querySelector('[data-game-progress]');
    if (!progress) return;
    progress.textContent = '首次进入需要下载约 37 MB（600 多个文件），可能要等 1-2 分钟；之后会从缓存秒开';
  }

  async function warmInBackground(token) {
    const src = frame && (frame.getAttribute('src') || frame.src);
    if (!src) return;
    const base = new URL(src, window.location.href);
    let manifest;
    try { manifest = await (await fetch(new URL('offline.js', base), { cache: 'no-cache' })).json(); } catch (error) { return; }
    const files = (manifest.fileList || []).filter(name => name && !/\.html?$/i.test(name));
    if (!files.length) return;
    const queue = files.slice();
    const worker = async () => {
      while (queue.length) {
        if (token !== bootToken) return;
        const name = queue.pop();
        try { await fetch(new URL(name, base)); } catch (error) { /* skip */ }
        await new Promise(resolve => window.setTimeout(resolve, 120));
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  }

  if (frame) {
    frame.addEventListener('load', function () { bootToken++; watchBoot(bootToken); reportHeavyAssets(); });
    if (frame.contentDocument && frame.contentDocument.readyState === 'complete') { bootToken++; watchBoot(bootToken); reportHeavyAssets(); }
  }

  // Start the quiet warm-up only once the game is actually interactive.
  const readyObserver = new MutationObserver(function () {
    if (!wrap || !wrap.classList.contains('is-ready')) return;
    readyObserver.disconnect();
    window.setTimeout(function () { warmInBackground(bootToken); }, 4000);
  });
  if (wrap) readyObserver.observe(wrap, { attributes: true, attributeFilter: ['class'] });

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

  // ---- desktop adaptation for touch-only builds ----
  // Mini DAYZ ships as a Construct 2 mobile build: it has no keyboard plugin, so WASD does nothing
  // and the only way to walk is dragging the on-screen stick. Inside the same-origin frame we can
  // bridge arrow/WASD keys into the mouse drag the stick already understands.
  const KEY_VECTORS = {
    ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0]
  };
  const held = new Set();
  let bridge = null;

  function frameDocument() {
    try { return frame && frame.contentDocument; } catch (error) { return null; }
  }
  function sendMouse(type, x, y, buttons) {
    const doc = frameDocument();
    if (!doc) return;
    const target = doc.querySelector('canvas') || doc.body;
    if (!target) return;
    const init = { clientX: x, clientY: y, screenX: x, screenY: y, bubbles: true, cancelable: true, view: doc.defaultView, button: 0, buttons: buttons };
    target.dispatchEvent(new (doc.defaultView.MouseEvent)('mouse' + type, init));
  }
  function stopBridge() {
    if (!bridge) return;
    sendMouse('up', bridge.x, bridge.y, 0);
    bridge = null;
  }
  function updateBridge() {
    if (!held.size) { stopBridge(); return; }
    const doc = frameDocument();
    const canvas = doc && doc.querySelector('canvas');
    if (!canvas) return;
    let dx = 0, dy = 0;
    held.forEach(function (code) { const v = KEY_VECTORS[code]; dx += v[0]; dy += v[1]; });
    const length = Math.hypot(dx, dy) || 1;
    const rect = canvas.getBoundingClientRect();
    // The stick is spawned where the finger lands; anchor it low-left and pull 46 px towards the key.
    const anchorX = rect.left + rect.width * 0.16;
    const anchorY = rect.top + rect.height * 0.78;
    const x = anchorX + (dx / length) * 46;
    const y = anchorY + (dy / length) * 46;
    if (!bridge) {
      bridge = { x: anchorX, y: anchorY };
      sendMouse('down', anchorX, anchorY, 1);
    }
    bridge.x = x; bridge.y = y;
    sendMouse('move', x, y, 1);
  }

  function isGameKey(event) {
    return Boolean(KEY_VECTORS[event.code]) && !event.ctrlKey && !event.metaKey && !event.altKey;
  }

  // Key events go to whichever document owns the focus, and clicking the game moves focus into the
  // frame. So the listeners live inside the frame (same origin), not on the wrapper page.
  if (frame) {
    frame.addEventListener('load', function () {
      const doc = frameDocument();
      if (!doc) return;
      held.clear();
      bridge = null;

      const style = doc.createElement('style');
      style.textContent = 'html,body{cursor:default;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none;overscroll-behavior:none}canvas{touch-action:none}';
      doc.head.appendChild(style);
      doc.addEventListener('contextmenu', function (event) { event.preventDefault(); });
      doc.addEventListener('dragstart', function (event) { event.preventDefault(); });

      doc.addEventListener('keydown', function (event) {
        if (!isGameKey(event)) return;
        event.preventDefault();
        if (held.has(event.code)) return;
        held.add(event.code);
        updateBridge();
      });
      doc.addEventListener('keyup', function (event) {
        if (!KEY_VECTORS[event.code]) return;
        held.delete(event.code);
        updateBridge();
      });
      doc.defaultView.addEventListener('blur', function () { held.clear(); stopBridge(); });

      const canvas = doc.querySelector('canvas');
      if (canvas && canvas.focus) { canvas.setAttribute('tabindex', '0'); canvas.focus(); }
    });

    window.addEventListener('blur', function () { held.clear(); stopBridge(); });
  }
})();
