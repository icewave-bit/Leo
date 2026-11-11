import type { BalanceKind } from './types.js';
import type { BalanceMovementKind } from './balanceMovements.js';

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Real prepaid top-up (money or lessons). Balance-kind switches are not recorded as replenish. */
export function isTaxableReplenish(input: {
  kind: BalanceMovementKind;
  prepaidDelta: number;
}): boolean {
  return input.kind === 'replenish' && input.prepaidDelta > 0;
}

export function formatTaxAmount(amount: number): string {
  const rounded = roundMoney(amount);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

export function formatTaxDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

/** Amount, currency, and receipt date for journal summaries. */
export function formatTaxBits(input: {
  amount: number | null;
  currency: string | null;
  lessons?: boolean;
  receivedOn?: string | null;
}): string {
  const parts: string[] = [];
  if (input.amount != null && Number.isFinite(input.amount)) {
    const text = formatTaxAmount(input.amount);
    if (input.lessons && !input.currency) parts.push(`${text} ур.`);
    else parts.push(input.currency ? `${text} ${input.currency}` : text);
  }
  if (input.receivedOn) parts.push(formatTaxDate(input.receivedOn));
  return parts.join(' · ');
}

export type ReplenishTaxNote = {
  included: boolean;
  /** Why a top-up that should have been taxed was left out. Null when exclusion is intentional. */
  failure: string | null;
  summary: string;
  amount: number | null;
  currency: string | null;
  receivedOn: string | null;
};

/** How a balance top-up should be described in the activity journal. */
export function replenishTaxJournalNote(input: {
  excludeFromTaxes: boolean;
  prepaidDelta: number;
  balanceKind: BalanceKind;
  rate: number | null;
  currency: string;
  receivedOn?: string | null;
}): ReplenishTaxNote {
  const receivedOn = input.receivedOn ?? null;
  const money = replenishDeltaAsMoney(input.prepaidDelta, input.balanceKind, input.rate);
  const lessons = money == null && input.balanceKind === 'lessons';
  const amount = money ?? (lessons ? input.prepaidDelta : null);
  const currency = money != null ? input.currency : null;
  const bits = formatTaxBits({ amount, currency, lessons, receivedOn });

  if (input.excludeFromTaxes) {
    return {
      included: false,
      failure: null,
      summary: bits
        ? `Пополнение не учитывается в налогах · ${bits}`
        : 'Пополнение не учитывается в налогах',
      amount,
      currency: currency ?? input.currency,
      receivedOn,
    };
  }

  if (!isTaxableReplenish({ kind: 'replenish', prepaidDelta: input.prepaidDelta })) {
    return {
      included: false,
      failure: 'Пополнение сохранено в оплатах, но не попало в налоговый журнал',
      summary: bits ? `Пополнение не попало в налоги · ${bits}` : 'Пополнение не попало в налоги',
      amount,
      currency: currency ?? input.currency,
      receivedOn,
    };
  }

  return {
    included: true,
    failure: null,
    summary: bits ? `Учтено в налогах · ${bits}` : 'Учтено в налогах',
    amount,
    currency: currency ?? input.currency,
    receivedOn,
  };
}

/** Direct cash received when tutor marks a lesson paid (debt settled). */
export function isTaxableLessonPaid(input: {
  kind: BalanceMovementKind;
  debtDelta: number;
}): boolean {
  return input.kind === 'lesson_paid' && input.debtDelta < 0;
}

export function isTaxableIncomeMovement(input: {
  kind: BalanceMovementKind;
  prepaidDelta: number;
  debtDelta: number;
}): boolean {
  return (
    isTaxableReplenish(input) ||
    isTaxableLessonPaid({ kind: input.kind, debtDelta: input.debtDelta })
  );
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

/** Money received when a lesson debt is settled (debt_delta is negative). */
export function lessonPaidDeltaAsMoney(
  debtDelta: number,
  balanceKind: BalanceKind,
  studentRate: number | null,
): number | null {
  const received = -debtDelta;
  if (received <= 0) return null;
  return replenishDeltaAsMoney(received, balanceKind, studentRate);
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
