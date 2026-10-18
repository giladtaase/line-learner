import { extractTextFromFile } from './scriptParser';

export const SCRIPT_FILE_TYPES = '.txt,.docx,.pdf';

export function isPdf(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
}

export interface ScriptFileText {
  text: string;
  /** For a PDF, its bytes, to attach when parsing with AI (see parseScriptWithAI). */
  pdf?: ArrayBuffer;
}

/** A script file's text, read locally: .txt, .docx, or .pdf (via pdf.js, loaded on demand). */
export async function readScriptFile(
  file: File,
  onPdfPage?: (page: number, pages: number) => void
): Promise<ScriptFileText> {
  if (!isPdf(file)) return { text: await extractTextFromFile(file) };
  const pdf = await file.arrayBuffer();
  const { extractPdfText } = await import('./pdfText');
  return { text: await extractPdfText(pdf, onPdfPage), pdf };
}
