import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { v4 as uuid } from 'uuid';
import { db } from '../lib/db';
import { recomputeEntryCharacters, getMyCharacters } from '../lib/scriptParser';
import type { Script, ScriptEntry } from '../types';

export default function ScriptEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [script, setScript] = useState<Script | null>(null);
  const [entries, setEntries] = useState<ScriptEntry[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [myCharacters, setMyCharacters] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    db.scripts.get(id).then((s) => {
      if (!s) return;
      setScript(s);
      setEntries(s.entries);
      setCharacters(s.characters);
      const existing = getMyCharacters(s);
      setMyCharacters(existing.length > 0 ? existing : s.characters.slice(0, 1));
    });
  }, [id]);

  function applyRecompute(next: ScriptEntry[]): ScriptEntry[] {
    const { entries: resolved, characters: list } = recomputeEntryCharacters(next);
    setCharacters(list);
    setMyCharacters((prev) => {
      const stillValid = prev.filter((c) => list.includes(c));
      return stillValid.length > 0 ? stillValid : list.slice(0, 1);
    });
    return resolved;
  }

  function toggleMyCharacter(name: string) {
    setMyCharacters((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }

  function updateEntry(index: number, patch: Partial<ScriptEntry>) {
    setEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return applyRecompute(next);
    });
  }

  function removeEntry(index: number) {
    setEntries((prev) => applyRecompute(prev.filter((_, i) => i !== index)));
  }

  function moveEntry(index: number, direction: -1 | 1) {
    setEntries((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addRow(index: number) {
    setEntries((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, {
        id: uuid(),
        order: 0,
        type: 'line',
        character: myCharacters[0] || characters[0] || '',
        text: ''
      });
      return applyRecompute(next.map((e, i) => ({ ...e, order: i })));
    });
  }

  async function handleSave() {
    if (!script) return;
    const { entries: resolved, characters: list } = recomputeEntryCharacters(entries);
    const normalized = resolved.map((e, i) => ({ ...e, order: i }));
    const updated: Script = {
      ...script,
      entries: normalized,
      characters: list,
      myCharacter: undefined,
      myCharacters: myCharacters.length > 0 ? myCharacters : undefined,
      updatedAt: Date.now()
    };
    await db.scripts.put(updated);
    navigate(`/scripts/${script.id}/play`);
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
            onClick={() => navigate('/')}
            className="border px-4 py-2 rounded hover:bg-slate-50"
          >
            {t('common.back')}
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
        <button onClick={() => navigate('/')} className="border px-4 py-2 rounded hover:bg-slate-50">
          {t('common.back')}
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
