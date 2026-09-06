import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

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

// pdf.js text items -> lines of text, top-to-bottom then left-to-right.
// items: [{ str, width, transform }] where transform[4]=x, transform[5]=y (PDF y-up).
// Items whose baselines are within yTolerance are treated as one line; a space is
// inserted only when there is a visible gap between adjacent items.
export function groupTextLines(items, yTolerance = 2) {
  const lines = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5];
    let line = lines.find(l => Math.abs(l.y - y) <= yTolerance);
    if (!line) lines.push(line = { y, parts: [] });
    line.parts.push({ x, width: it.width || 0, str: it.str });
  }
  lines.sort((a, b) => b.y - a.y);
  return lines.map(l => {
    l.parts.sort((a, b) => a.x - b.x);
    let text = '';
    let prevEnd = null;
    for (const p of l.parts) {
      if (prevEnd !== null && p.x - prevEnd > 1 && !text.endsWith(' ') && !p.str.startsWith(' ')) text += ' ';
      text += p.str;
      prevEnd = p.x + p.width;
    }
    return text.replace(/\s+/g, ' ').trim();
  });
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

// ---------------------------------------------------------------------------
// Text -> PDF layout (used by Word/Text/Markdown -> PDF)
// ---------------------------------------------------------------------------

const LETTER = [612, 792];

// pdf-lib's standard fonts only speak WinAnsi. Replace anything else with '?'
// so a stray emoji or CJK character doesn't abort the whole conversion.
export function sanitizeText(text, font) {
  const cache = new Map();
  let out = '';
  for (const ch of String(text).replace(/\t/g, '    ').replace(/\r/g, '')) {
    if (ch === '\n') { out += ch; continue; }
    let ok = cache.get(ch);
    if (ok === undefined) {
      try { font.encodeText(ch); ok = true; } catch { ok = false; }
      cache.set(ch, ok);
    }
    out += ok ? ch : '?';
  }
  return out;
}

// Greedy word wrap. Words wider than maxWidth are broken by character.
export function wrapText(text, font, size, maxWidth) {
  const width = s => font.widthOfTextAtSize(s, size);
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (width(candidate) <= maxWidth) { line = candidate; continue; }
    if (line) lines.push(line);
    line = '';
    if (width(word) <= maxWidth) { line = word; continue; }
    for (const ch of word) {
      if (width(line + ch) > maxWidth && line) { lines.push(line); line = ''; }
      line += ch;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// Minimal Markdown -> blocks: [{ type: h1|h2|h3|p|li|code|hr, text }]
export function markdownToBlocks(text) {
  const blocks = [];
  let para = [];
  let code = null;
  const flush = () => { if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; } };
  for (const raw of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    if (code !== null) {
      if (/^\s*```/.test(raw)) { blocks.push({ type: 'code', text: code.join('\n') }); code = null; }
      else code.push(raw);
      continue;
    }
    const line = raw.trimEnd();
    let m;
    if (/^\s*```/.test(line)) { flush(); code = []; }
    else if (!line.trim()) flush();
    else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flush(); blocks.push({ type: `h${Math.min(m[1].length, 3)}`, text: stripInline(m[2]) }); }
    else if ((m = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/))) { flush(); blocks.push({ type: 'li', text: stripInline(m[1]) }); }
    else if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); blocks.push({ type: 'hr' }); }
    else para.push(stripInline(line.trim()));
  }
  flush();
  if (code !== null) blocks.push({ type: 'code', text: code.join('\n') });
  return blocks;
}

function stripInline(s) {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?=[^\w*]|$)/g, '$1$2')
    .replace(/(^|[^\w_])_(?!\s)(.+?)_(?=[^\w_]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
}

// Plain text -> blocks, one 'line' block per line so hard wraps are preserved.
export function textToBlocks(text) {
  return String(text).replace(/\r\n?/g, '\n').split('\n')
    .map(l => (l.trim() ? { type: 'line', text: l } : { type: 'blank' }));
}

// blocks -> Letter-size PDF. Block types: h1 h2 h3 p li line blank code hr
// and { type: 'image', bytes, mime: 'image/png'|'image/jpeg' }.
export async function blocksToPdf(blocks, { title } = {}) {
  const doc = await PDFDocument.create();
  if (title) doc.setTitle(title);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  const [W, H] = LETTER;
  const margin = 64;
  const maxWidth = W - 2 * margin;
  const styles = {
    h1: [bold, 22, 12], h2: [bold, 17, 10], h3: [bold, 14, 8],
    p: [regular, 11, 8], li: [regular, 11, 3], line: [regular, 11, 0], code: [mono, 9.5, 8],
  };
  let page = doc.addPage(LETTER);
  let y = H - margin;
  const ensure = h => { if (y - h < margin) { page = doc.addPage(LETTER); y = H - margin; } };

  for (const b of blocks) {
    if (b.type === 'blank') { y -= 11 * 1.35; continue; }
    if (b.type === 'hr') {
      ensure(12); y -= 8;
      page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, thickness: 0.5 });
      y -= 8; continue;
    }
    if (b.type === 'image') {
      let img;
      try { img = b.mime === 'image/png' ? await doc.embedPng(b.bytes) : await doc.embedJpg(b.bytes); }
      catch { continue; }
      const scale = Math.min(1, maxWidth / img.width, (H - 2 * margin) / img.height);
      const w = img.width * scale, h = img.height * scale;
      ensure(h); y -= h;
      page.drawImage(img, { x: margin, y, width: w, height: h });
      y -= 8; continue;
    }
    const [font, size, gap] = styles[b.type] || styles.p;
    const lineHeight = size * 1.35;
    const indent = b.type === 'li' ? 16 : 0;
    const text = sanitizeText(b.text ?? '', font);
    const lines = b.type === 'code'
      ? text.split('\n').flatMap(l => wrapText(l, font, size, maxWidth - indent))
      : wrapText(text, font, size, maxWidth - indent);
    if (b.type[0] === 'h') ensure(lineHeight * 2.5); // keep headings with the next line
    lines.forEach((l, i) => {
      ensure(lineHeight); y -= lineHeight;
      if (b.type === 'li' && i === 0) page.drawText('•', { x: margin + 4, y, size, font });
      page.drawText(l, { x: margin + indent, y, size, font });
    });
    y -= gap;
  }
  return doc.save();
}

// ---------------------------------------------------------------------------
// Spreadsheet -> PDF (used by Excel -> PDF). sheets: [{ name, rows: string[][] }]
// ---------------------------------------------------------------------------
export async function tableToPdf(sheets, { title } = {}) {
  const doc = await PDFDocument.create();
  if (title) doc.setTitle(title);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = [LETTER[1], LETTER[0]]; // landscape
  const margin = 36, size = 8, pad = 3, lineHeight = size * 1.3;
  const avail = W - 2 * margin;
  let page, y;
  const newPage = () => { page = doc.addPage([W, H]); y = H - margin; };
  newPage();

  for (const sheet of sheets) {
    const rows = sheet.rows.map(r => r.map(c => sanitizeText(c == null ? '' : String(c), regular)));
    const nCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    if (!nCols) continue;
    for (const r of rows) while (r.length < nCols) r.push('');

    // Column widths: fit content up to a cap, then scale to the page.
    const widths = Array.from({ length: nCols }, (_, c) =>
      Math.min(220, Math.max(36, ...rows.map(r => regular.widthOfTextAtSize(r[c], size) + 2 * pad))));
    const total = widths.reduce((a, b) => a + b, 0);
    if (total > avail) { const k = avail / total; widths.forEach((w, i) => { widths[i] = w * k; }); }

    const layoutRow = (r, font) => {
      const cells = r.map((c, i) => wrapText(c, font, size, Math.max(4, widths[i] - 2 * pad)));
      const h = Math.max(...cells.map(c => c.length)) * lineHeight + 2 * pad;
      return { cells, h };
    };
    const drawRow = ({ cells, h }, font) => {
      let x = margin;
      cells.forEach((lines, i) => {
        page.drawRectangle({ x, y: y - h, width: widths[i], height: h, borderWidth: 0.4, borderColor: rgb(0.6, 0.6, 0.6) });
        lines.forEach((l, j) => page.drawText(l, { x: x + pad, y: y - pad - lineHeight * (j + 1) + size * 0.3, size, font }));
        x += widths[i];
      });
      y -= h;
    };

    if (sheets.length > 1 || sheet.name) {
      if (y - 30 < margin) newPage();
      y -= 14;
      page.drawText(sanitizeText(sheet.name || 'Sheet', bold), { x: margin, y, size: 12, font: bold });
      y -= 10;
    }
    const header = layoutRow(rows[0], bold);
    drawRow(header, bold);
    for (const r of rows.slice(1)) {
      const laid = layoutRow(r, regular);
      if (y - laid.h < margin) { newPage(); drawRow(header, bold); }
      drawRow(laid, regular);
    }
    y -= 18;
  }
  if (!doc.getPageCount()) doc.addPage([W, H]);
  return doc.save();
}
