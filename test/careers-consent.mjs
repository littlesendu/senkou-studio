// Test the real rendered application dialog and its reading gate without an external form submission.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
const require = createRequire(import.meta.url);
const ejs = require('ejs'), schema = require('../source/assets/welkin/careers-data.js');
const data = schema.validate(JSON.parse(await fs.readFile('studio-content/source/careers/data.json', 'utf8')));
const template = await fs.readFile('layout/careers.ejs', 'utf8');
const script = await fs.readFile('source/assets/welkin/careers.js', 'utf8');
const html = ejs.render(template, { page: { careers: data }, theme: { studio: {} }, url_for: value => value });
const dom = new JSDOM(html, { url: 'https://studio.example/careers/', runScripts: 'outside-only' });
try {
  const win = dom.window, doc = win.document;
  // Match the browser native dialog API; geometry is controlled to exercise boundary conditions.
  Object.assign(win, { FormData: win.FormData });
  win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  win.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new win.Event('close')); };
  const dialog = doc.querySelector('dialog'), reading = dialog.querySelector('.career-dialog-scroll'), agree = doc.querySelector('#career-application-agree');
  Object.defineProperties(reading, { scrollHeight: { value: 1200, configurable: true }, clientHeight: { value: 400, configurable: true } });
  const buttons = [...doc.querySelectorAll('[data-apply-title]')];
  assert(buttons.every(button => button.disabled));
  win.eval(script);
  assert(buttons.every(button => !button.disabled));
  buttons[0].click(); assert(dialog.open); assert(agree.disabled); assert.equal(reading.scrollTop, 0);
  assert(doc.documentElement.classList.contains('career-modal-open'));
  assert.equal(doc.activeElement, reading);
  const scroll = top => { reading.scrollTop = top; reading.dispatchEvent(new win.Event('scroll')); };
  scroll(400); assert(agree.disabled, 'Reading the middle cannot unlock consent');
  scroll(797); assert(agree.disabled, 'A reader must reach the end, allowing only 2px rounding');
  scroll(800); assert(!agree.disabled); assert(dialog.classList.contains('has-read'));
  assert(doc.querySelector('#career-reading-status').textContent.includes('已阅读至末尾'));
  scroll(0); assert(!agree.disabled, 'Rereading does not discard completed reading in this opening');
  dialog.querySelector('[data-application-close]').click();
  assert(!dialog.open); assert(agree.disabled); assert.equal(doc.activeElement, buttons[0]);
  assert(!doc.documentElement.classList.contains('career-modal-open'));
  buttons[1].dataset.applyTitle = '<img src=x onerror=alert(1)>';
  buttons[1].click(); assert(agree.disabled); assert.equal(reading.scrollTop, 0);
  assert.equal(dialog.querySelector('[data-application-title]').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(dialog.querySelector('[data-application-title] img'), null);
  scroll(800); assert(!agree.disabled);
  win.dispatchEvent(new win.Event('pageshow')); assert(!dialog.open); assert(agree.disabled);
  // An entire document that fits is already at its end; do not create an impossible scrollbar gate.
  Object.defineProperty(reading, 'scrollHeight', { value: 300 });
  buttons[2].click(); assert(!agree.disabled); dialog.close();
  assert.equal(dialog.dataset.applicationUrl, 'https://v.wjx.cn/vm/PpJwP9f.aspx');
} finally { dom.window.close(); }
// A browser without native modal support never gets an unguarded form link.
const oldBrowser = new JSDOM(html, { url: 'https://studio.example/careers/', runScripts: 'outside-only' });
try {
  oldBrowser.window.eval(script);
  assert([...oldBrowser.window.document.querySelectorAll('[data-apply-title]')].every(button => button.disabled));
} finally { oldBrowser.window.close(); }
// Administrator text renders as plain text, never executable HTML.
const hostile = structuredClone(data); hostile.application.dialogTitle = '可编辑的报名说明'; hostile.application.guidelinesTitle = '组队约定'; hostile.application.highlight = '<script>alert(1)</script>'; hostile.application.destination = '继续前往意向表'; hostile.application.guidelines = '<img src=x onerror=alert(1)>';
const escaped = new JSDOM(ejs.render(template, { page: { careers: hostile }, theme: { studio: {} }, url_for: value => value }));
assert.equal(escaped.window.document.querySelectorAll('.career-dialog-scroll img, .career-dialog-scroll script').length, 0);
assert.equal(escaped.window.document.querySelector('#career-dialog-title').textContent, '可编辑的报名说明');
assert.equal(escaped.window.document.querySelector('#career-guidelines-heading').textContent, '组队约定');
assert.equal(escaped.window.document.querySelector('.career-dialog-highlight').textContent, '<script>alert(1)</script>');
assert.equal(escaped.window.document.querySelector('.career-dialog-destination').textContent, '继续前往意向表');
assert(escaped.window.document.querySelector('.career-dialog-scroll').textContent.includes('<img src=x'));
escaped.window.close();
console.log('PASS application consent: disabled before reading, end boundary, reset per opening, focus/scroll cleanup, legacy fallback, escaped editable content');
