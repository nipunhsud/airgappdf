import { PDFDocument, StandardFonts, degrees } from 'pdf-lib';

export async function mergePdfs(buffers) {
  const out = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach(p => out.addPage(p));
  }
  return out.save();
}

// "1-3,5" -> [0,1,2,4] (validated against pageCount)
export function parseRanges(spec, pageCount) {
  const idx = new Set();
  for (const part of spec.split(',')) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`Bad range: "${part.trim()}"`);
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b > pageCount || a > b) throw new Error(`Range out of bounds: "${part.trim()}"`);
    for (let i = a; i <= b; i++) idx.add(i - 1);
  }
  return [...idx].sort((x, y) => x - y);
}

export async function extractPages(buffer, rangeSpec) {
  const src = await PDFDocument.load(buffer);
  const indices = parseRanges(rangeSpec, src.getPageCount());
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, indices);
  pages.forEach(p => out.addPage(p));
  return out.save();
}

export async function rotatePdf(buffer, angle) {
  const doc = await PDFDocument.load(buffer);
  for (const page of doc.getPages()) {
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  }
  return doc.save();
}

export async function removePages(buffer, rangeSpec) {
  const src = await PDFDocument.load(buffer);
  const drop = new Set(parseRanges(rangeSpec, src.getPageCount()));
  const keep = src.getPageIndices().filter(i => !drop.has(i));
  if (!keep.length) throw new Error('Cannot remove every page.');
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, keep);
  pages.forEach(p => out.addPage(p));
  return out.save();
}

export async function addPageNumbers(buffer) {
  const doc = await PDFDocument.load(buffer);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const text = `${i + 1} / ${pages.length}`;
    const size = 11;
    const width = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (page.getWidth() - width) / 2, y: 24, size, font });
  });
  return doc.save();
}

// images: [{ bytes, type }] where type is image/jpeg or image/png
export async function imagesToPdf(images) {
  const out = await PDFDocument.create();
  for (const { bytes, type } of images) {
    const img = type === 'image/png' ? await out.embedPng(bytes) : await out.embedJpg(bytes);
    const page = out.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  return out.save();
}
