'use strict';
// Build the complete studio into work/deploy-site/public, keeping previews intact.
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const yaml = require('js-yaml');
const { openapi } = require('./lib/ps-control-schema.cjs');
async function main() {
  const site = path.join(__dirname, 'work', 'deploy-site');
  const run = (args, cwd, env = process.env) => {
    const result = spawnSync(process.execPath, args, { cwd, env, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(result.error?.message || 'Website build failed.');
  };
  run([path.join(__dirname, 'prepare-preview.cjs')], __dirname, { ...process.env, SENKOU_SITE_DIR: site });
  // Copy canonical content on every deployment; never retain stale seeded copies.
  await fs.cp(path.join(__dirname, 'studio-content', 'source'), path.join(site, 'source'), { recursive: true });
  const config = yaml.load(await fs.readFile(path.join(__dirname, 'studio-content', 'site.yml'), 'utf8'));
  // Local preview config uses loopback; production builds need the public origin.
  const url = new URL(process.env.PAGES_BASE_URL || 'https://senkou.xyz');
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('PAGES_BASE_URL must use https or http.');
  config.url = url.origin + url.pathname.replace(/\/$/, '');
  config.root = url.pathname.replace(/\/?$/, '/');
  if (process.env.GITHUB_REPOSITORY) {
    const themeFile = path.join(site, 'themes', 'welkin', '_config.yml');
    const themeConfig = yaml.load(await fs.readFile(themeFile, 'utf8'));
    themeConfig.studio.reviews ||= {};
    themeConfig.studio.reviews.repository ||= process.env.GITHUB_REPOSITORY;
    await fs.writeFile(themeFile, yaml.dump(themeConfig, { lineWidth: -1 }));
  }
  await fs.writeFile(path.join(site, '_config.yml'), yaml.dump(config, { lineWidth: -1 }));
  const cli = path.join(__dirname, 'node_modules', 'hexo', 'bin', 'hexo');
  run([cli, 'clean'], site);
  run([cli, 'generate'], site);
  // Publish real static JSON so file-extension routing never hides the schema.
  const schema = JSON.stringify(openapi(new URL(config.url).origin), null, 2) + '\n';
  for (const relative of ['ps/api/openapi.json', 'api/ps-control/openapi.json']) {
    const target = path.join(site, 'public', relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, schema);
  }
  await fs.writeFile(path.join(site, 'public', '.nojekyll'), '');
  console.log('Deployable website: ' + path.join(site, 'public'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
