// Browser-only helpers shared by the conversion pages (pdf.js rendering, DOCX/ZIP output).
// Pages that import this must map 'docx' and 'jszip' in their import map.
import { setStatus } from './ui.js';

// Render every page of a pdf.js document to a canvas, one at a time.
export async function* renderPages(src, scale = 2) {
  for (let i = 1; i <= src.numPages; i++) {
    setStatus(`Rendering page ${i}/${src.numPages}…`);
    const page = await src.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    yield { i, page, viewport, canvas };
  }
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  return new Promise(res => canvas.toBlob(res, type, quality));
}

// pages: string[][] (lines per page) -> .docx Blob, one paragraph per line.
export async function linesToDocx(pages) {
  const { Document, Packer, Paragraph, TextRun, PageBreak } = await import('docx');
  const children = [];
  pages.forEach((lines, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    for (const line of lines) children.push(new Paragraph({ children: [new TextRun(line)] }));
  });
  return Packer.toBlob(new Document({ sections: [{ children }] }));
}

// entries: [{ name, blob }] -> .zip Blob
export async function zipFiles(entries) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const { name, blob } of entries) zip.file(name, blob);
  return zip.generateAsync({ type: 'blob' });
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ---------------------------------------------------------------------------
// PDF -> Word with formatting
// ---------------------------------------------------------------------------
import { OPS, Util } from 'pdfjs-dist';
import { fontInfo } from './pdf-tools.mjs';

// { [fontName]: { bold, italic, family } } for every font used on the page.
// Call after page.getOperatorList() so pdf.js has loaded the font objects.
export function pageFonts(page, textContent) {
  const fonts = {};
  for (const [id, style] of Object.entries(textContent.styles || {})) {
    let f = null;
    try { f = page.commonObjs.has(id) ? page.commonObjs.get(id) : null; } catch { f = null; }
    fonts[id] = fontInfo(f?.name || '', style.fontFamily, f ? { bold: !!f.bold, italic: !!f.italic } : {});
  }
  return fonts;
}

// Image objects arrive from the worker asynchronously; wait for them (bounded).
function resolveObj(page, id) {
  const store = page.commonObjs.has(id) ? page.commonObjs : page.objs;
  return Promise.race([
    new Promise(res => store.get(id, res)),
    new Promise(res => setTimeout(() => res(null), 15000)),
  ]);
}

async function imageToPng(obj) {
  if (!obj || !obj.width || !obj.height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = obj.width; canvas.height = obj.height;
  const ctx = canvas.getContext('2d');
  if (obj.bitmap) ctx.drawImage(obj.bitmap, 0, 0);
  else if (obj.data) {
    const id = ctx.createImageData(obj.width, obj.height);
    const src = obj.data, dst = id.data, n = obj.width * obj.height;
    if (obj.kind === 3) dst.set(src.subarray(0, n * 4));
    else if (obj.kind === 2) for (let i = 0, j = 0; i < n; i++, j += 3) { dst[i * 4] = src[j]; dst[i * 4 + 1] = src[j + 1]; dst[i * 4 + 2] = src[j + 2]; dst[i * 4 + 3] = 255; }
    else if (obj.kind === 1) {
      const rowBytes = (obj.width + 7) >> 3;
      for (let y = 0; y < obj.height; y++) for (let x = 0; x < obj.width; x++) {
        const v = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
        const i = (y * obj.width + x) * 4; dst[i] = dst[i + 1] = dst[i + 2] = v; dst[i + 3] = 255;
      }
    } else return null;
    ctx.putImageData(id, 0, 0);
  } else return null;
  return new Uint8Array(await (await canvasToBlob(canvas, 'image/png')).arrayBuffer());
}

// Walk the page's operator list tracking the CTM so each painted image gets a
// position/size in PDF points. Returns [{ type:'image', y, x, width, height, png }].
export async function extractImages(page) {
  const ops = await page.getOperatorList();
  const images = [];
  const cache = new Map();
  const stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = Util.transform(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args[0]) ctm = Util.transform(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => Util.applyTransform([x, y], ctm));
      const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]);
      const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
      if (width < 12 || height < 12) continue; // bullets, rules, icons
      let png;
      try {
        if (fn === OPS.paintInlineImageXObject) png = await imageToPng(args[0]);
        else {
          const id = args[0];
          if (cache.has(id)) png = cache.get(id);
          else {
            png = await imageToPng(await resolveObj(page, id));
            cache.set(id, png);
          }
        }
      } catch { png = null; }
      if (png) images.push({ type: 'image', x: Math.min(...xs), y: Math.max(...ys), width, height, png });
    }
  }
  return images;
}

// pages: [{ width, height, margins, blocks }] -> .docx Blob with page setup,
// headings, bold/italic runs, sizes, alignment, bullets, indents, and images.
export async function pagesToDocx(pages) {
  const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, HeadingLevel, LevelFormat } = await import('docx');
  const ALIGN = { center: AlignmentType.CENTER, right: AlignmentType.RIGHT, left: AlignmentType.LEFT };
  const HEAD = [null, HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
  const sections = pages.map(pg => {
    const m = pg.margins || { left: 72, right: 72, top: 72, bottom: 72 };
    const textWidth = pg.width - m.left - m.right;
    const children = [];
    for (const b of pg.blocks) {
      if (b.type === 'image') {
        const k = Math.min(1, textWidth / b.width, (pg.height - m.top - m.bottom) / b.height);
        children.push(new Paragraph({
          children: [new ImageRun({ type: 'png', data: b.png, transformation: { width: Math.round(b.width * k * 96 / 72), height: Math.round(b.height * k * 96 / 72) } })],
          spacing: { after: 120 },
        }));
        continue;
      }
      children.push(new Paragraph({
        children: b.runs.map(r => new TextRun({ text: r.text, bold: r.bold, italics: r.italic, size: Math.round(r.size * 2), font: r.family || undefined })),
        alignment: ALIGN[b.align] || AlignmentType.LEFT,
        heading: HEAD[b.heading] || undefined,
        numbering: b.bullet ? { reference: 'bullets', level: 0 } : undefined,
        indent: b.bullet ? undefined : { left: b.indent.left * 20, firstLine: b.indent.firstLine * 20 },
        spacing: { after: b.spacingAfter * 20, line: b.lineSpacing, before: 0 },
      }));
    }
    if (!children.length) children.push(new Paragraph(''));
    return {
      properties: { page: { size: { width: Math.round(pg.width * 20), height: Math.round(pg.height * 20) }, margin: { top: m.top * 20, right: m.right * 20, bottom: m.bottom * 20, left: m.left * 20 } } },
      children,
    };
  });
  const heading = { run: { color: '000000', bold: true }, paragraph: { spacing: { before: 0 } } };
  const doc = new Document({
    styles: { default: { heading1: heading, heading2: heading, heading3: heading } },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
    sections,
  });
  return Packer.toBlob(doc);
}
