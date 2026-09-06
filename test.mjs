import { strict as assert } from 'node:assert';
import { PDFDocument } from 'pdf-lib';
import {
  mergePdfs, extractPages, rotatePdf, parseRanges, removePages, addPageNumbers, groupTextLines,
  sanitizeText, wrapText, markdownToBlocks, textToBlocks, blocksToPdf, tableToPdf,
} from './pdf-tools.mjs';
import { StandardFonts } from 'pdf-lib';

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

// groupTextLines: pdf.js-style items -> ordered lines with sensible spacing
const item = (str, x, y, width = str.length * 5) => ({ str, width, transform: [1, 0, 0, 1, x, y] });
assert.deepEqual(
  groupTextLines([
    item('world', 40, 100),        // same line as "Hello", out of order
    item('Hello', 10, 101),        // within y tolerance, visible gap -> space
    item('Sec', 10, 80),           // adjacent fragments of one word -> no space
    item('ond line', 25, 80),
    item('   ', 10, 60),           // whitespace-only item is dropped
  ]),
  ['Hello world', 'Second line']
);
assert.deepEqual(groupTextLines([]), []);

// Text layout helpers
const fontDoc = await PDFDocument.create();
const helv = await fontDoc.embedFont(StandardFonts.Helvetica);
assert.equal(sanitizeText('a\tb 字 é', helv), 'a    b ? é');
assert.deepEqual(wrapText('one two three four', helv, 12, 45), ['one two', 'three', 'four']);
assert.deepEqual(wrapText('', helv, 12, 60), ['']);
assert.ok(wrapText('x'.repeat(200), helv, 12, 60).length > 1, 'long words are broken');

assert.deepEqual(
  markdownToBlocks('# Title\n\nSome *em* and **strong** [link](http://x).\ncontinues\n\n- item one\n2. item two\n\n---\n```\ncode here\n```'),
  [
    { type: 'h1', text: 'Title' },
    { type: 'p', text: 'Some em and strong link. continues' },
    { type: 'li', text: 'item one' },
    { type: 'li', text: 'item two' },
    { type: 'hr' },
    { type: 'code', text: 'code here' },
  ]
);
assert.deepEqual(markdownToBlocks('#### deep'), [{ type: 'h3', text: 'deep' }]);
assert.deepEqual(textToBlocks('a\r\n\r\nb'), [{ type: 'line', text: 'a' }, { type: 'blank' }, { type: 'line', text: 'b' }]);

const longDoc = Array.from({ length: 120 }, (_, i) => ({ type: 'p', text: `Paragraph ${i} ` + 'lorem ipsum '.repeat(20) }));
const laid = await PDFDocument.load(await blocksToPdf([{ type: 'h1', text: 'Doc' }, ...longDoc], { title: 'T' }));
assert.ok(laid.getPageCount() > 3, `expected multiple pages, got ${laid.getPageCount()}`);
assert.equal(laid.getTitle(), 'T');
const empty = await PDFDocument.load(await blocksToPdf([]));
assert.equal(empty.getPageCount(), 1);

const rows = [['Name', 'Qty', 'Notes'], ...Array.from({ length: 80 }, (_, i) => [`Item ${i}`, String(i), 'x '.repeat(i % 30)])];
const table = await PDFDocument.load(await tableToPdf([{ name: 'Sheet1', rows }, { name: 'Empty', rows: [] }]));
assert.ok(table.getPageCount() >= 2, `table should paginate, got ${table.getPageCount()}`);
assert.equal(table.getPages()[0].getWidth(), 792, 'landscape');
const wide = await PDFDocument.load(await tableToPdf([{ name: '', rows: [Array.from({ length: 40 }, (_, i) => `col${i}`)] }]));
assert.equal(wide.getPageCount(), 1);

console.log('all checks passed');
