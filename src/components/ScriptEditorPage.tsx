import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { v4 as uuid } from 'uuid';
import { db } from '../lib/db';
import { recomputeEntryCharacters, getMyCharacters } from '../lib/scriptParser';
import { exportScript } from '../lib/scriptFile';
import { Button, IconButton } from './ui';
import type { Script, ScriptEntry } from '../types';

const ROW_BUTTON = 'text-xs border px-1.5 py-0.5 hover:bg-slate-50';

export default function ScriptEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [script, setScript] = useState<Script | null>(null);
  // Entries as edited; joint-cue resolution and the character list are
  // derived from them below rather than kept in separate state.
  const [entries, setEntries] = useState<ScriptEntry[]>([]);
  const [myCharacters, setMyCharacters] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Set right before navigating away after a successful save, when `dirty`
  // in this render is still true.
  const saved = useRef(false);

  useEffect(() => {
    if (!id) return;
    db.scripts.get(id).then((s) => {
      if (!s) return;
      setScript(s);
      setEntries(s.entries);
      // No role is preselected: guessing one (e.g. the first name
      // alphabetically) would silently start practice as the wrong character.
      setMyCharacters(getMyCharacters(s));
    });
  }, [id]);

  const resolved = useMemo(() => recomputeEntryCharacters(entries), [entries]);
  const characters = resolved.characters;
  // Ignore selections for characters that no longer exist after edits.
  const selectedCharacters = myCharacters.filter((c) => characters.includes(c));

  // Every way out of the editor inside the app (header links, Back, the
  // browser's back button) asks before discarding edits.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !saved.current && currentLocation.pathname !== nextLocation.pathname
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(t('editor.unsavedChanges'))) blocker.proceed();
    else blocker.reset();
  }, [blocker, t]);

  useEffect(() => {
    if (!dirty) return;
    // Closing or reloading the tab is outside the router; the browser asks instead.
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function editEntries(change: (prev: ScriptEntry[]) => ScriptEntry[]) {
    setEntries(change);
    setDirty(true);
  }

  function toggleMyCharacter(name: string) {
    setMyCharacters((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
    setDirty(true);
    setSaveError(null);
  }

  function updateEntry(index: number, patch: Partial<ScriptEntry>) {
    editEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  function removeEntry(index: number) {
    editEntries((prev) => prev.filter((_, i) => i !== index));
  }

  function moveEntry(index: number, direction: -1 | 1) {
    editEntries((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addRow(index: number) {
    editEntries((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, {
        id: uuid(),
        order: 0,
        type: 'line',
        character: selectedCharacters[0] || characters[0] || '',
        text: ''
      });
      return next;
    });
  }

  function normalizedEntries(): ScriptEntry[] {
    return resolved.entries.map((e, i) => ({ ...e, order: i }));
  }

  async function handleSave() {
    if (!script) return;
    if (selectedCharacters.length === 0) {
      setSaveError(t('editor.chooseCharacterRequired'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await db.scripts.put({
      ...script,
      entries: normalizedEntries(),
      characters,
      myCharacter: undefined,
      myCharacters: selectedCharacters,
      updatedAt: Date.now()
    });
    saved.current = true;
    setDirty(false);
    navigate(`/scripts/${script.id}/play`);
  }

  function handleExport() {
    if (!script) return;
    void exportScript({ ...script, entries: normalizedEntries(), characters });
  }

  if (!script) {
    return <p className="text-slate-500">{t('common.loading')}</p>;
  }

  const actions = (
    <>
      <Button onClick={() => navigate('/')}>{t('common.back')}</Button>
      <Button onClick={handleExport} title={t('scripts.exportHint')}>
        {t('scripts.export')}
      </Button>
      <Button variant="primary" onClick={handleSave}>
        {t('scripts.save')}
      </Button>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">{script.title}</h2>
          <p className="text-sm text-slate-600 mt-1">{t('editor.hint')}</p>
        </div>
        <div className="flex gap-2 shrink-0">{actions}</div>
      </div>

      <fieldset className="bg-white rounded-lg shadow p-4 space-y-2">
        <legend className="sr-only">{t('scripts.myCharacter')}</legend>
        <p className="font-medium text-sm" aria-hidden="true">
          {t('scripts.myCharacter')}
        </p>
        <p className="text-xs text-slate-500">{t('scripts.chooseCharacter')}</p>
        {saveError && (
          <p className="text-sm text-red-600" role="alert">
            {saveError}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {characters.map((c) => {
            const selected = myCharacters.includes(c);
            return (
              <button
                key={c}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleMyCharacter(c)}
                className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${
                  selected
                    ? 'bg-amber-600 border-amber-600 text-white'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {selected ? '✓ ' : ''}
                {c}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        {entries.map((entry, index) => (
          <div
            key={entry.id}
            className={`rounded-lg shadow p-3 flex gap-2 items-start ${
              entry.type === 'scene' ? 'bg-brand-50 border border-brand-200' : 'bg-white'
            }`}
          >
            <div className="flex flex-col gap-1 w-28 shrink-0">
              <select
                aria-label={t('editor.type')}
                value={entry.type}
                onChange={(e) =>
                  updateEntry(index, {
                    type: e.target.value as ScriptEntry['type'],
                    character:
                      e.target.value === 'line' ? entry.character || characters[0] : undefined,
                    characters: e.target.value === 'line' ? entry.characters : undefined
                  })
                }
                className="border rounded px-1 py-1 text-xs"
              >
                <option value="line">{t('editor.line')}</option>
                <option value="direction">{t('editor.direction')}</option>
                <option value="scene">{t('editor.scene')}</option>
              </select>
              {entry.type === 'line' && (
                <input
                  type="text"
                  aria-label={t('editor.character')}
                  value={entry.character ?? ''}
                  onChange={(e) => updateEntry(index, { character: e.target.value })}
                  className="border rounded px-1 py-1 text-xs"
                  placeholder={t('editor.character')}
                />
              )}
            </div>
            <textarea
              aria-label={t('editor.text')}
              value={entry.text}
              onChange={(e) => updateEntry(index, { text: e.target.value })}
              rows={2}
              className="flex-1 border rounded px-2 py-1 text-sm"
            />
            <div className="flex flex-col gap-1 shrink-0">
              <IconButton label={t('editor.moveUp')} onClick={() => moveEntry(index, -1)} className={ROW_BUTTON}>
                ↑
              </IconButton>
              <IconButton label={t('editor.moveDown')} onClick={() => moveEntry(index, 1)} className={ROW_BUTTON}>
                ↓
              </IconButton>
              <IconButton label={t('editor.addRow')} onClick={() => addRow(index)} className={ROW_BUTTON}>
                +
              </IconButton>
              <IconButton
                label={t('editor.removeRow')}
                onClick={() => removeEntry(index)}
                className="text-xs border border-red-200 text-red-600 px-1.5 py-0.5 hover:bg-red-50"
              >
                ×
              </IconButton>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pb-6">{actions}</div>
    </div>
  );
}
