import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  variant = 'default',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div className="confirm-layer" role="presentation">
      <button
        type="button"
        className="confirm-layer__scrim"
        aria-label="Закрыть"
        disabled={loading}
        onClick={onCancel}
      />
      <div
        className={'confirm' + (variant === 'danger' ? ' confirm--danger' : '')}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div className="confirm__icon" aria-hidden="true">
          {variant === 'danger' ? (
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M12 9v5M12 17h.01" />
              <path d="M10.3 4.3h3.4l7.3 12.6a1.2 1.2 0 01-1 1.8H4a1.2 1.2 0 01-1-1.8l7.3-12.6z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="22" height="22">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5M12 16h.01" />
            </svg>
          )}
        </div>
        <h2 id={titleId} className="confirm__title">
          {title}
        </h2>
        <p id={descId} className="confirm__desc">
          {description}
        </p>
        {children}
        <div className="confirm__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={'btn' + (variant === 'danger' ? ' btn--danger' : ' btn--primary')}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <span className="spinner" aria-hidden="true" /> : null}
            {loading ? 'Подождите…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
