import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'accent';
type ButtonSize = 'md' | 'sm';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  secondary: 'border hover:bg-slate-50',
  danger: 'text-red-600 border border-red-200 hover:bg-red-50',
  accent: 'bg-amber-600 text-white hover:bg-amber-700'
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'px-4 py-2',
  sm: 'text-sm px-3 py-1.5'
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded disabled:opacity-40 disabled:pointer-events-none ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name, also shown as a tooltip. Required: the visible content is only a symbol. */
  label: string;
}

/** A button whose visible content is a symbol (◀, ✕, ↑), named for screen readers by `label`. */
export function IconButton({ label, className = '', type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`rounded disabled:opacity-40 disabled:pointer-events-none ${className}`}
      {...props}
    />
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  title: ReactNode;
  onClose: () => void;
  /** Rendered before the title, e.g. a back button. */
  headerStart?: ReactNode;
  children: ReactNode;
}

/**
 * Dialog over a dimmed backdrop. Escape and a backdrop click close it, Tab
 * stays inside it, and focus returns to where it was when it closes.
 */
export function Modal({ title, onClose, headerStart, children }: ModalProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialog?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <h3 id={titleId} className="font-semibold flex items-center gap-2">
            {headerStart}
            {title}
          </h3>
          <IconButton
            label={t('common.close')}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 px-1"
          >
            ✕
          </IconButton>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
