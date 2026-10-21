/**
 * Errors shown to the user. Each carries a `code` (a key under `errors.` in
 * the locale files) plus any values the translation interpolates, so the UI
 * can show it in the current language. `message` stays in English for logs
 * and tests.
 */
export type AppErrorCode =
  | 'noLinesDetected'
  | 'fileInvalidJson'
  | 'fileNotAnExport'
  | 'fileNewerVersion'
  | 'fileMalformed'
  | 'speechUnsupported'
  | 'speechUnavailableDevice'
  | 'missingApiKey'
  | 'recordingNotStarted'
  | 'whisperApi'
  | 'micBlocked'
  | 'noMicrophone'
  | 'speechNetwork'
  | 'speechLanguageUnsupported'
  | 'speechLanguageDevice'
  | 'speechStoppedEarly'
  | 'speechError'
  | 'aiNoKey'
  | 'aiBadKey'
  | 'aiRateLimited'
  | 'aiNetwork'
  | 'aiRefused'
  | 'aiTooLong'
  | 'aiInvalidResponse'
  | 'aiFailed'
  | 'mergeNoScenes';

export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly params: Record<string, string | number> = {}
  ) {
    super(message);
  }
}
