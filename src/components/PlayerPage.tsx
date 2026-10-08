import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db, getSettings } from '../lib/db';
import { speak, stopSpeaking, ensureVoicesLoaded } from '../lib/tts';
import type { Script, OtherLinesMode, AppSettings } from '../types';

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [script, setScript] = useState<Script | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [otherLinesMode, setOtherLinesMode] = useState<OtherLinesMode>('speak');
  const stopRequested = useRef(false);

  useEffect(() => {
    if (!id) return;
    db.scripts.get(id).then((s) => s && setScript(s));
    getSettings().then((s) => {
      setSettings(s);
      setOtherLinesMode(s.defaultOtherLinesMode);
    });
    ensureVoicesLoaded();
  }, [id]);

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
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{script.title}</h2>
        <div className="flex items-center gap-2 text-sm">
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
    </div>
  );
}
