'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const site = path.resolve(process.env.SENKOU_SITE_DIR || path.join(__dirname, 'work', 'preview-site')); 
  const theme = path.join(site, 'themes', 'welkin');
  const backup = path.join(__dirname, 'work', 'preview-backups', new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(theme, { recursive: true });
  for (const entry of ['layout', 'lib', 'scripts', 'source', '_config.yml']) {
    await fs.cp(path.join(__dirname, entry), path.join(theme, entry), { recursive: true });
  }
  const plugins = ['hexo-server', 'hexo-renderer-ejs', 'hexo-renderer-marked', 'hexo-generator-index', 'hexo-generator-archive', 'hexo-generator-category', 'hexo-generator-tag'];
  await fs.writeFile(path.join(site, 'package.json'), JSON.stringify({
    name: 'senkou-studio-preview', version: '1.0.0', private: true,
    hexo: { version: require('hexo/package.json').version },
    dependencies: Object.fromEntries(plugins.map(name => [name, '*']))
  }, null, 2));
  async function create(file, text) {
    const target = path.join(site, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    try { await fs.writeFile(target, text, { encoding: 'utf8', flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const siteConfig = path.join(site, '_config.yml');
  try {
    const config = await fs.readFile(siteConfig, 'utf8');
    if (/^title: Welkin 预览博客\s*$/m.test(config)) {
      await fs.mkdir(backup, { recursive: true });
      await fs.copyFile(siteConfig, path.join(backup, '_config.yml'));
      await fs.writeFile(siteConfig, await fs.readFile(path.join(__dirname, 'studio-content', 'site.yml')));
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await create('_config.yml', await fs.readFile(path.join(__dirname, 'studio-content', 'site.yml'), 'utf8'));
  const oldDemos = [
    ['welcome.md', '你好，欢迎来到我的博客'],
    ['writing-notes.md', '用 Markdown 写下第一篇文章'],
    ['quiet-afternoon.md', '一个安静的午后']
  ];
  for (const [file, title] of oldDemos) {
    const source = path.join(site, 'source', '_posts', file);
    try {
      const content = await fs.readFile(source, 'utf8');
      if (content.includes(`title: ${title}`)) {
        await fs.mkdir(backup, { recursive: true });
        await fs.rename(source, path.join(backup, file));
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async function seed(directory, relative = 'source') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      const target = path.join(relative, entry.name);
      if (entry.isDirectory()) await seed(source, target);
      else if (entry.isFile()) await create(target, await fs.readFile(source, 'utf8'));
    }
  }
  await seed(path.join(__dirname, 'studio-content', 'source'));
  const sharp = require('sharp');
  const images = path.join(site, 'source', 'images');
  await fs.mkdir(images, { recursive: true });
  for (const [index, [name, label, color]] of [
    ['studio-welcome', 'HELLO, SENKOU.', '#254a36'],
    ['studio-services', 'PLAY YOUR WAY.', '#596447'],
    ['studio-squad', 'OUR SQUAD / 03', '#335451']
  ].entries()) {
    const target = path.join(images, `${name}.webp`);
    try { await fs.access(target); }
    catch {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="750"><rect width="1000" height="750" fill="${color}"/><g fill="none" stroke="#d0ef7c" opacity=".24">${Array.from({ length: 14 }, (_, i) => `<circle cx="760" cy="180" r="${80 + i * 25}"/>`).join('')}<path d="M60 80h880v590H60Z"/><path d="M60 135h880M115 80v590"/></g><path d="M80 590 310 380 520 450 760 180" fill="none" stroke="#d0ef7c" stroke-dasharray="7 10"/><circle cx="760" cy="180" r="7" fill="#d0ef7c"/><g fill="#e8efcf" font-family="sans-serif"><text x="145" y="490" font-size="18" letter-spacing="6">SENKOU ESPORTS / FIELD NOTES</text><text x="140" y="570" font-size="51" letter-spacing="3">${label}</text><text x="145" y="625" font-size="15" letter-spacing="5">VOL. 00${index + 1} / GOOD COMPANY, GOOD GAME.</text></g></svg>`;
      await sharp(Buffer.from(svg)).webp({ quality: 90 }).toFile(target);
    }
  }
  console.log(`Studio preview ready: ${site}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });