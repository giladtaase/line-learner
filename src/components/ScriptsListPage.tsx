import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { db } from '../lib/db';
import { parseScript, getMyCharacters, type ParseResult } from '../lib/scriptParser';
import { readScriptFile, SCRIPT_FILE_TYPES } from '../lib/readScriptFile';
import { useSettings } from '../settings/context';
import { exportScript, parseScriptFile, scriptFileToNewScript } from '../lib/scriptFile';
import { AppError } from '../lib/errors';
import { useErrorMessage } from '../hooks/useErrorMessage';
import { Button } from './ui';
import AiProgress, { type AiStatus } from './AiProgress';
import type { Script } from '../types';

export default function ScriptsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const { settings } = useSettings();
  const anthropicKey = settings.anthropicApiKey ?? '';
  // On by default once a key is set; the checkbox can turn it off per upload.
  const [useAi, setUseAi] = useState(true);
  const aiSelected = useAi && anthropicKey !== '';
  const scripts = useLiveQuery(() => db.scripts.orderBy('updatedAt').reverse().toArray(), []);
  const [pastedText, setPastedText] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  /** Progress of a Claude step (reading a PDF, AI parsing) while one runs. */
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
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
      setAiStatus(null);
    }
  }

  async function parse(rawText: string, pdf?: ArrayBuffer): Promise<ParseResult> {
    if (!aiSelected) return parseScript(rawText);
    // Loaded on demand: the SDK only downloads for people who parse with AI.
    const { parseScriptWithAI } = await import('../lib/aiParser');
    setAiStatus({ phase: 'parsing', fraction: 0 });
    return parseScriptWithAI(rawText, anthropicKey, {
      pdf,
      onProgress: (fraction) => setAiStatus({ phase: 'parsing', fraction })
    });
  }

  async function createFromText(rawText: string, fallbackTitle: string, pdf?: ArrayBuffer) {
    const { language, entries, characters } = await parse(rawText, pdf);
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
      const { text, pdf } = await readScriptFile(file, (page, pages) =>
        setAiStatus({ phase: 'reading', page, pages })
      );
      await createFromText(text, file.name.replace(/\.[^.]+$/, ''), pdf);
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

        <div className="rounded border border-slate-200 bg-slate-50 p-3 space-y-1">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={aiSelected}
              disabled={!anthropicKey || busy}
              onChange={(e) => setUseAi(e.target.checked)}
            />
            {t('scripts.useAi')}
          </label>
          <p className="text-xs text-slate-500">
            {anthropicKey ? t('scripts.useAiHint') : t('scripts.useAiNoKey')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={SCRIPT_FILE_TYPES}
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
          {busy && aiStatus && <AiProgress status={aiStatus} />}
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
