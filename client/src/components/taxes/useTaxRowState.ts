import { useEffect, useState } from 'react';
import type { TaxDisplayCurrency, TaxReplenishment, WeekStartsOn } from '../../api/types';
import { fmtDateKey, parseDateKey } from '../../utils/dateKey';
import { fmtByn } from '../../utils/format';
import { fmtTaxAmount, fmtTaxDue } from '../../utils/taxDisplay';

export function useTaxRowState(
  row: TaxReplenishment,
  weekStartsOn: WeekStartsOn,
  taxRatePercent: number,
  displayCurrency: TaxDisplayCurrency,
) {
  const [commentDraft, setCommentDraft] = useState(row.comment);
  const [editingDate, setEditingDate] = useState(false);
  const [dateDraft, setDateDraft] = useState(() =>
    fmtDateKey(row.replenishmentDate, weekStartsOn),
  );

  const dateLabel = fmtDateKey(row.replenishmentDate, weekStartsOn);

  useEffect(() => {
    setCommentDraft(row.comment);
  }, [row.comment]);

  useEffect(() => {
    if (!editingDate) {
      setDateDraft(dateLabel);
    }
  }, [dateLabel, editingDate]);

  const amountLabel = fmtTaxAmount(row);
  const bynLabel =
    row.amountByn != null ? fmtByn(row.amountByn) : (row.conversionError ?? '—');
  const taxLabel =
    taxRatePercent > 0
      ? (fmtTaxDue(row, taxRatePercent, displayCurrency) ?? '—')
      : '—';

  const startDateEdit = () => {
    setDateDraft(dateLabel);
    setEditingDate(true);
  };

  const cancelDateEdit = () => {
    setDateDraft(dateLabel);
    setEditingDate(false);
  };

  const finishDateEdit = (onSave: (receivedOn: string) => void) => {
    setEditingDate(false);
    const parsed = parseDateKey(dateDraft, weekStartsOn);
    if (parsed && parsed !== row.replenishmentDate) {
      onSave(parsed);
    } else {
      setDateDraft(dateLabel);
    }
  };

  return {
    commentDraft,
    setCommentDraft,
    editingDate,
    dateDraft,
    setDateDraft,
    amountLabel,
    bynLabel,
    taxLabel,
    dateLabel,
    startDateEdit,
    cancelDateEdit,
    finishDateEdit,
  };
}
