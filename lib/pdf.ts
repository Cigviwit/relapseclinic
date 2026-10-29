/**
 * Minimal PDF writer: one JPEG per page, drawn full width from the top.
 * Enough for an image of a prescription pad, without a 300 KB PDF library.
 */
export type PdfPage = { jpeg: Uint8Array; width: number; height: number };

export const paperPt = { A5: [419.53, 595.28], A4: [595.28, 841.89] } as const;

export function imagesToPdf(pages: PdfPage[], pageWidth: number, pageHeight: number): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: string | Uint8Array) => { const bytes = typeof part === 'string' ? enc.encode(part) : part; chunks.push(bytes); length += bytes.length; };
  const object = (n: number, body: () => void) => { offsets[n] = length; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const pageIds = pages.map((_, i) => 3 + i * 3);
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () => push(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`));
  pages.forEach((page, i) => {
    const [pageId, imageId, contentId] = [pageIds[i], pageIds[i] + 1, pageIds[i] + 2];
    const drawHeight = pageWidth * page.height / page.width;
    const content = `q ${pageWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} 0 ${(pageHeight - drawHeight).toFixed(2)} cm /Im0 Do Q`;
    object(pageId, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
    object(imageId, () => { push(`<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`); push(page.jpeg); push('\nendstream'); });
    object(contentId, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
  });
  const xref = length;
  const count = 3 + pages.length * 3;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** Renders a DOM element to a PDF, splitting it into pages of the paper's aspect ratio. Browser only. */
export async function elementToPdf(element: HTMLElement, paper: keyof typeof paperPt): Promise<Uint8Array> {
  const { toCanvas } = await import('html-to-image');
  const canvas = await toCanvas(element, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
  const [pw, ph] = paperPt[paper];
  const sliceHeight = Math.floor(canvas.width * ph / pw);
  const pages: PdfPage[] = [];
  for (let y = 0; y < canvas.height; y += sliceHeight) {
    const h = Math.min(sliceHeight, canvas.height - y);
    if (pages.length && h < 40) break; // ignore a sliver of trailing whitespace
    const slice = document.createElement('canvas');
    slice.width = canvas.width; slice.height = h;
    const ctx = slice.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, slice.width, h);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    const blob = await new Promise<Blob>((resolve, reject) => slice.toBlob(b => b ? resolve(b) : reject(new Error('Could not render the prescription')), 'image/jpeg', 0.88));
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: slice.width, height: h });
  }
  return imagesToPdf(pages, pw, ph);
}

export function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
