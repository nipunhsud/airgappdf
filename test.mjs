import { strict as assert } from 'node:assert';
import { PDFDocument } from 'pdf-lib';
import { mergePdfs, extractPages, rotatePdf, parseRanges, removePages, addPageNumbers } from './pdf-tools.mjs';

async function makePdf(n) {
  const d = await PDFDocument.create();
  for (let i = 0; i < n; i++) d.addPage();
  return d.save();
}

const a = await makePdf(2);
const b = await makePdf(3);

const merged = await PDFDocument.load(await mergePdfs([a, b]));
assert.equal(merged.getPageCount(), 5);

assert.deepEqual(parseRanges('1-2,4', 5), [0, 1, 3]);
assert.deepEqual(parseRanges('3', 3), [2]);
assert.throws(() => parseRanges('0-2', 5));
assert.throws(() => parseRanges('4-9', 5));
assert.throws(() => parseRanges('abc', 5));

const split = await PDFDocument.load(await extractPages(b, '2-3'));
assert.equal(split.getPageCount(), 2);

const rot = await PDFDocument.load(await rotatePdf(a, 90));
assert.equal(rot.getPages()[0].getRotation().angle, 90);

const removed = await PDFDocument.load(await removePages(b, '2'));
assert.equal(removed.getPageCount(), 2);
await assert.rejects(removePages(a, '1-2'));

const numbered = await PDFDocument.load(await addPageNumbers(b));
assert.equal(numbered.getPageCount(), 3);

console.log('all checks passed');
