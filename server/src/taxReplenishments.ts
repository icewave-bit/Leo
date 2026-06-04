import type { BalanceKind } from './types.js';
import type { BalanceMovementKind } from './balanceMovements.js';

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isMisclassifiedReplenishMovement(input: {
  kind: BalanceMovementKind;
  prepaidDelta: number;
  prepaidAfter: number;
}): boolean {
  if (input.kind !== 'replenish') return false;
  const before = input.prepaidAfter - input.prepaidDelta;
  if (before <= 0) return false;
  const ratio = Math.abs(input.prepaidDelta) / Math.max(Math.abs(before), 1);
  return ratio >= 10;
}

/** Real prepaid top-up (money or lessons), excluding balance-kind conversion artifacts. */
export function isTaxableReplenish(input: {
  kind: BalanceMovementKind;
  prepaidDelta: number;
  prepaidAfter: number;
}): boolean {
  if (input.kind !== 'replenish' || input.prepaidDelta <= 0) return false;
  return !isMisclassifiedReplenishMovement(input);
}

/** Money equivalent in student currency for tax / NBRB conversion. */
export function replenishDeltaAsMoney(
  prepaidDelta: number,
  balanceKind: BalanceKind,
  studentRate: number | null,
): number | null {
  if (balanceKind === 'money') return roundMoney(prepaidDelta);
  if (studentRate == null || studentRate <= 0) return null;
  return roundMoney(prepaidDelta * studentRate);
}

export function occurredDateKey(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function movementReceivedDate(
  receivedOn: string | Date | null,
  occurredAt: string,
  timezone: string,
): string {
  if (receivedOn instanceof Date) {
    return receivedOn.toISOString().slice(0, 10);
  }
  if (typeof receivedOn === 'string' && receivedOn.length >= 10) {
    return receivedOn.slice(0, 10);
  }
  return occurredDateKey(occurredAt, timezone);
}

export function monthBoundsDates(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const to = `${next.y}-${String(next.m).padStart(2, '0')}-01`;
  return { from, to };
}
