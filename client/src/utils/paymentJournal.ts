import type { BalanceMovement, BalanceMovementKind, WeekStartsOn } from '../api/types';
import { fmtDateParts } from './dateKey';
import type { PaymentsPeriod } from '../atoms/payments';
import { balanceDeltaAsLessons, balanceDeltaAsMoney } from './balanceConvert';
import { fmtBalanceAmount, fmtBalanceNet, fmtLessonWhen } from './format';
import type { ViewStudent } from './schedule';

export const MOVEMENT_LABELS: Record<BalanceMovementKind, string> = {
  replenish: 'Пополнение',
  manual: 'Корректировка',
  lesson_charge: 'Списание за урок',
  lesson_paid: 'Оплата урока',
  lesson_reverse: 'Отмена списания',
};

export function periodRange(
  period: PaymentsPeriod,
  timezone: string,
  custom?: { from: string; to: string },
  now: Date = new Date(),
  weekStartsOn: WeekStartsOn = 'monday',
): { from: string; to: string; label: string } {
  if (period === 'custom') {
    const fromKey = custom?.from ?? '';
    const toKey = custom?.to ?? '';
    if (!fromKey || !toKey) {
      const defaults = defaultCustomPeriod(timezone, now);
      return periodRange('custom', timezone, defaults, now, weekStartsOn);
    }
    let fromParts = parseDateKey(fromKey);
    let toParts = parseDateKey(toKey);
    if (dateKeyCompare(fromKey, toKey) > 0) {
      [fromParts, toParts] = [toParts, fromParts];
    }
    const from = dayStartUtc(fromParts.y, fromParts.m, fromParts.d);
    const to = dayStartUtc(toParts.y, toParts.m, toParts.d);
    to.setUTCDate(to.getUTCDate() + 1);
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      label: fmtDateRangeLabel(fromParts, toParts, weekStartsOn),
    };
  }

  if (period === 'all') {
    const from = new Date(0);
    return {
      from: from.toISOString(),
      to: new Date(now.getTime() + 86_400_000).toISOString(),
      label: 'Всё время',
    };
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);

  let fromDate: Date;
  let label: string;

  if (period === 'week') {
    fromDate = new Date(Date.UTC(y, m - 1, d));
    fromDate.setUTCDate(fromDate.getUTCDate() - 6);
    label = '7 дней';
  } else if (period === 'month') {
    fromDate = new Date(Date.UTC(y, m - 1, 1));
    label = new Intl.DateTimeFormat('ru-RU', {
      timeZone: timezone,
      month: 'long',
      year: 'numeric',
    }).format(now);
    label = label.replace(/^./, (c) => c.toUpperCase());
  } else {
    fromDate = new Date(Date.UTC(y, m - 3, 1));
    label = '3 месяца';
  }

  const toDate = new Date(now.getTime() + 60_000);
  return { from: fromDate.toISOString(), to: toDate.toISOString(), label };
}

function parseDateKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

function dateKeyCompare(a: string, b: string): number {
  return a.localeCompare(b);
}

function dayStartUtc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function fmtDateRangeLabel(
  from: { y: number; m: number; d: number },
  to: { y: number; m: number; d: number },
  weekStartsOn: WeekStartsOn,
): string {
  const a = fmtDateParts(from.y, from.m, from.d, weekStartsOn);
  const b = fmtDateParts(to.y, to.m, to.d, weekStartsOn);
  if (from.y === to.y && from.m === to.m && from.d === to.d) return a;
  return `${a} – ${b}`;
}

export function dateKeyInTimezone(timezone: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function defaultCustomPeriod(
  timezone: string,
  now: Date = new Date(),
): { from: string; to: string } {
  const to = dateKeyInTimezone(timezone, now);
  const parts = parseDateKey(to);
  const from = `${parts.y}-${String(parts.m).padStart(2, '0')}-01`;
  return { from, to };
}

export const MOVEMENT_TONE: Record<
  BalanceMovementKind,
  'credit' | 'debt' | 'neutral' | 'manual'
> = {
  replenish: 'credit',
  lesson_paid: 'credit',
  lesson_charge: 'debt',
  lesson_reverse: 'neutral',
  manual: 'manual',
};

export function netBalance(prepaid: number, debt: number): number {
  return prepaid - debt;
}

/** Huge single-step prepaid jump — usually balance-kind conversion stored as replenish. */
export function isMisclassifiedReplenishMovement(m: BalanceMovement): boolean {
  if (m.kind !== 'replenish') return false;
  const before = m.prepaidAfter - m.prepaidDelta;
  if (before <= 0) return false;
  const ratio = Math.abs(m.prepaidDelta) / Math.max(Math.abs(before), 1);
  return ratio >= 10;
}

/** Unit stored on the movement (fallback: student’s current kind). */
export function movementUnitKind(
  m: BalanceMovement,
  student?: ViewStudent,
): ViewStudent['balanceKind'] {
  return m.balanceKind ?? student?.balanceKind ?? 'money';
}

export function movementsHaveMixedUnits(
  movements: BalanceMovement[],
  student?: ViewStudent,
): boolean {
  if (movements.length === 0) return false;
  const kinds = new Set(movements.map((m) => movementUnitKind(m, student)));
  return kinds.size > 1;
}

export function replenishLessonsDelta(
  m: BalanceMovement,
  student: ViewStudent | undefined,
): number | null {
  if (m.kind !== 'replenish' || isMisclassifiedReplenishMovement(m)) return null;
  return balanceDeltaAsLessons(
    m.prepaidDelta,
    movementUnitKind(m, student),
    student?.rate ?? null,
  );
}

export function movementDeltaAsMoney(
  amount: number,
  m: BalanceMovement,
  student: ViewStudent | undefined,
): number | null {
  return balanceDeltaAsMoney(amount, movementUnitKind(m, student), student?.rate ?? null);
}

export interface JournalRow extends BalanceMovement {
  studentName: string;
  balanceKind: ViewStudent['balanceKind'];
  currency: string;
  title: string;
  prepaidLabel: string;
  debtLabel: string;
  netLabel: string;
  whenLabel: string;
  tone: 'credit' | 'debt' | 'neutral' | 'manual';
}

function fmtDelta(n: number, kind: ViewStudent['balanceKind'], currency: string): string {
  if (Math.abs(n) < 1e-9) return '—';
  const sign = n > 0 ? '+' : '−';
  return sign + fmtBalanceAmount(Math.abs(n), kind, currency);
}

export function enrichMovements(
  movements: BalanceMovement[],
  students: Map<string, ViewStudent>,
  timezone: string,
): JournalRow[] {
  return movements.map((m) => {
    const st = students.get(m.studentId);
    const unitKind = movementUnitKind(m, st);
    const currency = st?.currency ?? 'EUR';
    return {
      ...m,
      studentName: st?.name ?? 'Ученик',
      balanceKind: unitKind,
      currency,
      title: MOVEMENT_LABELS[m.kind],
      prepaidLabel: fmtDelta(m.prepaidDelta, unitKind, currency),
      debtLabel: fmtDelta(m.debtDelta, unitKind, currency),
      netLabel: fmtBalanceNet(m.prepaidAfter, m.debtAfter, unitKind, currency),
      whenLabel: fmtLessonWhen(m.occurredAt, timezone),
      tone: MOVEMENT_TONE[m.kind],
    };
  });
}

/** Balance after the operation (snapshot from DB, in that row’s units). */
export function attachRunningBalance(
  rows: JournalRow[],
): Array<JournalRow & { runningNet: string }> {
  return rows.map((r) => ({
    ...r,
    runningNet: r.netLabel,
  }));
}

export function periodDeltaSummary(
  movements: BalanceMovement[],
  student: ViewStudent | undefined,
): { prepaid: string; debt: string; net: string } | null {
  if (!student || movements.length === 0) return null;
  if (movementsHaveMixedUnits(movements, student)) return null;

  const unitKind = movementUnitKind(movements[0]!, student);
  const currency = student.currency;
  const prepaid = movements.reduce((a, m) => a + m.prepaidDelta, 0);
  const debt = movements.reduce((a, m) => a + m.debtDelta, 0);
  const netChange = prepaid - debt;
  const sign = netChange >= 0 ? '+' : '−';
  return {
    prepaid: fmtDelta(prepaid, unitKind, currency),
    debt: fmtDelta(debt, unitKind, currency),
    net: sign + fmtBalanceAmount(Math.abs(netChange), unitKind, currency),
  };
}
