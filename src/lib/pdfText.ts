/**
 * Text from a PDF, read locally with pdf.js so it is exactly what the file
 * says (an AI transcription can leave things out, e.g. song lyrics).
 *
 * pdf.js returns positioned fragments in content-stream order, without the
 * spaces a layout gap implies, so lines are rebuilt from geometry: fragments
 * at the same height form a line, ordered right to left when the line has
 * Hebrew, with a space wherever there is a visible gap.
 */

export interface PdfTextItem {
  str: string;
  /** Left edge and baseline, in PDF units (y grows upwards). */
  x: number;
  y: number;
  width: number;
  /** Font size. */
  size: number;
}

const HEBREW = /[֐-׿]/;

export function linesFromTextItems(items: PdfTextItem[]): string[] {
  const rows: PdfTextItem[][] = [];
  for (const item of items) {
    if (!item.str.trim()) continue;
    const row = rows.find((r) => Math.abs(r[0].y - item.y) < Math.max(r[0].size, item.size, 1) * 0.5);
    if (row) row.push(item);
    else rows.push([item]);
  }
  rows.sort((a, b) => b[0].y - a[0].y);

  return rows
    .map((row) => {
      const rtl = row.some((i) => HEBREW.test(i.str));
      const right = (i: PdfTextItem) => i.x + i.width;
      row.sort((a, b) => (rtl ? right(b) - right(a) : a.x - b.x));
      let text = '';
      row.forEach((item, k) => {
        const prev = row[k - 1];
        if (prev) {
          const gap = rtl ? prev.x - right(item) : item.x - right(prev);
          if (gap > Math.max(item.size, 1) * 0.15) text += ' ';
        }
        text += item.str;
      });
      return text.replace(/\s+/g, ' ').trim();
    })
    .filter(Boolean);
}

/** pdf.js's raw text item, as far as it's used here. */
interface RawTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

export function toPdfTextItems(raw: RawTextItem[]): PdfTextItem[] {
  return raw.flatMap((item) => {
    if (typeof item.str !== 'string' || !item.transform) return [];
    const [, , c, d, x, y] = item.transform;
    return [{ str: item.str, x, y, width: item.width ?? 0, size: Math.hypot(c, d) || item.height || 0 }];
  });
}

/** The PDF's text, one layout line per line, page after page. */
export async function extractPdfText(
  data: ArrayBuffer,
  onPage?: (page: number, pages: number) => void
): Promise<string> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  // pdf.js takes ownership of (detaches) the buffer it's given; keep the caller's intact.
  const task = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const { items } = await page.getTextContent();
    pages.push(linesFromTextItems(toPdfTextItems(items as RawTextItem[])).join('\n'));
    onPage?.(n, doc.numPages);
  }
  await task.destroy();
  return pages.join('\n');
}
