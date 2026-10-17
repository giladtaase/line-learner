import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuid } from 'uuid';
import { recordAttempt } from '../../lib/db';
import { gradeAttempt, stripInlineDirections } from '../../lib/fuzzyMatch';
import {
  createTranscriptionController,
  type TranscriptionController
} from '../../lib/transcription';
import { useSettings } from '../../settings/context';
import { useErrorMessage } from '../../hooks/useErrorMessage';
import type { Language, ScriptEntry } from '../../types';

type RecordingState = 'idle' | 'starting' | 'recording' | 'processing';

interface GradeResult {
  transcript: string;
  similarity: number;
  passed: boolean;
}

// Above this similarity a passing attempt is praised as a match, not "close enough".
const EXACT_MATCH = 0.92;

interface RecordPanelProps {
  scriptId: string;
  language: Language;
  entry: ScriptEntry;
}

/**
 * Records the user saying their line, transcribes and grades it. Rendered
 * with `key={entry.id}`, so moving to another line unmounts it, which
 * abandons any recording in progress and clears the result.
 */
export default function RecordPanel({ scriptId, language, entry }: RecordPanelProps) {
  const { t } = useTranslation();
  const { settings } = useSettings();
  const errorMessage = useErrorMessage();
  const [state, setState] = useState<RecordingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  // The recording in progress. Async steps check it is still the same
  // controller before updating state, so an abandoned one never shows a result.
  const controllerRef = useRef<TranscriptionController | null>(null);

  const abandon = useCallback(() => {
    controllerRef.current?.cancel();
    controllerRef.current = null;
  }, []);

  useEffect(() => abandon, [abandon]);

  async function start() {
    setError(null);
    setResult(null);
    setState('starting');
    const controller = createTranscriptionController(settings, language);
    controllerRef.current = controller;
    try {
      await controller.start();
      if (controllerRef.current === controller) setState('recording');
    } catch (err) {
      if (controllerRef.current !== controller) return;
      controllerRef.current = null;
      setError(errorMessage(err));
      setState('idle');
    }
  }

  async function stop() {
    const controller = controllerRef.current;
    if (!controller) return;
    setState('processing');
    try {
      const transcript = await controller.stop();
      if (controllerRef.current !== controller) return;
      const { similarity, passed } = gradeAttempt(entry.text, transcript, settings.leniencyThreshold);
      setResult({ transcript, similarity, passed });
      await recordAttempt({
        id: uuid(),
        scriptId,
        entryId: entry.id,
        timestamp: Date.now(),
        mode: 'readthrough',
        transcript,
        similarity,
        passed
      });
    } catch (err) {
      if (controllerRef.current === controller) setError(errorMessage(err));
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setState('idle');
      }
    }
  }

  function cancel() {
    abandon();
    setState('idle');
  }

  return (
    <div className="pt-2 space-y-2">
      {(state === 'idle' || state === 'starting') && !result && (
        <button
          type="button"
          onClick={start}
          disabled={state === 'starting'}
          className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-60"
        >
          🎙 {t('player.record')}
        </button>
      )}
      {state === 'recording' && (
        <>
          <button
            type="button"
            onClick={stop}
            className="inline-flex items-center gap-2 bg-red-700 text-white px-4 py-2 rounded animate-pulse"
          >
            ⏹ {t('player.recording')}
          </button>
          <button onClick={cancel} className="text-xs text-slate-400 underline block mx-auto">
            {t('common.cancel')}
          </button>
        </>
      )}
      {state === 'processing' && <p className="text-sm text-slate-500">{t('player.processing')}</p>}
      {error && (
        <div className="text-sm text-red-600" role="alert">
          <p>
            {t('player.recordingError')}: {error}
          </p>
          <p className="text-xs text-slate-500">{t('player.micPermissionHint')}</p>
        </div>
      )}
      {result && (
        <div
          role="status"
          className={`text-sm rounded p-3 border ${
            result.passed
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <p className="font-medium">
            {result.passed
              ? result.similarity > EXACT_MATCH
                ? t('player.goodJob')
                : t('player.closeEnough')
              : t('player.needsWork')}
          </p>
          <p className="text-xs mt-1 opacity-80">
            {t('player.youSaid')}: “{result.transcript || '—'}”
          </p>
          {!result.passed && (
            <p className="text-xs mt-1 opacity-80">
              {t('player.expected')}: “{stripInlineDirections(entry.text)}”
            </p>
          )}
          <button
            onClick={() => {
              setResult(null);
              setError(null);
            }}
            className="text-xs underline mt-1"
          >
            {t('player.tryAgain')}
          </button>
        </div>
      )}
    </div>
  );
}
