(function () {
  'use strict';
  const frame = document.querySelector('.game-frame');
  const reload = document.querySelector('[data-game-reload]');
  const full = document.querySelector('[data-game-full]');
  const mute = document.querySelector('[data-game-mute]');
  const wrap = document.querySelector('.game-frame-wrap');
  const nativeDayz = frame && /\/minidayz\/play-239b\//.test(frame.getAttribute('src'));
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
            // Asking an uninitialised canvas for 2D permanently prevents WebGL.
            const runtime = nativeDayz && frame.contentWindow.cr_getC2Runtime?.();
            if (nativeDayz && !(runtime && (runtime.T || runtime.$a))) {
              window.setTimeout(tick, 150);
              return;
            }
            const context = nativeDayz ? runtime.$a : canvas.getContext('2d');
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
  // Pre-warming during the first load was measured and did not help: the edge answers the requests
  // either way, and warming only added traffic. Cache headers do the heavy lifting for repeat
  // visits. What still hurts is exploring: the game streams the remaining assets on demand, so a
  // quiet low-concurrency warm-up after the menu appears keeps roaming smooth.
  function reportHeavyAssets() {
    const progress = document.querySelector('[data-game-progress]');
    if (!progress || progress.dataset.filled === '1') return;
    progress.dataset.filled = '1';
    progress.textContent = '首次进入需要下载约 60 MB（3200 多个文件），可能要等 1-2 分钟；之后会从缓存秒开';
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


  // Start the quiet warm-up only once the game is actually interactive.
  const readyObserver = new MutationObserver(function () {
    if (!wrap || !wrap.classList.contains('is-ready')) return;
    readyObserver.disconnect();
    window.setTimeout(function () { warmInBackground(bootToken); }, 4000);
  });
  if (wrap && !nativeDayz) readyObserver.observe(wrap, { attributes: true, attributeFilter: ['class'] });

  if (loading) {
    loading.addEventListener('transitionend', function () {
      if (wrap && wrap.classList.contains('is-ready')) loading.setAttribute('hidden', '');
    });
  }

  if (reload && frame) {
    reload.addEventListener('click', function () {
      // Reload the game without adding history entries; a blank hop forces a fresh boot.
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

  if (mute && frame) {
    let muted = false;
    mute.addEventListener('click', function () {
      muted = !muted;
      try {
        const win = frameWindow();
        if (win && win.__mdzAudio) win.__mdzAudio.mute(muted);
      } catch (error) { /* cross-origin or not ready */ }
      mute.textContent = muted ? '取消静音' : '静音';
      mute.setAttribute('aria-pressed', String(muted));
    });
  }

  // The game grabs the pointer on click; keep the help panel from covering the canvas once dismissed.
  const help = document.querySelector('.game-help');
  if (help && frame) frame.addEventListener('load', function () { help.open = false; }, { once: true });

  // ---- desktop adaptation for touch-only builds ----
  // Mini DAYZ ships as a Construct 2 mobile build: menus, the stick, the fire button and the
  // backpack are all canvas touch targets, so on desktop the mouse must be translated into touch
  // events, and keys (WASD, hotkeys) into synthetic taps at fixed canvas points.
  const KEY_VECTORS = {
    ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0]
  };
  const held = new Set();
  let stick = null;
  let hotkeys = [];
  const touchOnly = wrap && wrap.dataset.touchOnly === 'true';
  try { hotkeys = JSON.parse((wrap && wrap.dataset.hotkeys) || '[]'); } catch (error) { hotkeys = []; }

  function frameDocument() {
    try { return frame && frame.contentDocument; } catch (error) { return null; }
  }
  function frameWindow() {
    try { return frame && frame.contentWindow; } catch (error) { return null; }
  }
  function canvasOf(doc) { return doc ? doc.querySelector('canvas') : null; }
  function pointOf(win, canvas, x, y, id) {
    return new win.Touch({ identifier: id, target: canvas, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y, radiusX: 2, radiusY: 2, force: 1 });
  }
  function fireTouch(doc, pointerId, x, y, type) {
    const win = doc && doc.defaultView, canvas = canvasOf(doc);
    if (!win || !canvas || typeof win.TouchEvent !== 'function') return;
    const point = pointOf(win, canvas, x, y, pointerId);
    const list = type === 'touchend' ? [] : [point];
    canvas.dispatchEvent(new win.TouchEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      touches: list, targetTouches: list, changedTouches: [point]
    }));
  }

  // Mouse -> touch, so the whole mobile UI (menus, stick, fire, backpack) works with a mouse.
  function installMouseBridge(doc) {
    const canvas = canvasOf(doc);
    if (!canvas || canvas.dataset.touchBridge === '1') return;
    canvas.dataset.touchBridge = '1';
    let active = false;
    let lastTouch = 0;
    // Touch screens also emit "compatibility" mouse events after a tap; ignore those so the bridge
    // never double-fires. Real mice never set lastTouch.
    canvas.addEventListener('touchstart', function () { lastTouch = Date.now(); }, true);
    canvas.addEventListener('mousedown', function (event) {
      if (event.button !== 0 || event.shiftKey) return;
      if (Date.now() - lastTouch < 800) return;
      active = true;
      fireTouch(doc, 1, event.clientX, event.clientY, 'touchstart');
      event.preventDefault();
    }, true);
    canvas.addEventListener('mousemove', function (event) {
      if (!active) return;
      fireTouch(doc, 1, event.clientX, event.clientY, 'touchmove');
    }, true);
    window.addEventListener('mouseup', function (event) {
      if (!active) return;
      active = false;
      fireTouch(doc, 1, event.clientX, event.clientY, 'touchend');
    }, true);
  }

  function stickPoint() {
    const doc = frameDocument(), canvas = canvasOf(doc);
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return null;
    let dx = 0, dy = 0;
    held.forEach(function (code) { const v = KEY_VECTORS[code]; dx += v[0]; dy += v[1]; });
    if (!dx && !dy) return null;
    const length = Math.hypot(dx, dy) || 1;
    const anchorX = rect.left + rect.width * 0.16;
    const anchorY = rect.top + rect.height * 0.78;
    return {
      doc: doc,
      anchor: { x: anchorX, y: anchorY },
      target: { x: anchorX + (dx / length) * 46, y: anchorY + (dy / length) * 46 }
    };
  }

  function updateStick() {
    const point = stickPoint();
    if (!point) { stopStick(); return; }
    if (!stick) {
      stick = point.anchor;
      fireTouch(point.doc, 7, stick.x, stick.y, 'touchstart');
    }
    fireTouch(point.doc, 7, point.target.x, point.target.y, 'touchmove');
  }
  function stopStick() {
    if (!stick) return;
    const doc = frameDocument();
    if (doc) fireTouch(doc, 7, stick.x, stick.y, 'touchend');
    stick = null;
  }

  function tapHotkey(entry) {
    const doc = frameDocument(), canvas = canvasOf(doc);
    if (!canvas || !entry) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const x = rect.left + rect.width * Number(entry.x);
    const y = rect.top + rect.height * Number(entry.y);
    fireTouch(doc, 9, x, y, 'touchstart');
    window.setTimeout(function () { fireTouch(doc, 9, x, y, 'touchend'); }, 70);
  }

  let desktopInstalled = false;
  function installDesktopLayer() {
    if (desktopInstalled) return;
    const doc = frameDocument();
    if (doc) desktopInstalled = true;
    if (!doc) return;
    stick = null;
    held.clear();

    const style = doc.createElement('style');
    style.textContent = 'html,body{cursor:default;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none;overscroll-behavior:none}canvas{touch-action:none}';
    doc.head.appendChild(style);
    doc.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    doc.addEventListener('dragstart', function (event) { event.preventDefault(); });

    if (touchOnly) installMouseBridge(doc);

    // Shift+click reports a normalised point, handy for filling in hotkey coordinates.
    const canvas = canvasOf(doc);
    if (canvas) {
      canvas.addEventListener('click', function (event) {
        if (!event.shiftKey) return;
        const rect = canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width).toFixed(3);
        const y = ((event.clientY - rect.top) / rect.height).toFixed(3);
        console.log('[games] hotkey point x=' + x + ' y=' + y);
      }, true);
      if (canvas.focus) { canvas.setAttribute('tabindex', '0'); canvas.focus(); }
    }

    doc.addEventListener('keydown', function (event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      for (let i = 0; i < hotkeys.length; i++) {
        if (hotkeys[i] && hotkeys[i].key === event.code) {
          event.preventDefault();
          if (held.has(event.code)) return;
          held.add(event.code);
          tapHotkey(hotkeys[i]);
          return;
        }
      }
      if (!KEY_VECTORS[event.code]) return;
      event.preventDefault();
      if (held.has(event.code)) return;
      held.add(event.code);
      updateStick();
    });
    doc.addEventListener('keyup', function (event) {
      if (!KEY_VECTORS[event.code] && !hotkeys.some(item => item && item.key === event.code)) return;
      held.delete(event.code);
      if (KEY_VECTORS[event.code]) updateStick();
    });
    doc.defaultView.addEventListener('blur', function () { held.clear(); stopStick(); });
  }

  // Registered last: the listeners touch `stick`/`held`, which must already be initialised.
  // The frame may have finished loading before this deferred script ran, so run once right away
  // and let the load listener handle later reloads.
  if (frame) {
    const boot = function () {
      bootToken++;
      watchBoot(bootToken);
      reportHeavyAssets();
      desktopInstalled = false;
      if (nativeDayz) {
        const canvas = canvasOf(frameDocument());
        if (canvas) { canvas.tabIndex = 0; canvas.focus({ preventScroll: true }); }
      } else installDesktopLayer();
    };
    frame.addEventListener('load', boot);
    boot();
  }

  const rotate = document.querySelector('[data-game-rotate]');
  const rotateClose = document.querySelector('[data-game-rotate-close]');
  if (rotate && rotateClose) {
    rotateClose.addEventListener('click', function () { rotate.hidden = true; });
  }

  window.addEventListener('blur', function () { held.clear(); stopStick(); });
})();
