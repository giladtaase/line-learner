import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../lib/db';
import { parseScript, extractTextFromFile, getMyCharacters } from '../lib/scriptParser';
import { exportScript, parseScriptFile, scriptFileToNewScript } from '../lib/scriptFile';
import { AppError } from '../lib/errors';
import { useErrorMessage } from '../hooks/useErrorMessage';
import { Button } from './ui';
import type { Script } from '../types';

export default function ScriptsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const scripts = useLiveQuery(() => db.scripts.orderBy('updatedAt').reverse().toArray(), []);
  const [pastedText, setPastedText] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  /** Runs an upload/import step with the busy flag set, showing any error. */
  async function withBusy(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function createFromText(rawText: string, fallbackTitle: string) {
    const { language, entries, characters } = parseScript(rawText);
    if (entries.length === 0) {
      throw new AppError('noLinesDetected', 'No lines could be detected in this script.');
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
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await withBusy(async () => {
      const text = await extractTextFromFile(file);
      await createFromText(text, file.name.replace(/\.[^.]+$/, ''));
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handlePasteSubmit() {
    if (!pastedText.trim()) return;
    await withBusy(() => createFromText(pastedText, t('scripts.untitled')));
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await withBusy(async () => {
      const newScript = scriptFileToNewScript(parseScriptFile(await file.text()), uuid());
      await db.scripts.put(newScript);
      navigate(`/scripts/${newScript.id}/edit`);
    });
    if (importInputRef.current) importInputRef.current.value = '';
  }

  async function handleDelete(script: Script) {
    if (!window.confirm(t('scripts.confirmDelete', { title: script.title }))) return;
    await db.scripts.delete(script.id);
    await db.attempts.where('scriptId').equals(script.id).delete();
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow p-4 space-y-3">
        <h2 className="font-semibold text-lg">{t('scripts.upload')}</h2>
        <p className="text-sm text-slate-600">{t('scripts.uploadHint')}</p>

        <div>
          <label htmlFor="script-title" className="block text-sm font-medium mb-1">
            {t('scripts.titleLabel')}
          </label>
          <input
            id="script-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('scripts.titlePlaceholder')}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.docx"
            aria-label={t('scripts.upload')}
            onChange={handleFileChange}
            disabled={busy}
            className="text-sm"
          />
        </div>

        <div>
          <label htmlFor="script-paste" className="block text-sm font-medium mb-1">
            {t('scripts.pasteLabel')}
          </label>
          <textarea
            id="script-paste"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            placeholder={t('scripts.pastePlaceholder')}
            rows={6}
            className="w-full border rounded px-3 py-2 font-mono text-sm"
          />
          <Button
            variant="primary"
            onClick={handlePasteSubmit}
            disabled={busy || !pastedText.trim()}
            className="mt-2"
          >
            {busy ? t('scripts.parsing') : t('scripts.parse')}
          </Button>
        </div>

        {error && (
          <p className="text-red-600 text-sm" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="bg-white rounded-lg shadow p-4 space-y-2">
        <h2 className="font-semibold text-lg">{t('scripts.importTitle')}</h2>
        <p className="text-sm text-slate-600">{t('scripts.importHint')}</p>
        <input
          ref={importInputRef}
          type="file"
          accept=".json"
          aria-label={t('scripts.importTitle')}
          onChange={handleImportFile}
          disabled={busy}
          className="text-sm"
        />
      </section>

      <section className="space-y-2">
        {(!scripts || scripts.length === 0) && (
          <p className="text-slate-500 text-sm">{t('scripts.empty')}</p>
        )}
        {scripts?.map((script) => {
          const mine = getMyCharacters(script);
          return (
            <div
              key={script.id}
              className="bg-white rounded-lg shadow p-4 flex items-center justify-between gap-3 flex-wrap"
            >
              <div>
                <h3 className="font-medium">{script.title}</h3>
                <p className="text-xs text-slate-500">
                  {t('scripts.entries', { count: script.entries.length })} ·{' '}
                  {script.language === 'he' ? 'עברית' : 'English'}
                  {mine.length > 0 ? ` · ${mine.join(', ')}` : ''}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => navigate(`/scripts/${script.id}/play`)}
                >
                  {t('scripts.open')}
                </Button>
                <Button size="sm" onClick={() => navigate(`/scripts/${script.id}/edit`)}>
                  {t('editor.title')}
                </Button>
                <Button size="sm" onClick={() => exportScript(script)} title={t('scripts.exportHint')}>
                  {t('scripts.export')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => handleDelete(script)}>
                  {t('scripts.delete')}
                </Button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
