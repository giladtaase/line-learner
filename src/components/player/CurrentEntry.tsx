import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LineText from './LineText';
import RecordPanel from './RecordPanel';
import type { Language, OtherLinesMode, ScriptEntry } from '../../types';

interface CurrentEntryProps {
  entry: ScriptEntry;
  mine: boolean;
  otherLinesMode: OtherLinesMode;
  scriptId: string;
  language: Language;
}

/** The entry on stage right now. Render with `key={entry.id}` so per-line
 *  state (revealed text, recording) resets on every new line. */
export default function CurrentEntry({
  entry,
  mine,
  otherLinesMode,
  scriptId,
  language
}: CurrentEntryProps) {
  const { t } = useTranslation();
  // Your own line is hidden on every new line so you have to recall it
  // before peeking; otherwise there's no memorization practice happening.
  const [revealed, setRevealed] = useState(false);

  if (entry.type === 'scene') {
    return (
      <p className="text-center font-bold text-brand-800 text-xl uppercase tracking-wide">
        {entry.text}
      </p>
    );
  }
  if (entry.type === 'direction') {
    return <p className="italic text-slate-500 text-center">{entry.text}</p>;
  }

  return (
    <div className="text-center space-y-2">
      <p className="text-sm font-semibold text-brand-700">{entry.character}</p>
      {mine ? (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-2">
            {revealed ? (
              <p className="text-lg">
                <LineText text={entry.text} />
              </p>
            ) : (
              <p className="text-lg text-amber-300 select-none tracking-widest" aria-hidden="true">
                ••••••••••
              </p>
            )}
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="text-xs font-medium text-amber-700 border border-amber-300 rounded px-3 py-1 hover:bg-amber-100"
            >
              {revealed ? `🙈 ${t('player.hideLine')}` : `👁 ${t('player.showLine')}`}
            </button>
          </div>
          <p className="text-xs text-amber-700">{t('player.yourTurn')}</p>
          <RecordPanel scriptId={scriptId} language={language} entry={entry} />
        </>
      ) : otherLinesMode === 'display' ? (
        <p className="text-lg">
          <LineText text={entry.text} />
        </p>
      ) : (
        <p className="text-slate-400 italic">🔊 …</p>
      )}
    </div>
  );
}
