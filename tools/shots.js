// shots.js — capture the 4 staged screenshots in headless Chrome
// (swiftshader WebGL2). The game stages each scene from ?shot= and sets
// window.__shotReady when frozen. Adapted from the proven pw-shots pattern.
// Usage: node tools/shots.js <port> <outdir>
//   node tools/serve.mjs <port> &  (serves repo/game)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [port, outDir] = process.argv.slice(2);
if (!port || !outDir) { console.error('usage: node tools/shots.js <port> <outdir>'); process.exit(2); }
mkdirSync(outDir, { recursive: true });

const SHOTS = [
  ['1-select.jpg', '?shot=select'],
  ['2-fight.jpg', '?shot=fight'],
  ['3-ult.jpg', '?shot=ult'],
  ['4-win.jpg', '?shot=win'],
];
const SHELL = '/home/hatch/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell';

let failures = 0;
const browser = await chromium.launch({
  executablePath: SHELL,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
for (const [file, query] of SHOTS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.goto(`http://localhost:${port}/index.html${query}`, { waitUntil: 'load' });
  let ready = false;
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    ready = await page.evaluate(() => window.__shotReady === true).catch(() => false);
    if (ready) break;
    await page.waitForTimeout(1000);
  }
  if (!ready) errors.push('timeout waiting for __shotReady');
  await page.waitForTimeout(400); // let the frozen frame settle
  await page.screenshot({ path: join(outDir, file), type: 'jpeg', quality: 88, timeout: 120000 });
  console.log(`${file}: ${errors.length === 0 ? 'OK' : 'ERRORS: ' + errors.join(' | ')}`);
  if (errors.length > 0) failures += 1;
  await page.close();
}
await browser.close();
process.exit(failures > 0 ? 1 : 0);
