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
