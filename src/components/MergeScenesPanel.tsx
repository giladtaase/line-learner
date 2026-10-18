import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readScriptFile, SCRIPT_FILE_TYPES } from '../lib/readScriptFile';
import { planSceneMerge, type MergePlan } from '../lib/sceneMerge';
import { useErrorMessage } from '../hooks/useErrorMessage';
import { useSettings } from '../settings/context';
import { Button } from './ui';
import AiProgress, { type AiStatus } from './AiProgress';
import type { ScriptEntry } from '../types';

const MAX_HEADING = 40;
const shortHeading = (text: string) => (text.length > MAX_HEADING ? `${text.slice(0, MAX_HEADING)}…` : text);

/**
 * Updates some scenes of the script from a file holding their new versions
 * (e.g. a PDF of rewritten scenes 9-12). Always parsed with Claude: it drops
 * editing notes and keeps character names consistent with the rest of the play.
 * Shows what will be replaced, and hands the parsed scenes to `onApply`.
 */
export default function MergeScenesPanel({
  entries,
  characters,
  onApply
}: {
  entries: ScriptEntry[];
  characters: string[];
  onApply: (update: ScriptEntry[]) => void;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const { settings } = useSettings();
  const anthropicKey = settings.anthropicApiKey ?? '';
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ update: ScriptEntry[]; plan: MergePlan } | null>(null);
  const [applied, setApplied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = status !== null;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPending(null);
    setApplied(false);
    setStatus({ phase: 'reading', page: 0, pages: 0 });
    try {
      const { text, pdf } = await readScriptFile(file, (page, pages) =>
        setStatus({ phase: 'reading', page, pages })
      );
      setStatus({ phase: 'parsing', fraction: 0 });
      const { parseScriptWithAI } = await import('../lib/aiParser');
      const { entries: update } = await parseScriptWithAI(text, anthropicKey, {
        pdf,
        knownCharacters: characters,
        onProgress: (fraction) => setStatus({ phase: 'parsing', fraction })
      });
      setPending({ update, plan: planSceneMerge(entries, update) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStatus(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function apply() {
    if (!pending) return;
    onApply(pending.update);
    setPending(null);
    setApplied(true);
  }

  return (
    <section className="bg-white rounded-lg shadow p-4 space-y-2">
      <h3 className="font-medium text-sm">{t('merge.title')}</h3>
      <p className="text-xs text-slate-500">{anthropicKey ? t('merge.hint') : t('merge.noKey')}</p>
      <input
        ref={inputRef}
        type="file"
        accept={SCRIPT_FILE_TYPES}
        aria-label={t('merge.title')}
        onChange={handleFile}
        disabled={!anthropicKey || busy}
        className="text-sm"
      />
      {status && <AiProgress status={status} />}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {applied && (
        <p className="text-sm text-green-700" role="status">
          {t('merge.applied')}
        </p>
      )}

      {pending && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 space-y-2">
          <p className="text-sm font-medium">{t('merge.previewTitle')}</p>
          <ul className="text-sm space-y-1 list-disc ps-5">
            {pending.plan.runs.map((run) => (
              <li key={run.start}>
                {run.removed.length > 0
                  ? t('merge.replace', {
                      removed: run.removed.map(shortHeading).join(' · '),
                      added: run.added.map(shortHeading).join(' · ')
                    })
                  : t('merge.insert', { added: run.added.map(shortHeading).join(' · ') })}{' '}
                <span className="text-slate-500">
                  {t('merge.rows', { from: run.end - run.start, to: run.entries.length })}
                </span>
              </li>
            ))}
          </ul>
          {pending.plan.newCharacters.length > 0 && (
            <p className="text-xs text-amber-800">
              {t('merge.newCharacters', { names: pending.plan.newCharacters.join(', ') })}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={apply}>
              {t('merge.apply')}
            </Button>
            <Button size="sm" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
