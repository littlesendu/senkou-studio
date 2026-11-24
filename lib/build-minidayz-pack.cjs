'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Preserve the exported PNG bytes and names. Only small sprites referenced by
// the game project go in the pack. Larger textures keep their own cache entries.
module.exports = function buildMiniDayzPack(directory) {
  const project = fs.readFileSync(path.join(directory, 'data.js'), 'utf8');
  const { gzipSync } = require('node:zlib');
  fs.writeFileSync(path.join(directory, 'project-v1.bin'), gzipSync(project, { level: 9 }));
  const names = new Set(Array.from(project.matchAll(/"(images\/[^"\\]+\.png)"/gi), match => match[1]));
  const entries = [], buffers = [];
  for (const name of names) {
    const file = path.join(directory, name);
    if (!fs.existsSync(file) || fs.statSync(file).size > 16384) continue;
    const bytes = fs.readFileSync(file);
    entries.push([name, bytes.length]);
    buffers.push(bytes);
  }
  const index = Buffer.from(JSON.stringify(entries));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(index.length);
  fs.writeFileSync(path.join(directory, 'sprites-v1.bin'), Buffer.concat([header, index, ...buffers]));
};
