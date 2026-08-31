import type { TaxDisplayCurrency, TaxReplenishment } from '../api/types';
import { fmtByn, fmtMoney, lessonCountLabel } from './format';
import { taxFromBase, taxRowBase } from './taxAmount';

export function fmtTaxAmount(row: TaxReplenishment): string {
  const money = fmtMoney(row.amount, row.currency);
  if (row.balanceKind === 'lessons') {
    return `${lessonCountLabel(row.sourceAmount)} → ${money}`;
  }
  return money;
}

export function fmtTaxDue(
  row: TaxReplenishment,
  ratePercent: number,
  displayCurrency: TaxDisplayCurrency,
): string | null {
  const base = taxRowBase(row, displayCurrency);
  if (base == null) return null;
  const tax = taxFromBase(base, ratePercent);
  if (displayCurrency === 'BYN') return fmtByn(tax);
  return fmtMoney(tax, row.currency);
}

function fmtNbrbRateValue(n: number): string {
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function fmtBynNbrbTitle(row: TaxReplenishment, dateLabel: string): string {
  if (row.conversionError) return row.conversionError;
  if (row.nbrbRate == null) return dateLabel;
  return `${dateLabel}: ${fmtNbrbRateValue(row.nbrbRate)}`;
}
