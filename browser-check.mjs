// End-to-end check: load merge.html in Chromium, merge two fixture PDFs,
// verify the downloaded file. Run with the local server up: node browser-check.mjs
import { strict as assert } from 'node:assert';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';

async function makePdf(path, n) {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage();
  writeFileSync(path, await d.save());
}
await makePdf('/tmp/a.pdf', 2);
await makePdf('/tmp/b.pdf', 3);

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => { throw e; });

const BASE = process.env.BASE || 'http://localhost:8080';
await page.goto(`${BASE}/merge.html`);
await page.setInputFiles('#files', ['/tmp/a.pdf', '/tmp/b.pdf']);
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('#go'),
]);
const outPath = await download.path();
const merged = await PDFDocument.load(new Uint8Array((await import('node:fs')).readFileSync(outPath)));
assert.equal(merged.getPageCount(), 5);
assert.equal(await page.textContent('#status'), 'Done — download started.');

await page.goto(`${BASE}/`);
await page.screenshot({ path: '/tmp/airgappdf-home.png', fullPage: true });

await browser.close();
console.log('browser check passed: merged 2+3 pages -> 5-page PDF downloaded');
