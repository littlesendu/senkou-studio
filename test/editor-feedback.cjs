// Exercise real menu actions and rendered selection pixels, including the CPU fallback.
const assert = require('node:assert/strict');
const path = require('node:path');
const sharp = require('sharp');
module.exports = async function ({ page, menu, output, reload }) {
  async function theme(id) {
    const labels = ['浅灰', '深灰', '蓝色', '深蓝', '紫色', '黑色', '白色'];
    await menu('更多', /^主题$/, true);
    await page.locator('.contextpanel:visible .label').filter({ hasText: new RegExp('^' + labels[id] + '$') }).click();
    await page.waitForFunction(id => document.documentElement.dataset.editorTheme === String(id), id);
    assert.equal(await page.evaluate(() => debugApp.j.H4), id);
    return page.locator('.topbar').evaluate(el => getComputedStyle(el).backgroundColor);
  }
  const palettes = [];
  for (let id = 0; id < 7; id++) {
    palettes.push(await theme(id));
    await page.locator('.workspace-help').click();
    const colors = await page.locator('#workspace-help').evaluate(el => ({
      text: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor,
      icon: getComputedStyle(document.querySelector('.confbar img.toolicon')).filter
    }));
    assert.notEqual(colors.text, colors.background, 'Help must follow the chosen palette');
    assert(colors.icon.includes('invert'), 'Icons must adapt to light and dark palettes');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('workspace-help').open);
    if (id === 0 || id === 4 || id === 6) await page.screenshot({ path: path.join(output, 'theme-' + id + '.png') });
  }
  assert.equal(new Set(palettes).size, 7, 'Every theme must produce a distinct rendered palette');
  await theme(4); await reload();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.editorTheme), '4', 'Theme must survive reload');
  await theme(1);

  async function point(x, y) {
    return page.evaluate(({ x, y }) => {
      const p = debugApp.xK().k.dD(x, y), box = debugApp.XS.tB[debugApp.as5].SP.getBoundingClientRect();
      return { x: box.x + p.x, y: box.y + p.y };
    }, { x, y });
  }
  async function rectangle() {
    await page.keyboard.press('m');
    const a = await point(35, 40), b = await point(270, 195);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
    await page.mouse.move(700, 100);
    await page.waitForFunction(() => !!debugApp.xK().h);
    await page.waitForTimeout(250);
  }
  async function beginSample() {
    await page.evaluate(() => {
      const View = debugNative.SelectionView;
      window.selectionFrames = []; window.selectionRedraws = 0;
      if (!window.originalSelectionRender) {
        window.originalSelectionRender = View.prototype.a5e;
        window.originalOverlayRender = View.prototype.aLO;
        View.prototype.aLO = function () { selectionRedraws++; return originalOverlayRender.apply(this, arguments); };
        View.prototype.a5e = function (only) {
          const result = originalSelectionRender.apply(this, arguments);
          // WebGL's drawing buffer is transient; sample immediately after the actual draw.
          if (only && selectionFrames.length < 10) selectionFrames.push(this.SP.querySelector('canvas').toDataURL());
          return result;
        };
      }
      window.selectionBefore = { mask: debugApp.xK().h.H.slice(), history: debugApp.xK().history.length, pixels: debugApp.xK().buffer.slice() };
    });
  }
  async function movingPixels(gpu) {
    await beginSample();
    if (!gpu) {
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(95);
        await page.evaluate(() => selectionFrames.push(debugApp.XS.tB[debugApp.as5].SP.querySelector('canvas').toDataURL()));
      }
    } else await page.waitForFunction(() => selectionFrames.length >= 5);
    const sample = await page.evaluate(() => {
      const doc = debugApp.xK();
      return { frames: selectionFrames.slice(0, 5), redraws: selectionRedraws,
        stable: selectionBefore.history === doc.history.length && selectionBefore.pixels.every((n, i) => doc.buffer[i] === n) && selectionBefore.mask.every((n, i) => doc.h.H[i] === n) };
    });
    assert(sample.stable, 'Animation must preserve selection, document pixels and editing history');
    assert.equal(sample.redraws, 0, 'Idle selection must reuse cached overlay pixels');
    const frames = await Promise.all(sample.frames.map(frame => sharp(Buffer.from(frame.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
    const first = frames[0], changed = new Set();
    for (const next of frames.slice(1)) for (let i = 0; i < first.data.length; i += 4) {
      if (first.data[i] !== next.data[i] || first.data[i + 1] !== next.data[i + 1] || first.data[i + 2] !== next.data[i + 2]) changed.add(i / 4);
    }
    assert(changed.size > 80 && changed.size < 2500, 'Only the thin outline should animate: ' + changed.size);
    assert(changed.size < first.info.width * first.info.height / 100);
    return sample;
  }
  async function stopped(reason) {
    const before = await page.evaluate(() => debugNative.SelectionView.senkouSelectionPhase);
    await page.waitForTimeout(320);
    assert.equal(await page.evaluate(() => debugNative.SelectionView.senkouSelectionPhase), before, reason);
  }

  await rectangle(); await movingPixels(true);
  await page.keyboard.press('Control+h'); await page.waitForTimeout(120);
  await stopped('Hidden selection must not animate');
  await page.keyboard.press('Control+h');
  await page.waitForTimeout(120);
  await page.evaluate(() => Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }));
  await stopped('Background tab must not animate');
  await page.evaluate(() => delete document.hidden);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150); await stopped('Reduced motion must keep the outline static');
  assert.equal(await page.evaluate(() => debugNative.SelectionView.senkouSelectionPhase), 0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await movingPixels(true);

  await menu('更多', /^使用 WebGL$/);
  await page.waitForFunction(() => !debugNative.GL.rQ); await page.waitForTimeout(250);
  await movingPixels(false);
  await page.keyboard.press('Control+d'); await page.waitForTimeout(120);
  await stopped('Deselecting must stop selection animation');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  assert(await page.evaluate(() => !!debugApp.xK().h), 'Undo must restore the selected shape');
  await movingPixels(false);
  await page.keyboard.press('Control+d');

  await page.evaluate(() => debugApp.Hs.tB.find(t => t.Tg === 'tools/lasso').YG(null, true));
  const polygon = await Promise.all([[45,45],[240,60],[265,185],[100,200],[48,48]].map(p => point(...p)));
  await page.mouse.move(polygon[0].x, polygon[0].y); await page.mouse.down();
  for (const p of polygon.slice(1)) await page.mouse.move(p.x, p.y, { steps: 4 });
  await page.mouse.up(); await page.mouse.move(700,100); await page.waitForFunction(() => !!debugApp.xK().h); await page.waitForTimeout(250);
  await movingPixels(false);
  await page.setViewportSize({ width: 1360, height: 960 }); await page.waitForTimeout(350);
  await movingPixels(false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await menu('更多', /^使用 WebGL$/);
  await page.waitForFunction(() => debugNative.GL.rQ); await page.waitForTimeout(250);
  await movingPixels(true);
  await page.keyboard.press('Control+d'); await page.keyboard.press('v');
  await page.waitForTimeout(150);
};
