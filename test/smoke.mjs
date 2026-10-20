// Standalone theme smoke test. All fixtures are synthetic and created under work/.
import { mkdir, mkdtemp, writeFile, readFile, cp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { checkTheme, readPostIndex } from './check-theme.mjs';

const require = createRequire(import.meta.url);
const themeRoot = fileURLToPath(new URL('../', import.meta.url));
const temporary = path.join(themeRoot, 'work', 'tmp');
await mkdir(temporary, { recursive: true });
const run = await mkdtemp(path.join(temporary, 'smoke-'));
const cli = path.join(path.dirname(require.resolve('hexo/package.json')), 'bin', 'hexo');
const plugins = ['hexo-generator-archive', 'hexo-generator-category', 'hexo-generator-index', 'hexo-generator-tag', 'hexo-renderer-ejs', 'hexo-renderer-marked'];
const pluginDependencies = Object.fromEntries(plugins.map(name => [name, '*']));
const reports = [];

for (const [label, siteRoot, count] of [['empty', '/', 0], ['root', '/', 3], ['subdirectory', '/demo/', 3]]) {
  const site = path.join(run, label);
  await mkdir(path.join(site, 'source', '_posts'), { recursive: true });
  await mkdir(path.join(site, 'source', '_drafts'), { recursive: true });
  await mkdir(path.join(site, 'themes', 'welkin'), { recursive: true });
  for (const item of ['layout', 'lib', 'scripts', 'source', '_config.yml']) {
    await cp(path.join(themeRoot, item), path.join(site, 'themes', 'welkin', item), { recursive: true });
  }
  await writeFile(path.join(site, 'package.json'), JSON.stringify({ name: 'welkin-smoke-fixture', version: '1.0.0', private: true, hexo: { version: '8.1.2' }, dependencies: pluginDependencies }));
  const config = {
    title: 'Example Site', author: 'Example Author', description: 'Synthetic theme verification.', language: 'zh-CN', timezone: 'UTC',
    url: 'https://example.com' + siteRoot, root: siteRoot,
    theme: 'welkin', source_dir: 'source', public_dir: 'public',
    permalink: ':year/:month/:day/:title/', future: true,
    archive_dir: 'archives', category_dir: 'categories', tag_dir: 'tags', pagination_dir: 'page',
    per_page: 1, index_generator: { path: '', per_page: 1, order_by: '-date' },
    archive_generator: { enabled: true, per_page: 1, yearly: true, monthly: true },
    category_generator: { per_page: 1 }, tag_generator: { per_page: 1 },
  };
  await writeFile(path.join(site, '_config.yml'), require('js-yaml').dump(config));
  for (const [directory, type] of [['categories', 'categories'], ['tags', 'tags'], ['contact', 'studio-contact']]) {
    await mkdir(path.join(site, 'source', directory), { recursive: true });
    await writeFile(path.join(site, 'source', directory, 'index.md'), `---\ntitle: ${type}\ntype: ${type}\nlayout: page\n---\n`);
  }
  if (count) {
    await mkdir(path.join(site, 'source', 'images'), { recursive: true });
    await writeFile(path.join(site, 'source', 'images', 'cover.png'), await sharp({ create: { width: 64, height: 48, channels: 3, background: '#bda98b' } }).png().toBuffer());
  }
  for (let number = 1; number <= count; number++) {
    await writeFile(path.join(site, 'source', '_posts', 'example-' + number + '.md'), `---\ntitle: Example ${number}\ndate: 2026-01-0${number} 12:00:00\ncategories: [Notes]\ntags: [Example]\n${number === 1 ? 'cover: /images/cover.png\n' : ''}---\n## Example heading\n\nSynthetic content for theme verification.\n\n\`\`\`js\nconsole.log('example');\n\`\`\`\n`);
  }
  await writeFile(path.join(site, 'source', '_drafts', 'draft.md'), '---\ntitle: Private Draft Fixture\n---\nThis draft must not be published.\n');
  await mkdir(path.join(site, 'source', 'reviews'), { recursive: true });
  await writeFile(path.join(site, 'source', 'reviews', 'data.json'), JSON.stringify({ reviews: count ? [
    { target: '森口电竞sendu', rating: 5, content: '评分功能测试数据一' },
    { target: '森口电竞sendu', rating: 4, content: '评分功能测试数据二' },
    { target: '森口电竞椰伦苏', rating: 1, content: '成员评分独立计算' },
    { target: '森口电竞', rating: 1, content: '整体评价不改变个人评分' },
    { target: '森口电竞sendu', rating: 1, content: '待审核不计入公开评分', status: 'pending' }
  ] : [] }));
  if (count) {
    const themeFile = path.join(site, 'themes', 'welkin', '_config.yml');
    const themeConfig = require('js-yaml').load(await readFile(themeFile, 'utf8'));
    themeConfig.studio.service_consent = { title: '后台编辑的预约须知', subtitle: '提交预约前，请确认', highlight: '自定义提示 <img src=x onerror=alert(1)>', guidelinesTitle: '预约服务约定', guidelines: '01 / 预约确认\n第一段内容。\n\n第二段内容。', disclaimerTitle: '风险与责任说明', disclaimer: '阅读并理解后自愿预约。', destination: '同意后前往预约表。' };
    await writeFile(themeFile, require('js-yaml').dump(themeConfig));
    const careers = JSON.parse(await readFile(path.join(themeRoot, 'studio-content/source/careers/data.json'), 'utf8'));
    careers.application.dialogTitle = '后台编辑的报名须知';
    careers.application.highlight = '请先了解报名约定。';
    careers.jobs.push({ ...careers.jobs[0], id: 'draft-fixture', title: 'UNPUBLISHED CAREERS FIXTURE', status: 'draft' });
    await mkdir(path.join(site, 'source', 'careers'), { recursive: true });
    await writeFile(path.join(site, 'source', 'careers', 'data.json'), JSON.stringify(careers));
  }
  const result = spawnSync(process.execPath, [cli, 'generate', '--config', path.join(site, '_config.yml')], { cwd: site, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.message || result.stdout + result.stderr);
  assert(!/Plugin load failed|Script load failed/.test(result.stdout + result.stderr), result.stdout + result.stderr);
  const output = path.join(site, 'public');
  const posts = await readPostIndex(output);
  assert.equal(posts.length, count);
  assert(posts.every(post => /^Example \d$/.test(post.title)), 'Draft or unexpected content entered the index.');
  const home = new JSDOM(await readFile(path.join(output, 'index.html'), 'utf8'));
  const document = home.window.document;
  const memberRatings = [...document.querySelectorAll('.crew-portrait [data-member-rating]')];
  assert.equal(memberRatings.length, 3);
  assert.equal(document.querySelectorAll('.wordmark .rating-star, .studio-strip .rating-star, .contact-bottom .rating-star').length, 0);
  assert.equal(memberRatings[0].dataset.rating, count ? '4.5' : '5');
  assert.equal(memberRatings[0].dataset.reviewCount, count ? '2' : '0');
  assert.equal(memberRatings[1].dataset.rating, count ? '1' : '5');
  assert.equal(memberRatings[2].dataset.rating, '5');
  assert.equal(memberRatings[2].dataset.reviewCount, '0');
  if (count) assert.equal(memberRatings[0].querySelector('.rating-star:last-child').style.getPropertyValue('--star-fill'), '50%');
  const publicBottles = [...document.querySelectorAll('.review-bottle')];
  assert.equal(publicBottles.length, count ? 4 : 0, 'Each approved review should render once, without inert moving duplicates');
  for (const bottle of publicBottles) {
    const button = bottle.querySelector('button[aria-controls]');
    assert(button, 'Each review must have an accessible disclosure control');
    const details = document.getElementById(button.getAttribute('aria-controls'));
    assert(details && bottle.contains(details), 'Disclosure controls must point to their own review content');
    assert.equal(details.querySelector('p').textContent.trim().length > 0, true, 'Review content must remain available in static HTML');
  }
  const joinLink = document.querySelector('.hero-actions .studio-text-link');
  assert.equal(joinLink.textContent.trim(), '加入我们 ↗'); assert.equal(joinLink.getAttribute('href'), siteRoot + 'careers/');
  const editorEntry = document.querySelector('.footer-editor');
  assert.equal(editorEntry.getAttribute('href'), siteRoot + 'ps/');
  assert.equal(editorEntry.getAttribute('target'), '_blank', 'Open directly, without the iframe login bridge');
  assert(editorEntry.relList.contains('noopener'));
  const editorSource = await readFile(path.join(themeRoot, 'source/ps/index.html'));
  assert((await readFile(path.join(output, 'ps/index.html'))).equals(editorSource), 'Hexo must copy the editor intact without the blog layout');
  const editor = new JSDOM(editorSource.toString());
  for (const resource of editor.window.document.querySelectorAll('script[src],link[href]')) {
    const reference = resource.getAttribute('src') || resource.getAttribute('href');
    const relative = new URL(reference, 'https://example.com' + siteRoot + 'ps/').pathname.slice(siteRoot.length);
    const built = await readFile(path.join(output, relative));
    const original = await readFile(path.join(themeRoot, 'source', relative));
    // Hexo's plain renderer normalizes CRLF in text assets; binary assets stay byte-identical.
    if (/\.(css|js)$/.test(relative)) assert.equal(built.toString().replace(/\r\n/g, '\n'), original.toString().replace(/\r\n/g, '\n'));
    else assert(built.equals(original), 'Editor asset changed during generation: ' + relative);
  }
  editor.window.close();
  home.window.close();
  const careersHtml = await readFile(path.join(output, 'careers/index.html'), 'utf8');
  const careersDom = new JSDOM(careersHtml);
  assert.equal(careersDom.window.document.querySelectorAll('[data-career]').length, count ? 3 : 0);
  for (const button of careersDom.window.document.querySelectorAll('.career-apply')) {
    assert.equal(button.tagName, 'BUTTON');
    assert(button.disabled, 'Apply stays disabled until the consent handler is ready');
    assert(!button.hasAttribute('href'), 'No direct form link bypasses the reading step');
    assert.equal(button.getAttribute('aria-controls'), 'career-application-dialog');
  }
  const consent = careersDom.window.document.querySelector('#career-application-dialog');
  assert(consent && !consent.open);
  assert.equal(consent.dataset.applicationUrl, count ? 'https://v.wjx.cn/vm/PpJwP9f.aspx' : 'https://v.wjx.cn/vm/e7BIc0p.aspx');
  assert(consent.querySelector('#career-application-agree').disabled);
  if (count) { assert.equal(consent.querySelector('#career-dialog-title').textContent, '后台编辑的报名须知'); assert.equal(consent.querySelector('.career-dialog-highlight').textContent, '请先了解报名约定。'); }
  assert.equal(consent.querySelectorAll('.career-dialog-scroll section').length, 2);
  assert(consent.textContent.includes(count ? '请先了解报名约定。' : '不承诺固定工资或收入')); 
  assert(!careersHtml.includes('UNPUBLISHED CAREERS FIXTURE'), 'Draft jobs must not enter public HTML');
  assert(!careersDom.window.document.querySelector('script[src*="reading.js"]'));
  assert(careersDom.window.document.querySelector('link[href="' + siteRoot + 'assets/welkin/careers.css?v=20261020-service-consent"]'));
  assert.equal(careersDom.window.document.querySelector('.careers-back').getAttribute('href'), siteRoot);
  assert.equal(careersDom.window.document.querySelector('.careers-empty').hasAttribute('hidden'), Boolean(count));
  assert(careersDom.window.document.querySelector('link[href="' + siteRoot + 'assets/welkin/consent.css?v=20261020-editable-consent"]'));
  careersDom.window.close();
  const contactDom = new JSDOM(await readFile(path.join(output, 'contact/index.html'), 'utf8'));
  const contactDoc = contactDom.window.document;
  assert(contactDoc.querySelector('[data-service-booking]').disabled);
  assert(!contactDoc.querySelector('[data-service-booking]').hasAttribute('href'));
  assert.equal(contactDoc.querySelector('#service-booking-dialog').dataset.bookingUrl, 'https://v.wjx.cn/vm/e7BIc0p.aspx');
  assert(contactDoc.querySelector('#service-booking-agree').disabled);
  assert.equal(contactDoc.querySelector('#service-dialog-title').textContent, count ? '后台编辑的预约须知' : '工作室服务须知与免责声明');
  if (count) {
    assert.equal(contactDoc.querySelector('#service-guidelines-heading').textContent, '预约服务约定');
    assert.equal(contactDoc.querySelector('#service-disclaimer-heading').textContent, '风险与责任说明');
    assert.equal(contactDoc.querySelectorAll('[aria-labelledby="service-guidelines-heading"] p').length, 2);
    assert.equal(contactDoc.querySelector('.career-dialog-highlight img'), null);
    assert(contactDoc.querySelector('.career-dialog-highlight').textContent.includes('<img src=x'));
    assert.equal(contactDoc.querySelector('.career-dialog-destination').textContent, '同意后前往预约表。');
  }
  assert(contactDoc.querySelector('link[href="' + siteRoot + 'assets/welkin/consent.css?v=20261020-editable-consent"]'));
  assert(contactDoc.querySelector('script[src="' + siteRoot + 'assets/welkin/service-consent.js?v=20261020-service-consent"]'));
  contactDom.window.close();
  await assert.rejects(readFile(path.join(output, 'careers/data.json')), { code: 'ENOENT' }, 'Source data with drafts must not be copied to the public output');
  const checked = await checkTheme({ output, config, requireGlassCovers: true });
  if (count) {
    const articlePath = posts[0].url.slice(siteRoot.length);
    const html = await readFile(path.join(output, articlePath, 'index.html'), 'utf8');
    assert(html.includes('Synthetic content for theme verification.'), 'Missing static article content.');
  }
  reports.push({ fixture: label, ...checked.summary });
}
console.log(JSON.stringify({ smokeTests: reports }, null, 2));
