import type { ReactNode } from 'react';
import type { TaxDisplayCurrency, TaxReplenishment, WeekStartsOn } from '../../api/types';
import type { ViewStudent } from '../../utils/schedule';
import { JournalStudentChip } from '../payments/JournalStudentChip';
import { TaxCommentSpoiler } from './TaxCommentSpoiler';
import { TaxDateField, TaxPaidToggle } from './TaxRowFields';
import { useTaxRowState } from './useTaxRowState';

function TaxEntryCell({
  label,
  children,
  err,
  title,
}: {
  label: string;
  children: ReactNode;
  err?: boolean;
  title?: string;
}) {
  return (
    <div
      className={'tax-entry__cell' + (err ? ' tax-entry__cell--err' : '')}
      title={title}
    >
      <span className="tax-entry__cell-lbl">{label}</span>
      <div className="tax-entry__cell-val">{children}</div>
    </div>
  );
}

export function TaxJournalEntryCard({
  row,
  showStudent,
  showByn,
  taxColLabel,
  taxRatePercent,
  displayCurrency,
  weekStartsOn,
  students,
  saving,
  onTaxPaidChange,
  onCommentBlur,
  onReceivedOnSave,
  onDelete,
}: {
  row: TaxReplenishment;
  showStudent: boolean;
  showByn: boolean;
  taxColLabel: string;
  taxRatePercent: number;
  displayCurrency: TaxDisplayCurrency;
  weekStartsOn: WeekStartsOn;
  students: Map<string, ViewStudent>;
  saving: boolean;
  onTaxPaidChange: (taxPaid: boolean) => void;
  onCommentBlur: (comment: string) => void;
  onReceivedOnSave: (receivedOn: string) => void;
  onDelete: () => void;
}) {
  const state = useTaxRowState(row, weekStartsOn, taxRatePercent, displayCurrency);

  return (
    <article className={'tax-entry' + (saving ? ' tax-entry--saving' : '')}>
      <div className="tax-entry__top">
        {showStudent ? (
          <JournalStudentChip
            studentId={row.studentId}
            name={row.studentName}
            students={students}
          />
        ) : (
          <span className="tax-entry__top-spacer" aria-hidden="true" />
        )}
        <button
          type="button"
          className="tax-row-delete tax-entry__delete"
          title="Удалить из налогов"
          aria-label="Удалить из налогов"
          disabled={saving}
          onClick={onDelete}
        >
          ×
        </button>
      </div>

      <div className={'tax-entry__grid' + (showByn ? '' : ' tax-entry__grid--no-byn')}>
        <TaxEntryCell label="Дата">
          <TaxDateField
            state={state}
            saving={saving}
            onSave={onReceivedOnSave}
            className="tax-entry__date"
          />
        </TaxEntryCell>
        <TaxEntryCell label="Сумма (в валюте)">
          <span className="tnum">{state.amountLabel}</span>
        </TaxEntryCell>
        {showByn ? (
          <TaxEntryCell
            label="BYN (НБРБ)"
            err={Boolean(row.conversionError)}
            title={row.conversionError ?? `Курс на ${row.replenishmentDate}`}
          >
            <span className="tnum">{state.bynLabel}</span>
          </TaxEntryCell>
        ) : null}
        <TaxEntryCell label={taxColLabel}>
          <span className="tnum">{state.taxLabel}</span>
        </TaxEntryCell>
      </div>

      <div className="tax-entry__footer">
        <TaxPaidToggle
          row={row}
          saving={saving}
          variant="row"
          onChange={onTaxPaidChange}
        />
        <TaxCommentSpoiler
          state={state}
          saving={saving}
          onBlur={onCommentBlur}
        />
      </div>
    </article>
  );
}
