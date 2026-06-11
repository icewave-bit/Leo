import type { TaxDisplayCurrency, TaxReplenishment, WeekStartsOn } from '../../api/types';
import type { ViewStudent } from '../../utils/schedule';
import { JournalStudentChip } from '../payments/JournalStudentChip';
import { TaxCommentSpoiler } from './TaxCommentSpoiler';
import { TaxDateField, TaxPaidToggle } from './TaxRowFields';
import { useTaxRowState } from './useTaxRowState';

export function TaxTableRow({
  row,
  showStudent,
  showByn,
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
    <tr className={saving ? 'tax-journal-table__row--saving' : undefined}>
      <td className="tax-journal-table__when">
        <TaxDateField state={state} saving={saving} onSave={onReceivedOnSave} />
      </td>
      {showStudent ? (
        <td className="tax-journal-table__col-student">
          <JournalStudentChip
            studentId={row.studentId}
            name={row.studentName}
            students={students}
          />
        </td>
      ) : null}
      <td className="tnum tax-journal-table__num tax-journal-table__col-amt">
        {state.amountLabel}
      </td>
      {showByn ? (
        <td
          className={
            'tnum tax-journal-table__num tax-journal-table__col-byn' +
            (row.conversionError ? ' tax-journal-table__num--err' : '')
          }
          title={row.conversionError ?? `Курс на ${row.replenishmentDate}`}
        >
          {state.bynLabel}
        </td>
      ) : null}
      <td className="tnum tax-journal-table__num tax-journal-table__col-tax">{state.taxLabel}</td>
      <td className="tax-journal-table__tax">
        <TaxPaidToggle row={row} saving={saving} variant="compact" onChange={onTaxPaidChange} />
      </td>
      <td className="tax-journal-table__comment">
        <TaxCommentSpoiler
          state={state}
          saving={saving}
          variant="table"
          onBlur={onCommentBlur}
        />
      </td>
      <td className="tax-journal-table__actions">
        <button
          type="button"
          className="tax-row-delete"
          title="Удалить из налогов"
          aria-label="Удалить из налогов"
          disabled={saving}
          onClick={onDelete}
        >
          ×
        </button>
      </td>
    </tr>
  );
}
