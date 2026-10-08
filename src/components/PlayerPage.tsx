import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { v4 as uuid } from 'uuid';
import { db, getSettings, recordAttempt } from '../lib/db';
import { speak, stopSpeaking, ensureVoicesLoaded } from '../lib/tts';
import { gradeAttempt } from '../lib/fuzzyMatch';
import {
  createTranscriptionController,
  type TranscriptionController
} from '../lib/transcription';
import type { Script, OtherLinesMode, AppSettings } from '../types';

type RecordingState = 'idle' | 'recording' | 'processing';

interface GradeResult {
  transcript: string;
  similarity: number;
  passed: boolean;
}

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [script, setScript] = useState<Script | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [otherLinesMode, setOtherLinesMode] = useState<OtherLinesMode>('speak');
  const [showJumpTo, setShowJumpTo] = useState(false);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const stopRequested = useRef(false);
  const transcriptionRef = useRef<TranscriptionController | null>(null);

  useEffect(() => {
    if (!id) return;
    db.scripts.get(id).then((s) => s && setScript(s));
    getSettings().then((s) => {
      setSettings(s);
      setOtherLinesMode(s.defaultOtherLinesMode);
    });
    ensureVoicesLoaded();
  }, [id]);

  useEffect(() => {
    // Clear any stale recording/grading feedback whenever we move to a different line.
    setGradeResult(null);
    setRecordingError(null);
    setRecordingState('idle');
  }, [index]);

  function isMine(entry: Script['entries'][number] | undefined): boolean {
    if (!entry || entry.type !== 'line' || !script?.myCharacter) return false;
    return entry.characters
      ? entry.characters.includes(script.myCharacter)
      : entry.character === script.myCharacter;
  }

  const currentEntry = script?.entries[index];
  const isMyLine = isMine(currentEntry);

  const advance = useCallback(() => {
    setIndex((i) => Math.min(i + 1, (script?.entries.length ?? 1) - 1));
  }, [script]);

  const goPrev = useCallback(() => {
    stopRequested.current = true;
    stopSpeaking();
    setPlaying(false);
    setIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goNext = useCallback(() => {
    stopRequested.current = true;
    stopSpeaking();
    setPlaying(false);
    setIndex((i) => Math.min(i + 1, (script?.entries.length ?? 1) - 1));
  }, [script]);

  function jumpToIndex(i: number) {
    stopRequested.current = true;
    stopSpeaking();
    setPlaying(false);
    setIndex(i);
    setShowJumpTo(false);
  }

  async function handleStartRecording() {
    if (!script || !currentEntry) return;
    setRecordingError(null);
    setGradeResult(null);
    try {
      const settingsNow = settings ?? (await getSettings());
      const controller = createTranscriptionController(settingsNow, script.language);
      transcriptionRef.current = controller;
      await controller.start();
      setRecordingState('recording');
    } catch (err) {
      setRecordingError(err instanceof Error ? err.message : String(err));
      setRecordingState('idle');
    }
  }

  async function handleStopRecording() {
    if (!transcriptionRef.current || !currentEntry || !script) return;
    setRecordingState('processing');
    try {
      const transcript = await transcriptionRef.current.stop();
      const settingsNow = settings ?? (await getSettings());
      const { similarity, passed } = gradeAttempt(
        currentEntry.text,
        transcript,
        settingsNow.leniencyThreshold
      );
      setGradeResult({ transcript, similarity, passed });
      await recordAttempt({
        id: uuid(),
        scriptId: script.id,
        entryId: currentEntry.id,
        timestamp: Date.now(),
        mode: 'readthrough',
        transcript,
        similarity,
        passed
      });
    } catch (err) {
      setRecordingError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecordingState('idle');
      transcriptionRef.current = null;
    }
  }

  function handleCancelRecording() {
    transcriptionRef.current?.cancel();
    transcriptionRef.current = null;
    setRecordingState('idle');
  }

  const runAutoPlay = useCallback(async () => {
    if (!script) return;
    stopRequested.current = false;
    setPlaying(true);
    let i = index;
    while (i < script.entries.length && !stopRequested.current) {
      const entry = script.entries[i];
      const mine = isMine(entry);
      setIndex(i);
      if (mine) {
        // Pause here; the user records/says their line and taps Continue.
        setPlaying(false);
        return;
      }
      if (entry.type === 'line' && otherLinesMode === 'speak') {
        await speak(entry.text, script.language, settings?.ttsRate ?? 1);
      } else {
        // Give a moment to read displayed text/direction before advancing.
        await new Promise((r) => setTimeout(r, entry.type === 'direction' ? 700 : 1400));
      }
      i++;
    }
    setIndex(Math.min(i, script.entries.length - 1));
    setPlaying(false);
  }, [script, index, otherLinesMode, settings]);

  function handlePlay() {
    runAutoPlay();
  }

  function handlePause() {
    stopRequested.current = true;
    stopSpeaking();
    setPlaying(false);
  }

  function handleStop() {
    stopRequested.current = true;
    stopSpeaking();
    setPlaying(false);
    setIndex(0);
  }

  function handleContinueAfterMyLine() {
    advance();
    // Resume autoplay from the next entry.
    setTimeout(() => runAutoPlay(), 0);
  }

  if (!script) {
    return <p className="text-slate-500">{t('player.noScriptSelected')}</p>;
  }

  if (!script.myCharacter) {
    return (
      <div className="space-y-3">
        <p className="text-slate-600">{t('player.chooseYourCharacterFirst')}</p>
        <button
          onClick={() => navigate(`/scripts/${script.id}/edit`)}
          className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700"
        >
          {t('editor.title')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-semibold">{script.title}</h2>
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => setShowJumpTo(true)}
            className="border px-3 py-1.5 rounded hover:bg-slate-50"
          >
            {t('player.jumpTo')}
          </button>
          <span>{t('player.otherLinesMode')}:</span>
          <select
            value={otherLinesMode}
            onChange={(e) => setOtherLinesMode(e.target.value as OtherLinesMode)}
            className="border rounded px-2 py-1"
          >
            <option value="speak">{t('player.speak')}</option>
            <option value="display">{t('player.display')}</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 min-h-[160px] flex flex-col justify-center">
        {script.entries.map((entry, i) => {
          if (i !== index) return null;
          const mine = isMine(entry);
          if (entry.type === 'direction') {
            return (
              <p key={entry.id} className="italic text-slate-500 text-center">
                {entry.text}
              </p>
            );
          }
          return (
            <div key={entry.id} className="text-center space-y-2">
              <p className="text-sm font-semibold text-brand-700">{entry.character}</p>
              {mine ? (
                <p className="text-lg bg-amber-50 border border-amber-200 rounded p-3">
                  {entry.text}
                </p>
              ) : otherLinesMode === 'display' ? (
                <p className="text-lg">{entry.text}</p>
              ) : (
                <p className="text-slate-400 italic">🔊 …</p>
              )}
              {mine && <p className="text-xs text-amber-700">{t('player.yourTurn')}</p>}
              {mine && (
                <div className="pt-2 space-y-2">
                  {recordingState === 'idle' && !gradeResult && (
                    <button
                      onClick={handleStartRecording}
                      className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                    >
                      🎙 {t('player.record')}
                    </button>
                  )}
                  {recordingState === 'recording' && (
                    <button
                      onClick={handleStopRecording}
                      className="inline-flex items-center gap-2 bg-red-700 text-white px-4 py-2 rounded animate-pulse"
                    >
                      ⏹ {t('player.recording')}
                    </button>
                  )}
                  {recordingState === 'processing' && (
                    <p className="text-sm text-slate-500">{t('player.processing')}</p>
                  )}
                  {recordingState === 'recording' && (
                    <button
                      onClick={handleCancelRecording}
                      className="text-xs text-slate-400 underline block mx-auto"
                    >
                      {t('common.cancel')}
                    </button>
                  )}
                  {recordingError && (
                    <div className="text-sm text-red-600">
                      <p>
                        {t('player.recordingError')}: {recordingError}
                      </p>
                      <p className="text-xs text-slate-500">{t('player.micPermissionHint')}</p>
                    </div>
                  )}
                  {gradeResult && (
                    <div
                      className={`text-sm rounded p-3 border ${
                        gradeResult.passed
                          ? 'bg-green-50 border-green-200 text-green-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}
                    >
                      <p className="font-medium">
                        {gradeResult.passed
                          ? gradeResult.similarity > 0.92
                            ? t('player.goodJob')
                            : t('player.closeEnough')
                          : t('player.needsWork')}
                      </p>
                      <p className="text-xs mt-1 opacity-80">
                        {t('player.youSaid')}: “{gradeResult.transcript || '—'}”
                      </p>
                      <button
                        onClick={() => {
                          setGradeResult(null);
                          setRecordingError(null);
                        }}
                        className="text-xs underline mt-1"
                      >
                        {t('player.tryAgain')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-3 flex-wrap">
        <button
          onClick={goPrev}
          disabled={index === 0}
          className="border px-4 py-2 rounded hover:bg-slate-50 disabled:opacity-40"
          title={t('player.previous') ?? ''}
        >
          ◀ {t('player.previous')}
        </button>
        {!playing && !isMyLine && (
          <button
            onClick={handlePlay}
            className="bg-brand-600 text-white px-5 py-2 rounded hover:bg-brand-700"
          >
            {t('player.play')}
          </button>
        )}
        {playing && (
          <button onClick={handlePause} className="border px-5 py-2 rounded hover:bg-slate-50">
            {t('player.pause')}
          </button>
        )}
        {isMyLine && !playing && (
          <button
            onClick={handleContinueAfterMyLine}
            className="bg-amber-600 text-white px-5 py-2 rounded hover:bg-amber-700"
          >
            {t('player.continue')}
          </button>
        )}
        <button onClick={handleStop} className="border px-5 py-2 rounded hover:bg-slate-50">
          {t('player.stop')}
        </button>
        <button
          onClick={goNext}
          disabled={!script || index >= script.entries.length - 1}
          className="border px-4 py-2 rounded hover:bg-slate-50 disabled:opacity-40"
          title={t('player.next') ?? ''}
        >
          {t('player.next')} ▶
        </button>
      </div>

      <p className="text-center text-xs text-slate-400">
        {index + 1} / {script.entries.length}
      </p>

      {showJumpTo && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setShowJumpTo(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">{t('player.jumpToTitle')}</h3>
              <button
                onClick={() => setShowJumpTo(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {script.entries.map((entry, i) => (
                <button
                  key={entry.id}
                  onClick={() => jumpToIndex(i)}
                  className={`w-full text-start px-4 py-2 border-b hover:bg-slate-50 ${
                    i === index ? 'bg-brand-50' : ''
                  }`}
                >
                  {entry.type === 'direction' ? (
                    <span className="italic text-slate-500 text-sm">{entry.text}</span>
                  ) : (
                    <span className="text-sm">
                      <span
                        className={`font-semibold ${isMine(entry) ? 'text-amber-700' : 'text-brand-700'}`}
                      >
                        {entry.character}:
                      </span>{' '}
                      {entry.text}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
