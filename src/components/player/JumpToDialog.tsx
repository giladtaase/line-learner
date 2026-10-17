import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, IconButton } from '../ui';
import { sceneRange } from '../../lib/scenes';
import type { ScriptEntry } from '../../types';

interface JumpToDialogProps {
  entries: ScriptEntry[];
  /** Indices of scene headings (see lib/scenes). */
  starts: number[];
  index: number;
  isMine: (entry: ScriptEntry) => boolean;
  onJump: (index: number) => void;
  onClose: () => void;
}

/**
 * Picks an entry to jump to. With scenes: a scene list first, then the
 * chosen scene's lines. Without: one flat list of every entry.
 */
export default function JumpToDialog({
  entries,
  starts,
  index,
  isMine,
  onJump,
  onClose
}: JumpToDialogProps) {
  const { t } = useTranslation();
  // Position in `starts` of the scene being browsed, or null for the scene list.
  const [openScene, setOpenScene] = useState<number | null>(null);

  function entryRow(entry: ScriptEntry, i: number) {
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => onJump(i)}
        className={`w-full text-start px-4 py-2 border-b hover:bg-slate-50 ${i === index ? 'bg-brand-50' : ''}`}
      >
        {entry.type === 'line' ? (
          <span className="text-sm">
            <span className={`font-semibold ${isMine(entry) ? 'text-amber-700' : 'text-brand-700'}`}>
              {entry.character}:
            </span>{' '}
            {entry.text}
          </span>
        ) : (
          <span className="italic text-slate-500 text-sm">{entry.text}</span>
        )}
      </button>
    );
  }

  if (starts.length === 0) {
    return (
      <Modal title={t('player.jumpToTitle')} onClose={onClose}>
        {entries.map(entryRow)}
      </Modal>
    );
  }

  if (openScene === null) {
    return (
      <Modal title={t('player.jumpToTitle')} onClose={onClose}>
        {starts.map((start, sIdx) => {
          const { end } = sceneRange(starts, sIdx, entries.length);
          const lineCount = entries.slice(start + 1, end).filter((e) => e.type === 'line').length;
          return (
            <button
              key={entries[start].id}
              type="button"
              onClick={() => setOpenScene(sIdx)}
              className={`w-full text-start px-4 py-3 border-b hover:bg-slate-50 flex items-center justify-between ${
                start <= index && index < end ? 'bg-brand-50' : ''
              }`}
            >
              <span className="font-bold text-brand-800 uppercase tracking-wide text-sm">
                {entries[start].text}
              </span>
              <span className="text-xs text-slate-400 shrink-0 ms-2">
                {t('scripts.entries', { count: lineCount })}
              </span>
            </button>
          );
        })}
      </Modal>
    );
  }

  const { start, end } = sceneRange(starts, openScene, entries.length);
  return (
    <Modal
      title={entries[start].text}
      onClose={onClose}
      headerStart={
        <IconButton
          label={t('player.backToScenes')}
          onClick={() => setOpenScene(null)}
          className="text-brand-600 hover:text-brand-800 text-sm px-1"
        >
          ◀
        </IconButton>
      }
    >
      {entries.slice(start + 1, end).map((entry, offset) => entryRow(entry, start + 1 + offset))}
    </Modal>
  );
}
