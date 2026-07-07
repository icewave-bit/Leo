import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

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
            <Icon icon="alert" size={22} />
          ) : (
            <Icon icon="alert-circle" size={22} />
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
