// Keep the header in the page flow; only its glass and lighting change on scroll.
(() => {
  const header = document.querySelector('.is-studio .site-header');
  if (!header) return;
  let frame = 0;
  const update = () => {
    frame = 0;
    header.classList.toggle('is-scrolled', scrollY > 24);
  };
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--studio-header-height', header.offsetHeight + 'px');
  }).observe(header);
  window.addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(update); }, { passive: true });
  window.addEventListener('pageshow', update);
  update();
})();

﻿// Small, local enhancements for the static studio homepage.
(() => {
  'use strict';
  const links = [...document.querySelectorAll('.site-header a[data-section]')];
  if ('IntersectionObserver' in window) {
    const navigation = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      for (const link of links) {
        const active = link.dataset.section === visible.target.id;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    }, { rootMargin: '-10% 0px -45% 0px', threshold: [0, .1, .5] });
    for (const link of links) {
      const section = document.getElementById(link.dataset.section);
      if (section) navigation.observe(section);
    }
  }

  // No loop runs while the page is idle; scroll updates share one animation frame.
  const progress = document.createElement('div');
  progress.className = 'studio-scroll-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.append(progress);
  let progressFrame = 0;
  const updateProgress = () => {
    progressFrame = 0;
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    const value = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0;
    progress.style.transform = `scaleX(${value})`;
  };
  const scheduleProgress = () => {
    if (!progressFrame) progressFrame = window.requestAnimationFrame(updateProgress);
  };
  window.addEventListener('scroll', scheduleProgress, { passive: true });
  window.addEventListener('resize', scheduleProgress, { passive: true });
  window.addEventListener('load', scheduleProgress, { once: true });
  window.addEventListener('pageshow', scheduleProgress);
  updateProgress();

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pending = new Map();
  const started = new WeakSet();
  let reveals, departures;
  let entranceReady = false;
  let revealScroll = scrollY, revealDirection = 1;
  const trackRevealDirection = () => {
    if (scrollY !== revealScroll) revealDirection = scrollY < revealScroll ? -1 : 1;
    revealScroll = scrollY;
  };
  window.addEventListener('scroll', trackRevealDirection, { passive: true });
  function prepareReveal(element) {
    if (reducedMotion.matches || element.contains(document.activeElement)) return;
    const previous = pending.get(element);
    if (previous?.playState === 'paused' && !started.has(previous)) return;
    previous?.cancel();
    const animation = element.animate([
      { opacity: 0, transform: 'translate3d(0, 24px, 0)' },
      { opacity: 1, transform: 'translate3d(0, 0, 0)' }
    ], {
      duration: 760,
      delay: Math.min(300, Math.max(0, Number(element.dataset.revealDelay) || 0)),
      easing: 'cubic-bezier(.2, .7, .2, 1)', fill: 'both'
    });
    animation.pause();
    pending.set(element, animation);
    animation.finished.then(() => {
      if (pending.get(element) !== animation) return;
      pending.delete(element);
      animation.cancel();
    }, () => {});
  }
  function play(element) {
    if (!entranceReady || document.hidden || reducedMotion.matches) return;
    const animation = pending.get(element);
    if (!animation || animation.playState !== 'paused') return;
    if (!started.has(animation)) {
      trackRevealDirection();
      const fromTop = revealDirection < 0;
      animation.effect.setKeyframes([
        { opacity: 0, transform: fromTop ? 'translate3d(0, -24px, 0)' : 'translate3d(0, 24px, 0)' },
        { opacity: 1, transform: 'translate3d(0, 0, 0)' }
      ]);
      started.add(animation);
    }
    animation.play();
  }
  function enableReveals() {
    if (reducedMotion.matches) return;
    if (entranceReady) document.body.classList.add('studio-motion');
    if (!('IntersectionObserver' in window) || typeof Element.prototype.animate !== 'function') return;
    reveals ||= new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting && entry.intersectionRatio >= .08) play(entry.target);
    }, { rootMargin: '-24px 0px -24px 0px', threshold: [0, .08] });
    // Re-arm beyond the viewport, so a small reversal at its edge cannot flicker.
    departures ||= new IntersectionObserver(entries => {
      for (const entry of entries) if (!entry.isIntersecting) prepareReveal(entry.target);
    }, { rootMargin: '64px 0px 64px 0px', threshold: 0 });
    for (const element of document.querySelectorAll('[data-reveal]')) {
      prepareReveal(element);
      reveals.observe(element);
      departures.observe(element);
    }
  }
  function disableReveals() {
    document.body.classList.remove('studio-motion');
    reveals?.disconnect();
    departures?.disconnect();
    for (const animation of pending.values()) animation.cancel();
    pending.clear();
  }
  enableReveals();
  const startEntrance = () => requestAnimationFrame(() => requestAnimationFrame(() => {
    entranceReady = true;
    if (reducedMotion.matches) return;
    document.body.classList.add('studio-motion');
    for (const element of pending.keys()) {
      const bounds = element.getBoundingClientRect();
      if (bounds.bottom > 24 && bounds.top < innerHeight - 24) play(element);
    }
  }));
  // Wait until the book scene has initialized so it cannot consume the hero fade.
  if (document.readyState === 'complete') startEntrance();
  else window.addEventListener('load', startEntrance, { once: true });
  // A keyboard user never has to wait for a focused link to become visible.
  document.addEventListener('focusin', event => {
    if (!event.target.matches(':focus-visible')) return;
    const element = event.target.closest('[data-reveal]');
    const animation = pending.get(element);
    if (!animation) return;
    pending.delete(element);
    animation.cancel();
  });
  // A preview opened in a background tab keeps its entrance until it is visible.
  document.addEventListener('visibilitychange', () => {
    for (const [element, animation] of pending) {
      if (document.hidden) {
        if (animation.playState === 'running') animation.pause();
      } else {
        const bounds = element.getBoundingClientRect();
        if (bounds.bottom > 24 && bounds.top < innerHeight - 24) play(element);
      }
    }
  });

  const board = document.querySelector('.studio-board');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let boardVisible = false;
  let boardFrame = 0;
  let pointer = { x: 0, y: 0 };
  const resetMap = () => {
    window.cancelAnimationFrame(boardFrame);
    boardFrame = 0;
    board?.style.removeProperty('--board-x');
    board?.style.removeProperty('--board-y');
  };
  const updateBoardActivity = () => {
    board?.toggleAttribute('data-map-active', boardVisible && !document.hidden && !reducedMotion.matches);
    if (!boardVisible || document.hidden) resetMap();
  };
  if (board && 'IntersectionObserver' in window) {
    const visibility = new IntersectionObserver(entries => {
      boardVisible = entries[0].isIntersecting;
      updateBoardActivity();
    });
    visibility.observe(board);
    document.addEventListener('visibilitychange', updateBoardActivity);
    board.addEventListener('pointermove', event => {
      if (reducedMotion.matches || !finePointer.matches || !boardVisible) return;
      const bounds = board.getBoundingClientRect();
      pointer = {
        x: ((event.clientX - bounds.left) / bounds.width - .5) * 12,
        y: ((event.clientY - bounds.top) / bounds.height - .5) * 12
      };
      if (!boardFrame) boardFrame = window.requestAnimationFrame(() => {
        boardFrame = 0;
        board.style.setProperty('--board-x', `${pointer.x.toFixed(2)}px`);
        board.style.setProperty('--board-y', `${pointer.y.toFixed(2)}px`);
      });
    }, { passive: true });
    board.addEventListener('pointerleave', resetMap);
  }
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) disableReveals();
    else enableReveals();
    resetMap();
    updateBoardActivity();
  });
})();
/* Pointer ripples are drawn on a small, event-driven canvas, with no library. */
(() => {
  'use strict';
  const hero = document.querySelector('.studio-hero');
  const canvas = hero?.querySelector('.hero-water');
  if (!canvas || !('IntersectionObserver' in window)) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover:hover) and (pointer:fine)');
  let width = 1, height = 1, frame = 0, visible = false, lastPaint = 0;
  let waves = [], lastPoint = null, lastDrop = -Infinity;
  const enabled = () => visible && !document.hidden && !reduced.matches;
  function paint(time) {
    ctx.clearRect(0, 0, width, height);
    if (!waves.length) return;
    // A gently displaced contour field makes the ripples feel like a surface.
    for (let line = 18; line < height; line += 24) {
      ctx.beginPath();
      for (let x = -12; x <= width + 12; x += 12) {
        let y = line + Math.sin(x * .007 + line * .016) * 9;
        let light = 0;
        for (const wave of waves) {
          const age = time - wave.time;
          const distance = Math.hypot(x - wave.x, (line - wave.y) * 1.2);
          const band = distance - age * .18;
          const envelope = Math.exp(-age / 1400) * Math.exp(-(band * band) / 18000);
          y += Math.sin(band * .071) * envelope * 19;
          light += envelope;
        }
        if (x === -12) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(57, 103, 69, .105)';
      ctx.stroke();
    }
    for (const wave of waves) {
      const age = time - wave.time;
      const radius = 6 + age * .18;
      const fade = Math.pow(Math.max(0, 1 - age / 2300), 2);
      const glow = ctx.createRadialGradient(wave.x, wave.y, Math.max(0, radius - 44), wave.x, wave.y, radius + 36);
      glow.addColorStop(0, 'rgba(196,222,159,0)');
      glow.addColorStop(.52, `rgba(196,222,159,${fade * .18})`);
      glow.addColorStop(1, 'rgba(196,222,159,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(wave.x - radius - 40, wave.y - radius - 40, radius * 2 + 80, radius * 2 + 80);
      for (let ring = 0; ring < 3; ring++) {
        const r = radius - ring * 13;
        if (r <= 0) continue;
        ctx.beginPath();
        ctx.ellipse(wave.x, wave.y, r, r * .77, -.12, 0, Math.PI * 2);
        ctx.strokeStyle = ring % 2 ? `rgba(255,255,243,${fade * .55})` : `rgba(68,113,77,${fade * .15})`;
        ctx.lineWidth = ring % 2 ? 2 : 1;
        ctx.stroke();
      }
    }
  }
  function tick(time) {
    frame = 0;
    if (!enabled()) { stop(); return; }
    waves = waves.filter(wave => time - wave.time < 2300);
    if (time - lastPaint >= 30 || !waves.length) { paint(time); lastPaint = time; }
    canvas.dataset.waterState = waves.length ? 'rippling' : 'idle';
    if (waves.length) frame = requestAnimationFrame(tick);
  }
  function stop() {
    cancelAnimationFrame(frame); frame = 0; waves = []; lastPoint = null;
    ctx.clearRect(0, 0, width, height);
    canvas.dataset.waterState = 'idle';
  }
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (waves.length) paint(performance.now());
  }
  function drop(event) {
    if (!enabled() || (event.type === 'pointermove' && (!fine.matches || event.pointerType === 'touch'))) return;
    const bounds = canvas.getBoundingClientRect();
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const time = performance.now();
    if (event.type === 'pointermove' && (time - lastDrop < 95 || (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 28))) return;
    waves.push({ ...point, time }); waves = waves.slice(-7); lastPoint = point; lastDrop = time;
    canvas.dataset.waterState = 'rippling';
    if (!frame) frame = requestAnimationFrame(tick);
  }
  new ResizeObserver(resize).observe(hero);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (!visible) stop(); }).observe(hero);
  hero.addEventListener('pointermove', drop, { passive: true });
  hero.addEventListener('pointerdown', drop, { passive: true });
  hero.addEventListener('pointerleave', () => { lastPoint = null; }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  reduced.addEventListener('change', () => { if (reduced.matches) stop(); });
  resize();
})();

/* Show browsing exits after one second in the book scene, even without a turn. */
(() => {
  'use strict';
  const journal = document.querySelector('.studio-journal');
  const stage = journal?.querySelector('#feature-stage');
  const list = journal?.querySelector('#archive');
  if (!stage || !list) return;
  const portals = document.createElement('div');
  portals.className = 'journal-portals';
  portals.setAttribute('aria-hidden', 'true');
  portals.inert = true;
  portals.innerHTML = '<a class="journal-portal journal-portal-up" href="#crew" aria-label="点击继续浏览，返回认识小队"><span>点击继续浏览</span><svg viewBox="0 0 32 24" aria-hidden="true"><path d="m7 12 9-8 9 8M7 21l9-8 9 8"/></svg></a><a class="journal-portal journal-portal-down" href="#archive" aria-label="点击继续浏览，前往手记列表"><span>点击继续浏览</span><svg viewBox="0 0 32 24" aria-hidden="true"><path d="m7 3 9 8 9-8M7 12l9 8 9-8"/></svg></a>';
  document.body.append(portals);
  const fallback = stage.querySelector('[data-journal-exit]');
  let released = false, frame = 0, timer = 0, ready = false;
  const fine = matchMedia('(hover:hover) and (pointer:fine)');
  function show(visible) {
    portals.classList.toggle('is-visible', visible);
    portals.setAttribute('aria-hidden', String(!visible));
    portals.inert = !visible;
    stage.classList.toggle('has-exit-portals', visible);
    if (fallback) { fallback.inert = visible; fallback.setAttribute('aria-hidden', String(visible)); }
  }
  function reset() {
    clearTimeout(timer); timer = 0; ready = false; released = false;
  }
  function update() {
    frame = 0;
    const bounds = stage.getBoundingClientRect();
    const header = document.querySelector('.site-header')?.offsetHeight || 0;
    const available = Math.max(1, innerHeight - header);
    const shown = Math.max(0, Math.min(innerHeight, bounds.bottom) - Math.max(header, bounds.top));
    if (shown === 0) reset();
    const centered = shown / Math.min(available, bounds.height) > .66 && bounds.top < header + available * .32 && bounds.bottom > header + available * .65;
    stage.dataset.journalFocus = centered && !released && fine.matches ? 'true' : 'false';
    stage.dataset.journalReleased = String(released);
    const viewing = centered && !released && !document.hidden && stage.dataset.archiveView === 'overview';
    if (viewing && !ready && !timer) {
      timer = setTimeout(() => { timer = 0; ready = true; update(); }, 1000);
    } else if (!viewing && timer) {
      clearTimeout(timer); timer = 0;
    }
    show(viewing && ready);
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  function release() {
    clearTimeout(timer); timer = 0; ready = false; released = true;
    stage.dataset.journalFocus = 'false';
    stage.dataset.journalReleased = 'true';
    show(false);
    window.dispatchEvent(new Event('welkin-journal-release'));
  }
  fallback?.addEventListener('click', release);
  for (const link of portals.querySelectorAll('a')) link.addEventListener('click', release);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && stage.dataset.archiveView === 'overview') release();
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  window.addEventListener('welkin-view-change', schedule);
  fine.addEventListener('change', schedule);
  document.addEventListener('visibilitychange', schedule);
  update();
})();

/* Press feedback follows the actual pointer; native anchor navigation stays immediate. */
(() => {
 'use strict';
 const reduced = matchMedia('(prefers-reduced-motion: reduce)');
 for (const link of document.querySelectorAll('.is-studio .nav-contact')) {
  let timer = 0, wave = null;
  link.addEventListener('click', event => {
   if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
   clearTimeout(timer); link.classList.add('is-tapped');
   timer = setTimeout(() => link.classList.remove('is-tapped'), 600);
   wave?.remove(); wave = null;
   if (reduced.matches) return;
   const bounds = link.getBoundingClientRect(), size = Math.max(bounds.width,bounds.height) * 2.2;
   const pulse = document.createElement('span');
   pulse.className = 'nav-contact-wave'; pulse.setAttribute('aria-hidden','true');
   pulse.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (event.detail ? event.clientX - bounds.left : bounds.width / 2) + 'px;top:' + (event.detail ? event.clientY - bounds.top : bounds.height / 2) + 'px;';
   link.append(pulse); wave = pulse;
   const animation = pulse.animate([
    { transform:'translate(-50%,-50%) scale(.06)',opacity:.15 },
    { offset:.32,opacity:.8 },
    { transform:'translate(-50%,-50%) scale(1)',opacity:0 }
   ], { duration:650,easing:'cubic-bezier(.15,.65,.25,1)' });
   animation.finished.then(() => { pulse.remove(); if (wave === pulse) wave = null; }, () => pulse.remove());
  });
 }
})();
