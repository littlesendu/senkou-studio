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
      bytes = Buffer.from(bytes.toString().replace('OnlinePS.start(senkouApp)', 'window.debugApp=senkouApp;OnlinePS.start(senkouApp)'));
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
      await page.waitForFunction(() => document.body.dataset.editorVersion);
    }
    async function open() {
      await page.locator('#local-open-input').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: fixture });
      await page.waitForFunction(() => debugApp.xK()?.r === 320);
    }
    async function menu(top, label, hover = false) {
      await page.keyboard.press('Escape');
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

    await load();
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

    const tools = await page.evaluate(() => debugApp.Hs.tB.filter(tool => /brush|eraser|clone|blur|sharpen|smudge|dodge|burn|sponge|pencil/.test(tool.Tg)).map(tool => ({ id: tool.DK, asset: tool.Tg })));
    let sharedControls = 0;
    for (const tool of tools) {
      await page.keyboard.press('Escape');
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
    await page.evaluate(() => debugApp.Hs.tB.find(tool => tool.Tg === 'tools/eraser').YG(null, true));
    await page.locator('.confbar .brushbutton button').click();
    const size = page.locator('.floatcont:visible input[type=text]').first();
    await size.fill('37');
    await size.press('Tab');
    await page.keyboard.press('Escape');
    await page.locator('.confbar .brushbutton button').click();
    assert.match(await page.locator('.floatcont:visible input[type=text]').first().inputValue(), /37/);
    await page.keyboard.press('Escape');

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
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await load();
    await page.locator('.workspace-help').click();
    await page.locator('dialog[open]').waitFor();
    await page.locator('.help-close').click();
    await page.locator('.welcome-create').click();
    await page.locator('.window:visible').waitFor();
    assert.deepEqual(errors, []);
    console.log('Editor passed: simultaneous sidebars, ' + sharedControls + ' brush controls, stable menus, PNG/PSD, right-aligned header at 1440/820/390px, help and new canvas. External requests were blocked.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
