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

/** Signed net: prepaid − debt (rounded for lessons / money). */
export function balanceNetFromParts(
  prepaid: number,
  debt: number,
  kind: BalanceKind,
): number {
  const net = prepaid - debt;
  return kind === 'lessons' ? Math.round(net) : roundMoney(net);
}

export function partsFromBalanceNet(
  net: number,
  kind: BalanceKind,
): { prepaid: number; debt: number } {
  const n = kind === 'lessons' ? Math.round(net) : roundMoney(net);
  if (n >= 0) return { prepaid: n, debt: 0 };
  const abs = kind === 'lessons' ? Math.round(Math.abs(n)) : roundMoney(Math.abs(n));
  return { prepaid: 0, debt: abs };
}

export function parseBalanceNetInput(raw: string, kind: BalanceKind): number {
  const n = Number(raw);
  if (Number.isNaN(n)) return 0;
  return kind === 'lessons' ? Math.round(n) : roundMoney(n);
}

export function formatBalanceNetInput(
  prepaid: number,
  debt: number,
  kind: BalanceKind,
): string {
  return String(balanceNetFromParts(prepaid, debt, kind));
}

/** Convert signed net when switching balance kind (uses rate). */
export function convertBalanceNet(
  net: number,
  from: BalanceKind,
  to: BalanceKind,
  rate: number,
): number {
  const { prepaid, debt } = partsFromBalanceNet(net, from);
  if (from === to) return balanceNetFromParts(prepaid, debt, to);
  const newPrepaid = convertBalanceField(prepaid, from, to, rate);
  const newDebt = convertBalanceField(debt, from, to, rate);
  return balanceNetFromParts(newPrepaid, newDebt, to);
}
