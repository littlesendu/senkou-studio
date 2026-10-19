'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
function validateReview(value, targets) {
  const target = typeof value.target === 'string' ? value.target.trim() : '';
  const content = typeof value.content === 'string' ? value.content.trim() : '';
  if (!targets.includes(target)) throw failure('请选择一位小队成员或工作室。');
  if (!Number.isInteger(value.rating) || value.rating < 1 || value.rating > 5) throw failure('星级应为 1–5 星。');
  if (content.length < 5 || content.length > 300) throw failure('评价内容需要 5–300 字。');
  return { target, rating: value.rating, content };
}
function createReviewStore({ projectRoot, siteDir, refresh }) {
  const inboxFile = path.join(projectRoot, 'work', 'review-inbox.json');
  const liveFile = path.join(siteDir, 'source', 'reviews', 'data.json');
  const sourceFile = path.join(projectRoot, 'studio-content', 'source', 'reviews', 'data.json');
  let lastSubmit = 0;
  async function read(file, fallback) { try { return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; } }
  async function write(file, value) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8'); }
  async function state() { return { pending: (await read(inboxFile, [])).filter(item => item.status === 'pending'), approved: (await read(liveFile, { reviews: [] })).reviews }; }
  async function submit(value, targets) {
    const review = validateReview(value, targets);
    if (Date.now() - lastSubmit < 5000) throw failure('评价已收到，请稍后再投递。', 429);
    const inbox = await read(inboxFile, []);
    if (inbox.filter(item => item.status === 'pending').length >= 200) throw failure('待审核评价较多，请稍后再试。', 429);
    inbox.push({ ...review, id: crypto.randomUUID(), createdAt: new Date().toISOString(), status: 'pending' });
    await write(inboxFile, inbox.slice(-1000)); lastSubmit = Date.now();
    return { message: '已收到评价，审核通过后展示。' };
  }
  async function moderate(value) {
    if (!['approve', 'reject', 'remove'].includes(value.action)) throw failure('不支持这个审核操作。');
    const inbox = await read(inboxFile, []), data = await read(liveFile, { reviews: [] });
    if (value.action === 'remove') {
      if (!data.reviews.some(item => item.id === value.id)) throw failure('这条评价已经移除，请重新载入。', 409);
      data.reviews = data.reviews.filter(item => item.id !== value.id);
    } else {
      const item = inbox.find(item => item.id === value.id && item.status === 'pending');
      if (!item) throw failure('这条评价已经处理，请重新载入。', 409);
      if (value.action === 'approve') { const { status, ...publicReview } = item; data.reviews.push(publicReview); data.reviews = data.reviews.slice(-100); }
      item.status = value.action === 'approve' ? 'approved' : 'rejected';
    }
    if (value.action !== 'reject') {
      await fs.mkdir(path.join(projectRoot, 'work', 'admin-backups'), { recursive: true });
      await write(path.join(projectRoot, 'work', 'admin-backups', Date.now() + '-reviews.json'), await read(liveFile, { reviews: [] }));
      await write(sourceFile, data); await write(liveFile, data); await refresh();
    }
    await write(inboxFile, inbox);
    return { message: value.action === 'approve' ? '已通过审核，评价已展示。' : value.action === 'remove' ? '评价已从网站撤下。' : '评价已拒绝，不会公开展示。', ...await state() };
  }
  return { state, submit, moderate };
}
module.exports = { validateReview, createReviewStore };
