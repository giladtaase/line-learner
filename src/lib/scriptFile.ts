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

export function downloadScriptFile(script: Script): void {
  const json = serializeScriptFile(script);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeTitle = script.title.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'script';
  a.download = `${safeTitle}.linelearner.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
