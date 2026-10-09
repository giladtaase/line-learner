import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../lib/db';
import { parseScript, extractTextFromFile, getMyCharacters } from '../lib/scriptParser';
import {
  downloadScriptFile,
  parseScriptFile,
  scriptFileToNewScript,
  ScriptFileParseError
} from '../lib/scriptFile';
import type { Script } from '../types';

export default function ScriptsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scripts = useLiveQuery(() => db.scripts.orderBy('updatedAt').reverse().toArray(), []);
  const [pastedText, setPastedText] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  async function createFromText(rawText: string, fallbackTitle: string) {
    setBusy(true);
    setError(null);
    try {
      const { language, entries, characters } = parseScript(rawText);
      if (entries.length === 0) {
        setError('No lines could be detected in this script.');
        setBusy(false);
        return;
      }
      const now = Date.now();
      const script: Script = {
        id: uuid(),
        title: title.trim() || fallbackTitle,
        language,
        characters,
        entries,
        createdAt: now,
        updatedAt: now
      };
      await db.scripts.put(script);
      navigate(`/scripts/${script.id}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await extractTextFromFile(file);
    const fallbackTitle = file.name.replace(/\.[^.]+$/, '');
    await createFromText(text, fallbackTitle);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handlePasteSubmit() {
    if (!pastedText.trim()) return;
    await createFromText(pastedText, 'Untitled script');
  }

  async function handleDelete(id: string) {
    await db.scripts.delete(id);
    await db.attempts.where('scriptId').equals(id).delete();
  }

  function handleExport(script: Script) {
    downloadScriptFile(script);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const scriptFile = parseScriptFile(text);
      const newScript = scriptFileToNewScript(scriptFile, uuid());
      await db.scripts.put(newScript);
      navigate(`/scripts/${newScript.id}/edit`);
    } catch (err) {
      setError(
        err instanceof ScriptFileParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
      );
    } finally {
      setBusy(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow p-4 space-y-3">
        <h2 className="font-semibold text-lg">{t('scripts.upload')}</h2>
        <p className="text-sm text-slate-600">{t('scripts.uploadHint')}</p>

        <div>
          <label className="block text-sm font-medium mb-1">{t('scripts.titleLabel')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('scripts.titlePlaceholder') ?? ''}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.docx"
            onChange={handleFileChange}
            disabled={busy}
            className="text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">{t('scripts.pasteLabel')}</label>
          <textarea
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder={t('scripts.pastePlaceholder') ?? ''}
            rows={6}
            className="w-full border rounded px-3 py-2 font-mono text-sm"
          />
          <button
            onClick={handlePasteSubmit}
            disabled={busy || !pastedText.trim()}
            className="mt-2 bg-brand-600 text-white px-4 py-2 rounded hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? t('scripts.parsing') : t('scripts.parse')}
          </button>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </section>

      <section className="bg-white rounded-lg shadow p-4 space-y-2">
        <h2 className="font-semibold text-lg">{t('scripts.importTitle')}</h2>
        <p className="text-sm text-slate-600">{t('scripts.importHint')}</p>
        <input
          ref={importInputRef}
          type="file"
          accept=".json"
          onChange={handleImportFile}
          disabled={busy}
          className="text-sm"
        />
      </section>

      <section className="space-y-2">
        {(!scripts || scripts.length === 0) && (
          <p className="text-slate-500 text-sm">{t('scripts.empty')}</p>
        )}
        {scripts?.map((script) => (
          <div
            key={script.id}
            className="bg-white rounded-lg shadow p-4 flex items-center justify-between"
          >
            <div>
              <h3 className="font-medium">{script.title}</h3>
              <p className="text-xs text-slate-500">
                {t('scripts.entries', { count: script.entries.length })} ·{' '}
                {script.language === 'he' ? 'עברית' : 'English'}
                {(() => {
                  const mine = getMyCharacters(script);
                  return mine.length > 0 ? ` · ${mine.join(', ')}` : '';
                })()}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/scripts/${script.id}/play`)}
                className="text-sm bg-brand-600 text-white px-3 py-1.5 rounded hover:bg-brand-700"
              >
                {t('scripts.open')}
              </button>
              <button
                onClick={() => navigate(`/scripts/${script.id}/edit`)}
                className="text-sm border px-3 py-1.5 rounded hover:bg-slate-50"
              >
                {t('editor.title')}
              </button>
              <button
                onClick={() => handleExport(script)}
                className="text-sm border px-3 py-1.5 rounded hover:bg-slate-50"
                title={t('scripts.exportHint') ?? ''}
              >
                {t('scripts.export')}
              </button>
              <button
                onClick={() => handleDelete(script.id)}
                className="text-sm text-red-600 border border-red-200 px-3 py-1.5 rounded hover:bg-red-50"
              >
                {t('scripts.delete')}
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
