import { useTranslation } from 'react-i18next';

/** Where an import is: reading a PDF (page reached), or labelling the script with AI. */
export type AiStatus =
  | { phase: 'reading'; page: number; pages: number }
  | { phase: 'parsing'; fraction: number };

export default function AiProgress({ status }: { status: AiStatus }) {
  const { t } = useTranslation();

  if (status.phase === 'reading') {
    return (
      <p className="text-sm text-slate-500 mt-2" role="status">
        {status.page > 0
          ? t('scripts.readingPdfPage', { page: status.page, pages: status.pages })
          : t('scripts.readingPdf')}
      </p>
    );
  }

  const percent = Math.round(status.fraction * 100);
  return (
    <div className="mt-2" role="status">
      <p className="text-sm text-slate-500">
        {percent > 0 ? t('scripts.parsingWithAiProgress', { percent }) : t('scripts.parsingWithAi')}
      </p>
      <div
        className="mt-1 h-2 rounded bg-slate-200 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className="h-full bg-blue-500 transition-[width] duration-500"
          style={{ width: `${status.fraction * 100}%` }}
        />
      </div>
    </div>
  );
}
