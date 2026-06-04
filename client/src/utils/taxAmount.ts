import type { TaxDisplayCurrency, TaxReplenishment } from '../api/types';
import { roundMoney } from './balanceConvert';

export function taxFromBase(base: number, ratePercent: number): number {
  return roundMoney(base * (ratePercent / 100));
}

export function taxRowBase(
  row: TaxReplenishment,
  displayCurrency: TaxDisplayCurrency,
): number | null {
  if (displayCurrency === 'BYN') {
    return row.amountByn;
  }
  if (row.conversionError) return null;
  return row.amount > 0 ? row.amount : null;
}
