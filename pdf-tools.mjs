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

// ---------------------------------------------------------------------------
// PDF -> formatted paragraphs (used by PDF -> Word/HTML/Markdown)
// ---------------------------------------------------------------------------

const KNOWN_FAMILIES = ['Arial', 'Helvetica', 'Calibri', 'Cambria', 'Georgia', 'Verdana', 'Tahoma', 'Garamond', 'Roboto',
  'Trebuchet', 'Courier', 'Consolas', 'Times', 'Palatino', 'Book Antiqua', 'Century', 'Segoe', 'Open Sans', 'Lato', 'Futura', 'Gill Sans'];

// pdf.js font -> { bold, italic, family } for Word. name like "ABCDEF+Calibri-BoldItalic".
export function fontInfo(name = '', generic = 'sans-serif', flags = {}) {
  const clean = name.replace(/^[A-Z]{6}\+/, '');
  const bold = flags.bold ?? /bold|black|heavy|semibold|demi/i.test(clean);
  const italic = flags.italic ?? /italic|oblique/i.test(clean);
  const squashed = clean.replace(/[\s_-]/g, '').toLowerCase();
  let family = KNOWN_FAMILIES.find(f => squashed.startsWith(f.replace(/\s/g, '').toLowerCase())) || null;
  if (family === 'Times') family = 'Times New Roman';
  if (family === 'Courier') family = 'Courier New';
  if (family === 'Trebuchet') family = 'Trebuchet MS';
  if (family === 'Segoe') family = 'Segoe UI';
  if (!family) family = { serif: 'Times New Roman', monospace: 'Courier New' }[generic] || 'Arial';
  return { bold, italic, family };
}

const BULLET_RE = /^([•◦▪●‣·○■□➢➤►▶✓✔•●◦]|[-–—*])\s+/;

// items: pdf.js text items; fonts: { [item.fontName]: { bold, italic, family } }.
// Returns { blocks: [{ type:'p', y, runs, align, heading, bullet, indent, spacingAfter, lineSpacing }],
//           margins: { left, right, top, bottom }, bodySize }
export function extractParagraphs(items, fonts, pageWidth, pageHeight) {
  const spans = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
    const f = fonts[it.fontName] || {};
    spans.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, size, bold: !!f.bold, italic: !!f.italic, family: f.family || null });
  }
  if (!spans.length) return { blocks: [], margins: null, bodySize: 11 };

  // Lines
  const lines = [];
  for (const s of spans) {
    const tol = Math.max(2, s.size * 0.3);
    let line = lines.find(l => Math.abs(l.y - s.y) <= tol);
    if (!line) lines.push(line = { y: s.y, spans: [] });
    line.spans.push(s);
  }
  lines.sort((a, b) => b.y - a.y);
  for (const l of lines) {
    l.spans.sort((a, b) => a.x - b.x);
    l.x0 = l.spans[0].x;
    l.x1 = Math.max(...l.spans.map(s => s.x + s.w));
    l.size = Math.max(...l.spans.map(s => s.size));
    l.runs = [];
    let prevEnd = null;
    for (const s of l.spans) {
      let text = s.str;
      const last = l.runs[l.runs.length - 1];
      if (prevEnd !== null && s.x - prevEnd > s.size * 0.12 && !/^\s/.test(text) && last && !/\s$/.test(last.text)) text = ' ' + text;
      if (last && last.bold === s.bold && last.italic === s.italic && Math.abs(last.size - s.size) < 0.5 && last.family === s.family) last.text += text;
      else l.runs.push({ text, bold: s.bold, italic: s.italic, size: s.size, family: s.family });
      prevEnd = s.x + s.w;
    }
    l.runs.forEach(r => { r.text = r.text.replace(/\s+/g, ' '); });
    l.runs[0].text = l.runs[0].text.replace(/^\s+/, '');
    l.text = l.runs.map(r => r.text).join('').trim();
    const m = l.text.match(BULLET_RE);
    if (m) {
      l.bullet = true;
      let drop = m[0].length;
      for (const r of l.runs) {
        const n = Math.min(drop, r.text.length);
        r.text = r.text.slice(n); drop -= n;
        if (!drop) break;
      }
      l.runs = l.runs.filter(r => r.text);
      if (l.runs.length) l.runs[0].text = l.runs[0].text.replace(/^\s+/, '');
      l.text = l.text.slice(m[0].length);
    }
  }

  // Body size = most common size weighted by characters
  const sizeCount = new Map();
  for (const l of lines) for (const r of l.runs) { const k = Math.round(r.size * 2) / 2; sizeCount.set(k, (sizeCount.get(k) || 0) + r.text.length); }
  const bodySize = [...sizeCount.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const wide = lines.filter(l => l.text.length > 3);
  const leftEdge = Math.min(...(wide.length ? wide : lines).map(l => l.x0));
  const rightEdge = Math.max(...lines.map(l => l.x1));
  const textWidth = Math.max(1, rightEdge - leftEdge);
  const pageCenter = pageWidth / 2;

  // Paragraphs
  const paras = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], prev = lines[i - 1];
    let brk = !cur;
    if (!brk) {
      const gap = prev.y - l.y;
      const lh = Math.max(prev.size, l.size);
      const prevCentered = Math.abs((prev.x0 + prev.x1) / 2 - pageCenter) < pageWidth * 0.02 && prev.x0 - leftEdge > lh;
      if (gap > lh * 1.7) brk = true;
      else if (Math.abs(l.size - prev.size) > Math.max(1, prev.size * 0.12)) brk = true;
      else if (l.bullet) brk = true;
      else if (Math.abs(l.x0 - prev.x0) > lh * 1.2 && !(prev.bullet && l.x0 > prev.x0)) brk = true;
      else if (!prevCentered && prev.x1 < rightEdge - Math.max(lh * 3, textWidth * 0.2)) brk = true;
      else if (/[.!?:]$/.test(prev.text) && l.x0 - leftEdge > lh * 1.2) brk = true;
    }
    if (brk) paras.push(cur = { lines: [l] }); else cur.lines.push(l);
  }

  const blocks = paras.map((p, idx) => {
    const first = p.lines[0], last = p.lines[p.lines.length - 1];
    const runs = [];
    p.lines.forEach((l, li) => {
      l.runs.forEach((r, ri) => {
        let text = r.text;
        if (li > 0 && ri === 0) {
          const prevRun = runs[runs.length - 1];
          if (prevRun && /\S-$/.test(prevRun.text) && /^[a-z]/.test(text)) prevRun.text = prevRun.text.slice(0, -1);
          else if (prevRun && !/\s$/.test(prevRun.text)) text = ' ' + text;
        }
        const prevRun = runs[runs.length - 1];
        if (prevRun && prevRun.bold === r.bold && prevRun.italic === r.italic && Math.abs(prevRun.size - r.size) < 0.5 && prevRun.family === r.family) prevRun.text += text;
        else runs.push({ ...r, text });
      });
    });
    if (runs.length) { runs[0].text = runs[0].text.replace(/^\s+/, ''); runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, ''); }
    const size = Math.max(...p.lines.map(l => l.size));
    const text = runs.map(r => r.text).join('');
    const minX0 = Math.min(...p.lines.map(l => l.x0));
    const centered = p.lines.every(l => Math.abs((l.x0 + l.x1) / 2 - pageCenter) < pageWidth * 0.02 && l.x0 - leftEdge > size);
    const right = !centered && p.lines.every(l => rightEdge - l.x1 < 2 && l.x0 - leftEdge > size * 2);
    const allBold = runs.length > 0 && runs.every(r => r.bold || !r.text.trim());
    let heading = 0;
    if (text.length < 120 && !first.bullet) {
      if (size >= bodySize * 1.4) heading = 1;
      else if (size >= bodySize * 1.15) heading = 2;
      else if (allBold && p.lines.length === 1 && size >= bodySize * 1.05) heading = 3;
    }
    const gaps = p.lines.slice(1).map((l, i) => p.lines[i].y - l.y);
    const lineSpacing = gaps.length ? Math.max(200, Math.min(480, Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) / size * 200))) : 240;
    const next = paras[idx + 1];
    const lh = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : size * 1.2;
    const spacingAfter = next ? Math.max(0, Math.min(36, Math.round(last.y - next.lines[0].y - lh))) : 0;
    return {
      type: 'p', y: first.y + size, runs, text, size, heading,
      bullet: !!first.bullet,
      align: centered ? 'center' : right ? 'right' : 'left',
      indent: centered || right ? { left: 0, firstLine: 0 } : { left: Math.max(0, Math.round(minX0 - leftEdge)), firstLine: Math.max(0, Math.round(first.x0 - minX0)) },
      spacingAfter, lineSpacing,
    };
  }).filter(b => b.runs.length);

  const top = Math.max(...lines.map(l => l.y + l.size));
  const bottom = Math.min(...lines.map(l => l.y - l.size * 0.3));
  // Word's fonts differ slightly from the PDF's, so leave slack on the right and
  // never let a short last page inflate the bottom margin.
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
  const margins = {
    left: clamp(leftEdge, 36, 144),
    right: clamp(pageWidth - rightEdge - 12, 24, 144),
    top: clamp(pageHeight - top, 36, 144),
    bottom: clamp(bottom, 36, 72),
  };
  return { blocks, margins, bodySize };
}

// pages: [{ blocks }] where blocks are paragraphs (and images, ignored) -> plain text / Markdown / HTML
export function pagesToText(pages) {
  return pages.map(pg => pg.blocks.filter(b => b.type === 'p').map(b => (b.bullet ? '• ' : '') + b.text).join('\n\n')).join('\n\n\n') + '\n';
}

export function pagesToMarkdown(pages) {
  const esc = s => s.replace(/([*_`])/g, '\\$1');
  const run = r => { let t = esc(r.text); if (!t.trim()) return t; const lead = t.match(/^\s*/)[0], trail = t.match(/\s*$/)[0]; t = t.trim(); if (r.bold && r.italic) t = `***${t}***`; else if (r.bold) t = `**${t}**`; else if (r.italic) t = `*${t}*`; return lead + t + trail; };
  return pages.map(pg => {
    let out = '';
    pg.blocks.filter(b => b.type === 'p').forEach((b, i, arr) => {
      const body = b.heading ? esc(b.text) : b.runs.map(run).join('');
      if (i) out += b.bullet && arr[i - 1].bullet ? '\n' : '\n\n';
      out += b.heading ? `${'#'.repeat(b.heading)} ${body}` : (b.bullet ? '- ' : '') + body;
    });
    return out;
  }).join('\n\n---\n\n') + '\n';
}

export function pagesToHtml(pages, title = '') {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const run = r => { let t = esc(r.text); if (r.bold) t = `<b>${t}</b>`; if (r.italic) t = `<i>${t}</i>`; return t; };
  const body = pages.map(pg => {
    const out = [];
    let inList = false;
    for (const b of pg.blocks) {
      if (b.type !== 'p') continue;
      if (b.bullet && !inList) { out.push('<ul>'); inList = true; }
      if (!b.bullet && inList) { out.push('</ul>'); inList = false; }
      const inner = b.runs.map(r => b.heading ? run({ ...r, bold: false }) : run(r)).join('');
      const style = b.align !== 'left' ? ` style="text-align:${b.align}"` : '';
      if (b.bullet) out.push(`<li>${inner}</li>`);
      else if (b.heading) out.push(`<h${b.heading}${style}>${inner}</h${b.heading}>`);
      else out.push(`<p${style}>${inner}</p>`);
    }
    if (inList) out.push('</ul>');
    return out.join('\n');
  }).join('\n<hr>\n');
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body>\n${body}\n</body></html>\n`;
}
