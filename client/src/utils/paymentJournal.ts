import type { BalanceMovement, BalanceMovementKind } from '../api/types';
import type { PaymentsPeriod } from '../atoms/payments';
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
): { from: string; to: string; label: string } {
  if (period === 'custom') {
    const fromKey = custom?.from ?? '';
    const toKey = custom?.to ?? '';
    if (!fromKey || !toKey) {
      const defaults = defaultCustomPeriod(timezone, now);
      return periodRange('custom', timezone, defaults, now);
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
      label: fmtDateRangeLabel(fromParts, toParts),
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

const MONTHS_SHORT_RU = [
  'янв', 'фев', 'мар', 'апр', 'май', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

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
): string {
  if (from.y === to.y && from.m === to.m && from.d === to.d) {
    return `${from.d} ${MONTHS_SHORT_RU[from.m - 1]} ${from.y}`;
  }
  if (from.y === to.y) {
    return `${from.d} ${MONTHS_SHORT_RU[from.m - 1]} – ${to.d} ${MONTHS_SHORT_RU[to.m - 1]} ${to.y}`;
  }
  return `${from.d} ${MONTHS_SHORT_RU[from.m - 1]} ${from.y} – ${to.d} ${MONTHS_SHORT_RU[to.m - 1]} ${to.y}`;
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

function fmtDelta(n: number, student: ViewStudent): string {
  if (Math.abs(n) < 1e-9) return '—';
  const sign = n > 0 ? '+' : '−';
  return sign + fmtBalanceAmount(Math.abs(n), student.balanceKind, student.currency);
}

export function enrichMovements(
  movements: BalanceMovement[],
  students: Map<string, ViewStudent>,
  timezone: string,
): JournalRow[] {
  return movements.map((m) => {
    const st = students.get(m.studentId);
    const kind = st?.balanceKind ?? 'money';
    const currency = st?.currency ?? 'EUR';
    const pseudo: ViewStudent = st ?? {
      id: m.studentId,
      name: '—',
      initials: '?',
      hue: 250,
      tz: timezone,
      rate: null,
      currency,
      meet: null,
      note: null,
      group: false,
      members: [],
      balanceKind: kind,
      prepaid: m.prepaidAfter,
      debt: m.debtAfter,
    };
    return {
      ...m,
      studentName: st?.name ?? 'Ученик',
      balanceKind: kind,
      currency,
      title: MOVEMENT_LABELS[m.kind],
      prepaidLabel: fmtDelta(m.prepaidDelta, pseudo),
      debtLabel: fmtDelta(m.debtDelta, pseudo),
      netLabel: fmtBalanceNet(m.prepaidAfter, m.debtAfter, kind, currency),
      whenLabel: fmtLessonWhen(m.occurredAt, timezone),
      tone: MOVEMENT_TONE[m.kind],
    };
  });
}

/** Balance after each row (computed forward in time). */
export function attachRunningBalance(
  rows: JournalRow[],
  student: ViewStudent | undefined,
): Array<JournalRow & { runningNet: string }> {
  if (!student || rows.length === 0) {
    return rows.map((r) => ({ ...r, runningNet: r.netLabel }));
  }

  const asc = [...rows].reverse();
  let prepaid = student.prepaid - asc.reduce((a, r) => a + r.prepaidDelta, 0);
  let debt = student.debt - asc.reduce((a, r) => a + r.debtDelta, 0);
  const running = new Map<string, string>();
  for (const r of asc) {
    prepaid += r.prepaidDelta;
    debt += r.debtDelta;
    running.set(
      r.id,
      fmtBalanceNet(prepaid, debt, student.balanceKind, student.currency),
    );
  }

  return rows.map((r) => ({
    ...r,
    runningNet: running.get(r.id) ?? r.netLabel,
  }));
}

export function periodDeltaSummary(
  movements: BalanceMovement[],
  student: ViewStudent | undefined,
): { prepaid: string; debt: string; net: string } | null {
  if (!student || movements.length === 0) return null;
  const prepaid = movements.reduce((a, m) => a + m.prepaidDelta, 0);
  const debt = movements.reduce((a, m) => a + m.debtDelta, 0);
  const netChange = prepaid - debt;
  const sign = netChange >= 0 ? '+' : '−';
  return {
    prepaid: fmtDelta(prepaid, student),
    debt: fmtDelta(debt, student),
    net:
      sign +
      fmtBalanceAmount(Math.abs(netChange), student.balanceKind, student.currency),
  };
}
