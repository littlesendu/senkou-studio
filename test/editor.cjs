// Browser regression for the standalone editor. All user files are synthetic.
// The server exposes a native app reference only in its test response.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const sharp = require('sharp');

const root = path.resolve(__dirname, '../source/ps');
const output = path.resolve(__dirname, '../work/editor-test');
const mount = '/nested/ps/';
const errors = [];
const mime = { '.html': 'text/html;charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = http.createServer(async (request, response) => {
  try {
    let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!name.startsWith(mount)) return response.writeHead(404).end();
    name = name.slice(mount.length);
    if (!name || name.endsWith('/')) name += 'index.html';
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) return response.writeHead(403).end();
    let bytes = await fs.readFile(file);
    if (file.endsWith('pp1753360222.js')) {
      bytes = Buffer.from(bytes.toString().replace('OnlinePS.install({', 'OnlinePS.install(window.debugNative={').replace('OnlinePS.start(senkouApp)', 'window.debugApp=senkouApp;if(window.holdEditorStartup)window.releaseEditorStartup=function(){OnlinePS.start(senkouApp)};else OnlinePS.start(senkouApp)'));
    }
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }).end(bytes);
  } catch { response.writeHead(404).end(); }
});

async function main() {
  await fs.mkdir(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const channel = process.env.EDITOR_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
  const browser = await chromium.launch({ channel, headless: true });
  try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await context.addInitScript(() => { window.showSaveFilePicker = undefined; window.showOpenFilePicker = undefined; });
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss());
    const fixture = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#a4d6bc' } }).png().toBuffer();
    async function load() {
      await page.goto(origin + mount, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.body?.dataset.editorVersion);
    }
    async function open() {
      await page.locator('#local-open-input').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: fixture });
      await page.waitForFunction(() => debugApp.xK()?.r === 320);
    }
    async function menu(top, label, hover = false) {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelectorAll('.floatcont').length === 0);
      await page.locator('.topbar > span:first-of-type > button').filter({ hasText: new RegExp('^' + top + '$') }).click();
      const item = page.locator('.contextpanel:visible .label').filter({ hasText: label }).first();
      if (hover) await item.hover(); else await item.click();
    }
    async function savePSD(name) {
      const pending = page.waitForEvent('download');
      await menu('文件', /^存储为 PSD$/);
      const download = await pending;
      const file = path.join(output, name);
      await download.saveAs(file);
      const bytes = await fs.readFile(file);
      assert.equal(bytes.subarray(0, 4).toString(), '8BPS');
      assert.equal(bytes.readUInt32BE(14), 240);
      assert.equal(bytes.readUInt32BE(18), 320);
      return bytes;
    }

    // Hold the UI adapter while the core finishes: the native landing page must never exist.
    const boot = await context.newPage();
    await boot.addInitScript(() => { window.holdEditorStartup = true; });
    await boot.goto(origin + mount, { waitUntil: 'networkidle' });
    await boot.waitForFunction(() => window.releaseEditorStartup && debugApp.rw);
    assert.deepEqual(await boot.evaluate(() => ({
      preparing: !document.getElementById('editor-boot').hidden,
      hidden: getComputedStyle(debugApp._).visibility,
      nativeHome: !!debugApp.XS.Sr.aEq,
      storageViews: document.querySelectorAll('.storageset,.storage').length,
      homeChildren: debugApp.XS.BF.childElementCount
    })), { preparing: true, hidden: 'hidden', nativeHome: false, storageViews: 0, homeChildren: 0 });
    await boot.screenshot({ path: path.join(output, 'loading.png') });
    await boot.evaluate(() => releaseEditorStartup());
    await boot.locator('.welcome-content').waitFor();
    await boot.locator('.welcome-create').click();
    await boot.locator('.window:visible').waitFor();
    await boot.keyboard.press('Escape');
    await boot.locator('#local-open-input').setInputFiles({ name: 'close-check.png', mimeType: 'image/png', buffer: fixture });
    await boot.waitForFunction(() => debugApp.xK()?.r === 320);
    await boot.evaluate(() => debugApp.XS.k8(0));
    await boot.locator('.welcome-content').waitFor();
    assert(!await boot.locator('.storageset,.storage').count(), 'Closing the last document must return to the custom welcome');
    await boot.screenshot({ path: path.join(output, 'welcome.png') });
    await boot.close();

    const broken = await context.newPage();
    await broken.route('**/code/controls.js?*', route => route.abort());
    await broken.goto(origin + mount, { waitUntil: 'networkidle' });
    await broken.locator('#editor-boot-retry').waitFor();
    assert.equal(await broken.evaluate(() => document.body?.dataset.editorVersion), undefined);
    await broken.unroute('**/code/controls.js?*');
    await broken.locator('#editor-boot-retry').click();
    await broken.waitForFunction(() => document.body?.dataset.editorVersion);
    await broken.close();

    await load();
    assert.deepEqual(await page.locator('.workspace-brand').evaluate(el => ({ text: el.textContent, sameMark: el.querySelector('img').src === document.querySelector('link[type="image/svg+xml"]').href })), { text: '', sameMark: true });
    await menu('更多', /^语言$/, true);
    assert(!/Photopea|Vectorpea|PeaMark/i.test(await page.locator('.contextpanel:visible').allInnerTexts()), 'Vendor install/about links must be absent');
    await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelectorAll('.floatcont').length === 0);
    await page.waitForTimeout(1000); // Open after the welcome entrance has finished.
    await page.evaluate(() => {
      window.sidebarEntrances = [];
      document.addEventListener('animationstart', event => {
        if (/toolbar-arrive/.test(event.animationName)) sidebarEntrances.push({ name: event.animationName, time: performance.now() });
      });
    });
    await open();
    await page.waitForFunction(() => sidebarEntrances.length >= 2);
    const entrances = await page.evaluate(() => sidebarEntrances);
    assert(entrances.some(event => /left/.test(event.name)) && entrances.some(event => /right/.test(event.name)));
    assert(Math.abs(entrances[0].time - entrances[1].time) < 50, 'Sidebars must enter together');

    await require('./editor-feedback.cjs')({ page, menu, output, reload: async () => { await load(); await open(); } });

    // Panel tabs, mask and virtual modifiers must remain functional after reskinning.
    for (const caption of ['通道', '路径', '图层']) {
      const tab = page.locator('.rightbar .panelhead > div').filter({ hasText: new RegExp('^' + caption + '$') });
      await tab.click();
      assert(await tab.evaluate(el => el.classList.contains('active')), caption + ' tab must activate');
    }
    assert.equal(await page.locator('.native-color-controls .color-swap').count(), 1);
    assert.equal(await page.locator('.native-color-controls .color-reset').count(), 1);
    await page.locator('.foreground-hit').click();
    await page.locator('.window:visible').waitFor();
    await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelectorAll('.floatcont').length === 0);
    await page.locator('.color-swap').click();
    assert.equal(await page.evaluate(() => debugApp.j.BE), 0xffffff);
    await page.locator('.color-reset').click();
    assert.equal(await page.evaluate(() => debugApp.j.BE), 0);
    const mask = page.locator('.toolbar .tools .editor-utility-button').filter({ has: page.locator('[data-editor-icon="lrs/mask"]') });
    const keyboard = page.locator('.toolbar .tools .editor-utility-button').filter({ has: page.locator('[data-editor-icon="kb"]') });
    for (const button of [mask, keyboard]) {
      const box = await button.boundingBox();
      assert(box.width >= 30 && box.height >= 28, 'Utility controls must have usable hit areas');
    }
    await mask.click();
    assert(await page.evaluate(() => debugApp.xK().vb() != null), 'Quick mask must enter mask mode');
    await page.waitForTimeout(320); // The native button treats two clicks within 300ms as Preferences.
    await mask.click();
    assert(await page.evaluate(() => debugApp.xK().vb() == null));
    await keyboard.click();
    const modifiers = page.locator('.toolbar .rangecontFloat:visible');
    await modifiers.getByText('禁用触控', { exact: true }).waitFor();
    await modifiers.getByText('Ctrl', { exact: true }).click();
    assert(await page.evaluate(() => debugApp.Hs.au_[0]));
    await modifiers.getByText('Ctrl', { exact: true }).click();
    assert(!(await page.evaluate(() => debugApp.Hs.au_[0])));
    await keyboard.click();
    await page.keyboard.press('v');
    assert(await page.evaluate(() => {
      const toolbar = document.querySelector('.toolbar [data-tool="tools/move"] .editor-tool-icon');
      const config = document.querySelector('.confbar img.toolicon');
      const xml = new DOMParser().parseFromString(decodeURIComponent(config.src.split(',')[1]), 'image/svg+xml');
      return [...toolbar.querySelectorAll('path')].map(p => p.getAttribute('d')).join('|') === [...xml.querySelectorAll('path')].map(p => p.getAttribute('d')).join('|');
    }), 'Move icon must match between the toolbar and tool options');

    const tools = await page.evaluate(() => debugApp.Hs.tB.filter(tool => /brush|eraser|clone|blur|sharpen|smudge|dodge|burn|sponge|pencil/.test(tool.Tg)).map(tool => ({ id: tool.DK, asset: tool.Tg })));
    let sharedControls = 0;
    for (const tool of tools) {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelectorAll('.floatcont').length === 0);
      await page.evaluate(id => debugApp.Hs.tB.find(tool => tool.DK === id).YG(null, true), tool.id);
      const trigger = page.locator('.confbar .brushbutton button').first();
      if (!await trigger.isVisible()) continue; // Magic eraser uses its own controls.
      await trigger.click();
      await page.locator('.floatcont:visible').first().waitFor();
      assert(await page.locator('.floatcont:visible').first().locator('input').count(), tool.asset + ' must expose adjustment controls');
      sharedControls++;
    }
    assert(sharedControls >= 13, 'All shared brush tools must expose their preset controls');
    await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelectorAll('.floatcont').length === 0);
    await page.evaluate(() => debugApp.Hs.tB.find(tool => tool.Tg === 'tools/eraser').YG(null, true));
    await page.locator('.confbar .brushbutton button').click();
    const size = page.locator('.floatcont:visible input[type=text]').first();
    await size.fill('37');
    await size.press('Tab');
    await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelectorAll('.floatcont').length === 0);
    await page.locator('.confbar .brushbutton button').click();
    assert.match(await page.locator('.floatcont:visible input[type=text]').first().inputValue(), /37/);
    await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelectorAll('.floatcont').length === 0);

    await menu('文件', /^导出为$/, true);
    await page.waitForFunction(() => [...document.querySelectorAll('.contextpanel')].filter(element => element.getClientRects().length).length >= 2);
    await page.evaluate(() => {
      window.submenu = [...document.querySelectorAll('.contextpanel')].at(-1);
      window.reopens = 0;
      new MutationObserver(records => { for (const record of records) for (const node of record.addedNodes) if (node === submenu) reopens++; }).observe(document.body, { childList: true, subtree: true });
    });
    const row = await page.locator('.contextpanel:visible .label').filter({ hasText: /^导出为$/ }).first().boundingBox();
    for (let move = 0; move < 12; move++) await page.mouse.move(row.x + 3 + (move % 3) * Math.min(35, row.width / 4), row.y + row.height / 2);
    assert.deepEqual(await page.evaluate(() => ({ connected: submenu.isConnected, reopens })), { connected: true, reopens: 0 });
    await page.locator('.contextpanel:visible .label').filter({ hasText: /^PNG$/ }).click();
    const pngDownload = page.waitForEvent('download');
    await page.locator('.window:visible').getByRole('button', { name: /^(存储|保存)(\.\.\.|…)?$/ }).click();
    const pngFile = path.join(output, 'export.png');
    await (await pngDownload).saveAs(pngFile);
    const png = await sharp(pngFile).metadata();
    assert.equal(png.width, 320); assert.equal(png.height, 240);
    await page.keyboard.press('Control+j');
    const psd = await savePSD('layers.psd');
    assert.equal(psd.readUInt16BE(22), 8);
    await page.locator('#local-open-input').setInputFiles(path.join(output, 'layers.psd'));
    await page.waitForFunction(() => document.body.innerText.includes('layers.psd') && [...document.querySelectorAll('.lpbody')].some(element => element.innerText.trim().split('\n').length >= 2));

    for (const viewport of [{ width: 1440, height: 1000 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await load(); await open();
      const layout = await page.evaluate(() => {
        const header = document.querySelector('.topbar').getBoundingClientRect();
        const actions = document.querySelector('.workspace-actions').getBoundingClientRect();
        return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, headerWidth: header.width, rightGap: innerWidth - actions.right };
      });
      assert(Math.abs(layout.headerWidth - layout.width) <= 1 && layout.scrollWidth <= layout.width, 'Header must fill the viewport without overflowing');
      assert(layout.rightGap >= -1 && layout.rightGap <= 20, 'Help and open-file actions must stay on the right');
      await page.screenshot({ path: path.join(output, 'layout-' + viewport.width + '.png') });
      const logButton = page.locator('.workspace-changelog');
      assert.equal(await logButton.evaluate(el => el.nextElementSibling.className), 'workspace-help', 'Update log must precede help');
      await logButton.click();
      const logDialog = page.locator('.workspace-changelog-dialog');
      await logDialog.waitFor({ state: 'visible' });
      await page.waitForTimeout(250);
      assert.equal(await logDialog.locator('time').first().getAttribute('datetime'), '2026-10-25');
      assert.equal(await logDialog.locator('.release-group').count(), await page.evaluate(() => OnlinePS.releases.reduce((total, release) => total + release.groups.length, 0)));
      assert((await logDialog.innerText()).includes('AI 联网搜图与素材导入'));
      assert((await logDialog.innerText()).includes('橡皮擦'), 'Release notes must describe the real editing fixes');
      const reading = await logDialog.evaluate(el => {
        const box=el.getBoundingClientRect(),notes=el.querySelector('.release-notes');
        return { left:box.left,top:box.top,right:box.right,bottom:box.bottom,height:innerHeight,width:innerWidth,scrollable:notes.scrollHeight>notes.clientHeight };
      });
      assert(reading.left>=0 && reading.top>=0 && reading.right<=reading.width && reading.bottom<=reading.height, 'Release log must fit the viewport');
      assert(reading.scrollable, 'Long release notes must scroll within the dialog');
      await page.screenshot({ path:path.join(output,'changelog-'+viewport.width+'.png') });
      await logDialog.locator('.release-notes').evaluate(el=>{el.scrollTop=el.scrollHeight;});
      assert(await logDialog.locator('.release-notes').evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop)<2));
      await page.keyboard.press('Tab');
      assert(await page.evaluate(()=>document.querySelector('.workspace-changelog-dialog').contains(document.activeElement)), 'Keyboard focus must remain in the dialog');
      if(viewport.width===1440)await logDialog.locator('.help-done').click();
      else if(viewport.width===820)await logDialog.locator('.help-close').click();
      else await page.keyboard.press('Escape');
      await page.waitForFunction(()=>!document.querySelector('.workspace-changelog-dialog').open);
      assert.equal(await logButton.getAttribute('aria-expanded'),'false');
      assert(await logButton.evaluate(el=>document.activeElement===el), 'Closing must return focus to the log button');

    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await load();
    await page.locator('.workspace-help').click();
    await page.locator('dialog[open]').waitFor();
    await page.locator('#workspace-help .help-close').click();
    await page.waitForFunction(()=>!document.getElementById('workspace-help').open);
    await page.locator('.workspace-changelog').click();
    await page.locator('.workspace-changelog-dialog').waitFor({state:'visible'});
    await page.mouse.click(5,80);
    await page.waitForFunction(()=>!document.querySelector('.workspace-changelog-dialog').open);
    await page.locator('.welcome-create').click();
    await page.locator('.window:visible').waitFor();
    assert.deepEqual(errors, []);
    console.log('Editor passed: custom-only welcome and slow loading, retry, tabs, colors, mask/keyboard, matching icons, simultaneous sidebars, ' + sharedControls + ' brush controls, stable menus, PNG/PSD, right-aligned header at 1440/820/390px, help, responsive release log with scrolling / keyboard dismissal, new canvas, seven persistent themes, and animated selection in WebGL / canvas with visibility and reduced-motion controls. External requests were blocked.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
