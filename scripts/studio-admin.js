'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Generate a relative URL page, including when this theme is hosted in /repo/.
hexo.extend.generator.register('studio-admin', function () {
  if (!this.theme.config.studio?.enabled) return [];
  return [{ path: 'admin/index.html', data: fs.readFileSync(path.join(__dirname, '../lib/admin.html'), 'utf8') }];
});
