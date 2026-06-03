import type { BalanceKind } from '../api/types';

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Convert a prepaid/debt field when switching balance storage kind. */
export function convertBalanceField(
  amount: number,
  from: BalanceKind,
  to: BalanceKind,
  rate: number,
): number {
  if (from === to) return amount;
  if (from === 'lessons' && to === 'money') return roundMoney(amount * rate);
  return Math.round(amount / rate);
}

export function balanceNetAsLessons(
  prepaid: number,
  debt: number,
  balanceKind: BalanceKind,
  rate: number | null,
): number | null {
  const net = prepaid - debt;
  if (balanceKind === 'lessons') return net;
  if (rate == null || rate <= 0) return null;
  return net / rate;
}

export function balanceNetAsMoney(
  prepaid: number,
  debt: number,
  balanceKind: BalanceKind,
  rate: number | null,
): number | null {
  const net = prepaid - debt;
  if (balanceKind === 'money') return net;
  if (rate == null || rate <= 0) return null;
  return roundMoney(net * rate);
}
