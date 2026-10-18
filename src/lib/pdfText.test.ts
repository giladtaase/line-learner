import { describe, it, expect } from 'vitest';
import { linesFromTextItems, toPdfTextItems, type PdfTextItem } from './pdfText';

const item = (str: string, x: number, y: number, width: number, size = 12): PdfTextItem => ({
  str,
  x,
  y,
  width,
  size
});

describe('linesFromTextItems', () => {
  it('orders Hebrew fragments right to left and adds a space at a visible gap', () => {
    // On the page: "נעמה:" at the right margin, the speech further left after a tab.
    const lines = linesFromTextItems([item('שלום!', 300, 700, 40), item('נעמה:', 480, 700, 40)]);
    expect(lines).toEqual(['נעמה: שלום!']);
  });

  it('joins touching fragments without a space', () => {
    expect(linesFromTextItems([item('הופכים', 400, 700, 50), item('ם', 395, 700, 5)])).toEqual(['הופכיםם']);
  });

  it('keeps a scene number with its suffix, wherever they sit in the content stream', () => {
    // Content order: "תמונה", "ההזיה", "10", "א'" - layout order right to left: תמונה 10א' ההזיה
    const lines = linesFromTextItems([
      item('תמונה', 500, 700, 40),
      item('ההזיה', 380, 700, 40),
      item('10', 480, 700, 14),
      item("א'", 466, 700, 13.9)
    ]);
    expect(lines).toEqual(["תמונה 10א' ההזיה"]);
  });

  it('orders lines top to bottom and English left to right', () => {
    const lines = linesFromTextItems([
      item('second', 72, 680, 40),
      item('ROMEO:', 72, 700, 50),
      item('Hi', 140, 700, 14)
    ]);
    expect(lines).toEqual(['ROMEO: Hi', 'second']);
  });

  it('drops whitespace-only fragments', () => {
    expect(linesFromTextItems([item('  ', 10, 10, 5)])).toEqual([]);
  });
});

describe('toPdfTextItems', () => {
  it('reads position and font size from the transform, skipping marked-content items', () => {
    expect(
      toPdfTextItems([{ str: 'x', transform: [12, 0, 0, 12, 50, 600], width: 6, height: 12 }, { type: 'beginMarkedContent' } as never])
    ).toEqual([{ str: 'x', x: 50, y: 600, width: 6, size: 12 }]);
  });
});
