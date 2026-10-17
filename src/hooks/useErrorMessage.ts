import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AppError } from '../lib/errors';

/** Returns a function that turns any caught error into a message in the
 *  current UI language (falling back to the error's own message). */
export function useErrorMessage(): (err: unknown) => string {
  const { t } = useTranslation();
  return useCallback(
    (err: unknown) => {
      if (err instanceof AppError) return t(`errors.${err.code}`, err.params);
      return err instanceof Error ? err.message : String(err);
    },
    [t]
  );
}
