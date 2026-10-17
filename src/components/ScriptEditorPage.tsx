import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { v4 as uuid } from 'uuid';
import { db } from '../lib/db';
import { recomputeEntryCharacters, getMyCharacters } from '../lib/scriptParser';
import { downloadScriptFile, shareScriptFile } from '../lib/scriptFile';
import type { Script, ScriptEntry } from '../types';

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

  useEffect(() => {
    if (!dirty) return;
    // Warn before closing/reloading the tab with unsaved edits.
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

  function handleBack() {
    if (dirty && !window.confirm(t('editor.unsavedChanges'))) return;
    navigate('/');
  }

  async function handleSave() {
    if (!script) return;
    if (selectedCharacters.length === 0) {
      setSaveError(t('editor.chooseCharacterRequired'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const updated: Script = {
      ...script,
      entries: normalizedEntries(),
      characters,
      myCharacter: undefined,
      myCharacters: selectedCharacters,
      updatedAt: Date.now()
    };
    await db.scripts.put(updated);
    setDirty(false);
    navigate(`/scripts/${script.id}/play`);
  }

  async function handleExport() {
    if (!script) return;
    const exportScript = { ...script, entries: normalizedEntries(), characters };
    const shared = await shareScriptFile(exportScript);
    if (!shared) {
      // Not supported on this device/browser (typically desktop) — fall
      // back to a plain file download instead.
      downloadScriptFile(exportScript);
    }
  }

  if (!script) {
    return <p className="text-slate-500">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">{script.title}</h2>
          <p className="text-sm text-slate-600 mt-1">{t('editor.hint')}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleBack}
            className="border px-4 py-2 rounded hover:bg-slate-50"
          >
            {t('common.back')}
          </button>
          <button
            onClick={handleExport}
            className="border px-4 py-2 rounded hover:bg-slate-50"
            title={t('scripts.exportHint') ?? ''}
          >
            {t('scripts.export')}
          </button>
          <button
            onClick={handleSave}
            className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700"
          >
            {t('scripts.save')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-2">
        <label className="font-medium text-sm block">{t('scripts.myCharacter')}</label>
        <p className="text-xs text-slate-500">{t('scripts.chooseCharacter')}</p>
        {saveError && <p className="text-sm text-red-600">{saveError}</p>}
        <div className="flex flex-wrap gap-2">
          {characters.map((c) => {
            const selected = myCharacters.includes(c);
            return (
              <button
                key={c}
                type="button"
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
      </div>

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
                  value={entry.character ?? ''}
                  onChange={(e) => updateEntry(index, { character: e.target.value })}
                  className="border rounded px-1 py-1 text-xs"
                  placeholder={t('editor.character') ?? ''}
                />
              )}
            </div>
            <textarea
              value={entry.text}
              onChange={(e) => updateEntry(index, { text: e.target.value })}
              rows={2}
              className="flex-1 border rounded px-2 py-1 text-sm"
            />
            <div className="flex flex-col gap-1 shrink-0">
              <button
                onClick={() => moveEntry(index, -1)}
                className="text-xs border rounded px-1.5 py-0.5 hover:bg-slate-50"
                title={t('editor.moveUp') ?? ''}
              >
                ↑
              </button>
              <button
                onClick={() => moveEntry(index, 1)}
                className="text-xs border rounded px-1.5 py-0.5 hover:bg-slate-50"
                title={t('editor.moveDown') ?? ''}
              >
                ↓
              </button>
              <button
                onClick={() => addRow(index)}
                className="text-xs border rounded px-1.5 py-0.5 hover:bg-slate-50"
                title={t('editor.addRow') ?? ''}
              >
                +
              </button>
              <button
                onClick={() => removeEntry(index)}
                className="text-xs border border-red-200 text-red-600 rounded px-1.5 py-0.5 hover:bg-red-50"
                title={t('editor.removeRow') ?? ''}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2 pb-6">
        <button onClick={handleBack} className="border px-4 py-2 rounded hover:bg-slate-50">
          {t('common.back')}
        </button>
        <button
          onClick={handleExport}
          className="border px-4 py-2 rounded hover:bg-slate-50"
          title={t('scripts.exportHint') ?? ''}
        >
          {t('scripts.export')}
        </button>
        <button
          onClick={handleSave}
          className="bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700"
        >
          {t('scripts.save')}
        </button>
      </div>
    </div>
  );
}
