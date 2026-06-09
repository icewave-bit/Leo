import type { AcademicUnits, BalanceKind } from '../api/types';
import { lessonPrice } from './academicHour';
import { fmtBalanceAmount } from './format';

export function lessonEndUtcIso(startUtc: string, durationMin: number): Date {
  return new Date(new Date(startUtc).getTime() + durationMin * 60_000);
}

export function isLessonPast(
  startUtc: string,
  durationMin: number,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= lessonEndUtcIso(startUtc, durationMin).getTime();
}

/** Charge in the wallet holder’s units (payer for family billing). */
export function walletChargeAmount(
  walletBalanceKind: BalanceKind,
  walletRate: number | null,
  lessonRate: number | null,
  academicUnits: AcademicUnits,
): number | null {
  if (walletBalanceKind === 'lessons') {
    if (walletRate != null && walletRate > 0 && lessonRate != null) {
      return (lessonRate * academicUnits) / walletRate;
    }
    return academicUnits;
  }
  if (lessonRate == null) return null;
  return lessonPrice(lessonRate, academicUnits);
}

export function formatWalletChargeSummary(
  walletBalanceKind: BalanceKind,
  walletRate: number | null,
  lessonRate: number | null,
  academicUnits: AcademicUnits,
  currency: string,
): string | null {
  const amount = walletChargeAmount(
    walletBalanceKind,
    walletRate,
    lessonRate,
    academicUnits,
  );
  if (amount == null) return null;
  return fmtBalanceAmount(amount, walletBalanceKind, currency);
}
