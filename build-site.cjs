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
  // A static file also shadows the function route, so the 3.0 variant needs its own path.
  const origin = new URL(config.url).origin;
  const schemas = [
    ['ps/api/openapi.json', openapi(origin)],
    ['ps/api/openapi-3.0.json', openapi(origin, { version: '3.0' })],
    ['api/ps-control/openapi.json', openapi(origin)],
    ['api/ps-control/openapi-3.0.json', openapi(origin, { version: '3.0' })]
  ];
  for (const [relative, document] of schemas) {
    const target = path.join(site, 'public', relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify(document, null, 2) + '\n');
  }
  await fs.writeFile(path.join(site, 'public', '.nojekyll'), '');
  console.log('Deployable website: ' + path.join(site, 'public'));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
