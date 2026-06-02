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

export function chargeAmount(
  balanceKind: BalanceKind,
  academicUnits: AcademicUnits,
  rate: number | null,
): number | null {
  if (balanceKind === 'lessons') return academicUnits;
  if (rate == null) return null;
  return lessonPrice(rate, academicUnits);
}

export function formatChargeSummary(
  balanceKind: BalanceKind,
  academicUnits: AcademicUnits,
  rate: number | null,
  currency: string,
): string | null {
  const amount = chargeAmount(balanceKind, academicUnits, rate);
  if (amount == null) return null;
  return fmtBalanceAmount(amount, balanceKind, currency);
}
