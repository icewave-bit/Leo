import type { TaxReplenishment } from '../../api/types';
import type { useTaxRowState } from './useTaxRowState';

type TaxRowState = ReturnType<typeof useTaxRowState>;

export function TaxDateField({
  state,
  saving,
  onSave,
  className,
}: {
  state: TaxRowState;
  saving: boolean;
  onSave: (receivedOn: string) => void;
  className?: string;
}) {
  const { editingDate, dateDraft, setDateDraft, dateLabel, startDateEdit, cancelDateEdit, finishDateEdit } =
    state;

  if (editingDate) {
    return (
      <input
        className={'field__control tax-date-input tnum' + (className ? ' ' + className : '')}
        type="text"
        inputMode="numeric"
        value={dateDraft}
        disabled={saving}
        autoFocus
        onChange={(e) => setDateDraft(e.target.value)}
        onBlur={() => finishDateEdit(onSave)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') cancelDateEdit();
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={'tax-date-btn tnum' + (className ? ' ' + className : '')}
      title={`${dateLabel} — изменить`}
      disabled={saving}
      onClick={startDateEdit}
    >
      {dateLabel}
    </button>
  );
}

export function TaxPaidToggle({
  row,
  saving,
  onChange,
  variant = 'inline',
}: {
  row: TaxReplenishment;
  saving: boolean;
  onChange: (taxPaid: boolean) => void;
  variant?: 'inline' | 'card' | 'compact' | 'row';
}) {
  if (variant === 'compact') {
    return (
      <label className="tax-check tax-check--compact" title="Уплачен">
        <input
          type="checkbox"
          checked={row.taxPaid}
          disabled={saving}
          aria-label="Уплачен"
          onChange={(e) => onChange(e.target.checked)}
        />
      </label>
    );
  }

  if (variant === 'row') {
    return (
      <label className="tax-check tax-check--row">
        <input
          type="checkbox"
          checked={row.taxPaid}
          disabled={saving}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="tax-check__lbl">Уплачен</span>
      </label>
    );
  }

  return (
    <label className={'tax-check' + (variant === 'card' ? ' tax-check--card' : '')}>
      <input
        type="checkbox"
        checked={row.taxPaid}
        disabled={saving}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="tax-check__lbl">{variant === 'card' ? 'Налог уплачен' : 'Да'}</span>
    </label>
  );
}

export function TaxCommentField({
  state,
  saving,
  onBlur,
  compact = false,
}: {
  state: TaxRowState;
  saving: boolean;
  onBlur: (comment: string) => void;
  compact?: boolean;
}) {
  const { commentDraft, setCommentDraft } = state;

  return (
    <input
      className={'field__control tax-comment-input' + (compact ? ' tax-comment-input--compact' : '')}
      type="text"
      value={commentDraft}
      placeholder="Комментарий"
      disabled={saving}
      onChange={(e) => setCommentDraft(e.target.value)}
      onBlur={() => onBlur(commentDraft)}
    />
  );
}
