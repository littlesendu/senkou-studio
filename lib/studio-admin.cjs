'use strict';
// The editor API exists only in the local Hexo server. Static builds contain no API.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { createReviewStore } = require('./studio-reviews.cjs');
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const siteKeys = ['title', 'subtitle', 'author', 'description', 'language', 'timezone', 'url', 'root'];
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const filePattern = /^studio-content\/source\/(?:_posts\/[^/]+\.md|(?:[a-zA-Z0-9_-]+\/)+index\.md)$/;
function safeRelative(value) {
  if (typeof value !== 'string' || !filePattern.test(value) || value.includes('..') || value.includes('\\') || /[\x00-\x1f<>:"|?*]/.test(value)) throw error('不支持这个文件路径。');
  return value;
}
async function inside(base, relative) {
  const target = path.resolve(base, relative);
  if (!target.startsWith(path.resolve(base) + path.sep)) throw error('文件超出网站目录。');
  // Refuse symlinks anywhere in an editable path.
  const segments = path.relative(base, target).split(path.sep);
  let current = path.resolve(base);
  for (const segment of segments) {
    current = path.join(current, segment);
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw error('不能编辑符号链接。'); }
    catch (err) { if (err.code !== 'ENOENT') throw err; }
  }
  return target;
}
async function optional(filename) { try { return await fs.readFile(filename, 'utf8'); } catch (err) { if (err.code === 'ENOENT') return ''; throw err; } }
async function write(filename, text) { await fs.mkdir(path.dirname(filename), { recursive: true }); await fs.writeFile(filename, text, 'utf8'); }
function validateSettings(input) {
  const site = Object.fromEntries(siteKeys.map(key => [key, String(input.site?.[key] ?? '').slice(0, key === 'description' ? 2000 : 300)]));
  const studio = JSON.parse(JSON.stringify(input.studio || {}));
  if (!site.title.trim() || !studio.name?.trim()) throw error('请填写网站和工作室名称。');
  let url; try { url = new URL(site.url); } catch { throw error('网站地址需要是完整的 http 或 https 地址。'); }
  if (!['http:', 'https:'].includes(url.protocol) || !/^\/(?:[a-zA-Z0-9_.~-]+\/)*$/.test(site.root)) throw error('网站地址或网站根路径不正确。');
  if (!/^\d{4}\.\d{2}$/.test(studio.idea_date) || !/^\d{4}\.\d{2}$/.test(studio.launch_date)) throw error('时间请使用 YYYY.MM 格式。');
  if (!Array.isArray(studio.members) || studio.members.length < 1 || studio.members.length > 12) throw error('请保留 1–12 位成员。');
  delete studio.rating;
  for (const member of studio.members) {
    delete member.rating;
    if (![member.name, member.handle, member.role, member.avatar].every(value => typeof value === 'string' && value.length < 500)) throw error('成员信息不完整。');
    if (!/^(?:\/(?!\/)|https:\/\/)/.test(member.avatar)) throw error('头像请使用本站 /assets/ 路径或 https 地址。');
  }
  if (studio.reviews?.repository && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(studio.reviews.repository)) throw error('评价仓库请使用 用户名/仓库名 格式。');
  const contact = studio.contact?.url;
  if (contact && !/^(https?:\/\/|mailto:|tel:)/.test(contact)) throw error('预约链接请使用 http、https、mailto 或 tel 地址。');
  return { site, studio };
}
function createStudioAdmin({ projectRoot, siteDir, hexo }) {
  const nonce = crypto.randomBytes(32).toString('hex');
  let busy = false;
  async function settings() {
    const configText = await optional(path.join(projectRoot, '_config.yml'));
    const siteText = await optional(path.join(siteDir, '_config.yml'));
    const config = yaml.load(configText) || {};
    const site = yaml.load(siteText) || {};
    return { site: Object.fromEntries(siteKeys.map(key => [key, site[key] || ''])), studio: config.studio, version: digest(configText + '\n' + siteText) };
  }
  async function files() {
    const result = [];
    async function walk(directory, relative = '') {
      for (const item of await fs.readdir(directory, { withFileTypes: true })) {
        if (item.isSymbolicLink()) continue;
        const relativePath = relative + item.name;
        if (item.isDirectory() && !item.name.startsWith('.') && item.name !== '_drafts') await walk(path.join(directory, item.name), relativePath + '/');
        else if (item.isFile() && filePattern.test('studio-content/source/' + relativePath)) {
          const content = await fs.readFile(path.join(directory, item.name), 'utf8');
          result.push({ path: 'studio-content/source/' + relativePath, content, sha: digest(content) });
        }
      }
    }
    await walk(path.join(siteDir, 'source'));
    return result;
  }
  async function refresh() {
    if (hexo) { await hexo.source.process(); await hexo._generate({ cache: false }); }
  }
  const reviews = createReviewStore({ projectRoot, siteDir, refresh });
  return async function adminApi(req, res, next) {
    if (!req.url.startsWith('/__studio_api/')) return next();
    const send = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.end(JSON.stringify(data)); };
    try {
      const host = String(req.headers.host || '');
      if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) throw error('管理接口仅供本机使用。', 403);
      if (req.headers.origin && req.headers.origin !== 'http://' + host) throw error('请求来源不匹配。', 403);
      if (req.method === 'GET' && req.url === '/__studio_api/status') return send(200, { mode: 'local', nonce });
      if (req.headers['x-studio-session'] !== nonce) throw error('请重新打开管理页面。', 403);
      if (req.method === 'GET' && req.url === '/__studio_api/state') return send(200, { settings: await settings(), files: await files() });
      if (req.method === 'GET' && req.url === '/__studio_api/reviews') return send(200, await reviews.state());
      if (req.method !== 'PUT' && !(req.method === 'POST' && req.url === '/__studio_api/reviews')) throw error('不支持的请求。', 405);
      if (busy) throw error('另一项保存正在进行，请稍后重试。', 409);
      if (!String(req.headers['content-type']).startsWith('application/json')) throw error('需要 JSON 请求。', 415);
      const chunks = []; let length = 0;
      for await (const chunk of req) { length += chunk.length; if (length > 2 * 1024 * 1024) throw error('单次内容不能超过 2 MB。', 413); chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (busy) throw error('另一项保存正在进行，请稍后重试。', 409);
      busy = true;
      try {
        if (req.url === '/__studio_api/reviews' && req.method === 'POST') {
          const studio = (await settings()).studio;
          return send(201, await reviews.submit(body, [studio.name, ...studio.members.map(member => member.name)]));
        }
        if (req.url === '/__studio_api/review' && req.method === 'PUT') return send(200, await reviews.moderate(body));
        if (req.url === '/__studio_api/file') {
          const relative = safeRelative(body.path);
          if (typeof body.content !== 'string') throw error('文章内容无效。');
          const live = await inside(siteDir, relative.replace(/^studio-content\//, ''));
          const current = await optional(live);
          if ((current ? digest(current) : null) !== (body.sha || null)) throw error('文件已被其他操作修改，请重新载入后保存。', 409);
          // Keep a recoverable previous version; it is never included in the website.
          if (current) await write(path.join(projectRoot, 'work', 'admin-backups', Date.now() + '-' + path.basename(live)), current);
          await write(await inside(projectRoot, relative), body.content);
          await write(live, body.content);
          await refresh();
          return send(200, { sha: digest(body.content), message: '已保存到本地并更新预览。' });
        }
        if (req.url === '/__studio_api/settings') {
          const before = await settings();
          if (before.version !== body.version) throw error('网站配置已经变化，请重新载入后保存。', 409);
          const input = validateSettings(body);
          const themeFile = path.join(projectRoot, '_config.yml');
          const configText = await fs.readFile(themeFile, 'utf8');
          const oldSite = await fs.readFile(path.join(siteDir, '_config.yml'), 'utf8');
          const config = yaml.load(configText) || {};
          const site = yaml.load(oldSite) || {};
          config.studio = input.studio;
          Object.assign(site, input.site);
          await write(path.join(projectRoot, 'work', 'admin-backups', Date.now() + '-theme.yml'), configText);
          await write(path.join(projectRoot, 'work', 'admin-backups', Date.now() + '-site.yml'), oldSite);
          const themeText = yaml.dump(config, { lineWidth: -1 });
          const siteText = yaml.dump(site, { lineWidth: -1 });
          await write(themeFile, themeText);
          await write(path.join(projectRoot, 'studio-content', 'site.yml'), siteText);
          await write(path.join(siteDir, 'themes', 'welkin', '_config.yml'), themeText);
          await write(path.join(siteDir, '_config.yml'), siteText);
          if (hexo) { Object.assign(hexo.config, input.site); hexo.theme.config.studio = input.studio; }
          await refresh();
          return send(200, { version: (await settings()).version, message: '网站信息已保存，刷新首页即可查看。' });
        }
        throw error('找不到这个操作。', 404);
      } finally { busy = false; }
    } catch (err) { send(err.status || 400, { error: err.message }); }
  };
}
module.exports = { createStudioAdmin, validateSettings, safeRelative };
