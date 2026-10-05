export type Language = 'en' | 'he';

export type EntryType = 'line' | 'direction';

/** A single parsed entry in a script: either a spoken line or a stage direction. */
export interface ScriptEntry {
  id: string;
  order: number;
  type: EntryType;
  /** Character name, only present for type 'line'. */
  character?: string;
  /** The text of the line or the stage direction. */
  text: string;
}

export interface Script {
  id: string;
  title: string;
  language: Language;
  /** The character the user plays, chosen after upload. */
  myCharacter?: string;
  /** All distinct character names detected in the script. */
  characters: string[];
  entries: ScriptEntry[];
  createdAt: number;
  updatedAt: number;
}

export type PracticeMode =
  | 'readthrough'
  | 'cue'
  | 'shortcue'
  | 'context'
  | 'random'
  | 'progressive';

export type OtherLinesMode = 'speak' | 'display';
export type MyLineInputMode = 'speak' | 'type';
export type TranscriptionProviderId = 'whisper' | 'webspeech';

export interface AppSettings {
  id: 'settings';
  uiLanguage: Language;
  defaultOtherLinesMode: OtherLinesMode;
  defaultMyLineInputMode: MyLineInputMode;
  transcriptionProvider: TranscriptionProviderId;
  openAiApiKey?: string;
  ttsRate: number;
  leniencyThreshold: number; // 0-1, similarity ratio below which a correction is flagged
}

export interface LineAttempt {
  id: string;
  scriptId: string;
  entryId: string;
  timestamp: number;
  mode: PracticeMode;
  transcript: string;
  similarity: number;
  passed: boolean;
}
