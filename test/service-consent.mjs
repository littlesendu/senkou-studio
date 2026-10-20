// Exercise the rendered contact entry and the reading boundary without submitting a questionnaire.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { JSDOM, VirtualConsole } from 'jsdom';
const require = createRequire(import.meta.url), ejs = require('ejs');
const template = await fs.readFile('layout/_partial/studio-contact.ejs', 'utf8');
const consent = await fs.readFile('layout/_partial/service-consent.ejs', 'utf8');
const script = await fs.readFile('source/assets/welkin/service-consent.js', 'utf8');
const contact = { label: '提交表', url: 'https://v.wjx.cn/vm/e7BIc0p.aspx' };
function render(config = contact) {
  return ejs.render(template, {
    theme: { studio: { contact: config } }, url_for: value => '/demo' + value,
    partial: (name, locals) => { assert.equal(name, '_partial/service-consent'); return ejs.render(consent, locals); }
  });
}
function setup(html = render(), nativeModal = true) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url: 'https://studio.example/demo/contact/', runScripts: 'outside-only', virtualConsole });
  const win = dom.window, doc = win.document;
  if (nativeModal) {
    win.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
    win.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new win.Event('close')); };
  }
  const dialog = doc.querySelector('#service-booking-dialog'), reading = dialog?.querySelector('.career-dialog-scroll');
  if (reading) Object.defineProperties(reading, { scrollHeight: { value: 1200, configurable: true }, clientHeight: { value: 400, configurable: true } });
  return { dom, win, doc, dialog, reading, errors };
}
const { dom, win, doc, dialog, reading, errors } = setup();
try {
  const entry = doc.querySelector('[data-service-booking]'), agree = doc.querySelector('#service-booking-agree');
  assert(entry.disabled, 'The HTML never provides an unguarded external link');
  assert(!entry.hasAttribute('href')); assert.equal(entry.getAttribute('aria-controls'), dialog.id);
  assert.equal(dialog.dataset.bookingUrl, contact.url); assert(!dialog.open); assert(agree.disabled);
  assert.deepEqual([...reading.querySelectorAll('h3')].map(h => h.textContent), ['《工作室服务须知》', '《免责声明》']);
  assert(reading.textContent.includes('不代表已下单或已付款'));
  assert(reading.textContent.includes('不排除或限制消费者依法享有的权利'));
  win.eval(script); assert(!entry.disabled);
  agree.dispatchEvent(new win.Event('click')); assert.equal(win.location.href, 'https://studio.example/demo/contact/');
  entry.click(); assert(dialog.open); assert(agree.disabled); assert.equal(reading.scrollTop, 0);
  assert.equal(doc.activeElement, reading); assert(doc.documentElement.classList.contains('career-modal-open'));
  agree.disabled = false; agree.dispatchEvent(new win.Event('click')); assert.equal(errors.length, 0, 'hasRead also guards an artificially enabled button'); agree.disabled = true;
  const scroll = top => { reading.scrollTop = top; reading.dispatchEvent(new win.Event('scroll')); };
  scroll(400); assert(agree.disabled); assert.equal(dialog.querySelector('.career-reading-progress span').style.width, '50%');
  scroll(797); assert(agree.disabled, 'Being near the end cannot bypass the 2px rounding allowance');
  scroll(800); assert(!agree.disabled); assert(dialog.classList.contains('has-read'));
  assert.equal(dialog.querySelector('.career-reading-progress span').style.width, '100%');
  assert(doc.querySelector('#service-reading-status').textContent.includes('已阅读至末尾'));
  assert.equal(errors.length, 0, 'Reaching the end must never trigger navigation by itself');
  scroll(0); assert(!agree.disabled, 'Readers may revisit earlier paragraphs');
  dialog.querySelector('[data-service-close]').click(); assert(!dialog.open); assert(agree.disabled);
  assert.equal(doc.activeElement, entry); assert(!doc.documentElement.classList.contains('career-modal-open'));
  entry.click(); assert(agree.disabled); assert.equal(reading.scrollTop, 0);
  scroll(800); win.dispatchEvent(new win.Event('pageshow')); assert(!dialog.open); assert(agree.disabled);
  Object.defineProperty(reading, 'scrollHeight', { value: 300 });
  entry.click(); assert(!agree.disabled, 'A document that fits is already at its end'); dialog.close();
  assert.equal(errors.length, 0);
} finally { dom.window.close(); }
for (const [html, nativeModal] of [[render(), false], [render({ ...contact, url: 'javascript:alert(1)' }), true]]) {
  const fallback = setup(html, nativeModal);
  try { fallback.win.eval(script); assert(fallback.doc.querySelector('[data-service-booking]').disabled); }
  finally { fallback.dom.window.close(); }
}
const noContact = setup(render({}));
try { noContact.win.eval(script); assert.equal(noContact.dialog, null); assert.equal(noContact.doc.querySelector('[data-service-booking]'), null); }
finally { noContact.dom.window.close(); }
const escaped = setup(render({ ...contact, label: '<img src=x onerror=alert(1)>' }));
try { assert.equal(escaped.doc.querySelectorAll('[data-service-booking] img').length, 0); assert(escaped.doc.querySelector('[data-service-booking]').textContent.includes('<img src=x')); }
finally { escaped.dom.window.close(); }
console.log('PASS service consent: terms, guarded booking entry, read-to-end boundary, reset, focus/scroll cleanup, no automatic navigation, legacy/invalid URL fallback');
