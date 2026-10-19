(() => {
  'use strict';
  const section = document.querySelector('#reviews');
  if (!section) return;
  const dialog = document.querySelector('#review-dialog'), form = document.querySelector('#review-form');
  const streams = document.querySelector('#review-streams'), empty = document.querySelector('#reviews-empty');
  const status = document.querySelector('#review-status'), submit = document.querySelector('#review-submit'), help = document.querySelector('#review-submit-help');
  const ratings = window.SenkouReviewRatings;
  const repository = section.dataset.reviewRepository;
  const localBase = new URL('../', new URL(section.dataset.reviewData, location.href));
  let localSession = null, opener = null, loading;
  const setStatus = (text, bad = false) => { status.textContent = text; status.classList.toggle('is-error', bad); };
  function updateHelp() {
    help.textContent = localSession ? '本地提交后可在网站管理的“客户评价”中审核。审核通过后展示。' : repository ? '通过 GitHub 提交，需要登录 GitHub；发布评价后，由工作室审核展示。请勿填写隐私信息。' : '评价入口正在准备中，工作室配置接收仓库后即可投递。';
    submit.disabled = !localSession && !repository;
    submit.firstChild.textContent = localSession ? '提交评价 ' : '前往 GitHub 提交 ';
  }
  async function detectLocal() {
    try { const response = await fetch(new URL('__studio_api/status', localBase), { signal: AbortSignal.timeout(1800), cache: 'no-store' }); if (response.ok && response.headers.get('Content-Type')?.includes('application/json')) { const data = await response.json(); if (data.mode === 'local') localSession = data.nonce; } } catch {}
    updateHelp();
  }
  function updateMemberRatings(list) {
    for (const element of document.querySelectorAll('.crew-portrait [data-member-rating]')) {
      const target = element.dataset.memberRating, summary = ratings.forTarget(list, target);
      element.dataset.rating = String(summary.score); element.dataset.reviewCount = String(summary.count);
      element.setAttribute('aria-label', ratings.label(target, summary)); element.title = ratings.label(target, summary);
      element.querySelectorAll('.rating-star').forEach((star, index) => {
        const fill = Math.round(Math.max(0, Math.min(1, summary.score - index)) * 100);
        star.style.setProperty('--star-fill', fill + '%');
        star.classList.toggle('is-filled', fill === 100); star.classList.toggle('is-partial', fill > 0 && fill < 100);
      });
    }
  }
  function render(list) {
    const valid = ratings.publicReviews(list).reverse();
    updateMemberRatings(valid);
    if (!valid.length) { streams.hidden = true; empty.hidden = false; return; }
    streams.replaceChildren(); streams.hidden = false; empty.hidden = true;
    for (let row = 0; row < 2; row++) {
      const items = valid.filter((_, index) => index % 2 === row); if (!items.length) continue;
      const lane = document.createElement('div'); lane.className = 'review-lane';
      const track = document.createElement('div'); track.className = 'review-track'; track.style.setProperty('--drift-time', (48 + row * 12) + 's');
      const group = document.createElement('div'); group.className = 'review-group';
      for (const item of items) {
        const card = document.createElement('article'); card.className = 'review-bottle';
        const top = document.createElement('div'), target = document.createElement('span'), stars = document.createElement('span');
        target.textContent = item.target; stars.className = 'review-stars'; stars.textContent = '★'.repeat(item.rating) + '☆'.repeat(5 - item.rating); stars.setAttribute('aria-label', `${item.rating} 星，满分 5 星`);
        const content = document.createElement('p'), meta = document.createElement('small'); content.textContent = item.content;
        meta.textContent = '一位同行的队友' + (item.createdAt ? ' · ' + String(item.createdAt).slice(0, 10).replace(/-/g, '.') : '');
        top.append(target, stars); card.append(top, content, meta); group.append(card);
      }
      track.append(group); const clone = group.cloneNode(true); clone.setAttribute('aria-hidden', 'true'); clone.inert = true; track.append(clone); lane.append(track); streams.append(lane);
    }
    updateDrift();
  }
  let inView = false;
  function updateDrift() { section.classList.toggle('reviews-drifting', inView && !document.hidden); }
  new IntersectionObserver(entries => { inView = entries[0].isIntersecting; updateDrift(); }).observe(section);
  document.addEventListener('visibilitychange', updateDrift);
  section.querySelector('.reviews-water').addEventListener('click', () => section.classList.toggle('reviews-paused'));
  document.querySelector('[data-review-open]').addEventListener('click', event => {
    opener = event.currentTarget; dialog.showModal(); setStatus(''); if (!loading) loading = detectLocal();
  });
  document.querySelector('[data-review-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => opener?.focus());
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const value = { target: form.elements.target.value, rating: Number(form.elements.rating.value), content: form.elements.content.value.trim() };
    if (value.content.length < 5) { setStatus('请写下至少 5 个字的真实感受。', true); return; }
    if (localSession) {
      submit.disabled = true; setStatus('正在投递…');
      try {
        const response = await fetch(new URL('__studio_api/reviews', localBase), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Session': localSession }, body: JSON.stringify(value) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error || '投递失败，请稍后重试。');
        form.reset(); setStatus('已收到你的评价！审核通过后，它会漂到这里。');
      } catch (error) { setStatus(error.message, true); } finally { submit.disabled = false; }
    } else if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
      const body = ['<!-- senkou-review:v1 -->', '### 评价对象', value.target, '', '### 星级', String(value.rating), '', '### 内容', value.content, '', '由森口电竞网站评价表单生成，审核通过后展示。'].join('\n');
      const url = 'https://github.com/' + repository + '/issues/new?' + new URLSearchParams({ title: '[客户评价] ' + value.target + ' · ' + value.rating + ' 星', body });
      window.open(url, '_blank', 'noopener,noreferrer'); setStatus('已打开 GitHub。请在新页面登录并点击发布，完成评价投递。');
    } else updateHelp();
  });
  updateHelp();
  let refreshing;
  function refreshReviews() {
    if (document.hidden || refreshing) return;
    refreshing = fetch(section.dataset.reviewData, { cache: 'no-cache' }).then(response => response.ok ? response.json() : null).then(data => { if (Array.isArray(data?.reviews)) render(data.reviews); }).catch(() => {}).finally(() => { refreshing = null; });
  }
  refreshReviews();
  window.addEventListener('focus', refreshReviews);
  window.addEventListener('pageshow', refreshReviews);
  document.addEventListener('visibilitychange', refreshReviews);
})();
