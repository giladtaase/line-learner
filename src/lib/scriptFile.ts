import type { Script, ScriptEntry, Language } from '../types';

/**
 * Our own portable script file format (.linelearner.json), designed for
 * sharing a perfected/edited script with others so they don't have to redo
 * the parsing/correction work. Intentionally excludes `myCharacter(s)` and
 * all local practice history, since each person who imports it will pick
 * their own role.
 */
export const SCRIPT_FILE_VERSION = 1;

export interface ScriptFile {
  /** Identifies this as a Line Learner script export, and its schema version. */
  format: 'line-learner-script';
  version: number;
  title: string;
  language: Language;
  characters: string[];
  entries: ScriptEntry[];
  exportedAt: number;
}

export function scriptToFile(script: Script): ScriptFile {
  return {
    format: 'line-learner-script',
    version: SCRIPT_FILE_VERSION,
    title: script.title,
    language: script.language,
    characters: script.characters,
    entries: script.entries,
    exportedAt: Date.now()
  };
}

export function serializeScriptFile(script: Script): string {
  return JSON.stringify(scriptToFile(script), null, 2);
}

export class ScriptFileParseError extends Error {}

function isScriptEntry(value: unknown): value is ScriptEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.order === 'number' &&
    (v.type === 'line' || v.type === 'direction' || v.type === 'scene') &&
    typeof v.text === 'string'
  );
}

/** Parses and validates a .linelearner.json file's text content. Throws
 *  ScriptFileParseError with a user-facing message if the file doesn't look
 *  like a valid Line Learner script export. */
export function parseScriptFile(jsonText: string): ScriptFile {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new ScriptFileParseError('This file is not valid JSON.');
  }
  if (!data || typeof data !== 'object') {
    throw new ScriptFileParseError('This file is not a valid Line Learner script export.');
  }
  const d = data as Record<string, unknown>;
  if (d.format !== 'line-learner-script') {
    throw new ScriptFileParseError(
      'This file was not recognized as a Line Learner script export.'
    );
  }
  if (typeof d.version !== 'number' || d.version > SCRIPT_FILE_VERSION) {
    throw new ScriptFileParseError(
      'This script was exported by a newer version of the app and cannot be imported here.'
    );
  }
  if (
    typeof d.title !== 'string' ||
    (d.language !== 'en' && d.language !== 'he') ||
    !Array.isArray(d.characters) ||
    !Array.isArray(d.entries) ||
    !d.entries.every(isScriptEntry)
  ) {
    throw new ScriptFileParseError('This script file is missing or has malformed data.');
  }
  return {
    format: 'line-learner-script',
    version: d.version,
    title: d.title,
    language: d.language,
    characters: d.characters as string[],
    entries: d.entries as ScriptEntry[],
    exportedAt: typeof d.exportedAt === 'number' ? d.exportedAt : Date.now()
  };
}

export function scriptFileToNewScript(file: ScriptFile, id: string): Script {
  const now = Date.now();
  return {
    id,
    title: file.title,
    language: file.language,
    characters: file.characters,
    entries: file.entries,
    createdAt: now,
    updatedAt: now
  };
}

function scriptFileName(script: Script): string {
  const safeTitle = script.title.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'script';
  return `${safeTitle}.linelearner.json`;
}

export function downloadScriptFile(script: Script): void {
  const json = serializeScriptFile(script);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = scriptFileName(script);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Whether the Web Share API can share actual files (not just text/links) on
 *  this device/browser — true on most mobile browsers (iOS Safari, Android
 *  Chrome), generally false on desktop browsers, where downloadScriptFile's
 *  plain download is used as a fallback instead. */
export function canShareScriptFile(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try {
    const probe = new File(['test'], 'test.json', { type: 'application/json' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Shares the script file via the device's native share sheet (WhatsApp,
 * email, AirDrop, etc. depending on platform) when supported. Returns true if
 * the native share sheet was invoked, false if the caller should fall back to
 * downloadScriptFile instead (e.g. unsupported browser, or sharing files
 * specifically isn't supported even though navigator.share exists).
 */
export async function shareScriptFile(script: Script): Promise<boolean> {
  if (!canShareScriptFile()) return false;
  const json = serializeScriptFile(script);
  const file = new File([json], scriptFileName(script), { type: 'application/json' });
  try {
    await navigator.share({
      files: [file],
      title: script.title,
      text: `${script.title} — Line Learner script`
    });
    return true;
  } catch (err) {
    // AbortError means the user simply cancelled the share sheet — not a
    // real failure, so don't fall back to a download in that case.
    if (err instanceof DOMException && err.name === 'AbortError') return true;
    return false;
  }
}
