'use strict';
const path = require('node:path');
const { spawn } = require('node:child_process');
const url = 'http://127.0.0.1:4000/';
async function probe() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return { ok: response.ok, text: await response.text() };
  } catch { return null; }
}
function run(args, cwd) {
  return spawn(process.execPath, args, { cwd, stdio: 'inherit', env: { ...process.env, WELKIN_STUDIO_ROOT: __dirname } });
}
async function main() {
  const existing = await probe();
  if (existing) {
    if (!existing.ok || !existing.text.includes('森口电竞')) throw new Error('Port 4000 is occupied by another application.');
    console.log(`Studio preview is already running. Open: ${url}`);
    return;
  }
  const prepare = run([path.join(__dirname, 'prepare-preview.cjs')], __dirname);
  await new Promise((resolve, reject) => {
    prepare.on('error', reject);
    prepare.on('exit', code => code === 0 ? resolve() : reject(new Error('Studio preparation failed.')));
  });
  const server = run([path.join(__dirname, 'preview-server.cjs')], __dirname);
  let exited = false;
  server.on('error', error => { exited = true; console.error(error.message); process.exitCode = 1; });
  server.on('exit', code => { exited = true; process.exitCode = code || 0; });
  for (let i = 0; i < 80 && !exited; i++) {
    const page = await probe();
    if (page && page.ok) {
      console.log(`\nStudio preview: ${url}\nKeep this window open. Press Ctrl+C to stop.\n`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!exited) { server.kill(); throw new Error('The preview did not start. Check the server output above.'); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });