import type { BalanceKind } from '../api/types';
import { roundMoney } from './balanceConvert';

/** Signed net in the wallet’s stored units (lessons or money). Independent of rate. */
export function storedWalletNet(
  prepaid: number,
  debt: number,
  balanceKind: BalanceKind,
): number {
  const net = prepaid - debt;
  return balanceKind === 'lessons' ? Math.round(net) : roundMoney(net);
}

/** Money equivalent at the current rate (informational; changes when rate changes). */
export function walletMoneyNet(
  prepaid: number,
  debt: number,
  balanceKind: BalanceKind,
  rate: number | null,
): number {
  const stored = storedWalletNet(prepaid, debt, balanceKind);
  if (balanceKind === 'money') return stored;
  if (rate == null || rate <= 0) return stored;
  return roundMoney(stored * rate);
}

/** Lessons equivalent at the current rate (informational; changes when rate changes). */
export function walletLessonsNet(
  prepaid: number,
  debt: number,
  balanceKind: BalanceKind,
  rate: number | null,
): number | null {
  const stored = storedWalletNet(prepaid, debt, balanceKind);
  if (balanceKind === 'lessons') return stored;
  if (rate == null || rate <= 0) return null;
  return stored / rate;
}
