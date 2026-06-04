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
