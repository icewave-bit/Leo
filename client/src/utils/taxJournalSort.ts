import type { TaxDisplayCurrency, TaxReplenishment } from '../api/types';
import { taxFromBase, taxRowBase } from './taxAmount';

export type TaxSortKey =
  | 'date'
  | 'student'
  | 'amount'
  | 'byn'
  | 'tax'
  | 'paid'
  | 'comment';

export type TaxSortDir = 'asc' | 'desc';

export interface TaxesSort {
  key: TaxSortKey;
  dir: TaxSortDir;
}

export const DEFAULT_TAXES_SORT: TaxesSort = { key: 'date', dir: 'desc' };

export function toggleTaxSort(current: TaxesSort, key: TaxSortKey): TaxesSort {
  if (current.key !== key) {
    return { key, dir: key === 'date' ? 'desc' : 'asc' };
  }
  return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
}

function dirMul(dir: TaxSortDir): number {
  return dir === 'asc' ? 1 : -1;
}

function cmpStr(a: string, b: string, dir: TaxSortDir): number {
  return a.localeCompare(b, 'ru', { sensitivity: 'base' }) * dirMul(dir);
}

function cmpNum(a: number, b: number, dir: TaxSortDir): number {
  return (a - b) * dirMul(dir);
}

function cmpNullableNum(a: number | null, b: number | null, dir: TaxSortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return cmpNum(a, b, dir);
}

function taxValue(
  row: TaxReplenishment,
  taxRatePercent: number,
  displayCurrency: TaxDisplayCurrency,
): number | null {
  const base = taxRowBase(row, displayCurrency);
  if (base == null || taxRatePercent <= 0) return null;
  return taxFromBase(base, taxRatePercent);
}

function compareRows(
  a: TaxReplenishment,
  b: TaxReplenishment,
  sort: TaxesSort,
  taxRatePercent: number,
  displayCurrency: TaxDisplayCurrency,
): number {
  let c = 0;
  switch (sort.key) {
    case 'date':
      c = cmpStr(a.replenishmentDate, b.replenishmentDate, sort.dir);
      break;
    case 'student':
      c = cmpStr(a.studentName, b.studentName, sort.dir);
      break;
    case 'amount':
      c = cmpNum(a.amount, b.amount, sort.dir);
      break;
    case 'byn':
      c = cmpNullableNum(a.amountByn, b.amountByn, sort.dir);
      break;
    case 'tax':
      c = cmpNullableNum(
        taxValue(a, taxRatePercent, displayCurrency),
        taxValue(b, taxRatePercent, displayCurrency),
        sort.dir,
      );
      break;
    case 'paid':
      c = cmpNum(a.taxPaid ? 1 : 0, b.taxPaid ? 1 : 0, sort.dir);
      break;
    case 'comment':
      c = cmpStr(a.comment.trim(), b.comment.trim(), sort.dir);
      break;
  }
  if (c !== 0) return c;
  return cmpStr(a.movementId, b.movementId, 'asc');
}

export function sortTaxRows(
  rows: TaxReplenishment[],
  sort: TaxesSort,
  taxRatePercent: number,
  displayCurrency: TaxDisplayCurrency,
): TaxReplenishment[] {
  return [...rows].sort((a, b) =>
    compareRows(a, b, sort, taxRatePercent, displayCurrency),
  );
}
