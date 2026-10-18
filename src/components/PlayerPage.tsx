import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { ensureVoicesLoaded } from '../lib/tts';
import { getMyCharacters } from '../lib/scriptParser';
import {
  sceneStarts,
  sceneNumberAt,
  previousSceneStart,
  nextSceneStart
} from '../lib/scenes';
import { nextCueIndex } from '../lib/playback';
import { usePlayback } from '../hooks/usePlayback';
import { useSettings } from '../settings/context';
import { Button, IconButton } from './ui';
import CurrentEntry from './player/CurrentEntry';
import JumpToDialog from './player/JumpToDialog';
import type { OtherLinesMode, ScriptEntry } from '../types';

const NO_ENTRIES: ScriptEntry[] = [];

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { settings } = useSettings();
  // undefined while loading, null if there's no such script.
  const script = useLiveQuery(async () => (id ? ((await db.scripts.get(id)) ?? null) : null), [id]);
  const [otherLinesMode, setOtherLinesMode] = useState<OtherLinesMode>(
    settings.defaultOtherLinesMode
  );
  const [showJumpTo, setShowJumpTo] = useState(false);

  useEffect(() => {
    ensureVoicesLoaded();
  }, []);

  const entries = script?.entries ?? NO_ENTRIES;
  const myCharacters = useMemo(() => (script ? getMyCharacters(script) : []), [script]);
  const isMine = useCallback(
    (entry: ScriptEntry): boolean => {
      if (entry.type !== 'line') return false;
      const names = entry.characters ?? (entry.character ? [entry.character] : []);
      return names.some((c) => myCharacters.includes(c));
    },
    [myCharacters]
  );

  const playback = usePlayback({
    entries,
    language: script?.language ?? 'en',
    isMine,
    otherLinesMode,
    ttsRate: settings.ttsRate
  });
  const { index, playing } = playback;

  if (script === undefined) return <p className="text-slate-500">{t('common.loading')}</p>;
  if (script === null) return <p className="text-slate-500">{t('player.scriptNotFound')}</p>;

  if (myCharacters.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-slate-600">{t('player.chooseYourCharacterFirst')}</p>
        <Button variant="primary" onClick={() => navigate(`/scripts/${script.id}/edit`)}>
          {t('editor.title')}
        </Button>
      </div>
    );
  }

  const currentEntry = entries[index];
  const isMyLine = currentEntry ? isMine(currentEntry) : false;
  const starts = sceneStarts(entries);
  const sceneNumber = sceneNumberAt(starts, index);
  const prevScene = previousSceneStart(starts, index);
  const nextScene = nextSceneStart(starts, index);
  const nextCue = nextCueIndex(entries, index, isMine);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-semibold">{script.title}</h2>
        <div className="flex items-center gap-3 text-sm flex-wrap">
          {starts.length > 0 && (
            <div className="flex items-center gap-1">
              <IconButton
                label={t('player.previousScene')}
                onClick={() => prevScene !== undefined && playback.jumpTo(prevScene)}
                disabled={prevScene === undefined}
                className="border px-2 py-1.5 hover:bg-slate-50"
              >
                ◀◀
              </IconButton>
              <span className="text-xs text-slate-500 px-1">
                {sceneNumber > 0
                  ? t('player.sceneCounter', { current: sceneNumber, total: starts.length })
                  : t('player.beforeFirstScene')}
              </span>
              <IconButton
                label={t('player.nextScene')}
                onClick={() => nextScene !== undefined && playback.jumpTo(nextScene)}
                disabled={nextScene === undefined}
                className="border px-2 py-1.5 hover:bg-slate-50"
              >
                ▶▶
              </IconButton>
            </div>
          )}
          <Button size="sm" onClick={() => setShowJumpTo(true)}>
            {t('player.jumpTo')}
          </Button>
          <label className="flex items-center gap-2">
            <span>{t('player.otherLinesMode')}:</span>
            <select
              value={otherLinesMode}
              onChange={(e) => setOtherLinesMode(e.target.value as OtherLinesMode)}
              className="border rounded px-2 py-1"
            >
              <option value="speak">{t('player.speak')}</option>
              <option value="display">{t('player.display')}</option>
            </select>
          </label>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 min-h-[160px] flex flex-col justify-center">
        {currentEntry && (
          <CurrentEntry
            key={currentEntry.id}
            entry={currentEntry}
            mine={isMyLine}
            otherLinesMode={otherLinesMode}
            scriptId={script.id}
            language={script.language}
          />
        )}
      </div>

      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Button onClick={() => playback.jumpTo(index - 1)} disabled={index === 0}>
          ◀ {t('player.previous')}
        </Button>
        {playing ? (
          <Button onClick={playback.pause}>{t('player.pause')}</Button>
        ) : isMyLine ? (
          <Button variant="accent" onClick={playback.continueAfterMyLine}>
            {t('player.continue')}
          </Button>
        ) : (
          <Button variant="primary" onClick={playback.play}>
            {t('player.play')}
          </Button>
        )}
        <Button onClick={playback.stop}>{t('player.stop')}</Button>
        <Button onClick={() => playback.jumpTo(index + 1)} disabled={index >= entries.length - 1}>
          {t('player.next')} ▶
        </Button>
        <Button
          onClick={() => nextCue !== undefined && playback.jumpTo(nextCue)}
          disabled={nextCue === undefined}
        >
          {t('player.skipToMyCue')} ⏭
        </Button>
      </div>

      <p className="text-center text-xs text-slate-400">
        {index + 1} / {entries.length}
      </p>

      {showJumpTo && (
        <JumpToDialog
          entries={entries}
          starts={starts}
          index={index}
          isMine={isMine}
          onJump={(i) => {
            playback.jumpTo(i);
            setShowJumpTo(false);
          }}
          onClose={() => setShowJumpTo(false)}
        />
      )}
    </div>
  );
}
