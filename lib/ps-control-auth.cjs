'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
function validateControlToken(token) {
  if (typeof token !== 'string' || !/^[\x21-\x7e]{24,512}$/.test(token)) throw Error('PS_CONTROL_TOKEN 需为 24–512 个非空格 ASCII 字符；建议使用自动生成的随机令牌。');
  return token;
}
async function loadControlToken(folder, override) {
  if (override !== undefined) return validateControlToken(override);
  await fs.mkdir(folder, { recursive: true, mode: 0o700 });
  const file = path.join(folder, 'access-token');
  try { return validateControlToken((await fs.readFile(file, 'utf8')).trimEnd()); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  // Publish a fully written file atomically, so concurrent starts use one token.
  const temporary = path.join(folder, '.token-' + randomBytes(12).toString('hex'));
  try {
    await fs.writeFile(temporary, randomBytes(32).toString('hex') + '\n', { mode: 0o600, flag: 'wx' });
    try { await fs.link(temporary, file); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  } finally { await fs.unlink(temporary).catch(() => {}); }
  return validateControlToken((await fs.readFile(file, 'utf8')).trimEnd());
}
module.exports = { loadControlToken, validateControlToken };
