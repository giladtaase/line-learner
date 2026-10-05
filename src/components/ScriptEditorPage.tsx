import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { v4 as uuid } from 'uuid';
import { db } from '../lib/db';
import type { Script, ScriptEntry } from '../types';

export default function ScriptEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [script, setScript] = useState<Script | null>(null);
  const [entries, setEntries] = useState<ScriptEntry[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [myCharacter, setMyCharacter] = useState<string>('');

  useEffect(() => {
    if (!id) return;
    db.scripts.get(id).then((s) => {
      if (!s) return;
      setScript(s);
      setEntries(s.entries);
      setCharacters(s.characters);
      setMyCharacter(s.myCharacter ?? s.characters[0] ?? '');
    });
  }, [id]);

  function recomputeCharacters(next: ScriptEntry[]) {
    const set = new Set<string>();
    next.forEach((e) => {
      if (e.type === 'line' && e.character) set.add(e.character);
    });
    const list = Array.from(set).sort((a, b) => a.localeCompare(b));
    setCharacters(list);
    if (!list.includes(myCharacter)) setMyCharacter(list[0] ?? '');
  }

  function updateEntry(index: number, patch: Partial<ScriptEntry>) {
    setEntries((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      recomputeCharacters(next);
      return next;
    });
  }

  function removeEntry(index: number) {
    setEntries((prev) => {
      const next = prev.filter((_, i) => i !== index);
      recomputeCharacters(next);
      return next;
    });
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
        character: myCharacter || characters[0] || '',
        text: ''
      });
      return next.map((e, i) => ({ ...e, order: i }));
    });
  }

  async function handleSave() {
    if (!script) return;
    const normalized = entries.map((e, i) => ({ ...e, order: i }));
    const updated: Script = {
      ...script,
      entries: normalized,
      characters,
      myCharacter: myCharacter || undefined,
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
      <div>
        <h2 className="text-xl font-semibold">{script.title}</h2>
        <p className="text-sm text-slate-600 mt-1">{t('editor.hint')}</p>
      </div>

      <div className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
        <label className="font-medium text-sm">{t('scripts.myCharacter')}</label>
        <select
          value={myCharacter}
          onChange={(e) => setMyCharacter(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="" disabled>
            {t('scripts.chooseCharacter')}
          </option>
          {characters.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {entries.map((entry, index) => (
          <div key={entry.id} className="bg-white rounded-lg shadow p-3 flex gap-2 items-start">
            <div className="flex flex-col gap-1 w-28 shrink-0">
              <select
                value={entry.type}
                onChange={(e) =>
                  updateEntry(index, {
                    type: e.target.value as ScriptEntry['type'],
                    character:
                      e.target.value === 'line' ? entry.character || characters[0] : undefined
                  })
                }
                className="border rounded px-1 py-1 text-xs"
              >
                <option value="line">{t('editor.line')}</option>
                <option value="direction">{t('editor.direction')}</option>
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
