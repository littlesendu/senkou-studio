'use strict';
const path = require('node:path');
const Hexo = require('hexo');
const { createStudioAdmin } = require('./lib/studio-admin.cjs');
const { createPSAIMiddleware } = require('./lib/ps-ai-node.cjs');
async function main() {
  const hexo = new Hexo(path.join(__dirname, 'work', 'preview-site'), {});
  await hexo.init();
  hexo.extend.filter.register('server_middleware', app => {
    app.use(createPSAIMiddleware());
    app.use(createStudioAdmin({ projectRoot: __dirname, siteDir: hexo.base_dir, hexo }));
  }, 1);
  await hexo.call('server', { ip: '127.0.0.1', port: 4000 });
}
main().catch(error => { console.error(error); process.exitCode = 1; });
