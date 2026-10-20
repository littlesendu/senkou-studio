'use strict';
const fs = require('node:fs');
const path = require('node:path');
const schema = require('../source/assets/welkin/careers-data.js');
hexo.extend.generator.register('studio-careers', function () {
  if (!this.theme.config.studio?.enabled) return [];
  let careers = schema.empty();
  try { careers = schema.validate(JSON.parse(fs.readFileSync(path.join(this.source_dir, 'careers/data.json'), 'utf8').replace(/^\uFEFF/, ''))); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('招聘数据有误：' + error.message); }
  // Draft details are never rendered into the public HTML or a public data file.
  careers.jobs = careers.jobs.filter(job => job.status === 'published');
  return [{ path: 'careers/index.html', layout: ['careers'], data: { title: '加入我们', type: 'studio-careers', description: careers.intro, careers } }];
});
// Source data includes unpublished jobs; keep it out of the static output.
hexo.extend.filter.register('after_generate', function () {
  if (this.theme.config.studio?.enabled) this.route.remove('careers/data.json');
});
